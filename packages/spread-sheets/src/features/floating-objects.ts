import type { Worksheet } from '../worksheet.js';
import type { WorkbookRenderer } from '../rendering.js';
import { resolveColor } from '../colors.js';
import type { JsonRecord } from '../serialization.js';
import { Events } from '../events.js';
const defaults: JsonRecord = { isSelected: false, isLocked: true, dynamicMove: true, dynamicSize: true, allowMove: true, allowResize: true, isVisible: true, fixedPosition: false };
export class FloatingObject {
  typeName = '0';
  protected props: JsonRecord;
  _sheet?: Worksheet;
  protected element?: HTMLElement;
  private contentElement?: HTMLElement | SVGElement;
  private origin?: { row: number; col: number; dx: number; dy: number; endRow: number; endCol: number; endDx: number; endDy: number };
  constructor(name?: string, x = 0, y = 0, width = 100, height = 100) {
    if (name !== undefined && !name) throw new Error('Empty name.');
    this.props = { ...defaults, ...(name === undefined ? {} : { name }), x, y, width, height };
  }
  protected property(key: string, value?: unknown): unknown {
    if (value === undefined) return this.props[key];
    if (['x', 'y', 'width', 'height'].includes(key) && (!Number.isFinite(value) || Number(value) < 0)) throw new RangeError(`Invalid floating object ${key}`);
    this.props[key] = value;
    if (['x', 'y', 'width', 'height'].includes(key)) this.origin = undefined;
    this._sheet?._view()?.schedule(); return this;
  }
  name(value?: string): unknown { if (value !== undefined && !value) throw new Error('Empty name.'); return this.property('name', value); }
  x(value?: number): unknown { return this.property('x', value); }
  y(value?: number): unknown { return this.property('y', value); }
  width(value?: number): unknown { return this.property('width', value); }
  height(value?: number): unknown { return this.property('height', value); }
  allowMove(value?: boolean): unknown { return this.property('allowMove', value); }
  allowResize(value?: boolean): unknown { return this.property('allowResize', value); }
  /** Alternative text; unset answers the empty string, exactly like the trial. */
  alt(value?: string): unknown {
    if (value === undefined) return this.props.alt === undefined ? '' : this.props.alt;
    return this.property('alt', value);
  }
  dynamicMove(value?: boolean): unknown {
    if (value === undefined) return this.props.dynamicMove;
    // Disabling move also disables size-following (trial rule); enabling move does not re-enable it.
    if (value === false) this.props.dynamicSize = false;
    return this.property('dynamicMove', value);
  }
  dynamicSize(value?: boolean): unknown {
    if (value === undefined) return this.props.dynamicSize;
    // A shape cannot stretch with the cells while it does not move with them (trial rule).
    if (value === true && this.props.dynamicMove !== true) return this;
    return this.property('dynamicSize', value);
  }
  fixedPosition(value?: boolean): unknown { return this.property('fixedPosition', value); }
  isLocked(value?: boolean): unknown { return this.property('isLocked', value); }
  isSelected(value?: boolean): unknown {
    if (value === undefined) return this.props.isSelected;
    const previous = this.props.isSelected;
    this.property('isSelected', value);
    if (previous !== value) this._sheet?._emit(Events.FloatingObjectSelectionChanged, { sheet: this._sheet, floatingObject: this, selectionType: value ? 1 : 0 });
    return this;
  }
  isVisible(value?: boolean): unknown { return this.property('isVisible', value); }
  /** The stored artwork: an HTML node or (for charts) an SVG node, mirroring the reference component. */
  content(value?: HTMLElement | SVGElement): HTMLElement | SVGElement | undefined | this { if (value === undefined) return this.contentElement; this.contentElement = value; this.refreshContent(); return this; }
  cloneContent(): HTMLElement { return this.contentElement?.cloneNode(true) as HTMLElement ?? document.createElement('div'); }
  getHost(): HTMLElement[] { return this.element ? [this.element] : []; }
  refreshContent(): void { if (this.element) { this.element.querySelector('.opensheets-floating-content')?.replaceChildren(...(this.contentElement ? [this.contentElement] : [])); } this._sheet?._view()?.schedule(); }
  /** Captures the row/column anchors against the current layout (called when the object is added to a sheet so later row/column resizes move/resize it like the trial). */
  _captureAnchors(): void { if (this._sheet) this.anchors(); }
  /** Internal anchor snapshot (used by the slicer serialisation). */
  _anchors(): NonNullable<FloatingObject['origin']> { return this.anchors(); }
  _setAnchors(value: NonNullable<FloatingObject['origin']>): void { this.origin = value; }
  private anchors() {
    const rows = this._sheet?._rowLayout(), cols = this._sheet?._columnLayout();
    if (!this.origin) {
      const x = Number(this.x()), y = Number(this.y()), endX = x + Number(this.width()), endY = y + Number(this.height());
      const row = rows?.indexAtOffset(y) ?? Math.floor(y / 20), col = cols?.indexAtOffset(x) ?? Math.floor(x / 62), endRow = rows?.indexAtOffset(endY) ?? Math.floor(endY / 20), endCol = cols?.indexAtOffset(endX) ?? Math.floor(endX / 62);
      this.origin = { row, col, dx: x - (cols?.prefixSum(col) ?? col * 62), dy: y - (rows?.prefixSum(row) ?? row * 20), endRow, endCol, endDx: endX - (cols?.prefixSum(endCol) ?? endCol * 62), endDy: endY - (rows?.prefixSum(endRow) ?? endRow * 20) };
    }
    return this.origin;
  }
  private anchorProperty(key: keyof NonNullable<FloatingObject['origin']>, value?: number): unknown { const anchor = this.anchors(); if (value === undefined) return anchor[key]; anchor[key] = value; const rows = this._sheet?._rowLayout(), cols = this._sheet?._columnLayout(); this.props.x = (cols?.prefixSum(anchor.col) ?? anchor.col * 62) + anchor.dx; this.props.y = (rows?.prefixSum(anchor.row) ?? anchor.row * 20) + anchor.dy; this.props.width = (cols?.prefixSum(anchor.endCol) ?? anchor.endCol * 62) + anchor.endDx - Number(this.props.x); this.props.height = (rows?.prefixSum(anchor.endRow) ?? anchor.endRow * 20) + anchor.endDy - Number(this.props.y); this._sheet?._view()?.schedule(); return this; }
  startRow(value?: number): unknown { return this.anchorProperty('row', value); }
  startColumn(value?: number): unknown { return this.anchorProperty('col', value); }
  startRowOffset(value?: number): unknown { return this.anchorProperty('dy', value); }
  startColumnOffset(value?: number): unknown { return this.anchorProperty('dx', value); }
  endRow(value?: number): unknown { return this.anchorProperty('endRow', value); }
  endColumn(value?: number): unknown { return this.anchorProperty('endCol', value); }
  endRowOffset(value?: number): unknown { return this.anchorProperty('endDy', value); }
  endColumnOffset(value?: number): unknown { return this.anchorProperty('endDx', value); }
  _render(view: WorkbookRenderer, layer: HTMLElement, zIndex: number): void {
    if (!this.element) {
      this.element = document.createElement('div'); this.element.className = 'opensheets-floating-object'; this.element.tabIndex = 0;
      const content = document.createElement('div'); content.className = 'opensheets-floating-content'; this.element.append(content);
      if (this.contentElement) content.append(this.contentElement);
      for (const dir of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']) { const handle = document.createElement('div'); handle.className = `opensheets-floating-handle handle-${dir}`; handle.dataset.direction = dir; this.element.append(handle); }
      this.element.addEventListener('pointerdown', event => {
        if (event.button === 2) {
          // Right-click selects the object like the trial so the context menu applies to it.
          if (!event.ctrlKey) for (const item of [...view.sheet!.floatingObjects.all(), ...view.sheet!.pictures.all(), ...(view.sheet!.shapes?.all() ?? []), ...view.sheet!.charts.all(), ...(view.sheet!.dataCharts?.all() ?? [])]) if (item !== this) item.isSelected(false);
          if (!event.ctrlKey) for (const slicer of view.sheet!.slicers?.all() ?? []) slicer.isSelected(false);
          this.isSelected(true);
          return;
        }
        const protection = this._sheet?.options.protectionOptions as { allowEditObjects?: boolean } | undefined;
        const objectEditBlocked = !!this._sheet?.options.isProtected && (protection?.allowEditObjects !== true || this.isLocked());
        if (event.button !== 0 || objectEditBlocked) return;
        event.stopPropagation(); const element = this.element!; element.focus(); element.setPointerCapture(event.pointerId);
        if (!event.ctrlKey) for (const item of [...view.sheet!.floatingObjects.all(), ...view.sheet!.pictures.all(), ...(view.sheet!.shapes?.all() ?? []), ...view.sheet!.charts.all(), ...(view.sheet!.dataCharts?.all() ?? [])]) if (item !== this) item.isSelected(false);
        if (!event.ctrlKey) for (const slicer of view.sheet!.slicers?.all() ?? []) slicer.isSelected(false);
        this.isSelected(true);
        const dir = (event.target as HTMLElement).dataset.direction;
        const start = { x: event.clientX, y: event.clientY, left: Number(this.x()), top: Number(this.y()), width: Number(this.width()), height: Number(this.height()) };
        const move = (e: PointerEvent) => { const dx = (e.clientX - start.x) / view.zoom, dy = (e.clientY - start.y) / view.zoom;
          if (dir && this.allowResize()) { if (dir.includes('e')) this.width(Math.max(1, start.width + dx)); if (dir.includes('s')) this.height(Math.max(1, start.height + dy)); if (dir.includes('w')) { this.x(Math.max(0, start.left + dx)); this.width(Math.max(1, start.width - dx)); } if (dir.includes('n')) { this.y(Math.max(0, start.top + dy)); this.height(Math.max(1, start.height - dy)); } }
          else if (this.allowMove()) { this.x(Math.max(0, start.left + dx)); this.y(Math.max(0, start.top + dy)); }
        };
        const up = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); this._sheet?._emit(dir ? Events.FloatingObjectChanged : Events.FloatingObjectChanged, { sheet: this._sheet, floatingObject: this, propertyName: dir ? 'size' : 'position' }); };
        element.addEventListener('pointermove', move); element.addEventListener('pointerup', up);
      });
      this.element.addEventListener('keydown', e => { if (e.key === 'Escape') { this.isSelected(false); view.root.focus(); } if (e.key === 'Delete') { this._sheet?.floatingObjects.remove(String(this.name())); this._sheet?.pictures.remove(String(this.name())); this._sheet?.shapes?.remove(String(this.name())); this._sheet?.charts.remove(String(this.name())); this._sheet?.dataCharts?.remove(String(this.name())); } });
    }
    if (this.element.parentElement !== layer) layer.append(this.element);
    const a = this.anchors(), rows = this._sheet!._rowLayout(), cols = this._sheet!._columnLayout();
    const left = this.dynamicMove() ? cols.prefixSum(a.col) + a.dx : Number(this.x()), top = this.dynamicMove() ? rows.prefixSum(a.row) + a.dy : Number(this.y());
    const width = this.dynamicSize() ? Math.max(0, cols.prefixSum(a.endCol) + a.endDx - left) : Number(this.width());
    const height = this.dynamicSize() ? Math.max(0, rows.prefixSum(a.endRow) + a.endDy - top) : Number(this.height());
    // Report the anchored geometry through the public accessors too (the trial does:
    // after setRowHeight the shape's height() reads back the resized height).
    this.props.x = left; this.props.y = top; this.props.width = width; this.props.height = height;
    Object.assign(this.element.style, { display: this.isVisible() ? '' : 'none', left: `${view.headerWidth + (left - (this.fixedPosition() ? 0 : view.scrollX)) * view.zoom}px`, top: `${view.headerHeight + (top - (this.fixedPosition() ? 0 : view.scrollY)) * view.zoom}px`, width: `${Math.max(1, width) * view.zoom}px`, height: `${Math.max(1, height) * view.zoom}px`, zIndex: String(zIndex) });
    this.element.classList.toggle('selected', !!this.isSelected()); this.element.classList.toggle('resizable', !!this.allowResize()); this.element.setAttribute('aria-label', String(this.alt() ?? this.name()));
    if (this instanceof Picture) this._paintImage(this.element.querySelector<HTMLElement>('.opensheets-floating-content')!);
  }
  _dispose(): void { this.element?.remove(); this.element = undefined; }
  toJSON(): JsonRecord {
    const a = this.anchors();
    const result: JsonRecord = { typeName: this.typeName, name: this.name(), x: this.x(), y: this.y(), width: this.width(), height: this.height(), startRow: a.row, startColumn: a.col, endRow: a.endRow, endColumn: a.endCol, content: this.contentElement?.outerHTML ?? '' };
    for (const [key, value] of Object.entries({ startRowOffset: a.dy, startColumnOffset: a.dx, endRowOffset: a.endDy, endColumnOffset: a.endDx })) if (value) result[key] = value;
    for (const [key, value] of Object.entries(this.props)) if (key in defaults && value !== defaults[key]) result[key] = value;
    return result;
  }
  fromJSON(json: JsonRecord): void { for (const key of Object.keys(this.props)) if (json[key] !== undefined) this.props[key] = json[key]; this.origin = json.startRow !== undefined && json.endRow !== undefined && json.startColumn !== undefined && json.endColumn !== undefined ? { row: Number(json.startRow), col: Number(json.startColumn), dx: Number(json.startColumnOffset ?? 0), dy: Number(json.startRowOffset ?? 0), endRow: Number(json.endRow), endCol: Number(json.endColumn), endDx: Number(json.endColumnOffset ?? 0), endDy: Number(json.endRowOffset ?? 0) } : undefined; if (json.content && typeof document !== 'undefined') { const template = document.createElement('template'); template.innerHTML = String(json.content); this.contentElement = template.content.firstElementChild as HTMLElement; } }
}
export class Picture extends FloatingObject {
  override typeName = '1';
  private image?: HTMLImageElement;
  constructor(name: string, src: string, x = 0, y = 0, width = 100, height = 100) { super(name, x, y, width, height); Object.assign(this.props, { src, backColor: undefined, borderColor: undefined, borderWidth: 1, borderStyle: 'none', borderRadius: -1, pictureStretch: 0 }); }
  src(value?: string): unknown { return this.property('src', value); }
  backColor(value?: string): unknown { return this.property('backColor', value); }
  borderColor(value?: string): unknown { return this.property('borderColor', value); }
  borderWidth(value?: number): unknown { return this.property('borderWidth', value); }
  borderStyle(value?: string): unknown { return this.property('borderStyle', value); }
  borderRadius(value?: number): unknown { return this.property('borderRadius', value); }
  pictureStretch(value?: number): unknown { return this.property('pictureStretch', value); }
  getOriginalHeight(): number { return this.image?.naturalHeight ?? 0; }
  getOriginalWidth(): number { return this.image?.naturalWidth ?? 0; }
  _paintImage(host: HTMLElement): void { if (!this.image) { this.image = document.createElement('img'); host.append(this.image); } if (this.image.getAttribute('src') !== this.src()) this.image.src = String(this.src()); Object.assign(this.image.style, { width: '100%', height: '100%', objectFit: this.pictureStretch() === 1 ? 'contain' : this.pictureStretch() === 3 ? 'none' : 'fill', boxSizing: 'border-box', border: `${this.borderWidth()}px ${this.borderStyle()} ${resolveColor(String(this.borderColor() ?? 'transparent'))}`, borderRadius: `${this.borderRadius()}px`, background: resolveColor(String(this.backColor() ?? 'transparent')) }); this.image.draggable = false; }
  override toJSON(): JsonRecord {
    const result = super.toJSON(); delete result.content; result.src = this.src();
    result.isTakeOriginalSize = false; result.originalHeight = this.image?.naturalHeight || null; result.originalWidth = this.image?.naturalWidth || null;
    const pictureDefaults: JsonRecord = { borderWidth: 1, borderStyle: 'none', borderRadius: -1, pictureStretch: 0 };
    for (const key of ['backColor', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'pictureStretch']) if (this.props[key] !== undefined && this.props[key] !== pictureDefaults[key]) result[key] = this.props[key];
    return result;
  }
}
export class FloatingObjectCollection {
  private items: FloatingObject[] = [];
  constructor(private sheet?: Worksheet, private typeName = '0') {}
  add(objectOrName: FloatingObject | string, src?: string, x?: number, y?: number, width?: number, height?: number): FloatingObject {
    const item = typeof objectOrName === 'string' ? new Picture(objectOrName, src ?? '', x, y, width, height) : objectOrName;
    if (this.get(String(item.name()))) throw new Error('Floating object name already exists');
    item._sheet = this.sheet; item._captureAnchors(); this.items.push(item); this.sheet?._view()?.schedule(); return item;
  }
  all(): FloatingObject[] { return [...this.items]; }
  get(name: string): FloatingObject | undefined { return this.items.find(item => item.name() === name); }
  remove(name: string): void { const item = this.get(name); item?._dispose(); this.items = this.items.filter(item => item.name() !== name); this.sheet?._view()?.schedule(); }
  clear(): void { this.items.forEach(item => item._dispose()); this.items = []; this.sheet?._view()?.schedule(); }
  zIndex(name: string, zIndex?: number): unknown { const item = this.get(name); if (!item) return -1; if (zIndex === undefined) return 700 + this.items.indexOf(item); this.items.splice(this.items.indexOf(item), 1); this.items.splice(Math.max(0, Math.min(this.items.length, zIndex)), 0, item); this.sheet?._view()?.schedule(); return this; }
  _fromJSON(json: JsonRecord[]): void { this.clear(); for (const data of json) { if (String(data.typeName) !== this.typeName) continue; const item = this.typeName === '1' ? new Picture(String(data.name), String(data.src ?? ''), Number(data.x), Number(data.y), Number(data.width), Number(data.height)) : new FloatingObject(String(data.name), Number(data.x), Number(data.y), Number(data.width), Number(data.height)); item.fromJSON(data); this.add(item); } }
}
