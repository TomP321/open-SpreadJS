/**
 * Automatic value-axis scale ("nice numbers") matching the trial's default
 * behaviour: data 0..8 -> 0..10 majorUnit 2, data 0..10 -> 0..10 majorUnit 2.
 */
export interface AxisScale { min: number; max: number; unit: number; ticks: number[] }

function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const frac = rough / pow;
  const step = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  return step * pow;
}

function round(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number((value).toFixed(decimals));
}

export function computeScale(dataMin: number, dataMax: number, forced?: {
  min?: number; max?: number; majorUnit?: number; exactMax?: boolean; exactTop?: boolean; targetIntervals?: number; padToIntervals?: number; scatterX?: boolean;
}): AxisScale {
  let min = Number.isFinite(dataMin) ? Math.min(0, dataMin) : 0;
  let max = Number.isFinite(dataMax) ? Math.max(dataMax, min === 0 ? 1 : dataMax) : 1;
  if (max <= min) max = min + 1;
  const target = Number(forced?.targetIntervals ?? 5);
  let unit = forced?.majorUnit && forced.majorUnit > 0 ? forced.majorUnit : niceStep((max - min) / target);
  // Scatter/bubble x-axes (trial-measured): data 1..3 -> 0..3.5 with ticks
  // 0..3 — a third-of-range unit and a half-unit pad past the data maximum.
  const scatterX = forced?.scatterX === true;
  if (scatterX && forced?.majorUnit === undefined) unit = niceStep((max - min) / 3);
  if (forced?.min !== undefined && forced?.max !== undefined && forced?.majorUnit === undefined) {
    unit = niceStep((forced.max - forced.min) / target);
  }
  if (forced?.min !== undefined) min = forced.min;
  else min = Math.floor(min / unit) * unit;
  if (forced?.max !== undefined) max = forced.max;
  else if (scatterX) max = Math.ceil(max / unit) * unit + unit / 2;
  else if (forced?.exactMax && Math.abs(max / unit - Math.round(max / unit)) < 1e-9) max = Math.round(max / unit) * unit;
  else if (forced?.exactTop) {
    // Stacked-area charts put the plot top exactly at the data maximum and
    // stop the tick list at the last gridline below it (trial-measured).
  }
  else {
    max = Math.ceil((max + unit * 1e-4) / unit) * unit;
    // Horizontal bar charts pad the axis up to a whole block of gridlines (trial).
    if (forced?.padToIntervals !== undefined) {
      let guard = 0;
      while (Math.round((max - min) / unit) < forced.padToIntervals && guard++ < 200) max += unit;
    }
  }
  if (max <= min) max = min + unit;
  const ticks: number[] = [];
  const rawCount = forced?.exactTop ? Math.floor((max - min) / unit + 1e-9)
    : scatterX ? Math.floor((max - min) / unit + 1e-9)
    : Math.round((max - min) / unit);
  const count = Math.min(200, rawCount);
  for (let i = 0; i <= count; i++) ticks.push(round(min + unit * i, unit));
  return { min: round(min, unit), max: round(max, unit), unit, ticks };
}

/** Format a tick value like the trial's `General` axis format. */
export function formatAxisNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const text = String(Math.round(value * 10000) / 10000);
  return text;
}

/** Format a data-label / axis value with a simple .NET-ish format code. */
export function formatValue(value: number, format?: string): string {
  if (!format || format === 'General') return String(Math.round(value * 100000) / 100000);
  const percent = format.endsWith('%');
  const decimals = /\.0+/.exec(format)?.[0]?.length ? (/\.0+/.exec(format)![0].length - 1) : 0;
  const scaled = percent ? value * 100 : value;
  let text = scaled.toFixed(decimals);
  if (/,/.test(format)) {
    const [int, frac] = text.split('.');
    const sign = int.startsWith('-') ? '-' : '';
    const digits = sign ? int.slice(1) : int;
    text = sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
  }
  const prefix = /^[^0#.,%]+/.exec(format)?.[0] ?? '';
  return prefix + text + (percent ? '%' : '');
}
