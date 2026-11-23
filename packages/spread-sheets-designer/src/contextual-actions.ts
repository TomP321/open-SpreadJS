/**
 * Behaviour, enablement and control state of the contextual ribbon tabs
 * (TASK 74): Table Design, Chart Design, Sparkline (cell + formula variants)
 * and the Shape Format commands the re-grouped tab adds.
 *
 * The trial drives these tabs from the current selection: `TableSelected`
 * (active cell inside a table), `CanFormatChart` (a chart is selected),
 * `SparklineSelected` (the active cell holds a sparkline) and
 * `FormulaSparklineSelected` (the active cell holds a sparkline formula).
 * The same rules decide here whether the tab exists, and every command acts on
 * the workbook through the public core API (tables, charts, sparklines, shapes).
 */
import type { DesignerApi as Designer } from './designer-api.js';
import type { CommandState } from './types.js';
import type GC from '@mescius/spread-sheets';
import { activeSheet, activeRanges } from './commands/base.js';
import { parseA1, selectedShapes, toA1 } from './commands/insert.js';
import { chartInternals, chartsOf, internals } from './core-internals.js';
import { tabSwatchColor, tabThemeBases } from './ribbon/colors.js';
import { resolveText, messageText } from './resolve.js';
import { contextualCommandNames } from './contextual-ribbon.js';

/** Queue a sheet repaint after a table/chart/sparkline model change. */
function repaint(d: Designer): void {
  internals(activeSheet(d))._view()?.schedule?.();
  d.invalidate();
}

/** Resource lookup for the trial's message-box sentences (labels live in resources). */
const text = (d: Designer, key: string, fallback: string): string =>
  resolveText(`\${res.${key}}`, d.resources) || fallback;

type Table = GC.Spread.Sheets.Tables.Table;
type Sheet = ReturnType<typeof activeSheet>;
/** Sparkline object as our core implements it (the contract lacks the option bag). */
type Spark = GC.Spread.Sheets.Sparklines.Sparkline & {
  setting(value?: GC.Spread.Sheets.Sparklines.SparklineSetting): unknown;
  options?: Record<string, string | number | boolean>;
};
type SparkGroup = GC.Spread.Sheets.Sparklines.SparklineGroup & { _members?: Spark[] };

/** Range-like view of the core `Range` the table commands read. */
type Bounds = { row: number; col: number; rowCount: number; colCount: number };

/* ------------------------------------------------------- selection rules --- */

/**
 * The ACTIVE cell — the trial's contextual triggers (`TableSelected`,
 * `SparklineSelected`, `FormulaSparklineSelected`) act on the active cell, not
 * on the selection top-left (`.probe/t74/measure9-official.json` spark-range:
 * the tab closed when the active cell landed on a sparkline-free cell while the
 * selection still covered sparkline cells).
 */
function cursor(d: Designer): { row: number; col: number } {
  const sheet = activeSheet(d);
  const row = sheet.getActiveRowIndex();
  const col = sheet.getActiveColumnIndex();
  return { row: row < 0 ? 0 : row, col: col < 0 ? 0 : col };
}

/** The table whose range contains the active cell (null when there is none). */
export function activeTable(d: Designer): Table | null {
  const sheet = activeSheet(d);
  const { row, col } = cursor(d);
  for (const table of sheet.tables.all()) {
    const range = table.range() as Bounds;
    if (range.rowCount <= 0 || range.colCount <= 0) continue;
    if (row >= range.row && row < range.row + range.rowCount && col >= range.col && col < range.col + range.colCount) return table;
  }
  return null;
}

export function hasActiveTable(d: Designer): boolean { return activeTable(d) !== null; }

/**
 * The tables the DESIGNER converted into data tables (Table Binding group).
 *
 * The trial does not derive the launcher from the core's binding flags: a table
 * bound through the public `Table.bind()` API reports `isBinding()` true,
 * `bindingPath()` 'SalesData' and a `getBindingSource()` array, yet its ribbon
 * keeps "Convert to Data Table" and shows no "Convert from Data Table"
 * (`.probe/t74/binding39.mjs` + `.probe/t74/binding38.mjs` b/c with a re-selection). Only the table the command itself converts swaps to
 * "Convert from Data Table", bound to a NAMED source with an empty binding path
 * and the combo reading "Table1" (`.probe/t74/convert42-official.json`).
 * So the state is a designer-session fact, which ours remembers per designer.
 */
const dataTables = new WeakMap<Designer, Set<string>>();
const dataTableKeyOf = (sheetName: string, tableName: string): string => JSON.stringify([sheetName, tableName]);
const dataTableKey = (d: Designer, table: Table): string => dataTableKeyOf(activeSheet(d).name(), String(table.name()));

/** True when this designer converted `table` into a data table. */
export function isDataTable(d: Designer, table: Table | null = activeTable(d)): boolean {
  if (!table) return false;
  return dataTables.get(d)?.has(dataTableKey(d, table)) ?? false;
}

/** A table whose model carries a binding (a path or a source), converted or not. */
export function isBoundTable(table: Table): boolean {
  return String(table.bindingPath?.() ?? '') !== '' || !!(table.getBindingSource?.() ?? null);
}

function markDataTable(d: Designer, table: Table, converted: boolean): void {
  const owned = dataTables.get(d) ?? new Set<string>();
  dataTables.set(d, owned);
  const key = dataTableKey(d, table);
  if (converted) owned.add(key);
  else owned.delete(key);
}

/** Charts whose selection flag is set (the trial's `CanFormatChart`). */
export function selectedCharts(d: Designer): Array<GC.Spread.Sheets.Charts.Chart> {
  return chartsOf(activeSheet(d)).all().filter((chart) => chart.isSelected?.() === true);
}

export function hasSelectedChart(d: Designer): boolean { return selectedCharts(d).length > 0; }

/** The sparkline stored on the active cell (trial's `SparklineSelected`). */
export function activeSparkline(d: Designer): Spark | null {
  const sheet = activeSheet(d);
  const { row, col } = cursor(d);
  return (sheet.getSparkline(row, col) as Spark | null) ?? null;
}

export function hasActiveSparkline(d: Designer): boolean { return activeSparkline(d) !== null; }

/**
 * The sparkline function name of the active cell's formula (trial's
 * `FormulaSparklineSelected`). A formula whose called function is a
 * `*SPARKLINE*` function (the whole built-in family — LINESPARKLINE,
 * COLUMNSPARKLINE, PIESPARKLINE, …) counts; nested calls are scanned too.
 */
export function activeFormulaSparkline(d: Designer): string | null {
  const sheet = activeSheet(d);
  const { row, col } = cursor(d);
  const formula = String(sheet.getFormula(row, col) ?? '').trim();
  if (!formula) return null;
  const names = formula.match(/([A-Z][A-Z0-9_.]*)\s*\(/gi) ?? [];
  for (const raw of names) {
    const name = raw.replace(/\s*\($/, '').toUpperCase().replace(/^[^.]*\./, '');
    if (/SPARKLINE/.test(name)) return name;
  }
  return null;
}

export function hasActiveFormulaSparkline(d: Designer): boolean { return activeFormulaSparkline(d) !== null; }

/**
 * True while a floating object (chart, shape, picture or other floating object)
 * carries the selection. The trial moves the "current selection" from the cell to
 * the object when one is selected, which is why its Table Design / Sparkline tabs
 * close while Shape Format / Chart Design are open (measured in
 * `.probe/t74/measure9-official.json`: `mix-on-chart`, `mix-on-shape`).
 */
export function hasSelectedObject(d: Designer): boolean {
  const sheet = activeSheet(d);
  if (hasSelectedChart(d)) return true;
  if (d.hasSelectedShapes()) return true;
  const pictures = (sheet as { pictures?: { all(): Array<{ isSelected?(): unknown }> } }).pictures?.all?.() ?? [];
  if (pictures.some((item) => item.isSelected?.() === true)) return true;
  const floating = (sheet as { floatingObjects?: { all(): Array<{ isSelected?(): unknown }> } }).floatingObjects?.all?.() ?? [];
  return floating.some((item) => item.isSelected?.() === true);
}

/** Every sparkline whose cell falls inside the current selection (Group/Clear act on those). */
function selectedSparklines(d: Designer): Spark[] {
  const sheet = activeSheet(d);
  const out: Spark[] = [];
  for (const range of activeRanges(sheet)) {
    for (let row = range.row; row < range.row + range.rowCount; row++) {
      for (let col = range.col; col < range.col + range.colCount; col++) {
        const spark = sheet.getSparkline(row, col) as Spark | null;
        if (spark) out.push(spark);
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- tables ---- */

/** Style-option checkbox commands ↔ the table's option flag (trial's mapping). */
const tableStyleFlags: Record<string, string> = {
  tableStyleHeaderRow: 'showHeader',
  tableStyleBandedRows: 'bandRows',
  tableStyleBandedColumns: 'bandColumns',
  tableStyleFirstColumn: 'highlightFirstColumn',
  tableStyleLastColumn: 'highlightLastColumn',
  tableStyleResizeHandler: 'showResizeHandle',
  tableStyleFilterButton: 'filterButtonVisible',
  tableStyleTotalRowList: 'useFooterDropDownList',
  tableAllowAutoExpand: 'allowAutoExpand',
};

export function tableFlag(table: Table, key: string): boolean {
  switch (key) {
    case 'showHeader': return !!table.showHeader();
    case 'bandRows': return !!table.bandRows();
    case 'bandColumns': return !!table.bandColumns();
    case 'highlightFirstColumn': return !!table.highlightFirstColumn();
    case 'highlightLastColumn': return !!table.highlightLastColumn();
    case 'showResizeHandle': return !!table.showResizeHandle();
    case 'filterButtonVisible': return !!table.filterButtonVisible();
    case 'useFooterDropDownList': return !!table.useFooterDropDownList();
    case 'allowAutoExpand': return !!table.allowAutoExpand();
    default: return false;
  }
}

/** Writes one table style flag through the public Table API. */
export function setTableFlag(table: Table, key: string, value: boolean): void {
  switch (key) {
    case 'showHeader': table.showHeader(value); break;
    case 'bandRows': table.bandRows(value); break;
    case 'bandColumns': table.bandColumns(value); break;
    case 'highlightFirstColumn': table.highlightFirstColumn(value); break;
    case 'highlightLastColumn': table.highlightLastColumn(value); break;
    case 'showResizeHandle': table.showResizeHandle(value); break;
    /* `filterButtonVisible()` doubles as the getter (no argument) in the contract. */
    case 'filterButtonVisible': table.filterButtonVisible(value); break;
    case 'useFooterDropDownList': table.useFooterDropDownList(value); break;
    case 'allowAutoExpand': table.allowAutoExpand(value); break;
    default: break;
  }
}

/** Records of the table's data area (Convert to Data Table builds the data source from them). */
function tableRecords(sheet: Sheet, table: Table): Record<string, unknown>[] {
  const header = table.headerIndex();
  const range = table.range() as Bounds;
  const names = Array.from({ length: range.colCount }, (_, index) =>
    String(header >= 0 ? sheet.getValue(header, range.col + index) ?? table.getColumnName(index) : table.getColumnName(index)));
  const out: Record<string, unknown>[] = [];
  const dataRange = table.dataRange() as Bounds;
  for (let r = 0; r < dataRange.rowCount; r++) {
    const record: Record<string, unknown> = {};
    for (let c = 0; c < range.colCount; c++) record[names[c] ?? `Column${c + 1}`] = sheet.getValue(dataRange.row + r, range.col + c);
    out.push(record);
  }
  return out;
}

/** "Resize Table" dialog: the trial prefills the table's own range and keeps its header row. */
export function showResizeTableDialog(d: Designer, table: Table): void {
  const range = table.range() as Bounds;
  const current = toA1(range, true);
  const data = { table: table.name(), range: current };
  d.showDialog('resizeTableDialogTemplate', data, (submitted) => {
    const reference = String(submitted.range ?? '').trim();
    let next: Bounds;
    try {
      next = parseA1(reference.replace(/\$/g, ''));
    } catch {
      d.showMessageBox(messageText(d, 'invalidRange', 'The range is not valid.'), messageText(d, 'resizeTable', 'Resize Table'), 3);
      return;
    }
    if (next.row !== range.row) {
      d.showMessageBox(messageText(d, 'headersSameRow', 'The headers must remain in the same row.'), messageText(d, 'resizeTable', 'Resize Table'), 3);
      return;
    }
    const overlaps = next.col < range.col + range.colCount && range.col < next.col + next.colCount;
    if (!overlaps || next.rowCount < 1 || next.colCount < 1) {
      d.showMessageBox(messageText(d, 'overlapRange', 'The resulting table range must overlap the original table range.'), messageText(d, 'resizeTable', 'Resize Table'), 3);
      return;
    }
    d.runUndoable('resizeTableRange', { data: { table: table.name(), row: next.row, col: next.col, rowCount: next.rowCount, colCount: next.colCount } });
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'resizeTable', 'Resize Table'), 3); });
}

function renameTable(d: Designer, table: Table, name: string): void {
  const trimmed = name.trim();
  const previous = String(table.name());
  if (!trimmed || trimmed === previous) return;
  const sheetName = activeSheet(d).name();
  const converted = isDataTable(d, table);
  try {
    table.name(trimmed);
  } catch {
    /* Trial message (transcribed from the running UI). */
    d.showMessageBox(text(d, 'ribbon.tableDesign.duplicateTableName', 'This name already exists. Names should be unique.'), text(d, 'ribbon.tableDesign.tableName', 'Table Name'), 1);
    return;
  }
  /* A data table keeps its converted state under the new name (the trial names the
   * binding source after the table, `.probe/t74/convert42-official.json`). */
  const owned = dataTables.get(d);
  if (converted && owned) {
    owned.delete(dataTableKeyOf(sheetName, previous));
    owned.add(dataTableKeyOf(sheetName, trimmed));
  }
  repaint(d);
}

/* --------------------------------------------------------------- charts ---- */

/**
 * The trial's ten Quick Layout presets — the ABSOLUTE chart state each layout
 * writes, read on the trial cell-by-cell through the public chart getters after
 * clicking every gallery item (`.probe/t74/measure24-official.json`; legend
 * enum 1=top 2=right 3=left 4=bottom, data-label positions 2=center 3=inside
 * base 4=inside end 6=outside end). `title:false` = the trial removes the
 * title object entirely; our core keeps an auto-title getter, so the designer
 * hides it as an empty 0pt text (see STATUS TASK 74 "known gaps").
 */
export interface ChartLayoutPatch {
  key: 'primaryCategory' | 'primaryValue';
  visible?: boolean;
  titleText?: string;
  major?: boolean;
  minor?: boolean;
}
export interface ChartLayoutPreset {
  title: boolean;
  legendVisible: boolean;
  legendPosition: number;
  labelsShow: boolean;
  labelsPosition: number;
  axes: ChartLayoutPatch[];
}
export const quickLayoutPresets: ChartLayoutPreset[] = [
  /* 1 */ { title: true, legendVisible: true, legendPosition: 2, labelsShow: false, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true }, { key: 'primaryValue', visible: true, major: true, minor: false }] },
  /* 2 */ { title: true, legendVisible: true, legendPosition: 1, labelsShow: true, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true }, { key: 'primaryValue', visible: false, major: false, minor: false }] },
  /* 3 */ { title: true, legendVisible: true, legendPosition: 4, labelsShow: false, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true }, { key: 'primaryValue', visible: true, major: true, minor: false }] },
  /* 4 */ { title: false, legendVisible: true, legendPosition: 4, labelsShow: true, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true }, { key: 'primaryValue', visible: true, major: false, minor: false }] },
  /* 5 */ { title: true, legendVisible: false, legendPosition: 2, labelsShow: true, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true }, { key: 'primaryValue', visible: true, major: true, minor: false, titleText: 'Axis Titles' }] },
  /* 6 */ { title: false, legendVisible: true, legendPosition: 2, labelsShow: false, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true, titleText: 'Axis Titles' }, { key: 'primaryValue', visible: true, major: true, minor: true, titleText: 'Axis Titles' }] },
  /* 7 */ { title: true, legendVisible: false, legendPosition: 2, labelsShow: false, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true, titleText: 'Axis Titles' }, { key: 'primaryValue', visible: true, major: false, minor: false, titleText: 'Axis Titles' }] },
  /* 8 */ { title: true, legendVisible: true, legendPosition: 2, labelsShow: false, labelsPosition: 6, axes: [{ key: 'primaryCategory', visible: true, titleText: 'Axis Titles' }, { key: 'primaryValue', visible: true, major: true, minor: false, titleText: 'Axis Titles' }] },
  /* 9 */ { title: true, legendVisible: true, legendPosition: 2, labelsShow: true, labelsPosition: 4, axes: [{ key: 'primaryCategory', visible: true, titleText: '' }, { key: 'primaryValue', visible: true, major: true, minor: false, titleText: '' }] },
  /* 10 */ { title: false, legendVisible: true, legendPosition: 2, labelsShow: false, labelsPosition: 4, axes: [{ key: 'primaryCategory', visible: true, titleText: '' }, { key: 'primaryValue', visible: true, major: true, minor: false, titleText: '' }] },
];

/** The trial's six Chart Styles — again absolute states from `.probe/t74/measure24-official.json`. */
export const chartStylePresets: { pcMajor: boolean; pvMajor: boolean; legendPosition: number; labelsShow: boolean; chartBack: string; chartInk: string }[] = [
  { pcMajor: false, pvMajor: true, legendPosition: 4, labelsShow: false, chartBack: 'background 1 0', chartInk: 'rgb(89,89,89)' },
  { pcMajor: true, pvMajor: true, legendPosition: 4, labelsShow: false, chartBack: 'background 1 0', chartInk: 'rgb(89,89,89)' },
  { pcMajor: false, pvMajor: true, legendPosition: 4, labelsShow: false, chartBack: 'rgb(93,93,93)', chartInk: 'rgb(255,255,255)' },
  { pcMajor: false, pvMajor: true, legendPosition: 1, labelsShow: false, chartBack: 'background 1 0', chartInk: 'rgb(89,89,89)' },
  { pcMajor: true, pvMajor: true, legendPosition: 4, labelsShow: false, chartBack: 'rgb(93,93,93)', chartInk: 'rgb(255,255,255)' },
  { pcMajor: true, pvMajor: false, legendPosition: 1, labelsShow: true, chartBack: 'background 1 0', chartInk: 'rgb(89,89,89)' },
];

/**
 * Change Colors palettes written in the core's own colour-token language
 * (`accent N tint`), so `chart.colorScheme()` feeds the palette straight into
 * the renderer's token resolver.
 */
const accents = [1, 2, 3, 4, 5, 6];
const ladder = (tints: number[], picks: number[]): string[] =>
  tints.flatMap((tint) => picks.map((accent) => `accent ${accent} ${tint}`));
export const chartColorPalettes: Record<string, [number, string[]]> = {
  colorfulPalette1: [0, ladder([0, -40, 20, -20, 40, -50], accents)],
  colorfulPalette2: [0, ladder([0, -40, 20, -20, 40, -50], [1, 3, 5])],
  colorfulPalette3: [0, ladder([0, -40, 20, -20, 40, -50], [2, 4, 6])],
  colorfulPalette4: [0, ladder([0, -40, 20, -20, 40, -50], [6, 5, 4])],
  monochromaticPalette1: [1, ['accent 1']],
  monochromaticPalette2: [1, ['accent 2']],
  monochromaticPalette3: [1, ['accent 3']],
  monochromaticPalette4: [1, ['accent 4']],
  monochromaticPalette5: [1, ['accent 5']],
  monochromaticPalette6: [1, ['accent 6']],
  monochromaticPalette7: [0, ['text 1 11', 'text 1 44', 'text 1 25', 'text 1 1', 'text 1 70', 'text 1 40']],
  monochromaticPalette8: [3, ['accent 1']],
  monochromaticPalette9: [3, ['accent 2']],
  monochromaticPalette10: [3, ['accent 3']],
  monochromaticPalette11: [3, ['accent 4']],
  monochromaticPalette12: [3, ['accent 5']],
  monochromaticPalette13: [3, ['accent 6']],
};

/**
 * The first six swatch colors of one Change Colors palette, resolved from the
 * token language (`accent N tint`) through the theme table — the Change Colors
 * rows paint them as their color strips (ribbon menu renderer).
 */
export function paletteStripColors(d: Designer, key: string): string[] {
  const palette = chartColorPalettes[key];
  const bases = tabThemeBases(activeSheet(d) as never);
  const columns: Record<string, number> = { 'background 1': 0, 'text 1': 1, 'background 2': 2, 'text 2': 3 };
  const resolve = (token: string, tint = 0): string => {
    const tinted = /^(background 1|text 1|background 2|text 2|accent \d)\s+(-?\d+)$/.exec(token);
    if (tinted) {
      const accent = /^accent (\d)$/.exec(tinted[1]);
      const column = accent ? 4 + Number(accent[1]) - 1 : columns[tinted[1]] ?? 1;
      return tabSwatchColor(bases, column, Number(tinted[2]) + tint);
    }
    const accent = /^accent (\d)$/.exec(token);
    const column = accent ? 4 + Number(accent[1]) - 1 : token in columns ? columns[token] : 1;
    return tabSwatchColor(bases, column, tint);
  };
  const tokens = palette?.[1] ?? [];
  const out = tokens.slice(0, 6).map((token) => resolve(token));
  // Single-token palettes are monochrome GRADIENTS: the trial row paints six
  // bands of the same accent from tinted to shaded (tips "…gradient, dark to light").
  if (tokens.length === 1 && out.length) {
    const ladder = [-50, -25, 0, 20, 40, 60];
    return ladder.map((tint) => resolve(tokens[0], tint));
  }
  return out;
}

function eachSelectedChart(d: Designer, run: (chart: GC.Spread.Sheets.Charts.Chart) => void): void {
  for (const chart of selectedCharts(d)) {
    run(chart);
    internals(activeSheet(d))._view()?.schedule?.();
  }
  repaint(d);
}

/** `axes` element patch helper: the trial's four axis toggles plus the titles. */
function patchChartAxes(chart: GC.Spread.Sheets.Charts.Chart, patch: Record<string, unknown>): void {
  const current = (chart.axes() as Record<string, unknown> | undefined) ?? {};
  chart.axes({ ...current, ...patch } as GC.Spread.Sheets.Charts.IAxes);
}

/**
 * The trial's axis menu ids map onto the contract's `IAxes` members: the
 * horizontal axis is the category axis, the vertical one is the value axis.
 */
function axisKeyOf(name: string): 'primaryCategory' | 'primaryValue' | 'secondaryCategory' | 'secondaryValue' {
  const secondary = name.includes('Secondary');
  const horizontal = name.includes('Horizontal');
  if (secondary) return horizontal ? 'secondaryCategory' : 'secondaryValue';
  return horizontal ? 'primaryCategory' : 'primaryValue';
}

function axisOf(chart: GC.Spread.Sheets.Charts.Chart, key: string): Record<string, unknown> {
  const axes = (chart.axes() as Record<string, unknown> | undefined) ?? {};
  return (axes[key] as Record<string, unknown> | undefined) ?? {};
}

function patchChartAxis(chart: GC.Spread.Sheets.Charts.Chart, key: string, patch: Record<string, unknown>): void {
  patchChartAxes(chart, { [key]: { ...axisOf(chart, key), ...patch } });
}

/**
 * Caption the trial writes when an axis-title row turns a title on
 * (`.probe/t74/measure24-official.json`: every activated axis title reports the
 * literal text `"Axis Titles"`).
 */
function axisTitleText(name: string): string { void name; return 'Axis Titles'; }

/**
 * Grid-line rows are named for the direction of the LINES they draw, not the
 * axis object they live on: horizontal lines belong to the value axis, vertical
 * ones to the category axis (measured: `gridLinesPrimaryMajorHorizontal`
 * toggles `primaryValue.majorGridLine`, `…MajorVertical` the category axis).
 */
function gridAxisKeyOf(name: string): 'primaryCategory' | 'primaryValue' | 'secondaryCategory' | 'secondaryValue' {
  const secondary = name.includes('Secondary');
  const horizontal = name.includes('Horizontal');
  if (secondary) return horizontal ? 'secondaryValue' : 'secondaryCategory';
  return horizontal ? 'primaryValue' : 'primaryCategory';
}

/* ------------------------------------------------- sparkline weight combo --- */

/**
 * The core stores `lineWeight` in PIXELS; the trial's combo shows points
 * (px × 0.75) with mixed-fraction glyphs and a Custom Weight dialog that takes
 * pt (measured on the trial through the public API: a fresh setting reports
 * lineWeight 1 and the combo shows "¾ pt"; picking "1 pt" writes 4/3 px —
 * `.probe/t74/combo28-official.json` and the 5188 probe of Nov 20).
 */
export const sparklineWeightItems: { value: string; text: string; iconClass: string }[] = [
  { value: 'sparline-weight-1/4', text: '¼ pt', iconClass: 'ribbon-control-dropdown-sparkline-dot25' },
  { value: 'sparline-weight-1/2', text: '½ pt', iconClass: 'ribbon-control-dropdown-sparkline-dot25' },
  { value: 'sparline-weight-3/4', text: '¾ pt', iconClass: 'ribbon-control-dropdown-sparkline-dot25' },
  { value: 'sparline-weight-1', text: '1 pt', iconClass: 'ribbon-control-dropdown-sparkline-dot1' },
  { value: 'sparline-weight-1-1/2', text: '1½ pt', iconClass: 'ribbon-control-dropdown-sparkline-dot1' },
  { value: 'sparline-weight-2-1/4', text: '2¼ pt', iconClass: 'ribbon-control-dropdown-sparkline-dot225' },
  { value: 'sparline-weight-3', text: '3 pt', iconClass: 'ribbon-control-dropdown-sparkline-dot3' },
  { value: 'sparline-weight-4-1/2', text: '4½ pt', iconClass: 'ribbon-control-dropdown-sparkline-dot45' },
  { value: 'sparline-weight-6', text: '6 pt', iconClass: 'ribbon-control-dropdown-sparkline-dot6' },
  { value: 'sparline-weight-custom', text: 'Custom Weight...', iconClass: 'ribbon-control-dropdown-sparkline-weight-custom' },
];

/** POINTS → the combo's display text (¼ glyphs for quarter values). */
export function weightDisplayText(points: number): string {
  const quarters = points * 4;
  if (Number.isFinite(quarters) && quarters > 0 && Math.abs(quarters - Math.round(quarters)) < 1e-9) {
    const q = Math.round(quarters);
    const whole = Math.floor(q / 4);
    const glyph = ['', '¼', '½', '¾'][q % 4];
    if (!whole) return `${glyph} pt`;
    return glyph ? `${whole}${glyph} pt` : `${whole} pt`;
  }
  return `${Number(points.toFixed(2))} pt`;
}

/** POINTS from a combo/dialog value; null when unparseable, 'custom' for the dialog row. */
export function weightPoints(value: unknown): number | 'custom' | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw === 'sparline-weight-custom' || /^custom$/i.test(raw)) return 'custom';
  const preset = /^sparline-weight-(.+)$/.exec(raw);
  if (preset) return parsePoints(preset[1]);
  return parsePoints(raw.replace(/pts?\.?$/i, '').trim());
}

function parsePoints(text: string): number | null {
  // Trial values: "2-1/4" means the mixed number 2¼ (the dash is a separator).
  const mixed = /^(\d+)[-–](\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(text);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const number = Number.parseFloat(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** px → pt for display; pt → px for writing. */
const pointsOf = (px: number): number => px * 0.75;
const pixelsOf = (pt: number): number => (pt * 4) / 3;

/**
 * The combo's "Custom Weight..." row (trial labels transcribed from the running
 * UI; the input is prefilled with the current POINTS value, measured `0.75`).
 */
function showSparklineWeightDialog(d: Designer, currentPoints: number): void {
  d.showDialog('sparklineWeightDialogTemplate', { weight: String(Number(currentPoints.toFixed(2))) }, (submitted) => {
    const points = weightPoints(submitted.weight);
    if (points === null || points === 'custom') return;
    for (const spark of selectedSparklines(d)) updateSparkSetting(spark, { lineWeight: pixelsOf(points) });
    repaint(d);
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'sparklineWeight', 'Sparkline Weight'), 3); });
}

/* ------------------------------------------------------------ execution --- */

const sparklineShowFlags: Record<string, string> = {
  showHighpoint: 'showHigh',
  showLowPoint: 'showLow',
  showNegativePoint: 'showNegative',
  showFirstPoint: 'showFirst',
  showLastPoint: 'showLast',
  showMarkers: 'showMarkers',
};

const sparklineTypeCommands: Record<string, number> = {
  lineSparkline: 0,
  columnSparkline: 1,
  winLossSparkline: 2,
};

/** Applies a setting change and hands the setting back so the core repaints. */
function updateSparkSetting(spark: Spark, patch: Record<string, string | number | boolean>): void {
  const setting = spark.setting() as GC.Spread.Sheets.Sparklines.SparklineSetting;
  setting.options = { ...(setting.options ?? {}), ...patch };
  spark.setting(setting);
}

export function isContextualCommand(name: string): boolean {
  return contextualCommandNames.has(name);
}

/** Runs one contextual-tab command; false when the name belongs elsewhere. */
export function executeContextualCommand(d: Designer, name: string, value?: unknown): boolean {
  if (!isContextualCommand(name)) return false;
  const sheet = activeSheet(d);

  /* Shape Format tab aliases (TASK 74): the trial's split-button ids run the same
   * shape operations our task-8 commands implement (see designer-shapes.ts). */
  if (/^(insertShapeList|shapeRightRotate90|shapeLeftRotate|shapeCommandGroup|shapeCommandAlign|shapeAlign(Left|Center|Right|Top|Middle|Bottom)|shapeHorizontalDistribute|shapeShapeVerticalDistribute|shapeSnapTo(Grid|Shape)|shapeSize(Height|Width)|bringShapeForwardGroup|sendShapeBackwardGroup)$/.test(name)) {
    d.executeShapeCommand(name, value);
    return true;
  }

  /* ---- Table Design ---- */
  if (name === 'tableName') {
    const table = activeTable(d);
    if (table) renameTable(d, table, String(value ?? ''));
    return true;
  }
  if (name === 'resizeTable') {
    const table = activeTable(d);
    if (table) showResizeTableDialog(d, table);
    return true;
  }
  if (name === 'convertToRange') {
    const table = activeTable(d);
    if (table) d.showConvertTableDialog(String(table.name()));
    return true;
  }
  if (name in tableStyleFlags) {
    const table = activeTable(d);
    /* Undoable: the trial's Ctrl+Z restores a table style option. */
    if (table) d.runUndoable('applyTableFlag', { table: table.name(), flag: tableStyleFlags[name], value: !tableFlag(table, tableStyleFlags[name]) });
    return true;
  }
  if (name === 'tableStyleTotalRow') {
    const table = activeTable(d);
    if (table) d.runUndoable('toggleTableTotalsRow', { table: table.name() });
    return true;
  }
  if (name === 'tableBindingSource') {
    const table = activeTable(d);
    if (table) {
      table.bindingPath(String(value ?? '').trim());
      repaint(d);
    }
    return true;
  }
  if (name === 'ConvertToDataTable') {
    const table = activeTable(d);
    if (!table) return true;
    /* A table the APPLICATION bound through `Table.bind()` is not convertible: the
     * trial answers with an error box reading "Can't convert a binding table"
     * (`.probe/t74/convert42-official.json`). Only a regular table asks. */
    if (isBoundTable(table)) {
      d.showMessageBox(text(d, 'ribbon.tableDesign.convertBindingTableError', "Can't convert a binding table"), 'SpreadJS Designer', 3, undefined, undefined, 1);
      return true;
    }
    d.showMessageBox(text(d, 'ribbon.tableDesign.convertToDataTableConfirm', 'Do you want to convert the regular table to a data table?'), 'SpreadJS Designer', 2, (result) => {
      if (result !== 1) return;
      const records = tableRecords(sheet, table);
      /* `columns` is our core's public table member (the contract types the getter
       * only through `getColumnName`), so the rebind passes it through a view.
       * The path stays empty and the records are the source itself — the trial's
       * converted table reads back `bindingPath()` '' with a named binding source
       * (`.probe/t74/convert42-official.json`), and our core resolves a source-less bind the same way
       * its own workbook loader does. */
      const columns = (table as { columns?: never[] }).columns ?? [];
      table.bind(columns, undefined, records);
      markDataTable(d, table, true);
      repaint(d);
    }, undefined, 1 /* MessageBoxButtons.okCancel: the trial's box has OK and Cancel */);
    return true;
  }
  if (name === 'ConvertFromDataTable') {
    const table = activeTable(d);
    if (!table) return true;
    d.showMessageBox(text(d, 'ribbon.tableDesign.convertFromDataTableConfirm', 'Do you want to convert the data table to a regular table?'), 'SpreadJS Designer', 2, (result) => {
      if (result !== 1) return;
      const tableExtra = table as { dataSource?: unknown };
      tableExtra.dataSource = null;
      table.bindingPath('');
      markDataTable(d, table, false);
      repaint(d);
    }, undefined, 1 /* MessageBoxButtons.okCancel: the trial's box has OK and Cancel */);
    return true;
  }

  /* ---- Chart Design ---- */
  if (name === 'switchRowColumn') {
    eachSelectedChart(d, (chart) => chart.switchDataOrientation());
    return true;
  }
  if (name === 'selectData') { d.showChartCommandDialog('selectData'); return true; }
  if (name === 'changeChartType') { d.showChartCommandDialog('changeChartType'); return true; }
  if (name === 'moveChart') { d.showChartCommandDialog('moveChart'); return true; }
  if (name === 'chartAltText') { d.showChartAltTextDialog(); return true; }
  if (name === 'FormatPane') {
    const charts = selectedCharts(d);
    if (charts.length) { d.showFormatChartAreaDialog(charts[0]); return true; }
    d.executeShapeCommand('shapeFormatPane');
    return true;
  }
  if (name === 'quickLayout' || name === 'quickLayoutListContent') {
    const raw = Number(typeof value === 'object' ? (value as { layout?: unknown })?.layout : value);
    const index = Number.isFinite(raw) && raw >= 1 && raw <= 10 ? raw : 1;
    const preset = quickLayoutPresets[index - 1];
    eachSelectedChart(d, (chart) => applyQuickLayout(chart, preset));
    return true;
  }
  if (name === 'changeColors') {
    const palette = chartColorPalettes[String(value ?? 'colorfulPalette1')] ?? chartColorPalettes.colorfulPalette1;
    eachSelectedChart(d, (chart) => chart.colorScheme(palette));
    return true;
  }
  if (name === 'chartStyle') {
    const raw = Number(value ?? 1);
    const index = Number.isFinite(raw) && raw >= 1 && raw <= 6 ? raw : 1;
    eachSelectedChart(d, (chart) => applyChartStyle(chart, chartStylePresets[index - 1]));
    return true;
  }
  if (name === 'addChartElement' || name === 'axes' || name === 'axisTitles' || name === 'chartTitle' || name === 'gridLines' || name === 'dataLabels' || name === 'legend' || name === 'errorBars' || name === 'trendline') {
    /* The launcher rows only open their flyout (the trial does the same). */
    return true;
  }
  if (name.startsWith('axes') || name.startsWith('axisTitles') || name.startsWith('gridLines')) {
    const isTitle = name.startsWith('axisTitles');
    const isGrid = name.startsWith('gridLines');
    eachSelectedChart(d, (chart) => {
      if (/More/.test(name)) { d.showFormatChartAreaDialog(chart); return; }
      const axis = isGrid ? gridAxisKeyOf(name) : axisKeyOf(name);
      if (isTitle) {
        const value = axisOf(chart, axis);
        const title = (value.title as { text?: string } | undefined) ?? {};
        patchChartAxis(chart, axis, { title: { ...title, text: title.text ? '' : axisTitleText(name) } });
        return;
      }
      if (isGrid) {
        /* The trial's gridline rows name the lines, not the axis object (see gridAxisKeyOf). */
        const key = name.includes('Minor') ? 'minorGridLine' : 'majorGridLine';
        const line = (axisOf(chart, axis)[key] as { visible?: boolean } | undefined) ?? {};
        patchChartAxis(chart, axis, { [key]: { ...line, visible: line.visible !== true } });
        return;
      }
      /* Element rows are CHECKABLE menu items: the row applies the OPPOSITE of
       * the current model state (trial: a fresh chart has the vertical axis and
       * its major horizontal gridlines ON, so clicking either row removes them —
       * `.probe/t74/measure24-official.json` flyout section). */
      patchChartAxis(chart, axis, { visible: axisOf(chart, axis).visible !== true });
    });
    return true;
  }
  if (name === 'chartTitleNone' || name === 'chartTitleAboveChart') {
    eachSelectedChart(d, (chart) => {
      const current = (chart.title() as { text?: string; fontSize?: number } | undefined) ?? {};
      /* The trial removes the title object entirely; our core keeps an auto-title
       * getter, so "none" is written as an empty 0pt title (invisible, STATUS note). */
      chart.title({ ...current, text: name === 'chartTitleAboveChart' ? current.text || 'Chart Title' : '', fontSize: name === 'chartTitleAboveChart' ? current.fontSize || 18.67 : 0 });
    });
    return true;
  }
  if (name === 'chartTitleMoreChartTitleOption') {
    const charts = selectedCharts(d);
    if (charts.length) d.showFormatChartAreaDialog(charts[0]);
    return true;
  }
  if (name.startsWith('dataLabel')) {
    if (/More/.test(name)) {
      const charts = selectedCharts(d);
      if (charts.length) d.showFormatChartAreaDialog(charts[0]);
      return true;
    }
    /* Data-label positions per the contract's DataLabelPosition enum, read from
     * the trial after each row click (measure24-official: center=2 insideBase=3
     * insideEnd=4 outsideEnd=6; "None" only clears the SHOW flag — it keeps the
     * labels' current position, and a fresh chart reads the type default 6). */
    const positions: Record<string, number> = { dataLabelsCenter: 2, dataLabelsInsideBase: 3, dataLabelsInsideEnd: 4, dataLabelsOutsideEnd: 6, dataLabelShow: 6 };
    eachSelectedChart(d, (chart) => {
      const current = (chart.dataLabels() as Record<string, unknown> | undefined) ?? {};
      const showValue = name !== 'dataLabelsNone';
      writeDataLabels(chart, showValue, Number(positions[name] ?? current.position ?? 6), current);
    });
    return true;
  }
  if (name.startsWith('legend')) {
    if (/More/.test(name)) {
      const charts = selectedCharts(d);
      if (charts.length) d.showFormatChartAreaDialog(charts[0]);
      return true;
    }
    /* The trial writes (measure24): None -> {visible:false, position:2}, then the position rows. */
    const positions: Record<string, number> = { legendNone: 2, legendRight: 2, legendTop: 1, legendLeft: 3, legendBottom: 4 };
    eachSelectedChart(d, (chart) => {
      const current = (chart.legend() as Record<string, unknown> | undefined) ?? {};
      const position = positions[name] ?? 4;
      chart.legend({ ...current, visible: name !== 'legendNone', position });
    });
    return true;
  }
  if (name.startsWith('trendline') || name.startsWith('errorBar')) {
    /* Our core's chart model carries `trendlines`/`errorBars` per series but has
     * no painter for them, and no add-in ships them: the trial's plugin feature. */
    d.notImplementedPlugin(name.startsWith('trendline') ? 'Trendline' : 'Error Bars');
    return true;
  }

  /* ---- Sparkline ---- */
  if (name in sparklineTypeCommands) {
    for (const spark of selectedSparklines(d)) spark.sparklineType(sparklineTypeCommands[name]);
    repaint(d);
    return true;
  }
  if (name in sparklineShowFlags) {
    for (const spark of selectedSparklines(d)) {
      const setting = spark.setting() as GC.Spread.Sheets.Sparklines.SparklineSetting;
      const key = sparklineShowFlags[name];
      updateSparkSetting(spark, { [key]: !(setting.options as Record<string, unknown>)?.[key] });
    }
    repaint(d);
    return true;
  }
  if (name === 'sparklineColor' || name === 'sparklineMarkerColor') {
    const key = name === 'sparklineColor' ? 'seriesColor' : 'markersColor';
    /* The ribbon color-picker popup (ColorMenu) hands the picked colour to the
     * command as its value, exactly like Font/Background Color on Home. */
    const color = typeof value === 'string' ? value : '';
    for (const spark of selectedSparklines(d)) updateSparkSetting(spark, { [key]: color });
    repaint(d);
    return true;
  }
  if (name === 'sparklineWeight') {
    const points = weightPoints(value);
    if (points === 'custom') {
      const spark = activeSparkline(d) ?? selectedSparklines(d)[0];
      showSparklineWeightDialog(d, pointsOf(Number((spark?.setting() as GC.Spread.Sheets.Sparklines.SparklineSetting | undefined)?.options?.lineWeight ?? 1)));
      return true;
    }
    if (points === null) return true;
    const weight = pixelsOf(points);
    for (const spark of selectedSparklines(d)) updateSparkSetting(spark, { lineWeight: weight });
    repaint(d);
    return true;
  }
  if (name === 'sparklineGroup') {
    const sparks = selectedSparklines(d);
    if (sparks.length > 1) sheet.groupSparkline(sparks as never);
    repaint(d);
    return true;
  }
  if (name === 'sparklineUnGroup') {
    const spark = activeSparkline(d) ?? selectedSparklines(d)[0];
    const group = spark ? (spark.group() as SparkGroup) : null;
    if (group) sheet.ungroupSparkline(group as never);
    repaint(d);
    return true;
  }
  if (name === 'clearSparkline' || name === 'clearSelectedSparkline') {
    for (const spark of selectedSparklines(d)) sheet.removeSparkline(spark.row, spark.column);
    repaint(d);
    return true;
  }
  if (name === 'clearSelectedSparklineGroups') {
    const groups = new Set(selectedSparklines(d).map((spark) => spark.group() as SparkGroup));
    for (const group of groups) for (const spark of [...(group?._members ?? [])]) sheet.removeSparkline(spark.row, spark.column);
    repaint(d);
    return true;
  }
  if (name === 'formulaSparklineSetting') {
    const function_name = activeFormulaSparkline(d) ?? 'LINESPARKLINE';
    d.showSparklineDialog(function_name);
    return true;
  }

  return true;
}

/**
 * The chartSpace title node as the designer's title rows wrote it. A fresh chart
 * carries no `title` node (the core getter synthesizes the auto "Chart Title");
 * `chartTitleNone` leaves a node whose text is empty and sized 0 — that is the
 * state the ribbon reports as "title removed" (trial removes the node itself;
 * see STATUS TASK 74 "known gaps").
 */
export function chartTitleRemoved(chart: GC.Spread.Sheets.Charts.Chart): boolean {
  interface TextBlock { t?: unknown; rPr?: { sz?: number } }
  interface TextBody { p?: { elements?: TextBlock[]; pPr?: { defRPr?: { sz?: number } } }[] }
  const space = chartInternals(chart)?._space as { chart?: { title?: { tx?: { rich?: TextBody }; txPr?: TextBody } } } | undefined;
  const title = space?.chart?.title;
  if (!title) return false;
  const body = title.tx?.rich ?? title.txPr;
  const first = body?.p?.[0];
  const text = String(first?.elements?.[0]?.t ?? '').trim();
  const size = Number(first?.elements?.[0]?.rPr?.sz ?? first?.pPr?.defRPr?.sz ?? 18.67);
  return text === '' && size === 0;
}

/** Writes one Quick Layout as the absolute chart state the trial applies. */
function applyQuickLayout(chart: GC.Spread.Sheets.Charts.Chart, preset: ChartLayoutPreset): void {
  const title = (chart.title() as Record<string, unknown> | undefined) ?? {};
  chart.title({ ...title, text: preset.title ? String(title.text || 'Chart Title') : '', fontSize: preset.title ? Number(title.fontSize || 18.67) : 0 });
  const legend = (chart.legend() as Record<string, unknown> | undefined) ?? {};
  chart.legend({ ...legend, visible: preset.legendVisible, position: preset.legendPosition });
  const labels = (chart.dataLabels() as Record<string, unknown> | undefined) ?? {};
  writeDataLabels(chart, preset.labelsShow, preset.labelsPosition, labels);
  const axes = { ...((chart.axes() as Record<string, unknown> | undefined) ?? {}) };
  for (const patch of preset.axes) {
    const axis = { ...((axes[patch.key] as Record<string, unknown> | undefined) ?? {}) };
    if (patch.visible !== undefined) axis.visible = patch.visible;
    if (patch.major !== undefined) axis.majorGridLine = { ...((axis.majorGridLine as Record<string, unknown> | undefined) ?? {}), visible: patch.major };
    if (patch.minor !== undefined) axis.minorGridLine = { ...((axis.minorGridLine as Record<string, unknown> | undefined) ?? {}), visible: patch.minor };
    if (patch.titleText !== undefined) axis.title = { ...((axis.title as Record<string, unknown> | undefined) ?? {}), text: patch.titleText };
    axes[patch.key] = axis;
  }
  chart.axes(axes as GC.Spread.Sheets.Charts.IAxes);
}

/** Writes one Chart Style; the grid-line and color choices are the trial's own
 *  (`chartArea().backColor` values read through the public API, measure24-official). */
function applyChartStyle(chart: GC.Spread.Sheets.Charts.Chart, preset: { pcMajor: boolean; pvMajor: boolean; legendPosition: number; labelsShow: boolean; chartBack: string; chartInk: string }): void {
  /* The trial reports the default fill as the getter token `background 1 0`; the
   * core round-trips that read state only when the fill is cleared (`.probe/t74/core31.mjs`),
   * so the no-fill presets write 'transparent'. */
  const back = preset.chartBack === 'background 1 0' ? 'transparent' : preset.chartBack;
  const area = (chart.chartArea() as Record<string, unknown> | undefined) ?? {};
  chart.chartArea({ ...area, backColor: back, color: preset.chartInk });
  const legend = (chart.legend() as Record<string, unknown> | undefined) ?? {};
  chart.legend({ ...legend, visible: true, position: preset.legendPosition });
  const labels = (chart.dataLabels() as Record<string, unknown> | undefined) ?? {};
  writeDataLabels(chart, preset.labelsShow, 6, labels);
  const axes = { ...((chart.axes() as Record<string, unknown> | undefined) ?? {}) };
  for (const [key, major] of [['primaryCategory', preset.pcMajor], ['primaryValue', preset.pvMajor]] as const) {
    const axis = { ...((axes[key] as Record<string, unknown> | undefined) ?? {}) };
    axis.majorGridLine = { ...((axis.majorGridLine as Record<string, unknown> | undefined) ?? {}), visible: major };
    axes[key] = axis;
  }
  chart.axes(axes as GC.Spread.Sheets.Charts.IAxes);
}

/* ------------------------------------------------------ color pickers ----- */

/** Set by `sparklineColorMenu` (the ribbon popup) before the command runs. */
export const sparkColorPicks = new Map<string, string>();

/**
 * Write the chart's data labels as an ABSOLUTE state. The chart-level `dataLabels()`
 * setter keeps flags a series already set (trial merge quirk, core `dlabels.ts`
 * `overwrite`), so "labels off" first clears the series `dLbls` nodes — the next
 * write then recreates the entry the trial reads back for `dataLabelsNone`
 * (`{showValue:false, position:6}`, measure24-official flyout).
 */
function writeDataLabels(chart: GC.Spread.Sheets.Charts.Chart, showValue: boolean, position: number, current?: Record<string, unknown>): void {
  if (!showValue) {
    const space = chartInternals(chart)?._space as { chart?: { plotArea?: { chartGroups?: { ser?: { dLbls?: unknown }[] }[] } } } | undefined;
    for (const group of space?.chart?.plotArea?.chartGroups ?? []) for (const ser of group.ser ?? []) delete ser.dLbls;
  }
  chart.dataLabels({ ...(current ?? chart.dataLabels() ?? {}), showValue, position });
}

/* ------------------------------------------------- state / enablement ----- */

/** Enablement of the contextual commands (undefined = not a contextual command). */
export function contextualCommandEnabled(d: Designer, name: string): boolean | undefined {
  if (!isContextualCommand(name)) return undefined;
  if (name === 'formulaSparklineSetting') return hasActiveFormulaSparkline(d);
  if (name === 'FormatPane') return hasSelectedChart(d) || hasActiveTable(d) || d.hasSelectedShapes();
  if (/^(tableName|resizeTable|convertToRange|tableBindingSource|tableStyle|tableAllow)/.test(name)) return hasActiveTable(d);
  if (name === 'ConvertToDataTable') return hasActiveTable(d);
  if (name === 'ConvertFromDataTable') return hasActiveTable(d);
  if (/^(quickLayout|changeColors|chartStyle|switchRowColumn|selectData|changeChartType|moveChart|chartAltText|addChartElement|axes|axisTitles|chartTitle|gridLines|dataLabel|legend|trendline|errorBar)/.test(name)) return hasSelectedChart(d);
  if (/^(sparklineGroup|sparklineUnGroup|clearSparkline|clearSelected)/.test(name)) {
    const sparks = selectedSparklines(d);
    if (name === 'sparklineGroup') return sparks.length > 1;
    if (name === 'sparklineUnGroup') return sparks.some((spark) => ((spark.group() as SparkGroup)?.count?.() ?? 1) > 1);
    return sparks.length > 0;
  }
  if (/^(lineSparkline|columnSparkline|winLossSparkline|show|sparklineColor|sparklineMarkerColor|sparklineWeight)/.test(name)) return hasActiveSparkline(d);
  if (/^shape/.test(name) || /^bringShape/.test(name) || /^sendShape/.test(name)) return d.hasSelectedShapes();
  return true;
}

/** Checked/value/visibility state of the contextual ribbon controls. */
export function contextualCommandState(d: Designer, name: string): CommandState | undefined {
  const enabled = contextualCommandEnabled(d, name);
  if (enabled === undefined) return undefined;
  const state: CommandState = {};
  if (name === 'FormatPane') state.enabled = hasSelectedChart(d) || d.hasSelectedShapes();
  if (/^(tableName|resizeTable|convertToRange|tableBindingSource|tableStyle|tableAllow)/.test(name) || name === 'ConvertToDataTable' || name === 'ConvertFromDataTable') {
    const table = activeTable(d);
    state.enabled = !!table;
    if (!table) return state;
    if (name === 'tableName') state.value = String(table.name());
    if (name === 'tableBindingSource') {
      /* The combo names the binding SOURCE the designer created: the trial reads
       * "Table1" for its own converted table (`bindingPath()` stays empty there,
       * `.probe/t74/convert42-official.json`) and shows nothing for a table the app
       * bound through `Table.bind()` (`.probe/t74/binding40-official.json`). */
      state.value = isDataTable(d, table) ? String(table.name()) : '';
      /* The trial shows one launcher at a time: Convert to Data Table for a
       * regular table, Convert from Data Table once the designer converted it. */
    }
    if (name === 'ConvertToDataTable') state.visible = !isDataTable(d, table);
    if (name === 'ConvertFromDataTable') state.visible = isDataTable(d, table);
    if (name in tableStyleFlags) state.checked = tableFlag(table, tableStyleFlags[name]);
    if (name === 'tableStyleTotalRow') state.checked = !!table.showFooter();
  }
  if (/^(quickLayout|changeColors|chartStyle|switchRowColumn|selectData|changeChartType|moveChart|chartAltText|addChartElement|axes|axisTitles|chartTitle|gridLines|dataLabel|legend|trendline|errorBar)/.test(name)) {
    state.enabled = hasSelectedChart(d);
    const chart = selectedCharts(d)[0];
    if (!chart) return state;
    if (name === 'chartTitleNone') state.checked = chartTitleRemoved(chart);
    if (name === 'chartTitleAboveChart') state.checked = !chartTitleRemoved(chart);
    if (name === 'legendNone') state.checked = !(chart.legend() as { visible?: boolean } | undefined)?.visible;
    if (name.startsWith('legend')) state.checked = name === 'legendNone' ? !(chart.legend() as { visible?: boolean } | undefined)?.visible : !!(chart.legend() as { visible?: boolean } | undefined)?.visible;
    if (name.startsWith('dataLabel')) state.checked = name === 'dataLabelsNone' ? !(chart.dataLabels() as { showValue?: boolean } | undefined)?.showValue : !!(chart.dataLabels() as { showValue?: boolean } | undefined)?.showValue;
    if (name === 'gridLinesPrimaryMajorHorizontal') state.checked = !!((chart.plotArea() as { majorGridlines?: { visible?: boolean } } | undefined)?.majorGridlines?.visible);
  }
  if (name in sparklineShowFlags || name === 'sparklineWeight' || name === 'sparklineColor' || name === 'sparklineMarkerColor') {
    const spark = activeSparkline(d) ?? selectedSparklines(d)[0];
    state.enabled = !!spark;
    if (!spark) return state;
    const options = ((spark.setting() as GC.Spread.Sheets.Sparklines.SparklineSetting)?.options ?? {}) as Record<string, unknown>;
    if (name in sparklineShowFlags) state.checked = !!options[sparklineShowFlags[name]];
    if (name === 'sparklineWeight') state.value = weightDisplayText(pointsOf(Number(options.lineWeight ?? 1)));
    if (name === 'sparklineColor') state.color = String(options.seriesColor ?? '#244062');
    if (name === 'sparklineMarkerColor') state.color = String(options.markersColor ?? '#95b3d7');
  }
  if (name === 'lineSparkline' || name === 'columnSparkline' || name === 'winLossSparkline') {
    const spark = activeSparkline(d);
    state.enabled = !!spark;
    state.checked = !!spark && Number(spark.sparklineType()) === sparklineTypeCommands[name];
  }
  if (name === 'shapeSizeHeight' || name === 'shapeSizeWidth') {
    const shape = selectedShapes(d)[0];
    state.enabled = !!shape;
    if (shape) state.value = Math.round(Number(name === 'shapeSizeHeight' ? shape.height() : shape.width()));
  }
  return state;
}


