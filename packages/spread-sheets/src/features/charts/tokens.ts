/**
 * Scheme-colour tokens used by chart serialisation, e.g. `accent 1 0`, `text 1 85`,
 * `background 1 0`. Mirrors the trial's colour objects:
 * `{schemeClr: {val, lumMod: [n], lumOff: [n]}}` / `{srgbClr: {val: [r, g, b]}}`.
 */
import { parseColor } from '../../colors.js';

/** DrawingML scheme-part ids as emitted by the trial's chartSpace JSON. */
export const SCHEME_PART: Record<string, number> = {
  'background 1': 0, 'text 1': 1, 'background 2': 2, 'text 2': 3,
  'accent 1': 4, 'accent 2': 5, 'accent 3': 6, 'accent 4': 7, 'accent 5': 8, 'accent 6': 9,
  hyperlink: 10, 'followed hyperlink': 11,
};
const PART_NAMES = Object.fromEntries(Object.entries(SCHEME_PART).map(([name, val]) => [val, name])) as Record<number, string>;

export interface SchemeClr { val: number; lumMod?: number[]; lumOff?: number[] }
export type ColorObject = { schemeClr: SchemeClr } | { srgbClr: { val: number[] } } | { themeTint?: unknown; type?: string };

const TOKEN = /^(background [12]|text [12]|accent [1-6]|followed hyperlink|hyperlink)(?: (-?\d+(?:\.\d+)?))?$/i;

/** Parse `accent 1 0` / `text 1 85` / `background 1 0` into part + tint (-100..100). */
export function parseToken(token: unknown): { part: string; tint: number } | null {
  const match = TOKEN.exec(String(token ?? '').trim().toLowerCase());
  if (!match) return null;
  return { part: match[1], tint: match[2] === undefined ? 0 : Number(match[2]) };
}

export function tokenToColorObject(token: string): ColorObject | null {
  const parsed = parseToken(token);
  if (!parsed) return null;
  return { schemeClr: tintToScheme(SCHEME_PART[parsed.part], parsed.tint) };
}

function tintToScheme(val: number, tint: number): SchemeClr {
  const clr: SchemeClr = { val };
  if (tint > 0) { clr.lumMod = [(100 - tint) * 1000]; clr.lumOff = [tint * 1000]; }
  else if (tint < 0) clr.lumMod = [(100 + tint) * 1000];
  return clr;
}

export function colorObjectToGetter(value: unknown): string {
  const record = value as { schemeClr?: SchemeClr; srgbClr?: { val?: number[] } } | null | undefined;
  if (record?.schemeClr) {
    const part = PART_NAMES[record.schemeClr.val] ?? 'accent 1';
    const mod = (record.schemeClr.lumMod?.[0] ?? 100000) / 1000;
    const off = (record.schemeClr.lumOff?.[0] ?? 0) / 1000;
    const tint = off > 0 ? off : -(100 - mod);
    return `${part} ${tint}`;
  }
  if (record?.srgbClr?.val) return `rgb(${record.srgbClr.val.join(',')})`;
  return '';
}

/** Convert a user-supplied colour (`red`, `#abc`, `accent 1 0`, ...) into the JSON colour object form. */
export function userColorToObject(value: unknown): ColorObject | null {
  const fromToken = tokenToColorObject(String(value ?? ''));
  if (fromToken) return fromToken;
  const rgba = parseColor(String(value ?? ''));
  if (!rgba) return null;
  return { srgbClr: { val: [rgba[0], rgba[1], rgba[2]] } };
}

