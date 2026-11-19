/* Bridge between the Format Cells dialog's data record and the style objects the
 * TASK 65 dialogs own (a table-theme element, a cell state, a format rule).
 * The trial stacks its Format Cells dialog over the owning dialog; our host shows one
 * dialog at a time, so the owner registers a pending pick here, the Format Cells
 * dialog hands its record to the pick instead of the sheet, and the owner re-opens
 * itself with the merged draft. All conversions live here so every dialog writes the
 * same style shape the trial does (probed: `backColor`/`foreColor`/`fontStyle`/
 * `fontWeight`/`fontSize`/`fontFamily`/`font`/six `border*` records). */
import type { DialogData } from '../designer-api.js';
import { recordView } from '../core-internals.js';
import { emptyTableElementStyle, tableElementStyleFromJSON, type TableElementStyle } from './TableStyleDialogs.js';

/** One pending Format Cells edit owned by a dialog instead of the sheet. */
export type FormatStyleTarget = {
  /** Restricts the tab strip (the trial's table-element dialog offers Font/Border/Fill). */
  tabs?: string[];
  /** Where the edited style goes; `onCancel` lets the owner dialog come back. */
  onOk: (style: Record<string, unknown>) => void;
  onCancel?: () => void;
};

let pendingTarget: FormatStyleTarget | undefined;

/** Registers a pick and answers its initial dialog data (`base` = the sheet's record). */
export function beginFormatStylePick(target: FormatStyleTarget, base: DialogData, style?: Record<string, unknown>, tabs?: string[]): DialogData {
  pendingTarget = target;
  const data = formatDataForStyle(base, style);
  if (tabs ?? target.tabs) recordView(data).formatTabs = tabs ?? target.tabs;
  return data;
}

/** Takes (and clears) the pending target; `undefined` means "format the sheet". */
export function takeFormatStyleTarget(): FormatStyleTarget | undefined {
  const target = pendingTarget;
  pendingTarget = undefined;
  return target;
}

/** The Format Cells dialog's current-tab record for one plain style record. */
export function formatDataForStyle(base: DialogData, style?: Record<string, unknown>): DialogData {
  const target = recordView({ ...base });
  if (!style) return target;
  const source = recordView(style);
  const font = String(source.font ?? '');
  const size = String(source.fontSize ?? '');
  const decoration = Number(source.textDecoration ?? 0);
  if (source.backColor !== undefined) target.backColor = source.backColor;
  if (source.foreColor !== undefined) target.color = source.foreColor;
  if (source.fontFamily || font) target.fontFamily = String(source.fontFamily ?? (/[\w\s-]+$/.exec(font)?.[0] ?? 'Calibri'));
  if (size) target.fontSize = size.replace(/pt$/i, '').replace(/px$/i, (px: string) => String(Number(px.slice(0, -2)) * 0.75));
  if (source.fontWeight !== undefined || font) {
    const bold = /bold|[6-9]00/.test(String(source.fontWeight ?? font));
    const italic = /italic|oblique/.test(String(source.fontStyle ?? font));
    target.fontStyle = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Normal';
  }
  if (source.textDecoration !== undefined) {
    target.underlineIndex = decoration & 8 ? 2 : decoration & 32 ? 4 : decoration & 16 ? 3 : decoration & 1 ? 1 : 0;
    target.strikethrough = !!(decoration & 2);
  }
  // `data.border` is the BorderTab's state object ({ edges, style, color, ... }).
  const borderState = recordView({ ...(target.border as object ?? {}) });
  const edgeMap = recordView({ ...(borderState.edges as object ?? {}) });
  const keys: [string, string][] = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']];
  for (const [, suffix] of keys) {
    const border = source[`border${suffix}`];
    if (border === undefined || border === null) continue;
    const line = recordView(border as object);
    const edgeKey = suffix === 'Horizontal' ? 'hInside' : suffix === 'Vertical' ? 'vInside' : suffix.toLowerCase();
    edgeMap[edgeKey] = Number(line.style) ? { style: Number(line.style), color: String(line.color ?? '#000000') } : null;
  }
  borderState.edges = edgeMap;
  target.border = borderState;
  target.font = undefined;
  target.cellButtons = undefined;
  return target;
}

const UNDERLINE_DECORATION = [0, 1, 8, 16, 32];

/** The Office palette our Fill/Font pickers offer (own values, matching the dialog). */
const OFFICE_PALETTE: Record<string, string> = {
  'Background 1': '#ffffff', 'Text 1': '#000000', 'Background 2': '#e7e6e6', 'Text 2': '#44546a',
  'Accent 1': '#5b9bd5', 'Accent 2': '#ed7d31', 'Accent 3': '#a5a5a5', 'Accent 4': '#ffc000',
  'Accent 5': '#4472c4', 'Accent 6': '#70ad47',
  red: '#ff0000', black: '#000000', white: '#ffffff', yellow: '#ffff00', 'light green': '#92d050',
  lightblue: '#00b0f0', 'dark red': '#c00000', purple: '#7030a0',
};

/** A CSS colour for a dialog colour token (hex passes through, names resolve). */
export function resolveColor(name: string): string | undefined {
  if (!name) return undefined;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(name) || /^(rgb|rgba|hsl)\(/i.test(name)) return name;
  const direct = OFFICE_PALETTE[name];
  if (direct) return direct;
  // Theme tints like `Accent 1 80` / `Text 1 50`: blend the base with white/black.
  const match = /^(Background \d|Text \d|Accent \d)(?: (-?\d+))?$/.exec(name);
  if (!match) return undefined;
  const base = OFFICE_PALETTE[match[1]];
  if (!base) return undefined;
  if (!match[2]) return base;
  const tint = Number(match[2]);
  const from = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = tint >= 0 ? 0xffffff : 0x000000;
  const weight = Math.min(0.95, Math.abs(tint) / 100);
  const rgb = from(base).map((c, i) => Math.round(c * (1 - weight) + (((mix >> (16 - i * 8)) & 0xff) as number) * weight));
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The plain style record the Format Cells dialog produced (trial's key set). */
export function styleFromFormatData(data: DialogData): Record<string, unknown> {
  const source = recordView(data);
  const style: Record<string, unknown> = {};
  // The Fill tab keeps its pick in a `fill` state record (same shape the Format
  // Cells command consumes): a plain colour lands in the style's `backColor`.
  // Palette names (`Accent 4`, …) are resolved to hex so the style applies and
  // the dialog previews paint it identically.
  const fill = recordView(source.fill ?? {});
  const rawBack = (fill.patternType === undefined || !fill.patternType ? fill.bg : source.backColor);
  const backColor = rawBack === undefined || rawBack === null ? undefined : resolveColor(String(rawBack));
  if (backColor) style.backColor = backColor;
  if (source.color !== undefined && source.color !== null && source.color !== '') style.foreColor = resolveColor(String(source.color)) ?? String(source.color);
  const fontState = recordView(source.font ?? {});
  const family = String(fontState.family ?? source.fontFamily ?? 'Calibri');
  const styleText = String(fontState.style ?? source.fontStyle ?? 'Normal');
  const size = String(fontState.size ?? source.fontSize ?? '11');
  const underline = fontState.underline === undefined ? Number(source.underlineIndex ?? 0) : Number(fontState.underline);
  const strike = fontState.strike === undefined ? !!source.strikethrough : !!fontState.strike;
  const italic = /italic/i.test(styleText);
  const bold = /bold/i.test(styleText);
  const sizeText = /^\d+(?:\.\d+)?$/.test(size) ? `${size}pt` : size;
  if (family) style.fontFamily = family;
  if (sizeText) style.fontSize = sizeText;
  style.fontStyle = italic ? 'italic' : 'normal';
  style.fontWeight = bold ? 'bold' : 'normal';
  style.font = `${italic ? 'italic' : 'normal'} ${bold ? 'bold' : 'normal'} ${sizeText} ${family}`;
  const decoration = (UNDERLINE_DECORATION[underline] ?? 0) | (strike ? 2 : 0);
  if (decoration) style.textDecoration = decoration;
  const borderState = recordView(source.border ?? {});
  const edges = recordView(borderState.edges ?? {});
  const mapping: [string, string][] = [['left', 'Left'], ['right', 'Right'], ['top', 'Top'], ['bottom', 'Bottom'], ['hInside', 'Horizontal'], ['vInside', 'Vertical']];
  for (const [edgeKey, suffix] of mapping) {
    const edge = recordView(edges[edgeKey] ?? {});
    style[`border${suffix}`] = { style: Number(edge.style ?? 0), ...(edge.color ? { color: String(edge.color) } : {}) };
  }
  return style;
}

/** Element style <-> plain style record conversions for the table-style dialog. */
export function elementStyleFromRecord(value: Record<string, unknown> | undefined): TableElementStyle {
  return value ? tableElementStyleFromJSON(value) : emptyTableElementStyle();
}
