/*
 * TrueType subsetting for embedded PDF fonts (Task 22 / PDF-1).
 *
 * `parseTrueTypeFont` gives the writer the metadata it needs, but embedding the
 * whole program made the Calibri oracle export ~860 KB even though the sheet
 * prints only a few dozen glyphs. This module rebuilds the sfnt from the
 * public OpenType specification (https://learn.microsoft.com/en-us/typography/
 * opentype/spec/) with only the tables a PDF `Identity-H` viewer needs:
 *
 *   head  copied (its checkSumAdjustment is recomputed for the new file)
 *   hhea  copied, `numberOfHMetrics` updated
 *   maxp  rebuilt (version 1.0 with the metrics of the kept glyphs)
 *   hmtx  one explicit (advance, lsb) pair per kept glyph id
 *   loca  rebuilt in long format
 *   glyf  the kept glyph programs verbatim, unused ids padded to empty
 *   cvt / fpgm / prep  copied when the source font has them
 *
 * `cmap`, `name`, `OS/2`, `post`, `kern` and friends are dropped: the PDF
 * selects glyphs by id through `/CIDToGIDMap /Identity`, carries the text
 * mapping in its own ToUnicode CMap and the font descriptor in its /W array,
 * so nothing in the document reads those tables.
 *
 * Glyph ids are kept STABLE: `numGlyphs` shrinks to `max(used) + 1` and any id
 * below that which is not used gets a zero-length entry in `loca`, so every
 * `Tj` hex string, `/W` entry and ToUnicode code the writer already emitted
 * stays valid without a remap. Composite glyphs are included transitively:
 * the components a used composite references are subset-in too (with their
 * own ids, so the references keep resolving).
 */
import type { TrueTypeFont } from './truetype.js';

/** sfnt table tags, as 4-character strings. */
const TAG_GLYF = 'glyf';
const TAG_HEAD = 'head';
const TAG_HHEA = 'hhea';
const TAG_HMTX = 'hmtx';
const TAG_LOCA = 'loca';
const TAG_MAXP = 'maxp';
/** Optional instruction tables, copied byte-for-byte when present. */
const OPTIONAL_TABLES = ['cvt ', 'fpgm', 'prep'];

/** glyf composite flags (OpenType spec, `Glyph Table`). */
const COMP_ARG_1_AND_2_ARE_WORDS = 0x0001;
const COMP_WE_HAVE_A_SCALE = 0x0008;
const COMP_MORE_COMPONENTS = 0x0020;
const COMP_WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const COMP_WE_HAVE_A_TWO_BY_TWO = 0x0080;

interface TableRef {
  offset: number;
  length: number;
}

/** The subset's metadata parsed off one glyph program; null when unparseable. */
interface GlyphInfo {
  /** Number of simple contours (0 for a composite). */
  contours: number;
  /** Number of points in this glyph alone (0 for a composite). */
  points: number;
  /** Length of this glyph's per-glyph instruction stream, in bytes. */
  instructions: number;
  /** Referenced glyph ids, in order (empty for a simple glyph). */
  components: number[];
}

function readU16(view: DataView, at: number): number { return view.getUint16(at); }
function readI16(view: DataView, at: number): number { return view.getInt16(at); }
function readU32(view: DataView, at: number): number { return view.getUint32(at); }

class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private at = 0;
  constructor(capacity: number) {
    this.bytes = new Uint8Array(capacity);
    this.view = new DataView(this.bytes.buffer);
  }
  u8(value: number): void { this.view.setUint8(this.at, value & 0xff); this.at += 1; }
  u16(value: number): void { this.view.setUint16(this.at, value & 0xffff); this.at += 2; }
  u32(value: number): void { this.view.setUint32(this.at, value >>> 0); this.at += 4; }
  i16(value: number): void { this.view.setInt16(this.at, value | 0); this.at += 2; }
  raw(data: Uint8Array): void { this.bytes.set(data, this.at); this.at += data.length; }
  /** Zero-pad to a 4-byte boundary. */
  align(): void { while (this.at % 4 !== 0) this.u8(0); }
  get position(): number { return this.at; }
  /** The bytes written so far. */
  take(): Uint8Array { return this.bytes.subarray(0, this.at); }
  /** Overwrite an already-written u32 (the `head.checkSumAdjustment`). */
  pokeU32(at: number, value: number): void { this.view.setUint32(at, value >>> 0); }
}

/** Checksum of `bytes`, summed as big-endian u32 words with zero padding. */
function checksum(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  const words = bytes.length >>> 2;
  for (let i = 0; i < words; i++) sum = (sum + view.getUint32(i * 4)) >>> 0;
  let tail = 0;
  for (let i = words * 4; i < bytes.length; i++) tail = (tail << 8) | bytes[i]!;
  tail <<= (4 - (bytes.length & 3)) * 8;
  return (sum + (tail >>> 0)) >>> 0;
}

/** Locate the sfnt offset (following a `ttcf` header) and its table directory. */
function readDirectory(bytes: Uint8Array): Map<string, TableRef> {
  if (bytes.length < 12) throw new Error('the font data is too short to be a TrueType font');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flavor = readU32(view, 0);
  let sfnt = 0;
  if (flavor === 0x74746366 /* ttcf */) {
    if (bytes.length < 16 || readU32(view, 8) < 1) throw new Error('bad TrueType collection header');
    sfnt = readU32(view, 12);
  } else if (flavor !== 0x00010000 && flavor !== 0x74727565 /* true */) {
    throw new Error('not a TrueType sfnt');
  }
  const numTables = readU16(view, sfnt + 4);
  const tables = new Map<string, TableRef>();
  for (let i = 0; i < numTables; i++) {
    const entry = sfnt + 12 + i * 16;
    if (entry + 16 > bytes.length) throw new Error('the sfnt table directory is truncated');
    const tag = String.fromCharCode(
      bytes[entry]!, bytes[entry + 1]!, bytes[entry + 2]!, bytes[entry + 3]!,
    );
    const offset = readU32(view, entry + 8);
    const length = readU32(view, entry + 12);
    if (offset + length > bytes.length) throw new Error(`table ${tag} is out of range`);
    if (!tables.has(tag)) tables.set(tag, { offset, length });
  }
  return tables;
}

/** One `loca` entry (byte range within `glyf`); start === end means empty. */
interface GlyphRange {
  start: number;
  end: number;
}

function readLoca(view: DataView, loca: TableRef, glyf: TableRef, numGlyphs: number, longFormat: boolean): GlyphRange[] {
  const ranges: GlyphRange[] = new Array<GlyphRange>(numGlyphs);
  const entryCount = longFormat ? Math.floor(loca.length / 4) : Math.floor(loca.length / 2);
  const entry = (i: number): number =>
    longFormat ? readU32(view, loca.offset + i * 4) : readU16(view, loca.offset + i * 2) * 2;
  let previous = entry(0);
  for (let i = 0; i < numGlyphs; i++) {
    const next = i + 1 < entryCount ? entry(i + 1) : glyf.length;
    ranges[i] = { start: glyf.offset + previous, end: Math.min(glyf.offset + next, glyf.offset + glyf.length) };
    previous = Math.max(previous, next);
  }
  return ranges;
}

/** Parse a glyph program: contours/points for simple, components for composite. */
function analyzeGlyph(view: DataView, range: GlyphRange): GlyphInfo | null {
  const length = range.end - range.start;
  if (length <= 0) return { contours: 0, points: 0, instructions: 0, components: [] };
  if (length < 10) return null;
  const numberOfContours = readI16(view, range.start);
  if (numberOfContours >= 0) {
    if (length < 12 + numberOfContours * 2) return null;
    let points = 0;
    if (numberOfContours > 0) {
      const lastEnd = readU16(view, range.start + 10 + (numberOfContours - 1) * 2);
      points = lastEnd + 1;
    }
    const instructionLength = readU16(view, range.start + 10 + numberOfContours * 2);
    return { contours: numberOfContours, points, instructions: instructionLength, components: [] };
  }
  // Composite: walk the component records.
  const components: number[] = [];
  let at = range.start + 10;
  for (;;) {
    if (at + 4 > range.end) return null;
    const flags = readU16(view, at);
    components.push(readU16(view, at + 2));
    at += 4;
    // The two arguments are words or bytes depending on bit 0 (xy values or
    // anchor points, same size rule).
    at += flags & COMP_ARG_1_AND_2_ARE_WORDS ? 4 : 2;
    if (flags & COMP_WE_HAVE_A_SCALE) at += 2;
    else if (flags & COMP_WE_HAVE_A_TWO_BY_TWO) at += 8;
    else if (flags & COMP_WE_HAVE_AN_X_AND_Y_SCALE) at += 4;
    if (!(flags & COMP_MORE_COMPONENTS)) break;
  }
  return { contours: 0, points: 0, instructions: 0, components };
}

/**
 * Rebuild `font`'s program containing only `usedGlyphs` (plus `.notdef` and,
 * transitively, the components of every kept composite). Glyph ids stay
 * stable. Returns null when the font cannot be subset (the caller then embeds
 * the whole program, exactly as before this feature existed).
 */
export function subsetTrueTypeFont(font: TrueTypeFont, usedGlyphs: Iterable<number>): Uint8Array | null {
  const source = font.bytes;
  let tables: Map<string, TableRef>;
  try {
    tables = readDirectory(source);
  } catch {
    return null;
  }
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const head = tables.get(TAG_HEAD);
  const hhea = tables.get(TAG_HHEA);
  const hmtx = tables.get(TAG_HMTX);
  const maxp = tables.get(TAG_MAXP);
  const loca = tables.get(TAG_LOCA);
  const glyf = tables.get(TAG_GLYF);
  if (!head || !hhea || !hmtx || !maxp || !loca || !glyf) return null;
  if (head.length < 54 || maxp.length < 6 || hhea.length < 36) return null;
  const numGlyphs = readU16(view, maxp.offset + 4);
  const indexToLocFormat = readI16(view, head.offset + 50);
  if (indexToLocFormat !== 0 && indexToLocFormat !== 1) return null;
  const sourceMaxpVersion = readU32(view, maxp.offset);
  const originalNumberOfHMetrics = Math.min(readU16(view, hhea.offset + 34), numGlyphs);

  let ranges: GlyphRange[];
  try {
    ranges = readLoca(view, loca, glyf, numGlyphs, indexToLocFormat === 1);
  } catch {
    return null;
  }
  const infoOf = new Array<GlyphInfo | null>(numGlyphs);
  const info = (gid: number): GlyphInfo | null => {
    if (gid < 0 || gid >= numGlyphs) return null;
    if (infoOf[gid] === undefined) {
      const range = ranges[gid]!;
      infoOf[gid] = range.end > glyf.offset + glyf.length || range.start < glyf.offset
        ? null
        : analyzeGlyph(view, range);
    }
    return infoOf[gid];
  };

  // Transitive closure of the requested glyphs over composite components.
  // Ids that are not kept become empty loca slots below the highest kept one
  // (including `.notdef`, which no PDF run ever references).
  const keep = new Uint8Array(numGlyphs);
  const queue: number[] = [];
  for (const gid of usedGlyphs) {
    if (gid > 0 && gid < numGlyphs && !keep[gid]) queue.push(gid);
  }
  while (queue.length) {
    const gid = queue.pop()!;
    if (keep[gid]) continue;
    keep[gid] = 1;
    const glyph = info(gid);
    if (!glyph) return null; // an unparseable used glyph: embed the whole font
    for (const component of glyph.components) {
      if (component > 0 && component < numGlyphs && !keep[component]) queue.push(component);
    }
  }
  let maxGid = 0;
  for (let gid = 0; gid < numGlyphs; gid++) {
    if (keep[gid] && gid > maxGid) maxGid = gid;
  }
  const newNumGlyphs = maxGid + 1;
  if (originalNumberOfHMetrics < 1 || originalNumberOfHMetrics * 4 > hmtx.length) return null;

  // hmtx values for a kept id (the source may collapse trailing advances).
  const advanceOf = (gid: number): number =>
    gid < originalNumberOfHMetrics
      ? readU16(view, hmtx.offset + gid * 4)
      : readU16(view, hmtx.offset + (originalNumberOfHMetrics - 1) * 4);
  const lsbOf = (gid: number): number => {
    if (gid < originalNumberOfHMetrics) return readU16(view, hmtx.offset + gid * 4 + 2);
    const at = hmtx.offset + originalNumberOfHMetrics * 4 + (gid - originalNumberOfHMetrics) * 2;
    return at + 2 <= hmtx.offset + hmtx.length ? readU16(view, at) : 0;
  };

  // maxp v1.0 metrics over the kept glyphs; composites aggregate recursively.
  let maxPoints = 0;
  let maxContours = 0;
  let maxCompositePoints = 0;
  let maxCompositeContours = 0;
  let maxComponentElements = 0;
  let maxComponentDepth = 0;
  let maxSizeOfInstructions = 0;
  const aggregate = new Map<number, { points: number; contours: number; depth: number }>();
  const totalOf = (gid: number, path: Set<number>): { points: number; contours: number; depth: number } => {
    const cached = aggregate.get(gid);
    if (cached) return cached;
    const glyph = info(gid);
    const result = { points: 0, contours: 0, depth: 0 };
    if (glyph && !path.has(gid)) {
      path.add(gid);
      if (glyph.components.length) {
        let depth = 0;
        for (const component of glyph.components) {
          const sub = component < numGlyphs ? totalOf(component, path) : { points: 0, contours: 0, depth: 0 };
          result.points += sub.points;
          result.contours += sub.contours;
          depth = Math.max(depth, sub.depth);
        }
        result.depth = depth + 1;
      } else {
        result.points = glyph.points;
        result.contours = glyph.contours;
      }
      path.delete(gid);
    }
    aggregate.set(gid, result);
    return result;
  };
  for (let gid = 0; gid < newNumGlyphs; gid++) {
    const glyph = info(gid);
    if (glyph) maxSizeOfInstructions = Math.max(maxSizeOfInstructions, glyph.instructions);
    if (!keep[gid] || !glyph) continue;
    if (glyph.components.length) {
      const total = totalOf(gid, new Set());
      maxCompositePoints = Math.max(maxCompositePoints, total.points);
      maxCompositeContours = Math.max(maxCompositeContours, total.contours);
      maxComponentElements = Math.max(maxComponentElements, glyph.components.length);
      maxComponentDepth = Math.max(maxComponentDepth, total.depth);
    } else {
      maxPoints = Math.max(maxPoints, glyph.points);
      maxContours = Math.max(maxContours, glyph.contours);
    }
  }

  // Assemble the tables.
  const glyfData = new Writer(Math.max(4, glyf.length));
  const locaData = new Writer(newNumGlyphs * 4 + 4);
  locaData.u32(0);
  for (let gid = 0; gid < newNumGlyphs; gid++) {
    if (keep[gid]) {
      const range = ranges[gid]!;
      if (range.end > range.start) {
        glyfData.raw(source.subarray(range.start, range.end));
        glyfData.align();
      }
    }
    locaData.u32(glyfData.position);
  }

  const hmtxData = new Writer(newNumGlyphs * 4);
  for (let gid = 0; gid < newNumGlyphs; gid++) {
    hmtxData.u16(keep[gid] ? advanceOf(gid) : 0);
    hmtxData.u16(keep[gid] ? lsbOf(gid) : 0);
  }

  const headData = new Writer(head.length);
  headData.raw(source.subarray(head.offset, head.offset + head.length));
  const headCheckSumAdjustmentAt = 8; // within the copied table

  const hheaData = new Writer(hhea.length);
  hheaData.raw(source.subarray(hhea.offset, hhea.offset + hhea.length));
  // numberOfHMetrics (u16 at offset 34): every kept id gets an explicit pair.
  const hheaBytes = new Uint8Array(hheaData.take());
  new DataView(hheaBytes.buffer, hheaBytes.byteOffset, hheaBytes.byteLength).setUint16(34, newNumGlyphs);

  const maxpData = new Writer(32);
  maxpData.u32(0x00010000); // version 1.0
  maxpData.u16(newNumGlyphs);
  maxpData.u16(maxPoints);
  maxpData.u16(maxContours);
  maxpData.u16(maxCompositePoints);
  maxpData.u16(maxCompositeContours);
  maxpData.u16(sourceMaxpVersion >= 0x00010000 && maxp.length >= 32 ? readU16(view, maxp.offset + 14) : 1); // maxZones
  maxpData.u16(sourceMaxpVersion >= 0x00010000 && maxp.length >= 32 ? readU16(view, maxp.offset + 16) : 0); // maxTwilightPoints
  maxpData.u16(sourceMaxpVersion >= 0x00010000 && maxp.length >= 32 ? readU16(view, maxp.offset + 18) : 0); // maxStorage
  maxpData.u16(sourceMaxpVersion >= 0x00010000 && maxp.length >= 32 ? readU16(view, maxp.offset + 20) : 0); // maxFunctionDefs
  maxpData.u16(sourceMaxpVersion >= 0x00010000 && maxp.length >= 32 ? readU16(view, maxp.offset + 22) : 0); // maxInstructionDefs
  maxpData.u16(sourceMaxpVersion >= 0x00010000 && maxp.length >= 32 ? readU16(view, maxp.offset + 24) : 0); // maxStackElements
  maxpData.u16(maxSizeOfInstructions);
  maxpData.u16(maxComponentElements);
  maxpData.u16(maxComponentDepth);

  const built = new Map<string, Uint8Array>();
  // Force long loca so any glyph data offset stays representable, and start
  // with a zero checkSumAdjustment (finalised with the file's own one below).
  const headBytes = new Uint8Array(headData.take());
  headBytes[50] = 0; // indexToLocFormat = 1 (big-endian int16 at 50)
  headBytes[51] = 1;
  headBytes[8] = headBytes[9] = headBytes[10] = headBytes[11] = 0;
  built.set(TAG_HEAD, headBytes);
  built.set(TAG_HHEA, hheaBytes);
  built.set(TAG_MAXP, new Uint8Array(maxpData.take()));
  built.set(TAG_HMTX, new Uint8Array(hmtxData.take()));
  built.set(TAG_LOCA, new Uint8Array(locaData.take()));
  built.set(TAG_GLYF, new Uint8Array(glyfData.take()));
  for (const tag of OPTIONAL_TABLES) {
    const table = tables.get(tag);
    if (table && table.length > 0) built.set(tag, source.subarray(table.offset, table.offset + table.length));
  }

  // Sort by tag (the spec's recommendation) and lay out the file.
  const tags = [...built.keys()].sort();
  const numTables = tags.length;
  let searchRange = 16;
  let power = 1;
  while (power * 2 <= numTables) {
    power *= 2;
    searchRange = power * 16;
  }
  const directorySize = 12 + numTables * 16;
  const sizes = tags.map((tag) => (built.get(tag)!.length + 3) & ~3);
  const offsets = new Array<number>(numTables);
  let cursor = directorySize;
  for (let i = 0; i < numTables; i++) {
    offsets[i] = cursor;
    cursor += sizes[i]!;
  }
  // Convention (as fontTools and the spec's example follow): the directory's
  // head entry stores the checksum of the head table with its
  // checkSumAdjustment field zero, and the adjustment is chosen so the sum of
  // all big-endian words of the finished file equals 0xB1B0AFBA.
  const checksums = new Map<string, number>();
  for (const tag of tags) checksums.set(tag, checksum(built.get(tag)!));
  const out = new Writer(cursor);
  out.u32(0x00010000); // sfntVersion: TrueType outlines
  out.u16(numTables);
  const entrySelector = Math.floor(Math.log2(numTables));
  out.u16(entrySelector);
  out.u16(searchRange);
  out.u16(numTables * 16 - searchRange);
  const headIndex = tags.indexOf(TAG_HEAD);
  for (let i = 0; i < numTables; i++) {
    const tag = tags[i]!;
    const data = built.get(tag)!;
    out.u8(tag.charCodeAt(0));
    out.u8(tag.charCodeAt(1));
    out.u8(tag.charCodeAt(2));
    out.u8(tag.charCodeAt(3));
    out.u32(checksums.get(tag)!);
    out.u32(offsets[i]!);
    out.u32(data.length);
  }
  out.align();
  for (let i = 0; i < numTables; i++) {
    out.raw(built.get(tags[i]!)!);
    out.align(); // the directory promised 4-byte-aligned offsets
  }
  let sum = 0;
  for (const tag of tags) sum = (sum + checksums.get(tag)!) >>> 0;
  const directoryView = new DataView(out.bytes.buffer, out.bytes.byteOffset, out.position);
  for (let word = 0; word < directorySize; word += 4) sum = (sum + directoryView.getUint32(word)) >>> 0;
  out.pokeU32(offsets[headIndex]! + headCheckSumAdjustmentAt, (0xb1b0afba - sum) >>> 0);
  return out.take().slice();
}

/**
 * The standard 6-letter subset tag (`ABCDEF+Name`): uppercase A–Z derived from
 * the kept glyph ids and the font name, so the same export is byte-stable but
 * documents sharing a face with different glyph sets get different names.
 */
export function subsetFontTag(fontName: string, usedGlyphs: Iterable<number>): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  };
  mix(fontName.length);
  for (let i = 0; i < fontName.length; i++) mix(fontName.charCodeAt(i));
  const glyphs = [...usedGlyphs].sort((a, b) => a - b);
  for (const gid of glyphs) {
    mix(gid & 0xff);
    mix((gid >>> 8) & 0xff);
  }
  let tag = '';
  for (let i = 0; i < 6; i++) {
    mix(glyphs.length + i);
    tag += String.fromCharCode(65 + (hash % 26));
    hash = (hash >>> 7) ^ Math.imul(hash, 0x27d4eb2d) >>> 0;
  }
  return tag;
}
