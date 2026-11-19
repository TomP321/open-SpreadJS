/* Color galleries' data: the swatch grid of the ribbon color menus and the
 * theme-color tab grid (default Office theme table + tint math for custom
 * themes), read through the public theme API only. */
import type { Worksheet } from '../core-internals.js';

export const colorSwatches = [
  ['#ffffff', '#f2f2f2', '#d9d9d9', '#bfbfbf', '#a6a6a6', '#808080', '#595959', '#404040', '#262626', '#000000'],
  ['#e7e6e6', '#d0cece', '#aeaaaa', '#757171', '#3a3838', '#f4b183', '#ed7d31', '#c55a11', '#843c0c', '#c00000'],
  ['#fff2cc', '#ffd966', '#bf9000', '#7f6000', '#c6e0b4', '#a9d08e', '#70ad47', '#548235', '#375623', '#7030a0'],
  ['#dae3f3', '#b4c6e7', '#8ea9db', '#4472c4', '#2f5597', '#1f3864', '#fbe5d6', '#f8cbad', '#f4b183', '#ed7d31'],
];

export const tabThemeNames = ['Background 1', 'Text 1', 'Background 2', 'Text 2', 'Accent 1', 'Accent 2', 'Accent 3', 'Accent 4', 'Accent 5', 'Accent 6'];
/** Default (Office) workbook theme colors, used when the sheet theme is unavailable. */
export const tabThemeDefaults = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47'];
export const tabThemeTints = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [-5, 50, -10, 80, 80, 80, 80, 80, 80, 80], [-15, 35, -25, 60, 60, 60, 60, 60, 60, 60], [-25, 25, -50, 40, 40, 40, 40, 40, 40, 40], [-35, 15, -75, -25, -25, -25, -25, -25, -25, -25], [-50, 5, -90, -50, -50, -50, -50, -50, -50, -50]];
/** Tint/shade swatch colors for the default Office theme, row-major (rows 1..5 of tabThemeTints). */
export const tabThemeSwatches = [
  ['#F2F2F2', '#7F7F7F', '#D1D0D0', '#D6DDE4', '#DEEBF6', '#FBE6D7', '#ECECEC', '#FEF3CD', '#D9E3F2', '#E3EFDA'],
  ['#D8D8D8', '#595959', '#AEADAC', '#ADB9C9', '#BED7EE', '#F7CCAE', '#DADADA', '#FEE69A', '#B4C7E7', '#C7DFB4'],
  ['#BFBFBF', '#3F3F3F', '#777171', '#8597AF', '#9CC3E5', '#F4B185', '#C8C8C8', '#FED967', '#8EACDB', '#ABD08F'],
  ['#A5A5A5', '#262626', '#3C3939', '#334051', '#2E77B7', '#C85B11', '#7C7C7C', '#C09000', '#2F5697', '#578335'],
  ['#7F7F7F', '#0C0C0C', '#181716', '#222B36', '#1F4F7A', '#853D0B', '#525252', '#806000', '#1F3A65', '#3A5823'],
];

/** Theme colors (Background 1 .. Accent 6) of the active sheet through the public theme API. */
export function tabThemeBases(sheet: Worksheet): string[] {
  try {
    const theme = typeof sheet.currentTheme === 'function' ? sheet.currentTheme() : undefined;
    const colors = theme && typeof theme.colors === 'function' ? theme.colors() : theme && typeof theme.colors === 'object' ? theme.colors : undefined;
    if (!colors) return tabThemeDefaults;
    const read = (value: unknown, fallback: string): string => {
      if (typeof value === 'function') return read((value as () => unknown)(), fallback);
      if (typeof value === 'string') return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
      const color = value as { getColor?: () => unknown; r?: number; g?: number; b?: number } | undefined;
      if (color && typeof color.getColor === 'function') return read(color.getColor(), fallback);
      if (color && typeof color.r === 'number' && typeof color.g === 'number' && typeof color.b === 'number') return `#${[color.r, color.g, color.b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
      return fallback;
    };
    return [read(colors.background1, tabThemeDefaults[0]), read(colors.textColor1, tabThemeDefaults[1]), read(colors.background2, tabThemeDefaults[2]), read(colors.textColor2, tabThemeDefaults[3]), read(colors.accent1, tabThemeDefaults[4]), read(colors.accent2, tabThemeDefaults[5]), read(colors.accent3, tabThemeDefaults[6]), read(colors.accent4, tabThemeDefaults[7]), read(colors.accent5, tabThemeDefaults[8]), read(colors.accent6, tabThemeDefaults[9])];
  } catch { return tabThemeDefaults; }
}

/** Swatch color for one grid cell: trial table for the default theme, tint math for custom themes. */
export function tabSwatchColor(bases: string[], column: number, tint: number): string {
  const base = bases[column];
  if (!tint) return base;
  if (base.toUpperCase() !== tabThemeDefaults[column]) {
    const amount = Math.abs(tint) / 100;
    return `#${[1, 3, 5].map((index) => { const channel = parseInt(base.slice(index, index + 2), 16); return Math.round(channel * (1 - amount) + (tint > 0 ? 255 * amount : 0)).toString(16).padStart(2, '0'); }).join('')}`;
  }
  const row = tabThemeTints.findIndex((tints) => tints[column] === tint);
  return row > 0 ? tabThemeSwatches[row - 1][column] : base;
}
