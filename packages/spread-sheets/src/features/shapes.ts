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

/** Auto name of a group handle: `GroupShape 1`, `GroupShape 2`, ... per worksheet. */
const groupNames = new WeakMap<object, number>();
function nextGroupName(sheet: Worksheet | undefined): string {
  const key = (sheet ?? globalThis) as object;
  const next = (groupNames.get(key) ?? 0) + 1;
  groupNames.set(key, next);
  return `GroupShape ${next}`;
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
}

/** A shape handle: the trial's `Shape` class (auto shapes, text boxes) over the base accessors. */
export class Shape extends ShapeBase {
  override typeName = '0';
  private _shape: JsonRecord;
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

  private prop(key: string, value?: unknown): unknown {
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
  /** Text-box flag (public name of `txBox`). */
  isTextBox(value?: boolean): boolean | this { return this.txBox(value); }
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
  text(value?: string): string | this {
    if (value === undefined) return String(this._shape.text ?? '');
    return this.prop('text', String(value)) as this;
  }
  textColor(value?: string): string | this {
    if (value === undefined) return String(this._shape.textColor);
    return this.prop('textColor', value) as this;
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

  private _moving = false;
  override x(value?: number | string): unknown {
    if (value === undefined) return super.x();
    const before = Number(super.x()) || 0;
    super.x(value);
    const delta = (Number(super.x()) || 0) - before;
    if (delta && !this._moving) {
      this._moving = true;
      for (const item of this._group()) if (item !== this) item.shift(delta, 0);
      this._moving = false;
    }
    return this;
  }
  override y(value?: number | string): unknown {
    if (value === undefined) return super.y();
    const before = Number(super.y()) || 0;
    super.y(value);
    const delta = (Number(super.y()) || 0) - before;
    if (delta && !this._moving) {
      this._moving = true;
      for (const item of this._group()) if (item !== this) item.shift(0, delta);
      this._moving = false;
    }
    return this;
  }
  /** Moves the shape directly (used for group members and paste offsets). */
  shift(dx: number, dy: number): void {
    this._moving = true;
    super.x(Math.max(0, Number(super.x()) + dx));
    super.y(Math.max(0, Number(super.y()) + dy));
    this._moving = false;
  }
  private _group(): Shape[] {
    const id = this.groupId() as string | null;
    if (!id) return [];
    return ((this._sheet?.shapes.groupMembers(id) ?? []) as unknown) as Shape[];
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
  protected override paintTo(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.control()) { paintFormControl(ctx, this.control() as ShapeControl, String(this.text() ?? ''), 0, 0, w, h); return; }
    if (this.isPicture() || this.isCamera()) { this._paintCameraChrome(this._sheet?._view(), ctx, w, h); return; }
    paintShape(ctx, {
      prst: this.preset(), x: 0, y: 0, w, h,
      fill: this.fill() as ShapeFill, line: this.line() as ShapeLine, rotation: 0,
      arrow: this.arrowHeads(),
    });
    this._paintText(ctx, w, h);
  }
  /** Public door to the painting code (used by `GroupShape` snapshots). */
  paintShapeTo(ctx: CanvasRenderingContext2D, w: number, h: number): void { this.paintTo(ctx, w, h); }

  /** Paints the camera source snapshot (or the picture bitmap) inside the shape box. */
  private _paintCameraChrome(view: WorkbookRenderer | undefined, ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const src = this.src() as string | null;
    if (src) {
      const image = Shape.imageCache.get(src);
      if (!image) {
        const loaded = new Image();
        loaded.src = src;
        loaded.onload = (): void => { this._sheet?._view()?.schedule(); };
        Shape.imageCache.set(src, loaded);
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

  /** Text label drawn inside the shape (also used by text boxes and captions). */
  private _paintText(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const text = String(this.text() ?? '');
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
    if (!this.isSelected() || !this.allowRotate()) { host.querySelector('.opensheets-shape-rotate')?.remove(); return; }
    let knob = host.querySelector<HTMLElement>('.opensheets-shape-rotate');
    if (!knob) {
      knob = document.createElement('div');
      knob.className = 'opensheets-shape-rotate';
      host.append(knob);
      knob.addEventListener('pointerdown', event => {
        event.stopPropagation(); event.preventDefault();
        const box = host.getBoundingClientRect();
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
        const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * 180 / Math.PI;
        const origin = Number(this.rotation());
        const move = (e: PointerEvent): void => {
          const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
          let next = origin + angle - startAngle;
          if (e.shiftKey) next = Math.round(next / 15) * 15;
          this.rotation((next + 360) % 360);
        };
        const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    }
    void view;
  }

  override toJSON(): JsonRecord {
    const result = super.toJSON();
    delete result.content;
    for (const key of Object.keys(shapeDefaults)) if (JSON.stringify(this._shape[key]) !== JSON.stringify(shapeDefaults[key])) result[key] = this._shape[key];
    if (this._shape.arrowHeads) result.arrowHeads = this._shape.arrowHeads;
    Object.assign(result, this.baseJSON());
    return result;
  }
  fromShapeJSON(json: JsonRecord): void {
    for (const key of Object.keys(shapeDefaults)) if (json[key] !== undefined) this._shape[key] = json[key];
    this.applyBaseJSON(json);
  }
}

/** Camera shape: a live mirror of a cell range (`range()` is the public accessor). */
export class CameraShape extends Shape {
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
export class PictureShape extends Shape {
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
  getOriginalWidth(): number { return Shape.imageCache.get(String(this.src() ?? ''))?.naturalWidth ?? 0; }
  getOriginalHeight(): number { return Shape.imageCache.get(String(this.src() ?? ''))?.naturalHeight ?? 0; }
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
export class ConnectorShape extends Shape {
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

/**
 * Handle over a grouped set of shapes. The trial exposes it as a `ShapeBase`, so the
 * group carries its own flags (`alt`, `allowMove`, ...) that do NOT touch the members,
 * while its geometry reads the bounding box of the members.
 */
export class GroupShape extends ShapeBase {
  private members: Shape[] = [];
  private collection: ShapeCollection | undefined;

  /** `new GroupShape(worksheet, name?)`: an empty group with the trial's `GroupShape N` auto name. */
  constructor(sheet?: Worksheet, name?: string) {
    super(name ?? nextGroupName(sheet));
    this._sheet = sheet;
    this.bound = true;
  }

  /** Membership key the members carry (our own; the reference keeps it internal). */
  groupId(): string { return String(this.name()); }
  /** Internal: the collection that owns this handle (membership changes go through it). */
  _own(collection: ShapeCollection): void { this.collection = collection; }
  all(): Shape[] { return [...this.members]; }
  add(shape: Shape): void {
    if (this.members.includes(shape)) return;
    this.members.push(shape);
    shape.groupId(String(this.name()));
    this.collection?._groupChanged(String(this.name()), this.members.map(item => String(item.name())));
  }
  remove(shape: Shape): void {
    this.members = this.members.filter(item => item !== shape);
    if (String(shape.groupId() ?? '') === String(this.name())) shape.groupId(null);
    this.collection?._groupChanged(String(this.name()), this.members.map(item => String(item.name())));
  }
  find(name: string): Shape | undefined { return this.members.find(item => String(item.name()) === String(name)); }

  /** Member stacking slot inside the group; the setter answers nothing, like the trial. */
  zIndex(shapeName: string, zIndex?: number): number | void {
    const index = this.members.findIndex(item => String(item.name()) === String(shapeName));
    if (index < 0) return -1;
    if (zIndex === undefined) return index;
    const target = Math.max(0, Math.min(this.members.length - 1, Number(zIndex)));
    const [item] = this.members.splice(index, 1);
    this.members.splice(target, 0, item);
    this.collection?._groupChanged(String(this.name()), this.members.map(member => String(member.name())));
    this._sheet?._view()?.schedule();
  }
  rotate(value?: number | string): number | void {
    if (value === undefined) return Number(this.members[0]?.rotation() ?? 0);
    const numeric = typeof value === 'string' ? Number(value.replace(/^=/, '')) : Number(value);
    for (const item of this.members) item.rotation(numeric);
  }
  getFormula(path: string): string | undefined { return this.members[0]?.getFormula(path); }
  setFormula(path: string, formula: string): void { for (const item of this.members) item.setFormula(path, formula); }

  /** Bounding box of the members, in sheet pixels. */
  private bounds(): { x: number; y: number; width: number; height: number } | undefined {
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
  private extreme(pick: 'start' | 'end'): Shape | undefined {
    if (!this.members.length) return undefined;
    const key = pick === 'start' ? 'startRow' : 'endRow';
    return this.members.reduce((best, item) => (Number(item[key]()) < Number(best[key]()) ? (pick === 'start' ? item : best) : (pick === 'start' ? best : item)));
  }
  private side(pick: 'start' | 'end', name: 'Row' | 'Column' | 'RowOffset' | 'ColumnOffset'): number | undefined {
    const member = this.extreme(pick);
    if (!member) return undefined;
    const value = (member as unknown as Record<string, () => number>)[`${pick === 'start' ? 'start' : 'end'}${name}`]();
    return Number(value);
  }

  override x(value?: number | string): unknown {
    const box = this.bounds();
    if (value === undefined) return box ? box.x : super.x();
    return this.moveMembers(value, box ? box.x : 0, 'x');
  }
  override y(value?: number | string): unknown {
    const box = this.bounds();
    if (value === undefined) return box ? box.y : super.y();
    return this.moveMembers(value, box ? box.y : 0, 'y');
  }
  override width(value?: number | string): unknown {
    const box = this.bounds();
    if (value === undefined) return box ? box.width : super.width();
    return this.moveMembers(value, box ? box.width : 0, 'width');
  }
  override height(value?: number | string): unknown {
    const box = this.bounds();
    if (value === undefined) return box ? box.height : super.height();
    return this.moveMembers(value, box ? box.height : 0, 'height');
  }
  /** Group geometry moves (or stretches) every member by the same amount. */
  private moveMembers(value: number | string, current: number, kind: 'x' | 'y' | 'width' | 'height'): this {
    const numeric = Number(String(value).replace(/^=/, ''));
    if (!Number.isFinite(numeric)) return this;
    const delta = numeric - current;
    if (!delta) return this;
    for (const item of this.members) {
      if (kind === 'x') item.x(Number(item.x()) + delta);
      else if (kind === 'y') item.y(Number(item.y()) + delta);
      else item[kind](Math.max(0, Number(item[kind]()) + delta));
    }
    this._sheet?._view()?.schedule();
    return this;
  }
  override startRow(value?: number): unknown { return value === undefined ? (this.side('start', 'Row') ?? super.startRow()) : super.startRow(value); }
  override startColumn(value?: number): unknown { return value === undefined ? (this.side('start', 'Column') ?? super.startColumn()) : super.startColumn(value); }
  override endRow(value?: number): unknown { return value === undefined ? (this.side('end', 'Row') ?? super.endRow()) : super.endRow(value); }
  override endColumn(value?: number): unknown { return value === undefined ? (this.side('end', 'Column') ?? super.endColumn()) : super.endColumn(value); }
  override startRowOffset(value?: number): unknown { return value === undefined ? (this.side('start', 'RowOffset') ?? super.startRowOffset()) : super.startRowOffset(value); }
  override startColumnOffset(value?: number): unknown { return value === undefined ? (this.side('start', 'ColumnOffset') ?? super.startColumnOffset()) : super.startColumnOffset(value); }
  override endRowOffset(value?: number): unknown { return value === undefined ? (this.side('end', 'RowOffset') ?? super.endRowOffset()) : super.endRowOffset(value); }
  override endColumnOffset(value?: number): unknown { return value === undefined ? (this.side('end', 'ColumnOffset') ?? super.endColumnOffset()) : super.endColumnOffset(value); }

  /** Snapshot of the whole group: every member painted at its place inside the box. */
  protected override paintTo(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    void width; void height;
    const box = this.bounds();
    if (!box) return;
    ctx.save();
    ctx.translate(-box.x, -box.y);
    for (const item of this.members) {
      ctx.save();
      ctx.translate(Number(item.x()) || 0, Number(item.y()) || 0);
      item.paintShapeTo(ctx, Math.max(1, Math.round(Number(item.width()) || 1)), Math.max(1, Math.round(Number(item.height()) || 1)));
      ctx.restore();
    }
    ctx.restore();
  }
}

export class ShapeCollection {
  private items: Shape[] = [];
  private disposed = false;
  constructor(private sheet?: Worksheet) {}

  /** Inserts an existing shape or creates a rectangle from arguments. */
  add(shapeOrName: ShapeBase | string, shapeType?: number, x?: number, y?: number, width?: number, height?: number): Shape {
    const shape = shapeOrName instanceof ShapeBase ? (shapeOrName as Shape) : new Shape(String(shapeOrName), shapeType ?? 1, x, y, width, height);
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
    return this.add(shape) as CameraShape;
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
    return this.add(shape) as FormControlShape;
  }
  /** Connector between two sheet points (`ConnectorType`: straight / elbow / curve). */
  addConnector(name: string, connectorType = 0, beginX = 0, beginY = 0, endX = 100, endY = 100): ConnectorShape {
    const shape = new ConnectorShape(name || this.nextName('Straight Connector'), AutoShapeType.line,
      Math.min(beginX, endX), Math.min(beginY, endY), Math.max(4, Math.abs(endX - beginX)), Math.max(4, Math.abs(endY - beginY)));
    shape.setConnectorType(Number(connectorType) || 0);
    // Trial values (probe f40sh6-style): connectors have no fill and a half-pixel accent line.
    shape.fill({ visible: false });
    shape.line({ visible: true, color: '#5b9bd5', width: 0.5, dash: 0 });
    return this.add(shape) as ConnectorShape;
  }
  /** Picture shape over the cells. */
  addPictureShape(name: string, src: string, x = 0, y = 0, width = 100, height = 100): PictureShape {
    const shape = new PictureShape(name, AutoShapeType.rectangle, x, y, width, height);
    shape.src(src);
    shape.fill({ visible: false });
    shape.line({ visible: false });
    return this.add(shape) as PictureShape;
  }
  /** Text box: a rectangle preset whose default style has no fill or line. */
  addTextBox(name: string, x: number, y: number, width: number, height: number): Shape {
    const shape = new Shape(name, AutoShapeType.rectangle, x, y, width, height);
    shape.txBox(true);
    shape.fill({ visible: false });
    shape.line({ visible: false });
    return this.add(shape);
  }
  all(): Shape[] { return [...this.items]; }
  get(name: string): Shape | undefined { return this.items.find(item => item.name() === name); }
  remove(name: string): void {
    const item = this.get(name);
    if (!item) return;
    item._dispose();
    this.items = this.items.filter(existing => existing !== item);
    this.sheet?._view()?.schedule();
  }
  clear(): void { this.items.forEach(item => item._dispose()); this.items = []; this.sheet?._view()?.schedule(); }
  /** 0-based stacking order; setting moves the shape. */
  zIndex(name: string, index?: number): number | this {
    const item = this.get(name);
    if (!item) return -1;
    if (index === undefined) return this.items.indexOf(item);
    this.items.splice(this.items.indexOf(item), 1);
    this.items.splice(Math.max(0, Math.min(this.items.length, index)), 0, item);
    this.sheet?._view()?.schedule();
    return this;
  }
  bringForward(name: string): void { this._moveZ(name, +1); }
  sendBackward(name: string): void { this._moveZ(name, -1); }
  bringToFront(name: string): void { const item = this.get(name); if (item) { this.items.splice(this.items.indexOf(item), 1); this.items.push(item); this.sheet?._view()?.schedule(); } }
  sendToBack(name: string): void { const item = this.get(name); if (item) { this.items.splice(this.items.indexOf(item), 1); this.items.unshift(item); this.sheet?._view()?.schedule(); } }
  /** Groups shapes (`group([a, b])` like the trial) and returns the group handle. */
  group(shapesOrNames: (Shape | string)[]): GroupShape | null {
    const members = shapesOrNames.map(item => (typeof item === 'string' ? this.get(item) : item)).filter((item): item is Shape => !!item);
    if (members.length < 2) return null;
    const group = new GroupShape(this.sheet);
    group._own(this);
    for (const member of members) group.add(member);
    (this.groups ??= new Map<string, GroupShape>()).set(String(group.name()), group);
    this.sheet?._view()?.schedule();
    return group;
  }
  ungroup(groupOrShape: GroupShape | Shape | string): void {
    const id = groupOrShape instanceof GroupShape ? groupOrShape.groupId()
      : typeof groupOrShape === 'string' ? groupOrShape : String(groupOrShape.groupId() ?? '');
    if (!id) return;
    const group = this.groups?.get(id);
    if (group) { for (const member of group.all()) member.groupId(null); this.groups?.delete(id); }
    else for (const item of this.items) if (String(item.groupId() ?? '') === id) item.groupId(null);
    this.sheet?._view()?.schedule();
  }
  addToGroup(id: string, shape: Shape): void { this.groups?.get(id)?.add(shape); }
  removeFromGroup(id: string, shape: Shape): void { this.groups?.get(id)?.remove(shape); }
  groupMembers(id: string): Shape[] { return this.groups?.get(id)?.all() ?? []; }
  /** Internal: keeps the collection's membership index in step with a group handle. */
  _groupChanged(id: string, names: string[]): void {
    if (!this.groups?.has(id)) return;
    for (const name of names) this.get(name)?.groupId(id);
    this.sheet?._view()?.schedule();
  }
  private groups = new Map<string, GroupShape>();
  private _moveZ(name: string, delta: number): void {
    const item = this.get(name);
    if (!item) return;
    const index = this.items.indexOf(item);
    const next = Math.max(0, Math.min(this.items.length - 1, index + delta));
    if (next === index) return;
    this.items.splice(index, 1);
    this.items.splice(next, 0, item);
    this.sheet?._view()?.schedule();
  }
  canBringForward(name: string): boolean { return this.items.indexOf(this.get(name) ?? ({} as Shape)) < this.items.length - 1; }
  canSendBackward(name: string): boolean { return this.items.indexOf(this.get(name) ?? ({} as Shape)) > 0; }
  hitTest(x: number, y: number): Shape | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item.isVisible()) continue;
      const left = Number(item.x()), top = Number(item.y());
      if (x >= left && x <= left + Number(item.width()) && y >= top && y <= top + Number(item.height())) return item;
    }
    return undefined;
  }
  /** Bounding box of every shape, in sheet pixels. */
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
  _fromJSON(json: JsonRecord[]): void {
    this.clear();
    for (const data of json) {
      const shape = new Shape(String(data.name ?? 'rectangle'), Number(data.shapeType ?? 1), Number(data.x ?? 0), Number(data.y ?? 0), Number(data.width ?? 100), Number(data.height ?? 100));
      shape.fromJSON(data);
      shape.fromShapeJSON(data);
      this.add(shape);
    }
  }
  dispose(): void { this.clear(); this.disposed = true; }
  isDisposed(): boolean { return this.disposed; }
}
