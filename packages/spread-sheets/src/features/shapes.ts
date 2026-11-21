/*
 * Worksheet shapes: AutoShapes, pictures ("place over cells"), camera shapes and
 * form controls, rendered through the floating-object DOM layer. Geometry ids and
 * numeric AutoShapeType values mirror the public shapes add-on API; the drawing
 * code is entirely our own (see shape-geometry.ts).
 */
import { FloatingObject } from './floating-objects.js';
import { paintFormControl, paintShape, type ShapeControl } from './shape-geometry.js';
export type { ShapeControl } from './shape-geometry.js';
import type { Worksheet } from '../worksheet.js';
import type { WorkbookRenderer } from '../rendering.js';
import type { AxisLayout } from '../structures.js';
import type { JsonRecord } from '../serialization.js';
import { sparklineRange } from './sparklines.js';
import { resolveColor } from '../colors.js';
import { GC as ApiEnums } from '../generated/enums.js';

/** Public `AutoShapeType` enum (shared with the generated API surface). */
export const AutoShapeType = ApiEnums.Spread.Sheets.Shapes.AutoShapeType;
/** Preset name of an AutoShapeType value; unknown values fall back to a rectangle. */
export const autoShapeTypeName = (type: number): string =>
  Object.keys(AutoShapeType).find(key => !/^\d+$/.test(key) && AutoShapeType[key as keyof typeof AutoShapeType] === type) ?? 'rectangle';

export interface ShapeFill { visible: boolean; color: string; transparency: number }
export interface ShapeLine { visible: boolean; color: string; width: number; dash: number }
export interface ShapeHyperlink { url: string; tooltip?: string; target?: string }

const shapeDefaults: JsonRecord = {
  shapeType: 1, rotation: 0, txBox: false, lockText: false, presetName: null,
  // Trial values (probe f40sh6-style, read through `shape.style()`): accent fill and hairline.
  fill: { visible: true, color: '#5b9bd5', transparency: 0 },
  line: { visible: true, color: '#41719c', width: 1, dash: 0 },
  text: '', textColor: '#000000', fontSize: 12, fontFamily: 'Calibri', textAlignment: 'center',
  control: null, cellRange: null, src: null, groupId: null,
};

/** Public FormControlType values -> paint object names. */
const FormControlShapeNames: Record<string, string> = {
  button: 'Button', spinButton: 'SpinButton', scrollBar: 'ScrollBar', listBox: 'ListBox', checkBox: 'CheckBox',
  optionButton: 'OptionButton', label: 'Label', groupBox: 'GroupBox', comboBox: 'ComboBox',
};

/** Shape style bag (`shape.style()`): fill and line objects shared with the shape model. */
export class ShapeStyle {
  fill: Partial<ShapeFill>;
  line: Partial<ShapeLine>;
  textEffect: JsonRecord;
  textFrame: JsonRecord;
  constructor(style?: { fill?: Partial<ShapeFill>; line?: Partial<ShapeLine>; textEffect?: JsonRecord; textFrame?: JsonRecord }) {
    // Own fields, never constructor parameter properties: the GC surface installs fallback
    // accessors for every documented property, which would shadow them at construction time.
    this.fill = style?.fill ?? {};
    this.line = style?.line ?? {};
    this.textEffect = style?.textEffect ?? {};
    this.textFrame = style?.textFrame ?? {};
  }
  toJSON(): JsonRecord { return { fill: this.fill, line: this.line, textEffect: this.textEffect, textFrame: this.textFrame }; }
}

/** Anchor side of a shape: the cell index plus the pixel offset inside that cell. */
interface AnchorSide {
  index: number;
  offset: number;
}

/** Anchor of a shape: start and end side, cell index plus the pixel offset inside that cell. */
interface ShapeAnchor {
  row: number;
  col: number;
  rowOffset: number;
  colOffset: number;
  endRow: number;
  endCol: number;
  endRowOffset: number;
  endColumnOffset: number;
}

/** Geometry paths `getFormula`/`setFormula` accept; every other path is ignored (trial behaviour). */
const SHAPE_FORMULA_PATHS = new Set(['x', 'y', 'width', 'height']);
type GeomKey = 'x' | 'y' | 'width' | 'height';
const GEOM_KEYS: GeomKey[] = ['x', 'y', 'width', 'height'];

/** Cell references inside a shape formula carry the owning sheet name, the way the trial stores them. */
function qualifyShapeFormula(formula: string, sheetName: string): string {
  return formula.replace(/\$?[A-Za-z]{1,3}\$?\d+/g, (match: string, offset: number) => {
    const before = offset > 0 ? formula.charAt(offset - 1) : '';
    if (before && /[A-Za-z0-9_!$:]/.test(before)) return match;
    return `${sheetName}!${match}`;
  });
}

/**
 * `GC.Spread.Sheets.Shapes.ShapeBase` — the public base class of every shape handle
 * (`Shape`, `CameraShape`, `ConnectorShape`, `PictureShape`, `FormControlShape` and
 * `GroupShape`). It owns the anchor model (start/end cell plus the pixel offsets),
 * the behaviour flags, the formula-backed geometry and the image snapshot, with the
 * get/set semantics the reference runtime answers:
 *
 * - moving a start anchor keeps the size and shifts the end anchor;
 * - moving an end anchor keeps the start and re-reads the size from the span;
 * - an anchor offset larger than its own cell is capped where the pixels are used
 *   but read back unchanged, and a row/column index outside the sheet clamps to the
 *   sheet extent;
 * - `getFormula` answers `undefined` for a known path without a formula and `''` for
 *   a path the trial does not bind, `setFormula`/`hyperlink` return nothing.
 */
export class ShapeBase extends FloatingObject {
  /** Anchor exactly as the accessors report it (uncapped index and offset). */
  private anchor: ShapeAnchor = { row: -1, col: -1, rowOffset: 0, colOffset: 0, endRow: -1, endCol: -1, endRowOffset: 0, endColumnOffset: 0 };
  /** Size preserved while a start anchor moves; a size set directly (also a negative one) is kept. */
  private size = { width: 0, height: 0 };
  /** Base-class flags: alternative text, print/rotation/handle flags, hyperlink. */
  protected flags: JsonRecord = {};
  private formulas = new Map<string, string>();
  private formulaCache = new Map<string, { text: string; value: number }>();
  /** Read-back values that are not plain numbers (a `'50%'` width, a cleared formula). */
  private geometryText = new Map<string, string>();
  protected bound = false;

  /** `new ShapeBase()` builds an unattached handle, exactly like the trial. */
  constructor(name?: string, left?: number, top?: number, width?: number, height?: number) {
    super(name, left, top, width, height);
    if (name === undefined) {
      for (const key of GEOM_KEYS) delete this.props[key];
      this.bound = true;
    }
  }

  // ---------------------------------------------------------------- anchors ---
  private axis(kind: 'row' | 'column'): AxisLayout | undefined {
    const sheet = this._sheet;
    if (!sheet) return undefined;
    return kind === 'row' ? sheet._rowLayout() : sheet._columnLayout();
  }
  /** Pixel position of an anchor side: cell prefix plus the offset, capped at the cell size. */
  private static side(axis: AxisLayout | undefined, index: number, offset: number): number | undefined {
    if (!axis) return undefined;
    if (index >= axis.count) return axis.prefixSum(axis.count);
    const clamped = Math.max(0, index);
    return axis.prefixSum(clamped) + Math.min(offset, axis.getSize(clamped));
  }
  /** Maps a pixel position back onto an anchor side (clamped to the sheet extent). */
  private static locate(axis: AxisLayout | undefined, px: number): AnchorSide {
    if (!axis) return { index: -1, offset: px };
    const total = axis.prefixSum(axis.count);
    const value = Math.min(px, total);
    let index = axis.indexAtOffset(Math.max(0, value));
    if (index >= axis.count) index = Math.max(0, axis.count - 1);
    return { index, offset: value - axis.prefixSum(index) };
  }
  /** Derived size: the anchor span, except for a size that was set as a negative number. */
  private span(kind: 'width' | 'height'): number | undefined {
    const rows = this.axis('row'), cols = this.axis('column');
    if (!rows || !cols) return this.props[kind] as number | undefined;
    const a = this.anchor;
    const start = kind === 'width'
      ? ShapeBase.side(cols, a.col, a.colOffset)
      : ShapeBase.side(rows, a.row, a.rowOffset);
    const end = kind === 'width'
      ? ShapeBase.side(cols, a.endCol, a.endColumnOffset)
      : ShapeBase.side(rows, a.endRow, a.endRowOffset);
    if (start === undefined || end === undefined) return this.props[kind] as number | undefined;
    const raw = kind === 'width' ? this.size.width : this.size.height;
    // A negative size was set directly; a size that does not follow the cells stays as stored.
    if (raw < 0 || this.dynamicSize() === false) return raw;
    return Math.max(0, end - start);
  }
  private position(kind: 'x' | 'y'): number | undefined {
    const rows = this.axis('row'), cols = this.axis('column');
    if (!rows || !cols) return this.props[kind] as number | undefined;
    const a = this.anchor;
    return kind === 'x'
      ? ShapeBase.side(cols, a.col, a.colOffset)
      : ShapeBase.side(rows, a.row, a.rowOffset);
  }
  /** Publishes the anchor-derived geometry through the props and the renderer anchors. */
  private publish(): void {
    for (const key of GEOM_KEYS) {
      const value = key === 'width' || key === 'height' ? this.span(key) : this.position(key);
      if (value !== undefined) this.props[key] = value;
    }
    const a = this.anchor;
    const rows = this.axis('row'), cols = this.axis('column');
    const cap = (index: number, offset: number, axis: AxisLayout | undefined): number =>
      axis && index >= 0 && index < axis.count ? Math.min(offset, axis.getSize(Math.max(0, index))) : offset;
    this._setAnchors({
      row: a.row, col: a.col,
      dx: cap(a.col, a.colOffset, cols), dy: cap(a.row, a.rowOffset, rows),
      endRow: a.endRow, endCol: a.endCol,
      endDx: cap(a.endCol, a.endColumnOffset, cols), endDy: cap(a.endRow, a.endRowOffset, rows),
    });
  }
  /** Captures the anchor from the construction box (called when the shape joins a sheet). */
  override _captureAnchors(): void {
    if (this.bound) return;
    const rows = this.axis('row'), cols = this.axis('column');
    this.bound = true;
    if (!rows || !cols) { this.publish(); return; }
    const x = Number(this.props.x ?? 0), y = Number(this.props.y ?? 0);
    const width = Number(this.props.width ?? 0), height = Number(this.props.height ?? 0);
    this.size = { width, height };
    const start = ShapeBase.locate(cols, x), end = ShapeBase.locate(cols, x + width);
    const startRow = ShapeBase.locate(rows, y), endRow = ShapeBase.locate(rows, y + height);
    this.anchor = {
      row: startRow.index, col: start.index, rowOffset: startRow.offset, colOffset: start.offset,
      endRow: endRow.index, endCol: end.index, endRowOffset: endRow.offset, endColumnOffset: end.offset,
    };
    this.publish();
  }
  /** Anchor snapshot for the internal object layout (row/col plus dx/dy pixel offsets). */
  _anchorState(): ShapeAnchor { return { ...this.anchor }; }

  /** Moves a start side and keeps the size, shifting the end anchor with it (trial rule). */
  private moveStart(kind: 'row' | 'column', index: number, offset: number): this {
    const a = { ...this.anchor };
    if (kind === 'row') { a.row = index; a.rowOffset = offset; } else { a.col = index; a.colOffset = offset; }
    this.anchor = a;
    const axis = this.axis(kind);
    if (axis) {
      const start = ShapeBase.side(axis, kind === 'row' ? a.row : a.col, kind === 'row' ? a.rowOffset : a.colOffset);
      const size = kind === 'row' ? this.size.height : this.size.width;
      if (start !== undefined) {
        const far = ShapeBase.locate(axis, start + size);
        if (kind === 'row') { a.endRow = far.index; a.endRowOffset = far.offset; }
        else { a.endCol = far.index; a.endColumnOffset = far.offset; }
      }
    }
    this.publish();
    this._sheet?._view()?.schedule();
    return this;
  }
  /** Moves an end side and re-reads the size from the new span (trial rule). */
  private moveEnd(kind: 'row' | 'column', index: number, offset: number): this {
    const a = { ...this.anchor };
    if (kind === 'row') { a.endRow = index; a.endRowOffset = offset; } else { a.endCol = index; a.endColumnOffset = offset; }
    this.anchor = a;
    const axis = this.axis(kind);
    if (axis) {
      const start = ShapeBase.side(axis, kind === 'row' ? a.row : a.col, kind === 'row' ? a.rowOffset : a.colOffset);
      const end = ShapeBase.side(axis, kind === 'row' ? a.endRow : a.endCol, kind === 'row' ? a.endRowOffset : a.endColumnOffset);
      if (start !== undefined && end !== undefined) {
        const spanValue = Math.max(0, end - start);
        if (kind === 'row') this.size.height = spanValue; else this.size.width = spanValue;
      }
    }
    this.publish();
    this._sheet?._view()?.schedule();
    return this;
  }
  /** Keeps the start anchor and re-derives the end anchor from the stored size. */
  private rederiveEnd(kind: 'row' | 'column'): void {
    const axis = this.axis(kind);
    if (!axis) return;
    const a = this.anchor;
    const start = ShapeBase.side(axis, kind === 'row' ? a.row : a.col, kind === 'row' ? a.rowOffset : a.colOffset);
    const size = kind === 'row' ? this.size.height : this.size.width;
    if (start === undefined) return;
    const far = ShapeBase.locate(axis, start + size);
    if (kind === 'row') { a.endRow = far.index; a.endRowOffset = far.offset; }
    else { a.endCol = far.index; a.endColumnOffset = far.offset; }
    this.publish();
  }
  /** Moves a start side to a pixel position (used by the `x`/`y` setters). */
  private setStartPx(kind: 'row' | 'column', px: number): void {
    const axis = this.axis(kind);
    if (!axis) {
      this.props[kind === 'row' ? 'y' : 'x'] = px;
      this.publish();
      return;
    }
    const at = ShapeBase.locate(axis, px);
    this.moveStart(kind, at.index, at.offset);
  }

  // ------------------------------------------------------- anchor accessors ---
  override startRow(value?: number): unknown {
    if (value === undefined) return this.anchor.row;
    return this.moveStart('row', Number(value), this.anchor.rowOffset);
  }
  override startColumn(value?: number): unknown {
    if (value === undefined) return this.anchor.col;
    return this.moveStart('column', Number(value), this.anchor.colOffset);
  }
  override startRowOffset(value?: number): unknown {
    if (value === undefined) return this.anchor.rowOffset;
    return this.moveStart('row', this.anchor.row, Number(value));
  }
  override startColumnOffset(value?: number): unknown {
    if (value === undefined) return this.anchor.colOffset;
    return this.moveStart('column', this.anchor.col, Number(value));
  }
  override endRow(value?: number): unknown {
    if (value === undefined) return this.anchor.endRow;
    return this.moveEnd('row', Number(value), this.anchor.endRowOffset);
  }
  override endColumn(value?: number): unknown {
    if (value === undefined) return this.anchor.endCol;
    return this.moveEnd('column', Number(value), this.anchor.endColumnOffset);
  }
  override endRowOffset(value?: number): unknown {
    if (value === undefined) return this.anchor.endRowOffset;
    return this.moveEnd('row', this.anchor.endRow, Number(value));
  }
  override endColumnOffset(value?: number): unknown {
    if (value === undefined) return this.anchor.endColumnOffset;
    return this.moveEnd('column', this.anchor.endCol, Number(value));
  }

  // ----------------------------------------------------- geometry + formula ---
  private readGeom(key: GeomKey): number | string | undefined {
    const formula = this.formulas.get(key);
    if (formula) {
      const value = this.evaluate(key, formula);
      const cached = this.formulaCache.get(key);
      if (!cached || cached.text !== formula || cached.value !== value) {
        this.formulaCache.set(key, { text: formula, value });
        if (key === 'width' || key === 'height') { this.size[key] = value; this.rederiveEnd(key === 'width' ? 'column' : 'row'); }
        else this.setStartPx(key === 'x' ? 'column' : 'row', value);
      }
    }
    const text = this.geometryText.get(key);
    if (text !== undefined) return text;
    return key === 'width' || key === 'height' ? this.span(key) : this.position(key);
  }
  private writeGeom(key: GeomKey, value: number | string): this {
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.startsWith('=')) {
        this.setFormula(key, text);
        return this;
      }
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) {
        // A percentage string is stored verbatim and reads back verbatim, like the trial;
        // the trial's own geometry maths collapses the far anchor to 0 for it.
        this.geometryText.set(key, text);
        const a = this.anchor;
        if (key === 'width') { this.size.width = 0; a.endCol = 0; a.endColumnOffset = 0; }
        else if (key === 'height') { this.size.height = 0; a.endRow = 0; a.endRowOffset = 0; }
        else if (key === 'x') { a.col = 0; a.colOffset = 0; }
        else { a.row = 0; a.rowOffset = 0; }
        this.publish();
        this._sheet?._view()?.schedule();
        return this;
      }
      this.geometryText.delete(key);
      this.applyNumber(key, numeric);
      return this;
    }
    this.geometryText.delete(key);
    this.applyNumber(key, Number(value));
    return this;
  }
  private applyNumber(key: GeomKey, numeric: number): void {
    if (key === 'width' || key === 'height') {
      this.size[key] = numeric;
      this.rederiveEnd(key === 'width' ? 'column' : 'row');
      this.publish();
    } else {
      this.setStartPx(key === 'x' ? 'column' : 'row', numeric);
    }
    this._sheet?._view()?.schedule();
  }
  /** Runs a shape formula through the workbook calc service (empty cells count as 0). */
  private evaluate(key: string, formula: string): number {
    const sheet = this._sheet;
    const engine = sheet?.calcEngine as { evaluateFormulaValue?: (context: Worksheet, text: string, row: number, col: number) => unknown } | undefined;
    if (!sheet || !engine?.evaluateFormulaValue) return this.formulaCache.get(key)?.value ?? 0;
    try {
      const value = engine.evaluateFormulaValue(sheet, formula, 0, 0);
      const numeric = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    } catch {
      return 0;
    }
  }

  /** Formula-backed geometry: `getFormula('x')` reads back the stored, sheet-qualified text. */
  getFormula(path: string): string | undefined {
    const key = String(path);
    if (!SHAPE_FORMULA_PATHS.has(key)) return '';
    return this.formulas.get(key);
  }
  /** Stores a geometry formula; the trial answers nothing (`void`) and ignores unknown paths. */
  setFormula(path: string, formula: string): void {
    const key = String(path);
    if (!SHAPE_FORMULA_PATHS.has(key)) return;
    if (formula === undefined || formula === null || formula === '') {
      this.formulas.delete(key);
      this.formulaCache.delete(key);
      this.geometryText.set(key, '');
      return;
    }
    const text = String(formula);
    if (!text.startsWith('=')) {
      // A plain number sets the value without becoming a formula (trial: `getFormula` stays unset).
      this.formulas.delete(key);
      this.formulaCache.delete(key);
      this.geometryText.delete(key);
      this.applyNumber(key as GeomKey, Number(text));
      return;
    }
    const sheetName = this._sheet?.name();
    this.formulas.set(key, sheetName ? qualifyShapeFormula(text, String(sheetName)) : text);
    this.geometryText.delete(key);
    const value = this.evaluate(key, this.formulas.get(key) as string);
    this.formulaCache.set(key, { text: this.formulas.get(key) as string, value });
    if (key === 'width' || key === 'height') { this.size[key] = value; this.rederiveEnd(key === 'width' ? 'column' : 'row'); }
    else this.setStartPx(key === 'x' ? 'column' : 'row', value);
    this._sheet?._view()?.schedule();
  }
  /** Reads the geometry through the anchor model (a formula-backed value refreshes first). */
  override x(value?: number | string): unknown {
    if (value === undefined) return this.readGeom('x');
    return this.writeGeom('x', value);
  }
  override y(value?: number | string): unknown {
    if (value === undefined) return this.readGeom('y');
    return this.writeGeom('y', value);
  }
  override width(value?: number | string): unknown {
    if (value === undefined) return this.readGeom('width');
    return this.writeGeom('width', value);
  }
  override height(value?: number | string): unknown {
    if (value === undefined) return this.readGeom('height');
    return this.writeGeom('height', value);
  }

  // -------------------------------------------------------------- behaviour ---
  /** Shape names: the trial rejects an empty name with its own message. */
  override name(value?: string): unknown {
    if (value !== undefined && !value) throw new Error('Empty name.');
    return super.name(value);
  }
  /** Alternative text; unset answers the empty string, `alt(null)` reads back `null`. */
  override alt(value?: string): unknown {
    if (value === undefined) return this.flags.alt === undefined ? '' : this.flags.alt;
    this.flags.alt = value as JsonRecord[string];
    this._sheet?._view()?.schedule();
    return this;
  }
  /** Print flag (default `true`). */
  canPrint(value?: boolean): boolean | this {
    if (value === undefined) return this.flags.canPrint !== false;
    this.flags.canPrint = !!value;
    return this;
  }
  /** Rotation handle flag (default `true`). */
  allowRotate(value?: boolean): boolean | this {
    if (value === undefined) return this.flags.allowRotate !== false;
    this.flags.allowRotate = !!value;
    return this;
  }
  /** Editing handle flag (default `true`). */
  showHandle(value?: boolean): boolean | this {
    if (value === undefined) return this.flags.showHandle !== false;
    this.flags.showHandle = !!value;
    return this;
  }
  /** Hyperlink of the shape; the setter answers nothing, the getter `null` when unset. */
  hyperlink(value?: ShapeHyperlink | null): unknown {
    if (value === undefined) return this.flags.hyperlink ?? null;
    this.flags.hyperlink = value === undefined ? null : (value as JsonRecord[string]);
    this._sheet?._view()?.schedule();
  }
  /** Serialisable copy of the base-class flags (used by the shape JSON and by groups). */
  protected baseJSON(): JsonRecord {
    const out: JsonRecord = {};
    for (const key of ['alt', 'canPrint', 'allowRotate', 'showHandle', 'hyperlink'])
      if (this.flags[key] !== undefined) out[key] = this.flags[key];
    if (this.formulas.size) out.formulas = Object.fromEntries(this.formulas);
    if (this.geometryText.size) out.geometryText = Object.fromEntries(this.geometryText);
    const anchor = this.anchor;
    out.anchor = { ...anchor };
    out.size = { ...this.size };
    return out;
  }
  protected applyBaseJSON(json: JsonRecord): void {
    for (const key of ['alt', 'canPrint', 'allowRotate', 'showHandle', 'hyperlink'])
      if (json[key] !== undefined) this.flags[key] = json[key];
    const formulas = json.formulas as Record<string, string> | undefined;
    if (formulas) for (const [key, value] of Object.entries(formulas)) if (SHAPE_FORMULA_PATHS.has(key)) this.formulas.set(key, String(value));
    const geometryText = json.geometryText as Record<string, string> | undefined;
    if (geometryText) for (const [key, value] of Object.entries(geometryText)) this.geometryText.set(key, String(value));
    const anchor = json.anchor as typeof this.anchor | undefined;
    if (anchor) this.anchor = { ...anchor };
    const size = json.size as { width: number; height: number } | undefined;
    if (size) this.size = { width: Number(size.width ?? 0), height: Number(size.height ?? 0) };
    this.bound = !!anchor;
    this.publish();
  }

  // ------------------------------------------------------------- snapshot ----
  /** PNG of the shape as it is painted, the trial's `toImageSrc()` data URL. */
  toImageSrc(): string {
    const width = Number((this as ShapeBase).width()), height = Number((this as ShapeBase).height());
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context) return '';
    this.paintTo(context, canvas.width, canvas.height);
    try { return canvas.toDataURL('image/png'); } catch { return ''; }
  }
  toImageSrcAsync(): Promise<string> { return Promise.resolve(this.toImageSrc()); }
  /** Paints the handle into a caller-owned context; shapes override it, groups compose members. */
  protected paintTo(_context: CanvasRenderingContext2D, _width: number, _height: number): void {}
  /** Public door to the painting code (used by `GroupShape` snapshots and its own canvas render). */
  paintShapeTo(context: CanvasRenderingContext2D, width: number, height: number): void { this.paintTo(context, width, height); }
}

/**
 * Rotation knob over the selection frame (shared by the shape handles and the group — the trial
 * shows one on a selected group too). Drag reports the angle in degrees, Shift snaps to 15°.
 */
function attachRotationHandle(
  host: HTMLElement,
  getAngle: () => number,
  setAngle: (value: number) => void,
  selected: boolean,
  allowed: boolean,
): void {
  if (!selected || !allowed) { host.querySelector('.opensheets-shape-rotate')?.remove(); return; }
  if (host.querySelector('.opensheets-shape-rotate')) return;
  const knob = document.createElement('div');
  knob.className = 'opensheets-shape-rotate';
  host.append(knob);
  knob.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    event.preventDefault();
    const box = host.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
    const origin = getAngle();
    const move = (e: PointerEvent): void => {
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      let next = origin + angle - startAngle;
      if (e.shiftKey) next = Math.round(next / 15) * 15;
      setAngle((next + 360) % 360);
    };
    const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

/**
 * Internal shared base of the AutoShape-family handles (`Shape`, `CameraShape`, `PictureShape`,
 * `ConnectorShape` and `FormControlShape`): the shape model bag (fill/line/text/style keys), the
 * canvas artwork, the preset/form-control painting and the flat shape JSON. It carries every
 * accessor the trial answers on all of these shapes EXCEPT the text accessors — the official
 * d.ts declares `text()` only on `Shape` (probed 2026-11-20: trial `PictureShape`, `CameraShape`
 * and `ConnectorShape` instances answer no `text` member at all), so `text()`/`textColor()` live
 * on `Shape` and `FormControlShape` only.
 */
export class ModelShape extends ShapeBase {
  override typeName = '0';
  protected _shape: JsonRecord;
  private canvas?: HTMLCanvasElement;

  /**
   * `new Shape(worksheet, name, autoShapeTypeOrModel, left, top, width, height)` — the public
   * shapes API. The name-first form `new Shape(name, shapeType, left, top, width, height)` is
   * also accepted (it is what our worksheet JSON deserialisation and older call sites use).
   */
  constructor(...args: unknown[]) {
    const official = typeof args[0] !== 'string' && args[0] !== undefined;
    const sheet = official ? (args[0] as Worksheet) : undefined;
    const name = String(official ? args[1] : args[0] ?? 'rectangle');
    const model = (official ? args[2] : args[1]) as number | JsonRecord | undefined;
    const box = official ? args.slice(3, 7) : args.slice(2, 6);
    super(name, Number(box[0] ?? 0), Number(box[1] ?? 0), Number(box[2] ?? 100), Number(box[3] ?? 100));
    this._sheet = sheet;
    this._shape = { ...shapeDefaults, fill: { ...shapeDefaults.fill as object }, line: { ...shapeDefaults.line as object } };
    if (typeof model === 'object' && model) this.applyModel(model);
    else {
      this._shape.shapeType = Number(model ?? AutoShapeType.rectangle);
      // Trial values (probe f40sh6-style): a straight line preset carries no fill and the hairline.
      if (this._shape.shapeType === AutoShapeType.line) { this._shape.fill = { visible: false }; this._shape.line = { visible: true, color: '#41719c', width: 1, dash: 0 }; }
    }
  }

  /** Keys that only specific shape kinds use (connectors, picture format, ...). */
  protected extra: JsonRecord = {};

  /** Applies an `IShapeModel`-style object (the shape part of the worksheet JSON). */
  private applyModel(json: JsonRecord): void {
    for (const key of Object.keys(shapeDefaults)) if (json[key] !== undefined) this._shape[key] = json[key] as JsonRecord[string];
    if (json.x !== undefined) super.x(Number(json.x));
    if (json.y !== undefined) super.y(Number(json.y));
    if (json.width !== undefined) super.width(Number(json.width));
    if (json.height !== undefined) super.height(Number(json.height));
    if (json.arrowHeads) this._shape.arrowHeads = json.arrowHeads;
    if (json.adjustments) this._shape.adjustments = json.adjustments;
    this.applyBaseJSON(json);
  }

  protected prop(key: string, value?: unknown): unknown {
    if (value === undefined) return this._shape[key];
    this._shape[key] = value as JsonRecord[string];
    this._sheet?._view()?.schedule();
    return this;
  }

  shapeType(value?: number): number | this {
    if (value === undefined) return Number(this._shape.shapeType);
    return this.prop('shapeType', value) as this;
  }
  /** Public accessor for the AutoShapeType (alias of `shapeType`). */
  type(value?: number): number | this { return this.shapeType(value); }
  /** Rotation in degrees; the trial answers the number on read and nothing on set. */
  rotate(value?: number | string): number | void {
    if (value === undefined) return Number(this._shape.rotation);
    const numeric = typeof value === 'string' ? Number(value.replace(/^=/, '')) : Number(value);
    this.rotation(numeric);
  }
  /** Preset adjustment values (corner radius, arrow depth, ...). */
  adjustments(arrayValue?: number[]): number[] | this {
    if (arrayValue === undefined) return (this._shape.adjustments as number[] | undefined) ?? [];
    return this.prop('adjustments', arrayValue.map(Number)) as this;
  }
  /** Fill/line/text style bag shared with the shape model. */
  style(value?: ShapeStyle | JsonRecord): ShapeStyle | this {
    if (value === undefined) return new ShapeStyle({ fill: this._shape.fill as ShapeFill, line: this._shape.line as ShapeLine });
    const source = value instanceof ShapeStyle ? (value.toJSON() as JsonRecord) : (value as JsonRecord);
    if (source.fill) this.fill(source.fill as Partial<ShapeFill>);
    if (source.line) this.line(source.line as Partial<ShapeLine>);
    if (source.textEffect) this.prop('textEffect', source.textEffect);
    if (source.textFrame) this.prop('textFrame', source.textFrame);
    return this;
  }
  /** Preset name for geometry/lookup. */
  preset(): string { return String(this._shape.presetName ?? autoShapeTypeName(Number(this._shape.shapeType))); }
  presetName(value?: string | null): string | null | this {
    if (value === undefined) return (this._shape.presetName as string | null) ?? null;
    return this.prop('presetName', value) as this;
  }
  groupId(value?: string | null): string | null | this {
    if (value === undefined) return (this._shape.groupId as string | null) ?? null;
    return this.prop('groupId', value) as this;
  }
  /** Connector arrow ends: {start, end}. */
  arrowHeads(): { start: boolean; end: boolean } { return this._shape.arrowHeads as { start: boolean; end: boolean } ?? { start: false, end: false }; }
  setArrowHeads(start: boolean, end: boolean): this { return this.prop('arrowHeads', { start, end }) as this; }
  fill(value?: Partial<ShapeFill>): ShapeFill | this {
    if (value === undefined) return this._shape.fill as ShapeFill;
    return this.prop('fill', { ...(this._shape.fill as ShapeFill), ...value }) as this;
  }
  line(value?: Partial<ShapeLine>): ShapeLine | this {
    if (value === undefined) return this._shape.line as ShapeLine;
    return this.prop('line', { ...(this._shape.line as ShapeLine), ...value }) as this;
  }
  rotation(value?: number): number | this {
    if (value === undefined) return Number(this._shape.rotation);
    return this.prop('rotation', ((Number(value) % 360) + 360) % 360) as this;
  }
  txBox(value?: boolean): boolean | this {
    if (value === undefined) return !!this._shape.txBox;
    return this.prop('txBox', !!value) as this;
  }
  lockText(value?: boolean): boolean | this {
    if (value === undefined) return !!this._shape.lockText;
    return this.prop('lockText', !!value) as this;
  }
  control(value?: ShapeControl | null): ShapeControl | null | this {
    if (value === undefined) return this._shape.control as ShapeControl | null;
    return this.prop('control', value) as this;
  }
  /** Camera shapes capture this reference live (e.g. `Sheet1!$A$1:$C$3`). */
  cellRange(value?: string): string | null | this {
    if (value === undefined) return this._shape.cellRange as string | null;
    return this.prop('cellRange', value) as this;
  }
  src(value?: string): string | null | this {
    if (value === undefined) return this._shape.src as string | null;
    return this.prop('src', value) as this;
  }
  isCamera(): boolean { return !!this._shape.cellRange; }
  isPicture(): boolean { return !!this._shape.src; }
  isFormControl(): boolean { return !!this._shape.control; }

  override _render(view: WorkbookRenderer, layer: HTMLElement, zIndex: number): void {
    super._render(view, layer, zIndex);
    const host = this.getHost()[0];
    if (!host) return;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'opensheets-shape-canvas';
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      host.querySelector('.opensheets-floating-content')?.append(this.canvas);
    }
    this._paint(view);
    this._addRotationHandle(view, host);
  }

  /**
   * Trial rule (probe t81-movechain2, 2026-11-21): moving one grouped member through `x()`/`y()`
   * moves ONLY that member — siblings and the owning group's frame stay where they are (group-wide
   * moves go through the `GroupShape` handle, which shifts its members itself).
   */
  override x(value?: number | string): unknown {
    if (value === undefined) return super.x();
    super.x(value);
    this._sheet?._view()?.schedule(); // grouped members paint through the group composite canvas
    return this;
  }
  override y(value?: number | string): unknown {
    if (value === undefined) return super.y();
    super.y(value);
    this._sheet?._view()?.schedule();
    return this;
  }
  /** Moves the shape directly (used for group-wide shifts and paste offsets). */
  shift(dx: number, dy: number): void {
    if (!dx && !dy) return;
    super.x(Math.max(0, Number(super.x()) + dx));
    super.y(Math.max(0, Number(super.y()) + dy));
    this._sheet?._view()?.schedule();
  }

  private _paint(view: WorkbookRenderer): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    const w = Math.max(2, Math.round(Number(this.width()) * view.zoom));
    const h = Math.max(2, Math.round(Number(this.height()) * view.zoom));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.paintTo(ctx, w, h);
  }

  /** Draws the shape artwork (preset, text, control, camera snapshot) into any context. */
  /** Draws the shape artwork (preset, text, control, camera snapshot) into any context. */
  protected override paintTo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.control()) { paintFormControl(ctx, this.control() as ShapeControl, String(this._shape.text ?? ''), 0, 0, w, h); return; }
    if (this.isPicture() || this.isCamera()) { this._paintCameraChrome(this._sheet?._view(), ctx, w, h); return; }
    paintShape(ctx, {
      prst: this.preset(), x: 0, y: 0, w, h,
      fill: this.fill() as ShapeFill, line: this.line() as ShapeLine, rotation: 0,
      arrow: this.arrowHeads(),
    });
    this._paintText(ctx, w, h);
  }
  /** Paints the camera source snapshot (or the picture bitmap) inside the shape box. */
  private _paintCameraChrome(view: WorkbookRenderer | undefined, ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const src = this.src() as string | null;
    if (src) {
      const image = ModelShape.imageCache.get(src);
      if (!image) {
        const loaded = new Image();
        loaded.src = src;
        loaded.onload = (): void => { this._sheet?._view()?.schedule(); };
        ModelShape.imageCache.set(src, loaded);
      }
      if (image?.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, w, h);
      return;
    }
    const camera = this._cameraRange(view);
    if (!camera || !view) return;
    const source = view.canvas;
    if (!source || !source.width || !source.clientWidth) return;
    const sdpr = source.width / source.clientWidth;
    const { x0, y0, x1, y1 } = camera;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const sx = Math.max(0, x0), sy = Math.max(0, y0);
    const ex = Math.min(x1, view.viewWidth + view.headerWidth), ey = Math.min(y1, view.viewHeight + view.headerHeight);
    if (ex > sx && ey > sy) {
      ctx.drawImage(source, sx * sdpr, sy * sdpr, (ex - sx) * sdpr, (ey - sy) * sdpr, sx - x0, sy - y0, ex - sx, ey - sy);
    }
    // The camera keeps a thin frame around the live snapshot (trial: 0.75 px black).
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(0.375, 0.375, w - 0.75, h - 0.75);
  }
  /** Screen rectangle of the camera source range inside the sheet canvas. */
  _cameraRange(view?: WorkbookRenderer): { sheet: Worksheet; x0: number; y0: number; x1: number; y1: number } | null {
    const reference = this.cellRange() as string | null;
    const sheetView = view ?? this._sheet?._view();
    if (!reference || !sheetView) return null;
    let parsed: { range: { row: number; col: number; rowCount: number; colCount: number }; sheetName: string | null };
    try { parsed = sparklineRange(reference.replace(/^=/, '')); } catch { return null; }
    const sheet = parsed.sheetName ? this._sheet?.getParent()?.getSheetFromName(parsed.sheetName) : this._sheet;
    if (!sheet) return null;
    const rows = sheet._rowLayout(), cols = sheet._columnLayout();
    const area = parsed.range;
    const base = sheet === sheetView.sheet ? { scrollX: sheetView.scrollX, scrollY: sheetView.scrollY, zoom: sheetView.zoom } : { scrollX: 0, scrollY: 0, zoom: 1 };
    const ox = sheet === sheetView.sheet ? sheetView.headerWidth : 0, oy = sheet === sheetView.sheet ? sheetView.headerHeight : 0;
    return {
      sheet,
      x0: ox + (cols.prefixSum(area.col) - base.scrollX) * base.zoom,
      y0: oy + (rows.prefixSum(area.row) - base.scrollY) * base.zoom,
      x1: ox + (cols.prefixSum(area.col + area.colCount) - base.scrollX) * base.zoom,
      y1: oy + (rows.prefixSum(area.row + area.rowCount) - base.scrollY) * base.zoom,
    };
  }
  static imageCache = new Map<string, HTMLImageElement>();

  /** Text label drawn inside the shape from the model bag (the text ACCESSORS live on `Shape`). */
  private _paintText(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const text = String(this._shape.text ?? '');
    if (!text || this.isCamera() || this.isPicture()) return;
    const size = Number(this._shape.fontSize) || 12;
    ctx.fillStyle = resolveColor(String(this._shape.textColor ?? '#000000'));
    ctx.font = `${size}px ${String(this._shape.fontFamily ?? 'Calibri')}, sans-serif`;
    ctx.textBaseline = 'middle';
    const align = String(this._shape.textAlignment ?? 'center');
    ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    const x = align === 'left' ? 4 : align === 'right' ? w - 4 : w / 2;
    const lines = text.split('\n');
    const lineH = size * 1.25;
    const top = h / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineH));
  }

  private _addRotationHandle(view: WorkbookRenderer, host: HTMLElement): void {
    attachRotationHandle(host, () => Number(this.rotation()), (value) => { this.rotation(value); }, !!this.isSelected(), !!this.allowRotate());
    void view;
  }

  override toJSON(): JsonRecord {
    const result = super.toJSON();
    delete result.content;
    for (const key of Object.keys(shapeDefaults)) if (JSON.stringify(this._shape[key]) !== JSON.stringify(shapeDefaults[key])) result[key] = this._shape[key];
    delete result.groupId; // membership is serialized by the owning `GroupShape` entry (children)
    if (this._shape.arrowHeads) result.arrowHeads = this._shape.arrowHeads;
    Object.assign(result, this.baseJSON());
    return result;
  }
  fromShapeJSON(json: JsonRecord): void {
    for (const key of Object.keys(shapeDefaults)) if (json[key] !== undefined) this._shape[key] = json[key];
    this.applyBaseJSON(json);
  }
}

/**
 * Shape handle: `ModelShape` plus the text accessors. The official d.ts declares `text()` only
 * on `Shape` (live trial probe 2026-11-20: `PictureShape`, `CameraShape` and `ConnectorShape`
 * instances answer no `text` member at all), so text-bearing behavior lives here and
 * `FormControlShape` inherits it through `Shape`.
 */
export class Shape extends ModelShape {
  /** Gets or sets the shape text. */
  text(value?: string): string | this {
    if (value === undefined) return String(this._shape.text ?? '');
    return this.prop('text', String(value)) as this;
  }
  /** Gets or sets the shape text color. */
  textColor(value?: string): string | this {
    if (value === undefined) return String(this._shape.textColor ?? '#000000');
    return this.prop('textColor', value) as this;
  }
  /** Text-box flag (public name of `txBox`). */
  isTextBox(value?: boolean): boolean | this { return this.txBox(value) as boolean | this; }
}

/** Camera shape: a live mirror of a cell range (`range()` is the public accessor). */
export class CameraShape extends ModelShape {
  range(value?: string): string | null | this { return this.cellRange(value); }
  doubleClickCommand(value?: string | ((...args: unknown[]) => unknown)): string | ((...args: unknown[]) => unknown) | this {
    if (value === undefined) return (this._shape2().doubleClickCommand as string | ((...args: unknown[]) => unknown)) ?? '';
    this._shape2().doubleClickCommand = value;
    return this;
  }
  override rotate(value?: number | string): number | void { return super.rotate(value); }
  style(value?: ShapeStyle | JsonRecord): ShapeStyle | this { return super.style(value) as ShapeStyle | this; }
  /** Extra keys that are not part of the shared shape defaults live beside them. */
  private _shape2(): JsonRecord { return this.extra; }
}

/** Picture shape ("place over cells") with the trial's picture-format accessors. */
export class PictureShape extends ModelShape {
  pictureFormat(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) return (this.extra.pictureFormat as JsonRecord) ?? {};
    this.extra.pictureFormat = value;
    return this;
  }
  geometryType(value?: string): string | this {
    if (value === undefined) return String(this.extra.geometryType ?? 'rect');
    this.extra.geometryType = String(value);
    return this;
  }
  override src(value?: string): string | null | this { return super.src(value) as string | null | this; }
  override rotate(value?: number | string): number | void { return super.rotate(value); }
  style(value?: ShapeStyle | JsonRecord): ShapeStyle | this { return super.style(value) as ShapeStyle | this; }
  /** Natural size of the loaded bitmap (0 while it is still loading). */
  getOriginalWidth(): number { return ModelShape.imageCache.get(String(this.src() ?? ''))?.naturalWidth ?? 0; }
  getOriginalHeight(): number { return ModelShape.imageCache.get(String(this.src() ?? ''))?.naturalHeight ?? 0; }
}

/** Form-control shape (`Check Box`, `Combo Box`, ...). */
export class FormControlShape extends Shape {
  enabled(value?: boolean): boolean | this {
    const control = this.control() as ShapeControl | null;
    if (value === undefined) return !(control?.disabled ?? false);
    if (control) this.control({ ...control, disabled: !value });
    return this;
  }
  formControlType(): string { return String((this.control() as ShapeControl | null)?.objectType ?? ''); }
  options(value?: JsonRecord): JsonRecord | this {
    const control = this.control() as ShapeControl | null;
    if (value === undefined) return (control?.options as JsonRecord) ?? {};
    this.control({ ...(control ?? { objectType: 'Button' }), options: value });
    return this;
  }
  value(value?: unknown): unknown {
    const control = this.control() as ShapeControl | null;
    if (value === undefined) return control?.value;
    this.control({ ...(control ?? { objectType: 'Button' }), value });
    return this;
  }
}

/** Connector between two points or two shapes. */
export class ConnectorShape extends ModelShape {
  override preset(): string {
    const kind = Number(this.extra.connectorType ?? 0);
    return kind === 1 ? 'Elbow' : kind === 2 ? 'Curved' : 'line';
  }
  type(): number { return Number(this.extra.connectorType ?? 0); }
  adjustments(arrayValue?: number[]): number[] | this { return super.adjustments(arrayValue) as number[] | this; }
  override getFormula(path: string): string | undefined { return super.getFormula(path); }
  override setFormula(path: string, formula: string): void { super.setFormula(path, formula); }
  style(value?: ShapeStyle | JsonRecord): ShapeStyle | this { return super.style(value) as ShapeStyle | this; }
  /** Sets the connector geometry (straight / elbow / curve). */
  setConnectorType(value: number): this { this.extra.connectorType = Number(value) || 0; return this; }
  startConnector(value?: JsonRecord): JsonRecord {
    if (value === undefined) return (this.extra.startConnector as JsonRecord) ?? {};
    this.extra.startConnector = value;
    return value;
  }
  endConnector(value?: JsonRecord): JsonRecord {
    if (value === undefined) return (this.extra.endConnector as JsonRecord) ?? {};
    this.extra.endConnector = value;
    return value;
  }
}


/** A top-level entry of the shape collection: a shape handle or a group handle (TASK 81). */
type TopShape = ModelShape | GroupShape;

/**
 * Handle over a grouped set of shapes (TASK 81: the trial's nested `grpSp` model).
 * A group is a first-class entry of the collection: `shapes.all()` answers the group handle
 * instead of its members (probe 2026-11-20: grouping two rects leaves exactly ONE entry
 * `GroupShape 1` in `all()`), members can themselves be groups (`group([inner, c])` nests),
 * the group's geometry reads the bounding box of its members, and moving or resizing the
 * group moves or stretches every member. Measured rules (live trial, 2026-11-20 probes):
 * - `group(...)` ALWAYS creates a handle — an empty selection groups nothing and yields an
 *   empty group at index 0 answering x/y/width/height `-1` and `rotate()` `0`; a single shape
 *   groups alone;
 * - a non-empty group takes the slot of its highest member minus the members left of it;
 * - `ungroup(group)` releases the members back to the group's slot, in member order, and an
 *   inner group stays a group when its outer group is ungrouped;
 * - `group.add(shape)` moves a top-level shape into the group (it leaves `shapes.all()`);
 * - `group.remove(shape)` detaches AND drops the shape: neither `all()` nor `get(name)`
 *   answers it afterwards;
 * - `shapes.get(name)` still finds nested members.
 * The trial exposes it as a `ShapeBase`, so the group carries its own flags (`alt`, `canPrint`,
 * ...) that do NOT touch the members, and it answers no text/type/fill/style accessors.
 */
export class GroupShape extends ShapeBase {
  private members: TopShape[] = [];
  private collection: ShapeCollection | undefined;
  private canvas?: HTMLCanvasElement;

  /** `new GroupShape(worksheet, name?)`: an empty group with the trial's `GroupShape N` auto name. */
  constructor(sheet?: Worksheet, name?: string) {
    super(name ?? (sheet ? sheet.shapes.nextGroupName() : 'GroupShape 1'));
    this._sheet = sheet;
    this.bound = true;
    // Trial probe 2026-11-21 (C2/C9): a handle built with the constructor counts as a live
    // group for the auto-name counter even while it is not attached to the collection.
    if (sheet) sheet.shapes._registerGroup(this);
  }

  /** Disposing a group handle frees its auto name (ungroup/remove/clear paths). */
  override _dispose(): void {
    super._dispose();
    if (this._sheet) this._sheet.shapes._unregisterGroup(this);
  }

  /** Membership key the members carry: the group's own name (our model; the trial keeps it internal). */
  groupId(value?: string | null): string | null | this {
    if (value === undefined) return this.name() as string;
    if (typeof value === 'string' && value && value !== this.name()) this.name(value);
    return this;
  }

  /** Renaming a group re-keys the collection index and the ModelShape members' membership key. */
  override name(value?: string): unknown {
    if (value === undefined) return super.name();
    const next = String(value);
    const old = String(super.name());
    if (next && next !== old) {
      super.name(next);
      this.collection?._renameGroup(old, next, this);
      for (const member of this.members) if (!(member instanceof GroupShape)) member.groupId(next);
      this._sheet?._view()?.schedule();
    }
    return this;
  }

  /** Internal: the collection that owns this handle (membership changes go through it). */
  _own(collection: ShapeCollection): void { this.collection = collection; }

  /** The members (public typing mirrors the trial d.ts `all(): Shape[]`, which answers group handles too). */
  all(): Shape[] { return [...this.members] as Shape[]; }
  /** Internal union view of the members (nested groups included). */
  _memberList(): TopShape[] { return this.members; }

  /** Add a shape (or nested group) to this group; a top-level member leaves the collection's top level. */
  add(shape: ModelShape | GroupShape): void {
    const member = shape;
    if (this.members.includes(member)) return;
    this.collection?._adoptInto(this, member);
    this._attachMember(member);
    this._includeMember(member); // trial: the group frame extends to cover the added member
    this._changed();
  }

  /**
   * Remove a shape from the group. Trial rule (probed 2026-11-20): the detached shape is ALSO
   * dropped from the sheet — `shapes.all()` and `shapes.get(name)` stop answering it.
   */
  remove(shape: ModelShape | GroupShape): void {
    const member = shape;
    if (this.collection) this.collection.remove(String(member.name())); // the collection detaches + disposes (trial drop rule)
    else this._detachMember(member);
    this._changed();
  }

  /** Internal membership bookkeeping, shared with the collection's group/ungroup/restore paths. */
  _attachMember(member: TopShape): void {
    if (this.members.includes(member)) return;
    this.members.push(member);
    // A nested group keeps its own identity; only flat members carry the membership key.
    if (!(member instanceof GroupShape)) member.groupId(String(this.name()));
    member._dispose(); // grouped members have no host of their own; the group paints the composite
  }
  _detachMember(member: TopShape): void {
    const index = this.members.indexOf(member);
    if (index >= 0) this.members.splice(index, 1);
    this._entries.delete(member);
    if (!(member instanceof GroupShape) && String(member.groupId() ?? '') === String(this.name())) member.groupId(null);
  }

  /** Find a member by name; nested members are found too (trial: `get()` answers a grouped member). */
  find(name: string): Shape | undefined {
    const key = String(name);
    for (const item of this.members) {
      if (String(item.name()) === key) return item as Shape;
      if (item instanceof GroupShape) {
        const found = item.find(key);
        if (found) return found;
      }
    }
    return undefined;
  }

  /** Internal: keeps the collection's membership index and the repaint in step with a change. */
  _changed(): void {
    this.collection?._groupChanged(String(this.name()), this.members.map(item => String(item.name())));
    this._sheet?._view()?.schedule();
  }

  /** Member stacking slot inside the group; the setter answers nothing, like the trial. */
  zIndex(shapeName: string, zIndex?: number): number | void {
    const index = this.members.findIndex(item => String(item.name()) === String(shapeName));
    if (index < 0) return -1;
    if (zIndex === undefined) return index;
    const target = Math.max(0, Math.min(this.members.length - 1, Number(zIndex)));
    const [item] = this.members.splice(index, 1);
    this.members.splice(target, 0, item);
    this._changed();
  }
  /** Group rotation applies to every member; the getter answers the first member (trial rule). */
  rotate(value?: number | string): number | void {
    if (value === undefined) return Number(this.members[0]?.rotation() ?? 0);
    const numeric = typeof value === 'string' ? Number(value.replace(/^=/, '')) : Number(value);
    for (const item of this.members) item.rotation(numeric);
    this._sheet?._view()?.schedule();
  }
  /** `rotation()` alias for the shared rotate/align machinery (rotate in degrees). */
  rotation(value?: number): number | this {
    if (value === undefined) return Number(this.members[0]?.rotation() ?? 0);
    for (const item of this.members) item.rotation(value);
    return this;
  }
  getFormula(path: string): string | undefined { return this.members[0]?.getFormula(path); }
  setFormula(path: string, formula: string): void { for (const item of this.members) item.setFormula(path, formula); }
  /** Shape-kind probes the drawing pipeline asks of every `all()` entry; a group is none of them. */
  isCamera(): boolean { return false; }
  isPicture(): boolean { return false; }
  isFormControl(): boolean { return false; }

  /** Bounding box of the members, in sheet pixels (`undefined` for an empty group). */
  bounds(): { x: number; y: number; width: number; height: number } | undefined {
    if (!this.members.length) return undefined;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const item of this.members) {
      const left = Number(item.x()) || 0, top = Number(item.y()) || 0;
      x0 = Math.min(x0, left); y0 = Math.min(y0, top);
      x1 = Math.max(x1, left + (Number(item.width()) || 0)); y1 = Math.max(y1, top + (Number(item.height()) || 0));
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  /** Extreme member anchor (the group reports the box the members span). */
  private extreme(pick: 'start' | 'end'): TopShape | undefined {
    if (!this.members.length) return undefined;
    const value = (item: TopShape): number => Number(pick === 'start' ? item.startRow() : item.endRow());
    return this.members.reduce((best, item) => (value(item) < value(best) ? item : pick === 'start' ? best : item));
  }
  private side(pick: 'start' | 'end', name: 'Row' | 'Column' | 'RowOffset' | 'ColumnOffset'): number | undefined {
    const member = this.extreme(pick);
    if (!member) return undefined;
    const start = pick === 'start';
    const value = name === 'Row' ? (start ? member.startRow() : member.endRow())
      : name === 'Column' ? (start ? member.startColumn() : member.endColumn())
      : name === 'RowOffset' ? (start ? member.startRowOffset() : member.endRowOffset())
      : (start ? member.startColumnOffset() : member.endColumnOffset());
    return Number(value);
  }

  /**
   * The trial group frame (`shapeData.grpSp.grpSpPr.xfrm`, probe 2026-11-21): the group owns a
   * STATIC box — the member bounding box at grouping time, extended by `GroupShape.add` — which
   * does NOT re-union when members are moved individually. `x()/y()` move the whole group (the
   * frame plus every member shift together); `width()/height()` resize scales the frame and
   * re-derives every member from the grouping-time layout snapshot (`off + dx * ext/chExt`):
   * member moves since grouping are overwritten by a resize, exactly like the trial does
   * (probe `t81-movechain2.json`: a member moved to x=60 lands back at x=25 after
   * `outer.width(300)`, and unequal members scale by the same factor 300/230, nested groups
   * included). An empty group keeps the trial's `-1` box (probe 2026-11-20).
   */
  private _box = { x: -1, y: -1, width: -1, height: -1 };
  /** Layout snapshot (`chOff`/`chExt`): member boxes relative to the grouping-time span origin. */
  private _entries = new Map<TopShape, { dx: number; dy: number; w: number; h: number }>();
  private _layoutW = 0;
  private _layoutH = 0;

  /** Member's own frame (a group member answers its group box). */
  private static memberBox(item: TopShape): { x: number; y: number; w: number; h: number } {
    return { x: Number(item.x()), y: Number(item.y()), w: Number(item.width()), h: Number(item.height()) };
  }

  /** Rebuild the frame + layout snapshot from the members' current geometry (`group()` creation). */
  _snapshotFromMembers(loaded?: { x: number; y: number; width: number; height: number }): void {
    if (!this.members.length) {
      this._entries.clear();
      this._layoutW = 0; this._layoutH = 0;
      if (loaded) {
        this._box = { ...loaded };
        this._layoutW = Math.max(0, loaded.width); this._layoutH = Math.max(0, loaded.height);
      } else this._box = { x: -1, y: -1, width: -1, height: -1 };
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const item of this.members) {
      const box = GroupShape.memberBox(item);
      x0 = Math.min(x0, box.x); y0 = Math.min(y0, box.y);
      x1 = Math.max(x1, box.x + box.w); y1 = Math.max(y1, box.y + box.h);
      this._entries.set(item, { dx: box.x - x0, dy: box.y - y0, w: box.w, h: box.h });
    }
    // Re-anchor the relative entries when the span origin moved (nested groups included).
    for (const [item, entry] of this._entries) {
      const box = GroupShape.memberBox(item);
      entry.dx = box.x - x0; entry.dy = box.y - y0; entry.w = box.w; entry.h = box.h;
    }
    this._layoutW = x1 - x0; this._layoutH = y1 - y0;
    this._box = loaded ? { ...loaded } : { x: x0, y: y0, width: this._layoutW, height: this._layoutH };
  }

  /** Current resize ratios (ext / snapshot span — the OOXML `ext/chExt` factors). */
  private _ratios(): { fx: number; fy: number } {
    const fx = this._layoutW > 0 ? this._box.width / this._layoutW : 1;
    const fy = this._layoutH > 0 ? this._box.height / this._layoutH : 1;
    return { fx, fy };
  }

  /** `GroupShape.add` (trial probe t81-addmember): the frame extends to cover the new member. */
  private _includeMember(member: TopShape): void {
    if (!this.members.includes(member)) return;
    if (this._layoutW <= 0 || this._layoutH <= 0) { this._snapshotFromMembers(); return; }
    const { fx, fy } = this._ratios();
    const box = GroupShape.memberBox(member);
    let minL = Math.min(0, box.x - this._box.x); let maxR = Math.max(1, box.x - this._box.x + box.w);
    let minT = Math.min(0, box.y - this._box.y); let maxB = Math.max(1, box.y - this._box.y + box.h);
    for (const entry of this._entries.values()) {
      minL = Math.min(minL, entry.dx); maxR = Math.max(maxR, entry.dx + entry.w);
      minT = Math.min(minT, entry.dy); maxB = Math.max(maxB, entry.dy + entry.h);
    }
    if (minL < 0) for (const entry of this._entries.values()) entry.dx -= minL;
    if (minT < 0) for (const entry of this._entries.values()) entry.dy -= minT;
    this._entries.set(member, { dx: (box.x - this._box.x - minL) / fx, dy: (box.y - this._box.y - minT) / fy, w: box.w / fx, h: box.h / fy });
    this._box.x += minL * fx; this._box.y += minT * fy;
    this._layoutW = maxR - minL; this._layoutH = maxB - minT;
    this._box.width = this._layoutW * fx; this._box.height = this._layoutH * fy;
  }

  /** Re-derive every member's live geometry from the snapshot layout under the current ratios. */
  private _applyLayout(): void {
    const { fx, fy } = this._ratios();
    for (const item of this.members) {
      const entry = this._entries.get(item);
      if (!entry) continue;
      const x = this._box.x + entry.dx * fx;
      const y = this._box.y + entry.dy * fy;
      if (item instanceof GroupShape) item._setMappedBox(x, y, entry.w * fx, entry.h * fy);
      else {
        item.x(x); item.y(y);
        item.width(Math.max(0, entry.w * fx)); item.height(Math.max(0, entry.h * fy));
      }
    }
  }

  /** Nested group child: resize maps its frame, then its own layout remaps its members. */
  _setMappedBox(x: number, y: number, width: number, height: number): void {
    this._box = { x, y, width, height };
    this._applyLayout();
    this._syncBoxAnchors();
  }

  private box(): { x: number; y: number; width: number; height: number } {
    return this._box;
  }
  override x(value?: number | string): unknown {
    if (value === undefined) return this._box.x;
    return this.moveMembers(value, this._box.x, 'x');
  }
  override y(value?: number | string): unknown {
    if (value === undefined) return this._box.y;
    return this.moveMembers(value, this._box.y, 'y');
  }
  override width(value?: number | string): unknown {
    if (value === undefined) return this._box.width;
    return this.moveMembers(value, this._box.width, 'width');
  }
  override height(value?: number | string): unknown {
    if (value === undefined) return this._box.height;
    return this.moveMembers(value, this._box.height, 'height');
  }
  /** Group geometry MOVES (x/y: frame plus members translate together, trial probe) or RESIZES
   * (width/height: the frame takes the value and the snapshot layout re-derives every member). */
  private moveMembers(value: number | string, current: number, kind: 'x' | 'y' | 'width' | 'height'): this {
    const numeric = Number(String(value).replace(/^=/, ''));
    if (!Number.isFinite(numeric)) return this;
    const delta = numeric - current;
    if (!delta) return this;
    if (kind === 'x') { this._box.x += delta; for (const item of this.members) item.shift(delta, 0); }
    else if (kind === 'y') { this._box.y += delta; for (const item of this.members) item.shift(0, delta); }
    else {
      this._box[kind] = Math.max(0, numeric);
      this._applyLayout();
    }
    this._syncBoxAnchors();
    this._sheet?._view()?.schedule();
    return this;
  }
  /** Translate the whole group (used by nested group moves and group-wide shifts). */
  shift(dx: number, dy: number): void {
    if (!dx && !dy) return;
    this._box.x += dx; this._box.y += dy;
    for (const item of this.members) item.shift(dx, dy);
    this._syncBoxAnchors();
  }
  /** Re-derive the host anchors from the group frame so the DOM host follows drags. */
  private _syncBoxAnchors(): void {
    const rows = this._sheet?._rowLayout(), cols = this._sheet?._columnLayout();
    if (!rows || !cols) return;
    const box = this._box;
    if (box.width <= 0 || box.height <= 0) return;
    const x = box.x, y = box.y, endX = x + box.width, endY = y + box.height;
    const row = rows.indexAtOffset(y), col = cols.indexAtOffset(x);
    const endRow = rows.indexAtOffset(endY), endCol = cols.indexAtOffset(endX);
    this._setAnchors({
      row, col, dx: x - cols.prefixSum(col), dy: y - rows.prefixSum(row),
      endRow, endCol, endDx: endX - cols.prefixSum(endCol), endDy: endY - rows.prefixSum(endRow),
    });
  }

  override startRow(value?: number): unknown { return value === undefined ? (this.side('start', 'Row') ?? super.startRow()) : super.startRow(value); }
  override startColumn(value?: number): unknown { return value === undefined ? (this.side('start', 'Column') ?? super.startColumn()) : super.startColumn(value); }
  override endRow(value?: number): unknown { return value === undefined ? (this.side('end', 'Row') ?? super.endRow()) : super.endRow(value); }
  override endColumn(value?: number): unknown { return value === undefined ? (this.side('end', 'Column') ?? super.endColumn()) : super.endColumn(value); }
  override startRowOffset(value?: number): unknown { return value === undefined ? (this.side('start', 'RowOffset') ?? super.startRowOffset()) : super.startRowOffset(value); }
  override startColumnOffset(value?: number): unknown { return value === undefined ? (this.side('start', 'ColumnOffset') ?? super.startColumnOffset()) : super.startColumnOffset(value); }
  override endRowOffset(value?: number): unknown { return value === undefined ? (this.side('end', 'RowOffset') ?? super.endRowOffset()) : super.endRowOffset(value); }
  override endColumnOffset(value?: number): unknown { return value === undefined ? (this.side('end', 'ColumnOffset') ?? super.endColumnOffset()) : super.endColumnOffset(value); }

  /** Render: a bounding-box host element carrying one canvas with every member painted inside it. */
  override _render(view: WorkbookRenderer, layer: HTMLElement, zIndex: number): void {
    if (!this.members.length) {
      for (const host of this.getHost()) host.style.display = 'none';
      return;
    }
    this._syncBoxAnchors();
    super._render(view, layer, zIndex);
    const host = this.getHost()[0];
    if (!host) return;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'opensheets-shape-canvas';
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      host.querySelector('.opensheets-floating-content')?.append(this.canvas);
    }
    const dpr = window.devicePixelRatio ?? 1;
    const box = this._box;
    if (box.width <= 0 || box.height <= 0) return;
    const w = Math.max(2, Math.round(box.width * view.zoom));
    const h = Math.max(2, Math.round(box.height * view.zoom));
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) { this.canvas.width = w * dpr; this.canvas.height = h * dpr; }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.paintTo(ctx, w, h);
    attachRotationHandle(host, () => Number(this.rotation()), (value) => { this.rotation(value); }, !!this.isSelected(), !!this.allowRotate());
  }

  /** Snapshot of the whole group: every member painted at its place inside the frame. */
  protected override paintTo(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const box = this._box;
    if (box.width <= 0 || box.height <= 0) return;
    ctx.save();
    ctx.scale(width / box.width, height / box.height);
    ctx.translate(-box.x, -box.y);
    for (const item of this.members) {
      ctx.save();
      ctx.translate(Number(item.x()) || 0, Number(item.y()) || 0);
      item.paintShapeTo(ctx, Math.max(1, Math.round(Number(item.width()) || 1)), Math.max(1, Math.round(Number(item.height()) || 1)));
      ctx.restore();
    }
    ctx.restore();
  }

  override toJSON(): JsonRecord {
    const box = this.box();
    const result: JsonRecord = {
      typeName: this.typeName, name: this.name(), x: box.x, y: box.y, width: box.width, height: box.height,
      shapeType: 3, // our group marker (the trial's grpSp entry carries its own shapeType 3 too)
    };
    for (const key of GroupFlagKeys) if (this.flags[key] !== undefined) result[key] = this.flags[key];
    for (const key of GroupPropKeys) {
      const value = this.props[key];
      if (value !== undefined && value !== groupPropDefaults[key]) result[key] = value;
    }
    result.children = this.members.map(item => item.toJSON());
    return result;
  }
  /** Restore the group's own flags from its serialized entry (membership arrives through `children`). */
  applyGroupJSON(json: JsonRecord): void {
    for (const key of GroupFlagKeys) if (json[key] !== undefined) this.flags[key] = json[key] as JsonRecord[string];
    for (const key of GroupPropKeys) if (typeof json[key] === 'boolean') this.props[key] = json[key] as boolean;
  }
}

const GroupFlagKeys = ['alt', 'canPrint', 'allowRotate', 'showHandle', 'hyperlink'];
const GroupPropKeys = ['isLocked', 'isSelected', 'isVisible', 'dynamicMove', 'dynamicSize', 'allowMove', 'allowResize'];
const groupPropDefaults: Record<string, unknown> = { isLocked: true, isSelected: false, isVisible: true, dynamicMove: true, dynamicSize: true, allowMove: true, allowResize: true };

export class ShapeCollection {
  /** Top-level entries only — grouped members live inside their `GroupShape` handle (TASK 81). */
  private items: TopShape[] = [];
  private groups = new Map<string, GroupShape>();
  /** All live group handles on this sheet (collection-attached or constructor-only) — feeds `nextGroupName`. */
  private knownGroups = new Set<GroupShape>();
  private disposed = false;
  constructor(private sheet?: Worksheet) {}

  /** Inserts an existing shape or creates a rectangle from arguments. */
  add(shapeOrName: ModelShape | string, shapeType?: number, x?: number, y?: number, width?: number, height?: number): Shape {
    const shape = shapeOrName instanceof ModelShape ? shapeOrName : new Shape(String(shapeOrName), shapeType ?? 1, x, y, width, height);
    return this._push(shape) as Shape;
  }
  /** Shared insertion step for every factory (duplicate-name guard, sheet attach, anchor capture). */
  private _push(shape: ModelShape): ModelShape {
    if (this.get(String(shape.name()))) throw new Error('Shape name already exists');
    shape._sheet = this.sheet;
    shape._captureAnchors();
    this.items.push(shape);
    this.sheet?._view()?.schedule();
    return shape;
  }
  /** Camera shape that mirrors a live cell range (named `Picture N` in the trial). */
  addCameraShape(name: string, cellRange: string, x = 0, y = 0, width = 100, height = 100): CameraShape {
    const shape = new CameraShape(name || this.nextName('Picture'), AutoShapeType.rectangle, x, y, width, height);
    shape.cellRange(String(cellRange));
    // Trial values (probe f40sh6-style): a camera fills white with a 0.75 px black outline.
    shape.fill({ visible: true, color: '#ffffff', transparency: 0 });
    shape.line({ visible: true, color: '#000000', width: 0.75, dash: 0 });
    return this._push(shape) as CameraShape;
  }
  /** Form-control shape; `formControlType` is the public enum value ("checkBox"). */
  addFormControl(name: string, controlOrType: ShapeControl | string, x = 0, y = 0, width = 120, height = 24): FormControlShape {
    const control: ShapeControl = typeof controlOrType === 'string'
      ? { objectType: FormControlShapeNames[controlOrType] ?? controlOrType }
      : controlOrType;
    const shape = new FormControlShape(name, AutoShapeType.rectangle, x, y, width, height);
    shape.control(control);
    shape.fill({ visible: false });
    shape.line({ visible: false });
    return this._push(shape) as FormControlShape;
  }
  /** Connector between two sheet points (`ConnectorType`: straight / elbow / curve). */
  addConnector(name: string, connectorType = 0, beginX = 0, beginY = 0, endX = 100, endY = 100): ConnectorShape {
    const shape = new ConnectorShape(name || this.nextName('Straight Connector'), AutoShapeType.line,
      Math.min(beginX, endX), Math.min(beginY, endY), Math.max(4, Math.abs(endX - beginX)), Math.max(4, Math.abs(endY - beginY)));
    shape.setConnectorType(Number(connectorType) || 0);
    // Trial values (probe f40sh6-style): connectors have no fill and a half-pixel accent line.
    shape.fill({ visible: false });
    shape.line({ visible: true, color: '#5b9bd5', width: 0.5, dash: 0 });
    return this._push(shape) as ConnectorShape;
  }
  /** Picture shape over the cells. */
  addPictureShape(name: string, src: string, x = 0, y = 0, width = 100, height = 100): PictureShape {
    const shape = new PictureShape(name, AutoShapeType.rectangle, x, y, width, height);
    shape.src(src);
    shape.fill({ visible: false });
    shape.line({ visible: false });
    return this._push(shape) as PictureShape;
  }
  /** Text box: a rectangle preset whose default style has no fill or line. */
  addTextBox(name: string, x: number, y: number, width: number, height: number): Shape {
    const shape = new Shape(name, AutoShapeType.rectangle, x, y, width, height);
    shape.txBox(true);
    shape.fill({ visible: false });
    shape.line({ visible: false });
    return this.add(shape);
  }
  /** TOP-LEVEL shapes (trial rule): a grouped member is answered by its group handle instead. */
  all(): Shape[] { return [...this.items] as Shape[]; }
  /** Finds by name across the whole tree: top level plus nested group members (trial `get()` answers both). */
  get(name: string): Shape | undefined { const item = this._any(name); return item ? (item as Shape) : undefined; }
  remove(name: string): void {
    const item = this._any(name);
    if (!item) return;
    const top = this.items.indexOf(item);
    if (top >= 0) this.items.splice(top, 1);
    else this._ownerOf(item)?._detachMember(item);
    if (item instanceof GroupShape) {
      // Trial rule: deleting a group deletes its members too (GroupShape doc: unified delete).
      this.groups.delete(String(item.name()));
      const walk = (group: GroupShape): void => {
        for (const member of group._memberList()) {
          if (member instanceof GroupShape) { this.groups.delete(String(member.name())); walk(member); }
          member._dispose();
        }
      };
      walk(item);
    }
    item._dispose();
    this.sheet?._view()?.schedule();
  }
  clear(): void {
    this.items.forEach(item => item._dispose());
    for (const group of this.groups.values()) for (const member of group._memberList()) member._dispose();
    this.items = [];
    this.groups.clear();
    this.sheet?._view()?.schedule();
  }
  /** 0-based stacking order of the TOP-LEVEL entries; setting moves the shape or group. */
  zIndex(name: string, index?: number): number | this {
    const item = this._top(name);
    if (!item) return -1;
    if (index === undefined) return this.items.indexOf(item);
    this.items.splice(this.items.indexOf(item), 1);
    this.items.splice(Math.max(0, Math.min(this.items.length, index)), 0, item);
    this.sheet?._view()?.schedule();
    return this;
  }
  bringForward(name: string): void { this._moveZ(name, +1); }
  sendBackward(name: string): void { this._moveZ(name, -1); }
  bringToFront(name: string): void { const item = this._top(name); if (item) { this.items.splice(this.items.indexOf(item), 1); this.items.push(item); this.sheet?._view()?.schedule(); } }
  sendToBack(name: string): void { const item = this._top(name); if (item) { this.items.splice(this.items.indexOf(item), 1); this.items.unshift(item); this.sheet?._view()?.schedule(); } }
  /**
   * Group shapes into a nested `GroupShape` handle (trial rule, probed 2026-11-20): a handle is
   * ALWAYS created — zero members group nothing into an empty group at index 0, one shape groups
   * alone — and a non-empty group takes the slot of its highest member minus the members left of
   * it. The members leave the collection's top level and live inside the handle.
   */
  group(shapesOrNames: (ModelShape | GroupShape | string)[]): GroupShape {
    const members = shapesOrNames
      .map(item => (typeof item === 'string' ? this._any(item) : item))
      .filter((item): item is TopShape => !!item);
    const group = new GroupShape(this.sheet);
    group._own(this);
    this.groups.set(String(group.name()), group);
    // Record the ORIGINAL slots first (trial rule: the group lands at the highest member slot
    // minus the members left of it — measured with fresh, shrinking or arbitrary member sets).
    const positions = members.map((member) => this.items.indexOf(member));
    let maxIdx = -1, removed = 0;
    // Splice out right-to-left so the recorded original indices stay valid.
    members.forEach((member, i) => {
      const idx = positions[i];
      if (idx < 0) { const owner = this._ownerOf(member); if (owner && owner !== group) owner._detachMember(member); }
    });
    members.map((member, i) => ({ member, idx: positions[i] }))
      .filter((entry) => entry.idx >= 0)
      .sort((a, b) => b.idx - a.idx)
      .forEach((entry) => { this.items.splice(entry.idx, 1); maxIdx = Math.max(maxIdx, entry.idx); removed++; });
    const at = Math.max(0, Math.min(this.items.length, removed ? maxIdx - (removed - 1) : 0));
    for (const member of members) group._attachMember(member);
    group._snapshotFromMembers(); // trial frame: the member box at grouping time
    this.items.splice(at, 0, group);
    this.sheet?._view()?.schedule();
    return group;
  }
  /** Ungroup: the members return to the group's slot, in member order (trial probe 2026-11-20). */
  ungroup(groupOrShape: GroupShape | ModelShape | string): void {
    let group: GroupShape | undefined;
    if (typeof groupOrShape === 'string') {
      group = this.groups.get(String(groupOrShape));
      if (!group) { // legacy flat membership (pre-TASK-81 shape JSON loaded mid-session): release by key
        const id = String(groupOrShape);
        for (const item of this.items) if (String(item.groupId() ?? '') === id) item.groupId(null);
        this.sheet?._view()?.schedule();
        return;
      }
    } else if (groupOrShape instanceof GroupShape) group = groupOrShape;
    else {
      const id = String(groupOrShape.groupId() ?? '');
      group = id ? this.groups.get(id) : undefined;
    }
    if (!group || !this.groups.has(String(group.name()))) return;
    let at = this.items.indexOf(group);
    if (at < 0) {
      const owner = this._ownerOf(group);
      if (owner) { owner._detachMember(group); at = Math.max(0, this.items.indexOf(owner) + 1); }
    }
    if (at >= 0) this.items.splice(at, 1);
    const members = group._memberList().slice();
    for (const member of members) {
      group._detachMember(member);
      this.items.splice(Math.min(at, this.items.length), 0, member);
      at++;
    }
    this.groups.delete(String(group.name()));
    group._dispose(); // the retired handle's host leaves the layer
    this.sheet?._view()?.schedule();
  }
  addToGroup(id: string, shape: ModelShape | GroupShape): void { this.groups.get(String(id))?.add(shape); }
  removeFromGroup(id: string, shape: ModelShape | GroupShape): void { this.groups.get(String(id))?.remove(shape); }
  groupMembers(id: string): Shape[] { return this.groups.get(String(id))?.all() ?? []; }
  /** Internal union view of a group's members (nested groups included). */
  _groupMemberList(id: string): TopShape[] { return this.groups.get(String(id))?._memberList() ?? []; }
  /**
   * Auto group name (trial rule, probes 2026-11-21, `.probe/t77/run/t81-groupnames*.json`):
   * while no live group handle answers the name `GroupShape 1` the next handle simply takes
   * `GroupShape 1` (fresh session, after `fromJSON`, or after that name was freed — trial probe
   * C8c: loaded groups named `GroupShape 9`/`12` make the next group `GroupShape 1`).
   * Once a `GroupShape 1` is alive, the candidate is `(#top-level entries) + 1` and a candidate
   * taken by a live group walks UP until free (grouping five rects pairwise: `GroupShape 1`,
   * `GroupShape 5`, `GroupShape 4`, and the colliding empty group lands on `GroupShape 6`).
   * Constructor-created handles count as live even while unattached (probe C9); disposed handles
   * free their name (ungroup/remove paths).
   */
  nextGroupName(): string {
    let hasName1 = false;
    for (const group of this.knownGroups) if (String(group.name()) === 'GroupShape 1') { hasName1 = true; break; }
    if (!hasName1) return 'GroupShape 1';
    let n = this.items.length + 1;
    for (;;) {
      const name = `GroupShape ${n}`;
      let taken = false;
      for (const group of this.knownGroups) if (String(group.name()) === name) { taken = true; break; }
      if (!taken) return name;
      n++;
    }
  }
  /** Internal: a live `GroupShape` handle (attached or constructor-only) counts for the name counter. */
  _registerGroup(group: GroupShape): void { this.knownGroups.add(group); }
  _unregisterGroup(group: GroupShape): void { this.knownGroups.delete(group); }
  /** Internal: registers a group handle under a new name (group rename). */
  _renameGroup(oldName: string, newName: string, group: GroupShape): void {
    if (this.groups.get(oldName) === group) this.groups.delete(oldName);
    this.groups.set(newName, group);
  }
  /** Internal: moves a top-level (or foreign-group) shape out of its current home, for `GroupShape.add`. */
  _adoptInto(group: GroupShape, member: TopShape): void {
    const idx = this.items.indexOf(member);
    if (idx >= 0) this.items.splice(idx, 1);
    const owner = this._ownerOf(member);
    if (owner && owner !== group) owner._detachMember(member);
  }
  /** Internal: keeps the collection's membership index in step with a group handle. */
  _groupChanged(id: string, names: string[]): void {
    if (!this.groups.has(id)) return;
    for (const name of names) {
      const item = this._any(name);
      if (item && !(item instanceof GroupShape)) item.groupId(id);
    }
    this.sheet?._view()?.schedule();
  }
  private _top(name: string): TopShape | undefined {
    const key = String(name);
    return this.items.find(item => String(item.name()) === key);
  }
  private _any(name: string): TopShape | undefined {
    const key = String(name);
    const top = this._top(key);
    if (top) return top;
    for (const group of this.groups.values()) {
      if (String(group.name()) === key) return group;
      const found = group.find(key);
      if (found) return found as TopShape;
    }
    return undefined;
  }
  private _ownerOf(item: TopShape): GroupShape | undefined {
    const id = String(item.groupId() ?? '');
    const direct = id ? this.groups.get(id) : undefined;
    if (direct && direct._memberList().includes(item)) return direct;
    for (const group of this.groups.values()) if (group._memberList().includes(item)) return group;
    return undefined;
  }
  private _moveZ(name: string, delta: number): void {
    const item = this._top(name);
    if (!item) return;
    const index = this.items.indexOf(item);
    const next = Math.max(0, Math.min(this.items.length - 1, index + delta));
    if (next === index) return;
    this.items.splice(index, 1);
    this.items.splice(next, 0, item);
    this.sheet?._view()?.schedule();
  }
  canBringForward(name: string): boolean { const item = this._top(name); return !!item && this.items.indexOf(item) < this.items.length - 1; }
  canSendBackward(name: string): boolean { const item = this._top(name); return !!item && this.items.indexOf(item) > 0; }
  hitTest(x: number, y: number): Shape | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item.isVisible()) continue;
      const left = Number(item.x()), top = Number(item.y());
      if (x >= left && x <= left + Number(item.width()) && y >= top && y <= top + Number(item.height())) return item as Shape;
    }
    return undefined;
  }
  /** Bounding box of every TOP-LEVEL entry, in sheet pixels. */
  getUsedRange(): { x: number; y: number; width: number; height: number } | null {
    if (!this.items.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const item of this.items) {
      x0 = Math.min(x0, Number(item.x())); y0 = Math.min(y0, Number(item.y()));
      x1 = Math.max(x1, Number(item.x()) + Number(item.width())); y1 = Math.max(y1, Number(item.y()) + Number(item.height()));
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  snapMode(value?: number): number | this {
    if (value === undefined) return this._snap;
    this._snap = Number(value) || 0;
    return this;
  }
  private _snap = 0;
  /** Unique display name per preset family, matching the trial's "rectangle 1". */
  nextName(preset: string): string {
    let max = 0;
    const pattern = new RegExp(`^${preset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: (\\d+))?$`);
    for (const item of this.items) {
      const match = pattern.exec(String(item.name()));
      if (match) max = Math.max(max, match[1] ? Number(match[1]) : 1);
    }
    return `${preset} ${max + 1}`;
  }
  /** Names may repeat in the trial (e.g. two "Check Box"); ensure uniqueness for us. */
  uniqueName(base: string): string {
    if (!this.get(base)) return base;
    let i = 2;
    while (this.get(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }
  toJSON(): JsonRecord[] { return this.items.map(item => item.toJSON()); }
  /**
   * Build handles from serialized shape records and add them at the top level (TASK 81, used by
   * the designer's paste Shapes): records with a `children` array restore as a nested
   * `GroupShape`; the caller pre-processes names (uniqueness) and geometry (paste offset).
   */
  importShapes(records: JsonRecord[]): (Shape | GroupShape)[] {
    const added: (Shape | GroupShape)[] = [];
    for (const record of records) {
      if (Array.isArray(record.children)) {
        const group = new GroupShape(this.sheet, String(record.name ?? this.nextGroupName()));
        group._own(this);
        this.groups.set(String(group.name()), group);
        group.applyGroupJSON(record);
        for (const child of record.children as JsonRecord[]) group._attachMember(this._buildHandle(child));
        group._snapshotFromMembers(record.x !== undefined || record.width !== undefined
          ? { x: Number(record.x ?? 0), y: Number(record.y ?? 0), width: Number(record.width ?? 0), height: Number(record.height ?? 0) } : undefined);
        this.items.push(group);
        added.push(group);
      } else {
        added.push(this._push(this._buildHandle(record) as ModelShape) as Shape);
      }
    }
    this.sheet?._view()?.schedule();
    return added;
  }
  /**
   * Rebuild the shape tree from our serialized records (TASK 81): entries with a `children`
   * array restore as nested `GroupShape` handles with their members; camera/picture/form-control
   * markers restore as their public classes; entries carrying the pre-TASK-81 flat `groupId`
   * key fold back into groups.
   */
  _fromJSON(json: JsonRecord[]): void {
    this.clear();
    for (const data of json) {
      if (Array.isArray(data.children)) {
        const group = new GroupShape(this.sheet, String(data.name ?? this.nextGroupName()));
        group._own(this);
        this.groups.set(String(group.name()), group);
        group.applyGroupJSON(data);
        for (const child of data.children as JsonRecord[]) group._attachMember(this._buildHandle(child));
        group._snapshotFromMembers(data.x !== undefined || data.width !== undefined
          ? { x: Number(data.x ?? 0), y: Number(data.y ?? 0), width: Number(data.width ?? 0), height: Number(data.height ?? 0) } : undefined);
        this.items.push(group);
        continue;
      }
      this.add(this._buildHandle(data) as ModelShape);
    }
    this._foldLegacyGroups();
    this.sheet?._view()?.schedule();
  }
  private _buildHandle(data: JsonRecord): TopShape {
    const name = String(data.name ?? 'rectangle');
    const box: [number, number, number, number] = [Number(data.x ?? 0), Number(data.y ?? 0), Number(data.width ?? 100), Number(data.height ?? 100)];
    const type = Number(data.shapeType ?? 1);
    if (Array.isArray(data.children)) { // nested group inside a group entry
      const group = new GroupShape(this.sheet, name);
      group._own(this);
      this.groups.set(String(group.name()), group);
      group.applyGroupJSON(data);
      for (const child of data.children as JsonRecord[]) group._attachMember(this._buildHandle(child));
      group._snapshotFromMembers(data.x !== undefined || data.width !== undefined
        ? { x: Number(data.x ?? 0), y: Number(data.y ?? 0), width: Number(data.width ?? 0), height: Number(data.height ?? 0) } : undefined);
      return group;
    }
    let shape: ModelShape;
    if (data.control !== undefined && data.control !== null) shape = new FormControlShape(name, type, ...box);
    else if (data.cellRange !== undefined && data.cellRange !== null) shape = new CameraShape(name, type, ...box);
    else if (data.src !== undefined && data.src !== null) shape = new PictureShape(name, type, ...box);
    else shape = new Shape(name, type, ...box);
    shape.fromJSON(data);
    shape.fromShapeJSON(data);
    return shape;
  }
  /** Fold pre-TASK-81 flat entries that carry a shared `groupId` back into a group handle. */
  private _foldLegacyGroups(): void {
    const pending = new Map<string, TopShape[]>();
    for (const item of this.items) {
      const id = item.groupId();
      if (!(item instanceof GroupShape) && typeof id === 'string' && id) {
        (pending.get(id) ?? pending.set(id, []).get(id)!).push(item);
      }
    }
    if (!pending.size) return;
    const rebuilt: TopShape[] = [];
    const placed = new Set<string>();
    for (const item of this.items) {
      const id = item.groupId();
      if (item instanceof GroupShape || typeof id !== 'string' || !id) { rebuilt.push(item); continue; }
      if (placed.has(id)) continue;
      placed.add(id);
      const group = new GroupShape(this.sheet, id);
      group._own(this);
      this.groups.set(id, group);
      for (const member of pending.get(id) ?? []) group._attachMember(member);
      group._snapshotFromMembers();
      rebuilt.push(group);
    }
    this.items = rebuilt;
  }
  dispose(): void { this.clear(); this.disposed = true; }
  isDisposed(): boolean { return this.disposed; }
}
