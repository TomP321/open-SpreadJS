/* Shared resource interning and rasterisation for the PDF writer (Task 16).
 *
 * Everything a content stream may reference besides its operators lives here:
 * the base-14 font objects, the `/ExtGState` opacity objects, axial shadings
 * for canvas gradients, image XObjects (with an alpha `/SMask`), plus the
 * report of approximated drawing calls. Streams whose bytes are only known
 * after painting (images, page contents) are reserved here and compressed by
 * `PdfResourcePool.flush()`, because zlib via `CompressionStream` is async
 * while `paintPrintPage` is synchronous.
 */
import { parseColor } from '../colors.js';
import { PdfDict, PdfName, PdfRef, deflate, pdfNumber, type PdfValue, type PdfWriter } from './pdf-writer.js';
import { EmbeddedTrueTypeFont } from './pdf-embedded.js';
import type { TrueTypeFont } from './truetype.js';

/** Paint style of the context: a CSS colour string, a gradient or a pattern. */
export type PdfPaintStyle = string | PdfLinearGradient | PdfPattern;

/** Axial (linear) gradient accepted by `fillStyle`/`strokeStyle`. */
export class PdfLinearGradient {
  readonly stops: { offset: number; rgb: number[]; alpha: number }[] = [];
  constructor(readonly x0: number, readonly y0: number, readonly x1: number, readonly y1: number) {}
  addColorStop(offset: number, color: string): void {
    const rgba = parseColor(String(color));
    if (!rgba) return;
    this.stops.push({
      offset: Math.max(0, Math.min(1, Number(offset) || 0)),
      rgb: [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255],
      alpha: rgba[3],
    });
  }
}

/** Canvas pattern substitute: the average colour of the pattern source. */
export class PdfPattern {
  constructor(readonly color: string) {}
}

/** Accumulates the non-WinAnsi characters and unsupported calls of a document. */
export interface PdfReport {
  /** Operation name -> number of times it was skipped or approximated. */
  counts: Record<string, number>;
  /** Distinct Unicode code points WinAnsi cannot encode (drawn as `?`). */
  missingChars: Set<number>;
}

export function createPdfReport(): PdfReport {
  return { counts: {}, missingChars: new Set<number>() };
}

interface PendingStream {
  object: number;
  dict: PdfDict;
  data: Uint8Array;
}

interface NamedRef {
  name: string;
  ref: PdfRef;
}

/** Interned `/Resources` of a document: fonts, extended states, shadings, images. */
export class PdfResourcePool {
  private readonly fonts = new Map<string, NamedRef>();
  private readonly embedded = new Map<TrueTypeFont, EmbeddedTrueTypeFont>();
  private readonly states = new Map<string, NamedRef>();
  private readonly shadings = new Map<string, NamedRef>();
  private readonly images = new Map<string, NamedRef>();
  private readonly imageOfSource = new WeakMap<object, NamedRef>();
  private fontCount = 0;
  private stateCount = 0;
  private shadingCount = 0;
  private imageCount = 0;
  /** Streams whose body is produced after painting (zlib compression is async). */
  readonly pending: PendingStream[] = [];

  constructor(readonly writer: PdfWriter) {}

  font(baseName: string): PdfName {
    let entry = this.fonts.get(baseName);
    if (!entry) {
      const object = this.writer.addObject(new PdfDict()
        .set('Type', new PdfName('Font'))
        .set('Subtype', new PdfName('Type1'))
        .set('BaseFont', new PdfName(baseName))
        .set('Encoding', new PdfName('WinAnsiEncoding')));
      entry = { name: `F${++this.fontCount}`, ref: new PdfRef(object) };
      this.fonts.set(baseName, entry);
    }
    return new PdfName(entry.name);
  }

  /**
   * Intern an embedded TrueType font (Task 17). The same parsed program shares
   * one Type0 object chain for the whole document; the record accumulates the
   * glyph ids used while pages paint and writes `/W`/ToUnicode at `flush()`.
   */
  embeddedFont(font: TrueTypeFont): EmbeddedTrueTypeFont {
    let entry = this.embedded.get(font);
    if (!entry) {
      entry = new EmbeddedTrueTypeFont(font, `F${++this.fontCount}`, this.writer, this);
      this.embedded.set(font, entry);
    }
    return entry;
  }

  /** Reserve a stream object whose raw bytes are deflated at `flush()`. */
  addPending(object: number, dict: PdfDict, data: Uint8Array): void {
    this.pending.push({ object, dict, data });
  }

  /** Opacity state, or null when fully opaque (the PDF default). */
  extState(alpha: number): PdfName | null {
    if (!(alpha < 0.9995)) return null;
    const rounded = Math.max(0, Math.round(alpha * 1000) / 1000);
    let entry = this.states.get(String(rounded));
    if (!entry) {
      const object = this.writer.addObject(new PdfDict()
        .set('Type', new PdfName('ExtGState'))
        .set('ca', rounded)
        .set('CA', rounded));
      entry = { name: `GS${++this.stateCount}`, ref: new PdfRef(object) };
      this.states.set(String(rounded), entry);
    }
    return new PdfName(entry.name);
  }

  axialShading(coords: number[], stops: { offset: number; rgb: number[] }[]): PdfName | null {
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    if (!sorted.length) return null;
    const key = JSON.stringify({ coords, sorted });
    let entry = this.shadings.get(key);
    if (!entry) {
      let fn: PdfValue;
      if (sorted.length <= 2) {
        fn = new PdfDict().set('FunctionType', 2).set('Domain', [0, 1])
          .set('C0', sorted[0]!.rgb)
          .set('C1', sorted[sorted.length - 1]!.rgb);
      } else {
        const functions: PdfValue[] = [];
        for (let i = 1; i < sorted.length; i++) {
          functions.push(new PdfDict().set('FunctionType', 2).set('Domain', [0, 1])
            .set('C0', sorted[i - 1]!.rgb)
            .set('C1', sorted[i]!.rgb));
        }
        const encode: number[] = [];
        for (let i = 0; i < functions.length; i++) encode.push(0, 1);
        fn = new PdfDict().set('FunctionType', 3).set('Domain', [0, 1])
          .set('Functions', functions)
          .set('Bounds', sorted.slice(1, -1).map((stop) => stop.offset))
          .set('Encode', encode);
      }
      const object = this.writer.addObject(new PdfDict()
        .set('ShadingType', 2)
        .set('ColorSpace', new PdfName('DeviceRGB'))
        .set('Coords', coords.map((v) => pdfNumber(v)))
        .set('Function', fn)
        .set('Extend', [true, true]));
      entry = { name: `Sh${++this.shadingCount}`, ref: new PdfRef(object) };
      this.shadings.set(key, entry);
    }
    return new PdfName(entry.name);
  }

  /** Reuse the XObject of a full-source image that is already embedded. */
  imageForSource(source: object): NamedRef | undefined {
    return this.imageOfSource.get(source);
  }

  /** Reserve an image XObject; its (compressed) body is written by `flush()`. */
  addImage(source: object | null, rgb: Uint8Array, alpha: Uint8Array | null, width: number, height: number): PdfName {
    const name = `Im${++this.imageCount}`;
    const object = this.writer.reserve();
    const dict = new PdfDict()
      .set('Type', new PdfName('XObject'))
      .set('Subtype', new PdfName('Image'))
      .set('Width', width)
      .set('Height', height)
      .set('ColorSpace', new PdfName('DeviceRGB'))
      .set('BitsPerComponent', 8);
    this.pending.push({ object, dict, data: rgb });
    if (alpha) {
      const smask = this.writer.reserve();
      this.pending.push({
        object: smask,
        dict: new PdfDict()
          .set('Type', new PdfName('XObject'))
          .set('Subtype', new PdfName('Image'))
          .set('Width', width)
          .set('Height', height)
          .set('ColorSpace', new PdfName('DeviceGray'))
          .set('BitsPerComponent', 8),
        data: alpha,
      });
      dict.set('SMask', new PdfRef(smask));
    }
    const entry: NamedRef = { name, ref: new PdfRef(object) };
    this.images.set(name, entry);
    if (source) this.imageOfSource.set(source, entry);
    return new PdfName(name);
  }

  /** Compress every pending stream body. Called after all pages are painted. */
  async flush(): Promise<void> {
    for (const entry of this.embedded.values()) entry.finalize();
    for (const stream of this.pending) {
      const { data, compressed } = await deflate(stream.data);
      if (compressed) stream.dict.set('Filter', new PdfName('FlateDecode'));
      this.writer.setStream(stream.object, stream.dict, data);
    }
    this.pending.length = 0;
  }

  resources(): PdfDict {
    const dict = new PdfDict();
    const group = (prefix: string, entries: Map<string, NamedRef>): void => {
      if (!entries.size) return;
      const child = new PdfDict();
      for (const entry of entries.values()) child.set(entry.name, entry.ref);
      dict.set(prefix, child);
    };
    if (this.fonts.size || this.embedded.size) {
      const child = new PdfDict();
      for (const entry of this.fonts.values()) child.set(entry.name, entry.ref);
      for (const entry of this.embedded.values()) child.set(entry.alias.value, entry.type0Ref);
      dict.set('Font', child);
    }
    group('XObject', this.images);
    group('ExtGState', this.states);
    group('Shading', this.shadings);
    dict.set('ProcSet', ['PDF', 'Text', 'ImageB', 'ImageC', 'ImageI'].map((name) => new PdfName(name)));
    return dict;
  }
}

export interface Raster { width: number; height: number; rgb: Uint8Array; alpha: Uint8Array | null }

/** Pixel dimensions of a drawable source, or null when it has none. */
export function sourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  if (!source || typeof source !== 'object') return null;
  // `in` guards narrow the CanvasImageSource union: only images have the
  // natural* size, SVG elements report width/height as SVGAnimatedLength.
  let width = 0;
  let height = 0;
  if ('naturalWidth' in source) {
    // Load-fallback like the reference measured: natural size, else the element size.
    width = source.naturalWidth || source.width;
    height = source.naturalHeight || source.height;
  } else if ('width' in source) {
    const w: unknown = source.width;
    const h: unknown = source.height;
    width = typeof w === 'number' ? w : 0;
    height = typeof h === 'number' ? h : 0;
  }
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Split RGBA pixels into an RGB stream and an alpha stream (null when opaque). */
export function splitRgba(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): Raster {
  const count = width * height;
  const rgb = new Uint8Array(count * 3);
  const alpha = new Uint8Array(count);
  let transparent = false;
  for (let i = 0; i < count; i++) {
    rgb[i * 3] = pixels[i * 4]!;
    rgb[i * 3 + 1] = pixels[i * 4 + 1]!;
    rgb[i * 3 + 2] = pixels[i * 4 + 2]!;
    const a = pixels[i * 4 + 3]!;
    alpha[i] = a;
    if (a !== 255) transparent = true;
  }
  return { width, height, rgb, alpha: transparent ? alpha : null };
}

/**
 * Read the pixels of a canvas image source. Canvas-like sources answer
 * `getImageData` directly (also in tests); images go through an offscreen copy,
 * which needs a DOM. `count` receives the reason when nothing could be read.
 */
export function rasterize(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  count: (key: string) => void,
): Raster | null {
  const width = Math.max(1, Math.round(sw)), height = Math.max(1, Math.round(sh));
  const context = 'getContext' in source ? source.getContext('2d') : null;
  if (context?.getImageData) {
    try {
      return splitRgba(context.getImageData(Math.round(sx), Math.round(sy), width, height).data, width, height);
    } catch { /* fall through to the offscreen copy */ }
  }
  const doc = (globalThis as { document?: Document }).document;
  if (doc?.createElement) {
    try {
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const offscreen = canvas.getContext('2d');
      if (!offscreen?.getImageData || !offscreen.drawImage) { count('drawImage:no-2d-context'); return null; }
      offscreen.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
      return splitRgba(offscreen.getImageData(0, 0, width, height).data, width, height);
    } catch {
      count('drawImage:rasterize-failed');
      return null;
    }
  }
  count('drawImage:no-rasterizer');
  return null;
}

/** Average colour of a pattern source, used instead of a real tiling pattern. */
export function averageColor(source: unknown, count: (key: string) => void): string {
  count('createPattern');
  const size = source ? sourceSize(source as CanvasImageSource) : null;
  const raster = size ? rasterize(source as CanvasImageSource, 0, 0, size.width, size.height, count) : null;
  if (!raster) return '#808080';
  const total = raster.width * raster.height;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < total; i++) {
    r += raster.rgb[i * 3]!;
    g += raster.rgb[i * 3 + 1]!;
    b += raster.rgb[i * 3 + 2]!;
  }
  const hex = (v: number): string => Math.round(v / total).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
