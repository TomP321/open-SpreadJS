/* Unit tests for the in-sheet slicer object model (TASK 29 part 1):
 * SlicerCollection, Slicer property surface, SlicerChanged event and JSON (de)serialisation. */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { Slicer, SlicerStyle, SlicerStyleInfo, TableSlicerData } from '../src/features/slicers/index.js';

const { Workbook, Events, SortState, Point } = GC.Spread.Sheets;
const SL = GC.Spread.Sheets.Slicers as unknown as {
  Slicer: typeof Slicer;
  SlicerStyle: typeof SlicerStyle;
  SlicerCollection: unknown;
  TableSlicerData: typeof TableSlicerData;
  SlicerType: { table: string; pivotTable: string; pivotTimeline: string };
};
const themes = GC.Spread.Sheets.Tables.TableThemes as unknown as Record<string, string>;
const SOURCE = [['Region', 'Amount'], ['East', 10], ['West', 20], ['East', 30], ['South', 40]];

function makeSheet() {
  const wb = new Workbook();
  const sheet = wb.getActiveSheet();
  sheet.setArray(0, 0, SOURCE.map(row => row.slice()));
  sheet.tables.add('Sales', 0, 0, 5, 2, themes.light1);
  return { wb, sheet };
}

describe('SlicerCollection (sheet.slicers)', () => {
  let sheet: ReturnType<InstanceType<typeof Workbook>['getActiveSheet']>;
  beforeEach(() => {
    sheet = makeSheet().sheet;
  });

  it('add/get/all/remove/clear manage table slicers', () => {
    const slicer = sheet.slicers.add('slicer1', 'Sales', 'Region');
    expect(slicer).toBeInstanceOf(SL.Slicer);
    expect(sheet.slicers.get('slicer1')).toBe(slicer);
    expect(sheet.slicers.get('nope')).toBeUndefined();
    expect(sheet.slicers.all()).toEqual([slicer]);
    const second = sheet.slicers.add('slicer2', 'Sales', 'Amount');
    expect(sheet.slicers.all().length).toBe(2);
    expect(sheet.slicers.all('Sales').length).toBe(2);
    expect(sheet.slicers.all('Other').length).toBe(0);
    expect(sheet.slicers.all('Sales', 'Amount')).toEqual([second]);
    expect(second.slicerData).toBe(slicer.slicerData); // one shared data model per table
    sheet.slicers.remove('slicer1');
    expect(sheet.slicers.get('slicer1')).toBeUndefined();
    expect(sheet.slicers.all()).toEqual([second]);
    sheet.slicers.remove('missing'); // no-op
    sheet.slicers.clear();
    expect(sheet.slicers.all()).toEqual([]);
    expect(sheet.slicers._count()).toBe(0);
  });

  it('add replaces an existing slicer with the same name', () => {
    sheet.slicers.add('slicer1', 'Sales', 'Region');
    const again = sheet.slicers.add('slicer1', 'Sales', 'Amount');
    expect(sheet.slicers.all()).toEqual([again]);
    expect(again.columnName()).toBe('Amount');
  });

  it('add throws for unknown targets (pivot types validate the pivot name)', () => {
    expect(() => sheet.slicers.add('s1', 'Nope', 'Region')).toThrow(/does not exist/);
    // TASK 42 item 4: pivot slicers are implemented — the target must be a pivot table.
    expect(() => sheet.slicers.add('s1', 'Sales', 'Region', undefined, SL.SlicerType.pivotTable))
      .toThrow(/pivot table Sales does not exist/i);
    expect(() => sheet.slicers.add('s1', 'Sales', 'Region', undefined, SL.SlicerType.pivotTimeline))
      .toThrow(/pivot table Sales does not exist/i);
  });

  it('add honours a style argument and defaults to SlicerStyleLight1', () => {
    const plain = sheet.slicers.add('a', 'Sales', 'Region');
    expect(plain.getStyleName()).toBe('SlicerStyleLight1');
    const styled = sheet.slicers.add('b', 'Sales', 'Region', 'SlicerStyleDark1');
    expect(styled.getStyleName()).toBe('SlicerStyleDark1');
    expect(styled.style().toJSON().name).toBe('SlicerStyleDark1');
  });

  it('drops slicers when their table is removed and refreshes the others', () => {
    const slicer = sheet.slicers.add('slicer1', 'Sales', 'Region');
    expect(slicer.getItems().map(item => item.text)).toEqual(['East', 'South', 'West']);
    sheet.tables.remove('Sales', 0);
    expect(sheet.slicers.all()).toEqual([]);
  });
});

describe('Slicer object surface', () => {
  let sheet: ReturnType<InstanceType<typeof Workbook>['getActiveSheet']>;
  let slicer: Slicer;
  beforeEach(() => {
    const env = makeSheet();
    sheet = env.sheet;
    slicer = sheet.slicers.add('slicer1', 'Sales', 'Region');
  });

  it('defaults match the trial (name, caption, size, position, flags)', () => {
    expect(slicer.name()).toBe('slicer1');
    expect(slicer.captionName()).toBe('Region');
    expect(slicer.columnName()).toBe('Region');
    expect(slicer.sourceName()).toBe('Region');
    expect(slicer.nameInFormula()).toBe('TableSlicer_Region');
    expect(slicer.sheet()).toBe(sheet);
    expect(slicer.columnCount()).toBe(1);
    expect(slicer.itemHeight()).toBe(21);
    expect(slicer.showHeader()).toBe(true);
    expect(slicer.sortState()).toBe(SortState.ascending);
    expect(slicer.showNoDataItems()).toBe(true);
    expect(slicer.showNoDataItemsInLast()).toBe(true);
    expect(slicer.visuallyNoDataItems()).toBe(true);
    expect(slicer.multiSelect()).toBe(false);
    expect(slicer.x()).toBe(50);
    expect(slicer.y()).toBe(250);
    expect(slicer.width()).toBe(186);
    expect(slicer.height()).toBe(258);
    expect(slicer.position()).toBeInstanceOf(Point);
    expect(slicer.position().x).toBe(50);
    expect(slicer.isSelected()).toBe(false);
    expect(slicer.isVisible()).toBe(true);
    expect(slicer.isLocked()).toBe(true);
    expect(slicer.allowMove()).toBe(true);
    expect(slicer.allowResize()).toBe(true);
    expect(slicer.dynamicMove()).toBe(false);
    expect(slicer.dynamicSize()).toBe(false);
    expect(slicer.disableResizingAndMoving()).toBe(false);
    expect(slicer.alt()).toBe('');
    expect(slicer.canPrint()).toBe(true);
  });

  it('setters return the slicer (chaining) and update the getters', () => {
    const chain = (value: unknown): void => { expect(value).toBe(slicer); };
    chain(slicer.captionName('Areas'));
    expect(slicer.captionName()).toBe('Areas');
    chain(slicer.columnCount(3));
    expect(slicer.columnCount()).toBe(3);
    chain(slicer.columnCount(0));
    expect(slicer.columnCount()).toBe(1); // clamped
    chain(slicer.itemHeight(30));
    expect(slicer.itemHeight()).toBe(30);
    chain(slicer.itemHeight(-5));
    expect(slicer.itemHeight()).toBe(1);
    chain(slicer.showHeader(false));
    expect(slicer.showHeader()).toBe(false);
    chain(slicer.sortState(SortState.descending));
    expect(slicer.sortState()).toBe(SortState.descending);
    chain(slicer.showNoDataItems(false));
    expect(slicer.showNoDataItems()).toBe(false);
    chain(slicer.showNoDataItemsInLast(false));
    expect(slicer.showNoDataItemsInLast()).toBe(false);
    chain(slicer.visuallyNoDataItems(false));
    expect(slicer.visuallyNoDataItems()).toBe(false);
    chain(slicer.multiSelect(true));
    expect(slicer.multiSelect()).toBe(true);
    chain(slicer.x(120));
    expect(slicer.x()).toBe(120);
    chain(slicer.y(80));
    expect(slicer.y()).toBe(80);
    chain(slicer.width(300));
    expect(slicer.width()).toBe(300);
    chain(slicer.height(400));
    expect(slicer.height()).toBe(400);
    chain(slicer.position(new Point(10, 20)));
    expect(slicer.x()).toBe(10);
    expect(slicer.position()).toMatchObject({ y: 20 });
    chain(slicer.alt('desc'));
    expect(slicer.alt()).toBe('desc');
    chain(slicer.canPrint(false));
    expect(slicer.canPrint()).toBe(false);
  });

  it('name() renames the slicer inside the collection', () => {
    slicer.name('renamed');
    expect(slicer.name()).toBe('renamed');
    expect(sheet.slicers.get('renamed')).toBe(slicer);
    expect(sheet.slicers.get('slicer1')).toBeUndefined();
  });

  it('selection, visibility, lock and move/resize flags', () => {
    slicer.isSelected(true);
    expect(slicer.isSelected()).toBe(true);
    slicer.isVisible(false);
    expect(slicer.isVisible()).toBe(false);
    slicer.isLocked(false);
    expect(slicer.isLocked()).toBe(false);
    slicer.allowMove(false);
    expect(slicer.allowMove()).toBe(false);
    slicer.allowResize(false);
    expect(slicer.allowResize()).toBe(false);
    slicer.dynamicMove(true);
    expect(slicer.dynamicMove()).toBe(true);
    slicer.dynamicSize(true);
    expect(slicer.dynamicSize()).toBe(true);
  });

  it('disableResizingAndMoving drives allowMove/allowResize both ways', () => {
    slicer.disableResizingAndMoving(true);
    expect(slicer.disableResizingAndMoving()).toBe(true);
    expect(slicer.allowMove()).toBe(false);
    expect(slicer.allowResize()).toBe(false);
    slicer.disableResizingAndMoving(false);
    expect(slicer.allowMove()).toBe(true);
    expect(slicer.allowResize()).toBe(true);
  });

  it('anchor accessors (startRow/startColumn/endRow/endColumn + offsets) reflect the geometry', () => {
    expect(Number(slicer.startRow())).toBeGreaterThanOrEqual(0);
    expect(Number(slicer.startColumn())).toBeGreaterThanOrEqual(0);
    const before = { row: Number(slicer.startRow()), col: Number(slicer.startColumn()) };
    slicer.x(300);
    slicer.y(500);
    expect(Number(slicer.startRow())).toBeGreaterThan(before.row);
    expect(Number(slicer.startColumn())).toBeGreaterThan(before.col);
    expect(Number(slicer.startRowOffset())).toBeLessThan(20);
    expect(Number(slicer.startColumnOffset())).toBeLessThan(62);
    expect(Number(slicer.endRow())).toBeGreaterThan(Number(slicer.startRow())); // 258px spans several default rows
    expect(Number(slicer.endColumn())).toBeGreaterThanOrEqual(Number(slicer.startColumn()));
    expect(Number(slicer.endRowOffset())).toBeGreaterThanOrEqual(0);
    expect(Number(slicer.endColumnOffset())).toBeGreaterThanOrEqual(0);
    slicer.startRow(2);
    expect(Number(slicer.startRow())).toBe(2);
    slicer.endColumn(7);
    expect(Number(slicer.endColumn())).toBe(7);
    slicer.startRowOffset(4);
    expect(Number(slicer.startRowOffset())).toBe(4);
    slicer.endColumnOffset(9);
    expect(Number(slicer.endColumnOffset())).toBe(9);
  });

  it('style accepts built-in names and SlicerStyle instances', () => {
    expect(slicer.style()).toBeInstanceOf(SlicerStyle);
    slicer.style('SlicerStyleDark2');
    expect(slicer.getStyleName()).toBe('SlicerStyleDark2');
    expect(slicer.resolvedStyle().toJSON().name).toBe('SlicerStyleDark2');
    const custom = new SlicerStyle();
    custom.name('mine');
    custom.wholeSlicerStyle(new SlicerStyleInfo('red'));
    slicer.style(custom);
    expect(slicer.getStyleName()).toBe('mine');
    const whole = slicer.resolvedStyle().wholeSlicerStyle();
    expect(whole).toBeInstanceOf(SlicerStyleInfo);
    expect((whole as InstanceType<typeof SlicerStyleInfo>).raw().backColor).toBe('red');
  });

  it('getItems always returns all items text-ascending, ignoring sortState and show* flags (trial)', () => {
    // Trial: getItems() ignores sortState (display order is internal) and always
    // returns every exclusive value, case-insensitive text ascending.
    expect(slicer.getItems().map(item => item.text)).toEqual(['East', 'South', 'West']);
    expect(slicer.getItems().every(item => item.selected && !item.noData)).toBe(true);
    slicer.sortState(SortState.descending);
    expect(slicer.getItems().map(item => item.text)).toEqual(['East', 'South', 'West']); // unchanged
    slicer.sortState(SortState.none);
    expect(slicer.getItems().map(item => item.text)).toEqual(['East', 'South', 'West']); // unchanged
    slicer.slicerData!.doFilter('Region', { exclusiveRowIndexes: [0] });
    expect(slicer.getItems().map(item => `${item.text}:${item.selected ? 1 : 0}`)).toEqual(['East:1', 'South:0', 'West:0']);
  });

  it('getItems honours no-data detection; showNoDataItems/InLast change the display list only', () => {
    const amount = sheet.slicers.add('slicer2', 'Sales', 'Amount');
    slicer.slicerData!.doFilter('Region', { exclusiveRowIndexes: [0] }); // keep East rows: Amount 10 and 30
    // getItems(): all values ascending text ('10','20','30','40'), noData flagged.
    expect(amount.getItems().map(item => `${item.text}:${item.selected ? 1 : 0}${item.noData ? '!' : ''}`))
      .toEqual(['10:1', '20:1!', '30:1', '40:1!']);
    // showNoDataItems(false) hides no-data items from the DISPLAY list (getItems unchanged, trial).
    amount.showNoDataItems(false);
    expect(amount.getItems().map(item => item.text)).toEqual(['10', '20', '30', '40']);
    expect(amount.getVisibleItems().map(item => item.text)).toEqual(['10', '30']);
    amount.showNoDataItems(true);
    expect(amount.getVisibleItems().map(item => item.text)).toEqual(['10', '30', '20', '40']); // InLast default: no-data last
    amount.showNoDataItemsInLast(false);
    expect(amount.getVisibleItems().map(item => item.text)).toEqual(['10', '20', '30', '40']);
  });

  it('refresh() picks up sheet edits through the changed() wiring', () => {
    sheet.setValue(4, 0, 'North'); // South becomes North
    expect(slicer.getItems().map(item => item.text)).toContain('North');
    slicer.refresh();
    expect(slicer.getItems().map(item => item.text)).toEqual(['East', 'North', 'West']);
  });

  it('toImageSrc / toImageSrcAsync exist (empty outside the DOM)', () => {
    expect(typeof slicer.toImageSrc()).toBe('string');
    return expect(slicer.toImageSrcAsync()).resolves.toBeTypeOf('string');
  });

  it('SlicerChanged fires with ISlicerChangedEventArgs for every property setter', () => {
    const seen: string[] = [];
    const handler = (_event: unknown, info: Record<string, unknown>): void => {
      const ev = { sheet: info.sheet, sheetName: info.sheetName, slicer: info.slicer, propertyName: String(info.propertyName) };
      expect(ev.sheet).toBe(sheet);
      expect(ev.sheetName).toBe(sheet.name());
      expect(ev.slicer).toBe(slicer);
      seen.push(ev.propertyName);
    };
    sheet.bind(Events.SlicerChanged, handler);
    slicer.captionName('X');
    slicer.columnCount(2);
    slicer.itemHeight(25);
    slicer.showHeader(false);
    slicer.sortState(SortState.descending);
    slicer.showNoDataItems(false);
    slicer.showNoDataItemsInLast(false);
    slicer.visuallyNoDataItems(false);
    slicer.multiSelect(true);
    slicer.style('SlicerStyleLight2');
    slicer.name('slicerA');
    slicer.x(60);
    slicer.y(60);
    slicer.width(100);
    slicer.height(100);
    slicer.position(new Point(70, 70));
    slicer.allowMove(false);
    slicer.allowResize(false);
    slicer.dynamicMove(true);
    slicer.dynamicSize(true);
    slicer.isSelected(true);
    slicer.isVisible(false);
    slicer.isLocked(false);
    slicer.disableResizingAndMoving(true);
    expect(seen).toEqual(['captionName', 'columnCount', 'itemHeight', 'showHeader', 'sortState',
      'showNoDataItems', 'showNoDataItemsInLast', 'visuallyNoDataItems', 'multiSelect', 'style', 'name',
      'x', 'y', 'width', 'height', 'x', 'y', 'allowMove', 'allowResize', 'dynamicMove', 'dynamicSize',
      'isSelected', 'isVisible', 'isLocked', 'allowMove', 'allowResize', 'disableResizingAndMoving']);
    seen.length = 0;
    slicer.captionName('Y', false); // shouldCallback = false stays silent
    expect(seen).toEqual([]);
    sheet.unbind(Events.SlicerChanged, handler);
    slicer.captionName('Z');
    expect(seen).toEqual([]);
  });
});

describe('Slicer JSON serialisation', () => {
  function filteredWorkbook() {
    const env = makeSheet();
    const sheet = env.sheet;
    const slicer = sheet.slicers.add('slicer1', 'Sales', 'Region');
    slicer.captionName('Areas');
    slicer.columnCount(2);
    slicer.itemHeight(24);
    slicer.showHeader(false);
    slicer.sortState(SortState.descending);
    slicer.style('SlicerStyleDark3');
    slicer.position(new Point(120, 90));
    slicer.multiSelect(true);
    slicer.disableResizingAndMoving(true);
    slicer.slicerData!.doFilter('Region', { exclusiveRowIndexes: [0] });
    return { wb: env.wb, sheet, slicer };
  }

  it('toJSON exposes the full trial-shaped slicer record', () => {
    const { slicer } = filteredWorkbook();
    const json = slicer.toJSON();
    expect(json).toMatchObject({
      type: 'table',
      slicerCacheName: 'TableSlicer_Region',
      captionName: 'Areas',
      name: 'slicer1',
      x: 120,
      y: 90,
      columnCount: 2,
      itemHeight: 24,
      showHeader: false,
      multiSelect: true,
      disableResizingAndMoving: true,
      allowMove: false,
      allowResize: false,
      style: 'SlicerStyleDark3',
      nameInFormula: 'TableSlicer_Region',
      canPrint: true,
      alt: '',
      isLocked: true,
      isVisible: true,
    });
    for (const key of ['startRow', 'startColumn', 'endRow', 'endColumn',
      'startRowOffset', 'startColumnOffset', 'endRowOffset', 'endColumnOffset'])
      expect(typeof json[key]).toBe('number');
  });

  it('workbook JSON carries the slicers section and tableSlicerCaches', () => {
    const { wb } = filteredWorkbook();
    const json = wb.toJSON();
    const sheetJson = Object.values(json)[0] as Record<string, unknown>;
    void sheetJson;
    const sheetEntry = (json as { sheets?: unknown }).sheets;
    void sheetEntry;
    // sheets is keyed by sheet name in our JSON: find the entry holding the slicers.
    const sheets = (json as { sheets: Record<string, Record<string, unknown>> }).sheets;
    const entry = Object.values(sheets)[0];
    expect(Array.isArray(entry.slicers)).toBe(true);
    expect((entry.slicers as Record<string, unknown>[])[0].name).toBe('slicer1');
    const caches = (json as { tableSlicerCaches?: Record<string, unknown>[] }).tableSlicerCaches;
    expect(caches?.length).toBe(1);
    expect(caches?.[0]).toMatchObject({ name: 'TableSlicer_Region', sourceName: 'Region', tableName: 'Sales' });
  });

  it('fromJSON round-trips slicers into a fresh workbook', () => {
    const { wb, slicer } = filteredWorkbook();
    const json = JSON.parse(JSON.stringify(wb.toJSON()));
    const target = new Workbook();
    target.fromJSON(json);
    const sheet2 = target.getActiveSheet();
    const restored = sheet2.slicers.get('slicer1');
    expect(restored).toBeDefined();
    expect(restored!.captionName()).toBe('Areas');
    expect(restored!.columnName()).toBe('Region');
    expect(restored!.columnCount()).toBe(2);
    expect(restored!.itemHeight()).toBe(24);
    expect(restored!.showHeader()).toBe(false);
    expect(restored!.sortState()).toBe(SortState.descending);
    expect(restored!.multiSelect()).toBe(true);
    expect(restored!.getStyleName()).toBe('SlicerStyleDark3');
    expect(restored!.x()).toBe(120);
    expect(restored!.y()).toBe(90);
    expect(restored!.disableResizingAndMoving()).toBe(true);
    // The table filter itself survives (it is stored on the table), so items agree.
    expect(restored!.getItems().map(item => `${item.text}:${item.selected ? 1 : 0}`))
      .toEqual(slicer.getItems().map(item => `${item.text}:${item.selected ? 1 : 0}`));
  });

  it('slicer.fromJSON accepts a plain record on a standalone slicer', () => {
    const slicer = new SL.Slicer();
    slicer.fromJSON({ name: 's1', captionName: 'Cap', columnCount: 4, itemHeight: 12, style: 'SlicerStyleDark6' });
    expect(slicer.name()).toBe('s1');
    expect(slicer.captionName()).toBe('Cap');
    expect(slicer.columnCount()).toBe(4);
    expect(slicer.itemHeight()).toBe(12);
    expect(slicer.getStyleName()).toBe('SlicerStyleDark6');
    expect(slicer.toJSON().name).toBe('s1');
  });
});
