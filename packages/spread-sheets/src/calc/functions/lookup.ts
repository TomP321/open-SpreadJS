/** Lookup and reference functions. */
import type { Worksheet } from '../../worksheet.js';
import { Args, EvalContext, raiseError} from '../evaluate.js';
import {
  AreaRef,
  CalcArray,
  CalcError,
  ErrorCode,
  ReferenceValue,
  ScalarValue,
  Value,
  compareText,
  dateToSerial,
  error,
  isError,
  numberToText,
  parseNumberText,
} from '../values.js';
import { type DefinedFunction, define, wildcardToRegExp } from './common.js';

function matrixOf(args: Args, ctx: EvalContext, index: number): CalcArray {
  return args.array(index);
}


/** Excel style lookup comparison (numbers before text before booleans). */
function lookupCompare(a: ScalarValue, b: ScalarValue): number {
  const rank = (value: ScalarValue) => {
    if (typeof value === 'boolean') return 3;
    if (typeof value === 'string') return 2;
    return 1;
  };
  const rankA = rank(a);
  const rankB = rank(b);
  if (rankA !== rankB) return rankA - rankB;
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : a < b ? -1 : 1;
  if (typeof a === 'string' && typeof b === 'string') return compareText(a, b);
  if (a instanceof Date || b instanceof Date) {
    const x = a instanceof Date ? dateToSerial(a) : (a as number);
    const y = b instanceof Date ? dateToSerial(b) : (b as number);
    return x === y ? 0 : x < y ? -1 : 1;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return 0;
}

function exactMatch(candidate: ScalarValue, lookup: ScalarValue, wildcard: boolean): boolean {
  if (isError(candidate) || isError(lookup)) return false;
  if (lookup === null) return candidate === null;
  if (typeof lookup === 'string' && wildcard && /[*?~]/.test(lookup)) {
    const regexp = wildcardToRegExp(lookup);
    if (typeof candidate === 'string') return regexp.test(candidate);
    if (typeof candidate === 'number') return regexp.test(numberToText(candidate));
    if (typeof candidate === 'boolean') return regexp.test(candidate ? 'TRUE' : 'FALSE');
    return false;
  }
  if (typeof lookup === 'number') {
    if (typeof candidate === 'number') return candidate === lookup;
    if (candidate instanceof Date) return dateToSerial(candidate) === lookup;
    if (typeof candidate === 'string') {
      const parsed = parseNumberText(candidate);
      return parsed !== undefined && parsed === lookup;
    }
    return false;
  }
  if (typeof lookup === 'string') {
    if (typeof candidate === 'string') return candidate.toLowerCase() === lookup.toLowerCase();
    if (typeof candidate === 'number') return numberToText(candidate).toLowerCase() === lookup.toLowerCase();
    return false;
  }
  if (typeof lookup === 'boolean') return candidate === lookup;
  return false;
}

function approximateIndex(
  values: ScalarValue[],
  lookup: ScalarValue,
  mode: 'ascending' | 'descending' | 'next-smaller' | 'next-larger',
): number {
  let best = -1;
  for (let index = 0; index < values.length; index++) {
    const candidate = values[index]!;
    if (isError(candidate)) raiseError(candidate);
    const comparison = lookupCompare(candidate, lookup);
    const usable =
      mode === 'ascending' || mode === 'next-smaller'
        ? comparison <= 0
        : mode === 'descending'
          ? comparison >= 0
          : comparison >= 0;
    if (!usable) continue;
    if (best < 0) best = index;
    else {
      const previous = values[best]!;
      if (mode === 'next-larger') {
        if (lookupCompare(candidate, previous) < 0) best = index;
      } else if (lookupCompare(candidate, previous) > 0) best = index;
    }
  }
  return best;
}

function referenceFromArea(area: AreaRef): ReferenceValue {
  return new ReferenceValue([area]);
}

function offsetReference(args: Args, _ctx: EvalContext): Value {
  const value = args.value(0);
  if (!(value instanceof ReferenceValue) || value.areas.length !== 1) return error(ErrorCode.ref);
  const area = value.areas[0]!;
  const rows = Math.trunc(args.number(1));
  const cols = Math.trunc(args.number(2));
  const height = args.isMissing(3) ? area.r2 - area.r1 + 1 : Math.trunc(args.number(3));
  const width = args.isMissing(4) ? area.c2 - area.c1 + 1 : Math.trunc(args.number(4));
  if (height <= 0 || width <= 0) return error(ErrorCode.ref);
  const r1 = area.r1 + rows,
    c1 = area.c1 + cols;
  const r2 = r1 + height - 1,
    c2 = c1 + width - 1;
  if (r1 < 0 || c1 < 0) return error(ErrorCode.ref);
  return referenceFromArea({ sheet: area.sheet, r1, c1, r2, c2 });
}

function indirectReference(args: Args, ctx: EvalContext): Value {
  const text = args.text(0);
  const a1 = args.isMissing(1) ? true : args.boolean(1);
  const trimmed = text.trim();
  if (!trimmed) return error(ErrorCode.ref);
  const sheetMatch = /^(?:'((?:[^']|'')+)'|([^!]+))!(.*)$/.exec(trimmed);
  let sheet = ctx.sheet;
  let address = trimmed;
  if (sheetMatch) {
    const name = sheetMatch[1] ? sheetMatch[1].replace(/''/g, "'") : sheetMatch[2]!;
    const found = ctx.host.sheetFromName(name.trim());
    if (!found) return error(ErrorCode.ref);
    sheet = found;
    address = sheetMatch[3]!;
  }
  const converted = a1 ? address : convertR1C1(address, ctx.row, ctx.col);
  if (converted === undefined) return error(ErrorCode.ref);
  const parsed = parseAreaText(converted);
  if (!parsed) return error(ErrorCode.ref);
  const { r1, c1, r2, c2, wholeRow, wholeCol } = parsed;
  if (wholeRow) {
    const start = Math.min(r1, r2),
      end = Math.max(r1, r2);
    if (start < 0 || end >= sheet.getRowCount()) return error(ErrorCode.ref);
    return referenceFromArea({
      sheet,
      r1: start,
      c1: 0,
      r2: end,
      c2: Math.max(0, sheet.getColumnCount() - 1),
      wholeRow: true,
    });
  }
  if (wholeCol) {
    const start = Math.min(c1, c2),
      end = Math.max(c1, c2);
    if (start < 0 || end >= sheet.getColumnCount()) return error(ErrorCode.ref);
    return referenceFromArea({
      sheet,
      r1: 0,
      c1: start,
      r2: Math.max(0, sheet.getRowCount() - 1),
      c2: end,
      wholeCol: true,
    });
  }
  if (r1 < 0 || c1 < 0 || r2 < r1 || c2 < c1) return error(ErrorCode.ref);
  return referenceFromArea({ sheet, r1, c1, r2, c2 });
}

function convertR1C1(text: string, row: number, col: number): string | undefined {
  const normalized = text.toUpperCase();
  const cell = /^R(\[(-?\d+)\]|(\d+))?C(\[(-?\d+)\]|(\d+))?(?::R(\[(-?\d+)\]|(\d+))?C(\[(-?\d+)\]|(\d+))?)?$/.exec(normalized);
  if (!cell) return undefined;
  const parse = (bracket: string | undefined, absolute: string | undefined, base: number) =>
    absolute !== undefined ? Number(absolute) - 1 : base + (bracket !== undefined ? Number(bracket.slice(1, -1)) : 0);
  const r1 = parse(cell[1], cell[3], row);
  const c1 = parse(cell[4], cell[6], col);
  const r2 = cell[7] !== undefined ? parse(cell[7], cell[9], row) : r1;
  const c2 = cell[10] !== undefined ? parse(cell[10], cell[12], col) : c1;
  return `${columnName(c1)}${r1 + 1}:${columnName(c2)}${r2 + 1}`;
}

function columnName(col: number): string {
  let label = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}

interface ParsedArea {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  wholeRow?: boolean;
  wholeCol?: boolean;
}

function parseAreaText(text: string): ParsedArea | undefined {
  const clean = text.replace(/\$/g, '');
  const rowRange = /^(\d+):(\d+)$/.exec(clean);
  if (rowRange) return { r1: Number(rowRange[1]) - 1, c1: 0, r2: Number(rowRange[2]) - 1, c2: 0, wholeRow: true };
  const colRange = /^([A-Za-z]+):([A-Za-z]+)$/.exec(clean);
  if (colRange) {
    const c1 = columnIndex(colRange[1]!),
      c2 = columnIndex(colRange[2]!);
    if (c1 < 0 || c2 < 0) return undefined;
    return { r1: 0, c1, r2: 0, c2, wholeCol: true };
  }
  const parts = clean.split(':');
  if (parts.length > 2) return undefined;
  const parseCell = (part: string): [number, number] | undefined => {
    const match = /^([A-Za-z]+)(\d+)$/.exec(part);
    if (!match) return undefined;
    const col = columnIndex(match[1]!);
    if (col < 0) return undefined;
    return [Number(match[2]) - 1, col];
  };
  const first = parseCell(parts[0]!);
  if (!first) return undefined;
  const second = parts[1] ? parseCell(parts[1]) : first;
  if (!second) return undefined;
  return {
    r1: Math.min(first[0], second[0]),
    c1: Math.min(first[1], second[1]),
    r2: Math.max(first[0], second[0]),
    c2: Math.max(first[1], second[1]),
  };
}

function columnIndex(letters: string): number {
  let col = 0;
  for (const ch of letters.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64;
  return col - 1;
}

function lookupValue(args: Args, ctx: EvalContext): Value {
  const lookup = args.scalar(0);
  if (isError(lookup)) return lookup;
  const table = matrixOf(args, ctx, 1);
  const rowCount = table.rowCount;
  const colCount = table.colCount;
  if (rowCount === 0 || colCount === 0) return error(ErrorCode.na);
  const columnIndexValue = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
  if (columnIndexValue < 1) return error(ErrorCode.value);
  const approximate = args.isMissing(3) ? true : args.boolean(3);
  const firstColumn: ScalarValue[] = [];
  for (let row = 0; row < rowCount; row++) firstColumn.push(table.at(row, 0));
  let found = -1;
  if (approximate) found = approximateIndex(firstColumn, lookup, 'ascending');
  else {
    for (let row = 0; row < rowCount; row++) {
      if (exactMatch(firstColumn[row]!, lookup, true)) {
        found = row;
        break;
      }
    }
  }
  if (found < 0) return error(ErrorCode.na);
  if (columnIndexValue > colCount) return error(ErrorCode.ref);
  return table.at(found, columnIndexValue - 1);
}

function hlookupValue(args: Args, ctx: EvalContext): Value {
  const lookup = args.scalar(0);
  if (isError(lookup)) return lookup;
  const table = matrixOf(args, ctx, 1);
  const rowCount = table.rowCount;
  const colCount = table.colCount;
  if (!rowCount || !colCount) return error(ErrorCode.na);
  const rowIndexValue = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
  if (rowIndexValue < 1) return error(ErrorCode.value);
  const approximate = args.isMissing(3) ? true : args.boolean(3);
  const firstRow: ScalarValue[] = [];
  for (let col = 0; col < colCount; col++) firstRow.push(table.at(0, col));
  let found = -1;
  if (approximate) found = approximateIndex(firstRow, lookup, 'ascending');
  else {
    for (let col = 0; col < colCount; col++) {
      if (exactMatch(firstRow[col]!, lookup, true)) {
        found = col;
        break;
      }
    }
  }
  if (found < 0) return error(ErrorCode.na);
  if (rowIndexValue > rowCount) return error(ErrorCode.ref);
  return table.at(rowIndexValue - 1, found);
}

function indexFunction(args: Args, ctx: EvalContext): Value {
  const raw = args.value(0);
  let row: number;
  let col: number;
  if (raw instanceof ReferenceValue) {
    if (raw.areas.length !== 1) return error(ErrorCode.ref);
    const area = raw.areas[0]!;
    const rowCount = area.r2 - area.r1 + 1;
    const colCount = area.c2 - area.c1 + 1;
    row = args.isMissing(1) ? 0 : Math.trunc(args.number(1));
    const twoDimensional = rowCount > 1 && colCount > 1;
    col = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
    if (!twoDimensional) {
      // Single row/column ranges use the second argument as the offset.
      if (args.isMissing(2)) {
        col = row;
        row = 1;
      }
    } else if (args.isMissing(2)) {
      return error(ErrorCode.ref);
    }
    if (args.count > 3 && Math.trunc(args.number(3)) !== 1) return error(ErrorCode.ref);
    if (row < 0 || col < 0) return error(ErrorCode.value);
    if (row === 0 && col === 0) return error(ErrorCode.value);
    if (row > rowCount || col > colCount) return error(ErrorCode.ref);
    if (row === 0) {
      return referenceFromArea({
        sheet: area.sheet,
        r1: area.r1,
        c1: area.c1 + col - 1,
        r2: area.r2,
        c2: area.c1 + col - 1,
      });
    }
    if (col === 0) {
      return referenceFromArea({
        sheet: area.sheet,
        r1: area.r1 + row - 1,
        c1: area.c1,
        r2: area.r1 + row - 1,
        c2: area.c2,
      });
    }
    return referenceFromArea({
      sheet: area.sheet,
      r1: area.r1 + row - 1,
      c1: area.c1 + col - 1,
      r2: area.r1 + row - 1,
      c2: area.c1 + col - 1,
    });
  }
  const table = matrixOf(args, ctx, 0);
  row = args.isMissing(1) ? 0 : Math.trunc(args.number(1));
  col = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
  if (args.count > 3 && Math.trunc(args.number(3)) !== 1) return error(ErrorCode.ref);
  if (row < 0 || col < 0) return error(ErrorCode.value);
  if (row === 0 && col === 0) return error(ErrorCode.value);
  if (row > table.rowCount || col > table.colCount) return error(ErrorCode.ref);
  if (row === 0) return table.at(0, col - 1);
  if (col === 0) return table.rowCount === 1 ? table.at(0, row - 1) : error(ErrorCode.ref);
  return table.at(row - 1, col - 1);
}

function matchFunction(args: Args, ctx: EvalContext): Value {
  const lookup = args.scalar(0);
  if (isError(lookup)) return lookup;
  const table = matrixOf(args, ctx, 1);
  if (table.rowCount > 1 && table.colCount > 1) return error(ErrorCode.na);
  const values: ScalarValue[] = [];
  if (table.rowCount === 1) for (let col = 0; col < table.colCount; col++) values.push(table.at(0, col));
  else for (let row = 0; row < table.rowCount; row++) values.push(table.at(row, 0));
  const matchType = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
  if (matchType === 0) {
    for (let index = 0; index < values.length; index++) {
      if (exactMatch(values[index]!, lookup, true)) return index + 1;
    }
    return error(ErrorCode.na);
  }
  if (matchType > 0) {
    const found = approximateIndex(values, lookup, 'ascending');
    return found < 0 ? error(ErrorCode.na) : found + 1;
  }
  for (let index = 1; index < values.length; index++) {
    if (lookupCompare(values[index - 1]!, values[index]!) < 0) return error(ErrorCode.na);
  }
  const found = approximateIndex(values, lookup, 'descending');
  return found < 0 ? error(ErrorCode.na) : found + 1;
}

function xlookupFunction(args: Args, ctx: EvalContext): Value {
  const lookup = args.scalar(0);
  if (isError(lookup)) return lookup;
  const lookupArray = matrixOf(args, ctx, 1);
  const returnArray = matrixOf(args, ctx, 2);
  const matchMode = args.isMissing(4) ? 0 : Math.trunc(args.number(4));
  const searchMode = args.isMissing(5) ? 1 : Math.trunc(args.number(5));
  const lookupValues: ScalarValue[] = [];
  const singleRow = lookupArray.rowCount === 1;
  if (singleRow) for (let col = 0; col < lookupArray.colCount; col++) lookupValues.push(lookupArray.at(0, col));
  else for (let row = 0; row < lookupArray.rowCount; row++) lookupValues.push(lookupArray.at(row, 0));
  let index = -1;
  if (matchMode === 0) {
    if (searchMode === -1) {
      for (let position = lookupValues.length - 1; position >= 0; position--)
        if (exactMatch(lookupValues[position]!, lookup, false)) {
          index = position;
          break;
        }
    } else {
      for (let position = 0; position < lookupValues.length; position++)
        if (exactMatch(lookupValues[position]!, lookup, false)) {
          index = position;
          break;
        }
    }
  } else if (matchMode === 2) {
    for (let position = 0; position < lookupValues.length; position++) {
      const candidate = lookupValues[position]!;
      if (typeof candidate === 'string' && typeof lookup === 'string' && wildcardToRegExp(lookup).test(candidate)) {
        index = position;
        break;
      }
    }
  } else if (matchMode === -1) {
    index = approximateIndex(lookupValues, lookup, 'next-smaller');
  } else if (matchMode === 1) {
    index = approximateIndex(lookupValues, lookup, 'next-larger');
    // approximateIndex picks the smallest >= lookup; that is "next larger".
  }
  if (index < 0) {
    if (!args.isMissing(3)) return args.value(3);
    return error(ErrorCode.na);
  }
  if (singleRow && returnArray.rowCount > 1) {
    const values: ScalarValue[][] = [];
    for (let row = 0; row < returnArray.rowCount; row++) values.push([returnArray.at(row, index)]);
    return new CalcArray(values);
  }
  if (!singleRow && returnArray.colCount > 1) {
    const values: ScalarValue[][] = [];
    const row: ScalarValue[] = [];
    for (let col = 0; col < returnArray.colCount; col++) row.push(returnArray.at(index, col));
    values.push(row);
    return new CalcArray(values);
  }
  if (singleRow) return returnArray.at(0, index);
  return returnArray.at(index, 0);
}

function xmatchFunction(args: Args, ctx: EvalContext): Value {
  const lookup = args.scalar(0);
  if (isError(lookup)) return lookup;
  const table = matrixOf(args, ctx, 1);
  const values: ScalarValue[] = [];
  if (table.rowCount === 1) for (let col = 0; col < table.colCount; col++) values.push(table.at(0, col));
  else for (let row = 0; row < table.rowCount; row++) values.push(table.at(row, 0));
  const matchMode = args.isMissing(2) ? 0 : Math.trunc(args.number(2));
  const searchMode = args.isMissing(3) ? 1 : Math.trunc(args.number(3));
  let index = -1;
  if (matchMode === 0) {
    if (searchMode === -1) {
      for (let position = values.length - 1; position >= 0; position--)
        if (exactMatch(values[position]!, lookup, false)) {
          index = position;
          break;
        }
    } else {
      for (let position = 0; position < values.length; position++)
        if (exactMatch(values[position]!, lookup, false)) {
          index = position;
          break;
        }
    }
  } else if (matchMode === 2) {
    for (let position = 0; position < values.length; position++) {
      const candidate = values[position]!;
      if (typeof candidate === 'string' && typeof lookup === 'string' && wildcardToRegExp(lookup).test(candidate)) {
        index = position;
        break;
      }
    }
  } else if (matchMode === -1) index = approximateIndex(values, lookup, 'next-smaller');
  else index = approximateIndex(values, lookup, 'next-larger');
  return index < 0 ? error(ErrorCode.na) : index + 1;
}

function lookupVector(args: Args, ctx: EvalContext): Value {
  const lookup = args.scalar(0);
  if (isError(lookup)) return lookup;
  const vector = matrixOf(args, ctx, 1);
  const values: ScalarValue[] = [];
  if (vector.rowCount === 1) for (let col = 0; col < vector.colCount; col++) values.push(vector.at(0, col));
  else for (let row = 0; row < vector.rowCount; row++) values.push(vector.at(row, 0));
  const found = approximateIndex(values, lookup, 'ascending');
  if (found < 0) return error(ErrorCode.na);
  if (args.count < 3) return values[found]!;
  const result = matrixOf(args, ctx, 2);
  if (result.rowCount === 1 && result.colCount > 1) return result.at(0, found);
  if (result.colCount === 1 && result.rowCount > 1) return result.at(found, 0);
  return result.at(0, found);
}

export const LOOKUP_FUNCTIONS: DefinedFunction[] = [
  define('VLOOKUP', 3, 4, (args, ctx) => lookupValue(args, ctx)),
  define('HLOOKUP', 3, 4, (args, ctx) => hlookupValue(args, ctx)),
  define('INDEX', 2, 4, (args, ctx) => indexFunction(args, ctx)),
  define('MATCH', 2, 3, (args, ctx) => matchFunction(args, ctx)),
  define('XLOOKUP', 3, 6, (args, ctx) => xlookupFunction(args, ctx)),
  define('XMATCH', 2, 4, (args, ctx) => xmatchFunction(args, ctx)),
  define('LOOKUP', 2, 3, (args, ctx) => lookupVector(args, ctx)),
  define('OFFSET', 3, 5, (args, ctx) => offsetReference(args, ctx), { volatile: true }),
  define('INDIRECT', 1, 2, (args, ctx) => indirectReference(args, ctx), { volatile: true }),
  define('ADDRESS', 2, 5, (args) => {
    const row = Math.trunc(args.number(0));
    const col = Math.trunc(args.number(1));
    if (row < 1 || col < 1) return error(ErrorCode.value);
    let absType = args.isMissing(2) ? 1 : Math.trunc(args.number(2));
    if (absType < 1 || absType > 4) absType = 1;
    const a1 = args.isMissing(3) ? true : args.boolean(3);
    const sheet = args.isMissing(4) ? '' : args.text(4);
    let address: string;
    if (a1) {
      const colAbs = absType === 1 || absType === 3;
      const rowAbs = absType === 1 || absType === 2;
      address = `${colAbs ? '$' : ''}${columnName(col - 1)}${rowAbs ? '$' : ''}${row}`;
    } else {
      const colAbs = absType === 1 || absType === 3;
      const rowAbs = absType === 1 || absType === 2;
      address = `R${rowAbs ? '' : '['}${rowAbs ? row : row}${rowAbs ? '' : ']'}C${colAbs ? '' : '['}${colAbs ? col : col}${colAbs ? '' : ']'}`;
      // R1C1 absolute style: R2C3 / R2C[3]; relative uses brackets.
      address = `R${rowAbs ? String(row) : `[${row}]`}C${colAbs ? String(col) : `[${col}]`}`;
    }
    if (!sheet) return address;
    return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheet) ? `${sheet}!${address}` : `'${sheet.replace(/'/g, "''")}'!${address}`;
  }),
  define('TRANSPOSE', 1, 1, (args, ctx) => {
    const source = matrixOf(args, ctx, 0);
    const rows: ScalarValue[][] = [];
    for (let col = 0; col < source.colCount; col++) {
      const row: ScalarValue[] = [];
      for (let line = 0; line < source.rowCount; line++) row.push(source.at(line, col));
      rows.push(row);
    }
    return new CalcArray(rows);
  }),
  define('AREAS', 1, 1, (args) => {
    const value = args.value(0);
    return value instanceof ReferenceValue ? value.areas.length : error(ErrorCode.value);
  }),
  define('CHOOSE', 2, 255, (args, _ctx) => {
    const index = args.number(0);
    if (index < 1 || index >= args.count) return error(ErrorCode.value);
    return args.value(Math.trunc(index));
  }, { lazy: true }),
  define('HYPERLINK', 1, 2, (args, _ctx) => (args.isMissing(1) ? args.text(0) : args.text(1))),
];

export { referenceFromArea, parseAreaText, columnIndex, columnName, lookupCompare, exactMatch };
export type { Worksheet, CalcError };
