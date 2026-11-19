/*
 * Page Setup draft: converts between the sheet's `printInfo()` model and the
 * flat, serialisable state used by the Page Setup dialog. Preset values, the
 * paper list and the field mapping mirror the trial (black-box observations:
 * Margins menu, Orientation/Size dropdowns, Sheet Options checkboxes and the
 * four Page Setup dialog tabs).
 */

import type Core from '@mescius/spread-sheets';
import type { PrintInfo, Worksheet } from './core-internals.js';
import { printInfoInternals, printInfoOf } from './core-internals.js';

export type PageSetupTab = 'page' | 'margins' | 'header' | 'print';

export interface PageSetupDraft {
  orientation: number; // 1 portrait, 2 landscape (PrintPageOrientation)
  scaling: 'adjust' | 'fit';
  adjust: number; // percent, 10..400
  fitWide: string; // '' = automatic
  fitTall: string;
  paperName: string;
  quality: number;
  firstPage: string; // 'Auto' or a number
  margins: { top: number; bottom: number; left: number; right: number; header: number; footer: number }; // inches
  centerH: boolean;
  centerV: boolean;
  differentFirstPage: boolean;
  differentOddAndEvenPages: boolean;
  header: { left: string; center: string; right: string };
  footer: { left: string; center: string; right: string };
  printArea: string;
  repeatRows: string;
  repeatColumns: string;
  printGridlines: boolean;
  showBorder: boolean;
  blackAndWhite: boolean;
  headings: boolean;
  pageOrder: number; // 0 auto, 1 downThenOver, 2 overThenDown
}

/** Margins presets (hundredths of an inch) as shown by the trial's menu. */
export const MARGIN_PRESETS: Record<'Normal' | 'Wide' | 'Narrow', { top: number; bottom: number; left: number; right: number; header: number; footer: number }> = {
  Normal: { top: 75, bottom: 75, left: 70, right: 70, header: 30, footer: 30 },
  Wide: { top: 100, bottom: 100, left: 100, right: 100, header: 50, footer: 50 },
  Narrow: { top: 75, bottom: 75, left: 25, right: 25, header: 30, footer: 30 },
};

/** Paper sizes offered by the trial's Size menu (display name -> PaperKind). */
export const PAPER_ITEMS: { text: string; size: string; kind: number }[] = [
  { text: 'Letter', size: '8.5"×11"', kind: 1 },
  { text: 'Tabloid', size: '11"×17"', kind: 3 },
  { text: 'Legal', size: '8.5"×14"', kind: 5 },
  { text: 'Statement', size: '5.5"×8.5"', kind: 6 },
  { text: 'Executive', size: '7.25"×10.5"', kind: 7 },
  { text: 'A3', size: '11.69"×16.54"', kind: 8 },
  { text: 'A4', size: '8.27"×11.69"', kind: 9 },
  { text: 'A5', size: '5.83"×8.27"', kind: 11 },
];

export function fitPagesLabel(value: number): string {
  if (!(value > 0)) return 'Automatic';
  return value === 1 ? '1 page' : `${value} pages`;
}

export function fitPagesValue(label: string): number {
  if (!label || label === 'Automatic') return -1;
  const n = Number.parseInt(String(label), 10);
  return Number.isFinite(n) && n > 0 ? n : -1;
}

function addressFrom(pi: PrintInfo, which: 'row' | 'column', start: number, end: number): string {
  if (start < 0 || end < 0) return '';
  if (which === 'row') return `$${start + 1}:$${end + 1}`;
  const letters = (index: number): string => {
    let out = '', n = index;
    for (; n >= 0; n = Math.floor(n / 26) - 1) out = String.fromCharCode(65 + (n % 26)) + out;
    return out;
  };
  return `$${letters(start)}:$${letters(end)}`;
}

/** Parse `$B$2:$D$4` (optionally sheet-qualified or without `$`) to indices. */
export function parseRangeAddress(text: string): { row1: number; col1: number; row2: number; col2: number } | null {
  const rest = String(text ?? '').trim().replace(/^[^!]*!/, '');
  if (!rest) return null;
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/.exec(rest);
  if (!match) return null;
  const colIndex = (letters: string): number => {
    let index = 0;
    for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
    return index - 1;
  };
  const col1 = colIndex(match[1]);
  const row1 = Number(match[2]) - 1;
  const col2 = match[3] ? colIndex(match[3]) : col1;
  const row2 = match[4] ? Number(match[4]) - 1 : row1;
  if (col1 < 0 || row1 < 0 || col2 < col1 || row2 < row1) return null;
  return { row1, col1, row2, col2 };
}

/** Parse `$1:$4` or `1:4` into inclusive row indices; letters are rejected. */
export function parseRowRange(text: string): { row1: number; row2: number } | null {
  const match = /^\$?(\d+)(?::\$?(\d+))?$/.exec(String(text ?? '').trim().replace(/^[^!]*!/, ''));
  if (!match) return null;
  const row1 = Number(match[1]) - 1;
  const row2 = match[2] ? Number(match[2]) - 1 : row1;
  return row1 >= 0 && row2 >= row1 ? { row1, row2 } : null;
}

/** Parse `$A:$C` into inclusive column indices. */
export function parseColumnRange(text: string): { col1: number; col2: number } | null {
  const match = /^\$?([A-Za-z]{1,3})(?::\$?([A-Za-z]{1,3}))?$/.exec(String(text ?? '').trim().replace(/^[^!]*!/, ''));
  if (!match) return null;
  const colIndex = (letters: string): number => {
    let index = 0;
    for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
    return index - 1;
  };
  const col1 = colIndex(match[1]);
  const col2 = match[2] ? colIndex(match[2]) : col1;
  return col1 >= 0 && col2 >= col1 ? { col1, col2 } : null;
}

/** Snapshot the sheet's print settings into the dialog draft. */
export function pageSetupDraft(sheet: Worksheet): PageSetupDraft {
  const pi = printInfoOf(sheet);
  const margin = printInfoInternals(pi)._marginEffective();
  const hf = pi.pageHeaderFooter();
  const normal = hf?.normal ?? { header: { left: '', center: '', right: '' }, footer: { left: '', center: '', right: '' } };
  const first = pi.differentFirstPage() ? hf?.first : undefined;
  const odd = pi.differentOddAndEvenPages() ? hf?.odd : undefined;
  const scope = first ?? odd ?? normal;
  const paperName = PAPER_ITEMS.find((item) => item.kind === pi.paperSize().kind())?.text ?? 'Letter';
  const centering = Number(pi.centering());
  return {
    orientation: Number(pi.orientation()),
    scaling: pi.fitPagesWide() > 0 || pi.fitPagesTall() > 0 ? 'fit' : 'adjust',
    adjust: Math.round(Number(pi.zoomFactor()) * 100),
    fitWide: pi.fitPagesWide() > 0 ? String(pi.fitPagesWide()) : '',
    fitTall: pi.fitPagesTall() > 0 ? String(pi.fitPagesTall()) : '',
    paperName,
    quality: Number(pi.qualityFactor()),
    firstPage: Number(pi.firstPageNumber()) > 1 ? String(pi.firstPageNumber()) : 'Auto',
    margins: {
      top: margin.top / 100,
      bottom: margin.bottom / 100,
      left: margin.left / 100,
      right: margin.right / 100,
      header: margin.header / 100,
      footer: margin.footer / 100,
    },
    centerH: centering === 1 || centering === 3,
    centerV: centering === 2 || centering === 3,
    differentFirstPage: !!pi.differentFirstPage(),
    differentOddAndEvenPages: !!pi.differentOddAndEvenPages(),
    header: { left: scope?.header?.left ?? '', center: scope?.header?.center ?? '', right: scope?.header?.right ?? '' },
    footer: { left: scope?.footer?.left ?? '', center: scope?.footer?.center ?? '', right: scope?.footer?.right ?? '' },
    printArea: printAreaText(pi),
    repeatRows: addressFrom(pi, 'row', pi.repeatRowStart(), pi.repeatRowEnd()),
    repeatColumns: addressFrom(pi, 'column', pi.repeatColumnStart(), pi.repeatColumnEnd()),
    printGridlines: !!pi.showGridLine(),
    showBorder: pi.showBorder() !== false,
    blackAndWhite: !!pi.blackAndWhite(),
    headings: Number(pi.showRowHeader()) !== 1 && Number(pi.showColumnHeader()) !== 1,
    pageOrder: Number(pi.pageOrder()),
  };
}

/** Fix the print-area field to the plain `$B$2:$D$4` shape. */
export function printAreaText(pi: PrintInfo): string {
  const row1 = pi.rowStart(), row2 = pi.rowEnd(), col1 = pi.columnStart(), col2 = pi.columnEnd();
  if (row1 < 0 || col1 < 0) return '';
  const letters = (index: number): string => {
    let out = '', n = index;
    for (; n >= 0; n = Math.floor(n / 26) - 1) out = String.fromCharCode(65 + (n % 26)) + out;
    return out;
  };
  return `$${letters(col1)}$${row1 + 1}:$${letters(col2)}$${row2 + 1}`;
}

/** Apply a submitted dialog draft to the sheet's printInfo. */
export function applyPageSetupDraft(sheet: Worksheet, draft: PageSetupDraft): void {
  const pi = printInfoOf(sheet);
  pi.orientation(draft.orientation === 2 ? 2 : 1);
  if (draft.scaling === 'adjust') {
    const percent = Math.max(10, Math.min(400, Number(draft.adjust) || 100));
    pi.zoomFactor(percent / 100);
    pi.fitPagesWide(-1).fitPagesTall(-1);
  } else {
    const wide = Number.parseInt(draft.fitWide, 10);
    const tall = Number.parseInt(draft.fitTall, 10);
    pi.fitPagesWide(Number.isFinite(wide) && wide > 0 ? wide : -1);
    pi.fitPagesTall(Number.isFinite(tall) && tall > 0 ? tall : -1);
  }
  const paper = PAPER_ITEMS.find((item) => item.text === draft.paperName);
  if (paper) pi.paperSize().kind(paper.kind);
  const quality = Math.max(1, Math.min(8, Math.round(Number(draft.quality) || 2)));
  pi.qualityFactor(quality);
  const first = String(draft.firstPage).trim().toLowerCase() === 'auto' ? 1 : Number.parseInt(String(draft.firstPage), 10);
  pi.firstPageNumber(Number.isFinite(first) && first > 0 ? first : 1);
  const inch = (value: unknown): number => Math.max(0, Math.round(Number(value) * 100));
  pi.margin({
    top: inch(draft.margins.top),
    bottom: inch(draft.margins.bottom),
    left: inch(draft.margins.left),
    right: inch(draft.margins.right),
    header: inch(draft.margins.header),
    footer: inch(draft.margins.footer),
  });
  const centering = ((draft.centerH ? 1 : 0) | (draft.centerV ? 2 : 0)) as Core.Spread.Sheets.Print.PrintCentering;
  pi.centering(centering);
  pi.differentFirstPage(!!draft.differentFirstPage);
  pi.differentOddAndEvenPages(!!draft.differentOddAndEvenPages);
  pi.pageHeaderFooter({
    normal: {
      header: { left: draft.header.left, center: draft.header.center, right: draft.header.right },
      footer: { left: draft.footer.left, center: draft.footer.center, right: draft.footer.right },
    },
  });
  // Print area.
  const area = parseRangeAddress(draft.printArea);
  if (area) {
    pi.rowStart(area.row1);
    pi.columnStart(area.col1);
    pi.rowEnd(area.row2);
    pi.columnEnd(area.col2);
  } else {
    pi.rowStart(-1);
    pi.columnStart(-1);
  }
  const rows = parseRowRange(draft.repeatRows);
  pi.repeatRowStart(rows ? rows.row1 : -1);
  pi.repeatRowEnd(rows ? rows.row2 : -1);
  const columns = parseColumnRange(draft.repeatColumns);
  pi.repeatColumnStart(columns ? columns.col1 : -1);
  pi.repeatColumnEnd(columns ? columns.col2 : -1);
  pi.showGridLine(!!draft.printGridlines);
  pi.showBorder(draft.showBorder !== false);
  pi.blackAndWhite(!!draft.blackAndWhite);
  const headerVisibility = draft.headings ? 2 : 1;
  pi.showRowHeader(headerVisibility);
  pi.showColumnHeader(headerVisibility);
  pi.pageOrder((Number.isFinite(Number(draft.pageOrder)) ? Number(draft.pageOrder) : 1) as Core.Spread.Sheets.Print.PrintPageOrder);
}
