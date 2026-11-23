/**
 * Style, cell-type, validator and per-cell extras API of `Worksheet`:
 * `getStyle`/`setStyle`/`getActualStyle` cascade, named-style resolution,
 * formatter/cell-type/data-validator accessors and the tag/default-value/
 * binding-path/alt-text cell extras. Bodies moved out of `worksheet.ts`
 * unchanged (`this` renamed to the `sheet` parameter); the class keeps thin
 * delegating methods.
 */
import { asRecord } from './object-access.js';
import { GC } from './generated/enums.js';
import { Range, Style, getFont, parseFontParts, recomposeFont } from './primitives.js';
import { GeneralFormatter } from './formatter.js';
import { cellTypeFromJSON, defaultCellType } from './features/cell-types.js';
import { DefaultDataValidator } from './features/data-validation.js';
import { coordinate, subtractRange } from './sheet-common.js';
import type { JsonRecord } from './serialization.js';
import type { Worksheet } from './worksheet.js';

const { SheetArea } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

export function getStyle(sheet: Worksheet, row: number, col: number, area = VIEW): Style | null {
    coordinate(row, true);
    coordinate(col, true);
    if (row === -1 && col === -1) return sheet.getDefaultStyle(area);
    const data = sheet.areas.get(area);
    const style =
      row === -1 && col === -1
        ? data?.defaultStyle
        : row === -1
          ? data?.colStyles.get(col)
          : col === -1
            ? data?.rowStyles.get(row)
            : sheet.cell(row, col, area)?.style;
    if (typeof style === 'string') {
      // The trial resolves a named-style reference to the style itself: the returned Style
      // carries the named style's assigned members plus its `name`/`parentName` (TASK 46 probe).
      let named: Style | undefined = sheet.getNamedStyle(style);
      if (!named) {
        try { named = sheet.parent?.getNamedStyle(style); } catch { named = undefined; }
      }
      if (!named) return Object.assign(new Style(), { parentName: style });
      const copy = Object.assign(new Style(), named);
      // TASK 79: `font` lives on the prototype, so Object.entries above misses it — carry the
      // exact composed/raw shorthand through the setter (last, so the parsed parts re-check).
      const namedFont = getFont(named);
      if (namedFont !== undefined) copy.font = namedFont;
      return copy;
    }
    return style ?? null;
}

export function setStyle(sheet: Worksheet, row: number, col: number, style: Style | null, area = VIEW): void {
    coordinate(row, true);
    coordinate(col, true);
    const data = sheet.area(area),
      old = sheet.getStyle(row, col, area);
    if (row === -1 && col === -1) data.defaultStyle = style ?? new Style();
    else if (row === -1 || col === -1) {
      const map = row === -1 ? data.colStyles : data.rowStyles,
        index = row === -1 ? col : row;
      if (style) map.set(index, style);
      else map.delete(index);
    } else {
      if (style) {
        // TASK 79: create the cell record already holding the style — a `{}` plus a
        // later `cell.style =` add allocates a slackened backing store and an extra
        // map transition per styled cell (the 100k-styles benchmark profiled it).
        const store = area === VIEW && sheet.viewAreaCache ? sheet.viewAreaCache.cells : data.cells;
        const cell = store.get(row, col);
        if (cell) cell.style = style;
        else store.set(row, col, { style });
      } else {
        const cell = sheet.ensure(row, col, area);
        delete cell.style;
        sheet.prune(row, col, area);
      }
    }
    sheet.changed(row, col, area, '[styleinfo]', old ?? undefined, style ?? undefined);
}

export function getDefaultStyle(sheet: Worksheet, area = VIEW): Style {
    const style = sheet.area(area).defaultStyle;
    for (const [key, value] of Object.entries({ hAlign: 3, vAlign: 0, imeMode: 1 }))
      if (style[key] === undefined)
        Object.defineProperty(style, key, {
          configurable: true,
          enumerable: false,
          get: () => value,
          set(next: unknown) {
            Object.defineProperty(this, key, {
              value: next,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });
    return style;
}

export function setDefaultStyle(sheet: Worksheet, style: Style, area = VIEW): void {
    sheet.setStyle(-1, -1, style, area);
}

export function getActualStyle(sheet: Worksheet, row: number, col: number, area = VIEW, _sheetStyleOnly = false): Style {    const data = sheet.area(area);
    // The trial centres header labels: its header areas resolve to hAlign/vAlign center.
    const header = area === SheetArea.rowHeader || area === SheetArea.colHeader;
    const result = Object.assign(new Style(), {
      hAlign: header ? 1 : 3,
      vAlign: header ? 1 : 0,
      // TASK 90 round 2 (`.probe/t90/rangefont-r1.json` / `rangefont2-r1.json`, measured): the
      // trial's workbook CONSTRUCTOR option `font` (not in the contract options interfaces) is
      // stored but never participates in style resolution - with `{font:'bold 16px Arial'}` its
      // getActualStyle(0,0).font is still `14.6667px Calibri` (theme body font, themeFont 'Body').
      font: '14.6667px Calibri',
      themeFont: 'Body',
      locked: true,
      hidden: false,
      imeMode: 1,
    });
    const resolve = (style: Style | string | undefined, seen = new Set<string>()): JsonRecord => {
      if (!style) return {};
      const parentName =
        typeof style === 'string'
          ? style
          : typeof style.parentName === 'string'
            ? style.parentName
            : undefined;
      let parent: JsonRecord = {};
      if (parentName && !seen.has(parentName.toLowerCase())) {
        seen.add(parentName.toLowerCase());
        parent = resolve(sheet.getNamedStyle(parentName) ?? sheet.parent?.getNamedStyle(parentName), seen);
      }
      if (typeof style === 'string') return { ...parent };
      // `font` is a prototype accessor (TASK 79), invisible to Object.entries: read it through
      // `getFont` and merge the PARTS it parses into, so the cascade merges font parts and the
      // recomposition at the end of `getActualStyle` reports the shorthand the merged parts make.
      // TASK 90 (`.probe/t90/parse-r1.json`): the trial's actual style does exactly this — a cell
      // holding `font:'18pt'` resolves to `18pt Calibri` (family from the sheet default),
      // `font:'bold'` to `bold 14.6667px Calibri`, and a resolved style never reports a shorthand
      // without a size or a family. Copying the source shorthand over the resolved long-hands (the
      // pre-TASK 90 code) produced fragments like `12pt` / `bold`, and handing one to the canvas is
      // an invalid `font` value Chromium ignores: the cell is drawn in the previous font.
      const font = getFont(style);
      const parts = typeof font === 'string' ? parseFontParts(font)?.parts : undefined;
      const own: JsonRecord = {};
      for (const [key, value] of Object.entries(style)) {
        if (value === undefined || key === 'font') continue;
        own[key] = value;
      }
      if (parts) {
        for (const member of ['fontStyle', 'fontWeight', 'fontSize', 'fontFamily'] as const)
          if (parts[member] !== undefined && own[member] === undefined) own[member] = parts[member];
      } else if (font !== undefined) own.font = font; // a value the parser cannot express stays verbatim
      return { ...parent, ...own };
    };
    const levels: JsonRecord[] = [];
    for (const style of [data.defaultStyle, data.colStyles.get(col), data.rowStyles.get(row)]) levels.push(resolve(style));
    if (area === VIEW && row >= 0 && col >= 0 && sheet.tables._hasAny()) {
      const tableStyle = sheet._tableStyleAt(row, col);
      if (tableStyle) levels.push(resolve(tableStyle));
    }
    levels.push(resolve(sheet.cell(row, col, area)?.style));
    if (area === VIEW && row >= 0 && col >= 0) {
      const conditional = sheet.conditionalFormats.styleFor(row, col, sheet.getValue(row, col));
      if (conditional) levels.push(resolve(conditional));
    }
    for (const level of levels) Object.assign(result, level);
    /* TASK 90 round 4 (`.probe/t90/themefont.mjs`, `themefont2.mjs`, `themejson.mjs`, measured on
     * the trial): the resolved FAMILY comes from the MOST SPECIFIC cascade level that carries a
     * `fontFamily` or a `themeFont`. A level with a `themeFont` resolves its family THROUGH the
     * theme even when the same style also names an explicit family - `Body` gives the theme body
     * font name (Calibri), an unknown token passes through verbatim (`Heading` -> 'Heading',
     * 'Whatever' -> 'Whatever'), and the resolved token stays as the result's `themeFont`. When
     * the winning level supplies an explicit family instead, the result carries no themeFont at
     * all (trial: row `themeFont:Heading` + cell `Verdana` -> family Verdana, themeFont null).
     * That is why a default-style `13pt Trebuchet MS` resolves as `13pt Calibri` there: the
     * built-in default style carries `themeFont:'Body'`. */
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      const themeFont = level.themeFont;
      const hasFamily = level.fontFamily !== undefined && level.fontFamily !== '';
      const hasTheme = typeof themeFont === 'string' && themeFont !== '';
      if (!hasFamily && !hasTheme) continue;
      if (hasTheme) {
        result.themeFont = themeFont;
        result.fontFamily = themeFont === 'Body' ? (sheet._themeFonts?.()[1] ?? 'Calibri') : String(themeFont);
      } else {
        result.fontFamily = level.fontFamily;
        Object.assign(result, { themeFont: undefined }); // explicit family on the winning level: the trial reports no themeFont at all
      }
      break;
    }
    // TASK 90: the resolved style reports the shorthand the merged parts compose into, never a
    // remembered raw fragment (`font:'bold'` -> `bold 14.6667px Calibri`), like the trial.
    recomposeFont(result);
    return result;
}

/**
 * The style record the reference product leaves behind when a FILL (Down/Up/Left/
 * Right) copies a neighbouring cell into a single selected cell (TASK 75 sweep,
 * black-box measured): the source cell's computed style, condensed — alignment and
 * imeMode defaults always materialise, the font stays only when it differs from the
 * sheet default (then `themeFont` goes), null-valued fields are dropped and
 * `locked`/`hidden` never appear.
 */
export function fillStyleRecord(sheet: Worksheet, row: number, col: number): JsonRecord {
  const computed = asRecord(getActualStyle(sheet, row, col)) as JsonRecord;
  const defaultFont = '14.6667px Calibri'; // TASK 90 round 2: the resolved default ignores the workbook ctor `font` option (`.probe/t90/rangefont-r1.json`)
  const record: JsonRecord = {};
  if (computed.backColor != null) record.backColor = computed.backColor;
  if (computed.foreColor != null) record.foreColor = computed.foreColor;
  record.hAlign = computed.hAlign ?? 3;
  record.vAlign = computed.vAlign ?? 0;
  if (computed.font != null && computed.font !== defaultFont) record.font = computed.font;
  else if (computed.themeFont != null) record.themeFont = computed.themeFont;
  record.imeMode = computed.imeMode ?? 1;
  if (computed.formatter != null) record.formatter = computed.formatter;
  for (const key of ['borderLeft', 'borderTop', 'borderRight', 'borderBottom', 'diagonalDown', 'diagonalUp',
    'wordWrap', 'showEllipsis', 'shrinkToFit', 'textIndent', 'textDecoration', 'textOrientation', 'isVerticalText',
    'cellType', 'cellButtons', 'watermark', 'cellPadding', 'quotePrefix'])
    if (computed[key] != null) record[key] = computed[key];
  return record;
}

export function _tableStyleAt(sheet: Worksheet, row: number, col: number): Style | null {    for (const table of sheet.tables.all()) {
      const style = table._styleFor(row, col);
      if (style) return style;
    }
    return null;
}

/**
 * TASK 90 round 2 (`.probe/t90/rangefont-r1.json` / `rangefont2-r1.json`, measured on the trial):
 * the `CellRange.themeFont()` accessor getter does NOT return the resolved actual-style member -
 * it returns the RAW `themeFont` of the MOST SPECIFIC style level in the cascade that DEFINES one
 * (cell own with a named-style reference resolved, then row, then column, then the area default),
 * whatever that value is: the built-in default style's `'Body'` is reported even when the resolved
 * actual style drops themeFont (a cell font with an explicit family), and a non-string stored value
 * round-trips verbatim (the trial's own `getActualStyle` throws on such a value; ours tolerates
 * it). Falls back to the resolved value when no level defines the member.
 */
export function _themeFontRaw(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
  const levels: (Style | null)[] = [
    row === -1 && col === -1 ? null : getStyle(sheet, row, col, area),
    row >= 0 ? getStyle(sheet, row, -1, area) : null,
    col >= 0 ? getStyle(sheet, -1, col, area) : null,
    getDefaultStyle(sheet, area),
  ];
  for (const style of levels) {
    const value = style?.themeFont;
    if (value !== undefined) return value;
  }
  return getActualStyle(sheet, row, col, area).themeFont;
}

export function setStyleName(sheet: Worksheet, row: number, col: number, name: string, area = VIEW): void {
    if (row === -1) sheet.area(area).colStyles.set(col, name);
    else if (col === -1) sheet.area(area).rowStyles.set(row, name);
    else sheet.ensure(row, col, area).style = name;
    sheet._formatterEpoch++;
    sheet.changed(row, col, area, 'styleName', undefined, name);
}

export function _setStyleProperty(sheet: Worksheet, row: number, col: number, property: string, value: unknown, area = VIEW): void {
    const style = sheet.getStyle(row, col, area) ?? new Style();
    const oldValue = sheet.getActualStyle(row, col, area)[property];
    style[property] = value;
    const data = sheet.area(area);
    if (row === -1 && col === -1) data.defaultStyle = style;
    else if (row === -1) data.colStyles.set(col, style);
    else if (col === -1) data.rowStyles.set(row, style);
    else sheet.ensure(row, col, area).style = style;
    sheet._formatterEpoch++;
    sheet.changed(row, col, area, property, oldValue, value);
}

/** True when the style record can bring a formatter (directly or by name) into a cell's actual style. */
function styleCanCarryFormatter(style: Style | string | undefined): boolean {
    if (!style) return false;
    if (typeof style === 'string') return true;
    const record = asRecord(style);
    return record.formatter !== undefined || typeof record.parentName === 'string';
}

export function getFormatter(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    const data = sheet.area(area);
    // Plain cell (nothing in its chain can carry a formatter, no tables, no
    // conditional formats): the resolved formatter is the area's default and
    // stable until a default/named/table/CF edit bumps the epoch. Bulk text
    // reads (search) hit this path for every cell of a data sheet (TASK 78).
    const cellStyle = row >= 0 && col >= 0 ? data.cells.peek(row, col)?.style : undefined;
    const plain =
        !styleCanCarryFormatter(cellStyle) &&
        (row < 0 || !styleCanCarryFormatter(data.rowStyles.get(row))) &&
        (col < 0 || !styleCanCarryFormatter(data.colStyles.get(col))) &&
        (area !== SheetArea.viewport || !sheet.tables._hasAny()) &&
        (area !== SheetArea.viewport || sheet.conditionalFormats.count() === 0);
    if (!plain) return sheet.getActualStyle(row, col, area).formatter;
    const cache = sheet._formatterCache;
    if (cache && cache.epoch === sheet._formatterEpoch && cache.defaultStyle === data.defaultStyle && cache.area === area)
        return cache.formatter;
    const formatter = sheet.getActualStyle(-1, -1, area).formatter;
    sheet._formatterCache = { epoch: sheet._formatterEpoch, defaultStyle: data.defaultStyle, area, formatter };
    return formatter;
}

export function setFormatter(sheet: Worksheet, row: number, col: number, value: string | GeneralFormatter, area = VIEW): void {
    sheet._setStyleProperty(row, col, 'formatter', value, area);
}

export function getCellType(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    const stored = sheet.getActualStyle(row, col, area).cellType;
    if (!stored) return (sheet.cachedDefaultCellType ??= defaultCellType());
    if (typeof stored === 'object' && stored && typeof (stored as { typeName?: unknown }).typeName === 'string')
      return cellTypeFromJSON(stored) ?? defaultCellType();
    return stored;
}

export function setCellType(sheet: Worksheet, row: number, col: number, value: unknown, area = VIEW): void {
    sheet._setStyleProperty(row, col, 'cellType', value ?? undefined, area);
}

export function getDataValidator(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    if (area === VIEW) {
      for (const record of sheet.validationRecords)
        if (record.ranges.some((range) => range.contains(row, col))) return record.validator;
    }
    return sheet.cell(row, col, area)?.validator ?? null;
}

export function _setDataValidator(
    sheet: Worksheet,
    ranged: boolean,
    row: number,
    col: number,
    third: unknown,
    fourth: number,
    fifth?: unknown,
    sixth?: number,
  ): void {
    const rows = ranged ? Number(third) : 1,
      cols = ranged ? fourth : 1,
      value = ranged ? fifth : third,
      area = ranged ? sixth : fourth;
    void area;
    sheet._setValidatorRecord(new Range(row, col, rows, cols), (value ?? null) as DefaultDataValidator | null);
}

export function _setValidatorRecord(sheet: Worksheet, range: Range, validator: DefaultDataValidator | null): void {
    const next: { ranges: Range[]; validator: DefaultDataValidator }[] = [];
    for (const record of sheet.validationRecords) {
      const remaining: Range[] = [];
      for (const existing of record.ranges) remaining.push(...subtractRange(existing, range));
      if (remaining.length) next.push({ ranges: remaining, validator: record.validator });
    }
    if (validator) {
      const existing = next.find((record) => record.validator === validator);
      if (existing) existing.ranges.push(new Range(range.row, range.col, range.rowCount, range.colCount));
      else next.push({ ranges: [new Range(range.row, range.col, range.rowCount, range.colCount)], validator });
    }
    sheet.validationRecords = next;
    for (const record of sheet.validationRecords) {
      // Validators created outside the class (custom objects) may lack `_ranges`.
      if (typeof record.validator._ranges === 'function') record.validator._ranges(record.ranges);
    }
    for (let r = range.row; r < range.row + range.rowCount; r++)
      for (let c = range.col; c < range.col + range.colCount; c++) {
        const cell = sheet.cell(r, c);
        if (!cell) continue;
        if (validator) cell.validator = validator;
        else delete cell.validator;
        sheet.prune(r, c);
      }
    sheet.batch.invalidate();
}

export function isValid(sheet: Worksheet, row: number, column: number, value: unknown): boolean {
    const validator = sheet.getDataValidator(row, column) as DefaultDataValidator | null;
    if (!validator || typeof validator.isValid !== 'function') return true;
    return validator.isValid(sheet, row, column, value);
}

export function getTag(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    return sheet.cell(row, col, area)?.tag;
}

export function setTag(sheet: Worksheet, row: number, col: number, value: unknown, area = VIEW): void {
    const cell = sheet.ensure(row, col, area);
    if (value === undefined) delete cell.tag;
    else cell.tag = value;
    sheet.prune(row, col, area);
}

export function getDefaultValue(sheet: Worksheet, row: number, col: number): unknown {
    return sheet.cell(row, col)?.defaultValue;
}

export function setDefaultValue(sheet: Worksheet, row: number, col: number, value: unknown): void {
    sheet.ensure(row, col).defaultValue = value;
}

export function getBindingPath(sheet: Worksheet, row: number, col: number): string {
    return sheet.cell(row, col)?.bindingPath ?? '';
}

export function getAltText(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    return sheet.cell(row, col, area)?.altText;
}

export function setAltText(sheet: Worksheet, row: number, col: number, value: string, area = VIEW): void {
    sheet.ensure(row, col, area).altText = value;
}

export function tag(sheet: Worksheet, value?: unknown): unknown {
    if (!arguments.length) return sheet.area().tag;
    sheet.area().tag = value;
    return sheet;
}

export function setBindingPath(sheet: Worksheet, row: number, col: number, value: string): Worksheet {
    sheet.ensure(row, col).bindingPath = value;
    return sheet;
}

export function getStyleName(sheet: Worksheet, row: number, col: number, area = VIEW): string | null | undefined {
    // The trial keeps the applied named-style reference: a raw string stored on the cell/row/column
    // (or, when a Style object was assigned, its `parentName`).
    const data = sheet.area(area);
    const raw =
      row === -1 && col === -1
        ? data.defaultStyle
        : row === -1
          ? data.colStyles.get(col)
          : col === -1
            ? data.rowStyles.get(row)
            : sheet.cell(row, col, area)?.style;
    if (typeof raw === 'string') return raw;
    const style = raw as Style | undefined | null;
    if (!style) return null;
    // Trial: the applied named style's own `name` is reported; a plain Style object without a
    // name reports `undefined` (TASK 46 probe).
    return typeof style.name === 'string' ? style.name : undefined;
}

export function _removeValidatorRanges(sheet: Worksheet, range: Range): void {
    sheet._setValidatorRecord(range, null);
}
