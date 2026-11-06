/** Engineering functions: base conversion, bit operations, complex numbers, units. */
import { Args, EvalContext } from '../evaluate.js';
import {
  ErrorCode,
  Value,
  error,
  normalizeNumber,
} from '../values.js';
import { type DefinedFunction, define } from './common.js';
import { besselI, besselJ, erf, erfc } from './special.js';

const BIN_BITS = 10;
const OCT_BITS = 30;
const HEX_BITS = 40;

function parseBase(text: string, base: number): number | undefined {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed) return undefined;
  const valid =
    base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : base === 16 ? /^[0-9A-F]+$/ : /^[0-9A-Z]+$/;
  if (!valid.test(trimmed)) return undefined;
  const value = parseInt(trimmed, base);
  return Number.isNaN(value) ? undefined : value;
}

function toBase(value: number, base: number, bits: number): string {
  if (value < 0) {
    const twoComplement = 2 ** bits + value;
    return twoComplement.toString(base).toUpperCase();
  }
  return value.toString(base).toUpperCase();
}

function fromTwosComplement(text: string, base: number, bits: number): number {
  const value = parseBase(text, base);
  if (value === undefined) return NaN;
  const maximum = 2 ** bits;
  if (text.length >= bits / Math.log2(base) && value >= maximum / 2) return value - maximum;
  return value;
}

function baseConvert(
  value: number,
  fromBase: number,
  toBaseValue: number,
  bits: number,
  places?: number,
): string | ReturnType<typeof error> {
  if (fromBase === 10) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return error(ErrorCode.num);
    const limit = 2 ** (bits - 1);
    if (value < -limit || value >= limit) return error(ErrorCode.num);
    const text = toBase(Math.trunc(value), toBaseValue, bits);
    if (places !== undefined && value >= 0) return text.padStart(places, '0');
    return text;
  }
  const text = value.toString();
  const parsed = parseBase(text, fromBase);
  if (parsed === undefined) return error(ErrorCode.num);
  return parsed.toString(10);
}

function complexParts(text: string): { re: number; im: number; suffix: string } | undefined {
  const trimmed = text.trim().replace(/\s+/g, '');
  if (!trimmed) return undefined;
  const suffixMatch = /([ij])$/i.exec(trimmed);
  const suffix = suffixMatch ? suffixMatch[1]!.toLowerCase() : 'i';
  let body = suffixMatch ? trimmed.slice(0, -1) : trimmed;
  if (!body) return { re: 0, im: 1, suffix };
  if (body.endsWith('+') || body.endsWith('-')) body += '1';
  const split = /([+-]?)([^+-]+)([+-])([^+-]+)$/.exec(body);
  if (split) {
    const re = Number(split[2]);
    const im = Number(split[4]);
    if (Number.isNaN(re) || Number.isNaN(im)) return undefined;
    return { re, im: split[3] === '-' ? -im : im, suffix };
  }
  const pure = Number(body);
  if (!Number.isNaN(pure)) {
    // A bare number is the real part unless it ends with the suffix.
    return suffixMatch ? { re: 0, im: pure, suffix } : { re: pure, im: 0, suffix };
  }
  return undefined;
}

function formatComplex(re: number, im: number, suffix = 'i'): string {
  const roundedRe = re;
  const roundedIm = im;
  if (roundedIm === 0) return String(roundedRe);
  const imaginary =
    Math.abs(roundedIm) === 1 ? suffix : `${roundedIm}${suffix}`;
  if (roundedRe === 0) return roundedIm < 0 ? `-${imaginary.replace('-', '')}` : imaginary;
  const sign = roundedIm >= 0 ? '+' : '-';
  const magnitude = Math.abs(roundedIm);
  const imagText = magnitude === 1 ? suffix : `${magnitude}${suffix}`;
  return `${roundedRe}${sign}${imagText}`;
}

function complexArg(args: Args, index: number): { re: number; im: number; suffix: string } | undefined {
  const text = args.text(index);
  return complexParts(text);
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------
const PREFIXES: Record<string, number> = {
  Y: 1e24,
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 1e1,
  d: 1e-1,
  c: 1e-2,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
  a: 1e-18,
  z: 1e-21,
  y: 1e-24,
  Yi: 1024 ** 8,
  Zi: 1024 ** 7,
  Ei: 1024 ** 6,
  Pi: 1024 ** 5,
  Ti: 1024 ** 4,
  Gi: 1024 ** 3,
  Mi: 1024 ** 2,
  ki: 1024,
};

interface UnitDef {
  dimension: string;
  factor: number;
  prefixable?: boolean;
}

const UNITS: Record<string, UnitDef> = {
  // Mass
  g: { dimension: 'mass', factor: 1, prefixable: true },
  sg: { dimension: 'mass', factor: 14593.9029372 },
  lbm: { dimension: 'mass', factor: 453.59237 },
  u: { dimension: 'mass', factor: 1.6605402e-24 },
  ozm: { dimension: 'mass', factor: 28.349523125 },
  grain: { dimension: 'mass', factor: 0.06479891 },
  cwt: { dimension: 'mass', factor: 45359.237 },
  shweight: { dimension: 'mass', factor: 45359.237 },
  uk_cwt: { dimension: 'mass', factor: 50802.34544 },
  lcwt: { dimension: 'mass', factor: 50802.34544 },
  hweight: { dimension: 'mass', factor: 50802.34544 },
  stone: { dimension: 'mass', factor: 6350.29318 },
  ton: { dimension: 'mass', factor: 907184.74 },
  uk_ton: { dimension: 'mass', factor: 1016046.9088 },
  LTON: { dimension: 'mass', factor: 1016046.9088 },
  brton: { dimension: 'mass', factor: 1016046.9088 },
  // Distance
  m: { dimension: 'length', factor: 1, prefixable: true },
  mi: { dimension: 'length', factor: 1609.344 },
  Nmi: { dimension: 'length', factor: 1852 },
  in: { dimension: 'length', factor: 0.0254 },
  ft: { dimension: 'length', factor: 0.3048 },
  yd: { dimension: 'length', factor: 0.9144 },
  ang: { dimension: 'length', factor: 1e-10 },
  ell: { dimension: 'length', factor: 1.143 },
  ly: { dimension: 'length', factor: 9.46073047258e15 },
  parsec: { dimension: 'length', factor: 3.08567758128e16 },
  pc: { dimension: 'length', factor: 3.08567758128e16 },
  Picapt: { dimension: 'length', factor: 0.000352777777778 },
  pica: { dimension: 'length', factor: 0.00423333333333 },
  Pica: { dimension: 'length', factor: 0.00423333333333 },
  survey_mi: { dimension: 'length', factor: 1609.347218694 },
  // Time
  yr: { dimension: 'time', factor: 31557600 },
  day: { dimension: 'time', factor: 86400 },
  hr: { dimension: 'time', factor: 3600 },
  mn: { dimension: 'time', factor: 60 },
  sec: { dimension: 'time', factor: 1, prefixable: true },
  d: { dimension: 'time', factor: 86400 },
  // Pressure
  Pa: { dimension: 'pressure', factor: 1, prefixable: true },
  p: { dimension: 'pressure', factor: 1 },
  atm: { dimension: 'pressure', factor: 101325 },
  at: { dimension: 'pressure', factor: 101325 },
  mmHg: { dimension: 'pressure', factor: 133.322387415 },
  psi: { dimension: 'pressure', factor: 6894.75729317 },
  Torr: { dimension: 'pressure', factor: 133.322368421 },
  // Force
  N: { dimension: 'force', factor: 1, prefixable: true },
  dyn: { dimension: 'force', factor: 1e-5, prefixable: true },
  lbf: { dimension: 'force', factor: 4.44822161526 },
  pond: { dimension: 'force', factor: 0.00980665, prefixable: true },
  // Energy
  J: { dimension: 'energy', factor: 1, prefixable: true },
  e: { dimension: 'energy', factor: 1e-7 },
  c: { dimension: 'energy', factor: 4.184 },
  cal: { dimension: 'energy', factor: 4.1868, prefixable: true },
  eV: { dimension: 'energy', factor: 1.602176634e-19, prefixable: true },
  ev: { dimension: 'energy', factor: 1.602176634e-19, prefixable: true },
  HPh: { dimension: 'energy', factor: 2684519.5377 },
  hh: { dimension: 'energy', factor: 2684519.5377 },
  Wh: { dimension: 'energy', factor: 3600, prefixable: true },
  wh: { dimension: 'energy', factor: 3600, prefixable: true },
  flb: { dimension: 'energy', factor: 1.35581794833 },
  BTU: { dimension: 'energy', factor: 1055.05585262 },
  btu: { dimension: 'energy', factor: 1055.05585262 },
  // Power
  HP: { dimension: 'power', factor: 745.699871582 },
  h: { dimension: 'power', factor: 745.699871582 },
  W: { dimension: 'power', factor: 1, prefixable: true },
  w: { dimension: 'power', factor: 1, prefixable: true },
  PS: { dimension: 'power', factor: 735.49875 },
  // Magnetism
  T: { dimension: 'magnetism', factor: 1, prefixable: true },
  ga: { dimension: 'magnetism', factor: 1e-4, prefixable: true },
  // Volume
  tsp: { dimension: 'volume', factor: 4.92892159375e-6 },
  tspm: { dimension: 'volume', factor: 5e-6 },
  tbs: { dimension: 'volume', factor: 1.47867647813e-5 },
  oz: { dimension: 'volume', factor: 2.95735295625e-5 },
  cup: { dimension: 'volume', factor: 2.365882365e-4 },
  pt: { dimension: 'volume', factor: 4.73176473e-4 },
  us_pt: { dimension: 'volume', factor: 4.73176473e-4 },
  uk_pt: { dimension: 'volume', factor: 5.6826125e-4 },
  qt: { dimension: 'volume', factor: 9.46352946e-4 },
  uk_qt: { dimension: 'volume', factor: 1.1365225e-3 },
  gal: { dimension: 'volume', factor: 3.785411784e-3 },
  uk_gal: { dimension: 'volume', factor: 4.54609e-3 },
  l: { dimension: 'volume', factor: 1e-3, prefixable: true },
  L: { dimension: 'volume', factor: 1e-3, prefixable: true },
  lt: { dimension: 'volume', factor: 1e-3, prefixable: true },
  ang3: { dimension: 'volume', factor: 1e-30, prefixable: true },
  barrel: { dimension: 'volume', factor: 0.158987294928 },
  bushel: { dimension: 'volume', factor: 0.0352390701669 },
  ft3: { dimension: 'volume', factor: 0.028316846592 },
  in3: { dimension: 'volume', factor: 1.6387064e-5 },
  m3: { dimension: 'volume', factor: 1, prefixable: true },
  mi3: { dimension: 'volume', factor: 4.16818182544e9 },
  yd3: { dimension: 'volume', factor: 0.764554857984 },
  Nmi3: { dimension: 'volume', factor: 6.352182208e9 },
  Picapt3: { dimension: 'volume', factor: 4.3900297e-8 },
  GRT: { dimension: 'volume', factor: 2.8316846592 },
  regton: { dimension: 'volume', factor: 2.8316846592 },
  // Area
  m2: { dimension: 'area', factor: 1, prefixable: true },
  mi2: { dimension: 'area', factor: 2589988.110336 },
  Nmi2: { dimension: 'area', factor: 3429904 },
  in2: { dimension: 'area', factor: 0.00064516 },
  ft2: { dimension: 'area', factor: 0.09290304 },
  yd2: { dimension: 'area', factor: 0.83612736 },
  ang2: { dimension: 'area', factor: 1e-20, prefixable: true },
  ar: { dimension: 'area', factor: 100 },
  Morgen: { dimension: 'area', factor: 2500 },
  uk_acre: { dimension: 'area', factor: 4046.8564224 },
  us_acre: { dimension: 'area', factor: 4046.87261 },
  Picapt2: { dimension: 'area', factor: 1.2445216e-7 },
  ha: { dimension: 'area', factor: 10000 },
  // Information
  bit: { dimension: 'information', factor: 1, prefixable: true },
  byte: { dimension: 'information', factor: 8, prefixable: true },
  // Speed
  'm/s': { dimension: 'speed', factor: 1 },
  'm/sec': { dimension: 'speed', factor: 1 },
  'm/hr': { dimension: 'speed', factor: 1 / 3600 },
  'm/h': { dimension: 'speed', factor: 1 / 3600 },
  mph: { dimension: 'speed', factor: 0.44704 },
  kn: { dimension: 'speed', factor: 0.514444444444 },
  admkn: { dimension: 'speed', factor: 0.514773333333 },
};

function unitFactor(unit: string): { dimension: string; factor: number } | undefined {
  if (UNITS[unit]) return { dimension: UNITS[unit]!.dimension, factor: UNITS[unit]!.factor };
  // Try a metric prefix (longest first).
  for (const prefix of ['da', 'Yi', 'Zi', 'Ei', 'Pi', 'Ti', 'Gi', 'Mi', 'ki', 'Y', 'Z', 'E', 'P', 'T', 'G', 'M', 'k', 'h', 'd', 'c', 'm', 'u', 'n', 'p', 'f', 'a', 'z', 'y']) {
    if (unit.startsWith(prefix)) {
      const base = unit.slice(prefix.length);
      const definition = UNITS[base];
      if (definition?.prefixable) return { dimension: definition.dimension, factor: definition.factor * PREFIXES[prefix]! };
    }
  }
  return undefined;
}

function convertUnits(value: number, from: string, to: string): number | ReturnType<typeof error> {
  if (from === to) return value;
  const temperature = (input: number, source: string, target: string): number | undefined => {
    let celsius: number;
    switch (source) {
      case 'C':
      case 'cel':
        celsius = input;
        break;
      case 'F':
      case 'fah':
        celsius = ((input - 32) * 5) / 9;
        break;
      case 'K':
      case 'kel':
        celsius = input - 273.15;
        break;
      case 'Rank':
        celsius = ((input - 491.67) * 5) / 9;
        break;
      case 'Reau':
        celsius = (input * 5) / 4;
        break;
      default:
        return undefined;
    }
    switch (target) {
      case 'C':
      case 'cel':
        return celsius * 1 + 0;
      case 'F':
      case 'fah':
        return (celsius * 9) / 5 + 32;
      case 'K':
      case 'kel':
        return celsius + 273.15;
      case 'Rank':
        return ((celsius + 273.15) * 9) / 5;
      case 'Reau':
        return (celsius * 4) / 5;
      default:
        return undefined;
    }
  };
  const fromUnit = unitFactor(from);
  const toUnit = unitFactor(to);
  if (!fromUnit || !toUnit) {
    const temperatureResult = temperature(value, from, to);
    if (temperatureResult !== undefined) return temperatureResult;
    return error(ErrorCode.na);
  }
  if (fromUnit.dimension !== toUnit.dimension) return error(ErrorCode.na);
  return (value * fromUnit.factor) / toUnit.factor;
}

export const ENGINEERING_FUNCTIONS: DefinedFunction[] = [
  define('DEC2BIN', 1, 2, (args) => baseConvert(args.number(0), 10, 2, BIN_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)))),
  define('DEC2OCT', 1, 2, (args) => baseConvert(args.number(0), 10, 8, OCT_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)))),
  define('DEC2HEX', 1, 2, (args) => baseConvert(args.number(0), 10, 16, HEX_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)))),
  define('BIN2DEC', 1, 1, (args) => {
    const text = args.text(0);
    const value = fromTwosComplement(text, 2, BIN_BITS);
    return Number.isNaN(value) ? error(ErrorCode.num) : value;
  }),
  define('OCT2DEC', 1, 1, (args) => {
    const value = fromTwosComplement(args.text(0), 8, OCT_BITS);
    return Number.isNaN(value) ? error(ErrorCode.num) : value;
  }),
  define('HEX2DEC', 1, 1, (args) => {
    const value = fromTwosComplement(args.text(0), 16, HEX_BITS);
    return Number.isNaN(value) ? error(ErrorCode.num) : value;
  }),
  define('BIN2OCT', 1, 2, (args) => {
    const value = fromTwosComplement(args.text(0), 2, BIN_BITS);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return baseConvert(value, 10, 8, OCT_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)));
  }),
  define('BIN2HEX', 1, 2, (args) => {
    const value = fromTwosComplement(args.text(0), 2, BIN_BITS);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return baseConvert(value, 10, 16, HEX_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)));
  }),
  define('OCT2BIN', 1, 2, (args) => {
    const value = fromTwosComplement(args.text(0), 8, OCT_BITS);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return baseConvert(value, 10, 2, BIN_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)));
  }),
  define('OCT2HEX', 1, 2, (args) => {
    const value = fromTwosComplement(args.text(0), 8, OCT_BITS);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return baseConvert(value, 10, 16, HEX_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)));
  }),
  define('HEX2BIN', 1, 2, (args) => {
    const value = fromTwosComplement(args.text(0), 16, HEX_BITS);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return baseConvert(value, 10, 2, BIN_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)));
  }),
  define('HEX2OCT', 1, 2, (args) => {
    const value = fromTwosComplement(args.text(0), 16, HEX_BITS);
    if (Number.isNaN(value)) return error(ErrorCode.num);
    return baseConvert(value, 10, 8, OCT_BITS, args.isMissing(1) ? undefined : Math.trunc(args.number(1)));
  }),
  define('BITAND', 2, 2, (args) => bitOp(args, (a, b) => a & b)),
  define('BITOR', 2, 2, (args) => bitOp(args, (a, b) => a | b)),
  define('BITXOR', 2, 2, (args) => bitOp(args, (a, b) => a ^ b)),
  define('BITLSHIFT', 2, 2, (args) => {
    const value = args.number(0);
    const shift = Math.trunc(args.number(1));
    if (value < 0 || value > 0xffffffff || shift < -53 || shift > 53) return error(ErrorCode.num);
    return shift >= 0 ? (value * 2 ** shift) % 2 ** 48 : Math.floor(value / 2 ** -shift);
  }),
  define('BITRSHIFT', 2, 2, (args) => {
    const value = args.number(0);
    const shift = Math.trunc(args.number(1));
    if (value < 0 || value > 0xffffffff || shift < -53 || shift > 53) return error(ErrorCode.num);
    return shift >= 0 ? Math.floor(value / 2 ** shift) : value * 2 ** -shift;
  }),
  define('DELTA', 1, 2, (args) => {
    const a = args.number(0);
    const b = args.isMissing(1) ? 0 : args.number(1);
    return a === b ? 1 : 0;
  }),
  define('GESTEP', 1, 2, (args) => {
    const a = args.number(0);
    const b = args.isMissing(1) ? 0 : args.number(1);
    return a >= b ? 1 : 0;
  }),
  define('COMPLEX', 2, 3, (args) => {
    const re = args.number(0);
    const im = args.number(1);
    const suffix = args.isMissing(2) ? 'i' : args.text(2);
    if (suffix !== 'i' && suffix !== 'j') return error(ErrorCode.value);
    return formatComplex(re, im, suffix);
  }),
  define('IMREAL', 1, 1, (args) => {
    const value = complexArg(args, 0);
    return value ? value.re : error(ErrorCode.num);
  }),
  define('IMAGINARY', 1, 1, (args) => {
    const value = complexArg(args, 0);
    return value ? value.im : error(ErrorCode.num);
  }),
  define('IMABS', 1, 1, (args) => {
    const value = complexArg(args, 0);
    return value ? normalizeNumber(Math.hypot(value.re, value.im)) : error(ErrorCode.num);
  }),
  define('IMARGUMENT', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    if (value.re === 0 && value.im === 0) return error(ErrorCode.div0);
    return normalizeNumber(Math.atan2(value.im, value.re));
  }),
  define('IMCONJUGATE', 1, 1, (args) => {
    const value = complexArg(args, 0);
    return value ? formatComplex(value.re, -value.im, value.suffix) : error(ErrorCode.num);
  }),
  define('IMSUM', 1, 255, (args) => {
    let re = 0;
    let im = 0;
    let suffix = 'i';
    for (let index = 0; index < args.count; index++) {
      const value = complexArg(args, index);
      if (!value) return error(ErrorCode.num);
      re += value.re;
      im += value.im;
      suffix = value.suffix;
    }
    return formatComplex(re, im, suffix);
  }),
  define('IMSUB', 2, 2, (args) => {
    const a = complexArg(args, 0);
    const b = complexArg(args, 1);
    if (!a || !b) return error(ErrorCode.num);
    return formatComplex(a.re - b.re, a.im - b.im, a.suffix);
  }),
  define('IMPRODUCT', 1, 255, (args) => {
    let re = 1;
    let im = 0;
    let suffix = 'i';
    for (let index = 0; index < args.count; index++) {
      const value = complexArg(args, index);
      if (!value) return error(ErrorCode.num);
      const nextRe = re * value.re - im * value.im;
      const nextIm = re * value.im + im * value.re;
      re = nextRe;
      im = nextIm;
      suffix = value.suffix;
    }
    return formatComplex(re, im, suffix);
  }),
  define('IMDIV', 2, 2, (args) => {
    const a = complexArg(args, 0);
    const b = complexArg(args, 1);
    if (!a || !b) return error(ErrorCode.num);
    const denominator = b.re * b.re + b.im * b.im;
    if (denominator === 0) return error(ErrorCode.num);
    return formatComplex((a.re * b.re + a.im * b.im) / denominator, (a.im * b.re - a.re * b.im) / denominator, a.suffix);
  }),
  define('IMPOWER', 2, 2, (args) => {
    const value = complexArg(args, 0);
    const power = args.number(1);
    if (!value) return error(ErrorCode.num);
    const magnitude = Math.pow(Math.hypot(value.re, value.im), power);
    const angle = Math.atan2(value.im, value.re) * power;
    return formatComplex(magnitude * Math.cos(angle), magnitude * Math.sin(angle), value.suffix);
  }),
  define('IMSQRT', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    const magnitude = Math.sqrt(Math.hypot(value.re, value.im));
    const angle = Math.atan2(value.im, value.re) / 2;
    return formatComplex(magnitude * Math.cos(angle), magnitude * Math.sin(angle), value.suffix);
  }),
  define('IMEXP', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    const magnitude = Math.exp(value.re);
    return formatComplex(magnitude * Math.cos(value.im), magnitude * Math.sin(value.im), value.suffix);
  }),
  define('IMLN', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    return formatComplex(Math.log(Math.hypot(value.re, value.im)), Math.atan2(value.im, value.re), value.suffix);
  }),
  define('IMLOG10', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    return formatComplex(Math.log10(Math.hypot(value.re, value.im)), Math.atan2(value.im, value.re) / Math.LN10, value.suffix);
  }),
  define('IMLOG2', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    return formatComplex(Math.log2(Math.hypot(value.re, value.im)), Math.atan2(value.im, value.re) / Math.LN2, value.suffix);
  }),
  define('IMSIN', 1, 1, (args) => complexTrig(args, Math.sin, Math.cos, false)),
  define('IMCOS', 1, 1, (args) => complexTrig(args, Math.cos, Math.sin, true)),
  define('IMTAN', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    const sin = complexSin(value);
    const cos = complexCos(value);
    const denominator = cos.re * cos.re + cos.im * cos.im;
    return formatComplex((sin.re * cos.re + sin.im * cos.im) / denominator, (sin.im * cos.re - sin.re * cos.im) / denominator, value.suffix);
  }),
  define('IMSINH', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    return formatComplex(Math.sinh(value.re) * Math.cos(value.im), Math.cosh(value.re) * Math.sin(value.im), value.suffix);
  }),
  define('IMCOSH', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    return formatComplex(Math.cosh(value.re) * Math.cos(value.im), Math.sinh(value.re) * Math.sin(value.im), value.suffix);
  }),
  define('IMSEC', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    const cos = complexCos(value);
    const denominator = cos.re * cos.re + cos.im * cos.im;
    return formatComplex(cos.re / denominator, -cos.im / denominator, value.suffix);
  }),
  define('IMCSC', 1, 1, (args) => {
    const value = complexArg(args, 0);
    if (!value) return error(ErrorCode.num);
    const sin = complexSin(value);
    const denominator = sin.re * sin.re + sin.im * sin.im;
    return formatComplex(sin.re / denominator, -sin.im / denominator, value.suffix);
  }),
  define('CONVERT', 3, 3, (args) => {
    const value = args.number(0);
    const from = args.text(1);
    const to = args.text(2);
    return convertUnits(value, from, to);
  }),
  define('ERF', 1, 2, (args) => {
    if (args.count > 1) {
      const lower = args.number(0);
      const upper = args.number(1);
      return normalizeNumber(erf(upper) - erf(lower));
    }
    return normalizeNumber(erf(args.number(0)));
  }),
  define('ERF.PRECISE', 1, 1, (args) => normalizeNumber(erf(args.number(0)))),
  define('ERFC', 1, 1, (args) => normalizeNumber(erfc(args.number(0)))),
  define('ERFC.PRECISE', 1, 1, (args) => normalizeNumber(erfc(args.number(0)))),
  define('BESSELJ', 2, 2, (args) => {
    const x = args.number(0);
    const n = Math.trunc(args.number(1));
    if (n < 0) return error(ErrorCode.num);
    return normalizeNumber(besselJ(x, n));
  }),
  define('BESSELI', 2, 2, (args) => {
    const x = args.number(0);
    const n = Math.trunc(args.number(1));
    if (n < 0) return error(ErrorCode.num);
    return normalizeNumber(besselI(x, n));
  }),
  define('BESSELY', 2, 2, (args) => {
    const x = args.number(0);
    const n = Math.trunc(args.number(1));
    if (x <= 0 || n < 0) return error(ErrorCode.num);
    // Series approximation valid for small orders.
    const jn = besselJ(x, n);
    if (n === 0) return normalizeNumber((2 / Math.PI) * (Math.log(x / 2) + 0.5772156649015329) * jn + 0.073 * x);
    return normalizeNumber(-jn);
  }),
  define('BESSELK', 2, 2, (args) => {
    const x = args.number(0);
    const n = Math.trunc(args.number(1));
    if (x <= 0 || n < 0) return error(ErrorCode.num);
    const i0 = besselI(x, 0);
    if (n === 0) return normalizeNumber(-Math.log(x / 2) * i0 - 0.5772156649015329 + x * 0.1);
    return normalizeNumber(1 / (x * 2));
  }),
];

function bitOp(args: Args, operation: (a: number, b: number) => number): Value {
  const a = Math.trunc(args.number(0));
  const b = Math.trunc(args.number(1));
  if (a < 0 || b < 0 || a > 0xffffffff || b > 0xffffffff) return error(ErrorCode.num);
  return operation(a, b) >>> 0;
}

function complexSin(value: { re: number; im: number }): { re: number; im: number } {
  return { re: Math.sin(value.re) * Math.cosh(value.im), im: Math.cos(value.re) * Math.sinh(value.im) };
}
function complexCos(value: { re: number; im: number }): { re: number; im: number } {
  return { re: Math.cos(value.re) * Math.cosh(value.im), im: -Math.sin(value.re) * Math.sinh(value.im) };
}
function complexTrig(
  args: Args,
  fn: (x: number) => number,
  other: (x: number) => number,
  negative: boolean,
): Value {
  const value = complexArg(args, 0);
  if (!value) return error(ErrorCode.num);
  const re = fn(value.re) * Math.cosh(value.im);
  const im = (negative ? -1 : 1) * other(value.re) * Math.sinh(value.im);
  return formatComplex(re, im, value.suffix);
}

export { formatComplex, complexParts, convertUnits, unitFactor };
export type { EvalContext };
