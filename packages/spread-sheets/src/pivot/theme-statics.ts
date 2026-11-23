/**
 * The 85 built-in pivot themes (TASK 41 item 3).
 * The definitions were read through the reference package's public
 * `PivotTableTheme.toJSON()` API; key order matches the trial's
 * `Object.keys(PivotTableThemes)` enumeration (light0, then light/medium/dark
 * pairs per level).
 */
import { PivotTableTheme, PivotThemeJSON } from './theme.js';
import themesJson from './themes-data.json';
import { asRecord } from '../object-access.js';

const THEMES = themesJson as Record<string, PivotThemeJSON>;

export class PivotTableThemes {
  constructor() { /* static-only container, like the trial */ }
}

const keys: string[] = ['light0'];
for (let n = 1; n <= 28; n++) keys.push(`light${n}`, `medium${n}`, `dark${n}`);
// Fall back to the JSON insertion order in case the data gains entries.
for (const key of Object.keys(THEMES)) if (!keys.includes(key)) keys.push(key);

/** Typed registry of the built-in themes (TASK 95: the single place that knows
 *  the class-object shape; callers go through `builtInPivotTheme` instead of
 *  indexing `PivotTableThemes` with casts). */
const registry = new Map<string, PivotTableTheme>();

for (const key of keys) {
  const theme = new PivotTableTheme();
  theme.fromJSON(THEMES[key] ?? { name: key });
  registry.set(key, theme);
  (asRecord(PivotTableThemes))[key] = theme;
}

/** Resolve a built-in theme by (case-insensitive) key, e.g. `medium2`. */
export function builtInPivotTheme(name: string): PivotTableTheme | undefined {
  return registry.get(String(name).toLowerCase());
}

/** The built-in theme keys in the trial's `Object.keys` order. */
export function builtInPivotThemeKeys(): string[] {
  return [...registry.keys()];
}

/** The key a theme object was registered under (undefined when it is not one
 *  of the built-in instances). */
export function builtInPivotThemeKey(theme: PivotTableTheme): string | undefined {
  for (const [key, value] of registry) if (value === theme) return key;
  return undefined;
}
