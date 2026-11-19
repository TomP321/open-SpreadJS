/**
 * DataChart painting for the circular families: pie/donut/rose, polar and
 * radial bars, treemap/sunburst and the scatter/bubble marks. Own code; every
 * shape is drawn from paths, no raster reference is used.
 */
import type { BoundPlot } from './binding.js';
import { formatNumber, toNumber } from './binding.js';
import type { Rect } from './paint.js';
import type { PlotStyle } from './paint.js';
import { inkWidth, legendMaxWidth, niceScale, paintLegend } from './paint.js';
import { DEFAULT_PALETTE } from './data-chart.js';

function colorAt(palette: string[], index: number): string {
    return palette[index % palette.length] ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
}

function sliceValues(bound: BoundPlot): number[] {
    const series = bound.series;
    if (!series.length) return [];
    if (series.length === 1) return series[0]!.points.map(p => Math.max(0, p.value));
    // Multiple series: sum per category (the trial collapses the values).
    const n = bound.categories.length || series[0]!.points.length;
    const totals = new Array(Math.max(1, n)).fill(0);
    for (const s of series) s.points.forEach((p, i) => { totals[i] += Math.max(0, p.value); });
    return totals;
}

function sliceLabels(bound: BoundPlot): string[] {
    return bound.categories.length ? bound.categories : bound.series.map(s => s.name);
}

function sliceColors(bound: BoundPlot, palette: string[], count: number): string[] {
    const first = bound.series[0];
    const indices = first?.pointColorIndices;
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(colorAt(palette, indices ? indices[i] ?? i : i));
    return out;
}

/**
 * Circular-family geometry, measured on the 468x308 comparison crops. Real
 * pies/donuts/rose/rings (no header band) follow the s-scaled ladder (v23
 * crops); a header-bearing blank pie sits centred over the remaining height
 * with the full width minus the legend (blank-pie crop: centre (202, 174.5)
 * R ~97 in crop pixels).
 */
function polarRect(area: Rect, type: string, legendReserve: number): { cx: number; cy: number; radius: number } {
    const pieLike = /^(pie|donut)$/i.test(type);
    const half = Math.min(area.width, area.height) / 2;
    if (pieLike && area.y > 0) {
        // Measured (crop chords): disc centre (205, 175.5), R ~86 — canvas
        // (201, 171.5) r 86: left 6 px, inset 35, dy -7.
        const left = area.x + 6;
        const right = area.x + area.width - legendReserve;
        return { cx: (left + right) / 2, cy: area.y + half - 7, radius: Math.max(8, half - 35) };
    }
    const s = Math.min(area.width, area.height) / 308;
    const left = area.x + 68 * s;
    const right = area.x + area.width - legendReserve;
    const inset = pieLike ? 42 : /^sunburst$/i.test(type) ? 43 : /^rose$/i.test(type) ? 30 : 27;
    const dy = /^rose$/i.test(type) ? 0 : -2;
    return { cx: (left + right) / 2, cy: area.y + half + dy * s, radius: Math.max(8, half - inset * s) };
}

export function paintPolar(
    chart: unknown,
    ctx: CanvasRenderingContext2D,
    bound: BoundPlot,
    area: Rect,
    type: string,
    palette: string[],
    style: PlotStyle,
): void {
    const values = sliceValues(bound);
    const labels = sliceLabels(bound);
    const colors = sliceColors(bound, palette, values.length);
    const config = bound.plot.config ?? {};
    const radial = /radialStacked/i.test(type);
    const rose = /^rose$/i.test(type);
    const ringFamily = /^(polarCoordinatesBar|polarCoordinatesStackedBar|radialStackedBar)$/i.test(type);
    // Legend per family (measured): the rose lists the categories (one colour each);
    // pie/donut list their slices; the ring families have no legend.
    const pieLike = /^(pie|donut)$/i.test(type);
    const legend = rose
        ? labels.filter(label => String(label ?? '').length)
        : pieLike && bound.series.length < 2 ? bound.legend.slice(0, 1)
            : pieLike && bound.series.length > 1 ? bound.legend.slice() : [];
    const legendColors = rose
        ? colors
        : [colorAt(palette, bound.series[0]?.pointColorIndices?.[0] ?? 0)];
    const reserve = legend.length ? Math.max(64, legendMaxWidth(ctx, legend, style) + 48) : 0;
    const { cx, cy, radius: outerR } = polarRect(area, type, reserve);
    void legendColors;
    // Pie family: slices per values[] series (not per category), like columns.
    const seriesSlices = bound.series.map((s, si) => ({
        value: Math.max(0, s.points.reduce((acc, p) => acc + p.value, 0)),
        name: s.name,
        color: colorAt(palette, s.pointColorIndices ? s.pointColorIndices[0] ?? si : si),
    }));
    if (/^(pie|donut)$/i.test(type)) {
        // Trial: slices follow the value series (not categories); a single value
        // series paints ONE slice for the whole circle and the legend lists the
        // first colour key only.
        const slices: Array<{ value: number; color: string }> = [];
        const sliceNames: string[] = [];
        if (bound.series.length > 1) {
            for (const s of seriesSlices) { slices.push({ value: s.value, color: s.color }); sliceNames.push(s.name); }
        }
        else {
            const first = bound.series[0];
            const ci = first?.pointColorIndices?.[0] ?? 0;
            slices.push({ value: Math.max(0, first?.points.reduce((acc, p) => acc + p.value, 0) ?? 0), color: colorAt(palette, ci) });
            sliceNames.push(bound.legend[ci] ?? '');
        }
        const inner = /donut/i.test(type) ? Number(config.innerRadius ?? 0.59) * outerR : 0;
        let start = ((Number(config.startAngle) || 0) - 90) * (Math.PI / 180);
        const sweep = Math.PI * 2 * (Math.min(360, Math.max(1, Number(config.sweep) || 360)) / 360);
        const sliceTotal = slices.reduce((acc, s) => acc + s.value, 0) || 1;
        const drawn: Array<{ mid: number; color: string; text: string }> = [];
        for (const slice of slices) {
            const angle = (slice.value / sliceTotal) * sweep;
            ctx.fillStyle = slice.color;
            ctx.beginPath();
            if (inner > 0) {
                ctx.arc(cx, cy, outerR, start, start + angle);
                ctx.arc(cx, cy, inner, start + angle, start, true);
            } else {
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, outerR, start, start + angle);
            }
            ctx.closePath();
            ctx.fill();
            drawn.push({ mid: start + angle / 2, color: slice.color, text: `${+(slice.value / sliceTotal * 100).toFixed(2)}%` });
            start += angle;
        }
        // Blank/default pie stamps `encodings.text = []` => percentage labels
        // with coloured leader lines (measured on the blank-pie crop: text sits
        // at radius+18 horizontally but only +3 vertically, leader r+2..r+14).
        if (Array.isArray((bound.plot.encodings as { text?: unknown } | undefined)?.text) && legend.length) {
            ctx.font = style.labelFont;
            ctx.textBaseline = 'middle';
            for (const d of drawn) {
                const cos = Math.cos(d.mid), sin = Math.sin(d.mid);
                ctx.strokeStyle = d.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx + cos * (outerR + 2), cy + sin * (outerR + 2));
                ctx.lineTo(cx + cos * (outerR + 14), cy + sin * (outerR + 14));
                ctx.stroke();
                ctx.fillStyle = style.labelColor;
                ctx.textAlign = cos >= 0 ? 'left' : 'right';
                ctx.fillText(d.text, cx + cos * (outerR + 18) + (cos >= 0 ? 2 : -2), cy + sin * (outerR + 3));
            }
        }
        if (legend.length) paintLegend(ctx, legend, { x: area.x + area.width - reserve, y: cy - outerR, width: reserve, height: outerR * 2 }, palette, style);
        void sliceNames; void labels; void colors; void values; void radial; void rose; void ringFamily;
        return;
    }
    if (rose || radial) {
        // Quadrant wedges (equal angles, first category top-right), radius on a
        // shared value scale. The rose fills each quadrant completely, keeps a
        // central hole, has no category text and puts the categories in a legend
        // (all measured on the rose crop); the radialStackedBar keeps 72% wedge
        // fills, labels every wedge outside and puts the tick values on the
        // 12 o'clock radius.
        const n = Math.max(1, values.length);
        const scale = niceScale(0, Math.max(...values, 1));
        const hole = rose ? outerR * 0.265 : 0;
        const fillRatio = rose ? 1 : 0.72;
        if (!rose) {
            ctx.strokeStyle = style.gridColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < n; i++) {
            const step = (Math.PI * 2) / n;
            const r = hole + (values[i]! / scale.max) * (outerR - hole);
            const start = -Math.PI / 2 + i * step;
            ctx.fillStyle = radial
                ? colorAt(palette, bound.series[0]?.pointColorIndices?.[0] ?? 0)
                : colorAt(palette, bound.series[0]?.pointColorIndices?.[i] ?? i);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(start) * hole, cy + Math.sin(start) * hole);
            ctx.arc(cx, cy, r, start, start + step * fillRatio);
            if (hole > 0) ctx.arc(cx, cy, hole, start + step * fillRatio, start, true);
            ctx.closePath();
            ctx.fill();
            if (radial) {
                // Category label outside the wedge mid-angle.
                const mid = start + step * 0.36;
                ctx.fillStyle = style.labelColor;
                ctx.font = style.labelFont;
                ctx.textAlign = Math.abs(Math.cos(mid)) < 0.3 ? 'center' : Math.cos(mid) > 0 ? 'left' : 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(bound.categories[i] ?? ''), cx + Math.cos(mid) * (outerR + 14), cy + Math.sin(mid) * (outerR + 14));
            }
        }
        if (rose && legend.length) {
            // Rose legend (measured): category swatches just past the plot edge,
            // centred on the circle centre.
            paintLegend(ctx, legend, { x: area.x + area.width - reserve - 20, y: cy - outerR, width: reserve + 20, height: outerR * 2 }, colors, style);
        }
        if (radial) {
            // Radial tick labels along the 12 o'clock radius (0 at the centre).
            ctx.fillStyle = style.labelColor;
            ctx.font = style.labelFont;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (const tick of scale.ticks) ctx.fillText(String(tick), cx - 3, cy - (tick / scale.max) * outerR);
        }
        void labels;
        return;
    }
    if (/^sunburst$/i.test(type)) {
        // Trial: a single disc unless several value series are bound.
        const slices = bound.series.length > 1 ? seriesSlices : [{ value: 1, name: '', color: colorAt(palette, 0) }];
        if (slices.length === 1) {
            ctx.fillStyle = slices[0]!.color;
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
            ctx.fill();
        } else {
            let start = -Math.PI / 2;
            const sliceTotal = slices.reduce((acc, s) => acc + s.value, 0) || 1;
            for (const slice of slices) {
                const angle = (slice.value / sliceTotal) * Math.PI * 2;
                drawArc(ctx, cx, cy, 0, outerR, start, start + angle, slice.color);
                start += angle;
            }
        }
        void labels; void colors; void values; void radial; void rose; void ringFamily;
        return;
    }
    // polarCoordinatesBar / polarCoordinatesStackedBar: one ring per category,
    // the FIRST category innermost. Measured on the 468x308 crop: thin scale
    // circle R=121 (0.955 of the 127 px rect radius), ring centres at
    // 0.44R + i*0.15R with a 0.65*pitch stroke, round caps, arc = value / axis
    // maximum of the full circle (0 at 12 o'clock, clockwise); the category
    // labels stack right-aligned left of 12 o'clock, two pitches below their
    // ring; the max tick label (which would land on the 0 label) is skipped.
    const n = Math.max(1, bound.categories.length);
    const scale = niceScale(0, Math.max(...bound.series[0]?.points.map(p => p.value) ?? [1], 1));
    const circleR = outerR * 0.955;
    const pitch = outerR * 0.15;
    const firstCentre = outerR * 0.44;
    const ringWidth = pitch * 0.65;
    ctx.strokeStyle = style.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
    ctx.stroke();
    const tickCount = scale.ticks.length;
    scale.ticks.forEach((tick, ti) => {
        if (ti === 0 || ti === tickCount - 1) return;
        const a = -Math.PI / 2 + (tick / scale.max) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * circleR * 0.31, cy + Math.sin(a) * circleR * 0.31);
        ctx.lineTo(cx + Math.cos(a) * circleR, cy + Math.sin(a) * circleR);
        ctx.stroke();
    });
    for (let i = 0; i < n; i++) {
        const v = Math.abs(bound.series.reduce((acc, s) => acc + (s.points[i]?.value ?? 0), 0));
        const r = firstCentre + pitch * i;
        const angle = (v / scale.max) * Math.PI * 2;
        ctx.strokeStyle = colorAt(palette, bound.series[0]?.pointColorIndices?.[i] ?? 0);
        ctx.lineWidth = Math.max(4, ringWidth);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + angle);
        ctx.stroke();
        // Category label right-aligned left of 12 o'clock, 2 pitches under the ring.
        ctx.fillStyle = style.labelColor;
        ctx.font = style.labelFont;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(bound.categories[i] ?? ''), cx - 4, cy - (r - 2 * pitch));
    }
    ctx.lineCap = 'butt';
    ctx.lineWidth = 1;
    paintRadialTicks(ctx, cx, cy, circleR, scale.ticks.slice(0, -1), style, false);
    void labels; void colors; void values; void radial; void rose; void ringFamily;
}

/** Tick labels around the polar circle: values mapped to angles (0 at top). */
function paintRadialTicks(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, ticks: number[], style: PlotStyle, innerLabels: boolean): void {
    const max = ticks[ticks.length - 1] || 1;
    ctx.fillStyle = style.labelColor;
    ctx.font = style.labelFont;
    for (const tick of ticks) {
        if (innerLabels) {
            // Radial labels along the 12-o'clock radius (radialStackedBar).
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(tick), cx - 4, cy - (tick / max) * radius);
        }
        else {
            const a = -Math.PI / 2 + (tick / max) * Math.PI * 2;
            const x = cx + Math.cos(a) * (radius + 18);
            const y = cy + Math.sin(a) * (radius + 18);
            ctx.textAlign = Math.abs(Math.cos(a)) < 0.3 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(tick), x, y);
            // Small tick mark on the scale circle.
            ctx.strokeStyle = style.gridColor;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
            ctx.lineTo(cx + Math.cos(a) * (radius + 4), cy + Math.sin(a) * (radius + 4));
            ctx.stroke();
        }
    }
}

export function paintTree(
    chart: unknown,
    ctx: CanvasRenderingContext2D,
    bound: BoundPlot,
    area: Rect,
    palette: string[],
    style: PlotStyle,
): void {
    void chart;
    // Trial: the treemap tiles the colour values; without a colour encoding it
    // paints one root block (hierarchy categories are ignored).
    const tiles = bound.legend.filter(item => item.length);
    if (tiles.length <= 1) {
        // Trial (measured): the single root block is inset ~14 px on every side.
        ctx.fillStyle = colorAt(palette, 0);
        ctx.fillRect(area.x + 14, area.y + 14, Math.max(1, area.width - 29), Math.max(1, area.height - 29));
        return;
    }
    const first = bound.series[0];
    const values = tiles.map((_, i) => Math.max(0.0001, first?.points[i]?.value ?? 1));
    const rects = squarify(values, area);
    tiles.forEach((label, index) => {
        const rect = rects[index]!;
        ctx.fillStyle = colorAt(palette, first?.pointColorIndices?.[index] ?? index);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px ' + (style.labelFont.split('px ')[1] ?? 'Calibri, sans-serif');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        if (rect.width > 24 && rect.height > 14) ctx.fillText(String(label), rect.x + 3, rect.y + 3);
    });
}

function squarify(values: number[], rect: Rect): Rect[] {
    const out: Rect[] = new Array(values.length);
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const areas = values.map(v => (v / total) * rect.width * rect.height);
    let current: Rect = { ...rect };
    let i = 0;
    const worst = (row: number[], side: number, areaSum: number): number => {
        const s2 = areaSum * areaSum;
        const max = Math.max(...row);
        const min = Math.min(...row);
        return Math.max((side * side * max) / s2, s2 / (side * side * min));
    };
    while (i < values.length) {
        const horizontal = current.width >= current.height;
        const side = horizontal ? current.height : current.width;
        const row: number[] = [areas[i]!];
        let j = i + 1;
        while (j < areas.length) {
            const withNext = [...row, areas[j]!];
            if (worst(withNext, side, row.reduce((a, b) => a + b, 0) + areas[j]!) <= worst(row, side, row.reduce((a, b) => a + b, 0))) { row.push(areas[j]!); j++; }
            else break;
        }
        const rowSum = row.reduce((a, b) => a + b, 0);
        const thickness = rowSum / side;
        let offset = 0;
        row.forEach((areaValue, k) => {
            const length = areaValue / thickness;
            out[i + k] = horizontal
                ? { x: current.x, y: current.y + offset, width: thickness, height: length }
                : { x: current.x + offset, y: current.y, width: length, height: thickness };
            offset += length;
        });
        if (horizontal) { current = { x: current.x + thickness, y: current.y, width: Math.max(0, current.width - thickness), height: current.height }; }
        else { current = { x: current.x, y: current.y + thickness, width: current.width, height: Math.max(0, current.height - thickness) }; }
        i += row.length;
    }
    return out;
}

function drawArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, a0, a1);
    ctx.arc(cx, cy, r0, a1, a0, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
}

export function paintScatterMarks(
    ctx: CanvasRenderingContext2D,
    bound: BoundPlot,
    area: Rect,
    type: string,
    palette: string[],
    style: PlotStyle,
    xs: number[],
    ys: number[],
    sizes: number[],
): void {
    const n = xs.length;
    // Trial-measured scatter axes: x spans min..max in up to ten intervals
    // (2..12 -> step 1), y is the regular six-interval ladder (0..12 -> 2).
    const scaleX = niceScale(Math.min(...xs), Math.max(...xs), 10, [1, 2, 2.5, 5, 10], false);
    const scaleY = niceScale(Math.min(...ys, 0), Math.max(...ys, 0));
    const yLabels = scaleY.ticks.map(t => formatNumber(t));
    const yInk = Math.max(...yLabels.map(t => inkWidth(ctx, t, style.labelFont)));
    // Same frame as the cartesian family (measured on the bubble crop, box
    // coords gridlines [34,455]x[12,266]; our canvas sits 4 px inside):
    const left = area.x + 14 + yInk + 4;
    const plot: Rect = { x: left, y: area.y + 8, width: Math.max(20, area.x + area.width - 3 - left), height: Math.max(20, area.y + area.height - 38 - (area.y + 8)) };
    // Grid + labels (trial: light gridlines on every x tick and on every y tick
    // above the minimum; the y minimum is the dark bottom axis line).
    ctx.strokeStyle = style.gridColor;
    ctx.fillStyle = style.labelColor;
    ctx.font = style.labelFont;
    ctx.lineWidth = 1;
    for (const tick of scaleY.ticks.slice(1)) {
        const y = plot.y + plot.height - ((tick - scaleY.min) / (scaleY.max - scaleY.min || 1)) * plot.height;
        ctx.beginPath(); ctx.moveTo(plot.x, Math.round(y) + 0.5); ctx.lineTo(plot.x + plot.width, Math.round(y) + 0.5); ctx.stroke();
    }
    for (const tick of scaleX.ticks) {
        const x = plot.x + ((tick - scaleX.min) / (scaleX.max - scaleX.min || 1)) * plot.width;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, plot.y); ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.height); ctx.stroke();
    }
    for (const tick of scaleY.ticks) {
        const y = plot.y + plot.height - ((tick - scaleY.min) / (scaleY.max - scaleY.min || 1)) * plot.height;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatNumber(tick), plot.x - 4, y);
    }
    for (const tick of scaleX.ticks) {
        const x = plot.x + ((tick - scaleX.min) / (scaleX.max - scaleX.min || 1)) * plot.width;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatNumber(tick), x, plot.y + plot.height + 13);
    }
    ctx.strokeStyle = '#a6a6a6';
    ctx.beginPath();
    ctx.moveTo(plot.x, Math.round(plot.y + plot.height) + 0.5);
    ctx.lineTo(plot.x + plot.width, Math.round(plot.y + plot.height) + 0.5);
    ctx.stroke();
    ctx.strokeStyle = style.gridColor;
    // Marks.
    const color = palette[0] ?? DEFAULT_PALETTE[0];
    const bubble = /bubble/i.test(type);
    const maxSize = Math.max(...sizes, 1);
    for (let i = 0; i < n; i++) {
        const x = plot.x + ((xs[i]! - scaleX.min) / (scaleX.max - scaleX.min || 1)) * plot.width;
        const y = plot.y + plot.height - ((ys[i]! - scaleY.min) / (scaleY.max - scaleY.min || 1)) * plot.height;
        ctx.fillStyle = color;
        ctx.beginPath();
        // Trial-measured bubble radius: four buckets of 5 px by size value
        // (sizes 12/18/20/26/30/35/40/48 -> 5/10/10/15/15/15/20/20 px).
        const radius = bubble && sizes.length ? 5 * Math.max(1, Math.ceil(sizes[i]! / (maxSize / 4))) : 3.5;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    void bound;
}

export { toNumber };
