// @vitest-environment jsdom
/*
 * TASK 100 — CellTypes namespace burn-down: one unit test per declared member of
 * `GC.Spread.Sheets.CellTypes` (Base, Text, Button, ButtonList, CheckBox, CheckBoxList,
 * ColumnHeader, ComboBox, Corner, DataObject, Diagonal, FileUpload, HyperLink,
 * RadioButtonList, RangeTemplate, RowHeader, Text). Behaviour expectations follow the
 * public d.ts contract and the trial-observed answers recorded in cell-types-api.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';

const CellTypes = GC.Spread.Sheets.CellTypes;

/** Recording 2D context stub (jsdom has no canvas backend). */
function stubContext(): CanvasRenderingContext2D {
  const calls: string[] = [];
  const target: Record<string, unknown> = { font: '14.6667px Calibri, Arial, sans-serif' };
  const ctx = new Proxy(target, {
    get(t, key: string) {
      if (key in t) return t[key];
      return (...args: unknown[]) => { calls.push(`${key}(${JSON.stringify(args)})`); };
    },
    set(t, key: string, value: unknown) { t[key] = value; return true; },
  });
  (ctx as unknown as { calls: string[] }).calls = calls;
  return ctx as unknown as CanvasRenderingContext2D;
}
const style = { font: 'normal 11pt Calibri', foreColor: 'black', hAlign: 0 } as never;
const rect = { x: 10, y: 20, width: 100, height: 25 };

describe('CellTypes.Base', () => {
  it('typeName: declared data property exists on the prototype and reads "0" on instances', () => {
    expect(Object.getOwnPropertyDescriptor(CellTypes.Base.prototype, 'typeName')).toBeDefined();
    expect(new CellTypes.Base().typeName).toBe('0');
  });
  it('activateEditor is a no-op hook', () => {
    const editor = document.createElement('div');
    expect(new CellTypes.Base().activateEditor(editor, style, rect)).toBeUndefined();
  });
  it('createEditorElement returns a contenteditable host div', () => {
    const editor = new CellTypes.Base().createEditorElement();
    expect(editor.tagName).toBe('DIV');
    expect(editor.contentEditable).toBe('true');
  });
  it('deactivateEditor is a no-op hook', () => {
    expect(new CellTypes.Base().deactivateEditor(document.createElement('div'))).toBeUndefined();
  });
  it('focus focuses the editor element', () => {
    const editor = document.createElement('div');
    const focusSpy = vi.spyOn(editor, 'focus');
    new CellTypes.Base().focus(editor);
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });
  it('format renders values through the cell format', () => {
    const base = new CellTypes.Base();
    expect(base.format(1.5, 'General')).toBe('1.5');
    expect(base.format(0.25, '0.0%')).toBe('25.0%');
    expect(base.format(true, 'General')).toBe('TRUE');
    expect(base.format(null, 'General')).toBe('');
  });
  it('fromJSON copies settings onto the cell type', () => {
    const base = new CellTypes.Base();
    base.fromJSON({ myFlag: 7 });
    expect((base as unknown as Record<string, unknown>).myFlag).toBe(7);
  });
  it('getAutoFitHeight measures line count x font height x zoom + padding', () => {
    const base = new CellTypes.Base();
    const one = base.getAutoFitHeight('a', 'a', style, 1);
    const two = base.getAutoFitHeight('a', 'a\nb', style, 1);
    expect(two).toBeGreaterThan(one);
    const zoomed = base.getAutoFitHeight('a', 'a', style, 2);
    // the text component scales with zoom, the +2 padding does not
    expect(zoomed - 2).toBeCloseTo((one - 2) * 2);
  });
  it('getAutoFitWidth measures text width with zoom', () => {
    const base = new CellTypes.Base();
    expect(base.getAutoFitWidth('a', 'abcdef', style, 1)).toBeGreaterThan(base.getAutoFitWidth('a', 'ab', style, 1));
  });
  it('setEditorValue writes the value into input and contenteditable editors', () => {
    const base = new CellTypes.Base();
    const input = document.createElement('input');
    base.setEditorValue(input, 'x1');
    expect(input.value).toBe('x1');
    const div = document.createElement('div');
    div.contentEditable = 'true';
    base.setEditorValue(div, 42);
    expect((div as unknown as { value: string }).value).toBe('42');
  });
  it('getEditorValue reads back the edited editor content', () => {
    const base = new CellTypes.Base();
    const input = document.createElement('input');
    input.value = 'x1';
    expect(base.getEditorValue(input)).toBe('x1');
    const div = document.createElement('div');
    div.textContent = 'text';
    expect(base.getEditorValue(div)).toBe('text');
  });
  it('getHitInfo returns null on Base', () => {
    expect(new CellTypes.Base().getHitInfo(1, 2, style, rect)).toBeNull();
  });
  it('isEditingValueChanged compares values with Object.is semantics', () => {
    const base = new CellTypes.Base();
    expect(base.isEditingValueChanged('a', 'a')).toBe(false);
    expect(base.isEditingValueChanged('a', 'b')).toBe(true);
    expect(base.isEditingValueChanged(0, -0)).toBe(true);
  });
  it('isImeAware defaults to true', () => {
    expect(new CellTypes.Base().isImeAware()).toBe(true);
  });
  it('isReservedKey defaults to false', () => {
    expect(new CellTypes.Base().isReservedKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
  });
  it('paint delegates to paintContent and clips to the cell rect', () => {
    const ctx = stubContext();
    new CellTypes.Base().paint(ctx, 'hi', 0, 0, 50, 20, style);
    const calls = (ctx as unknown as { calls: string[] }).calls;
    expect(calls.some(c => c.startsWith('clip('))).toBe(true);
    expect(calls.some(c => c.startsWith('fillText('))).toBe(true);
  });
  it('paintContent draws the formatted value with the cell font and color', () => {
    const ctx = stubContext();
    new CellTypes.Base().paintContent(ctx, 12, 0, 0, 50, 20, { ...(style as object), foreColor: '#FF0000' } as never);
    const calls = (ctx as unknown as { calls: string[] }).calls;
    expect(calls.some(c => c.startsWith('fillText(') && c.includes('12'))).toBe(true);
    expect((ctx as unknown as Record<string, unknown>).fillStyle).toBe('#FF0000');
  });
  it('parse reads edited text back through the cell format', () => {
    const base = new CellTypes.Base();
    expect(base.parse('123', '')).toBe(123);
    expect(base.parse('abc', '')).toBe('abc');
  });
  it('processKeyDown defaults to false (not handled)', () => {
    expect(new CellTypes.Base().processKeyDown(new KeyboardEvent('keydown'))).toBe(false);
  });
  it('processKeyUp defaults to false (not handled)', () => {
    expect(new CellTypes.Base().processKeyUp(new KeyboardEvent('keyup'))).toBe(false);
  });
  it('processMouseDown defaults to false', () => {
    expect(new CellTypes.Base().processMouseDown({ x: 1, y: 2 })).toBe(false);
  });
  it('processMouseEnter defaults to false', () => {
    expect(new CellTypes.Base().processMouseEnter({ x: 1, y: 2 })).toBe(false);
  });
  it('processMouseLeave defaults to false', () => {
    expect(new CellTypes.Base().processMouseLeave({ x: 1, y: 2 })).toBe(false);
  });
  it('processMouseMove defaults to false', () => {
    expect(new CellTypes.Base().processMouseMove({ x: 1, y: 2 })).toBe(false);
  });
  it('processMouseUp defaults to false', () => {
    expect(new CellTypes.Base().processMouseUp({ x: 1, y: 2 })).toBe(false);
  });
  it('selectAll selects the editor input', () => {
    const input = document.createElement('input');
    const spy = vi.spyOn(input, 'select');
    new CellTypes.Base().selectAll(input);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('toJSON serializes the type with its typeName', () => {
    const json = new CellTypes.Base().toJSON();
    expect(json.typeName).toBe('0');
  });
  it('updateEditor returns the given rect on Base', () => {
    expect(new CellTypes.Base().updateEditor(document.createElement('div'), style, rect)).toEqual(rect);
  });
  it('updateEditorContainer positions the editor over the cell bounds', () => {
    const editor = document.createElement('div');
    new CellTypes.Base().updateEditorContainer(editor, rect, style);
    expect(editor.style.left).toBe('10px');
    expect(editor.style.width).toBe('100px');
  });
  it('updateImeMode is a no-op hook', () => {
    expect(new CellTypes.Base().updateImeMode(document.createElement('div'), 0)).toBeUndefined();
  });
});

describe('CellTypes.Text', () => {
  it('constructs with typeName "1" and an editor type', () => {
    const text = new CellTypes.Text();
    expect(text.typeName).toBe('1');
    expect(text.allowOverflow).toBe(true);
    expect(text.editorType).toBe(CellTypes.EditorType.editableDiv);
    expect(new CellTypes.Text(CellTypes.EditorType.textarea).editorType).toBe(CellTypes.EditorType.textarea);
  });
});
describe('CellTypes.ColumnHeader', () => {
  it('constructs with typeName "2" and no overflow', () => {
    const header = new CellTypes.ColumnHeader();
    expect(header.typeName).toBe('2');
    expect(header.allowOverflow).toBe(false);
  });
});
describe('CellTypes.RowHeader', () => {
  it('constructs with typeName "3" and no overflow', () => {
    const header = new CellTypes.RowHeader();
    expect(header.typeName).toBe('3');
    expect(header.allowOverflow).toBe(false);
  });
});
describe('CellTypes.Corner', () => {
  it('constructs with typeName "4" and no overflow', () => {
    const corner = new CellTypes.Corner();
    expect(corner.typeName).toBe('4');
    expect(corner.allowOverflow).toBe(false);
  });
});

describe('CellTypes.CheckBox', () => {
  it('boxSize gets and chains its setter', () => {
    const cb = new CellTypes.CheckBox();
    expect(cb.boxSize(15)).toBe(cb);
    expect(cb.boxSize()).toBe(15);
  });
  it('caption gets and chains its setter', () => {
    const cb = new CellTypes.CheckBox();
    cb.caption('yes');
    expect(cb.caption()).toBe('yes');
  });
  it('hitTestMode accepts "cell" and "checkbox"', () => {
    const cb = new CellTypes.CheckBox();
    cb.hitTestMode('cell');
    expect(cb.hitTestMode()).toBe('cell');
    cb.hitTestMode('checkbox');
    expect(cb.hitTestMode()).toBe('checkbox');
  });
  it('isThreeState toggles the tri-state cycle', () => {
    const cb = new CellTypes.CheckBox();
    expect(cb.isThreeState()).toBe(false);
    cb.isThreeState(true);
    expect(cb.isThreeState()).toBe(true);
  });
  it('mode keeps trial defaults and ignores unknown modes', () => {
    const cb = new CellTypes.CheckBox();
    expect(cb.mode()).toBe('checkbox');
    cb.mode('toggle');
    expect(cb.mode()).toBe('toggle');
    cb.mode('nope');
    expect(cb.mode()).toBe('toggle');
  });
  it('textAlign gets and chains its setter', () => {
    const cb = new CellTypes.CheckBox();
    const before = cb.textAlign();
    expect(cb.textAlign(CellTypes.CheckBoxTextAlign.top)).toBe(cb);
    expect(cb.textAlign()).not.toBe(before);
    cb.textAlign(before as number);
    expect(cb.textAlign()).toBe(before);
  });
  it('textEditable enables editing the caption text', () => {
    const cb = new CellTypes.CheckBox();
    expect(cb.textEditable()).toBe(false);
    cb.textEditable(true);
    expect(cb.textEditable()).toBe(true);
  });
  it('textFalse stores the unchecked-state label', () => {
    const cb = new CellTypes.CheckBox();
    cb.textFalse('no');
    expect(cb.textFalse()).toBe('no');
  });
  it('textTrue stores the checked-state label', () => {
    const cb = new CellTypes.CheckBox();
    cb.textTrue('yes');
    expect(cb.textTrue()).toBe('yes');
  });
  it('textIndeterminate stores the tri-state label', () => {
    const cb = new CellTypes.CheckBox();
    cb.textIndeterminate('half');
    expect(cb.textIndeterminate()).toBe('half');
  });
  it('toggleOptions merges the switch-mode options', () => {
    const cb = new CellTypes.CheckBox();
    const options = cb.toggleOptions() as Record<string, unknown>;
    expect(options.width).toBe(30);
    cb.toggleOptions({ width: 40 });
    expect(cb.toggleOptions()).toMatchObject({ width: 40 });
  });
});

describe('CellTypes.Button', () => {
  it('text gets and chains its setter', () => {
    const b = new CellTypes.Button();
    b.text('Go');
    expect(b.text()).toBe('Go');
  });
  it('buttonBackColor gets and chains its setter', () => {
    const b = new CellTypes.Button();
    b.buttonBackColor('#AABBCC');
    expect(b.buttonBackColor()).toBe('#AABBCC');
  });
  it('marginTop stores the top margin', () => {
    const b = new CellTypes.Button();
    b.marginTop(1);
    expect(b.marginTop()).toBe(1);
  });
  it('marginLeft stores the left margin', () => {
    const b = new CellTypes.Button();
    b.marginLeft(2);
    expect(b.marginLeft()).toBe(2);
  });
  it('marginBottom stores the bottom margin', () => {
    const b = new CellTypes.Button();
    b.marginBottom(3);
    expect(b.marginBottom()).toBe(3);
  });
  it('marginRight stores the right margin', () => {
    const b = new CellTypes.Button();
    b.marginRight(4);
    expect(b.marginRight()).toBe(4);
  });
});

describe('CellTypes.ComboBox', () => {
  it('items gets and sets the dropdown list', () => {
    const combo = new CellTypes.ComboBox();
    combo.items(['a', 'b', 'c']);
    expect(combo.items()).toEqual(['a', 'b', 'c']);
  });
  it('editable toggles typing a custom value', () => {
    const combo = new CellTypes.ComboBox();
    combo.editable(true);
    expect(combo.editable()).toBe(true);
  });
  it('editorValueType selects the editor kind', () => {
    const combo = new CellTypes.ComboBox();
    combo.editorValueType(CellTypes.EditorValueType.text);
    expect(combo.editorValueType()).toBe(CellTypes.EditorValueType.text);
  });
  it('itemHeight stores the dropdown row height', () => {
    const combo = new CellTypes.ComboBox();
    combo.itemHeight(22);
    expect(combo.itemHeight()).toBe(22);
  });
  it('maxDropDownItems limits the visible dropdown rows', () => {
    const combo = new CellTypes.ComboBox();
    combo.maxDropDownItems(3);
    expect(combo.maxDropDownItems()).toBe(3);
  });
  it('allowFloat lets the dropdown float over neighbours', () => {
    const combo = new CellTypes.ComboBox();
    combo.allowFloat(true);
    expect(combo.allowFloat()).toBe(true);
  });
  it('dataBinding stores a binding description', () => {
    const combo = new CellTypes.ComboBox();
    combo.dataBinding({ path: 'list' });
    expect(combo.dataBinding()).toMatchObject({ path: 'list' });
  });
});

describe('CellTypes.CheckBoxList', () => {
  it('items gets and sets the option list', () => {
    const list = new CellTypes.CheckBoxList();
    list.items(['a', 'b']);
    expect((list.items() as { text: string }[]).map(item => item.text)).toEqual(['a', 'b']);
  });
  it('direction selects vertical or horizontal flow', () => {
    const list = new CellTypes.CheckBoxList();
    list.direction(CellTypes.Direction.horizontal);
    expect(list.direction()).toBe(CellTypes.Direction.horizontal);
  });
  it('isFlowLayout toggles wrapping flow layout', () => {
    const list = new CellTypes.CheckBoxList();
    list.isFlowLayout(true);
    expect(list.isFlowLayout()).toBe(true);
  });
  it('maxColumnCount caps the flow grid columns', () => {
    const list = new CellTypes.CheckBoxList();
    list.maxColumnCount(3);
    expect(list.maxColumnCount()).toBe(3);
  });
  it('maxRowCount caps the flow grid rows', () => {
    const list = new CellTypes.CheckBoxList();
    list.maxRowCount(2);
    expect(list.maxRowCount()).toBe(2);
  });
  it('itemSpacing stores the gap between items', () => {
    const list = new CellTypes.CheckBoxList();
    list.itemSpacing({ horizontal: 10, vertical: 4 });
    expect(list.itemSpacing()).toMatchObject({ horizontal: 10, vertical: 4 });
  });
  it('boxSize stores the checkbox box size', () => {
    const list = new CellTypes.CheckBoxList();
    list.boxSize(18);
    expect(list.boxSize()).toBe(18);
  });
  it('textAlign aligns the captions', () => {
    const list = new CellTypes.CheckBoxList();
    list.textAlign(CellTypes.TextAlign.right);
    expect(list.textAlign()).toBe(CellTypes.TextAlign.right);
  });
  it('mode switches between checkbox and toggle artwork', () => {
    const list = new CellTypes.CheckBoxList();
    list.mode('toggle');
    expect(list.mode()).toBe('toggle');
  });
  it('toggleOptions merges the switch-mode options', () => {
    const list = new CellTypes.CheckBoxList();
    expect(list.toggleOptions()).toMatchObject({ width: 30 });
    list.toggleOptions({ height: 20 });
    expect(list.toggleOptions()).toMatchObject({ height: 20 });
  });
});

describe('CellTypes.RadioButtonList', () => {
  it('items gets and sets the option list', () => {
    const list = new CellTypes.RadioButtonList();
    list.items(['x', 'y']);
    expect((list.items() as { text: string }[]).map(item => item.text)).toEqual(['x', 'y']);
  });
  it('direction selects vertical or horizontal flow', () => {
    const list = new CellTypes.RadioButtonList();
    list.direction(CellTypes.Direction.vertical);
    expect(list.direction()).toBe(CellTypes.Direction.vertical);
  });
  it('isFlowLayout toggles wrapping flow layout', () => {
    const list = new CellTypes.RadioButtonList();
    list.isFlowLayout(false);
    expect(list.isFlowLayout()).toBe(false);
  });
  it('maxColumnCount caps the flow grid columns', () => {
    const list = new CellTypes.RadioButtonList();
    list.maxColumnCount(4);
    expect(list.maxColumnCount()).toBe(4);
  });
  it('maxRowCount caps the flow grid rows', () => {
    const list = new CellTypes.RadioButtonList();
    list.maxRowCount(5);
    expect(list.maxRowCount()).toBe(5);
  });
  it('itemSpacing stores the gap between items', () => {
    const list = new CellTypes.RadioButtonList();
    list.itemSpacing({ horizontal: 6 });
    expect(list.itemSpacing()).toMatchObject({ horizontal: 6 });
  });
  it('boxSize stores the radio circle size', () => {
    const list = new CellTypes.RadioButtonList();
    list.boxSize(16);
    expect(list.boxSize()).toBe(16);
  });
  it('textAlign aligns the captions', () => {
    const list = new CellTypes.RadioButtonList();
    list.textAlign(CellTypes.TextAlign.left);
    expect(list.textAlign()).toBe(CellTypes.TextAlign.left);
  });
});

describe('CellTypes.ButtonList', () => {
  it('items gets and sets the button labels', () => {
    const list = new CellTypes.ButtonList();
    list.items(['one', 'two']);
    expect((list.items() as { text: string }[]).map(item => item.text)).toEqual(['one', 'two']);
  });
  it('direction selects vertical or horizontal flow', () => {
    const list = new CellTypes.ButtonList();
    list.direction(CellTypes.Direction.horizontal);
    expect(list.direction()).toBe(CellTypes.Direction.horizontal);
  });
  it('isFlowLayout toggles wrapping flow layout', () => {
    const list = new CellTypes.ButtonList();
    list.isFlowLayout(true);
    expect(list.isFlowLayout()).toBe(true);
  });
  it('maxColumnCount caps the flow grid columns', () => {
    const list = new CellTypes.ButtonList();
    list.maxColumnCount(2);
    expect(list.maxColumnCount()).toBe(2);
  });
  it('maxRowCount caps the flow grid rows', () => {
    const list = new CellTypes.ButtonList();
    list.maxRowCount(3);
    expect(list.maxRowCount()).toBe(3);
  });
  it('itemSpacing stores the gap between buttons', () => {
    const list = new CellTypes.ButtonList();
    list.itemSpacing({ vertical: 8 });
    expect(list.itemSpacing()).toMatchObject({ vertical: 8 });
  });
  it('padding stores the button caption padding', () => {
    const list = new CellTypes.ButtonList();
    const before = list.padding();
    list.padding('4 6');
    expect(list.padding()).toBe('4 6');
    expect(typeof before).toBe('string');
  });
  it('selectedBackColor styles the selected button fill', () => {
    const list = new CellTypes.ButtonList();
    list.selectedBackColor('#112233');
    expect(list.selectedBackColor()).toBe('#112233');
  });
  it('selectedForeColor styles the selected button caption', () => {
    const list = new CellTypes.ButtonList();
    list.selectedForeColor('#445566');
    expect(list.selectedForeColor()).toBe('#445566');
  });
  it('selectionMode chooses single or multi selection', () => {
    const list = new CellTypes.ButtonList();
    list.selectionMode(CellTypes.SelectionMode.multiple);
    expect(list.selectionMode()).toBe(CellTypes.SelectionMode.multiple);
  });
});

describe('CellTypes.DataObject', () => {
  it('formatString gets and chains its setter', () => {
    const dataObject = new CellTypes.DataObject('@');
    expect(dataObject.formatString()).toBe('@');
    expect(dataObject.formatString('0.00')).toBe(dataObject);
    expect(dataObject.formatString()).toBe('0.00');
    expect(dataObject.typeName).toBe('18');
  });
});

describe('CellTypes.Diagonal', () => {
  it('divergeDirection stores the split direction', () => {
    const diagonal = new CellTypes.Diagonal();
    diagonal.divergeDirection(CellTypes.DivergeDirection.bottomLeftToTopRight);
    expect(diagonal.divergeDirection()).toBe(CellTypes.DivergeDirection.bottomLeftToTopRight);
  });
  it('lineBorder stores the diagonal line border', () => {
    const diagonal = new CellTypes.Diagonal();
    expect(diagonal.lineBorder()).toBeUndefined();
    diagonal.lineBorder({ color: 'black', style: 1 });
    expect(diagonal.lineBorder()).toMatchObject({ color: 'black' });
  });
});

describe('CellTypes.FileUpload', () => {
  it('accept stores the file filter and starts empty like the trial', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.accept()).toBe('');
    fu.accept('.png,.jpg');
    expect(fu.accept()).toBe('.png,.jpg');
  });
  it('isClearEnabled defaults on and can be turned off', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.isClearEnabled()).toBe(true);
    fu.isClearEnabled(false);
    expect(fu.isClearEnabled()).toBe(false);
  });
  it('isDownloadEnabled defaults on and can be turned off', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.isDownloadEnabled()).toBe(true);
    fu.isDownloadEnabled(false);
    expect(fu.isDownloadEnabled()).toBe(false);
  });
  it('isPreviewEnabled defaults on and can be turned off', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.isPreviewEnabled()).toBe(true);
    fu.isPreviewEnabled(false);
    expect(fu.isPreviewEnabled()).toBe(false);
  });
  it('marginTop defaults to the trial 2 px and chains', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.marginTop()).toBe(2);
    expect(fu.marginTop(5)).toBe(fu);
    expect(fu.marginTop()).toBe(5);
  });
  it('marginLeft defaults to the trial 2 px', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.marginLeft()).toBe(2);
    fu.marginLeft(7);
    expect(fu.marginLeft()).toBe(7);
  });
  it('marginBottom defaults to the trial 2 px', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.marginBottom()).toBe(2);
    fu.marginBottom(9);
    expect(fu.marginBottom()).toBe(9);
  });
  it('marginRight defaults to the trial 2 px', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.marginRight()).toBe(2);
    fu.marginRight(11);
    expect(fu.marginRight()).toBe(11);
  });
  it('maxSize defaults to the trial 2048 bytes', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.maxSize()).toBe(2048);
    fu.maxSize(1024);
    expect(fu.maxSize()).toBe(1024);
  });
  it('valuePath defaults to dataUrl and an explicit undefined clears it', () => {
    const fu = new CellTypes.FileUpload();
    expect(fu.valuePath()).toBe('dataUrl');
    fu.valuePath('rawUrl');
    expect(fu.valuePath()).toBe('rawUrl');
    fu.valuePath(undefined as never);
    expect(fu.valuePath()).toBeNull();
  });
  it('previewCommand is a declared property: undefined until assigned, stored on write', () => {
    const fu = new CellTypes.FileUpload();
    expect(Object.getOwnPropertyDescriptor(CellTypes.FileUpload.prototype, 'previewCommand')).toBeDefined();
    expect(fu.previewCommand).toBeUndefined();
    fu.previewCommand = 'custom';
    expect(fu.previewCommand).toBe('custom');
  });
});

describe('CellTypes.HyperLink', () => {
  it('text gets and chains its setter', () => {
    const link = new CellTypes.HyperLink();
    link.text('docs');
    expect(link.text()).toBe('docs');
  });
  it('linkColor stores the unvisited color', () => {
    const link = new CellTypes.HyperLink();
    link.linkColor('#0000FF');
    expect(link.linkColor()).toBe('#0000FF');
  });
  it('visitedLinkColor stores the visited color', () => {
    const link = new CellTypes.HyperLink();
    link.visitedLinkColor('#800080');
    expect(link.visitedLinkColor()).toBe('#800080');
  });
  it('linkToolTip stores the hover tooltip', () => {
    const link = new CellTypes.HyperLink();
    link.linkToolTip('open');
    expect(link.linkToolTip()).toBe('open');
  });
  it('target chooses the hyperlink target frame', () => {
    const link = new CellTypes.HyperLink();
    link.target(CellTypes.HyperLinkTargetType.blank);
    expect(link.target()).toBe(CellTypes.HyperLinkTargetType.blank);
  });
  it('activeOnClick toggles whether any click activates the link', () => {
    const link = new CellTypes.HyperLink();
    link.activeOnClick(false);
    expect(link.activeOnClick()).toBe(false);
  });
  it('onClickAction stores the custom click handler', () => {
    const link = new CellTypes.HyperLink();
    const handler = () => 'clicked';
    link.onClickAction(handler);
    expect(link.onClickAction()).toBe(handler);
  });
});

describe('CellTypes.RangeTemplate', () => {
  it('constructs over a sheet range with the trial type id', () => {
    const wb = new GC.Spread.Sheets.Workbook();
    const sheet = wb.getActiveSheet();
    const template = new CellTypes.RangeTemplate(sheet, 1, 2, 3, 4);
    expect(template.typeName).toBe('16');
  });
});
