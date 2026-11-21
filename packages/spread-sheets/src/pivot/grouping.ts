/**
 * Pivot field grouping (TASK 42 item 1).
 * Date grouping creates a derived `<Unit> (Origin)` field (years / quarters /
 * months / days) with calendar buckets plus the `<start` / `>end` boundary
 * groups; number grouping buckets the origin field in place (`start..` step
 * `by`, boundary groups `<start` and `>(end+1)`); text grouping maps items to
 * named groups (items without a group form their own one).
 * The functions here are pure: they compute the derived column values, the
 * display item lists and the `fieldGroup` JSON blocks the trial stores in the
 * pivot cache. `<`/`>` inside stored group labels are HTML-escaped, exactly
 * like the trial JSON.
 */
import {} from './types.js';

export interface DateGroupSpec { by: number; groupInterval?: number; start?: Date; end?: Date }
export interface NumberGroupSpec { by: number; start?: number; end?: number }
export interface TextGroupSpec { fieldName: string; groupItems: Record<string, (string | number)[]> }

export interface DerivedColumn {
  /** Item text per source row (null when the row matches no group). */
  column: (string | null)[];
  /** Display item texts in cache order. */
  items: string[];
  /** `fieldGroup` block written to the pivot cache JSON. */
  fieldGroup: Record<string, unknown>;
  /** IFieldInfo start/end dates for date groups. */
  start?: Date;
  end?: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UNIT_NAMES: Record<number, string> = { 3: 'Days', 4: 'Months', 5: 'Quarters', 6: 'Years' };

export function dateGroupName(unit: number, origin: string): string {
  return `${UNIT_NAMES[unit] ?? 'Years'} (${origin})`;
}

const escapeLabel = (label: string): string => label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function usDate(value: Date): string {
  return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
}

function isoLocal(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

/** True when both endpoints are plain midnight dates (the usual case). */
function dayOf(value: Date): number {
  return Math.floor(new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime() / 86400000);
}

function epochOf(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Date grouping of one origin column. `unit`: 3 days, 4 months, 5 quarters,
 * 6 years (GC.Pivot.DateGroupType). Start/end default to the data min/max,
 * like the trial's auto behaviour.
 */
export function buildDateGroups(values: unknown[], unit: number, spec: DateGroupSpec): DerivedColumn {
  let min: Date | undefined;
  let max: Date | undefined;
  for (const value of values) {
    const time = value instanceof Date ? value.getTime() : value == null || value === '' ? NaN : Date.parse(String(value));
    if (Number.isNaN(time)) continue;
    const date = new Date(time);
    if (!min || time < min.getTime()) min = date;
    if (!max || time > max.getTime()) max = date;
  }
  if (!min || !max) {
    return { column: values.map(() => null), items: [], fieldGroup: { base: 0, groupItems: [], hasRangeGroup: true, groupBy: groupNameOf(unit) } };
  }
  const start = spec.start instanceof Date ? spec.start : min;
  const end = spec.end instanceof Date ? spec.end : max;
  const items = [`<${usDate(start)}`];
  const buckets: { test: (date: Date) => boolean }[] = [
    { test: date => date.getTime() < new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() },
  ];
  const push = (label: string, test: (date: Date) => boolean): void => {
    items.push(label);
    buckets.push({ test });
  };
  if (unit === 6) {
    for (let year = start.getFullYear(); year <= end.getFullYear(); year++)
      push(String(year), date => date.getFullYear() === year);
  } else if (unit === 5) {
    for (let quarter = 0; quarter < 4; quarter++) {
      push(`Qtr${quarter + 1}`, date => Math.floor(date.getMonth() / 3) === quarter
        && date.getTime() >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
        && date.getTime() <= new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).getTime());
    }
  } else if (unit === 4) {
    for (let month = 0; month < 12; month++)
      push(MONTHS[month]!, date => date.getMonth() === month);
  } else {
    const interval = Math.max(1, Math.trunc(spec.groupInterval ?? 1));
    const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const days = Math.max(0, Math.floor((new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() - startTime) / 86400000));
    for (let offset = 0; offset <= days; offset += interval) {
      const bucketStart = new Date(startTime + offset * 86400000);
      const bucketEnd = new Date(bucketStart.getTime() + (interval - 1) * 86400000);
      const label = interval === 1 ? `${bucketStart.getDate()}-${MONTHS[bucketStart.getMonth()]}` : `${usDate(bucketStart)} - ${usDate(bucketEnd)}`;
      push(label, date => dayOf(date) >= dayOf(bucketStart) && dayOf(date) <= dayOf(bucketEnd));
    }
  }
  const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).getTime();
  items.push(`>${usDate(end)}`);
  buckets.push({ test: date => date.getTime() > endTime });
  const column = values.map(value => {
    const time = epochOf(value);
    if (time == null) return null;
    const date = new Date(time);
    for (let i = 1; i < buckets.length; i++) if (buckets[i]!.test(date)) return items[i]!;
    return items[0]!;
  });
  const fieldGroup: Record<string, unknown> = {
    startDate: isoLocal(start),
    endDate: isoLocal(end),
    autoStart: spec.start === undefined,
    autoEnd: spec.end === undefined,
    groupBy: groupNameOf(unit),
    base: 0,
    hasRangeGroup: true,
    groupItems: items.map(label => ({ type: 's', value: escapeLabel(label) })),
  };
  return { column, items, fieldGroup, start, end };
}

function groupNameOf(unit: number): string {
  if (unit === 6) return 'years';
  if (unit === 5) return 'quarters';
  if (unit === 4) return 'months';
  return 'days';
}

/**
 * Number grouping of the origin column in place (the trial keeps the field
 * name and replaces its items). Cache labels include one bucket beyond
 * `end` plus a `>hi` tail; the display list ends at `>(end + 1)`.
 */
export function buildNumberGroups(values: unknown[], spec: NumberGroupSpec): DerivedColumn & { cacheItems: string[] } {
  let min = Infinity, max = -Infinity;
  for (const value of values) {
    if (typeof value !== 'number') continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const by = Math.abs(Number(spec.by)) || 1;
  const start = Number.isFinite(spec.start as number) ? Math.trunc(spec.start as number) : Math.floor(min / by) * by;
  const end = Number.isFinite(spec.end as number) ? Math.trunc(spec.end as number) : Math.floor(max / by) * by + by - 1;
  const displayItems: string[] = [`<${start}`];
  const bucketLo: number[] = [];
  const bucketHi: number[] = [];
  for (let lo = start; lo <= end; lo += by) {
    displayItems.push(`${lo}-${lo + by - 1}`);
    bucketLo.push(lo);
    bucketHi.push(lo + by - 1);
  }
  displayItems.push(`>${end + 1}`);
  // cache labels: one extra bucket and a `>lastHi+1` tail
  const cacheItems: string[] = [escapeLabel(`<${start}`)];
  const cacheLo: number[] = [];
  const cacheHi: number[] = [];
  for (let lo = start; lo <= end + by; lo += by) {
    cacheItems.push(escapeLabel(`${lo}-${lo + by - 1}`));
    cacheLo.push(lo);
    cacheHi.push(lo + by - 1);
  }
  cacheItems.push(escapeLabel(`>${(cacheHi[cacheHi.length - 1] ?? end) + 1}`));
  const bucketOf = (value: number, lo: number[], hi: number[]): number => {
    if (value < start) return 0;
    for (let i = 0; i < lo.length; i++) if (value >= lo[i]! && value <= hi[i]!) return i + 1;
    return lo.length + 1;
  };
  const column = values.map(value => {
    if (typeof value !== 'number') return null;
    const cacheIndex = bucketOf(value, cacheLo, cacheHi);
    // map the cache bucket onto the display item list
    if (cacheIndex === 0) return `<${start}`;
    if (cacheIndex > cacheLo.length) return `>${end + 1}`;
    const bucketStart = cacheLo[cacheIndex - 1]!;
    const position = bucketLo.indexOf(bucketStart);
    if (position >= 0 && position < bucketLo.length) return displayItems[position + 1]!;
    return `>${end + 1}`;
  });
  const fieldGroup: Record<string, unknown> = {
    startNum: start,
    endNum: end,
    autoStart: !Number.isFinite(spec.start as number),
    autoEnd: !Number.isFinite(spec.end as number),
    groupInterval: by,
    base: 1,
    hasRangeGroup: true,
    groupItems: cacheItems.map(label => ({ type: 's', value: label })),
  };
  return { column, items: displayItems, fieldGroup, cacheItems };
}

/**
 * Text grouping: each base item maps onto its group; items that belong to no
 * group form an implicit group named after themselves (like the trial).
 */
export function buildTextGroups(values: unknown[], spec: TextGroupSpec, baseItems: string[]): DerivedColumn {
  const groupNames: string[] = [];
  const membership = new Map<string, string>();
  for (const [group, items] of Object.entries(spec.groupItems ?? {})) {
    let created = false;
    for (const item of items) {
      membership.set(String(item), group);
      created = true;
    }
    if (created) groupNames.push(group);
  }
  for (const item of baseItems)
    if (!membership.has(item) && !groupNames.includes(item)) groupNames.push(item);
  const discrete = baseItems.map(item => groupNames.indexOf(membership.get(item) ?? item));
  const items = groupNames.slice();
  const column = values.map(value => {
    if (value == null || value === '') return null;
    const key = value instanceof Date ? String(value.getTime()) : String(value);
    const group = membership.get(key) ?? (groupNames.includes(key) ? key : null);
    return group;
  });
  const fieldGroup: Record<string, unknown> = {
    base: 0,
    groupItems: items.map(label => ({ type: 's', value: label })),
    discreteGroup: discrete,
  };
  return { column, items, fieldGroup };
}
