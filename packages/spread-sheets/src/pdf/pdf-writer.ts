/*
 * Minimal PDF 1.7 document writer (Task 16: `Workbook.savePDF`).
 *
 * Everything here is written from the public PDF specification (ISO 32000-1):
 * an indirect-object table, a cross-reference table and a trailer. Values are
 * modelled with the small wrapper classes below so a plain JS `string` stays a
 * text string and a `PdfName` stays a name.
 *
 * Streams are compressed with zlib (`/Filter /FlateDecode`) through the
 * standard `CompressionStream('deflate')` API when the host provides it
 * (browsers, Node >= 18); otherwise the raw bytes are written uncompressed.
 */
import { winAnsiByteFor } from './pdf-fonts.js';

/** A PDF name object, written as `/Name` with `#XX` escapes. */
export class PdfName {
  constructor(readonly value: string) {}
  write(out: ByteSink): void {
    out.pushByte(0x2f); // '/'
    for (let i = 0; i < this.value.length; i++) {
      const code = this.value.charCodeAt(i);
      if (code < 0x21 || code > 0x7e || code === 0x23 || code === 0x28 || code === 0x29 || code === 0x3c || code === 0x3e || code === 0x5b || code === 0x5d || code === 0x7b || code === 0x7d || code === 0x2f) {
        out.pushAscii('#' + code.toString(16).toUpperCase().padStart(2, '0'));
      } else {
        out.pushByte(code);
      }
    }
  }
}

/** An indirect reference: `<object> 0 R`. */
export class PdfRef {
  constructor(readonly object: number) {}
  write(out: ByteSink): void {
    out.pushAscii(`${this.object} 0 R`);
  }
}

/** A PDF array. */
export class PdfArray {
  constructor(readonly items: PdfValue[] = []) {}
  write(out: ByteSink): void {
    out.pushByte(0x5b); // '['
    for (const item of this.items) { writeValue(item, out); out.pushByte(0x20); }
    out.pushByte(0x5d); // ']'
  }
}

/** A PDF dictionary, written in insertion order. */
export class PdfDict {
  private readonly entries = new Map<string, PdfValue>();
  set(key: string, value: PdfValue | undefined): this {
    if (value === undefined) this.entries.delete(key);
    else this.entries.set(key, value);
    return this;
  }
  get(key: string): PdfValue | undefined { return this.entries.get(key); }
  get size(): number { return this.entries.size; }
  write(out: ByteSink): void {
    out.pushAscii('<< ');
    for (const [key, value] of this.entries) {
      out.pushByte(0x2f);
      out.pushAscii(key);
      out.pushByte(0x20);
      writeValue(value, out);
      out.pushByte(0x20);
    }
    out.pushAscii(this.entries.size ? '>>' : ' >>');
  }
}

/** A text string written as a literal `(...)` with WinAnsi bytes. */
export class PdfTextString {
  constructor(readonly text: string, readonly missing?: number[]) {}
  write(out: ByteSink): void {
    out.pushByte(0x28); // '('
    for (const byte of encodeWinAnsi(this.text, this.missing)) writeEscaped(byte, out);
    out.pushByte(0x29); // ')'
  }
}

/** A byte string written as a hex string `<...>`. */
export class PdfHexString {
  constructor(readonly bytes: Uint8Array) {}
  /** The `<...>` operand text (for embedding directly into a content stream). */
  hex(): string {
    let body = '';
    for (const byte of this.bytes) body += byte.toString(16).padStart(2, '0');
    return `<${body}>`;
  }
  write(out: ByteSink): void {
    out.pushByte(0x3c);
    for (const byte of this.bytes) out.pushAscii(byte.toString(16).padStart(2, '0'));
    out.pushByte(0x3e);
  }
}

export type PdfValue = number | boolean | null | readonly PdfValue[] | PdfName | PdfRef | PdfArray | PdfDict | PdfTextString | PdfHexString;

/** Write any value (plain JS numbers/booleans/null/arrays included). */
export function writeValue(value: PdfValue, out: ByteSink): void {
  if (value === null) { out.pushAscii('null'); return; }
  if (typeof value === 'number') { writeNumber(value, out); return; }
  if (typeof value === 'boolean') { out.pushAscii(value ? 'true' : 'false'); return; }
  if (Array.isArray(value)) { new PdfArray([...value]).write(out); return; }
  (value as PdfName).write(out);
}

/** Round to the precision PDF content streams use (4 decimals). */
export function pdfNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e4) / 1e4;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Number formatting for PDF: fixed decimal notation, at most 4 decimals. */
export function pdfNumberText(value: number): string {
  const n = pdfNumber(value);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function writeNumber(value: number, out: ByteSink): void {
  out.pushAscii(pdfNumberText(value));
}

function writeEscaped(byte: number, out: ByteSink): void {
  if (byte === 0x28 || byte === 0x29 || byte === 0x5c) { out.pushByte(0x5c); out.pushByte(byte); return; }
  if (byte === 0x0a) { out.pushAscii('\\n'); return; }
  if (byte === 0x0d) { out.pushAscii('\\r'); return; }
  if (byte === 0x09) { out.pushAscii('\\t'); return; }
  if (byte === 0x08) { out.pushAscii('\\b'); return; }
  if (byte === 0x0c) { out.pushAscii('\\f'); return; }
  if (byte < 0x20 || byte > 0x7e) { out.pushAscii('\\' + byte.toString(8).padStart(3, '0')); return; }
  out.pushByte(byte);
}

/**
 * Map text to WinAnsi (code page 1252) bytes. Characters without a WinAnsi
 * code are replaced by `?` and their code points recorded in `missing`
 * (embedded TrueType fonts are task 17).
 */
export function encodeWinAnsi(text: string, missing?: number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i++;
    const byte = winAnsiByteFor(code);
    if (byte === null) {
      bytes.push(0x3f /* '?' */);
      missing?.push(code);
    } else bytes.push(byte);
  }
  return bytes;
}

/** Growable byte buffer with an ASCII convenience writer. */
export class ByteSink {
  private buffer = new Uint8Array(1 << 14);
  private used = 0;
  get length(): number { return this.used; }
  private ensure(extra: number): void {
    if (this.used + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.used + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.used));
    this.buffer = next;
  }
  pushByte(byte: number): void { this.ensure(1); this.buffer[this.used++] = byte & 0xff; }
  pushAscii(text: string): void { this.ensure(text.length); for (let i = 0; i < text.length; i++) this.buffer[this.used++] = text.charCodeAt(i) & 0xff; }
  pushBytes(data: Uint8Array): void { this.ensure(data.length); this.buffer.set(data, this.used); this.used += data.length; }
  bytes(): Uint8Array { return this.buffer.slice(0, this.used); }
}

interface PdfObjectBody {
  /** Serialized `n 0 obj ... endobj` bytes without the header. */
  value?: PdfValue;
  dict?: PdfDict;
  stream?: Uint8Array;
}

/** Compress with zlib when the host has `CompressionStream`; otherwise identity. */
export async function deflate(bytes: Uint8Array): Promise<{ data: Uint8Array; compressed: boolean }> {
  const Ctor = (globalThis as { CompressionStream?: new (format: string) => TransformStream }).CompressionStream;
  if (typeof Ctor !== 'function') return { data: bytes, compressed: false };
  try {
    const transformer = new Ctor('deflate');
    const writable = transformer.writable.getWriter();
    const read = transformer.readable.getReader();
    const write = writable.write(bytes).then(() => writable.close());
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await read.read();
      if (done) break;
      chunks.push(value as Uint8Array);
      size += (value as Uint8Array).length;
    }
    await write;
    const chunk = new Uint8Array(size);
    let at = 0;
    for (const part of chunks) { chunk.set(part, at); at += part.length; }
    // Only worth it when it actually saves bytes and the host produced data.
    if (chunk.length >= bytes.length || chunk.length === 0) return { data: bytes, compressed: false };
    return { data: chunk, compressed: true };
  } catch {
    return { data: bytes, compressed: false };
  }
}

/**
 * Collects indirect objects (dictionaries, optionally with a stream) and
 * serializes them with a byte-accurate cross-reference table.
 */
export class PdfWriter {
  private readonly objects: (PdfObjectBody | undefined)[] = [];
  /** Reserve an object number before its body is known (async image encoding). */
  reserve(): number {
    this.objects.push(undefined);
    return this.objects.length;
  }
  /** Add a plain object (dictionary, array, ...) and return its number. */
  addObject(value: PdfValue): number {
    const number = this.reserve();
    this.objects[number - 1] = { value };
    return number;
  }
  setObject(number: number, value: PdfValue): void {
    this.objects[number - 1] = { value };
  }
  setStream(number: number, dict: PdfDict, data: Uint8Array): void {
    this.objects[number - 1] = { dict, stream: data };
  }
  /** Serialize the document. Every reserved object must have been filled in. */
  build(root: PdfDict, info: PdfDict | null, documentId: Uint8Array): Uint8Array {
    const rootRef = new PdfRef(this.addObject(root));
    const infoRef = info ? new PdfRef(this.addObject(info)) : null;
    const out = new ByteSink();
    out.pushAscii('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n');
    const offsets: number[] = [];
    for (let i = 0; i < this.objects.length; i++) {
      const body = this.objects[i];
      if (!body) throw new Error(`PDF object ${i + 1} was never filled in`);
      offsets.push(out.length);
      out.pushAscii(`${i + 1} 0 obj\n`);
      if (body.stream) {
        body.dict!.set('Length', body.stream.length);
        body.dict!.write(out);
        out.pushAscii('\nstream\n');
        out.pushBytes(body.stream);
        out.pushAscii('\nendstream\n');
      } else {
        writeValue(body.value ?? null, out);
        out.pushByte(0x0a);
      }
      out.pushAscii('endobj\n');
    }
    const startxref = out.length;
    out.pushAscii(`xref\n0 ${this.objects.length + 1}\n`);
    out.pushAscii('0000000000 65535 f \n');
    for (const offset of offsets) out.pushAscii(`${String(offset).padStart(10, '0')} 00000 n \n`);
    const trailer = new PdfDict();
    trailer.set('Size', this.objects.length + 1);
    trailer.set('Root', rootRef);
    if (infoRef) trailer.set('Info', infoRef);
    trailer.set('ID', new PdfArray([new PdfHexString(documentId), new PdfHexString(documentId)]));
    out.pushAscii('trailer\n');
    trailer.write(out);
    out.pushAscii(`\nstartxref\n${startxref}\n%%EOF\n`);
    return out.bytes();
  }
}

/**
 * `%Y%m%d%H%M%S` PDF date (`D:` prefix added by the caller), from a Date. A
 * `Date` is an instant, so the stamp is written in UTC with the `Z` suffix the
 * PDF spec uses for it: the same input gives the same bytes whichever timezone
 * the export runs in. An explicit offset renders the instant in that zone.
 */
export function pdfDate(date: Date, timeZoneOffsetMinutes = 0): string {
  const pad = (n: number, width = 2): string => String(Math.abs(n)).padStart(width, '0');
  const local = new Date(date.getTime() + timeZoneOffsetMinutes * 60000);
  const sign = timeZoneOffsetMinutes === 0 ? 'Z' : `${timeZoneOffsetMinutes > 0 ? '+' : '-'}${pad(Math.floor(Math.abs(timeZoneOffsetMinutes) / 60))}'${pad(Math.abs(timeZoneOffsetMinutes) % 60)}'`;
  return `D:${pad(local.getUTCFullYear(), 4)}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}`
    + `${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}${sign}`;
}

/** 16-byte deterministic document id built from an FNV-1a hash of the seed. */
export function pdfDocumentId(seed: string): Uint8Array {
  const id = new Uint8Array(16);
  let h = 0xcbf29ce484222325;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x100000001b3) >>> 0;
    id[i % 16] = (id[i % 16] + (h & 0xff)) & 0xff;
  }
  return id;
}
