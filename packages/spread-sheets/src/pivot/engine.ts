/**
 * Pivot cache and aggregation (TASK 41 item 1).
 * Holds the resolved source rows, the field model (row/column/value/filter
 * areas), item lists, label/value filters and the aggregation of every
 * (row-items x column-items) intersection.
 */
import {
  PivotDataType, PivotTableFieldType, SubtotalType, SortType,
  IPivotViewSortInfo, PivotShowDataAs,
} from './types.js';
import type {
  IPivotTextFilterInfo, IPivotConditionFilterInfo, IDimensionSubtotalsInfo,
} from './types.js';

export type AreaValue = PivotTableFieldType | -1;

export interface PivotFieldModel {
  sourceName: string;
  displayName: string;
  area: AreaValue;
  index: number;
  subtotal?: SubtotalType;
  dataType: PivotDataType;
  labelFilter?: (IPivotTextFilterInfo | IPivotConditionFilterInfo) & { kind: 'text' | 'condition' };
  valueFilter?: IPivotConditionFilterInfo & { kind: 'condition' };
  sortInfo?: IPivotViewSortInfo;
  isShowSubtotalTop: boolean;
  isShowSubtotal?: boolean;
  showNoData?: boolean;
  dimensionSubtotals?: IDimensionSubtotalsInfo;
  showDataAsInfo?: { showDataAs: number; baseFieldName?: string; baseFieldItemType?: number; baseFieldItem?: string };
  /** Explicit item order (restored from serialized `fields[].items`). */
  itemOrder?: string[];
  /** TASK 42: the field is a derived group field (`Years (Date)`...). */
  isGroup?: boolean;
  /** TASK 42: the field is a calculated value field with this formula. */
  calcFormula?: string;
  /** TASK 42: calculated items of this axis field (`name -> formula`). */
  calcItems?: Map<string, { formula: string; priority: number }>;
  /** TASK 42: slicer selection over this field (null/undefined = all). */
  slicerItems?: Set<string> | null;
  /** TASK 42 item 4: timeline range over a date field (cache key bounds). */
  timelineRange?: { from: string; to: string } | null;
  /** TASK 42 item 1: origin field name of a date/text group. */
  groupOrigin?: string;
  /** TASK 42: min/max of the origin column for number/date groups. */
  groupStart?: Date | number;
  groupEnd?: Date | number;
}

export interface CacheField {
  name: string;
  dataType: PivotDataType;
  /** Unique item texts in first-appearance order. */
  items: string[];
  itemIndex: Map<string, number>;
  /** Row indexes per item (source-row bucketing). */
  buckets: number[][];
  min?: number;
  max?: number;
  /** TASK 42: count of blank cells (the trial writes an `m` entity for them). */
  blanks?: number;
  /** TASK 42: item keys that came from numeric cells (mixed string/number fields). */
  numericKeys?: Set<string>;
  /**
   * Derived fields (TASK 42): per-source-row display text. `items`/`buckets`
   * are keyed on these values instead of the raw source column.
   */
  column?: (string | null)[];
  /** Number grouping keeps aggregating on the raw column (TASK 42). */
  keepRaw?: boolean;
  /** Names of calculated items appended to this field (TASK 42). */
  calcItems?: Set<string>;
  /** `fieldGroup` JSON block for grouped fields (TASK 42). */
  fieldGroup?: Record<string, unknown>;
}

export class PivotCache {
  fields: CacheField[] = [];
  rows: unknown[][] = [];
  fieldIndex = new Map<string, number>();

  build(fields: string[], rows: unknown[][]): void {
    this.rows = rows;
    this.fields = fields.map((name, col) => this.#buildField(name, col));
    this.fieldIndex = new Map(fields.map((name, i) => [name, i]));
  }

  /** Display value of one cell of the cache (derived columns included). */
  displayValue(row: number, index: number): unknown {
    const field = this.fields[index];
    if (field?.column) return field.column[row] ?? null;
    return this.rows[row]?.[index];
  }

  /** Value used by aggregations (raw column when a number group overlays it). */
  aggregateValue(row: number, index: number): unknown {
    const field = this.fields[index];
    if (field?.column && !field.keepRaw) return field.column[row] ?? null;
    return this.rows[row]?.[index];
  }

  #buildField(name: string, col: number): CacheField {
    const items: string[] = [];
    const itemIndex = new Map<string, number>();
    const buckets: number[][] = [];
    let numbers = 0, dates = 0, nonEmpty = 0, blanks = 0;
    let min = Infinity, max = -Infinity;
    const numericKeys = new Set<string>();
    // Trial semantics: empty-string cells never take part in the column type
    // detection; they end up a trailing `m` entity on numeric columns and a
    // regular `''` item on text columns (null/undefined is always missing).
    let emptyCells = 0;
    for (let r = 0; r < this.rows.length; r++) {
      const value = this.rows[r]?.[col];
      if (value == null) { blanks++; continue; }
      if (value === '') { emptyCells++; continue; }
      nonEmpty++;
      let key: string;
      if (typeof value === 'number') {
        numbers++;
        key = String(value);
        numericKeys.add(key);
        if (value < min) min = value;
        if (value > max) max = value;
      } else if (value instanceof Date) {
        dates++;
        key = String(value.getTime());
      } else {
        key = String(value);
      }
      let idx = itemIndex.get(key);
      if (idx === undefined) {
        idx = items.length;
        itemIndex.set(key, idx);
        items.push(key);
        buckets.push([]);
      }
      buckets[idx]!.push(r);
    }
    const dataType = nonEmpty === 0 ? PivotDataType.string
      : numbers === nonEmpty ? PivotDataType.number
      : dates === nonEmpty ? PivotDataType.date
      : PivotDataType.string;
    if (dataType === PivotDataType.number) blanks += emptyCells;
    else if (emptyCells > 0 && !itemIndex.has('')) {
      itemIndex.set('', items.length);
      items.push('');
      buckets.push([]);
      for (let r = 0; r < this.rows.length; r++) if (this.rows[r]?.[col] === '') buckets[buckets.length - 1]!.push(r);
    }
    const field: CacheField = { name, dataType, items, itemIndex, buckets };
    if (dataType === PivotDataType.number) { field.min = min; field.max = max; }
    if (blanks > 0) field.blanks = blanks;
    if (numericKeys.size && dataType !== PivotDataType.number) field.numericKeys = numericKeys;
    return field;
  }

  rawText(row: number, field: string): string | null {
    const index = this.fieldIndex.get(field);
    if (index === undefined) return null;
    const value = this.displayValue(row, index);
    if (value == null || value === '') return null;
    if (value instanceof Date) return String(value.getTime());
    return String(value);
  }

  numeric(row: number, field: string): number | null {
    const index = this.fieldIndex.get(field);
    if (index === undefined) return null;
    const value = this.rows[row]?.[index];
    return typeof value === 'number' ? value : null;
  }

  /** Add (or replace) a derived cache field computed per source row. */
  addDerivedField(name: string, column: (string | null)[], dataType: PivotDataType, itemsOverride?: string[]): void {
    let index = this.fieldIndex.get(name);
    const field: CacheField = {
      name, dataType, items: [], itemIndex: new Map(), buckets: [], column,
    };
    for (const item of itemsOverride ?? []) {
      if (field.itemIndex.has(item)) continue;
      field.itemIndex.set(item, field.items.length);
      field.items.push(item);
      field.buckets.push([]);
    }
    for (let r = 0; r < this.rows.length; r++) {
      const text = column[r];
      if (text == null) continue;
      let idx = field.itemIndex.get(text);
      if (idx === undefined) {
        idx = field.items.length;
        field.itemIndex.set(text, idx);
        field.items.push(text);
        field.buckets.push([]);
      }
      field.buckets[idx]!.push(r);
    }
    if (index === undefined) {
      index = this.fields.length;
      this.fieldIndex.set(name, index);
      this.fields.push(field);
    } else {
      this.fields[index] = field;
    }
  }

  /** Turn an existing field into a grouped one (number grouping in place). */
  regroupField(name: string, column: (string | null)[], items: string[]): void {
    const index = this.fieldIndex.get(name);
    if (index === undefined) return;
    const field = this.fields[index]!;
    field.column = column;
    field.keepRaw = true;
    field.items = items.slice();
    field.itemIndex = new Map(items.map((item, i) => [item, i]));
    field.buckets = items.map(() => []);
    for (let r = 0; r < this.rows.length; r++) {
      const text = column[r];
      if (text == null) continue;
      const idx = field.itemIndex.get(text);
      if (idx !== undefined) field.buckets[idx]!.push(r);
    }
  }
}

/** Running accumulator for one aggregation cell. */
export class Aggregator {
  n = 0; nums = 0; sum = 0; product = 1; min = Infinity; max = -Infinity;
  private squares = 0;

  add(value: unknown): void {
    if (value == null || value === '') return;
    this.n++;
    if (typeof value === 'number' && Number.isFinite(value)) {
      this.nums++;
      this.sum += value;
      this.squares += value * value;
      this.product *= value;
      if (value < this.min) this.min = value;
      if (value > this.max) this.max = value;
    }
  }

  result(type: SubtotalType): number | null {
    switch (type) {
      case SubtotalType.count: return this.n;
      case SubtotalType.countNums: return this.nums;
      case SubtotalType.sum: return this.nums ? this.sum : null;
      case SubtotalType.average: return this.nums ? this.sum / this.nums : null;
      case SubtotalType.max: return this.nums ? this.max : null;
      case SubtotalType.min: return this.nums ? this.min : null;
      case SubtotalType.product: return this.nums ? this.product : null;
      case SubtotalType.stdDev: return this.nums > 1 ? Math.sqrt((this.squares - this.sum * this.sum / this.nums) / (this.nums - 1)) : (this.nums === 1 ? 0 : null);
      case SubtotalType.stdDevp: return this.nums ? Math.sqrt((this.squares - this.sum * this.sum / this.nums) / this.nums) : null;
      case SubtotalType.varr: return this.nums > 1 ? (this.squares - this.sum * this.sum / this.nums) / (this.nums - 1) : (this.nums === 1 ? 0 : null);
      case SubtotalType.varp: return this.nums ? (this.squares - this.sum * this.sum / this.nums) / this.nums : null;
      default: return null;
    }
  }
}

/**
 * Group rows by the item index of a field, restricted to the given source
 * rows, and aggregate. Returns one accumulator per cache item.
 */
export function aggregateField(cache: PivotCache, field: string, sourceName: string, rowRows: number[]): (Aggregator | null)[] {
  const index = cache.fieldIndex.get(field);
  const out: (Aggregator | null)[] = index === undefined ? [] : cache.fields[index]!.items.map(() => null);
  if (index === undefined) return out;
  const values = cache.rows.map((_, r) => cache.displayValue(r, index));
  for (const r of rowRows) {
    const value = values[r];
    if (value == null || value === '') continue;
    const key = value instanceof Date ? String(value.getTime()) : typeof value === 'number' ? String(value) : String(value);
    const item = cache.fields[index]!.itemIndex.get(key);
    if (item === undefined) continue;
    (out[item] ??= new Aggregator()).add(cache.numeric(r, sourceName) ?? cache.rawText(r, sourceName));
  }
  return out;
}

/**
 * Rows matching every (field, item) constraint given as a path of
 * [fieldName, itemText] pairs (null item = any).
 */
export function filterRows(cache: PivotCache, path: readonly (readonly [string, string | null])[]): number[] {
  let rows: number[] | null = null;
  for (const [fieldName, item] of path) {
    const index = cache.fieldIndex.get(fieldName);
    if (index === undefined) return [];
    const field = cache.fields[index]!;
    const matched: number[] = [];
    if (item == null) {
      for (const bucket of field.buckets) matched.push(...bucket);
    } else {
      const itemIdx = field.itemIndex.get(item);
      const bucket = itemIdx === undefined ? undefined : field.buckets[itemIdx];
      if (bucket) matched.push(...bucket);
    }
    matched.sort((a, b) => a - b);
    if (rows === null) rows = matched;
    else rows = intersect(rows, matched);
    if (!rows.length) break;
  }
  return rows ?? Array.from({ length: cache.rows.length }, (_, i) => i);
}

function intersect(a: number[], b: number[]): number[] {
  const set = new Set(a.length <= b.length ? a : b);
  const other = a.length <= b.length ? b : a;
  return other.filter(x => set.has(x)).sort((x, y) => x - y);
}

/** Item visibility under a label filter (text list or caption condition). */
export function labelFilterAllows(filter: PivotFieldModel['labelFilter'], itemText: string): boolean {
  if (!filter) return true;
  if ('textItem' in filter) {
    const { list, isAll } = filter.textItem;
    if (isAll) return true;
    return list.some(x => String(x) === itemText);
  }
  const condition = filter.condition as { val: unknown[]; operator: number };
  return captionConditionAllows(itemText, condition);
}

function captionConditionAllows(text: string, condition: { val: unknown[]; operator: number }): boolean {
  const expected = condition.val?.[0];
  const compare = compareMaybeNumeric(text, expected);
  switch (condition.operator) {
    case 0: return compare.eq;
    case 1: return !compare.eq;
    case 2: return text.startsWith(String(expected ?? ''));
    case 3: return !text.startsWith(String(expected ?? ''));
    case 4: return text.endsWith(String(expected ?? ''));
    case 5: return !text.endsWith(String(expected ?? ''));
    case 6: return text.toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 7: return !text.toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 8: return compare.lt === false && compare.eq === false;
    case 9: return compare.eq || compare.gt === false;
    case 10: return compare.gt === false && compare.eq === false;
    case 11: return compare.eq || compare.lt === false;
    case 12: {
      const [lo, hi] = condition.val ?? [];
      return !(compareNum(text, lo).lt || compareNum(text, hi).gt);
    }
    case 13: {
      const [lo, hi] = condition.val ?? [];
      return compareNum(text, lo).lt || compareNum(text, hi).gt;
    }
    default: return true;
  }
}

function isNumLike(x: unknown): boolean { return x != null && x !== '' && Number.isFinite(Number(x)); }

function compareMaybeNumeric(text: string, expected: unknown) {
  if (isNumLike(text) && isNumLike(expected)) {
    const a = Number(text), b = Number(expected);
    return { eq: a === b, lt: a < b, gt: a > b };
  }
  const a = text.toLowerCase(), b = String(expected ?? '').toLowerCase();
  return { eq: a === b, lt: a < b, gt: a > b };
}

function compareNum(text: string, bound: unknown) {
  const r = compareMaybeNumeric(text, bound);
  return r;
}

/** Value/top10 filter over aggregated results, applied to item lists. */
export function valueFilterItems(
  filter: (IPivotConditionFilterInfo & { kind: 'condition' }) | undefined,
  items: string[],
  valueOf: (itemText: string) => number | null,
): string[] {
  if (!filter) return items;
  const condition = filter.condition as { conType: number; val: unknown; operator: number; type?: number };
  if (condition.conType === 3 /* top10 */) {
    const scored = items.map(item => ({ item, value: valueOf(item) ?? Number.NEGATIVE_INFINITY }));
    scored.sort((a, b) => b.value - a.value);
    let count: number;
    if ((condition.type ?? 0) === 0) count = Math.round(Number(condition.val));
    else {
      const values = items.map(valueOf).filter((v): v is number => v != null);
      const total = values.reduce((s, v) => s + v, 0);
      const bySum = (condition.type ?? 0) === 2;
      if (bySum) {
        let acc = 0;
        for (count = 0; count < scored.length && acc < total * Number(condition.val) / 100; count++) acc += scored[count]!.value;
      } else {
        count = Math.ceil(items.length * Number(condition.val) / 100);
      }
    }
    const top = scored.slice(0, Math.max(0, count)).map(entry => entry.item);
    if (condition.operator === -1 /* bottom */) {
      const bottomSet = new Set(scored.slice(scored.length - Math.max(0, count)).map(entry => entry.item));
      return items.filter(item => bottomSet.has(item));
    }
    const topSet = new Set(top);
    return items.filter(item => topSet.has(item));
  }
  const op = condition.operator, val = condition.val as number[];
  return items.filter(item => {
    const value = valueOf(item);
    if (value == null) return false;
    switch (op) {
      case 0: return value === Number(val[0]);
      case 1: return value !== Number(val[0]);
      case 2: return value > Number(val[0]);
      case 3: return value >= Number(val[0]);
      case 4: return value < Number(val[0]);
      case 5: return value <= Number(val[0]);
      case 6: return value >= Number(val[0]) && value <= Number(val[1]);
      case 7: return value < Number(val[0]) || value > Number(val[1]);
      default: return true;
    }
  });
}

/** Sort items: default ascending (numbers numerically), otherwise per sortInfo. */
export function sortItems(cache: PivotCache, field: PivotFieldModel, items: string[]): string[] {
  const info = field.sortInfo;
  const out = items.slice();
  if (info?.customSortList) {
    const order = new Map(info.customSortList.map((x, i) => [String(x), i]));
    out.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
    return out;
  }
  if (info?.customSortCallback) {
    try { return (info.customSortCallback(out.slice(), { sortType: info.sortType ?? SortType.asc }) as string[]); }
    catch { /* fall through to the standard comparison */ }
  }
  const descending = info?.sortType === SortType.desc;
  if (info?.sortValueFieldName) {
    // value-based sorting is applied by the caller through `valuesOf`
    return descending ? out.slice().reverse() : out;
  }
  const numeric = cache.fieldIndex.get(field.sourceName) != null
    && cache.fields[cache.fieldIndex.get(field.sourceName)!].dataType === PivotDataType.number;
  out.sort((a, b) => {
    if (numeric) return Number(a) - Number(b);
    const an = Number(a), bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  if (descending) out.reverse();
  return out;
}

export const showDataAsNormal = PivotShowDataAs.normal;
