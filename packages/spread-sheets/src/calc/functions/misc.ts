/** Miscellaneous math/complex functions that do not fit other modules. */
import { ErrorCode, error, normalizeNumber } from '../values.js';
import { type DefinedFunction, define } from './common.js';
import { formatComplex } from './engineering.js';

export const MISC_FUNCTIONS: DefinedFunction[] = [
  define('ACOT', 1, 1, (args) => {
    const value = args.number(0);
    if (value === 0) return Math.PI / 2;
    const result = Math.atan(1 / value);
    return normalizeNumber(result < 0 ? result + Math.PI : result);
  }),
  define('ACOTH', 1, 1, (args) => {
    const value = args.number(0);
    if (Math.abs(value) <= 1) return error(ErrorCode.num);
    return normalizeNumber(0.5 * Math.log((value + 1) / (value - 1)));
  }),
  define('IMCOT', 1, 1, (args) => {
    const text = args.text(0).trim();
    if (!text) return error(ErrorCode.num);
    const value = parseComplex(text);
    if (!value) return error(ErrorCode.num);
    const sin = { re: Math.sin(value.re) * Math.cosh(value.im), im: Math.cos(value.re) * Math.sinh(value.im) };
    const cos = { re: Math.cos(value.re) * Math.cosh(value.im), im: -Math.sin(value.re) * Math.sinh(value.im) };
    const denominator = sin.re * sin.re + sin.im * sin.im;
    if (denominator === 0) return error(ErrorCode.num);
    return formatComplex((cos.re * sin.re + cos.im * sin.im) / denominator, (cos.im * sin.re - cos.re * sin.im) / denominator, value.suffix);
  }),
  define('IMCSCH', 1, 1, (args) => {
    const text = args.text(0).trim();
    if (!text) return error(ErrorCode.num);
    const value = parseComplex(text);
    if (!value) return error(ErrorCode.num);
    const sinh = { re: Math.sinh(value.re) * Math.cos(value.im), im: Math.cosh(value.re) * Math.sin(value.im) };
    const denominator = sinh.re * sinh.re + sinh.im * sinh.im;
    if (denominator === 0) return error(ErrorCode.num);
    return formatComplex(sinh.re / denominator, -sinh.im / denominator, value.suffix);
  }),
  define('IMSECH', 1, 1, (args) => {
    const text = args.text(0).trim();
    if (!text) return error(ErrorCode.num);
    const value = parseComplex(text);
    if (!value) return error(ErrorCode.num);
    const cosh = { re: Math.cosh(value.re) * Math.cos(value.im), im: Math.sinh(value.re) * Math.sin(value.im) };
    const denominator = cosh.re * cosh.re + cosh.im * cosh.im;
    if (denominator === 0) return error(ErrorCode.num);
    return formatComplex(cosh.re / denominator, -cosh.im / denominator, value.suffix);
  }),
];

function parseComplex(text: string): { re: number; im: number; suffix: string } | undefined {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([+-]\s*(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)?([ij])$/i.exec(text);
  if (match) {
    const re = Number(match[1]);
    const imaginary = match[2] ? Number(match[2].replace(/\s+/g, '')) : 1;
    return { re, im: imaginary, suffix: match[3]!.toLowerCase() };
  }
  const pure = Number(text);
  if (!Number.isNaN(pure)) return { re: pure, im: 0, suffix: 'i' };
  return undefined;
}
