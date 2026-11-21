/**
 * DataChart painting: frame, header, plot areas (cartesian families), legend
 * and data labels on the chart canvas. Geometry and colours are measured from
 * the trial (black-box); every glyph is drawn by our own code.
 */
import type { DataChart } from './data-chart.js';
import { DEFAULT_PALETTE } from './data-chart.js';
import type { IDataChartConfig, IPlotConfigTextOption, IPaletteItemOption, IFormatOption } from './types.js';
import type { Row } from './binding.js';
import { bindHierarchy, bindPlot, formatNumber, type BoundPlot } from './binding.js';
import { paintPolar, paintTree, paintScatterMarks } from './paint-extra.js';
import { asRecord } from '../object-access.js';

export interface Rect { x: number; y: number; width: number; height: number }

export interface ChartModel {
    plots: BoundPlot[];
    hierarchy?: Map<string, Map<string, number>>;
}

/** One hoverable mark in surface coordinates (owned by paint.ts, read by DataChart). */
export interface HitRegion { x: number; y: number; width: number; height: number; title: string; lines: string[]; color: string }

/** Fixed sample series shown before any data binding (trial placeholder).
 *  The trial keeps a different placeholder per plot family (measured on the
 *  blank-pie / blank-line / bare-default crops). */
const BLANK_COLUMNAR: { cats: string[]; series: Array<[string, number[]]> } = {
    cats: ['C1', 'C2', 'C3', 'C4'],
    series: [
        ['a', [45, 84, 90, 71]],
        ['b', [86, 70, 64, 54]],
        ['c', [95, 54, 83, 37]],
    ],
};
const BLANK_LINEAR: { cats: string[]; series: Array<[string, number[]]> } = {
    cats: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
    series: [
        ['a', [70, 19, 29, 26, 46, 58]],
        ['b', [40, 34, 46, 60, 54, 30]],
        ['c', [51, 54, 80, 93, 84, 79]],
    ],
};
// Percentages 31.25/24.11/19.64/14.29/10.71 (= 35,27,22,16,12 over 112).
const BLANK_PIE: Array<[string, number]> = [['a', 35], ['b', 27], ['c', 22], ['d', 16], ['e', 12]];

export function blankFamily(type: string): 'pie' | 'linear' | 'columnar' {
    if (/^(pie|donut|rose)$/i.test(type)) return 'pie';
    if (/^(line|area|rangeArea|radar|filledRadar|scatter|bubble)$/i.test(type)) return 'linear';
    return 'columnar';
}

/** The blank sample placeholder for the given plot type. */
export function blankModel(type = 'Column'): ChartModel {
    const family = blankFamily(String(type ?? 'Column'));
    if (family === 'pie') {
        const series = BLANK_PIE.map(([name, value], index) => ({
            name,
            seriesColorIndex: index,
            points: [{ value, count: 1 }],
        }));
        const bound: BoundPlot = {
            plot: { type: String(type) as never, encodings: { text: [] } as never },
            categories: [],
            series,
            legend: series.map(s => s.name),
            splitByValues: true,
        };
        return { plots: [bound] };
    }
    const sample = family === 'linear' ? BLANK_LINEAR : BLANK_COLUMNAR;
    const series = sample.series.map(([name, points], index) => ({
        name,
        seriesColorIndex: index,
        points: points.map(value => ({ value, count: 1 })),
    }));
    const bound: BoundPlot = {
        plot: { type: String(type) as never, encodings: { values: sample.series.map(([n]) => ({ field: n })) } },
        categories: [...sample.cats],
        series,
        legend: sample.series.map(([n]) => n),
        splitByValues: true,
    };
    return { plots: [bound] };
}

const FONT_STACK = 'Calibri, "Segoe UI", Arial, sans-serif';

function css(color: unknown, fallback: string): string {
    if (typeof color === 'string') return color;
    const obj = color as { type?: string; color?: string } | undefined;
    if (obj && typeof obj.color === 'string') return obj.color;
    return fallback;
}

function font(spec: { fontSize?: number; fontFamily?: string; fontWeight?: string; fontStyle?: string } | undefined, fallbackSize = 12): string {
    const size = Number(spec?.fontSize ?? fallbackSize);
    const family = String(spec?.fontFamily ?? FONT_STACK);
    const weight = spec?.fontWeight ? `${spec.fontWeight} ` : '';
    const style = String(spec?.fontStyle ?? '') === 'Italic' ? 'italic ' : '';
    return `${style}${weight}${size}px ${family}`;
}

export function paletteFor(plot: { config?: { palette?: string[] } }, _configPalette: IPaletteItemOption[] | undefined): string[] {
    // Trial-measured: only the plot-level palette is honoured; the top-level
    // config.palette does not affect the colours of the marks.
    if (Array.isArray(plot.config?.palette) && plot.config!.palette!.length) return plot.config!.palette as string[];
    return DEFAULT_PALETTE;
}

/** Trial step ladders: zero-anchored axes use 1,2,2.5,5 (seven intervals max,
 *  measured: 666 -> 0..700/100, 1097 -> 0..1200/200, 2539 -> 0..3000/500);
 *  the positive-band rule additionally shows 4 and 8 (369.75 -> step 40). */
const NICE_STEPS = [1, 2, 2.5, 4, 5, 8, 10];
const AXIS_STEPS = [1, 2, 2.5, 5, 10];

function niceStepOf(raw: number, steps: number[]): number {
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1e-12)));
    for (const c of [...steps].sort((a, b) => a - b)) if (c * magnitude >= raw - 1e-9) return c * magnitude;
    return 10 * magnitude;
}

/**
 * Value axis scale (trial behaviour, measured on the comparison crops):
 * zero-anchored axes pick the smallest step of 1,2,2.5,5 x 10^n that keeps the
 * axis within seven intervals (0..666 -> 0..700/100; 0..1097 -> 0..1200/200;
 * 0..2539 -> 0..3000/500). When the data sits strictly above zero a different
 * rule applies: the axis maximum is a round tenth of the data maximum and the
 * floor six steps below it (262.5..369.75 -> 160..400 step 40). Stock axes ask
 * for eight intervals; scatter x axes for ten.
 */
export function niceScale(min: number, max: number, maxIntervals = 7, steps = AXIS_STEPS, positiveRule = true): { min: number; max: number; ticks: number[] } {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
    if (min === max) {
        if (min === 0) return { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] };
        const span = Math.abs(min);
        min = min > 0 ? 0 : min - span;
        max = max > 0 ? max + span : 0;
    }
    let step: number;
    let niceMin: number;
    let niceMax: number;
    if (min > 0 && positiveRule) {
        step = niceStepOf((max - min) / 6, NICE_STEPS);
        step = Math.max(step, niceStepOf(max / 10, NICE_STEPS));
        niceMax = Math.ceil(max / step) * step;
        niceMin = Math.max(0, round6(niceMax - 6 * step));
        if (niceMin > min) niceMin = Math.floor(min / step) * step;
    } else {
        step = niceStepOf((max - min) / maxIntervals, steps);
        niceMin = Math.floor(min / step) * step;
        niceMax = Math.ceil(max / step) * step;
        if (niceMax - niceMin > (maxIntervals + 0.5) * step) { // span forced wider than the target
            step = niceStepOf((niceMax - niceMin) / maxIntervals, steps);
            niceMin = Math.floor(min / step) * step;
            niceMax = Math.ceil(max / step) * step;
        }
    }
    const ticks: number[] = [];
    const count = Math.min(60, Math.round((niceMax - niceMin) / step));
    for (let i = 0; i <= count; i++) ticks.push(round6(niceMin + step * i));
    return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

function round6(value: number): number { return Math.round(value * 1e6) / 1e6; }

/**
 * Ink width of a label (the trial lays its gutters out on the painted glyph
 * bounds, not the advance width, which is a couple of px wider).
 */
export function inkWidth(ctx: CanvasRenderingContext2D, text: string, fontSpec: string): number {
    const previousAlign = ctx.textAlign;
    ctx.textAlign = 'left'; // the bounding-box metrics are anchor relative
    ctx.font = fontSpec;
    const m = ctx.measureText(text);
    ctx.textAlign = previousAlign;
    // Both extents are measured from the anchor and positive outwards.
    const left = Number(m.actualBoundingBoxLeft ?? 0);
    const right = Number(m.actualBoundingBoxRight ?? m.width);
    const ink = Math.abs(right) + Math.abs(left);
    return Number.isFinite(ink) && ink > 0 ? Math.ceil(ink) : Math.ceil(m.width);
}

export function applyNumberFormat(value: number, format: IFormatOption | undefined, _ctx?: CanvasRenderingContext2D): string {
    if (!format) return formatNumber(value);
    const valueFormat = String(format.value ?? '');
    if (format.type) {
        const divisors: Record<string, number> = {
            Hundreds: 100, Thousands: 1e3, '10000': 1e4, '100000': 1e5, Millions: 1e6, '10000000': 1e7, '100000000': 1e8, Billions: 1e9, Trillions: 1e12,
        };
        const div = divisors[String(format.type)];
        if (div) return formatNumber(round6(value / div)) + valueFormat;
    }
    // No scaling type: a .NET/Excel custom format string (0/# placeholders,
    // thousands grouping, %, literals).
    return formatCustom(value, valueFormat);
}

function readRows(chart: DataChart): Row[] | null {
    const config = chart._liveConfig();
    const table = chartTable(chart);
    if (!table) return null;
    const length = Number((table as unknown as { length(): number }).length?.() ?? 0);
    const getter = table as unknown as { get(i: number): Row | undefined };
    const rows: Row[] = [];
    for (let i = 0; i < length; i++) {
        const row = getter.get(i);
        if (row) rows.push(row);
    }
    void config;
    return rows;
}

export function chartTable(chart: DataChart): unknown | null {
    const name = chart._liveConfig().tableName;
    if (!name) return null;
    const workbook = (chart as unknown as { _sheet?: { getParent?(): TableWorkbook | null } })._sheet?.getParent?.();
    const table = workbook?.dataManager?.()?.tables?.[name] ?? null;
    if (table && workbook) hookTableRepaint(table as object, workbook);
    return table;
}

interface TableWorkbook {
    dataManager?(): { tables?: Record<string, unknown> } | null;
    _renderer?(): { schedule?(): void } | null;
}

/**
 * Trial behaviour: mutating a bound GC.Data table repaints the data charts.
 * Our GC.Data tables are plain models, so the resolved instance (never the
 * class) gets a thin wrapper on its mutators to schedule one renderer pass.
 */
const repaintHooked = new WeakMap<object, WeakSet<object>>();
function hookTableRepaint(table: object, workbook: TableWorkbook): void {
    let owners = repaintHooked.get(table);
    if (!owners) { owners = new WeakSet(); repaintHooked.set(table, owners); }
    if (owners.has(workbook)) return;
    owners.add(workbook);
    const schedule = (): void => { try { workbook._renderer?.()?.schedule?.(); } catch { /* headless */ } };
    for (const method of ['insertItem', 'updateItem', 'removeItems', 'saveItem', 'resetItem', 'fetch']) {
        const original = (asRecord(table))[method];
        if (typeof original !== 'function') continue;
        const fn = original as (...args: unknown[]) => unknown;
        (asRecord(table))[method] = (...args: unknown[]): unknown => {
            const result = fn.apply(table, args);
            schedule();
            if (result && typeof (result as Promise<unknown>).then === 'function')
                (result as Promise<unknown>).then(schedule, schedule);
            return result;
        };
    }
}

function tableRevision(table: unknown): number {
    return Number((table as { revision?: number } | null)?.revision ?? 0);
}

/** Data fingerprint for the paint cache. */
export function modelFingerprint(chart: DataChart): string {
    const config = chart._liveConfig();
    const table = chartTable(chart);
    return `${(config.tableName ?? '')}|${tableRevision(table)}|${JSON.stringify(config.plots ?? [])}`;
}

export function buildChartModel(chart: DataChart, rows: Row[] | null): ChartModel {
    const config = chart._liveConfig();
    const plots = (config.plots ?? []).map(plot => {
        const bound = bindPlot(plot, rows ?? []);
        if (/^(treemap|sunburst)$/i.test(String(plot.type))) bound.hierarchy = bindHierarchy(plot, rows ?? []);
        return bound;
    });
    if (!plots.length) plots.push(bindPlot({ type: 'Column' as never }, []));
    return { plots };
}

// --------------------------------------------------------------------- paint

export function paintDataChartSurface(chart: DataChart, ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);
    const config = chart._liveConfig();
    const rows = readRows(chart);
    const fingerprint = modelFingerprint(chart);
    if (chart._paintFingerprint !== fingerprint || !chart._paintModel) {
        chart._paintModel = rows ? buildChartModel(chart, rows) : blankModel(String(config.plots?.[0]?.type ?? 'Column'));
        chart._paintFingerprint = fingerprint;
    }
    const model = chart._paintModel as ChartModel;
    const dv = config.config?.dvStyle;
    ctx.fillStyle = css(dv?.fill, '#ffffff');
    ctx.fillRect(0, 0, width, height);

    // Header band. Trial (measured): the header comes from the config as it
    // exists when the chart FIRST paints (the add()-stamped defaults, or the
    // config given before the first render); a header added by a LATER
    // setChartConfig updates getChartConfig but is never painted
    // (header-title crop). Band = padding.top + 1.5*fontSize + padding.bottom
    // when the header carries an explicit padding, otherwise 0 (the RT title
    // overlaps the plot); the title baseline sits at padding.top + fontSize,
    // and the plot area additionally starts plotAreas[0].padding.top lower
    // (bare-default: 12 + 47.5 + 10 = 69.5 gridline top).
    if (chart._paintedHeader === undefined) {
        const liveHeader = config.config?.header;
        chart._paintedHeader = liveHeader ? JSON.parse(JSON.stringify(liveHeader)) as NonNullable<typeof chart._paintedHeader> : null;
    }
    const header = chart._paintedHeader ?? undefined;
    let top = 0;
    if (header?.title) {
        const style = header.textStyle;
        const size = Number(style?.fontSize ?? 14);
        ctx.font = font(style, 14);
        const padTop = Number(header.padding?.top ?? 0);
        const padBottom = Number(header.padding?.bottom ?? 0);
        const bandH = header.padding ? padTop + size * 1.5 + padBottom : 0;
        ctx.fillStyle = css(style?.color, '#555555');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        // Baseline at box-y padTop + fontSize (canvas is 4 px inside the box).
        ctx.fillText(String(header.title), width / 2, top + padTop + size - 4, width - 2 * Number(header.padding?.left ?? 10));
        top += bandH;
    }
    top += Number(config.config?.plotAreas?.[0]?.padding?.top ?? 0);

    const plotConfig = model.plots[0]?.plot.config;
    const palette = paletteFor(model.plots[0]?.plot ?? {}, config.config?.palette);
    for (const bound of model.plots) {
        paintPlot(chart, ctx, bound, { x: 0, y: top, width, height: height - top }, palette, config);
    }

    // dvStyle stroke on top of everything (the chart frame).
    const stroke = dv?.stroke ? css(dv.stroke, '#d8d8d8') : '#d8d8d8';
    const strokeWidth = Number(dv?.strokeWidth ?? 1);
    if (strokeWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(strokeWidth / 2, strokeWidth / 2, Math.max(1, width - strokeWidth), Math.max(1, height - strokeWidth));
    }
    void plotConfig;
}

export interface PlotStyle { gridColor: string; axisColor: string; labelColor: string; labelFont: string }

function plotStyleOf(config: IDataChartConfig): PlotStyle {
    const textStyle = config.config?.plotAreas?.[0]?.textStyle ?? config.config?.textStyle;
    return {
        gridColor: '#efefef',
        axisColor: '#d8d8d8',
        labelColor: css(textStyle?.color, '#555555'),
        labelFont: font(textStyle, 12),
    };
}

function legendItems(bound: BoundPlot): string[] {
    return bound.legend ?? [];
}

function paintPlot(chart: DataChart, ctx: CanvasRenderingContext2D, bound: BoundPlot, area: Rect, palette: string[], config: IDataChartConfig) {
    const type = String(bound.plot.type ?? 'Column');
    const style = plotStyleOf(config);
    // Family dispatch.
    if (/^treemap$/i.test(type)) { paintTree(chart, ctx, bound, area, palette, style); return; }
    if (/^(pie|donut|rose|radialStackedBar|polarCoordinatesBar|polarCoordinatesStackedBar|sunburst)$/i.test(type)) { paintPolar(chart, ctx, bound, area, type, palette, style); return; }
    if (/radar/i.test(type)) { paintPolarRadar(ctx, bound, area, type, palette, style); return; }
    if (/^(funnel|waterfall)$/i.test(type)) { paintFunnelWaterfall(ctx, bound, area, type, palette, style, bound.plot.config); return; }
    if (/^(scatter|bubble)$/i.test(type)) { paintScatter(chart, ctx, bound, area, type, palette, style, config); return; }
    paintCartesian(chart, ctx, bound, area, type, palette, style, config);
}

// ---------------------------------------------------------------- cartesian

const AXIS_LABEL_FONT = (style: PlotStyle) => style.labelFont;

function cartesianValueExtent(bound: BoundPlot, type: string): { min: number; max: number } {
    let min = 0;
    let max = 0;
    if (isPercentStack(type)) { min = 0; max = 1; return { min, max }; }
    if (bound.lowerValues) {
        min = Math.min(...bound.lowerValues, ...bound.series[0]!.points.map(p => p.value));
        max = Math.max(...bound.lowerValues, ...bound.series[0]!.points.map(p => p.value));
        if (min > 0) min = 0;
        if (bound.stock) { min = Math.min(min, ...bound.stock.low); max = Math.max(max, ...bound.stock.high); }
        return { min, max };
    }
    if (bound.stock) {
        min = Math.min(...bound.stock.low);
        max = Math.max(...bound.stock.high);
        if (min > 0) min = 0;
        return { min, max };
    }
    if (isStack(type)) {
        const n = bound.categories.length;
        for (let i = 0; i < n; i++) {
            let positive = 0;
            let negative = 0;
            for (const s of bound.series) {
                const v = s.points[i]?.value ?? 0;
                if (v >= 0) positive += v; else negative += v;
            }
            max = Math.max(max, positive);
            min = Math.min(min, negative);
        }
        return { min, max };
    }
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (const s of bound.series) {
        if (s.subs) for (const row of s.subs) for (const v of row) { dataMax = Math.max(dataMax, v); dataMin = Math.min(dataMin, v); }
        else for (const p of s.points) { dataMax = Math.max(dataMax, p.value); dataMin = Math.min(dataMin, p.value); }
    }
    if (!Number.isFinite(dataMin)) return { min: 0, max: 0 };
    // Trial: the axis includes zero unless the data sits in a narrow band
    // above (or below) it (measured on the aggregates scenarios).
    let lo = dataMin;
    let hi = dataMax;
    if (lo > 0 && lo <= hi / 2) lo = 0;
    if (hi < 0 && hi >= lo / 2) hi = 0;
    if (lo > 0 && hi <= 0) hi = 0;
    if (hi < 0 && lo >= 0) lo = 0;
    return { min: lo, max: hi };
}

function isStack(type: string): boolean { return /stacked/i.test(type) && !/^(polar|radial)/i.test(type) && !/radar/i.test(type); }
function isPercentStack(type: string): boolean { return /percentStacked/i.test(type); }
function isHorizontal(type: string): boolean { return /^range?Bar$|^stackedBar$|^percentStackedBar$/i.test(type) || /^bar$/i.test(type); }

interface CartesianFrame { plot: Rect; scale: { min: number; max: number; ticks: number[] }; style: PlotStyle; axisFormat?: string }

function layoutCartesian(ctx: CanvasRenderingContext2D, bound: BoundPlot, area: Rect, type: string, style: PlotStyle, legendSide: 'left' | 'right' | 'none', legendWidth: number, axisFormat?: string): CartesianFrame {
    const horizontal = isHorizontal(type);
    let scale: { min: number; max: number; ticks: number[] };
    if (isPercentStack(type)) {
        const ticks: number[] = [];
        for (let i = 0; i <= 10; i++) ticks.push(i / 10);
        scale = { min: 0, max: 1, ticks };
    }
    else {
        const [lo, hi] = Object.values(cartesianValueExtent(bound, type)) as [number, number];
        // Stock axes (candlestick/ohlc) split the range into eight intervals.
        scale = bound.stock ? niceScale(lo, hi, 8, [1, 2, 2.5, 5, 10]) : niceScale(lo, hi);
    }
    const labels = scale.ticks.map(t => formatTick(t, type, axisFormat));
    const valueLabelWidth = Math.max(...labels.map(t => inkWidth(ctx, t, AXIS_LABEL_FONT(style))));
    const categoryWidth = bound.categories.length
      ? Math.max(...bound.categories.map(t => inkWidth(ctx, String(t), AXIS_LABEL_FONT(style))))
      : 0;
    // Trial gutters (measured in chart-BOX coordinates; our canvas sits 4 px
    // inside the box, so all absolutes are shifted -4): vertical charts
    // left = 14 + maxValueLabel + 4, right = W - 3, top = 8, bottom = H - 38
    // (box plot [49,461]x[12,266] in a 468x308 crop).
    // Horizontal charts: left = 14 + maxCategoryLabel + 11, right = W - 17,
    // top = 0, bottom = H - 34 (box plot [57,447]x[4,270]).
    const pad = 3;
    let left = horizontal ? area.x + 14 + categoryWidth + 11 : area.x + 14 + valueLabelWidth + 4;
    let right = area.x + area.width - pad - (legendSide === 'right' ? legendWidth : 0);
    if (horizontal) right = area.x + area.width - 17;
    const top = area.y + (horizontal ? 0 : 8);
    const bottom = area.y + area.height - (horizontal ? 34 : 38);
    if (legendSide === 'left') left += legendWidth;
    return { plot: { x: left, y: top, width: Math.max(10, right - left), height: Math.max(10, bottom - top) }, scale, style };
}

/**
 * Trial-measured axis formats are .NET/Excel CUSTOM format strings: `0`/`#`
 * digit placeholders, `,` thousands grouping, `.` decimal point, trailing `%`,
 * any other character a literal. The axis format ",.0f" paints 1200 as
 * "1,200.0f" (measured on the axis-format crop).
 */
export function formatCustom(value: number, fmt: string): string {
    if (!/[0#]/.test(fmt)) return fmt;
    const percent = /%/.test(fmt);
    const body = fmt.replace(/%/g, '');
    const dot = body.indexOf('.');
    const intPart = dot < 0 ? body : body.slice(0, dot);
    const decPart = dot < 0 ? '' : body.slice(dot + 1);
    let decimals = 0;
    let decLiteral = '';
    for (const ch of decPart) { if (ch === '0' || ch === '#') decimals++; else decLiteral += ch; }
    const prefix = intPart.replace(/[0#,]/g, '');
    let text = Math.abs(value).toFixed(decimals);
    if (decimals && /#/.test(decPart)) text = text.replace(/\.?0+$/, '');
    if (intPart.includes(',')) {
        const [int, frac] = text.split('.');
        text = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
    }
    return (value < 0 ? '-' : '') + prefix + text + decLiteral + (percent ? '%' : '');
}

function formatTick(tick: number, type: string, axisFormat?: string): string {
    if (isPercentStack(type)) return `${Math.round(tick * 100)}%`;
    if (axisFormat) return formatCustom(tick, axisFormat);
    return formatNumber(tick);
}

function paintGrid(ctx: CanvasRenderingContext2D, frame: CartesianFrame, type: string, categories: string[]) {
    const { plot, scale } = frame;
    const horizontal = isHorizontal(type);
    ctx.strokeStyle = frame.style.gridColor;
    ctx.lineWidth = 1;
    // Trial (measured on the column/line/waterfall crops): light gridlines on
    // EVERY tick above the axis minimum (including the maximum, which gets a
    // full-width line at the plot top); the minimum itself is the dark axis.
    for (const tick of scale.ticks.slice(1)) {
        ctx.beginPath();
        if (horizontal) {
            const x = plot.x + ((tick - scale.min) / (scale.max - scale.min)) * plot.width;
            ctx.moveTo(Math.round(x) + 0.5, plot.y);
            ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.height);
        } else {
            const y = plot.y + plot.height - ((tick - scale.min) / (scale.max - scale.min)) * plot.height;
            ctx.moveTo(plot.x, Math.round(y) + 0.5);
            ctx.lineTo(plot.x + plot.width, Math.round(y) + 0.5);
        }
        ctx.stroke();
    }
    void categories;
}

function paintTickLabels(ctx: CanvasRenderingContext2D, frame: CartesianFrame, type: string, categories: string[]) {
    const { plot, scale, style } = frame;
    const horizontal = isHorizontal(type);
    ctx.fillStyle = style.labelColor;
    ctx.font = AXIS_LABEL_FONT(style);
    ctx.textBaseline = 'middle';
    // Trial (measured): labels sit ~10 px past the plot edge, centred on the tick.
    for (const tick of scale.ticks) {
        const ratio = (tick - scale.min) / (scale.max - scale.min);
        const text = formatTick(tick, type, frame.axisFormat);
        if (horizontal) {
            const x = plot.x + ratio * plot.width;
            ctx.textAlign = 'center';
            ctx.fillText(text, x, plot.y + plot.height + 10);
        } else {
            const y = plot.y + plot.height - ratio * plot.height;
            ctx.textAlign = 'right';
            ctx.fillText(text, plot.x - 4, y);
        }
    }
    // Category labels along the band axis (area charts: edge-mapped points).
    if (categories.length) {
        ctx.fillStyle = style.labelColor;
        const edgeLike = /area/i.test(type) && categories.length > 1;
        for (let i = 0; i < categories.length; i++) {
            const slot = horizontal ? categories.length - 1 - i : i;
            // Trial (measured on the area crops): area category labels sit on a
            // slightly inset edge-to-edge ladder (centers [x+3 .. right-14]) and
            // a few px lower than the band charts'.
            const center = edgeLike && !horizontal
                ? (3 + (i / (categories.length - 1)) * (plot.width - 17)) / plot.width
                : (slot + 0.5) / categories.length;
            if (horizontal) {
                const y = plot.y + center * plot.height;
                ctx.textAlign = 'right';
                ctx.fillText(String(categories[i]), plot.x - 11, y);
            } else {
                const x = plot.x + center * plot.width;
                ctx.textAlign = 'center';
                ctx.fillText(String(categories[i]), x, plot.y + plot.height + (edgeLike ? 19 : 13));
            }
        }
    }
}

export function stackedValues(bound: BoundPlot, type: string): number[][] {
    // Returns the cumulative [from, to] pairs per series per category.
    const n = bound.categories.length;
    const percent = isPercentStack(type);
    const totals: number[] = [];
    for (let i = 0; i < n; i++) {
        totals[i] = bound.series.reduce((acc, s) => acc + Math.abs(s.points[i]?.value ?? 0), 0) || 1;
    }
    const positiveAt = new Array(n).fill(0);
    const negativeAt = new Array(n).fill(0);
    const pairs: number[][] = [];
    for (const s of bound.series) {
        const list: number[] = [];
        for (let i = 0; i < n; i++) {
            let v = s.points[i]?.value ?? 0;
            if (percent) v = (Math.abs(v) / totals[i]) * (v < 0 ? -1 : 1);
            if (v >= 0) { const from = positiveAt[i]; positiveAt[i] += v; list.push(from, positiveAt[i]); }
            else { const from = negativeAt[i]; negativeAt[i] += v; list.push(from, negativeAt[i]); }
        }
        pairs.push(list);
    }
    return pairs;
}

function paintCartesian(chart: DataChart, ctx: CanvasRenderingContext2D, bound: BoundPlot, area: Rect, type: string, palette: string[], style: PlotStyle, config: IDataChartConfig) {
    const horizontal = isHorizontal(type);
    const legend = legendItems(bound);
    const legendSide = legend.length ? 'right' as const : 'none' as const;
    const legendWidth = legend.length ? legendReserve(ctx, legend, style) : 0;
    // Trial-measured (axis-format crop): the value-axis labels go through the
    // axis `format` custom-format string and the gutter is sized on the
    // FORMATTED labels (",.0f" widens the plot left edge 49 -> 65 px).
    const axes = config.config?.plotAreas?.[0]?.axes ?? [];
    const wantY = !isHorizontal(type);
    const fmtAxis = axes.find((a: { type?: number }) => Number(a?.type) === (wantY ? 1 : 0)) ?? axes.find((a: { format?: unknown }) => a?.format);
    const rawFormat = fmtAxis?.format as { value?: unknown } | Array<{ value?: unknown }> | undefined;
    const fmtValue = Array.isArray(rawFormat) ? String(rawFormat[0]?.value ?? '') : String(rawFormat?.value ?? '');
    const frame = layoutCartesian(ctx, bound, area, type, style, legendSide, legendWidth, fmtValue || undefined);
    paintGrid(ctx, frame, type, bound.categories);
    paintTickLabels(ctx, frame, type, bound.categories);
    const { plot, scale } = frame;
    const span = scale.max - scale.min || 1;
    const toValue = (v: number): number => ((v - scale.min) / span);
    // Trial: bars stand on the zero baseline, but when zero is outside the axis
    // range they start at the axis edge (measured: 262.5 avg bar ends at the
    // 160 minimum, not below the plot).
    const baseValue = Math.max(scale.min, Math.min(scale.max, 0));
    const sink: { hits: HitRegion[]; title: string; line: string; color: string } = { hits: [], title: '', line: '', color: '' };
    chart._hits = sink.hits;

    if (/^(line|area|stackedArea|percentStackedArea|rangeArea)$/i.test(type)) {
        paintLineArea(ctx, bound, frame, type, palette, sink);
    } else if (/candlestick|ohlc/i.test(type)) {
        paintStockMarks(ctx, bound, frame, type, palette);
    } else if (isStack(type)) {
        const pairs = stackedValues(bound, type);
        const band = (horizontal ? plot.height : plot.width) / Math.max(1, bound.categories.length);
        // Trial (measured): a stacked bar is 71.5% of the category band.
        const barThickness = band * 0.715;
        bound.series.forEach((s, si) => {
            ctx.fillStyle = colorOf(s, si, palette, -1);
            for (let i = 0; i < bound.categories.length; i++) {
                const [from, to] = [pairs[si]![i * 2], pairs[si]![i * 2 + 1]];
                sink.title = String(bound.categories[i] ?? '');
                sink.line = `${s.name || ''}${s.name ? ': ' : ''}${formatNumber(to - from)}`;
                sink.color = colorOf(s, si, palette, -1);
                drawBarRect(ctx, plot, horizontal, i, bound.categories.length, barThickness, 0, toValue(from), toValue(to), sink);
            }
        });
    } else {
        const n = Math.max(1, bound.categories.length);
        const band = (horizontal ? plot.height : plot.width) / n;
        const seriesCount = Math.max(1, bound.series.length);
        // Trial (measured on the axis-format and aggregates crops): a single
        // series bar takes the whole 71.5% group; with several series every one
        // gets an equal sub-slot and fills 90% of it (the rest is the gap).
        const groupWidth = band * 0.715;
        const subSlot = groupWidth / seriesCount;
        const barWidth = seriesCount > 1 ? subSlot * 0.9 : subSlot;
        bound.series.forEach((s, si) => {
            const detailCount = bound.detailKeys ? Math.max(...bound.detailKeys.map(k => k.length), 1) : 1;
            const slots = seriesCount * detailCount;
            const slotWidth = detailCount > 1 ? groupWidth / slots : subSlot;
            const slotBar = detailCount > 1 ? slotWidth * 0.9 : barWidth;
            for (let i = 0; i < n; i++) {
                const keys = detailCount > 1 ? bound.detailKeys![i] ?? [] : [''];
                for (let k = 0; k < Math.max(1, keys.length); k++) {
                    const value = detailCount > 1 ? s.subs?.[i]?.[k] ?? 0 : s.points[i]?.value;
                    if (value === undefined) continue;
                    const colorIndex = s.pointColorIndices ? s.pointColorIndices[i] ?? 0 : -1;
                    ctx.fillStyle = colorOf(s, si, palette, colorIndex);
                    if (bound.lowerValues) {
                        // Trial lays range bars from the zero baseline to the upper value.
                        const fromRatio = toValue(baseValue);
                        sink.title = String(bound.categories[i] ?? '');
                        sink.line = `${s.name || ''}${s.name ? ': ' : ''}${formatNumber(value)}`;
                        sink.color = colorOf(s, si, palette, colorIndex);
                        drawBarRect(ctx, plot, horizontal, i, n, groupWidth, 0, fromRatio, toValue(value), sink);
                        continue;
                    }
                    const slotIndex = detailCount > 1 ? si * detailCount + k : si;
                    const centreOffset = (slotIndex - (slots - 1) / 2) * slotWidth;
                    sink.title = String(bound.categories[i] ?? '');
                    sink.line = `${s.name || ''}${s.name ? ': ' : ''}${formatNumber(value)}`;
                    sink.color = colorOf(s, si, palette, colorIndex);
                    drawBarRect(ctx, plot, horizontal, i, n, slotBar, centreOffset / band, toValue(Math.min(baseValue, value)), toValue(Math.max(baseValue, value)), sink);
                }
            }
        });
    }
    paintDataLabels(ctx, bound, frame, type, palette);
    // Axis lines: the value-axis line (left/bottom) and the zero baseline.
    ctx.strokeStyle = '#a6a6a6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (horizontal) {
        ctx.moveTo(Math.round(plot.x) + 0.5, plot.y);
        ctx.lineTo(Math.round(plot.x) + 0.5, plot.y + plot.height);
    } else {
        ctx.moveTo(plot.x, Math.round(plot.y + plot.height) + 0.5);
        ctx.lineTo(plot.x + plot.width, Math.round(plot.y + plot.height) + 0.5);
        ctx.moveTo(Math.round(plot.x) + 0.5, plot.y);
        ctx.lineTo(Math.round(plot.x) + 0.5, plot.y + plot.height);
    }
    ctx.stroke();
    if (legendSide === 'right') paintLegend(ctx, legend, { x: plot.x + plot.width, y: plot.y, width: legendWidth, height: plot.height }, palette, style, bound);
    void chart;
}

function drawBarRect(ctx: CanvasRenderingContext2D, plot: Rect, horizontal: boolean, categoryIndex: number, categories: number, thickness: number, offset: number, fromRatio: number, toRatio: number, sink?: { hits: HitRegion[]; title: string; line: string; color: string }): void {
    const band = (horizontal ? plot.height : plot.width) / categories;
    // Horizontal bars lay the first category at the bottom (trial).
    const slot = horizontal ? categories - 1 - categoryIndex : categoryIndex;
    const center = (horizontal ? plot.y : plot.x) + (slot + 0.5 + offset) * band;
    const a = horizontal ? plot.x + fromRatio * plot.width : plot.y + plot.height - Math.max(fromRatio, toRatio) * plot.height;
    const length = Math.max(1, Math.abs(toRatio - fromRatio) * (horizontal ? plot.width : plot.height));
    if (horizontal) ctx.fillRect(a, center - thickness / 2, length, thickness);
    else ctx.fillRect(center - thickness / 2, a, thickness, length);
    if (sink) {
        const r = horizontal
            ? { x: a, y: center - thickness / 2, width: length, height: thickness }
            : { x: center - thickness / 2, y: a, width: thickness, height: length };
        sink.hits.push({ ...r, title: sink.title, lines: [sink.line], color: sink.color });
    }
}

function colorOf(series: { seriesColorIndex: number }, seriesIndex: number, palette: string[], pointColorIndex: number): string {
    const index = pointColorIndex >= 0 ? pointColorIndex : series.seriesColorIndex;
    return palette[index % palette.length] ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}

function paintLineArea(ctx: CanvasRenderingContext2D, bound: BoundPlot, frame: CartesianFrame, type: string, palette: string[], sink: { hits: HitRegion[] }) {
    const { plot, scale } = frame;
    const span = scale.max - scale.min || 1;
    const n = Math.max(1, bound.categories.length);
    const stacked = isStack(type);
    const pairs = stacked ? stackedValues(bound, type) : null;
    const tops: number[][] = bound.series.map((s, si) =>
        Array.from({ length: n }, (_, i) => (pairs ? pairs[si]![i * 2 + 1] : s.points[i]?.value ?? 0)));
    // Trial: line charts put points on band centres; area charts use a slightly
    // inset edge-to-edge ladder (measured on the area crops: first point ~2 px
    // right of the axis, last one ~14 px inside the right edge).
    const areaLike = /area/i.test(type);
    const insetL = areaLike ? 2 : 0;
    const insetR = areaLike ? 14 : 0;
    const xOf = (i: number): number => areaLike && n > 1
        ? plot.x + insetL + (i / (n - 1)) * (plot.width - insetL - insetR)
        : plot.x + ((i + 0.5) / n) * plot.width;
    const yOf = (ratio: number): number => plot.y + plot.height - ((ratio - scale.min) / span) * plot.height;
    if (areaLike) {
        // Fill band polygons top-down so later series cover the previous ones.
        // Range areas paint the lower..upper band (trial rangeArea crop).
        const lowers = bound.lowerValues;
        bound.series.forEach((s, si) => {
            const color = colorOf(s, si, palette, -1);
            ctx.fillStyle = withAlpha(color, 0.55);
            ctx.beginPath();
            tops[si]!.forEach((v, i) => (i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v))));
            for (let i = n - 1; i >= 0; i--) {
                const base = lowers ? lowers[i] ?? 0 : pairs ? pairs[si]![i * 2] : 0;
                ctx.lineTo(xOf(i), yOf(base));
            }
            ctx.closePath();
            ctx.fill();
        });
    }
    bound.series.forEach((s, si) => {
        const color = colorOf(s, si, palette, -1);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        tops[si]!.forEach((v, i) => (i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v))));
        ctx.stroke();
        if (!areaLike) {
            tops[si]!.forEach((v, i) => {
                const x = xOf(i), y = yOf(v);
                sink.hits.push({ x: x - 6, y: y - 6, width: 12, height: 12, title: String(bound.categories[i] ?? ''), lines: [`${s.name || ''}${s.name ? ': ' : ''}${formatNumber(v)}`], color });
            });
        }
        else if (si === 0 && bound.lowerValues) {
            // Range area strokes the lower band edge too (trial crop).
            ctx.beginPath();
            bound.lowerValues.forEach((v, i) => (i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v))));
            ctx.stroke();
        }
        if (!areaLike && bound.plot.config?.symbols) {
            ctx.fillStyle = color;
            tops[si]!.forEach((v, i) => { ctx.beginPath(); ctx.arc(xOf(i), yOf(v), 2.5, 0, Math.PI * 2); ctx.fill(); });
        }
    });
}

function withAlpha(color: string, alpha: number): string {
    const hex = /^#([0-9a-f]{6})$/i.exec(color);
    if (!hex) return color;
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function paintStockMarks(ctx: CanvasRenderingContext2D, bound: BoundPlot, frame: CartesianFrame, type: string, palette: string[]) {
    const stock = bound.stock;
    if (!stock) return;
    const { plot, scale } = frame;
    const span = scale.max - scale.min || 1;
    const y = (v: number): number => plot.y + plot.height - ((v - scale.min) / span) * plot.height;
    const n = Math.max(1, bound.categories.length);
    const band = plot.width / n;
    const up = palette[0] ?? DEFAULT_PALETTE[0];
    const down = palette[1] ?? DEFAULT_PALETTE[1];
    const candle = /candlestick/i.test(type);
    // Trial (measured): the body is 71.5% of the category band (51..125 px body
    // in a 107 px band).
    const bodyWidth = Math.max(3, band * 0.715);
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
        const x = plot.x + (i + 0.5) * band;
        const o = stock.open[i] ?? 0;
        const h = stock.high[i] ?? 0;
        const l = stock.low[i] ?? 0;
        const c = stock.close[i] ?? 0;
        const rising = c >= o;
        const color = rising ? up : down;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, y(h));
        ctx.lineTo(Math.round(x) + 0.5, y(l));
        ctx.stroke();
        const top = y(Math.max(o, c));
        const bottom = y(Math.min(o, c));
        const height = Math.max(1, bottom - top);
        if (candle) {
            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.fillRect(x - bodyWidth / 2, top, bodyWidth, height);
        } else {
            const half = bodyWidth / 2;
            ctx.beginPath();
            ctx.moveTo(x - half, y(o)); ctx.lineTo(x, y(o));
            ctx.moveTo(x + half, y(c)); ctx.lineTo(x, y(c));
            ctx.moveTo(x, top); ctx.lineTo(x, bottom);
            ctx.stroke();
        }
    }
    void palette;
}

function paintFunnelWaterfall(ctx: CanvasRenderingContext2D, bound: BoundPlot, area: Rect, type: string, palette: string[], style: PlotStyle, plotConfig: IDataChartConfig['plots'][number]['config']) {
    const categories = bound.categories;
    const series = bound.series[0];
    if (!categories.length || !series) return;
    const n = categories.length;
    const values = series.points.map(p => p.value);
    if (/funnel/i.test(type)) {
        // Trial (measured on the funnel crop, 468x308): one continuous
        // silhouette with n equal-height steps; the top step spans the full
        // plot width and every lower boundary sits at
        // sortedDesc[i] / axisMax * width (445, 203, 186, 144, 144 px for
        // 1097/548/502/390 on a 1200 axis), the last one repeated for the
        // flat neck; the top/bottom sit 4 px inside the area.
        const axisMax = niceScale(0, Math.max(...values, 1)).max;
        const sorted = [...values].sort((a, b) => b - a);
        const edges: number[] = Array.from({ length: n + 1 },
            (_, i) => (i === 0 ? axisMax : sorted[Math.min(i, n - 1)]!) / axisMax);
        const top = area.y + 4;
        const height = area.height - 8;
        const slot = height / n;
        const maxWidth = area.width - 15;
        const cx = area.x + area.width / 2;
        ctx.fillStyle = palette[0] ?? DEFAULT_PALETTE[0];
        ctx.beginPath();
        ctx.moveTo(cx - edges[0]! * maxWidth / 2, top);
        for (let i = 0; i < n; i++) {
            const widthTop = edges[i]! * maxWidth;
            const widthBottom = edges[i + 1]! * maxWidth;
            const y0 = top + i * slot;
            const y1 = top + (i + 1) * slot;
            ctx.lineTo(cx - widthTop / 2, y0);
            ctx.lineTo(cx - widthBottom / 2, y1);
        }
        for (let i = n - 1; i >= 0; i--) {
            const widthTop = edges[i]! * maxWidth;
            const widthBottom = edges[i + 1]! * maxWidth;
            const y0 = top + i * slot;
            const y1 = top + (i + 1) * slot;
            ctx.lineTo(cx + widthBottom / 2, y1);
            ctx.lineTo(cx + widthTop / 2, y0);
        }
        ctx.closePath();
        ctx.fill();
        return;
    }
    // Waterfall: cumulative floating bars, legend Increase/Decrease/Total.
    const total = values.reduce((acc, v) => acc + v, 0);
    const showTotal = plotConfig?.waterfall?.showTotal !== false;
    const cumulative = [...values];
    for (let i = 1; i < cumulative.length; i++) cumulative[i] += cumulative[i - 1];
    const all = showTotal ? [...cumulative, total] : cumulative;
    const min = Math.min(0, ...all);
    const max = Math.max(0, ...all);
    const scale = niceScale(min, max);
    const span = scale.max - scale.min || 1;
    // Waterfall: cumulative bars, legend Increase/Decrease/Total. Trial (measured
    // in box coordinates; our canvas sits 4 px inside): box plot [49,362]x[12,266]
    // in the 468x308 crop; the value axis is split into one band per CATEGORY
    // PLUS the extra Total band (5 bands for 4 rows), the bar is 71.5% of the
    // band, the value axis is 0..3000 step 500 for data to 2539, and light
    // gridlines sit on every tick except the minimum.
    const legend = ['Increase', 'Decrease', 'Total'];
    const legendWidth = Math.max(64, legendMaxWidth(ctx, legend, style) + 48);
    const valueLabels = scale.ticks.map(t => formatNumber(t));
    const gutter = Math.max(...valueLabels.map(t => inkWidth(ctx, t, style.labelFont)));
    const left = area.x + 14 + gutter + 4;
    const right = area.x + area.width - legendWidth;
    const top = area.y + 8;
    const bottom = area.y + area.height - 38;
    const plot = { x: left, y: top, width: Math.max(10, right - left), height: Math.max(10, bottom - top) };
    const bands = n + (showTotal ? 1 : 0);
    const band = plot.width / bands;
    const barWidth = band * 0.715;
    const y = (v: number): number => plot.y + plot.height - ((v - scale.min) / span) * plot.height;
    ctx.strokeStyle = style.gridColor;
    ctx.lineWidth = 1;
    // Gridlines for every tick except the axis minimum (trial behaviour).
    for (const tick of scale.ticks.slice(1)) {
        const yy = Math.round(y(tick)) + 0.5;
        ctx.beginPath(); ctx.moveTo(plot.x, yy); ctx.lineTo(plot.x + plot.width, yy); ctx.stroke();
    }
    // Dark axis line at the minimum (bottom).
    ctx.strokeStyle = '#a6a6a6';
    ctx.beginPath();
    ctx.moveTo(plot.x, Math.round(y(scale.min)) + 0.5);
    ctx.lineTo(plot.x + plot.width, Math.round(y(scale.min)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = style.labelColor;
    ctx.font = style.labelFont;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const tick of scale.ticks) ctx.fillText(formatNumber(tick), plot.x - 4, y(tick));
    let running = 0;
    const upColor = palette[0] ?? DEFAULT_PALETTE[0];
    const downColor = palette[1] ?? DEFAULT_PALETTE[1];
    const totalColor = palette[2] ?? DEFAULT_PALETTE[2];
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
        const from = running;
        running += values[i];
        const cx = plot.x + (i + 0.5) * band;
        const y0 = y(Math.max(from, running));
        const y1 = y(Math.min(from, running));
        ctx.fillStyle = values[i] >= 0 ? upColor : downColor;
        ctx.fillRect(cx - barWidth / 2, y0, barWidth, Math.max(1, y1 - y0));
        ctx.fillStyle = style.labelColor;
        ctx.textAlign = 'center';
        ctx.fillText(String(categories[i]), cx, plot.y + plot.height + 13);
    }
    if (showTotal) {
        const cx = plot.x + (n + 0.5) * band;
        const y0 = y(Math.max(0, total));
        const y1 = y(Math.min(0, total));
        ctx.fillStyle = totalColor;
        ctx.fillRect(cx - barWidth / 2, y0, barWidth, Math.max(1, y1 - y0));
        ctx.fillStyle = style.labelColor;
        ctx.textAlign = 'center';
        ctx.fillText(String(plotConfig?.waterfall?.totalLabel ?? 'Total'), cx, plot.y + plot.height + 13);
    }
    paintLegend(ctx, legend, { x: plot.x + plot.width, y: plot.y, width: legendWidth, height: plot.height }, [upColor, downColor, totalColor], style);
}

function paintScatter(chart: DataChart, ctx: CanvasRenderingContext2D, bound: BoundPlot, area: Rect, type: string, palette: string[], style: PlotStyle, _config: IDataChartConfig) {
    // Both value fields act as numeric x/y channels; the trial draws dots.
    const values = (bound.plot.encodings?.values ?? []) as Array<{ field: string }>;
    const rows = (bound as unknown as { rawRows?: Row[] }).rawRows;
    void rows;
    const series = bound.series[0];
    if (!series || !values.length) return;
    const xs = bound.xs ?? [];
    const ys = series.points.map(p => p.value);
    const sizes = (bound.plot.encodings?.size && (bound as unknown as { sizeValues?: number[] }).sizeValues) || [];
    paintScatterMarks(ctx, bound, area, type, palette, style, xs, ys, sizes);
    void chart;
}

// -------------------------------------------------------------- legend/labels

export function legendMaxWidth(ctx: CanvasRenderingContext2D, items: string[], style: PlotStyle): number {
    let max = 0;
    for (const item of items) max = Math.max(max, inkWidth(ctx, String(item), style.labelFont));
    return max;
}

export function paintLegend(ctx: CanvasRenderingContext2D, items: string[], area: Rect, palette: string[], style: PlotStyle, bound?: BoundPlot): void {
    ctx.font = style.labelFont;
    // Trial (measured): 14x14 swatches 16 px past the plot edge, text 23 px after
    // the swatch, 28 px pitch, block centred on the plot area. When the block
    // does not fit the plot height it wraps into column-major columns
    // (collection-ops small blank pie: 5 items in 2-row columns).
    const itemHeight = 28;
    // The trial starts a new column when the block no longer fits the
    // vertical band (measured on the small blank pie: 5 items in 2-row
    // columns); ~24 px of the band is reserved for the centring slack.
    const perCol = Math.max(1, Math.floor((area.height - 24) / itemHeight));
    const cols = Math.max(1, Math.ceil(items.length / perCol));
    const colWidth = cols > 1 ? Math.max(inkWidth(ctx, items[items.length - 1] ?? '', style.labelFont), legendMaxWidth(ctx, items, style)) + 32 : 0;
    const total = Math.min(items.length, perCol) * itemHeight;
    const y0 = area.y + Math.max(0, (area.height - total) / 2 + itemHeight / 2 - 7);
    items.forEach((item, index) => {
        const col = Math.floor(index / perCol);
        const row = index % perCol;
        const y = y0 + row * itemHeight;
        const x = area.x + 16 + col * colWidth;
        // Legend entries are the colour keys / value series in palette order, so the
        // swatch colour is the palette slot of the item itself (trial behaviour).
        const color = palette[index % palette.length] ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
        void bound;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 14, 14);
        ctx.fillStyle = style.labelColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item), x + 23, y + 7);
    });
}

/** Width the trial reserves for a legend column with these labels (measured on
 *  the stacked-colour, value-names and blank-sample crops): the label ink plus
 *  48 px (16 px in front of the swatch, the 14 px swatch, the 9 px gap and the
 *  trailing pad), with a floor of 64 px. */
export function legendReserve(ctx: CanvasRenderingContext2D, items: string[], style: PlotStyle): number {
    return Math.max(64, legendMaxWidth(ctx, items, style) + 48);
}

function paintDataLabels(ctx: CanvasRenderingContext2D, bound: BoundPlot, frame: CartesianFrame, type: string, palette: string[]) {
    const texts = bound.plot.config?.text;
    if (!texts || !texts.length) return;
    const spec: IPlotConfigTextOption = texts[0];
    const styleSpec = spec.textStyle;
    ctx.fillStyle = css(styleSpec?.color, '#555555');
    ctx.font = font(styleSpec, 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const { plot, scale } = frame;
    const span = scale.max - scale.min || 1;
    const horizontal = isHorizontal(type);
    const n = Math.max(1, bound.categories.length);
    const stacked = isStack(type);
    const pairs = stacked ? stackedValues(bound, type) : null;
    bound.series.forEach((s, si) => {
        for (let i = 0; i < n; i++) {
            const point = s.points[i];
            if (!point) continue;
            const top = pairs ? pairs[si]![i * 2 + 1] : point.value;
            const ratio = (top - scale.min) / span;
            const band = (horizontal ? plot.height : plot.width) / n;
            const center = (i + 0.5) * band;
            const text = spec.format ? applyNumberFormat(point.value, spec.format, ctx) : applyNumberFormat(point.value, undefined, ctx);
            if (horizontal) ctx.fillText(text, plot.x + ratio * plot.width + 14, plot.y + center + 4);
            else ctx.fillText(text, plot.x + center, plot.y + plot.height - ratio * plot.height - 2);
        }
    });
    void palette;
}

/** Radar web layout (measured black-box on the 468x308 filledRadar crop):
 *  the trial centers the web right of the plot middle (cx = plotCx + 28,
 *  cy = plotCy) and draws an elliptical diamond web (rx = W/2 - 88,
 *  ry = H/2 - 37); data vertices use a circular scale R = ry + 4 over the
 *  STEPPED value-axis max (Sales radar 390..1097 -> axis 1200, not 1097). */
export function radarLayout(area: Rect, extentMin: number, extentMax: number) {
    const cx = area.x + area.width / 2 + 28;
    const cy = area.y + area.height / 2;
    const rx = area.width / 2 - 88;
    const ry = area.height / 2 - 37;
    const radius = Math.max(20, ry + 4);
    const axisMax = Math.max(1, niceScale(Math.min(0, extentMin), extentMax).max);
    return { cx, cy, rx, ry, radius, axisMax };
}

function paintPolarRadar(ctx: CanvasRenderingContext2D, bound: BoundPlot, area: Rect, type: string, palette: string[], style: PlotStyle) {
    const n = Math.max(3, bound.categories.length);
    const extent = cartesianValueExtent(bound, 'line');
    const { cx, cy, rx, ry, radius, axisMax: max } = radarLayout(area, extent.min, extent.max);
    const angle = (i: number): number => -Math.PI / 2 + (i / n) * Math.PI * 2;
    // Web rings: the trial draws eight thin diamonds (#efefef) with darker
    // spokes (~#d4d4d4), pitch = outerRadius/8 (measured black-box).
    ctx.strokeStyle = '#efefef';
    ctx.lineWidth = 1;
    const rings = 8;
    for (let r = 1; r <= rings; r++) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const k = r / rings;
            const a = angle(i % n);
            const x = cx + Math.cos(a) * rx * k;
            const y = cy + Math.sin(a) * ry * k;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
    }
    // Spokes + category labels.
    ctx.fillStyle = style.labelColor;
    ctx.font = style.labelFont;
    for (let i = 0; i < n; i++) {
        const a = angle(i);
        ctx.strokeStyle = '#d4d4d4';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        ctx.stroke();
        const lx = cx + Math.cos(a) * (rx + 12);
        const ly = cy + Math.sin(a) * (ry + 12);
        ctx.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(bound.categories[i] ?? ''), lx, ly);
    }
    // Series polygons. The trial draws a ~1 px outline plus a filled round
    // marker (diameter ≈ 6 px) in the series colour at every data vertex.
    const filled = /filled/i.test(type);
    bound.series.forEach((s, si) => {
        const color = colorOf(s, si, palette, s.pointColorIndices ? s.pointColorIndices[0] ?? 0 : -1);
        const pts: Array<[number, number]> = [];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const v = s.points[i]?.value ?? 0;
            const rad = (Math.max(0, v) / max) * radius;
            const a = angle(i);
            const x = cx + Math.cos(a) * rad;
            const y = cy + Math.sin(a) * rad;
            pts.push([x, y]);
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
        if (filled) {
            ctx.fillStyle = withAlpha(color, 0.55);
            ctx.fill();
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color;
        for (const [x, y] of pts) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

export { css as cssColor, withAlpha as fillWithAlpha };
