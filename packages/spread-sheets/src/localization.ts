/**
 * Culture-switched UI strings for the core's own user-facing chrome (context
 * menus, filter dialogs, pivot/slicer panels, comment UI, status bar labels).
 *
 * The mechanism is the official one: `CultureManager.addCultureInfo(name,
 * culture, language)` stores a language (resource) object per culture and
 * `CultureManager.getResources()` exposes it. English is the built-in default:
 * every string call carries its English text, so without any registered
 * language object the UI is byte-identical to the unlocalised build. A
 * resources package (e.g. `@opensheets/spread-sheets-resources-it`, which
 * registers the `it-it` language table) switches every core string at runtime.
 *
 * Lookup walks the language object along the key path, case-insensitive per
 * segment, so `"contextMenu.gc.spread.copy"` resolves
 * `{ contextMenu: { gc: { spread: { copy: "Copia" } } } }` — the natural shape
 * for a language package (the menu item names are the resource keys).
 */
import { CultureManager } from './culture.js';

type LanguageNode = Record<string, unknown>;

let cacheKey = '';
let cacheResources: LanguageNode | undefined;

function currentResources(): LanguageNode | undefined {
  // The culture name plus the registration generation: a resources package may
  // (re)register the language object of a culture that is already current.
  const key = `${CultureManager.culture()}#${CultureManager._cultureGeneration()}`;
  if (key === cacheKey) return cacheResources;
  cacheKey = key;
  const name = CultureManager.culture();
  const value = CultureManager.getResources(name);
  cacheResources = value && typeof value === 'object' && Object.keys(value).length ? (value as LanguageNode) : undefined;
  return cacheResources;
}

/** Forces the next lookup to re-read the culture resources (used by tests). */
export function _resetResourceCache(): void {
  cacheKey = '';
  cacheResources = undefined;
}

/** Localised string for `path`, or `fallback` when the culture registers no language object. */
export function ltext(path: string, fallback: string, ...args: (string | number)[]): string {
  const resources = currentResources();
  if (!resources) return substitute(fallback, args);
  const dot = path.indexOf('.');
  if (dot < 0) return substitute(fallback, args);
  const namespaceKey = Object.keys(resources).find((k) => k.toLowerCase() === path.slice(0, dot).toLowerCase());
  const namespace = namespaceKey === undefined ? undefined : resources[namespaceKey];
  const key = path.slice(dot + 1);
  const value = lookup(namespace, key);
  return substitute(typeof value === 'string' ? value : fallback, args);
}

/**
 * Looks a resource key up in a namespace object: the exact key first (menu
 * names contain dots, e.g. `contextMenu['gc.spread.copy']`), then case-insensitive,
 * then the dot-separated path segment by segment (nested resource tables).
 */
function lookup(namespace: unknown, key: string): unknown {
  if (typeof namespace !== 'object' || namespace === null) return undefined;
  const table = namespace as LanguageNode;
  if (Object.hasOwn(table, key)) return table[key];
  const flat = Object.keys(table).find((k) => k.toLowerCase() === key.toLowerCase());
  if (flat !== undefined) {
    const value = table[flat];
    if (typeof value === 'string' || typeof value !== 'object' || value === null) return value;
  }
  let value: unknown = table;
  for (const segment of key.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    const segmentKey = Object.keys(value).find((k) => k.toLowerCase() === segment.toLowerCase());
    if (segmentKey === undefined) return undefined;
    value = (value as LanguageNode)[segmentKey];
  }
  return value;
}

function substitute(text: string, args: (string | number)[]): string {
  if (!args.length) return text;
  return args.reduce<string>((acc, arg, i) => acc.replace(`{${i}}`, String(arg)), text);
}
