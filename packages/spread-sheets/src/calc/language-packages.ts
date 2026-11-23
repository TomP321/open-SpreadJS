/**
 * Calc-engine language packages (TASK 89).
 *
 * Public surface (declared in the official d.ts): `GC.Spread.CalcEngine.LanguagePackages.languagePackages(name?)`.
 * The core owns the *mechanism* (registry, active package, separator/number/name tables the
 * lexer and renderer consult) while the localized data itself ships with the
 * `@opensheets/spread-sheets-languagepackages` add-in, mirroring the official split where the
 * core answers `languagePackages() -> undefined` until the add-in registers a package.
 *
 * Model implemented here (see docs/STATUS.md "TASK 89" for the documented contract):
 * - Formulas are stored in the invariant English form (canonical AST with English function
 *   names, `,` argument separators, `.` decimal point). `toJSON()` and XLSX keep that form.
 * - With an active package, user input (`setFormula`, the cell editor) is accepted in the
 *   localized *and* the English form; the cell editor and the formula bar display the
 *   localized form rendered from the same canonical AST.
 * - A package describes the culture separators exactly like the official package objects do:
 *   `listSeparator` (argument separator), `arrayListSeparator` (array element separator),
 *   `arrayGroupSeparator` (array row separator), `numberDecimalSeparator`, plus the
 *   localized function names, error literals and TRUE/FALSE literals.
 */

/** Raw package description as registered by add-ins (same property names as official docs). */
export interface LanguagePackageData {
  languageName: string;
  /** Argument separator. Default ','. */
  listSeparator?: string;
  /** Separator between array-constant elements of one row. Default ','. */
  arrayListSeparator?: string;
  /** Separator between array-constant rows. Default ';'. */
  arrayGroupSeparator?: string;
  /** Decimal point inside number literals. Default '.'. */
  numberDecimalSeparator?: string;
  /** Thousands separator inside number literals. Default ','. */
  numberGroupSeparator?: string;
  /** Literal for the TRUE boolean. Default 'TRUE'. */
  trueValue?: string;
  /** Literal for the FALSE boolean. Default 'FALSE'. */
  falseValue?: string;
  /** Canonical English function name -> localized display name. */
  functions?: Record<string, string>;
  /** Localized error text -> canonical (English) error text, e.g. '#N/D' -> '#N/A'. */
  errors?: Record<string, string>;
  /**
   * Canonical English function name -> localized one-line description (autocomplete/help text).
   * Optional: a package may ship without it and the UI falls back to the English catalog.
   */
  descriptions?: Record<string, string>;
}

/** Ready-to-use package with every separator resolved and both lookup directions built. */
export interface LanguagePackage {
  readonly languageName: string;
  readonly listSeparator: string;
  readonly arrayListSeparator: string;
  readonly arrayGroupSeparator: string;
  readonly numberDecimalSeparator: string;
  readonly numberGroupSeparator: string;
  readonly trueValue: string;
  readonly falseValue: string;
  /** Localized -> canonical (always uppercase keys). */
  functionToEnglish(localized: string): string | undefined;
  /** Canonical -> localized display name. */
  englishToFunction(name: string): string | undefined;
  errorToEnglish(localized: string): string | undefined;
  englishToError(canonical: string): string | undefined;
  /** Localized one-line description of a canonical function name, if the package has one. */
  description(canonicalName: string): string | undefined;
  /** INTERNAL (underscore = not part of any documented surface): the live description map that
   *  `addCalcLanguagePackageDescriptions` merges into; read it through `description()`. */
  readonly _descriptions: Map<string, string>;
  readonly englishToLocal: ReadonlyMap<string, string>;
  readonly localToEnglish: ReadonlyMap<string, string>;
}

function makePackage(data: LanguagePackageData): LanguagePackage {
  const localToEnglish = new Map<string, string>();
  const englishToLocal = new Map<string, string>();
  for (const [english, localized] of Object.entries(data.functions ?? {})) {
    localToEnglish.set(localized.toUpperCase(), english.toUpperCase());
    englishToLocal.set(english.toUpperCase(), localized);
  }
  const errorLocalToEnglish = new Map<string, string>();
  const errorEnglishToLocal = new Map<string, string>();
  for (const [localized, english] of Object.entries(data.errors ?? {})) {
    errorLocalToEnglish.set(localized.toUpperCase(), english.toUpperCase());
    errorEnglishToLocal.set(english.toUpperCase(), localized);
  }
  // Mutable so late-loading UI resource packages (e.g. the Designer's Italian resources)
  // can supply descriptions through addCalcLanguagePackageDescriptions without re-registering.
  const descriptions = new Map<string, string>();
  for (const [english, text] of Object.entries(data.descriptions ?? {})) {
    descriptions.set(english.toUpperCase(), text);
  }
  return {
    languageName: data.languageName,
    listSeparator: data.listSeparator ?? ',',
    arrayListSeparator: data.arrayListSeparator ?? ',',
    arrayGroupSeparator: data.arrayGroupSeparator ?? ';',
    numberDecimalSeparator: data.numberDecimalSeparator ?? '.',
    numberGroupSeparator: data.numberGroupSeparator ?? ',',
    trueValue: data.trueValue ?? 'TRUE',
    falseValue: data.falseValue ?? 'FALSE',
    // Internal (not on the interface): the mutator above appends to this live map.
    _descriptions: descriptions,
    functionToEnglish: (localized) => localToEnglish.get(localized.toUpperCase()),
    englishToFunction: (name) => englishToLocal.get(name.toUpperCase()),
    errorToEnglish: (localized) => errorLocalToEnglish.get(localized.toUpperCase()),
    englishToError: (canonical) => errorEnglishToLocal.get(canonical.toUpperCase()),
    description: (canonical) => descriptions.get(canonical.toUpperCase()),
    englishToLocal,
    localToEnglish,
  };
}

const registry = new Map<string, LanguagePackage>();
let active: LanguagePackage | undefined;

/** Registers (or replaces) a language package. Called by the languagepackages add-in. */
export function registerCalcLanguagePackage(data: LanguagePackageData): void {
  registry.set(data.languageName.toLowerCase(), makePackage(data));
}

/**
 * Merges localized function descriptions into an already-registered package (keys = canonical
 * English names, e.g. 'SUM' or 'STDEV.P'). Used by UI resource packages that ship the formula
 * documentation (the Designer's Italian resources) after the calc package was registered.
 * Returns false when the language has no registered package (caller may retry later).
 */
export function addCalcLanguagePackageDescriptions(
  languageName: string,
  descriptions: Record<string, string>,
): boolean {
  const pkg = registry.get(languageName.toLowerCase());
  if (!pkg) return false;
  for (const [english, text] of Object.entries(descriptions)) {
    pkg._descriptions.set(english.toUpperCase(), text);
  }
  return true;
}

/** Returns the registered package for `name`, or undefined. */
export function getCalcLanguagePackage(name: string): LanguagePackage | undefined {
  return registry.get(name.toLowerCase());
}

/** Names of all registered packages. */
export function registeredCalcLanguagePackageNames(): string[] {
  return [...registry.values()].map((pkg) => pkg.languageName);
}

/**
 * `GC.Spread.CalcEngine.LanguagePackages.languagePackages` implementation.
 * With a name: activates that registered package and returns its name (undefined when the
 * name is unknown, leaving the previous package active). Without a name: returns the active
 * package name, or undefined while no package is active (the pre-add-in core behaviour).
 * Passing null/empty deactivates the package (back to plain English formulas).
 */
export function languagePackages(languageName?: string | null): string | undefined {
  if (languageName === undefined) return active?.languageName;
  if (languageName === null || languageName === '') {
    active = undefined;
    return undefined;
  }
  const pkg = registry.get(String(languageName).toLowerCase());
  if (!pkg) return undefined;
  active = pkg;
  return pkg.languageName;
}

/** The package the lexer/parser/renderer must follow, or undefined for plain English. */
export function getActiveCalcLanguagePackage(): LanguagePackage | undefined {
  return active;
}

/** Test helper: forget registrations and the active package. */
export function resetCalcLanguagePackages(): void {
  registry.clear();
  active = undefined;
}
