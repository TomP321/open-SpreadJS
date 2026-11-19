/* The grid/shape/tab right-click menu: placement, the object (shape/chart)
 * menu and the sheet-tab menu with its Tab Color / Tab Position flyouts.
 * The item DATA is built in context-menu-items.ts; this file only renders. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDesigner, useDesignerVersion } from './store.js';
import { shapesOf } from './core-internals.js';
import type GC from '@mescius/spread-sheets';
import { DesignerIcon } from './icons.js';
import { buildContextItems } from './context-menu-items.js';
import { placeMenu, placeSubmenu } from './menu-placement.js';
import { type HostableObject } from './app-helpers.js';
import { tabThemeBases, tabThemeNames, tabThemeTints, tabSwatchColor } from './ribbon/colors.js';

type ContextItem = import('./context-menu-items.js').ContextItem;
export function DesignerContextMenu(): React.ReactElement {
  const d = useDesigner();
  useDesignerVersion();
  const menu = d.contextMenu!;
  const host = d.host.getBoundingClientRect();
  const menuRef = useRef<HTMLDivElement>(null);
  const tabColorRef = useRef<HTMLDivElement>(null);
  const [tabPositionOpen, setTabPositionOpen] = useState(false);
  const [tabColorOpen, setTabColorOpen] = useState(false);
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    // Official placement: open at the pointer, flip left/up when it would overflow and
    // clamp the flipped top to the grid-host top so tall menus are never clipped.
    const bounds = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, minTop: d.sheetHost.getBoundingClientRect().top };
    const place = placeMenu(menu.x, menu.y, element.offsetWidth, element.offsetHeight, bounds);
    element.style.left = `${place.left - host.left}px`;
    element.style.top = `${place.top - host.top}px`;
  }, [menu.x, menu.y, menu.kind, host.left, host.top]);
  useLayoutEffect(() => {
    const element = tabColorRef.current;
    const anchor = element?.offsetParent as HTMLElement | null;
    if (!element || !anchor || !tabColorOpen) return;
    const anchorBox = anchor.getBoundingClientRect();
    const height = element.getBoundingClientRect().height;
    const statusBar = document.querySelector('.gc-statusbar-statusitem-container');
    const bottom = statusBar ? statusBar.getBoundingClientRect().top : window.innerHeight - 22;
    element.style.top = `${Math.min(anchorBox.top - 3, bottom - Math.floor(height)) - anchorBox.top}px`;
  }, [tabColorOpen]);
  const [shapeSub, setShapeSub] = useState<string | null>(null);
  const [subOpen, setSubOpen] = useState<string | null>(null);
  // Submenus use the same placement rule as the main menu (TASK 9): measured, not guessed.
  useLayoutEffect(() => {
    const root = menuRef.current;
    if (!root) return;
    const bounds = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, minTop: d.sheetHost.getBoundingClientRect().top };
    for (const sub of Array.from(root.querySelectorAll<HTMLElement>('.gc-designer-context-submenu:not(.gc-tab-color-menu)'))) {
      const item = sub.offsetParent as HTMLElement | null;
      if (!item) continue;
      const box = item.getBoundingClientRect();
      const place = placeSubmenu(box.right, box.top, sub.offsetWidth, sub.offsetHeight, bounds);
      sub.classList.toggle('gc-designer-context-submenu-left', place.flipLeft);
      // The trial raises the submenu box by its own 1px top border, so the first submenu
      // item lines up with the anchor item's top edge (measured: container 524 vs item 525).
      sub.style.top = `${place.top - box.top - 1}px`;
    }
  }, [subOpen, shapeSub, tabPositionOpen, menu.x, menu.y, menu.kind]);
  const close = (): void => { d.contextMenu = null; d.invalidate(); };
  useEffect(() => {
    // Pointer events in the capture phase: the grid cancels its pointerdown, which suppresses the
    // compatibility mousedown, so a mousedown listener never saw clicks on the cells.
    const onDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement;
      if (target.closest('.gc-designer-context-menu')) return;
      close();
      // Trial-observed: a left click on the grid only dismisses the menu; the selection stays.
      const host = d.getWorkbook().getHost();
      if (event.button === 0 && host && host.contains(target)) { event.stopPropagation(); event.preventDefault(); }
    };
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); };
  }, []);
  const run = (action: () => void): void => { action(); close(); };
  const sheet = d.getWorkbook().getActiveSheet();
  const tabBases = tabThemeBases(sheet);
  if (menu.kind === 'shape' || menu.kind === 'chart') {
    const allObjects: HostableObject[] = [...sheet.floatingObjects.all(), ...sheet.pictures.all(), ...shapesOf(sheet).all(), ...sheet.charts.all()];
    let entries: ContextItem[];
    if (menu.kind === 'chart') {
      entries = buildContextItems(d, menu);
    } else {
    const shape: HostableObject | undefined = shapesOf(sheet).all().find((item) => item.name() === menu.objectName)
      ?? [...sheet.floatingObjects.all(), ...sheet.pictures.all()].find((item) => item.name() === menu.objectName);
    const selectedName = menu.objectName ?? '';
    const selectOnly = (): void => { for (const item of allObjects) item.isSelected(item.name() === selectedName); };
    const name = String(shape?.name() ?? '');
    const isPicture = (shape as { typeName?: string } | undefined)?.typeName === '1' || (shape as { isPicture?(): boolean } | undefined)?.isPicture?.();
    void name;
    // The trial leaves Bring/Send Backward enabled on object menus.
    const shapeItems: ContextItem[] = [
      { id: 'cutShapes', label: 'Cut', icon: 'ribbon-button-cut', action: () => { selectOnly(); d.executeShapeCommand('contextMenuCutShapes'); } },
      { id: 'copyShapes', label: 'Copy', icon: 'ribbon-button-copy', action: () => { selectOnly(); d.executeShapeCommand('contextMenuCopyShapes'); } },
    ];
    if (isPicture) shapeItems.push(
      { id: 'picturePlaceInCell', label: 'Place in Cell', icon: 'ribbon-button-picture-in-cell', action: () => { selectOnly(); d.executeSpecial('placeInCells', null); } },
      { id: 'resetPicture', label: 'Reset Picture & Size', icon: 'ribbon-button-picture', action: () => { (shape as { resetSize?(): void } | undefined)?.resetSize?.(); d.invalidate(); } },
      { id: 'changePicture', label: 'Change Picture', icon: 'ribbon-button-picture', action: () => { void d.placePicture('over'); } },
    );
    shapeItems.push(
      { id: 'shapeGroup', label: 'Group', icon: 'ribbon-button-shape-group',
        submenu: [
          { label: 'Group', icon: 'ribbon-button-shape-group', action: () => { selectOnly(); d.executeShapeCommand('shapeGroup'); }, disabled: d.selectedShapeCount() < 2 },
          { label: 'Ungroup', icon: 'ribbon-button-shape-ungroup', action: () => { selectOnly(); d.executeShapeCommand('shapeUnGroup'); }, disabled: !(shape as { groupId?(): string | null } | undefined)?.groupId?.() },
        ], action: () => undefined },
      { id: 'bringShapeForward', label: 'Bring Forward', icon: 'ribbon-button-shape-bring-forward',
        submenu: [
          { label: 'Bring Forward', icon: 'context-sub-bring-forward', action: () => { selectOnly(); d.executeShapeCommand('bringShapeForward'); } },
          { label: 'Bring To Front', icon: 'context-sub-bring-to-front', action: () => { selectOnly(); d.executeShapeCommand('bringShapeToFront'); } },
        ], action: () => undefined },
      { id: 'sendShapeBackward', label: 'Send Backward', icon: 'ribbon-button-shape-send-backward',
        submenu: [
          { label: 'Send Backward', icon: 'context-sub-send-backward', action: () => { selectOnly(); d.executeShapeCommand('sendShapeBackward'); } },
          { label: 'Send To Back', icon: 'context-sub-send-to-back', action: () => { selectOnly(); d.executeShapeCommand('sendShapeToBack'); } },
        ], action: () => undefined },
      { id: 'formatShapes', label: 'Format Shape...', icon: 'ribbon-button-format-pane', action: () => { selectOnly(); d._formatShapePanel = name; d.invalidate(); } },
      { id: 'editShapeHyperlink', label: 'Link...', icon: 'ribbon-button-hyperlink', action: () => { selectOnly(); d.showShapeLinkDialog(); } },
      { id: 'saveAsPicture', label: 'Save as Picture', icon: 'ribbon-button-save-as-picture', action: () => { selectOnly(); d.saveShapeAsPicture(); } },
      { id: 'editShapeText', label: 'Edit Text', action: () => { selectOnly(); d.executeShapeCommand('editShapeText'); } },
    );
    entries = shapeItems;
    }
    return (
      <div ref={menuRef} className="gc-designer-context-menu gc-designer-ribbon-dropdown gc-designer-context-menu-shape" style={{ left: menu.x - host.left, top: menu.y - host.top, width: 190, maxHeight: 'none', overflow: 'visible', zIndex: 12000 }} role="menu" onContextMenu={(event) => event.preventDefault()}>
        {entries.map((item) => item.separator
          ? <div key={item.id} className="gc-designer-ribbon-separator-horizontal" />
          : (
            <div key={item.id} role="menuitem" aria-disabled={item.disabled || undefined} className={`gc-designer-context-item${item.disabled ? ' gc-designer-ribbon-list-item-disabled' : ''}`} data-command={`contextMenu.${item.id}`}
              onMouseEnter={() => setShapeSub(item.submenu ? item.id : null)}
              onClick={() => { if (!item.disabled) { if (item.submenu) setShapeSub(item.id); else run(item.action!); } }}>
              {item.icon && <DesignerIcon className={item.icon} size={16} />}
              <span data-label={item.label}>{item.label}</span>
              {item.submenu && <span className="gc-designer-context-arrow" aria-hidden="true" />}
              {item.submenu && shapeSub === item.id && (
                <div className="gc-designer-ribbon-dropdown gc-designer-context-submenu" style={{ maxHeight: 'none', overflow: 'visible' }} role="menu" onClick={(event) => event.stopPropagation()}>
                  {item.submenu.map((sub) => (
                    <div key={sub.label} role="menuitem" aria-disabled={sub.disabled || undefined} className={`gc-designer-context-item${sub.disabled ? ' gc-designer-ribbon-list-item-disabled' : ''}`}
                      onClick={() => { if (!sub.disabled) { close(); sub.action(); } }}>{sub.icon ? <span className="gc-designer-context-sub-icon"><DesignerIcon className={sub.icon} size={16} /></span> : <span className="gc-designer-context-sub-icon" />}{sub.label}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    );
  }
  let items: ContextItem[];
  if (menu.kind === 'tab') {
    const structureLocked = d.workbookStructureProtected;
    items = [
      { id: 'insertSheet', label: 'Insert', disabled: structureLocked, action: () => d.executeBuiltin('insertSheet') },
      { id: 'deleteSheet', label: 'Delete', disabled: structureLocked, action: () => d.executeBuiltin('deleteSheet') },
      { id: 'rename', label: 'Rename', disabled: structureLocked, action: () => {
        const name = sheet.name();
        d.showDialog('renameSheetDialog', { name }, (data) => { sheet.name(String(data.name ?? name)); });
      } },
      { id: 'moveCopy', label: 'Move or Copy...', disabled: structureLocked, action: () => d.showMoveOrCopySheet() },
      { id: 'tabPosition', label: 'SheetTab Position', action: () => setTabPositionOpen((open) => !open) },
      { id: 'protect', label: sheet.options.isProtected ? 'Unprotect Sheet...' : 'Protect Sheet...', action: () => sheet.options.isProtected ? d.showUnprotectSheet() : d.showProtectSheet() },
      { id: 'tabColor', label: 'Tab Color', action: () => setTabColorOpen((open) => !open) },
      { id: 'hideSheet', label: 'Hide', disabled: structureLocked, action: () => { if (d.getWorkbook().sheets.filter((s) => s.visible()).length > 1) { sheet.visible(false); const next = d.getWorkbook().sheets.findIndex((s) => s.visible()); d.getWorkbook().setActiveSheetIndex(next); } } },
      { id: 'unhideSheet', label: 'Unhide', disabled: structureLocked || !d.getWorkbook().sheets.some((s) => !s.visible()), action: () => d.showUnhideSheet() },
      { id: 'tagSheet', label: 'Tag...', action: () => d.showDialog('sheetTagDialog', { tag: sheet.tag() ?? '' }, (data) => { sheet.tag(String(data.tag ?? '')); }) },
    ];
  } else {
    items = buildContextItems(d, menu);
  }
  return (
    <div ref={menuRef} className={`gc-designer-context-menu gc-designer-ribbon-dropdown${menu.kind === 'tab' ? ' gc-designer-context-menu-tab' : ''}`} style={{ left: menu.x - host.left, top: menu.y - host.top, width: menu.kind === 'tab' ? 190 : 248, maxHeight: 'none', overflow: 'visible', zIndex: 12000 }} role="menu" onContextMenu={(event) => event.preventDefault()}>
      {items.map((item) => item.separator
        ? <div key={item.id} className="gc-designer-ribbon-separator-horizontal" />
        : item.pasteRow ? (
          <div key={item.id} className="gc-designer-paste-options" data-command={`contextMenu.${item.id}`}>
            <span className="gc-designer-paste-options-label"><DesignerIcon className="context-paste-all" size={16} />{item.label}</span>
            <div className="gc-designer-paste-options-row">
              {item.pasteRow.map((button) => (
                <div key={button.id} role="menuitem" title={button.title} aria-label={button.title} data-paste={button.id} className="gc-designer-paste-option" onClick={() => run(button.action)}>
                  <DesignerIcon className={button.icon} size={24} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div key={item.id} role="menuitem" aria-disabled={item.disabled} className={`gc-designer-context-item${item.disabled ? ' gc-designer-ribbon-list-item-disabled' : ''}`} data-command={`contextMenu.${item.id}`} onMouseEnter={() => { if (item.id === 'tabPosition') setTabPositionOpen(true); if (item.id === 'tabColor') setTabColorOpen(true); if (item.submenu) setSubOpen(item.id); }} onMouseLeave={() => { if (item.id === 'tabPosition') setTabPositionOpen(false); if (item.id === 'tabColor') setTabColorOpen(false); if (item.submenu) setSubOpen((current) => current === item.id ? null : current); }} onClick={() => { if (!item.disabled) { if (item.id === 'tabPosition' || item.id === 'tabColor') item.action!(); else if (item.submenu) setSubOpen(item.id); else run(item.action!); } }}>
            {menu.kind === 'tab' && ['deleteSheet', 'rename', 'protect'].includes(item.id) && <svg className="gc-tab-menu-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={`M0.5 1.5h15M0.5 4.5h15M0.5 8.5h${item.id === 'protect' ? 9.5 : item.id === 'deleteSheet' ? 8 : 7.5}M0.5 11.5h${item.id === 'protect' ? 7.5 : 8.5}M0.5 13.5h4.5M0.5 1.5v12M5.5 1.5v10.5M10.5 1.5v7M15.5 1.5v7`} />{item.id === 'deleteSheet' ? <path stroke="#d35c36" strokeWidth="1.5" d="M7.8 8.8l7 7m0-7l-7 7" /> : item.id === 'rename' ? <path stroke="#1684cc" strokeWidth="2.6" d="M6.5 15.5L15.5 7" /> : <><path stroke="#d66a30" d="M8.5 10.5v-1.5a2 2 0 0 1 4 0v1.5" /><path fill="#e78440" stroke="#d66a30" d="M8 11h5.5v4.5h-5.5z" /></>}</svg>}
            {item.icon && <DesignerIcon className={item.icon} size={16} />}
            <span data-label={item.label}>{item.label}</span>{item.shortcut && <span className="gc-designer-context-shortcut">{item.shortcut}</span>}
            {(item.submenu || item.id === 'tabPosition' || item.id === 'tabColor') && <span className="gc-designer-context-arrow" aria-hidden="true" />}
            {item.id === 'tabColor' && tabColorOpen && <div ref={tabColorRef} className={`gc-designer-ribbon-dropdown gc-designer-context-submenu gc-tab-color-menu${menu.x + 418 > window.innerWidth ? ' gc-designer-context-submenu-left' : ''}`} onClick={(event) => event.stopPropagation()}>
              <div className="gc-tab-color-inner">
                <div className="gc-tab-color-list">
                  <div className="gc-designer-color-menu-title">Theme Colors</div>
                  <div className="gc-tab-theme-row"><div className="gc-tab-color-grid">{tabThemeTints[0].map((tint, index) => { const name = tabThemeNames[index]; return <div key={name} className="gc-designer-color-cell" role="radio" aria-label={name} style={{ background: tabSwatchColor(tabBases, index, tint) }} onClick={() => { sheet.options.sheetTabColor = name; close(); }} />; })}</div></div>
                  <div className="gc-tab-tint-rows"><div className="gc-tab-color-grid">{tabThemeTints.slice(1).flatMap((row) => row.map((tint, index) => { const name = `${tabThemeNames[index]} ${tint}`; return <div key={name} className="gc-designer-color-cell" role="radio" aria-label={name} style={{ background: tabSwatchColor(tabBases, index, tint) }} onClick={() => { sheet.options.sheetTabColor = name; close(); }} />; }))}</div></div>
                  <div className="gc-designer-color-menu-title">Standard Colors</div>
                  <div className="gc-tab-theme-row"><div className="gc-tab-color-grid">{['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'].map((color) => <div key={color} role="radio" aria-label={color} className="gc-designer-color-cell" style={{ background: color }} onClick={() => { sheet.options.sheetTabColor = color; close(); }} />)}</div></div>
                </div>
                <div role="menuitem" className="gc-tab-no-color" onClick={() => { sheet.options.sheetTabColor = ''; close(); }}><span className="gc-tab-no-color-icon" aria-hidden="true" /><span>No Color</span></div>
                <div role="menuitem" className="gc-tab-more-colors" onClick={() => {
                  d.showDialog('tabColorDialog', { red: '', green: '', blue: '', current: sheet.options.sheetTabColor || '#FFFFFF' }, (data) => {
                    const hex = ['red', 'green', 'blue'].map((key) => Math.max(0, Math.min(255, Number(data[key]) || 0)).toString(16).padStart(2, '0')).join('');
                    sheet.options.sheetTabColor = ['red', 'green', 'blue'].every((key) => data[key] === '') ? '' : `#${data.pickerSelected ? hex : hex.toUpperCase()}`;
                    d.invalidate();
                  });
                  close();
                }}><svg className="gc-tab-more-colors-icon" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#ffca00" /><circle cx="2.5" cy="3.2" r="0.8" fill="#b5ba84" /><circle cx="3.3" cy="4.2" r="0.8" fill="#bbbb7d" /><circle cx="5" cy="2.8" r="1.2" fill="#3a81ca" /><circle cx="8.8" cy="2.9" r="1.25" fill="#4abb72" /><circle cx="9.6" cy="4" r="0.9" fill="#c1d05e" /><circle cx="2.9" cy="5.9" r="1.25" fill="#fa7947" /></svg><span>More Colors...</span></div>
              </div>
            </div>}
            {item.id === 'tabPosition' && tabPositionOpen && <div className="gc-designer-ribbon-dropdown gc-designer-context-submenu" style={{ maxHeight: 'none', overflow: 'visible' }} role="menu">
              {([['Left', 2], ['Right', 3], ['Bottom', 0], ['Top', 1]] as const).map(([label, value]) => <div key={label} role="menuitem" className="gc-designer-context-item" onClick={(event) => { event.stopPropagation(); d.getWorkbook().options.tabStripPosition = value as GC.Spread.Sheets.TabStripPosition; close(); }}>{label}</div>)}
            </div>}
            {item.submenu && subOpen === item.id && <div className="gc-designer-ribbon-dropdown gc-designer-context-submenu" style={{ maxHeight: 'none', overflow: 'visible' }} role="menu" onClick={(event) => event.stopPropagation()}>
              {item.submenu.map((sub) => (
                <div key={sub.id ?? sub.label} role="menuitem" aria-disabled={sub.disabled || undefined} className={`gc-designer-context-item${sub.disabled ? ' gc-designer-ribbon-list-item-disabled' : ''}`} data-command={`contextMenu.${item.id}.${sub.id ?? sub.label}`} onClick={() => { if (!sub.disabled) { close(); sub.action(); } }}>{sub.icon ? <span className="gc-designer-context-sub-icon"><DesignerIcon className={sub.icon} size={16} /></span> : <span className="gc-designer-context-sub-icon" />}{sub.label}</div>
              ))}
            </div>}
          </div>
        ))}
    </div>
  );
}
