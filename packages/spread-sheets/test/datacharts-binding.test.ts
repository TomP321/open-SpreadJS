import { describe, expect, it } from 'vitest';
import { applyFilter, bindHierarchy, bindPlot, categoryKey, toNumber } from '../src/datacharts/binding.js';

const ROWS: Record<string, unknown>[] = [
    { Region: 'East', Product: 'Juice', Category: 'Drinks', Sales: 140 },
    { Region: 'East', Product: 'Milk', Category: 'Drinks', Sales: 431 },
    { Region: 'North', Product: 'Juice', Category: 'Drinks', Sales: 250 },
    { Region: 'North', Product: 'Milk', Category: 'Food', Sales: 666 },
];

describe('binding aggregates', () => {
    it('sums per category and keeps first-seen category order', () => {
        const bound = bindPlot({ type: 'Column' as never, encodings: { values: [{ field: 'Sales', aggregate: 1 as never }], category: { field: 'Product' } } } as never, ROWS);
        expect(bound.categories).toEqual(['Juice', 'Milk']);
        expect(bound.series[0].points.map(p => p.value)).toEqual([390, 1097]);
    });

    it('supports count/average/max/min/first/last/countDistinct', () => {
        const bind = (aggregate: number) => bindPlot({ type: 'Column' as never, encodings: { values: [{ field: 'Sales', aggregate }], category: { field: 'Product' } } } as never, ROWS);
        expect(bind(2).series[0].points.map(p => p.value)).toEqual([2, 2]);
        expect(bind(3).series[0].points.map(p => p.value)).toEqual([195, 548.5]);
        expect(bind(4).series[0].points.map(p => p.value)).toEqual([250, 666]);
        expect(bind(5).series[0].points.map(p => p.value)).toEqual([140, 431]);
        expect(bind(0).series[0].points.map(p => p.value)).toEqual([140, 431]);
        expect(bind(13).series[0].points.map(p => p.value)).toEqual([250, 666]);
        expect(bind(12).series[0].points.map(p => p.value)).toEqual([2, 2]);
    });

    it('defaults to sum when aggregate is omitted', () => {
        const bound = bindPlot({ type: 'Column' as never, encodings: { values: [{ field: 'Sales' }], category: { field: 'Region' } } } as never, ROWS);
        expect(bound.series[0].points.map(p => p.value)).toEqual([571, 916]);
    });

    it('VALUE_NAMES colours make one series per value field', () => {
        const bound = bindPlot({
            type: 'Column' as never,
            encodings: {
                values: [{ field: 'Sales' }, { field: 'Other' }],
                category: { field: 'Product' },
                color: { field: 'VALUE_NAMES' },
            },
        } as never, [{ Product: 'A', Sales: 1, Other: 2 }, { Product: 'B', Sales: 3, Other: 4 }]);
        expect(bound.legend).toEqual(['Sales', 'Other']);
        expect(bound.series.map(s => s.name)).toEqual(['Sales', 'Other']);
    });

    it('a real colour field on a plain column picks the first colour per category (trial)', () => {
        const bound = bindPlot({
            type: 'Column' as never,
            encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' }, color: { field: 'Region' } },
        } as never, ROWS);
        expect(bound.categories).toEqual(['Juice', 'Milk']);
        expect(bound.series).toHaveLength(1);
        expect(bound.series[0].points.map(p => p.value)).toEqual([390, 1097]);
        expect(bound.legend).toEqual(['East']);
        expect(bound.series[0].pointColorIndices).toEqual([0, 0]);
    });

    it('a colour field does not split series even when stacked (trial)', () => {
        const bound = bindPlot({
            type: 'StackedColumn' as never,
            encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' }, color: { field: 'Region' } },
        } as never, ROWS);
        expect(bound.legend).toEqual(['East']);
        expect(bound.series).toHaveLength(1);
        expect(bound.series[0].points.map(p => p.value)).toEqual([390, 1097]);
    });

    it('sorts categories by the category sort option', () => {
        const bound = bindPlot({
            type: 'Column' as never,
            encodings: { values: [{ field: 'Sales' }], category: { field: 'Product', sort: { field: 'Sales', aggregate: 1 as never, order: 'Descending' as never } } },
        } as never, ROWS);
        expect(bound.categories).toEqual(['Milk', 'Juice']);
    });
});

describe('binding filters', () => {
    it('supports comparison, string and logical-group operators', () => {
        const gt = applyFilter(ROWS, { field: 'Sales', operate: 'GreaterThan' as never, value: 300 as never });
        expect(gt).toHaveLength(2);
        const contains = applyFilter(ROWS, { field: 'Product', operate: 'Contains' as never, value: 'ui' as never });
        expect(contains).toHaveLength(2);
        const starts = applyFilter(ROWS, { field: 'Region', operate: 'StartsWith' as never, value: 'no' as never, ignoreCase: true });
        expect(starts).toHaveLength(2);
        const group = applyFilter(ROWS, {
            operate: 'AND' as never,
            conditions: [
                { field: 'Region', operate: 'EqualsTo' as never, value: 'East' as never },
                { field: 'Sales', operate: 'GreaterThanOrEqualsTo' as never, value: 200 as never },
            ],
        } as never);
        expect(group).toHaveLength(1);
        const or = applyFilter(ROWS, {
            operate: 'OR' as never,
            conditions: [
                { field: 'Category', operate: 'EqualsTo' as never, value: 'Food' as never },
                { field: 'Sales', operate: 'LessThan' as never, value: 200 as never },
            ],
        } as never);
        expect(or).toHaveLength(2);
        const excluded = applyFilter(ROWS, { field: 'Product', operate: 'In' as never, value: ['Milk'] as never, excludeMatched: true });
        expect(excluded).toHaveLength(2);
    });

    it('applies the filter before grouping', () => {
        const bound = bindPlot({
            type: 'Column' as never,
            encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' }, filter: { field: 'Region', operate: 'EqualsTo' as never, value: 'North' as never } },
        } as never, ROWS);
        expect(bound.series[0].points.map(p => p.value)).toEqual([250, 666]);
    });
});

describe('binding special encodings', () => {
    it('range vectors ignore the aggregates and sum lower/upper (trial)', () => {
        const bound = bindPlot({
            type: 'RangeColumn' as never,
            encodings: {
                values: [{ vectors: { lower: { field: 'Sales', aggregate: 5 as never }, upper: { field: 'Sales', aggregate: 4 as never } } } as never],
                category: { field: 'Region' },
            },
        } as never, ROWS);
        expect(bound.categories).toEqual(['East', 'North']);
        expect(bound.lowerValues).toEqual([571, 916]);
        expect(bound.series[0].points.map(p => p.value)).toEqual([571, 916]);
    });

    it('stock vectors use trial fixed aggregates (first/max/min/last)', () => {
        const vec = (field: string) => ({ field });
        const bound = bindPlot({
            type: 'Candlestick' as never,
            encodings: {
                values: [{ vectors: { open: vec('Sales'), high: vec('Sales'), low: vec('Sales'), close: vec('Sales') } } as never],
                category: { field: 'Product' },
            },
        } as never, [{ Product: 'A', Sales: 3 }, { Product: 'A', Sales: 5 }, { Product: 'B', Sales: 9 }]);
        expect(bound.stock).toBeDefined();
        const stock = bound.stock!;
        expect(stock.open).toEqual([3, 9]); // first value per category
        expect(stock.high).toEqual([5, 9]); // max
        expect(stock.low).toEqual([3, 9]); // min
        expect(stock.close).toEqual([5, 9]); // last
    });

    it('treemap hierarchy aggregates category/child', () => {
        const hierarchy = bindHierarchy({
            type: 'Treemap' as never,
            encodings: { values: [{ field: 'Sales', aggregate: 1 as never }], category: { field: 'Category', child: { field: 'Product' } } },
        } as never, ROWS);
        expect([...hierarchy.keys()]).toEqual(['Drinks', 'Food']);
        expect(hierarchy.get('Drinks')?.get('Juice')).toBe(390);
        expect(hierarchy.get('Food')?.get('Milk')).toBe(666);
    });

    it('date-mode categories bucket dates', () => {
        const date = new Date(2022, 2, 15);
        expect(categoryKey({ d: date }, { field: 'd', dateMode: 6 as never })).toBe('2022-03');
        expect(categoryKey({ d: date }, { field: 'd', dateMode: 7 as never })).toBe('2022');
        expect(categoryKey({ d: date }, { field: 'd' })).toBe('2022-03-15');
    });

    it('toNumber coerces the trial value kinds', () => {
        expect(toNumber('42')).toBe(42);
        expect(toNumber(true)).toBe(1);
        expect(toNumber(null)).toBe(0);
        expect(toNumber('abc')).toBe(0);
        expect(toNumber(new Date(2020, 0, 1))).toBe(new Date(2020, 0, 1).getTime());
    });
});
