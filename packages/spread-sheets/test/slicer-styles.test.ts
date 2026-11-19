/* Unit tests for the slicer style objects (TASK 29 part 1): SlicerBorder, SlicerStyleInfo,
 * SlicerStyle, the built-in SlicerStyles/TimelineStyles catalogues and the workbook theme managers. */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import {
  CustomSlicerThemeManager, CustomTimelineThemeManager, SlicerBorder, SlicerStyle, SlicerStyleInfo,
  SlicerStyles, TimelineStyle, TimelineStyles,
} from '../src/features/slicers/index.js';

const { Workbook } = GC.Spread.Sheets;
const themes = GC.Spread.Sheets.Tables.TableThemes as unknown as Record<string, string>;
describe('SlicerBorder', () => {
  it('constructs with width/style/color and exposes them as accessors', () => {
    const border = new SlicerBorder(2, 'dashed', '#FF0000');
    expect(border.borderWidth()).toBe(2);
    expect(border.borderStyle()).toBe('dashed');
    expect(border.borderColor()).toBe('#FF0000');
    expect(border.borderWidth(3)).toBe(border);
    expect(border.borderStyle('thick')).toBe(border);
    expect(border.borderColor('blue')).toBe(border);
    expect(border.toJSON()).toEqual({ borderWidth: 3, borderStyle: 'thick', borderColor: 'blue' });
  });

  it('fromJSON restores and clone copies a border', () => {
    const border = new SlicerBorder(1, 'thin', 'red');
    border.fromJSON({ borderWidth: 4, borderStyle: 'double', borderColor: '#00FF00' });
    expect(border.toJSON()).toEqual({ borderWidth: 4, borderStyle: 'double', borderColor: '#00FF00' });
    border.fromJSON({});
    expect(border.toJSON()).toEqual({ borderWidth: 0, borderStyle: '', borderColor: '' });
    const original = new SlicerBorder(5, 'hair', 'gray');
    const copy = original.clone();
    expect(copy.toJSON()).toEqual(original.toJSON());
    expect(copy).not.toBe(original);
  });
});

describe('SlicerStyleInfo', () => {
  it('constructs positionally from colours, font and borders', () => {
    const line = new SlicerBorder(1, 'thin', 'pink');
    const info = new SlicerStyleInfo('red', 'blue', '16pt Calibri', line, line, line, line, 'underline',
      'italic', 'bold', '12pt', 'Arial');
    expect(info.backColor()).toBe('red');
    expect(info.foreColor()).toBe('blue');
    expect(info.fontFamily()).toBe('Arial'); // explicit components win over the font string
    expect(info.fontSize()).toBe('12pt');
    expect(info.fontStyle()).toBe('italic');
    expect(info.fontWeight()).toBe('bold');
    expect(info.textDecoration()).toBe('underline');
    const parts = info.toJSON();
    for (const side of ['borderLeft', 'borderTop', 'borderRight', 'borderBottom'])
      expect(parts[side]).toMatchObject(line.toJSON()); // borders normalise to their JSON
  });

  it('parses a font string and rebuilds it from the components', () => {
    const info = new SlicerStyleInfo();
    info.font('bold italic 14pt Segoe UI');
    expect(info.fontWeight()).toBe('bold');
    expect(info.fontStyle()).toBe('italic');
    expect(info.fontSize()).toBe('14pt');
    expect(info.fontFamily()).toBe('Segoe UI');
    const plain = new SlicerStyleInfo();
    plain.font('normal normal 11pt calibri');
    expect(plain.fontWeight()).toBeNull();
    expect(plain.fontStyle()).toBeNull();
    const rebuilt = new SlicerStyleInfo();
    rebuilt.fontSize('9pt');
    rebuilt.fontFamily('Tahoma');
    expect(rebuilt.font()).toBe('normal normal 9pt Tahoma');
  });

  it('setBorders applies one border to all four sides', () => {
    const info = new SlicerStyleInfo();
    const border = new SlicerBorder(2, 'medium', '#123456');
    info.setBorders(border);
    const stored = info.toJSON();
    for (const side of ['borderLeft', 'borderTop', 'borderRight', 'borderBottom'])
      expect(stored[side]).toMatchObject({ borderWidth: 2, borderStyle: 'medium', borderColor: '#123456' });
  });

  it('accepts border objects and raw JSON alike, and serialises', () => {
    const info = new SlicerStyleInfo();
    info.borderLeft(new SlicerBorder(1, 'thin', 'red'));
    info.borderTop({ borderWidth: 3, borderStyle: 'dotted', borderColor: 'green' });
    const json = info.toJSON();
    expect(json.borderLeft).toMatchObject({ borderColor: 'red' });
    expect((info.borderTop() as { borderColor?: string }).borderColor).toBe('green'); // raw JSON stays raw
    const restored = new SlicerStyleInfo();
    restored.fromJSON(json);
    expect(restored.backColor()).toBeUndefined();
    expect(restored.foreColor()).toBeUndefined();
    expect(restored.toJSON().borderLeft).toMatchObject({ borderColor: 'red' });
  });

  it('stores null colours (cleared values) and keeps chaining', () => {
    const info = new SlicerStyleInfo('red', 'blue');
    expect(info.backColor(null)).toBe(info);
    expect(info.backColor()).toBeNull();
    expect(info.toJSON().backColor).toBeNull();
  });
});

describe('SlicerStyle', () => {
  const SLOTS = ['wholeSlicerStyle', 'headerStyle',
    'selectedItemWithDataStyle', 'selectedItemWithNoDataStyle',
    'unSelectedItemWithDataStyle', 'unSelectedItemWithNoDataStyle',
    'hoveredSelectedItemWithDataStyle', 'hoveredSelectedItemWithNoDataStyle',
    'hoveredUnSelectedItemWithDataStyle', 'hoveredUnSelectedItemWithNoDataStyle'];

  it('exposes the ten slot accessors plus name()', () => {
    const style = new SlicerStyle();
    expect(style.name()).toBeUndefined();
    expect(style.name('mine')).toBe(style);
    expect(style.name()).toBe('mine');
    const slots = style as unknown as Record<string, (v?: unknown) => unknown>;
    for (const slot of SLOTS) {
      expect(slots[slot]()).toBeUndefined();
      const info = new SlicerStyleInfo('red');
      expect(slots[slot](info)).toBe(style);
      expect(slots[slot]()).toBe(info);
    }
  });

  it('toJSON/fromJSON round-trips every slot', () => {
    const style = new SlicerStyle();
    style.name('round');
    const slots = style as unknown as Record<string, (v?: unknown) => unknown>;
    SLOTS.forEach((slot, index) => slots[slot](new SlicerStyleInfo(`#00000${index}`)));
    const json = style.toJSON();
    expect(json.name).toBe('round');
    const back = new SlicerStyle();
    back.fromJSON(json);
    expect(back.name()).toBe('round');
    const backSlots = back as unknown as Record<string, () => SlicerStyleInfo>;
    for (const slot of SLOTS) expect(backSlots[slot]().raw().backColor).toBeTruthy(); // getters materialise info objects
    expect(back.toJSON()).toEqual(json);
    new SlicerStyle().fromJSON(null as never); // tolerant
  });

  it('info() materialises stored JSON into a SlicerStyleInfo', () => {
    const style = new SlicerStyle();
    style.headerStyle({ backColor: 'yellow', foreColor: 'green' });
    const info = style.info('headerStyle');
    expect(info).toBeInstanceOf(SlicerStyleInfo);
    expect(info?.raw().backColor).toBe('yellow');
    expect(style.info('wholeSlicerStyle')).toBeUndefined();
  });
});

describe('SlicerStyles built-in catalogue', () => {
  const BUILT_INS = ['light1', 'light2', 'light3', 'light4', 'light5', 'light6',
    'other1', 'other2', 'dark1', 'dark2', 'dark3', 'dark4', 'dark5', 'dark6'];

  it('provides all 14 static factory functions with matching names', () => {
    for (const name of BUILT_INS) {
      const factory = (SlicerStyles as unknown as Record<string, () => SlicerStyle>)[name];
      expect(typeof factory, name).toBe('function');
      const style = factory();
      expect(style).toBeInstanceOf(SlicerStyle);
      expect(style.toJSON().name).toBe(`SlicerStyle${name[0].toUpperCase()}${name.slice(1)}`);
    }
    expect(new SlicerStyles()).toBeInstanceOf(SlicerStyles);
  });

  it('ships non-empty header/selection slots in every built-in', () => {
    for (const name of BUILT_INS) {
      const factory = (SlicerStyles as unknown as Record<string, () => { toJSON(): Record<string, unknown> }>)[name];
      const json = factory().toJSON();
      for (const key of ['wholeSlicerStyle', 'headerStyle', 'selectedItemWithDataStyle', 'unSelectedItemWithDataStyle'])
        expect(json[key], `${name}.${key}`).toEqual(expect.objectContaining({}));
    }
  });

  it('returns fresh instances (mutating one built-in does not leak)', () => {
    const catalogue = SlicerStyles as unknown as Record<string, () => SlicerStyle>;
    const first = catalogue.light1();
    first.wholeSlicerStyle(new SlicerStyleInfo('purple'));
    const fresh = catalogue.light1().wholeSlicerStyle();
    expect((fresh as SlicerStyleInfo).raw().backColor).not.toBe('purple');
  });
});

describe('TimelineStyle and TimelineStyles', () => {
  const BUILT_INS = ['light1', 'light2', 'light3', 'light4', 'light5', 'light6',
    'dark1', 'dark2', 'dark3', 'dark4', 'dark5', 'dark6'];
  const SLOTS = ['wholeSlicerStyle', 'headerStyle', 'selectionLabelStyle', 'timeLevelStyle',
    'periodLabel1Style', 'periodLabel2Style', 'selectedTimeBlockStyle', 'unselectedTimeBlockStyle',
    'selectedTimeBlockSpaceStyle'];

  it('exposes the timeline slot accessors declared by the contract', () => {
    const style = new TimelineStyle();
    const slots = style as unknown as Record<string, (v?: unknown) => unknown>;
    for (const slot of SLOTS) {
      const info = new SlicerStyleInfo('red');
      expect(slots[slot](info)).toBe(style);
      expect(slots[slot]()).toBe(info);
    }
    style.name('tl');
    const json = style.toJSON();
    expect(json.name).toBe('tl');
    expect(Object.keys(json).sort()).toEqual([...SLOTS, 'name'].sort());
    const back = new TimelineStyle();
    back.fromJSON(json);
    expect(back.toJSON()).toEqual(json);
  });

  it('provides all 12 static factories', () => {
    for (const name of BUILT_INS) {
      const factory = (TimelineStyles as unknown as Record<string, () => TimelineStyle>)[name];
      expect(typeof factory, name).toBe('function');
      const style = factory();
      expect(style).toBeInstanceOf(TimelineStyle);
      expect(style.toJSON().name).toBe(`TimeSlicerStyle${name[0].toUpperCase()}${name.slice(1)}`);
    }
    expect(new TimelineStyles()).toBeInstanceOf(TimelineStyles);
  });
});

describe('custom theme managers (workbook level)', () => {
  it('customSlicerThemes add/get/all/remove/update', () => {
    const wb = new Workbook();
    const manager = (wb as unknown as { customSlicerThemes: CustomSlicerThemeManager }).customSlicerThemes;
    expect(manager).toBeInstanceOf(CustomSlicerThemeManager);
    const raw = wb as unknown as Record<string, unknown>;
    expect(manager).toBe(raw.customSlicerThemes); // lazily created once
    const style = manager.add('custom0');
    expect(style).toBeInstanceOf(SlicerStyle);
    expect(style?.name()).toBe('custom0');
    expect(manager.add('custom0')).toBeUndefined(); // duplicate name refused
    expect(manager.add('')).toBeUndefined();
    const named = new SlicerStyle();
    named.name('custom1');
    expect(manager.add(named)).toBe(named);
    expect(manager.get('custom0')).toBe(style);
    expect(manager.get('nope')).toBeUndefined();
    expect(manager.all().map(item => item.name())).toEqual(['custom0', 'custom1']);
    const replacement = new SlicerStyle();
    replacement.name('custom1');
    manager.update('custom1', replacement);
    expect(manager.get('custom1')).toBe(replacement);
    manager.update('missing', replacement); // no-op
    manager.remove('custom0');
    expect(manager.get('custom0')).toBeUndefined();
    expect(manager.all().length).toBe(1);
    expect(manager.toJSON().length).toBe(1);
  });

  it('customTimelineThemes creates TimelineStyle instances', () => {
    const wb = new Workbook();
    const manager = (wb as unknown as { customTimelineThemes: CustomTimelineThemeManager }).customTimelineThemes;
    expect(manager).toBeInstanceOf(CustomTimelineThemeManager);
    const added = manager.add('tl0');
    expect(added).toBeInstanceOf(TimelineStyle);
    expect((added as TimelineStyle).name()).toBe('tl0');
    expect(manager.get('tl0')).toBe(added);
    expect(manager.all()).toEqual([added]);
    manager.remove('tl0');
    expect(manager.all()).toEqual([]);
    const explicit = new TimelineStyle();
    explicit.name('tl1');
    expect(manager.add(explicit)).toBe(explicit);
    const other = new TimelineStyle();
    other.name('tl1');
    manager.update('tl1', other);
    expect(manager.get('tl1')).toBe(other);
  });

  it('a slicer resolves custom theme names through style()/refresh()', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setArray(0, 0, [['Cat'], ['x'], ['y']]);
    sheet.tables.add('T', 0, 0, 3, 1, themes.light1);
    const slicer = sheet.slicers.add('s', 'T', 'Cat');
    const manager = (wb as unknown as { customSlicerThemes: CustomSlicerThemeManager }).customSlicerThemes;
    const theme = manager.add('myTheme');
    if (!theme) throw new Error('theme missing');
    theme.wholeSlicerStyle(new SlicerStyleInfo('teal'));
    slicer.style('myTheme');
    expect(slicer.getStyleName()).toBe('myTheme');
    expect((slicer.resolvedStyle().wholeSlicerStyle() as SlicerStyleInfo).raw().backColor).toBe('teal');
    manager.remove('myTheme');
    slicer.refresh();
    expect(slicer.style()).toBeInstanceOf(SlicerStyle); // falls back to the default built-in
  });
});

describe('SlicerType / TimelineLevel enums', () => {
  it('match the contract values', () => {
    expect(GC.Spread.Sheets.Slicers.SlicerType).toMatchObject({ table: 'table', pivotTable: 'pivot', pivotTimeline: 'timeline' });
    expect(GC.Spread.Sheets.Slicers.TimelineLevel).toMatchObject({ years: 1, quarters: 2, months: 3, days: 4 });
  });
});
