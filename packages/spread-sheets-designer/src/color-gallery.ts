/*
 * The workbook-theme colour gallery shared by the ribbon's colour pickers and
 * the Settings dialogs' colour combos.
 *
 * Column order, tint steps and the tint/shade swatch table were read from the
 * running v19 trial's colour gallery (Theme Colors grid: Background 1, Text 1,
 * Background 2, Text 2, Accent 1..6 with five tint/shade rows) — no vendor
 * source was inspected. Custom themes fall back to Excel tint maths.
 */

/** Gallery column names, in the trial's column order. */
export const themeColorNames = ['Background 1', 'Text 1', 'Background 2', 'Text 2', 'Accent 1', 'Accent 2', 'Accent 3', 'Accent 4', 'Accent 5', 'Accent 6'];

/** Default (Office) workbook theme colors, used when the sheet theme is unavailable. */
export const themeColorDefaults = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47'];

/** Tint percentage of every gallery row (row 0 is the base colour). */
export const themeColorTints = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [-5, 50, -10, 80, 80, 80, 80, 80, 80, 80], [-15, 35, -25, 60, 60, 60, 60, 60, 60, 60], [-25, 25, -50, 40, 40, 40, 40, 40, 40, 40], [-35, 15, -75, -25, -25, -25, -25, -25, -25, -25], [-50, 5, -90, -50, -50, -50, -50, -50, -50, -50]];

/** Tint/shade swatch colors for the default Office theme, row-major (rows 1..5). */
export const themeColorSwatches = [
  ['#F2F2F2', '#7F7F7F', '#D1D0D0', '#D6DDE4', '#DEEBF6', '#FBE6D7', '#ECECEC', '#FEF3CD', '#D9E3F2', '#E3EFDA'],
  ['#D8D8D8', '#595959', '#AEADAC', '#ADB9C9', '#BED7EE', '#F7CCAE', '#DADADA', '#FEE69A', '#B4C7E7', '#C7DFB4'],
  ['#BFBFBF', '#3F3F3F', '#777171', '#8597AF', '#9CC3E5', '#F4B185', '#C8C8C8', '#FED967', '#8EACDB', '#ABD08F'],
  ['#A5A5A5', '#262626', '#3C3939', '#334051', '#2E77B7', '#C85B11', '#7C7C7C', '#C09000', '#2F5697', '#578335'],
  ['#7F7F7F', '#0C0C0C', '#181716', '#222B36', '#1F4F7A', '#853D0B', '#525252', '#806000', '#1F3A65', '#3A5823'],
];

/** The ten solid colours of the gallery's Standard Colors row, in trial order. */
export const standardColors = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

/**
 * The ten theme colours of a sheet, read through the public
 * `sheet.currentTheme().colors()` surface, as `#RRGGBB`.
 */
export function themeColorBases(sheet: unknown): string[] {
  try {
    const owner = sheet as { currentTheme?: unknown } | null | undefined;
    const getter = owner?.currentTheme;
    const theme = (typeof getter === 'function' ? (getter as () => unknown).call(owner) : undefined) as { colors?: unknown } | null | undefined;
    const value = theme?.colors;
    const colors = typeof value === 'function' ? (value as () => unknown)() : value;
    if (!colors) return themeColorDefaults;
    const read = (value: unknown, fallback: string): string => {
      if (typeof value === 'function') return read((value as () => unknown)(), fallback);
      if (typeof value === 'string') return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
      const color = value as { getColor?: () => unknown; r?: number; g?: number; b?: number } | undefined;
      if (color && typeof color.getColor === 'function') return read(color.getColor(), fallback);
      if (color && typeof color.r === 'number' && typeof color.g === 'number' && typeof color.b === 'number') {
        return `#${[color.r, color.g, color.b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('')}`;
      }
      return fallback;
    };
    const keys = ['background1', 'textColor1', 'background2', 'textColor2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const;
    return keys.map((key, index) => read((colors as Record<string, unknown>)[key], themeColorDefaults[index]));
  } catch {
    return themeColorDefaults;
  }
}

/** Colour of one gallery cell: the trial's table for the default theme, tint maths otherwise. */
export function themeSwatchColor(bases: string[], column: number, tint: number): string {
  const base = bases[column];
  if (!tint) return base;
  if (base.toUpperCase() !== themeColorDefaults[column]) {
    const amount = Math.abs(tint) / 100;
    return `#${[1, 3, 5].map((index) => {
      const channel = parseInt(base.slice(index, index + 2), 16);
      return Math.round(channel * (1 - amount) + (tint > 0 ? 255 * amount : 0)).toString(16).padStart(2, '0');
    }).join('')}`;
  }
  const row = themeColorTints.findIndex((tints) => tints[column] === tint);
  return row > 0 ? themeColorSwatches[row - 1][column] : base;
}
