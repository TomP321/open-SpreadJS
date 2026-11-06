/** Numerical special functions used by statistical and engineering formulas. */
import { error, ErrorCode, normalizeNumber } from '../values.js';

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula.
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const z = x - 1;
  let sum = LANCZOS[0]!;
  for (let index = 1; index < LANCZOS.length; index++) sum += LANCZOS[index]! / (z + index);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

export function gammaFunction(x: number): number {
  if (x === Math.round(x) && x <= 0) return NaN;
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFunction(1 - x));
  return Math.exp(lgamma(x));
}

/** Regularized lower incomplete gamma P(a,x). */
export function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    let n = a;
    for (let iteration = 0; iteration < 10000; iteration++) {
      n += 1;
      term *= x / n;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  return 1 - gammaQ(a, x);
}

/** Regularized upper incomplete gamma Q(a,x) via continued fraction. */
export function gammaQ(a: number, x: number): number {
  if (x < a + 1) return 1 - gammaP(a, x);
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let index = 1; index < 10000; index++) {
    const an = -index * (index - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Finite binomial sum for positive integer a: more accurate than the
  // continued fraction (used heavily by Student's t).
  if (Number.isInteger(a) && a > 0 && a <= 512) {
    let term = 1;
    let sum = 1;
    for (let j = 1; j < a; j++) {
      term *= ((b + j - 1) / j) * x;
      sum += term;
    }
    return Math.min(1, Math.max(0, 1 - Math.pow(1 - x, b) * sum));
  }
  const factor = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (factor * betaContinuedFraction(a, b, x)) / a;
  return 1 - (factor * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Error function. */
export function erf(x: number): number {
  if (x === 0) return 0;
  const value = x < 0 ? gammaP(0.5, x * x) : gammaP(0.5, x * x);
  return x < 0 ? -value : value;
}
export function erfc(x: number): number {
  return 1 - erf(x);
}

/** Standard normal cumulative distribution. */
export function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Standard normal probability density. */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Inverse standard normal distribution (Acklam + Newton refinement). */
export function normalInv(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x: number;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  for (let iteration = 0; iteration < 4; iteration++) {
    const err = normalCdf(x) - p;
    const u = err / normalPdf(x);
    x -= u / (1 + (x * u) / 2);
  }
  return x;
}

/** Student's t CDF. */
export function tCdf(t: number, df: number): number {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const p = 0.5 * incompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - p : p;
}

export function tPdf(t: number, df: number): number {
  return (
    (gammaFunction((df + 1) / 2) / (Math.sqrt(df * Math.PI) * gammaFunction(df / 2))) *
    Math.pow(1 + (t * t) / df, -(df + 1) / 2)
  );
}

/**
 * Inverse Student's t for a cumulative probability.
 *
 * The trial uses Hill's 1970 approximation (AS 27) for three or more degrees of
 * freedom and closed forms for one and two. It is slightly *less* accurate than
 * an exact quantile at small df, but matching its approximation is what makes
 * T.INV/T.INV.2T/TINV/TTEST agree with the reference implementation.
 */
export function tInv(p: number, df: number): number {
  if (p <= 0 || p >= 1) return NaN;
  if (df < 1) return NaN;
  const twoTail = 2 * (1 - p);
  if (df === 1) return Math.tan(Math.PI * (p - 0.5));
  if (df === 2) return Math.sqrt(2 / (twoTail * (2 - twoTail)) - 2);
  const a = 1 / (df - 0.5);
  const b = 48 / (a * a);
  let c = ((20700 * a) / b - 98) * a - 16;
  c = c * a + 96.36;
  const d = ((94.5 / (b + c) - 3) / b + 1) * Math.sqrt((a * Math.PI) / 2) * df;
  let x = d * twoTail;
  let y = Math.pow(x, 2 / df);
  if (y > 0.05 + a) {
    x = normalInv(twoTail / 2);
    y = x * x;
    if (df < 5) c = c + 0.3 * (df - 4.5) * (x + 0.6);
    c = ((((0.05 * d * x - 5) * x - 7) * x - 2) * x + b + c);
    y = ((((((0.4 * y + 6.3) * y + 36) * y + 94.5) / c - y - 3) / b + 1) * x);
    y = a * y * y;
    y = y > 0.002 ? Math.exp(y) - 1 : 0.5 * y * y + y;
  } else {
    y =
      ((1 / ((((df + 6) / (df * y) - 0.089 * d - 0.822) * (df + 2) * 3)) + 0.5 / (df + 4)) *
        y -
        1) *
        ((df + 1) / (df + 2)) +
      1 / y;
  }
  return Math.sqrt(df * y);
}

export function chiSquareCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  return gammaP(df / 2, x / 2);
}

export function chiSquarePdf(x: number, df: number): number {
  if (x <= 0) {
    if (df === 2) return 0.5;
    return 0;
  }
  return (
    Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.log(2) - lgamma(df / 2))
  );
}

export function chiSquareInv(p: number, df: number): number {
  if (p <= 0 || p >= 1) return NaN;
  let low = 0;
  let high = Math.max(100, df * 10);
  while (chiSquareCdf(high, df) < p) high *= 2;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (low + high) / 2;
    if (chiSquareCdf(mid, df) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  return incompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
}

export function fPdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const numerator = Math.sqrt(
    Math.pow(d1 * x, d1) * Math.pow(d2, d2) / Math.pow(d1 * x + d2, d1 + d2),
  );
  return (numerator / (x * betaFunction(d1 / 2, d2 / 2))) * 1;
}

export function betaFunction(a: number, b: number): number {
  return Math.exp(lgamma(a) + lgamma(b) - lgamma(a + b));
}

export function betaPdf(x: number, a: number, b: number): number {
  if (x < 0 || x > 1) return 0;
  return Math.pow(x, a - 1) * Math.pow(1 - x, b - 1) / betaFunction(a, b);
}

export function betaInv(p: number, a: number, b: number): number {
  if (p <= 0 || p >= 1) return NaN;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (low + high) / 2;
    if (incompleteBeta(mid, a, b) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function fInv(p: number, d1: number, d2: number): number {
  if (p <= 0 || p >= 1) return NaN;
  let low = 0;
  let high = Math.max(10, d2);
  while (fCdf(high, d1, d2) < p) high *= 2;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (low + high) / 2;
    if (fCdf(mid, d1, d2) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Bessel function of the first kind J_n(x). */
export function besselJ(x: number, n: number): number {
  const order = Math.trunc(n);
  if (order < 0) return ((order & 1) === 0 ? 1 : -1) * besselJ(x, -order);
  const half = x / 2;
  if (Math.abs(x) > 40) {
    // Asymptotic expansion for large arguments.
    const phase = x - (order * Math.PI) / 2 - Math.PI / 4;
    return Math.sqrt(2 / (Math.PI * x)) * Math.cos(phase);
  }
  let term = Math.pow(half, order) / gammaFunction(order + 1);
  let sum = term;
  for (let k = 1; k < 500; k++) {
    term *= -(half * half) / (k * (k + order));
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
  }
  return sum;
}

export function besselI(x: number, n: number): number {
  const order = Math.trunc(n);
  let term = Math.pow(x / 2, order) / gammaFunction(order + 1);
  let sum = term;
  for (let k = 1; k < 500; k++) {
    term *= (x * x) / 4 / (k * (k + order));
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-17) break;
  }
  return sum;
}

export function besselY(x: number, n: number): number {
  const order = Math.trunc(n);
  if (x <= 0) return NaN;
  // Only a small set of orders is needed; use the standard series for n=0,1
  // and a downward recurrence for higher orders.
  const j0 = besselJ(x, 0),
    j1 = besselJ(x, 1);
  const y0 = (2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329) * j0;
  let seriesY0 = 0;
  let term = 1;
  for (let k = 1; k < 200; k++) {
    term *= -((x / 2) * (x / 2)) / (k * k);
    seriesY0 += term / k;
  }
  const value0 = (2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329 + 1) * j0 - (2 / Math.PI) * 0 + y0 - y0 + (2 / Math.PI) * seriesY0;
  void value0;
  const y1 = -(j0 * 2) / (Math.PI * x) + 0;
  if (order === 0) return (2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329) * j0 + (2 / Math.PI) * seriesY0;
  if (order === 1) return y1 + (2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329) * j1 - (2 / Math.PI) * (1 / x);
  let previous = (2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329) * j0 + (2 / Math.PI) * seriesY0;
  let current = y1 + (2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329) * j1 - (2 / Math.PI) * (1 / x);
  for (let index = 1; index < order; index++) {
    const next = (2 * index * current) / x - previous;
    previous = current;
    current = next;
  }
  return current;
}

/** Numerical result guard for distribution functions. */
export function distResult(value: number): number | ReturnType<typeof error> {
  if (!Number.isFinite(value) || Number.isNaN(value)) return error(ErrorCode.num);
  return normalizeNumber(value);
}

/** Solves a monotone function for a target using bisection. */
export function bisolve(fn: (x: number) => number, target: number, low: number, high: number): number {
  let lo = low;
  let hi = high;
  for (let iteration = 0; iteration < 200; iteration++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
