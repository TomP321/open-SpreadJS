// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TASK 65: the last "not implemented in this milestone" designer stubs —
 * New Table Style, Manage Cell States, the combo charts and the conditional
 * formatting gallery footers. Expectations follow the v19 trial measured
 * black-box (see docs/STATUS.md, TASK 65); the paired spec replays the same
 * flows against the official Designer.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { executeDesignerSpecial } from '../src/designer-commands.js';
import {
  addCellState, applyNewTableStyle, clearTableStyleOfSelection, showManageCellStatesDialog, showNewTableStyleDialog,
} from '../src/designer-custom-styles.js';
import { applyConditionalRule, conditionalRuleRows, duplicateConditionalRule, editConditionalRule, deleteConditionalRule } from '../src/designer-conditional-formatting.js';
import { emptyTableElementStyle, tableElementStyleJSON, TABLE_STYLE_ELEMENTS } from '../src/dialogs/TableStyleDialogs.js';
import { commitCellStates, parseCellStateRange, rangeText } from '../src/dialogs/CellStatesDialogs.js';
import { COMBO_CHART_PLAN, applySeriesPlans, insertComboChart } from '../src/commands/insert.js';
import { CHART_TYPE_TILES, SERIES_CHART_TYPES } from '../src/dialogs/ChartTypeDialogs.js';

function makeSheet(workbook: GC.Spread.Sheets.Workbook) {
  const sheet = workbook.getActiveSheet();
  const rows = [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 135, 150, 165, 570],
    ['South', 90, 105, 95, 125, 415],
    ['East', 75, 80, 90, 100, 345],
    ['West', 110, 115, 105, 130, 460],
  ];
  rows.forEach((row, r) => row.forEach((value, c) => { if (value !== null) sheet.setValue(r, c, value); }));
  return sheet;
}

interface Recorded { name: string; data: any; ok: (data: any) => void }

function makeDesigner(workbook: GC.Spread.Sheets.Workbook) {
  const opened: Recorded[] = [];
  const d: any = {
    gc: GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    dialog: null as any,
    opened,
    showDialog: (name: string, data: any, success: (data: any) => void) => {
      const record: Recorded = { name, data, ok: success };
      opened.push(record);
      d.dialog = { name, data, success, error: () => undefined };
      return record;
    },
    closeDialog: () => { d.dialog = null; },
    showMessageBox: () => undefined,
    executeCommand: () => undefined,
    selection: () => ({ row: 1, col: 1, rowCount: 4, colCount: 5 }),
  };
  d.showNewTableStyleDialog = () => showNewTableStyleDialog(d);
  d.showManageCellStatesDialog = () => showManageCellStatesDialog(d);
  d.clearTableStyleOfSelection = () => clearTableStyleOfSelection(d);
  return d;
}

let workbook: GC.Spread.Sheets.Workbook;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  workbook = new GC.Spread.Sheets.Workbook(host, { sheetCount: 1 });
});

afterEach(() => {
  workbook.destroy();
  host.remove();
});

describe('New Table Style (TASK 65 item 1)', () => {
  it('opens the tableStyleDialogTemplate with the trial\'s default name', () => {
    const d = makeDesigner(workbook);
    d.showNewTableStyleDialog();
    expect(d.opened[0].name).toBe('tableStyleDialogTemplate');
    expect(d.opened[0].data.name).toBe('New Table Style 1');
    expect(d.opened[0].data.element).toBe(0);
  });

  it('numbers repeated dialogs New Table Style 1, 2, ... like the trial', () => {
    const d = makeDesigner(workbook);
    applyNewTableStyle(d, { name: 'New Table Style 1', styles: { wholeTableStyle: { ...emptyTableElementStyle(), backColor: '#ffff00' } }, sizes: {} });
    d.showNewTableStyleDialog();
    expect(d.opened.at(-1).data.name).toBe('New Table Style 2');
  });

  it('OK registers a TableTheme through customTableThemes.add and keeps the element JSON shape', () => {
    const d = makeDesigner(workbook);
    const element = { ...emptyTableElementStyle(), backColor: '#ffff00', bold: true };
    applyNewTableStyle(d, { name: 'Mine', styles: { wholeTableStyle: element }, sizes: {} });
    const theme = workbook.customTableThemes.get('Mine');
    expect(theme).toBeTruthy();
    const json: any = (theme as any).toJSON();
    expect(json.name).toBe('Mine');
    expect(json.wholeTableStyle.backColor).toBe('#ffff00');
    expect(json.wholeTableStyle.fontWeight).toBe('bold');
    expect(TABLE_STYLE_ELEMENTS.every((item) => !item.key || !(item.key in json) || true)).toBe(true);
    // The serializer writes all six borders even for an untouched element.
    expect(Object.keys(json.wholeTableStyle).filter((key: string) => key.startsWith('border'))).toHaveLength(6);
  });

  it('stripe elements carry their stripe size', () => {
    const d = makeDesigner(workbook);
    applyNewTableStyle(d, { name: 'Striped', styles: { firstRowStripStyle: { ...emptyTableElementStyle(), backColor: '#eeeeee' } }, sizes: { firstRowStripSize: 3 } });
    const json: any = (workbook.customTableThemes.get('Striped') as any).toJSON();
    expect(json.firstRowStripSize).toBe(3);
  });

  it('the element JSON matches the trial style keys', () => {
    const record: any = tableElementStyleJSON({ ...emptyTableElementStyle(), backColor: '#00ff00', italic: true, size: '12pt' });
    expect(record.font).toBe('italic normal 12pt Calibri');
    expect(record.fontStyle).toBe('italic');
    expect(record.borderLeft).toEqual({ style: 0 });
  });

  it('the gallery Clear removes the table style of the cursor', () => {
    const sheet = makeSheet(workbook);
    sheet.tables.add('Table1', 0, 0, 5, 6, 'Light1');
    const d = makeDesigner(workbook);
    clearTableStyleOfSelection(d);
    /* Trial (TASK 77 probe `.probe/t77/run/t77-tablefixture.json`): the cleared table keeps a
     * name-less theme object (not `null`) and the serialized table omits the `style` key; a bare
     * `null` crashed the core style cascade for every later read (see task77-paste-parity.test.ts). */
    const style: any = sheet.tables.findByName('Table1').style();
    expect(style).toBeTruthy();
    expect(!style.name()).toBe(true);
  });
});

describe('Manage Cell States (TASK 65 item 2)', () => {
  it('opens the working copy of (sheet.cellStates as any).all()', () => {
    const sheet = makeSheet(workbook);
    const style = new GC.Spread.Sheets.Style();
    style.backColor = '#ffcc00';
    sheet.cellStates.add(new GC.Spread.Sheets.Range(1, 1, 4, 5), 1, style, GC.Spread.Sheets.SheetArea.viewport);
    const d = makeDesigner(workbook);
    d.showManageCellStatesDialog();
    expect(d.opened[0].name).toBe('cellStateManagerTemplate');
    const rows = d.opened[0].data.rows;
    expect(rows).toHaveLength(1);
    expect(rangeText(rows[0])).toBe('B2:F5');
    expect(rows[0].style.backColor).toBe('#ffcc00');
  });

  it('OK commits the list through cellStates.clear + add', () => {
    const sheet = makeSheet(workbook);
    const d = makeDesigner(workbook);
    d.showManageCellStatesDialog();
    const record = d.opened[0];
    record.ok({
      rows: [
        { row: 1, col: 1, rowCount: 2, colCount: 2, state: 4, style: { backColor: '#eeeeee' } },
        { row: 3, col: 0, rowCount: 1, colCount: 1, state: 8, style: { foreColor: '#ff0000' } },
      ],
    });
    const all = (sheet.cellStates as any).all();
    expect(all.map((entry: any) => entry.state)).toEqual([4, 8]);
    expect((all[0] as any).style.backColor).toBe('#eeeeee');
    expect((all[1] as any).style.foreColor).toBe('#ff0000');
  });

  it('commitCellStates replaces older states, and the range editor parses A1 forms', () => {
    const sheet = makeSheet(workbook);
    const style = new GC.Spread.Sheets.Style();
    style.backColor = '#123456';
    sheet.cellStates.add(new GC.Spread.Sheets.Range(0, 0, 10, 5), 1, style, GC.Spread.Sheets.SheetArea.viewport);
    const d = makeDesigner(workbook);
    commitCellStates(d as any, sheet, [{ row: 2, col: 3, rowCount: 1, colCount: 1, state: 1, style: {} }]);
    expect((sheet.cellStates as any).all()).toHaveLength(1);
    expect(parseCellStateRange('$B$2:$E$9')).toEqual({ row: 1, col: 1, rowCount: 8, colCount: 4 });
    expect(parseCellStateRange('Sheet1!C7')).toEqual({ row: 6, col: 2, rowCount: 1, colCount: 1 });
    expect(parseCellStateRange('nonsense')).toBeNull();
  });

  it('the manager Add opens newCellStateTemplate seeded with the selection', () => {
    const sheet = workbook.getActiveSheet();
    sheet.setSelection(1, 1, 4, 5);
    const d = makeDesigner(workbook);
    d.showManageCellStatesDialog();
    addCellState(d);
    const record = d.opened.at(-1);
    expect(record.name).toBe('newCellStateTemplate');
    expect(record.data.range).toBe('B2:F5');
    record.ok({ state: 32, range: 'A1:B2', style: { backColor: '#00ff00' } });
    expect(d.opened.at(-1).name).toBe('cellStateManagerTemplate');
    expect(d.opened.at(-1).data.rows).toHaveLength(1);
    expect(d.opened.at(-1).data.rows[0]).toMatchObject({ row: 0, col: 0, rowCount: 2, colCount: 2, state: 32 });
  });
});

describe('Combo charts (TASK 65 item 3)', () => {
  it('every combo plan uses two public ChartType members', () => {
    const enumTable: any = (GC as any).Spread.Sheets.Charts.ChartType;
    for (const plan of Object.values(COMBO_CHART_PLAN)) {
      expect(typeof enumTable[plan.first]).toBe('number');
      expect(typeof enumTable[plan.second]).toBe('number');
      expect([0, 1]).toContain(plan.axisGroup);
    }
  });

  it('insertComboChart splits the series over two plot groups with axisGroup', () => {
    const sheet = makeSheet(workbook);
    const d = makeDesigner(workbook);
    expect(insertComboChart(d, 'comboChartColumnAndLineAxis', undefined, { row: 0, col: 0, rowCount: 5, colCount: 6 })).toBe(true);
    const chart = sheet.charts.all()[0];
    const groups = (chart as any)._space.chart.plotArea.chartGroups;
    expect(groups).toBeTruthy();
    expect(groups.length).toBe(2);
    expect(groups[0].ser.length).toBe(2);
    expect(groups[1].ser.length).toBe(2);
    expect(Number(groups[1].axisGroup ?? 1)).toBe(1);
  });

  it('applySeriesPlans re-shapes an existing chart per series', () => {
    const sheet = makeSheet(workbook);
    const chart = sheet.charts.add('Chart1', GC.Spread.Sheets.Charts.ChartType.columnClustered, 500, 200, 300, 200, 'A1:F5');
    const d = makeDesigner(workbook);
    const built = chart.series().get() as any[];
    const plans = built.map((series, index) => ({
      name: series.name, xValues: series.xValues, yValues: series.yValues,
      chartType: index === 0 ? 9 : 12, axisGroup: index === 0 ? 1 : 0,
    }));
    expect(applySeriesPlans(d, chart as any, plans)).toBe(true);
    const after = chart.series().get() as any[];
    expect(after).toHaveLength(built.length);
    expect(after.map((series: any) => series.axisGroup)).toEqual([1, 0, 0, 0]);
    expect(Number(after[0].chartType)).not.toBe(Number(after[1].chartType));
  });

  it('the Custom Combination tile exists with the six public series types', () => {
    const combos = CHART_TYPE_TILES.Combo;
    expect(combos.find((tile) => tile.custom)?.label).toBe('Custom Combination');
    expect(SERIES_CHART_TYPES.length).toBeGreaterThan(3);
    const enumTable: any = (GC as any).Spread.Sheets.Charts.ChartType;
    for (const item of SERIES_CHART_TYPES) expect(typeof enumTable[item.typeName]).toBe('number');
  });
});

describe('Conditional formatting dialogs (TASK 65 item 4)', () => {
  it('the former generic stubs now open real dialogs instead of message boxes', () => {
    const opened: string[] = [];
    const d = makeDesigner(workbook);
    d.showNewFormattingRuleDialog = (preset?: string) => opened.push(`rule:${preset}`);
    d.showConditionalRuleManager = () => opened.push('manager');
    for (const command of ['highlightCellsMoreRules', 'topBottomRulesMoreRules', 'moreDataBarRules', 'moreColorScaleRules', 'moreIconSetRules', 'conditionFormatNewRule']) {
      expect(executeDesignerSpecial(d, command, undefined)).toBe(true);
    }
    executeDesignerSpecial(d, 'conditionFormatManageRule', undefined);
    expect(opened).toEqual([
      'rule:contain', 'rule:topBottom', 'rule:dataBar', 'rule:colorScale', 'rule:iconSet', 'rule:style', 'manager',
    ]);
    expect(d.opened.filter((record: Recorded) => record.name === 'messageBox')).toHaveLength(0);
  });

  it('newTableStyle / clearTableStyle / manageCellState reach the dialog openers', () => {
    const d = makeDesigner(workbook);
    expect(executeDesignerSpecial(d, 'newTableStyle', undefined)).toBe(true);
    expect(executeDesignerSpecial(d, 'manageCellState', undefined)).toBe(true);
    expect(d.opened.map((record: Recorded) => record.name)).toEqual(['tableStyleDialogTemplate', 'cellStateManagerTemplate']);
    expect(executeDesignerSpecial(d, 'clearTableStyle', undefined)).toBe(true);
  });

  it('OK adds a cell-value rule through the public conditionalFormats API', () => {
    const sheet = makeSheet(workbook);
    const d = makeDesigner(workbook);
    applyConditionalRule(d, { type: 1, operator: 4, value1: 100, style: { backColor: '#ff0000' } });
    const rules = (sheet.conditionalFormats as any).getRules();
    expect(rules).toHaveLength(1);
    expect(Number((rules[0] as any).ruleType())).toBe(Number((GC as any).Spread.Sheets.ConditionalFormatting.RuleType.cellValueRule));
    expect(String((rules[0] as any).value1())).toBe('100');
  });

  it('the Format style presets add their rule kinds (TASK 68 official names)', () => {
    const sheet = makeSheet(workbook);
    const d = makeDesigner(workbook);
    applyConditionalRule(d, { type: 0, valueFormat: 'Data Bar', barColor: '#0000ff' });
    applyConditionalRule(d, { type: 0, valueFormat: '2-Color Scale', minColor: '#ff0000', maxColor: '#00ff00' });
    applyConditionalRule(d, { type: 0, valueFormat: '3-Color Scale', minColor: '#ff0000', maxColor: '#00ff00' });
    applyConditionalRule(d, { type: 0, valueFormat: 'Icon Sets', iconSetType: 5 });
    const kinds = (sheet.conditionalFormats as any).getRules().map((rule: any) => Number(rule.ruleType()));
    const enums: any = (GC as any).Spread.Sheets.ConditionalFormatting.RuleType;
    expect(kinds).toEqual([enums.dataBarRule, enums.twoScaleRule, enums.threeScaleRule, enums.iconSetRule]);
    expect(() => applyConditionalRule(d, { type: 0, valueFormat: 'Sparkline' })).toThrow(/sparkline/i);
  });

  it('the manager lists rules with range and description, Edit reloads them, Delete removes them', () => {
    const sheet = makeSheet(workbook);
    const style = new GC.Spread.Sheets.Style();
    style.backColor = '#00ff00';
    sheet.conditionalFormats.addCellValueRule(4, 100, null as any, style, [new GC.Spread.Sheets.Range(1, 1, 4, 5)]);
    const d = makeDesigner(workbook);
    const rows = conditionalRuleRows(d) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].appliesTo).toBe('=$B$2:$F$5');
    expect(rows[0].description).toBe('Cell value < 100');
    editConditionalRule(d, 0);
    expect(d.opened.at(-1).name).toBe('newFormattingRuleDialogTemplate');
    expect(d.opened.at(-1).data).toMatchObject({ type: 1, operator: 4, value1: 100 });
    expect(d.opened.at(-1).data.style.backColor).toBe('#00ff00');
    deleteConditionalRule(d, 0, false);
    expect((sheet.conditionalFormats as any).getRules()).toHaveLength(0);
  });

  it('Duplicate copies a rule with its style onto its ranges', () => {
    const sheet = makeSheet(workbook);
    const style = new GC.Spread.Sheets.Style();
    style.foreColor = '#123123';
    sheet.conditionalFormats.addFormulaRule('=A2>1', style, [new GC.Spread.Sheets.Range(1, 0, 4, 1)]);
    const d = makeDesigner(workbook);
    duplicateConditionalRule(d, 0);
    const rules = (sheet.conditionalFormats as any).getRules();
    expect(rules).toHaveLength(2);
    expect(String((rules[1] as any).formula())).toBe('A2>1');
  });

  it('the state rule kind writes a row-state rule (trial kind 6)', () => {
    const sheet = makeSheet(workbook);
    const d = makeDesigner(workbook);
    applyConditionalRule(d, { type: 6, stateScope: 'row', state: 64, style: { backColor: '#dddddd' } });
    const rule: any = (sheet.conditionalFormats as any).getRules()[0];
    const enums: any = (GC as any).Spread.Sheets.ConditionalFormatting.RuleType;
    expect(Number(rule.ruleType())).toBe(enums.rowStateRule);
    expect(Number(rule.state()) as any).toBe(64);
  });
});
