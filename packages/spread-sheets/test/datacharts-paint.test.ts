/**
 * TASK 45 — DataCharts painter model.
 *
 * Every expected value here was measured black-box from the official trial
 * runtime in the apps/compare dual-runtime harness (screenshots under
 * .probe/datachart-comparison/v14..v17): the value-axis ladder, the stacked
 * layout and the polar ring order are all read off the trial's pixels.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { niceScale, stackedValues, radarLayout } from '../src/datacharts/paint.js';
import { bindPlot } from '../src/datacharts/binding.js';

const { DataChartType, Aggregate } = GC.Spread.Sheets.DataCharts;

describe('DataCharts value axis (trial ladder)', () => {
    it('uses the six-interval ladder measured on the trial screenshots', () => {
        // column over 390..1097 -> trial ticks 0,200,...,1200
        expect(niceScale(0, 1097).ticks).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
        // waterfall over 0..2539 -> trial ticks 0,500,...,3000
        expect(niceScale(0, 2539).ticks).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000]);
        // step ladder includes 2.5 (the 2.5 x 10^n steps are measured on the
        // scatter axes; niceScale(0,15) exercises our helper on the same ladder)
        expect(niceScale(0, 15).ticks).toEqual([0, 2.5, 5, 7.5, 10, 12.5, 15]);
    });

    it('floors a positive-only data range six steps under the axis maximum', () => {
        // Trial: averages 262.5..369.75 -> axis 160..400 step 40 (not 260..380/20).
        const scale = niceScale(262.5, 369.75);
        expect(scale.min).toBe(160);
        expect(scale.max).toBe(400);
        expect(scale.ticks.length).toBe(7);
    });

    it('keeps zero inside the range when the data starts close to it', () => {
        // Trial: 390..1097 renders 0..1200.
        expect(niceScale(0, 1097).min).toBe(0);
    });

    it('picks the smallest 1/2/2.5/5 step that keeps seven intervals', () => {
        // Trial: filter over 218..666 renders 0..700 step 100 (not 0..800/200).
        expect(niceScale(0, 666).ticks).toEqual([0, 100, 200, 300, 400, 500, 600, 700]);
        // ...but 100 would give twelve intervals for 1097, so it steps up to 200.
        expect(niceScale(0, 1097).max).toBe(1200);
    });

    it('splits stock axes into eight intervals (candlestick/ohlc crops)', () => {
        // Trial: candlestick over highs to 15 renders 0,2,...,16.
        expect(niceScale(0, 15, 8, [1, 2, 2.5, 5, 10]).ticks)
            .toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16]);
    });
});

describe('DataCharts stacked layout', () => {
    const bound = {
        plot: { type: DataChartType.stackedColumn as never, encodings: {} },
        categories: ['a', 'b'],
        series: [
            { name: 's1', points: [{ value: 100, count: 1 }, { value: 400, count: 1 }], seriesColorIndex: 0 },
            { name: 's2', points: [{ value: 300, count: 1 }, { value: 100, count: 1 }], seriesColorIndex: 1 },
        ],
        legend: [],
        splitByValues: true,
    };

    it('stacks each series on top of the previous total', () => {
        expect(stackedValues(bound as never, 'StackedColumn')).toEqual([
            [0, 100, 0, 400],
            [100, 400, 400, 500],
        ]);
    });

    it('normalises percent stacks to the 0..1 axis', () => {
        const pairs = stackedValues(bound as never, 'PercentStackedColumn');
        expect(pairs[0]![1]).toBeCloseTo(0.25);
        expect(pairs[1]![1]).toBeCloseTo(1);
        expect(pairs[1]![3]).toBeCloseTo(1);
    });
});

describe('DataCharts binding semantics measured from the trial', () => {
    const rows = [
        { Product: 'Juice', Region: 'East', Sales: 140, Qty: 9 },
        { Product: 'Milk', Region: 'East', Sales: 431, Qty: 38 },
        { Product: 'Juice', Region: 'North', Sales: 250, Qty: 23 },
        { Product: 'Milk', Region: 'North', Sales: 666, Qty: 39 },
    ];

    it('a real colour field never splits the series; only VALUE_NAMES does', () => {
        const withColor = bindPlot({
            type: DataChartType.stackedColumn as never,
            encodings: {
                values: [{ field: 'Sales', aggregate: Aggregate.sum }],
                category: { field: 'Product' },
                color: { field: 'Region' },
            },
        } as never, rows as never);
        // Trial (stacked-color crop): one palette colour per category, taken from
        // the first matching row, so the legend lists the unique keys only.
        expect(withColor.series).toHaveLength(1);
        expect(withColor.legend).toEqual(['East']);
        expect(withColor.series[0]!.points.map(p => p.value)).toEqual([390, 1097]);

        const valueNames = bindPlot({
            type: DataChartType.column as never,
            encodings: {
                values: [{ field: 'Sales', aggregate: Aggregate.sum }, { field: 'Qty', aggregate: Aggregate.sum }],
                category: { field: 'Product' },
                color: { field: 'VALUE_NAMES' },
            },
        } as never, rows as never);
        expect(valueNames.series.map(s => s.name)).toEqual(['Sales', 'Qty']);
        expect(valueNames.legend).toEqual(['Sales', 'Qty']);
    });

    it('stock vectors ignore the requested aggregates (first/max/min/last)', () => {
        const stock = bindPlot({
            type: DataChartType.candlestick as never,
            encodings: {
                values: [{
                    vectors: {
                        open: { field: 'Open', aggregate: Aggregate.sum },
                        high: { field: 'High', aggregate: Aggregate.sum },
                        low: { field: 'Low', aggregate: Aggregate.sum },
                        close: { field: 'Close', aggregate: Aggregate.sum },
                    },
                }],
                category: { field: 'Product' },
            },
        } as never, [
            { Product: 'Juice', Open: 4, High: 8, Low: 3, Close: 6 },
            { Product: 'Juice', Open: 7, High: 10, Low: 6, Close: 8 },
        ] as never);
        expect(stock.stock).toEqual({ open: [4], high: [10], low: [3], close: [8] });
    });

    it('details subdivides every category band (trial tooltip-details crop)', () => {
        const bound = bindPlot({
            type: DataChartType.column as never,
            encodings: {
                values: [{ field: 'Sales', aggregate: Aggregate.sum }],
                category: { field: 'Product' },
                details: [{ field: 'Region' }],
            },
        } as never, rows as never);
        expect(bound.categories).toEqual(['Juice', 'Milk']);
        expect(bound.detailKeys).toEqual([['East', 'North'], ['East', 'North']]);
        expect(bound.series[0].subs).toEqual([[140, 250], [431, 666]]);
        expect(bound.legend).toEqual([]);
    });

    it('radar web geometry matches the trial crop (off-centre ellipse, stepped max)', () => {
        // Measured on the 468x308 filledRadar crop: web centre (262,154),
        // ellipse rx 142 / ry 113, circular data scale R 117 and the axis max
        // of the STEPPED ladder (Sales 390..1097 -> 1200, not 1097).
        const layout = radarLayout({ x: 4, y: 4, width: 460, height: 300 }, 0, 1097);
        expect(layout.cx).toBe(262);
        expect(layout.cy).toBe(154);
        expect(layout.rx).toBe(142);
        expect(layout.ry).toBe(113);
        expect(layout.radius).toBe(117);
        expect(layout.axisMax).toBe(1200);
    });

    it('scatter plots values[0] horizontally and values[1] vertically (trial)', () => {
        const scatter = bindPlot({
            type: DataChartType.scatter as never,
            encodings: {
                values: [{ field: 'Sales', aggregate: Aggregate.sum }, { field: 'Qty', aggregate: Aggregate.sum }],
                category: { field: 'Product' },
            },
        } as never, rows as never);
        expect(scatter.categories).toEqual([]);
        expect(scatter.xs).toEqual([140, 431, 250, 666]);
        expect(scatter.series[0]!.points.map(p => p.value)).toEqual([9, 38, 23, 39]);
    });
});
