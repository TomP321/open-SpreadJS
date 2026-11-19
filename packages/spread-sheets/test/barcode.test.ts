/* Barcode encoders: real symbology vectors plus the deterministic fallbacks. */
import { describe, expect, it } from 'vitest';
import { encodeEAN13, encodeEAN8, encodeQR, moduleStringToRuns, fallbackLinearModules, barcodeLayout, barcodeLabel, drawBarcode, barcodeShowsLabel, type BarcodePaintSpec } from '../src/features/barcode.js';
import { barcodeSpec } from '../src/calc/functions/barcodes.js';
import type { Args } from '../src/calc/evaluate.js';
import { encodeCODE39, code39CheckDigit, encodeCODABAR, codabarLabel, encodeCODE93, encodeCODE128, encodeGS1128 } from '../src/features/barcode-linear.js';
import { encodeDataMatrix, dmReadCodewords, padCodewords, randomize253State, randomize255State } from '../src/features/barcode-datamatrix.js';
import { encodePDF417, pdf417HighLevel, pdf417Generator, pdf417ErrorCorrection, pdf417EcCodewordCount } from '../src/features/barcode-pdf417.js';
import { PDF417_PATTERNS, PDF417_START, PDF417_STOP } from '../src/features/barcode-pdf417-tables.js';

describe('EAN encoders (public standard)', () => {
  it('produces the 95-module EAN-13 pattern with guards', () => {
    const modules = encodeEAN13('590123412345'); // check digit 7 completes 5901234123457
    expect(modules).not.toBeNull();
    expect(modules!.length).toBe(95);
    expect(modules!.startsWith('101')).toBe(true);
    expect(modules!.endsWith('101')).toBe(true);
    expect(modules!.slice(45, 50)).toBe('01010'); // middle guard
    const runs = moduleStringToRuns(modules!);
    expect(runs.reduce((a, b) => a + b, 0)).toBe(95);
  });

  it('encodes EAN-8 to 67 modules', () => {
    const modules = encodeEAN8('96385074'); // 9638507 + check 4
    expect(modules).not.toBeNull();
    expect(modules!.length).toBe(67);
    expect(modules!.startsWith('101')).toBe(true);
  });

  it('rejects too-short payloads', () => {
    expect(encodeEAN13('123')).toBeNull();
    expect(encodeEAN8('12')).toBeNull();
  });

  // Exact module strings verified with a local barcode reader (zxing-cpp) on
  // rendered images; they match the published EAN-13/EAN-8 examples.
  it('reproduces the reference module strings exactly', () => {
    expect(encodeEAN13('5901234123457')).toBe('10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101');
    expect(encodeEAN13('4006381333931')).toBe('10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101');
    expect(encodeEAN13('9780306406157')).toBe('10101110110001001010011101111010100111010111101010101110011100101010000110011010011101000100101');
    expect(encodeEAN13('0012345678905')).toBe('10100011010011001001001101111010100011011000101010101000010001001001000111010011100101001110101');
    expect(encodeEAN8('96385074')).toBe('1010001011010111101111010110111010101001110111001010001001011100101');
    expect(encodeEAN8('73513537')).toBe('1010111011011110101100010011001010101000010100111010000101000100101');
  });

  it('keeps the first 12/7 digits and recomputes the GS1 mod-10 check digit', () => {
    expect(encodeEAN13('5901234123456')).toBe(encodeEAN13('5901234123457')); // 12345 + check 7
    expect(encodeEAN13('4006381333939')!.length).toBe(95);
    expect(encodeEAN8('96385079')).toBe(encodeEAN8('96385074')); // 9638507 + check 4
    // EAN check examples from the GS1 general specification.
    expect(barcodeLabel({ symbology: 'EAN13', data: '400638133393' })).toBe('4006381333931');
    expect(barcodeLabel({ symbology: 'EAN13', data: '978030640615' })).toBe('9780306406157');
    expect(barcodeLabel({ symbology: 'EAN13', data: '5901234123459' })).toBe('5901234123457');
    expect(barcodeLabel({ symbology: 'EAN8', data: '7351353' })).toBe('73513537');
    expect(barcodeLabel({ symbology: 'EAN8', data: '96385079' })).toBe('96385074');
  });

  it('uses the digit-1 parity set L/G on the left and set R on the right', () => {
    // Digit 1 selects the parity (GS1 table); the right half is the L complement.
    const m = encodeEAN13('0012345678905')!; // parity LLLLLL, check 5
    expect(m.slice(3, 45)).toBe(['0', '1', '2', '3', '4', '5'].map((d) => EAN_L_REF[Number(d)]).join(''));
    expect(m.slice(50, 92)).toBe(['6', '7', '8', '9', '0', '5'].map((d) => EAN_R_REF[Number(d)]).join(''));
  });
});

// Reference L / R sets used only by the parity assertion above.
const EAN_L_REF = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R_REF = EAN_L_REF.map((p) => [...p].map((c) => (c === '0' ? '1' : '0')).join(''));

describe('QR encoder (byte mode, versions 1-10)', () => {
  it('builds the correct module grid with finder patterns', () => {
    const qr = encodeQR('HELLO', 'L');
    expect(qr).not.toBeNull();
    expect(qr!.version).toBe(1);
    expect(qr!.modules.length).toBe(21); // 4 * v + 17
    const g = qr!.modules;
    // Finder pattern corners: 7x7 dark ring + 3x3 island, separator light row.
    expect(g[0][0]).toBe(1);
    expect(g[6][0]).toBe(1);
    expect(g[7][0]).toBe(0); // separator
    expect(g[7][7]).toBe(0);
    expect(g[3][3]).toBe(1);
    expect(g[0][20]).toBe(1); // top-right finder
    expect(g[20][0]).toBe(1); // bottom-left finder
    // Timing patterns alternate.
    expect(g[6][8]).toBe(g[6][10]);
    expect(g[6][8]).not.toBe(g[6][9]);
    // Dark module.
    expect(g[13][8]).toBe(1);
  });

  it('is deterministic and grows with payload size / EC level', () => {
    const a = encodeQR('SpreadJS compatible barcode', 'M');
    const b = encodeQR('SpreadJS compatible barcode', 'M');
    expect(JSON.stringify(a!.modules)).toBe(JSON.stringify(b!.modules));
    expect(a!.version).toBeGreaterThan(1);
    expect(a!.modules.length).toBe(4 * a!.version + 17);
    const low = encodeQR('1234567890123456789012345678901234567890123456789012345678901234567890', 'H');
    expect(low!.version).toBeGreaterThan(1);
  });

  it('honours a forced version and reports overflow as null', () => {
    const forced = encodeQR('hi', 'L', 5);
    expect(forced!.version).toBe(5);
    expect(forced!.modules.length).toBe(37);
    expect(encodeQR('x'.repeat(5000), 'H')).toBeNull();
  });
});

describe('deterministic fallback codes', () => {
  it('fallback runs alternate from a dark guard and repeat per input', () => {
    const a = fallbackLinearModules('ABC');
    const b = fallbackLinearModules('ABC');
    expect(a).toEqual(b);
    expect(a[0]).toBeGreaterThanOrEqual(2);
    expect(a.length % 2).toBe(1); // ends with a dark bar
    expect(fallbackLinearModules('ABD')).not.toEqual(a);
  });
});

/* Every expected module string below was derived by hand from the published
 * symbology element tables (two-of-five Code 39, Code 93 codeword widths,
 * Code 128 ISO/IEC 15417 patterns, Codabar AIM BC3 widths, PDF417 ISO/IEC
 * 15438 Annex examples), and each encoder additionally round-trips through an
 * external reference decoder. */

describe('Code 39 (two of five wide elements)', () => {
  it('encodes A between two * delimiters', () => {
    // '*' : bars 3+4 wide, space 1 wide            A : bars 1+5, space 3
    expect(encodeCODE39('A')).toBe('100010111011101' + '0' + '111010100010111' + '0' + '100010111011101');
    expect(encodeCODE39('A')!.length).toBe(47); // 3 symbols * 15 modules + 2 gaps
  });

  it('computes the mod-43 check character', () => {
    expect(code39CheckDigit('123456789')).toBe('2'); // 1+..+9 = 45 mod 43 = 2 -> '2'
    expect(encodeCODE39('A', true)!.length).toBe(63); // one more symbol
  });

  it('rejects characters outside the alphabet', () => {
    expect(encodeCODE39('AB!')).toBeNull();
    expect(code39CheckDigit('AB!')).toBeNull();
  });
});

describe('Codabar (AIM BC3 widths)', () => {
  it('wraps the payload in A delimiters', () => {
    // A : bar 2 wide, spaces 2+3 wide   1 : bar 3 wide, space 3 wide
    expect(encodeCODABAR('1')).toBe('1011100010001' + '0' + '10101110001' + '0' + '1011100010001');
    expect(codabarLabel('12345')).toBe('A12345A');
    expect(codabarLabel('A12B')).toBe('A12B'); // existing delimiters kept
  });

  it('rejects unsupported characters', () => {
    expect(encodeCODABAR('1!2')).toBeNull();
  });
});

describe('Code 93', () => {
  it('appends the C and K check characters', () => {
    // value('A') = 10 -> C = 10*1 % 47 = 10; K = (10*2 + 10*1) % 47 = 30
    expect(encodeCODE93('A')).toBe(
      '101011110' + '110101000' + '110101000' + '110010110' + '101011110' + '1',
    );
    expect(encodeCODE93('ABC123')!.length).toBe(9 + 9 * 8 + 9 + 1); // 91 modules
  });

  it('accepts only the basic alphabet', () => {
    expect(encodeCODE93('a')).toBeNull();
    expect(encodeCODE93('A Z-.$/+%')).not.toBeNull();
  });
});

describe('Code 128 automatic subsets', () => {
  it('uses Start C for an all-digit even-length payload', () => {
    const modules = encodeCODE128('0123456789');
    expect(modules).not.toBeNull();
    expect(modules!.startsWith('11010011100')).toBe(true); // start C pattern 211232
    expect(modules!.length).toBe(11 * 7 + 13); // start + 5 pairs + check + stop
  });

  it('uses Start B and keeps interior digit runs under 6 plain', () => {
    const modules = encodeCODE128('Hi 2024!');
    expect(modules!.startsWith('11010010000')).toBe(true); // start B pattern 211214
    expect(modules!.length).toBe(11 * 10 + 13); // start + 8 chars + check + stop
  });

  it('switches to Start A for control characters', () => {
    const modules = encodeCODE128('AB\tCD');
    expect(modules!.startsWith('11010000100')).toBe(true); // start A pattern 211412
    expect(modules!.length).toBe(11 * 7 + 13);
  });

  it('rejects empty and out-of-range input', () => {
    expect(encodeCODE128('')).toBeNull();
    expect(encodeCODE128('é')).toBeNull();
  });
});

describe('GS1-128', () => {
  it('starts with Start C + FNC1 and inserts AI separators', () => {
    const modules = encodeGS1128('(01)12345678901231(10)45');
    expect(modules).not.toBeNull();
    // start C 211232 then FNC1 411131
    expect(modules!.startsWith('11010011100' + '11110101110')).toBe(true);
    // FNC1, (01)=01, GTIN pairs, FNC1, (10)=10, Code B latch, '4','5'
    expect(modules!.length).toBe(11 * 16 + 13);
  });
});

describe('Data Matrix ECC 200', () => {
  it('picks the smallest square symbol for the payload', () => {
    expect(encodeDataMatrix('12345')!.length).toBe(10); // 8x8 region + finder: digit pairs compress to 3 codewords
    expect(encodeDataMatrix('Hello World! 12345678')!.length).toBe(18); // 16x16 (13 chars + 4 digit-pair codewords)
    expect(encodeDataMatrix('x'.repeat(400))!.length).toBe(80); // 4x4 regions of 18 + separators
    // multi-region: 2x2 regions of 14, one RS block (62 data + 36 EC)
    expect(encodeDataMatrix('The quick brown fox jumps over the lazy dog 0123456789')!.length).toBe(32);
  });

  it('draws the L finder: solid left/bottom, alternating top/right', () => {
    const g = encodeDataMatrix('Hi!')!;
    const n = g.length;
    for (let i = 0; i < n; i++) {
      expect(g[i][0]).toBe(1); // left solid
      expect(g[n - 1][i]).toBe(1); // bottom solid
      expect(g[0][i]).toBe(i % 2 === 0 ? 1 : 0); // top clock
    }
    for (let i = 1; i < n - 1; i++) expect(g[i][n - 1]).toBe((i - 1) % 2 === 0 ? 1 : 0); // right clock
  });

  it('round-trips codewords through the module placement', () => {
    const g = encodeDataMatrix('Hello')!; // 5 ASCII codewords fit the 10x10 region exactly
    expect(g.length).toBe(12);
    const read = dmReadCodewords(g);
    expect(read).not.toBeNull();
    expect(read!.codewords.slice(0, 5)).toEqual([73, 102, 109, 109, 112]); // char + 1
  });

  it('rejects empty payloads', () => {
    expect(encodeDataMatrix('')).toBeNull();
  });

  it('encodes characters 128..255 through the ASCII Upper Shift codeword 235', () => {
    // 'Città' (à = U+00E0): C i t t + [235, 0xE0 - 127] round-trips through the grid.
    const read = dmReadCodewords(encodeDataMatrix('Citt\u00e0')!);
    expect(read).not.toBeNull();
    expect(read!.codewords.slice(0, 6)).toEqual([68, 106, 117, 117, 235, 97]);
  });

  it('randomizes every Base 256 codeword after the latch with the 255-state rule', () => {
    // Annex P: R = ((149 * P) % 255) + 1 for the 1-based stream position P.
    expect(randomize255State(2)).toBe(44);
    expect(randomize255State(3)).toBe(193);
    expect(randomize255State(1555)).toBe(((149 * 1555) % 255) + 1);
    // '€' = UTF-8 E2 82 AC: latch 231 at P=1, then (3+44)%256, (0xE2+193)%256,
    // (0x82 + R(P=4)=87)%256, (0xAC + R(P=5)=236)%256.
    const read = dmReadCodewords(encodeDataMatrix('\u20ac')!);
    expect(read!.codewords.slice(0, 5)).toEqual([231, 47, 163, 217, 152]);
  });

  it('derives pad codewords from the stream position (first pad 129)', () => {
    expect(randomize253State(5)).toBe(240);
    // Pads at P=5/6: 129+240=369>254 -> 115; 129+(149*6%253=135)+1=265>254 -> 11.
    expect(padCodewords([1, 2, 3], 6)).toEqual([1, 2, 3, 129, 115, 11]);
    expect(padCodewords([1, 2, 3], 4)).toEqual([1, 2, 3, 129]);
    expect(padCodewords([1, 2, 3], 3)).toEqual([1, 2, 3]);
    for (let p = 4; p <= 40; p++) {
      const v = padCodewords([1], p)[p - 1];
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(254);
    }
  });
});

describe('PDF417', () => {
  it('numeric compaction follows the ISO example', () => {
    // 000213298174000 -> "1" prefixed base-900 = 1,624,434,632,282,200
    expect(pdf417HighLevel('000213298174000')).toEqual([902, 1, 624, 434, 632, 282, 200, 900]);
  });

  it('text compaction pairs base-30 submode values', () => {
    expect(pdf417HighLevel('ABC')).toEqual([1, 89]); // 0,1,2,28 -> (0,1)(2,28) then pad 29
    expect(pdf417HighLevel('abc')).toEqual([810, 32]); // 27,0,1,2
  });

  it('byte compaction switches at a non-text character', () => {
    const words = pdf417HighLevel('café 42'); // 7 ISO-8859-1 bytes: 901 latch, 6->5 pack, 1 single
    expect(words[0]).toBe(901);
    expect(words.length).toBe(1 + 5 + 1);
  });

  it('error correction has 2^(level+1) codewords and the GF(929) generator g2(x) = x^2 - 12x + 27', () => {
    expect(pdf417EcCodewordCount(0)).toBe(2);
    expect(pdf417EcCodewordCount(2)).toBe(8);
    expect(pdf417EcCodewordCount(8)).toBe(512);
    expect(pdf417Generator(2)).toEqual([27, 917]);
  });

  it('lays out guards, clusters and a consistent codeword stream', () => {
    const grid = encodePDF417('PDF417 test 12345', 2, 1)!;
    const rowBits = (r: number): string => Array.from(grid[r]).join('');
    const startBits = PDF417_START.toString(2).padStart(17, '0');
    const stopBits = PDF417_STOP.toString(2).padStart(18, '0');
    const width = grid[0].length;
    expect((width - 17 - 18) % 17).toBe(0);
    const cols = (width - 35) / 17 - 2;
    expect(cols).toBeGreaterThanOrEqual(1);
    for (let row = 0; row < grid.length; row++) {
      const bits = rowBits(row);
      expect(bits.startsWith(startBits)).toBe(true);
      expect(bits.endsWith(stopBits)).toBe(true);
    }
    // Recover every codeword by exact table lookup and re-check the stream.
    const reverse = new Map<string, { value: number; cluster: number }>();
    for (let c = 0; c < 3; c++) for (let v = 0; v < 929; v++) reverse.set(PDF417_PATTERNS[c][v].toString(2).padStart(17, '0'), { value: v, cluster: c });
    const stream: number[] = [];
    for (let row = 0; row < grid.length; row++) {
      const bits = rowBits(row).slice(17, -18);
      for (let i = 0; i < bits.length; i += 17) {
        const hit = reverse.get(bits.slice(i, i + 17));
        expect(hit, `row ${row} codeword ${i / 17}`).toBeDefined();
        expect(hit!.cluster).toBe(row % 3); // cluster cycles 0,3,6
        if (i !== 0 && i !== bits.length - 17) stream.push(hit!.value); // skip row indicators
      }
    }
    const payload = pdf417HighLevel('PDF417 test 12345');
    const pad = grid.length * cols - (payload.length + 1 + pdf417EcCodewordCount(2));
    expect(stream[0]).toBe(payload.length + pad + 1); // k counts itself
    expect(stream.slice(1, 1 + payload.length)).toEqual(payload);
    const data = stream.slice(0, 1 + payload.length + pad);
    expect(stream.slice(data.length)).toEqual(pdf417ErrorCorrection(data, 2));
  });

  it('scales symbol rows by the row height factor', () => {
    const thin = encodePDF417('ROW', 2, 1)!;
    const tall = encodePDF417('ROW', 2, 3)!;
    expect(tall.length).toBe(thin.length * 3);
    expect(tall[0]).toEqual(thin[0]);
  });
});

/* Fit-to-cell layout: measured against the official 19.2.5 trial (black-box):
 * in a 124x100 merged cell the CODE128 bars span x=10..112, y=1..84 with the
 * label centred under the bars; DataMatrix sits 12 px in from the left; PDF417
 * fills the cell with a 3 px inset. Nothing is painted outside the cell. */
const linearPaintSpec: BarcodePaintSpec = { symbology: 'CODE128', data: 'ABC-1234', showLabel: true };

describe('fit-to-cell barcode layout', () => {
  it('scales the linear module from the cell width and centres the bars', () => {
    const l = barcodeLayout(linearPaintSpec, 150, 160, 124, 100)!;
    expect(l.module).toBeCloseTo(104 / 127, 3); // (124 - 2 x 10 px inset) / (123 + 4 quiet) modules
    expect(l.x).toBeGreaterThan(160);
    expect(l.x + l.width).toBeLessThan(264);
    expect(l.y).toBe(161);
    expect(l.height).toBe(83);
    expect(l.clip).toEqual({ x: 150, y: 160, width: 124, height: 100 });
  });

  it('reserves the label strip under the bars, centred on the cell', () => {
    const l = barcodeLayout(linearPaintSpec, 0, 0, 124, 100)!;
    expect(l.label).toBeDefined();
    expect(l.label!.text).toBe('ABC-1234');
    expect(l.label!.cx).toBe(62);
    expect(l.label!.top).toBeGreaterThanOrEqual(l.y + l.height);
    expect(l.label!.baseline).toBeLessThan(100);
  });

  it('keeps narrow cells inside the rectangle with fractional modules', () => {
    const l = barcodeLayout(linearPaintSpec, 0, 0, 40, 100)!;
    expect(l.module).toBeLessThan(0.5);
    expect(l.x).toBeGreaterThanOrEqual(0);
    expect(l.x + l.width).toBeLessThanOrEqual(40);
  });

  it('insets matrix codes like the official', () => {
    const dm = barcodeLayout({ symbology: 'DATAMATRIX', data: 'Hello 42' }, 0, 0, 124, 100)!;
    expect(dm.x).toBe(12); // left aligned with the official 12 px margin
    expect(dm.width).toBeCloseTo(dm.height, 6); // square, never stretched
    expect(dm.x + dm.width).toBeLessThan(124);
    expect(dm.y + dm.height).toBeLessThan(100);
    const pdf = barcodeLayout({ symbology: 'PDF417', data: 'Hello 42' }, 0, 0, 124, 100)!;
    expect(pdf.x).toBeCloseTo(3, 1);
    expect(pdf.x + pdf.width).toBeLessThanOrEqual(121.5);
    expect(pdf.y + pdf.height).toBeLessThanOrEqual(97.5);
  });

  it('drawBarcode clips to the cell and never paints outside it', () => {
    const rects: number[][] = [];
    const texts: number[][] = [];
    let clip: number[] = [];
    let saves = 0;
    let restores = 0;
    const ctx = {
      save: (): void => { saves++; },
      restore: (): void => { restores++; },
      beginPath: (): void => undefined,
      clip: (): void => undefined,
      rect: (...a: number[]): void => { clip = a; },
      fillRect: (...a: number[]): void => { rects.push(a); },
      fillText: (t: string, x: number, y: number): void => { texts.push([x, y]); void t; },
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    drawBarcode(ctx, linearPaintSpec, 0, 0, 124, 100);
    expect(clip).toEqual([0, 0, 124, 100]);
    expect(saves).toBe(restores);
    expect(rects.length).toBeGreaterThan(10);
    expect(texts).toEqual([[62, expect.any(Number)]]);
    for (const [x, y, w, h] of rects) {
      expect(x, `rect x=${x}`).toBeGreaterThanOrEqual(-0.5);
      expect(y, `rect y=${y}`).toBeGreaterThanOrEqual(0);
      expect(x + w, `rect right=${x + w}`).toBeLessThanOrEqual(124.5);
      expect(y + h, `rect bottom=${y + h}`).toBeLessThanOrEqual(100);
    }
  });
});

const fakeArgs = (values: unknown[]): Args =>
  ({
    count: values.length,
    text: (i: number) => String(values[i] ?? ''),
    boolean: (i: number) => Boolean(values[i]),
    safe: (i: number) => values[i] ?? null,
  }) as unknown as Args;

describe('BC_ formula label defaults', () => {
  it('shows the label for linear symbologies and hides it for matrix ones', () => {
    expect(barcodeShowsLabel(barcodeSpec('CODE128', fakeArgs(['ABC-1234'])))).toBe(true);
    expect(barcodeShowsLabel(barcodeSpec('CODE39', fakeArgs(['ABC'])))).toBe(true);
    expect(barcodeShowsLabel(barcodeSpec('DATAMATRIX', fakeArgs(['ABC'])))).toBe(false);
    expect(barcodeShowsLabel(barcodeSpec('PDF417', fakeArgs(['ABC'])))).toBe(false);
    expect(barcodeShowsLabel(barcodeSpec('QRCODE', fakeArgs(['ABC'])))).toBe(false);
    // An explicit showLabel argument still wins.
    expect(barcodeShowsLabel(barcodeSpec('CODE128', fakeArgs(['ABC', '', '', false])))).toBe(false);
    expect(barcodeShowsLabel(barcodeSpec('EAN13', fakeArgs(['96385074', '', '', true])))).toBe(true);
  });
});
