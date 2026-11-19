/**
 * Colour helpers for chart painting: resolve trial colour values
 * (`accent 1 0`, `text 1 85`, `rgb(1,2,3)`, css colours, colour objects)
 * into css colours through the sheet's workbook theme.
 */
import { parseColor, type RGBA } from '../../colors.js';
import { tintColor } from '../../themes.js';
import { colorObjectToGetter } from './tokens.js';
import type { Worksheet } from '../../worksheet.js';

const KEY_BY_VAL: Record<number, string> = {
  0: 'background 1', 1: 'text 1', 2: 'background 2', 3: 'text 2',
  4: 'accent 1', 5: 'accent 2', 6: 'accent 3', 7: 'accent 4', 8: 'accent 5', 9: 'accent 6',
  10: 'hyperlink', 11: 'followed hyperlink',
};

/** Resolve a scheme token like `accent 2 -40` through the sheet theme. */
export function resolveToken(sheet: Worksheet | undefined, token: string): string | null {
  const match = /^(background [12]|text [12]|accent [1-6]|followed hyperlink|hyperlink)(?: ([+-]?\d+(?:\.\d+)?))?$/i.exec(String(token ?? '').trim());
  if (!match) return null;
  const theme = sheet?.currentTheme?.() as { getColor?: (name: string) => string } | undefined;
  const tint = match[2] === undefined ? 0 : Number(match[2]);
  if (theme?.getColor) {
    const resolved = parseColor(theme.getColor(match[1] + (tint === 0 ? '' : ` ${tint}`)));
    if (resolved) return `rgb(${resolved[0]},${resolved[1]},${resolved[2]})`;
  }
  const base = defaultTokenColor(match[1]);
  if (!base) return null;
  const mixed: RGBA = tint === 0 ? base : tintColor({ r: base[0], g: base[1], b: base[2], a: 1 }, tint) as unknown as RGBA;
  return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
}

function defaultTokenColor(part: string): RGBA | null {
  const table: Record<string, string> = {
    'background 1': '#ffffff', 'text 1': '#000000', 'background 2': '#e7e6e6', 'text 2': '#44546a',
    'accent 1': '#5b9bd5', 'accent 2': '#ed7d31', 'accent 3': '#a5a5a5', 'accent 4': '#ffc000',
    'accent 5': '#4472c4', 'accent 6': '#70ad47', 'hyperlink': '#0563c1', 'followed hyperlink': '#954f72',
  };
  return parseColor(table[part.toLowerCase()] ?? '') ?? null;
}

/** Resolve any colour the API/JSON can carry to a css colour (`null` = none). */
export function resolveChartColor(value: unknown, sheet: Worksheet | undefined, fallback?: string): string | null {
  if (value === undefined || value === null || value === '') return fallback ?? null;
  if (typeof value === 'object') return resolveChartColor(colorObjectToGetter(value), sheet, fallback);
  const text = String(value);
  if (text === 'auto') return fallback ?? null;
  const token = resolveToken(sheet, text);
  if (token) return token;
  const rgba = parseColor(text);
  if (rgba) return `rgb(${rgba[0]},${rgba[1]},${rgba[2]})`;
  return text === 'transparent' ? 'transparent' : fallback ?? null;
}

/** Theme colour object for a scheme index inside chartSpace JSON. */
export function schemeColorCss(val: number, lumMod: number[] | undefined, lumOff: number[] | undefined, sheet: Worksheet | undefined): string | null {
  const part = KEY_BY_VAL[val] ?? 'text 1';
  const mod = (lumMod?.[0] ?? 100000) / 1000;
  const off = (lumOff?.[0] ?? 0) / 1000;
  const tint = off > 0 ? off : mod < 100 ? -(100 - mod) : 0;
  return resolveToken(sheet, `${part} ${tint}`);
}
