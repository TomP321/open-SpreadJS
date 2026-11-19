/**
 * The right-docked "PivotTable Fields" panel of the designer (TASK 47 item 2)
 * and its field-settings popup menu. The panel body is the core
 * `GC.Spread.Pivot.PivotPanel` (fields list with checkboxes, the four drag
 * areas, Defer Layout Update and Views); this shell provides the trial's dock
 * wrapper, the title-bar close button and the chevron menu (Move …, Remove
 * Field, Field/Value Field Settings…) over the panel's own DOM.
 */
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import type { DesignerApi } from './designer-api.js';
import { activePivot, pivotPanelTable, type PivotTable } from './pivot-designer.js';
import { placeMenu } from './menu-placement.js';
import { pivotNamespace } from './core-internals.js';

interface PivotPanelLike {
  attach(pivotTable: PivotTable): void;
  destroy(): void;
  _element(): HTMLElement | null;
}
type PivotPanelCtor = new (name: string, pivotTable: PivotTable, host: HTMLElement) => PivotPanelLike;

function panelCtor(d: DesignerApi): PivotPanelCtor | null {
  // The built-in field-list panel is mounted by the pivot add-on; the designer's
  // core contract types its `host` as `HTMLDivElement` while we pass the panel
  // host `<div>`, so widen through `unknown` before applying our own ctor shape.
  const panel: unknown = pivotNamespace(d.gc).PivotPanel;
  return (panel as PivotPanelCtor | undefined) ?? null;
}

/** The panel item-menu items, in the trial's order (separators after the
 *  Move group and after the area group; the value-field last row differs). */
export function pivotItemMenuItems(isValue: boolean): { text: string; command: string; separator?: boolean }[] {
  const items: { text: string; command: string; separator?: boolean }[] = [
    { text: 'Move Up', command: 'pivotItemMoveUp' },
    { text: 'Move Down', command: 'pivotItemMoveDown' },
    { text: 'Move to Beginning', command: 'pivotItemMoveBeginning' },
    { text: 'Move to End', command: 'pivotItemMoveEnd' },
    { text: 'Move to Report Filter', command: 'pivotItemToFilter', separator: true },
    { text: 'Move to Row Labels', command: 'pivotItemToRows' },
    { text: 'Move to Column Labels', command: 'pivotItemToColumns' },
    { text: 'Move to Values', command: 'pivotItemToValues' },
    { text: 'Remove Field', command: 'pivotItemRemove', separator: true },
  ];
  items.push(isValue
    ? { text: 'Value Field Settings...', command: 'pivotItemValueSettings' }
    : { text: 'Field Settings...', command: 'pivotItemFieldSettings' });
  return items;
}

export function PivotFieldListPanel(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const hostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<PivotPanelLike | null>(null);
  const pivot = pivotPanelTable(d);
  const pivotName = pivot?.name() ?? '';
  useEffect(() => {
    const host = hostRef.current;
    const Ctor = panelCtor(d);
    if (!host || !Ctor || !pivot) return;
    if (!panelRef.current) panelRef.current = new Ctor('pivotFieldList', pivot, host);
    else panelRef.current.attach(pivot);
    wireItemMenus(d, host);
  }, [d, pivot, pivotName]);
  const close = (): void => {
    d._pivotFieldListOpen = false;
    d._pivotFieldListName = null;
    d.invalidate();
  };
  // Trial behaviour: after the first open the panel stays mounted and is only hidden.
  return (
    <div className="gc-designer-pivot-table-fields gc-designer-panel gc-designer-dock-panel" style={d.pivotFieldListOpen ? undefined : { display: 'none' }}>
      <div className="gc-designer-pivot-table-fields-host" ref={hostRef} />
      <button className="gc-designer-panel-dialog-close-button-container" aria-label="Close" onClick={close}>
        <span className="gc-designer-panel-dialog-close-button-image">×</span>
      </button>
    </div>
  );
}

/* The chevrons of the core panel (`.gc-panel-field-area-list-item-dropdown` /
 * `.gc-panel-field-dropdown`) open the trial's field-settings menu; clicking
 * the item body of the list keeps the core checkbox/drag behaviour untouched. */

function wireItemMenus(d: DesignerApi, root: HTMLElement): void {
  if (root.dataset.pivotMenuWired) return;
  root.dataset.pivotMenuWired = '1';
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const chevron = target.closest<HTMLElement>('.gc-panel-field-area-list-item-dropdown, .gc-panel-field-dropdown');
    if (!chevron) return;
    event.preventDefault();
    event.stopPropagation();
    const item = chevron.closest<HTMLElement>('.gc-panel-area-item, .gc-panel-all-field-item');
    if (!item) return;
    const name = item.dataset.displayname ?? item.dataset.name ?? '';
    if (!name) return;
    const rect = chevron.getBoundingClientRect();
    d._pivotItemMenu = { fieldName: name, x: rect.left, y: rect.bottom + 2, nonce: (d._pivotItemMenu?.nonce ?? 0) + 1 };
    d.invalidate();
  });
}

/** The field-list chevron menu (rendered by app.tsx while `_pivotItemMenu`). */
export function PivotItemMenu(): React.ReactElement | null {
  const d = useDesigner();
  useDesignerVersion();
  const open = d._pivotItemMenu;
  const menuRef = useRef<HTMLDivElement>(null);
  // Any click outside the menu dismisses it (trial behaviour).
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return; // menu items handle it themselves
      if (!d._pivotItemMenu) return;
      d._pivotItemMenu = null;
      d.invalidate();
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [d, open]);
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element || !open) return;
    const bounds = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, minTop: 44 };
    const place = placeMenu(open.x, open.y, element.offsetWidth, element.offsetHeight, bounds);
    element.style.left = `${place.left}px`;
    element.style.top = `${place.top}px`;
  }, [open?.x, open?.y, open?.nonce, open]);
  if (!open) return null;
  const pivot = pivotPanelTable(d) ?? activePivot(d);
  const info = pivot?.getField(open.fieldName);
  if (!pivot || !info) return null;
  const isValue = info.pivotArea === 3;
  const siblings = pivot.getFieldsByArea(info.pivotArea as never).sort((a, b) => (a.pivotIndex ?? 0) - (b.pivotIndex ?? 0));
  const position = siblings.findIndex((f) => f.fieldName === open.fieldName);
  const enabled: Record<string, boolean> = {
    pivotItemMoveUp: position > 0,
    pivotItemMoveDown: position >= 0 && position < siblings.length - 1,
    pivotItemMoveBeginning: position > 0,
    pivotItemMoveEnd: position >= 0 && position < siblings.length - 1,
    pivotItemToFilter: info.pivotArea !== 0,
    pivotItemToRows: info.pivotArea !== 1,
    pivotItemToColumns: info.pivotArea !== 2,
    pivotItemToValues: info.pivotArea !== 3,
    pivotItemRemove: true,
    pivotItemFieldSettings: !isValue,
    pivotItemValueSettings: isValue,
  };
  const run = (command: string, disabled: boolean): void => {
    if (disabled) { d._pivotItemMenu = null; d.invalidate(); return; }
    d.executeSpecial(command, null); // the command reads the menu target synchronously...
    d._pivotItemMenu = null; // ...then the menu closes (trial behaviour)
    d.invalidate();
  };
  return (
    <div className="gc-designer-pivot-item-menu" role="menu" ref={menuRef} onMouseDown={(event) => event.stopPropagation()}>
      {pivotItemMenuItems(isValue).map((item) => {
        const disabled = !enabled[item.command];
        return (
          <React.Fragment key={item.command}>
            {item.separator && <div className="gc-designer-pivot-item-menu-sep" role="separator" />}
            <div role="menuitem" aria-disabled={disabled} className={`gc-designer-pivot-item-menu-entry${disabled ? ' gc-designer-pivot-item-menu-disabled' : ''}`} onClick={() => run(item.command, disabled)}>
              {item.text}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
