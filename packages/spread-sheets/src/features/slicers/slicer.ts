/**
 * Slicer: the in-sheet table slicer object. Extends FloatingObject for the
 * anchored geometry (x/y/width/height/startRow…), overrides the defaults with
 * the trial's slicer defaults and fires SlicerChanged from the public setters.
 * The visual layer lives in `view.ts`; item/state helpers in `state.ts`.
 */
import { FloatingObject } from '../floating-objects.js';
import { Events } from '../../events.js';
import { Point } from '../../primitives.js';
import { GC } from '../../generated/enums.js';
import { SlicerStyle } from './styles.js';
import { DEFAULT_SLICER_STYLE, builtInSlicerStyle, slicerItems, slicerToJson, slicerFromJson, imageSource } from './state.js';
import { renderSlicerView, paintSlicerInto } from './view.js';
import type { GeneralSlicerData } from './general-data.js';
import { SLICER_DEFAULT_HEIGHT, SLICER_DEFAULT_WIDTH, SLICER_DEFAULT_X, SLICER_DEFAULT_Y, type SlicerItem } from './types.js';
import type { Worksheet } from '../../worksheet.js';
import type { WorkbookRenderer } from '../../rendering.js';
import type { JsonRecord } from '../../serialization.js';

const SortState = GC.Spread.Sheets.SortState;

export class Slicer extends FloatingObject {
  override typeName = '2';
  /** Bound slicer data (table column or pivot field; null for detached models). */
  slicerData: GeneralSlicerData | null = null;
  columnNameValue = '';
  styleObject: SlicerStyle | null = null;
  customProps: JsonRecord;

  constructor(name = '', slicerData?: GeneralSlicerData | null, columnName = '') {
    super(name || 'slicer1', SLICER_DEFAULT_X, SLICER_DEFAULT_Y, SLICER_DEFAULT_WIDTH, SLICER_DEFAULT_HEIGHT);
    this.slicerData = slicerData ?? null;
    this.columnNameValue = columnName || '';
    this.customProps = {
      type: 'table',
      captionName: this.columnNameValue,
      disableResizingAndMoving: false,
      showHeader: true,
      multiSelect: false,
      itemHeight: 21,
      columnCount: 1,
      sortState: SortState.ascending,
      showNoDataItems: true,
      showNoDataItemsInLast: true,
      visuallyNoDataItems: true,
      style: DEFAULT_SLICER_STYLE,
      alt: '',
      canPrint: true,
    };
    // Slicer-specific anchor defaults differ from plain floating objects.
    this.props.dynamicMove = false;
    this.props.dynamicSize = false;
  }

  private emit(propertyName: string): void {
    const sheet = this._sheet;
    if (!sheet) return;
    sheet._emit(Events.SlicerChanged, { sheet, sheetName: sheet.name(), slicer: this, propertyName });
  }

  private attr(key: string, value?: unknown, shouldCallback?: boolean): unknown {
    if (value === undefined) return this.customProps[key];
    this.customProps[key] = value;
    this._sheet?._view()?.schedule();
    if (shouldCallback !== false) this.emit(key);
    return this;
  }

  private opt<T>(key: string, value?: T, shouldCallback?: boolean): T | this {
    const got = this.attr(key, value, shouldCallback);
    return got === this ? this : (got as T);
  }

  sheet(): Worksheet | undefined { return this._sheet; }
  /** Attach this slicer to a worksheet (called by the collection). */
  _bindSheet(sheet?: Worksheet): void { this._sheet = sheet; }
  bindData(data: GeneralSlicerData | null, columnName: string): void {
    this.slicerData = data;
    this.columnNameValue = columnName;
    if (this.customProps.captionName === undefined || this.customProps.captionName === '') this.customProps.captionName = columnName;
    this.customProps.slicerCacheName = this.nameInFormula();
  }
  captionName(value?: string, shouldCallback?: boolean): string | this { return this.opt('captionName', value, shouldCallback); }
  columnCount(value?: number, shouldCallback?: boolean): number | this {
    return this.opt('columnCount', value === undefined ? undefined : Math.max(1, Number(value) || 1), shouldCallback);
  }
  itemHeight(value?: number, shouldCallback?: boolean): number | this {
    return this.opt('itemHeight', value === undefined ? undefined : Math.max(1, Number(value) || 1), shouldCallback);
  }
  showHeader(value?: boolean, shouldCallback?: boolean): boolean | this { return this.opt('showHeader', value, shouldCallback); }
  sortState(value?: number): number | this { return this.opt('sortState', value); }
  showNoDataItems(value?: boolean): boolean | this { return this.opt('showNoDataItems', value); }
  showNoDataItemsInLast(value?: boolean): boolean | this { return this.opt('showNoDataItemsInLast', value); }
  visuallyNoDataItems(value?: boolean): boolean | this { return this.opt('visuallyNoDataItems', value); }
  multiSelect(value?: boolean): boolean | this { return this.opt('multiSelect', value); }
  /** Trial parity: alt/canPrint setters also raise SlicerChanged. */
  override alt(value?: string): string | undefined | this { return this.opt('alt', value); }
  canPrint(value?: boolean): boolean | this { return this.opt('canPrint', value); }

  disableResizingAndMoving(value?: boolean, shouldCallback?: boolean): boolean | this {
    if (value === undefined) return this.customProps.disableResizingAndMoving as boolean;
    this.allowMove(!value, false);
    this.allowResize(!value, false);
    this.customProps.disableResizingAndMoving = value;
    this._sheet?._view()?.schedule();
    if (shouldCallback !== false) { this.emit('allowMove'); this.emit('allowResize'); this.emit('disableResizingAndMoving'); }
    return this;
  }

  override name(value?: string, shouldCallback?: boolean): string | this {
    if (value === undefined) return super.name() as string;
    const previous = super.name() as string;
    (this._sheet as unknown as { slicers?: { _rename(old: string, next: string): void } })?.slicers?._rename(previous, value);
    super.name(value);
    if (shouldCallback !== false) this.emit('name');
    return this;
  }

  override isLocked(value?: boolean): boolean | this {
    if (value === undefined) return super.isLocked() as boolean;
    super.isLocked(value);
    this.emit('isLocked');
    return this;
  }

  override isSelected(value?: boolean): boolean | this {
    if (value === undefined) return super.isSelected() as boolean;
    if (super.isSelected() === value) return this;
    super.isSelected(value);
    this.emit('isSelected');
    return this;
  }

  override isVisible(value?: boolean): boolean | this {
    if (value === undefined) return super.isVisible() as boolean;
    super.isVisible(value);
    this.emit('isVisible');
    return this;
  }

  override allowMove(value?: boolean, shouldCallback?: boolean): boolean | this {
    return this.coord('allowMove', value, shouldCallback, (v) => super.allowMove(v)) as boolean | this;
  }
  override allowResize(value?: boolean, shouldCallback?: boolean): boolean | this {
    return this.coord('allowResize', value, shouldCallback, (v) => super.allowResize(v)) as boolean | this;
  }
  override dynamicMove(value?: boolean, shouldCallback?: boolean): boolean | this {
    return this.coord('dynamicMove', value, shouldCallback, (v) => super.dynamicMove(v)) as boolean | this;
  }
  override dynamicSize(value?: boolean, shouldCallback?: boolean): boolean | this {
    return this.coord('dynamicSize', value, shouldCallback, (v) => super.dynamicSize(v)) as boolean | this;
  }
  override x(value?: number, shouldCallback?: boolean): number | this { return this.coord('x', value, shouldCallback, (v) => super.x(v)) as number | this; }
  override y(value?: number, shouldCallback?: boolean): number | this { return this.coord('y', value, shouldCallback, (v) => super.y(v)) as number | this; }
  override width(value?: number, shouldCallback?: boolean): number | this {
    return this.coord('width', value, shouldCallback, (v) => super.width(v)) as number | this;
  }
  override height(value?: number, shouldCallback?: boolean): number | this {
    return this.coord('height', value, shouldCallback, (v) => super.height(v)) as number | this;
  }

  private coord(key: string, value: number | boolean | undefined, shouldCallback: boolean | undefined, base: (v?: never) => unknown): unknown {
    if (value === undefined) return base.call(this);
    base.call(this, value as never);
    if (shouldCallback !== false) this.emit(key);
    return this;
  }

  override startRow(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('startRow', value, shouldCallback, (v) => super.startRow(v));
  }
  override startColumn(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('startColumn', value, shouldCallback, (v) => super.startColumn(v));
  }
  override startRowOffset(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('startRowOffset', value, shouldCallback, (v) => super.startRowOffset(v));
  }
  override startColumnOffset(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('startColumnOffset', value, shouldCallback, (v) => super.startColumnOffset(v));
  }
  override endRow(value?: number, shouldCallback?: boolean): number | this { return this.anchor('endRow', value, shouldCallback, (v) => super.endRow(v)); }
  override endColumn(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('endColumn', value, shouldCallback, (v) => super.endColumn(v));
  }
  override endRowOffset(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('endRowOffset', value, shouldCallback, (v) => super.endRowOffset(v));
  }
  override endColumnOffset(value?: number, shouldCallback?: boolean): number | this {
    return this.anchor('endColumnOffset', value, shouldCallback, (v) => super.endColumnOffset(v));
  }

  private anchor(key: string, value: number | undefined, shouldCallback: boolean | undefined, base: (v?: number) => unknown): number | this {
    if (value === undefined) return Number(base.call(this, undefined));
    base.call(this, Math.max(0, Math.floor(Number(value) || 0)));
    if (shouldCallback !== false) this.emit(key);
    return this;
  }

  position(value?: Point): Point | this {
    if (value === undefined) return new Point(Number(this.x()), Number(this.y()));
    this.x(Number(value.x), false);
    this.y(Number(value.y), false);
    // The trial reports position changes as separate x / y property events.
    this.emit('x');
    this.emit('y');
    return this;
  }

  columnName(): string { return this.columnNameValue; }
  sourceName(): string { return this.columnNameValue; }
  nameInFormula(): string { return `TableSlicer_${this.columnNameValue}`; }

  style(value?: string | SlicerStyle, shouldCallback?: boolean): SlicerStyle | this {
    if (value === undefined) return this.resolvedStyle();
    if (typeof value === 'string') {
      this.styleObject = null;
      this.customProps.style = value;
    } else {
      const styleName = value.name();
      this.styleObject = value;
      if (typeof styleName === 'string' && styleName) this.customProps.style = styleName;
    }
    this._sheet?._view()?.schedule();
    if (shouldCallback !== false) this.emit('style');
    return this;
  }

  getStyleName(): string | undefined { return this.customProps.style as string | undefined; }

  resolvedStyle(): SlicerStyle {
    if (this.styleObject) return this.styleObject;
    const name = String(this.customProps.style ?? DEFAULT_SLICER_STYLE);
    const custom = (this._sheet?.parent as { customSlicerThemes?: { get(n: string): SlicerStyle | undefined } } | undefined)?.customSlicerThemes?.get?.(name);
    return custom ?? builtInSlicerStyle(name) ?? builtInSlicerStyle(DEFAULT_SLICER_STYLE)!;
  }

  refresh(): void {
    this.slicerData?.refresh();
    this._sheet?._view()?.schedule();
  }

  /** Public item list (trial: every exclusive value, text-ascending, unaffected by the flags). */
  getItems(): SlicerItem[] { return slicerItems(this, true); }
  /** Items actually rendered in the list (sortState order, no-data hidden/moved-last per flags). */
  getVisibleItems(): SlicerItem[] { return slicerItems(this, false); }

  toImageSrc(): string { return this._imageSrc(false); }
  toImageSrcAsync(): Promise<string> { return Promise.resolve(this._imageSrc(false)); }
  _imageSrc(force: boolean): string { return imageSource(this, force); }

  /** Paints/updates the DOM layer for this slicer (called by the renderer hook). */
  _renderSlicer(view: WorkbookRenderer): void { renderSlicerView(this, view); }
  /** Draw this slicer into an arbitrary context (live canvas or toImageSrc). */
  _paintInto(ctx: CanvasRenderingContext2D, zoom: number, dpr = 1): void { paintSlicerInto(this, ctx, zoom, dpr); }
  /** Internal access to the floating-object props (serialisation helpers). */
  propsValue(): JsonRecord { return this.props; }

  /** View state consumed by the painter (kept on the instance for cheap diffs). */
  viewState = { hoverItem: -1, hoverIcon: 'none' as 'none' | 'multi' | 'clear', first: 0, signature: '' };

  override toJSON(): JsonRecord { return slicerToJson(this); }

  override fromJSON(json: JsonRecord): void { slicerFromJson(this, json); }
}
