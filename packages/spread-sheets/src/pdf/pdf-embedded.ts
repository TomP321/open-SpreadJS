/*
 * Embedded TrueType fonts in the PDF writer (Task 17).
 *
 * One record per font program used by a document. While pages are painted the
 * record collects the glyph ids the text runs actually reference; when the
 * document is flushed it writes the object chain the PDF specification
 * requires for a Unicode-capable embedded font (ISO 32000-1 §9.7.4.2,
 * Identity-H):
 *
 *   Type0 font ── Encoding /Identity-H, DescendantFonts → CIDFontType2,
 *                 ToUnicode → CMap stream
 *   CIDFontType2 ── CIDToGIDMap /Identity (CID = glyph id), /W widths of the
 *                 used glyphs, FontDescriptor →
 *   FontDescriptor ── Flags/FontBBox/Ascent/Descent/ItalicAngle/CapHeight/
 *                 StemV from the parsed tables, FontFile2 →
 *   FontFile2 stream ── the font program subset to the glyphs actually used
 *                 (Task 22; whole when subsetting is impossible or would not
 *                 save bytes; deflated), /Length1 its raw size.
 *   ToUnicode stream ── `beginbfchar` map from every used glyph back to its
 *                 code point, so extracted/searched text equals the cells.
 *
 * Subsetting keeps glyph ids stable (unused ids below the highest used one get
 * empty glyphs), so the `Tj` hex strings, `/W` entries and ToUnicode codes the
 * pages already reference stay valid. The embedded program's name carries the
 * standard 6-letter subset tag (`ABCDEF+PostScriptName`).
 */
import { PdfDict, PdfHexString, PdfName, PdfRef, PdfTextString, PdfWriter, pdfNumber } from './pdf-writer.js';
import { subsetFontTag, subsetTrueTypeFont } from './truetype-subset.js';
import type { TrueTypeFont } from './truetype.js';

/** A pending-stream hook of `PdfResourcePool` (minimized to what this needs). */
export interface EmbeddedStreamSink {
  /** Reserve an object whose (uncompressed) body is deflated at flush time. */
  addPending(object: number, dict: PdfDict, data: Uint8Array): void;
}

interface PendingObjects {
  type0: number;
  cidFont: number;
  descriptor: number;
  toUnicode: number;
  fontFile: number;
}

/** One `beginbfchar` block holds at most 100 entries. */
const BCHAR_CHUNK = 100;

/**
 * The pool-side record of one embedded font: glyph lookup/encoding while
 * painting, object construction in `finalize()`.
 */
export class EmbeddedTrueTypeFont {
  /** The `/Fn`-style resource alias the content streams use. */
  readonly alias: PdfName;
  /** The parsed font program. */
  readonly font: TrueTypeFont;
  /** Glyph ids used, mapped to the first code point that referenced them. */
  private readonly used = new Map<number, number>();
  private readonly pending: PendingObjects;
  private finalized = false;
  /** The glyph id of `?`, resolved lazily (the documented last resort). */
  private questionGlyph: number | undefined;

  constructor(font: TrueTypeFont, alias: string, private readonly writer: PdfWriter, private readonly sink: EmbeddedStreamSink) {
    this.font = font;
    this.alias = new PdfName(alias);
    this.pending = {
      type0: writer.reserve(),
      cidFont: writer.reserve(),
      descriptor: writer.reserve(),
      toUnicode: writer.reserve(),
      fontFile: writer.reserve(),
    };
  }

  /** The `/Font` resource entry of this font (the Type0 object). */
  get type0Ref(): PdfRef {
    return new PdfRef(this.pending.type0);
  }

  /** Glyph id for a code point, counting it missing and using `?`/`.notdef` when absent. */
  glyph(codePoint: number, missing?: number[]): number {
    const glyph = this.font.glyphId(codePoint);
    if (glyph) {
      this.used.set(glyph, codePoint);
      return glyph;
    }
    missing?.push(codePoint);
    if (this.questionGlyph === undefined) this.questionGlyph = this.font.glyphId(0x3f);
    if (this.questionGlyph) {
      this.used.set(this.questionGlyph, 0x3f);
      return this.questionGlyph;
    }
    this.used.set(0, 0);
    return 0;
  }

  /** Advance width of a glyph in 1/1000 em (what `/W` and layout use). */
  advanceInEm(glyph: number): number {
    return this.font.advanceWidthInEm(glyph);
  }

  /** Encode `text` as the glyph-id hex operand of a `Tj` in Identity-H. */
  encode(text: string, missing?: number[]): PdfHexString {
    const bytes = new Uint8Array(text.length * 2 + 2);
    let used = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.codePointAt(i)!;
      if (code > 0xffff) i++;
      const glyph = this.glyph(code, missing);
      bytes[used++] = (glyph >> 8) & 0xff;
      bytes[used++] = glyph & 0xff;
    }
    return new PdfHexString(bytes.subarray(0, used));
  }

  /** The `/W` array: `[ c [ w1 w2 ... ] ... ]` over the used glyph ids. */
  private widthsArray(): (number | number[])[] {
    const glyphs = [...this.used.keys()].filter((glyph) => glyph !== 0).sort((a, b) => a - b);
    const items: (number | number[])[] = [];
    let index = 0;
    while (index < glyphs.length) {
      const start = glyphs[index]!;
      let end = index;
      while (end + 1 < glyphs.length && glyphs[end + 1] === glyphs[end]! + 1) end++;
      const widths: number[] = [];
      for (let i = start; i <= glyphs[end]!; i++) widths.push(this.advanceInEm(i));
      items.push(start, widths);
      index = end + 1;
    }
    return items;
  }

  /** Build the ToUnicode CMap for the glyphs actually used. */
  private toUnicodeCMap(): Uint8Array {
    const entries = [...this.used.entries()]
      .filter(([glyph, code]) => glyph !== 0 && code !== 0)
      .sort((a, b) => a[0] - b[0]);
    const lines: string[] = [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Adobe-Identity-UCS def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
    ];
    const hex = (value: number, width: number): string => value.toString(16).toUpperCase().padStart(width, '0');
    const unicode = (code: number): string => {
      if (code <= 0xffff) return `<${hex(code, 4)}>`;
      // Supplementary code point: its UTF-16 surrogate pair.
      const offset = code - 0x10000;
      return `<${hex(0xd800 + (offset >> 10), 4)}${hex(0xdc00 + (offset & 0x3ff), 4)}>`;
    };
    for (let from = 0; from < entries.length; from += BCHAR_CHUNK) {
      const chunk = entries.slice(from, from + BCHAR_CHUNK);
      lines.push(`${chunk.length} beginbfchar`);
      for (const [glyph, code] of chunk) lines.push(`<${hex(glyph, 4)}> ${unicode(code)}`);
      lines.push('endbfchar');
    }
    lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
    return new TextEncoder().encode(lines.join('\n'));
  }

  /**
   * The program to embed: a subset over the glyphs used by this document
   * (Task 22), or the whole font when subsetting is impossible or would not
   * actually save bytes. The subset name carries the `ABCDEF+` tag.
   */
  private embeddableProgram(): { bytes: Uint8Array; name: string } {
    const { font } = this;
    const glyphs = [...new Set(this.used.keys())].sort((a, b) => a - b);
    let subset: Uint8Array | null = null;
    try {
      subset = subsetTrueTypeFont(font, glyphs);
    } catch {
      subset = null;
    }
    if (subset && subset.length < font.bytes.length) {
      return { bytes: subset, name: `${subsetFontTag(font.postScriptName, glyphs)}+${font.postScriptName}` };
    }
    return { bytes: font.bytes, name: font.postScriptName };
  }

  /** Write every object of the chain. Called once, from the pool's flush. */
  finalize(): void {
    if (this.finalized) return;
    this.finalized = true;
    const { font } = this;
    const toEm = (value: number): number => pdfNumber((value * 1000) / font.unitsPerEm);
    const program = this.embeddableProgram();

    const fontFile = new PdfDict();
    fontFile.set('Length1', program.bytes.length);
    this.sink.addPending(this.pending.fontFile, fontFile, program.bytes);

    let flags = 32; // NonSymbolic: a CID font drawn with Identity-H.
    if (font.fixedPitch) flags |= 1;
    if (font.serif) flags |= 2;
    if (font.italic) flags |= 64;
    const descriptor = new PdfDict()
      .set('Type', new PdfName('FontDescriptor'))
      .set('FontName', new PdfName(program.name))
      .set('Flags', flags)
      .set('FontBBox', font.bbox.map(toEm))
      .set('ItalicAngle', pdfNumber(font.italicAngle))
      .set('Ascent', toEm(font.ascender))
      .set('Descent', toEm(font.descender))
      .set('CapHeight', toEm(font.capHeight || Math.round(font.ascender * 0.7)))
      .set('StemV', Math.max(40, Math.round(40 + font.weight / 12)))
      .set('FontFile2', new PdfRef(this.pending.fontFile));
    this.writer.setObject(this.pending.descriptor, descriptor);

    const cidFont = new PdfDict()
      .set('Type', new PdfName('Font'))
      .set('Subtype', new PdfName('CIDFontType2'))
      .set('BaseFont', new PdfName(program.name))
      .set('CIDSystemInfo', new PdfDict()
        .set('Registry', new PdfTextString('Adobe'))
        .set('Ordering', new PdfTextString('Identity'))
        .set('Supplement', 0))
      .set('FontDescriptor', new PdfRef(this.pending.descriptor))
      .set('DW', 1000)
      .set('W', this.widthsArray())
      .set('CIDToGIDMap', new PdfName('Identity'));
    this.writer.setObject(this.pending.cidFont, cidFont);

    const toUnicodeDict = new PdfDict();
    this.sink.addPending(this.pending.toUnicode, toUnicodeDict, this.toUnicodeCMap());

    const type0 = new PdfDict()
      .set('Type', new PdfName('Font'))
      .set('Subtype', new PdfName('Type0'))
      .set('BaseFont', new PdfName(program.name))
      .set('Encoding', new PdfName('Identity-H'))
      .set('DescendantFonts', [new PdfRef(this.pending.cidFont)])
      .set('ToUnicode', new PdfRef(this.pending.toUnicode));
    this.writer.setObject(this.pending.type0, type0);
  }
}

