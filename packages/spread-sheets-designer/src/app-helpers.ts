/**
 * Shared helpers and small view-model types for the designer shell components
 * (ribbon, menus, panels, context menu). Extracted from `app.tsx` unchanged;
 * every UI module resolves `Designer` to the structural `DesignerApi` so no
 * component module imports the class file.
 */
import { useEffect, useState } from 'react';
import { useDesigner } from './store.js';
import type { DesignerApi as Designer } from './designer-api.js';
import type { ICommand, IRibbonPanel } from './types.js';
import type { GCRoot } from './core-internals.js';
import { resolveRibbon } from './config.js';
import { resolveText } from './resolve.js';

/**
 * Floating object as the designer's Selection panel and object menus drive it.
 * The contract's `FloatingObject` has the same trio; our core shape objects add
 * the picture extras, so the collections are unified through this view.
 */
export interface SelectableObject {
  name(value?: string): unknown;
  isSelected(value?: boolean): unknown;
  isVisible(value?: boolean): unknown;
}

/** Anything right-clickable/double-clickable in the grid, unified across the four collections. */
export interface HostableObject extends SelectableObject {
  getHost(): HTMLElement[];
  typeName?: string;
  /** The mounted wrapper the core keeps on every floating object (used when `getHost()` throws). */
  element?: HTMLElement;
}

/**
 * Host elements of a floating item, tolerant of the v17+ charts plugin whose `getHost()`
 * throws by contract ("use the legacy-charts plugin"). Those charts still own a mounted
 * `.opensheets-floating-object` wrapper (core `FloatingBase.element`).
 */
export function hostElementsOf(item: HostableObject): HTMLElement[] {
  try {
    return item.getHost();
  } catch {
    return item.element ? [item.element] : [];
  }
}

/** The GC namespace object the core installed globally. */
export function globalGC(): GCRoot | undefined {
  return (globalThis as { GC?: GCRoot }).GC;
}

export const resource = (d: Designer, value: unknown): string => resolveText(value, d.resources);
export function commandOf(d: Designer, name: string): ICommand | undefined {
  return d.getCommand(name) as ICommand | undefined;
}
export function commandText(d: Designer, command: ICommand | undefined, fallback = ''): string {
  if (!command) return fallback;
  const raw = command.text || command.title || fallback;
  return resource(d, raw);
}
export function commandTitle(d: Designer, command: ICommand | undefined, fallback = ''): string {
  if (!command) return fallback;
  return resource(d, command.title || command.text || fallback);
}
export function isBig(d: Designer, command: ICommand | undefined): boolean {
  if (!command) return false;
  if (typeof command.bigButton === 'boolean') return command.bigButton;
  if (typeof command.bigButton === 'string') return command.bigButton.includes('ribbonHeight>toolbarHeight');
  return false;
}
export function currentRibbon(d: Designer): { panels: IRibbonPanel[]; ribbonHeight: number } {
  const ribbon = resolveRibbon(d.getConfig());
  // Contextual tabs (Shape Format, PivotTable Analyze/Design) only exist while their trigger holds.
  const contextual = ribbon.contextualPanels.filter((panel) => (panel.id === 'shapeFormat' ? d.hasSelectedShapes() : d.hasActivePivot()));
  return { panels: [...ribbon.panels, ...contextual], ribbonHeight: ribbon.ribbonHeight };
}

export function useRibbonWidth(): number {
  const d = useDesigner();
  const read = (): number => (typeof d.host.clientWidth === 'number' && d.host.clientWidth > 0 ? d.host.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const [width, setWidth] = useState(read);
  useEffect(() => {
    const update = (): void => setWidth(read());
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(d.host);
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [d]);
  return width;
}

/**
 * Open a ribbon dropdown (TASK 60 item 1).
 *
 * The trial keeps exactly one ribbon popup open, and a press on the control that owns the
 * open popup toggles it CLOSED instead of re-opening it (measured: clicking the collapsed
 * "Cells" group twice leaves nothing open). The dismissal happens on pointerdown, i.e. before
 * the click that would re-open the menu, so the open path must consume the toggle marker the
 * dismissal handler left behind.
 */
export function openRibbonMenu(d: Designer, command: string, anchor: DOMRect, owner: HTMLElement | null): void {
  d._menuOwner = owner;
  if (d._menuToggleClosedByPress) {
    d._menuToggleClosedByPress = false;
    return;
  }
  d.openMenu = { command, anchor, level: 0, nonce: Date.now() + Math.random() };
  d.invalidate();
}

export function columnName(col: number): string {
  let out = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}
