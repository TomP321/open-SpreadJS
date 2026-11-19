import { describe, expect, it } from 'vitest';
import {
  applyInsets, buttonBands, drawWatermark, hitButton, layoutButtons, parseInsets, resolveButton, visibleButtons,
} from '../src/features/cell-extras.js';
import { applyMask } from '../src/features/input-mask.js';
import { Style } from '../src/primitives.js';

describe('cell padding insets', () => {
  it('parses the CSS shorthand forms used by Style.cellPadding', () => {
    expect(parseInsets('7 6 4 5')).toEqual({ top: 7, right: 6, bottom: 4, left: 5 });
    expect(parseInsets('20')).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
    expect(parseInsets('1 2')).toEqual({ top: 1, right: 2, bottom: 1, left: 2 });
    expect(parseInsets('10px 20px')).toEqual({ top: 10, right: 20, bottom: 10, left: 20 });
    expect(parseInsets(5)).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
    expect(parseInsets('')).toBeUndefined();
    expect(parseInsets(undefined)).toBeUndefined();
  });
  it('scales the inset box by the zoom factor', () => {
    const rect = { x: 100, y: 50, width: 40, height: 20 };
    expect(applyInsets(rect, parseInsets('7 6 4 5'), 2)).toEqual({ x: 110, y: 64, width: 18, height: 0 });
    expect(applyInsets(rect, undefined, 1)).toBe(rect);
  });
});

describe('cell buttons', () => {
  it('normalizes string enums and defaults like the trial', () => {
    const button = resolveButton({ position: 'left', visibility: 'onSelected', imageType: 'ellipsis', caption: 'x' }, 0);
    expect([button.position, button.visibility, button.imageType]).toEqual([0, 1, 6]);
    const fromNumbers = resolveButton({ position: 1, visibility: 0, imageType: 5 }, 0);
    expect([fromNumbers.position, fromNumbers.visibility, fromNumbers.imageType]).toEqual([1, 0, 5]);
    expect(resolveButton({}, 0).enabled).toBe(true);
    expect(resolveButton({ enabled: false }, 0).enabled).toBe(false);
    expect(resolveButton({ imageSize: { width: 20, height: 12 } }, 0).imageWidth).toBe(20);
  });
  it('filters buttons by visibility against the paint context', () => {
    const style = { cellButtons: [{ visibility: 0 }, { visibility: 1 }, { visibility: 2 }] };
    expect(visibleButtons(style, { active: false, editing: false }).map((b) => b.index)).toEqual([0]);
    expect(visibleButtons(style, { active: true, editing: false }).map((b) => b.index)).toEqual([0, 1]);
    expect(visibleButtons(style, { active: false, editing: true }).map((b) => b.index)).toEqual([0, 1, 2]);
  });
  it('lays out left/right stacks inside the content box and exposes hit rects', () => {
    const rect = { x: 0, y: 0, width: 200, height: 20 };
    const buttons = visibleButtons({ cellButtons: [{ position: 0, width: 20 }, { position: 1, width: 16 }, { position: 1, width: 24 }] }, { active: true, editing: false });
    const laid = layoutButtons(buttons, rect, '14px Calibri', 1);
    const byIndex = new Map(laid.map((item) => [item.button.index, item]));
    expect(byIndex.get(0)?.x).toBe(0);
    expect(byIndex.get(1)?.x).toBe(184); // right edge minus 16
    expect(byIndex.get(2)?.x).toBe(160); // second right button sits left of the first
    expect(buttonBands(laid)).toEqual({ left: 22, right: 44 });
    expect(hitButton(laid, 190, 5)?.button.index).toBe(1);
    expect(hitButton(laid, 100, 5)).toBeUndefined();
  });
});

describe('watermark and cell label painting', () => {
  /** Minimal recording context: the watermark painter only needs these calls. */
  function fakeContext() {
    const calls: { fillText: [string, number, number][]; fillStyles: string[] } = { fillText: [], fillStyles: [] };
    const noop = () => undefined;
    const ctx = {
      save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop,
      fillText: (text: string, x: number, y: number) => calls.fillText.push([text, x, y]),
      measureText: (text: string) => ({ width: text.length * 8 }),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(ctx, 'fillStyle', { set: (value: string) => calls.fillStyles.push(value), get: () => '#000' });
    Object.defineProperty(ctx, 'font', { set: noop, get: () => '14px Calibri' });
    Object.defineProperty(ctx, 'textBaseline', { set: noop, get: () => 'top' });
    return { ctx, calls };
  }
  it('hides auto labels on cells with a value but shows plain watermarks when empty', () => {
    const style = { watermark: 'LBL', labelOptions: { visibility: 2, margin: '2 3 2 3' } };
    const hidden = fakeContext();
    drawWatermark(hidden.ctx, style, { x: 0, y: 0, width: 100, height: 40 }, 1, true, '14px Calibri');
    expect(hidden.calls.fillText).toHaveLength(0);
    const shown = fakeContext();
    drawWatermark(shown.ctx, style, { x: 0, y: 0, width: 100, height: 40 }, 1, false, '14px Calibri');
    expect(shown.calls.fillText[0]?.[0]).toBe('LBL');
  });
  it('honours the visible/hidden enums and the label color', () => {
    const base = { watermark: 'LBL' };
    const visible = fakeContext();
    drawWatermark(visible.ctx, { ...base, labelOptions: { visibility: 0, foreColor: '#ff0000' } }, { x: 0, y: 0, width: 100, height: 40 }, 1, true, '14px Calibri');
    expect(visible.calls.fillText[0]?.[0]).toBe('LBL');
    expect(visible.calls.fillStyles).toContain('#ff0000');
    const hidden = fakeContext();
    drawWatermark(hidden.ctx, { ...base, labelOptions: { visibility: 1 } }, { x: 0, y: 0, width: 100, height: 40 }, 1, false, '14px Calibri');
    expect(hidden.calls.fillText).toHaveLength(0);
  });
});

describe('mask date fields', () => {
  it('pads fixed-width calendar fields on commit', () => {
    expect(applyMask('20200101', { pattern: 'yyyy/MM/dd' })).toBe('2020/01/01');
    expect(applyMask('3/4/2001', { pattern: 'MM/dd/yyyy' })).toBe('03/04/2001');
    expect(applyMask('3/4/2001', { pattern: 'M/d/yyyy' })).toBe('3/4/2001');
  });
  it('maps the meridiem token', () => {
    expect(applyMask('6:30pm', { pattern: 'h:mm tt' })).toBe('6:30 PM');
    expect(applyMask('6:30AM', { pattern: 'h:mm tt' })).toBe('6:30 AM');
  });
  it('shows the placeholder for unfinished fields while editing', () => {
    expect(applyMask('3', { pattern: 'MM/dd/yyyy' }, true)).toBe('3_/__/____');
    expect(applyMask('12', { pattern: 'MM-dd' }, true)).toBe('12-__');
  });
  it('leaves non-calendar patterns on the generic path', () => {
    expect(applyMask('123456', { pattern: '000-000' })).toBe('123-456');
  });
});

describe('Style options constructor', () => {
  it('accepts the single options-object form used by the trial samples', () => {
    const style = new Style({ backColor: 'red', cellPadding: '4', watermark: 'w', cellButtons: [{ position: 'left' }] });
    expect(style.backColor).toBe('red');
    expect(style.cellPadding).toBe('4');
    expect(style.watermark).toBe('w');
    expect((style.cellButtons as unknown[]).length).toBe(1);
    expect(new Style('green', 'blue').foreColor).toBe('blue');
  });
});

describe('Style.toJSON', () => {
  it('serializes the defined fields like the trial named styles and keeps undefined out', () => {
    const style = new Style();
    style.name = 'slider-cellbutton';
    style.cellButtons = [{ command: 'openSlider', imageType: 5, position: 1, visibility: 0 }];
    style.dropDowns = [{ type: 5, option: { min: 0, max: 100 } }];
    style.formatter = '0';
    expect(style.toJSON()).toEqual({
      name: 'slider-cellbutton',
      formatter: '0',
      cellButtons: [{ command: 'openSlider', imageType: 5, position: 1, visibility: 0 }],
      dropDowns: [{ type: 5, option: { min: 0, max: 100 } }],
    });
    expect(Object.keys(style.toJSON()!).sort()).toEqual(['cellButtons', 'dropDowns', 'formatter', 'name']);
  });
  it('deep-copies nested values and forwards nested toJSON (cell type)', () => {
    const style = new Style({ backColor: '#fff' });
    expect(style.toJSON()).toEqual({ backColor: '#fff' });
    const shared = new Style({ cellButtons: [{ option: { a: 1 } }] });
    const snapshot = shared.toJSON()!;
    (shared.cellButtons as { option: { a: number } }[])[0].option.a = 2;
    expect((snapshot.cellButtons as { option: { a: number } }[])[0].option.a).toBe(1);
    const withButtons = new Style({ cellType: { name: 'Column', toJSON: () => ({ name: 'Column' }) } });
    expect(withButtons.toJSON()!.cellType).toEqual({ name: 'Column' });
    const fonted = new Style();
    fonted.fontSize = '11pt';
    fonted.fontFamily = 'Calibri';
    // TASK 46 trial probe (style3:font): the trial composes the font shorthand from the parts.
    expect(fonted.toJSON()).toEqual({ font: '11pt Calibri', fontSize: '11pt', fontFamily: 'Calibri' });
  });
});
