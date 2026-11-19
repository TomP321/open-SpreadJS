/*
 * Workbook-level managers: sheet tab styles, document properties and the base of
 * the custom theme managers. Behaviour and JSON were read from the official
 * 19.2.5 trial through the public API (`wb.sheetTabStyles.all()`,
 * `wb.docProps.customDocPropsManager.add(…)`, `wb.customTableThemes.add(…)`); no
 * vendor source was inspected.
 *
 * Trial facts encoded here:
 * - `sheetTabStyles.all()` answers a map `{ sheetName: { stateNumber: style } }`,
 *   `{}` when nothing is stored; `all(['Sheet1'])` restricts it to those sheets.
 * - A style added without sheet names is recorded against every sheet that exists
 *   at that moment. `add(state)` without a style object stores nothing.
 * - `remove(state)` without names drops that state from every sheet; `clear()`
 *   drops everything, with or without a sheet-name list (the trial ignores the
 *   argument).
 * - The stored map serialises as the workbook key `sheetTabStylesMap` and only
 *   while it is non-empty. `options.defaultSheetTabStyles` is a separate option
 *   keyed by state *name*.
 * - `docProps.customDocPropsManager.all()` answers `undefined` while the store is
 *   empty; `all(props)` replaces the store with the given list (a missing value
 *   becomes `''`). `add` ignores an empty name or an undefined value, stringifies
 *   other objects, and stores numbers and booleans as themselves. Custom
 *   properties serialise into `docProps.docPropsCustom` with the OOXML shape
 *   `{ fmtid, pid, name, propertyItemChildElement: { 'vt:lpwstr' | 'vt:i4' |
 *   'vt:bool': value } }`; `pid` counts up from 2 for the workbook and is not
 *   renumbered when a property is removed.
 * - `customTableThemes.add('name')` creates an empty theme carrying that name
 *   (built-in themes are not copied), an add of an existing name answers
 *   `undefined` and leaves the stored theme untouched, `get` is case-insensitive,
 *   and the themes serialise as the workbook key `tableStyles`.
 */
import type { Workbook } from '../workbook.js';
import type { TableTheme } from './table-style.js';
import { clone } from '../primitives.js';
import type { JsonRecord } from '../serialization.js';

/** One sheet tab style, as `sheetTabStyles.add` receives it. */
export interface SheetTabStyle {
  backColor?: string;
  foreColor?: string;
  font?: string;
  icons?: { name?: string; image?: string; size?: number }[];
}
/** Styles of one sheet, keyed by the numeric `SheetTabState` value. */
export type SheetTabStyles = Record<string, SheetTabStyle>;
/** Every sheet's tab styles, keyed by sheet name. */
export type SheetNameTabStyleMap = Record<string, SheetTabStyles>;
/** A custom document property. */
export interface CustomDocumentProperty {
  name: string;
  value?: string | number | boolean | Date;
  linkTarget?: string;
}
/** Core document properties (only the ones present in the JSON are readable). */
export type CoreDocProps = JsonRecord;
/** Application document properties. */
export type AppDocProps = JsonRecord;

/**
 * Base of the workbook's custom theme managers. The trial keeps the store and the
 * add/get/remove/all/update behaviour here and overrides only `remove` in the
 * concrete manager, and constructing the base directly fails inside its own
 * bookkeeping — that is reproduced with a direct-construction check.
 */
export class CustomThemeManagerBase {
  private readonly themes = new Map<string, TableTheme>();
  constructor(_workbook?: Workbook) {
    if (new.target === CustomThemeManagerBase)
      throw new TypeError("Cannot read properties of undefined (reading 'create')");
  }
  /** @internal The store, keyed by lower-cased theme name. */
  _themes(): Map<string, TableTheme> {
    return this.themes;
  }
  add(theme: TableTheme): TableTheme | undefined {
    const name = String(theme?.name?.() ?? '');
    if (!name || this.themes.has(name.toLowerCase())) return undefined;
    this.themes.set(name.toLowerCase(), theme);
    return theme;
  }
  all(): TableTheme[] {
    return [...this.themes.values()];
  }
  get(name: string): TableTheme | undefined {
    return this.themes.get(String(name).toLowerCase());
  }
  remove(name: string): void {
    this.themes.delete(String(name).toLowerCase());
  }
  /** Replaces a stored theme; the new theme is kept under its own name. */
  update(oldThemeName: string, newTheme: TableTheme): void {
    this.themes.delete(String(oldThemeName).toLowerCase());
    const name = String(newTheme?.name?.() ?? '');
    if (name) this.themes.set(name.toLowerCase(), newTheme);
  }
}

/**
 * `GC.Spread.Sheets.SheetTabStyleManager` — the workbook's per-sheet tab styles.
 * `wb.sheetTabStyles` is one of these.
 */
export class SheetTabStyleManager {
  private readonly styles = new Map<string, Map<number, SheetTabStyle>>();
  constructor(private readonly workbook: Workbook) {}
  /** @internal Sheet names the manager can attach a style to. */
  private _sheetNames(): string[] {
    return (this.workbook?.sheets ?? []).map((sheet) => String(sheet.name()));
  }
  private _bucket(name: string): Map<number, SheetTabStyle> {
    let bucket = this.styles.get(name);
    if (!bucket) this.styles.set(name, (bucket = new Map()));
    return bucket;
  }
  add(state: number, style?: SheetTabStyle, sheetNames?: string[]): void {
    if (!style) return;
    const names = sheetNames?.length ? sheetNames : this._sheetNames();
    for (const name of names) this._bucket(String(name)).set(Number(state), clone(style) as SheetTabStyle);
  }
  all(sheetNames?: string[]): SheetNameTabStyleMap {
    let wanted: string[] | undefined;
    if (sheetNames !== undefined) {
      // A non-array argument fails inside the trial's own loop; the same failure
      // mode is reproduced instead of quietly accepting it.
      (sheetNames as string[]).forEach(() => undefined);
      wanted = sheetNames;
    }
    const result: SheetNameTabStyleMap = {};
    for (const [name, bucket] of this.styles) {
      if (wanted && !wanted.includes(name)) continue;
      const stored: SheetTabStyles = {};
      for (const [state, style] of bucket) stored[String(state)] = clone(style) as SheetTabStyle;
      if (Object.keys(stored).length) result[name] = stored;
    }
    return result;
  }
  remove(state: number, sheetNames?: string[]): void {
    const names = sheetNames?.length ? sheetNames : [...this.styles.keys()];
    for (const name of names) {
      const bucket = this.styles.get(String(name));
      if (!bucket) continue;
      bucket.delete(Number(state));
      if (!bucket.size) this.styles.delete(String(name));
    }
  }
  /** The trial clears the whole map, whatever sheet names are passed. */
  clear(): void {
    this.styles.clear();
  }
  /** @internal Workbook JSON (`sheetTabStylesMap`), `undefined` when empty. */
  _toJSON(): JsonRecord | undefined {
    const map = this.all();
    return Object.keys(map).length ? (map as JsonRecord) : undefined;
  }
  /** @internal Reads the stored map back from workbook JSON. */
  _fromJSON(json: unknown): void {
    this.styles.clear();
    for (const [name, states] of Object.entries(json as JsonRecord | undefined ?? {})) {
      const bucket = this._bucket(String(name));
      for (const [state, style] of Object.entries(states as JsonRecord))
        bucket.set(Number(state), style as SheetTabStyle);
    }
  }
}

/**
 * `GC.Spread.Sheets.CustomDocPropsManager` — the workbook's custom document
 * properties, reachable as `wb.docProps.customDocPropsManager`.
 */
export class CustomDocPropsManager {
  private readonly props = new Map<string, CustomDocumentProperty>();
  /** The workbook's OOXML property records, keeping `fmtid`/`pid` of imported files. */
  private records = new Map<string, JsonRecord>();
  private pid = 1;
  constructor(private readonly workbook?: Workbook) {
    void this.workbook;
  }
  private _record(name: string): JsonRecord | undefined {
    return this.records.get(name);
  }
  add(propName: string, value: string | number | boolean | Date | undefined, isLinkTarget?: boolean): void {
    const name = String(propName ?? '');
    if (!name || value === undefined) return;
    // A link-target property is stored outside the custom-property list the trial
    // exposes through `all`/`get`/JSON, so it is not visible here either.
    if (isLinkTarget) return;
    const stored =
      typeof value === 'number' || typeof value === 'boolean' || value instanceof Date ? value : String(value);
    const property: CustomDocumentProperty = { name, value: stored };
    const existing = this.records.get(name);
    if (!existing) {
      this.pid += 1;
      this.records.set(name, {
        fmtid: '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}',
        pid: String(this.pid),
        name,
        propertyItemChildElement: vtRecord(stored),
      });
    } else existing.propertyItemChildElement = vtRecord(stored);
    this.props.set(name, property);
  }
  get(propName: string): CustomDocumentProperty | undefined {
    return this.props.get(String(propName));
  }
  /** Without arguments: the stored properties, `undefined` while there are none. */
  all(props?: CustomDocumentProperty[]): CustomDocumentProperty[] | undefined {
    if (props === undefined) return this.props.size ? [...this.props.values()] : undefined;
    const next = new Map<string, CustomDocumentProperty>();
    const nextRecords = new Map<string, JsonRecord>();
    // The trial renumbers the records from 2 whenever the list is replaced.
    this.pid = 1;
    for (const given of props) {
      const name = String(given?.name ?? '');
      if (!name) continue;
      const value = given.value === undefined ? '' : given.value;
      const record = {
        fmtid: '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}',
        pid: String((this.pid += 1)),
        name,
        propertyItemChildElement: vtRecord(value),
      };
      next.set(name, { name, value });
      nextRecords.set(name, record);
    }
    this.props.clear();
    this.records.clear();
    for (const [name, property] of next) this.props.set(name, property);
    for (const [name, record] of nextRecords) this.records.set(name, record);
    return [...next.values()];
  }
  remove(propName: string): void {
    const name = String(propName);
    this.props.delete(name);
    this.records.delete(name);
  }
  clear(): void {
    this.props.clear();
    this.records.clear();
    // After a clear the trial numbers the next property from 2 again.
    this.pid = 1;
  }
  /** @internal `docPropsCustom` records, `undefined` while there are none. */
  _toJSON(): JsonRecord[] | undefined {
    return this.records.size ? [...this.records.values()].map((record) => clone(record) as JsonRecord) : undefined;
  }
  /** @internal Reads imported `docPropsCustom` records back into the store. */
  _fromJSON(records: unknown): void {
    this.props.clear();
    this.records.clear();
    this.pid = 1;
    for (const raw of (records as JsonRecord[] | undefined) ?? []) {
      const record = raw as JsonRecord;
      const name = String(record.name ?? '');
      if (!name) continue;
      const child = record.propertyItemChildElement as JsonRecord | undefined;
      const entry = Object.entries(child ?? {})[0];
      this.props.set(name, { name, value: entry ? decodeVt(entry[0], entry[1]) : '' });
      this.records.set(name, clone(record) as JsonRecord);
      const pid = Number(record.pid ?? 0);
      if (pid > this.pid) this.pid = pid;
    }
  }
}

/** The OOXML value record the trial writes for each property type. */
function vtRecord(value: string | number | boolean | Date): JsonRecord {
  if (typeof value === 'boolean') return { 'vt:bool': value ? 'true' : 'false' };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { 'vt:i4': String(value) } : { 'vt:r8': String(value) };
  if (value instanceof Date) return { 'vt:lpwstr': value.toISOString() };
  return { 'vt:lpwstr': String(value) };
}
function decodeVt(key: string, value: unknown): string | number | boolean {
  if (key === 'vt:bool') return String(value) === 'true';
  if (key === 'vt:i4' || key === 'vt:r8') return Number(value);
  return String(value);
}

/**
 * The object behind `wb.docProps`: the core and application property records plus
 * the custom property manager. The trial exposes all three as accessors on the
 * prototype.
 */
export class DocProps {
  private readonly core: CoreDocProps = {};
  private readonly app: AppDocProps = {};
  readonly customDocPropsManager: CustomDocPropsManager;
  constructor(workbook?: Workbook) {
    this.customDocPropsManager = new CustomDocPropsManager(workbook);
  }
  get coreDocProps(): CoreDocProps {
    return this.core;
  }
  get appDocProps(): AppDocProps {
    return this.app;
  }
  /** @internal `docProps` JSON for `toJSON`. */
  _toJSON(): JsonRecord {
    const result: JsonRecord = {
      docPropsApp: clone(this.app) as JsonRecord,
      docPropsCore: clone(this.core) as JsonRecord,
    };
    const custom = this.customDocPropsManager._toJSON();
    if (custom) result.docPropsCustom = custom;
    return result;
  }
  /** @internal Reads the `docProps` JSON of `fromJSON`. */
  _fromJSON(json: unknown): void {
    const source = json as JsonRecord | undefined;
    for (const key of Object.keys(this.core)) delete this.core[key];
    for (const key of Object.keys(this.app)) delete this.app[key];
    Object.assign(this.core, (source?.docPropsCore as JsonRecord | undefined) ?? {});
    Object.assign(this.app, (source?.docPropsApp as JsonRecord | undefined) ?? {});
    this.customDocPropsManager._fromJSON(source?.docPropsCustom);
  }
}
