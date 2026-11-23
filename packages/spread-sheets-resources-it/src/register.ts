/**
 * Registers the Italian (it-IT) culture and its UI string table onto whatever
 * core the host application loaded (`@mescius/spread-sheets`, aliased to the
 * OpenSheets core in a drop-in application).
 *
 * The culture data and the string table live in the core package
 * (`packages/spread-sheets/src/it-it-formats.json`, `it-it-strings.json`), which
 * registers them as the built-in `it-it` culture (TASK 88 items 1 and 2). This
 * file imports the same JSON through a workspace-relative path, so
 * - the published bundles are self-contained (esbuild inlines the JSON: the
 *   package needs no core internals at runtime), and
 * - there is exactly one copy of the Italian data in the repository.
 *
 * `registerItalian` is idempotent: when the core already ships `it-it` (ours
 * does), the existing culture instance is kept and only its language object is
 * (re)registered. When the core does not know the culture (a core build without
 * the built-in), a `CultureInfo` of the *host's* class is filled from the data.
 */
import cultureData from '../../spread-sheets/src/it-it-formats.json';
import stringTable from '../../spread-sheets/src/it-it-strings.json';

/** Registration name; lookups are case-insensitive like the core's. */
export const cultureName = 'it-it';
/** The name `CultureInfo.name()` reports, matching the trial's built-in spelling. */
export const cultureDisplayName = 'it-IT';

/** The it-IT culture data (number/date formats, predefined Excel formats). */
export const culture = cultureData;
/** The core UI string table (`contextMenu`, `filter`, `comments`, ... namespaces). */
export const resources = stringTable;

interface CultureManagerLike {
  addCultureInfo(name: string, culture: object, language?: object): void;
  getCultureInfo(name?: string | number): object | null;
  getResources(name?: string): object;
}

interface CoreView {
  Spread?: {
    Sheets?: unknown;
    Common?: { CultureManager?: CultureManagerLike; CultureInfo?: new () => object };
    CalcEngine?: { LanguagePackages?: { languagePackages?: (name?: string | null) => unknown } };
  };
}

/**
 * Registers the culture and strings. Returns `true` when a core was found,
 * `false` (with a warning naming the fix) when the host loaded nothing — a
 * resource package must not break the page it is loaded on.
 */
export function registerItalian(gc: unknown): boolean {
  const common = (gc as CoreView | null | undefined)?.Spread?.Common;
  const manager = common?.CultureManager;
  if (!manager || typeof manager.addCultureInfo !== 'function' || typeof manager.getCultureInfo !== 'function') {
    console.warn('[opensheets/spread-sheets-resources-it] no spreadsheet core found; import/load @mescius/spread-sheets (aliased to @opensheets/spread-sheets) before this resources package.');
    return false;
  }
  const cultureInfo = manager.getCultureInfo(cultureName) ?? buildCultureInfo(common?.CultureInfo);
  const registered = manager.getResources(cultureName);
  const language = registered && typeof registered === 'object' ? { ...registered, ...resources } : { ...resources };
  manager.addCultureInfo(cultureName, cultureInfo, language);
  // TASK 89 item 6: loading this package also activates the Italian CALC LANGUAGE PACKAGE,
  // so an Italian application gets Italian UI strings AND Italian formulas (`=SOMMA(A1;A2)`)
  // from one import. A core without the language-package API simply keeps English formulas.
  try {
    (gc as CoreView)?.Spread?.CalcEngine?.LanguagePackages?.languagePackages?.('it');
  } catch {
    /* a foreign core's stub must not break the resources registration */
  }
  return true;
}

/** Fills a host-provided `CultureInfo` instance from our culture data. */
function buildCultureInfo(CultureInfoClass: (new () => object) | undefined): object {
  if (typeof CultureInfoClass !== 'function')
    throw new Error('[opensheets/spread-sheets-resources-it] the core exposes no CultureInfo class to register it-it with');
  const info = new CultureInfoClass() as Record<string, unknown>;
  Object.assign(info, {
    id: cultureData.id,
    displayName: cultureData.displayName,
    paperKind: cultureData.paperKind,
    instanceType: cultureData.instanceType,
  });
  for (const field of ['DateTimeFormat', 'NumberFormat', 'TextFormat', 'LocalNumberFormat'] as const) {
    const target = info[field];
    if (target && typeof target === 'object') Object.assign(target as Record<string, unknown>, cultureData[field]);
    else info[field] = { ...cultureData[field] };
  }
  info.predefinedFormats = { ...cultureData.predefinedFormats };
  // Our core names cultures through the internal `_setName`; the public d.ts
  // documents assigning `culture.name = function () { ... }`, so both work.
  const setName = (info as { _setName?: (name: string) => void })._setName;
  if (typeof setName === 'function') setName.call(info, cultureDisplayName);
  else (info as { name: () => string }).name = () => cultureDisplayName;
  return info;
}
