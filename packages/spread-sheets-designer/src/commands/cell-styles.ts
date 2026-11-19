/* Cell Styles gallery: the built-in style definitions, the cell-type style
 * templates they register lazily on the workbook, and the tile-apply logic. */
import type { DesignerApi as Designer } from '../designer-api.js';
import type { Style, Workbook } from '../core-internals.js';
import { createStyle } from '../core-internals.js';
import { activeRanges, activeSheet } from './base.js';

export interface CellStyleDef { name: string; group: string; value?: string; style?: Record<string, unknown>; preview?: string; /** CSS for the gallery preview when it must show the style as styled text (Titles and Headings). */ previewCss?: Record<string, string>; plain?: boolean; kind?: 'style' | 'cellType' }

/** One cellButton for the cell-type style templates: a right-positioned button; `imageType` uses the
 *  core CellButton image enum numbering (clear=2, cancel=3, ok=4, dropdown=5); visibility: 0=always, 2=onEditing. */
const cellTypeButton = (command: string, imageType: number, position = 1, visibility = 0): Record<string, unknown> => ({ command, imageType, position, visibility });

/**
 * Definitions of the workbook-level named styles that the "Color, DateTime and Other Cell Type
 * Style" gallery tiles apply. A tile click registers the template as a named style and points the
 * selection's cell style `parentName` at it (same mechanism and ids as the official gallery,
 * observed through `getStyle().parentName` / `getNamedStyle().toJSON()`). Button `command` values
 * route through the designer cell-button command dispatcher.
 */
export function cellTypeStyleTemplate(name: string): Record<string, unknown> | null {
  const dropDownCalendar = (option: Record<string, unknown>): Record<string, unknown> => ({ type: 1, option });
  switch (name) {
    case 'colorPicker-cellbutton':
      return { name, cellButtons: [cellTypeButton('openColorPicker', 5)] };
    case 'datetimepicker-cellbutton':
      return { name, cellButtons: [cellTypeButton('openDateTimePicker', 5)], dropDowns: [dropDownCalendar({ calendarPage: 3, showTime: true, showDateRange: false, startDay: 7 })] };
    case 'dateRangePicker-cellbutton':
      return {
        name,
        formatter: '=IF(ISBLANK(@), "", TEXT(@.start, "m/d/yyyy")&"~"&TEXT(@.end, "m/d/yyyy"))',
        cellButtons: [cellTypeButton('openDateTimePicker', 5)],
        dropDowns: [dropDownCalendar({ calendarPage: 3, showTime: false, showDateRange: true, startDay: 7, showBuiltInDateRange: true })],
      };
    case 'timepicker-cellbutton':
      return { name, cellButtons: [cellTypeButton('openTimePicker', 5)], dropDowns: [{ type: 2, option: { min: {}, max: { hour: 23, minute: 59, second: 59 }, step: { hour: 1 }, formatString: 'hh:mm', height: 200 } }] };
    case 'calculator-cellbutton':
      return { name, cellButtons: [cellTypeButton('openCalculator', 5)], dropDowns: [] };
    case 'monthpicker-cellbutton': {
      const stopYear = new Date().getFullYear();
      return { name, cellButtons: [cellTypeButton('openMonthPicker', 5)], dropDowns: [{ type: 3, option: { startYear: stopYear - 10, stopYear, height: 300 } }] };
    }
    case 'slider-cellbutton':
      return { name, cellButtons: [cellTypeButton('openSlider', 5)], dropDowns: [{ type: 5, option: { min: 0, max: 100, direction: 0, height: 350, width: 350, scaleVisible: false, step: 1 } }] };
    case 'sliderRange-cellbutton':
      return {
        name,
        formatter: '=IF(ISBLANK(@), "", @.start&"~"&@.end)',
        cellButtons: [cellTypeButton('openSlider', 5)],
        dropDowns: [{ type: 5, option: { min: 0, max: 100, direction: 0, height: 350, width: 350, scaleVisible: false, step: 1, showNumberRange: true } }],
      };
    case 'okcancel-cellbutton':
      return { name, cellButtons: [cellTypeButton('commitInputNavigationDown', 4, 1, 2), cellTypeButton('cancelInput', 3, 1, 2)], dropDowns: [] };
    case 'clear-cellbutton':
      return { name, cellButtons: [cellTypeButton('clear', 2)], dropDowns: [] };
    default:
      return null;
  }
}

/** All cell-type style template names, in gallery tile order. */
export const cellTypeStyleTemplateNames = [
  'colorPicker-cellbutton', 'datetimepicker-cellbutton', 'dateRangePicker-cellbutton', 'timepicker-cellbutton', 'calculator-cellbutton',
  'monthpicker-cellbutton', 'slider-cellbutton', 'sliderRange-cellbutton', 'okcancel-cellbutton', 'clear-cellbutton',
];
const ACCENTS = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
const tint = (hex: string, amount: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  return `#${[mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const CELL_STYLES: CellStyleDef[] = [
  { name: 'Color', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'colorPicker-cellbutton' },
  { name: 'DateTime', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'datetimepicker-cellbutton' },
  { name: 'DateRange', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'dateRangePicker-cellbutton' },
  { name: 'Time', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'timepicker-cellbutton' },
  { name: 'Calculator', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'calculator-cellbutton' },
  { name: 'Month', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'monthpicker-cellbutton' },
  { name: 'Slider', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'slider-cellbutton' },
  { name: 'NumberRange', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'sliderRange-cellbutton' },
  { name: 'OKCancel', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'okcancel-cellbutton' },
  { name: 'Clear', group: 'Color, DateTime and Other Cell Type Style', kind: 'cellType', value: 'clear-cellbutton' },
  { name: 'Normal', group: 'Good, Bad and Neutral', style: {} },
  { name: 'Bad', group: 'Good, Bad and Neutral', style: { backColor: '#ffc7ce', foreColor: '#9c0006' } },
  { name: 'Good', group: 'Good, Bad and Neutral', style: { backColor: '#c6efce', foreColor: '#006100' } },
  { name: 'Neutral', group: 'Good, Bad and Neutral', style: { backColor: '#ffeb9c', foreColor: '#9c6500' } },
  { name: 'Calculation', group: 'Data And Model', style: { backColor: '#f2f2f2', foreColor: '#fa7d00', fontWeight: 'bold' } },
  { name: 'Check Cell', group: 'Data And Model', style: { backColor: '#a5a5a5', foreColor: '#ffffff', fontWeight: 'bold' } },
  { name: 'Explanatory...', group: 'Data And Model', style: { foreColor: '#7f7f7f', fontStyle: 'italic' } },
  { name: 'Input', group: 'Data And Model', style: { backColor: '#ffcc99', foreColor: '#3f3f76' } },
  { name: 'Linked Cell', group: 'Data And Model', style: { foreColor: '#fa7d00' } },
  { name: 'Note', group: 'Data And Model', style: { backColor: '#ffffcc', borderTop: { color: '#b2b2b2', style: 1 }, borderBottom: { color: '#b2b2b2', style: 1 } } },
  { name: 'Output', group: 'Data And Model', style: { backColor: '#f2f2f2', foreColor: '#3f3f3f', fontWeight: 'bold' } },
  { name: 'Warning Text', group: 'Data And Model', style: { foreColor: '#ff0000' } },
  { name: 'Hyperlink', group: 'Data And Model', style: { foreColor: '#0563c1', textDecoration: 'underline' } },
  { name: 'Heading 1', group: 'Titles and Headings', style: { fontSize: '15pt', fontFamily: 'Calibri Light', foreColor: '#44546a' }, preview: 'Heading 1', previewCss: { borderBottom: '1px solid #44546a', fontWeight: 'bold' } },
  { name: 'Heading 2', group: 'Titles and Headings', style: { fontSize: '13pt', fontFamily: 'Calibri Light', foreColor: '#44546a' }, preview: 'Heading 2', previewCss: { borderBottom: '1px solid #44546a', fontWeight: 'bold' } },
  { name: 'Heading 3', group: 'Titles and Headings', style: { fontSize: '11pt', fontFamily: 'Calibri Light', foreColor: '#44546a' }, preview: 'Heading 3', previewCss: { fontWeight: 'bold' } },
  { name: 'Heading 4', group: 'Titles and Headings', style: { fontSize: '11pt', fontFamily: 'Calibri Light', foreColor: '#44546a', fontStyle: 'italic' }, preview: 'Heading 4', previewCss: { fontWeight: 'bold', fontStyle: 'italic' } },
  { name: 'Title', group: 'Titles and Headings', style: { fontSize: '18pt', fontFamily: 'Calibri Light', foreColor: '#44546a' }, preview: 'Title', previewCss: { fontWeight: 'normal' } },
  { name: 'Total', group: 'Titles and Headings', style: { fontWeight: 'bold', borderTop: { color: '#000000', style: 1 }, borderBottom: { color: '#000000', style: 5 } }, preview: 'Total', previewCss: { fontWeight: 'bold', borderTop: '1px solid #44546a', borderBottom: '3px solid #44546a' } },
  ...['20%', '40%', '60%', ''].flatMap((level, row) => ACCENTS.map((accent, index) => ({
    name: level ? `${level} - Accent${index + 1}` : `Accent${index + 1}`,
    group: 'Themed Cell Style',
    style: {
      backColor: level === '20%' ? tint(accent, 0.8) : level === '40%' ? tint(accent, 0.6) : level === '60%' ? tint(accent, 0.4) : accent,
      foreColor: accent === '#ffc000' || accent === '#a5a5a5' ? '#000000' : (level === '60%' || level === '' ? '#ffffff' : '#1f3864'),
      fontWeight: row === 0 ? 'normal' : 'normal',
    },
  }))),
  { plain: true, name: 'Comma', group: 'Number Format', style: { formatter: '#,##0.00' } },
  { plain: true, name: 'Comma [0]', group: 'Number Format', style: { formatter: '#,##0' } },
  { plain: true, name: 'Currency', group: 'Number Format', style: { formatter: '$#,##0.00' } },
  { plain: true, name: 'Currency [0]', group: 'Number Format', style: { formatter: '$#,##0' } },
  { plain: true, name: 'Percent', group: 'Number Format', style: { formatter: '0%' } },
];
export const cellStyleGroups = Array.from(new Set(CELL_STYLES.map((s) => s.group))).map((name) => ({
  name,
  columns: name === 'Color, DateTime and Other Cell Type Style' ? 5 : 6,
  styles: CELL_STYLES.filter((s) => s.group === name).map((style) => ({ ...style, preview: style.preview ?? style.name })),
}));

/** Copy one resolved style's own (defined) fields into a fresh Style. `name` and `parentName`
 *  are skipped so the caller can set the new parent link. Mirrors the official gallery, which
 *  materialises the previously resolved properties into the cell style and re-points parentName. */
function copyStyleFields(source: object | null, target: object): void {
  if (!source) return;
  const from = source as Record<string, unknown>, to = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(from)) {
    if (value === undefined || key === 'name' || key === 'parentName' || typeof value === 'function') continue;
    to[key] = value;
  }
}

/** Register one cell-type named style on the workbook if not present yet (official registers lazily). */
export function registerCellStyleTemplate(d: Designer, name: string): void {
  const wb: Workbook = d.getWorkbook();
  if (wb.getNamedStyle(name)) return;
  const def = cellTypeStyleTemplate(name);
  if (!def) return;
  const style = new d.gc.Spread.Sheets.Style();
  Object.assign(style, def);
  wb.addNamedStyle(style);
}

/** Point every selected cell's style at a workbook named style through its `parentName`. */
function setCellStyleParentName(d: Designer, name: string): void {
  const sheet = activeSheet(d), GC = d.gc;
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    const rc = range.rowCount < 0 ? sheet.getRowCount() : Math.max(1, range.rowCount);
    const cc = range.colCount < 0 ? sheet.getColumnCount() : Math.max(1, range.colCount);
    if (rc * cc > 4096) {
      // Very large selection: skip the per-cell merge of previous resolved styles.
      // Options-object form of our core's Style constructor (the contract lists positional args only).
      sheet.getRange(r, c, rc, cc).setStyle(createStyle(GC, { parentName: name }));
      continue;
    }
    for (let row = r; row < r + rc; row++) {
      for (let col = c; col < c + cc; col++) {
        const style = new GC.Spread.Sheets.Style();
        copyStyleFields(sheet.getStyle(row, col), style);
        style.parentName = name;
        sheet.setStyle(row, col, style);
      }
    }
  }
}

export function applyCellStyle(d: Designer, value: string): void {
  const sheet = activeSheet(d), GC = d.gc;
  const wb: Workbook = d.getWorkbook();
  const item = CELL_STYLES.find((s) => (s.value ?? s.name) === value);
  if (item?.kind === 'cellType') {
    const templateName = item.value as string;
    registerCellStyleTemplate(d, templateName);
    setCellStyleParentName(d, templateName);
    return;
  }
  if (!item && wb.getNamedStyle(value)) {
    // Custom section tile: a user-created workbook named style (see New Cell Style...).
    setCellStyleParentName(d, value);
    return;
  }
  const style = new GC.Spread.Sheets.Style();
  if (item) Object.assign(style, item.style as object);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    const rc = range.rowCount < 0 ? sheet.getRowCount() : range.rowCount;
    const cc = range.colCount < 0 ? sheet.getColumnCount() : range.colCount;
    sheet.getRange(r, c, rc, cc).setStyle(style);
  }
}

/** Gallery "Custom" section entries: workbook named styles that are not gallery tiles or templates. */
export function customCellStyles(d: Designer): { name: string; foreColor?: string; backColor?: string; font?: string }[] {
  const builtin = new Set(CELL_STYLES.map((s) => s.name.toLowerCase()));
  const templates = new Set(cellTypeStyleTemplateNames);
  let styles: Style[] = [];
  try {
    styles = d.getWorkbook().getNamedStyles() ?? [];
  } catch {
    return [];
  }
  return styles
    .map((style) => ({
      name: String(style.name ?? ''),
      foreColor: typeof style.foreColor === 'string' && style.foreColor ? style.foreColor : undefined,
      backColor: typeof style.backColor === 'string' && style.backColor ? style.backColor : undefined,
      font: typeof style.font === 'string' && style.font ? style.font : undefined,
    }))
    .filter((entry) => entry.name && !templates.has(entry.name) && !builtin.has(entry.name.toLowerCase()));
}
