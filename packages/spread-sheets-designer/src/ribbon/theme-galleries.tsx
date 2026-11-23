/* Page Layout Themes / Colors / Fonts gallery dropdown, and the PivotTable
 * Styles gallery (TASK 47). */
import React from 'react';
import { useDesigner } from '../store.js';
import { resource } from '../app-helpers.js';
import type GC from '@mescius/spread-sheets';
import { pivotTableThemes, themeColors } from '../core-internals.js';
import { customPivotThemeTiles, TablePreview } from '../dialogs/TableStyleDialogs.js';

/**
 * Page Layout Themes / Colors / Fonts gallery. Every preview is drawn from the
 * public theme API (`Themes`, `ThemeColors`, `ThemeFonts` colour and font
 * values — no official artwork); picking an entry applies the workbook theme
 * through `sheet.currentTheme()` like the trial does.
 */
export function ThemeGalleryMenu({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  const sheets = d.gc.Spread.Sheets;
  // The gallery statics are plain classes in the contract; index them by display name.
  const themeEntries = (holder: unknown): Record<string, unknown> => (holder ?? {}) as Record<string, unknown>;
  const pick = (kind: 'theme' | 'colors' | 'font', name: string): void => {
    d.openMenu = null;
    if (kind === 'theme') d.applyWorkbookTheme(name);
    else if (kind === 'colors') d.applyThemeColors(name);
    else d.applyThemeFonts(name);
    d.invalidate();
  };
  const schemeColors = (scheme: GC.Spread.Sheets.ColorScheme): string[] => (['Background 1', 'Text 1', 'Background 2', 'Text 2', 'Accent 1', 'Accent 2', 'Accent 3', 'Accent 4', 'Accent 5', 'Accent 6'] as const).map((name) => scheme.getColor(name));
  if (command === 'ThemeSetting') {
    const names: string[] = Object.keys(themeEntries(sheets.Themes));
    return (
      <div className="gc-designer-theme-tiles" role="menu" aria-label={resource(d, '${res.ribbon.commands.ThemeSetting}') || 'Themes'}>
        {names.map((name) => {
          const theme = themeEntries(sheets.Themes)[name] as GC.Spread.Sheets.Theme;
          const colors = schemeColors(theme.colors());
          return (
            <div key={name} role="menuitem" title={name} aria-label={name} data-value={name} className="gc-designer-theme-tile" onClick={() => pick('theme', name)}>
              <div className="gc-designer-theme-preview" style={{ background: colors[0], color: colors[1] }}>
                <div className="gc-designer-theme-preview-bars">{colors.slice(4).map((color, index) => <span key={index} style={{ background: color }} />)}</div>
                <div className="gc-designer-theme-preview-aa" style={{ fontFamily: `${theme.font().headingFont()}, sans-serif` }}>Aa</div>
                <div className="gc-designer-theme-preview-band" style={{ background: colors[2] }} />
              </div>
              <div className="gc-designer-theme-tile-label">{name}</div>
            </div>
          );
        })}
      </div>
    );
  }
  if (command === 'ThemeColors') {
    return (
      <div className="gc-designer-theme-list" role="menu" aria-label={resource(d, '${res.ribbon.commands.ThemeColors}') || 'Theme Colors'}>
        {Object.keys(themeEntries(sheets.ThemeColors)).map((name) => {
          const colors = schemeColors(themeEntries(sheets.ThemeColors)[name] as GC.Spread.Sheets.ColorScheme);
          return (
            <div key={name} role="menuitem" title={name} aria-label={name} data-value={name} className="gc-designer-theme-row" onClick={() => pick('colors', name)}>
              <div className="gc-designer-theme-swatches">{colors.map((color, index) => <span key={index} style={{ background: color }} />)}</div>
              <div className="gc-designer-theme-row-label">{name}</div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="gc-designer-theme-list" role="menu" aria-label={resource(d, '${res.ribbon.commands.ThemeFonts}') || 'Theme Fonts'}>
      {Object.keys(themeEntries(sheets.ThemeFonts)).map((name) => {
        const font = themeEntries(sheets.ThemeFonts)[name] as GC.Spread.Sheets.ThemeFont;
        return (
          <div key={name} role="menuitem" title={name} aria-label={name} data-value={name} className="gc-designer-theme-row" onClick={() => pick('font', name)}>
            <div className="gc-designer-theme-font-heading" style={{ fontFamily: `${font.headingFont()}, sans-serif` }}>Aa Bb Cc 123</div>
            <div className="gc-designer-theme-font-body" style={{ fontFamily: `${font.bodyFont()}, sans-serif` }}>Aa Bb Cc 123</div>
            <div className="gc-designer-theme-row-label">{name}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- PivotTable Styles gallery (TASK 47 item 3) ---------------------------
 * The 85 built-in themes come from `GC.Spread.Pivot.PivotTableThemes`; every
 * thumbnail is drawn here from the theme's own slot colours (public `toJSON()`
 * + the workbook color scheme) — no official artwork, our own SVG grid. */

/** Default workbook palette (used when the theme API is unavailable). */
const BASE_PALETTE: Record<string, string> = {
  'background 1': '#ffffff', 'text 1': '#000000', 'background 2': '#44546a', 'text 2': '#44546a',
  'accent 1': '#4472c4', 'accent 2': '#ed7d31', 'accent 3': '#a5a5a5', 'accent 4': '#ffc000', 'accent 5': '#5b9bd5', 'accent 6': '#70ad47',
};

function schemeColor(scheme: { getColor(name: string): string } | null, name: string): string {
  try {
    return scheme ? scheme.getColor(name) : BASE_PALETTE[name.toLowerCase()] ?? '#888888';
  } catch {
    return BASE_PALETTE[name.toLowerCase()] ?? '#888888';
  }
}

function mixLightness(hex: string, tint: number): string {
  const rgb = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!rgb) return hex;
  const parts = rgb.slice(1).map((part) => Number.parseInt(part, 16) / 255);
  const shifted = parts.map((channel) => {
    const light = tint > 0 ? channel + (1 - channel) * tint : channel * (1 + tint);
    return Math.round(Math.max(0, Math.min(1, light)) * 255).toString(16).padStart(2, '0');
  });
  return `#${shifted.join('')}`;
}

/**
 * Resolve one pivot color token (`Accent 1 -25`, `Text 1`, `#rrggbb`) to a CSS
 * color. The tint scaling matches how the core resolves the same tokens when
 * painting the pivot cells.
 */
function pivotColor(value: unknown, scheme: { getColor(name: string): string } | null): string | undefined {
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (/^#/.test(text)) return text;
  const match = /^(background\s+[12]|text\s+[12]|accent\s+[1-6])(?:\s+(-?\d+(?:\.\d+)?))?$/i.exec(text);
  if (!match) return undefined;
  const base = schemeColor(scheme, match[1]!.toLowerCase());
  const tint = Number(match[2] ?? 0) / 100;
  return tint ? mixLightness(base, tint) : base;
}

/** One gallery thumbnail: a mini pivot grid painted with the theme's slots
 *  (61x49 like the trial's canvas tiles: header band, banded rows, first column). */
function PivotStyleThumb({ json, scheme }: { json: Record<string, unknown>; scheme: { getColor(name: string): string } | null }): React.ReactElement {
  const slot = (name: string): Record<string, unknown> => (json[name] ?? {}) as Record<string, unknown>;
  const header = pivotColor(slot('headerRowStyle').backColor, scheme);
  const firstColumn = pivotColor(slot('firstColumnStyle').backColor, scheme);
  const stripe = pivotColor(slot('firstRowStripeStyle').backColor, scheme);
  const ink = pivotColor(slot('wholeTableStyle').foreColor, scheme) ?? '#222222';
  const cols = 4, rows = 8, cw = 15, ch = 6;
  const cells: React.ReactElement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let fill = '#ffffff';
      if (row === 0 && header) fill = header;
      else if (col === 0 && firstColumn) fill = firstColumn;
      else if (stripe && row % 2 === 1) fill = stripe;
      cells.push(<rect key={`c-${row}-${col}`} x={col * cw} y={row * ch} width={cw} height={ch} fill={fill} stroke="#d9d9d9" strokeWidth={0.4} />);
    }
    if (row > 0) for (let col = 1; col < cols; col++)
      cells.push(<line key={`m-${row}-${col}`} x1={col * cw + 2} y1={row * ch + ch / 2} x2={col * cw + cw - 4} y2={row * ch + ch / 2} stroke={ink} strokeWidth={0.9} opacity={0.5} />);
  }
  return (
    <svg width={61} height={49} viewBox={`0 0 ${cols * cw} ${rows * ch}`} aria-hidden="true" className="gc-pivot-style-thumb">
      {cells}
    </svg>
  );
}

/** The trial's gallery: a `None` tile, the Light / Medium / Dark sections of
 *  themed thumbnails, then the New Pivot Table Style / Clear commands. */
export function PivotStyleGalleryMenu(): React.ReactElement {
  const d = useDesigner();
  const pivot = d.activePivot();
  const current = pivot?.getThemeName?.() ?? '';
  const holder = pivotTableThemes(d.gc);
  let scheme: { getColor(name: string): string } | null = null;
  try {
    scheme = themeColors(d.getWorkbook().getActiveSheet());
  } catch { scheme = null; }
  const keys = Object.keys(holder).filter((key) => {
    const value = holder[key];
    return value && typeof value === 'object' && typeof value.name === 'function';
  });
  const sections: { title: string; filter: (key: string) => boolean }[] = [
    { title: 'Light', filter: (key) => key.startsWith('light') },
    { title: 'Medium', filter: (key) => key.startsWith('medium') },
    { title: 'Dark', filter: (key) => key.startsWith('dark') },
  ];
  const pick = (key: string): void => {
    d.openMenu = null;
    if (!pivot) return;
    d.executeSpecial('pivotTableStyle', key);
    d.invalidate();
  };
  /* TASK 93: the trial's gallery tiles answer a right-click menu (measured black-box):
   * custom tiles get Apply / Modify... / Duplicate... / Delete / Set As Default;
   * built-in tiles get Apply / Duplicate... / Set As Default. */
  const customs = customPivotThemeTiles(d);
  const [tileMenu, setTileMenu] = React.useState<{ name: string; builtIn: boolean; x: number; y: number } | null>(null);
  const tileMenuRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!tileMenu) return;
    const close = (event: MouseEvent): void => {
      if (tileMenuRef.current && !tileMenuRef.current.contains(event.target as Node)) setTileMenu(null);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, [tileMenu]);
  const runOnTile = (action: 'apply' | 'modify' | 'duplicate' | 'delete' | 'default', name: string, builtIn: boolean): void => {
    setTileMenu(null);
    if (action === 'apply') pick(name);
    else if (action === 'default') d.setDefaultPivotTheme(name);
    else if (action === 'modify') { d.openMenu = null; d.showNewPivotTableStyleDialog(name); }
    else if (action === 'duplicate') d.duplicatePivotTheme(name, builtIn);
    else d.deletePivotTheme(name);
  };
  const tileContextMenu = (name: string, builtIn: boolean) => (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setTileMenu({ name, builtIn, x: event.clientX, y: event.clientY });
  };
  const runCommand = (command: string): void => {
    d.openMenu = null;
    d.executeSpecial(command, null);
    d.invalidate();
  };
  const tileItems: { action: 'apply' | 'modify' | 'duplicate' | 'delete' | 'default'; text: string }[] = [
    { action: 'apply', text: resource(d, '${res.apply}') || 'Apply' },
    { action: 'modify', text: resource(d, '${res.modifyStyle}') || 'Modify...' },
    { action: 'duplicate', text: resource(d, '${res.duplicateStyle}') || 'Duplicate...' },
    { action: 'delete', text: resource(d, '${res.delete}') || 'Delete' },
    { action: 'default', text: resource(d, '${res.setAsDefault}') || 'Set As Default' },
  ];
  const tile = (key: string, name: string, builtIn: boolean, selected: boolean, child: React.ReactNode, display: string): React.ReactElement => (
    <div key={key} role="menuitemradio" aria-checked={selected} title={display} aria-label={display} data-value={key}
      className={`gc-pivot-style-tile${selected ? ' gc-pivot-style-tile-selected' : ''}`}
      onClick={() => pick(key)} onContextMenu={tileContextMenu(name, builtIn)}>
      {child}
    </div>
  );
  return (
    <div className="gc-pivot-style-gallery" role="menu" aria-label={resource(d, '${res.ribbon.commands.pivotTableStyleListContent}') || 'PivotTable Styles'}>
      {customs.length > 0 && (
        <div className="gc-pivot-style-section">
          <div className="gc-pivot-style-section-title">{resource(d, '${res.custom}') || 'Custom'}</div>
          <div className="gc-pivot-style-grid">
            {customs.map((item) => tile(item.name, item.name, false, item.name.toLowerCase() === String(current).toLowerCase(),
              <TablePreview theme={{ ...item.theme }} width={61} height={49} />, item.name))}
          </div>
        </div>
      )}
      {sections.map((section) => (
        <div key={section.title} className="gc-pivot-style-section">
          <div className="gc-pivot-style-section-title">{resource(d, `\${res.ribbon.menus.${section.title.toLowerCase()}}`) || section.title}</div>
          <div className="gc-pivot-style-grid">
            {keys.filter(section.filter).map((key) => {
              const theme = holder[key];
              if (!theme) return null;
              // The trial titles the neutral `light0` tile "None".
              const name = key === 'light0' ? 'None' : theme.name();
              const selected = name.toLowerCase() === String(current).toLowerCase();
              const display = key === 'light0' ? resource(d, '${res.settings.none}') || name : name;
              return tile(key, key, true, selected, <PivotStyleThumb json={theme.toJSON()} scheme={scheme} />, display);
            })}
          </div>
        </div>
      ))}
      <div className="gc-designer-ribbon-separator-horizontal" role="separator" />
      <div role="menuitem" className="gc-pivot-style-footer-item" onClick={() => runCommand('newPivotTableStyle')}>{resource(d, '${res.ribbon.commands.newPivotTableStyleText}') || 'New Pivot Table Style...'}</div>
      <div role="menuitem" className="gc-pivot-style-footer-item" onClick={() => runCommand('clearPivotTableStyle')}>{resource(d, '${res.ribbon.commands.clearPivotTableStyle}') || 'Clear'}</div>
      {tileMenu && (
        <div ref={tileMenuRef} className="gc-designer-context-menu gc-pivot-style-tile-menu" role="menu"
          style={{ position: 'fixed', left: tileMenu.x, top: tileMenu.y, zIndex: 12000 }}
          onContextMenu={(event) => event.preventDefault()}>
          {tileItems.filter((item) => !tileMenu.builtIn || item.action === 'apply' || item.action === 'duplicate' || item.action === 'default').map((item) => (
            <div key={item.action} role="menuitem" className="gc-designer-context-item" onClick={() => runOnTile(item.action, tileMenu.name, tileMenu.builtIn)}>{item.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}
