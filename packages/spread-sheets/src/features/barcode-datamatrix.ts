/*
 * Data Matrix ECC 200 (square symbols), implemented from the public
 * ISO/IEC 16022:2000(E) specification: ASCII encodation (Annex B, digits
 * compressed in pairs, characters 128..255 via Upper Shift 235, with a
 * Base 256 (UTF-8, Annex P randomized) fallback for higher code points),
 * Annex E Reed-Solomon over GF(256) with modulus x^8+x^5+x^3+x^2+1 (0x12D)
 * and generator g(x) = (x-2)(x-2^2)...(x-2^ec), Annex X codeword placement
 * ("Utah" template plus the four corner treatments and the fixed-pattern
 * bottom-right special case) and the standard square symbol-size table
 * (10x10 up to 120x120).
 */

export type DMGrid = Uint8Array[];

/* ------------------------------------------------------- GF(256) / RS --- */

const DM_EXP = new Uint8Array(512);
const DM_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    DM_EXP[i] = x;
    DM_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x12d;
  }
  for (let i = 255; i < 512; i++) DM_EXP[i] = DM_EXP[i - 255];
}
const dmMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : DM_EXP[DM_LOG[a] + DM_LOG[b]]);

/** Reed-Solomon generator of degree `degree`: prod_{i=1..degree} (x - 2^i), descending coefficients. */
export function dmGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 1; i <= degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= dmMul(poly[j], DM_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

const dmEncodeBlock = (data: number[], ecLength: number): number[] => {
  const gen = dmGenerator(ecLength);
  const remainder = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) for (let i = 0; i < ecLength; i++) remainder[i] ^= dmMul(gen[i + 1], factor);
  }
  return remainder;
};

/* ---------------------------------------------------------- symbol sizes -- */

/*
 * Square ECC 200 sizes. `region` is the data-module side of one block region
 * and `regions` the number of regions in the whole symbol (sqrt gives the
 * regions per side). Multi-block sizes interleave error correction codewords
 * between the blocks; the data codewords stay in stream order.
 */
interface DMSize { data: number; ec: number; region: number; regions: number; blocks: number }
const DM_TABLE: DMSize[] = [
  { data: 3, ec: 5, region: 8, regions: 1, blocks: 1 },
  { data: 5, ec: 7, region: 10, regions: 1, blocks: 1 },
  { data: 8, ec: 10, region: 12, regions: 1, blocks: 1 },
  { data: 12, ec: 12, region: 14, regions: 1, blocks: 1 },
  { data: 18, ec: 14, region: 16, regions: 1, blocks: 1 },
  { data: 22, ec: 18, region: 18, regions: 1, blocks: 1 },
  { data: 30, ec: 20, region: 20, regions: 1, blocks: 1 },
  { data: 36, ec: 24, region: 22, regions: 1, blocks: 1 },
  { data: 44, ec: 28, region: 24, regions: 1, blocks: 1 },
  { data: 62, ec: 36, region: 14, regions: 4, blocks: 1 },
  { data: 86, ec: 42, region: 16, regions: 4, blocks: 1 },
  { data: 114, ec: 48, region: 18, regions: 4, blocks: 1 },
  { data: 144, ec: 56, region: 20, regions: 4, blocks: 1 },
  { data: 174, ec: 68, region: 22, regions: 4, blocks: 1 },
  { data: 204, ec: 84, region: 24, regions: 4, blocks: 2 },
  { data: 280, ec: 112, region: 14, regions: 16, blocks: 2 },
  { data: 368, ec: 144, region: 16, regions: 16, blocks: 4 },
  { data: 456, ec: 192, region: 18, regions: 16, blocks: 4 },
  { data: 576, ec: 224, region: 20, regions: 16, blocks: 4 },
  { data: 696, ec: 272, region: 22, regions: 16, blocks: 4 },
  { data: 816, ec: 336, region: 24, regions: 16, blocks: 6 },
  { data: 1050, ec: 408, region: 18, regions: 36, blocks: 6 },
  { data: 1304, ec: 496, region: 20, regions: 36, blocks: 8 },
];

/* ------------------------------------------------------------- encoding --- */

const ASCII_FNC1 = 233;
const ASCII_UPPER_SHIFT = 235;
const BASE256_LATCH = 231;
const isDigit = (char: string): boolean => char >= '0' && char <= '9';

/** ASCII encodation codewords; null when a code point above 255 needs Base 256. */
function asciiCodewords(text: string): number[] | null {
  const cw: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (isDigit(text[i]) && i + 1 < text.length && isDigit(text[i + 1])) {
      cw.push(130 + Number(text[i]) * 10 + Number(text[i + 1]));
      i += 2;
      continue;
    }
    const code = text.charCodeAt(i);
    if (code === 0) return null;
    if (code === 127) {
      cw.push(ASCII_FNC1, 0); // FNC1 + (DEL + 1 - 128)
      i++;
      continue;
    }
    if (code > 255) return null; // needs the Base 256 (UTF-8) route
    if (code > 127) {
      // Standard ASCII "Upper Shift": 235 then (charCode - 127); readers
      // return the Latin-1 character directly.
      cw.push(ASCII_UPPER_SHIFT, code - 127);
      i++;
      continue;
    }
    cw.push(code + 1);
    i++;
  }
  return cw;
}

/**
 * Base 256 codewords: latch (not randomized) at the 1-based stream position
 * `startPos`, then the length field and every data byte (UTF-8) randomized
 * with the 255-state Annex P algorithm. Length is one codeword below 250 and
 * two codewords (floor(d / 250) + 249, d % 250) for 250..1555.
 */
function base256Codewords(text: string, startPos = 1): number[] | null {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  const n = bytes.length;
  if (n === 0 || n > 1555) return null;
  const cw: number[] = [BASE256_LATCH];
  let position = startPos; // 1-based position of the latch in the data stream
  const randomized = (value: number): number => (value + randomize255State(++position)) % 256;
  if (n < 250) {
    cw.push(randomized(n));
  } else {
    cw.push(randomized(Math.floor(n / 250) + 249), randomized(n % 250));
  }
  for (const byte of bytes) cw.push(randomized(byte));
  return cw;
}

/** Annex P randomization state for Base 256 codeword position `position` (1-based). */
export const randomize255State = (position: number): number => ((149 * position) % 255) + 1;

/** Annex P randomization state for pad position `position` (1-based). */
export const randomize253State = (position: number): number => ((149 * position) % 253) + 1;

/**
 * Pad the codeword stream to `capacity`: the first pad is 129; each further
 * pad at 1-based stream position P is 129 + randomize253State(P), reduced by
 * 254 when it exceeds 254 (ISO/IEC 16022 Annex P).
 */
export function padCodewords(cw: number[], capacity: number): number[] {
  const result = [...cw];
  while (result.length < capacity) {
    if (result.length === cw.length) {
      result.push(129);
      continue;
    }
    let pad = 129 + randomize253State(result.length + 1);
    if (pad > 254) pad -= 254;
    result.push(pad);
  }
  return result;
}

/* ------------------------------------------------------------ placement --- */

/**
 * Annex X.3: the order in which the n x n data region receives bits
 * (codeword i contributes its 8 bits MSB-first at order[i*8 .. i*8+7]).
 */
export function dmPlacementOrder(n: number): [number, number][] {
  const order: [number, number][] = [];
  const seen = (row: number, col: number): void => {
    order.push([row, col]);
  };
  const module = (row: number, col: number): void => {
    let r = row;
    let c = col;
    if (r < 0) {
      r += n;
      c += 4 - ((n + 4) % 8);
    }
    if (c < 0) {
      c += n;
      r += 4 - ((n + 4) % 8);
    }
    seen(r, c);
  };
  const utah = (row: number, col: number): void => {
    module(row - 2, col - 2);
    module(row - 2, col - 1);
    module(row - 1, col - 2);
    module(row - 1, col - 1);
    module(row - 1, col);
    module(row, col - 2);
    module(row, col - 1);
    module(row, col);
  };
  const corner1 = (): void => {
    module(n - 1, 0);
    module(n - 1, 1);
    module(n - 1, 2);
    module(0, n - 2);
    module(0, n - 1);
    module(1, n - 1);
    module(2, n - 1);
    module(3, n - 1);
  };
  const corner2 = (): void => {
    module(n - 3, 0);
    module(n - 2, 0);
    module(n - 1, 0);
    module(0, n - 4);
    module(0, n - 3);
    module(0, n - 2);
    module(0, n - 1);
    module(1, n - 1);
  };
  const corner3 = (): void => {
    module(n - 3, 0);
    module(n - 2, 0);
    module(n - 1, 0);
    module(0, n - 2);
    module(0, n - 1);
    module(1, n - 1);
    module(2, n - 1);
    module(3, n - 1);
  };
  const corner4 = (): void => {
    module(n - 1, 0);
    module(n - 1, n - 1);
    module(0, n - 3);
    module(0, n - 2);
    module(0, n - 1);
    module(1, n - 3);
    module(1, n - 2);
    module(1, n - 1);
  };
  let row = 4;
  let col = 0;
  do {
    if (row === n && col === 0) corner1();
    if (row === n - 2 && col === 0 && n % 4 !== 0) corner2();
    if (row === n - 2 && col === 0 && n % 8 === 4) corner3();
    if (row === n + 4 && col === 2 && n % 8 === 0) corner4();
    do {
      if (row < n && col >= 0 && !has(row, col)) utah(row, col);
      row -= 2;
      col += 2;
    } while (row >= 0 && col < n);
    row++;
    col += 3;
    do {
      if (row >= 0 && col < n && !has(row, col)) utah(row, col);
      row += 2;
      col -= 2;
    } while (row < n && col >= 0);
    row += 3;
    col++;
  } while (row < n || col < n);
  function has(r: number, c: number): boolean {
    for (let i = order.length - 1; i >= 0; i--) if (order[i][0] === r && order[i][1] === c) return true;
    return false;
  }
  return order;
}

/** Place codewords into the n x n data region grid (1 = dark module). */
export function dmPlace(codewords: number[], n: number): Uint8Array[] {
  const grid = Array.from({ length: n }, () => new Uint8Array(n));
  const filled = Array.from({ length: n }, () => new Uint8Array(n));
  const order = dmPlacementOrder(n);
  order.forEach(([r, c], bit) => {
    const value = (codewords[Math.floor(bit / 8)] >> (7 - (bit % 8))) & 1;
    grid[r][c] = value;
    filled[r][c] = 1;
  });
  if (!filled[n - 1][n - 1]) {
    grid[n - 1][n - 1] = 1;
    grid[n - 2][n - 2] = 1;
  }
  return grid;
}

/**
 * Surround the placed data regions with the L-finder (solid left/bottom,
 * alternating top/right). Multi-region symbols repeat the finder around every
 * region: side * (region + 2) modules (each region keeps its own separator
 * lines; the ISO placement runs over the combined data area).
 */
function dmSymbol(data: Uint8Array[], region: number): DMGrid {
  const n = data.length;
  const side = Math.max(1, Math.round(n / region));
  const size = n + 2 * side;
  const out = Array.from({ length: size }, () => new Uint8Array(size));
  let oy = 0;
  for (let y = 0; y < n; y++) {
    if (y % region === 0) {
      // top clock row per region band: alternation restarts at each band's edge
      for (let x = 0; x < size; x++) out[oy][x] = x % (region + 2) % 2 === 0 ? 1 : 0;
      oy++;
    }
    let ox = 0;
    for (let x = 0; x < n; x++) {
      if (x % region === 0) {
        out[oy][ox] = 1;
        ox++;
      }
      out[oy][ox] = data[y][x];
      ox++;
      if (x % region === region - 1) {
        out[oy][ox] = y % 2 === 0 ? 1 : 0;
        ox++;
      }
    }
    oy++;
    if (y % region === region - 1) {
      for (let x = 0; x < size; x++) out[oy][x] = 1;
      oy++;
    }
  }
  return out;
}

/** Encode `text` into a full square ECC 200 grid (with finder), null if it does not fit 120x120. */
export function encodeDataMatrix(text: string): DMGrid | null {
  if (!text) return null;
  let cw = asciiCodewords(text);
  if (!cw) cw = base256Codewords(text);
  if (!cw) return null;
  const entry = DM_TABLE.find((size) => cw!.length <= size.data);
  if (!entry) return null;
  const padded = padCodewords(cw, entry.data);
  const stream = [...padded];
  if (entry.blocks === 1) {
    stream.push(...dmEncodeBlock(padded, entry.ec));
  } else {
    const ecBlocks: number[][] = [];
    for (let b = 0; b < entry.blocks; b++) {
      const block: number[] = [];
      for (let i = b; i < padded.length; i += entry.blocks) block.push(padded[i]);
      ecBlocks.push(dmEncodeBlock(block, Math.floor(entry.ec / entry.blocks)));
    }
    for (let i = 0; i < Math.floor(entry.ec / entry.blocks); i++) for (const block of ecBlocks) stream.push(block[i]);
  }
  const side = Math.floor(Math.sqrt(entry.regions));
  const n = entry.region * side;
  return dmSymbol(dmPlace(stream, n), entry.region);
}

/** Decode a previously encoded square symbol back to codewords (round-trip test helper). */
export function dmReadCodewords(symbol: DMGrid): { codewords: number[]; region: number; side: number } | null {
  const size = symbol.length;
  for (const entry of DM_TABLE) {
    const side = Math.floor(Math.sqrt(entry.regions));
    const n = entry.region * side;
    if (size !== n + 2 * side) continue;
    const region = entry.region;
    const data: number[] = [];
    const order = dmPlacementOrder(n);
    const grid = Array.from({ length: n }, (_, r) => Uint8Array.from({ length: n }, (_v, c) => {
      // strip the finder modules: row r maps to symbol row r + floor(r/region) + 1
      const extraRows = Math.floor(r / region) + 1;
      const extraCols = Math.floor(c / region) + 1;
      return symbol[r + extraRows][c + extraCols];
    }));
    order.forEach(([r, c], bit) => {
      void bit;
      void r;
      void c;
    });
    for (let i = 0; i < order.length; i += 8) {
      if (i + 8 > order.length) break;
      let value = 0;
      for (let b = 0; b < 8; b++) value = (value << 1) | grid[order[i + b][0]][order[i + b][1]];
      data.push(value);
    }
    return { codewords: data, region: entry.region, side };
  }
  return null;
}
