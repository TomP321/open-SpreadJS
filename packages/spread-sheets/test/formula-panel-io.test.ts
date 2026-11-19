// @vitest-environment jsdom
// TASK 44 item 3 — GC.Spread.Sheets.FormulaPanel + GC.Spread.Sheets.IO.
// IO expectations are trial values from the official @mescius/spread-sheets-io
// add-on probed in `.probe/api-sweep-probe.mjs` segment `io2` (error object
// shape, callback timing, success payload). FormulaPanel has no official core
// runtime to diff against (`fp:shape`: the trial core exposes no FormulaPanel —
// add-on only); its expected behaviour is derived from the public core d.ts
// contract, recorded in docs/STATUS.md.
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { registerFileParser, type IoFileParser } from '../src/io-core.js';

// jsdom ships no 2D canvas backend; the autoFit measurement path needs one.
function stubCanvas2d(): void {
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id?: string) {
    if (id !== '2d') return null;
    const target: Record<string, unknown> = { canvas: this };
    return new Proxy(target, {
      get: (t, prop) => {
        if (typeof prop === 'symbol') return undefined;
        if (prop in t) return t[prop as string];
        if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set: (t, prop, value) => { t[prop as string] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
  } as HTMLCanvasElement['getContext'];
}
stubCanvas2d();

const { Workbook } = GC.Spread.Sheets;
const FP = GC.Spread.Sheets.FormulaPanel;
const IO = GC.Spread.Sheets.IO;

function makeWorkbook(): { host: HTMLElement; wb: InstanceType<typeof Workbook> } {
  const host = document.createElement('div');
  host.style.width = '400px';
  host.style.height = '300px';
  document.body.append(host);
  const wb = new Workbook(host);
  return { host, wb };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('GC.Spread.Sheets.FormulaPanel namespace (core d.ts contract)', () => {
  it('exposes FormulaEditor, findControl and the six Commands with execute', () => {
    expect(Object.keys(FP).sort()).toEqual(['Commands', 'FormulaEditor', 'findControl']);
    expect(typeof FP.FormulaEditor).toBe('function');
    expect(FP.FormulaEditor.length).toBe(2); // (host, options?)
    expect(typeof FP.findControl).toBe('function');
    expect(Object.keys(FP.Commands).sort()).toEqual([
      'closeHints', 'commitContentToActiveCell', 'exitEdit', 'formatDocument', 'showHints', 'toggleAbsoluteRelativeReferences',
    ]);
    for (const name of Object.keys(FP.Commands)) expect(typeof (FP.Commands as Record<string, { execute: unknown }>)[name].execute, name).toBe('function');
    const proto = Object.getOwnPropertyNames(FP.FormulaEditor.prototype);
    for (const name of ['attach', 'commandManager', 'destroy', 'detach', 'format', 'refresh', 'text']) expect(proto, name).toContain(name);
  });

  it('text() gets and sets the panel content; options are carried', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new FP.FormulaEditor(host, { tabSize: 2, formatWidthLimit: 40 });
    expect(editor.options).toEqual({ tabSize: 2, formatWidthLimit: 40 });
    expect(editor.text()).toBe('');
    expect(editor.text('1+1')).toBe('1+1');
    expect(editor.text()).toBe('1+1');
    expect(host.querySelector('textarea')).not.toBeNull();
    editor.destroy();
  });

  it('attach follows the active cell, refresh reloads it, detach stops following', () => {
    const { wb } = makeWorkbook();
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new FP.FormulaEditor(host);
    const sheet = wb.getActiveSheet();
    editor.attach(wb);
    sheet.setFormula(0, 0, '=SUM(1,2)');
    sheet.setSelection(0, 0, 1, 1);
    editor.refresh();
    expect(editor.text()).toBe('=SUM(1,2)');
    sheet.setValue(5, 3, 'plain');
    sheet.setSelection(5, 3, 1, 1); // SelectionChanged event refreshes
    expect(editor.text()).toBe('plain');
    editor.detach();
    sheet.setSelection(0, 0, 1, 1);
    expect(editor.text()).toBe('plain'); // no longer following
    editor.destroy();
    wb.destroy();
  });

  it('format() normalizes formula whitespace (contract-derived)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new FP.FormulaEditor(host);
    editor.text('=SUM( 1 ,2 )+  3');
    editor.format();
    expect(editor.text()).toBe('=SUM(1,2) + 3');
    editor.destroy();
  });

  it('Commands operate on the editor: toggle/format/commit/hints/exit', () => {
    const { wb } = makeWorkbook();
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new FP.FormulaEditor(host);
    const sheet = wb.getActiveSheet();
    editor.attach(wb);
    sheet.setSelection(0, 0, 1, 1);
    editor.text('=A1+B2');
    FP.Commands.toggleAbsoluteRelativeReferences.execute(editor);
    expect(editor.text()).toBe('=$A$1+$B$2');
    FP.Commands.toggleAbsoluteRelativeReferences.execute(editor);
    expect(editor.text()).toBe('=A1+B2');
    FP.Commands.formatDocument.execute(editor);
    expect(editor.text()).toBe('=A1 + B2');
    editor.text('=2+3');
    FP.Commands.commitContentToActiveCell.execute(editor);
    expect(sheet.getValue(0, 0)).toBe(5);
    FP.Commands.showHints.execute(editor);
    expect(host.querySelectorAll('li').length).toBeGreaterThan(0);
    FP.Commands.closeHints.execute(editor);
    expect(host.querySelectorAll('li').length).toBe(0);
    expect(FP.Commands.exitEdit.execute(editor)).toBeUndefined();
    editor.destroy();
    wb.destroy();
  });

  it('commandManager() returns a manager that can run the panel commands', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new FP.FormulaEditor(host);
    const manager = editor.commandManager();
    expect(typeof manager.register).toBe('function');
    expect(typeof manager.execute).toBe('function');
    expect(typeof manager.setShortcutKey).toBe('function');
    editor.text('=$A$1');
    manager.execute({ cmd: 'toggleAbsoluteRelativeReferences' });
    expect(editor.text()).toBe('=A1');
    expect(editor.commandManager()).toBe(manager);
    editor.destroy();
  });

  it('findControl resolves the editor for its host and undefined elsewhere', () => {
    const host = document.createElement('div');
    host.id = 'fpanel-host';
    document.body.append(host);
    const editor = new FP.FormulaEditor(host);
    expect(FP.findControl(host)).toBe(editor);
    expect(FP.findControl('fpanel-host')).toBe(editor);
    const other = document.createElement('div');
    document.body.append(other);
    expect(FP.findControl(other)).toBeUndefined();
    editor.destroy();
    expect(FP.findControl(host)).toBeUndefined(); // destroy clears the registration
  });
});

describe('GC.Spread.Sheets.IO (trial values via the official io add-on, probe `io2`)', () => {
  it('declares getPartialValues (4 args) and registerMaxDigitWidth (3 args)', () => {
    expect(typeof IO.getPartialValues).toBe('function');
    expect(IO.getPartialValues.length).toBe(4); // trial rm-typeof probe: gpLen 4
    expect(typeof IO.registerMaxDigitWidth).toBe('function');
    expect(IO.registerMaxDigitWidth.length).toBe(3); // trial rm-typeof probe: rmLen 3
    expect(Object.keys(IO).sort()).toEqual(['ErrorCode', 'getPartialValues', 'registerMaxDigitWidth']);
  });

  it('registerMaxDigitWidth returns undefined, tolerates missing args, and changes nothing observable (trial: autoFit widths unchanged)', () => {
    const { wb } = makeWorkbook();
    const sheet = wb.getActiveSheet();
    sheet.setValue(0, 0, 1234567890);
    sheet.setColumnWidth(0, 30);
    sheet.autoFitColumn(0);
    const before = sheet.getColumnWidth(0);
    expect(IO.registerMaxDigitWidth('Foo', 11, 33)).toBeUndefined();
    expect(IO.registerMaxDigitWidth('x')).toBeUndefined(); // trial: noThrow
    sheet.setValue(0, 0, 1234567891);
    sheet.autoFitColumn(0);
    expect(sheet.getColumnWidth(0)).toBe(before); // trial w0 == w1 (77 unchanged)
    wb.destroy();
  });

  it('an empty refList calls no callback (trial probe `io2:getpartial-empty`: timeout)', () => {
    let calls = 0;
    IO.getPartialValues([], () => null, () => { calls += 1; }, () => { calls += 1; });
    return new Promise<void>((resolve) => setTimeout(() => { expect(calls).toBe(0); resolve(); }, 60));
  });

  it('getFile receives the reference name as a string and throwing getFile propagates synchronously (trial probes `io2:getpartial-garbage`, `io2:getpartial-thrower`)', () => {
    const { wb } = makeWorkbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(1, 0, '=[Book1.xlsx]Sheet1!A1:B2');
    const refs = wb.getExternalReferences(true) as never[];
    const seen: string[] = [];
    expect(() => IO.getPartialValues(refs, (path: string) => { seen.push(path); throw new Error('boom'); }, () => undefined, () => undefined)).toThrow('boom');
    expect(seen).toEqual(['Book1.xlsx']);
    wb.destroy();
  });

  it('a null file is skipped without any callback (trial probe `io2:error-shape`)', () => {
    const { wb } = makeWorkbook();
    wb.getActiveSheet().setFormula(1, 0, '=[Book2.xlsx]Sheet9!A1');
    const refs = wb.getExternalReferences(true) as never[];
    let calls = 0;
    IO.getPartialValues(refs, () => null, () => { calls += 1; }, () => { calls += 1; });
    return new Promise<void>((resolve) => setTimeout(() => { expect(calls).toBe(0); resolve(); }, 60));
  });

  it('an unparsable file reports the trial error object { errorCode: 1, errorMessage: "error file" } (trial probe `io2:error-shape`)', async () => {
    const { wb } = makeWorkbook();
    wb.getActiveSheet().setFormula(1, 0, '=[Book1.xlsx]Sheet1!A1:B2');
    const refs = wb.getExternalReferences(true) as never[];
    const outcome = await new Promise<unknown>((resolve) => {
      IO.getPartialValues(refs, () => new Blob([new Uint8Array([80, 75, 3, 4])]),
        (values) => resolve({ doneWith: 'success', values }),
        (err) => resolve({ doneWith: 'error', err }));
    });
    expect((outcome as { doneWith: string }).doneWith).toBe('error');
    expect((outcome as { err: unknown }).err).toEqual({ errorCode: 1, errorMessage: 'error file' });
    wb.destroy();
  });

  it('a parsed file yields the trial success payload shape file -> sheet -> row -> col (trial probe `io2:getpartial-xlsx`)', async () => {
    const parser: IoFileParser = () => ({
      Sheet1: { '0': { '0': 'ext1', '1': 'ext3' }, '1': { '0': 'ext2', '1': 'ext4' }, '9': { '9': 'ignored-outside-range' } },
    });
    registerFileParser(parser);
    const { wb } = makeWorkbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormula(3, 0, '=[Book1.xlsx]Sheet1!A1:B2');
    const refs = wb.getExternalReferences(true) as never[];
    const outcome = await new Promise<unknown>((resolve) => {
      IO.getPartialValues(refs, () => new Blob(['stub'], { type: 'application/octet-stream' }),
        (values) => resolve({ doneWith: 'success', values }),
        (err) => resolve({ doneWith: 'error', err }));
    });
    // Trial: {"Book1.xlsx":{"Sheet1":{"0":{"0":"ext1","1":"ext3"},"1":{"0":"ext2","1":"ext4"}}}}
    expect(outcome).toEqual({
      doneWith: 'success',
      values: { 'Book1.xlsx': { Sheet1: { '0': { '0': 'ext1', '1': 'ext3' }, '1': { '0': 'ext2', '1': 'ext4' } } } },
    });
    // The payload feeds Workbook.updateExternalReference like in the trial (probe `io2:update-after`).
    wb.updateExternalReference((outcome as { values: never }).values);
    expect(String(sheet.getValue(3, 0))).toBe('#VALUE!');
    wb.destroy();
  });
});
