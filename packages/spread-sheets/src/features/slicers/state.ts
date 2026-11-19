/**
 * Slicer state helpers: item lists (selection + no-data flags), the slicer
 * JSON shape (mirrors the trial's serialisation), and the exported image.
 */
import { SlicerStyles, TimelineStyles, SlicerStyle } from './styles.js';
import { SLICER_DEFAULT_HEIGHT, SLICER_DEFAULT_WIDTH, SLICER_DEFAULT_X, SLICER_DEFAULT_Y, SLICER_BLANK_TEXT, type SlicerItem } from './types.js';
import type { Slicer } from './slicer.js';
import type { JsonRecord } from '../../serialization.js';
import { GC } from '../../generated/enums.js';

const SortState = GC.Spread.Sheets.SortState;
export const DEFAULT_SLICER_STYLE = 'SlicerStyleLight1';

/** Resolve a built-in style name ("SlicerStyleLight1") to a fresh instance. */
export function builtInSlicerStyle(name: string): SlicerStyle | undefined {
  let key: string | undefined;
  if (name.startsWith('TimeSlicerStyle')) key = name.slice('TimeSlicerStyle'.length).toLowerCase();
  else if (name.startsWith('SlicerStyle')) key = name.slice('SlicerStyle'.length).toLowerCase();
  if (!key) return undefined;
  const record = SlicerStyles as unknown as Record<string, (() => SlicerStyle) | undefined>;
  const timeline = TimelineStyles as unknown as Record<string, (() => SlicerStyle) | undefined>;
  const fn = (name.startsWith('Time') ? timeline[key] : record[key]) ?? record[key] ?? timeline[key];
  return typeof fn === 'function' ? fn() : undefined;
}

/**
 * Entry lists. Two orders exist (trial-verified):
 *  - `orderedEntries(slicer, true)`  — the public `getItems()` list: ALL exclusive
 *    values, case-insensitive text ascending, unaffected by sortState or the
 *    show*NoData* flags (each entry carries `selected` / `noData` instead).
 *  - `orderedEntries(slicer, false)` — the DISPLAY list (painting, hit-testing,
 *    clicking): sorted by sortState (none = data order), no-data items removed
 *    when showNoDataItems(false) and pushed to the end when
 *    showNoDataItemsInLast(true) (the trial default).
 */
export function orderedEntries(slicer: Slicer, all = true): { index: number; text: string }[] {
  const data = slicer.slicerData;
  const column = slicer.columnName();
  if (!data) return [];
  const texts = data.getExclusiveData(column);
  let entries = texts.map((text: string, index: number) => ({ index, text }));
  const noDataOf = (entry: { index: number; text: string }): boolean =>
    entry.text !== '' && typeof data.hasRowForOtherColumns === 'function'
      ? !data.hasRowForOtherColumns(column, entry.index)
      : false;
  if (all) return entries.sort((a, b) => compareText(a.text, b.text));
  const sortState = Number(slicer.sortState());
  if (sortState === Number(SortState.ascending) || sortState === Number(SortState.descending))
    entries.sort((a, b) => compareText(a.text, b.text) * (sortState === Number(SortState.ascending) ? 1 : -1));
  if (slicer.showNoDataItems() === false) entries = entries.filter(entry => !noDataOf(entry));
  if (slicer.showNoDataItemsInLast() !== false) {
    const withData = entries.filter(entry => !noDataOf(entry));
    const without = entries.filter(entry => noDataOf(entry));
    return [...withData, ...without];
  }
  return entries;
}

function compareText(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al === bl ? 0 : al < bl ? -1 : 1;
}

export function slicerItems(slicer: Slicer, all = true): SlicerItem[] {
  const data = slicer.slicerData;
  const column = slicer.columnName();
  const entries = orderedEntries(slicer, all);
  if (!data) return entries.map(entry => ({ text: displayText(entry.text), value: entry.text, selected: true, noData: false }));
  const selected = data.getSelectedIndexes(column);
  return entries.map(entry => ({
    text: displayText(entry.text),
    value: entry.text,
    selected: selected === null ? true : selected.includes(entry.index),
    noData: entry.text !== '' && !data.hasRowForOtherColumns(column, entry.index),
  }));
}

export function displayText(text: string): string {
  return text === '' ? SLICER_BLANK_TEXT : text;
}

/** Apply a new selection (list of exclusive indexes) through the data model. */
export function applySelection(slicer: Slicer, exclusiveIndexes: number[]): void {
  const data = slicer.slicerData;
  if (!data) return;
  const column = slicer.columnName();
  const total = data.getExclusiveData(column).length;
  if (!exclusiveIndexes.length || exclusiveIndexes.length >= total) data.doUnfilter(column);
  else data.doFilter(column, { exclusiveRowIndexes: [...exclusiveIndexes].sort((a, b) => a - b) });
}

export function slicerToJson(slicer: Slicer): JsonRecord {
  const anchors = slicer._anchors();
  const props = slicer.propsValue();
  const custom = slicer.customProps;
  return {
    type: String(custom.type ?? 'table'),
    slicerCacheName: slicer.nameInFormula(),
    captionName: slicer.captionName(),
    disableResizingAndMoving: !!custom.disableResizingAndMoving,
    showHeader: custom.showHeader !== false,
    name: slicer.name(),
    isSelected: !!slicer.isSelected(),
    isVisible: slicer.isVisible() !== false,
    isLocked: slicer.isLocked() !== false,
    dynamicMove: !!props.dynamicMove,
    dynamicSize: !!props.dynamicSize,
    x: props.x as number,
    y: props.y as number,
    height: props.height as number,
    width: props.width as number,
    startRow: anchors.row,
    startColumn: anchors.col,
    startRowOffset: anchors.dy,
    startColumnOffset: anchors.dx,
    endRow: anchors.endRow,
    endColumn: anchors.endCol,
    endRowOffset: anchors.endDy,
    endColumnOffset: anchors.endDx,
    allowResize: props.allowResize !== false,
    allowMove: props.allowMove !== false,
    toImageSrc: slicer.toImageSrc(),
    toImageSrcAsync: {},
    alt: String(custom.alt ?? ''),
    canPrint: custom.canPrint !== false,
    nameInFormula: slicer.nameInFormula(),
    columnCount: Number(slicer.columnCount()),
    itemHeight: Number(slicer.itemHeight()),
    multiSelect: !!custom.multiSelect,
    style: String(custom.style ?? DEFAULT_SLICER_STYLE),
  };
}

export function slicerFromJson(slicer: Slicer, json: JsonRecord): void {
  const custom = slicer.customProps;
  for (const key of ['type', 'captionName', 'disableResizingAndMoving', 'showHeader', 'isSelected', 'isVisible', 'isLocked',
    'dynamicMove', 'dynamicSize', 'allowResize', 'allowMove', 'alt', 'canPrint', 'columnCount', 'itemHeight', 'multiSelect',
    'sortState', 'showNoDataItems', 'showNoDataItemsInLast', 'visuallyNoDataItems']) {
    if (json[key] !== undefined) custom[key] = json[key];
  }
  if (typeof json.style === 'string') { custom.style = json.style; slicer.styleObject = null; }
  if (typeof json.slicerCacheName === 'string') custom.slicerCacheName = json.slicerCacheName;
  if (typeof json.nameInFormula === 'string') custom.nameInFormula = json.nameInFormula;
  if (typeof json.name === 'string' && json.name) slicer.name(json.name, false);
  if (typeof json.columnName !== 'string' && typeof json.slicerCacheName === 'string' && json.slicerCacheName.startsWith('TableSlicer_'))
    slicer.columnNameValue = json.slicerCacheName.slice('TableSlicer_'.length);
  const props = slicer.propsValue();
  for (const key of ['x', 'y', 'width', 'height']) if (typeof json[key] === 'number') props[key] = json[key];
  if (typeof props.x !== 'number') props.x = SLICER_DEFAULT_X;
  if (typeof props.y !== 'number') props.y = SLICER_DEFAULT_Y;
  if (typeof props.width !== 'number') props.width = SLICER_DEFAULT_WIDTH;
  if (typeof props.height !== 'number') props.height = SLICER_DEFAULT_HEIGHT;
  if (json.startRow !== undefined && json.endRow !== undefined && json.startColumn !== undefined && json.endColumn !== undefined)
    slicer._setAnchors({
      row: Number(json.startRow), col: Number(json.startColumn),
      dx: Number(json.startColumnOffset ?? 0), dy: Number(json.startRowOffset ?? 0),
      endRow: Number(json.endRow), endCol: Number(json.endColumn),
      endDx: Number(json.endColumnOffset ?? 0), endDy: Number(json.endRowOffset ?? 0),
    });
  if (typeof json.columnName === 'string') slicer.columnNameValue = String(json.columnName);
}

/** Offscreen PNG of the slicer (our own drawing, no cached trial bitmaps). */
export function imageSource(slicer: Slicer, _force: boolean): string {
  if (typeof document === 'undefined') return '';
  const width = Math.max(1, Math.round(Number(slicer.width())));
  const height = Math.max(1, Math.round(Number(slicer.height())));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  slicer._paintInto(ctx, 1);
  try { return canvas.toDataURL('image/png'); } catch { return ''; }
}
