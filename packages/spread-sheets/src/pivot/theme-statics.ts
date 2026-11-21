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

for (const key of keys) {
  const theme = new PivotTableTheme();
  theme.fromJSON(THEMES[key] ?? { name: key });
  (asRecord(PivotTableThemes))[key] = theme;
}
