/* Cell style commands: font, alignment, number format, borders, merge,
 * format painter and the Format Cells dialog applier, plus the ribbon's
 * static font/format lists. */
import type { DesignerApi as Designer } from '../designer-api.js';
import type { SelectionRange, Worksheet } from '../core-internals.js';
import { internals, styleWriter } from '../core-internals.js';
import type GC from '@mescius/spread-sheets';
import { activeRanges, activeSheet, currentStyle } from './base.js';
import { numberFormatterFor, UNDERLINE_DECORATION } from '../dialogs/number-format.js';

export { UNDERLINE_DECORATION } from '../dialogs/number-format.js';

export const H = { left: 0, center: 1, right: 2, general: 3, top: 0, middle: 1, bottom: 2 } as const;

export const formatList = [
  { text: 'General', value: 'General', iconClass: 'number-format-general' },
  { text: 'Number', value: '0.00', iconClass: 'number-format-number' },
  { text: 'Currency', value: '$#,##0.00', iconClass: 'number-format-currency' },
  { text: 'Accounting', value: '$#,##0.00_);($#,##0.00)', iconClass: 'number-format-accounting' },
  { text: 'Short Date', value: 'm/d/yyyy', iconClass: 'number-format-shortdate' },
  { text: 'Long Date', value: 'dddd, mmmm dd, yyyy', iconClass: 'number-format-longdate' },
  { text: 'Time', value: 'h:mm:ss AM/PM', iconClass: 'number-format-time' },
  { text: 'Percentage', value: '0%', iconClass: 'number-format-percentage' },
  { text: 'Fraction', value: '# ?/?', iconClass: 'number-format-fraction' },
  { text: 'Scientific', value: '0.00E+00', iconClass: 'number-format-scientific' },
  { text: 'Text', value: '@', iconClass: 'number-format-text' },
];

export const fontFamilies = [
  'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Century', 'Courier New', 'Comic Sans MS',
  'Garamond', 'Georgia', 'Malgun Gothic', 'Mangal', 'Meiryo', 'MS Gothic', 'MS Mincho', 'MS PGothic',
  'MS PMincho', 'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
];

export const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 26, 28, 36, 48, 72];

export function setStyleProperty(sheet: Worksheet, ranges: SelectionRange[], property: string, value: unknown): void {
  for (const range of ranges) {
    const r = range.row, c = range.col;
    const rows = r < 0 ? [r] : Array.from({ length: range.rowCount }, (_, i) => r + i);
    const cols = c < 0 ? [c] : Array.from({ length: range.colCount }, (_, i) => c + i);
    if (r < 0 && range.rowCount > 1) rows.splice(0, rows.length, ...Array.from({ length: range.rowCount }, (_, i) => i));
    for (const row of rows) for (const col of cols) internals(sheet)._setStyleProperty(row, col, property, value);
  }
}

export function applyStyle(d: Designer, property: string, value: unknown): void {
  setStyleProperty(activeSheet(d), activeRanges(activeSheet(d)), property, value);
}

export function toggleBold(d: Designer): void {
  const style = currentStyle(d);
  const isBold = /bold|[6-9]00/.test(String(style.fontWeight ?? ''));
  applyStyle(d, 'fontWeight', isBold ? 'normal' : 'bold');
}
export function toggleItalic(d: Designer): void {
  const style = currentStyle(d);
  applyStyle(d, 'fontStyle', /italic|oblique/.test(String(style.fontStyle ?? '')) ? 'normal' : 'italic');
}
export function toggleUnderline(d: Designer): void {
  const style = currentStyle(d);
  const current = String(style.textDecoration ?? '');
  applyStyle(d, 'textDecoration', current.includes('underline') ? 'none' : 'underline');
}
export function toggleDoubleUnderline(d: Designer): void {
  const style = currentStyle(d);
  const current = String(style.textDecoration ?? '');
  applyStyle(d, 'textDecoration', current.includes('double underline') ? 'none' : 'double underline');
}

export function setNumberFormat(d: Designer, value: string): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    const rows = range.row < 0 ? [range.row] : Array.from({ length: range.rowCount }, (_, i) => r + i);
    const cols = range.col < 0 ? [range.col] : Array.from({ length: range.colCount }, (_, i) => c + i);
    for (const row of rows) for (const col of cols) internals(sheet)._setStyleProperty(row, col, 'formatter', value === 'General' ? undefined : value);
  }
}

export function adjustDecimals(d: Designer, delta: number): void {
  const style = currentStyle(d);
  const format = String(style.formatter ?? '0');
  const pattern = format.includes(';') ? format.split(';')[0] : format;
  const match = pattern.match(/\.([0#]+)/);
  let next: string;
  if (match) {
    const decimals = match[1];
    next = delta > 0 ? pattern.replace(`.${decimals}`, `.${decimals}0`) : decimals.length > 1 ? pattern.replace(`.${decimals}`, `.${decimals.slice(0, -1)}`) : pattern.replace(`.${decimals}`, '');
  } else next = delta > 0 ? `${pattern}.0` : pattern;
  setNumberFormat(d, next);
}

export function setAlignment(d: Designer, property: 'hAlign' | 'vAlign', value: number): void {
  applyStyle(d, property, value);
}

export function setOrientation(d: Designer, value: number): void {
  applyStyle(d, 'textOrientation', value);
}

export function applyBorder(d: Designer, kind: string): void {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const line = new GC.Spread.Sheets.LineBorder('#000000', 1);
  const options: Record<string, boolean> = {};
  if (kind === 'bottomBorder') options.bottom = true;
  else if (kind === 'topBorder') options.top = true;
  else if (kind === 'leftBorder') options.left = true;
  else if (kind === 'rightBorder') options.right = true;
  else if (kind === 'allBorder') options.all = true;
  else if (kind === 'outsideBorder' || kind === 'thickBoxBorder') options.outline = true;
  else if (kind === 'bottomDoubleBorder' || kind === 'thickBottomBorder') options.bottom = true;
  else if (kind === 'topBottomBorder' || kind === 'topThickBottomBorder' || kind === 'topDoubleBottomBorder') {
    options.top = true; options.bottom = true;
  } else if (kind === 'noBorder') {
    const none = new GC.Spread.Sheets.LineBorder('transparent', 0);
    for (const range of activeRanges(sheet)) {
      const r = Math.max(0, range.row), c = Math.max(0, range.col);
      sheet.getRange(r, c, range.rowCount, range.colCount).setBorder(none, { all: true });
    }
    return;
  }
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    sheet.getRange(r, c, range.rowCount, range.colCount).setBorder(line, options);
  }
}

export function mergeCenter(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    sheet.addSpan(r, c, Math.max(1, range.rowCount), Math.max(1, range.colCount));
    internals(sheet)._setStyleProperty(r, c, 'hAlign', H.center);
    internals(sheet)._setStyleProperty(r, c, 'vAlign', H.middle);
  }
}
export function unmerge(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    for (let row = r; row < r + Math.max(1, range.rowCount); row++)
      for (let col = c; col < c + Math.max(1, range.colCount); col++) sheet.removeSpan(row, col);
  }
}
export function mergeAcross(d: Designer): void {
  const sheet = activeSheet(d);
  for (const range of activeRanges(sheet)) {
    const r = Math.max(0, range.row), c = Math.max(0, range.col);
    for (let row = r; row < r + Math.max(1, range.rowCount); row++) sheet.addSpan(row, c, 1, Math.max(1, range.colCount));
  }
}

/** Official button field defaults; the trial omits unchanged ones from the serialized style. */
const CELL_BUTTON_DEFAULTS: [string, unknown][] = [
  ['width', 20], ['caption', ''], ['imageSrc', ''], ['captionAlign', 1], ['hoverBackColor', ''], ['buttonBackColor', ''],
];

/** Serialize dialog button state like the official trial: the six core fields are always
 * written; styling fields only when they differ from their defaults. */
export function normalizeCellButtons(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const button = (entry ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {
      imageType: Number(button.imageType ?? 5),
      visibility: Number(button.visibility ?? 0),
      position: Number(button.position ?? 1),
      command: String(button.command ?? 'none'),
      enabled: button.enabled !== false,
      useButtonStyle: !!button.useButtonStyle,
    };
    for (const [key, fallback] of CELL_BUTTON_DEFAULTS) {
      const current = button[key] === undefined ? fallback : button[key];
      if (JSON.stringify(current) !== JSON.stringify(fallback)) out[key] = current;
    }
    const imageSize = button.imageSize as Record<string, unknown> | undefined;
    const width = Number(imageSize?.width ?? button.imageWidth ?? 16);
    const height = Number(imageSize?.height ?? button.imageHeight ?? 16);
    if (width !== 16 || height !== 16) out.imageSize = { width, height };
    return out;
  });
}

/** Keep only the decoration groups the user actually filled in. */
export function normalizeDecoration(value: unknown): Record<string, unknown> | undefined {
  const decoration = (value ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const fold = (decoration.cornerFold ?? {}) as Record<string, unknown>;
  const position = Number(fold.position ?? 0);
  const size = Number(fold.size ?? 0);
  const color = String(fold.color ?? '');
  if (position || size || color) out.cornerFold = { position, size, color };
  const icons = Array.isArray(decoration.icons) ? decoration.icons as Record<string, unknown>[] : [];
  if (icons.length) out.icons = icons.map((icon) => ({ src: String(icon.src ?? ''), position: Number(icon.position ?? 1), width: Number(icon.width ?? 16), height: Number(icon.height ?? 16) }));
  return Object.keys(out).length ? out : undefined;
}

export function applyFormatCells(d: Designer, data: Record<string, unknown>): void {
  const sheet = activeSheet(d);
  const ranges = activeRanges(sheet);
  const set = (property: string, value: unknown): void => setStyleProperty(sheet, ranges, property, value);
  if (data.formatCode !== undefined || data.category !== undefined || data.decimals !== undefined || data.separator !== undefined
    || data.negative !== undefined || data.symbol !== undefined || data.type !== undefined || data.locale !== undefined) {
    // The Number tab owns the formatter: build the exact code the trial writes for the
    // selected category + option state (Custom uses the typed/selected code).
    const category = String(data.category ?? 'General');
    const code = category === 'Custom' ? String(data.formatCode ?? '') : (numberFormatterFor(category, {
      decimals: Number(data.decimals ?? 2), separator: !!data.separator, negative: Number(data.negative ?? 0),
      symbol: Number(data.symbol ?? 1), type: Number(data.type ?? 0), locale: Number(data.locale ?? 0),
    }) ?? '');
    for (const range of ranges) {
      const r = Math.max(0, range.row), c = Math.max(0, range.col);
      const rows = range.row < 0 ? [range.row] : Array.from({ length: range.rowCount }, (_, i) => r + i);
      const cols = range.col < 0 ? [range.col] : Array.from({ length: range.colCount }, (_, i) => c + i);
      for (const row of rows) for (const col of cols) internals(sheet)._setStyleProperty(row, col, 'formatter', !code || code === 'General' ? undefined : code);
    }
  }
  if (data.hAlign !== undefined) set('hAlign', Number(data.hAlign));
  if (data.vAlign !== undefined) set('vAlign', Number(data.vAlign));
  if (data.indent !== undefined || data.orientation !== undefined || data.verticalText !== undefined) {
    if (data.indent !== undefined) set('textIndent', Number(data.indent));
    // The trial's Orientation editor commits with the Indent spinner: editing any of these on OK
    // writes textOrientation and isVerticalText too (e.g. an angle edit alone writes isVerticalText: false).
    set('textOrientation', Number(data.orientation ?? 0));
    set('isVerticalText', !!data.verticalText);
  }
  if (data.wrapText !== undefined) set('wordWrap', !!data.wrapText);
  if (data.shrinkToFit !== undefined) set('shrinkToFit', !!data.shrinkToFit);
  if (data.showEllipsis !== undefined) set('showEllipsis', !!data.showEllipsis);
  if (data.textDirection !== undefined && data.textDirection !== '') set('textDirection', Number(data.textDirection));
  if (data.fontFamily !== undefined) set('fontFamily', String(data.fontFamily));
  if (data.fontStyle !== undefined) {
    set('fontStyle', /italic/i.test(String(data.fontStyle)) ? 'italic' : 'normal');
    set('fontWeight', /bold/i.test(String(data.fontStyle)) ? 'bold' : 'normal');
  } else if (data.fontWeight !== undefined) set('fontWeight', String(data.fontWeight));
  if (data.fontSize !== undefined) set('fontSize', /^\d+(?:\.\d+)?$/.test(String(data.fontSize)) ? `${data.fontSize}pt` : String(data.fontSize));
  if (data.underline !== undefined) set('textDecoration', String(data.underline) === 'None' ? 0 : 1);
  if (data.color !== undefined) set('foreColor', String(data.color));
  if (data.font !== undefined) {
    // The Font tab sends its whole widget state plus the set of touched fields; OK writes only
    // the touched members, matching the trial (probed: size/family edits alone leave foreColor
    // and textDecoration unset). textDecoration = underline bits | lineThrough(2).
    const font = data.font as { family: string; style: string; size: string; underline: number; strike: boolean; color: string; touched?: string[] };
    const touched = font.touched ?? ['family', 'style', 'size', 'underline', 'strike', 'color'];
    if (touched.includes('family')) set('fontFamily', String(font.family) || undefined);
    if (touched.includes('style')) {
      set('fontStyle', /italic/i.test(String(font.style)) ? 'italic' : 'normal');
      set('fontWeight', /bold/i.test(String(font.style)) ? 'bold' : 'normal');
    }
    if (touched.includes('size')) {
      const size = String(font.size ?? '').trim();
      if (size) set('fontSize', /^\d+(?:\.\d+)?$/.test(size) ? `${size}pt` : size);
    }
    if (touched.includes('color')) set('foreColor', font.color === '' ? '#000000' : String(font.color));
    if (touched.includes('underline') || touched.includes('strike')) set('textDecoration', (UNDERLINE_DECORATION[Number(font.underline)] ?? 0) | (font.strike ? 2 : 0));
  }
  if (data.locked !== undefined) set('locked', !!data.locked);
  if (data.hidden !== undefined) set('hidden', !!data.hidden);
  if (data.mergeCells !== undefined) {
    if (data.mergeCells) mergeCenter(d); else unmerge(d);
  }
  if (data.cellButtons !== undefined) set('cellButtons', normalizeCellButtons(data.cellButtons));
  if (data.decoration !== undefined) set('decoration', normalizeDecoration(data.decoration));
  if (data.paddingLeft !== undefined || data.paddingRight !== undefined || data.paddingTop !== undefined || data.paddingBottom !== undefined) {
    set('cellPadding', `${Number(data.paddingTop ?? 0)} ${Number(data.paddingRight ?? 0)} ${Number(data.paddingBottom ?? 0)} ${Number(data.paddingLeft ?? 0)}`);
  }
  if (data.labelText !== undefined || data.labelAlignment !== undefined || data.labelVisibility !== undefined
    || data.labelMarginTop !== undefined || data.labelFontFamily !== undefined || data.labelFontSize !== undefined) {
    set('watermark', String(data.labelText ?? '') || undefined);
    set('labelOptions', {
      font: `${data.labelItalic ? 'italic' : 'normal'} ${data.labelBold ? 'bold' : 'normal'} ${String(data.labelFontSize ?? '11')}pt ${String(data.labelFontFamily ?? 'Calibri')}`,
      foreColor: String(data.labelForeColor ?? '#808080'),
      alignment: Number(data.labelAlignment ?? 0),
      visibility: Number(data.labelVisibility ?? 2),
      margin: `${Number(data.labelMarginTop ?? 0)} ${Number(data.labelMarginRight ?? 0)} ${Number(data.labelMarginBottom ?? 0)} ${Number(data.labelMarginLeft ?? 0)}`,
    });
  }
  if (data.textDecoration !== undefined) set('textDecoration', data.textDecoration);
  if (data.maskPattern !== undefined || data.maskType !== undefined) {
    set('mask', data.maskType === 'none' || data.maskPattern === '' ? undefined : {
      pattern: String(data.maskPattern ?? ''),
      ...(data.maskPlaceholder === undefined || data.maskPlaceholder === '' || data.maskPlaceholder === '_' ? {} : { placeholder: String(data.maskPlaceholder) }),
      ...(data.maskExcludeLiteral === undefined ? {} : { excludeLiteral: !!data.maskExcludeLiteral }),
      ...(data.maskExcludePlaceholder === undefined ? {} : { excludePlaceholder: !!data.maskExcludePlaceholder }),
    });
  }
  if (data.borderPreset) {
    // Legacy single-key path kept for template-driven callers; the Border tab uses `border` below.
    const GC = d.gc;
    const lineStyles: Record<string, number> = { thin: 1, medium: 2, dashed: 3, dotted: 4, thick: 5, double: 6 };
    const line = data.borderPreset === 'none' ? null : new GC.Spread.Sheets.LineBorder(String(data.borderColor ?? '#000000'), Number(data.lineStyleValue ?? lineStyles[String(data.lineStyle)] ?? 1));
    const opts = data.borderPreset === 'outline' ? { outline: true } : data.borderPreset === 'inside' ? { inside: true } : { all: true };
    for (const range of ranges) sheet.getRange(Math.max(0, range.row), Math.max(0, range.col), Math.max(1, range.rowCount), Math.max(1, range.colCount)).setBorder(line as GC.Spread.Sheets.LineBorder, opts);
  }
  if (data.border !== undefined) {
    // The Border tab's logical edges over the selection: outer edges go on the range rim,
    // hInside/vInside between cells — the exact per-cell pattern the trial writes (probed:
    // outline/inside over a 2x2 → per-cell borderTop/Bottom/Left/Right, never borderHorizontal).
    // Slot meanings: undefined = untouched (never written), null = cleared (empty line
    // border, style 0 — the trial's None writes these), object = apply this border.
    type Edge = { style: number; color: string } | null | undefined;
    const border = data.border as { edges?: Record<string, Edge>; corners?: number[] };
    const edges = border.edges ?? {};
    const GC = d.gc;
    const make = (edge: Edge): GC.Spread.Sheets.LineBorder | undefined =>
      edge === undefined ? undefined : new GC.Spread.Sheets.LineBorder(String(edge?.color ?? '#000'), Number(edge?.style ?? 0) as GC.Spread.Sheets.LineStyle);
    for (const range of ranges) {
      const rows = range.row < 0 ? [-1] : Array.from({ length: Math.max(1, range.rowCount) }, (_, i) => Math.max(0, range.row) + i);
      const cols = range.col < 0 ? [-1] : Array.from({ length: Math.max(1, range.colCount) }, (_, i) => Math.max(0, range.col) + i);
      rows.forEach((row, ri) => cols.forEach((col, ci) => {
        internals(sheet)._setStyleProperty(row, col, 'borderTop', make(ri === 0 ? edges.top : edges.hInside));
        internals(sheet)._setStyleProperty(row, col, 'borderBottom', make(ri === rows.length - 1 ? edges.bottom : edges.hInside));
        internals(sheet)._setStyleProperty(row, col, 'borderLeft', make(ci === 0 ? edges.left : edges.vInside));
        internals(sheet)._setStyleProperty(row, col, 'borderRight', make(ci === cols.length - 1 ? edges.right : edges.vInside));
        internals(sheet)._setStyleProperty(row, col, 'diagonalUp', make(edges.diagonalUp));
        internals(sheet)._setStyleProperty(row, col, 'diagonalDown', make(edges.diagonalDown));
      }));
    }
    const corners = (border.corners ?? [0, 0, 0, 0]).map((v) => Math.max(0, Math.round(Number(v) || 0)));
    if (corners.some((v) => v > 0)) set('borderRadius', `${corners[0]} ${corners[1]} ${corners[3]} ${corners[2]}`);
  }
  if (data.fill !== undefined) {
    // Fill tab state: a pattern writes the IPatternFill record exactly like the trial
    // ({type, patternColor, backgroundColor}); otherwise the background token ('Accent 1',
    // '#FF0000', ...) or undefined for No Color. Inside a pattern the trial stores the
    // background as a resolved colour — theme names become lower-case hex ('Accent 2' ->
    // '#ed7d31'), hex tokens pass through unchanged (probed .probe/t43/official-writes.json).
    const fill = data.fill as { bg?: string | null; patternColor?: string; patternType?: number };
    if (fill.patternType) {
      const bg = fill.bg ?? '';
      const schemes = d.gc.Spread.Sheets.ThemeColors;
      const resolved = bg && !/^#/i.test(bg) ? (schemes.Office.getColor(bg) ?? bg) : bg;
      set('backColor', { type: Number(fill.patternType), patternColor: fill.patternColor ?? '', backgroundColor: resolved });
    } else if (fill.bg !== undefined) set('backColor', fill.bg === null ? undefined : String(fill.bg));
  }
}

export function applyFormatPainter(d: Designer): void {
  const sheet = activeSheet(d);
  const source = d._formatPainterStyle;
  if (!source) return;
  const range = activeRanges(sheet)[0];
  if (!range) return;
  const r = Math.max(0, range.row), c = Math.max(0, range.col);
  const rc = range.rowCount < 0 ? sheet.getRowCount() : range.rowCount;
  const cc = range.colCount < 0 ? sheet.getColumnCount() : range.colCount;
  for (let row = r; row < r + rc; row++) for (let col = c; col < c + cc; col++) styleWriter(sheet).setStyle(row, col, source.clone ? source.clone() : { ...source });
}
