/**
 * Style, cell-type, validator and per-cell extras API of `Worksheet`:
 * `getStyle`/`setStyle`/`getActualStyle` cascade, named-style resolution,
 * formatter/cell-type/data-validator accessors and the tag/default-value/
 * binding-path/alt-text cell extras. Bodies moved out of `worksheet.ts`
 * unchanged (`this` renamed to the `sheet` parameter); the class keeps thin
 * delegating methods.
 */
import { GC } from './generated/enums.js';
import { Range, Style } from './primitives.js';
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
      return named ? Object.assign(new Style(), named) : Object.assign(new Style(), { parentName: style });
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
      const cell = sheet.ensure(row, col, area);
      if (style) cell.style = style;
      else delete cell.style;
      sheet.prune(row, col, area);
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

export function getActualStyle(sheet: Worksheet, row: number, col: number, area = VIEW, _sheetStyleOnly = false): Style {
    const data = sheet.area(area);
    // The trial centres header labels: its header areas resolve to hAlign/vAlign center.
    const header = area === SheetArea.rowHeader || area === SheetArea.colHeader;
    const result = Object.assign(new Style(), {
      hAlign: header ? 1 : 3,
      vAlign: header ? 1 : 0,
      font: sheet.parent?.options.font ?? '14.6667px Calibri',
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
      return {
        ...parent,
        ...(typeof style === 'string'
          ? {}
          : Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined))),
      };
    };
    for (const style of [data.defaultStyle, data.colStyles.get(col), data.rowStyles.get(row)])
      Object.assign(result, resolve(style));
    if (area === VIEW && row >= 0 && col >= 0 && sheet.tables._hasAny()) {
      const tableStyle = sheet._tableStyleAt(row, col);
      if (tableStyle) Object.assign(result, resolve(tableStyle));
    }
    Object.assign(result, resolve(sheet.cell(row, col, area)?.style));
    if (area === VIEW && row >= 0 && col >= 0) {
      const conditional = sheet.conditionalFormats.styleFor(row, col, sheet.getValue(row, col));
      if (conditional) Object.assign(result, resolve(conditional));
    }
    return result;
}

export function _tableStyleAt(sheet: Worksheet, row: number, col: number): Style | null {
    for (const table of sheet.tables.all()) {
      const style = table._styleFor(row, col);
      if (style) return style;
    }
    return null;
}

export function setStyleName(sheet: Worksheet, row: number, col: number, name: string, area = VIEW): void {
    if (row === -1) sheet.area(area).colStyles.set(col, name);
    else if (col === -1) sheet.area(area).rowStyles.set(row, name);
    else sheet.ensure(row, col, area).style = name;
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
    sheet.changed(row, col, area, property, oldValue, value);
}

export function getFormatter(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    return sheet.getActualStyle(row, col, area).formatter;
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
