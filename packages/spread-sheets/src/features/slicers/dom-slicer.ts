/**
 * ItemSlicer and DOMTableSlicer: the DOM-hosted slicer variants of the public
 * API. They render the same item list as the canvas slicer (header + buttons)
 * into their own element, driven by the shared GeneralSlicerData model.
 */
import { FloatingObject } from '../floating-objects.js';
import { applySelection, orderedEntries, displayText } from './state.js';
import { resolveSlicerColor } from './styles.js';
import type { SlicerStyle } from './styles.js';
import type { GeneralSlicerData } from './general-data.js';
import type { Table } from '../tables.js';
import type { ISlicerFilteredData, ISlicerListener } from './types.js';
import { SLICER_BLANK_TEXT, slicerBlankLabel } from './types.js';
import { GC } from '../../generated/enums.js';

const SortState = GC.Spread.Sheets.SortState;

export class ItemSlicer implements ISlicerListener {
  private props: Record<string, unknown>;
  private element: HTMLElement | null = null;
  private rendered = false;
  constructor(private slicerName: string, public slicerData: GeneralSlicerData | null, public columnName: string) {
    this.props = {
      captionName: columnName, columnCount: 1, itemHeight: 21, width: 180, height: 210,
      showHeader: true, sortState: SortState.ascending, showNoDataItems: true,
      showNoDataItemsInLast: true, visuallyNoDataItems: true, style: 'SlicerStyleLight1',
    };
    slicerData?.attachListener(this);
  }
  private prop<T>(key: string, value?: T): T | this {
    if (value === undefined) return this.props[key] as T;
    this.props[key] = value;
    this.refreshDOM();
    return this;
  }
  name(value?: string): string | this {
    if (value === undefined) return this.slicerName;
    this.slicerName = value;
    this.refreshDOM();
    return this;
  }
  captionName(value?: string): string | this { return this.prop('captionName', value); }
  columnCount(value?: number): number | this { return this.prop('columnCount', value); }
  itemHeight(value?: number): number | this { return this.prop('itemHeight', value); }
  width(value?: number): number | this { return this.prop('width', value); }
  height(value?: number): number | this { return this.prop('height', value); }
  showHeader(value?: boolean): boolean | this { return this.prop('showHeader', value); }
  sortState(value?: number): number | this { return this.prop('sortState', value); }
  showNoDataItems(value?: boolean): boolean | this { return this.prop('showNoDataItems', value); }
  showNoDataItemsInLast(value?: boolean): boolean | this { return this.prop('showNoDataItemsInLast', value); }
  visuallyNoDataItems(value?: boolean): boolean | this { return this.prop('visuallyNoDataItems', value); }
  style(value?: string | SlicerStyle): string | SlicerStyle | this { return this.prop('style', value); }
  getStyleName(): string | undefined { return this.props.style as string; }
  isLocked(): boolean { return false; }
  disableResizingAndMoving(): boolean { return false; }
  zoomFactor(): number { return 1; }
  getDOMElement(): HTMLElement {
    if (!this.element && typeof document !== 'undefined') {
      this.element = document.createElement('div');
      this.element.className = 'gc-slicer-container';
    }
    this.refreshDOM();
    return this.element!;
  }
  /** ISlicerListener surface (the data model calls these on changes). */
  onFiltered(_data: ISlicerFilteredData): void { this.refreshDOM(); }
  onDataChanged(): void { this.refreshDOM(); }
  onRowsChanged(): void { this.refreshDOM(); }
  onColumnNameChanged(_oldName: string, _newName: string): void { this.refreshDOM(); }
  onColumnRemoved(): void { this.slicerData = null; }
  onPropertyChanged(): void { this.refreshDOM(); }
  destroy(): void { this.slicerData?.detachListener(this); this.element?.remove(); }

  private refreshDOM(): void {
    if (!this.element || !this.slicerData) { this.rendered = false; return; }
    if (typeof this.element.querySelector !== 'function') return;
    const entries = orderedEntries({ slicerData: this.slicerData, columnName: () => this.columnName,
      sortState: () => this.props.sortState, showNoDataItems: () => this.props.showNoDataItems,
      showNoDataItemsInLast: () => this.props.showNoDataItemsInLast !== false } as never, false);
    const selected = this.slicerData.getSelectedIndexes?.(this.columnName) ?? null;
    const header = String(this.props.captionName ?? this.columnName);
    const itemHeight = Number(this.props.itemHeight ?? 21) + 6;
    const rows = entries.map((entry: { index: number; text: string }, position: number) => {
      const isSelected = selected === null ? true : selected.includes(entry.index);
      const background = isSelected ? resolveSlicerColor('Accent 1 60') : '#FFFFFF';
      const border = isSelected ? '#999999' : '#CCCCCC';
      return `<div class="gc-slicer-item" data-index="${entry.index}" style="position:absolute;left:6px;right:6px;`
        + `top:${Number(this.props.showHeader !== false ? 27 : 2) + position * itemHeight}px;height:${itemHeight - 3}px;`
        + `background:${background};border:1px solid ${border};border-radius:2px;box-sizing:border-box;`
        + `font:normal 11pt Calibri;color:#000;line-height:${itemHeight - 1}px;padding-left:4px;overflow:hidden;`
        + `white-space:nowrap;text-overflow:ellipsis">${entry.text === '' || entry.text === SLICER_BLANK_TEXT ? slicerBlankLabel() : displayText(entry.text)}</div>`;
    }).join('');
    const headerHtml = this.props.showHeader === false ? ''
      : `<div class="gc-slicer-header" style="position:absolute;left:0;right:0;top:0;height:26px;font:bold 11pt Calibri;`
        + `color:#000;border-bottom:1px solid ${resolveSlicerColor('Accent 1')};line-height:26px;padding-left:6px;`
        + `box-sizing:border-box;overflow:hidden;white-space:nowrap">${header}</div>`;
    this.element.style.position = this.element.style.position || 'relative';
    this.element.style.width = `${Number(this.props.width)}px`;
    this.element.style.height = `${Number(this.props.height)}px`;
    this.element.style.overflow = 'auto';
    this.element.innerHTML = `${headerHtml}<div class="gc-slicer-list" style="position:relative;height:${entries.length * itemHeight}px">${rows}</div>`;
    this.rendered = true;
  }

  /** Trial parity: clicking an item toggles its filter through the data model. */
  handleClick(displayIndex: number): void {
    const entries = orderedEntries({ slicerData: this.slicerData, columnName: () => this.columnName,
      sortState: () => this.props.sortState, showNoDataItems: () => true,
      showNoDataItemsInLast: () => true } as never);
    const entry = entries[displayIndex];
    if (!entry || !this.slicerData) return;
    const current = this.slicerData.getSelectedIndexes(this.columnName);
    const total = this.slicerData.getExclusiveData(this.columnName).length;
    const selection = current ?? entries.map(item => item.index);
    const next = selection.includes(entry.index) ? selection.filter(index => index !== entry.index) : [...selection, entry.index];
    if (!next.length || next.length === total) this.slicerData.doUnfilter(this.columnName);
    else this.slicerData.doFilter(this.columnName, { exclusiveRowIndexes: next.sort((a, b) => a - b) });
  }
  get isRendered(): boolean { return this.rendered; }
}

/**
 * DOMTableSlicer: the table-bound FloatingObject flavour declared by the API.
 * Constructing one binds it to the table column data model; it exposes the
 * same property surface as the canvas `Slicer` for compatibility.
 */
export class DOMTableSlicer extends FloatingObject {
  override typeName = '3';
  private innerProps: Record<string, unknown>;
  constructor(name: string, private table: Table, public columnName: string) {
    super(name, 50, 250, 186, 258);
    this.innerProps = {
      captionName: columnName, columnCount: 1, itemHeight: 21, showHeader: true,
      sortState: SortState.ascending, showNoDataItems: true, showNoDataItemsInLast: true,
      visuallyNoDataItems: true, style: 'SlicerStyleLight1', disableResizingAndMoving: false,
    };
  }
  private prop<T>(key: string, value?: T): T | this {
    if (value === undefined) return this.innerProps[key] as T;
    this.innerProps[key] = value;
    this._sheet?._view()?.schedule();
    return this;
  }
  captionName(value?: string): string | this { return this.prop('captionName', value); }
  columnCount(value?: number): number | this { return this.prop('columnCount', value); }
  disableResizingAndMoving(value?: boolean): boolean | this { return this.prop('disableResizingAndMoving', value); }
  itemHeight(value?: number): number | this { return this.prop('itemHeight', value); }
  override name(value?: string): string | this {
    if (value === undefined) return super.name() as string;
    super.name(value);
    return this;
  }
  showHeader(value?: boolean): boolean | this { return this.prop('showHeader', value); }
  showNoDataItems(value?: boolean): boolean | this { return this.prop('showNoDataItems', value); }
  showNoDataItemsInLast(value?: boolean): boolean | this { return this.prop('showNoDataItemsInLast', value); }
  sortState(value?: number): number | this { return this.prop('sortState', value); }
  style(value?: string | SlicerStyle): string | SlicerStyle | this { return this.prop('style', value); }
  visuallyNoDataItems(value?: boolean): boolean | this { return this.prop('visuallyNoDataItems', value); }
  toImageSrc(): string { return ''; }
  toImageSrcAsync(): Promise<string> { return Promise.resolve(''); }
  getTable(): Table { return this.table; }
}

export { applySelection };
