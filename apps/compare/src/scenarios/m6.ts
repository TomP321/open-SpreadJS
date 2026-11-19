// TASK 56 (pixel phase 3): one scenario per core-rendering feature.
// Each scenario only carries the content needed to exercise that feature.
import type GC from '@opensheets/spread-sheets';
import type { Scenario } from './index.js';
import { libraryFor } from './m4.js';

type Sheet = GC.Spread.Sheets.Worksheet;
type Library = typeof GC;

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

const blue = '#336699';
const red = '#c00000';
const gold = '#fff2cc';
const grey = '#d9d9d9';

// A 7x7 white square with a 5x5 coloured dot sits on the selection's bottom-right corner.
const fillHandleGlyph = (row: number, col: number, width: number, height: number) => ({ row, col, x: width - 8, y: height - 8, width: 12, height: 12 });

export const coreRenderScenarios: Scenario[] = [
  scenario('t56-borders-styles', 'Cell borders: every line style on all four sides', (s, G) => {
    const LineBorder = G.Spread.Sheets.LineBorder, LS = G.Spread.Sheets.LineStyle;
    // 40px columns keep all 14 styles inside the 684px pane (measured with pngjs).
    for (let style = 0; style <= 13; style++) {
      const col = 1 + style;
      s.setColumnWidth(col, 40);
      s.setValue(0, col, style);
      for (let r = 2; r < 5; r++) {
        const border = new LineBorder(blue, style as GC.Spread.Sheets.LineStyle);
        const cell = s.getCell(r, col);
        cell.borderTop(border).borderBottom(border).borderLeft(border).borderRight(border);
      }
    }
    s.setValue(7, 1, 'diagonal');
    for (let r = 8; r < 11; r++) {
      const cell = s.getCell(r, 1);
      cell.value(`diag ${r - 7}`);
      cell.diagonalDown(new LineBorder(blue, LS.thin));
      cell.diagonalUp(new LineBorder(red, LS.mediumDashed));
    }

  }),

  scenario('t56-borders-sets', 'Range borders: outline, inside, per-side, all', (s, G) => {
    for (let r = 1; r < 5; r++) for (let c = 1; c < 6; c++) s.setValue(r, c, `${r}:${c}`);
    s.getRange(1, 1, 4, 5).setBorder(new G.Spread.Sheets.LineBorder(blue, G.Spread.Sheets.LineStyle.medium), { outline: true });
    s.getRange(1, 1, 4, 5).setBorder(new G.Spread.Sheets.LineBorder('#7f7f7f', G.Spread.Sheets.LineStyle.thin), { inside: true });
    for (let r = 6; r < 9; r++) for (let c = 1; c < 6; c++) s.setValue(r, c, `${r}:${c}`);
    s.getRange(6, 1, 3, 2).setBorder(new G.Spread.Sheets.LineBorder(red, G.Spread.Sheets.LineStyle.thick), { left: true, bottom: true });
    s.getRange(6, 4, 3, 2).setBorder(new G.Spread.Sheets.LineBorder('#548235', G.Spread.Sheets.LineStyle.dashed), { top: true, right: true });
    s.getRange(10, 1, 3, 3).setBorder(new G.Spread.Sheets.LineBorder('#8a2be2', G.Spread.Sheets.LineStyle.dashDot), { all: true });
    s.getRange(10, 5, 3, 2).setBorder(new G.Spread.Sheets.LineBorder('#bf8f00', G.Spread.Sheets.LineStyle.hair), { innerHorizontal: true });
    for (let r = 1; r < 13; r++) s.setRowHeight(r, 24);
  }),

  scenario('t56-fonts', 'Fonts: families, weights, decorations, colours', (s, G) => {
    const TD = G.Spread.Sheets.TextDecorationType;
    const samples: [string, string][] = [
      ['11pt Calibri', 'plain Calibri'],
      ['bold 11pt Calibri', 'bold Calibri'],
      ['italic 11pt Calibri', 'italic Calibri'],
      ['bold italic 13pt Arial', 'bold italic Arial'],
      ['14px Georgia', 'Georgia 14px'],
      ['bold 16pt "Times New Roman"', 'serif bold'],
      ['10pt Consolas', 'monospace text'],
      ['12pt Verdana', 'Verdana 12pt'],
    ];
    samples.forEach(([font, text], index) => {
      const cell = s.getCell(1 + index, 1);
      cell.value(text).font(font);
      if (index % 3 === 0) cell.foreColor(red);
    });
    s.setColumnWidth(1, 210);
    const decorations: [string, number][] = [
      ['underline', TD.underline],
      ['strike through', TD.lineThrough],
      ['overline', TD.overline],
      ['double underline', TD.doubleUnderline],
      ['underline + strike', TD.underline + TD.lineThrough],
      ['accounting underline', TD.accountingUnderline],
      ['double accounting underline', TD.doubleAccountingUnderline],
    ];
    decorations.forEach(([label, decoration], index) => {
      const cell = s.getCell(1 + index, 3);
      cell.value(`text ${label}`).font('12pt Calibri').textDecoration(decoration as GC.Spread.Sheets.TextDecorationType);
    });
    s.setValue(9, 3, 'coloured fill + text');
    s.getCell(9, 3).backColor(gold).foreColor('#17365d').font('bold 12pt Arial');
    s.setValue(10, 3, 'grey on light grey');
    s.getCell(10, 3).backColor('#f2f2f2').foreColor('#767171').font('italic 11pt Calibri');
    s.setColumnWidth(3, 190);
  }),

  scenario('t56-alignment', 'Alignment, wrap, indent, shrink, vertical and rotated text', (s, G) => {
    const HA = G.Spread.Sheets.HorizontalAlign, VA = G.Spread.Sheets.VerticalAlign;
    // Four 140px columns: 40 (headers) + 62 + 4 x 140 = 662 = the full pane content width.
    for (let c = 1; c <= 4; c++) s.setColumnWidth(c, 140);
    ([HA.left, HA.center, HA.right, HA.general] as const).forEach((align, index) => {
      const cell = s.getCell(1 + index, 1);
      cell.value(`align ${index}`).hAlign(align);
      cell.borderBottom(new G.Spread.Sheets.LineBorder(grey, G.Spread.Sheets.LineStyle.thin));
    });
    // CenterContinuous/distributed/justify flanked by filled neighbours on both sides, so the
    // trial cannot spread them across columns and the in-cell semantics are what is compared.
    ([HA.centerContinuous, HA.distributed, HA.justify] as const).forEach((align, index) => {
      const cell = s.getCell(9 + index, 1);
      cell.value(`align ${index + 4}`).hAlign(align);
      s.setValue(9 + index, 2, `nb ${index}`);
      s.setValue(9 + index, 3, `nb ${index + 4}`);
    });
    ([VA.top, VA.center, VA.bottom, VA.justify] as const).forEach((align, index) => {
      const cell = s.getCell(1 + index, 2);
      cell.value(`vAlign ${index}`).vAlign(align);
      cell.borderLeft(new G.Spread.Sheets.LineBorder(grey, G.Spread.Sheets.LineStyle.thin));
    });
    s.setRowHeight(1, 110); s.setRowHeight(2, 46); s.setRowHeight(3, 110); s.setRowHeight(4, 46);
    for (let i = 0; i < 4; i++) {
      const cell = s.getCell(5 + i, 2);
      cell.value(`indent ${i}`).textIndent(i);
      cell.borderLeft(new G.Spread.Sheets.LineBorder(grey, G.Spread.Sheets.LineStyle.thin));
    }
    const wrappedPlain = s.getCell(1, 4);
    wrappedPlain.value('Wrapped words in a small cell with several lines of text').wordWrap(true);
    const wrappedCenter = s.getCell(3, 4);
    wrappedCenter.value('Wrapped center continuous cell text lines').wordWrap(true).hAlign(HA.centerContinuous);
    const shrinkGeneral = s.getCell(5, 4);
    shrinkGeneral.value('shrink this long text to fit cell').shrinkToFit(true);
    const shrinkRight = s.getCell(6, 4);
    shrinkRight.value('shrink right aligned long text').shrinkToFit(true).hAlign(HA.right);
    const shrinkDistributed = s.getCell(7, 4);
    shrinkDistributed.value('shrink distributed long text').shrinkToFit(true).hAlign(HA.distributed);
    s.getCell(1, 3).value('vertical text').isVerticalText(true);
    s.getCell(2, 3).value('vert short').isVerticalText(true);
    s.getCell(3, 3).value('rotated 45').textOrientation(45);
    s.getCell(4, 3).value('ab').textOrientation(45);
    s.getCell(6, 3).value('rot 90 text').textOrientation(90);
    s.getCell(8, 3).value('rot 30').textOrientation(30);
    s.getCell(5, 3).value('RTL direction').textDirection(G.Spread.Sheets.TextDirectionType.rightToLeft);
    s.getCell(7, 3).value('padded').cellPadding('8px 10px').backColor('#f2f2f2');
  }),

  scenario('t56-number-formats', 'Number format codes', (s, G) => {
    const formats: [number, string][] = [
      [1234.5678, '#,##0.00'],
      [1234.5678, '#,##0'],
      [-1234.5, '#,##0.00;[Red]-#,##0.00'],
      [0.1234, '0.00%'],
      [0.1234, '0.000%'],
      [1234.5, '0.00"E"'],
      [1234567890, '#,##0,,,"M"'],
      [1234.5, '"$"#,##0.00'],
      [-45.25, '$#,##0.00;[Red]($#,##0.00)'],
      [44197, 'yyyy-mm-dd'],
      [44197, 'm/d/yy h:mm'],
      [44197, 'ddd, mmmm d, yyyy'],
      [12, '00000'],
      [1234.5, '##0.0##'],
      [0.5, '0.00e+00'],
    ];
    formats.forEach(([value, formatter], index) => {
      const cell = s.getCell(1 + index, 1);
      cell.value(value).formatter(formatter);
      cell.borderBottom(new G.Spread.Sheets.LineBorder(grey, G.Spread.Sheets.LineStyle.thin));
    });
    s.setColumnWidth(1, 190);
    s.setValue(1, 3, 'General text');
    s.setValue(2, 3, 42); s.getCell(2, 3).formatter('General');
    s.setValue(3, 3, 0.5); s.getCell(3, 3).formatter('0.#');
    s.setValue(4, 3, 1234.5); s.getCell(4, 3).formatter('@');
    s.setColumnWidth(3, 150);
  }),

  scenario('t56-merged-cells', 'Merged cells: spans with borders, fills and wrapping', (s, G) => {
    s.addSpan(0, 0, 1, 4); s.setValue(0, 0, 'Merged banner across four columns');
    s.getCell(0, 0).backColor('#d9e2f3').foreColor('#17365d').font('bold 13pt Calibri').hAlign(1).vAlign(1);
    s.getRange(0, 0, 1, 4).setBorder(new G.Spread.Sheets.LineBorder(blue, G.Spread.Sheets.LineStyle.medium), { all: true });
    s.addSpan(2, 1, 3, 2); s.setValue(2, 1, 'Merged block with wrapped centered text');
    s.getCell(2, 1).backColor(gold).hAlign(1).vAlign(1).wordWrap(true);
    s.addSpan(6, 0, 2, 5); s.setValue(6, 0, 'Wide merged cell, right aligned');
    s.getCell(6, 0).hAlign(2).borderBottom(new G.Spread.Sheets.LineBorder(red, G.Spread.Sheets.LineStyle.dashDot));
    s.addSpan(9, 3, 4, 3); s.setValue(9, 3, 'Tall merged area');
    s.getCell(9, 3).vAlign(2).borderTop(new G.Spread.Sheets.LineBorder('#548235', G.Spread.Sheets.LineStyle.mediumDashed));
    for (let c = 0; c < 8; c++) s.setValue(14, c, c + 1);
    s.addSpan(14, 2, 1, 3); s.setValue(14, 2, 'span 1x3');
    for (let r = 0; r < 15; r++) s.setRowHeight(r, 24);
  }),

  scenario('t56-frozen-lines', 'Frozen panes and the frozen split lines', (s) => {
    for (let r = 0; r < 24; r++) for (let c = 0; c < 10; c++) s.setValue(r, c, r * 10 + c + 1);
    s.frozenRowCount(3); s.frozenColumnCount(2);
    s.frozenTrailingRowCount(1); s.frozenTrailingColumnCount(1);
    s.getCell(3, 2).value('first unfrozen').foreColor(red).font('bold 12pt Calibri');
    s.setRowHeight(1, 30); s.setColumnWidth(1, 90);
    const options = s.options as GC.Spread.Sheets.IWorksheetOptions;
    options.frozenlineColor = '#e0392b';
  }),

  scenario('t56-headers-selection', 'Row/column headers, header text and selection highlight', (s, G) => {
    for (let r = 0; r < 12; r++) for (let c = 0; c < 8; c++) s.setValue(r, c, `${r},${c}`);
    s.setValue(4, 0, 'R4', G.Spread.Sheets.SheetArea.rowHeader);
    s.setValue(0, 3, 'C3', G.Spread.Sheets.SheetArea.colHeader);
    s.setSelection(2, 1, 4, 3);
    s.addSelection(8, 5, 2, 2);
    s.setActiveCell(3, 2);
    s.setColumnWidth(6, 120); s.setRowHeight(9, 34);
  }),

  scenario('t56-fill-handle', 'Selection fill handle', (s) => {
    for (let r = 1; r < 5; r++) for (let c = 1; c < 5; c++) s.setValue(r, c, r * c);
    s.setSelection(1, 1, 4, 4);
    s.setActiveCell(1, 1);
    for (let r = 1; r < 5; r++) s.setRowHeight(r, 26);
    for (let c = 1; c < 5; c++) s.setColumnWidth(c, 78);
  }, [fillHandleGlyph(4, 4, 78, 26)]),

  scenario('t56-comments-box', 'Comment indicator and the comment box', (s, G) => {
    s.setValue(1, 1, 'Indicator only');
    s.comments.add(1, 1, 'A note that is only shown by its corner indicator.');
    s.setValue(3, 1, 'Always shown');
    const shown = s.comments.add(3, 1, 'This comment box is always visible in the sheet.');
    shown.displayMode(G.Spread.Sheets.Comments.DisplayMode.alwaysShown);
    shown.width(200); shown.height(80);
    s.setValue(5, 1, 'Colored box');
    const colored = s.comments.add(5, 1, 'Custom colors and border.');
    colored.displayMode(G.Spread.Sheets.Comments.DisplayMode.alwaysShown);
    colored.width(170); colored.height(64);
    colored.backColor('#d9e2f3'); colored.foreColor('#17365d');
    colored.borderColor('#4472c4'); colored.borderWidth(2);
    s.setColumnWidth(1, 150);
    for (let r = 1; r < 8; r++) s.setRowHeight(r, 26);
  }, [{ row: 1, col: 1, x: -7, y: 0, width: 7, height: 7 }]),

  scenario('t56-threaded-comments', 'Threaded comment indicators and resolved state', (s, G) => {
    const TC = G.Spread.Sheets.ThreadedComments;
    const date = new Date(Date.UTC(2024, 0, 15, 9, 30));
    s.setValue(1, 1, 'Open thread');
    const open = s.threadedComments.add(1, 1);
    open?.add({ message: [{ type: TC.ContentType.text, value: 'First threaded reply' }], createdAt: date, authorId: 'user-1' });
    open?.add({ message: [{ type: TC.ContentType.text, value: 'Second reply with a longer message' }], createdAt: date, authorId: 'user-2' });
    s.setValue(3, 1, 'Resolved thread');
    const resolved = s.threadedComments.add(3, 1);
    if (resolved) {
      resolved.add({ message: [{ type: TC.ContentType.text, value: 'Resolved discussion' }], createdAt: date, authorId: 'user-1' });
      resolved.resolved(true);
    }
    s.setValue(5, 1, 'Single reply');
    s.threadedComments.add(5, 1, [{ message: [{ type: TC.ContentType.text, value: 'Only one reply' }], createdAt: date, authorId: 'user-3' }]);
    s.setColumnWidth(1, 150);
    for (let r = 1; r < 7; r++) s.setRowHeight(r, 26);
  }),

  scenario('t56-cf-databars', 'Data bars: border, negative fill, axis, bar only', (s, G) => {
    const CF = G.Spread.Sheets.ConditionalFormatting;
    const values = [-40, -12, 0, 18, 35, 60];
    values.forEach((value, r) => s.setValue(1 + r, 1, value));
    const rule = new CF.DataBarRule(
      CF.ScaleValueType.number, -60,
      CF.ScaleValueType.number, 60,
      '#4f81bd',
      [new G.Spread.Sheets.Range(1, 1, values.length, 1)],
    );
    rule.showBorder(true);
    rule.borderColor('#17365d');
    rule.dataBarDirection(CF.BarDirection.leftToRight);
    rule.useNegativeFillColor(true);
    rule.negativeFillColor('#ff7878');
    rule.useNegativeBorderColor(true);
    rule.negativeBorderColor('#9c0006');
    rule.axisPosition(CF.DataBarAxisPosition.cellMidPoint);
    rule.axisColor('#000000');
    s.conditionalFormats.addRule(rule);
    values.forEach((value, r) => s.setValue(1 + r, 3, value));
    const plain = new CF.DataBarRule(
      CF.ScaleValueType.automin, 0,
      CF.ScaleValueType.automax, 0,
      '#63be7b',
      [new G.Spread.Sheets.Range(1, 3, values.length, 1)],
    );
    plain.showBarOnly(true);
    s.conditionalFormats.addRule(plain);
    s.setColumnWidth(1, 150); s.setColumnWidth(3, 150);
    for (let r = 1; r < 7; r++) s.setRowHeight(r, 26);
  }),

  scenario('t56-cf-color-scales', 'Two and three color scales with explicit bounds', (s, G) => {
    const CF = G.Spread.Sheets.ConditionalFormatting;
    const values = [0, 20, 40, 60, 80, 100];
    values.forEach((value, r) => s.setValue(1 + r, 1, value));
    s.conditionalFormats.add2ScaleRule(
      CF.ScaleValueType.lowestValue, 0, '#f8696b',
      CF.ScaleValueType.highestValue, 0, '#63be7b',
      [new G.Spread.Sheets.Range(1, 1, values.length, 1)],
    );
    values.forEach((value, r) => s.setValue(1 + r, 3, value));
    s.conditionalFormats.add3ScaleRule(
      CF.ScaleValueType.number, 0, '#5a8f3c',
      CF.ScaleValueType.number, 50, '#ffeb84',
      CF.ScaleValueType.number, 100, '#f8696b',
      [new G.Spread.Sheets.Range(1, 3, values.length, 1)],
    );
    values.forEach((value, r) => s.setValue(8 + r, 1, value));
    s.conditionalFormats.add3ScaleRule(
      CF.ScaleValueType.percent, 0, '#ffffff',
      CF.ScaleValueType.percent, 50, '#ffd966',
      CF.ScaleValueType.percent, 100, '#c00000',
      [new G.Spread.Sheets.Range(8, 1, values.length, 1)],
    );
    s.setColumnWidth(1, 130); s.setColumnWidth(3, 130);
    for (let r = 1; r < 14; r++) s.setRowHeight(r, 24);
  }),

  scenario('t56-cf-icon-sets', 'Icon sets with custom thresholds and icon-only drawing', (s, G) => {
    const CF = G.Spread.Sheets.ConditionalFormatting;
    const values = [5, 25, 45, 65, 85];
    const types = [
      CF.IconSetType.threeTrafficLightsUnrimmed,
      CF.IconSetType.threeArrowsColored,
      CF.IconSetType.fourRatings,
      CF.IconSetType.fiveBoxes,
    ];
    types.forEach((type, index) => {
      const col = 1 + index * 2;
      values.forEach((value, r) => s.setValue(1 + r, col, value));
      const rule = s.conditionalFormats.addIconSetRule(type, [new G.Spread.Sheets.Range(1, col, values.length, 1)]) as GC.Spread.Sheets.ConditionalFormatting.IconSetRule;
      if (index === 1) rule.showIconOnly(true);
      if (index === 2) rule.reverseIconOrder(true);
    });
    for (let c = 1; c < 9; c++) s.setColumnWidth(c, 78);
    for (let r = 1; r < 6; r++) s.setRowHeight(r, 26);
  }, [0, 1, 2, 3].flatMap(index => [0, 1, 2, 3, 4].map(r => ({ row: 1 + r, col: 1 + index * 2, x: 1, y: 2, width: 18, height: 16 })))),

  scenario('t56-sparklines-marks', 'Line, column and win/loss sparklines with markers', (s, G) => {
    const S = G.Spread.Sheets.Sparklines;
    s.setArray(1, 1, [[2], [5], [-3], [7], [4], [1]]);
    const marked = new S.SparklineSetting({ showMarkers: true, showHigh: true, showLow: true, showNegative: true, displayXAxis: true });
    for (let r = 0; r < 3; r++) {
      s.setSparkline(1 + r, 3, new G.Spread.Sheets.Range(1, 1, 6, 1), S.DataOrientation.vertical, S.SparklineType.line, marked);
      s.setRowHeight(1 + r, 58);
    }
    for (let r = 0; r < 3; r++) {
      s.setSparkline(1 + r, 5, new G.Spread.Sheets.Range(1, 1, 6, 1), S.DataOrientation.vertical, S.SparklineType.column, marked);
    }
    for (let r = 0; r < 3; r++) {
      s.setSparkline(1 + r, 7, new G.Spread.Sheets.Range(1, 1, 6, 1), S.DataOrientation.vertical, S.SparklineType.winloss, new S.SparklineSetting({ showNegative: true, displayXAxis: true }));
    }
    for (let c = 3; c < 8; c++) s.setColumnWidth(c, 120);
  }),

  scenario('t56-outline-buttons', 'Row and column outline group buttons', (s) => {
    for (let r = 0; r < 16; r++) for (let c = 0; c < 10; c++) s.setValue(r, c, `${r + 1},${c + 1}`);
    s.rowOutlines.group(1, 2);
    s.rowOutlines.group(3, 3);
    s.rowOutlines.group(8, 2);
    s.rowOutlines.setCollapsed(8, true);
    s.columnOutlines.group(1, 2);
    s.columnOutlines.group(4, 3);
    s.columnOutlines.setCollapsed(4, true);
    s.setColumnWidth(0, 70);
  }),

  scenario('t56-hyperlink-styles', 'Hyperlink cell type and cell hyperlinks', (s, G) => {
    const CT = G.Spread.Sheets.CellTypes;
    s.setValue(1, 1, 'Range hyperlink');
    s.setHyperlink(1, 1, { url: 'https://example.com/a', tooltip: 'Example A' });
    s.setValue(3, 1, 'No underline, custom color');
    s.setHyperlink(3, 1, { url: 'https://example.com/b', drawUnderline: false, linkColor: '#008000' });
    const link = new CT.HyperLink();
    link.text('Cell type link');
    link.linkColor('#7030a0');
    s.setCellType(5, 1, link);
    s.setColumnWidth(1, 190);
    for (let r = 1; r < 7; r++) s.setRowHeight(r, 26);
  }),

  scenario('t56-cell-types-geometry', 'CheckBox, Button and ComboBox geometry and colors', (s, G) => {
    const CT = G.Spread.Sheets.CellTypes;
    const check = new CT.CheckBox();
    check.caption('Checked');
    check.boxSize(18);
    s.setCellType(1, 1, check); s.setValue(1, 1, true);
    const unchecked = new CT.CheckBox();
    unchecked.caption('Unchecked');
    unchecked.boxSize(12);
    unchecked.textAlign(CT.CheckBoxTextAlign.bottom);
    s.setCellType(2, 1, unchecked); s.setValue(2, 1, false);
    const large = new CT.CheckBox();
    large.caption('Large box');
    large.boxSize(24);
    s.setCellType(3, 1, large); s.setValue(3, 1, true);
    const button = new CT.Button();
    button.text('Push button');
    button.buttonBackColor('#e7eef7');
    button.marginLeft(8); button.marginRight(8); button.marginTop(4); button.marginBottom(4);
    s.setCellType(5, 1, button);
    const combo = new CT.ComboBox();
    combo.items(['alpha', 'beta', 'gamma', 'delta']);
    combo.editable(false);
    s.setCellType(7, 1, combo); s.setValue(7, 1, 'beta');
    s.setColumnWidth(1, 190);
    for (let r = 1; r < 8; r++) s.setRowHeight(r, 30);
    s.setRowHeight(3, 44);
  }),

  scenario('t56-validation-arrow', 'Validation list dropdown arrow and invalid markers', (s, G) => {
    const DV = G.Spread.Sheets.DataValidation, CF = G.Spread.Sheets.ConditionalFormatting;
    s.getParent().options.highlightInvalidData = true;
    s.setValue(1, 1, 'Open');
    s.setDataValidator(1, 1, DV.createListValidator('Open,Closed,On hold'));
    s.setValue(2, 1, 'Closed');
    s.setDataValidator(2, 1, DV.createListValidator('Open,Closed,On hold'));
    s.setValue(3, 1, 'Pending');
    s.setDataValidator(3, 1, DV.createListValidator('Open,Closed,On hold'));
    s.setValue(4, 1, 42);
    s.setDataValidator(4, 1, DV.createNumberValidator(CF.ComparisonOperators.between, 1, 10, true));
    s.setActiveCell(1, 1);
    s.setColumnWidth(1, 150);
    for (let r = 1; r < 6; r++) s.setRowHeight(r, 26);
  }),

  scenario('t56-table-banding', 'Table styles: stripes, banding, header and totals', (s, G) => {
    const headers = ['Region', 'Qty', 'Price'];
    headers.forEach((header, c) => s.setValue(1, c + 1, header));
    for (let r = 0; r < 6; r++) {
      s.setValue(2 + r, 1, r % 2 ? 'East' : 'West');
      s.setValue(2 + r, 2, (r + 1) * 3);
      s.setValue(2 + r, 3, (r + 1) * 4.5);
    }
    const table = s.tables.add('Band', 1, 1, 7, 3, G.Spread.Sheets.Tables.TableThemes.medium2);
    table.bandRows(true);
    table.highlightFirstColumn(true);
    table.showFooter(true);
    table.setColumnFormula(1, 'SUBTOTAL(109,[Qty])');
    s.setColumnWidth(1, 100); s.setColumnWidth(2, 80); s.setColumnWidth(3, 90);
    for (let r = 1; r < 9; r++) s.setRowHeight(r, 24);
  }, [1, 2, 3].map(col => ({ row: 1, col, x: -20, y: -19, width: 18, height: 17 }))),
];

export default coreRenderScenarios;
