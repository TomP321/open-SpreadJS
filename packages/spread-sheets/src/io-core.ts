// GC.Spread.Sheets.IO core functions (TASK 44 item 3).
// Contract: core d.ts `IO.getPartialValues(refList, getFile, success, error)` and
// `IO.registerMaxDigitWidth(fontFamily, fontSize, maxDigitWidth)`.
// Trial behaviour recorded against the official `@mescius/spread-sheets-io`
// add-on in probe segment `io2` (the official CORE runtime lacks these
// functions — they are add-on-provided there; the core d.ts declares them, so
// our core ships working implementations):
//  - getFile receives the reference path (name when `filePath` is empty) as a
//    string; a throwing getFile propagates synchronously to the caller.
//  - empty refList: no callback is invoked at all.
//  - getFile returning null/undefined: that file is skipped; when nothing is
//    left, no callback fires.
//  - unparsable file (garbage/text/plain JSON blob): the error callback receives
//    exactly `{ errorCode: 1, errorMessage: 'error file' }`.
//  - success payload shape (real xlsx): `{ 'Book1.xlsx': { 'Sheet1': { 0: { 0:
//    'ext1', 1: 'ext3' }, 1: {...} } } }` — only the referenced source ranges,
//    keyed file -> sheet -> row -> column.
//  - registerMaxDigitWidth: returns undefined, tolerates missing arguments, and
//    the trial showed no observable change to `autoFitColumn` (77 px before and
//    after registering 99 px for Arial 12); it seeds the internal font metrics
//    cache only.
// XLSX parsing itself lives in the optional `@opensheets/spread-sheets-io`
// package; when loaded it registers a parser through the hidden symbol hook
// below (core-only builds mirror the trial's `{errorCode: 1}` error path, the
// same as the trial returns for content it cannot parse).

export const IO_FILE_PARSER_HOOK = Symbol.for('@opensheets/io-file-parser');

export interface ExternalReferenceLike {
  name: string;
  filePath?: string;
  items?: { source?: unknown }[];
}

type CellMap = Record<string, Record<string, unknown>>;
type SheetMap = Record<string, CellMap>;
export type PartialValuesMap = Record<string, SheetMap>;

export type IoFileParser = (file: Blob | File, refs: ExternalReferenceLike[]) => Promise<SheetMap> | SheetMap;

const fileParsers: IoFileParser[] = [];
/** Internal font-metrics cache seeded by `registerMaxDigitWidth`. */
const maxDigitWidths = new Map<string, number>();

/** @internal Used by the IO add-on (symbol-keyed, non-enumerable in Object.keys). */
export function registerFileParser(parser: IoFileParser): void {
  fileParsers.push(parser);
}

/** @internal Reads a seeded max-digit width (`undefined` when not registered). */
export function lookupMaxDigitWidth(fontFamily: string, fontSize: number): number | undefined {
  return maxDigitWidths.get(`${fontFamily}|${fontSize}`);
}

function errorFileResult(): { errorCode: number; errorMessage: string } {
  return { errorCode: 1, errorMessage: 'error file' };
}

function sourcesOf(ref: ExternalReferenceLike): { row: number; col: number; rowCount: number; colCount: number; sheetName: string }[] {
  const out: { row: number; col: number; rowCount: number; colCount: number; sheetName: string }[] = [];
  for (const item of ref.items ?? []) {
    const sources = Array.isArray(item.source) ? item.source : [item.source];
    for (const source of sources) {
      const info = source as { row?: number; col?: number; rowCount?: number; colCount?: number; sheetName?: string } | undefined;
      if (!info || typeof info.row !== 'number' || typeof info.col !== 'number') continue;
      out.push({ row: info.row, col: info.col, rowCount: info.rowCount ?? 1, colCount: info.colCount ?? 1, sheetName: info.sheetName ?? '' });
    }
  }
  return out;
}

export function getPartialValues(
  refList: ExternalReferenceLike[],
  getFile: (filePath: string) => File | Blob | null | undefined,
  getPartialValuesSuccessCallback: (externalValues: PartialValuesMap) => void,
  getPartialValuesErrorCallback: (errorMsg: unknown) => void,
): void {
  if (!Array.isArray(refList) || refList.length === 0) return; // trial: silent no-op
  // Trial calls getFile synchronously; a throwing getFile escapes the call.
  const entries: { path: string; ref: ExternalReferenceLike; file: File | Blob }[] = [];
  for (const ref of refList) {
    const path = ref.filePath || ref.name || '';
    const file = getFile(path);
    if (file) entries.push({ path, ref, file }); // trial skips null files without any callback
  }
  if (!entries.length) return;
  void (async () => {
    const values: PartialValuesMap = {};
    for (const { path, ref, file } of entries) {
      const sheetValues: SheetMap = {};
      try {
        if (!fileParsers.length) throw new Error('no file parser registered');
        for (const parser of fileParsers) {
          const parsed = await parser(file, [ref]);
          for (const [sheetName, cells] of Object.entries(parsed)) {
            const target = (sheetValues[sheetName] ??= {});
            for (const [row, rowCells] of Object.entries(cells)) {
              const targetRow = (target[row] ??= {});
              for (const [col, value] of Object.entries(rowCells)) {
                if (value !== undefined) targetRow[col] = value;
              }
            }
          }
        }
      } catch {
        getPartialValuesErrorCallback(errorFileResult());
        return;
      }
      // Keep only the referenced source ranges (trial returns exactly those).
      const limited: SheetMap = {};
      for (const source of sourcesOf(ref)) {
        const sheet = sheetValues[source.sheetName];
        if (!sheet) continue;
        const rows: CellMap = {};
        for (let row = source.row; row < source.row + source.rowCount; row++) {
          const cells = sheet[String(row)];
          if (!cells) continue;
          for (let col = source.col; col < source.col + source.colCount; col++) {
            const value = cells[String(col)];
            if (value === undefined) continue;
            (rows[String(row)] ??= {})[String(col)] = value;
          }
        }
        if (Object.keys(rows).length) (limited[source.sheetName] ??= Object.assign({}, limited[source.sheetName], rows));
      }
      values[path] = Object.assign({}, values[path], limited);
    }
    getPartialValuesSuccessCallback(values);
  })();
}

export function registerMaxDigitWidth(fontFamily: string, fontSize?: number, maxDigitWidth?: number): void {
  maxDigitWidths.set(`${fontFamily}|${fontSize ?? ''}`, maxDigitWidth as number);
}

/** Namespace members merged into `GC.Spread.Sheets.IO` by index.ts. */
export const ioNamespace = {
  getPartialValues,
  registerMaxDigitWidth,
  [IO_FILE_PARSER_HOOK]: registerFileParser,
};
