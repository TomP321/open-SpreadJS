// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Workbook } from '../src/workbook.js';
import { ReportSheet } from '../src/report/index.js';
import type { Worksheet } from '../src/worksheet.js';

describe('ReportSheet parameter UI trial observations', () => {
  it('initializes the bound sheet and applies the callback value after an edit', () => {
    const report = new Workbook(undefined, { sheetCount: 0 }).addSheetTab(0, 'Report', 3) as ReportSheet;
    report.parameter({ x: 'old' });
    const host = document.createElement('div');
    document.body.append(host);
    let ui!: Worksheet;
    const calls: unknown[] = [];
    report.setParametersUI(host, sheet => {
      ui = sheet;
      sheet.getCell(0, 0).bindingPath('x').tag('test');
    }, (_sheet, args) => {
      calls.push({ ...args });
      args.newValue = 'modified';
    });
    expect(ui.getValue(0, 0)).toBe('old');
    ui.setValue(0, 0, 'new');
    expect(report.parameter()).toEqual({ x: 'old' });
    expect(calls).toEqual([]);
    ui._emit('EditEnded', { row: 0, col: 0 });
    expect(calls).toEqual([{ tag: 'test', oldValue: 'old', newValue: 'new' }]);
    expect(report.parameter()).toEqual({ x: 'modified' });
    expect(ui.getValue(0, 0)).toBe('modified');
    ui.setTag(0, 1, 'submit');
    ui._emit('ButtonClicked', { row: 0, col: 1 });
    expect(calls[1]).toEqual({ tag: 'submit', oldValue: undefined, newValue: undefined });
    ui.getParent()?.destroy();
    host.remove();
  });
});
