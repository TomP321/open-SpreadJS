import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const SS = GC.Spread.Sheets;
const { Worksheet, Workbook, Style, Range } = SS;
const { TableThemes } = SS.Tables;
const AnyThemes = TableThemes as unknown as Record<string, string>;

function sheetWithValues(rows: unknown[][]): InstanceType<typeof Worksheet> {
  const workbook = new Workbook();
  const sheet = workbook.getActiveSheet();
  rows.forEach((row, r) => row.forEach((value, c) => sheet.setValue(r, c, value)));
  return sheet;
}

describe('tables', () => {
  it('creates tables with inferred columns, style and JSON', () => {
    const sheet = sheetWithValues([
      ['Name', 'Qty'],
      ['A', 1],
      ['B', 2],
    ]);
    const table = sheet.tables.add('T', 0, 0, 3, 2, AnyThemes.medium2, { showFooter: false });
    expect(sheet.tables.all()).toHaveLength(1);
    expect(table.name()).toBe('T');
    expect(table.range()).toMatchObject({ row: 0, col: 0, rowCount: 3, colCount: 2 });
    expect(table.getColumnName(0)).toBe('Name');
    expect(table.getColumnName(1)).toBe('Qty');
    const json = table.toJSON();
    expect(json.name).toBe('T');
    expect(json.style).toBe('medium2');
    expect(json.reservedElement).toBeUndefined();
    expect(Object.keys(json)).toContain('reservedElement');
  });

  it('canonicalises table column formulas and honours the footer', () => {
    const sheet = sheetWithValues([
      ['Item', 'Total'],
      ['A', 2],
      ['B', 3],
    ]);
    const table = sheet.tables.add('Sales', 0, 0, 3, 2, AnyThemes.light1);
    table.setColumnFormula(1, '[Item]');
    expect(table.getColumnFormula(1)).toBe('[Item]');
    expect(sheet.getFormula(1, 1)).toBeNull();
    expect(table.toJSON().columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Total', footerFormula: '[Item]' })]),
    );
  });

  it('auto-expands when editing below the table', () => {
    const sheet = sheetWithValues([
      ['A'],
      [1],
    ]);
    const table = sheet.tables.add('T', 0, 0, 2, 1, AnyThemes.light1 as unknown as string);
    sheet.setActiveCell(2, 0);
    sheet.setValue(2, 0, 9);
    (sheet as unknown as { _autoExpandTables(r: number, c: number): void })._autoExpandTables(2, 0);
    expect(table.range().rowCount).toBe(3);
    expect(sheet.getValue(2, 0)).toBe(9);
  });

  it('exposes the 60 built-in table themes', () => {
    expect(AnyThemes.medium2).toBeDefined();
    expect(AnyThemes.light21).toBeDefined();
    expect(TableThemes.dark11).toBeDefined();
    expect((TableThemes as unknown as { professional1?: unknown }).professional1).toBeUndefined();
    const tokens = (TableThemes as unknown as { medium2: { toJSON(): { name: string } } }).medium2.toJSON();
    expect(tokens.name).toBe('Medium2');
    expect(JSON.stringify(tokens)).toContain('Accent 1 20');
  });

  it('returns table banding and border styles from actual styles', () => {
    const sheet = sheetWithValues([
      ['H1', 'H2'],
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    sheet.tables.add('T', 0, 0, 4, 2, AnyThemes.medium2);
    expect(sheet.getActualStyle(1, 0).backColor).toBeTruthy();
    expect(sheet.getActualStyle(1, 0).backColor).not.toBe(sheet.getActualStyle(2, 0).backColor);
    expect(sheet.getActualStyle(0, 0).font).toBeTruthy();
  });

  it('removes tables and exposes columns', () => {
    const sheet = sheetWithValues([['A', 'B'], [1, 2]]);
    const table = sheet.tables.add('T', 0, 0, 2, 2, AnyThemes.light1);
    table.setColumnName(1, 'Renamed');
    expect(table.getColumnName(1)).toBe('Renamed');
    sheet.tables.remove('T', 0);
    expect(sheet.tables.all()).toHaveLength(0);
    expect((sheet.getCellType(1, 0) as { typeName: string }).typeName).toBe('1');
  });
});

describe('filters', () => {
  it('filters, reports hidden rows and resets', () => {
    const sheet = sheetWithValues([['Name'], ['Alpha'], ['Beta'], ['Gamma']]);
    const filter = new SS.Filter.HideRowFilter(new Range(0, 0, 4, 1));
    sheet.rowFilter(filter);
    expect(sheet.rowFilter()).toBe(filter);
    expect(filter.addFilterItem(0, new SS.ConditionalFormatting.Condition(1, { compareType: 0, expected: 'Beta' }))).toBeUndefined();
    filter.filter(0);
    expect(filter.isRowFilteredOut(1)).toBe(true);
    expect(filter.isRowFilteredOut(2)).toBe(false);
    filter.unfilter(0);
    expect(filter.isRowFilteredOut(1)).toBe(false);
    filter.filter(0);
    filter.reset();
    expect(filter.isFiltered(0)).toBe(false);
  });

  it('sorts values and styles but keeps formulas in place', () => {
    const sheet = sheetWithValues([['N'], [3], [1], [2]]);
    sheet.setFormula(1, 1, '=A2');
    sheet.setFormula(2, 1, '=A3');
    sheet.setFormula(3, 1, '=A4');
    sheet.getCell(1, 0).backColor('red');
    const filter = new SS.Filter.HideRowFilter(new Range(0, 0, 4, 1));
    sheet.rowFilter(filter);
    sheet.sortRange(1, 0, 3, 1, true, [{ index: 0, ascending: true }]);
    expect([0, 1, 2].map((r) => sheet.getValue(1 + r, 0))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((r) => sheet.getFormula(r, 1))).toEqual(['A2', 'A3', 'A4']);
    expect(sheet.getCell(3, 0).backColor()).toBe('red');
  });

  it('round-trips row filter JSON', () => {
    const sheet = sheetWithValues([['A'], [1], [2], [3]]);
    const filter = new SS.Filter.HideRowFilter(new Range(0, 0, 4, 1));
    filter.addFilterItem(0, new SS.ConditionalFormatting.Condition(1, { compareType: 0, expected: 2 }));
    sheet.rowFilter(filter);
    const json = filter.toJSON();
    const copy = new SS.Filter.HideRowFilter();
    copy.fromJSON(JSON.parse(JSON.stringify(json)));
    expect(copy.range).toMatchObject({ row: 0, col: 0, rowCount: 4, colCount: 1 });
    expect(copy.getFilterItems(0)).toHaveLength(1);
  });
});

describe('conditional formatting', () => {
  it('evaluates cell value rules and tracks priority', () => {
    const sheet = sheetWithValues([[1], [5], [10]]);
    const style = new Style();
    style.backColor = 'yellow';
    const low = sheet.conditionalFormats.addCellValueRule(0, 1, null, style, [new Range(0, 0, 3, 1)]);
    const high = sheet.conditionalFormats.addCellValueRule(0, 8, null, style, [new Range(0, 0, 3, 1)]);
    expect(low.priority()).toBe(2);
    expect(high.priority()).toBe(1);
    expect(sheet.conditionalFormats.getRule(0)?.priority()).toBe(2);
    expect(sheet.conditionalFormats.getRules().length).toBe(2);
    expect(sheet.getActualStyle(0, 0).backColor).toBe('yellow');
  });

  it('removes rules contained in a range and shifts on insert', () => {
    const sheet = sheetWithValues([[1], [2]]);
    const style = new Style();
    style.backColor = 'red';
    sheet.conditionalFormats.addCellValueRule(0, 1, null, style, [new Range(0, 0, 2, 1)]);
    expect(sheet.conditionalFormats.getRules().length).toBe(1);
    sheet.conditionalFormats.removeRuleByRange(0, 0, 1, 1);
    expect(sheet.conditionalFormats.getRules().length).toBe(1);
    sheet.conditionalFormats.removeRuleByRange(0, 0, 2, 1);
    expect(sheet.conditionalFormats.getRules().length).toBe(0);
  });

  it('computes scale fills and data bar fractions', () => {
    const sheet = sheetWithValues([[5], [10], [15], [20], [25]]);
    const scale = sheet.conditionalFormats.add3ScaleRule(
      0,
      5,
      '#ff0000',
      0,
      15,
      '#ffff00',
      0,
      25,
      '#00ff00',
      [new Range(0, 0, 5, 1)],
    );
    const cf = sheet.conditionalFormats as unknown as {
      _visualFor(r: number, c: number, v: unknown): { backColor?: string; bar?: { fraction: number } };
    };
    expect(cf._visualFor(2, 0, 15).backColor).toMatch(/^rgba\(/);
    expect(scale.toJSON().ranges).toHaveLength(1);

    const bar = sheet.conditionalFormats.addDataBarRule(0, 5, 0, 25, '#638ec6', [new Range(0, 0, 5, 1)]);
    expect(cf._visualFor(1, 0, 10).bar?.fraction).toBeCloseTo(0.25);
    expect(cf._visualFor(4, 0, 25).bar?.fraction).toBe(1);
    expect(bar.toJSON()).toMatchObject({ ruleType: expect.any(Number), ranges: [expect.objectContaining({ row: 0, col: 0 })] });
  });

  it('chooses icon set indices', () => {
    const sheet = sheetWithValues([[10], [50], [90]]);
    const rule = sheet.conditionalFormats.addIconSetRule(0, [new Range(0, 0, 3, 1)]);
    const cf = sheet.conditionalFormats as unknown as {
      _visualFor(r: number, c: number, v: unknown): { icon?: { iconIndex: number } };
    };
    expect(cf._visualFor(0, 0, 10).icon?.iconIndex).toBe(0);
    expect(cf._visualFor(2, 0, 90).icon?.iconIndex).toBe(2);
    expect(rule.toJSON().iconCriteria).toHaveLength(2);
  });
});

describe('data validation', () => {
  it('validates lists and round-trips JSON', () => {
    const sheet = new Workbook().getActiveSheet();
    const validator = SS.DataValidation.createListValidator('A,B,C');
    sheet.setDataValidator(0, 0, validator);
    expect(sheet.isValid(0, 0, 'B')).toBe(true);
    expect(sheet.isValid(0, 0, 'Z')).toBe(false);
    const json = validator.toJSON();
    const parsed = new SS.DataValidation.DefaultDataValidator();
    parsed.fromJSON(json as object);
    expect(parsed.getValidList(sheet, 0, 0)).toEqual(['A', 'B', 'C']);
    expect((sheet.toJSON().validations as unknown[]).length).toBe(1);
  });

  it('validates numbers between bounds', () => {
    const sheet = new Workbook().getActiveSheet();
    const validator = SS.DataValidation.createNumberValidator(6, 1, 10, false);
    sheet.setDataValidator(0, 0, validator);
    expect(sheet.isValid(0, 0, 5)).toBe(true);
    expect(sheet.isValid(0, 0, 11)).toBe(false);
    expect(validator.type()).toBe(2);
  });

  it('validates dates and times', () => {
    const sheet = new Workbook().getActiveSheet();
    const date = SS.DataValidation.createDateValidator(3, new Date(2020, 0, 1));
    const time = SS.DataValidation.createTimeValidator(3, new Date(2020, 0, 1, 12));
    sheet.setDataValidator(0, 0, date);
    sheet.setDataValidator(1, 0, time);
    expect(sheet.isValid(0, 0, new Date(2020, 5, 1))).toBe(true);
    expect(sheet.isValid(0, 0, new Date(2019, 5, 1))).toBe(false);
    expect(sheet.isValid(1, 0, new Date(2020, 0, 1, 13))).toBe(true);
    expect(sheet.isValid(1, 0, new Date(2020, 0, 1, 11))).toBe(false);
  });

  it('stores validators per range and merges records', () => {
    const sheet = new Workbook().getActiveSheet();
    const validator = SS.DataValidation.createListValidator('x,y');
    sheet.setDataValidator(1, 1, 3, 2, validator);
    expect(sheet.getDataValidator(2, 2)).toBe(validator);
    expect(sheet.getDataValidator(0, 0)).toBeNull();
  });
});

describe('cell types', () => {
  it('round-trips checkbox, button, combo and hyperlink types', () => {
    const CT = SS.CellTypes;
    const checkbox = new CT.CheckBox();
    checkbox.caption('Accept');
    checkbox.isThreeState(true);
    const button = new CT.Button();
    button.text('Go');
    const combo = new CT.ComboBox();
    combo.items(['One', 'Two']);
    const link = new CT.HyperLink();
    link.linkColor('#123456');
    for (const type of [checkbox, button, combo, link]) {
      expect(JSON.stringify(type.toJSON())).toContain('typeName');
      expect(JSON.stringify(type.toJSON())).toContain(type.typeName);
    }
  });

  it('normalises list items and keeps custom Base extensibility', () => {
    const CT = SS.CellTypes;
    const radio = new CT.RadioButtonList();
    radio.items(['A', 'B']);
    radio.direction(1);
    const json = radio.toJSON();
    expect(json.items).toEqual([
      { text: 'A', value: 'A' },
      { text: 'B', value: 'B' },
    ]);
    class Custom extends CT.Base {}
    const custom = new Custom();
    custom.typeName = 'custom-type';
    expect(custom.typeName).toBe('custom-type');
    expect(custom.paint).toBeTypeOf('function');
    expect(custom.getHitInfo(0, 0, new Style(), { x: 0, y: 0, width: 0, height: 0 })).toBeNull();
  });

  it('stores cell types per cell and serialises them', () => {
    const sheet = new Worksheet('C');
    const checkbox = new SS.CellTypes.CheckBox();
    sheet.setCellType(0, 0, checkbox);
    sheet.setValue(0, 0, true);
    expect(sheet.getCellType(0, 0)).toBe(checkbox);
    expect(JSON.stringify(sheet.toJSON())).toContain('cellType');
    sheet.setCellType(0, 0, null);
    expect((sheet.getCellType(0, 0) as { typeName: string }).typeName).toBe('1');
  });
});

describe('comments', () => {
  it('adds, reads, moves and serialises comments', () => {
    const sheet = new Worksheet('Notes');
    sheet.comments.add(1, 1, 'hello');
    const comment = sheet.comments.get(1, 1)!;
    expect(comment.text()).toBe('hello');
    expect(comment.backColor()).toBe('#FFFFE1');
    comment.text('updated');
    sheet.comments.add(2, 2, 'other');
    sheet.comments.remove(2, 2);
    expect(sheet.comments.get(2, 2)).toBeNull();
    const json = sheet.toJSON() as { comments: unknown[] };
    expect(json.comments).toHaveLength(1);
    expect(JSON.stringify(json.comments[0])).toContain('commentState');
    sheet.comments.remove(1, 1);
    expect(sheet.comments.all()).toHaveLength(0);
  });

  it('shifts comments on row insertion', () => {
    const sheet = new Worksheet('Notes');
    sheet.comments.add(2, 0, 'moved');
    sheet.addRows(1, 1);
    expect(sheet.comments.get(3, 0)?.text()).toBe('moved');
  });
});

describe('hyperlinks', () => {
  it('stores and serialises hyperlinks', () => {
    const sheet = new Worksheet('Links');
    sheet.setValue(0, 0, 'Example');
    sheet.setHyperlink(0, 0, { url: 'https://example.com', tooltip: 'go' });
    expect(sheet.getHyperlink(0, 0)).toMatchObject({ url: 'https://example.com', tooltip: 'go' });
    expect(JSON.stringify(sheet.toJSON())).toContain('example.com');
    sheet.setHyperlink(0, 0, null);
    expect(sheet.getHyperlink(0, 0)).toBeNull();
  });
});

describe('outlines', () => {
  it('groups rows, collapses and serialises outline info', () => {
    const sheet = new Worksheet('O');
    sheet.rowOutlines.group(2, 3);
    sheet.rowOutlines.group(7, 2);
    sheet.rowOutlines.setCollapsed(7, true);
    expect(sheet.rowOutlines.getLevel(2)).toBe(0);
    expect(sheet.rowOutlines.getMaxLevel()).toBe(0);
    expect(sheet.rowOutlines.isCollapsed(7)).toBe(true);
    const json = sheet.rowOutlines.toJSON() as { items: unknown[]; itemsData: unknown[] };
    expect(json.items[9]).toMatchObject({ level: -1, collapsed: true });
    expect(json.itemsData.length).toBeGreaterThan(0);
    sheet.rowOutlines.ungroupRange(2, 3);
    expect(sheet.rowOutlines.getLevel(2)).toBe(-1);
  });

  it('groups columns independently', () => {
    const sheet = new Worksheet('O');
    sheet.columnOutlines.group(1, 2);
    expect(sheet.columnOutlines.getLevel(1)).toBe(0);
    expect((sheet.toJSON().columnOutlines as { items: unknown[] }).items[1]).toMatchObject({ level: 0 });
  });
});

describe('structured references', () => {
  it('resolves table names and column references', () => {
    const sheet = sheetWithValues([
      ['Item', 'Qty'],
      ['A', 2],
      ['B', 3],
    ]);
    sheet.tables.add('T', 0, 0, 3, 2, AnyThemes.light1);
    sheet.setFormula(5, 0, '=SUM(T[Qty])');
    sheet.setFormula(6, 0, '=COUNTA(T[Item])');
    expect(sheet.getValue(5, 0)).toBe(5);
    expect(sheet.getValue(6, 0)).toBe(2);
  });

  it('rejects unknown table columns', () => {
    const sheet = sheetWithValues([['A'], [1]]);
    sheet.tables.add('T', 0, 0, 2, 1, AnyThemes.light1 as unknown as string);
    expect(() => sheet.setFormula(3, 0, '=T[Missing]')).toThrow(/Formula/i);
  });
});

describe('M4 events', () => {
  it('emits comment and validation events', () => {
    const workbook = new Workbook();
    const sheet = workbook.getActiveSheet();
    const comments: string[] = [];
    sheet.bind(SS.Events.CommentChanged, () => comments.push('changed'));
    sheet.bind(SS.Events.CommentRemoving, () => comments.push('removing'));
    sheet.bind(SS.Events.CommentRemoved, () => comments.push('removed'));
    sheet.comments.add(0, 0, 'x');
    sheet.comments.remove(0, 0);
    expect(comments).toEqual(['changed', 'removing', 'removed']);

    let validationError = 0;
    sheet.bind(SS.Events.ValidationError, () => validationError++);
    sheet.setDataValidator(1, 0, SS.DataValidation.createNumberValidator(6, 1, 10));
    workbook.commandManager().execute({ cmd: 'editCell', sheetName: sheet.name(), row: 1, col: 0, newValue: 99 });
    expect(validationError).toBe(1);
  });

  it('emits filter and table row-change events', () => {
    const workbook = new Workbook();
    const sheet = workbook.getActiveSheet();
    sheet.setValue(0, 0, 'H');
    sheet.setValue(1, 0, 'b');
    sheet.setValue(2, 0, 'a');
    const filter = new SS.Filter.HideRowFilter(new Range(0, 0, 3, 1));
    sheet.rowFilter(filter);
    const events: string[] = [];
    sheet.bind(SS.Events.RangeFiltering, () => events.push('filtering'));
    sheet.bind(SS.Events.RangeFiltered, () => events.push('filtered'));
    filter.filter(0);
    expect(events).toEqual(['filtering', 'filtered']);

    sheet.setValue(5, 0, 'Head');
    sheet.setValue(6, 0, 1);
    const table = sheet.tables.add('Auto', 5, 0, 2, 1, AnyThemes.light1);
    let rowsChanged = 0;
    sheet.bind(SS.Events.TableRowsChanged, () => rowsChanged++);
    workbook.commandManager().execute({ cmd: 'editCell', sheetName: sheet.name(), row: 7, col: 0, newValue: 2 });
    expect(table.range().rowCount).toBe(3);
    expect(rowsChanged).toBe(1);
  });
});

describe('M3 gap fixes', () => {
  it('re-points formulas when cells move', () => {
    const sheet = new Workbook().getActiveSheet();
    sheet.setValue(0, 0, 2);
    sheet.setFormula(0, 1, '=A1*2');
    expect(sheet.getValue(0, 1)).toBe(4);
    sheet.moveTo(0, 0, 1, 0, 1, 1);
    expect(sheet.getFormula(0, 1)).toBe('A2*2');
    expect(sheet.getValue(0, 1)).toBe(4);
  });

  it('clears dependent results after clearing data', () => {
    const sheet = new Workbook().getActiveSheet();
    sheet.setValue(0, 0, 4);
    sheet.setFormula(0, 1, '=A1+1');
    expect(sheet.getValue(0, 1)).toBe(5);
    sheet.clear(0, 0, 1, 1, SS.SheetArea.viewport, SS.StorageType.data);
    expect(sheet.getValue(0, 0)).toBeNull();
    expect(sheet.getValue(0, 1)).toBe(1);
  });

  it('shifts dynamic spill ranges on insertion', () => {
    const workbook = new Workbook();
    workbook.options.allowDynamicArray = true;
    const sheet = workbook.getActiveSheet();
    sheet.setFormula(0, 1, '=SEQUENCE(3,1)');
    expect(sheet.getValue(0, 1)).toBe(1);
    sheet.addRows(1, 1);
    expect(sheet.getValue(0, 1)).toBe(1);
    expect(sheet.getValue(1, 1)).toBe(2);
    expect(sheet.getValue(2, 1)).toBe(3);
    expect(sheet.getValue(3, 1)).toBeNull();
  });

  it('approximates two-tailed t quantiles', () => {
    const sheet = new Workbook().getActiveSheet();
    sheet.setFormula(0, 0, '=T.INV.2T(0.05,10)');
    const value = sheet.getValue(0, 0) as number;
    expect(value).toBeCloseTo(2.22813884482571, 9);
  });
});
