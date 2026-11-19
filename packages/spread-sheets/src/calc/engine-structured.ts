/**
 * Structured (table) reference support for the calculation engine:
 * parsing `[Table1[Column]]` specs, resolving them to concrete areas
 * against the bound worksheet and registering the resulting dependencies.
 * Bodies moved out of `calc/engine.ts` unchanged (`this` renamed to the
 * `engine` parameter); the class keeps thin delegating methods.
 */

import type { Worksheet } from '../worksheet.js';
import { AreaRef, ErrorCode, ReferenceValue, Value, error } from './values.js';
import { getBuiltin } from './evaluate.js';
import { AstNode } from './parser.js';

import type { CalcEngine, FormulaCell } from './engine.js';

export function parseStructuredSpec(engine: CalcEngine, spec: string): { special: string[]; columns: string[]; columnRange: [string, string] | null; thisRow: boolean } {
    let text = spec.trim();
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
    const special: string[] = [];
    const columns: string[] = [];
    let columnRange: [string, string] | null = null;
    let thisRow = false;
    // Split on top-level "],[" boundaries.
    const parts: string[] = [];
    let buffer = '';
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      if (char === '[') depth++;
      else if (char === ']') depth--;
      if (char === ',' && depth === 0) {
        parts.push(buffer);
        buffer = '';
      } else buffer += char;
    }
    parts.push(buffer);
    for (const raw of parts) {
      let part = raw.trim();
      if (part.startsWith('[') && part.endsWith(']')) part = part.slice(1, -1).trim();
      if (!part) continue;
      if (part.startsWith('@')) {
        thisRow = true;
        const name = part.slice(1).replace(/^\[|\]$/g, '');
        if (name) columns.push(name);
        continue;
      }
      if (part.startsWith('#')) {
        special.push(part.toLowerCase());
        continue;
      }
      if (part.includes(']:[')) {
        const [left, right] = part.split(']:[');
        columnRange = [left.replace(/^\[|\]$/g, ''), right.replace(/^\[|\]$/g, '')];
        continue;
      }
      const name = part.replace(/^\[|\]$/g, '');
      if (name) columns.push(name);
    }
    return { special, columns, columnRange, thisRow };
}

export function resolveStructuredAreas(engine: CalcEngine,
    table: string,
    spec: string,
    sheet: Worksheet,
    row: number,
    col: number,
  ): AreaRef[] | undefined {
    let sheetName: string | undefined;
    let tableName = table;
    if (table.includes('!')) {
      const bang = table.lastIndexOf('!');
      sheetName = table.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'");
      tableName = table.slice(bang + 1);
    }
    const target = sheetName ? engine.sheetFromName(sheetName) : sheet;
    if (!target) return undefined;
    if (!tableName) tableName = engine.implicitTableName(target, row, col);
    const found = target.tables?.findByName(tableName);
    if (!found) return undefined;
    const data = found.dataRange();
    const header = found.headerIndex();
    const footer = found.footerIndex();
    const parsed = engine.parseStructuredSpec(spec);
    const nameToIndex = (name: string): number => {
      for (let c = 0; c < found.range().colCount; c++)
        if (found.getColumnName(c).toLowerCase() === name.toLowerCase()) return c;
      return -1;
    };
    let firstCol = 0;
    let lastCol = data.colCount - 1;
    if (parsed.columnRange) {
      const start = nameToIndex(parsed.columnRange[0]);
      const end = nameToIndex(parsed.columnRange[1]);
      if (start < 0 || end < 0) return undefined;
      firstCol = Math.min(start, end);
      lastCol = Math.max(start, end);
    } else if (parsed.columns.length) {
      const indexes = parsed.columns.map(nameToIndex).filter((index) => index >= 0);
      if (!indexes.length) return undefined;
      firstCol = Math.min(...indexes);
      lastCol = Math.max(...indexes);
    }
    const includeHeaders = parsed.special.includes('#headers') || parsed.special.includes('#all');
    const includeData = parsed.special.includes('#data') || parsed.special.includes('#all') || (!parsed.special.length && !parsed.thisRow);
    const includeTotals = parsed.special.includes('#totals') || parsed.special.includes('#all');
    const areas: AreaRef[] = [];
    const addArea = (r1: number, r2: number): void => {
      if (r1 < 0 || r2 < r1) return;
      areas.push({ sheet: target, r1, c1: data.col + firstCol, r2, c2: data.col + lastCol });
    };
    if (parsed.thisRow) {
      if (row < data.row || row >= data.row + data.rowCount) return [];
      if (parsed.columns.length) {
        for (const name of parsed.columns) {
          const index = nameToIndex(name);
          if (index < 0) return undefined;
          areas.push({ sheet: target, r1: row, c1: data.col + index, r2: row, c2: data.col + index });
        }
      } else areas.push({ sheet: target, r1: row, c1: data.col, r2: row, c2: data.col + data.colCount - 1 });
      return areas;
    }
    if (includeHeaders) {
      if (header < 0) return undefined;
      addArea(header, header);
    }
    if (includeData) addArea(data.row, data.row + data.rowCount - 1);
    if (includeTotals && footer >= 0) addArea(footer, footer);
    if (!areas.length) return [];
    void col;
    return areas;
}

export function validateStructured(engine: CalcEngine, ast: AstNode, sheet: Worksheet, row: number, col: number): void {
    const visit = (node: AstNode): void => {
      switch (node.kind) {
        case 'structured':
          if (!engine.resolveStructuredAreas(node.table, node.spec, sheet, row, col))
            throw new Error('Invalid Formula');
          break;
        case 'range':
          visit(node.start); visit(node.end); break;
        case 'union':
          node.parts.forEach(visit); break;
        case 'intersect':
          visit(node.left); visit(node.right); break;
        case 'binary':
          visit(node.left); visit(node.right); break;
        case 'unary':
        case 'percent':
          visit(node.operand); break;
        case 'paren':
          visit(node.inner); break;
        case 'function':
          node.args.forEach(visit); break;
        case 'spill':
          visit(node.ref); break;
        case 'call':
          visit(node.callee); node.args.forEach(visit); break;
        default:
          break;
      }
    };
    visit(ast);
}

export function resolveStructured(engine: CalcEngine, table: string, spec: string, sheet: Worksheet, row: number, col: number): Value {
    let tableName = table;
    if (table.includes('!')) tableName = table.slice(table.lastIndexOf('!') + 1);
    if (!tableName) tableName = engine.implicitTableName(sheet, row, col);
    const found = sheet.tables?.findByName(tableName);
    if (!found) return error(ErrorCode.ref);
    if (/#totals/i.test(spec) && found.footerIndex() < 0) return error(ErrorCode.ref);
    if (/#headers/i.test(spec) && found.headerIndex() < 0) return error(ErrorCode.ref);
    const areas = engine.resolveStructuredAreas(table, spec, sheet, row, col);
    if (!areas || !areas.length) return error(/@|#This Row/i.test(spec) ? ErrorCode.value : ErrorCode.ref);
    return new ReferenceValue(areas);
}

export function registerStructuredDependencies(engine: CalcEngine, cell: FormulaCell): void {
    const visit = (node: AstNode): void => {
      switch (node.kind) {
        case 'structured': {
          const areas = engine.resolveStructuredAreas(node.table, node.spec, cell.sheet, cell.row, cell.col);
          for (const area of areas ?? [])
            engine.addRangeDependency(cell, area.sheet, area.r1, area.c1, area.r2, area.c2);
          break;
        }
        case 'range': visit(node.start); visit(node.end); break;
        case 'union': node.parts.forEach(visit); break;
        case 'intersect': visit(node.left); visit(node.right); break;
        case 'binary': visit(node.left); visit(node.right); break;
        case 'unary':
        case 'percent': visit(node.operand); break;
        case 'paren': visit(node.inner); break;
        case 'function': node.args.forEach(visit); break;
        case 'spill': visit(node.ref); break;
        case 'call': visit(node.callee); node.args.forEach(visit); break;
        default: break;
      }
    };
    visit(cell.ast);
}

export function registerTableNameDependencies(engine: CalcEngine, cell: FormulaCell): void {
    const visit = (node: AstNode): void => {
      switch (node.kind) {
        case 'name': {
          if (node.sheet && node.sheet.toLowerCase() !== cell.sheet.name().toLowerCase()) return;
          const table = cell.sheet.tables?.findByName(node.name);
          if (table) {
            const data = table.dataRange();
            engine.addRangeDependency(cell, cell.sheet, data.row, data.col, data.row + data.rowCount - 1, data.col + data.colCount - 1);
          }
          break;
        }
        case 'range': visit(node.start); visit(node.end); break;
        case 'union': node.parts.forEach(visit); break;
        case 'intersect': visit(node.left); visit(node.right); break;
        case 'binary': visit(node.left); visit(node.right); break;
        case 'unary':
        case 'percent': visit(node.operand); break;
        case 'paren': visit(node.inner); break;
        case 'function': node.args.forEach(visit); break;
        case 'spill': visit(node.ref); break;
        case 'call': visit(node.callee); node.args.forEach(visit); break;
        default: break;
      }
    };
    visit(cell.ast);
}

export function validate(engine: CalcEngine, ast: AstNode, sheet: Worksheet): void {
    const visit = (node: AstNode): void => {
      switch (node.kind) {
        case 'function': {
          const name = node.name.replace(/^_XLFN\./, '');
          const builtin = getBuiltin(name);
          const custom = engine.getCustomFunction(name, sheet);
          const min = builtin?.min ?? custom?.minArgs;
          const max = builtin?.max ?? custom?.maxArgs;
          if (min !== undefined) {
            const high = max === undefined ? min : max;
            if (node.args.length < min || node.args.length > high) throw new Error('Invalid Formula');
          }
          for (const arg of node.args) visit(arg);
          break;
        }
        case 'binary':
          visit(node.left);
          visit(node.right);
          break;
        case 'unary':
        case 'percent':
          visit(node.operand);
          break;
        case 'paren':
          visit(node.inner);
          break;
        case 'range':
          visit(node.start);
          visit(node.end);
          break;
        case 'union':
          for (const part of node.parts) visit(part);
          break;
        case 'intersect':
          visit(node.left);
          visit(node.right);
          break;
        case 'array':
          for (const row of node.rows) for (const value of row) visit(value);
          break;
        case 'spill':
          visit(node.ref);
          break;
        case 'call':
          visit(node.callee);
          for (const arg of node.args) visit(arg);
          break;
        default:
          break;
      }
    };
    visit(ast);
}
