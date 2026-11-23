import { describe, expect, it } from 'vitest';
import {
  TRENDLINE_TYPE,
  linearFit,
  polynomialFit,
  movingAverage,
  evalPolynomial,
  fitTrendline,
  formatCoefficient,
} from '../src/features/charts/trendlines.js';

// x = 1..5, y = 2,4,6,8,10 is a perfect line y = 2x.
const xs = [1, 2, 3, 4, 5];

function approx(value: number | null | undefined, expected: number, tol = 1e-6): void {
  expect(value).not.toBeNull();
  expect(value as number).toBeCloseTo(expected, Math.max(6, -Math.log10(tol)));
}

describe('linearFit', () => {
  it('fits an exact straight line', () => {
    const fit = linearFit(xs, [2, 4, 6, 8, 10]);
    expect(fit).not.toBeNull();
    approx(fit!.m, 2);
    approx(fit!.b, 0);
  });

  it('least-squares fit on a noisy line', () => {
    const fit = linearFit(xs, [2, 4, 5, 8, 7]);
    expect(fit).not.toBeNull();
    // m = 1.4, b = 1 (closed form: m = (5*92 - 15*26) / (5*55 - 15^2))
    approx(fit!.m, 1.4);
    approx(fit!.b, 1);
  });

  it('pins the intercept and refits the slope', () => {
    const fit = linearFit(xs, [2, 4, 6, 8, 10], 3);
    approx(fit!.b, 3);
    // slope through (0,3) minimising squares: m = sum x(y-3) / sum x^2
    approx(fit!.m, (1 * -1 + 2 * 1 + 3 * 3 + 4 * 5 + 5 * 7) / (1 + 4 + 9 + 16 + 25));
  });

  it('returns null for fewer than two points (free intercept)', () => {
    expect(linearFit([1], [2])).toBeNull();
    expect(linearFit([], [])).toBeNull();
  });
});

describe('polynomialFit', () => {
  it('recovers a quadratic exactly', () => {
    const ys = xs.map(x => 3 - 2 * x + 0.5 * x * x);
    const coeffs = polynomialFit(xs, ys, 2);
    expect(coeffs).not.toBeNull();
    approx(coeffs![0], 3, 1e-4);
    approx(coeffs![1], -2, 1e-4);
    approx(coeffs![2], 0.5, 1e-4);
    approx(evalPolynomial(coeffs!, 10), 3 - 20 + 50, 1e-3);
  });

  it('recovers a cubic exactly', () => {
    const ys = xs.map(x => 1 + x - x * x + 2 * x ** 3);
    const coeffs = polynomialFit(xs, ys, 3);
    approx(evalPolynomial(coeffs!, 7), 1 + 7 - 49 + 2 * 343, 1e-2);
  });

  it('clamps the degree to the 2..6 spreadsheet range', () => {
    const coeffs = polynomialFit(xs, xs.map(x => x * x), 20);
    expect(coeffs!.length).toBeLessThanOrEqual(7);
  });

  it('falls back to a line when there are too few points', () => {
    const coeffs = polynomialFit([1, 2], [2, 4], 5);
    expect(coeffs).toEqual([0, 2]); // y = 2x
  });
});

describe('movingAverage', () => {
  it('averages a centred window clipped at the ends', () => {
    const out = movingAverage([2, 4, 6, 8, 10], 3);
    expect(out).toEqual([3, 4, 6, 8, 9]);
  });
  it('period 1 is the identity', () => {
    expect(movingAverage([5, 6, 7], 1)).toEqual([5, 6, 7]);
  });
  it('period 4 uses an asymmetric centred window', () => {
    const out = movingAverage([1, 2, 3, 4, 5], 4);
    // before=1 after=2 -> [1+2+3]/3, [1..4]/4, [2..5]/4, [3+4+5]/3, [4+5]/2
    approx(out[0]!, 2);
    approx(out[1]!, 2.5);
    approx(out[2]!, 3.5);
    approx(out[3]!, 4);
    approx(out[4]!, 4.5);
  });
  it('skips null points', () => {
    const out = movingAverage([2, null, 6], 3);
    // window radius 1: i0 = mean(2) = 2, i1 = mean(2,6) = 4 (null skipped), i2 = mean(6) = 6
    approx(out[1]!, 4);
    expect(out[0]).toBe(2);
    expect(out[2]).toBe(6);
  });
});

describe('fitTrendline families', () => {
  it('linear: predicts and reports equation + R^2 = 1', () => {
    const fit = fitTrendline(xs, [2, 4, 6, 8, 10], { type: TRENDLINE_TYPE.linear });
    expect(fit.valid).toBe(true);
    approx(fit.predict(6), 12);
    expect(fit.equation).toBe('y = 2x');
    approx(fit.rSquared!, 1);
  });

  it('linear: formats a non-trivial equation', () => {
    const fit = fitTrendline(xs, [2, 4, 5, 8, 7], { type: TRENDLINE_TYPE.linear });
    expect(fit.equation).toBe('y = 1.4x + 1');
    expect(fit.rSquared).toBeGreaterThan(0.8);
    expect(fit.rSquared).toBeLessThan(1);
  });

  it('linear: honours a fixed intercept', () => {
    const fit = fitTrendline(xs, [2, 4, 6, 8, 10], { type: TRENDLINE_TYPE.linear, intercept: 3 });
    // m = 65/55 pinned through (0,3)
    approx(fit.predict(1), 3 + 65 / 55);
    expect(fit.equation).toContain('3');
  });

  it('exponential: fits y = c e^(b x) on 2,4,8,16,32', () => {
    const fit = fitTrendline(xs, [2, 4, 8, 16, 32], { type: TRENDLINE_TYPE.exponential });
    expect(fit.valid).toBe(true);
    approx(fit.predict(1), 2, 1e-3);
    approx(fit.predict(5), 32, 1e-2);
    approx(fit.rSquared!, 1, 1e-4);
    expect(fit.equation).toMatch(/^y = /);
  });

  it('logarithmic: fits y = c ln x + b', () => {
    const xlog = [1, 2, 3, 4, 5];
    const ylog = xlog.map(x => 2 * Math.log(x) + 1);
    const fit = fitTrendline(xlog, ylog, { type: TRENDLINE_TYPE.logarithmic });
    approx(fit.predict(Math.E), 3, 1e-3); // 2*1 + 1
    approx(fit.rSquared!, 1, 1e-4);
    expect(fit.equation).toContain('ln(x)');
  });

  it('power: fits y = c x^b', () => {
    const ypow = xs.map(x => 3 * Math.pow(x, 2));
    const fit = fitTrendline(xs, ypow, { type: TRENDLINE_TYPE.power });
    approx(fit.predict(4), 48, 1e-2);
    approx(fit.rSquared!, 1, 1e-4);
    expect(fit.equation).toContain('x^');
  });

  it('polynomial: degree 2 fits a parabola', () => {
    const yquad = xs.map(x => x * x);
    const fit = fitTrendline(xs, yquad, { type: TRENDLINE_TYPE.polynomial, order: 2 });
    approx(fit.predict(6), 36, 1e-3);
    approx(fit.rSquared!, 1, 1e-4);
  });

  it('movingAverage: exposes a per-point sequence and no R^2', () => {
    const fit = fitTrendline(xs, [2, 4, 6, 8, 10], { type: TRENDLINE_TYPE.movingAverage, period: 3 });
    expect(fit.sequence).toEqual([3, 4, 6, 8, 9]);
    expect(fit.rSquared).toBeNull();
    expect(fit.equation).toBeNull();
  });

  it('returns invalid when there is no usable data', () => {
    expect(fitTrendline([1, 2], [null, null], { type: TRENDLINE_TYPE.linear }).valid).toBe(false);
  });
});

describe('formatCoefficient', () => {
  it('trims trailing zeros', () => {
    expect(formatCoefficient(2)).toBe('2');
    expect(formatCoefficient(1.5)).toBe('1.5');
    expect(formatCoefficient(0.45)).toBe('0.45');
  });
  it('uses scientific notation for extreme magnitudes', () => {
    expect(formatCoefficient(1e7)).toMatch(/e\+0?7/);
    expect(formatCoefficient(1e-5)).toMatch(/e-0?5/);
  });
});
