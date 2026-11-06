import GC from '@opensheets/spread-sheets';
import type { Scenario } from './index.js';
const { LineBorder } = GC.Spread.Sheets;
function scenario(name: string, title: string, run: (sheet: GC.Spread.Sheets.Worksheet) => void, sheetCount = 1): Scenario {
  return { name, title, sheetCount, run(workbook) { run(workbook.getActiveSheet() as unknown as GC.Spread.Sheets.Worksheet); } };
}
export const renderingScenarios: Scenario[] = [
  scenario('styles-borders', 'Alignment, formatting and borders', s => {
    s.setValue(0, 0, 'Styled cells');
    s.setValue(1, 0, 1234.5); s.getCell(1, 0).formatter('#,##0.00');
    s.setValue(2, 0, true); s.setValue(3, 0, 'Centered'); s.getCell(3, 0).hAlign(1);
    s.setValue(1, 2, 'Custom'); s.getCell(1, 2).backColor('#fff2cc').foreColor('#9c0006').font('bold 12pt Arial');
    s.setValue(3, 2, 'Wrapped words in a small cell'); s.getCell(3, 2).wordWrap(true); s.setRowHeight(3, 60);
    s.setValue(4, 2, 'Shrink this long text'); s.getCell(4, 2).shrinkToFit(true);
    s.setValue(5, 2, 'Indent'); s.getCell(5, 2).textIndent(1);
    for (let i = 1; i <= 13; i++) {
      s.setValue(i + 6, 0, i); s.getCell(i + 6, 1).borderBottom(new LineBorder('#336699', i as GC.Spread.Sheets.LineStyle));
    }
  }),
  scenario('merged', 'Merged cells', s => {
    s.addSpan(1, 1, 3, 3); s.setValue(1, 1, 'Merged title'); s.getCell(1, 1).backColor('#e2f0d9').hAlign(1).vAlign(1);
    s.addSpan(6, 0, 1, 4); s.setValue(6, 0, 'A wide merged cell');
  }),
  scenario('frozen', 'Leading and trailing frozen panes', s => {
    for (let r = 0; r < 40; r++) for (let c = 0; c < 12; c++) s.setValue(r, c, `${r + 1}:${c + 1}`);
    s.frozenRowCount(2); s.frozenColumnCount(1); s.frozenTrailingRowCount(1); s.frozenTrailingColumnCount(1);
    s.setValue(199, 19, 'Last');
  }),
  scenario('overflow', 'Wide text overflow', s => {
    s.setValue(0, 0, 'Wide text flows through empty neighbouring cells');
    s.setValue(2, 0, 'Stopped by occupied cell'); s.setValue(2, 2, 'Stop');
    s.setValue(4, 2, 'Right aligned overflow'); s.getCell(4, 2).hAlign(2);
    s.setValue(6, 2, 'Centered text overflow'); s.getCell(6, 2).hAlign(1);
    s.setValue(8, 0, 'Clipped at a styled neighbour'); s.getCell(8, 1).backColor('#fff2cc');
    s.setValue(10, 0, 'A hidden column'); s.setColumnVisible(1, false); s.setRowVisible(9, false);
  }),
  scenario('selection', 'Multiple selected ranges', s => { s.setValue(1, 1, 'Active'); s.setSelection(1, 1, 3, 3); s.addSelection(6, 2, 2, 4); }),
  scenario('editing', 'In-cell editing', s => { s.setValue(1, 1, 'Editing text'); s.setActiveCell(1, 1); s.startEdit(false); }),
  scenario('many-tabs', 'Many worksheet tabs', s => { s.getParent().sheets.forEach((sheet, i) => { sheet.name(`Sheet ${i + 1}`); if (i === 1) sheet.options.sheetTabColor = '#ff0000'; }); }, 12),
  scenario('zoom', 'Zoom 150%', s => { s.setValue(0, 0, 'Zoomed'); s.setValue(1, 1, 123.45); s.zoom(1.5); }),
];
