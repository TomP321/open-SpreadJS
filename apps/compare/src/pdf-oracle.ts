/*
 * Task 16 oracle page (see pdf-oracle.html). Builds one feature-rich scenario,
 * renders each print page into a real canvas with `paintPrintPage` and exports
 * the same pages with `Workbook.savePDF`; `scripts/pdf-oracle.mjs` rasterises
 * the PDF with pymupdf and diffs the two rasters.
 */
import OpenSheets from '@opensheets/spread-sheets';
// The oracle renders exactly the print pipeline's own code: `collectPrintPages`
// and `paintPrintPage` are internal (not part of the GC namespace), so the page
// imports them from the core's sources — the same modules the built bundle uses.
import { collectPrintImages, collectPrintPages, loadPrintImages, paintPrintPage } from '../../../packages/spread-sheets/src/print-doc.js';
import type { PageModel } from '../../../packages/spread-sheets/src/print.js';

type PrintPage = PageModel;
type PrintSheet = Parameters<typeof paintPrintPage>[1];

const GC = OpenSheets as unknown as {
  Spread: {
    Sheets: {
      Workbook: new () => OracleWorkbook;
      Worksheet: new (name: string) => OracleSheet;
      Style: new (options?: Record<string, unknown>) => unknown;
      LineBorder: new (color: string, style: number) => unknown;
      Enums?: Record<string, unknown>;
      PDF?: {
        PDFFontsManager?: {
          registerFont(name: string, font: Record<string, string>): void;
        };
      };
    };
  };
};

interface OracleSheet {
  name(value?: string): unknown;
  setArray(row: number, col: number, data: unknown[][]): unknown;
  setValue(row: number, col: number, value: unknown): unknown;
  setRowHeight(row: number, value: number): unknown;
  setColumnWidth(col: number, value: number): unknown;
  addSpan(row: number, col: number, rowCount: number, colCount: number): unknown;
  backgroundImage(src: string | null, option?: { layout?: string; paintOrder?: string }): unknown;
  setStyle(row: number, col: number, style: unknown): unknown;
  getRange(row: number, col: number, rowCount: number, colCount: number): Record<string, (...args: unknown[]) => unknown>;
  getCell(row: number, col: number): Record<string, (...args: unknown[]) => unknown>;
  printInfo(): Record<string, (...args: unknown[]) => unknown>;
  visible(value?: number): unknown;
}

interface OracleWorkbook {
  getSheet(index: number): OracleSheet;
  addSheet(index: number, sheet?: unknown): void;
  sheets: OracleSheet[];
  savePDF(
    success: (blob: Blob) => void,
    error?: (info: { errorCode: number; errorMessage: string }) => void,
    options?: object,
    sheetIndex?: number,
  ): void;
}

const PAGE_DPI = 100;
/** Our print pages are CSS px of a 96 dpi page (see print.ts HUNDREDTHS_TO_PX). */
const PRINT_PX_PER_INCH = 96;

const ITEMS = [
  ['Notebook', 12, 4.5, 54, 'basic', 0.1],
  ['Pencil', 300, 0.8, 240, 'bulk pack', 0.25],
  ['Eraser', 8, 1.25, 10, 'clear', 0.05],
  ['Marker', 17, 3.75, 63.75, 'red/blue', 0.3],
  ['Paper A4', 5, 6.2, 31, 'recycled', 0.15],
  ['Stapler', 2, 12.9, 25.8, 'heavy duty', 0.4],
  ['Toner', 1, 89, 89, 'black', 0.5],
  ['Cable', 42, 1.99, 83.58, 'usb-c', 0.2],
];

/** A small PNG we draw ourselves (clean-room): green frame, red diagonal, blue dot. */
function testImageSource(size = 24): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#00a86b';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#d0021b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1, 1);
  ctx.lineTo(size - 1, size - 1);
  ctx.stroke();
  ctx.fillStyle = '#3050d8';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 5, 0, Math.PI * 2);
  ctx.fill();
  return canvas.toDataURL('image/png');
}

interface Built {
  workbook: OracleWorkbook;
  sheet: PrintSheet;
  pages: PrintPage[];
  images: Record<string, HTMLImageElement>;
}

async function buildScenario(fontFamily: string, withImages: boolean): Promise<Built> {
  const sheets = GC.Spread.Sheets;
  const workbook = new sheets.Workbook();
  const sheet = workbook.getSheet(0);
  sheet.name('Sales');
  const headers = ['Item', 'Quantity', 'Price', 'Total', 'Note', 'Share'];
  headers.forEach((title, col) => {
    sheet.setValue(0, col, title);
    sheet.setStyle(0, col, new sheets.Style({
      font: `bold 11pt ${fontFamily}`,
      backColor: '#d9e1f2',
      foreColor: '#1f3864',
      hAlign: col === 0 ? 1 : 2,
      borderLeft: new sheets.LineBorder('#4472c4', 1),
      borderRight: new sheets.LineBorder('#4472c4', 1),
      borderTop: new sheets.LineBorder('#4472c4', 1),
      borderBottom: new sheets.LineBorder('#4472c4', 1),
    }));
  });
  for (let row = 1; row <= 48; row++) {
    const item = ITEMS[row % ITEMS.length]!;
    sheet.setValue(row, 0, `${String(row).padStart(3, '0')} ${String(item[0])}`);
    sheet.setValue(row, 1, item[1]);
    sheet.setValue(row, 2, item[2]);
    sheet.setValue(row, 3, item[3]);
    sheet.setValue(row, 4, row % 3 === 0 ? 'merged remark' : String(item[4]));
    sheet.setValue(row, 5, item[5]);
    sheet.getRange(row, 0, 1, 6).font(`10pt ${fontFamily}`);
    sheet.getCell(row, 1).formatter('#,##0');
    sheet.getCell(row, 2).formatter('$#,##0.00');
    sheet.getCell(row, 3).formatter('$#,##0.00;[Red]-$#,##0.00');
    sheet.getCell(row, 5).formatter('0.0%');
    sheet.getCell(row, 0).setBorder(new sheets.LineBorder('#808080', 1), { bottom: true });
    if (row % 4 === 0) sheet.getCell(row, 3).backColor('#fff2cc');
    if (row % 7 === 0) {
      // Merged, word-wrapped note across the last two columns.
      sheet.getCell(row, 4).backColor('rgba(226, 239, 218, 1)');
      sheet.getCell(row, 4).wordWrap(true);
      sheet.getCell(row, 4).textDecoration('underline');
      sheet.setValue(row, 4, `remark for row ${row}: a longer wrapped note`);
      sheet.addSpan(row, 4, 1, 2);
      sheet.setRowHeight(row, 30);
    }
    if (row % 11 === 0) {
      sheet.setValue(row, 4, undefined);
      sheet.getCell(row, 4).font(`italic bold 10pt ${fontFamily}`);
      sheet.getCell(row, 4).foreColor('#c00000');
      sheet.getCell(row, 4).setBorder(new sheets.LineBorder('#c00000', 8), { outline: true });
      sheet.setValue(row, 4, 'dashed');
    }
    if (row === 24) sheet.setValue(row, 2, new Date(2026, 10, 12));
  }
  sheet.setColumnWidth(0, 150);
  sheet.setColumnWidth(4, 190);
  const printInfo = sheet.printInfo();
  printInfo.showGridLine(true);
  printInfo.showBorder(true);
  printInfo.pageHeaderFooter({
    normal: {
      header: { left: '&A', center: '&BQuarterly Report&b &I(continued)&i', right: '&D' },
      footer: { left: 'Prepared by OpenSheets', center: 'Page &P of &N', right: '&T' },
    },
  });
  const run = collectPrintPages(workbook as never, [0])[0]!;
  if (withImages) {
    // Image XObject path in a real browser: a header/footer image drawn 1:1 and
    // a watermark scaled up 2.5x. Both sources are PNGs we draw ourselves.
    // (A `layout: 'repeat'` background would exercise the pattern path, which
    // the PDF writer documents as an average-colour approximation.)
    const tile = testImageSource(24);
    const mark = testImageSource(64);
    const printInfoForImages = sheet.printInfo();
    printInfoForImages.watermark([{ x: 240, y: 480, width: 160, height: 160, imageSrc: mark, page: 'all' }]);
    printInfoForImages.pageHeaderFooter({
      normal: {
        header: { left: '&A', center: '&BQuarterly Report&b &I(continued)&i', right: '&D' },
        footer: {
          left: 'Prepared by OpenSheets',
          center: 'Page &P of &N',
          right: '&T',
          leftImage: tile,
        },
      },
    });
  }
  const images = await loadPrintImages(collectPrintImages(run.sheet as unknown as PrintSheet));
  return { workbook, sheet: run.sheet as unknown as PrintSheet, pages: run.pages, images };
}

interface OracleApi {
  ready: boolean;
  error: string | null;
  build(fontFamily: string, withImages?: boolean): Promise<{ pages: number; size: { width: number; height: number }; scale: number }>;
  /**
   * Register TrueType faces (base64) for one CSS family with the PDF writer
   * (task 17). `scripts/pdf-oracle.mjs` passes the font files Chromium itself
   * uses to draw that family, so the PDF embeds exactly the canvas glyphs.
   */
  registerFont(name: string, faces: Record<string, string>): void;
  pageCount(): number;
  /** PNG data URL of print page `index`, rasterised at PAGE_DPI. */
  canvasPng(index: number): string;
  /** Base64 of the `savePDF` blob of the built workbook. */
  pdfBase64(): Promise<string>;
  pdfError: { errorCode: number; errorMessage: string } | null;
}

declare global {
  interface Window {
    __pdfOracle?: OracleApi;
  }
}

let current: Built | null = null;

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const api: OracleApi = {
  ready: false,
  error: null,
  pdfError: null,
  async build(fontFamily, withImages) {
    current = await buildScenario(fontFamily, Boolean(withImages));
    const first = current.pages[0]!;
    return { pages: current.pages.length, size: first.paperSize, scale: first.scale };
  },
  pageCount() {
    return current?.pages.length ?? 0;
  },
  registerFont(name, faces) {
    const pdf = GC.Spread.Sheets.PDF;
    if (!pdf || !pdf.PDFFontsManager) throw new Error('GC.Spread.Sheets.PDF.PDFFontsManager is missing');
    pdf.PDFFontsManager.registerFont(name, faces);
  },
  canvasPng(index) {
    const model = current!.pages[index]!;
    const factor = PAGE_DPI / PRINT_PX_PER_INCH;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(model.paperSize.width * factor);
    canvas.height = Math.round(model.paperSize.height * factor);
    const context = canvas.getContext('2d')!;
    context.scale(factor, factor);
    paintPrintPage(context, current!.sheet, current!.pages[index]!, current!.images, current!.pages.length);
    return canvas.toDataURL('image/png');
  },
  pdfBase64() {
    return new Promise<string>((resolve, reject) => {
      current!.workbook.savePDF(
        async (blob) => resolve(base64(new Uint8Array(await blob.arrayBuffer()))),
        (error) => {
          api.pdfError = error;
          reject(new Error(`${error.errorCode}: ${error.errorMessage}`));
        },
        { title: 'Oracle', author: 'OpenSheets', creator: 'pdf-oracle', subject: 'task 16', keywords: 'pdf,oracle' },
        0,
      );
    });
  },
};

window.__pdfOracle = api;
try {
  void OpenSheets;
  const status = document.getElementById('status');
  if (status) status.textContent = 'pdf oracle ready';
  api.ready = true;
} catch (error) {
  api.error = String(error);
}
