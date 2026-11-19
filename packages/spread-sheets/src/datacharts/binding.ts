/**
 * DataCharts data binding: resolves a plot config against a GC.Data table
 * (grouping, aggregation, filters, sorting, colour encodings) into the
 * flat model the painter consumes.
 */

import type { Worksheet } from '../worksheet.js';
import type { Table } from '../data/index.js';
import type {
    ICategoryEncodingOption,
    IFilterOption,
    IPlotOption,
    IValueEncodingOption,
    IRangeValueEncodingOption,
    IStockValueEncodingOption,
} from './types.js';
import { isFilterGroup } from './types.js';

export type Row = Record<string, unknown>;

/** One aggregated number on the plot (one category × one series). */
export interface BoundPoint {
    /** Raw numeric value before stacking/percentage layout. */
    value: number;
    /** Row count aggregated into the point (for tooltips/averages). */
    count: number;
    /** Row of the group, when available (colour-key resolution). */
    sampleRow?: Row;
}

export interface BoundSeries {
    /** Legend label (value field display name or colour/series value). */
    name: string;
    points: BoundPoint[];
    /** Palette index for the whole series (clustered/stacked/VALUE_NAMES). */
    seriesColorIndex: number;
    /** Per-point palette indices (colour encoding on non-stacked plots). */
    pointColorIndices?: number[];
    /** Details subdivision values, indexed [category][detail-key slot]. */
    subs?: number[][];
}

export interface BoundPlot {
    plot: IPlotOption;
    categories: string[];
    series: BoundSeries[];
    /** Legend entries (unique colour keys or series names); empty = hidden. */
    legend: string[];
    /** True when each values[] entry is its own series (VALUE_NAMES / none). */
    splitByValues: boolean;
    /**
     * `encodings.details` subdivision keys per category (trial: the details
     * field splits the category band into sub-bars, one per detail value, in
     * row order — measured on the tooltip-details crop; no legend is added).
     */
    detailKeys?: string[][];
    /** Scatter/bubble: numeric x per point (aligned with series[0].points). */
    xs?: number[];
    /** Bubble: size channel values per point. */
    sizeValues?: number[];
    /** Range plots: lower bound per category (series[0].pointLower). */
    lowerValues?: number[];
    /** Stock plots: open/close per category (high/low use value/extra). */
    stock?: { open: number[]; high: number[]; low: number[]; close: number[] };
    /** Treemap/sunburst hierarchy: per-category child keys (labelled slices). */
    hierarchy?: Map<string, Map<string, number>>;
    /** Error message when binding failed (table missing, bad field, ...). */
    error?: string;
}

type RowList = Row[];

const aggregateFns: Record<number, (rows: RowList, field: string) => number> = {
    0: (rows, field) => toNumber(rows.length ? rows[0][field] : 0),
    1: (rows, field) => rows.reduce((acc, row) => acc + toNumber(row[field]), 0),
    2: rows => rows.length,
    3: (rows, field) => (rows.length ? rows.reduce((acc, row) => acc + toNumber(row[field]), 0) / rows.length : 0),
    4: (rows, field) => rows.reduce((acc, row) => Math.max(acc, toNumber(row[field])), -Infinity),
    5: (rows, field) => rows.reduce((acc, row) => Math.min(acc, toNumber(row[field])), Infinity),
    12: (rows, field) => new Set(rows.map(row => String(row[field] ?? ''))).size,
    13: (rows, field) => (rows.length ? toNumber(rows[rows.length - 1][field]) : 0),
};

export function toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.getTime();
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return formatDate(value);
    if (typeof value === 'number') return formatNumber(value);
    return String(value);
}

/** Short date label matching the trial's category axis (yyyy-mm-dd style). */
function formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Compact number rendering used for axis labels and data labels. */
export function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const rounded = Math.round(value * 1e6) / 1e6;
    return String(rounded);
}

function aggregateName(aggregate: number | undefined): number {
    return aggregate === undefined ? 1 : aggregate; // default: sum
}

function aggregate(agg: number, rows: RowList, field: string): number {
    const fn = aggregateFns[agg] ?? aggregateFns[1];
    const result = fn(rows, field);
    return Number.isFinite(result) ? result : 0;
}

/** Apply a filter option tree to the rows. */
export function applyFilter(rows: RowList, filter: IFilterOption | undefined): RowList {
    if (!filter) return rows;
    if (isFilterGroup(filter)) {
        const parts = filter.conditions.map(cond => applyFilter(rows, cond));
        const isAnd = String(filter.operate).toUpperCase() === 'AND';
        if (isAnd) {
            let result = rows;
            for (const part of parts) {
                const keep = new Set(part);
                result = result.filter(row => keep.has(row));
            }
            return result;
        }
        const union = new Set<Row>();
        for (const part of parts) for (const row of part) union.add(row);
        return rows.filter(row => union.has(row));
    }
    const field = filter.field;
    const operate = String(filter.operate);
    const ignoreCase = !!filter.ignoreCase;
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const matched = rows.filter(row => {
        const cell = row[field];
        switch (operate) {
            case 'In': return values.some(v => compareEqual(cell, v, ignoreCase));
            case 'EqualsTo': return values.some(v => compareEqual(cell, v, ignoreCase));
            case 'NotEqualsTo': return !values.some(v => compareEqual(cell, v, ignoreCase));
            case 'GreaterThan': return compareOrder(cell, values[0]) > 0;
            case 'GreaterThanOrEqualsTo': return compareOrder(cell, values[0]) >= 0;
            case 'LessThan': return compareOrder(cell, values[0]) < 0;
            case 'LessThanOrEqualsTo': return compareOrder(cell, values[0]) <= 0;
            case 'Contains': return textOf(cell, ignoreCase).includes(textOf(values[0], ignoreCase));
            case 'StartsWith': return textOf(cell, ignoreCase).startsWith(textOf(values[0], ignoreCase));
            case 'EndsWith': return textOf(cell, ignoreCase).endsWith(textOf(values[0], ignoreCase));
            default: return true;
        }
    });
    return filter.excludeMatched ? rows.filter(row => !matched.includes(row)) : matched;
}

function textOf(value: unknown, ignoreCase: boolean): string {
    const text = formatCell(value);
    return ignoreCase ? text.toLowerCase() : text;
}

function compareEqual(cell: unknown, value: unknown, ignoreCase: boolean): boolean {
    if (cell instanceof Date || value instanceof Date) {
        const left = cell instanceof Date ? cell.getTime() : toNumber(cell);
        const right = value instanceof Date ? value.getTime() : toNumber(value);
        return left === right;
    }
    if (typeof cell === 'number' || typeof value === 'number') {
        if (typeof cell === 'string' && cell.trim() !== '' && !Number.isFinite(Number(cell))) return ignoreCaseText(cell, value, ignoreCase);
        return toNumber(cell) === toNumber(value);
    }
    return ignoreCaseText(cell, value, ignoreCase);
}

function ignoreCaseText(cell: unknown, value: unknown, ignoreCase: boolean): boolean {
    const left = String(cell ?? '');
    const right = String(value ?? '');
    return ignoreCase ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function compareOrder(cell: unknown, value: unknown): number {
    if (cell instanceof Date || value instanceof Date) {
        const left = cell instanceof Date ? cell.getTime() : toNumber(cell);
        const right = value instanceof Date ? value.getTime() : toNumber(value);
        return left - right;
    }
    if (typeof cell === 'number' || typeof value === 'number') return toNumber(cell) - toNumber(value);
    return String(cell ?? '').localeCompare(String(value ?? ''));
}

function groupBy(rows: RowList, key: (row: Row) => string): Map<string, RowList> {
    const groups = new Map<string, RowList>();
    for (const row of rows) {
        const k = key(row);
        const bucket = groups.get(k);
        if (bucket) bucket.push(row);
        else groups.set(k, [row]);
    }
    return groups;
}

/** Category label for a row (date modes bucket dates into calendar units). */
export function categoryKey(row: Row, category: ICategoryEncodingOption | undefined): string {
    if (!category) return '';
    const raw = row[category.field];
    const mode = category.dateMode;
    if (mode !== undefined && raw instanceof Date) return dateBucket(raw, mode);
    return formatCell(raw);
}

function dateBucket(date: Date, mode: number): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    switch (mode) {
        case 7: return `${y}`;
        case 8: return `${y}-Q${Math.floor(date.getMonth() / 3) + 1}`;
        case 6: return `${y}-${pad(date.getMonth() + 1)}`;
        case 5: {
            const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const weekday = (day.getDay() + 6) % 7; // Monday first
            day.setDate(day.getDate() - weekday);
            return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
        }
        case 4: return formatDate(date);
        case 3: return `${formatDate(date)} ${pad(date.getHours())}:00`;
        case 2: return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        case 1: return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        default: return date.toISOString();
    }
}

function isStockEncoding(values: unknown): values is IStockValueEncodingOption[] {
    return Array.isArray(values) && values.length === 1 && !!(values[0] as IStockValueEncodingOption).vectors?.high;
}

function isRangeEncoding(values: unknown): values is IRangeValueEncodingOption[] {
    return Array.isArray(values) && values.length === 1 && !!(values[0] as IRangeValueEncodingOption).vectors;
}

const STACKED_RE = /^(stacked|percentStacked|radialStacked|polarCoordinatesStacked)/i;
const VALUE_NAMES = 'VALUE_NAMES';

export function isStackedType(type: string): boolean {
    return STACKED_RE.test(String(type));
}

export function isPercentType(type: string): boolean {
    return /percentStacked/i.test(String(type));
}

/** Resolve `tableName` through the workbook's GC.Data tables. */
export function resolveTable(sheet: Worksheet | undefined, tableName: string | undefined): Table | null {
    if (!sheet || !tableName) return null;
    const workbook = sheet.getParent();
    if (!workbook) return null;
    const manager = (workbook as unknown as { dataManager(): { tables: Record<string, Table> } }).dataManager();
    return manager?.tables?.[tableName] ?? null;
}

/** Build the bound model for one plot against the given rows. */
export function bindPlot(plot: IPlotOption, allRows: RowList): BoundPlot {
    const out: BoundPlot = {
        plot,
        categories: [],
        series: [],
        legend: [],
        splitByValues: true,
    };
    const encodings = plot.encodings ?? {};
    const rows = applyFilter(allRows, encodings.filter);
    const category = encodings.category;
    const color = encodings.color;
    const values = (encodings.values ?? []) as IValueEncodingOption[];

    if (isStockEncoding(encodings.values)) {
        const vectors = encodings.values![0] as IStockValueEncodingOption;
        const groups = groupBy(rows, row => categoryKey(row, category));
        const cats = sortCategories([...groups.keys()], category, groups, values);
        out.categories = cats;
        // Trial: stock vectors ignore per-field aggregates and use
        // open=first, high=max, low=min, close=last within each category.
        const pick = (spec: { field: string } | undefined, agg: number) =>
            cats.map(cat => aggregate(agg, groups.get(cat) ?? [], spec?.field ?? ''));
        out.stock = {
            open: pick(vectors.vectors?.open, 0),
            high: pick(vectors.vectors?.high, 4),
            low: pick(vectors.vectors?.low, 5),
            close: pick(vectors.vectors?.close, 13),
        };
        out.series = [{ name: '', points: out.stock.high.map(high => ({ value: high, count: 1 })), seriesColorIndex: 0 }];
        out.legend = [];
        return out;
    }

    let lowerValues: number[] | undefined;
    let workValues = values;
    if (isRangeEncoding(encodings.values)) {
        // Trial (measured on the rangeColumn/rangeBar/rangeArea crops): range
        // vectors render as SUM of the vector fields (the requested aggregates
        // are ignored, like the stock vectors); the column/bar family draws
        // 0..upper and only the area family paints the lower edge.
        const vectors = (encodings.values![0] as IRangeValueEncodingOption).vectors;
        const groups = groupBy(rows, row => categoryKey(row, category));
        const cats = sortCategories([...groups.keys()], category, groups, values);
        out.categories = cats;
        const upper = cats.map(cat => aggregate(1, groups.get(cat) ?? [], vectors?.upper?.field ?? ''));
        lowerValues = cats.map(cat => aggregate(1, groups.get(cat) ?? [], vectors?.lower?.field ?? ''));
        out.lowerValues = lowerValues;
        out.series = [{ name: vectors?.upper?.displayName ?? vectors?.upper?.field ?? '', points: upper.map((value, i) => ({ value, count: (groups.get(cats[i]) ?? []).length })), seriesColorIndex: 0 }];
        out.legend = [];
        return out;
    }

    if (!values.length) return out;
    const scatterLike = /^(scatter|bubble)$/i.test(String(plot.type));
    if (scatterLike && values.length >= 2) {
        // Trial (measured on the scatter crop, every point checked): values[0]
        // is the HORIZONTAL channel and values[1] the vertical one.
        workValues = [values[1]];
        out.xs = rows.map(row => toNumber(row[values[0].field]));
    }
    else out.xs = undefined;

    const groups = groupBy(rows, row => categoryKey(row, category));
    let cats = sortCategories([...groups.keys()], category, groups, workValues);
    if (scatterLike && values.length >= 2) cats = []; // scatter ignores the category axis
    out.categories = cats;

    const colorField = color && color.field !== VALUE_NAMES ? color.field : undefined;
    const uniqueColorKeys: string[] = [];
    const colorIndexOf = (key: string): number => {
        let index = uniqueColorKeys.indexOf(key);
        if (index < 0) {
            uniqueColorKeys.push(key);
            index = uniqueColorKeys.length - 1;
        }
        return index;
    };

    // All plot families (stacked included) keep one series per values[] entry.
    // A colour encoding only picks one palette colour per category group (first
    // matching colour value) and lists the colour values in the legend; only
    // VALUE_NAMES splits the values into series (trial behaviour).
    out.splitByValues = true;
    out.series = workValues.map((valueSpec, seriesIndex) => {
        const points = cats.map(cat => aggregatePoint(valueSpec, groups.get(cat) ?? []));
        const pointColorIndices = colorField
            ? cats.map(cat => colorIndexOf(firstValueOf(groups.get(cat) ?? [], colorField)))
            : undefined;
        return {
            name: valueSpec.displayName ?? valueSpec.field,
            points,
            seriesColorIndex: seriesIndex,
            pointColorIndices,
        };
    });
    if (scatterLike && values.length >= 2 && out.series.length) {
        // Scatter: each row is one point; x comes from values[0], y from values[1].
        const spec = values[1];
        out.xs = rows.map(row => toNumber(row[values[0].field]));
        out.series = [{
            name: spec.displayName ?? spec.field,
            points: rows.map(row => aggregatePoint(spec, [row])),
            seriesColorIndex: 0,
        }];
        const sizeField = encodings.size?.field;
        if (sizeField) out.sizeValues = rows.map(row => toNumber(row[sizeField]));
        if (colorField) {
            out.series[0].pointColorIndices = rows.map(row => colorIndexOf(firstValueOf([row], colorField)));
            out.legend = [...uniqueColorKeys];
        }
    }
    // `details` subdivides every category band (trial tooltip-details crop):
    // one sub-bar per unique detail value, in row order, same series colour,
    // no extra legend entries.
    const detailField = (encodings.details ?? [])[0]?.field;
    if (detailField && cats.length && !(scatterLike && values.length >= 2)) {
        out.detailKeys = cats.map(cat => {
            const keys: string[] = [];
            for (const row of groups.get(cat) ?? []) {
                const key = formatCell(row[detailField]);
                if (!keys.includes(key)) keys.push(key);
            }
            return keys;
        });
        out.series.forEach((s, si) => {
            const spec = workValues[si];
            s.subs = cats.map((cat, ci) => (out.detailKeys![ci] ?? []).map(key =>
                aggregatePoint(spec, (groups.get(cat) ?? []).filter(row => formatCell(row[detailField]) === key)).value));
        });
    }
    if (colorField) out.legend = [...uniqueColorKeys];
    else if (color && color.field === VALUE_NAMES) out.legend = out.series.map(s => s.name);
    else if (out.series.length > 1) out.legend = out.series.map(s => s.name);
    return out;
}

function aggregatePoint(spec: IValueEncodingOption | undefined, rows: RowList): BoundPoint {
    if (!spec) return { value: 0, count: rows.length };
    return { value: aggregate(aggregateName(spec.aggregate), rows, spec.field), count: rows.length, sampleRow: rows[0] };
}

function firstValueOf(rows: RowList, field: string): string {
    return rows.length ? formatCell(rows[0][field]) : '';
}

function sortCategories(
    cats: string[],
    category: ICategoryEncodingOption | undefined,
    groups: Map<string, RowList>,
    values: IValueEncodingOption[],
): string[] {
    const sort = category?.sort;
    if (!sort || String(sort.order ?? 'None') === 'None') return cats;
    const agg = sort.aggregate ?? 1;
    const score = (cat: string): number => {
        const rows = groups.get(cat) ?? [];
        if (sort.field === VALUE_NAMES && values.length) return aggregate(agg, rows, values[0].field);
        return aggregate(agg, rows, sort.field);
    };
    const scores = new Map(cats.map(cat => [cat, score(cat)]));
    const desc = String(sort.order) === 'Descending';
    return [...cats].sort((a, b) => {
        const left = scores.get(a) ?? 0;
        const right = scores.get(b) ?? 0;
        return desc ? right - left : left - right;
    });
}

/** Treemap/sunburst hierarchy: category -> child -> aggregated value. */
export function bindHierarchy(plot: IPlotOption, allRows: RowList): Map<string, Map<string, number>> {
    const result = new Map<string, Map<string, number>>();
    const category = plot.encodings?.category;
    const values = (plot.encodings?.values ?? []) as IValueEncodingOption[];
    const spec = values[0];
    if (!category) return result;
    const rows = applyFilter(allRows, plot.encodings?.filter);
    const topGroups = groupBy(rows, row => categoryKey(row, category));
    for (const [cat, topRows] of topGroups) {
        const inner = new Map<string, number>();
        const child = category.child;
        const childRows = child ? groupBy(topRows, row => categoryKey(row, child)) : new Map<string, RowList>([['', topRows]]);
        for (const [key, bucket] of childRows) inner.set(key, spec ? aggregate(aggregateName(spec.aggregate), bucket, spec.field) : bucket.length);
        result.set(cat, inner);
    }
    return result;
}
