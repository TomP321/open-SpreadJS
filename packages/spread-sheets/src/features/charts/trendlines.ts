/**
 * Trendline regression maths for charts (TASK 92).
 *
 * Every least-squares family mirrors what a spreadsheet trendline does: the
 * curve is fitted on the (x, y) data, an optional intercept forces the fit
 * through (0, intercept), and the R-squared is computed as 1 - SSres/SStot.
 * The x values are the 1-based category index for category charts or the real
 * x-value for scatter/bubble (see `paint-series.ts`).
 */

export const TRENDLINE_TYPE = {
  exponential: 0,
  linear: 1,
  logarithmic: 2,
  movingAverage: 3,
  polynomial: 4,
  power: 5,
} as const;

/**
 * The trial's auto-generated trendline name (probe: `Linear(Q1)`,
 * `3period MovingAverage(Q1)` on a series named `Q1`). Stored chartSpace
 * entries carry `name` only when the user set one, so paint and the series
 * getter derive it the same way.
 */
export function autoTrendlineName(type: number, period: number | undefined, seriesName: string): string {
  const label = Number(type) === TRENDLINE_TYPE.movingAverage
    ? `${Number(period ?? 2)}period MovingAverage`
    : ['', 'Linear', 'Logarithmic', '', 'Polynomial', 'Power'][Number(type)] || 'Exponential';
  return `${label}(${seriesName || 'Series'})`;
}

export interface TrendlineOptions {
  /** TrendlineType value (see TRENDLINE_TYPE). */
  type: number;
  /** Polynomial degree (2..6); clamped for the polynomial family. */
  order?: number;
  /** Moving-average window size. */
  period?: number;
  /** Forecast beyond the last point (category units / x-range fraction). */
  forward?: number;
  /** Forecast before the first point. */
  backward?: number;
  /** When finite, forces the fit through (0, intercept). */
  intercept?: number;
}

export interface TrendlineFit {
  type: number;
  /** True when there is enough valid data to draw a curve. */
  valid: boolean;
  /** Predicted y at an arbitrary domain x (null when out of the family's domain). */
  predict: (x: number) => number | null;
  /** Per-point y for the moving-average family (null where undefined); others omit it. */
  sequence?: (number | null)[];
  /** Formatted equation, e.g. "y = 0.45x + 2"; null when not meaningful. */
  equation: string | null;
  /** R-squared as a number, null when not meaningful (moving average). */
  rSquared: number | null;
  /** Formatted R-squared value only (without the "R2 = " prefix). */
  rSquaredText: string | null;
}

/** Drop null / non-finite pairs, keeping x and y aligned. */
function clean(xs: (number | null)[], ys: (number | null)[]): { xs: number[]; ys: number[] } {
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i];
    const x = xs[i] ?? i + 1;
    if (y === null || y === undefined || !Number.isFinite(y)) continue;
    if (!Number.isFinite(x)) continue;
    cx.push(x);
    cy.push(y);
  }
  return { xs: cx, ys: cy };
}

/** Ordinary least-squares line y = m x + b; when `fixedIntercept` is finite b is pinned and only the slope is fitted. */
export function linearFit(xs: number[], ys: number[], fixedIntercept?: number): { m: number; b: number } | null {
  const n = xs.length;
  if (n === 0) return null;
  if (fixedIntercept !== undefined && Number.isFinite(fixedIntercept)) {
    // Force through (0, fixedIntercept): minimise sum (y_i - (m x_i + b))^2.
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += xs[i] * (ys[i] - fixedIntercept);
      den += xs[i] * xs[i];
    }
    const m = den !== 0 ? num / den : 0;
    return { m, b: fixedIntercept };
  }
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const m = (n * sxy - sx * sy) / den;
  const b = (sy - m * sx) / n;
  return { m, b };
}

/**
 * Solve A w = v (least-squares normal equations reduced to a square system)
 * with Gaussian elimination and partial pivoting. Returns null when singular.
 */
function solveSquare(a: number[][], v: number[]): number[] | null {
  const n = v.length;
  const m = a.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) continue;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const d = m[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / d;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  const out: number[] = [];
  for (let r = 0; r < n; r++) {
    if (Math.abs(m[r][r]) < 1e-12) return null;
    out.push(m[r][n] / m[r][r]);
  }
  return out;
}

/**
 * Polynomial least-squares fit. `order` is the degree (clamped 2..6, Excel's
 * range). Returns coefficients from the constant term up to x^order.
 */
export function polynomialFit(xs: number[], ys: number[], order: number, fixedIntercept?: number): number[] | null {
  const degree = Math.max(1, Math.min(6, Math.round(order) || 2));
  const n = xs.length;
  if (n < 2) return null;
  if (fixedIntercept !== undefined && Number.isFinite(fixedIntercept)) {
    // Subtract the pinned constant and fit the remaining (x..x^degree) terms.
    const cols = degree;
    const a: number[][] = Array.from({ length: cols }, (_, p) => Array.from({ length: cols }, (_, q) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += xs[i] ** (p + 1) * xs[i] ** (q + 1);
      return s;
    }));
    const v: number[] = Array.from({ length: cols }, (_, p) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += xs[i] ** (p + 1) * (ys[i] - fixedIntercept);
      return s;
    });
    const w = solveSquare(a, v);
    if (!w) return null;
    return [fixedIntercept, ...w];
  }
  if (n < degree + 1) {
    // Not enough points for the requested degree: fall back to a straight line.
    const line = linearFit(xs, ys);
    return line ? [line.b, line.m] : null;
  }
  const a: number[][] = Array.from({ length: degree + 1 }, (_, p) => Array.from({ length: degree + 1 }, (_, q) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[i] ** (p + q);
    return s;
  }));
  const v: number[] = Array.from({ length: degree + 1 }, (_, p) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[i] ** p * ys[i];
    return s;
  });
  return solveSquare(a, v);
}

/** Sum-of-squares R^2 for a fitted predictor. */
function rSquared(xs: number[], ys: number[], predict: (x: number) => number | null): number | null {
  const n = ys.length;
  if (n < 2) return null;
  const mean = ys.reduce((s, y) => s + y, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const p = predict(xs[i]);
    if (p === null) return null;
    ssRes += (ys[i] - p) ** 2;
    ssTot += (ys[i] - mean) ** 2;
  }
  if (ssTot === 0) return null;
  return 1 - ssRes / ssTot;
}

/** Format a regression coefficient Excel-style: up to 6 significant digits, trailing zeros trimmed, scientific for extremes. */
export function formatCoefficient(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) {
    return value.toExponential(4).replace(/e([+-])(\d)$/, 'e$10$2');
  }
  // Up to 6 significant digits, trimming trailing zeros (Excel's display form).
  const text = Number(value.toPrecision(6)).toString();
  return text;
}

/** Build " + b" / " - b" for the constant term of an equation. */
function constantTerm(b: number): string {
  return `${b < 0 ? ' - ' : ' + '}${formatCoefficient(Math.abs(b))}`;
}

/** Centred moving average (clipped at the ends), mirroring the spreadsheet convention. */
export function movingAverage(ys: (number | null)[], period: number): (number | null)[] {
  const p = Math.max(1, Math.round(period) || 1);
  const before = Math.floor((p - 1) / 2);
  const after = Math.ceil((p - 1) / 2);
  const n = ys.length;
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - before); j <= Math.min(n - 1, i + after); j++) {
      const v = ys[j];
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      sum += v;
      count++;
    }
    out.push(count > 0 ? sum / count : null);
  }
  return out;
}

/** Evaluate a polynomial coefficient list (constant-first) at x. */
export function evalPolynomial(coeffs: number[], x: number): number {
  let y = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) y = y * x + coeffs[i];
  return y;
}

/**
 * Compute the full trendline fit for one series. `xs` are already the domain
 * x values (1-based category index or the real scatter x). Returns a predictor,
 * the equation/R-squared text, and (for the moving average) a per-point sequence.
 */
export function fitTrendline(xsIn: (number | null)[], ysIn: (number | null)[], options: TrendlineOptions): TrendlineFit {
  const { xs, ys } = clean(xsIn, ysIn);
  const none: TrendlineFit = { type: options.type, valid: false, predict: () => null, equation: null, rSquared: null, rSquaredText: null };
  if (!ys.length) return none;
  const intercept = Number.isFinite(options.intercept as number) ? (options.intercept as number) : undefined;
  const type = options.type;

  if (type === TRENDLINE_TYPE.movingAverage) {
    const seq = movingAverage(ysIn, options.period ?? 2);
    // predict is unused for the moving average (drawn from the sequence).
    return { type, valid: seq.some(v => v !== null), predict: () => null, sequence: seq, equation: null, rSquared: null, rSquaredText: null };
  }

  let predict: (x: number) => number | null = () => null;
  let equation: string | null = null;

  if (type === TRENDLINE_TYPE.linear) {
    const fit = linearFit(xs, ys, intercept);
    if (!fit) return none;
    predict = (x) => fit.m * x + fit.b;
    const slope = `${formatCoefficient(fit.m)}x`;
    equation = fit.b < 0 ? `y = ${slope} - ${formatCoefficient(Math.abs(fit.b))}` : (fit.b > 0 ? `y = ${slope} + ${formatCoefficient(fit.b)}` : `y = ${slope}`);
  } else if (type === TRENDLINE_TYPE.logarithmic) {
    const tx = xs.map(x => Math.log(x));
    const fit = linearFit(tx, ys);
    if (!fit) return none;
    predict = (x) => (x > 0 ? fit.m * Math.log(x) + fit.b : null);
    equation = fit.b === 0 ? `y = ${formatCoefficient(fit.m)}ln(x)` : `y = ${formatCoefficient(fit.m)}ln(x)${constantTerm(fit.b)}`;
  } else if (type === TRENDLINE_TYPE.exponential) {
    const pos = xs.map((x, i) => ({ x, y: ys[i] })).filter(p => p.y > 0);
    if (pos.length < 2) return none;
    const fit = linearFit(pos.map(p => p.x), pos.map(p => Math.log(p.y)),
      intercept !== undefined ? Math.log(intercept) : undefined);
    if (!fit) return none;
    const c = Math.exp(fit.b);
    const b = fit.m;
    predict = (x) => c * Math.exp(b * x);
    equation = `y = ${formatCoefficient(c)}e^(${formatCoefficient(b)}x)`;
  } else if (type === TRENDLINE_TYPE.power) {
    const pos = xs.map((x, i) => ({ x, y: ys[i] })).filter(p => p.x > 0 && p.y > 0);
    if (pos.length < 2) return none;
    const fit = linearFit(pos.map(p => Math.log(p.x)), pos.map(p => Math.log(p.y)));
    if (!fit) return none;
    const c = Math.exp(fit.b);
    const b = fit.m;
    predict = (x) => (x >= 0 ? c * Math.pow(x, b) : null);
    equation = `y = ${formatCoefficient(c)}x^${formatCoefficient(b)}`;
  } else if (type === TRENDLINE_TYPE.polynomial) {
    const order = options.order ?? 2;
    const coeffs = polynomialFit(xs, ys, order, intercept);
    if (!coeffs) return none;
    predict = (x) => evalPolynomial(coeffs, x);
    const degree = Math.max(1, Math.min(6, Math.round(order) || 2));
    equation = polynomialText(coeffs, degree);
  } else {
    return none;
  }

  const r2 = rSquared(xs, ys, predict);
  return {
    type,
    valid: true,
    predict,
    equation,
    rSquared: r2,
    rSquaredText: r2 === null ? null : formatCoefficient(r2),
  };
}

/** "y = c6x^6 + ... + c1x + c0", skipping zero terms (but keeping a lone constant). */
function polynomialText(coeffs: number[], degree: number): string {
  const terms = coeffs
    .map((c, p) => ({ c, p }))
    .filter(t => t.c !== 0 && t.p <= degree)
    .reverse();
  if (!terms.length) return 'y = 0';
  let text = '';
  terms.forEach((t, index) => {
    const mag = formatCoefficient(Math.abs(t.c));
    const term = t.p === 0 ? mag : (t.p === 1 ? `${mag}x` : `${mag}x^${t.p}`);
    if (index === 0) text += t.c < 0 ? `y = -${term}` : `y = ${term}`;
    else text += `${t.c < 0 ? ' - ' : ' + '}${term}`;
  });
  return text;
}
