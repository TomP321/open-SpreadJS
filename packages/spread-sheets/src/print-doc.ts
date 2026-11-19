/*
 * Browser print pipeline: paints the paginated sheets from `PrintInfo` into a
 * hidden iframe and triggers the native print dialog. One canvas per page in a
 * `div.gc-printPage` wrapper, the page-break style and the `.grayscale` filter
 * for black-and-white all mirror the observable print document of the
 * reference component (structure observed at runtime, code authored here).
 */
import { GC } from './generated/enums.js';
import { Style, LineBorder } from './primitives.js';
import { resolveColor } from './colors.js';
import { parsePageRange, expandHeaderFooter, paperSizePx, printPageStarts, WorksheetPaginator, type PageModel, type PageSectionOptions, type PrintInfo } from './print.js';
import type { PdfLinearGradient, PdfPattern } from './pdf/pdf-resources.js';
import type { Workbook } from './workbook.js';
import type { Worksheet } from './worksheet.js';

const Print = GC.Spread.Sheets.Print;

/** Paint style accepted by the print target: a DOM context or the PDF recorder. */
export type PrintPaintStyle = string | CanvasGradient | CanvasPattern | PdfLinearGradient | PdfPattern;

/**
 * The 2D drawing surface of the print painter, as a typed structural contract:
 * a real `CanvasRenderingContext2D` (browser print) and `PdfCanvasContext`
 * (savePDF) both satisfy it, so the PDF path needs no cast.
 */
export interface PrintTargetContext {
  fillStyle: PrintPaintStyle;
  strokeStyle: PrintPaintStyle;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  setLineDash(segments: number[]): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(source: CanvasImageSource, dx: number, dy: number): void;
  drawImage(source: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  createPattern(source: CanvasImageSource, repetition: string | null): CanvasPattern | PdfPattern | null;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

/** A1 column letters for a zero-based index. */
export function colLetters(index: number): string {
  let letters = '', n = index;
  for (; n >= 0; n = Math.floor(n / 26) - 1) letters = String.fromCharCode(65 + (n % 26)) + letters;
  return letters;
}

function borderStyleOf(border: unknown): number {
  if (border instanceof LineBorder) return Number(border.style) || 0;
  if (border && typeof border === 'object') return Number((border as LineBorder).style) || 0;
  return 0;
}
function borderColorOf(border: unknown, fallback: string): string {
  if (border instanceof LineBorder) return resolveColor(String(border.color ?? fallback));
  if (border && typeof border === 'object') return resolveColor(String((border as LineBorder).color ?? fallback));
  return fallback;
}
function borderWidth(style: number): number {
  return style === 6 ? 4 : [2, 8, 10, 12, 13].includes(style) ? 3 : [5, 9, 11].includes(style) ? 2 : 1;
}

const DASH_PATTERNS: Record<number, number[]> = {
  3: [3, 1], 4: [2, 2], 7: [1, 1], 8: [9, 3], 9: [8, 2, 2, 2], 10: [9, 3, 3, 3],
  11: [9, 3, 3, 3, 3, 3], 12: [9, 3, 3, 3, 3, 3], 13: [11, 1, 5, 1],
};

/** Image sources referenced by a sheet's print setup (background, watermark, header/footer). */
export function collectPrintImages(sheet: Worksheet): string[] {
  const sources: string[] = [];
  const bg = sheet.getBackgroundImageInfo();
  if (bg.backgroundImage) sources.push(bg.backgroundImage);
  const pi = sheet.printInfo();
  for (const item of pi.watermark()) if (item.imageSrc) sources.push(item.imageSrc);
  for (const scope of Object.values(pi.pageHeaderFooter())) {
    if (!scope) continue;
    for (const part of [scope.header, scope.footer])
      for (const key of ['leftImage', 'centerImage', 'rightImage'] as const)
        if (part?.[key]) sources.push(part[key]);
  }
  return [...new Set(sources)];
}

/** Preloaded print images keyed by their source. */
export type PageImageMap = Record<string, HTMLImageElement>;

/** Preload images with a bounded wait so printing never hangs on broken srcs. */
export function loadPrintImages(sources: string[]): Promise<PageImageMap> {
  const done: PageImageMap = {};
  if (typeof Image === 'undefined' || !sources.length) return Promise.resolve(done);
  return new Promise((resolve) => {
    let pending = sources.length;
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve(done);
    };
    const timer = setTimeout(finish, 1500);
    for (const src of sources) {
      const image = new Image();
      const settle = (ok: boolean): void => {
        if (ok) done[src] = image;
        if (--pending <= 0) {
          clearTimeout(timer);
          finish();
        }
      };
      image.onload = () => settle(true);
      image.onerror = () => settle(false);
      image.src = src;
    }
  });
}

interface RectXYWH {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Paint one page of one sheet (paper-space CSS pixels, 96 dpi). */
export function paintPrintPage(
  ctx: PrintTargetContext,
  sheet: Worksheet,
  page: PageModel,
  images: PageImageMap,
  pageCount: number,
): void {
  const pi = sheet.printInfo();
  const area = page.pageImageableArea;
  const scale = page.scale;
  const margin = pi._marginEffective();
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.paperSize.width, page.paperSize.height);
  const bgInfo = sheet.getBackgroundImageInfo?.();
  const bgImage = bgInfo?.backgroundImage ? images[bgInfo.backgroundImage] : undefined;
  if (bgImage && bgInfo?.option && bgInfo.option.paintOrder !== 'over-content') drawBackgroundImage(ctx, bgImage, bgInfo.option, area);
  // Centering within the printable area.
  const centering = Number(pi.centering());
  let offsetX = 0, offsetY = 0;
  if (centering === Print.PrintCentering.horizontal || centering === Print.PrintCentering.both)
    offsetX = Math.max(0, (area.width - page.columnPage.contentSize - page.columnPage.headerSize) / 2);
  if (centering === Print.PrintCentering.vertical || centering === Print.PrintCentering.both)
    offsetY = Math.max(0, (area.height - page.rowPage.contentSize - page.rowPage.headerSize) / 2);
  const rowLayout = sheet._rowLayout();
  const colLayout = sheet._columnLayout();
  const columns: { index: number; x: number; width: number }[] = [];
  let x = area.x + offsetX;
  const pushColumn = (index: number): void => {
    if (index < 0 || !colLayout.isVisible(index) || columns.some((c) => c.index === index)) return;
    const width = colLayout.getSize(index) * scale;
    columns.push({ index, x, width });
    x += width;
  };
  if (page.columnPage.repeatItemStart >= 0)
    for (let c = page.columnPage.repeatItemStart; c <= page.columnPage.repeatItemEnd; c++) pushColumn(c);
  for (let c = page.columnPage.itemStart; c <= page.columnPage.itemEnd; c++) pushColumn(c);
  const rows: { index: number; y: number; height: number }[] = [];
  let y = area.y + offsetY;
  const pushRow = (index: number): void => {
    if (index < 0 || !rowLayout.isVisible(index) || rows.some((r) => r.index === index)) return;
    const height = rowLayout.getSize(index) * scale;
    rows.push({ index, y, height });
    y += height;
  };
  if (page.rowPage.repeatItemStart >= 0)
    for (let r = page.rowPage.repeatItemStart; r <= page.rowPage.repeatItemEnd; r++) pushRow(r);
  for (let r = page.rowPage.itemStart; r <= page.rowPage.itemEnd; r++) pushRow(r);
  const contentRight = x, contentBottom = y;
  if (pi.showGridLine() && rows.length && columns.length) {
    ctx.fillStyle = resolveColor(sheet.options.gridline.color);
    const top = rows[0].y, left = columns[0].x;
    for (const col of columns) ctx.fillRect(Math.round(col.x + col.width) - 1, top, 1, contentBottom - top);
    for (const row of rows) ctx.fillRect(left, Math.round(row.y + row.height) - 1, contentRight - left, 1);
  }
  for (const row of rows)
    for (const col of columns) {
      const style = sheet.getStyle(row.index, col.index);
      const back = style?.backColor ? resolveColor(String(style.backColor)) : '';
      if (back && back !== 'transparent') {
        ctx.fillStyle = back;
        ctx.fillRect(col.x, row.y, col.width, row.height);
      }
    }
  for (const row of rows) {
    for (const col of columns) {
      const style = sheet.getStyle(row.index, col.index) ?? new Style();
      const span = sheet.getSpan(row.index, col.index);
      if (span && (span.row !== row.index || span.col !== col.index)) continue;
      const rect: RectXYWH = {
        x: col.x,
        y: row.y,
        width: span ? spanColumnsWidth(columns, span) : col.width,
        height: span ? spanRowsHeight(rows, span) : row.height,
      };
      const text = sheet.getText(row.index, col.index);
      if (text) drawCellText(ctx, text, sheet.getValue(row.index, col.index), style, rect, sheet, scale);
      if (pi.showBorder()) drawBorders(ctx, style, rect, scale);
    }
  }
  // Row/column headers.
  const showRowHeader = resolvePrint(pi.showRowHeader(), sheet.options.rowHeaderVisible !== false, page);
  const showColHeader = resolvePrint(pi.showColumnHeader(), sheet.options.colHeaderVisible !== false, page);
  ctx.font = `${Math.max(6, 10 * scale)}px Calibri`;
  ctx.fillStyle = '#444444';
  if (showColHeader && rows.length) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const col of columns) ctx.fillText(colLetters(col.index), col.x + col.width / 2, rows[0].y - 2 * scale);
  }
  if (showRowHeader && columns.length) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const row of rows) ctx.fillText(String(row.index + 1), columns[0].x - 3 * scale, row.y + row.height / 2);
  }
  if (bgImage && bgInfo?.option?.paintOrder === 'over-content') drawBackgroundImage(ctx, bgImage, bgInfo.option, area);
  paintPageHeaderFooter(ctx, pi, page, { pageNumber: page.pageNumber, pageCount }, images, area, margin);
  for (const item of pi.watermark()) {
    const image = images[item.imageSrc];
    if (!image || !watermarkMatchesPage(item.page, page.pageNumber)) continue;
    ctx.drawImage(image, area.x + item.x, area.y + item.y, item.width, item.height);
  }
  ctx.restore();
}

function resolvePrint(value: number, optionVisible: boolean, page: PageModel): boolean {
  switch (Number(value)) {
    case Print.PrintVisibilityType.hide: return false;
    case Print.PrintVisibilityType.show: return true;
    case Print.PrintVisibilityType.showOnce: return page.pageNumberInSheet === 1;
    default: return optionVisible;
  }
}

function watermarkMatchesPage(spec: string, pageNumber: number): boolean {
  const text = String(spec ?? 'all').trim().toLowerCase();
  if (!text || text === 'all') return true;
  if (text === 'odd') return pageNumber % 2 === 1;
  if (text === 'even') return pageNumber % 2 === 0;
  return text.split(',').some((part) => {
    const chunk = part.trim();
    if (!chunk) return false;
    const dash = chunk.split('-');
    const start = Number.parseInt(dash[0], 10);
    const end = dash.length > 1 ? Number.parseInt(dash[1], 10) : start;
    return Number.isFinite(start) && pageNumber >= start && pageNumber <= (Number.isFinite(end) ? end : start);
  });
}

function drawBackgroundImage(
  ctx: PrintTargetContext,
  image: HTMLImageElement,
  option: { layout?: unknown },
  area: RectXYWH,
): void {
  if (option.layout === 'repeat') {
    const pattern = ctx.createPattern(image, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.width, area.height);
      ctx.clip();
      ctx.fillStyle = pattern;
      ctx.fillRect(area.x, area.y, area.width, area.height);
      ctx.restore();
      return;
    }
  }
  ctx.drawImage(image, area.x, area.y, area.width, area.height);
}

function spanColumnsWidth(columns: { index: number; x: number; width: number }[], span: { col: number; colCount: number }): number {
  const first = columns.find((c) => c.index === span.col);
  if (!first) return 0;
  let end = first.x + first.width;
  for (let i = 1; i < span.colCount; i++) {
    const next = columns.find((c) => c.index === span.col + i);
    if (next) end = Math.max(end, next.x + next.width);
  }
  return end - first.x;
}
function spanRowsHeight(rows: { index: number; y: number; height: number }[], span: { row: number; rowCount: number }): number {
  const first = rows.find((r) => r.index === span.row);
  if (!first) return 0;
  let end = first.y + first.height;
  for (let i = 1; i < span.rowCount; i++) {
    const next = rows.find((r) => r.index === span.row + i);
    if (next) end = Math.max(end, next.y + next.height);
  }
  return end - first.y;
}

function drawCellText(
  ctx: PrintTargetContext,
  text: string,
  value: unknown,
  style: Style,
  rect: RectXYWH,
  sheet: Worksheet,
  scale: number,
): void {
  let font = typeof style.font === 'string' && style.font ? style.font : '';
  if (!font) {
    const fonts = sheet._themeFonts?.() ?? ['Calibri', 'Calibri'];
    font = `11pt ${style.themeFont === 'Heading' ? fonts[0] : fonts[1]}`;
  }
  ctx.font = scaleFont(font, scale);
  ctx.fillStyle = resolveColor(String(style.foreColor ?? 'black'));
  const align = style.hAlign === 3 || style.hAlign === undefined
    ? typeof value === 'number' || value instanceof Date ? 2 : typeof value === 'boolean' ? 1 : 0
    : Number(style.hAlign);
  ctx.textAlign = align === 2 ? 'center' : align === 3 || align === 4 ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  const inset = 2 * scale;
  const lines = style.wordWrap ? wrapText(ctx, text, rect.width - inset * 2) : [text];
  const lineHeight = measureLineHeight(ctx);
  const total = lines.length * lineHeight;
  const vAlign = Number(style.vAlign ?? 2);
  let ty = vAlign === 0 ? rect.y + inset + lineHeight / 2 : vAlign === 1 ? rect.y + rect.height / 2 - total / 2 + lineHeight / 2 : rect.y + rect.height - inset - total + lineHeight / 2;
  const tx = ctx.textAlign === 'center' ? rect.x + rect.width / 2 : ctx.textAlign === 'right' ? rect.x + rect.width - inset : rect.x + inset;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  for (const line of lines) {
    ctx.fillText(line, tx, ty);
    if (String(style.textDecoration ?? '').includes('underline')) {
      const w = Math.min(ctx.measureText(line).width, rect.width - inset * 2);
      const sx = ctx.textAlign === 'center' ? tx - w / 2 : ctx.textAlign === 'right' ? tx - w : tx;
      ctx.fillRect(sx, ty + lineHeight / 2 - 1, w, 1);
    }
    ty += lineHeight;
  }
  ctx.restore();
}

function measureLineHeight(ctx: PrintTargetContext): number {
  const match = /([\d.]+)px/.exec(ctx.font);
  return Math.ceil((match ? Number(match[1]) : 14) * 1.2);
}

function scaleFont(font: string, scale: number): string {
  return font.replace(/([\d.]+)(px|pt)/, (_, size: string, unit: string) => `${(Number(size) * (unit === 'pt' ? 4 / 3 : 1) * scale).toFixed(4)}px`);
}

function wrapText(ctx: PrintTargetContext, text: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const token of paragraph.match(/\S+\s*|\s+/g) ?? ['']) {
      if (line && ctx.measureText(line + token.trimEnd()).width > width) {
        result.push(line.trimEnd());
        line = '';
      }
      line += token;
    }
    result.push(line.trimEnd());
  }
  return result;
}

function drawBorders(ctx: PrintTargetContext, style: Style, rect: RectXYWH, scale: number): void {
  const sides: [unknown, number, number, number, number][] = [
    [style.borderTop, rect.x, rect.y, rect.x + rect.width, rect.y],
    [style.borderBottom, rect.x, rect.y + rect.height, rect.x + rect.width, rect.y + rect.height],
    [style.borderLeft, rect.x, rect.y, rect.x, rect.y + rect.height],
    [style.borderRight, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height],
  ];
  for (const [border, x1, y1, x2, y2] of sides) {
    const kind = borderStyleOf(border);
    if (!kind) continue;
    ctx.strokeStyle = borderColorOf(border, '#000000');
    ctx.lineWidth = Math.max(1, borderWidth(kind) * scale);
    const dash = DASH_PATTERNS[kind];
    ctx.setLineDash(dash ? dash.map((v) => v * scale) : []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Paint the custom header/footer text and images into the margin bands. */
function paintPageHeaderFooter(
  ctx: PrintTargetContext,
  pi: PrintInfo,
  page: PageModel,
  label: { pageNumber: number; pageCount: number },
  images: PageImageMap,
  area: RectXYWH,
  margin: { header: number; footer: number },
): void {
  const options = pi.pageHeaderFooter();
  const scope =
    (page.pageNumberInSheet === 1 && pi.differentFirstPage() ? options.first : undefined) ??
    (pi.differentOddAndEvenPages() ? (label.pageNumber % 2 === 1 ? options.odd : options.even) : undefined) ??
    options.normal;
  if (!scope) return;
  const now = new Date();
  const context = {
    sheetName: page.worksheetName,
    workbookName: page.workbookName,
    pageNumber: label.pageNumber,
    pageCount: label.pageCount,
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
  };
  const bands: [PageSectionOptions | undefined, number][] = [
    [scope.header, area.y - paperSizePx(margin.header)],
    [scope.footer, area.y + area.height + paperSizePx(margin.footer)],
  ];
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';
  for (const [section, bandY] of bands) {
    if (!section) continue;
    for (const key of ['left', 'center', 'right'] as const) {
      const text = String(section[key] ?? '');
      const image = images[String(section[`${key}Image`] ?? '')];
      const segments = expandHeaderFooter(text, context);
      ctx.font = '11pt Calibri';
      const width = segments.reduce((n, s) => n + ctx.measureText(s.text).width, 0);
      const anchor = key === 'left' ? area.x : key === 'center' ? area.x + area.width / 2 - width / 2 : area.x + area.width - width;
      if (image) ctx.drawImage(image, anchor, bandY - 2);
      if (segments.length) {
        let cursor = anchor;
        ctx.textAlign = 'left';
        for (const segment of segments) {
          ctx.font = `${segment.bold ? 'bold ' : ''}${segment.italic ? 'italic ' : ''}11pt Calibri`;
          ctx.fillText(segment.text, cursor, bandY + 10);
          cursor += ctx.measureText(segment.text).width;
        }
      }
    }
  }
}

/** Page descriptors per sheet, with the sheet's `pageRange` filter applied. */
export interface PrintSheetPages {
  sheetIndex: number;
  sheet: Worksheet;
  pages: PageModel[];
}

export function collectPrintPages(workbook: Workbook, sheetIndexes: number[]): PrintSheetPages[] {
  const result: PrintSheetPages[] = [];
  for (const index of sheetIndexes) {
    const sheet = workbook.getSheet(index) as Worksheet | null;
    if (!sheet) continue;
    const models = sheetPrintModels(sheet);
    const pageRange = String(sheet.printInfo().pageRange() ?? '');
    const keep = pageRange.trim() ? new Set(parsePageRange(pageRange, models.length)) : null;
    const pages = keep ? models.filter((_, i) => keep.has(i + 1)) : models;
    result.push({ sheetIndex: index, sheet, pages });
  }
  return result;
}

/**
 * Page models of one sheet. A `ReportSheet` in a paginated preview contributes every report
 * page it wants printed (`options.printAllPages`, `printPageIndexes`): the sheet is re-rendered
 * page by page and each page paginates like an ordinary worksheet (TASK 48 hook).
 */
export function sheetPrintModels(sheet: Worksheet): PageModel[] {
  const paginate = () => {
    const paginator = new WorksheetPaginator(sheet);
    paginator.paginate();
    return paginator._models();
  };
  const report = sheet as unknown as { _printPageIndices?: () => number[] | undefined; currentPage?: (value?: number) => number };
  const indexes = report._printPageIndices?.();
  if (!indexes?.length) return paginate();
  const restore = report.currentPage?.();
  const models: PageModel[] = [];
  try {
    for (const page of indexes) { report.currentPage?.(page); models.push(...paginate()); }
  } finally {
    if (restore !== undefined) report.currentPage?.(restore);
  }
  return models;
}

let activePrintFrame: HTMLIFrameElement | null = null;

/**
 * Build the print document and call the browser print dialog. Resolves with
 * the number of printed pages; failures inside `window.print()` (unsupported
 * in headless browsers) are swallowed like the reference component's fire and
 * forget behaviour.
 */
export async function printWorkbookAsync(workbook: Workbook, sheetIndex?: number): Promise<number> {
  const indexes = sheetIndex === undefined || sheetIndex === null
    ? workbook.sheets.map((_, i) => i).filter((i) => workbook.getSheet(i).visible() !== 0)
    : [sheetIndex];
  const runs = collectPrintPages(workbook, indexes);
  const total = runs.reduce((n, run) => n + run.pages.length, 0);
  const sources = [...new Set(runs.flatMap((run) => collectPrintImages(run.sheet)))];
  const images = await loadPrintImages(sources);
  if (typeof document === 'undefined') return total;
  const host = workbook.el;
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new Event('beforeprint')); } catch { /* ignore */ }
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '4px', height: '4px', border: '0', visibility: 'hidden' });
  (host ?? document.body).appendChild(frame);
  activePrintFrame?.remove();
  activePrintFrame = frame;
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0} .gc-printPage{page-break-after: always;position:relative;overflow:hidden}' +
    '.grayscale{filter: grayscale(100%)} canvas{display:block}' +
    '</style></head><body></body></html>',
  );
  doc.close();
  for (const run of runs) {
    const pi = run.sheet.printInfo();
    const quality = Math.max(1, Math.min(4, Math.round(Number(pi.qualityFactor()) || 2)));
    run.pages.forEach((page) => {
      const wrapper = doc.createElement('div');
      wrapper.className = 'gc-printPage' + (pi.blackAndWhite() ? ' grayscale' : '');
      wrapper.style.width = `${page.paperSize.width}px`;
      wrapper.style.height = `${page.paperSize.height}px`;
      const canvas = doc.createElement('canvas');
      canvas.width = Math.round(page.paperSize.width * quality);
      canvas.height = Math.round(page.paperSize.height * quality);
      canvas.style.width = `${page.paperSize.width}px`;
      canvas.style.height = `${page.paperSize.height}px`;
      let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
      if (!ctx) {
        // jsdom (test) canvases have no 2d context: paint through a detached
        // canvas from the main document so the print pipeline still runs.
        const detached = document.createElement('canvas');
        detached.width = canvas.width;
        detached.height = canvas.height;
        ctx = detached.getContext('2d');
      }
      if (!ctx) throw new Error('No 2d context available for printing');
      ctx.scale(quality, quality);
      paintPrintPage(ctx, run.sheet, page, images, run.pages.length);
      wrapper.appendChild(canvas);
      doc.body.appendChild(wrapper);
    });
  }
  const contentWindow = frame.contentWindow as (Window & { print?(): void }) | null;
  try {
    contentWindow?.focus?.();
    contentWindow?.print?.();
  } catch { /* headless environments may not implement print() */ }
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new Event('afterprint')); } catch { /* ignore */ }
  }
  return total;
}

/** Synchronous entry point used by `Workbook.print()`. */
export function printWorkbook(workbook: Workbook, sheetIndex?: number): void {
  const valid = sheetIndex === undefined ||
    (typeof sheetIndex === 'number' && Number.isInteger(sheetIndex) && sheetIndex >= 0 && sheetIndex < workbook.getSheetCount());
  if (!valid) throw new Error('Invalid  sheet index.');
  void printWorkbookAsync(workbook, sheetIndex);
}

/* ------------------------------------------------------- print-line cache */

const printLineCache = new WeakMap<Worksheet, { rows: number[]; cols: number[] }>();

/** Row/column indices starting a new page, for the on-screen print line. */
export function getPrintLines(sheet: Worksheet): { rows: number[]; cols: number[] } {
  const cached = printLineCache.get(sheet);
  if (cached) return cached;
  const value = printPageStarts(sheet);
  printLineCache.set(sheet, value);
  return value;
}

export function invalidatePrintLines(sheet?: Worksheet): void {
  if (sheet) printLineCache.delete(sheet);
}
