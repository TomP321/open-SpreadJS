/*
 * PDF417 (ISO/IEC 15438:2001) stacked symbology encoder.
 *
 * Structure follows the standard: each row is
 *   start guard | left row indicator | data codewords | right row indicator | stop guard
 * with every codeword drawn from the per-cluster pattern tables (cluster =
 * row % 3; the tables are facts of the standard, kept in
 * barcode-pdf417-tables.ts). The high-level layer implements Text
 * compaction (submodes Alpha/Lower/Mixed/Punctuation with the shift/latch
 * codes of Table 6), Numeric compaction for long digit payloads (44-digit
 * runs as base-900 values) and Byte compaction (ISO-8859-1 single bytes or
 * UTF-8 for higher code points), error correction uses Reed-Solomon over
 * GF(929) with generator g(x) = (x-3)(x-3^2)...(x-3^k), k = 2^(level+1).
 */

import { PDF417_PATTERNS, PDF417_START, PDF417_STOP } from './barcode-pdf417-tables.js';

export type PDFGrid = Uint8Array[];

/* ------------------------------------------------- high-level encoding --- */

const MODE_ALPHA = 0;
const MODE_LOWER = 1;
const MODE_MIXED = 2;
const MODE_PUNCT = 3; // entered only by the Mixed latch (25); Alpha/Lower/Mixed reach punctuation by shift (29)
const LATCH_TEXT = 900;
const LATCH_BYTE_PADDED = 901;
const LATCH_NUMERIC = 902;
const LATCH_BYTE = 924;

/** Mixed submode characters, codeword value -> character (25 unused; 26 = space). */
const MIXED_CHARS = Array.from('0123456789&\r\t,:#-.$/+%*=^');
const MIXED_SPACE = 26;
/** Punctuation submode, codeword value -> character (value 29 = back to Alpha). */
/** Order is 15438 Table A.5 (semicolon first, question mark between `)` and `{`). */
const PUNCT_CHARS = Array.from(';<>@[\\]_`~!\r\t,:\n-.$/"|*()?{}\'');

const mixedValue = (char: string): number => {
  if (char === ' ') return MIXED_SPACE;
  const index = MIXED_CHARS.indexOf(char);
  return index < 0 ? -1 : index;
};
const punctValue = (char: string): number => {
  const index = PUNCT_CHARS.indexOf(char);
  return index < 0 ? -1 : index;
};

const isAlphaChar = (char: string): boolean => char === ' ' || (char >= 'A' && char <= 'Z');
const isLowerChar = (char: string): boolean => char === ' ' || (char >= 'a' && char <= 'z');
const isMixedChar = (char: string): boolean => mixedValue(char) >= 0;
const isPunctChar = (char: string): boolean => punctValue(char) >= 0;
const isTextChar = (char: string): boolean => isAlphaChar(char) || isLowerChar(char) || isMixedChar(char) || isPunctChar(char);

/** One run of text-compaction characters appended as codeword pairs (ISO Table 6). */
function textRunCodewords(text: string, startSubmode: number): { codewords: number[]; submode: number } {
  const values: number[] = [];
  let submode = startSubmode;
  let idx = 0;
  while (idx < text.length) {
    const char = text[idx];
    if (submode === MODE_ALPHA) {
      if (isAlphaChar(char)) values.push(char === ' ' ? 26 : char.charCodeAt(0) - 65);
      else if (isLowerChar(char)) {
        submode = MODE_LOWER;
        values.push(27);
        continue;
      } else if (isMixedChar(char)) {
        submode = MODE_MIXED;
        values.push(28);
        continue;
      } else {
        values.push(29, punctValue(char)); // SHIFT to punctuation (29): one character only
      }
    } else if (submode === MODE_LOWER) {
      if (isLowerChar(char)) values.push(char === ' ' ? 26 : char.charCodeAt(0) - 97);
      else if (isAlphaChar(char)) values.push(27, char.charCodeAt(0) - 65);
      else if (isMixedChar(char)) {
        submode = MODE_MIXED;
        values.push(28);
        continue;
      } else {
        values.push(29, punctValue(char));
      }
    } else if (submode === MODE_MIXED) {
      if (isMixedChar(char)) values.push(mixedValue(char));
      else if (isAlphaChar(char)) {
        submode = MODE_ALPHA;
        values.push(28);
        continue;
      } else if (isLowerChar(char)) {
        submode = MODE_LOWER;
        values.push(27);
        continue;
      } else {
        values.push(29, punctValue(char));
      }
    } else if (submode === MODE_PUNCT) {
      // Punctuation submode (entered only via the Mixed latch 25): 29 = back to Alpha.
      if (isPunctChar(char)) values.push(punctValue(char));
      else {
        submode = MODE_ALPHA;
        values.push(29);
        continue; // re-handle this character in Alpha
      }
    } else {
      values.push(29, punctValue(char)); // defensive: all text characters matched the branches above
    }
    idx++;
  }
  const codewords: number[] = [];
  for (let i = 0; i < values.length; i += 2) codewords.push(values[i] * 30 + (i + 1 < values.length ? values[i + 1] : 29));
  return { codewords, submode };
}

/** Numeric compaction: digit runs of up to 44 digits as "1"+digits in base 900 (ISO 15438 5.4.4). */
function numericCodewords(digits: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < digits.length; i += 44) {
    let number = '1' + digits.slice(i, Math.min(i + 44, digits.length));
    const words: number[] = [];
    while (Number(number) > 0 || (number.length > 1 && number !== '0')) {
      let remainder = 0;
      let quotient = '';
      let started = false;
      for (const digit of number) {
        const current = remainder * 10 + Number(digit);
        const q = Math.floor(current / 900);
        if (q || started) {
          quotient += String(q);
          started = true;
        }
        remainder = current % 900;
      }
      words.unshift(remainder);
      number = quotient || '0';
      if (number === '0') break;
    }
    out.push(...words);
  }
  return out;
}

/**
 * Convert one big-endian base-256 digit array to base-900 words with
 * schoolbook division (a 6-byte group exceeds float64 precision, so no
 * Number() round-trip is allowed here).
 */
function base256To900(digits: number[], wordCount: number): number[] {
  let cur = [...digits];
  const words: number[] = [];
  for (;;) {
    let remainder = 0;
    const quotient: number[] = [];
    for (const digit of cur) {
      const value = remainder * 256 + digit;
      const q = Math.floor(value / 900);
      if (q || quotient.length) quotient.push(q);
      remainder = value % 900;
    }
    words.unshift(remainder);
    if (!quotient.length) break;
    cur = quotient;
  }
  while (words.length < wordCount) words.unshift(0);
  return words;
}

/** Byte compaction for one run: 6 bytes -> 5 base-900 codewords, leftover bytes one per codeword (ISO 15438 5.4.7). */
function byteRunCodewords(bytes: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  for (; i + 6 <= bytes.length; i += 6) out.push(...base256To900(bytes.slice(i, i + 6), 5));
  for (; i < bytes.length; i++) out.push(bytes[i]);
  return out;
}

const toIsoBytes = (text: string): number[] | null => {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code > 255) return null;
    out.push(code);
  }
  return out;
};

const toUtf8Bytes = (text: string): number[] => {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return out;
};

/** High-level codewords (without the leading length symbol) per ISO 15438 4.4.2. */
export function pdf417HighLevel(text: string): number[] {
  if (!text) return [];
  if (/^[0-9]+$/.test(text)) {
    if (text.length >= 13) return [LATCH_NUMERIC, ...numericCodewords(text), LATCH_TEXT];
    return textRunCodewords(text, MODE_ALPHA).codewords;
  }
  if ([...text].every(isTextChar)) return textRunCodewords(text, MODE_ALPHA).codewords;
  const iso = toIsoBytes(text);
  const bytes = iso ?? toUtf8Bytes(text);
  if (bytes.length % 6 === 0) return [LATCH_BYTE, ...byteRunCodewords(bytes), LATCH_TEXT];
  return [LATCH_BYTE_PADDED, ...byteRunCodewords(bytes)];
}

/* ------------------------------------------------------- GF(929) / RS --- */

/** g(x) = prod_{i=1..degree}(x - 3^i) over GF(929), coefficients ascending (monic term omitted). */
export function pdf417Generator(degree: number): number[] {
  let poly = [1]; // ascending coefficients of the running product
  let pow = 1;
  for (let i = 1; i <= degree; i++) {
    pow = (pow * 3) % 929;
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] -= poly[j] * pow;
      next[j + 1] += poly[j];
    }
    poly = next.map((v) => ((v % 929) + 929) % 929);
  }
  return poly.slice(0, degree); // ascending, drop the leading x^degree coefficient
}

/** Error-correction codewords for one PDF417 data stream (level 0..8). */
export function pdf417ErrorCorrection(data: number[], level: number): number[] {
  const k = pdf417EcCodewordCount(level);
  const gen = pdf417Generator(k);
  const e = new Array<number>(k).fill(0);
  for (const value of data) {
    const t1 = (value + e[k - 1]) % 929;
    for (let j = k - 1; j >= 1; j--) e[j] = (e[j - 1] + t1 * (929 - gen[j])) % 929;
    e[0] = (t1 * (929 - gen[0])) % 929;
  }
  return e.map((v) => (v === 0 ? 0 : 929 - v)).reverse();
}

/** Error-correction codeword count per level: 2^(level+1), levels 0..8. */
export const pdf417EcCodewordCount = (level: number): number => 1 << (Math.max(0, Math.min(8, level | 0)) + 1);

/* ------------------------------------------------------------- rows --- */

/** Codeword value used by the left/right row indicator of a row (ISO 15438 7.9.4). */
function rowIndicators(row: number, rows: number, cols: number, level: number): { left: number; right: number } {
  const q = Math.floor(row / 3) * 30;
  switch (row % 3) {
    case 0:
      return { left: q + Math.floor((rows - 1) / 3), right: q + (cols - 1) };
    case 1:
      return { left: q + level * 3 + ((rows - 1) % 3), right: q + Math.floor((rows - 1) / 3) };
    default:
      return { left: q + (cols - 1), right: q + level * 3 + ((rows - 1) % 3) };
  }
}

const patternBits = (pattern: number, count: number): number[] => {
  const bits: number[] = [];
  for (let bit = count - 1; bit >= 0; bit--) bits.push((pattern >> bit) & 1);
  return bits;
};

/** Choose columns/rows: keep every row count in 3..90 and aim at the classic ~3:1 aspect. */
function pickDimensions(total: number, ecCount: number): { cols: number; rows: number; pad: number } {
  // Like the official, choose the narrowest column count that fits the payload
  // with as little padding as possible (e.g. 4 data codewords + level-2 EC give
  // 4 columns x 2 rows); no forced minimum row count.
  let best: { cols: number; rows: number; pad: number; score: number } | null = null;
  for (let cols = 1; cols <= 30; cols++) {
    const need = total + ecCount + 1; // +1 for the length codeword
    const rows = Math.ceil(need / cols);
    if (rows < 1 || rows > 90) continue;
    const pad = cols * rows - need;
    if (pad < 0) continue;
    // Least padding first, then the classic ~3-row shape, then the narrowest symbol.
    const score = pad * 1000 + Math.abs(rows - 3) * 30 + cols;
    if (!best || score < best.score) best = { cols, rows, pad, score };
  }
  return best ?? { cols: 1, rows: 1, pad: 0 };
}

/**
 * Encode `text` as a PDF417 module grid (1 = dark). `level` is the EC level
 * 0..8 (default 2). Rows are returned top-to-bottom with each symbol row
 * repeated `rowHeight` module rows so the classic 1:3 row aspect survives the
 * square-module drawing path.
 */
export function encodePDF417(text: string, level = 2, rowHeight = 3, requested?: { rows?: number; columns?: number }): PDFGrid | null {
  if (!text) return null;
  const payload = pdf417HighLevel(text);
  const ecCount = pdf417EcCodewordCount(level);
  // TASK 46: `BC_PDF417` rows/columns arguments (the trial honours them when the payload
  // fits); fall back to the automatic shape when they are absent or too small.
  const askedRows = requested?.rows;
  const askedCols = requested?.columns;
  const fits = askedRows !== undefined && askedCols !== undefined
    && askedRows >= 3 && askedRows <= 90 && askedCols >= 1 && askedCols <= 92
    && payload.length + ecCount + 1 <= askedRows * askedCols;
  const chosen = fits
    ? { cols: askedCols!, rows: askedRows!, pad: askedRows! * askedCols! - (payload.length + ecCount + 1) }
    : pickDimensions(payload.length, ecCount);
  const { cols, rows, pad } = chosen;
  if (!rows || payload.length + ecCount + 1 + pad > 929) return null;
  // The first data codeword k counts every data codeword including itself.
  const data = [payload.length + pad + 1, ...payload, ...new Array<number>(pad).fill(LATCH_TEXT)];
  const stream = [...data, ...pdf417ErrorCorrection(data, level)];
  const grid: PDFGrid = [];
  for (let row = 0; row < rows; row++) {
    const cluster = row % 3;
    const { left, right } = rowIndicators(row, rows, cols, level);
    const modules = patternBits(PDF417_START, 17);
    const push = (value: number): void => {
      modules.push(...patternBits(PDF417_PATTERNS[cluster][value], 17));
    };
    push(left);
    for (let c = 0; c < cols; c++) push(stream[row * cols + c]);
    push(right);
    modules.push(...patternBits(PDF417_STOP, 18));
    const rowLine = Uint8Array.from(modules);
    for (let h = 0; h < rowHeight; h++) grid.push(Uint8Array.from(rowLine));
  }
  return grid;
}
