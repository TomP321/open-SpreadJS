/* Ribbon group and control rendering: the classic/toolbar panels walk the
 * config tree (ConfigNode) and render each command with the control variant
 * the trial uses (button, big button, checkbox, combo, color picker, spinner,
 * dropdown split button, theme launchers). */
import React, { useEffect, useState } from 'react';
import { useDesigner } from '../store.js';
import type { CommandState, IButtonGroup, ICommand, ICommandGroup, IRibbonPanel } from '../types.js';
import { DesignerIcon } from '../icons.js';
import { ribbonCollapseThresholds } from '../config.js';
import { commandOf, commandText, commandTitle, currentRibbon, isBig, openRibbonMenu, resource, useRibbonWidth } from '../app-helpers.js';

/** Inside a collapsed-group flyout the trial renders small dropdown rows with their text
 *  (e.g. "Sum" / "Fill" / "Clear" in the Editing popup); on the ribbon strip they are icon-only. */
export const GroupFlyoutContext = React.createContext(false);

export function groupItems(group: IButtonGroup): { items: (ICommandGroup | string)[]; direction: string; className?: string; rootNode?: ICommandGroup } {

  const raw = group.commandGroup;
  const children = raw.children ?? raw.commands ?? [];
  if (children.length === 1 && typeof children[0] === 'object' && !children[0].command && (children[0].children || children[0].commands)) {
    const node = children[0] as ICommandGroup;
    return { items: node.children ?? node.commands ?? [], direction: node.direction ?? 'row', className: node.className, rootNode: node };
  }
  return { items: children as (ICommandGroup | string)[], direction: raw.direction ?? 'row', className: raw.className };
}

export function ClassicPanel({ panel }: { panel: IRibbonPanel }): React.ReactElement {
  const width = useRibbonWidth();
  const rules = ribbonCollapseThresholds[panel.id] ?? [];
  const collapsed = new Set(rules.filter((rule) => width <= rule.width).map((rule) => rule.label));
  const folded = panel.buttonGroups.filter((group) => collapsed.has(group.label ?? ''));
  return (
    <>
      {panel.buttonGroups.map((group, index) => {
        if (!collapsed.has(group.label ?? '')) return <ClassicGroup key={`${group.label ?? group.buttonGroupName ?? 'group'}-${index}`} group={group} />;
        const sameThumbnail = folded.filter((candidate) => candidate.thumbnailClass && candidate.thumbnailClass === group.thumbnailClass);
        const suffix = sameThumbnail.length > 1 ? `-${sameThumbnail.indexOf(group) + 1}` : '';
        return <CollapsedGroup key={`collapsed-${group.label ?? index}`} group={group} panelId={panel.id} suffix={suffix} />;
      })}
    </>
  );
}

export function ClassicGroup({ group }: { group: IButtonGroup }): React.ReactElement {
  const d = useDesigner();
  const layout = groupItems(group);
  const vertical = layout.direction === 'vertical';
  const rootClass = `gc-designer-component-container gc-designer-flex-default${vertical ? ' gc-designer-component-container-vertical' : ''}${layout.className ? ` ${layout.className}` : ''}`;
  return (
    <div className={`gc-designer-ribbon-group${group.class ? ` ${group.class}` : ''}`} aria-label={group.label}>
      <div className="gc-designer-ribbon-group-content">
        <div className={rootClass} data-direction={layout.direction}>
          {layout.items.map((item, index) => <ConfigNode key={nodeKey(item, index)} node={item} rootLevel />)}
        </div>
      </div>
      <div className="gc-designer-ribbon-group-title">{group.label}</div>
      {group.indicator && (
        <div className="gc-designer-ribbon-group-indicator" role="button" aria-label={group.indicator} onClick={() => {
          const tabs: Record<string, string> = { indicatorFonts: 'font', indicatorAlignment: 'alignment', indicatorNumbers: 'number' };
          const tab = tabs[group.indicator!];
          if (tab) d.showFormatCells(tab);
          else if (group.indicator === 'indicatorPage' || group.indicator === 'indicatorSheet') d.showPageSetup('page');
          else d.executeCommand(group.indicator!);
        }}>
          <div className="gc-designer-ribbon-group-indicator-icon" />
        </div>
      )}
    </div>
  );
}

export const collapsedGroupMetrics: Record<string, { width: number; height: number; twoLine?: boolean }> = {
  Undo: { width: 55, height: 74 }, Clipboard: { width: 64.38, height: 74 }, Font: { width: 55, height: 74 },
  Alignment: { width: 66.38, height: 74 }, Number: { width: 55.69, height: 74 }, Styles: { width: 55, height: 74 },
  Cells: { width: 55, height: 74 }, Editing: { width: 55, height: 74 },
  Tables: { width: 55, height: 74 }, Charts: { width: 55, height: 74 }, Illustrations: { width: 73.703125, height: 74 },
  Links: { width: 64.38, height: 74 }, Controls: { width: 57.6875, height: 74 },
  Themes: { width: 55, height: 74 }, 'Page Setup': { width: 75, height: 86, twoLine: true }, Background: { width: 75, height: 74 },
  'Scale to Fit': { width: 73.03125, height: 74 }, 'Sheet Options': { width: 75, height: 86, twoLine: true },
  Functions: { width: 75, height: 74 }, 'Functions Library': { width: 75, height: 86, twoLine: true },
  Names: { width: 55, height: 74 }, 'Formula Auditing': { width: 75, height: 86, twoLine: true },
  Calculation: { width: 72.38, height: 74 },
  'Data Binding': { width: 75, height: 86, twoLine: true }, 'Queries & Connections': { width: 75, height: 86, twoLine: true },
  'Sort & Filter': { width: 75, height: 86, twoLine: true }, 'Data Tools': { width: 69.484375, height: 74 }, Outline: { width: 55, height: 74 },
  Forecast: { width: 55, height: 74 },
  'Show/Hide': { width: 71.03125, height: 74 }, Zoom: { width: 55, height: 74 }, Viewport: { width: 59.484375, height: 74 },
  'Spread Settings': { width: 75, height: 86, twoLine: true }, 'Sheet Settings': { width: 75, height: 86, twoLine: true },
  'Threaded Comments': { width: 75, height: 86, twoLine: true },
};
export function CollapsedGroup({ group, panelId, suffix = '' }: { group: IButtonGroup; panelId: string; suffix?: string }): React.ReactElement {
  const d = useDesigner();
  const commandId = `ribbon.ribbonGroupId.${group.thumbnailGroupId ?? group.label ?? 'group'}${suffix}`;
  const metrics = collapsedGroupMetrics[group.label ?? ''] ?? { width: 55, height: 74 };
  const listWidth = metrics.width - 3;
  // TASK 60 item 4: the trial marks the group button while its flyout is open
  // (`gc-designer-ribbon-list-selected` on the button, `...-hover-item-selected` on the caption
  // half) and keeps a flat #ebebeb fill over the whole 52x74 button - measured with the pointer
  // parked away from the button, so it is not the hover shading.
  const menuKey = `group:${panelId}:${group.label ?? ''}`;
  const selected = d.openMenu?.command === menuKey;
  const open = (event: React.MouseEvent): void => {
    event.stopPropagation();
    const owner = event.currentTarget as HTMLElement;
    const element = owner.closest('.gcd-ribbon-group') as HTMLElement | null;
    const rect = element?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
    const anchor = new DOMRect(rect.left + 1, rect.top + metrics.height + 5, rect.width, 0);
    openRibbonMenu(d, `group:${panelId}:${group.label ?? ''}`, anchor, owner);
  };
  return (
    <div className="gcd-ribbon-group" aria-label={group.label} style={{ width: metrics.width, flex: `0 0 ${metrics.width}px` }}>
      <div
        className={`gc-designer-ribbon-list gc-designer-ribbon-list-large${selected ? ' gc-designer-ribbon-list-selected' : ''}`}
        style={{ width: listWidth, minWidth: listWidth, maxWidth: listWidth, height: metrics.height }}
        data-buttontype="dropdown"
        data-command={commandId}
        aria-label={group.label}
        aria-haspopup="true"
        title={group.label}
        role="button"
        aria-disabled="true"
        tabIndex={-1}
        onClick={open}
      >
        <div role="button" className="gc-designer-ribbon-list-hover-item ribbon-split-btn" aria-label={group.label}>
          <div className="gc-designer-ribbon-list-icon">
            <div className={`gc-designer-ribbon-icon ${group.thumbnailClass ?? ''}`}><DesignerIcon className={group.thumbnailClass} size={24} /></div>
          </div>
        </div>
        <div role="button" className="gc-designer-ribbon-list-hover-item dropdown-btn" aria-haspopup="true" aria-disabled="false" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); (event.currentTarget as HTMLElement).click(); } }}>
          <div className="gc-designer-ribbon-text" style={metrics.twoLine ? { maxWidth: 52 } : undefined}>{group.label}</div>
          <div className="ribbon-button-thumbnail-group-icon ribbon-custom-triangle-1-s" />
        </div>
      </div>
    </div>
  );
}

export function nodeKey(node: ICommandGroup | string, index: number): string {
  if (typeof node === 'string') return `${node}-${index}`;
  return `${typeof node.command === 'string' ? node.command : 'node'}-${index}`;
}

/* Shape Styles quick tiles (TASK 55): the trial shows seven large "Abc" tiles in one row,
 * followed by a two-arrow spinner that opens the whole quick-style gallery. */
const SHAPE_STYLE_RE = /^shapeStyle[1-7]$/;

export function ShapeStyleTileControl({ name }: { name: string }): React.ReactElement | null {
  const d = useDesigner();
  const command = commandOf(d, name);
  if (!command) return null;
  const state = d.getCommandState(name);
  const title = commandTitle(d, command, name);
  const disabled = state.enabled === false;
  return (
    <div
      className={`gc-shape-style-tile${disabled ? ' gc-shape-style-tile-disabled' : ''}`}
      role="button"
      aria-label={title}
      title={title}
      aria-disabled={disabled || undefined}
      data-command={`ribbon.${name}`}
      onClick={(event) => { event.stopPropagation(); if (disabled) return; d.executeCommand(name, name); d.invalidate(); }}
    >
      <DesignerIcon className={command.iconClass} size={42} />
    </div>
  );
}

function ShapeStylesMoreSpinner(): React.ReactElement {
  const d = useDesigner();
  const open = (event: React.MouseEvent): void => {
    event.stopPropagation();
    const owner = event.currentTarget as HTMLElement;
    const rect = owner.getBoundingClientRect();
    openRibbonMenu(d, 'shapeStylesMore', new DOMRect(rect.left, rect.bottom, 0, 0), owner);
  };
  return (
    <div className="gc-shape-style-spinner" role="button" aria-label="Shape Styles" aria-haspopup="true" data-buttontype="dropdown" data-command="ribbon.shapeStylesMore" onClick={open}>
      <span className="gc-shape-style-arrow" aria-hidden="true" />
      <span className="gc-shape-style-arrow gc-shape-style-arrow-down" aria-hidden="true" />
    </div>
  );
}

export function ConfigNode({ node, rootLevel }: { node: ICommandGroup | string; rootLevel?: boolean }): React.ReactElement | null {
  const d = useDesigner();
  if (typeof node === 'string') {
    if (node === 'separator') return rootLevel ? <div className="gc-designer-ribbon-separator" /> : <div className="gc-designer-component-separator-vertical" />;
    if (SHAPE_STYLE_RE.test(node)) return <ShapeStyleTileControl name={node} />;
    if (node === 'shapeStylesMore') return <ShapeStylesMoreSpinner />;
    return <CommandControl name={node} />;
  }
  if (node.type === 'separator') {
    const compact = !rootLevel || !!node.className?.startsWith('rb-sep');
    return compact ? <div className={`gc-designer-component-separator-vertical${node.className ? ` ${node.className}` : ''}`} /> : <div className={`gc-designer-ribbon-separator${node.className ? ` ${node.className}` : ''}`} />;
  }
  const commandName = typeof node.command === 'string' ? node.command : undefined;
  if (commandName === 'shapeStylesMore') return <ShapeStylesMoreSpinner />;
  if (node.command && typeof node.command === 'object') {
    return <div className="gc-designer-ribbon-menu-group-title">{resource(d, node.command.title ?? node.command.commandName ?? '')}</div>;
  }
  if (node.children || node.commands) {
    if (commandName) {
      const cmd = commandOf(d, commandName);
      if (cmd?.type === 'comboBox' || cmd?.type === 'editableSelect') return <CommandControl name={commandName} />;
      return <DropdownControl name={commandName} node={node} />;
    }
    return (
      <div className={`gc-designer-component-container gc-designer-flex-default${node.direction === 'vertical' ? ' gc-designer-component-container-vertical' : ''}${node.className ? ` ${node.className}` : ''}`} data-direction={node.direction ?? 'row'}>
        {(node.children ?? node.commands ?? []).map((child, index) => <ConfigNode key={nodeKey(child, index)} node={child} />)}
      </div>
    );
  }
  if (commandName) return <CommandControl name={commandName} />;
  return null;
}

export function CommandControl({ name, node }: { name: string; node?: ICommandGroup }): React.ReactElement | null {
  const d = useDesigner();
  const command = commandOf(d, name);
  if (!command) return null;
  const state = d.getCommandState(name);
  // TASK 74: the trial swaps the Table Binding launchers (Convert to/from Data Table) —
  // a command whose state says visible:false is not rendered on the strip either.
  if (state.visible === false) return null;
  const type = command.type ?? 'button';
  const text = commandText(d, command);
  const label = command.text ? text : '';
  const title = commandTitle(d, command, name) || name;
  const disabled = state.enabled === false;
  if (type === 'checkbox') return <CheckBoxControl name={name} command={command} state={state} title={title} text={label} disabled={disabled} />;
  if (name === 'ThemeSetting') return <ThemeSettingControl title={title} />;
  if (name === 'ThemeColors' || name === 'ThemeFonts') return <ThemeSubControl name={name} title={title} />;
  if (type === 'label') return <LabelControl name={name} text={label || title} title={title} icon={command.iconClass} width={command.maxWidth} />;
  if (type === 'spinner') return <SpinnerControl name={name} state={state} title={title} />;
  if (name === 'fontSize') return <FontSizeControl name={name} command={command} state={state} title={title} />;
  if (type === 'comboBox' || type === 'editableSelect') return <ComboBoxControl name={name} command={command} state={state} title={title} text={label} editable={type === 'editableSelect' || command.comboWidth === 100} />;
  if (type === 'colorPicker') return <ColorPickerControl name={name} command={command} state={state} title={title} disabled={disabled} />;
  if (type === 'dropdown' || node?.children || node?.commands) return <DropdownControl name={name} node={node} />;
  if (isBig(d, command)) return <BigCommandButton name={name} command={command} title={title} text={label || title} disabled={disabled} />;
  if (label) return <HorizontalCommandButton name={name} command={command} title={title} text={label} disabled={disabled} />;
  return (
    <div
      className={`gc-designer-ribbon-button${disabled ? ' gc-designer-ribbon-button-disable' : ''}`}
      role="button"
      title={title}
      aria-label={title}
      aria-disabled={disabled}
      data-command={`ribbon.${name}`}
      tabIndex={0}
      onClick={() => { if (!disabled) { d.executeCommand(name, name); d.invalidate(); } }}
    >
      <div className="gc-designer-ribbon-button-icon">
        <div className={`gc-designer-ribbon-icon ${command.iconClass ?? ''}`}>
          <DesignerIcon className={command.iconClass} />
        </div>
      </div>
    </div>
  );
}

export function ThemeSettingControl({ title }: { title: string }): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-designer-combo-container gc-theme-setting-icon" role="combobox" tabIndex={-1} title={title} aria-label={title} data-command="ribbon.ThemeSetting" onClick={() => d.executeCommand('ThemeSetting')}>
      <div className="gc-theme-setting-icon-container">
        <div className="gc-theme-setting-icon-border"><DesignerIcon className="ribbon-thumbnail-themes" size={30} /></div>
        <div className="gc-theme-setting-icon-text">Themes</div>
        <div className="gc-designer-ribbon-list-triangle" />
      </div>
    </div>
  );
}

export function ThemeSubControl({ name, title }: { name: string; title: string }): React.ReactElement {
  const d = useDesigner();
  return (
    <div className={`gc-designer-combo-container ${name === 'ThemeColors' ? 'gc-theme-color-icon' : 'gc-theme-font-icon'}`} role="combobox" tabIndex={-1} title={title} aria-label={title} data-command={`ribbon.${name}`} onClick={() => d.executeCommand(name)}>
      <div className="gc-theme-sub-icon"><DesignerIcon className={name === 'ThemeColors' ? 'ribbon-thumbnail-themes' : 'ribbon-button-textfunction'} size={16} /></div>
      <div className="gc-theme-sub-text">{name === 'ThemeColors' ? 'Colors' : 'Fonts'}</div>
      <div className="gc-designer-ribbon-list-triangle" />
    </div>
  );
}

export function LabelControl({ name, text, title, icon, width }: { name: string; text: string; title: string; icon?: string; width?: number }): React.ReactElement {
  return (
    <div className="gc-list-control-component ribbon-button-item gc-designer-ribbon-label" style={width ? { width, minWidth: width, flex: '0 0 auto' } : undefined} data-command={`ribbon.${name}`} aria-label={title} title={title}>
      {icon && <div className={`gc-designer-ribbon-icon ${icon}`}><DesignerIcon className={icon} /></div>}
      <span>{text}</span>
    </div>
  );
}

export function SpinnerControl({ name, state, title }: { name: string; state: CommandState; title: string }): React.ReactElement {
  const d = useDesigner();
  const display = (value: unknown): string => `${value ?? 100}${name === 'fitPageScale' ? '%' : ''}`;
  const [value, setValue] = useState(display(state.value));
  useEffect(() => setValue(display(state.value)), [state.value]);
  const commit = (next = value): void => {
    const parsed = Number.parseFloat(next);
    if (Number.isFinite(parsed)) d.executeCommand(name, name, Math.max(10, Math.min(400, parsed)));
    else setValue(display(state.value));
  };
  return (
    <div className="gc-designer-ribbon-spinner ribbon-button-spinner ribbon-button-item" data-command={`ribbon.${name}`} title={title} aria-label={title}>
      <input
        className="spinner-input"
        value={value}
        aria-label={title}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
        onBlur={() => commit()}
      />
      <div className="gc-designer-spinner-arrows">{[1, -1].map((step) => <button key={step} aria-label={`${step > 0 ? 'Increase' : 'Decrease'} ${title}`} onClick={() => commit(String(Math.max(10, Math.min(400, Number.parseFloat(value) + step))))}><span className={step > 0 ? 'up' : 'down'} /></button>)}</div>
    </div>
  );
}

export function BigCommandButton({ name, command, title, text, disabled }: { name: string; command: ICommand; title: string; text: string; disabled?: boolean }): React.ReactElement {
  const d = useDesigner();
  const captionLines: Record<string, string[]> = {
    insertFunction: ['Insert', 'Function'], nameManager: ['Name', 'Manager'],
    textToColumn: ['Text to', 'Columns'], removeDuplicates: ['Remove', 'Duplicates'],
    ShowThreadedComments: ['Show', 'Panel'], zoomSelection: ['Zoom to', 'Selection'],
    unfreezePanes: ['Unfreeze', 'Panes'], commandPaletteButton: ['Command', 'Palette'],
    bringShapeForward: ['Bring', 'Forward'], sendShapeBackward: ['Send', 'Backward'],
    pivotTableChangeDataSource: ['Change Data', 'Source'],
  };
  const lines = captionLines[name]?.join(' ') === text ? captionLines[name] : undefined;
  // The trial tags its Command Palette trigger with its own class so it can be styled
  // and addressed separately from the other big buttons.
  const extra = name === 'commandPaletteButton' ? ' gc-command-palette-trigger-button' : '';
  return (
    <div
      className={`gc-designer-ribbon-button gc-designer-ribbon-button-vertical gc-designer-ribbon-big-command${extra}${disabled ? ' gc-designer-ribbon-button-disable' : ''}`}
      role="button"
      title={title}
      aria-label={title}
      aria-disabled={!!disabled}
      data-command={`ribbon.${name}`}
      tabIndex={0}
      style={command.maxWidth ? { width: command.maxWidth, maxWidth: command.maxWidth } : undefined}
      onClick={() => { if (!disabled) { d.executeCommand(name, name); d.invalidate(); } }}
    >
      <div className="gc-designer-ribbon-button-icon">
        <div className={`gc-designer-ribbon-icon ${command.iconClass ?? ''}`}><DesignerIcon className={command.iconClass} size={24} /></div>
      </div>
      <div className="gc-designer-ribbon-text gc-designer-fixed-caption">{lines ? lines.map((line, i) => <span key={i}>{line}{i === 0 ? ' ' : ''}</span>) : text}</div>
    </div>
  );
}

export function HorizontalCommandButton({ name, command, title, text, disabled }: { name: string; command: ICommand; title: string; text: string; disabled: boolean }): React.ReactElement {
  const d = useDesigner();
  return (
    <div
      className={`gc-designer-ribbon-button gc-designer-ribbon-button-horizontal gc-designer-ribbon-text-button${disabled ? ' gc-designer-ribbon-button-disable' : ''}`}
      role="button"
      title={title}
      aria-label={title}
      aria-disabled={disabled}
      data-command={`ribbon.${name}`}
      tabIndex={0}
      style={command.maxWidth ? { width: command.maxWidth, minWidth: command.maxWidth, flex: '0 0 auto' } : undefined}
      onClick={() => { if (!disabled) { d.executeCommand(name, name); d.invalidate(); } }}
    >
      <div className="gc-designer-ribbon-button-icon">
        <div className={`gc-designer-ribbon-icon ${command.iconClass ?? ''}`}><DesignerIcon className={command.iconClass} /></div>
      </div>
      <div className="gc-designer-ribbon-text">{text}</div>
    </div>
  );
}

export function CheckBoxControl({ name, command, state, title, text, disabled }: { name: string; command: ICommand; state: CommandState; title: string; text: string; disabled: boolean }): React.ReactElement {
  const d = useDesigner();
  const withText = !!text && (name === 'wrapText' || isBig(d, command) || command.type === 'checkbox');
  const big = isBig(d, command);
  return (
    <label
      style={command.maxWidth ? { width: command.maxWidth, minWidth: command.maxWidth, maxWidth: command.maxWidth, flex: '0 0 auto' } : undefined}
      className={`gc-designer-ribbon-check-box${big ? ' gc-designer-ribbon-check-box-large' : ''}${withText ? ' gc-designer-ribbon-check-box-icon-text-both' : ' gc-designer-ribbon-check-box-only-icon'}${state.checked ? ' gc-designer-ribbon-check-box-checked' : ''}${disabled ? ' gc-designer-ribbon-button-disable' : ''} gc-designer-ribbon-check-box-custom-icon${command.iconClass ? '' : ' gc-designer-ribbon-check-box-text-only'}`}
      data-buttontype="checkbox"
      role="checkbox"
      title={title}
      aria-label={title}
      aria-checked={!!state.checked}
      tabIndex={0}
      data-command={`ribbon.${name}`}
      onClick={() => { if (!disabled) { d.executeCommand(name, name, !state.checked); d.invalidate(); } }}
    >
      <div className="gc-designer-ribbon-check-box-icon">
        <div className={`gc-designer-ribbon-icon ${command.iconClass ?? (state.checked ? 'ribbon-checkbox-checked' : 'ribbon-checkbox-unchecked')}`}><DesignerIcon className={command.iconClass ?? (state.checked ? 'ribbon-checkbox-checked' : 'ribbon-checkbox-unchecked')} /></div>
      </div>
      {withText && <div className="gc-designer-ribbon-text gc-designer-ribbon-check-box-item-text">{text}</div>}
    </label>
  );
}

export function FontSizeControl({ name, state, title }: { name: string; command: ICommand; state: CommandState; title: string }): React.ReactElement {
  const d = useDesigner();
  const [local, setLocal] = useState('');
  const [editing, setEditing] = useState(false);
  const value = state.value ?? 11;
  return (
    <div className="gc-designer-ribbon-editable-select" style={{ width: 50 }} data-command={`ribbon.${name}`} title={title} aria-label={title}>
      <div className="gc-edit-select">
        <input
          className="spinner-input"
          value={editing ? local : String(value)}
          title={title}
          aria-label={title}
          onFocus={() => { setEditing(true); setLocal(String(value)); }}
          onChange={(event) => setLocal(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { setEditing(false); d.executeCommand(name, name, Number(local)); }
            else if (event.key === 'Escape') setEditing(false);
          }}
          onBlur={() => setEditing(false)}
        />
        <div className="gc-designer-ribbon-list-btn" role="button" aria-label={title} onClick={() => d.executeCommand(name, name, Number(value))}>
          <div className="gc-designer-fontsize-arrow" />
        </div>
      </div>
    </div>
  );
}

export function ComboBoxControl({ name, command, state, title, editable }: { name: string; command: ICommand; state: CommandState; title: string; text?: string; editable: boolean }): React.ReactElement {
  const d = useDesigner();
  const [local, setLocal] = useState('');
  const [editing, setEditing] = useState(false);
  const value = state.value ?? '';
  const display = editing ? local : String(value ?? '');
  const width = command.comboWidth ?? (name === 'fontSize' ? 33 : 100);
  const printSize = name === 'fitPageWidth' || name === 'fitPageTall';
  const open = (event?: React.MouseEvent): void => {
    const combo = ((event?.currentTarget as HTMLElement | undefined)?.closest('.gc-designer-ribbon-comboBox')) as HTMLElement | null;
    const rect = combo?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
    openRibbonMenu(d, name, rect, combo ?? (event?.currentTarget as HTMLElement | null));
  };
  /* Static label vs editable combo: the trial's Sparkline Weight combo shows a fixed
   * "¾ pt" style label and opens its list through the caret, with no editor
   * (measure29/combo28-official.json). TASK 84 R3: only that combo gets the extra
   * `combo-static` rules — the Page Layout fit-pages labels rendered as plain
   * `gc-designer-ribbon-text` before TASK 74 too, and the class' `padding-left: 4px`
   * moved their text 4px away from the trial. */
  const editor = printSize
    ? <div className="gc-designer-ribbon-text" onClick={open}>{display}</div>
    : name === 'sparklineWeight'
      ? <div className="gc-designer-ribbon-text gc-designer-ribbon-combo-static" onClick={open}>{display}</div>
      : <input
        className="spinner-input"
        value={display}
        title={title}
        aria-label={title}
        onFocus={() => { setEditing(true); setLocal(String(value ?? '')); }}
        onChange={(event) => setLocal(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            setEditing(false);
            const next = name === 'fontSize' ? Number(local) : local;
            d.executeCommand(name, name, next);
          } else if (event.key === 'Escape') { setEditing(false); }
        }}
        onBlur={() => setEditing(false)}
      />;
  const control = (
    <div
      className={`gc-designer-ribbon-comboBox gc-designer-ribbon-comboBox-size${editable ? ' gc-designer-ribbon-comboBox-editable' : ''}`}
      style={{ width }}
      data-command={printSize ? undefined : `ribbon.${name}`}
      title={title}
      aria-label={title}
    >
      {editor}
      {name !== 'fontSize' && (
        <div className="gc-designer-ribbon-list-btn" role="button" aria-label={title} onClick={open}>
          <div className="gc-designer-ribbon-list-triangle gc-designer-ribbon-toolbar-group-list-item-arrow" />
        </div>
      )}
    </div>
  );
  return printSize ? <div className="gc-designer-print-size" data-command={`ribbon.${name}`} style={{ width }}>{control}</div> : control;
}

export function ColorPickerControl({ name, command, state, title, disabled }: { name: string; command: ICommand; state: CommandState; title: string; disabled: boolean }): React.ReactElement {
  const d = useDesigner();
  const color = String(state.color ?? (name === 'backColor' ? 'transparent' : '#000000'));
  // The Sparkline tab's Style rows are 24px-high icon+label rows with a swatch
  // (trial measure9-official.json: "Sparkline Color" 120×24, "Marker Color" 107×24);
  // the Home-tab pickers keep their label-less icon+swatch form.
  const labeled = command.maxWidth !== undefined;
  const label = command.text ? resource(d, command.text) : '';
  return (
    <div
      className={`gc-designer-combo-container gc-designer-ribbon-colorPicker gc-designer-ribbon-button${labeled ? ' gc-designer-ribbon-colorPicker-labeled' : ''}${disabled ? ' gc-designer-ribbon-button-disable' : ''}`}
      data-command={`ribbon.${name}`}
      title={title}
      style={command.maxWidth ? { width: command.maxWidth, minWidth: command.maxWidth, maxWidth: command.maxWidth, flex: '0 0 auto' } : undefined}
    >
      <div
        className="gc-designer-color-picker-button"
        role="button"
        aria-label={title}
        onClick={(event) => {
          if (disabled) return;
          // Zero-width anchor: the menu host re-measures the control it belongs to (see RibbonMenu).
          openRibbonMenu(d, name, new DOMRect(0, 0, 0, 0), event.currentTarget as HTMLElement);
        }}
      >
        <div className={`gc-designer-ribbon-icon ${command.iconClass ?? ''}`}><DesignerIcon className={command.iconClass} /></div>
        {labeled && label ? <div className="gc-designer-ribbon-text">{label}</div> : null}
      </div>
      <div className="gc-designer-color-preview gc-designer-color-preview-toolbar" style={{ background: color === 'transparent' ? 'transparent' : color }} />
    </div>
  );
}

export function DropdownControl({ name, node }: { name: string; node?: ICommandGroup }): React.ReactElement {
  const d = useDesigner();
  const inGroupFlyout = React.useContext(GroupFlyoutContext);
  const command = commandOf(d, name);
  const state = d.getCommandState(name);
  const big = isBig(d, command) && !(currentRibbon(d).ribbonHeight < 115);
  const text = command?.text ? resource(d, command.text) : '';
  const title = commandTitle(d, command, name) || name;
  const disabled = state.enabled === false;
  const openMenu = (event: React.MouseEvent): void => {
    event.stopPropagation();
    // Trial behaviour (TASK 60 item 2): a greyed split button ignores both halves — the
    // caret does not open its gallery either.
    if (disabled) return;
    const target = event.currentTarget as HTMLElement;
    const control = (target.closest('.gc-designer-ribbon-list') ?? target.closest('.gc-designer-ribbon-comboBox') ?? target) as HTMLElement;
    const rect = control.getBoundingClientRect();
    openRibbonMenu(d, name, rect, control);
  };
  const main = (event: React.MouseEvent): void => {
    event.stopPropagation();
    if (disabled) return;
    if (name === 'pasteAll' || name === 'formatPainter') {
      d.executeCommand(name, name);
      d.invalidate();
    } else if (name === 'focusCell') {
      // The official split button toggles the highlight on the main click and only the arrow opens the menu.
      d.executeCommand('focusCell', 'focusCell');
      d.invalidate();
    } else if (name === 'insertPivotTable') {
      // The trial's PivotTable big button runs its command on the main click
      // (only the caret opens the From Data Table menu).
      d.executeCommand(name, name);
      d.invalidate();
    } else if (command?.type === 'dropdown' || big || name === 'editingSortFilter' || name === 'editingFind' || name === 'editingAutoSum' || name === 'border' || name === 'mergeCenter' || name === 'orientationList' || name === 'clear' || name === 'editingFillDown') {
      openMenu(event);
    } else {
      d.executeCommand(name, name);
      d.invalidate();
    }
  };
  if (!command?.iconClass && !text && name !== 'pasteAll') {
    return (
      <div
        className={`gc-designer-ribbon-list gc-designer-ribbon-list-horizontal gc-designer-ribbon-list-overflow${disabled ? ' gc-designer-ribbon-list-disabled' : ''}`}
        data-buttontype="dropdown"
        data-command={`ribbon.${name}`}
        aria-label={title}
        aria-haspopup="true"
        title={title}
        role="button"
        tabIndex={-1}
      >
        <div className="gc-designer-ribbon-list-hover-item" role="button" onClick={openMenu}>
          <div className="gc-designer-ribbon-list-triangle" />
        </div>
      </div>
    );
  }
  if (big) {
    return (
      <div
        className={`gc-designer-ribbon-list gc-designer-ribbon-list-large gc-designer-ribbon-list-split${name === 'pasteAll' ? ' gc-designer-ribbon-paste-dropdown' : ''}${disabled ? ' gc-designer-ribbon-list-disabled' : ''}`}
        data-buttontype="dropdown"
        data-command={`ribbon.${name}`}
        aria-label={title}
        aria-haspopup="true"
        title={title}
        role="button"
        tabIndex={-1}
      >
        <div role="button" className="gc-designer-ribbon-list-hover-item ribbon-split-btn" aria-label={title} onClick={main}>
          <div className="gc-designer-ribbon-list-icon">
            <div className={`gc-designer-ribbon-icon ${command?.iconClass ?? ''}`} style={{ width: 24, height: 24 }}><DesignerIcon className={command?.iconClass} size={24} /></div>
          </div>
        </div>
        <div role="button" className="gc-designer-ribbon-list-hover-item dropdown-btn" aria-haspopup="true" onClick={openMenu}>
          <div className="gc-designer-ribbon-text">{text}</div>
          <div className="gc-designer-ribbon-list-triangle" />
        </div>
      </div>
    );
  }
  // TASK 74: the trial's Sparkline ▸ Group ▸ Clear split button shows "Clear" text on the ribbon.
  const showText = !!text && (inGroupFlyout || node?.command === 'mergeCenter' || name === 'group' || name === 'ungroup' || name === 'clearSparkline' || currentRibbon(d).ribbonHeight < 115);
  return (
    <div
      className={`gc-designer-ribbon-list gc-designer-ribbon-list-horizontal${showText ? ' gc-designer-ribbon-list-split' : ''}${disabled ? ' gc-designer-ribbon-list-disabled' : ''}`}
      data-buttontype="dropdown"
      data-command={`ribbon.${name}`}
      aria-label={title}
      aria-haspopup="true"
      title={title}
      role="button"
      tabIndex={-1}
    >
      <div role="button" className="gc-designer-ribbon-list-hover-item ribbon-split-btn" aria-label={title} onClick={main}>
        <div className="gc-designer-ribbon-list-icon">
          <div className={`gc-designer-ribbon-icon ${command?.iconClass ?? ''}`}><DesignerIcon className={command?.iconClass} /></div>
        </div>
        {showText && <div className="gc-designer-ribbon-text">{text}</div>}
      </div>
      <div role="button" className="gc-designer-ribbon-list-hover-item dropdown-btn" aria-haspopup="true" aria-label={title} onClick={openMenu}>
        <div className="gc-designer-ribbon-list-triangle" />
      </div>
    </div>
  );
}

/* Toolbar mode ----------------------------------------------------------- */

export function ToolbarPanel({ panel }: { panel: IRibbonPanel }): React.ReactElement {
  return (
    <>
      {panel.buttonGroups.map((group, index) => <ToolbarGroup key={index} group={group} />)}
      <div className="gc-designer-ribbon-toolbar-overflow" role="button" aria-label="More Options" onClick={() => { /* overflow is represented by the groups */ }}>
        <span>⋯</span>
      </div>
    </>
  );
}
export function ToolbarGroup({ group }: { group: IButtonGroup }): React.ReactElement {
  const layout = groupItems(group);
  return (
    <div className={`gc-designer-ribbon-toolbar-group ${group.buttonGroupName?.toLowerCase().replace(/\W+/g, '-') ?? ''}`} data-group={group.buttonGroupName}>
      {layout.items.map((item, index) => <ConfigNode key={nodeKey(item, index)} node={item} />)}
    </div>
  );
}
