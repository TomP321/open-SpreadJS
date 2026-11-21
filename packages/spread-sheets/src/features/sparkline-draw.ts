/**
 * Cell renderers for the advanced formula sparklines (`=SCATTERSPARKLINE(...)`,
 * `=BULLETSPARKLINE(...)` and friends). Every glyph here is drawn with our own
 * canvas paths; positions and colours follow the trial's observable rendering,
 * and the records read here are the trial's value records (see sparkline-ex.ts).
 */
import { resolveColor } from '../colors.js';
import type { JsonRecord } from '../serialization.js';

type Record_ = Record<string, unknown>;

/** Flattens a value slot that may hold rows of cells. */
function flat(input: unknown): (number | null)[] {
  if (input === null || input === undefined) return [];
  const walk = (item: unknown): (number | null)[] =>
    Array.isArray(item) ? item.flatMap(walk) : [typeof item === 'number' && Number.isFinite(item) ? item : null];
  return walk(input);
}

function texts(input: unknown): string[] {
  if (input === null || input === undefined) return [];
  const walk = (item: unknown): string[] => (Array.isArray(item) ? item.flatMap(walk) : [item === null || item === undefined ? '' : String(item)]);
  return walk(input);
}

function number(input: unknown, fallback = 0): number {
  const value = typeof input === 'string' ? Number(input) : input;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A numeric option that reports `null`/absent when the argument was missing. */
function optional(input: unknown): number | undefined {
  const value = number(input, Number.NaN);
  return Number.isFinite(value) ? value : undefined;
}

function boolean(input: unknown, fallback = false): boolean {
  return input === undefined || input === null ? fallback : Boolean(input);
}

/** A palette option may be a range of cells or a `a-b-c` colour list. */
function schemeColors(input: unknown): string[] {
  const list = texts(input);
  if (list.length === 1 && list[0] && !list[0].includes(',') && !list[0].startsWith('#')) {
    const parts = list[0].split(/[-,]/).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  return list.filter(Boolean);
}

const DEFAULT_SERIES = '#4472c4';
const DEFAULT_NEGATIVE = '#c00000';

/** Scales a value from [min,max] into [0,1] along the chart area. */
function ratio(value: number, min: number, max: number): number {
  return max === min ? 0.5 : (value - min) / (max - min);
}

function areaOf(x: number, y: number, w: number, h: number, inset = 2): { x: number; y: number; w: number; h: number } {
  return { x: x + inset, y: y + inset, w: Math.max(1, w - inset * 2 - 1), h: Math.max(1, h - inset * 2 - 1) };
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void {
  ctx.strokeStyle = resolveColor(color);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  ctx.stroke();
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = resolveColor(color);
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function range(values: (number | null)[], padZero = true): { min: number; max: number } {
  const numeric = values.filter((n): n is number => n !== null);
  if (!numeric.length) return { min: 0, max: 1 };
  let min = Math.min(...numeric), max = Math.max(...numeric);
  if (padZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) { min -= 1; max += 1; }
  return { min, max };
}

/* ------------------------------------------------------------------ charts -- */

function drawScatter(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const xs = flat(value.points1), ys = flat(value.points2);
  if (!xs.length) return;
  const all = [...xs, ...ys].filter((n): n is number => n !== null);
  const second = ys.filter((n): n is number => n !== null);
  const minX = optional(value.minX) ?? Math.min(...all);
  const maxX = optional(value.maxX) ?? Math.max(...all);
  const minY = optional(value.minY) ?? Math.min(...(second.length ? second : all));
  const maxY = optional(value.maxY) ?? Math.max(...(second.length ? second : all));
  const color1 = value.color1 ? String(value.color1) : DEFAULT_SERIES;
  const color2 = value.color2 ? String(value.color2) : '#ed7d31';
  const px = (n: number) => area.x + ratio(n, minX, maxX === minX ? minX + 1 : maxX) * area.w;
  const py = (n: number) => area.y + area.h - ratio(n, minY, maxY === minY ? minY + 1 : maxY) * area.h;
  if (value.xMinZone !== null && value.xMinZone !== undefined && value.xMaxZone !== null && value.xMaxZone !== undefined) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    const from = px(number(value.xMinZone)), to = px(number(value.xMaxZone));
    box(ctx, from, area.y, to - from, area.h, color1);
    ctx.restore();
  }
  if (value.yMinZone !== null && value.yMinZone !== undefined && value.yMaxZone !== null && value.yMaxZone !== undefined) {
    ctx.save();
    ctx.globalAlpha = 0.15;
    const from = py(number(value.yMaxZone)), to = py(number(value.yMinZone));
    box(ctx, area.x, from, area.w, to - from, color2);
    ctx.restore();
  }
  // The trial plots markers; a connecting polyline appears only when `drawLines` is on.
  const drawLines = boolean(value.drawLines);
  const drawSymbol = boolean(value.drawSymbol, !drawLines);
  if (drawLines) {
    [xs, ys].forEach((series, index) => {
      if (!series.length) return;
      ctx.strokeStyle = resolveColor(index === 0 ? color1 : color2);
      ctx.lineWidth = 1;
      if (value.dash) ctx.setLineDash([3, 2]);
      ctx.beginPath();
      let started = false;
      series.forEach((n, position) => {
        if (n === null) return;
        const x = ys.length ? px((xs[position] ?? n) as number) : px(n);
        const y = ys.length ? py(index === 0 ? (ys[position] ?? n) : n) : py(n);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }
  if (drawSymbol) {
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      if (x === null) continue;
      const y = ys.length ? ys[i] ?? x : x;
      ctx.fillStyle = resolveColor(i === 0 || xs.length === 1 ? color1 : color2);
      ctx.beginPath();
      ctx.arc(px(x), py(y), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (value.hLine !== null && value.hLine !== undefined) line(ctx, area.x, py(number(value.hLine)), area.x + area.w, py(number(value.hLine)), '#a6a6a6');
  if (value.vLine !== null && value.vLine !== undefined) line(ctx, px(number(value.vLine)), area.y, px(number(value.vLine)), area.y + area.h, '#a6a6a6');
}

function drawBullet(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const vertical = boolean(value.vertical);
  const measure = number(value.measure), target = number(value.target), maxi = number(value.maxi, 1);
  const good = optional(value.good), bad = optional(value.bad), forecast = optional(value.forecast);
  const barSize = optional(value.barSize) ?? 0.6;
  const frame = areaOf(area.x, area.y, area.w, area.h, 1);
  const length = vertical ? frame.w : frame.h;
  const thickness = (vertical ? frame.h : frame.w) * barSize;
  const cross = vertical ? frame.y + (frame.h - thickness) / 2 : frame.x + (frame.w - thickness) / 2;
  const colors = schemeColors(value.colorScheme);
  const badColor = value.badColor ? String(value.badColor) : colors[0] ?? '#e69138';
  const goodColor = value.goodColor ? String(value.goodColor) : colors[1] ?? '#ffd966';
  const extraColor = colors[2] ?? '#a4c2f4';
  const measureColor = value.measureColor ? String(value.measureColor) : '#000000';
  const targetColor = value.targetColor ? String(value.targetColor) : '#000000';
  const maxiColor = value.maxiColor ? String(value.maxiColor) : '#d9d9d9';
  const capMaxi = boolean(value.allowMeasureOverMaxi) ? Math.max(maxi, measure) : maxi;
  const at = (amount: number) => (vertical ? frame.x : frame.y) + ratio(Math.max(0, Math.min(amount, capMaxi)), 0, capMaxi || 1) * length;
  if (vertical) {
    box(ctx, at(0), cross, at(capMaxi) - at(0), thickness, maxiColor);
    if (bad !== undefined) box(ctx, at(0), cross, at(bad) - at(0), thickness, badColor);
    if (good !== undefined) box(ctx, at(bad ?? 0), cross, at(good) - at(bad ?? 0), thickness, goodColor);
    if (colors.length > 2) box(ctx, at(good ?? bad ?? 0), cross, at(capMaxi) - at(good ?? bad ?? 0), thickness, extraColor);
    box(ctx, at(0), cross + thickness * 0.25, at(measure) - at(0), thickness * 0.5, measureColor);
    if (forecast !== undefined) box(ctx, at(0), cross + thickness * 0.38, at(forecast) - at(0), thickness * 0.24, 'transparent');
    line(ctx, at(target), cross - 2, at(target), cross + thickness + 2, targetColor, 2);
    const tick = optional(value.tickUnit);
    if (tick !== undefined && tick > 0)
      for (let step = 0; step <= capMaxi; step += tick) line(ctx, at(step), cross - 1, at(step), cross + thickness + 1, '#b7b7b7', 1);
  } else {
    box(ctx, cross, at(capMaxi), thickness, at(0) - at(capMaxi), maxiColor);
    if (bad !== undefined) box(ctx, cross, at(bad), thickness, at(0) - at(bad), badColor);
    if (good !== undefined) box(ctx, cross, at(good), thickness, at(bad ?? 0) - at(good), goodColor);
    if (colors.length > 2) box(ctx, cross, at(capMaxi), thickness, at(good ?? bad ?? 0) - at(capMaxi), extraColor);
    box(ctx, cross, at(measure), thickness, at(0) - at(measure), measureColor);
    line(ctx, cross - 2, at(target), cross + thickness + 2, at(target), targetColor, 2);
    const tick = optional(value.tickUnit);
    if (tick !== undefined && tick > 0)
      for (let step = 0; step <= capMaxi; step += tick) line(ctx, cross - 1, at(step), cross + thickness + 1, at(step), '#b7b7b7', 1);
  }
}

/** SPREADSPARKLINE: one mark per distinct value, tall by how often it occurs. */
function drawSpread(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const entries = (Array.isArray(value.spreadData) ? value.spreadData : []) as Record_[];
  if (!entries.length) return;
  const keys = entries.map((entry) => number(entry.key));
  const counts = entries.map((entry) => number(entry.value, 1));
  const min = optional(value.scaleStart) ?? Math.min(...keys);
  const max = optional(value.scaleEnd) ?? Math.max(...keys);
  const top = Math.max(1, ...counts);
  const ink = schemeColors(value.colorScheme)[0] ?? '#595959';
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const at = (key: number) => frame.x + ratio(key, min, max === min ? min + 1 : max) * frame.w;
  keys.forEach((key, index) => {
    const x = at(key);
    const height = Math.max(1, (counts[index]! / top) * frame.h * 0.9);
    line(ctx, x, frame.y + frame.h - height, x, frame.y + frame.h, ink, 2);
  });
  if (boolean(value.showAverage)) {
    const total = keys.reduce((sum, key, index) => sum + key * counts[index]!, 0);
    const weight = counts.reduce((sum, count) => sum + count, 0) || 1;
    const average = total / weight;
    const y = frame.y + frame.h - ratio(average, Math.min(...counts), Math.max(...counts)) * frame.h;
    line(ctx, frame.x, y, frame.x + frame.w, y, ink, 1);
  }
  void frame;
}

function drawStacked(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const values = flat(value.points).filter((n): n is number => n !== null);
  if (!values.length) return;
  // The trial lays the stacked band across the cell width; `vertical: true`
  // stacks it bottom-to-top instead.
  const vertical = boolean(value.vertical);
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const colors = schemeColors(value.colorRange);
  const max = optional(value.maximum) ?? Math.max(1, values.reduce((sum, n) => sum + Math.abs(n), 0));
  const thickness = Math.max(4, (vertical ? frame.w : frame.h) * 0.45);
  const cross = vertical ? frame.x + (frame.w - thickness) / 2 : frame.y + (frame.h - thickness) / 2;
  const base = vertical ? frame.y + frame.h : frame.x;
  let cursor = 0;
  values.forEach((item, index) => {
    const color = colors[index % Math.max(1, colors.length)] || ['#787878', '#969696', '#b4b4b4', '#d2d2d2', '#5a5a5a'][index % 5];
    const size = (Math.abs(item) / max) * (vertical ? frame.h : frame.w);
    if (vertical) box(ctx, cross, base - cursor - size, thickness, size, color);
    else box(ctx, base + cursor, cross, size, thickness, color);
    cursor += size;
  });
  const highlight = optional(value.highlightPosition) ?? -1;
  if (highlight >= 0 && highlight < values.length) {
    const marker = value.color ? String(value.color) : '#c00000';
    let position = 0;
    for (let index = 0; index <= highlight; index++) position += (Math.abs(values[index]!) / max) * (vertical ? frame.h : frame.w);
    if (vertical) line(ctx, cross - 2, base - position, cross + thickness + 2, base - position, marker, 1);
    else line(ctx, base + position, cross - 2, base + position, cross + thickness + 2, marker, 1);
  }
  const targets = [value.targetRed, value.targetGreen, value.targetBlue, value.targetYellow];
  const targetColors = ['#c00000', '#00b050', '#4472c4', '#ffc000'];
  targets.forEach((target, index) => {
    const amount = optional(target);
    if (amount === undefined) return;
    const position = (amount / max) * (vertical ? frame.h : frame.w);
    if (vertical) line(ctx, cross - 3, base - position, cross + thickness + 3, base - position, targetColors[index]!, 1);
    else line(ctx, base + position, cross - 3, base + position, cross + thickness + 3, targetColors[index]!, 1);
  });
}

function drawVari(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const variance = number(value.variance), reference = number(value.reference, 0);
  const vertical = boolean(value.vertical, true);
  const mini = optional(value.mini) ?? Math.min(0, reference, variance);
  const maxi = optional(value.maxi) ?? Math.max(reference + Math.abs(variance), reference, variance, 1);
  const frame = areaOf(area.x, area.y, area.w, area.h, 1);
  const colors = schemeColors(value.colorScheme);
  const positive = value.colorPositive ? String(value.colorPositive) : colors[0] ?? '#70ad47';
  const negative = value.colorNegative ? String(value.colorNegative) : colors[1] ?? DEFAULT_NEGATIVE;
  const at = (amount: number) => vertical
    ? frame.x + ratio(amount, mini, maxi === mini ? mini + 1 : maxi) * frame.w
    : frame.y + frame.h - ratio(amount, mini, maxi === mini ? mini + 1 : maxi) * frame.h;
  const thickness = (vertical ? frame.h : frame.w) * 0.5;
  const cross = vertical ? frame.y + (frame.h - thickness) / 2 : frame.x + (frame.w - thickness) / 2;
  const from = at(reference), to = at(reference + variance);
  if (vertical) box(ctx, Math.min(from, to), cross, Math.abs(to - from), thickness, variance >= 0 ? positive : negative);
  else box(ctx, cross, Math.min(from, to), thickness, Math.abs(from - to), variance >= 0 ? positive : negative);
  if (vertical) line(ctx, from, cross - 2, from, cross + thickness + 2, '#404040', 1);
  else line(ctx, cross - 2, from, cross + thickness + 2, from, '#404040', 1);
  const mark = optional(value.mark);
  if (mark !== undefined) {
    if (vertical) line(ctx, at(mark), cross - 4, at(mark), cross + thickness + 4, '#000000', 1);
    else line(ctx, cross - 4, at(mark), cross + thickness + 4, at(mark), '#000000', 1);
  }
  const tick = optional(value.tickUnit);
  if (tick !== undefined && tick > 0) {
    for (let amount = mini; amount <= maxi; amount += tick) {
      if (vertical) line(ctx, at(amount), cross - 1, at(amount), cross + thickness + 1, '#d9d9d9', 1);
      else line(ctx, cross - 1, at(amount), cross + thickness + 1, at(amount), '#d9d9d9', 1);
    }
  }
}

function drawLollipop(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const planned = flat(value.plannedValue), actual = flat(value.actualValue);
  const count = Math.min(planned.length, actual.length);
  if (!count) return;
  const span = range([...planned, ...actual]);
  const mini = optional(value.mini) ?? span.min;
  const maxi = optional(value.maxi) ?? span.max;
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const slot = frame.h / count;
  const positive = value.colorPositive ? String(value.colorPositive) : '#70ad47';
  const negative = value.colorNegative ? String(value.colorNegative) : DEFAULT_NEGATIVE;
  const stem = value.lollipopHeaderColor ? String(value.lollipopHeaderColor) : '#a6a6a6';
  const zero = number(value.reference, 0);
  const at = (amount: number) => frame.x + ratio(amount, mini, maxi === mini ? mini + 1 : maxi) * frame.w;
  const axis = at(boolean(value.absolute) ? 0 : zero);
  for (let i = 0; i < count; i++) {
    const centerY = frame.y + (i + 0.5) * slot;
    const plannedValue = planned[i], actualValue = actual[i];
    if (plannedValue !== null) line(ctx, axis, centerY, at(plannedValue), centerY, stem, 2);
    if (actualValue === null) continue;
    const difference = plannedValue === null ? 0 : actualValue - plannedValue;
    const color = boolean(value.absolute) ? positive : difference >= 0 ? positive : negative;
    if (plannedValue !== null && difference !== 0)
      line(ctx, at(plannedValue), centerY, at(actualValue), centerY, color, 1);
    ctx.fillStyle = resolveColor(color);
    ctx.beginPath();
    ctx.arc(at(actualValue), centerY, Math.min(3, slot / 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBoxPlot(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const points = flat(value.points).filter((n): n is number => n !== null);
  if (points.length < 2) return;
  const vertical = boolean(value.vertical);
  const frame = areaOf(area.x, area.y, area.w, area.h, 3);
  // The trial computes the quartiles, the 2%/98% limits and the standard
  // deviation into the cell value; the box class selects the whisker ends.
  const kind = String(value.boxPlotClass ?? '5ns');
  const sorted = [...points].sort((a, b) => a - b);
  const q1 = optional(value.q1) ?? sorted[0]!;
  const q3 = optional(value.q3) ?? sorted[sorted.length - 1]!;
  const median = optional(value.median) ?? sorted[Math.floor((sorted.length - 1) / 2)]!;
  const low = kind === '5ns' ? sorted[0]! : optional(value.perc02) ?? sorted[0]!;
  const high = kind === '5ns' ? sorted[sorted.length - 1]! : optional(value.perc98) ?? sorted[sorted.length - 1]!;
  const mini = optional(value.scaleStart) ?? low;
  const maxi = optional(value.scaleEnd) ?? high;
  const at = (amount: number) => vertical
    ? frame.x + ratio(amount, mini, maxi === mini ? mini + 1 : maxi) * frame.w
    : frame.y + frame.h - ratio(amount, mini, maxi === mini ? mini + 1 : maxi) * frame.h;
  const colors = schemeColors(value.colorScheme);
  const boxColor = colors[0] ?? DEFAULT_SERIES;
  const ink = colors[1] ?? '#000000';
  const thickness = (vertical ? frame.h : frame.w) * 0.45;
  const cross = vertical ? frame.y + (frame.h - thickness) / 2 : frame.x + (frame.w - thickness) / 2;
  if (value.acceptableStart !== null && value.acceptableStart !== undefined && value.acceptableEnd !== null && value.acceptableEnd !== undefined) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    const start = number(value.acceptableStart), end = number(value.acceptableEnd);
    if (vertical) box(ctx, at(start), frame.y, at(end) - at(start), frame.h, '#70ad47');
    else box(ctx, frame.x, at(end), frame.w, at(start) - at(end), '#70ad47');
    ctx.restore();
  }
  if (vertical) {
    line(ctx, at(low), at(median), at(q1), at(median), ink, 1);
    line(ctx, at(q3), at(median), at(high), at(median), ink, 1);
    line(ctx, at(low), at(median) - thickness / 4, at(low), at(median) + thickness / 4, ink, 1);
    line(ctx, at(high), at(median) - thickness / 4, at(high), at(median) + thickness / 4, ink, 1);
    ctx.save();
    ctx.globalAlpha = number(value.style) === 1 ? 1 : 0.35;
    box(ctx, at(q1), cross, at(q3) - at(q1), thickness, boxColor);
    ctx.restore();
    ctx.strokeStyle = resolveColor(ink); ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(at(q1)) + 0.5, Math.round(cross) + 0.5, Math.max(1, Math.round(at(q3) - at(q1))), Math.round(thickness));
    line(ctx, at(median), cross, at(median), cross + thickness, '#ffffff', 2);
    if (boolean(value.showAverage)) {
      const average = points.reduce((sum, n) => sum + n, 0) / points.length;
      const cx = at(average), cy = cross + thickness / 2, radius = Math.min(4, thickness / 3);
      ctx.strokeStyle = resolveColor('#000000'); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy); ctx.lineTo(cx, cy - radius); ctx.lineTo(cx + radius, cy); ctx.lineTo(cx, cy + radius); ctx.closePath();
      ctx.stroke();
    }
  } else {
    line(ctx, at(q1), at(median), at(low), at(median), ink, 1);
    line(ctx, at(high), at(median), at(q3), at(median), ink, 1);
    line(ctx, at(low), cross - thickness / 4, at(low), cross + thickness / 4, ink, 1);
    line(ctx, at(high), cross - thickness / 4, at(high), cross + thickness / 4, ink, 1);
    ctx.save();
    ctx.globalAlpha = number(value.style) === 1 ? 1 : 0.35;
    box(ctx, cross, at(q3), thickness, at(q1) - at(q3), boxColor);
    ctx.restore();
    ctx.strokeStyle = resolveColor(ink); ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(cross) + 0.5, Math.round(at(q3)) + 0.5, Math.round(thickness), Math.max(1, Math.round(at(q1) - at(q3))));
    line(ctx, cross, at(median), cross + thickness, at(median), '#ffffff', 2);
    if (boolean(value.showAverage)) {
      const average = points.reduce((sum, n) => sum + n, 0) / points.length;
      const cx = cross + thickness / 2, cy = at(average), radius = Math.min(4, thickness / 3);
      ctx.strokeStyle = resolveColor('#000000'); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy); ctx.lineTo(cx, cy - radius); ctx.lineTo(cx + radius, cy); ctx.lineTo(cx, cy + radius); ctx.closePath();
      ctx.stroke();
    }
  }
}

function drawCascade(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const values = flat(value.points).filter((n): n is number => n !== null);
  if (!values.length) return;
  const vertical = boolean(value.vertical);
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const pointIndex = optional(value.pointIndex) ?? -1;
  const running: number[] = [];
  let cursor = 0;
  values.forEach((item, index) => {
    if (index + 1 === pointIndex) running.push(item);
    else {
      cursor += item;
      running.push(cursor);
    }
  });
  const minimum = optional(value.minimum) ?? Math.min(0, ...running);
  const maximum = optional(value.maximum) ?? Math.max(...running);
  const positive = value.colorPositive ? String(value.colorPositive) : '#70ad47';
  const negative = value.colorNegative ? String(value.colorNegative) : DEFAULT_NEGATIVE;
  const totalColor = value.colorTotal ? String(value.colorTotal) : '#262626';
  const at = (amount: number) => vertical
    ? frame.y + frame.h - ratio(amount, minimum, maximum === minimum ? minimum + 1 : maximum) * frame.h
    : frame.x + ratio(amount, minimum, maximum === minimum ? minimum + 1 : maximum) * frame.w;
  const slot = (vertical ? frame.w : frame.h) / values.length;
  values.forEach((item, index) => {
    const isTotal = index + 1 === pointIndex;
    const start = isTotal ? 0 : running[index - 1] ?? 0;
    const end = isTotal ? item : running[index]!;
    const color = isTotal ? totalColor : item >= 0 ? positive : negative;
    if (vertical) {
      const x = frame.x + index * slot + slot * 0.2;
      box(ctx, x, Math.max(at(start), at(end)), slot * 0.6, Math.max(1, Math.abs(at(end) - at(start))), color);
    } else {
      const y = frame.y + index * slot + slot * 0.2;
      box(ctx, Math.min(at(start), at(end)), y, Math.max(1, Math.abs(at(end) - at(start))), slot * 0.6, color);
    }
  });
}

function drawPareto(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const values = flat(value.points).filter((n): n is number => n !== null);
  if (!values.length) return;
  const vertical = boolean(value.vertical, true);
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const colors = schemeColors(value.colorRange);
  const slot = (vertical ? frame.w : frame.h) / values.length;
  const barSize = optional(value.barSize) ?? 0.7;
  const max = Math.max(1, ...values.map(Math.abs));
  const highlight = optional(value.highlightPosition) ?? -1;
  values.forEach((item, index) => {
    const color = colors[index % Math.max(1, colors.length)] || ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5'][index % 5];
    const length = (Math.abs(item) / max) * (vertical ? frame.h : frame.w);
    if (vertical) box(ctx, frame.x + index * slot + slot * (1 - barSize) / 2, frame.y + frame.h - length, slot * barSize, length, index === highlight && value.color ? String(value.color) : color);
    else box(ctx, frame.x, frame.y + index * slot + slot * (1 - barSize) / 2, length, slot * barSize, color);
  });
  // Cumulative share of the total, drawn across the bars.
  const total = values.reduce((sum, item) => sum + Math.abs(item), 0) || 1;
  let running = 0;
  const fractions = values.map((item) => (running += Math.abs(item)) / total);
  ctx.strokeStyle = resolveColor(value.labelColor ? String(value.labelColor) : '#595959');
  ctx.lineWidth = 1;
  ctx.beginPath();
  fractions.forEach((fraction, index) => {
    const along = vertical ? frame.x + (index + 0.5) * slot : frame.y + (index + 0.5) * slot;
    const across = vertical ? frame.y + frame.h - fraction * frame.h : frame.x + fraction * frame.w;
    if (index === 0) ctx.moveTo(along, across); else ctx.lineTo(along, across);
  });
  ctx.stroke();
  fractions.forEach((fraction, index) => {
    const along = vertical ? frame.x + (index + 0.5) * slot : frame.y + (index + 0.5) * slot;
    const across = vertical ? frame.y + frame.h - fraction * frame.h : frame.x + fraction * frame.w;
    ctx.fillStyle = resolveColor('#595959');
    ctx.beginPath();
    ctx.arc(along, across, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });
  const targets = [[value.target, value.targetColor ?? '#c00000'], [value.target2, value.target2Color ?? '#70ad47']] as const;
  for (const [target, color] of targets) {
    const amount = optional(target);
    if (amount === undefined) continue;
    const fraction = amount > 1 ? amount / total : amount;
    const across = vertical ? frame.y + frame.h - fraction * frame.h : frame.x + fraction * frame.w;
    if (vertical) line(ctx, frame.x, across, frame.x + frame.w, across, String(color), 1);
    else line(ctx, across, frame.y, across, frame.y + frame.h, String(color), 1);
  }
}

/** MONTHSPARKLINE: a week-by-week calendar grid coloured by the day values. */
function drawMonth(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const year = number(value.year), month = number(value.month) - 1;
  const days = new Date(year, month + 1, 0).getDate();
  const values = flat(value.values);
  if (!values.length) return;
  const frame = areaOf(area.x, area.y, area.w, area.h, 1);
  const size = Math.min(frame.w / 7, frame.h / Math.ceil(days / 7));
  const emptyColor = value.emptyColor === null || value.emptyColor === undefined ? undefined : String(value.emptyColor);
  const extra = schemeColors(value.colorRange);
  const palette = extra.length
    ? extra
    : [value.startColor ?? '#deebf7', value.middleColor ?? '#9dc3e6', value.endColor ?? '#2171b5'].map(String);
  const numeric = values.filter((n): n is number => n !== null);
  const min = numeric.length ? Math.min(...numeric) : 0, max = numeric.length ? Math.max(...numeric) : 1;
  for (let day = 0; day < days; day++) {
    const x = frame.x + (day % 7) * size, y = frame.y + Math.floor(day / 7) * size;
    const amount = values[day];
    if (amount === null || amount === undefined) {
      if (emptyColor) box(ctx, x, y, size - 1, size - 1, emptyColor);
      continue;
    }
    const position = ratio(amount, min, max === min ? min + 1 : max);
    const color = palette[Math.min(palette.length - 1, Math.floor(position * (palette.length - 1) + 0.5))];
    box(ctx, x, y, size - 1, size - 1, color);
  }
}

/** YEARSPARKLINE: one thin bar per day across the cell, shaded by its value. */
function drawYear(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const year = number(value.year);
  const days = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
  const values = flat(value.values);
  if (!values.length) return;
  const frame = areaOf(area.x, area.y, area.w, area.h, 1);
  const numeric = values.filter((n): n is number => n !== null);
  const min = Math.min(0, ...numeric), max = Math.max(1, ...numeric);
  const scale = schemeColors(value.colorRange);
  const colors = scale.length
    ? scale
    : [value.startColor ?? '#c7e3f5', value.middleColor ?? '#6baed6', value.endColor ?? '#08519c'].map(String);
  const emptyColor = value.emptyColor === null || value.emptyColor === undefined ? undefined : String(value.emptyColor);
  const slot = frame.w / days;
  for (let day = 0; day < days; day++) {
    const amount = values[day];
    const x = frame.x + day * slot;
    if (amount === null || amount === undefined) {
      if (emptyColor) box(ctx, x, frame.y + frame.h * 0.9, Math.max(1, slot - 0.4), frame.h * 0.1, emptyColor);
      continue;
    }
    const position = ratio(amount, min, max === min ? max + 1 : max);
    const color = colors[Math.min(colors.length - 1, Math.max(0, Math.round(position * (colors.length - 1))))];
    const height = Math.max(1, frame.h * (0.15 + 0.85 * position));
    box(ctx, x, frame.y + frame.h - height, Math.max(1, slot - 0.4), height, color);
  }
}

function drawProgress(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const fraction = Math.max(0, Math.min(1, number(value.progress)));
  const mode = number(value.mode, 0);
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const barColor = value.barColor ? String(value.barColor) : DEFAULT_SERIES;
  const bandColor = value.bandColor ? String(value.bandColor) : '#d9d9d9';
  if (mode === 1) {
    const radius = Math.min(frame.w, frame.h) / 2;
    const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
    ctx.fillStyle = resolveColor(bandColor);
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = resolveColor(barColor);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    return;
  }
  const thickness = Math.min(frame.h * 0.45, 8);
  const y = frame.y + (frame.h - thickness) / 2;
  box(ctx, frame.x, y, frame.w, thickness, bandColor);
  box(ctx, frame.x, y, frame.w * fraction, thickness, barColor);
}

function drawGauge(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const option = (key: string): { value: number; label: unknown } => {
    const entry = value[key] as Record_ | undefined;
    return { value: number(entry?.value), label: entry?.label };
  };
  const min = option('minValueOption'), max = option('maxValueOption');
  const current = option('currentValueOption'), target = option('targetValueOption');
  const frame = areaOf(area.x, area.y, area.w, area.h);
  // The trial's own defaults are a -90..90 degree sweep (a right-facing half circle).
  const minAngle = number(value.minAngle, -90), maxAngle = number(value.maxAngle, 90);
  const radiusRatio = optional(value.radiusRatio) ?? 0;
  const radius = radiusRatio > 0
    ? Math.min(frame.w, frame.h) * radiusRatio
    : Math.min(frame.w * 0.9, frame.h * 2);
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h * (minAngle < 0 && maxAngle > 0 ? 0.5 : 1);
  const from = (minAngle - 90) * Math.PI / 180, to = (maxAngle - 90) * Math.PI / 180;
  const scale = max.value === min.value ? 1 : max.value - min.value;
  const angle = (amount: number) => from + (amount - min.value) / scale * (to - from);
  const weight = Math.max(3, radius * 0.25);
  const arc = (start: number, end: number, color: string) => {
    ctx.strokeStyle = resolveColor(color);
    ctx.lineWidth = weight;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle(start), angle(end));
    ctx.stroke();
  };
  const ranges = (Array.isArray(value.ranges) ? value.ranges : []) as Record_[];
  if (ranges.length) {
    for (const entry of ranges) arc(number(entry.start), number(entry.end), String(entry.color ?? DEFAULT_SERIES));
  } else {
    arc(min.value, (min.value + max.value) / 2, '#70ad47');
    arc((min.value + max.value) / 2, max.value, '#c00000');
  }
  ctx.strokeStyle = resolveColor('#404040');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle(current.value)) * radius, cy + Math.sin(angle(current.value)) * radius);
  ctx.stroke();
  ctx.strokeStyle = resolveColor('#000000');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(angle(target.value)) * (radius - 4), cy + Math.sin(angle(target.value)) * (radius - 4));
  ctx.lineTo(cx + Math.cos(angle(target.value)) * (radius + 4), cy + Math.sin(angle(target.value)) * (radius + 4));
  ctx.stroke();
  if (boolean(value.showLabel, true)) {
    ctx.fillStyle = resolveColor('#404040');
    ctx.textAlign = 'center';
    ctx.font = '12px Calibri, Arial, sans-serif';
    ctx.fillText(String(min.label ?? min.value), cx - radius, cy + 12);
    ctx.fillText(String(max.label ?? max.value), cx + radius, cy + 12);
    ctx.font = '16px Calibri, Arial, sans-serif';
    ctx.fillText(String(target.label ?? target.value), cx, cy - radius - 2);
    ctx.font = 'bold 22px Calibri, Arial, sans-serif';
    ctx.fillText(String(current.label ?? current.value), cx, cy + 22);
  }
}

/** HISTOGRAMSPARKLINE: the trial bins the values; the bars show the bin counts. */
function drawHistogram(ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number }): void {
  const bins = (Array.isArray(value.values) ? value.values : []) as Record_[];
  if (!bins.length) return;
  const frame = areaOf(area.x, area.y, area.w, area.h, 1);
  const counts = bins.map((bin) => number(bin.value));
  const max = Math.max(1, ...counts);
  const continuous = boolean(value.continuous, true);
  const barColor = value.barColor ? String(value.barColor) : DEFAULT_SERIES;
  const edgeColor = value.edgeColor ? String(value.edgeColor) : '#C0C0C0';
  const width = frame.w / bins.length;
  bins.forEach((bin, index) => {
    const height = Math.max(1, (counts[index]! / max) * frame.h);
    const x = frame.x + index * width;
    box(ctx, x, frame.y + frame.h - height, continuous ? width : width - 1, height, barColor);
    if (continuous) line(ctx, x, frame.y + frame.h - height, x, frame.y + frame.h, edgeColor, 1);
  });
  if (boolean(value.paintLabel)) {
    ctx.fillStyle = resolveColor(value.labelColor ? String(value.labelColor) : '#000000');
    const style = String(value.labelFontStyle ?? '9px');
    ctx.font = /\d+(\.\d+)?px/.test(style) ? style.replace(/(\d+(\.\d+)?)px/, '$1px') + ' Calibri, Arial, sans-serif' : `9px ${style}, Calibri, Arial, sans-serif`;
    ctx.textAlign = 'center';
    bins.forEach((bin, index) => ctx.fillText(String(bin.axis ?? ''), frame.x + (index + 0.5) * width, frame.y + frame.h - 2));
  }
}

/** RANGEBLOCKSPARKLINE: a bar whose length comes from the data expression. */
function drawRangeBlock(
  ctx: CanvasRenderingContext2D, value: Record_, area: { x: number; y: number; w: number; h: number },
  amounts: number[],
): void {
  const frame = areaOf(area.x, area.y, area.w, area.h);
  const thickness = Math.min(frame.h * 0.5, 10);
  const y = frame.y + (frame.h - thickness) / 2;
  box(ctx, frame.x, y, frame.w, thickness, '#d9d9d9');
  if (!amounts.length) return;
  const largest = Math.max(...amounts.map(Math.abs)) || 1;
  box(ctx, frame.x, y, frame.w * Math.max(0.02, Math.min(1, Math.abs(amounts[0]!) / largest)), thickness, DEFAULT_SERIES);
}

/**
 * Dispatch of the advanced formula sparklines to their own renderer.
 * `sheet` lets RANGEBLOCKSPARKLINE evaluate its data expression.
 */
export function drawSparklineRecord(
  ctx: CanvasRenderingContext2D, name: string, value: Record_,
  x: number, y: number, w: number, h: number,
  sheet?: unknown,
): boolean {
  const area = { x: x + 2, y: y + 2, w: Math.max(1, w - 5), h: Math.max(1, h - 5) };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w - 1, h - 1);
  ctx.clip();
  switch (name) {
    case 'SCATTERSPARKLINE': drawScatter(ctx, value, area); break;
    case 'BULLETSPARKLINE': drawBullet(ctx, value, area); break;
    case 'SPREADSPARKLINE': drawSpread(ctx, value, area); break;
    case 'STACKEDSPARKLINE': drawStacked(ctx, value, area); break;
    case 'VARISPARKLINE': drawVari(ctx, value, area); break;
    case 'LOLLIPOPVARISPARKLINE': drawLollipop(ctx, value, area); break;
    case 'BOXPLOTSPARKLINE': drawBoxPlot(ctx, value, area); break;
    case 'CASCADESPARKLINE': drawCascade(ctx, value, area); break;
    case 'PARETOSPARKLINE': drawPareto(ctx, value, area); break;
    case 'MONTHSPARKLINE': drawMonth(ctx, value, area); break;
    case 'YEARSPARKLINE': drawYear(ctx, value, area); break;
    case 'PROGRESSSPARKLINE': drawProgress(ctx, value, area); break;
    case 'GAUGEKPISPARKLINE': drawGauge(ctx, value, area); break;
    case 'HISTOGRAMSPARKLINE': drawHistogram(ctx, value, area); break;
    case 'RANGEBLOCKSPARKLINE': drawRangeBlock(ctx, value, area, rangeBlockAmounts(value, sheet)); break;
    default: ctx.restore(); return false;
  }
  ctx.restore();
  return true;
}

/** The RANGEBLOCKSPARKLINE data expression evaluated over its template range. */
function rangeBlockAmounts(value: Record_, sheet: unknown): number[] {
  const expression = typeof value.bindingObject === 'string' ? value.bindingObject : '';
  const template = value.templateRange as { row?: number; col?: number } | undefined;
  const engine = (sheet as { calcEngine?: { evaluateFormulaValue(context: unknown, formula: string, baseRow?: number, baseCol?: number): unknown } } | undefined)?.calcEngine;
  if (!expression || !engine || !sheet) return [];
  const result = engine.evaluateFormulaValue(sheet, expression, template?.row ?? 0, template?.col ?? 0);
  const walk = (item: unknown): number[] =>
    Array.isArray(item) ? item.flatMap(walk) : [typeof item === 'number' && Number.isFinite(item) ? item : 0];
  return walk(result);
}
export type { JsonRecord };
