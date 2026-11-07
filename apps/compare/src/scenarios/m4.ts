import GC from '@opensheets/spread-sheets';
import type { Scenario } from './index.js';

type Sheet = GC.Spread.Sheets.Worksheet;
type Library = typeof GC;
export function libraryFor(sheet: Sheet): Library {
  if (typeof window === 'undefined') return GC;
  const scope = window as unknown as {
    __compare?: { official?: unknown; ours?: unknown };
    __referenceGC?: Library;
    __implementationGC?: Library;
  };
  const workbook = (sheet as unknown as { getParent(): unknown }).getParent();
  return scope.__compare?.official === workbook ? scope.__referenceGC! : scope.__implementationGC!;
}
function scenario(name: string, title: string, run: (sheet: Sheet, library: Library) => void, glyphCells?: Scenario['glyphCells']): Scenario {
  return {
    name,
    title,
    sheetCount: 1,
    glyphCells,
    run(workbook) {
      const sheet = workbook.getActiveSheet() as unknown as Sheet;
      run(sheet, libraryFor(sheet));
      // The trial only applies table/CF layout styles after an explicit refresh.
      (sheet.getParent() as unknown as { refresh?: () => void }).refresh?.();
    },
  };
}

const iconGlyph = (row: number, col: number) => ({ row, col, x: 1, y: 2, width: 18, height: 16 });
const filterGlyph = (row: number, col: number) => ({ row, col, x: -20, y: -19, width: 18, height: 17 });
const iconGalleryGlyphCells: Scenario['glyphCells'] = Array.from({ length: 20 }, (_, index) =>
  Array.from({ length: 5 }, (_, r) => iconGlyph((index % 4) * 6 + r, 1 + Math.floor(index / 4) * 2))).flat();
const tableThemeGlyphCells: Scenario['glyphCells'] = [0, 5, 10, 15, 20].flatMap(row =>
  [0, 1, 2, 5, 6, 7].map(col => filterGlyph(row, col)));

export const dataFeatureScenarios: Scenario[] = [
  scenario('m4-tables-basic', 'Tables with styles', (s, G) => {
    s.setValue(0, 0, 'Item'); s.setValue(0, 1, 'Qty'); s.setValue(0, 2, 'Price');
    s.setValue(1, 0, 'Pen'); s.setValue(1, 1, 3); s.setValue(1, 2, 1.5);
    s.setValue(2, 0, 'Pad'); s.setValue(2, 1, 5); s.setValue(2, 2, 2.25);
    s.setValue(3, 0, 'Ink'); s.setValue(3, 1, 2); s.setValue(3, 2, 4);
    const t = s.tables.add('Sales', 0, 0, 4, 3, G.Spread.Sheets.Tables.TableThemes.medium2);
    t.showFooter(true);
    t.setColumnFormula(1, 'SUBTOTAL(109,[Qty])');
    s.setColumnWidth(0, 90); s.setColumnWidth(1, 70); s.setColumnWidth(2, 80);
    for (let r = 0; r < 4; r++) s.setRowHeight(r, 24);
    const t2 = s.tables.add('Stock', 6, 0, 4, 3, G.Spread.Sheets.Tables.TableThemes.light1);
    t2.bandColumns(true);
    t2.setColumnName(0, 'Name'); t2.setColumnName(1, 'Count'); t2.setColumnName(2, 'Cost');
    for (let r = 1; r < 4; r++) { s.setValue(6 + r, 0, `Row ${r}`); s.setValue(6 + r, 1, r * 2); s.setValue(6 + r, 2, r * 3); }
    for (let r = 6; r < 10; r++) s.setRowHeight(r, 24);
  }, [0, 6].flatMap(row => [0, 1, 2].map(col => filterGlyph(row, col)))),
  scenario('m4-table-themes', 'Table theme gallery', (s, G) => {
    const names = ['light1', 'light9', 'light18', 'medium2', 'medium9', 'medium16', 'medium28', 'dark1', 'dark5', 'dark11'] as const;
    names.forEach((name, index) => {
      const row = Math.floor(index / 2) * 5;
      const col = (index % 2) * 5;
      const theme = (G.Spread.Sheets.Tables.TableThemes as unknown as Record<string, GC.Spread.Sheets.Tables.TableTheme>)[name]!;
      const table = s.tables.add(`Theme${index}`, row, col, 3, 3, theme);
      table.setColumnName(0, 'A'); table.setColumnName(1, 'B'); table.setColumnName(2, 'C');
      for (let r = 1; r < 3; r++) for (let c = 0; c < 3; c++) s.setValue(row + r, col + c, `${r}${c}`);
      for (let r = row; r < row + 3; r++) s.setRowHeight(r, 22);
    });
    for (let c = 0; c < 10; c++) s.setColumnWidth(c, c % 5 === 4 ? 30 : 62);
  }, tableThemeGlyphCells),
  scenario('m4-filter-buttons', 'Filter buttons and hidden rows', (s, G) => {
    s.setValue(0, 0, 'Name'); s.setValue(0, 1, 'Amount');
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
    names.forEach((name, i) => { s.setValue(i + 1, 0, name); s.setValue(i + 1, 1, (i + 1) * 10); });
    const filter = new G.Spread.Sheets.Filter.HideRowFilter(new G.Spread.Sheets.Range(0, 0, names.length + 1, 2));
    s.rowFilter(filter);
    filter.addFilterItem(0, G.Spread.Sheets.ConditionalFormatting.Condition.fromSource('Name,alpha,beta,gamma'));
    filter.filter();
    const table = s.tables.add('Filtered', 10, 0, names.length + 1, 2, G.Spread.Sheets.Tables.TableThemes.medium4);
    for (let i = 0; i <= names.length; i++) { s.setValue(10 + i, 0, i === 0 ? 'Name' : names[i - 1]); s.setValue(10 + i, 1, i * 5); }
    table.filterButtonVisible(1, false);
  }, [filterGlyph(10, 0)]),
  scenario('m4-cf-rules', 'Conditional formatting rules', (s, G) => {
    const CF = G.Spread.Sheets.ConditionalFormatting;
    for (let r = 0; r < 12; r++) {
      s.setValue(r, 0, r * 5 + 1);
      s.setValue(r, 2, r + 1);
      s.setValue(r, 4, [5, 12, 3, 18, 7, 25, 9, 1, 14, 20, 6, 11][r]);
    }
    s.getCell(0, 6).value('Text'); s.getCell(1, 6).value('contains'); s.getCell(2, 6).value('Text sample');
    const red = new G.Spread.Sheets.Style(); red.backColor = '#ffc7ce'; red.foreColor = '#9c0006';
    s.conditionalFormats.addCellValueRule(CF.ComparisonOperators.greaterThan, 30, 0, red, [new G.Spread.Sheets.Range(0, 0, 12, 1)]);
    s.conditionalFormats.add2ScaleRule(CF.ScaleValueType.lowestValue, 0, '#f8696b', CF.ScaleValueType.highestValue, 0, '#63be7b', [new G.Spread.Sheets.Range(0, 2, 12, 1)]);
    s.conditionalFormats.add3ScaleRule(CF.ScaleValueType.lowestValue, 0, '#f8696b', CF.ScaleValueType.percentile, 50, '#ffeb84', CF.ScaleValueType.highestValue, 0, '#63be7b', [new G.Spread.Sheets.Range(0, 4, 12, 1)]);
    s.conditionalFormats.addDataBarRule(CF.ScaleValueType.automin, 0, CF.ScaleValueType.automax, 0, '#638ec6', [new G.Spread.Sheets.Range(0, 4, 12, 1)]);
    s.conditionalFormats.addFormulaRule('$G$1="Text"', red, [new G.Spread.Sheets.Range(0, 6, 3, 1)]);
    s.conditionalFormats.addIconSetRule(CF.IconSetType.threeArrowsColored, [new G.Spread.Sheets.Range(0, 8, 4, 1)]);
    s.conditionalFormats.addIconSetRule(CF.IconSetType.fourTrafficLights, [new G.Spread.Sheets.Range(4, 8, 4, 1)]);
    s.conditionalFormats.addIconSetRule(CF.IconSetType.fiveRatings, [new G.Spread.Sheets.Range(8, 8, 4, 1)]);
    for (let r = 0; r < 12; r++) for (let c = 8; c < 9; c++) s.setValue(r, c, (r * 37) % 100);
    s.setColumnWidth(4, 100); s.setColumnWidth(6, 110);
  }, Array.from({ length: 12 }, (_, row) => iconGlyph(row, 8))),
  scenario('m4-cf-databars', 'Data bar scaling', (s, G) => {
    const CF = G.Spread.Sheets.ConditionalFormatting;
    const values = [1, 2, 3, 4, 5, 10, 25];
    values.forEach((v, r) => { s.setValue(r, 0, v); s.setValue(r, 2, v); s.getCell(r, 0).backColor('#fde9e9'); s.getCell(r, 2).backColor('#fde9e9'); });
    s.conditionalFormats.addDataBarRule(CF.ScaleValueType.automin, 0, CF.ScaleValueType.automax, 0, '#638ec6', [new G.Spread.Sheets.Range(0, 0, values.length, 1)]);
    s.conditionalFormats.addDataBarRule(CF.ScaleValueType.number, 0, CF.ScaleValueType.number, 10, '#63be7b', [new G.Spread.Sheets.Range(0, 2, values.length, 1)]);
    s.setColumnWidth(0, 100); s.setColumnWidth(2, 100);
  }),
  scenario('m4-icon-sets-gallery', 'All icon set rule types', (s, G) => {
    const CF = G.Spread.Sheets.ConditionalFormatting;
    const types = [
      CF.IconSetType.threeArrowsColored, CF.IconSetType.threeArrowsGray, CF.IconSetType.threeTriangles,
      CF.IconSetType.threeStars, CF.IconSetType.threeFlags, CF.IconSetType.threeTrafficLightsUnrimmed,
      CF.IconSetType.threeTrafficLightsRimmed, CF.IconSetType.threeSigns, CF.IconSetType.threeSymbolsCircled,
      CF.IconSetType.threeSymbolsUncircled, CF.IconSetType.fourArrowsColored, CF.IconSetType.fourArrowsGray,
      CF.IconSetType.fourRedToBlack, CF.IconSetType.fourRatings, CF.IconSetType.fourTrafficLights,
      CF.IconSetType.fiveArrowsColored, CF.IconSetType.fiveArrowsGray, CF.IconSetType.fiveRatings,
      CF.IconSetType.fiveQuarters, CF.IconSetType.fiveBoxes,
    ];
    types.forEach((type, index) => {
      const row = (index % 4) * 6;
      const col = 1 + Math.floor(index / 4) * 2;
      for (let r = 0; r < 5; r++) s.setValue(row + r, col, (r + 1) * 18);
      s.conditionalFormats.addIconSetRule(type, [new G.Spread.Sheets.Range(row, col, 5, 1)]);
      for (let r = row; r < row + 5; r++) s.setRowHeight(r, 20);
    });
    for (let c = 0; c < 11; c++) s.setColumnWidth(c, c % 2 === 0 ? 30 : 60);
  }, iconGalleryGlyphCells),
  scenario('m4-validation', 'Data validation dropdowns and invalid circles', (s, G) => {
    s.getParent().options.highlightInvalidData = true;
    const DV = G.Spread.Sheets.DataValidation;
    const CF = G.Spread.Sheets.ConditionalFormatting;
    s.setValue(0, 0, 'Status'); s.setValue(1, 0, 'Open'); s.setValue(2, 0, 'Closed'); s.setValue(3, 0, 'On hold');
    s.setDataValidator(1, 0, DV.createListValidator('Open,Closed,On hold,Pending'));
    s.setDataValidator(2, 1, DV.createNumberValidator(CF.ComparisonOperators.between, 1, 10, true));
    s.setValue(1, 1, 5); s.setValue(2, 1, 42); s.setValue(3, 1, 0.5);
    const d = DV.createListValidator('one,two,three');
    d.highlightStyle({ type: DV.HighlightType.circle, color: '#ff0000', position: DV.HighlightPosition.topRight });
    s.setDataValidator(4, 0, d);
    s.setValue(4, 0, 'four');
    s.setDataValidator(5, 0, DV.createDateValidator(CF.ComparisonOperators.greaterThan, new Date(2020, 0, 1)));
    s.setValue(5, 0, new Date(2019, 5, 5));
    s.setColumnWidth(0, 110);
    s.setActiveCell(1, 0);
  }, []),
  scenario('m4-cell-types', 'Cell types', (s, G) => {
    const CT = G.Spread.Sheets.CellTypes;
    s.setValue(0, 0, 'Cell types');
    s.getCell(0, 0).font('bold 12pt Calibri');
    const cb = new CT.CheckBox(); cb.caption('Check'); s.setValue(1, 0, true); s.setCellType(1, 0, cb);
    const cb3 = new CT.CheckBox(); cb3.isThreeState(true); cb3.textTrue('Yes'); cb3.textFalse('No'); cb3.textIndeterminate('Maybe');
    s.setCellType(2, 0, cb3); s.setValue(2, 0, null);
    const button = new CT.Button(); button.text('Click'); button.buttonBackColor('#e7eef7');
    s.setCellType(3, 0, button);
    const combo = new CT.ComboBox(); combo.items(['Red', 'Green', 'Blue']); combo.editable(true);
    s.setCellType(4, 0, combo); s.setValue(4, 0, 'Green');
    const link = new CT.HyperLink(); link.text('Open site');
    s.setCellType(5, 0, link);
    const cbl = new CT.CheckBoxList(); cbl.items(['A', 'B', 'C']); s.setCellType(1, 2, cbl);
    const rbl = new CT.RadioButtonList(); rbl.items(['One', 'Two']); s.setCellType(2, 2, rbl); s.setValue(2, 2, 'Two');
    const bl = new CT.ButtonList(); bl.items(['Left', 'Center', 'Right']); s.setCellType(3, 2, bl); s.setValue(3, 2, 'Center');
    s.setColumnWidth(0, 130); s.setColumnWidth(2, 150);
    for (let r = 0; r < 6; r++) s.setRowHeight(r, 26);
  }, [
    ...[1, 2].map(row => ({ row, col: 0, x: 4, y: 4, width: 15, height: 15 })),
    { row: 4, col: 0, x: -18, y: 1, width: 17, height: 24 },
    ...[1, 48, 95].map(x => ({ row: 1, col: 2, x, y: 3, width: 13, height: 13 })),
    ...[1, 63].map(x => ({ row: 2, col: 2, x, y: 2, width: 13, height: 13 })),
  ]),
  scenario('m4-comments', 'Comment indicators and notes', (s, G) => {
    s.setValue(1, 1, 'Cell with note');
    s.setValue(3, 1, 'Always shown');
    s.setValue(5, 1, 'Another note');
    s.comments.add(1, 1, 'This is a cell note.');
    const shown = s.comments.add(3, 1, 'This note is always visible in the sheet.');
    shown.displayMode(G.Spread.Sheets.Comments.DisplayMode.alwaysShown);
    shown.width(180); shown.height(70);
    s.comments.add(5, 1, 'Indicator only');
    s.setColumnWidth(1, 140);
    for (let r = 0; r < 7; r++) s.setRowHeight(r, 24);
  }, [1, 5].map(row => ({ row, col: 1, x: -7, y: 0, width: 7, height: 7 }))),
  scenario('m4-hyperlinks', 'Hyperlink cell rendering', (s, G) => {
    s.setValue(1, 1, 'Example');
    s.setHyperlink(1, 1, { url: 'https://example.com', tooltip: 'Example site' });
    s.setValue(3, 1, 'Underline off');
    s.setHyperlink(3, 1, { url: 'https://example.com', drawUnderline: false, linkColor: '#ff0000' });
    const CT = G.Spread.Sheets.CellTypes;
    const link = new CT.HyperLink(); link.text('Cell type link'); link.linkColor('#008000');
    s.setCellType(5, 1, link);
    s.setColumnWidth(1, 160);
  }),
  scenario('m4-outlines', 'Row and column outlines', (s) => {
    for (let r = 0; r < 12; r++) for (let c = 0; c < 8; c++) s.setValue(r, c, `${r + 1},${c + 1}`);
    s.rowOutlines.group(2, 3);
    s.rowOutlines.group(7, 2);
    s.rowOutlines.setCollapsed(7, true);
    s.columnOutlines.group(2, 2);
    s.columnOutlines.group(5, 2);
    s.setColumnWidth(0, 60);
  }),
];
