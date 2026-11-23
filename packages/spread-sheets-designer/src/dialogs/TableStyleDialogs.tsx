/* New Table Style dialog (Format Table gallery footer). Layout and behaviour follow
 * the running v19 trial measured black-box (docs/STATUS.md, TASK 65):
 *  - 589 x 422 dialog: "Name:" row, a "Table Element:" fieldset with a 13-item list
 *    (24 px rows, 394 x 208 box) and Format.../Clear centred below it, a "Preview"
 *    fieldset (121 x 101 canvas) and a "Stripe Size" fieldset (combo 1..7) that only
 *    the four stripe elements show; OK/Cancel footer.
 *  - Format... opens the Format Cells dialog with the Font/Border/Fill tabs only;
 *    OK stores the style for the selected element (one dialog at a time, so the
 *    draft lives on the designer and the dialog re-opens with it).
 *  - OK builds a `GC.Spread.Sheets.Tables.TableTheme` through the public API and
 *    registers it with `workbook.customTableThemes.add(…)`; the gallery then lists
 *    it in a "Custom" section and applies it like a built-in theme.
 * Every pixel of the preview is our own vector drawing (dashes/bands), never a copy. */
import React, { useEffect, useRef } from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import { recordView } from '../core-internals.js';
import { CustomSelect } from './custom-widgets.js';
import { uiKey } from '../resolve.js';
import { T } from './t.js';

/** The table-theme style key of every element of the trial's element list. */
export const TABLE_STYLE_ELEMENTS: { label: string; key: string; stripe?: string }[] = [  { label: 'Whole Table', key: 'wholeTableStyle' },
  { label: 'First Column Stripe', key: 'firstColumnStripStyle', stripe: 'firstColumnStripSize' },
  { label: 'Second Column Stripe', key: 'secondColumnStripStyle', stripe: 'secondColumnStripSize' },
  { label: 'First Row Stripe', key: 'firstRowStripStyle', stripe: 'firstRowStripSize' },
  { label: 'Second Row Stripe', key: 'secondRowStripStyle', stripe: 'secondRowStripSize' },
  { label: 'Last Column', key: 'highlightLastColumnStyle' },
  { label: 'First Column', key: 'highlightFirstColumnStyle' },
  { label: 'Header Row', key: 'headerRowStyle' },
  { label: 'Total Row', key: 'footerRowStyle' },
  { label: 'First Header Cell', key: 'firstHeaderCellStyle' },
  { label: 'Last Header Cell', key: 'lastHeaderCellStyle' },
  { label: 'First Footer Cell', key: 'firstFooterCellStyle' },
  { label: 'Last Footer Cell', key: 'lastFooterCellStyle' },
];

export type TableBorderStyle = { style: number; color?: string };
/** The dialog's own normalized element style (what the Format Cells tabs produce). */
export interface TableElementStyle {
  backColor?: string;
  foreColor?: string;
  family: string;
  italic: boolean;
  bold: boolean;
  /** Point size, already suffixed (`'11pt'`). */
  size: string;
  borders: Record<'left' | 'right' | 'top' | 'bottom' | 'horizontal' | 'vertical', TableBorderStyle>;
}

const BORDER_KEYS = ['left', 'right', 'top', 'bottom', 'horizontal', 'vertical'] as const;

/** The style a freshly opened element carries (the trial's untouched element). */
export function emptyTableElementStyle(): TableElementStyle {
  const none = (): TableBorderStyle => ({ style: 0 });
  return {
    family: 'Calibri', italic: false, bold: false, size: '11pt',
    borders: { left: none(), right: none(), top: none(), bottom: none(), horizontal: none(), vertical: none() },
  };
}

/** The JSON the trial writes for one element style (all six borders always present). */
export function tableElementStyleJSON(style: TableElementStyle): Record<string, unknown> {
  const font = `${style.italic ? 'italic' : 'normal'} ${style.bold ? 'bold' : 'normal'} ${style.size} ${style.family}`;
  const record: Record<string, unknown> = {};
  if (style.backColor) record.backColor = style.backColor;
  if (style.foreColor) record.foreColor = style.foreColor;
  for (const key of BORDER_KEYS) {
    const border = style.borders[key];
    record[`border${key[0]!.toUpperCase()}${key.slice(1)}`] = border.color ? { color: border.color, style: border.style } : { style: border.style };
  }
  record.fontStyle = style.italic ? 'italic' : 'normal';
  record.fontWeight = style.bold ? 'bold' : 'normal';
  record.fontSize = style.size;
  record.fontFamily = style.family;
  record.font = font;
  return record;
}

/** The dialog body's `style` record for a stored theme element (undefined = untouched). */
export function tableElementStyleFromRecord(value: Record<string, unknown> | undefined): TableElementStyle {
  return value ? tableElementStyleFromJSON(value) : emptyTableElementStyle();
}

/** Reads a stored theme style record back into the dialog's element style. */
export function tableElementStyleFromJSON(value: unknown): TableElementStyle {
  const style = emptyTableElementStyle();
  const record = recordView(value ?? {});
  if (typeof record.backColor === 'string') style.backColor = record.backColor;
  if (typeof record.foreColor === 'string') style.foreColor = record.foreColor;
  if (typeof record.fontFamily === 'string') style.family = record.fontFamily;
  if (typeof record.fontSize === 'string') style.size = String(record.fontSize);
  style.bold = /bold|[6-9]00/.test(String(record.fontWeight ?? ''));
  style.italic = /italic|oblique/.test(String(record.fontStyle ?? ''));
  for (const key of BORDER_KEYS) {
    const border = record[`border${key[0]!.toUpperCase()}${key.slice(1)}`];
    if (border && typeof border === 'object') {
      const line = recordView(border);
      style.borders[key] = { style: Number(line.style ?? 0), color: line.color ? String(line.color) : undefined };
    }
  }
  return style;
}

/** Builds the same object graph through the public `Tables.TableStyle` API. */
export function buildTableTheme(
  gc: unknown, name: string,
  styles: Record<string, TableElementStyle>, sizes: Record<string, number>,
): unknown {
  const cast = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
  const sheets = cast(cast(cast(gc).Spread).Sheets);
  const Tables = cast(sheets.Tables);
  const LineBorderCtor = sheets.LineBorder as new (color?: string, style?: number) => unknown;
  if (!Tables?.TableTheme || !Tables?.TableStyle || !LineBorderCtor) throw new Error('NotImplemented: GC.Spread.Sheets.Tables.TableTheme');
  const theme = cast(new (Tables.TableTheme as new () => unknown)());
  (theme.name as (value?: string) => unknown)(name);
  for (const element of TABLE_STYLE_ELEMENTS) {
    const stored = styles[element.key];
    if (!stored) continue;
    // Six `LineBorder`s like the trial's dialog: an untouched border keeps style 0.
    const borders = BORDER_KEYS.map((key) => {
      const border = stored.borders[key];
      return new LineBorderCtor(border.color, border.style);
    });
    const style = cast(new (Tables.TableStyle as new (...args: unknown[]) => unknown)(
      stored.backColor, stored.foreColor,
      `${stored.italic ? 'italic' : 'normal'} ${stored.bold ? 'bold' : 'normal'} ${stored.size} ${stored.family}`,
      ...borders,
    ));
    // The trial keeps the four font slots beside the shorthand in the serialised style.
    style.fontStyle = stored.italic ? 'italic' : 'normal';
    style.fontWeight = stored.bold ? 'bold' : 'normal';
    style.fontSize = stored.size;
    style.fontFamily = stored.family;
    (theme[element.key] as (value: unknown) => unknown)(style);
  }
  for (const [key, value] of Object.entries(sizes)) (theme[key] as (size: number) => unknown)(value);
  return theme;
}

/* ---------------------------------------------------------------- preview --- */

/** The preview grid: 5 columns x 6 rows (header, four banded rows, total row). */
export const PREVIEW_COLUMNS = 5;
export const PREVIEW_ROWS = 6;

/** True when `key` paints the preview cell at (row, col) of the 5 x 6 grid. */
export function previewCellMatches(key: string, row: number, col: number): boolean {
  const lastCol = PREVIEW_COLUMNS - 1;
  const dataRow = row - 1;
  switch (key) {
    case 'wholeTableStyle': return true;
    case 'headerRowStyle': return row === 0;
    case 'footerRowStyle': return row === PREVIEW_ROWS - 1;
    case 'firstHeaderCellStyle': return row === 0 && col === 0;
    case 'lastHeaderCellStyle': return row === 0 && col === lastCol;
    case 'firstFooterCellStyle': return row === PREVIEW_ROWS - 1 && col === 0;
    case 'lastFooterCellStyle': return row === PREVIEW_ROWS - 1 && col === lastCol;
    case 'highlightFirstColumnStyle': return col === 0;
    case 'highlightLastColumnStyle': return col === lastCol;
    case 'firstRowStripStyle': return dataRow >= 0 && dataRow < 4 && dataRow % 2 === 0;
    case 'secondRowStripStyle': return dataRow >= 0 && dataRow < 4 && dataRow % 2 === 1;
    case 'firstColumnStripStyle': return col > 0 && col < lastCol && (col - 1) % 2 === 0;
    case 'secondColumnStripStyle': return col > 0 && col < lastCol && (col - 1) % 2 === 1;
    default: return false;
  }
}

export interface PreviewTheme {
  styles: Record<string, TableElementStyle>;
  /** Optional stripe sizes: a size of N repeats the band every N rows/columns. */
  sizes?: Record<string, number>;
  /** Optional cell matcher override (the pivot dialog paints a different grid). */
  matches?: (key: string, row: number, col: number) => boolean;
}

/** Resolves the paint style of one preview cell (whole table first, element on top). */
function cellPaint(theme: PreviewTheme, row: number, col: number, selected?: string): TableElementStyle | undefined {
  let paint: TableElementStyle | undefined;
  const matches = theme.matches ?? previewCellMatches;
  const keys = Object.keys(theme.styles).filter((key) => matches(key, row, col));
  // The selected element paints last so the user sees exactly what they edit.
  if (selected && keys.includes(selected)) {
    keys.splice(keys.indexOf(selected), 1);
    keys.push(selected);
  }
  for (const key of keys) {
    const style = theme.styles[key];
    if (!style) continue;
    paint = paint ? { ...paint, ...style, borders: style.borders ?? paint.borders } : style;
  }
  return paint;
}

/**
 * Draws the trial's mini table: `width`/`height` cells of hairline "text" dashes,
 * with the styled elements' fill, border and bold dashes on top. Own vector art.
 */
export function drawTablePreview(
  canvas: HTMLCanvasElement, width: number, height: number,
  theme: PreviewTheme, selected?: string,
): void {
  const scale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d') as
    (CanvasRenderingContext2D & { setTransform(scaleX: number, scaleY: number, skewX: number, skewY: number, tx: number, ty: number): void }) | null;
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  const cellWidth = width / PREVIEW_COLUMNS;
  const cellHeight = height / PREVIEW_ROWS;
  for (let row = 0; row < PREVIEW_ROWS; row++) {
    for (let col = 0; col < PREVIEW_COLUMNS; col++) {
      const x = col * cellWidth, y = row * cellHeight;
      const paint = cellPaint(theme, row, col, selected);
      if (paint?.backColor) {
        context.fillStyle = paint.backColor;
        context.fillRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1);
      }
      // The dash glyph ("text"): 4 dashes, bold when the element's font is bold.
      const dashColor = paint?.foreColor ?? (paint?.backColor ? 'rgba(255,255,255,0.85)' : '#4d4d4d');
      const thickness = paint?.bold ? 2 : 1;
      context.fillStyle = dashColor;
      const dashWidth = cellWidth * 0.26;
      const gap = (cellWidth - dashWidth * 2) / 3;
      for (let index = 0; index < 2; index++) {
        context.fillRect(Math.round(x + gap + index * (dashWidth + gap)), Math.round(y + cellHeight / 2 - thickness / 2), Math.round(dashWidth), thickness);
      }
      if (!paint) continue;
      context.strokeStyle = paint.backColor ?? '#9e9e9e';
      context.lineWidth = 1;
      const edge = (key: 'left' | 'right' | 'top' | 'bottom'): void => {
        const border = paint.borders[key];
        if (!border || border.style === 0) return;
        context.strokeStyle = border.color ?? '#000000';
        context.lineWidth = border.style > 2 ? 2 : 1;
        context.beginPath();
        if (key === 'left') { context.moveTo(x + 0.5, y); context.lineTo(x + 0.5, y + cellHeight); }
        if (key === 'right') { context.moveTo(x + cellWidth - 0.5, y); context.lineTo(x + cellWidth - 0.5, y + cellHeight); }
        if (key === 'top') { context.moveTo(x, y + 0.5); context.lineTo(x + cellWidth, y + 0.5); }
        if (key === 'bottom') { context.moveTo(x, y + cellHeight - 0.5); context.lineTo(x + cellWidth, y + cellHeight - 0.5); }
        context.stroke();
      };
      edge('top'); edge('bottom'); edge('left'); edge('right');
    }
  }
}

/** A preview canvas that redraws whenever the theme (or selection) changes. */
export function TablePreview({ theme, selected, width, height, className }: {
  theme: PreviewTheme; selected?: string; width: number; height: number; className?: string;
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) drawTablePreview(ref.current, width, height, theme, selected);
  }, [ref, width, height, theme, selected]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

/* ----------------------------------------------------------------- dialog --- */

export interface TableStyleDraft {
  name: string;
  element: number;
  styles: Record<string, TableElementStyle>;
  sizes: Record<string, number>;
}

/** The draft `showNewTableStyle` keeps on the designer across the Format... round-trip. */
export function tableStyleDraft(designer: Designer): TableStyleDraft | undefined {
  return recordView(designer)._tableStyleDraft as TableStyleDraft | undefined;
}

interface Props { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }

export function NewTableStyleBody({ designer, data, update }: Props): React.ReactElement {
  const element = TABLE_STYLE_ELEMENTS[Math.max(0, Number(data.element ?? 0))] ?? TABLE_STYLE_ELEMENTS[0];
  const styles = (data.styles ?? {}) as Record<string, TableElementStyle>;
  const sizes = (data.sizes ?? {}) as Record<string, number>;
  const preview: PreviewTheme = { styles, sizes };
  return (
    <div className="gc-table-style-dialog">
      <div className="gc-table-style-name">
        <label className="gc-dialog-label" htmlFor="gc-table-style-name-input">{T('name2', 'Name:')}</label>
        <input id="gc-table-style-name-input" className="gc-dialog-input gc-table-style-name-input" value={String(data.name ?? '')} onChange={(event) => update('name', event.target.value)} />
      </div>
      <fieldset className="gc-table-style-elements">
        <legend>{T('tableElement', 'Table Element:')}</legend>
        <div className="gc-table-style-list" role="listbox" aria-label={T('tableElement', 'Table Element:')}>
          {TABLE_STYLE_ELEMENTS.map((item, index) => (
            <div key={item.key} role="option" aria-selected={index === Number(data.element ?? 0)}
              className={`gc-table-style-list-item${styles[item.key] ? ' styled' : ''}${index === Number(data.element ?? 0) ? ' selected' : ''}`}
              data-value={item.key}
              onClick={() => update('element', index)}>{T(uiKey(item.label), item.label) || item.label}</div>
          ))}
        </div>
        <div className="gc-table-style-buttons">
          <button type="button" className="gc-dialog-secondary gc-table-style-format" onClick={() => designer.editTableStyleElement(element.key)}>{T('format3', 'Format')}</button>
          <button type="button" className="gc-dialog-secondary gc-table-style-clear" onClick={() => designer.clearTableStyleElement(element.key)}>{T('clear', 'Clear')}</button>
        </div>
      </fieldset>
      <div className="gc-table-style-right">
        <fieldset className="gc-table-style-preview">
          <legend>{T('preview2', 'Preview')}</legend>
          <TablePreview theme={preview} selected={element.key} width={121} height={101} />
        </fieldset>
        {element.stripe && (
          <fieldset className="gc-table-style-stripe">
            <legend>{T('stripeSize', 'Stripe Size')}</legend>
            <CustomSelect className="gc-dialog-select gc-table-style-stripe-size" ariaLabel="Stripe Size"
              value={String(sizes[element.stripe] ?? 1)}
              options={[1, 2, 3, 4, 5, 6, 7].map((value) => ({ text: String(value), value }))} onChange={(next) => update(`sizes.${element.stripe}`, Number(next))} />
          </fieldset>
        )}
      </div>
    </div>
  );
}

/** The `Format Table` gallery's Custom section tiles (same painter, 61 x 46). */
export function customTableThemeTiles(designer: Designer): { name: string; theme: PreviewTheme }[] {
  const workbook = designer.getWorkbook();
  const themes = workbook.customTableThemes.all();
  return themes.map((theme) => {
    const json = recordView(theme.toJSON() ?? {});
    const styles: Record<string, TableElementStyle> = {};
    for (const element of TABLE_STYLE_ELEMENTS) {
      if (json[element.key]) styles[element.key] = tableElementStyleFromJSON(json[element.key]);
    }
    return { name: String(theme.name()), theme: { styles } };
  });
}

/** Removes every custom table style the workbook carries (the gallery's Clear). */
export function clearCustomTableThemes(designer: Designer): void {
  const manager = designer.getWorkbook().customTableThemes;
  for (const theme of [...manager.all()]) manager.remove(String(theme.name()));
}

/* ------------------------------------------- TASK 93: New Pivot Style --- */

/* The trial's "New Pivot Table Style" dialog (589 x 417, measured black-box):
 * Name input (59,49 511x24), "Pivot Table Element:" list (22,116 394x208, 25
 * rows of 24 px, scrollable), Format/Clear centred below (y324), a Preview
 * grid and a Stripe Size combo for the four stripe elements, OK/Cancel. */
export const PIVOT_STYLE_ELEMENTS: { label: string; key: string; stripe?: string }[] = [
  { label: 'Whole Table', key: 'wholeTableStyle' },
  { label: 'Report Filter Labels', key: 'reportFilterLabelsStyle' },
  { label: 'Report Filter Values', key: 'reportFilterValuesStyle' },
  { label: 'First Column stripe', key: 'firstColumnStripeStyle', stripe: 'firstColumnStripSize' },
  { label: 'Second Column Stripe', key: 'secondColumnStripeStyle' },
  { label: 'First Row Stripe', key: 'firstRowStripeStyle', stripe: 'firstRowStripSize' },
  { label: 'Second Row Stripe', key: 'secondRowStripeStyle' },
  { label: 'First Column', key: 'firstColumnStyle' },
  { label: 'Header Row', key: 'headerRowStyle' },
  { label: 'First Header Cell', key: 'firstHeaderCellStyle' },
  { label: 'Subtotal Column 1', key: 'subtotalColumn1Style' },
  { label: 'Subtotal Column 2', key: 'subtotalColumn2Style' },
  { label: 'Subtotal Column 3', key: 'subtotalColumn3Style' },
  { label: 'Blank Row', key: 'blankRowStyle' },
  { label: 'Subtotal Row 1', key: 'subtotalRow1Style' },
  { label: 'Subtotal Row 2', key: 'subtotalRow2Style' },
  { label: 'Subtotal Row 3', key: 'subtotalRow3Style' },
  { label: 'Column SubHeading 1', key: 'columnSubheading1Style' },
  { label: 'Column SubHeading 2', key: 'columnSubheading2Style' },
  { label: 'Column SubHeading 3', key: 'columnSubheading3Style' },
  { label: 'Row SubHeading 1', key: 'rowSubheading1Style' },
  { label: 'Row SubHeading 2', key: 'rowSubheading2Style' },
  { label: 'Row SubHeading 3', key: 'rowSubheading3Style' },
  { label: 'Grand Total Column', key: 'grandTotalColumnStyle' },
  { label: 'Grand Total Row', key: 'grandTotalRowStyle' },
];

/** Builds the theme through the public `PivotTableTheme`/`PivotTableStyle` API. */
export function buildPivotTheme(
  gc: unknown, name: string,
  styles: Record<string, TableElementStyle>,
  sizes: Record<string, number> = {},
): unknown {
  const cast = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
  const sheets = cast(cast(cast(gc).Spread).Sheets);
  const pivot = cast(cast(cast(gc).Spread).Pivot);
  const LineBorderCtor = sheets.LineBorder as new (color?: string, style?: number) => unknown;
  if (!pivot?.PivotTableTheme || !pivot?.PivotTableStyle || !LineBorderCtor) throw new Error('NotImplemented: GC.Spread.Pivot.PivotTableTheme');
  const theme = cast(new (pivot.PivotTableTheme as new () => unknown)());
  (theme.name as (value?: string) => unknown)(name);
  for (const element of PIVOT_STYLE_ELEMENTS) {
    const stored = styles[element.key];
    if (!stored) continue;
    const borders = BORDER_KEYS.map((key) => new LineBorderCtor(stored.borders[key].color, stored.borders[key].style));
    const style = cast(new (pivot.PivotTableStyle as new (...args: unknown[]) => unknown)(
      stored.backColor, stored.foreColor,
      `${stored.italic ? 'italic' : 'normal'} ${stored.bold ? 'bold' : 'normal'} ${stored.size} ${stored.family}`,
      ...borders,
    ));
    style.fontStyle = stored.italic ? 'italic' : 'normal';
    style.fontWeight = stored.bold ? 'bold' : 'normal';
    style.fontSize = stored.size;
    style.fontFamily = stored.family;
    (theme[element.key] as (value: unknown) => unknown)(style);
  }
  for (const [key, value] of Object.entries(sizes)) (theme[key] as (size: number) => unknown)(value);
  return theme;
}

/** True when the PIVOT element paints the preview cell (row, col) of the 5 x 6 grid. */
export function pivotPreviewCellMatches(key: string, row: number, col: number): boolean {
  const lastCol = PREVIEW_COLUMNS - 1;
  const dataRow = row - 1;
  switch (key) {
    case 'wholeTableStyle': return true;
    case 'headerRowStyle': return row === 0;
    case 'firstHeaderCellStyle': return row === 0 && col === 0;
    case 'firstColumnStyle': return col === 0;
    case 'firstRowStripeStyle': return dataRow >= 0 && dataRow < 4 && dataRow % 2 === 0;
    case 'secondRowStripeStyle': return dataRow >= 0 && dataRow < 4 && dataRow % 2 === 1;
    case 'firstColumnStripeStyle': return col > 0 && col < lastCol && (col - 1) % 2 === 0;
    case 'secondColumnStripeStyle': return col > 0 && col < lastCol && (col - 1) % 2 === 1;
    case 'grandTotalRowStyle': return row === PREVIEW_ROWS - 1;
    case 'grandTotalColumnStyle': return col === lastCol;
    default: return false;
  }
}

/** The dialog body's element style for a stored pivot theme slot. */
export function pivotElementStyle(theme: unknown, key: string): TableElementStyle | undefined {
  const source = recordView(theme as object);
  const json = recordView((typeof source.toJSON === 'function' ? (source.toJSON as () => unknown)() : theme) as object);
  const value = json[key];
  return value ? tableElementStyleFromJSON(value) : undefined;
}

interface PivotProps { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }

export function NewPivotStyleBody({ designer, data, update }: PivotProps): React.ReactElement {
  const element = PIVOT_STYLE_ELEMENTS[Math.max(0, Number(data.element ?? 0))] ?? PIVOT_STYLE_ELEMENTS[0];
  const styles = (data.styles ?? {}) as Record<string, TableElementStyle>;
  const sizes = (data.sizes ?? {}) as Record<string, number>;
  const preview: PreviewTheme = { styles, sizes, matches: pivotPreviewCellMatches };
  return (
    <div className="gc-table-style-dialog">
      <div className="gc-table-style-name">
        <label className="gc-dialog-label" htmlFor="gc-pivot-style-name-input">{T('name2', 'Name:')}</label>
        <input id="gc-pivot-style-name-input" className="gc-dialog-input gc-table-style-name-input" value={String(data.name ?? '')} onChange={(event) => update('name', event.target.value)} />
      </div>
      <fieldset className="gc-table-style-elements">
        <legend>{T('pivotTableElement', 'Pivot Table Element:')}</legend>
        <div className="gc-table-style-list" role="listbox" aria-label={T('pivotTableElement', 'Pivot Table Element:')}>
          {PIVOT_STYLE_ELEMENTS.map((item, index) => (
            <div key={item.key} role="option" aria-selected={index === Number(data.element ?? 0)}
              className={`gc-table-style-list-item${styles[item.key] ? ' styled' : ''}${index === Number(data.element ?? 0) ? ' selected' : ''}`}
              data-value={item.key}
              onClick={() => update('element', index)}>{T(uiKey(item.label), item.label) || item.label}</div>
          ))}
        </div>
        <div className="gc-table-style-buttons">
          <button type="button" className="gc-dialog-secondary gc-table-style-format" onClick={() => designer.editPivotStyleElement(element.key)}>{T('format3', 'Format')}</button>
          <button type="button" className="gc-dialog-secondary gc-table-style-clear" onClick={() => designer.clearPivotStyleElement(element.key)}>{T('clear', 'Clear')}</button>
        </div>
      </fieldset>
      <div className="gc-table-style-right">
        <fieldset className="gc-table-style-preview">
          <legend>{T('preview2', 'Preview')}</legend>
          <TablePreview theme={preview} selected={element.key} width={121} height={101} />
        </fieldset>
        {element.stripe && (
          <fieldset className="gc-table-style-stripe">
            <legend>{T('stripeSize', 'Stripe Size')}</legend>
            <CustomSelect className="gc-dialog-select gc-table-style-stripe-size" ariaLabel="Stripe Size"
              value={String(sizes[element.stripe] ?? 1)}
              options={[1, 2, 3, 4, 5, 6, 7].map((value) => ({ text: String(value), value }))} onChange={(next) => update(`sizes.${element.stripe}`, Number(next))} />
          </fieldset>
        )}
      </div>
    </div>
  );
}

/** The pivot gallery's Custom section tiles (same painter as the dialog preview). */
export function customPivotThemeTiles(designer: Designer): { name: string; theme: PreviewTheme }[] {
  const manager = recordView(designer.getWorkbook()).customPivotTableThemes as { all?: () => unknown[] };
  return (manager.all?.() ?? []).map((theme) => {
    const json = recordView((theme as { toJSON?: () => unknown }).toJSON?.() ?? {});
    const styles: Record<string, TableElementStyle> = {};
    for (const element of PIVOT_STYLE_ELEMENTS) if (json[element.key]) styles[element.key] = tableElementStyleFromJSON(json[element.key]);
    const sizes: Record<string, number> = {};
    for (const key of ['firstColumnStripSize', 'firstRowStripSize']) if (json[key] !== undefined) sizes[key] = Number(json[key]);
    return { name: String((theme as { name: () => string }).name()), theme: { styles, sizes, matches: pivotPreviewCellMatches } };
  });
}
