/*
 * `GC.Spread.Sheets.PDF.PDFFontsManager` (Task 17): the global registry of
 * TrueType fonts embedded into PDFs by `Workbook.savePDF`.
 *
 * Contract (official d.ts + https://developer.mescius.com/spreadjs/api/
 * classes/GC.Spread.Sheets.PDF.PDFFontsManager):
 * - `registerFont(name, { normal?, bold?, italic?, boldItalic? })` registers
 *   the family's faces; every face is the font program as a base64 string (a
 *   `data:` URL prefix is tolerated) or an `ArrayBuffer`/typed array. Faces
 *   are parsed (and rejected with a clear error) at registration time.
 * - `fallbackFont` is BOTH a static getter/setter and — as the docs example
 *   shows — a function the user may replace entirely:
 *     `PDFFontsManager.fallbackFont = function (font) { return base64...; }`
 *   Called with no argument the built-in function reports the current
 *   fallback; with one it sets it (`null`/empty clears). The value is either
 *   a CSS font-family string (re-resolved through the registry), font bytes
 *   (used directly) or a provider function `(cssFont: string) => bytes | null`
 *   invoked for every unregistered family (results cached per family+style).
 *   Replacing the property with a function activates the provider directly;
 *   replacing it with bytes uses them for every unregistered family.
 *
 * Text drawing resolves a font as: registered family -> fallbackFont ->
 * base-14 WinAnsi approximation -> `?` (counted in the export report).
 * The registry is module-level state, shared by every workbook, like the
 * official one.
 */
import { parseTrueTypeFont, type TrueTypeFace, type TrueTypeFont } from './truetype.js';

/** A font program handed to the manager: base64 text or raw bytes. */
export type PdfFontData = string | ArrayBuffer | ArrayBufferView;

/** The four faces of one registered family. */
export interface PdfFontFaces {
  normal?: PdfFontData;
  bold?: PdfFontData;
  italic?: PdfFontData;
  boldItalic?: PdfFontData;
}

/** What `fallbackFont` accepts: bytes, a CSS family string, a provider, or null to clear. */
export type PdfFontFallback = string | ArrayBuffer | ArrayBufferView | ((font: string) => PdfFontData | null | undefined) | null;

type FaceRecord = Record<TrueTypeFace, TrueTypeFont | undefined>;
type FallbackProvider = (font: string) => PdfFontData | null | undefined;

const FACES: TrueTypeFace[] = ['normal', 'bold', 'italic', 'boldItalic'];

const registry = new Map<string, FaceRecord>();
let fallbackSetting: PdfFontFallback | null = null;
let fallbackParsed: TrueTypeFont | null = null;
let fallbackCss: string | null = null;
/** Cache of resolved fallback fonts, keyed by `familyList|flags`. */
const fallbackCache = new Map<string, TrueTypeFont | null>();
/** The raw value last seen in an overridden `fallbackFont` property. */
let observedOverride: unknown = undefined;

/** Registry key: trimmed, lower-cased family name. */
function familyKey(name: string): string {
  return String(name ?? '').trim().toLowerCase();
}

/** The family names of a CSS font-family list, quotes removed, in order. */
export function fontFamilies(cssFamily: string): string[] {
  const names: string[] = [];
  for (const part of String(cssFamily ?? '').split(',')) {
    const name = part.trim().replace(/^["']|["']$/g, '');
    if (name) names.push(name);
  }
  return names;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a base64 string (tolerating a `data:...;base64,` prefix) into bytes. */
export function decodeBase64Font(text: string): Uint8Array | null {
  let body = String(text).trim();
  const dataUrl = /^data:[^;]*;base64,/i.exec(body);
  if (dataUrl) body = body.slice(dataUrl[0].length);
  body = body.replace(/\s+/g, '');
  if (!body || body.length % 4 !== 0) return null;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((body.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < body.length; i += 4) {
    let chunk = 0;
    for (let j = 0; j < 4; j++) {
      const symbol = body[i + j]!;
      const value = symbol === '=' ? 0 : BASE64_ALPHABET.indexOf(symbol);
      if (value < 0) return null;
      chunk = (chunk << 6) | value;
    }
    bytes[at++] = (chunk >> 16) & 0xff;
    if (at < bytes.length) bytes[at++] = (chunk >> 8) & 0xff;
    if (at < bytes.length) bytes[at++] = chunk & 0xff;
  }
  return bytes;
}

/** True when the bytes start with an sfnt flavour the parser recognises. */
function looksLikeFont(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const flavor = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return flavor === 0x00010000
    || flavor === 0x74727565 /* true */
    || flavor === 0x74746366 /* ttcf */
    || flavor === 0x4f54544f; /* OTTO: recognised here, rejected by the parser */
}

/** Coerce one face/fallback value to font bytes; null when it is not bytes-like. */
function toFontBytes(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') {
    const bytes = decodeBase64Font(value);
    return bytes && looksLikeFont(bytes) ? bytes : null;
  }
  return null;
}

/** Parsed faces cached by content, so the same bytes never parse/embed twice. */
const parseCache = new Map<string, TrueTypeFont>();

function contentKey(bytes: Uint8Array): string {
  // FNV-1a over the whole program; cheap enough for font-sized inputs.
  let h1 = 0x811c9dc5;
  let h2 = 0x059c9d7f;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i]!, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + bytes[i]!, 0x85ebca6b) >>> 0;
  }
  return `${bytes.length}:${h1.toString(16)}:${h2.toString(16)}`;
}

function parseFontData(value: unknown, describe: string): TrueTypeFont {
  if (typeof value === 'string' && !value.trim()) throw new TypeError(`${describe} is empty.`);
  const bytes = toFontBytes(value);
  if (!bytes) throw new TypeError(`${describe} must be a base64 string or ArrayBuffer of a TrueType font.`);
  const key = contentKey(bytes);
  const cached = parseCache.get(key);
  if (cached) return cached;
  let font: TrueTypeFont;
  try {
    font = parseTrueTypeFont(bytes);
  } catch (error) {
    throw new TypeError(`${describe} could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
  parseCache.set(key, font);
  return font;
}

/** Pick the face of a registered family for bold/italic flags (nearest match). */
function pickFace(record: FaceRecord, bold: boolean, italic: boolean): TrueTypeFont | undefined {
  const order: TrueTypeFace[] = bold && italic
    ? ['boldItalic', 'bold', 'italic', 'normal']
    : bold
      ? ['bold', 'boldItalic', 'normal', 'italic']
      : italic
        ? ['italic', 'boldItalic', 'normal', 'bold']
        : ['normal', 'italic', 'bold', 'boldItalic'];
  for (const face of order) if (record[face]) return record[face];
  return undefined;
}

/** The registered face for a CSS font-family list, or null. */
function registeredFont(familyList: string, bold: boolean, italic: boolean): TrueTypeFont | null {
  for (const family of fontFamilies(familyList)) {
    const record = registry.get(familyKey(family));
    if (!record) continue;
    const face = pickFace(record, bold, italic);
    if (face) return face;
  }
  return null;
}

/**
 * The effective fallback provider: the user-replaced property (docs pattern),
 * the provider passed to the built-in setter, or null. A property replaced
 * with non-function data behaves like a provider that always returns it.
 */
function effectiveProvider(): FallbackProvider | null {
  if (PDFFontsManager.fallbackFont !== BUILTIN_FALLBACK_FONT) {
    const value = PDFFontsManager.fallbackFont as unknown;
    if (observedOverride !== value) {
      observedOverride = value;
      fallbackCache.clear();
    }
    if (typeof value === 'function') return value as FallbackProvider;
    return () => (value as PdfFontData | null | undefined);
  }
  if (typeof fallbackSetting === 'function') return fallbackSetting;
  return null;
}

function callProvider(provider: FallbackProvider, familyList: string, bold: boolean, italic: boolean): TrueTypeFont | null {
  const cacheKey = `${familyList}|${bold ? 'b' : ''}${italic ? 'i' : ''}`;
  if (fallbackCache.has(cacheKey)) return fallbackCache.get(cacheKey) ?? null;
  let font: TrueTypeFont | null = null;
  try {
    const result = provider(familyList);
    const bytes = toFontBytes(result);
    if (bytes) font = parseFontData(bytes, 'PDFFontsManager.fallbackFont');
    else if (typeof result === 'string' && result.trim()) font = registeredFont(result, bold, italic);
  } catch (error) {
    console.warn(`OpenSheets savePDF: PDFFontsManager.fallbackFont threw: ${String(error)}`);
  }
  fallbackCache.set(cacheKey, font);
  return font;
}

/**
 * Resolve the embedded font for a CSS font-family list (Task 17 step 3):
 * registered family -> fallbackFont -> null (the caller uses base-14).
 */
export function resolveEmbeddedFont(familyList: string, bold: boolean, italic: boolean): TrueTypeFont | null {
  const provider = effectiveProvider();
  if (provider) return registeredFont(familyList, bold, italic) ?? callProvider(provider, familyList, bold, italic);
  return registeredFont(familyList, bold, italic) ?? fallbackParsed ?? (fallbackCss ? registeredFont(fallbackCss, bold, italic) : null);
}

/** The built-in getter/setter behaviour of the `fallbackFont` property. */
function builtinFallbackFont(...args: unknown[]): unknown {
  if (args.length === 0) return fallbackSetting;
  const value = args[0] as PdfFontFallback;
  fallbackCache.clear();
  fallbackParsed = null;
  fallbackCss = null;
  if (value === null || value === undefined || value === '') {
    fallbackSetting = null;
    return null;
  }
  if (typeof value === 'function') {
    fallbackSetting = value;
    return value;
  }
  if (toFontBytes(value)) {
    fallbackParsed = parseFontData(value, 'PDFFontsManager.fallbackFont');
    fallbackSetting = value;
    return value;
  }
  if (typeof value === 'string') {
    fallbackCss = value;
    fallbackSetting = value;
    return value;
  }
  throw new TypeError('PDFFontsManager.fallbackFont: expected a font family string, font data or a provider function.');
}

/**
 * Global manager for the fonts `Workbook.savePDF` embeds. Static members only,
 * like the official class; constructing it is harmless.
 */
export class PDFFontsManager {
  /**
   * Register the faces of one font family for PDF embedding. The first family
   * name of a cell font that matches `name` (case-insensitive) selects this
   * font; faces missing for the requested bold/italic style take the nearest
   * registered face. Re-registering a name replaces its faces.
   */
  static registerFont(name: string, font: PdfFontFaces): void {
    if (typeof name !== 'string' || !name.trim()) {
      throw new TypeError('PDFFontsManager.registerFont: "name" must be a non-empty string.');
    }
    if (!font || typeof font !== 'object' || typeof (font as unknown) === 'function') {
      throw new TypeError('PDFFontsManager.registerFont: "font" must be an object with normal, bold, italic and/or boldItalic font data.');
    }
    const record: FaceRecord = { normal: undefined, bold: undefined, italic: undefined, boldItalic: undefined };
    let count = 0;
    for (const face of FACES) {
      const value = (font as Record<TrueTypeFace, PdfFontData | undefined>)[face];
      if (value === undefined || value === null || value === '') continue;
      record[face] = parseFontData(value, `PDFFontsManager.registerFont("${name}").${face}`);
      count++;
    }
    if (!count) {
      throw new TypeError('PDFFontsManager.registerFont: "font" must provide at least one of normal, bold, italic or boldItalic.');
    }
    registry.set(familyKey(name), record);
  }

  /**
   * Get (no argument) or set the fallback used when a cell font is not
   * registered: a CSS family string, font data (base64/ArrayBuffer), a
   * provider function, or null to clear. Assigning a function to the property
   * itself (the documented advanced pattern) works as well; then
   * `fallbackFont(cssFamilyList)` is called for every unregistered family and
   * its return value (font data) is embedded.
   */
  static fallbackFont(...args: unknown[]): unknown {
    // Rest forwarding preserves the arity: zero arguments is the getter, one the setter.
    return builtinFallbackFont(...args);
  }
}

/** Reference to the untouched built-in function, for override detection. */
const BUILTIN_FALLBACK_FONT = PDFFontsManager.fallbackFont;

/** Clear all module-level state — unit tests only. */
export function resetPdfFontsForTesting(): void {
  registry.clear();
  fallbackCache.clear();
  fallbackSetting = null;
  fallbackParsed = null;
  fallbackCss = null;
  observedOverride = undefined;
  PDFFontsManager.fallbackFont = BUILTIN_FALLBACK_FONT;
}
