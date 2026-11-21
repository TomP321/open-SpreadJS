/* Ribbon dropdown host and the menu contents it renders: plain command lists,
 * combo/list dropdowns, the group overflow menus, the Editing menu, function
 * galleries, the shape Size menu, the color menus, the Table and Cell Styles
 * galleries and the theme galleries. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDesigner, useDesignerVersion } from '../store.js';
import type { DesignerApi as Designer } from '../designer-api.js';
import type { IButtonGroup, ICommand, ICommandGroup, IListGroupItemData } from '../types.js';
import { shapesOf } from '../core-internals.js';
import { DesignerIcon } from '../icons.js';
import { cellStyleGroups, customCellStyles, formatList } from '../commands/actions.js';
import { currentPaperName } from '../designer-state.js';
import { MARGIN_PRESETS, PAPER_ITEMS } from '../page-setup.js';
import { functionGalleryCategories, moreFunctionCategories, ribbonFunctions } from '../function-library.js';
import { FormControlGalleryMenu, ShapeGalleryMenu, SparklineGalleryMenu } from '../insert-ui.js';
import { commandOf, commandText, commandTitle, currentRibbon, resource } from '../app-helpers.js';
import { colorSwatches } from './colors.js';
import { ConfigNode, GroupFlyoutContext, groupItems, nodeKey, ShapeStyleTileControl } from './controls.js';
import { dismissRibbonMenu } from './menu-dismissal.js';
import { customTableThemeTiles, TablePreview, type PreviewTheme } from '../dialogs/TableStyleDialogs.js';
import { PivotStyleGalleryMenu, ThemeGalleryMenu } from './theme-galleries.js';
import { ChartPreviewGallery, chartPreviewGalleries, isChartPreviewGallery } from './chart-galleries.js';
import { sparklineWeightItems } from '../contextual-actions.js';
import { ChangeColorsGallery, ChartStyleGallery, QuickLayoutGallery } from './chart-design-galleries.js';

/** Dropdowns whose items the trial renders flush-left with no icon column (TASK 51). */
const TEXT_ONLY_ICONS_MENUS = new Set(['breaks', 'whatIfAnalysis', 'viewportFreezePanes']);

const submenuWidths: Record<string, number> = { highlightCellsRules: 169.06, topBottomRules: 160.38, dataBar: 126, colorScalesList: 170, iconSetList: 230, clearRules: 202.06 };
/** Submenu parents the trial renders as tall rows with a big (32px) left icon (TASK 55:
 *  the five category rows of the Conditional Formatting menu). */
const LARGE_ICON_SUBMENU_ITEMS = new Set(['highlightCellsRules', 'topBottomRules', 'dataBar', 'colorScalesList', 'iconSetList', 'cellType', 'cellDropdowns']);

export function RibbonMenu(): React.ReactElement | null {
  const d = useDesigner();
  useDesignerVersion();
  const menu = d.openMenu;
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Trial behaviour (TASK 60 item 1): ANY pointer press outside the open dropdown dismisses it —
    // including presses on the sheet grid and on other ribbon controls. It must run in the capture
    // phase of pointerdown: the grid cancels its pointerdown, which suppresses the compatibility
    // mousedown, so a mousedown listener never sees clicks on the cells (see ribbon/menu-dismissal.ts).
    const close = (event: PointerEvent): void => dismissRibbonMenu(d, menu, event.target as HTMLElement);
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') { d.openMenu = null; d.invalidate(); } };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', key); };
  }, [d, menu]);
  // Trial rule (TASK 51): open the dropdown at the button; only when the *rendered* menu would
  // cross the host's right edge, slide it left so it ends 6px inside (menus with a known width
  // already did this in the pre-render flip above, so this is a no-op for them).
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const host = d.host.getBoundingClientRect();
    const overflow = rect.right - (host.right - 6);
    if (overflow > 0.5) el.style.left = `${parseFloat(el.style.left) - overflow}px`;
  }, [menu?.command, menu?.anchor.left, menu?.anchor.top, d]);
  if (!menu) return null;
  const command = commandOf(d, menu.command);
  const node = findNode(d, menu.command);
  const hostRect = d.host.getBoundingClientRect();
  const panelRect = hostRef.current?.getBoundingClientRect();
  let left = menu.anchor.left - hostRect.left;
  let top = menu.anchor.bottom - hostRect.top;
  if (menu.anchor.width === 0) {
    const control = d.host.querySelector(`[data-command="ribbon.${menu.command}"]`) as HTMLElement | null;
    const rect = control?.getBoundingClientRect();
    if (rect) { left = rect.left - hostRect.left; top = rect.bottom - hostRect.top + 1; }
  }
  // Widths/heights of the Insert-tab galleries as measured in the trial's DOM.
  const insertGalleries: Record<string, { width: number; maxHeight?: number }> = {
    insertShape: { width: 350, maxHeight: 576 },
    shapeFormatInsertShapes: { width: 350, maxHeight: 576 },
    shapeSize: { width: 132 },
    insertFormControlShape: { width: 200 },
    sparklineGallery: { width: 490 },
    // TASK 74: Chart Design gallery popups (outer rects measured on the trial,
    // `.probe/t74/measure29-official.json`: 200×232 / 235×510 / 915×308).
    quickLayout: { width: 200, maxHeight: 232 },
    changeColors: { width: 235, maxHeight: 510 },
    chartStyle: { width: 915, maxHeight: 308 },
    pivotTableStyle: { width: 520, maxHeight: undefined },
    ThemeSetting: { width: 286, maxHeight: 440 },
    ThemeColors: { width: 250, maxHeight: 420 },
    ThemeFonts: { width: 235, maxHeight: 420 },
  };
  // Chart-preview galleries: outer host sizes measured from the trial DOM (TASK 60 item 2).
  const gallery = insertGalleries[menu.command] ?? (isChartPreviewGallery(menu.command)
    ? { width: chartPreviewGalleries[menu.command].width, maxHeight: chartPreviewGalleries[menu.command].height }
    : undefined);
  const isGallery = menu.command === 'formatTable2' || menu.command === 'cellStyles';
  // The trial sizes a function gallery to its longest function name.
  const isFunctionGallery = menu.command === 'moreFunctions' || menu.command in functionGalleryCategories;
  if (isFunctionGallery) return <FunctionGalleryMenu command={menu.command} left={left} top={top} />;
  const maxWidth = command?.dropdownMaxWidth ?? 500;
  const galleryWidth = gallery ? gallery.width : 0;
  const galleryHeight = gallery?.maxHeight;
  const isGroupMenu = menu.command.startsWith('group:');
  // Flip only when the menu's *known* width would overflow the ribbon (the trial opens at the
  // button left unless that overflows). Unknown-width menus must not flip on an estimate
  // (TASK 51: cellsFormat is really 171.7px wide and opens at its button); they are corrected
  // after render instead, which is exactly the trial behaviour.
  const flipWidth = galleryWidth || (menu.command === 'cellStyles' ? 644 : menu.command === 'formatTable2' ? 520 : menu.command === 'pasteAll' ? 175 : menu.command === 'margins' ? 270 : menu.command === 'paperSize' ? 170 : menu.command === 'conditionFormat' || menu.command === 'ribbonNumberFormat' ? 185.72 : menu.command === 'fontFamily' ? 131.578 : command?.dropdownMaxWidth ?? 0);
  if (!isGroupMenu && flipWidth && left + flipWidth > hostRect.width - 6) left = Math.max(6, hostRect.width - flipWidth - (isGallery ? 10 : 6));
  if (panelRect) { /* element rendered; no-op keeps tests deterministic */ }
  const isColor = command?.type === 'colorPicker';
  const isCombo = command?.type === 'comboBox' || command?.type === 'editableSelect';
  // Combo popups match the trial: as wide as the combo box itself (TASK 51: fitPageWidth 83.36px).
  // The trial also allows a few narrow non-combo popups below the 120px CSS floor.
  const narrowWidths: Record<string, number> = { calculationOptionsPanel: 108.36 };
  const explicitWidth = galleryWidth || (menu.command === 'fontFamily' ? 131.578 : menu.command === 'sparklineWeight' ? 147 : menu.command === 'ribbonNumberFormat' || menu.command === 'conditionFormat' ? 185.72 : menu.command === 'pasteAll' ? 175 : menu.command === 'margins' ? 270 : menu.command === 'paperSize' ? 170 : isCombo && command?.comboWidth ? command.comboWidth + 3.36 : narrowWidths[menu.command]);
  return (
    <div
      ref={hostRef}
      className={`gc-designer-root en gc-designer-ribbon-dropdown${isCombo ? ' sd-combo-dropdown' : ''}${isGroupMenu ? ' gc-designer-group-menu' : ''}${menu.command === 'conditionFormat' ? ' gc-designer-condition-menu' : ''}${menu.command === 'cellEditors' ? ' gc-designer-cell-editors-menu' : ''}${menu.command === 'mergeCenter' ? ' gc-designer-merge-menu' : ''}${menu.command === 'border' ? ' sd-border-menu' : ''}${menu.command === 'orientation' ? ' sd-orientation-menu' : ''}${menu.command === 'sparklineGallery' ? ' sparklineGallery-dropdown-container' : ''}${isChartPreviewGallery(menu.command) ? ' gc-designer-large-icon' : ''} gc-designer-dropdown-slide-in`}
      style={{ left, top, minWidth: explicitWidth && !isGallery ? explicitWidth : undefined, maxWidth: isGallery ? (menu.command === 'cellStyles' ? 644 : 520) : galleryWidth || maxWidth, maxHeight: isGallery ? 'none' : galleryHeight, width: isGallery ? (menu.command === 'cellStyles' ? 644 : 520) : explicitWidth, zIndex: 10000 }}
      role="menu"
      aria-label={isChartPreviewGallery(menu.command) ? commandTitle(d, command, menu.command) || undefined : undefined}
    >
      {menu.command.startsWith('group:') ? <GroupMenu command={menu.command} /> :
        menu.command === 'ribbonGroupEditing' ? <EditingMenu /> :
        isChartPreviewGallery(menu.command) ? <ChartPreviewGallery command={menu.command} /> :
        menu.command === 'insertShape' || menu.command === 'shapeFormatInsertShapes' ? <ShapeGalleryMenu /> :
        menu.command === 'shapeSize' ? <ShapeSizeMenu /> :
        menu.command === 'sparklineGallery' ? <SparklineGalleryMenu /> :
        menu.command === 'pivotTableStyle' ? <PivotStyleGalleryMenu /> :
        menu.command === 'quickLayout' || menu.command === 'quickLayoutListContent' ? <QuickLayoutGallery /> :
        menu.command === 'changeColors' ? <ChangeColorsGallery /> :
        menu.command === 'chartStyle' ? <ChartStyleGallery /> :
        menu.command === 'insertFormControlShape' ? <FormControlGalleryMenu /> :
        menu.command === 'ThemeSetting' || menu.command === 'ThemeColors' || menu.command === 'ThemeFonts' ? <ThemeGalleryMenu command={menu.command} /> :
        menu.command === 'namedCellTemplates' ? <NamedCellTemplatesMenu /> :
        isGallery && menu.command === 'formatTable2' ? <TableGallery /> :
        isGallery ? <CellStylesGallery /> :
        isColor ? <ColorMenu command={menu.command} /> :
        isCombo ? <ComboMenu command={menu.command} /> :
        menu.command === 'dataBar' || menu.command === 'colorScalesList' || menu.command === 'iconSetList' ? <ConditionalFormattingFlyout command={menu.command} /> :
        Array.isArray(command?.dropdownList) && command.dropdownList.length ? <ListDropdownMenu command={menu.command} /> :
        menu.command === 'pasteAll' ? <PasteGalleryMenu node={node} /> :
        menu.command === 'shapeStylesMore' ? <ShapeStylesMoreMenu /> :
        menu.command === 'margins' ? <MarginsMenu /> :
        menu.command === 'paperSize' ? <PaperSizeMenu /> :
        <MenuList node={node} command={command} level={0} textOnly={TEXT_ONLY_ICONS_MENUS.has(menu.command)} />}
    </div>
  );
}

function findGroup(d: Designer, panelId: string, label: string): IButtonGroup | undefined {
  const { panels } = currentRibbon(d);
  const panel = panels.find((candidate) => candidate.id === panelId) ?? panels.find((candidate) => candidate.id === d.activeTab) ?? panels[0];
  return panel?.buttonGroups.find((group) => group.label === label);
}

/** Inline "Size" panel of the Shape Format tab (trial: Height/Width spinners,
 * lock-aspect checkbox, "Size" caption), applied live to the selected shapes. */
function ShapeSizeMenu(): React.ReactElement {
  const d = useDesigner();
  const sheet = d.getWorkbook().getActiveSheet();
  const selected = shapesOf(sheet).all().filter((shape) => shape.isSelected());
  const first = selected[0];
  const [height, setHeight] = useState(() => String(Math.round(Number(first?.height() ?? 0))));
  const [width, setWidth] = useState(() => String(Math.round(Number(first?.width() ?? 0))));
  const [lock, setLock] = useState(false);
  const ratio = first && Number(first.height()) > 0 ? Number(first.width()) / Number(first.height()) : 1;
  const apply = (key: 'height' | 'width', raw: string): void => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    for (const shape of selected) {
      if (key === 'height') {
        shape.height(value);
        if (lock) shape.width(Math.max(1, Math.round(value * ratio)));
      } else {
        shape.width(value);
        if (lock) shape.height(Math.max(1, Math.round(value / ratio)));
      }
    }
    d.invalidate();
  };
  const field = (label: string, key: 'height' | 'width', value: string, set: (v: string) => void) => (
    <div className="gc-designer-ribbon-dropdown-item gc-shape-size-row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px' }}>
      <span style={{ width: 42 }}>{label}</span>
      <input
        className="gc-designer-text-input"
        type="number"
        min={1}
        value={value}
        style={{ width: 56 }}
        onChange={(event) => { set(event.target.value); apply(key, event.target.value); }}
        onKeyDown={(event) => { if (event.key === 'Enter') apply(key, (event.target as HTMLInputElement).value); }}
      />
    </div>
  );
  return (
    <div className="gc-shape-size-menu" role="group" aria-label="Size">
      {field('Height', 'height', height, setHeight)}
      {field('Width', 'width', width, setWidth)}
      <div className="gc-shape-size-lock" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px' }}>
        <input type="checkbox" checked={lock} onChange={(event) => setLock(event.target.checked)} aria-label="Lock aspect ratio" />
        <span>Lock aspect ratio</span>
      </div>
      <div className="gc-designer-ribbon-dropdown-group-title" style={{ textAlign: 'center', padding: '2px 8px 6px' }}>Size</div>
    </div>
  );
}

function GroupMenu({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  const [, panelId, ...labelParts] = command.split(':');
  const label = labelParts.join(':');
  const group = findGroup(d, panelId, label);
  if (!group) return <div className="gc-designer-ribbon-menu-list" />;
  const layout = groupItems(group);
  return (
    <div className="gc-designer-group-dropdown" role="menu" aria-label={group.label}>
      <GroupFlyoutContext.Provider value={true}>
      <div className={`gc-designer-group-dropdown-content gc-designer-component-container gc-designer-flex-default${layout.direction === 'vertical' ? ' gc-designer-component-container-vertical' : ''}${layout.className ? ` ${layout.className}` : ''}`} data-direction={layout.direction}>
        {layout.items.map((item, index) => <ConfigNode key={nodeKey(item, index)} node={item} />)}
      </div>
      </GroupFlyoutContext.Provider>
      <div className="gc-designer-group-dropdown-title">{group.label}</div>
    </div>
  );
}

/**
 * Formulas tab function galleries. The trial draws plain text rows (no icons)
 * and sizes the popup to the longest function name; the More Functions gallery
 * lists categories that fly out to their own function list. Choosing a function
 * opens the Function Arguments dialog instead of typing into the cell.
 */
function FunctionGalleryMenu({ command, left, top }: { command: string; left: number; top: number }): React.ReactElement | null {
  const wrap = (children: React.ReactNode, label: string): React.ReactElement => (
    <div className="gc-designer-root en gc-designer-ribbon-dropdown gc-designer-function-menu sd-fit-content" style={{ left, top, zIndex: 10000 }} role="menu" aria-label={label}>{children}</div>
  );
  const [hovered, setHovered] = useState<string | null>(null);
  if (command === 'moreFunctions') {
    return wrap(
      <div className="gc-designer-ribbon-menu-list" role="menu">
        {moreFunctionCategories.map((entry) => (
          <div key={entry.command}
            className="gc-designer-ribbon-list-item-container gc-list-control-hassubitem gc-designer-function-category gc-designer-list-content-item-focusable"
            role="menuitem" title={entry.label} aria-label={entry.label} data-command={`ribbon.${command}`} data-value={entry.category}
            onMouseEnter={() => setHovered(entry.category)} onMouseLeave={() => setHovered((current) => (current === entry.category ? null : current))}>
            <div className="gc-designer-ribbon-list-item-left"><div className="gc-designer-ribbon-icon ribbon-button-insertfunction"><DesignerIcon className="ribbon-button-insertfunction" /></div></div>
            <div className="gc-designer-ribbon-list-item-center"><div className="gc-designer-ribbon-text">{entry.label}</div></div>
            <div className="gc-designer-ribbon-list-item-arrow" />
            {hovered === entry.category ? (
              <div className="gc-designer-ribbon-dropdown gc-designer-submenu gc-designer-function-menu sd-fit-content" style={{ left: 'calc(100% + 1px)', top: -5 }} role="menu" aria-label={entry.label}
                onMouseEnter={() => setHovered(entry.category)} onMouseLeave={() => setHovered((current) => (current === entry.category ? null : current))}>
                <FunctionGalleryList command={command} category={entry.category} flyout />
              </div>
            ) : null}
          </div>
        ))}
      </div>,
      'More Functions',
    );
  }
  const category = functionGalleryCategories[command];
  if (!category) return null;
  return wrap(<FunctionGalleryList command={command} category={category} />, category);
}

function FunctionGalleryList({ command, category, flyout }: { command: string; category: string; flyout?: boolean }): React.ReactElement {
  const d = useDesigner();
  return (
    <div className={`gc-designer-ribbon-menu-list gc-designer-function-list${flyout ? ' gc-designer-function-flyout-list' : ''}`} role="menu">
      {ribbonFunctions(category).map((name) => (
        <div key={name} className="gc-designer-ribbon-list-item-container gc-designer-function-item gc-designer-list-content-item-focusable" role="menuitem"
          title={name} aria-label={name} data-command={`ribbon.${command}`} data-value={name} data-text={name}
          onClick={() => { d.openMenu = null; d.openFunctionArguments(name); d.invalidate(); }}>
          <div className="gc-designer-ribbon-list-item-center"><div className="gc-designer-ribbon-text">{name}</div></div>
        </div>
      ))}
    </div>
  );
}

const functionCategoryCommands = new Set(['formulaFinancial', 'logicalFormula', 'formulaText', 'formulaDateTime', 'formulaLookupReference', 'formulaMathTrig']);
function ListDropdownMenu({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  const item = commandOf(d, command);
  const state = d.getCommandState(command);
  const list = item?.dropdownList ?? [];
  return (
    <div className="gc-designer-ribbon-menu-list" role="menu">
      {list.map((entry, index) => {
        const value = String(entry.value ?? entry.text ?? '');
        const selected = String(state.value ?? '') === value;
        return (
          <div
            key={index}
            className={`gc-designer-ribbon-list-item-container gc-designer-combo-icon-item gc-designer-list-content-item-focusable${selected ? ' gc-designer-ribbon-list-item-selected' : ''}`}
            role="menuitem"
            aria-label={String(entry.text ?? value)}
            onClick={() => {
              d.openMenu = null;
              if (functionCategoryCommands.has(command)) d.insertFunctionText(value);
              else if (command === 'moreFunctions') d.showInsertFunction();
              else d.executeCommand(command, command, entry.value ?? entry.text);
              d.invalidate();
            }}
          >
            <div className="gc-designer-ribbon-list-item-left"><div className={`gc-designer-ribbon-icon ${entry.iconClass ?? ''}`}>{entry.iconClass ? <DesignerIcon className={entry.iconClass} /> : null}</div></div>
            <div className="gc-designer-ribbon-list-item-center"><div className="gc-designer-ribbon-text">{entry.text}</div></div>
          </div>
        );
      })}
    </div>
  );
}

/** Dropdown opened by the Shape Styles spinner: the full quick-style row (TASK 55). */
function ShapeStylesMoreMenu(): React.ReactElement {
  return (
    <div className="gc-designer-ribbon-menu-list sd-shape-styles-menu">
      <div className="sd-shape-styles-row">{[1, 2, 3, 4, 5, 6, 7].map((n) => <ShapeStyleTileControl key={n} name={`shapeStyle${n}`} />)}</div>
    </div>
  );
}

function EditingMenu(): React.ReactElement {
  const items = ['editingAutoSum', 'editingFillDown', 'clear', 'editingSortFilter', 'editingFind'];
  return <div className="gc-designer-ribbon-menu-list">{items.map((name) => <MenuItem key={name} node={name} level={0} />)}</div>;
}

/**
 * The Paste split-button gallery. Like the trial it is NOT a submenu tree:
 * bold section captions ("Paste" / "Paste Values" / "Other Paste Options")
 * each followed by a row of icon-only tiles (tooltip = command title),
 * a separator and a plain "Paste Special..." row.
 */
function PasteGalleryMenu({ node }: { node?: ICommandGroup | string }): React.ReactElement {
  const d = useDesigner();
  const children = (typeof node === 'object' && node ? [...(node.children ?? []), ...(node.commands ?? [])] : []) as (ICommandGroup | string)[];
  const tile = (name: string, key: React.Key): React.ReactElement | null => {
    const cmd = commandOf(d, name);
    if (!cmd) return null;
    const state = d.getCommandState(name);
    if (state.visible === false) return null;
    const disabled = state.enabled === false;
    const title = commandTitle(d, cmd, name);
    return (
      <div
        key={key}
        className={`gc-designer-paste-tile${disabled ? ' gc-designer-paste-tile-disabled' : ''}`}
        role="menuitem"
        title={title}
        aria-label={title}
        data-command={`menu.${name}`}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          d.executeCommand(name, name);
          d.openMenu = null;
          d.invalidate();
        }}
      >
        <div className={`gc-designer-ribbon-icon ${cmd.iconClass ?? ''}`}>{cmd.iconClass ? <DesignerIcon className={cmd.iconClass} size={24} /> : null}</div>
      </div>
    );
  };
  return (
    <div className="gc-designer-ribbon-menu-list gc-designer-paste-gallery">
      {children.map((child, index) => {
        if (child === 'separator' || (typeof child === 'object' && child && child.type === 'separator')) return <div key={index} className="gc-designer-ribbon-separator-horizontal" />;
        if (typeof child === 'object' && child.type === 'group') {
          const groupName = String(child.command ?? '');
          const groupCmd = commandOf(d, groupName);
          const title = groupCmd ? commandTitle(d, groupCmd, groupName) : groupName;
          const items = (child.children ?? []) as (ICommandGroup | string)[];
          return (
            <div key={index} className="gc-designer-paste-section">
              <div className="gc-designer-paste-section-title">{title}</div>
              <div className="gc-designer-paste-tile-row">{items.map((item, i) => tile(String(item), i))}</div>
            </div>
          );
        }
        return <MenuItem key={index} node={child} level={0} />;
      })}
    </div>
  );
}

/**
 * Page Setup "Margins" gallery (trial layout): one row per preset with a page
 * thumbnail showing the margin rules, the preset name and the six values in a
 * two-column grid; separator + "Custom Margins..." row at the bottom.
 */
function MarginsMenu(): React.ReactElement {
  const d = useDesigner();
  const presets = (['Normal', 'Wide', 'Narrow'] as const).map((name) => ({ name, command: `margin${name}`, values: MARGIN_PRESETS[name] }));
  const inch = (value: number): string => `${(value / 100).toString()}"`;
  const run = (command: string): void => { d.executeCommand(command, command); d.openMenu = null; d.invalidate(); };
  return (
    <div className="gc-designer-ribbon-menu-list sd-margins-menu">
      {presets.map((preset) => (
        <div key={preset.name} className="sd-margins-item" role="menuitem" aria-label={preset.name} title={preset.name}
          data-command={`menu.${preset.command}`} onClick={(event) => { event.stopPropagation(); run(preset.command); }}>
          <div className="sd-margins-thumb" aria-hidden="true">
            {/* TASK 69: the trial draws a page frame with the margin rules crossing the page. */}
            <svg className="sd-margins-svg" width="34" height="46" viewBox="0 0 34 46" role="presentation">
              <rect x={2} y={2} width={30} height={42} fill="#ffffff" stroke="#8a8a8a" strokeWidth={1.44} />
              <path d={`M${2 + (preset.values.left / 100) * (30 / 8.5)} 2V44`} stroke="#7fa9de" strokeWidth={1.01} fill="none" />
              <path d={`M${2 + 30 - (preset.values.right / 100) * (30 / 8.5)} 2V44`} stroke="#7fa9de" strokeWidth={1.01} fill="none" />
              <path d={`M2 ${2 + (preset.values.top / 100) * (42 / 11)}H32`} stroke="#7fa9de" strokeWidth={1.01} fill="none" />
              <path d={`M2 ${2 + 42 - (preset.values.bottom / 100) * (42 / 11)}H32`} stroke="#7fa9de" strokeWidth={1.01} fill="none" />
            </svg>
          </div>
          {/* 1px label hit-target (TASK 51): a real clickable element carrying the preset name so
              tests/users can address the card by caption, like the trial addresses its canvas rows. */}
          <span className="gc-designer-ribbon-list-item-container sd-gallery-hit" aria-hidden="true">{preset.name}</span>
          <div className="sd-margins-info">
            <div className="sd-margins-name">{preset.name}</div>
            <div className="sd-margins-grid">
              <span>Top:</span><span>{inch(preset.values.top)}</span><span>Bottom:</span><span>{inch(preset.values.bottom)}</span>
              <span>Left:</span><span>{inch(preset.values.left)}</span><span>Right:</span><span>{inch(preset.values.right)}</span>
              <span>Header:</span><span>{inch(preset.values.header)}</span><span>Footer:</span><span>{inch(preset.values.footer)}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="gc-designer-ribbon-separator-horizontal" />
      <div className="gc-designer-ribbon-list-item-container gc-designer-combo-icon-item gc-designer-list-content-item-focusable" role="menuitem"
        data-command="menu.customMargins" onClick={(event) => { event.stopPropagation(); d.executeCommand('customMargins', 'customMargins'); d.openMenu = null; d.invalidate(); }}>
        <div className="gc-designer-ribbon-list-item-center"><div className="gc-designer-ribbon-text">Custom Margins...</div></div>
      </div>
    </div>
  );
}

/**
 * Page Setup "Size" gallery (trial layout): checkbox column, paper display
 * name and the physical size on a second line; the list scrolls inside the
 * fixed-height menu.
 */
function PaperSizeMenu(): React.ReactElement {
  const d = useDesigner();
  const current = currentPaperName(d.getWorkbook().getActiveSheet() as never);
  return (
    <div className="gc-designer-ribbon-menu-list sd-paper-menu" role="menu">
      {PAPER_ITEMS.map((item) => {
        // Task 55 pair check: like the trial, a fresh sheet (default kind, never chosen from
        // this menu) shows all boxes empty; a check appears only after an explicit selection.
        const selected = item.text === current && (item.text !== 'Letter' || d._paperTouched);
        // TASK 69: the trial's Size menu shows a proportional page outline per paper, not a checkbox.
        const dims = item.size.match(/([\d.]+)\u2033?\u00d7([\d.]+)/);
        const wIn = dims ? Number.parseFloat(dims[1]) : 8.5;
        const hIn = dims ? Number.parseFloat(dims[2]) : 11;
        const k = 36 / Math.max(wIn, hIn);
        return (
          <div key={item.text} className={`sd-paper-item${selected ? ' gc-designer-ribbon-list-item-selected' : ''}`} role="menuitem"
            aria-label={`${item.text} ${item.size}`} title={`${item.text} ${item.size}`} data-command={`menu.paperKind.${item.text}`}
            onClick={(event) => { event.stopPropagation(); d.executeCommand('paperKindSelector', 'paperKindSelector', item.text); d.openMenu = null; d.invalidate(); }}>
            <span className="sd-paper-check"><svg className="sd-paper-page" width="24" height="40" viewBox="0 0 24 40" role="presentation"><rect x={(24 - wIn * k) / 2} y={(40 - hIn * k) / 2} width={wIn * k} height={hIn * k} fill="#ffffff" stroke="#8a8a8a" strokeWidth={1.8} /></svg></span>
            <span className="sd-paper-text"><span className="sd-paper-name">{item.text}</span><span className="sd-paper-size">{item.size}</span></span><span className="gc-designer-ribbon-list-item-container sd-gallery-hit" aria-hidden="true">{item.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function findNode(d: Designer, commandName: string): ICommandGroup | string | undefined {
  const { panels } = currentRibbon(d);
  const root = panels.find((p) => p.id === d.activeTab) ?? panels[0];
  let found: ICommandGroup | string | undefined;
  const walk = (node: ICommandGroup | string): void => {
    if (found) return;
    if (typeof node === 'string') { if (node === commandName) found = node; return; }
    if (node.command === commandName) { found = node; return; }
    for (const child of [...(node.children ?? []), ...(node.commands ?? [])]) walk(child as ICommandGroup | string);
  };
  for (const group of root?.buttonGroups ?? []) walk(group.commandGroup);
  return found;
}

function MenuList({ node, command, level, textOnly = false }: { node?: ICommandGroup | string; command?: ICommand; level: number; textOnly?: boolean }): React.ReactElement {
  const items = typeof node === 'object' && node ? [...(node.children ?? []), ...(node.commands ?? [])] : (command?.subCommands ?? []);
  if (items.length) {
    return (
      <div className={`gc-designer-ribbon-menu-list${textOnly ? ' sd-no-icons' : ''}`}>
        {items.map((child, index) => <MenuItem key={`${level}-${index}`} node={child} level={level} />)}
      </div>
    );
  }
  return <div className="gc-designer-ribbon-menu-list" />;
}

function MenuItem({ node, level }: { node: ICommandGroup | string; level: number }): React.ReactElement | null {
  const d = useDesigner();
  const [openSub, setOpenSub] = useState(false);
  if (typeof node === 'object' && node.type === 'separator') return <div className="gc-designer-ribbon-separator-horizontal" />;
  if (typeof node === 'string' && node === 'separator') return <div className="gc-designer-ribbon-separator-horizontal" />;
  const name = typeof node === 'string' ? node : typeof node.command === 'string' ? node.command : undefined;
  if (typeof node === 'object' && node.command && typeof node.command === 'object') {
    const title = resource(d, node.command.title ?? node.command.commandName ?? '');
    return <div className="gc-designer-ribbon-menu-group-title">{title}</div>;
  }
  if (typeof node === 'object' && !name && (node.children || node.commands)) {
    return <>{((node.children ?? node.commands ?? []) as (ICommandGroup | string)[]).map((c, i) => <MenuItem key={i} node={c} level={level} />)}</>;
  }
  if (!name) return null;
  const command = commandOf(d, name);
  const state = d.getCommandState(name);
  if (state.visible === false) return null;
  const title = commandTitle(d, command, name);
  const text = command?.text && !command.text.startsWith('=') ? commandText(d, command) || commandTitle(d, command, name) : commandTitle(d, command, name);
  // Radio-style rows (Calculation Options): the trial shows a green check only on the selected one.
  const isRadioRow = name === 'calculationOptionAutomatic' || name === 'calculationOptionPartial' || name === 'calculationOptionManual';
  const iconClass = isRadioRow ? (state.checked ? 'context-check-green' : undefined) : command?.iconClass;
  const children = typeof node === 'object' ? node.children ?? node.commands : command?.subCommands as never;
  const isColorItem = command?.type === 'colorPicker';
  const isSub = (!!children && (children as never[]).length > 0) || isColorItem || command?.dropdownArrow === true;
  // Trial (TASK 55): every item that opens a submenu shows the right-pointing arrow,
  // including "Clear Rules". Tall rows (and the 32px icon column) are only used by the
  // category entries of the Conditional Formatting menu.
  const largeSub = isSub && LARGE_ICON_SUBMENU_ITEMS.has(name);
  const disabled = state.enabled === false;
  // TASK 55 pass 2: a submenu that would overflow the viewport opens to the LEFT of its row
  // instead (the trial keeps every flyout fully visible on screen).
  const flipSubmenuIntoView = (el: HTMLDivElement | null): void => {
    if (!el) return;
    const box = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    if (box.right > vw - 2) el.style.left = `calc(100% + 1px - ${Math.ceil(box.right - vw + 6)}px)`;
  };
  return (
    <div
      className={`gc-designer-ribbon-list-item-container${largeSub ? ' gc-designer-ribbon-list-item-large' : ''}${name === 'orientationPortrait' || name === 'orientationLandscape' ? ' sd-orientation-item' : ''} gc-designer-list-content-item-focusable${state.checked ? ' gc-designer-ribbon-list-item-selected' : ''}${disabled ? ' gc-designer-ribbon-list-item-disabled' : ''}`}
      role="menuitem"
      title={title}
      aria-label={title}
      data-command={`menu.${name}`}
      onMouseEnter={() => { if (isSub) setOpenSub(true); }}
      onMouseLeave={() => { if (isSub) setOpenSub(false); }}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        if (isSub) { setOpenSub(!openSub); return; }
        if (name === 'formatTableListContent') { d.openMenu = { ...d.openMenu!, command: 'formatTable2' }; d.invalidate(); return; }
        if (name === 'cellStylesListContent') { d.openMenu = { ...d.openMenu!, command: 'cellStyles' }; d.invalidate(); return; }
        d.executeCommand(name, name);
        d.openMenu = null;
        d.invalidate();
      }}
    >
      <div className="gc-designer-ribbon-list-item-left">
        <div className={`gc-designer-ribbon-icon ${iconClass ?? ''}`}>
          {iconClass ? <DesignerIcon className={iconClass} size={largeSub ? 24 : 16} /> : <span className="gc-designer-menu-spacer" />}
        </div>
      </div>
      <div className="gc-designer-ribbon-list-item-center">
        <div className="gc-designer-ribbon-text">{text}</div>
      </div>
      {isSub && <div className="gc-designer-ribbon-list-item-arrow" />}
      {isSub && openSub && !isColorItem && children && (children as never[]).length > 0 && (
        <div className={`gc-designer-ribbon-dropdown gc-designer-submenu${name === 'clearRules' ? ' sd-clear-sub' : ''}`} ref={flipSubmenuIntoView} style={{ left: 'calc(100% + 1px)', top: 0, ...(submenuWidths[name] ? { width: submenuWidths[name], maxWidth: submenuWidths[name] } : {}) }} role="menu">
          {['dataBar', 'colorScalesList', 'iconSetList'].includes(name)
            ? <ConditionalFormattingFlyout command={name} />
            : (children as (ICommandGroup | string)[]).map((c, i) => <MenuItem key={i} node={c} level={level + 1} />)}
        </div>
      )}
      {isColorItem && openSub && (
        <div className="gc-designer-ribbon-dropdown gc-designer-submenu" style={{ left: 'calc(100% + 1px)', top: -4 }} role="menu">
          <ColorMenu command={name} />
        </div>
      )}
    </div>
  );
}

function ComboMenu({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  const item = commandOf(d, command);
  const state = d.getCommandState(command);
  // TASK 74: the Sparkline Weight list lives with the tab behaviour (the trial
  // keeps it out of the command map too — gallery18-official.json shows
  // sparklineWeight with dropdownList null).
  const list: IListGroupItemData[] = (command === 'sparklineWeight' ? sparklineWeightItems : item?.dropdownList) ?? (command === 'ribbonNumberFormat' ? formatList : []);
  const simple = command === 'fontFamily' || command === 'fontSize';
  const isCalculation = command === 'calculationOptionsPanel';
  if (simple) {
    return (
      <div className="gc-designer-ribbon-menu-list">
        {list.map((entry, index) => {
          const value = entry.value ?? entry.text;
          const selected = String(state.value ?? '') === String(value) || String(state.value ?? '') === String(entry.text);
          return (
            <div
              key={index}
              className={`gc-designer-combo-simple-item${selected ? ' gc-designer-ribbon-list-item-selected' : ''}`}
              role="option"
              aria-selected={selected}
              onClick={() => { d.executeCommand(command, command, value); d.openMenu = null; d.invalidate(); }}
            >
              {entry.text}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="gc-designer-ribbon-menu-list">
      {list.map((entry, index) => {
        const value = entry.value ?? entry.text;
        const selected = String(state.value ?? '') === String(value) || String(state.value ?? '') === String(entry.text) || (command === 'ribbonNumberFormat' && String(state.text ?? '') === String(entry.text));
        return (
          <div
            key={index}
            className={`gc-designer-ribbon-list-item-container gc-designer-combo-icon-item gc-designer-list-content-item-focusable${selected ? ' gc-designer-ribbon-list-item-selected' : ''}`}
            role="menuitem"
            onClick={() => { d.executeCommand(command, command, value); d.openMenu = null; d.invalidate(); }}
          >
            <div className="gc-designer-ribbon-list-item-left">
              <div className={`gc-designer-ribbon-icon ${entry.iconClass ?? ''}`}>{entry.iconClass ? <DesignerIcon className={entry.iconClass} /> : isCalculation && selected ? <DesignerIcon className="context-check-green" /> : <span className="gc-designer-menu-spacer" />}</div>
            </div>
            <div className="gc-designer-ribbon-list-item-center"><div className="gc-designer-ribbon-text">{entry.text}</div></div>
          </div>
        );
      })}
      {command === 'ribbonNumberFormat' && <>
        <div className="gc-designer-ribbon-separator-horizontal" />
        <div className="gc-designer-ribbon-list-item-container gc-designer-combo-icon-item gc-designer-list-content-item-focusable" role="menuitem" onClick={() => { d.openMenu = null; d.showFormatCells('number'); }}>
          <div className="gc-designer-ribbon-list-item-left"><div className="gc-designer-ribbon-icon" /></div>
          <div className="gc-designer-ribbon-list-item-center"><div className="gc-designer-ribbon-text">More Number Formats...</div></div>
        </div>
      </>}
    </div>
  );
}

function ColorMenu({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-designer-color-menu">
      <div className="gc-designer-color-menu-title">Theme Colors</div>
      <div className="gc-designer-color-grid">
        {colorSwatches.flat().map((color, index) => (
          <div key={index} className="gc-designer-color-cell" style={{ background: color }} onClick={() => { d.executeCommand(command, command, color); d.openMenu = null; d.invalidate(); }} />
        ))}
      </div>
      <div className="gc-designer-color-menu-title">Standard Colors</div>
      <div className="gc-designer-color-grid">
        {['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'].map((color) => (
          <div key={color} className="gc-designer-color-cell" style={{ background: color }} onClick={() => { d.executeCommand(command, command, color); d.openMenu = null; d.invalidate(); }} />
        ))}
      </div>
      {command === 'focusCellColor'
        ? <div className="gc-designer-color-menu-footer sd-more-colors" onClick={() => { d.openMenu = null; d.showDialog('tabColorDialog', { red: '', green: '', blue: '', current: '#FFFFFF' }, () => undefined); }}>More Colors...</div>
        : <div className="gc-designer-color-menu-footer" onClick={() => { d.executeCommand(command, command, 'transparent'); d.openMenu = null; d.invalidate(); }}>No Fill</div>}
    </div>
  );
}

const tableThemes = Array.from({ length: 60 }, (_, index) =>
  index < 21 ? `light${index + 1}` : index < 49 ? `medium${index - 20}` : `dark${index - 48}`,
);

function TableGallery(): React.ReactElement {
  const d = useDesigner();
  // TASK 65: custom table styles created by the New Table Style dialog get their own
  // "Custom" section above Light, exactly like the trial's gallery.
  const customs = customTableThemeTiles(d);
  const sections = [
    ...(customs.length ? [{ title: 'Custom', themes: [] as string[] }] : []),
    { title: 'Light', themes: tableThemes.slice(0, 21) },
    { title: 'Medium', themes: tableThemes.slice(21, 49) },
    { title: 'Dark', themes: tableThemes.slice(49) },
  ];
  return (
    <div className="gc-designer-gallery gc-designer-table-gallery">
      {sections.map((section) => (
        <div key={section.title} className="gc-designer-gallery-section gc-designer-table-section">
          <div className="gc-designer-gallery-title">{section.title}</div>
          <div className="gc-designer-gallery-grid">
            {section.title === 'Custom' && customs.map((tile) => <CustomTableThemeTile key={tile.name} name={tile.name} preview={tile.theme} />)}
            {section.themes.map((theme) => <TableThemeTile key={theme} theme={theme} />)}
          </div>
        </div>
      ))}
      <div className="gc-designer-gallery-footer" onClick={() => { d.openMenu = null; d.invalidate(); d.showNewTableStyleDialog(); }}>
        <DesignerIcon className="ribbon-button-new-table-style-element" size={16} /> <span>New Table Style...</span>
      </div>
    </div>
  );
}
/** One custom-theme tile: the theme drawn by the dialog's own preview painter. */
function CustomTableThemeTile({ name, preview }: { name: string; preview: PreviewTheme }): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-designer-gallery-tile gc-designer-table-tile gc-designer-custom-table-tile" title={name} data-value={name}
      onClick={() => { d.executeCommand('formatTableListContent', 'formatTableListContent', name); d.openMenu = null; d.invalidate(); }}>
      <TablePreview theme={preview} width={59} height={44} />
    </div>
  );
}
function TableThemeTile({ theme }: { theme: string }): React.ReactElement {
  const d = useDesigner();
  // TASK 55: the trial previews mini tables whose rows carry hairline "text" dashes; variants
  // every third style additionally band the columns (own drawing, no copied artwork).
  const n = Number(/(\d+)$/.exec(theme)?.[1] ?? '0');
  const solidHeader = !theme.startsWith('light');
  const classes = `gc-designer-table-preview ${theme}${solidHeader ? ' sd-solid-header' : ''}${n % 3 === 1 ? ' sd-col-bands' : ''}`;
  return (
    <div className="gc-designer-gallery-tile gc-designer-table-tile" title={theme} data-value={theme} onClick={() => { d.executeCommand('formatTableListContent', 'formatTableListContent', theme); d.openMenu = null; d.invalidate(); }}>
      <div className={classes} data-theme={theme}>
        <div className="gc-designer-table-preview-header" />
        <div className="gc-designer-table-preview-row" />
        <div className="gc-designer-table-preview-row alt" />
        <div className="gc-designer-table-preview-row" />
        <div className="gc-designer-table-preview-row alt" />
        <div className="gc-designer-table-preview-row" />
      </div>
    </div>
  );
}

/** Gallery icons for the cell-type tiles: every glyph is drawn by hand (SVG shapes), per the
 *  clean-room rules. Positions/sizes follow the official layout (16px icon left, label right). */
function CellTypeIcon({ name }: { name: string }): React.ReactElement {
  const stroke = { stroke: '#5b5b5b', strokeWidth: 1, fill: 'none' } as const;
  let body: React.ReactNode;
  switch (name) {
    case 'Color':
      body = (<g><rect x={1} y={1} width={6} height={6} fill="#e03b3b" /><rect x={8} y={1} width={6} height={6} fill="#2e9e3f" /><rect x={1} y={8} width={6} height={6} fill="#2f5fc4" /><rect x={8} y={8} width={6} height={6} fill="#e6b422" /></g>);
      break;
    case 'DateTime':
      body = (<g><rect x={1.5} y={2.5} width={10} height={11} {...stroke} /><path d="M1.5 5.5h10" {...stroke} /><path d="M4 1v3M9 1v3" {...stroke} /><rect x={3.5} y={7.5} width={2} height={2} fill="#5b5b5b" /><rect x={7} y={7.5} width={2} height={2} fill="#5b5b5b" /><circle cx={12.5} cy={12.5} r={3} {...stroke} fill="#ffffff" /><path d="M12.5 11v1.5h1.2" {...stroke} /></g>);
      break;
    case 'DateRange':
      body = (<g><rect x={2.5} y={1.5} width={11} height={10} {...stroke} /><path d="M2.5 4.5h11" {...stroke} /><path d="M5 0.5v3M11 0.5v3" {...stroke} /><path d="M2 14h10M2 14l2-1.5M2 14l2 1.5M12 14l-2-1.5M12 14l-2 1.5" {...stroke} /></g>);
      break;
    case 'Time':
      body = (<g><circle cx={8} cy={8} r={6.5} {...stroke} /><path d="M8 4.5V8l2.8 1.8" {...stroke} /></g>);
      break;
    case 'Calculator':
      body = (<g><rect x={3} y={1.5} width={10} height={13} rx={1.5} {...stroke} /><rect x={4.8} y={3.3} width={6.4} height={2.6} fill="#c9d7ea" stroke="#5b5b5b" strokeWidth={0.6} /><g fill="#5b5b5b"><rect x={5} y={7.6} width={1.8} height={1.8} /><rect x={8} y={7.6} width={1.8} height={1.8} /><rect x={11} y={7.6} width={1.2} height={5.4} /><rect x={5} y={10.4} width={1.8} height={1.8} /><rect x={8} y={10.4} width={1.8} height={1.8} /><rect x={5} y={13.2} width={4.8} height={1.2} /></g></g>);
      break;
    case 'Month':
      body = (<g><rect x={1.5} y={2.5} width={13} height={12} {...stroke} /><path d="M1.5 5.5h13" {...stroke} /><path d="M4.5 1v3M11.5 1v3" {...stroke} /><g fill="#5b5b5b"><rect x={3.5} y={7.2} width={1.6} height={1.6} /><rect x={7.2} y={7.2} width={1.6} height={1.6} /><rect x={10.9} y={7.2} width={1.6} height={1.6} /><rect x={3.5} y={10.6} width={1.6} height={1.6} /><rect x={7.2} y={10.6} width={1.6} height={1.6} /></g></g>);
      break;
    case 'Slider':
      body = (<g><path d="M1.5 8h13" {...stroke} /><rect x={1.5} y={2} width={2} height={12} {...stroke} /><circle cx={6} cy={8} r={3} fill="#4a86e8" stroke="#3567b2" strokeWidth={1} /></g>);
      break;
    case 'NumberRange':
      body = (<g><path d="M1.5 8h13" {...stroke} /><circle cx={5} cy={8} r={2.6} fill="#4a86e8" stroke="#3567b2" strokeWidth={1} /><circle cx={11} cy={8} r={2.6} fill="#4a86e8" stroke="#3567b2" strokeWidth={1} /><path d="M5 8h6" stroke="#3567b2" strokeWidth={1.6} /></g>);
      break;
    case 'OKCancel':
      body = (<g><path d="M1.5 8l2.5 2.8L8.5 4" stroke="#2e9e3f" strokeWidth={1.8} fill="none" /><path d="M9.5 6.5l5 5M14.5 6.5l-5 5" stroke="#c0392b" strokeWidth={1.6} fill="none" /></g>);
      break;
    case 'Clear':
      body = (<g><path d="M4 13.5L1 10.5 8.5 3l5 5-6.5 6.5H14" {...stroke} /><path d="M6 5.5l5 5" {...stroke} /></g>);
      break;
    default:
      body = <circle cx={8} cy={8} r={6} {...stroke} />;
  }
  return <svg className="gc-designer-cell-type-icon" viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">{body}</svg>;
}

function CellStylesGallery(): React.ReactElement {
  const d = useDesigner();
  const custom = customCellStyles(d);
  const apply = (value: string): void => { d.executeCommand('cellStylesListContent', 'cellStylesListContent', value); d.openMenu = null; d.invalidate(); };
  return (
    <div className="gc-designer-gallery gc-designer-cell-styles-gallery">
      {custom.length > 0 && (
        <div key="Custom" className="gc-designer-gallery-section">
          <div className="gc-designer-gallery-title">Custom</div>
          <div className="gc-designer-cell-style-grid gc-designer-cell-style-grid-6">
            {custom.map((style) => (
              <div key={style.name} className="gc-designer-cell-style-tile" title={style.name} data-value={style.name} onClick={() => apply(style.name)}>
                <div className="gc-designer-cell-style-preview" style={{ background: style.backColor ?? '#ffffff', color: style.foreColor ?? '#000000', font: style.font ?? undefined }}>{style.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {cellStyleGroups.map((group) => (
        <div key={group.name} className="gc-designer-gallery-section">
          <div className="gc-designer-gallery-title">{group.name}</div>
          <div className={`gc-designer-cell-style-grid gc-designer-cell-style-grid-${group.columns}`}>
            {group.styles.map((style) => {
              const value = (style.style ?? {}) as Record<string, unknown>;
              const payload = String((style as { value?: string }).value ?? style.name);
              const previewCss = (style as { previewCss?: Record<string, string> }).previewCss;
              const plain = !!(style as { plain?: boolean }).plain;
              const textStyle: React.CSSProperties = {
                background: (value.backColor as string | undefined) ?? '#ffffff',
                color: (value.foreColor as string | undefined) ?? '#000000',
                fontWeight: (value.fontWeight as string | undefined) ?? 'normal',
                fontStyle: (value.fontStyle as string | undefined) ?? 'normal',
                textDecoration: (value.textDecoration as string | undefined) ?? 'none',
                fontSize: value.fontSize ? String(value.fontSize) : undefined,
                fontFamily: value.fontFamily ? `${String(value.fontFamily)}, 'Segoe UI', sans-serif` : undefined,
                ...(previewCss ?? {}),
              };
              return (
                <div key={style.name} className={`gc-designer-cell-style-tile${style.kind === 'cellType' ? ' gc-designer-cell-type-tile' : ''}`} title={style.name} data-value={payload} onClick={() => apply(payload)}>
                  {style.kind === 'cellType' ? (
                    <span className="gc-designer-cell-type-row"><CellTypeIcon name={style.name} /><span className="gc-designer-cell-type-label">{style.name}</span></span>
                  ) : (
                    <div className={`gc-designer-cell-style-preview${plain || previewCss ? ' sd-style-plain' : ''}`} style={textStyle}>{style.preview ?? 'Aa'}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="gc-designer-gallery-footer" onClick={() => { d.openMenu = null; d.invalidate(); d.showNewCellStyleDialog(); }}><DesignerIcon className="gallery-new-cell-style" size={16} /><span>New Cell Style...</span></div>
      <div className="gc-designer-gallery-footer" onClick={() => { d.openMenu = null; d.invalidate(); d.showManageCellStatesDialog(); }}><DesignerIcon className="gallery-manage-cell-states" size={16} /><span>Manage Cell States</span></div>
    </div>
  );
}

/* --- Conditional Formatting gallery flyouts (TASK 55) ----------------------------------
 * The trial opens Data Bars / Color Scales / Icon Sets as small tile galleries (colored
 * previews instead of text rows) with the group captions, a separator and "More Rules...".
 * Every preview is our own SVG geometry; captions follow the public command contract. */

const dataBarColors: Array<[string, string, string]> = [
  // [name, solid, gradient-inner] — Blue, Green, Red, Orange, Light Blue, Purple.
  ['Blue', '#3579c9', '#9dc3e6'], ['Green', '#45ba6f', '#a1dcb6'], ['Red', '#e03b3b', '#f0a0a0'],
  ['Orange', '#f79646', '#fcd3b0'], ['Light Blue', '#6ea6e0', '#c0d9f2'], ['Purple', '#7030a0', '#c4a3dd'],
];

const colorScalePairs: Array<[string, string[]]> = [
  ['colorScaleGyr', ['#45ba6f', '#ffca00', '#e03b3b']], ['colorScaleRyg', ['#e03b3b', '#ffca00', '#45ba6f']],
  ['colorScaleGwr', ['#45ba6f', '#ffffff', '#e03b3b']], ['colorScaleRwg', ['#e03b3b', '#ffffff', '#45ba6f']],
  ['colorScaleBwr', ['#3579c9', '#ffffff', '#e03b3b']], ['colorScaleRwb', ['#e03b3b', '#ffffff', '#3579c9']],
  ['colorScaleWr', ['#ffffff', '#e03b3b']], ['colorScaleRw', ['#e03b3b', '#ffffff']],
  ['colorScaleGw', ['#45ba6f', '#ffffff']], ['colorScaleWg', ['#ffffff', '#45ba6f']],
  ['colorScaleGy', ['#45ba6f', '#ffca00']], ['colorScaleYg', ['#ffca00', '#45ba6f']],
];

/** Mini icon-set previews: 3-5 tiny marks in a row, all hand-drawn (never copied artwork). */
function IconSetPreview({ id }: { id: string }): React.ReactElement {
  // Official directions per index (TASK 55 pass-2, black-box zoom): 3 arrows = up/right/down,
  // 4 = up/up-right/down-right/down, 5 = up/up-right/right/down-right/down.
  const DIRS: Record<number, Array<'u' | 'r' | 'd' | 'ur' | 'dr'>> = {
    3: ['u', 'r', 'd'], 4: ['u', 'ur', 'dr', 'd'], 5: ['u', 'ur', 'r', 'dr', 'd'],
  };
  const arrow = (x: number, color: string, dir: 'u' | 'r' | 'd' | 'ur' | 'dr'): React.ReactElement => {
    const d = dir === 'u' ? `M${x} 10.5V2.5m-2.4 2.6L${x} 1.2l2.4 3.9`
      : dir === 'd' ? `M${x} 1.5v8m-2.4-2.6L${x} 10.8l2.4-3.9`
        : dir === 'r' ? `M${x - 4} 6h8m-2.6-2.4L${x + 4.2} 6l-3.8 2.4`
          : dir === 'ur' ? `M${x - 3} 9L${x + 3} 3m0 0h-3m3 0v3` : `M${x - 3} 3l6 6m0 0v-3m0 3h-3`;
    return <path key={x} d={d} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />;
  };
  const dot = (x: number, color: string, rim = false): React.ReactElement =>
    <circle key={x} cx={x} cy={6} r={3.4} fill={color} stroke={rim ? '#595959' : 'none'} strokeWidth={1} />;
  const bar = (x: number, w: number, color: string): React.ReactElement => <rect key={x} x={x} y={8 - w} width={3} height={w + 2} fill={color} />;
  let body: React.ReactNode = null;
  if (id.includes('Arrows')) {
    const colored = id.includes('Colored');
    const n = id.includes('Five') ? 5 : id.includes('Four') ? 4 : 3;
    // Official: greens at the top, reds at the bottom, gold in between; grays are one dark grey.
    const cols = colored
      ? (n === 3 ? ['#45ba6f', '#ffca00', '#e03b3b'] : n === 4 ? ['#45ba6f', '#ffca00', '#ffca00', '#e03b3b'] : ['#45ba6f', '#ffca00', '#ffca00', '#ffca00', '#e03b3b'])
      : Array(n).fill('#767676');
    body = <>{DIRS[n].map((dir, i) => arrow(4 + i * 8, cols[i], dir))}</>;
  } else if (id === 'iconSet3Triangles') {
    // Official coloured triangles: green up-triangle, gold bar, red down-triangle.
    body = <><path d="M2 9.5L5.5 2.5 9 9.5z" fill="#45ba6f" /><rect x={12} y={5} width={7} height={2.6} fill="#ffca00" /><path d="M22 2.5l3.5 7 3.5-7z" fill="#e03b3b" /></>;
  } else if (id.includes('TrafficLights') || id === 'iconSetFourRedToBlack') {
    const four = id.includes('Four');
    const rimmed = id.includes('Rimmed');
    const cols = id === 'iconSetFourRedToBlack' ? ['#e03b3b', '#f4a9a0', '#a6a6a6', '#404040'] : ['#45ba6f', '#ffca00', '#e03b3b', '#404040'];
    body = <>{Array.from({ length: four ? 4 : 3 }, (_, i) => dot(4 + i * 8, cols[i], rimmed))}</>;
  } else if (id === 'iconSetThreeSigns') {
    // Official "signs": green circle, gold triangle, red diamond.
    body = <><circle cx={5} cy={6} r={3.4} fill="#45ba6f" /><path d="M14 9.5l3.5-7 3.5 7z" fill="#ffca00" /><path d="M28 2.4l3.4 3.6-3.4 3.6-3.4-3.6z" fill="#e03b3b" /></>;
  } else if (id.includes('Symbols')) {
    const circled = id.includes('Circled');
    // Official order: green check, gold exclamation, red cross.
    body = <>{['#45ba6f', '#ffca00', '#e03b3b'].map((c, i) => <g key={c}>{circled && <circle cx={5 + i * 9} cy={6} r={4.6} fill={c} stroke="none" />}{i === 0 ? <path d={`M${2.6 + i * 9} 6l1.7 2 2.9-3.8`} fill="none" stroke={circled ? '#ffffff' : c} strokeWidth={1.6} /> : i === 1 ? <><rect x={4.3 + i * 9} y={2.6} width={1.6} height={4.6} fill={circled ? '#ffffff' : c} /><rect x={4.3 + i * 9} y={8.4} width={1.6} height={1.6} fill={circled ? '#ffffff' : c} /></> : <path d={`M${3 + i * 9} 4l4 4m0-4l-4 4`} stroke={circled ? '#ffffff' : c} strokeWidth={1.6} fill="none" />}</g>)}</>;
  } else if (id === 'iconSetThreeFlags') {
    body = <>{['#45ba6f', '#ffca00', '#e03b3b'].map((c, i) => <g key={c}><path d={`M${3 + i * 9} 11V2`} stroke="#595959" strokeWidth={1.2} /><path d={`M${3 + i * 9} 2.5l6 1.8-6 1.8z`} fill={c} /></g>)}</>;
  } else if (id === 'iconSetThreeStars') {
    // Official: gold-filled, half-gold, outline-only stars.
    body = <>{[['#ffca00', '#b58900'], ['#ffe9a0', '#b58900'], ['#ffffff', '#b58900']].map(([f, s], i) => <path key={i} d={`M${5 + i * 9} 1l1.6 3.4 3.6.5-2.6 2.6.6 3.6-3.2-1.8-3.2 1.8.6-3.6L.8 4.9l3.6-.5z`} fill={f} stroke={s} strokeWidth={0.8} />)}</>;
  } else if (id.includes('Ratings')) {
    const n = id.includes('Four') ? 4 : 5;
    body = <>{Array.from({ length: n }, (_, i) => bar(2 + i * 7, i * 1.5 + 1.5, i === 0 ? '#a6a6a6' : i === 1 ? '#8fae7c' : '#3579c9'))}</>;
  } else if (id === 'iconSetFiveQuarters') {
    // Official: grey-rim pies going full dark -> empty (our own arc geometry).
    const wedge = (cx: number, frac: number): React.ReactNode => {
      if (frac <= 0) return null;
      if (frac >= 1) return <circle key={cx} cx={cx} cy={6} r={3.5} fill="#404040" />;
      const ang = frac * Math.PI * 2 - Math.PI / 2;
      const ex = cx + 3.5 * Math.cos(ang);
      const ey = 6 + 3.5 * Math.sin(ang);
      return <path key={cx} d={`M${cx} 6V2.5A3.5 3.5 0 ${frac > 0.5 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}Z`} fill="#404040" />;
    };
    body = <>{[1, 0.75, 0.5, 0.25, 0].map((frac, i) => <g key={i}>
      <circle cx={5 + i * 7.5} cy={6} r={3.5} fill="#ffffff" stroke="#595959" strokeWidth={0.9} />
      {wedge(5 + i * 7.5, frac)}
    </g>)}</>;
  } else if (id === 'iconSetFiveBoxes') {
    body = <>{Array.from({ length: 5 }, (_, i) => <rect key={i} x={1 + i * 7.5} y={2.5} width={6.5} height={6.5} fill={i < 3 ? '#3579c9' : '#e8eef6'} stroke="#3579c9" strokeWidth={1} />)}</>;
  }
  return <svg className="sd-cf-iconset-preview" viewBox="0 0 40 13" width={62} height={19} preserveAspectRatio="none" aria-hidden="true">{body}</svg>;
}

function ConditionalFormattingFlyout({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  const run = (name: string): void => { d.executeCommand(name, name); d.openMenu = null; d.invalidate(); };
  const tile = (name: string, key: React.Key, preview: React.ReactNode): React.ReactElement => (
    <div key={key} className="sd-cf-tile" role="menuitem" aria-label={name} title={name} data-command={`menu.${name}`} onClick={(event) => { event.stopPropagation(); run(name); }}>{preview}</div>
  );
  const more = (name: string): React.ReactElement => (
    <div className="sd-cf-more gc-designer-ribbon-list-item-container gc-designer-list-content-item-focusable" role="menuitem"
      aria-label="More Rules..." title="More Rules..." data-command={`menu.${name}`} onClick={(event) => { event.stopPropagation(); run(name); }}>More Rules...</div>
  );
  if (command === 'dataBar') {
    const section = (title: string, kind: 'gradientFill' | 'solidFill'): React.ReactElement => (
      <div className="sd-cf-section" key={kind}>
        <div className="gc-designer-ribbon-menu-group-title">{title}</div>
        <div className="sd-cf-tile-row sd-cf-databar-row">
          {dataBarColors.map(([label, solid, grad]) => {
            // Trial tile: a mini cell table (blue-grey border, 4 rows x 3 columns, grey value
            // dashes right) whose left column is painted with one bar per row; gradient fill
            // fades to white to the right (our own drawing; TASK 55 pass 2).
            const preview = <svg className="sd-cf-preview" viewBox="0 0 30 24" width={30} height={24} aria-hidden="true">
              {kind === 'gradientFill' && (
                <defs><linearGradient id={`sd-db-${label}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={solid} /><stop offset="100%" stopColor={grad} /></linearGradient></defs>
              )}
              <rect x={0.5} y={0.5} width={29} height={23} fill="#ffffff" stroke="#6f8bb5" />
              {[1, 2, 3].map((r) => <line key={r} x1={0.5} y1={2 + r * 5} x2={29.5} y2={2 + r * 5} stroke="#dfe6f2" strokeWidth={0.8} />)}
              {[19, 24].map((c) => <line key={c} x1={c} y1={0.5} x2={c} y2={23.5} stroke="#dfe6f2" strokeWidth={0.8} />)}
              {[0, 1, 2, 3].map((r) => <rect key={r} x={2} y={2.8 + r * 5} width={15} height={3.6} fill={kind === 'gradientFill' ? `url(#sd-db-${label})` : solid} />)}
              {[0, 1, 2, 3].map((r) => <rect key={r} x={20.5} y={4.2 + r * 5} width={3} height={1.4} fill="#8a8a8a" />)}
            </svg>;
            return tile(`${label} Data Bar`, label, preview);
          })}
        </div>
      </div>
    );
    return (
      <div className="sd-cf-flyout sd-cf-databar">
        {section('Gradient Fill', 'gradientFill')}
        {section('Solid Fill', 'solidFill')}
        <div className="gc-designer-ribbon-separator-horizontal" />
        {more('moreDataBarRules')}
      </div>
    );
  }
  if (command === 'colorScalesList') {
    // Trial tile: mini cell table (blue-grey border, 4 rows; left column painted with the scale
    // top-to-bottom, fourth row white, grey value dashes right) — our own drawing (TASK 55).
    return (
      <div className="sd-cf-flyout sd-cf-colorscales">
        <div className="gc-designer-ribbon-menu-group-title">Color Scales</div>
        <div className="sd-cf-tile-grid">{colorScalePairs.map(([name, colors], i) => {
          const mix = (a: string, b: string): string => {
            const p = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
            const m = p(a).map((v, k) => Math.round((v + p(b)[k]) / 2).toString(16).padStart(2, '0'));
            return `#${m.join('')}`;
          };
          const cols = colors.length === 3 ? colors : [colors[0], mix(colors[0], colors[1]), colors[1]];
          return tile(name, i,
          <svg className="sd-cf-preview" width={28} height={24} viewBox="0 0 30 24" aria-hidden="true" style={{ display: 'block' }}>
            <rect x={0.5} y={0.5} width={29} height={23} fill="#ffffff" stroke="#6f8bb5" />
            {cols.map((c, r) => <rect key={r} x={2} y={2.6 + r * 5} width={15} height={4} fill={c} />)}
            <line x1={0.5} y1={2} x2={29.5} y2={2} stroke="#dfe6f2" strokeWidth={0.8} />
            {[1, 2, 3].map((r) => <line key={r} x1={0.5} y1={2 + r * 5} x2={29.5} y2={2 + r * 5} stroke="#dfe6f2" strokeWidth={0.8} />)}
            {[19, 24].map((c) => <line key={c} x1={c} y1={0.5} x2={c} y2={23.5} stroke="#dfe6f2" strokeWidth={0.8} />)}
            {[0, 1, 2, 3].map((r) => <rect key={r} x={20.5} y={4.2 + r * 5} width={3} height={1.4} fill="#8a8a8a" />)}
          </svg>);
        })}
        </div>
        <div className="gc-designer-ribbon-separator-horizontal" />
        {more('moreColorScaleRules')}
      </div>
    );
  }
  const groups: Array<[string, string[]]> = [
    ['Directional', ['iconSetThreeArrowsColored', 'iconSetThreeArrowsGray', 'iconSet3Triangles', 'iconSetFourArrowsGray', 'iconSetFourArrowsColored', 'iconSetFiveArrowsGray', 'iconSetFiveArrowsColored']],
    ['Shapes', ['iconSetThreeTrafficLightsUnRimmed', 'iconSetThreeTrafficLightsRimmed', 'iconSetThreeSigns', 'iconSetFourTrafficLights', 'iconSetFourRedToBlack']],
    ['Indicators', ['iconSetThreeSymbolsCircled', 'iconSetThreeSymbolsUnCircled', 'iconSetThreeFlags']],
    ['Ratings', ['iconSetThreeStars', 'iconSetFourRatings', 'iconSetFiveQuarters', 'iconSetFiveRatings', 'iconSetFiveBoxes']],
  ];
  return (
    <div className="sd-cf-flyout sd-cf-iconsets">
      {groups.map(([title, ids]) => (
        <div className="sd-cf-section" key={title}>
          <div className="gc-designer-ribbon-menu-group-title">{title}</div>
          <div className="sd-cf-tile-row sd-cf-iconset-row">
            {ids.map((id, i) => tile(id, i, <IconSetPreview id={id} />))}
          </div>
        </div>
      ))}
      <div className="gc-designer-ribbon-separator-horizontal" />
      {more('moreIconSetRules')}
    </div>
  );
}

/* --- Named Cell Templates gallery (TASK 55) --------------------------------------------
 * The trial shows the built-in named cell-style templates in a card gallery (preview card
 * with the caption underneath, grouped under bold section titles). Every preview here is
 * our own simplified vector/HTML drawing of the corresponding motif. */

type TemplatePreview = React.ReactNode;
const td = (v: string, color?: string, align: 'left' | 'right' = 'right'): React.ReactElement =>
  <div style={{ fontSize: 7, lineHeight: '9px', color: color ?? '#333333', textAlign: align, whiteSpace: 'nowrap' }}>{v}</div>;
const bar = (width: number, color: string, value: string, alignRight = false): React.ReactElement => (
  <div style={{ display: 'flex', alignItems: 'center', height: 9, position: 'relative' }}>
    <div style={{ width, background: color, height: 7, marginLeft: alignRight ? 'auto' : 0 }} />
    <span style={{ fontSize: 7, position: 'absolute', right: 2, color: '#333333' }}>{value}</span>
  </div>
);
const namedTemplates: Array<{ title: string; cards: Array<[string, string, TemplatePreview]> }> = [
  {
    title: 'Financial',
    cards: [
      ['Financial Amount', '12,500.50', <div key="p">{td('12,500.50')}{td('-3,200.75', '#c00000')}{td('8,900.00')}{td('-1,500.25', '#c00000')}{td('45,000.00')}</div>],
      ['Growth Rate', '12.50%', <div key="p">{td('12.50%', '#2e9e3f')}{td('-5.00%', '#c00000')}{td('32.00%', '#2e9e3f')}{td('-15.00%', '#c00000')}{td('8.00%', '#2e9e3f')}</div>],
      ['Budget Variance', '+5,000.00', <div key="p">{bar(34, '#a1dcb6', '+5,000.00')}{bar(26, '#f7c5c0', '-2,500.00')}{bar(10, '#f2e5b3', '0.00')}{bar(22, '#a1dcb6', '+8,000.00')}{bar(12, '#f7c5c0', '-1,200.00')}</div>],
      ['Currency', '$1,299.99', <div key="p">{td('$1,299.99')}{td('$49.99')}{td('$899.00')}{td('$2,500.00')}{td('$150.50')}</div>],
      ['Accounting', '$ 15,000.00', <div key="p">{td('$  15,000.00')}{td('$   (7,500.00)', '#c00000')}{td('$         -')}{td('$  25,000.00')}{td('$   (3,200.00)', '#c00000')}</div>],
    ],
  },
  {
    title: 'Status & Scoring',
    cards: [
      ['Workflow Status', 'Completed', <div key="p">{['#c9ecc4', '#b9ddf7', '#e7e7e7', '#f7c5c0', '#c9ecc4'].map((c, i) => <div key={i} style={{ background: c, fontSize: 7, textAlign: 'center', height: 9, lineHeight: '9px' }}>{['Completed', 'In Progress', 'Not Started', 'Blocked', 'Completed'][i]}</div>)}</div>],
      ['Completion Bar', '100%', <div key="p">{bar(70, '#7fb2e5', '100%', true)}{bar(52, '#a6c9ee', '75%', true)}{bar(36, '#c2d9f2', '50%', true)}{bar(22, '#d8e8f7', '25%', true)}{bar(4, '#ececec', '0%', true)}</div>],
      ['Priority Level', 'High', <div key="p">{[['High', '#f2b8a0'], ['Medium', '#fbe3a1'], ['Low', '#bfe6c4'], ['High', '#f2b8a0'], ['Medium', '#fbe3a1']].map(([t, c], i) => <div key={i} style={{ background: c, fontSize: 7, textAlign: 'center', height: 9, lineHeight: '9px' }}>{t}</div>)}</div>],
      ['Due Date', '2020-06-15', <div key="p">{['2020-06-15', '2024-08-20', '2025-12-01', '2028-03-15', '2036-07-10'].map((dt, i) => <div key={i} style={{ background: ['#f2b8a0', '#fbe3a1', '#bfe6c4', '#bfe6c4', '#bfe6c4'][i], fontSize: 7, textAlign: 'center', height: 9, lineHeight: '9px' }}>{dt}</div>)}</div>],
      ['Grade Score', '95', <div key="p">{[['95', '#c9ecc4'], ['82', '#c9ecc4'], ['74', '#fbe3a1'], ['65', '#fbe3a1'], ['55', '#f2b8a0']].map(([v, c], i) => <div key={i} style={{ background: c, fontSize: 7, textAlign: 'center', height: 9, lineHeight: '9px' }}>{v}</div>)}</div>],
      ['Inventory Level', '50', <div key="p">{[['50', '#fbe3a1'], ['200', '#f7cf9f'], ['600', '#c9ecc4'], ['80', '#f2e5b3'], ['350', '#f7cf9f']].map(([v, c], i) => <div key={i} style={{ background: c, fontSize: 7, textAlign: 'right', height: 9, lineHeight: '9px', paddingRight: 3 }}>{v}</div>)}</div>],
      ['Star Rating', '\u2605\u2605\u2605', <div key="p" style={{ fontSize: 9, color: '#8cb4e2', letterSpacing: 2 }}>{'\u2605\u2605\u2605\u2606\u2606'}<div>{'\u2605\u2605\u2606\u2606\u2606'}</div><div>{'\u2605\u2606\u2606\u2606\u2606'}</div></div>],
      ['Yes/No Toggle', 'Yes', <div key="p" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span style={{ background: '#7fb2e5', color: '#fff', borderRadius: 7, fontSize: 6, padding: '1px 7px' }}>Yes</span><span style={{ background: '#d6d6d6', borderRadius: 7, fontSize: 6, padding: '1px 7px' }}>No</span><span style={{ background: '#7fb2e5', color: '#fff', borderRadius: 7, fontSize: 6, padding: '1px 7px' }}>Yes</span><span style={{ background: '#d6d6d6', borderRadius: 7, fontSize: 6, padding: '1px 7px' }}>No</span></div>],
    ],
  },
  {
    title: 'Data & Interaction',
    cards: [
      ['Heat Map', 'Heat Map', <div key="p" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>{['#3579c9', '#9dc3e6', '#3579c9', '#e8eef6', '#9dc3e6', '#e8eef6', '#f2b8a0', '#9dc3e6', '#e8eef6', '#f2b8a0', '#e03b3b', '#f2b8a0', '#9dc3e6', '#e8eef6', '#f2b8a0', '#9dc3e6'].map((c, i) => <span key={i} style={{ background: c, height: 8 }} />)}</div>],
      ['Editable Field', 'Editable Field', <div key="p"><div style={{ border: '1px solid #8cb4e2', height: 9, marginBottom: 3 }} /><div style={{ border: '1px solid #8cb4e2', height: 9, marginBottom: 3 }} /><div style={{ border: '1px solid #d0d0d0', height: 9 }} /></div>],
      ['Top/Bottom', 'Top/Bottom', <div key="p">{['#f2b8a0', '#fbe3a1', '#c9ecc4', '#e8eef6'].map((c, i) => <div key={i} style={{ height: 8, background: `linear-gradient(90deg, ${c} 30%, #ffffff 30%)` }} />)}</div>],
      ['Duplicate Check', 'Duplicate Check', <div key="p" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>{['#e8eef6', '#f2b8a0', '#e8eef6', '#f2b8a0', '#e8eef6', '#e8eef6', '#e8eef6', '#e8eef6', '#f2b8a0'].map((c, i) => <span key={i} style={{ background: c, height: 9 }} />)}</div>],
      ['Email Address', 'Email', <div key="p">{['\u2500\u2500\u2500\u2500', '\u2500\u2500\u2500\u2500', '\u2500\u2500\u2500\u2500'].map((v, i) => <div key={i} style={{ color: '#2e74c9', textDecoration: 'underline', fontSize: 7, lineHeight: '10px' }}>{v}</div>)}</div>],
      ['Active Row', 'Active Row', <div key="p">{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 8, marginBottom: 1, background: i === 1 ? '#c5ddf5' : '#ffffff', border: i === 1 ? '1px solid #6b9fd8' : '1px solid #ececec' }} />)}</div>],
      ['Hover Row', 'Hover Row', <div key="p">{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 8, marginBottom: 1, background: i === 2 ? '#eaf1f9' : '#ffffff', border: '1px solid #ececec' }} />)}</div>],
      ['Crosshair', 'Crosshair', <div key="p" style={{ position: 'relative', height: 40 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 8, marginBottom: 1, background: '#fff', border: '1px solid #ececec' }} />)}<div style={{ position: 'absolute', top: 0, bottom: 0, left: '40%', width: 12, background: '#eaf1f9' }} /></div>],
    ],
  },
];

function NamedCellTemplatesMenu(): React.ReactElement {
  return (
    <div className="gc-designer-ribbon-menu-list sd-named-templates">
      {namedTemplates.map((section) => (
        <div key={section.title}>
          <div className="gc-designer-ribbon-menu-group-title">{section.title}</div>
          <div className="sd-named-template-grid">
            {section.cards.map(([name, value, preview]) => (
              <div key={name} className="sd-named-template-card" role="menuitem" aria-label={name} title={name} data-command={`menu.namedCellTemplatesListContent.${name}`} data-value={name}>
                <div className="sd-named-template-preview" data-value={value}>{preview}</div>
                <div className="sd-named-template-caption">{name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
