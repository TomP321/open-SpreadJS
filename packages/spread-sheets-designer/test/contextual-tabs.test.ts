/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 74 — the selection-driven contextual tabs (Table Design / Chart Design /
 * Sparkline ×2 / Shape Format).
 *
 * Every expectation below comes from the reference product's public contract
 * (`DefaultConfig` structure read through `Designer.getConfig()`, the command
 * getters through `Designer.getCommand()`) or from black-box model reads on the
 * running trial (`.probe/t74/measure*-official.json`, the 5188 page probes).
 * The paired Playwright spec apps/designer-compare/test/contextual.spec.ts
 * re-measures the same rules against both products in the browser.
 */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import {
  activeFormulaSparkline, hasActiveFormulaSparkline, hasActiveSparkline, hasActiveTable,
  hasSelectedChart, hasSelectedObject, weightDisplayText, weightPoints, isDataTable,
  executeContextualCommand, contextualCommandEnabled, contextualCommandState,
  quickLayoutPresets, chartStylePresets, paletteStripColors, chartTitleRemoved,
} from '../src/contextual-actions.js';
import { contextualTabs, contextualTabsWithoutActivation, chartDesignGroups, tableDesignGroups, sparklineGroups, formulaSparklineGroups, shapeDesignGroups } from '../src/contextual-ribbon.js';
import { chartStyleTooltips, colorPaletteLabel, quickLayoutTooltips } from '../src/ribbon/chart-design-galleries.js';
import { applyBuiltin } from '../src/commands/actions.js';
import { contextualTriggers } from '../src/app-helpers.js';

/* ------------------------------------------------------------- harness ---- */

interface Harness { d: any; sheet: any; dialogs: { template: string; data: any }[]; }

function makeDesigner(options: { table?: boolean; chart?: boolean; sparkline?: boolean; formula?: string; shapeSelected?: boolean } = {}): Harness {
  const workbook = new GC.Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  const rows = [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 135, 150, 165, 570],
    ['South', 90, 105, 95, 125, 415],
    ['East', 75, 80, 90, 100, 345],
    ['West', 110, 115, 105, 130, 460],
  ];
  rows.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  if (options.table) sheet.tables.add('Table1', 0, 0, 5, 6, 'Medium Style 2 - Accent 1');
  if (options.chart) {
    const chart = sheet.charts.add('Chart1', GC.Spread.Sheets.Charts.ChartType.columnClustered, 300, 250, 300, 180, 'A1:F5');
    chart.isSelected(true);
  }
  if (options.sparkline) {
    const S = GC.Spread.Sheets.Sparklines;
    sheet.setSparkline(9, 1, 'B2:F2', S.DataOrientation.horizontal, S.SparklineType.line, new S.SparklineSetting());
  }
  if (options.formula) sheet.setFormula(19, 1, options.formula);
  const dialogs: { template: string; data: any }[] = [];
  const d: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    getActiveSheet: () => sheet,
    invalidate: () => undefined,
    hasSelectedShapes: () => options.shapeSelected === true,
    hasSelectedChart: () => hasSelectedChart(d),
    hasActiveTable: () => hasActiveTable(d),
    hasActiveSparkline: () => hasActiveSparkline(d),
    hasActiveFormulaSparkline: () => hasActiveFormulaSparkline(d),
    runUndoable: (action: string, data: any) => applyBuiltin(d, action, data),
    showDialog: (template: string, data: any) => { dialogs.push({ template, data }); },
    showMessageBox: () => undefined,
    showChartCommandDialog: () => undefined,
    showConvertTableDialog: () => undefined,
    showSparklineDialog: () => undefined,
    showFormatChartAreaDialog: () => undefined,
    showChartAltTextDialog: () => undefined,
    executeShapeCommand: () => undefined,
    notImplementedPlugin: () => undefined,
    resources: {},
  };
  return { d, sheet, dialogs };
}

const cell = (sheet: any, row: number, col: number): void => { sheet.setActiveCell(row, col); sheet.setSelection(row, col, 1, 1); };

/* `contextualCommandState` answers undefined for ids the contextual layer does not
 * own. Every read below expects a real state, so ask for it and fail loudly when
 * the command has none. */
const commandState = (d: any, name: string): NonNullable<ReturnType<typeof contextualCommandState>> => {
  const state = contextualCommandState(d, name);
  expect(state, `command state of ${name}`).toBeDefined();
  return state as NonNullable<ReturnType<typeof contextualCommandState>>;
};

/* ---------------------------------------------------- tab structure data --- */

describe('contextual tab structure (trial config)', () => {
  it('contributes Table Design, Chart Design and the two Sparkline tabs', () => {
    expect(contextualTabs.map((tab) => tab.id)).toEqual(['tableDesign', 'chartDesign', 'formulaSparkLineDesign', 'sparkLineDesign']);
    expect(contextualTabs.map((tab) => tab.text)).toEqual(['Table Design', 'Chart Design', 'Sparkline', 'Sparkline']);
    expect(tableDesignGroups.map((g) => g.label)).toEqual(['Properties', 'Tools', 'Table Style Options', 'Table Styles', 'Table Binding']);
    expect(chartDesignGroups.map((g) => g.label)).toEqual(['Chart Layouts', 'Chart Styles', 'Data', 'Type', 'Location', 'Accessibility', 'Format Pane']);
    expect(formulaSparklineGroups.map((g) => g.label)).toEqual(['Argument']);
    expect(sparklineGroups.map((g) => g.label)).toEqual(['Type', 'Show', 'Style', 'Group']);
    expect(shapeDesignGroups.map((g) => g.label)).toEqual([
      'Insert Shapes', 'Shape Styles', 'Accessibility', 'Rotate', 'Group', 'Align', 'Arrange', 'Size', 'Selection Pane', 'Format Pane',
    ]);
  });

  it('lists the Add Chart Element flyout in the trial row order', () => {
    const layouts = chartDesignGroups[0];
    const row = (layouts.commandGroup.children as any[])[0];
    expect((row.children as any[])[0].children.map((flyout: any) => flyout.command)).toEqual(
      ['axes', 'axisTitles', 'chartTitle', 'gridLines', 'dataLabels', 'legend', 'errorBars', 'trendline'],
    );
  });

  it('activates every contextual tab except the Sparkline tabs and the pivot tabs (trial measure9; TASK 77 t77-follow)', () => {
    // TASK 77 (probe t77-follow/t77-manualclose): the pivot tabs follow the same rule as the
    // Sparkline tabs — selection re-entry shows them WITHOUT activating (trial `click-into
    // pivot` keeps the active tab `Home`); only pivot creation activates, explicitly in
    // createPivot (`d.activeTab = 'pivotTableAnalyze'`).
    expect([...contextualTabsWithoutActivation].sort()).toEqual([
      'formulaSparkLineDesign', 'pivotTableAnalyze', 'pivotTableDesign', 'sparkLineDesign',
    ]);
    // Both pivot tabs share ONE trigger function object (fresh-tab detection compares identity).
    expect(contextualTriggers.pivotTableAnalyze).toBe(contextualTriggers.pivotTableDesign);
  });
});

/* ------------------------------------------------------- visibility rules -- */

describe('selection-driven visibility (trial measure9 mix-on-chart/mix-on-shape)', () => {
  it('Table Design shows while the active cell is inside a table, not outside', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    expect(hasActiveTable(h.d)).toBe(true);
    expect(contextualTriggers.tableDesign!(h.d)).toBe(true);
    cell(h.sheet, 10, 1);
    expect(contextualTriggers.tableDesign!(h.d)).toBe(false);
  });

  it('a selected chart opens Chart Design + Shape Format and closes the cell-driven Table Design', () => {
    const h = makeDesigner({ table: true, chart: true });
    cell(h.sheet, 2, 1);
    expect(hasSelectedChart(h.d)).toBe(true);
    expect(hasSelectedObject(h.d)).toBe(true);
    expect(contextualTriggers.chartDesign(h.d)).toBe(true);
    expect(contextualTriggers.shapeDesign(h.d)).toBe(true);
    expect(contextualTriggers.tableDesign(h.d)).toBe(false);
  });

  it('a selected shape closes Table Design and opens Shape Format', () => {
    const h = makeDesigner({ table: true, shapeSelected: true });
    cell(h.sheet, 2, 1);
    expect(contextualTriggers.shapeDesign(h.d)).toBe(true);
    expect(contextualTriggers.tableDesign(h.d)).toBe(false);
  });

  it('the Sparkline tab triggers on a cell sparkline; the formula tab on a *SPARKLINE* formula', () => {
    const h = makeDesigner({ sparkline: true });
    cell(h.sheet, 9, 1);
    expect(contextualTriggers.sparkLineDesign(h.d)).toBe(true);
    expect(contextualTriggers.formulaSparkLineDesign(h.d)).toBe(false);
    cell(h.sheet, 0, 0);
    expect(contextualTriggers.sparkLineDesign(h.d)).toBe(false);

    const f = makeDesigner({ formula: '=LINESPARKLINE(B2:F2,"horizontal")' });
    cell(f.sheet, 19, 1);
    expect(activeFormulaSparkline(f.d)).toBe('LINESPARKLINE');
    expect(contextualTriggers.formulaSparkLineDesign(f.d)).toBe(true);
    expect(contextualTriggers.sparkLineDesign(f.d)).toBe(false);

    const none = makeDesigner({ formula: '=SUM(B2:F2)' });
    cell(none.sheet, 19, 1);
    expect(activeFormulaSparkline(none.d)).toBeNull();
  });

  it('the Sparkline tab follows the ACTIVE cell even when the selection covers sparkline cells', () => {
    /* The trial's `SparklineSelected` closes the tab when the active cell has no
     * sparkline although the selection still covers one
     * (`.probe/t74/measure9-official.json` spark-range case). */
    const h = makeDesigner({ sparkline: true });
    h.sheet.setSelection(8, 1, 3, 1);
    h.sheet.setActiveCell(10, 1);
    expect(contextualTriggers.sparkLineDesign(h.d)).toBe(false);
    h.sheet.setActiveCell(9, 1);
    expect(contextualTriggers.sparkLineDesign(h.d)).toBe(true);
  });
});

/* ---------------------------------------------------------- table design --- */

describe('Table Design commands', () => {
  it('style-option checkboxes read and toggle the table flags', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    const table = h.sheet.tables.findByName('Table1');
    /* Trial default: a table added with "Medium Style 2 - Accent 1" reports
     * bandRows true (`.probe/t74/behaviour2-official.json` -> bandRows:true), so the
     * first checkbox click REMOVES the banding and the second restores it. */
    expect(table.bandRows()).toBe(true);
    expect(commandState(h.d, 'tableStyleBandedRows').checked).toBe(true);
    expect(commandState(h.d, 'tableStyleHeaderRow').checked).toBe(!!table.showHeader());
    executeContextualCommand(h.d, 'tableStyleBandedRows');
    expect(table.bandRows()).toBe(false);
    expect(commandState(h.d, 'tableStyleBandedRows').checked).toBe(false);
    executeContextualCommand(h.d, 'tableStyleBandedRows');
    expect(table.bandRows()).toBe(true);
    expect(contextualCommandEnabled(h.d, 'tableStyleHeaderRow')).toBe(true);
    cell(h.sheet, 10, 0);
    expect(contextualCommandEnabled(h.d, 'tableStyleHeaderRow')).toBe(false);
  });

  it('tableName carries the table name into the combo state', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    expect(commandState(h.d, 'tableName').value).toBe('Table1');
    executeContextualCommand(h.d, 'tableName', 'Sales2');
    expect(h.sheet.tables.findByName('Sales2')).toBeTruthy();
  });

  it('resizeTable opens the Resize Table dialog prefilled with the table range', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    executeContextualCommand(h.d, 'resizeTable');
    expect(h.dialogs[0].template).toBe('resizeTableDialogTemplate');
    expect(h.dialogs[0].data).toEqual({ table: 'Table1', range: '$A$1:$F$5' });
  });

  it('Convert to/from Data Table follows the DESIGNER conversion, like the trial', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    expect(commandState(h.d, 'ConvertToDataTable').visible).toBe(true);
    expect(commandState(h.d, 'ConvertFromDataTable').visible).toBe(false);
    expect(commandState(h.d, 'tableBindingSource').value).toBe('');
    /* The trial asks through a message box with OK/Cancel (labels and buttons
     * transcribed from the running UI). After ITS OWN conversion the launcher swaps
     * and the Binding Source combo names the source it created, while `bindingPath()`
     * stays empty (`.probe/t74/convert42-official.json`). */
    const asked: { text: string; title: string; icon: number; buttons: number }[] = [];
    h.d.showMessageBox = (message: string, title: string, icon: number, done?: (result: number) => void, _error?: () => void, buttons?: number) => {
      asked.push({ text: message, title, icon, buttons: buttons ?? 0 });
      done?.(1);
    };
    executeContextualCommand(h.d, 'ConvertToDataTable');
    expect(asked[0]).toEqual({ text: 'Do you want to convert the regular table to a data table?', title: 'SpreadJS Designer', icon: 2, buttons: 1 });
    const converted = h.sheet.tables.findByName('Table1');
    expect(isDataTable(h.d, converted)).toBe(true);
    expect(converted.bindingPath()).toBe('');
    expect(commandState(h.d, 'ConvertToDataTable').visible).toBe(false);
    expect(commandState(h.d, 'ConvertFromDataTable').visible).toBe(true);
    expect(commandState(h.d, 'tableBindingSource').value).toBe('Table1');

    executeContextualCommand(h.d, 'ConvertFromDataTable');
    expect(asked[1]).toEqual({ text: 'Do you want to convert the data table to a regular table?', title: 'SpreadJS Designer', icon: 2, buttons: 1 });
    expect(isDataTable(h.d, h.sheet.tables.findByName('Table1'))).toBe(false);
    expect(commandState(h.d, 'ConvertToDataTable').visible).toBe(true);
    expect(commandState(h.d, 'ConvertFromDataTable').visible).toBe(false);
    expect(commandState(h.d, 'tableBindingSource').value).toBe('');
  });

  it('a table the app bound through Table.bind() stays regular and refuses the convert', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    const table = h.sheet.tables.findByName('Table1');
    /* A table the APPLICATION bound is not a designer data table: the trial keeps
     * "Convert to Data Table", its combo stays empty and the command answers the
     * error box "Can't convert a binding table" — even though `isBinding()` is true,
     * `bindingPath()` reads 'SalesData' and `getBindingSource()` returns the records
     * (`.probe/t74/binding38.mjs` b/c, `.probe/t74/binding39.mjs`,
     * `.probe/t74/convert42-official.json` (the running UI)). */
    const headers = ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'];
    const columns = headers.map((header, index) => new GC.Spread.Sheets.Tables.TableColumn(index + 1, header, header));
    const records = [
      { Region: 'North', Q1: 120, Q2: 135, Q3: 150, Q4: 165, Total: 570 },
      { Region: 'South', Q1: 90, Q2: 105, Q3: 95, Q4: 125, Total: 415 },
      { Region: 'East', Q1: 75, Q2: 80, Q3: 90, Q4: 100, Total: 345 },
      { Region: 'West', Q1: 110, Q2: 115, Q3: 105, Q4: 130, Total: 460 },
    ];
    table.bind(columns, 'SalesData', { SalesData: records });
    expect(commandState(h.d, 'ConvertToDataTable').visible).toBe(true);
    expect(commandState(h.d, 'ConvertFromDataTable').visible).toBe(false);
    expect(commandState(h.d, 'tableBindingSource').value).toBe('');
    expect(isDataTable(h.d, h.sheet.tables.findByName('Table1'))).toBe(false);
    const asked: { text: string; title: string; icon: number }[] = [];
    h.d.showMessageBox = (message: string, title: string, icon: number) => {
      asked.push({ text: message, title, icon });
    };
    executeContextualCommand(h.d, 'ConvertToDataTable');
    expect(asked[0]).toEqual({ text: "Can't convert a binding table", title: 'SpreadJS Designer', icon: 3 });
    expect(isDataTable(h.d, h.sheet.tables.findByName('Table1'))).toBe(false);
    expect(commandState(h.d, 'ConvertFromDataTable').visible).toBe(false);
  });

  it('a converted table keeps its converted state when the Table Name combo renames it', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    h.d.showMessageBox = (_message: string, _title: string, _icon: number, done?: (result: number) => void) => done?.(1);
    executeContextualCommand(h.d, 'ConvertToDataTable');
    executeContextualCommand(h.d, 'tableName', 'Sales2');
    expect(isDataTable(h.d, h.sheet.tables.findByName('Sales2'))).toBe(true);
    expect(commandState(h.d, 'ConvertFromDataTable').visible).toBe(true);
    expect(commandState(h.d, 'ConvertToDataTable').visible).toBe(false);
    expect(commandState(h.d, 'tableBindingSource').value).toBe('Sales2');
  });

  it('applyTableFlag writes a flag through the public Table API (undoable action)', () => {
    const h = makeDesigner({ table: true });
    const table = h.sheet.tables.findByName('Table1');
    applyBuiltin(h.d, 'applyTableFlag', { table: 'Table1', flag: 'highlightFirstColumn', value: true });
    expect(table.highlightFirstColumn()).toBe(true);
    applyBuiltin(h.d, 'applyTableFlag', { table: 'Table1', flag: 'highlightFirstColumn', value: false });
    expect(table.highlightFirstColumn()).toBe(false);
  });
});

/* ---------------------------------------------------------- chart design --- */

describe('Chart Design commands', () => {
  const selectedChart = (h: Harness) => h.sheet.charts.get('Chart1');

  it('quick layout 4 removes the title, keeps the bottom legend and no gridlines (trial measure24)', () => {
    const h = makeDesigner({ chart: true });
    executeContextualCommand(h.d, 'quickLayout', 4);
    const chart = selectedChart(h);
    const title = chart.title() as any;
    /* The trial reports the removed title as `null`; our core's getter keeps
     * synthesizing the auto "Chart Title", so the designer writes the title as
     * an empty 0 pt text (STATUS TASK 74 "known gaps"). */
    expect(title.fontSize).toBe(0);
    expect(chartTitleRemoved(chart)).toBe(true);
    expect(chart.legend().visible).toBe(true);
    expect(chart.legend().position).toBe(GC.Spread.Sheets.Charts.LegendPosition.bottom);
    expect((chart.axes() as any).primaryValue.majorGridLine.visible).toBe(false);
    expect((chart.axes() as any).primaryCategory.visible).toBe(true);
  });

  it('quick layout 6 shows both axis titles and major+minor value gridlines (trial measure24)', () => {
    const h = makeDesigner({ chart: true });
    executeContextualCommand(h.d, 'quickLayoutListContent', 6);
    const chart = selectedChart(h);
    const axes = chart.axes() as any;
    expect(axes.primaryCategory.title.text).toBe('Axis Titles');
    expect(axes.primaryValue.title.text).toBe('Axis Titles');
    expect(axes.primaryValue.majorGridLine.visible).toBe(true);
    expect(axes.primaryValue.minorGridLine.visible).toBe(true);
    expect((chart.title() as any).fontSize).toBe(0);
    expect(chartTitleRemoved(chart)).toBe(true);
  });

  it('the ten quick layouts are the absolute states measured on the trial', () => {
    expect(quickLayoutPresets.length).toBe(10);
    // measure24-official.json legend enum 1 top 2 right 3 left 4 bottom.
    expect(quickLayoutPresets.map((p) => p.legendPosition)).toEqual([2, 1, 4, 4, 2, 2, 2, 2, 2, 2]);
    expect(quickLayoutPresets.map((p) => p.title)).toEqual([true, true, true, false, true, false, true, true, true, false]);
  });

  it('chart styles write the trial gridline/legend/background choices (measure24)', () => {
    expect(chartStylePresets.length).toBe(6);
    const h = makeDesigner({ chart: true });
    executeContextualCommand(h.d, 'chartStyle', 3);
    const chart = selectedChart(h);
    const axes = chart.axes() as any;
    expect(axes.primaryCategory.majorGridLine.visible).toBe(false);
    expect(axes.primaryValue.majorGridLine.visible).toBe(true);
    expect(chart.legend().position).toBe(GC.Spread.Sheets.Charts.LegendPosition.bottom);
    expect((chart.chartArea() as any).backColor).toBe('rgb(93,93,93)');
    executeContextualCommand(h.d, 'chartStyle', 4);
    expect((selectedChart(h).chartArea() as any).backColor).toBe('background 1 0');
    expect(selectedChart(h).legend().position).toBe(GC.Spread.Sheets.Charts.LegendPosition.top);
  });

  it('element rows toggle the model parts like the trial (measure14/24)', () => {
    const h = makeDesigner({ chart: true });
    const chart = selectedChart(h);
    executeContextualCommand(h.d, 'axesPrimaryVertical');
    expect((chart.axes() as any).primaryValue.visible).toBe(false);
    executeContextualCommand(h.d, 'axesPrimaryVertical');
    expect((chart.axes() as any).primaryValue.visible).toBe(true);
    // Gridline rows name the LINES they draw: horizontal lines live on the value axis.
    // A fresh column chart has the major horizontal gridlines ON (trial AND ours), so the
    // trial's measured first click removes them (`.probe/t74/measure24-official.json` flyout).
    executeContextualCommand(h.d, 'gridLinesPrimaryMajorHorizontal');
    expect((chart.axes() as any).primaryValue.majorGridLine.visible).toBe(false);
    executeContextualCommand(h.d, 'gridLinesPrimaryMajorHorizontal');
    expect((chart.axes() as any).primaryValue.majorGridLine.visible).toBe(true);
    executeContextualCommand(h.d, 'gridLinesPrimaryMajorVertical');
    expect((chart.axes() as any).primaryCategory.majorGridLine.visible).toBe(true);
    executeContextualCommand(h.d, 'dataLabelsCenter');
    expect(chart.dataLabels().showValue).toBe(true);
    expect(chart.dataLabels().position).toBe(GC.Spread.Sheets.Charts.DataLabelPosition.center);
    executeContextualCommand(h.d, 'dataLabelsNone');
    expect(chart.dataLabels().showValue).toBe(false);
    /* Trial: "None" only clears the show flag and keeps the current position
     * (Center 2 -> None stays 2 — measure24-official flyout). */
    expect(chart.dataLabels().position).toBe(GC.Spread.Sheets.Charts.DataLabelPosition.center);
    executeContextualCommand(h.d, 'legendLeft');
    expect(chart.legend().visible).toBe(true);
    expect(chart.legend().position).toBe(GC.Spread.Sheets.Charts.LegendPosition.left);
    executeContextualCommand(h.d, 'legendNone');
    expect(chart.legend().visible).toBe(false);
    executeContextualCommand(h.d, 'chartTitleNone');
    expect(chartTitleRemoved(chart)).toBe(true);
    expect((chart.title() as any).fontSize).toBe(0);
    expect(commandState(h.d, 'chartTitleNone').checked).toBe(true);
    expect(commandState(h.d, 'chartTitleAboveChart').checked).toBe(false);
    executeContextualCommand(h.d, 'chartTitleAboveChart');
    expect(chartTitleRemoved(chart)).toBe(false);
    expect((chart.title() as any).text).not.toBe('');
  });

  it('changeColors writes a core colorScheme; the gallery strips resolve six colors', () => {
    const h = makeDesigner({ chart: true });
    executeContextualCommand(h.d, 'changeColors', 'monochromaticPalette2');
    expect(JSON.stringify(h.sheet.charts.get('Chart1').colorScheme())).toContain('accent 2');
    expect(paletteStripColors(h.d, 'colorfulPalette1').length).toBe(6);
    expect(paletteStripColors(h.d, 'monochromaticPalette1').length).toBe(6);
  });

  it('selectData/changeChartType/moveChart reuse the existing chart dialogs (TASK 56/58)', () => {
    const h = makeDesigner({ chart: true });
    const opened: string[] = [];
    h.d.showChartCommandDialog = (kind: string) => opened.push(kind);
    for (const name of ['selectData', 'changeChartType', 'moveChart']) expect(executeContextualCommand(h.d, name)).toBe(true);
    expect(opened).toEqual(['selectData', 'changeChartType', 'moveChart']);
  });

  it('every chart command is disabled without a selected chart', () => {
    const h = makeDesigner();
    cell(h.sheet, 2, 1);
    for (const name of ['quickLayout', 'changeColors', 'chartStyle', 'switchRowColumn', 'selectData', 'changeChartType', 'moveChart', 'chartAltText', 'legendNone', 'dataLabelsCenter', 'axesPrimaryHorizontal']) {
      expect(contextualCommandEnabled(h.d, name), name).toBe(false);
    }
  });
});

describe('Chart Design gallery labels', () => {
  /* The trial gives every gallery item its own `data-value` AND the launcher's
   * `data-command`, and its item tooltips read "Layout1\n…", "style1" and
   * "Colorful Palette 1\n…" (`.probe/t74/measure36.mjs`, `.probe/t74/measure37.mjs`).
   * The paired spec clicks the items through those labels, so the labels are the
   * contract of the three galleries. */
  it('names the ten Quick Layout tiles Layout1..Layout10 and lists the elements each writes', () => {
    expect(quickLayoutTooltips.length).toBe(quickLayoutPresets.length);
    expect(quickLayoutTooltips.map((tip) => tip.split('\n')[0])).toEqual(Array.from({ length: 10 }, (_, index) => `Layout${index + 1}`));
    expect(quickLayoutTooltips[0]).toBe('Layout1\nChart Title\nLegend(Right)\nHorizontal Axis\nVertical Axis\nMajor Gridlines');
    expect(quickLayoutTooltips[5].split('\n')).toContain('Minor Gridlines');
    expect(quickLayoutTooltips[9].split('\n')).not.toContain('Chart Title');
  });

  it('names the six Chart Styles tiles style1..style6 like the trial', () => {
    expect(chartStyleTooltips).toEqual(['style1', 'style2', 'style3', 'style4', 'style5', 'style6']);
  });

  it('names every Change Colors row "<Section> Palette N" and describes its six bands', () => {
    expect(colorPaletteLabel('Colorful', 'colorfulPalette1', 0)).toBe('Colorful Palette 1\nBlue, Orange, Gray, Gold, Blue, Green');
    expect(colorPaletteLabel('Monochromatic', 'monochromaticPalette2', 1).split('\n')[0]).toBe('Monochromatic Palette 2');
    expect(colorPaletteLabel('Monochromatic', 'monochromaticPalette2', 1).split('\n')[1]).toBe('Orange gradient, dark to light');
    expect(colorPaletteLabel('Monochromatic', 'monochromaticPalette8', 7).split('\n')[1]).toBe('Blue gradient, light to dark');
    expect(colorPaletteLabel('Monochromatic', 'monochromaticPalette7', 6).split('\n')[1]).toBe('Dark Gray, Light Gray, Gray, Dark Gray, Light Gray, Gray');
  });
});

/* ------------------------------------------------------------- sparkline --- */

describe('Sparkline commands', () => {
  it('Show checkboxes flip the setting options', () => {
    const h = makeDesigner({ sparkline: true });
    cell(h.sheet, 9, 1);
    const spark = h.sheet.getSparkline(9, 1);
    executeContextualCommand(h.d, 'showHighpoint');
    expect((spark.setting() as any).options.showHigh).toBe(true);
    expect(commandState(h.d, 'showHighpoint').checked).toBe(true);
    executeContextualCommand(h.d, 'showHighpoint');
    expect((spark.setting() as any).options.showHigh).toBe(false);
  });

  it('Type buttons write the sparkline type and report the current one as checked', () => {
    const h = makeDesigner({ sparkline: true });
    cell(h.sheet, 9, 1);
    const spark = h.sheet.getSparkline(9, 1);
    executeContextualCommand(h.d, 'columnSparkline');
    expect(Number(spark.sparklineType())).toBe(GC.Spread.Sheets.Sparklines.SparklineType.column);
    expect(commandState(h.d, 'columnSparkline').checked).toBe(true);
    expect(commandState(h.d, 'lineSparkline').checked).toBe(false);
  });

  it('the weight combo shows POINTS like the trial (1 px -> ¾ pt) and writes px back', () => {
    // weightDisplayText takes POINTS; the combo writes/reads px through the ×0.75 rule.
    expect(weightDisplayText(0.75)).toBe('¾ pt');          // core default 1 px
    expect(weightDisplayText(1)).toBe('1 pt');             // trial writes 4/3 px for this
    expect(weightDisplayText(1.5)).toBe('1½ pt');
    expect(weightDisplayText(2.25)).toBe('2¼ pt');
    expect(weightDisplayText(4.5)).toBe('4½ pt');
    expect(weightDisplayText(1.1)).toBe('1.1 pt');
    expect(weightPoints('sparline-weight-1/4')).toBe(0.25);
    expect(weightPoints('sparline-weight-2-1/4')).toBe(2.25);
    expect(weightPoints('sparline-weight-custom')).toBe('custom');
    expect(weightPoints('1.5 pt')).toBe(1.5);

    const h = makeDesigner({ sparkline: true });
    cell(h.sheet, 9, 1);
    const spark = h.sheet.getSparkline(9, 1);
    expect(commandState(h.d, 'sparklineWeight').value).toBe('¾ pt'); // core default lineWeight 1 px
    executeContextualCommand(h.d, 'sparklineWeight', 'sparline-weight-1');
    expect(Number((spark.setting() as any).options.lineWeight)).toBeCloseTo(4 / 3);
    expect(commandState(h.d, 'sparklineWeight').value).toBe('1 pt');
    executeContextualCommand(h.d, 'sparklineWeight', 'sparline-weight-custom');
    expect(h.dialogs[0].template).toBe('sparklineWeightDialogTemplate');
    expect(h.dialogs[0].data.weight).toBe('1');
  });

  it('group/ungroup and clear act on the sparklines inside the selection', () => {
    const h = makeDesigner({ sparkline: true });
    const S = GC.Spread.Sheets.Sparklines;
    h.sheet.setSparkline(9, 2, 'B2:F2', S.DataOrientation.horizontal, S.SparklineType.line, new S.SparklineSetting());
    cell(h.sheet, 9, 1);
    h.sheet.setSelection(9, 1, 1, 2);
    expect(contextualCommandEnabled(h.d, 'sparklineGroup')).toBe(true);
    executeContextualCommand(h.d, 'sparklineGroup');
    const group = h.sheet.getSparkline(9, 1).group();
    expect(group.count()).toBe(2);
    expect(contextualCommandEnabled(h.d, 'sparklineUnGroup')).toBe(true);
    executeContextualCommand(h.d, 'clearSelectedSparklineGroups');
    expect(h.sheet.getSparkline(9, 1)).toBeNull();
    expect(h.sheet.getSparkline(9, 2)).toBeNull();
  });

  it('color pickers write the setting colors from the ColorMenu value', () => {
    const h = makeDesigner({ sparkline: true });
    cell(h.sheet, 9, 1);
    const spark = h.sheet.getSparkline(9, 1);
    executeContextualCommand(h.d, 'sparklineColor', '#ed7d31');
    expect((spark.setting() as any).options.seriesColor).toBe('#ed7d31');
    executeContextualCommand(h.d, 'sparklineMarkerColor', '#70ad47');
    expect((spark.setting() as any).options.markersColor).toBe('#70ad47');
  });
});

/* ------------------------------------------------------- enablement map ---- */

describe('enablement follows the selected object (trial contract15 enable contexts)', () => {
  it('table commands need a table under the active cell', () => {
    const h = makeDesigner({ table: true });
    cell(h.sheet, 2, 1);
    for (const name of ['tableName', 'resizeTable', 'convertToRange', 'tableAllowAutoExpand', 'ConvertToDataTable']) {
      expect(contextualCommandEnabled(h.d, name), name).toBe(true);
    }
    cell(h.sheet, 30, 30);
    for (const name of ['tableName', 'resizeTable', 'convertToRange']) {
      expect(contextualCommandEnabled(h.d, name), name).toBe(false);
    }
  });

  it('formulaSparklineSetting needs a sparkline formula; FormatPane a selected chart/shape; shapes the shape selection', () => {
    const f = makeDesigner({ formula: '=PIESPARKLINE(B2:F2)' });
    cell(f.sheet, 19, 1);
    expect(contextualCommandEnabled(f.d, 'formulaSparklineSetting')).toBe(true);
    expect(contextualCommandEnabled(f.d, 'sparklineColor')).toBe(false); // no CELL sparkline

    const c = makeDesigner({ chart: true });
    expect(contextualCommandEnabled(c.d, 'FormatPane')).toBe(true);
    expect(contextualCommandEnabled(c.d, 'shapeAlignLeft')).toBe(false);

    const s = makeDesigner({ shapeSelected: true });
    expect(contextualCommandEnabled(s.d, 'shapeAlignLeft')).toBe(true);
    expect(contextualCommandEnabled(s.d, 'FormatPane')).toBe(true);
  });
});
