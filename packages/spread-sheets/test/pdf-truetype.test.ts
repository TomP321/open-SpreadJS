/* @vitest-environment jsdom*/
/* Unit tests for Task 17: `PDFFontsManager.registerFont`/`fallbackFont`, the
 * TrueType parser, and Unicode text drawn with embedded Type0/CIDFontType2
 * fonts by `Workbook.savePDF`. The fixture fonts are ours (see
 * test/fixtures/README.md). Extracted text is read back from the produced
 * document through the ToUnicode CMap, exactly what PDF readers use. */
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import { exportWorkbookPdf } from '../src/pdf/export.js';
import { PdfCanvasContext, PdfResourcePool, createPdfReport } from '../src/pdf/pdf-context.js';
import { PdfWriter } from '../src/pdf/pdf-writer.js';
import { resetPdfFontsForTesting } from '../src/pdf/fonts-manager.js';
import { parseTrueTypeFont } from '../src/pdf/truetype.js';
import { subsetFontTag, subsetTrueTypeFont } from '../src/pdf/truetype-subset.js';

const { PDF } = GC.Spread.Sheets as unknown as {
  PDF: { PDFFontsManager: {
    registerFont(name: string, font: Record<string, unknown>): void;
    fallbackFont(...args: unknown[]): unknown;
    new (): unknown;
  } };
};
const Manager = PDF.PDFFontsManager;

// jsdom rewrites `import.meta.url`, so resolve the fixtures relative to cwd
// (vitest runs each package from its directory).
const REGULAR = new Uint8Array(readFileSync('test/fixtures/f17-sample-regular.ttf'));
const BOLD = new Uint8Array(readFileSync('test/fixtures/f17-sample-bold.ttf'));
const COMPOSITE = new Uint8Array(readFileSync('test/fixtures/f17-sample-composite.ttf'));
const REGULAR_FONT = parseTrueTypeFont(REGULAR);
const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const REGULAR_B64 = toBase64(REGULAR);
const BOLD_B64 = toBase64(BOLD);

afterEach(() => {
  resetPdfFontsForTesting();
});

/* ---------------------------------------------------------- TrueType parser */

describe('TrueType parser', () => {
  it('reads the metadata tables the PDF writer needs', () => {
    const font = parseTrueTypeFont(REGULAR);
    expect(font.unitsPerEm).toBe(1000);
    expect(font.ascender).toBe(800);
    expect(font.descender).toBe(-200);
    expect(font.postScriptName).toBe('OpenSheetsF17');
    expect(font.bold).toBe(false);
    expect(font.italic).toBe(false);
    expect(font.capHeight).toBe(700);
    // cmap format 4 (BMP) glyphs.
    expect(font.glyphId(0x41 /* A */)).toBeGreaterThan(0);
    expect(font.glyphId(0xe9 /* é */)).toBeGreaterThan(0);
    expect(font.glyphId(0x3a3 /* Σ */)).toBeGreaterThan(0);
    // cmap format 12 (astral) glyph — only reachable through format 12.
    expect(font.glyphId(0x1f600)).toBeGreaterThan(0);
    expect(font.glyphId(0x65e5 /* 日, not in the fixture */)).toBe(0);
    // hmtx advances (fixture values, 1/1000 em with unitsPerEm 1000).
    expect(font.advanceWidthInEm(font.glyphId(0x41))).toBe(600);
    expect(font.advanceWidthInEm(font.glyphId(0x3a9 /* Ω */))).toBe(720);
  });

  it('distinguishes the bold face', () => {
    const font = parseTrueTypeFont(BOLD);
    expect(font.postScriptName).toBe('OpenSheetsF17-Bold');
    expect(font.bold).toBe(true);
    expect(font.advanceWidthInEm(font.glyphId(0x41))).toBe(660);
  });

  it('computes Blink\'s canvas baseline offsets from the typo metrics', () => {
    const font = parseTrueTypeFont(REGULAR);
    expect(font.typoAscender).toBe(780);
    expect(font.typoDescender).toBe(-220);
    // Blink (TextMetrics::GetFontBaseline + SimpleFontData::NormalizedTypoAscentAndDescent):
    // normalize typo(780/-220 -> sum 1.0em) and quantize through LayoutUnit (1/64 px).
    expect(font.canvasBaselineOffset(16, 'top')).toBe(Math.round(780 * 16 * 64 / 1000) / 64); // 12.484375
    expect(font.canvasBaselineOffset(16, 'bottom')).toBe(-3.515625);
    expect(font.canvasBaselineOffset(16, 'middle')).toBe((12.484375 - 3.515625) / 2);
    // Verified against Chromium's raster of 'H' at 1000px for LiberationSerif
    // (OS/2 1420/-442, hhea 1825/-443): top 763, bottom -237, middle 263 —
    // not the hhea rule, which gives 892/-216/338 there.
    const serifPath = '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf';
    if (existsSync(serifPath)) {
      const serif = parseTrueTypeFont(new Uint8Array(readFileSync(serifPath)));
      // 1420*1000/(1420+442) = 762.621 -> LayoutUnit(1/64) = 762.625. The
      // raster probe reads whole pixels (hinting grid-fits the ink edge), so
      // the browser measurement agrees within that quantization.
      expect(serif.canvasBaselineOffset(1000, 'top')).toBe(762.625);
      expect(serif.canvasBaselineOffset(1000, 'bottom')).toBeCloseTo(-237.375, 6);
      expect(serif.canvasBaselineOffset(1000, 'middle')).toBeCloseTo(262.625, 6);
    }
  });

  it('rejects data that is not a supported TrueType font', () => {
    expect(() => parseTrueTypeFont(new Uint8Array([1, 2, 3]))).toThrow(/too short/);
    expect(() => parseTrueTypeFont(new TextEncoder().encode('not a font at all!'))).toThrow(/not a TrueType font/);
    const cff = new Uint8Array(REGULAR.length);
    cff.set([0x4f, 0x54, 0x54, 0x4f], 0); // 'OTTO'
    cff.set(REGULAR.subarray(4), 4);
    expect(() => parseTrueTypeFont(cff)).toThrow(/CFF/);
  });
});

/* ------------------------------------------------------- PDFFontsManager API */

describe('PDFFontsManager API', () => {
  it('is exposed on the GC namespace without a NotImplemented stub', () => {
    expect(typeof Manager).toBe('function');
    const stub = Symbol.for('@opensheets/NotImplemented');
    expect((Manager as unknown as Record<symbol, unknown>)[stub]).toBeUndefined();
    expect(typeof Manager.registerFont).toBe('function');
    expect(typeof Manager.fallbackFont).toBe('function');
    expect((Manager.registerFont as unknown as Record<symbol, unknown>)[stub]).toBeUndefined();
    expect((Manager.fallbackFont as unknown as Record<symbol, unknown>)[stub]).toBeUndefined();
    expect(() => new Manager()).not.toThrow();
  });

  it('validates registerFont arguments like the docs describe', () => {
    expect(() => Manager.registerFont('', { normal: REGULAR_B64 })).toThrow(TypeError);
    expect(() => Manager.registerFont(42 as unknown as string, { normal: REGULAR_B64 })).toThrow(TypeError);
    expect(() => Manager.registerFont('X', null as unknown as Record<string, unknown>)).toThrow(TypeError);
    expect(() => Manager.registerFont('X', {})).toThrow(/at least one/);
    expect(() => Manager.registerFont('X', { normal: 7 as unknown as string })).toThrow(/base64 string or ArrayBuffer/);
    expect(() => Manager.registerFont('X', { normal: 'not base64!!' })).toThrow(/base64 string or ArrayBuffer/);
    expect(() => Manager.registerFont('X', { normal: 'AAAA' })).toThrow(/base64 string or ArrayBuffer/); // decodes, but is no font
    const truncated = Buffer.from(REGULAR.slice(0, 400)).toString('base64');
    expect(() => Manager.registerFont('X', { normal: truncated })).toThrow(/truncated|out of range|too small|too short/);
  });

  it('accepts base64 strings, data URLs and byte arrays', async () => {
    const expected = [
      ['By String', 'OpenSheetsF17'],
      ['By Data URL', 'OpenSheetsF17'],
      ['By Buffer', 'OpenSheetsF17'],
      ['By View', 'OpenSheetsF17-Bold'],
    ] as const;
    Manager.registerFont('By String', { normal: REGULAR_B64 });
    Manager.registerFont('By Data URL', { normal: `data:font/ttf;base64,${REGULAR_B64}` });
    Manager.registerFont('By Buffer', { normal: REGULAR.buffer.slice(REGULAR.byteOffset, REGULAR.byteOffset + REGULAR.byteLength) });
    Manager.registerFont('By View', { normal: BOLD });
    for (const [name, psName] of expected) {
      const { bytes } = await exportWorkbookPdf(sheetWithFont(`12pt "${name}"`, 'AΩ'), {}, 0);
      const fonts = type0Fonts(readPdf(bytes));
      expect(fonts, name).toHaveLength(1);
      splitSubsetTag(fonts[0]!.baseFont, psName);
    }
  });

  it('fallbackFont works as getter/setter and keeps value semantics', () => {
    expect(Manager.fallbackFont()).toBeNull();
    expect(Manager.fallbackFont('OpenSheets F17')).toBe('OpenSheets F17');
    expect(Manager.fallbackFont()).toBe('OpenSheets F17');
    const provider = (): null => null;
    Manager.fallbackFont(provider);
    expect(Manager.fallbackFont()).toBe(provider);
    Manager.fallbackFont(BOLD_B64);
    expect(Manager.fallbackFont()).toBe(BOLD_B64);
    expect(Manager.fallbackFont(null)).toBeNull();
    expect(Manager.fallbackFont()).toBeNull();
    expect(() => Manager.fallbackFont(17 as unknown as string)).toThrow(TypeError);
  });
});

/* ------------------------------------------------------------- pdf helpers */

interface PdfObject { number: number; dict: string; stream: string | null }

/** Read the objects of a document written by `PdfWriter` (its exact layout). */
function readPdf(bytes: Uint8Array): Map<number, PdfObject> {
  const text = Buffer.from(bytes).toString('latin1');
  const objects = new Map<number, PdfObject>();
  const header = /(\d+) 0 obj\n/g;
  const marks: { number: number; start: number; body: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) marks.push({ number: Number(match[1]), start: match.index, body: match.index + match[0].length });
  const xrefAt = text.lastIndexOf('\nxref\n');
  for (const [index, mark] of marks.entries()) {
    const next = marks[index + 1]?.start ?? xrefAt;
    const chunk = text.slice(mark.body, next);
    const streamAt = chunk.indexOf('\nstream\n');
    const dict = streamAt >= 0 ? chunk.slice(0, streamAt) : chunk.replace(/\nendobj\n$/, '');
    let stream: string | null = null;
    if (streamAt >= 0) {
      const length = Number(/\/Length (\d+)/.exec(dict)?.[1]);
      const from = mark.body + streamAt + '\nstream\n'.length;
      stream = text.slice(from, from + length);
    }
    objects.set(mark.number, { number: mark.number, dict, stream });
  }
  return objects;
}

function streamText(object: PdfObject): string {
  const raw = Buffer.from(object.stream ?? '', 'latin1');
  return object.dict.includes('/FlateDecode') ? Buffer.from(inflateSync(raw)).toString('latin1') : raw.toString('latin1');
}

/** Every content stream in the document (page paint order). */
function contents(objects: Map<number, PdfObject>): string[] {
  return [...objects.values()]
    .filter((object) => /\/Type \/Page[\s\n>]/.test(object.dict) && !object.dict.includes('/Type /Pages'))
    .sort((a, b) => Number(/\/Contents (\d+) 0 R/.exec(a.dict)?.[1]) - Number(/\/Contents (\d+) 0 R/.exec(b.dict)?.[1]))
    .map((page) => streamText(objects.get(Number(/\/Contents (\d+) 0 R/.exec(page.dict)?.[1]))!));
}

interface Type0Font {
  alias: string;
  baseFont: string;
  dict: PdfObject;
  /** gid -> unicode from the ToUnicode CMap. */
  toUnicode: Map<number, number>;
  /** The raw `/W` array text. */
  widths: string;
  fontFileLength1: number | null;
  /** Decompressed `FontFile2` program bytes (Task 22: the subset). */
  fontFileBytes: Uint8Array | null;
}

/** Collect the embedded Type0 fonts with their ToUnicode maps. */
function type0Fonts(objects: Map<number, PdfObject>): Type0Font[] {
  const result: Type0Font[] = [];
  const resources = [...objects.values()].find((object) => /\/Font <</.test(object.dict));
  if (!resources) return result;
  const aliases = new Map<string, number>();
  for (const entry of resources.dict.matchAll(/\/(F\d+) (\d+) 0 R/g)) aliases.set(entry[1]!, Number(entry[2]));
  const resolve = (dict: string | undefined, key: string): PdfObject | undefined => {
    const match = dict ? new RegExp(`/${key}\\s*(?:\\[\\s*)?(\\d+) 0 R`).exec(dict) : null;
    return match ? objects.get(Number(match[1])) : undefined;
  };
  for (const [alias, number] of aliases) {
    const fontObject = objects.get(number);
    if (!fontObject || !/\/Subtype \/Type0/.test(fontObject.dict)) continue;
    const baseFont = /\/BaseFont \/([\w#+.-]+)/.exec(fontObject.dict)?.[1] ?? '';
    const descendant = resolve(fontObject.dict, 'DescendantFonts');
    const toUnicode = new Map<number, number>();
    const cmapObject = resolve(fontObject.dict, 'ToUnicode');
    if (cmapObject) {
      const cmap = streamText(cmapObject);
      for (const block of cmap.matchAll(/beginbfchar\n([\s\S]*?)endbfchar/g)) {
        for (const entry of block[1]!.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g)) {
          const gid = parseInt(entry[1]!, 16);
          const units = entry[2]!.match(/.{4}/g)!.map((part) => parseInt(part, 16));
          let code = units[0]!;
          if (code >= 0xd800 && code <= 0xdbff && units.length > 1) {
            code = 0x10000 + ((code - 0xd800) << 10) + (units[1]! - 0xdc00);
          }
          toUnicode.set(gid, code);
        }
      }
    }
    const descriptor = resolve(descendant?.dict, 'FontDescriptor');
    const fontFile = resolve(descriptor?.dict, 'FontFile2');
    result.push({
      alias,
      baseFont,
      dict: fontObject,
      toUnicode,
      widths: /\/W \[([\s\S]*)\] \/CIDToGIDMap/.exec(descendant?.dict ?? '')?.[1]?.trim() ?? '',
      fontFileLength1: fontFile ? Number(/\/Length1 (\d+)/.exec(fontFile.dict)?.[1]) : null,
      fontFileBytes: fontFile ? decompress(fontFile) : null,
    });
  }
  return result;
}

/** Inflated (when needed) bytes of an object's stream. */
function decompress(object: PdfObject): Uint8Array {
  const raw = Buffer.from(object.stream ?? '', 'latin1');
  return object.dict.includes('/FlateDecode') ? new Uint8Array(inflateSync(raw)) : new Uint8Array(raw);
}

/**
 * A `/BaseFont`/`FontName` of an embedded subset must carry the standard
 * 6-letter tag; assert that shape and return the underlying family name.
 */
function splitSubsetTag(baseFont: string, family: string): string {
  const match = /^([A-Z]{6})\+(.*)$/.exec(baseFont);
  expect(match, `subset tag in ${baseFont}`).not.toBeNull();
  expect(match![2]).toBe(family);
  return match![1]!;
}

/** Table directory of a (sub)set sfnt, as built by `subsetTrueTypeFont`. */
function sfntTables(bytes: Uint8Array): Map<string, { offset: number; length: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0)).toBe(0x00010000);
  const tables = new Map<string, { offset: number; length: number }>();
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(entry), view.getUint8(entry + 1), view.getUint8(entry + 2), view.getUint8(entry + 3));
    tables.set(tag, { offset: view.getUint32(entry + 8), length: view.getUint32(entry + 12) });
  }
  return tables;
}

/** Byte length of glyph `gid`'s program in an sfnt's `glyf`/`loca`. */
function glyphDataLength(bytes: Uint8Array, gid: number): number {
  const tables = sfntTables(bytes);
  const loca = tables.get('loca')!;
  const head = tables.get('head')!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const long = view.getInt16(head.offset + 50) === 1;
  const entry = (i: number): number => (long ? view.getUint32(loca.offset + i * 4) : view.getUint16(loca.offset + i * 2) * 2);
  return entry(gid + 1) - entry(gid);
}

/** Decode every `<hex> Tj` run of `alias` on all pages using its ToUnicode map. */
function extractText(objects: Map<number, PdfObject>, alias: string): string {
  const font = type0Fonts(objects).find((entry) => entry.alias === alias);
  if (!font) return '';
  let text = '';
  for (const content of contents(objects)) {
    for (const run of content.matchAll(new RegExp(`/${alias} [\\d.]+ Tf\\n<([0-9A-Fa-f]+)> Tj`, 'g'))) {
      const hex = run[1]!;
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        const code = font.toUnicode.get(parseInt(hex.slice(i, i + 4), 16));
        if (code !== undefined) text += String.fromCodePoint(code);
      }
    }
  }
  return text;
}

/* ------------------------------------------------------------ end-to-end */

function sheetWithFont(font: string, text: string): ReturnType<typeof makeBook> {
  return makeBook((sheet) => {
    sheet.getCell(1, 1).font(font);
    sheet.setValue(1, 1, text);
  });
}

function makeBook(setup: (sheet: Worksheet) => void): import('../src/workbook.js').Workbook {
  const workbook = new GC.Spread.Sheets.Workbook() as unknown as import('../src/workbook.js').Workbook;
  setup(workbook.getSheet(0) as unknown as Worksheet);
  return workbook;
}

describe('savePDF with embedded fonts', () => {
  it('embeds the registered family and the extracted text equals the cell text', async () => {
    Manager.registerFont('OpenSheets F17', { normal: REGULAR_B64, bold: BOLD_B64 });
    const text = 'Ω é Σ A0😀';
    const workbook = sheetWithFont('12pt "OpenSheets F17"', text);
    const { bytes, report } = await exportWorkbookPdf(workbook, {}, 0);
    const objects = readPdf(bytes);
    const fonts = type0Fonts(objects);
    expect(fonts).toHaveLength(1);
    const font = fonts[0]!;
    splitSubsetTag(font.baseFont, 'OpenSheetsF17');
    expect(font.dict.dict).toMatch(/\/Encoding \/Identity-H/);
    expect(font.dict.dict).toMatch(/\/Subtype \/Type0/);
    const descendantMatch = /\/DescendantFonts\s*\[\s*(\d+) 0 R/.exec(font.dict.dict);
    const descendant = objects.get(Number(descendantMatch?.[1]))!;
    expect(descendant.dict).toMatch(/\/Subtype \/CIDFontType2/);
    expect(descendant.dict).toMatch(/\/CIDToGIDMap \/Identity/);
    // The font program is embedded as a subset (Task 22): smaller than the
    // registered whole font, and `/Length1` matches the embedded bytes.
    expect(font.fontFileBytes).not.toBeNull();
    const program = font.fontFileBytes!;
    expect(program.length).toBe(font.fontFileLength1);
    expect(program.length).toBeLessThan(REGULAR.length);
    // It parses back with our own parser and keeps the used glyph ids/advances.
    // (😀 is the fixture's last glyph id, so a document drawing it embeds all
    // ids — the byte win comes from dropping everything but glyf/loca/hmtx.)
    const subset = parseTrueTypeFont(program, { requireCmap: false });
    expect(subset.glyphCount).toBe(REGULAR_FONT.glyphCount);
    for (const ch of new Set(text)) {
      const gid = REGULAR_FONT.glyphId(ch.codePointAt(0)!);
      expect(gid, ch).toBeGreaterThan(0);
      expect(subset.advanceWidthInEm(gid), ch).toBe(REGULAR_FONT.advanceWidthInEm(gid));
      expect(glyphDataLength(program, gid), ch).toBeGreaterThan(0);
    }
    expect([...font.toUnicode.keys()].filter((gid) => glyphDataLength(program, gid) > 0).length)
      .toBeGreaterThanOrEqual(new Set(text).size);
    // /W entries exist for the used glyphs.
    expect(font.widths).toMatch(/\[/);
    // Text round-trip through the ToUnicode CMap.
    expect(extractText(objects, font.alias)).toBe(text);
    // Nothing was dropped or approximated.
    expect(report.missingChars.size).toBe(0);
  });

  it('draws bold text with the bold face and marks it missing only as a last resort', async () => {
    Manager.registerFont('OpenSheets F17', { normal: REGULAR_B64, bold: BOLD_B64 });
    const workbook = makeBook((sheet) => {
      sheet.getCell(1, 1).font('bold 12pt "OpenSheets F17"');
      sheet.setValue(1, 1, 'Aa');
      sheet.getCell(3, 1).font('12pt "OpenSheets F17"');
      sheet.setValue(3, 1, 'Aa');
      sheet.getCell(5, 1).font('12pt "OpenSheets F17"');
      sheet.setValue(5, 1, '日本');
    });
    const { bytes, report } = await exportWorkbookPdf(workbook, {}, 0);
    const objects = readPdf(bytes);
    const fonts = type0Fonts(objects);
    expect(fonts.length).toBe(2);
    for (const entry of fonts) expect(entry.baseFont).toMatch(/^[A-Z]{6}\+OpenSheetsF17(-Bold)?$/);
    expect(fonts.map((entry) => entry.baseFont.replace(/^[A-Z]{6}\+/, '')).sort()).toEqual(['OpenSheetsF17', 'OpenSheetsF17-Bold']);
    const bold = fonts.find((entry) => entry.baseFont.endsWith('+OpenSheetsF17-Bold'))!;
    const regular = fonts.find((entry) => entry.baseFont.endsWith('+OpenSheetsF17'))!;
    expect(extractText(objects, bold.alias)).toBe('Aa');
    // 日 is not in the fixture: drawn as the font's `?` glyph and counted.
    expect(extractText(objects, regular.alias)).toBe('Aa??');
    expect([...report.missingChars].sort()).toEqual([0x65e5, 0x672c]);
  });

  it('keeps unregistered WinAnsi families on the base-14 path', async () => {
    Manager.registerFont('OpenSheets F17', { normal: REGULAR_B64 });
    const workbook = sheetWithFont('12pt "Some Other Font"', 'Café');
    const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
    const objects = readPdf(bytes);
    expect(type0Fonts(objects)).toHaveLength(0);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toMatch(/\/BaseFont \/Helvetica\b/);
  });

  it('uses a fallbackFont family string for unregistered cell fonts', async () => {
    Manager.registerFont('OpenSheets F17', { normal: REGULAR_B64 });
    Manager.fallbackFont('OpenSheets F17');
    const workbook = sheetWithFont('12pt "Totally Unknown"', 'Ωé😀');
    const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
    const objects = readPdf(bytes);
    const fonts = type0Fonts(objects);
    expect(fonts).toHaveLength(1);
    // The fallback also covers the print pipeline's own chrome (headers use an
    // unregistered family), so the cell text must be contained in the runs.
    expect(extractText(objects, fonts[0]!.alias)).toContain('Ωé😀');
  });

  it('uses the documented function-provider fallback per family', async () => {
    let calls = 0;
    Manager.fallbackFont = function (font: string): string | undefined {
      calls++;
      const name = font.split(' ').pop();
      return name === 'Zeta' ? BOLD_B64 : undefined;
    } as unknown as typeof Manager.fallbackFont;
    const workbook = makeBook((sheet) => {
      sheet.getCell(1, 1).font('12pt Zeta');
      sheet.setValue(1, 1, 'Ω');
      sheet.getCell(3, 1).font('12pt Eta');
      sheet.setValue(3, 1, 'Ω');
    });
    const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
    const objects = readPdf(bytes);
    const fonts = type0Fonts(objects);
    // Only the Zeta cell embeds (with the provider's bytes); Eta stays base-14.
    expect(fonts).toHaveLength(1);
    expect(fonts[0]!.baseFont).toMatch(/^[A-Z]{6}\+OpenSheetsF17-Bold$/);
    expect(extractText(objects, fonts[0]!.alias)).toBe('Ω');
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toMatch(/\/BaseFont \/Helvetica\b/);
    // Results are cached per family+style: a second export must not ask again.
    const asked = calls;
    expect(asked).toBeGreaterThan(0);
    await exportWorkbookPdf(workbook, {}, 0);
    expect(calls).toBe(asked);
  });

  it('measures text with the embedded font advances', () => {
    Manager.registerFont('OpenSheets F17', { normal: REGULAR_B64 });
    const pool = new PdfResourcePool(new PdfWriter());
    const context = new PdfCanvasContext({ width: 100, height: 100, pool, report: createPdfReport() });
    context.font = '12pt "OpenSheets F17"';
    // 12pt = 16px; advances A=600, Ω=720, space=250, é=550 per 1000 em.
    expect(context.measureText('A Ω é').width).toBeCloseTo((600 + 250 + 720 + 250 + 550) / 1000 * 16, 8);
    expect(context.measureText('日').width).toBeCloseTo(550 / 1000 * 16, 8); // the `?` glyph width
  });
});

/* -------------------------------------------------- TrueType subsetting (22) */

const COMPOSITE_FONT = parseTrueTypeFont(COMPOSITE);

/** Sum every big-endian u32 word of a whole sfnt (the spec's file checksum). */
function sfntChecksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  for (let at = 0; at + 4 <= bytes.length; at += 4) sum = (sum + view.getUint32(at)) >>> 0;
  let tail = 0;
  for (let at = (bytes.length & ~3); at < bytes.length; at++) tail = (tail << 8) | bytes[at]!;
  return (sum + ((tail << ((4 - (bytes.length & 3)) * 8)) >>> 0)) >>> 0;
}

describe('subsetTrueTypeFont', () => {
  it('keeps the requested glyph ids and their advances, drops the rest', () => {
    const gids = ['A', 'Ω', '\u{1f600}'].map((ch) => REGULAR_FONT.glyphId(ch.codePointAt(0)!));
    expect(gids.every((gid) => gid > 0)).toBe(true);
    const subset = subsetTrueTypeFont(REGULAR_FONT, gids);
    expect(subset).not.toBeNull();
    const program = subset!;
    // Strictly smaller than the whole fixture, and it parses back with our own
    // parser (which rejects a font without a usable cmap by default).
    expect(program.length).toBeLessThan(REGULAR.length);
    expect(() => parseTrueTypeFont(program)).toThrow(/cmap/);
    const font = parseTrueTypeFont(program, { requireCmap: false });
    // Ids are stable; numGlyphs shrinks to the highest used id + 1 (😀 is the
    // fixture's last glyph, so pick an astral-free subset to see the shrink).
    expect(font.glyphCount).toBe(Math.max(...gids) + 1);
    const shrink = subsetTrueTypeFont(REGULAR_FONT, ['A', 'Ω', 'é'].map((ch) => REGULAR_FONT.glyphId(ch.codePointAt(0)!)))!;
    expect(parseTrueTypeFont(shrink, { requireCmap: false }).glyphCount).toBeLessThan(REGULAR_FONT.glyphCount);
    for (const gid of gids) {
      expect(glyphDataLength(program, gid), `gid ${gid}`).toBeGreaterThan(0);
      expect(font.advanceWidthInEm(gid)).toBe(REGULAR_FONT.advanceWidthInEm(gid));
    }
    // Unused ids below the highest kept one are empty loca slots.
    const unused = Array.from({ length: font.glyphCount }, (_, gid) => gid)
      .filter((gid) => gid > 0 && !gids.includes(gid) && glyphDataLength(REGULAR, gid) > 0);
    expect(unused.length).toBeGreaterThan(0); // the fixture really has such glyphs
    for (const gid of unused) expect(glyphDataLength(program, gid), `unused gid ${gid}`).toBe(0);
    // Only the tables an Identity-H PDF embedding needs, and head claims long loca.
    expect([...sfntTables(program).keys()].sort()).toEqual(['glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp']);
    const head = sfntTables(program).get('head')!;
    expect(new DataView(program.buffer, program.byteOffset, program.byteLength).getInt16(head.offset + 50)).toBe(1);
    // The head.checkSumAdjustment convention: all u32 words sum to 0xB1B0AFBA.
    expect(sfntChecksum(program)).toBe(0xb1b0afba);
  });

  it('includes the composite components, transitively and even without code points', () => {
    // Fixture ids: .notdef 0, A 1, grave 2, acute 3, bar 4 (no unicode),
    // Agrave 5 = A+acute, Acaron 6 = Agrave+bar. Requesting only 6 must keep
    // the whole component tree and leave 2 (grave) as an empty slot.
    const acaron = COMPOSITE_FONT.glyphId(0x1e00);
    expect(acaron).toBe(6);
    expect(COMPOSITE_FONT.glyphId(0x62 /* b */)).toBe(0); // 'bar' is unreachable by code
    const subset = subsetTrueTypeFont(COMPOSITE_FONT, [acaron])!;
    expect(subset.length).toBeLessThan(COMPOSITE.length);
    expect(COMPOSITE_FONT.glyphCount).toBe(7);
    for (const gid of [1, 3, 4, 5, 6]) {
      expect(glyphDataLength(subset, gid), `kept gid ${gid}`).toBeGreaterThan(0);
    }
    expect(glyphDataLength(subset, 2), 'unreferenced gid 2').toBe(0);
    const font = parseTrueTypeFont(subset, { requireCmap: false });
    expect(font.glyphCount).toBe(7);
    expect(font.advanceWidthInEm(4)).toBe(COMPOSITE_FONT.advanceWidthInEm(4));
    // The kept composites are still composites referencing the same ids.
    const glyf = sfntTables(subset).get('glyf')!;
    const view = new DataView(subset.buffer, subset.byteOffset, subset.byteLength);
    const loca = sfntTables(subset).get('loca')!;
    const start = view.getUint32(loca.offset + 6 * 4);
    expect(view.getInt16(glyf.offset + start)).toBe(-1); // numberOfContours of Acaron
    const flags = view.getUint16(glyf.offset + start + 10);
    const component = view.getUint16(glyf.offset + start + 12);
    expect(flags & 0x0020).not.toBe(0); // MORE_COMPONENTS: Acaron still has both parts
    expect(component).toBe(5);
  });

  it('returns null for programs it cannot rebuild', () => {
    const notAFont = new Uint8Array(64).fill(7);
    expect(subsetTrueTypeFont({ bytes: notAFont } as unknown as import('../src/pdf/truetype.js').TrueTypeFont, [])).toBeNull();
    // A font without glyf/loca cannot be subset either.
    const stripped = new Uint8Array(REGULAR);
    // Break the sfnt version so the directory cannot be read.
    stripped[0] = 0x4f; stripped[1] = 0x54; stripped[2] = 0x54; stripped[3] = 0x4f; // 'OTTO'
    expect(subsetTrueTypeFont({ ...REGULAR_FONT, bytes: stripped } as import('../src/pdf/truetype.js').TrueTypeFont, [1])).toBeNull();
  });

  it('names a subset deterministically from the glyph set', () => {
    const a = subsetFontTag('OpenSheetsF17', [1, 5, 9]);
    const same = subsetFontTag('OpenSheetsF17', [9, 5, 1]);
    const other = subsetFontTag('OpenSheetsF17', [1, 5, 10]);
    const otherFace = subsetFontTag('OpenSheetsF17-Bold', [1, 5, 9]);
    expect(a).toMatch(/^[A-Z]{6}$/);
    expect(a).toBe(same);
    expect(a).not.toBe(other);
    expect(a).not.toBe(otherFace);
  });
});

describe('savePDF subsets embedded fonts', () => {
  it('embeds only the glyphs the document draws, composites included', async () => {
    Manager.registerFont('OpenSheets F17 C', { normal: toBase64(COMPOSITE) });
    const workbook = sheetWithFont('12pt "OpenSheets F17 C"', '\u{1e00}');
    const { bytes } = await exportWorkbookPdf(workbook, {}, 0);
    const objects = readPdf(bytes);
    const fonts = type0Fonts(objects);
    expect(fonts).toHaveLength(1);
    const tag = splitSubsetTag(fonts[0]!.baseFont, 'OpenSheetsF17-Composite');
    expect(tag).toMatch(/^[A-Z]{6}$/);
    const program = fonts[0]!.fontFileBytes!;
    expect(program.length).toBeLessThan(COMPOSITE.length);
    // The printed 'Ȁ' pulls its whole component tree into the subset...
    for (const gid of [1, 3, 4, 5, 6]) expect(glyphDataLength(program, gid), `gid ${gid}`).toBeGreaterThan(0);
    // ...while the unreferenced 'grave' stays an empty slot.
    expect(glyphDataLength(program, 2)).toBe(0);
    // Text still extracts through the ToUnicode CMap.
    expect(extractText(objects, fonts[0]!.alias)).toContain('\u{1e00}');
  });

  it('is deterministic: the same content embeds the identical subset', async () => {
    Manager.registerFont('OpenSheets F17', { normal: REGULAR_B64 });
    const workbook = sheetWithFont('12pt "OpenSheets F17"', 'Ω A é');
    const first = type0Fonts(readPdf((await exportWorkbookPdf(workbook, {}, 0)).bytes));
    const second = type0Fonts(readPdf((await exportWorkbookPdf(workbook, {}, 0)).bytes));
    expect(second[0]!.baseFont).toBe(first[0]!.baseFont);
    expect(Buffer.from(second[0]!.fontFileBytes!)).toEqual(Buffer.from(first[0]!.fontFileBytes!));
    // A different glyph set yields a different subset (tag and/or bytes).
    const other = type0Fonts(readPdf((await exportWorkbookPdf(sheetWithFont('12pt "OpenSheets F17"', 'Ω A é0'), {}, 0)).bytes));
    expect(Buffer.from(other[0]!.fontFileBytes!)).not.toEqual(Buffer.from(first[0]!.fontFileBytes!));
  });
});
