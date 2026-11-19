/**
 * Built-in chart colour schemes and the namespace-level `getColor` helper.
 * Colour rules observed from the trial: cycle picks `list[i % len]`; the
 * within/across linear rules append an observed tint value to the base token
 * (within always uses `list[0]`, across uses `list[i % len]`); the reversed
 * rules return the same values as the forward rule for index `count - 1 - i`.
 */
import { parseColor } from '../../colors.js';

/** The trial's default chart palette (accent 1..6 with fixed tint ladder steps). */
export const DEFAULT_COLOR_LIST: string[] = (() => {
  const out: string[] = [];
  for (let a = 1; a <= 6; a++) out.push(`accent ${a} 0`);
  for (const tint of [-40, 20, -20, 40, -50, 30, -30, 50])
    for (let a = 1; a <= 6; a++) out.push(`accent ${a} ${tint}`);
  return out;
})();

const ACCENTS = [1, 2, 3, 4, 5, 6];
const repeat = (tints: number[], accents: number[]): string[] =>
  tints.flatMap((tint) => accents.map((a) => `accent ${a} ${tint}`));

export const COLOR_SCHEMES: Record<string, [number, string[]]> = {
  colorfulPalette1: [0, repeat([0, -40, 20, -20, 40, -50, 30, -30, 50], ACCENTS)],
  colorfulPalette2: [0, repeat([0, -40, 20, -20, 40, -50, 30, -30, 50], [1, 3, 5])],
  colorfulPalette3: [0, repeat([0, -40, 20, -20, 40, -50, 30, -30, 50], [2, 4, 6])],
  colorfulPalette4: [0, repeat([0, -40, 20, -20, 40, -50, 30, -30, 50], [6, 5, 4])],
  monochromaticPalette1: [1, ['accent 1']], monochromaticPalette2: [1, ['accent 2']],
  monochromaticPalette3: [1, ['accent 3']], monochromaticPalette4: [1, ['accent 4']],
  monochromaticPalette5: [1, ['accent 5']], monochromaticPalette6: [1, ['accent 6']],
  monochromaticPalette7: [0, ['text 1 11', 'text 1 44', 'text 1 25', 'text 1 1', 'text 1 70', 'text 1 40', 'text 1 19']],
  monochromaticPalette8: [3, ['accent 1']], monochromaticPalette9: [3, ['accent 2']],
  monochromaticPalette10: [3, ['accent 3']], monochromaticPalette11: [3, ['accent 4']],
  monochromaticPalette12: [3, ['accent 5']], monochromaticPalette13: [3, ['accent 6']],
};

/** Class exposing the built-in palettes as static members (`ColorSchemes.colorfulPalette1`). */
export class ColorSchemes {
  public static colorfulPalette1 = COLOR_SCHEMES.colorfulPalette1;
  public static colorfulPalette2 = COLOR_SCHEMES.colorfulPalette2;
  public static colorfulPalette3 = COLOR_SCHEMES.colorfulPalette3;
  public static colorfulPalette4 = COLOR_SCHEMES.colorfulPalette4;
  public static monochromaticPalette1 = COLOR_SCHEMES.monochromaticPalette1;
  public static monochromaticPalette2 = COLOR_SCHEMES.monochromaticPalette2;
  public static monochromaticPalette3 = COLOR_SCHEMES.monochromaticPalette3;
  public static monochromaticPalette4 = COLOR_SCHEMES.monochromaticPalette4;
  public static monochromaticPalette5 = COLOR_SCHEMES.monochromaticPalette5;
  public static monochromaticPalette6 = COLOR_SCHEMES.monochromaticPalette6;
  public static monochromaticPalette7 = COLOR_SCHEMES.monochromaticPalette7;
  public static monochromaticPalette8 = COLOR_SCHEMES.monochromaticPalette8;
  public static monochromaticPalette9 = COLOR_SCHEMES.monochromaticPalette9;
  public static monochromaticPalette10 = COLOR_SCHEMES.monochromaticPalette10;
  public static monochromaticPalette11 = COLOR_SCHEMES.monochromaticPalette11;
  public static monochromaticPalette12 = COLOR_SCHEMES.monochromaticPalette12;
  public static monochromaticPalette13 = COLOR_SCHEMES.monochromaticPalette13;
}

/**
 * Tint ladders measured from the trial's `getColor` (row = number of steps).
 * Values beyond the measured range fall back to a linear -60..60 ramp.
 */
const TINTS: Record<number, number[]> = {
  1: [0], 2: [-24, 23], 3: [-35, 0, 35], 4: [-42, -14, 14, 42],
  5: [-47, -24, 0, 23, 46], 6: [-50, -30, -9, 9, 30, 50],
  7: [-53, -35, -18, 0, 17, 35, 52], 8: [-55, -39, -24, -7, 6, 23, 38, 54],
  9: [-56, -42, -28, -14, 0, 14, 28, 42, 56],
  10: [-58, -44, -31, -19, -6, 6, 18, 31, 43, 57],
  11: [-59, -47, -35, -24, -12, 0, 10, 23, 35, 46, 58],
  12: [-60, -49, -38, -27, -17, -6, 5, 16, 26, 37, 48, 59],
  13: [-60, -50, -40, -30, -19, -9, 0, 9, 19, 30, 40, 50, 60],
  16: [-62, -54, -46, -38, -29, -20, -13, -5, 4, 12, 19, 28, 37, 44, 53, 61],
  20: [-64, -57, -50, -43, -37, -30, -24, -17, -9, -4, 3, 9, 16, 23, 30, 36, 43, 50, 56, 63],
};

function tintAt(index: number, steps: number): number {
  const row = TINTS[steps] ?? Array.from({ length: steps },
    (_, i) => Math.round(-60 + (120 * i) / Math.max(1, steps - 1)));
  return row[Math.min(row.length - 1, index)];
}

/** Apply a tint to an rgb token (`accent 1 -40` -> shade of accent 1); tokens pass through. */
function applyTint(base: string, tint: number): string {
  const rgba = parseColor(base);
  if (!rgba) return base;
  const target = tint >= 0 ? 255 : 0;
  const ratio = Math.abs(tint) / 100;
  const mixed = [0, 1, 2].map((i) => Math.round(rgba[i] + (target - rgba[i]) * ratio));
  return `rgb(${mixed.join(',')})`;
}

export function getColor(colorScheme: unknown, index: number, count?: number): string {
  const scheme = Array.isArray(colorScheme) ? (colorScheme as [number, string[]]) : undefined;
  const rule = Number(scheme?.[0] ?? 0), list = scheme?.[1] ?? [];
  if (!list.length) return DEFAULT_COLOR_LIST[Math.abs(index) % DEFAULT_COLOR_LIST.length];
  const total = Math.max(1, Number(count ?? 0) || 1);
  const i = Math.max(0, Number(index) || 0);
  const len = list.length;
  const linear = rule >= 1;
  if (!linear) return list[i % len];
  const reversed = rule === 3 || rule === 4;
  const idx = reversed ? Math.max(0, total - 1 - i) : i;
  const across = rule === 2 || rule === 4;
  const base = list[across ? idx % len : 0];
  const steps = Math.floor(total / len) + 1;
  const tint = across ? tintAt(Math.floor(idx / len), steps) : tintAt(idx, total);
  return /(-?\d+(?:\.\d+)?)$/i.test(base) ? `${base} ${tint}` : applyTint(base, tint);
}
