/*
 * `PdfCanvasContext` (Task 16): a CanvasRenderingContext2D-compatible recorder
 * that turns the drawing calls of the print painter (`paintPrintPage`) into a
 * PDF content stream, so `Workbook.savePDF` exports exactly the vector drawing
 * that printing shows.
 *
 * Coordinate system: the print pipeline works in CSS pixels of a 96 dpi page
 * (`HUNDREDTHS_TO_PX` in `print.ts`), so one print pixel is 72/96 = 0.75 pt.
 * The canvas' y-down space is flipped into PDF's y-up user space once by
 * folding `PX_TO_PT` and the page height into the device matrix applied to
 * every coordinate; the content stream therefore needs no `cm` for the page.
 *
 * Approximations (counted in the shared `report`, warned in dev, documented in
 * docs/STATUS.md): gradients become axial shadings, patterns a solid average
 * colour, `clearRect` a white fill and gradient strokes a mid colour. Text is
 * drawn with the embedded TrueType font registered for the cell's family
 * (`PDFFontsManager.registerFont`, task 17); families without a registration
 * use the base-14 WinAnsi approximation, and only characters neither can
 * write become `?` (counted).
 */
import { parseColor, type RGBA } from '../colors.js';
import {
  PdfDict,
  PdfName,
  deflate,
  encodeWinAnsi,
  pdfNumberText,
} from './pdf-writer.js';
import { BASE14_FONTS, firstFontFamily, parseCssFont, selectFont, winAnsiByteFor } from './pdf-fonts.js';
import { resolveEmbeddedFont } from './fonts-manager.js';
import type { EmbeddedTrueTypeFont } from './pdf-embedded.js';
import type { TrueTypeFont } from './truetype.js';
import {
  averageColor,
  createPdfReport,
  PdfLinearGradient,
  PdfPattern,
  PdfResourcePool,
  rasterize,
  sourceSize,
  type PdfPaintStyle,
  type PdfReport,
} from './pdf-resources.js';

/** Re-exported so callers of the drawing context can build the same values. */
export {
  createPdfReport,
  PdfLinearGradient,
  PdfPattern,
  PdfResourcePool,
  type PdfPaintStyle,
  type PdfReport,
};

/** Print pixel (1/96 inch) -> PDF point. */
export const PX_TO_PT = 0.75;

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }

const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

interface CanvasState {
  fillStyle: PdfPaintStyle;
  strokeStyle: PdfPaintStyle;
  lineWidth: number;
  lineDash: number[];
  lineDashOffset: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  /** Normalized CSS shorthand, as a browser's `ctx.font` getter reports it. */
  fontString: string;
  bold: boolean;
  italic: boolean;
  /** Font size in CSS pixels (of the user space). */
  fontSize: number;
  fontFamily: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  ctm: Matrix;
}

export interface PdfCanvasContextOptions {
  /** Page width in print pixels. */
  width: number;
  /** Page height in print pixels. */
  height: number;
  pool: PdfResourcePool;
  report?: PdfReport;
}

/**
 * A 2D drawing context that records PDF operators instead of painting pixels.
 * Only the subset used by the print pipeline (and the cell renderer) is real;
 * everything else is counted in the report so nothing fails silently.
 */
export class PdfCanvasContext {
  /** Page size in print pixels. */
  readonly width: number;
  readonly height: number;
  readonly heightPt: number;
  /** Object number reserved for this page's content stream. */
  readonly contentObject: number;
  private readonly out: string[] = [];
  private path: string[] = [];
  private lastX: number | null = null;
  private lastY: number | null = null;
  private readonly stack: CanvasState[] = [];
  private state: CanvasState;
  private readonly report: PdfReport;
  private readonly pool: PdfResourcePool;
  /** Resolved text font, valid while the bold/italic/family state is unchanged. */
  private textFontCache: EmbeddedTrueTypeFont | Base14Key | undefined;
  private textFontKey = '';

  constructor(options: PdfCanvasContextOptions) {
    this.width = options.width;
    this.height = options.height;
    this.heightPt = this.height * PX_TO_PT;
    this.pool = options.pool;
    this.report = options.report ?? createPdfReport();
    this.state = {
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineDash: [],
      lineDashOffset: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      fontString: '10px sans-serif',
      bold: false,
      italic: false,
      fontSize: 10,
      fontFamily: 'sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      ctm: { ...IDENTITY_MATRIX },
    };
    this.contentObject = this.pool.writer.reserve();
  }

  /* ------------------------------------------------------------ plumbing */

  /** Count an unsupported or approximated operation. */
  count(key: string): void {
    this.report.counts[key] = (this.report.counts[key] ?? 0) + 1;
  }
  get unsupported(): Record<string, number> { return this.report.counts; }
  get missingChars(): Set<number> { return this.report.missingChars; }
  private write(text: string): void { this.out.push(text); }
  private num(value: number): string { return pdfNumberText(value); }

  /** Device (PDF user space, points, y up) of a user-space pixel coordinate. */
  private dx(x: number, y: number): number {
    const m = this.state.ctm;
    return PX_TO_PT * (m.a * x + m.c * y + m.e);
  }
  private dy(x: number, y: number): number {
    const m = this.state.ctm;
    return this.heightPt - PX_TO_PT * (m.b * x + m.d * y + m.f);
  }
  /** Isotropic scale factor the CTM applies to stroke widths and dash lengths. */
  private strokeScale(): number {
    const m = this.state.ctm;
    return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  }

  /* ------------------------------------------------------- transform API */

  save(): void {
    this.stack.push({ ...this.state, ctm: { ...this.state.ctm }, lineDash: [...this.state.lineDash] });
    this.write('q\n');
  }
  restore(): void {
    const previous = this.stack.pop();
    if (!previous) this.count('restore:unbalanced');
    else this.state = previous;
    this.write('Q\n');
  }
  translate(x: number, y: number): void {
    const m = this.state.ctm;
    m.e += m.a * x + m.c * y;
    m.f += m.b * x + m.d * y;
  }
  scale(x: number, y: number): void {
    const m = this.state.ctm;
    m.a *= x; m.b *= x; m.c *= y; m.d *= y;
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const m = this.state.ctm;
    const { a: oa, b: ob, c: oc, d: od, e: oe, f: of } = m;
    m.a = oa * a + oc * b;
    m.b = ob * a + od * b;
    m.c = oa * c + oc * d;
    m.d = ob * c + od * d;
    m.e = oa * e + oc * f + oe;
    m.f = ob * e + od * f + of;
  }
  setTransform(a: number | Matrix, b?: number, c?: number, d?: number, e?: number, f?: number): void {
    if (typeof a === 'object' && a !== null) this.state.ctm = { a: a.a, b: a.b, c: a.c, d: a.d, e: a.e, f: a.f };
    else this.state.ctm = { a: a ?? 1, b: b ?? 0, c: c ?? 0, d: d ?? 1, e: e ?? 0, f: f ?? 0 };
  }
  resetTransform(): void { this.state.ctm = { ...IDENTITY_MATRIX }; }
  getTransform(): Matrix { return { ...this.state.ctm }; }

  /* -------------------------------------------------------- attribute API */

  get fillStyle(): PdfPaintStyle { return this.state.fillStyle; }
  set fillStyle(value: PdfPaintStyle) { this.state.fillStyle = normalizeStyle(value, this, 'fillStyle'); }
  get strokeStyle(): PdfPaintStyle { return this.state.strokeStyle; }
  set strokeStyle(value: PdfPaintStyle) { this.state.strokeStyle = normalizeStyle(value, this, 'strokeStyle'); }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(value: number) {
    const width = Number(value);
    if (!(width > 0)) { this.count('lineWidth:invalid'); return; }
    this.state.lineWidth = width;
  }
  get lineCap(): string { return this.state.lineCap; }
  set lineCap(value: string) { this.state.lineCap = value; }
  get lineJoin(): string { return this.state.lineJoin; }
  set lineJoin(value: string) { this.state.lineJoin = value; }
  get miterLimit(): number { return this.state.miterLimit; }
  set miterLimit(value: number) { this.state.miterLimit = Number(value) || 0; }
  get lineDashOffset(): number { return this.state.lineDashOffset; }
  set lineDashOffset(value: number) { this.state.lineDashOffset = Number(value) || 0; }
  setLineDash(dashes: number[]): void {
    const list = Array.isArray(dashes) ? dashes.map((v) => Math.max(0, Number(v) || 0)) : [];
    this.state.lineDash = list.length % 2 ? [...list, ...list] : list;
  }
  getLineDash(): number[] { return [...this.state.lineDash]; }
  get globalAlpha(): number { return this.state.globalAlpha; }
  set globalAlpha(value: number) {
    const alpha = Number(value);
    if (!Number.isFinite(alpha)) { this.count('globalAlpha:invalid'); return; }
    this.state.globalAlpha = Math.max(0, Math.min(1, alpha));
  }
  /** Reported the way a browser reports it: normalized, sizes in px. */
  get font(): string {
    return `${this.state.italic ? 'italic ' : ''}${this.state.bold ? 'bold ' : ''}${this.num(this.state.fontSize)}px ${this.state.fontFamily}`;
  }
  set font(value: string) {
    const text = String(value ?? '');
    const parsed = parseCssFont(text);
    if (!parsed.parsed) { this.count('font:ignored'); return; }
    this.state.bold = parsed.bold;
    this.state.italic = parsed.italic;
    this.state.fontSize = parsed.size;
    this.state.fontFamily = parsed.family;
  }
  get textAlign(): string { return this.state.textAlign; }
  set textAlign(value: string) { this.state.textAlign = value; }
  get textBaseline(): string { return this.state.textBaseline; }
  set textBaseline(value: string) { this.state.textBaseline = value; }
  get canvas(): { width: number; height: number } { return { width: this.width, height: this.height }; }

  /* ------------------------------------------------------------- path API */

  beginPath(): void { this.path = []; this.lastX = null; this.lastY = null; }
  closePath(): void { this.path.push('h\n'); }
  moveTo(x: number, y: number): void {
    this.path.push(`${this.num(this.dx(x, y))} ${this.num(this.dy(x, y))} m\n`);
    this.lastX = x; this.lastY = y;
  }
  lineTo(x: number, y: number): void {
    if (this.lastX === null) { this.moveTo(x, y); return; }
    this.path.push(`${this.num(this.dx(x, y))} ${this.num(this.dy(x, y))} l\n`);
    this.lastX = x; this.lastY = y;
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.withTemporaryPath(() => {
      this.rect(x, y, w, h);
      this.paintPath('fill');
    });
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.withTemporaryPath(() => {
      this.rect(x, y, w, h);
      this.paintPath('stroke');
    });
  }
  /**
   * Canvas erases to transparent; a flattened page has nothing below it, so
   * this paints white (counted, and only reached on an opaque page).
   */
  clearRect(x: number, y: number, w: number, h: number): void {
    this.count('clearRect');
    this.withTemporaryPath(() => {
      this.rect(x, y, w, h);
      this.write('1 1 1 rg\n');
      this.emit(this.path);
      this.write('f\n');
    });
  }
  private withTemporaryPath(paint: () => void): void {
    const path = this.path, lastX = this.lastX, lastY = this.lastY;
    this.path = []; this.lastX = null; this.lastY = null;
    paint();
    this.path = path; this.lastX = lastX; this.lastY = lastY;
  }
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise = false): void {
    const r = Number(radius);
    if (!Number.isFinite(r) || r < 0) { this.count('arc:invalid'); return; }
    this.appendArc(x, y, r, r, Number(start), Number(end), anticlockwise, 0);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, rotation: number, start: number, end: number, anticlockwise = false): void {
    if (!(rx >= 0) || !(ry >= 0)) { this.count('ellipse:invalid'); return; }
    this.appendArc(cx, cy, rx, ry, Number(start), Number(end), anticlockwise, Number(rotation) || 0);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const x0 = this.lastX ?? cx, y0 = this.lastY ?? cy;
    this.bezierCurveTo(x0 + (2 / 3) * (cx - x0), y0 + (2 / 3) * (cy - y0), x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y), x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (this.lastX === null) this.moveTo(c1x, c1y);
    this.path.push(`${this.num(this.dx(c1x, c1y))} ${this.num(this.dy(c1x, c1y))} `
      + `${this.num(this.dx(c2x, c2y))} ${this.num(this.dy(c2x, c2y))} `
      + `${this.num(this.dx(x, y))} ${this.num(this.dy(x, y))} c\n`);
    this.lastX = x; this.lastY = y;
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    const r = Number(radius);
    if (!Number.isFinite(r) || r < 0) { this.count('arcTo:invalid'); return; }
    this.count('arcTo');
    const cx = this.lastX ?? x1, cy = this.lastY ?? y1;
    const from = Math.atan2(y1 - cy, x1 - cx);
    let delta = Math.atan2(y2 - y1, x2 - x1) - from;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (this.lastX === null) this.moveTo(cx, cy);
    else this.lineTo(x1, y1);
    this.appendArc(x1, y1, r, r, from + Math.PI / 2, from + Math.PI / 2 + delta, delta < 0, 0);
  }

  private appendArc(cx: number, cy: number, rx: number, ry: number, start: number, end: number, anticlockwise: boolean, rotation: number): void {
    let delta = end - start;
    if (anticlockwise) {
      while (delta > 0) delta -= 2 * Math.PI;
      if (delta === 0) delta = -2 * Math.PI;
    } else {
      while (delta < 0) delta += 2 * Math.PI;
      if (delta === 0) delta = 2 * Math.PI;
    }
    const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
    const step = delta / segments;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const at = (angle: number): [number, number] => {
      const ux = rx * Math.cos(angle), uy = ry * Math.sin(angle);
      return [cx + ux * cos - uy * sin, cy + ux * sin + uy * cos];
    };
    const tangent = (angle: number): [number, number] => {
      const ux = -rx * Math.sin(angle), uy = ry * Math.cos(angle);
      return [ux * cos - uy * sin, ux * sin + uy * cos];
    };
    for (let i = 0; i < segments; i++) {
      const a = start + step * i, b = a + step;
      const h = (4 / 3) * Math.tan((b - a) / 4);
      const [x1, y1] = at(a), [x2, y2] = at(b);
      const [t1x, t1y] = tangent(a), [t2x, t2y] = tangent(b);
      if (i === 0) {
        if (this.lastX === null) this.moveTo(x1, y1);
        else this.lineTo(x1, y1);
      }
      this.bezierCurveTo(x1 + h * t1x, y1 + h * t1y, x2 - h * t2x, y2 - h * t2y, x2, y2);
    }
  }

  /* ----------------------------------------------------------- paint ops */

  private emit(ops: string[]): void { for (const op of ops) this.write(op); }

  private writeColor(rgb: RGBA, stroke: boolean): void {
    this.write(`${rgb.slice(0, 3).map((v) => this.num(v / 255)).join(' ')} ${stroke ? 'RG' : 'rg'}\n`);
  }
  private writeAlpha(alpha: number): void {
    const state = this.pool.extState(this.state.globalAlpha * alpha);
    if (state) this.write(`/${state.value} gs\n`);
  }
  private writeStrokeState(): void {
    const scale = PX_TO_PT * this.strokeScale();
    this.write(`${this.num(this.state.lineWidth * scale)} w\n`);
    const dash = this.state.lineDash.map((v) => this.num(v * scale));
    this.write(`[${dash.join(' ')}] ${this.num(this.state.lineDashOffset * scale)} d\n`);
    this.write(`${capOf(this.state.lineCap)} J\n${joinOf(this.state.lineJoin)} j\n`);
    this.write(`${this.num(this.state.miterLimit)} M\n`);
  }

  private paintPath(mode: 'fill' | 'stroke', rule?: string): void {
    if (!this.path.length) return;
    const style = mode === 'fill' ? this.state.fillStyle : this.state.strokeStyle;
    if (style instanceof PdfLinearGradient) {
      if (mode === 'stroke') {
        // `sh` can only paint areas: stroke a gradient with its mid colour.
        this.count('stroke:gradient');
        this.writeColor(midColor(style.stops), true);
        this.writeStrokeState();
      } else {
        const coords = [
          this.dx(style.x0, style.y0), this.dy(style.x0, style.y0),
          this.dx(style.x1, style.y1), this.dy(style.x1, style.y1),
        ];
        const shading = this.pool.axialShading(coords, style.stops);
        if (!shading) { this.count('fill:empty-gradient'); return; }
        const alpha = style.stops.length
          ? style.stops.reduce((sum, stop) => sum + stop.alpha, 0) / style.stops.length
          : 1;
        this.write('q\n');
        this.writeAlpha(alpha);
        this.emit(this.path);
        this.write(`${rule === 'evenodd' ? 'W*' : 'W'} n\n/${shading.value} sh\nQ\n`);
        return;
      }
    } else {
      if (style instanceof PdfPattern) this.count(mode === 'fill' ? 'fill:pattern' : 'stroke:pattern');
      const rgba = style instanceof PdfPattern
        ? parseColor(style.color) ?? [128, 128, 128, 1]
        : parseColor(String(style)) ?? [0, 0, 0, 1];
      this.writeColor(rgba, mode === 'stroke');
      this.writeAlpha(rgba[3]);
      if (mode === 'stroke') this.writeStrokeState();
    }
    this.emit(this.path);
    this.write(mode === 'fill' ? (rule === 'evenodd' ? 'f*\n' : 'f\n') : 'S\n');
  }

  fill(rule?: string): void { this.paintPath('fill', rule); }
  stroke(): void { this.paintPath('stroke'); }
  clip(rule?: string): void {
    if (!this.path.length) return;
    this.emit(this.path);
    this.write(`${rule === 'evenodd' ? 'W*' : 'W'} n\n`);
  }

  /* ------------------------------------------------------------- text API */

  /**
   * The text font for the current state (Task 17 order): registered family
   * face -> fallbackFont -> base-14 for WinAnsi text. Cached until the font
   * state changes; the base-14 vs embedded decision does not look at the
   * text itself, only the fallback to `?`-drawing per character does.
   */
  private textFont(): EmbeddedTrueTypeFont | Base14Key {
    const { fontFamily, bold, italic } = this.state;
    if (this.textFontCache && this.textFontKey === `${bold}|${italic}|${fontFamily}`) return this.textFontCache;
    const font: TrueTypeFont | null = resolveEmbeddedFont(fontFamily, bold, italic);
    const resolved: EmbeddedTrueTypeFont | Base14Key = font
      ? this.pool.embeddedFont(font)
      : selectFont(firstFontFamily(fontFamily), this.state.fontSize, bold, italic).fontKey as Base14Key;
    this.textFontCache = resolved;
    this.textFontKey = `${bold}|${italic}|${fontFamily}`;
    return resolved;
  }

  /**
   * Offset (CSS px) from `fillText`'s `y` down to the alphabetic baseline for
   * the current `textBaseline`. With an embedded TrueType this reproduces
   * Blink's `TextMetrics::GetFontBaseline` (normalized typo ascender/descender
   * over a 1em box, LayoutUnit-quantized); the base-14 path keeps the AFM
   * metrics task 16 calibrated for the WinAnsi approximation.
   */
  private baselineOffset(size: number): number {
    const font = this.textFont();
    const baseline = this.state.textBaseline;
    if (typeof font !== 'string') {
      if (baseline === 'top') return font.font.canvasBaselineOffset(size, 'top');
      if (baseline === 'middle') return font.font.canvasBaselineOffset(size, 'middle');
      if (baseline === 'bottom' || baseline === 'ideographic') return font.font.canvasBaselineOffset(size, 'bottom');
      if (baseline === 'hanging') return 0.8 * font.font.canvasBaselineOffset(size, 'top'); // Blink's documented fallback
      return 0;
    }
    const metrics = BASE14_FONTS[font];
    const ascent = (metrics.ascender / 1000) * size;
    const descent = (-metrics.descender / 1000) * size;
    return baseline === 'top' ? ascent
      : baseline === 'hanging' ? ascent - 0.05 * size
        : baseline === 'middle' ? (ascent - descent) / 2
          : baseline === 'bottom' || baseline === 'ideographic' ? -descent : 0;
  }

  /** Colour of a text run: gradients use their mid stop, patterns their average. */
  private textPaint(): RGBA {
    const style = this.state.fillStyle;
    if (style instanceof PdfLinearGradient) {
      this.count('fillText:gradient');
      return midColor(style.stops);
    }
    if (style instanceof PdfPattern) {
      this.count('fillText:pattern');
      return parseColor(style.color) ?? [0, 0, 0, 1];
    }
    return parseColor(String(style)) ?? [0, 0, 0, 1];
  }

  /**
   * Width of one character in 1/1000 em under the resolved text font, with
   * missing code points counted and substituted by `?` (or the font default).
   */
  private charWidthEm(code: number, missing: number[]): number {
    const font = this.textFont();
    if (typeof font === 'string') {
      const widths = BASE14_FONTS[font].widths;
      const byte = winAnsiByteFor(code);
      if (byte === null) {
        missing.push(code);
        return widths[0x3f]!;
      }
      return widths[byte]!;
    }
    const glyph = font.glyph(code, missing);
    return font.advanceInEm(glyph);
  }

  measureText(text: string): { width: number } {
    const content = String(text ?? '');
    const missing: number[] = [];
    let total = 0;
    for (let i = 0; i < content.length; i++) {
      const code = content.codePointAt(i)!;
      if (code > 0xffff) i++;
      total += this.charWidthEm(code, missing);
    }
    for (const code of missing) this.report.missingChars.add(code);
    // Chromium's measureText ignores the CTM, so this one does too.
    return { width: (total / 1000) * this.state.fontSize };
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    const content = String(text ?? '');
    if (!content) return;
    if (Number(maxWidth) > 0) this.count('fillText:maxWidth');
    const font = this.textFont();
    const size = this.state.fontSize;
    const width = this.measureText(content).width;
    const align = this.state.textAlign;
    const shift = align === 'center' ? -width / 2 : align === 'right' || align === 'end' ? -width : 0;
    const offset = this.baselineOffset(size);
    const px = x + shift, py = y + offset;
    const m = this.state.ctm;
    const rgba = this.textPaint();
    const missing: number[] = [];
    let operand: string;
    let name: PdfName;
    if (typeof font === 'string') {
      const bytes = encodeWinAnsi(content, missing);
      operand = `(${escapeBytes(bytes)})`;
      name = this.pool.font(BASE14_FONTS[font].name);
    } else {
      operand = font.encode(content, missing).hex();
      name = font.alias;
    }
    for (const code of missing) this.report.missingChars.add(code);
    this.writeColor(rgba, false);
    this.writeAlpha(rgba[3]);
    this.write('BT\n');
    // The text matrix carries the px->pt scale with the y axis flipped back,
    // so glyphs stay upright while the page space itself is y-down.
    this.write(`${this.num(PX_TO_PT * m.a)} ${this.num(-PX_TO_PT * m.b)} ${this.num(-PX_TO_PT * m.c)} ${this.num(PX_TO_PT * m.d)} `
      + `${this.num(this.dx(px, py))} ${this.num(this.dy(px, py))} Tm\n`);
    this.write(`/${name.value} ${this.num(size)} Tf\n`);
    this.write(`${operand} Tj\nET\n`);
  }

  strokeText(text: string, x: number, y: number): void {
    this.count('strokeText');
    this.fillText(text, x, y);
  }

  /* ------------------------------------------------------- image and misc */

  drawImage(source: CanvasImageSource, ...args: number[]): void {
    const cropped = args.length >= 8;
    const rect = cropped
      ? { sx: args[0]!, sy: args[1]!, sw: args[2]!, sh: args[3]!, dx: args[4]!, dy: args[5]!, dw: args[6]!, dh: args[7]! }
      : { sx: 0, sy: 0, sw: 0, sh: 0, dx: args[0]!, dy: args[1]!, dw: args[2] ?? 0, dh: args[3] ?? 0 };
    const size = sourceSize(source);
    if (!size) { this.count('drawImage:unsized-source'); return; }
    if (!rect.dw || !rect.dh) { rect.dw = size.width; rect.dh = size.height; }
    const whole = !cropped && rect.sx <= 0 && rect.sy <= 0;
    if (whole) { rect.sw = size.width; rect.sh = size.height; }
    else if (!rect.sw || !rect.sh) { rect.sw = size.width - rect.sx; rect.sh = size.height - rect.sy; }
    if (!whole) this.count('drawImage:cropped');
    let name = whole ? this.pool.imageForSource(source)?.name : undefined;
    if (!name) {
      const raster = rasterize(source, rect.sx, rect.sy, rect.sw, rect.sh, (key) => this.count(key));
      if (!raster) return;
      name = this.pool.addImage(
        whole ? source : null,
        raster.rgb, raster.alpha, raster.width, raster.height,
      ).value;
    }
    // Corners of the drawn rectangle in device space (y up).
    const ax = this.dx(rect.dx, rect.dy), ay = this.dy(rect.dx, rect.dy);
    const ux = this.dx(rect.dx + rect.dw, rect.dy) - ax, uy = this.dy(rect.dx + rect.dw, rect.dy) - ay;
    const vx = this.dx(rect.dx, rect.dy + rect.dh) - ax, vy = this.dy(rect.dx, rect.dy + rect.dh) - ay;
    const ox = ax + vx, oy = ay + vy;
    this.write('q\n');
    // The image XObject fills the unit square with its bottom-left sample at the
    // origin: translate to the bottom-left corner, x along the drawn top edge,
    // and the image's up axis against the canvas' y-down vector.
    this.write(`${this.num(ux)} ${this.num(uy)} ${this.num(-vx)} ${this.num(-vy)} ${this.num(ox)} ${this.num(oy)} cm\n`);
    this.writeAlpha(1);
    this.write(`/${name} Do\nQ\n`);
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): PdfLinearGradient {
    return new PdfLinearGradient(x0, y0, x1, y1);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): PdfLinearGradient {
    this.count('createRadialGradient');
    return new PdfLinearGradient(x0 - r1 - r0, y0, x1 + r1 + r0, y1);
  }
  createConicGradient(start: number, x: number, y: number): PdfLinearGradient {
    this.count('createConicGradient');
    void start;
    return new PdfLinearGradient(x, y, x + 1, y);
  }
  createPattern(source: unknown, repetition?: string | null): PdfPattern {
    void repetition;
    return new PdfPattern(averageColor(source, (key) => this.count(key)));
  }

  /* ------------------------------------------------------------- finish */

  /** Raw (uncompressed) content stream bytes of this page. */
  contentData(): Uint8Array {
    return new TextEncoder().encode(this.out.join(''));
  }

  /** Compress this page's content stream into the writer. */
  async finish(): Promise<void> {
    const { data, compressed } = await deflate(this.contentData());
    const dict = new PdfDict();
    if (compressed) dict.set('Filter', new PdfName('FlateDecode'));
    this.pool.writer.setStream(this.contentObject, dict, data);
  }
}

type Base14Key = keyof typeof BASE14_FONTS;

/** Colour of a gradient where a single colour is needed: the middle of the ramp. */
function midColor(stops: { offset: number; rgb: number[]; alpha: number }[]): RGBA {
  if (!stops.length) return [0, 0, 0, 1];
  const at = (index: number) => stops[Math.max(0, Math.min(stops.length - 1, index))]!;
  if (stops.length === 1) {
    const only = at(0);
    return [only.rgb[0] * 255, only.rgb[1] * 255, only.rgb[2] * 255, only.alpha];
  }
  const left = at(Math.floor((stops.length - 1) / 2));
  const right = at(Math.ceil((stops.length - 1) / 2));
  return [
    ((left.rgb[0] + right.rgb[0]) / 2) * 255,
    ((left.rgb[1] + right.rgb[1]) / 2) * 255,
    ((left.rgb[2] + right.rgb[2]) / 2) * 255,
    (left.alpha + right.alpha) / 2,
  ];
}

function capOf(value: string): number { return value === 'round' ? 1 : value === 'square' ? 2 : 0; }
function joinOf(value: string): number { return value === 'round' ? 1 : value === 'bevel' ? 2 : 0; }

function escapeBytes(bytes: number[]): string {
  let body = '';
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) body += '\\' + String.fromCharCode(byte);
    else if (byte === 0x0a) body += '\\n';
    else if (byte === 0x0d) body += '\\r';
    else if (byte < 0x20 || byte > 0x7e) body += '\\' + byte.toString(8).padStart(3, '0');
    else body += String.fromCharCode(byte);
  }
  return body;
}

function normalizeStyle(value: PdfPaintStyle, ctx: PdfCanvasContext, key: string): PdfPaintStyle {
  if (value instanceof PdfLinearGradient || value instanceof PdfPattern) return value;
  const text = String(value ?? '');
  if (text && !parseColor(text)) {
    ctx.count(`${key}:invalid`);
    return text;
  }
  return text || '#000000';
}
