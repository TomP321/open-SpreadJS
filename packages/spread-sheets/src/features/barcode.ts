/*
 * Barcode symbologies for the cell-rendered BC_* formulas.
 *
 * QR Code (versions 1-10, byte mode, all EC levels, automatic mask selection),
 * EAN-13 / EAN-8, CODE39 / CODE93 / CODE128 (auto A/B/C) / GS1_128 / CODABAR,
 * DATAMATRIX (square ECC 200 up to 120x120, ASCII + Base 256) and PDF417
 * (text/numeric/byte compaction, EC levels 0..8) are real encoders written
 * from the public standards (see the headers of barcode-linear.ts,
 * barcode-datamatrix.ts and barcode-pdf417.ts). Only CODE49 still renders a
 * deterministic placeholder pattern (recorded in docs/DESIGNER.md Known gaps).
 */

import { encodeCODE39, encodeCODE93, encodeCODE128, encodeGS1128, encodeCODABAR, code93Label, code128Label, gs1128Label, codabarLabel } from './barcode-linear.js';
import { encodeDataMatrix } from './barcode-datamatrix.js';
import { encodePDF417 } from './barcode-pdf417.js';

export type ModuleGrid = Uint8Array[];
export { encodeCODE39, encodeCODE93, encodeCODE128, encodeGS1128, encodeCODABAR, encodeDataMatrix, encodePDF417 };

/* ------------------------------------------------------------------ QR ---- */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { GF_EXP[i] = x; GF_LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = rsGenerator(ecLength);
  const remainder = new Uint8Array(ecLength);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecLength - 1] = 0;
    for (let i = 0; i < ecLength; i++) remainder[i] ^= gfMul(gen[i + 1], factor);
  }
  return remainder;
}

/* version -> level -> [total, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] */
const QR_TABLES: Record<string, Record<string, [number, number, number, number, number, number]>> = {
  '1': { L: [26, 7, 1, 19, 0, 0], M: [26, 10, 1, 16, 0, 0], Q: [26, 13, 1, 13, 0, 0], H: [26, 17, 1, 9, 0, 0] },
  '2': { L: [44, 10, 1, 34, 0, 0], M: [44, 16, 1, 28, 0, 0], Q: [44, 22, 1, 22, 0, 0], H: [44, 28, 1, 16, 0, 0] },
  '3': { L: [70, 15, 1, 55, 0, 0], M: [70, 26, 1, 44, 0, 0], Q: [70, 18, 2, 17, 0, 0], H: [70, 22, 2, 13, 0, 0] },
  '4': { L: [100, 20, 1, 80, 0, 0], M: [100, 18, 2, 32, 0, 0], Q: [100, 26, 2, 20, 0, 0], H: [100, 16, 4, 9, 0, 0] },
  '5': { L: [134, 26, 1, 108, 0, 0], M: [134, 24, 2, 43, 0, 0], Q: [134, 18, 2, 15, 2, 16], H: [134, 22, 2, 11, 2, 12] },
  '6': { L: [172, 18, 2, 68, 0, 0], M: [172, 16, 4, 27, 0, 0], Q: [172, 24, 4, 19, 0, 0], H: [172, 28, 4, 15, 0, 0] },
  '7': { L: [196, 20, 2, 78, 0, 0], M: [196, 18, 4, 31, 0, 0], Q: [196, 18, 2, 14, 4, 15], H: [196, 26, 4, 13, 1, 14] },
  '8': { L: [242, 24, 2, 97, 0, 0], M: [242, 22, 2, 38, 2, 39], Q: [242, 22, 4, 18, 2, 19], H: [242, 26, 4, 14, 2, 15] },
  '9': { L: [292, 30, 2, 116, 0, 0], M: [292, 22, 3, 36, 2, 37], Q: [292, 20, 4, 16, 4, 17], H: [292, 24, 4, 12, 4, 13] },
  '10': { L: [346, 18, 2, 68, 2, 69], M: [346, 26, 4, 43, 1, 44], Q: [346, 24, 6, 19, 2, 20], H: [346, 28, 6, 15, 2, 16] },
};
const QR_ALIGNMENT: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const QR_LEVELS: Record<string, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * Byte-mode QR encoder. `version` accepts 'auto' or 1..10. Returns the module
 * grid (1 = dark) or null when the payload exceeds version 10 capacity.
 */
export function encodeQR(text: string, level = 'L', versionInput: string | number = 'auto', maskInput: string | number = 'auto'): { modules: ModuleGrid; version: number } | null {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  const eclName = QR_LEVELS[level] === undefined ? 'L' : level;
  const ecl = QR_LEVELS[eclName];
  const minVersion = typeof versionInput === 'number' && versionInput >= 1 ? Math.min(10, versionInput) : 1;
  let version = 1;
  let dataWords = 0;
  for (version = minVersion; version <= 10; version++) {
    const [, , b1, d1, b2, d2] = QR_TABLES[version][eclName];
    dataWords = b1 * d1 + b2 * d2;
    const headerBits = 4 + (version < 10 ? 8 : 16);
    if (Math.ceil((headerBits + bytes.length * 8) / 8) <= dataWords) break;
  }
  if (version > 10) return null;
  const bits: number[] = [];
  const push = (value: number, count: number): void => { for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(4, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  push(0, Math.min(4, dataWords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = new Uint8Array(dataWords);
  for (let i = 0; i < bits.length; i += 8) data[i / 8] = parseInt(bits.slice(i, i + 8).join(''), 2);
  for (let i = bits.length / 8; i < dataWords; i++) data[i] = ((i - bits.length / 8) % 2 ? 0x11 : 0xec);
  const [, ecPer, b1, d1, b2, d2] = QR_TABLES[version][eclName];
  const blocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const length = i < b1 ? d1 : d2;
    const chunk = data.subarray(offset, offset + length);
    offset += length;
    blocks.push(chunk);
    ecBlocks.push(rsEncode(chunk, ecPer));
  }
  const final: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const block of blocks) if (i < block.length) final.push(block[i]);
  for (let i = 0; i < ecPer; i++) for (const block of ecBlocks) final.push(block[i]);

  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));
  const setFn = (r: number, c: number, dark: boolean): void => { grid[r][c] = dark ? 1 : 0; reserved[r][c] = 1; };
  const finder = (row: number, col: number): void => {
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
      const r = row + dr, c = col + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setFn(r, c, ring !== 2 && ring !== 4);
    }
  };
  finder(3, 3); finder(3, size - 4); finder(size - 4, 3);
  for (let i = 8; i < size - 8; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  for (const r of QR_ALIGNMENT[version]) for (const c of QR_ALIGNMENT[version]) {
    // The three positions absorbed by the finder patterns are not drawn; the
    // ones on the timing rows/columns ARE drawn and occupy their modules.
    if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  setFn(size - 8, 8, true);
  for (let i = 0; i <= 8; i++) { reserved[8][i] = 1; reserved[i][8] = 1; }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = 1; reserved[size - 1 - i][8] = 1; }
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { reserved[size - 11 + j][i] = 1; reserved[i][size - 11 + j] = 1; }

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (reserved[row][col]) continue;
        const bit = bitIndex < final.length * 8 ? (final[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1 : 0;
        grid[row][col] = bit;
        bitIndex++;
      }
    }
  }
  const maskFn = (index: number, r: number, c: number): boolean => {
    switch (index) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
      case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
      default: return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
    }
  };
  const applyMask = (index: number): void => {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!reserved[r][c] && maskFn(index, r, c)) grid[r][c] ^= 1;
  };
  const writeFormat = (mask: number): void => {
    const payload = (ecl << 3) | mask;
    let rem = payload << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    const format = ((payload << 10) | rem) ^ 0x5412;
    // ISO/IEC 18004 layout: bit 0 (LSB) at module (0,8) running down column 8,
    // then the mirror copy running right-to-left along row 8 from the bottom-right.
    for (let i = 0; i < 15; i++) {
      const bit = (format >> i) & 1;
      if (i < 6) grid[i][8] = bit;
      else if (i < 8) grid[i + 1][8] = bit;
      else grid[size - 15 + i][8] = bit;
      if (i < 8) grid[8][size - 1 - i] = bit;
      else if (i === 8) grid[8][7] = bit;
      else grid[8][14 - i] = bit;
    }
    grid[size - 8][8] = 1;
  };
  const writeVersion = (): void => {
    if (version < 7) return;
    let rem = version << 12;
    for (let i = 17; i >= 12; i--) if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
    const info = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (info >> i) & 1;
      grid[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      grid[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  };
  const penalty = (): number => {
    let score = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) { run = grid[r][c] === grid[r][c - 1] ? run + 1 : 1; if (run === 5) score += 3; else if (run > 5) score += 1; }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) { run = grid[r][c] === grid[r - 1][c] ? run + 1 : 1; if (run === 5) score += 3; else if (run > 5) score += 1; }
    }
    for (let r = 0; r + 1 < size; r++) for (let c = 0; c + 1 < size; c++) { const v = grid[r][c]; if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3; }
    const check = (line: string): number => (line === '10111010000' || line === '00001011101' ? 40 : 0);
    for (let r = 0; r < size; r++) for (let c = 0; c + 11 <= size; c++) score += check(Array.from(grid[r].slice(c, c + 11)).join(''));
    for (let c = 0; c < size; c++) for (let r = 0; r + 11 <= size; r++) score += check(Array.from({ length: 11 }, (_, i) => grid[r + i][c]).join(''));
    let dark = 0;
    for (const row of grid) for (const cell of row) dark += cell;
    score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return score;
  };
  const forcedMask = typeof maskInput === 'number' ? maskInput : Number.parseInt(String(maskInput), 10);
  if (forcedMask >= 0 && forcedMask <= 7) {
    applyMask(forcedMask);
    writeFormat(forcedMask);
    writeVersion();
    return { modules: grid, version };
  }
  let best = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    writeFormat(mask);
    writeVersion();
    const score = penalty();
    if (score < bestScore) { bestScore = score; best = mask; }
    applyMask(mask);
  }
  applyMask(best);
  writeFormat(best);
  writeVersion();
  return { modules: grid, version };
}

/* ------------------------------------------------------- EAN (standard) -- */

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
/** Right-hand set R: bitwise complement of the L pattern of the same digit. */
const EAN_R = EAN_L.map((pattern) => pattern.replace(/0/g, 'x').replace(/1/g, '0').replace(/x/g, '1'));
/** Left-half parity for digits 2..7 selected by the first digit (GS1 general spec). */
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** GS1 mod-10 check digit: weights alternate 3,1,3,... from the RIGHTMOST body digit. */
const eanCheck = (digits: string): number => {
  let sum = 0;
  const last = digits.length - 1;
  for (let i = 0; i <= last; i++) sum += Number(digits[i]) * ((last - i) % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
};

/** EAN-13 module string ('1' = dark): 101 + six L/G digits + 01010 + six R digits + 101 (95 modules). */
export function encodeEAN13(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length < 12) return null;
  const body = digits.slice(0, 12);
  const check = eanCheck(body);
  let modules = '101';
  const parity = EAN_PARITY[Number(body[0])];
  for (let i = 1; i <= 6; i++) modules += (parity[i - 1] === 'L' ? EAN_L[Number(body[i])] : EAN_G[Number(body[i])]);
  modules += '01010';
  for (let i = 7; i < 12; i++) modules += EAN_R[Number(body[i])];
  modules += EAN_R[check];
  modules += '101';
  return modules;
}

/** EAN-8 module string ('1' = dark): 101 + four L digits + 01010 + four R digits + 101 (67 modules). */
export function encodeEAN8(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7) return null;
  const body = digits.slice(0, 7);
  const check = eanCheck(body);
  let modules = '101';
  for (let i = 0; i < 4; i++) modules += EAN_L[Number(body[i])];
  modules += '01010';
  for (let i = 4; i < 7; i++) modules += EAN_R[Number(body[i])];
  modules += EAN_R[check];
  modules += '101';
  return modules;
}

/* ------------------------------------------- deterministic fallback grid -- */

/**
 * Deterministic module run-lengths for symbologies without a standard encoder
 * in this build. Each character contributes [bar, space] widths of 1..3 modules
 * derived from its code; both quiet ends use alternating guards so the result
 * reads as a barcode. Never presented as scanner-compatible.
 */
export function fallbackLinearModules(text: string): number[] {
  const run: number[] = [];
  const seed = (input: string, salt: number): number => {
    let h = 0x811c9dc5 ^ salt;
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0);
  };
  run.push(2, 1, 2, 1); // start guard
  for (let i = 0; i < text.length; i++) {
    const value = seed(text[i], i);
    run.push(1 + (value % 3), 1 + ((value >> 2) % 3));
  }
  run.push(2, 1, 2); // stop guard
  return run;
}

/** Deterministic square matrix for PDF417 / DataMatrix placeholders. */
export function fallbackMatrix(text: string, size = 21): ModuleGrid {
  const grid = Array.from({ length: size }, (_, r) => {
    const row = new Uint8Array(size);
    for (let col = 0; col < size; col++) {
      const seed = (r * 31 + col * 17 + 7) >>> 0;
      let h = seed;
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
      row[col] = h % 100 < 45 ? 1 : 0;
    }
    // Finder-like corners keep the visual identity of a matrix code.
    for (let col = 0; col < size; col++) {
      if ((r < 3 && col < 3) || (r < 3 && col >= size - 3) || (r >= size - 3 && col < 3)) row[col] = 1;
    }
    return row;
  });
  return grid;
}

/* ------------------------------------------------------------- drawing --- */

export interface BarcodePaintSpec {
  /** 'QRCODE' | 'EAN13' | ... (symbology key without the BC_ prefix). */
  symbology: string;
  data: string;
  color?: string;
  backColor?: string;
  showLabel?: boolean;
  labelPosition?: string;
  /** QR error level 'L' | 'M' | 'Q' | 'H' (also mapped to PDF417 EC levels). */
  errorLevel?: string;
  /** QR version: 'auto' | 1..10. */
  version?: string | number;
  /** QR mask: 'auto' | 0..7. */
  mask?: string | number;
  quietZone?: { left: number; top: number; right: number; bottom: number };
  /** TASK 46: trial `BC_*` options that reach the encoders (see features/barcode-args.ts). */
  checkDigit?: boolean;
  /** Wide:narrow element ratio (the trial accepts 2 or 3 for Codabar/Code 39). */
  nwRatio?: number;
  /** Code 39 / Code 93 full-ASCII mode. */
  fullASCII?: boolean;
  /** Code 128 forced code set (trial `codeSet`). */
  codeSet?: number;
  /** PDF417 error-correction level 0..8 and requested symbol rows/columns. */
  pdfLevel?: number;
  pdfRows?: number;
  pdfColumns?: number;
  compact?: boolean;
  /** DataMatrix ECC200 symbol side. */
  symbolSize?: number;
}

/**
 * Rescale the wide elements of a module string to another wide:narrow ratio.
 * Our encoders build their patterns with the classic 3:1 wide element; `nwRatio: 2`
 * (a value the trial accepts) rewrites the runs so the symbol is drawn 2:1.
 */
function applyRatio(modules: string, ratio: number): string {
  if (!modules || !Number.isFinite(ratio) || ratio === 3) return modules;
  const scale = ratio / 3;
  let out = '';
  let prev = modules[0];
  let run = 0;
  for (const ch of modules) {
    if (ch === prev) run++;
    else { out += prev.repeat(Math.max(1, Math.round(run * scale))); prev = ch; run = 1; }
  }
  out += prev.repeat(Math.max(1, Math.round(run * scale)));
  return out;
}

/** Runs of dark/light modules for a linear symbology (starting with dark). */
export function linearModules(spec: BarcodePaintSpec): number[] | null {
  const modules = linearModuleString(spec);
  return modules ? moduleStringToRuns(modules) : null;
}

/** Module string ('1' = dark) of a linear symbology, or null when not linear/encodable. */
export function linearModuleString(input: BarcodePaintSpec): string | null {
  // TASK 46: the trial's `nwRatio`/`checkDigit`/`fullASCII` options are honoured here; the
  // encoders themselves keep their standard 3:1 element widths.
  const spec: BarcodePaintSpec = input.nwRatio === 2 || input.nwRatio === 3
    ? input
    : input.nwRatio !== undefined ? { ...input, nwRatio: undefined } : input;
  const raw = linearModuleBase(spec);
  if (raw === null || spec.nwRatio === undefined) return raw;
  return applyRatio(raw, spec.nwRatio);
}

function linearModuleBase(spec: BarcodePaintSpec): string | null {
  switch (spec.symbology) {
    case 'EAN13': return encodeEAN13(spec.data);
    case 'EAN8': return encodeEAN8(spec.data);
    case 'CODE39': return encodeCODE39(spec.fullASCII ? spec.data.toUpperCase() : spec.data, spec.checkDigit ?? false);
    case 'CODE93': return encodeCODE93(spec.fullASCII ? spec.data.toUpperCase() : spec.data);
    case 'CODE128': return encodeCODE128(spec.data);
    case 'GS1_128': return encodeGS1128(spec.data);
    case 'CODABAR': return encodeCODABAR(spec.data);
    default: return null;
  }
}

/** Human-readable payload used for the "show label" text (EAN keeps digits+check). */
export function barcodeLabel(spec: BarcodePaintSpec): string {
  switch (spec.symbology) {
    case 'CODE39': return spec.data.toUpperCase();
    case 'CODE93': return code93Label(spec.data);
    case 'CODE128': return code128Label(spec.data);
    case 'GS1_128': return gs1128Label(spec.data);
    case 'CODABAR': return codabarLabel(spec.data);
    case 'EAN13': {
      const digits = spec.data.replace(/\D/g, '');
      return digits.length >= 12 ? digits.slice(0, 12) + String(eanCheck(digits.slice(0, 12))) : digits;
    }
    case 'EAN8': {
      const digits = spec.data.replace(/\D/g, '');
      return digits.length >= 7 ? digits.slice(0, 7) + String(eanCheck(digits.slice(0, 7))) : digits;
    }
    default: return spec.data;
  }
}

/** Full QR/DataMatrix/PDF417 module grid (1 = dark) or null when the symbology is matrix-like but unsupported. */
export function matrixGrid(spec: BarcodePaintSpec): ModuleGrid | null {
  switch (spec.symbology) {
    case 'QRCODE': {
      const level = spec.errorLevel && 'LMQH'.includes(spec.errorLevel) ? spec.errorLevel : 'L';
      return encodeQR(spec.data || '', level, spec.version ?? 'auto', spec.mask ?? 'auto')?.modules ?? null;
    }
    // The trial answers `#VALUE!` for every measured DataMatrix symbol-size argument, so no
    // size reaches the paint record (features/barcode-args.ts).
    case 'DATAMATRIX': return encodeDataMatrix(spec.data || '');
    case 'PDF417': {
      const levelMap: Record<string, number> = { L: 1, M: 2, Q: 3, H: 4 };
      const level = spec.pdfLevel ?? (spec.errorLevel && levelMap[spec.errorLevel] !== undefined ? levelMap[spec.errorLevel] : 2);
      return encodePDF417(spec.data || '', level, 1, { rows: spec.pdfRows, columns: spec.pdfColumns });
    }
    default: return null;
  }
}

export function moduleStringToRuns(modules: string): number[] {
  const runs: number[] = [];
  let prev = '';
  for (const ch of modules) {
    if (ch === prev && runs.length) runs[runs.length - 1]++;
    else runs.push(1);
    prev = ch;
  }
  return runs;
}

/* ------------------------------------------------------------- layout ---- */

const MATRIX_SYMBOLOGIES = ['QRCODE', 'PDF417', 'DATAMATRIX', 'CODE49'];
const isLinearSymbology = (spec: BarcodePaintSpec): boolean => !MATRIX_SYMBOLOGIES.includes(spec.symbology);
const isMatrixSymbology = (spec: BarcodePaintSpec): boolean => MATRIX_SYMBOLOGIES.includes(spec.symbology);
/** Official default: linear codes draw the payload text under the bars. */
export const barcodeShowsLabel = (spec: BarcodePaintSpec): boolean => spec.showLabel ?? isLinearSymbology(spec);
/** labelPosition 0/'top' draws the label above the bars; the official default is below. */
const labelAbove = (spec: BarcodePaintSpec): boolean => /^(0|top|above)$/i.test(String(spec.labelPosition ?? ''));

/**
 * Fit-to-cell geometry of a barcode (mirrors the official layout, measured on
 * the trial 19.2.5: a 124x100 cell puts CODE128 bars at x=10..113 y=1..84 with
 * the label below, DataMatrix as a 12 px-inset square, PDF417 filling the cell
 * with a 3 px inset). Module widths may be fractional so the symbol always
 * fits inside the given cell rectangle; nothing is painted outside it.
 */
export interface BarcodeLayout {
  /** Dark (bar/module) bounding box in canvas pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Module width; PDF417 rows use `rowHeight` for the vertical size. */
  module: number;
  rowHeight: number;
  /** Linear symbologies: bar/space run lengths in modules, starting dark. */
  runs?: number[];
  /** Matrix symbologies: the module grid to paint. */
  grid?: ModuleGrid;
  /** Quiet-zone padding (modules) around the drawn symbol, baked into x/y. */
  quiet?: { left: number; top: number; right: number; bottom: number };
  /** Label text rectangle when the label is shown (centred at `cx`). */
  label?: { text: string; cx: number; baseline: number; top: number; height: number };
  /** Rectangle every painted pixel lies in (cell bounds). */
  clip: { x: number; y: number; width: number; height: number };
}

export function barcodeLayout(spec: BarcodePaintSpec, x: number, y: number, w: number, h: number): BarcodeLayout | null {
  const clip = { x, y, width: w, height: h };
  if (isLinearSymbology(spec)) {
    const quiet = spec.quietZone ?? { left: 2, top: 1, right: 2, bottom: 1 };
    const runs = linearModules(spec) ?? fallbackLinearModules(spec.data);
    const dark = runs.reduce((a, b) => a + b, 0);
    const total = dark + quiet.left + quiet.right;
    const showLabel = barcodeShowsLabel(spec);
    // Official reserves ~16 % of the cell height (16 px of 100) for the label
    // and starts the bars 1 px below the cell top.
    const labelReserve = showLabel ? Math.min(16, Math.max(6, Math.round(h * 0.16))) : 0;
    const barH = Math.max(2, h - labelReserve - 1);
    const sideInset = Math.min(10, Math.max(0, Math.floor(w * 0.15)));
    const module = (w - 2 * sideInset) / total;
    const drawW = module * total;
    const startX = x + (w - drawW) / 2 + quiet.left * module;
    const topY = showLabel && labelAbove(spec) ? y + labelReserve : y + 1;
    const layout: BarcodeLayout = { x: startX, y: topY, width: module * dark, height: barH, module, rowHeight: barH, runs, quiet, clip };
    if (showLabel) {
      const labelH = Math.max(9, labelReserve - 1);
      const top = labelAbove(spec) ? y : topY + barH;
      layout.label = { text: barcodeLabel(spec), cx: x + w / 2, baseline: top + labelH * 0.72, top, height: labelH };
    }
    return layout;
  }
  if (!isMatrixSymbology(spec)) return null;
  const quiet = spec.quietZone ?? { left: 0, top: 0, right: 0, bottom: 0 };
  let grid = matrixGrid(spec);
  if (!grid) grid = spec.symbology === 'CODE49' ? fallbackMatrix(spec.data, 17) : fallbackMatrix(spec.data);
  const rows = grid.length;
  const cols = grid[0]?.length ?? rows;
  // Official insets measured on a 124x100 cell: DataMatrix 12 px, PDF417 3 px.
  const inset = spec.symbology === 'PDF417' ? 3 : spec.symbology === 'QRCODE' ? 2 : 12;
  const totalCols = cols + quiet.left + quiet.right;
  const totalRows = rows + quiet.top + quiet.bottom;
  if (spec.symbology === 'PDF417') {
    // Rows are tall bars: width and height fit the cell independently.
    const module = (w - 2 * inset) / totalCols;
    const rowHeight = (h - 2 * inset) / totalRows;
    const startX = x + (w - module * totalCols) / 2 + quiet.left * module;
    const startY = y + (h - rowHeight * totalRows) / 2 + quiet.top * rowHeight;
    return { x: startX, y: startY, width: module * cols, height: rowHeight * rows, module, rowHeight, grid, clip };
  }
  const module = Math.min((w - 2 * inset) / totalCols, (h - 2 * inset) / totalRows);
  const startX = spec.symbology === 'QRCODE'
    ? x + (w - module * totalCols) / 2 + quiet.left * module
    : x + inset + quiet.left * module; // DataMatrix: left-aligned like the official
  const startY = y + (h - module * totalRows) / 2 + quiet.top * module;
  return { x: startX, y: startY, width: module * cols, height: module * rows, module, rowHeight: module, grid, clip };
}

/**
 * Paints the barcode so the whole symbol fits inside the cell rectangle
 * (`min(maxWidth, w)` x `h`); painting is clipped to that rectangle exactly
 * like the official.
 */
export function drawBarcode(ctx: CanvasRenderingContext2D, spec: BarcodePaintSpec, x: number, y: number, w: number, h: number, maxWidth = w): void {
  const cw = Math.max(1, Math.min(maxWidth, w));
  const layout = barcodeLayout(spec, x, y, cw, h);
  if (!layout || (cw < 3 || h < 3)) return;
  const color = spec.color ?? '#000000';
  const back = spec.backColor ?? '#ffffff';
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.clip.x, layout.clip.y, layout.clip.width, layout.clip.height);
  ctx.clip();
  ctx.fillStyle = color;
  if (layout.runs) {
    const quiet = layout.quiet ?? { left: 0, top: 0, right: 0, bottom: 0 };
    // Background only behind the symbol (with its quiet zone), like the official.
    const bgLeft = Math.max(x, Math.round(layout.x - quiet.left * layout.module));
    const bgRight = Math.min(x + cw, Math.ceil(layout.x + layout.width + quiet.right * layout.module));
    ctx.fillStyle = back;
    ctx.fillRect(bgLeft, y, bgRight - bgLeft, h);
    ctx.fillStyle = color;
    let offset = 0;
    for (let i = 0; i < layout.runs.length; i++) {
      const left = Math.round(layout.x + layout.module * offset);
      offset += layout.runs[i];
      const right = Math.round(layout.x + layout.module * offset);
      if (i % 2 === 0 && right > left) ctx.fillRect(left, Math.round(layout.y), right - left, Math.round(layout.height));
    }
  } else if (layout.grid) {
    const { grid, module, rowHeight } = layout;
    ctx.fillStyle = back;
    ctx.fillRect(Math.round(layout.x - 1), Math.round(layout.y - 1), Math.ceil(layout.width + 2), Math.ceil(layout.height + 2));
    ctx.fillStyle = color;
    for (let r = 0; r < grid.length; r++) {
      const top = Math.round(layout.y + r * rowHeight);
      const bottom = Math.round(layout.y + (r + 1) * rowHeight);
      if (bottom <= top) continue;
      const row = grid[r];
      let c = 0;
      while (c < row.length) {
        if (!row[c]) { c++; continue; }
        let run = 1;
        while (c + run < row.length && row[c + run]) run++;
        const left = Math.round(layout.x + c * module);
        const right = Math.round(layout.x + (c + run) * module);
        if (right > left) ctx.fillRect(left, top, right - left, bottom - top);
        c += run;
      }
    }
  }
  if (layout.label) {
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(layout.label.text, layout.label.cx, layout.label.baseline);
  }
  ctx.restore();
}
