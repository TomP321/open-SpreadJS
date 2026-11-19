/*
 * TrueType (sfnt) font reader for PDF embedding (Task 17).
 *
 * Everything here is written from the public OpenType specification
 * (https://learn.microsoft.com/en-us/typography/opentype/spec/) — the sfnt
 * table directory and the `head`, `hhea`, `hmtx`, `maxp`, `OS/2`, `post`,
 * `name` and `cmap` (formats 4 and 12) tables. Only the metadata the PDF
 * writer needs is parsed: glyph ids for Unicode code points, advance widths,
 * vertical metrics, the bounding box, the italic angle and the PostScript
 * name. The glyph outlines themselves are never touched: the font program is
 * embedded whole (`FontFile2`), so the PDF viewer draws with the very same
 * outlines the browser would.
 */

/** The four faces of one font family, as `PDFFontsManager.registerFont` takes them. */
export type TrueTypeFace = 'normal' | 'bold' | 'italic' | 'boldItalic';

/** A parsed TrueType font (immutable after `parseTrueTypeFont`). */
export interface TrueTypeFont {
  /** The complete font program; embedded as `/FontFile2`. */
  readonly bytes: Uint8Array;
  /** `head.unitsPerEm`. */
  readonly unitsPerEm: number;
  /** `hhea.ascender` in font units. */
  readonly ascender: number;
  /** `hhea.descender` in font units (negative). */
  readonly descender: number;
  /** `OS/2.sTypoAscender` in font units, 0 when the font has no OS/2. */
  readonly typoAscender: number;
  /** `OS/2.sTypoDescender` in font units (negative), 0 when no OS/2. */
  readonly typoDescender: number;
  /**
   * Offset in px from a canvas `fillText` `y` down to the alphabetic baseline,
   * exactly as Blink's `TextMetrics::GetFontBaseline` computes it for the
   * `top` / `middle` / `bottom` `textBaseline` values.
   */
  canvasBaselineOffset(sizePx: number, kind: 'top' | 'middle' | 'bottom'): number;
  /** `head` bounding box `[xMin, yMin, xMax, yMax]` in font units. */
  readonly bbox: readonly [number, number, number, number];
  /** `post.italicAngle`; negative for slanted faces. */
  readonly italicAngle: number;
  /** Italic/slant face flag from `post` or the `OS/2` selection bits. */
  readonly italic: boolean;
  /** Bold face flag from `OS/2.fsSelection` / `usWeightClass`. */
  readonly bold: boolean;
  /** `OS/2.sFamilyClass` says a serif design. */
  readonly serif: boolean;
  /** `post.isFixedPitch` or a uniform `hmtx` advance. */
  readonly fixedPitch: boolean;
  /** `OS/2.usWeightClass` (400 normal, 700 bold), 400 when no OS/2. */
  readonly weight: number;
  /** `OS/2.usCapHeight` in font units, 0 when the font has none. */
  readonly capHeight: number;
  /** `name` table id 6 (PostScript name), or a synthesized one. */
  readonly postScriptName: string;
  /** Total glyphs (`maxp.numGlyphs`). */
  readonly glyphCount: number;
  /** Glyph id for a Unicode code point, 0 (`.notdef`) when the font lacks it. */
  glyphId(codePoint: number): number;
  /** `hmtx` advance width of a glyph id in font units. */
  advanceWidth(glyph: number): number;
  /** `hmtx` advance of a glyph id in 1/1000 em, rounded like PDF `/W` wants it. */
  advanceWidthInEm(glyph: number): number;
}

/** A table located in the sfnt table directory. */
interface TableRef {
  offset: number;
  length: number;
}

function tagValue(tag: string): number {
  return ((tag.charCodeAt(0) << 24) | (tag.charCodeAt(1) << 16) | (tag.charCodeAt(2) << 8) | tag.charCodeAt(3)) >>> 0;
}

const TAG_HEAD = tagValue('head');
const TAG_HHEA = tagValue('hhea');
const TAG_HMTX = tagValue('hmtx');
const TAG_MAXP = tagValue('maxp');
const TAG_OS2 = tagValue('OS/2');
const TAG_POST = tagValue('post');
const TAG_NAME = tagValue('name');
const TAG_CMAP = tagValue('cmap');

/** Read big-endian numbers from the font bytes. */
class FontView {
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  u8(offset: number): number { return this.view.getUint8(offset); }
  u16(offset: number): number { return this.view.getUint16(offset); }
  i16(offset: number): number { return this.view.getInt16(offset); }
  u32(offset: number): number { return this.view.getUint32(offset); }
  i32(offset: number): number { return this.view.getInt32(offset); }
  /** 16.16 fixed-point (the `post.italicAngle` format). */
  fixed(offset: number): number { return this.view.getInt32(offset) / 65536; }
  /** UTF-16BE string of `length` bytes at `offset`. */
  utf16(offset: number, length: number): string {
    let text = '';
    for (let i = 0; i + 1 < length; i += 2) text += String.fromCharCode(this.view.getUint16(offset + i));
    return text;
  }
  /** Mac Roman approximation of a `name` string (Latin-1 for the printable range). */
  latin1(offset: number, length: number): string {
    let text = '';
    for (let i = 0; i < length; i++) text += String.fromCharCode(this.view.getUint8(offset + i));
    return text;
  }
}

/** cmap format 4: segment arrays kept as typed arrays for fast lookups. */
interface CmapFormat4 {
  end: Uint16Array;
  start: Uint16Array;
  delta: Int16Array;
  rangeOffset: Uint16Array;
  /** Byte offset of the `glyphIdArray` (entries indexed from each rangeOffset). */
  glyphIdBase: number;
}

/** cmap format 12: contiguous code ranges mapping to consecutive glyphs. */
interface CmapFormat12Group {
  start: number;
  end: number;
  glyph: number;
}

function parseFormat4(view: FontView, base: number): CmapFormat4 | null {
  const segCount = view.u16(base + 6) / 2;
  if (!Number.isInteger(segCount) || segCount <= 0 || segCount > 0x8000) return null;
  const end = new Uint16Array(segCount);
  const start = new Uint16Array(segCount);
  const delta = new Int16Array(segCount);
  const rangeOffset = new Uint16Array(segCount);
  for (let i = 0; i < segCount; i++) end[i] = view.u16(base + 14 + i * 2);
  for (let i = 0; i < segCount; i++) start[i] = view.u16(base + 16 + segCount * 2 + i * 2);
  for (let i = 0; i < segCount; i++) delta[i] = view.i16(base + 16 + segCount * 4 + i * 2);
  for (let i = 0; i < segCount; i++) rangeOffset[i] = view.u16(base + 16 + segCount * 6 + i * 2);
  return { end, start, delta, rangeOffset, glyphIdBase: base + 16 + segCount * 8 };
}

function lookupFormat4(table: CmapFormat4, view: FontView, code: number): number {
  // Binary search the first segment whose endCode is >= code (the last segment
  // always ends at 0xFFFF, so a BMP code point is never out of range).
  let low = 0;
  let high = table.end.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (table.end[mid]! >= code) high = mid;
    else low = mid + 1;
  }
  const segment = low;
  if (code < table.start[segment]!) return 0;
  const rangeOffset = table.rangeOffset[segment]!;
  if (rangeOffset === 0) return (code + table.delta[segment]!) & 0xffff;
  const index = rangeOffset / 2 + (code - table.start[segment]!);
  const entry = table.glyphIdBase + segment * 2 + index * 2;
  const glyph = view.u16(entry);
  return glyph === 0 ? 0 : (glyph + table.delta[segment]!) & 0xffff;
}

function lookupFormat12(groups: CmapFormat12Group[], code: number): number {
  let low = 0;
  let high = groups.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const group = groups[mid]!;
    if (code < group.start) high = mid - 1;
    else if (code > group.end) low = mid + 1;
    else return group.glyph + (code - group.start);
  }
  return 0;
}

/** Read the `name` table's PostScript name (id 6), preferring a Unicode record. */
function postScriptName(view: FontView, table: TableRef | undefined): string {
  if (!table || table.length < 6) return '';
  const count = view.u16(table.offset + 2);
  const strings = table.offset + view.u16(table.offset + 4);
  let best = '';
  let bestScore = -1;
  for (let i = 0; i < count; i++) {
    const record = table.offset + 6 + i * 12;
    if (record + 12 > table.offset + table.length) break;
    const nameId = view.u16(record + 6);
    if (nameId !== 6) continue;
    const platform = view.u16(record);
    const length = view.u16(record + 8);
    const offset = strings + view.u16(record + 10);
    if (offset + length > table.offset + table.length) continue;
    const score = platform === 3 || platform === 0 ? 2 : platform === 1 ? 1 : 0;
    if (score <= bestScore) continue;
    const text = score >= 2 ? view.utf16(offset, length) : view.latin1(offset, length);
    if (text) {
      best = text;
      bestScore = score;
    }
  }
  return best;
}

/** Options of `parseTrueTypeFont`. */
export interface TrueTypeParseOptions {
  /**
   * False to accept a font without a `cmap` (a PDF subset has none: glyph ids
   * come from the document, not the font). `glyphId()` then always returns 0.
   * Defaults to true — a registered font must map Unicode to glyphs.
   */
  requireCmap?: boolean;
}

/** Locate the tables we need and read the font's metadata. */
export function parseTrueTypeFont(bytes: Uint8Array, options: TrueTypeParseOptions = {}): TrueTypeFont {
  if (bytes.length < 12) throw new Error('the font data is too short to be a TrueType font');
  const view = new FontView(bytes);
  let sfnt = 0;
  const flavor = view.u32(0);
  if (flavor === tagValue('ttcf')) {
    // TrueType collection: use its first font.
    if (bytes.length < 16) throw new Error('the TrueType collection header is truncated');
    if (view.u32(8) < 1) throw new Error('the TrueType collection contains no fonts');
    sfnt = view.u32(12);
  } else if (flavor === 0x00010000 || flavor === tagValue('true')) {
    sfnt = 0;
  } else if (flavor === tagValue('OTTO')) {
    throw new Error('OpenType/CFF fonts are not supported, only TrueType glyf outlines');
  } else {
    throw new Error('the font data is not a TrueType font (bad sfnt version)');
  }

  const numTables = view.u16(sfnt + 4);
  const tables = new Map<number, TableRef>();
  for (let i = 0; i < numTables; i++) {
    const entry = sfnt + 12 + i * 16;
    if (entry + 16 > bytes.length) throw new Error('the sfnt table directory is truncated');
    const tag = view.u32(entry);
    const offset = view.u32(entry + 8);
    const length = view.u32(entry + 12);
    if (offset + length > bytes.length) throw new Error(`the table directory entry for tag #${tag.toString(16)} is out of range`);
    if (!tables.has(tag)) tables.set(tag, { offset, length });
  }
  const need = (tag: number, label: string): TableRef => {
    const table = tables.get(tag);
    if (!table) throw new Error(`the font has no ${label} table`);
    return table;
  };

  const head = need(TAG_HEAD, 'head');
  const hhea = need(TAG_HHEA, 'hhea');
  const hmtx = need(TAG_HMTX, 'hmtx');
  const maxp = need(TAG_MAXP, 'maxp');
  const requireCmap = options.requireCmap !== false;
  const cmap = requireCmap ? need(TAG_CMAP, 'cmap') : tables.get(TAG_CMAP);
  if (head.length < 54 || hhea.length < 36 || maxp.length < 6) throw new Error('a required table is too small');

  const unitsPerEm = view.u16(head.offset + 18);
  if (unitsPerEm < 16 || unitsPerEm > 16384) throw new Error(`head.unitsPerEm is out of range (${unitsPerEm})`);
  const numGlyphs = view.u16(maxp.offset + 4);
  const bbox: [number, number, number, number] = [
    view.i16(head.offset + 36), view.i16(head.offset + 38), view.i16(head.offset + 40), view.i16(head.offset + 42),
  ];
  const ascender = view.i16(hhea.offset + 4);
  const descender = view.i16(hhea.offset + 6);

  // hmtx: `numberOfHMetrics` (advance, lsb) pairs; later glyphs keep the last advance.
  const numberOfHMetrics = Math.min(view.u16(hhea.offset + 34), numGlyphs);
  const advances = new Uint16Array(numGlyphs);
  const metricsEnd = Math.min(hmtx.offset + numberOfHMetrics * 4, hmtx.offset + hmtx.length);
  let at = hmtx.offset;
  for (let i = 0; i < numberOfHMetrics && at + 2 <= metricsEnd; i++, at += 4) advances[i] = view.u16(at);
  for (let i = numberOfHMetrics; i < numGlyphs; i++) advances[i] = advances[numberOfHMetrics - 1] ?? 0;

  // cmap: keep one format 4 (BMP) and one format 12 (full Unicode) subtable.
  let format4: CmapFormat4 | null = null;
  let format12: CmapFormat12Group[] | null = null;
  const subtableCount = cmap ? view.u16(cmap.offset + 2) : 0;
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  const cmapBase = cmap?.offset ?? 0;
  const cmapEnd = cmap ? cmap.offset + cmap.length : 0;
  for (let i = 0; i < subtableCount; i++) {
    const record = cmapBase + 4 + i * 8;
    if (record + 8 > cmapEnd) break;
    subtables.push({
      platform: view.u16(record),
      encoding: view.u16(record + 2),
      offset: cmapBase + view.u32(record + 4),
    });
  }
  const unicodeRank = (sub: { platform: number; encoding: number }): number =>
    (sub.platform === 3 && sub.encoding === 10) || sub.platform === 0 ? 3
      : sub.platform === 3 && (sub.encoding === 1 || sub.encoding === 0) ? 2
        : sub.platform === 1 ? 1 : 0;
  subtables.sort((a, b) => unicodeRank(b) - unicodeRank(a));
  for (const sub of subtables) {
    if (unicodeRank(sub) === 0) continue;
    if (sub.offset + 2 > bytes.length) continue;
    const format = view.u16(sub.offset);
    if (format === 4 && !format4) {
      format4 = parseFormat4(view, sub.offset);
    } else if (format === 12 && !format12 && sub.offset + 16 <= bytes.length) {
      const groups: CmapFormat12Group[] = [];
      const count = view.u32(sub.offset + 12);
      for (let i = 0; i < count; i++) {
        const entry = sub.offset + 16 + i * 12;
        if (entry + 12 > bytes.length) break;
        const startCode = view.u32(entry);
        groups.push({ start: startCode, end: view.u32(entry + 4), glyph: view.u32(entry + 8) });
      }
      format12 = groups;
    }
    if (format4 && format12) break;
  }
  if (requireCmap && !format4 && !format12) throw new Error('the font has no usable cmap subtable (format 4 or 12)');
  const glyphOf = (code: number): number => {
    if (code < 0 || code > 0x10ffff) return 0;
    if (code > 0xffff) return format12 ? lookupFormat12(format12, code) : 0;
    const from4 = format4 ? lookupFormat4(format4, view, code) : 0;
    if (from4) return from4;
    return format12 ? lookupFormat12(format12, code) : 0;
  };

  // OS/2 (optional): weight, italic flag, cap height, serif class, typo metrics.
  let weight = 400;
  let os2Italic = false;
  let os2Bold = false;
  let serif = false;
  let capHeight = 0;
  let typoAscender = 0;
  let typoDescender = 0;
  const os2 = tables.get(TAG_OS2);
  if (os2 && os2.length >= 88) {
    weight = view.u16(os2.offset + 4);
    const fsSelection = view.u16(os2.offset + 62);
    os2Italic = (fsSelection & 0x01) !== 0;
    os2Bold = (fsSelection & 0x20) !== 0;
    const familyClass = view.i16(os2.offset + 38) >> 8;
    serif = familyClass >= 1 && familyClass <= 10;
    typoAscender = view.i16(os2.offset + 68);
    typoDescender = view.i16(os2.offset + 70);
    // Version 2 added sxHeight (86) and sCapHeight (88).
    if (view.u16(os2.offset) >= 2 && os2.length >= 90) capHeight = view.i16(os2.offset + 88);
  }

  // post (optional): italic angle and fixed-pitch flag.
  let italicAngle = 0;
  let fixedPitch = false;
  const post = tables.get(TAG_POST);
  if (post && post.length >= 32) {
    italicAngle = view.fixed(post.offset + 4);
    fixedPitch = view.u32(post.offset + 12) !== 0;
  }

  let name = postScriptName(view, tables.get(TAG_NAME));
  if (!name) name = `EmbeddedFont${unitsPerEm}-${numGlyphs}`;
  // PDF names may not contain spaces or the delimiter set; keep it printable.
  name = name.replace(/[^\x21-\x7e]|[\x28\x29<>[\]{}\/%]/g, '-');

  // Fixed-pitch check for fonts without `post.isFixedPitch`.
  if (!fixedPitch && numGlyphs > 1) {
    let first = 0;
    let uniform = true;
    for (let gid = 1; gid < Math.min(numGlyphs, 64); gid++) {
      const advance = advances[gid]!;
      if (first === 0) first = advance;
      else if (advance !== first) { uniform = false; break; }
    }
    fixedPitch = uniform && first > 0;
  }

  const scaleToEm = (value: number): number => Math.round((value * 1000) / unitsPerEm);
  /** Blink's LayoutUnit quantization: round to the nearest 1/64 (round-half-even there, half-up here). */
  const snap = (value: number): number => Math.round(value * 64) / 64;
  /**
   * The offset from canvas `fillText`'s `y` down to the alphabetic baseline,
   * reproducing Blink's `TextMetrics::GetFontBaseline` +
   * `SimpleFontData::NormalizedTypoAscentAndDescent`: use `OS/2`
   * sTypoAscender/sTypoDescender (hhea as Blink's fallback), scale them so
   * their sum is exactly one em keeping the ratio, and quantize through
   * LayoutUnit (1/64 px) like the browser does. Verified against Chromium by
   * measuring the ink edge of 'H' at 1000px for many font files.
   */
  const baselineOffset = (sizePx: number, kind: 'top' | 'middle' | 'bottom'): number => {
    const useTypo = typoAscender > 0 && typoAscender + -typoDescender > 0 && typoAscender <= typoAscender - typoDescender;
    const asc = useTypo ? typoAscender : ascender;
    const desc = useTypo ? -typoDescender : -descender;
    const em = snap(sizePx);
    const height = asc + desc;
    let a: number;
    let d: number;
    if (height > 0 && asc >= 0 && asc <= height) {
      a = snap((asc * em) / height);
      d = snap(em) - a;
    } else {
      a = snap((asc * em) / unitsPerEm);
      d = snap((-desc * em) / unitsPerEm);
    }
    return kind === 'top' ? a : kind === 'middle' ? (a - d) / 2 : -d;
  };
  return {
    bytes: new Uint8Array(bytes),
    unitsPerEm,
    ascender,
    descender,
    bbox,
    italicAngle,
    italic: os2Italic || italicAngle < 0,
    bold: os2Bold || weight >= 600,
    serif,
    fixedPitch,
    weight,
    capHeight,
    postScriptName: name,
    glyphCount: numGlyphs,
    glyphId: glyphOf,
    advanceWidth: (gid) => (gid >= 0 && gid < numGlyphs ? advances[gid]! : 0),
    advanceWidthInEm: (gid) => scaleToEm(gid >= 0 && gid < numGlyphs ? advances[gid]! : 0),
    canvasBaselineOffset: baselineOffset,
    typoAscender,
    typoDescender,
  };
}
