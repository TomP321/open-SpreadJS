/**
 * Cell content plumbing for `Worksheet`: text get/set, formulas, array
 * formulas, the recalculation queue, data binding, hyperlinks, table
 * auto-expansion, sheet naming/protection, custom names, dirty bookkeeping
 * and the CellChanged/RowChanged/ColumnChanged emitters. Bodies moved out of
 * `worksheet.ts` unchanged (`this` renamed to the `sheet` parameter; methods
 * whose API returns `this` return the sheet and the class-side delegator
 * casts). `getValue`/`setValue` live here too as `_getValue`/`_setValue`;
 * the class-side methods stay tiny delegators and the cell stores
 * (`sheet.areas` / `CellStore`) are untouched.
 */
import { CellBindingSource, getPath, setPath } from './features/binding.js';
import { CellStore } from './structures.js';
import { assertCustomFunction } from './calc/functions-api.js';
import { INVALID_CUSTOM_NAME, assertCustomName, assertNameFormula } from './calc/custom-names.js';
import { CellRange, adjustFormula } from './range.js';

import { GC } from './generated/enums.js';
import { notImplemented } from './not-implemented.js';
import { clone, NameInfo, Range, Style } from './primitives.js';
import { Events, type EventInfo } from './events.js';
import { applyFormatter, parseWithFormatter } from './formatter.js';
import { list, object, type JsonRecord } from './serialization.js';
import { RowFilterBase } from './features/filters.js';
import { hashSheetPassword, verifySheetPassword } from './protection.js';
import type { WorkbookHost, Worksheet } from './worksheet.js';
import type { ICalcEngine } from './calc.js';
import type { CellsInfo, FormulaInfo } from './calc/engine-introspect.js';
import { type AreaData, type CellData, type DirtyCell, coordinate, count } from './sheet-common.js';

const { SheetArea, StorageType, ValueType } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

export function getText(sheet: Worksheet, row: number, col: number, area = VIEW): string {
    if (sheet.options.showFormulas && sheet.getFormula(row, col, area))
      return '=' + sheet.getFormula(row, col, area);
    const value = sheet.getValue(row, col, area);
    if (value == null) return '';
    if (value === 0 && !sheet.options.showZeros) return '';
    if (value && typeof value === 'object' && 'richText' in value)
      return list(value.richText)
        .map((x) => String(object(x).text ?? ''))
        .join('');
    const formatter = sheet.getFormatter(row, col, area);
    return applyFormatter(formatter, value);
}

export function setText(sheet: Worksheet, row: number, col: number, value: string, area = VIEW): void {
    const formatter = sheet.getFormatter(row, col, area);
    const parsed = parseWithFormatter(formatter, value);
    sheet.setValue(row, col, parsed ?? value, area);
}

export function setFormula(sheet: Worksheet, row: number, col: number, value: string | null, area = VIEW): void {
    if (sheet.options.isProtected && sheet.getActualStyle(row, col, area).locked !== false) return;
    coordinate(row);
    coordinate(col);
    let stored = value ? value.replace(/^=/, '') : null;
    let parsedAst: import('./calc/parser.js').AstNode | undefined;
    let parsedR1c1: boolean | undefined;
    if (stored && sheet.calcEngine?.parseFormula && area === VIEW) {
      const original = stored;
      const canonical = sheet.calcEngine.parseFormula(sheet, row, col, stored);
      if (canonical !== undefined) {
        stored = canonical;
        const last = sheet.calcEngine.lastParsed;
        if (last && last.text === original) {
          parsedAst = last.ast;
          parsedR1c1 = last.r1c1;
        }
      }
    }
    const cell = sheet.ensure(row, col, area),
      old = cell.formula ?? null,
      oldValue = cell.value;
    if (old === stored) {
      // Re-setting the same text still re-creates the trial's formula model: a
      // custom function removed in the meantime is no longer bound to the cell,
      // so it answers `#NAME?` again. The stored value and the spill output stay.
      if (stored && area === VIEW) sheet.calcEngine?.rebindFormula?.(sheet, row, col);
      return;
    }
    if (stored) {
      cell.formula = stored;
      delete cell.value;
    } else {
      delete cell.formula;
    }
    sheet.prune(row, col, area);
    if (area === VIEW) sheet.markDirty(row, col, oldValue, cell.value ?? null);
    sheet.queueCalc({
      kind: 'formula',
      row,
      col,
      formula: cell.formula ?? null,
      ast: parsedAst,
      r1c1: parsedR1c1,
      fresh: old === null,
    });
    sheet.changed(row, col, area, 'formula', old, value);
}

export function setArrayFormula(sheet: Worksheet,
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    value: string,
    area = VIEW,
  ): void {
    coordinate(row);
    coordinate(col);
    count(rowCount);
    count(colCount);
    if (!rowCount || !colCount) throw new RangeError('Array formula range must be non-empty');
    sheet.suspendCalcService();
    try {
      sheet.setFormula(row, col, value, area);
      if (area === VIEW) {
        const cell = sheet.ensure(row, col, area);
        cell.arrayFormula = { rowCount, colCount };
        sheet.calcEngine?.formulaChanged?.(sheet, row, col, cell.formula ?? null);
      }
    } finally {
      sheet.resumeCalcService();
    }
}

export function _setCalculatedValue(sheet: Worksheet, row: number, col: number, value: unknown, area = VIEW): void {
    const data = area === VIEW && sheet.viewAreaCache ? sheet.viewAreaCache : sheet.area(area);
    // A computed value replaces the stored cell value, so in the plain
    // (unbound, no data-range overlay) case the store already holds exactly
    // what `getValue` would return; reading it directly skips the full public
    // read path per recalculated cell.
    const direct = area === VIEW && !sheet.hasBoundValues && !sheet._dataRangesActive && !sheet.extraJSON.dataRanges;
    const oldValue = direct ? data.cells.getValue(row, col) ?? null : sheet.getValue(row, col, area);
    let target = data.cells.get(row, col);
    if (!target) data.cells.set(row, col, (target = {}));
    target.value = value;
    if (area === VIEW) sheet.dirty.update(row, col, value);
    if (!Object.is(oldValue, value)) {
      sheet.parent?._renderer()?.invalidateCell(row, col);
      // Build the event object only when somebody can receive it.
      if (sheet._hasAnyListener(Events.ValueChanged)) {
        sheet._emit(Events.ValueChanged, {
          sheet: sheet,
          sheetName: sheet.sheetName,
          row,
          col,
          oldValue,
          newValue: value,
        });
      }
      sheet.batch.invalidate();
    }
}

export function queueCalc(sheet: Worksheet, change: {
    kind: 'formula' | 'value';
    row: number;
    col: number;
    formula?: string | null;
    value?: unknown;
    ast?: import('./calc/parser.js').AstNode;
    r1c1?: boolean;
  }): void {
    if (!sheet.calcEngine) return;
    sheet.calcQueue.set(`${change.row}:${change.col}`, change);
    if (!sheet.batch.calc && !sheet.parent?._isCalcSuspended()) sheet.flushCalc();
}

export function flushCalc(sheet: Worksheet, all = false): void {
    if (sheet.batch.calc || sheet.parent?._isCalcSuspended()) return;
    const queue = [...sheet.calcQueue.values()];
    sheet.calcQueue.clear();
    if (!sheet.calcEngine) return;
    for (const change of queue)
      if (change.kind === 'formula') {
        // Keep the plain 4-argument call shape when there is no write-side
        // hint to hand over (a mock engine in the unit suite pins it).
        if (change.ast && change.r1c1 !== undefined)
          sheet.calcEngine.formulaChanged(
            sheet,
            change.row,
            change.col,
            change.formula ?? null,
            change.ast,
            change.r1c1,
            change.fresh === true,
          );
        else if (change.fresh)
          sheet.calcEngine.formulaChanged(sheet, change.row, change.col, change.formula ?? null, undefined, undefined, true);
        else sheet.calcEngine.formulaChanged(sheet, change.row, change.col, change.formula ?? null);
      } else sheet.calcEngine.valueChanged?.(sheet, change.row, change.col, change.value);
    // Work the calculation service queued while it was suspended - a changed
    // external-workbook value pushes cells straight into the engine queue - runs
    // on the resume, like the trial (probe item `ext-suspend`).
    if (queue.length || all || sheet.calcEngine.hasPendingWork?.()) sheet.calcEngine.recalculate(sheet, all);
}

export function getArray(sheet: Worksheet, row: number, col: number, rowCount: number, colCount: number, getFormula = false): unknown[][] {
    count(rowCount);
    count(colCount);
    return Array.from({ length: rowCount }, (_, r) =>
      Array.from({ length: colCount }, (_, c) =>
        getFormula ? sheet.getFormula(row + r, col + c) : sheet.getValue(row + r, col + c),
      ),
    );
}

export function setArray(sheet: Worksheet, row: number, col: number, array: unknown[][], setFormula = false): void {
    sheet.suspendCalcService();
    sheet.suspendPaint();
    try {
      array.forEach((values, r) =>
        values?.forEach((value, c) => {
          if (setFormula) sheet.setFormula(row + r, col + c, value == null ? null : String(value));
          else sheet.setValue(row + r, col + c, value);
        }),
      );
    } finally {
      sheet.resumeCalcService();
      sheet.resumePaint();
    }
}

export function setDataSource(sheet: Worksheet, data: Record<string, unknown>[] | CellBindingSource | null, reset = true): void {
    if (data) sheet.hasBoundValues = true;
    sheet.cellSource = data instanceof CellBindingSource ? data : undefined;
    if (sheet.cellSource) { sheet.source = null; sheet.tables.all().forEach(t => t._refreshBinding()); sheet.batch.invalidate(); sheet.recalcAll(); return; }
    if (data !== null && !Array.isArray(data)) notImplemented('Worksheet.setDataSource(non-array)');
    const previous = Array.isArray(sheet.source) ? sheet.source.length : 0;
    sheet.source = data as Record<string, unknown>[] | null;
    if (reset && Array.isArray(data)) sheet.setRowCount(data.length);
    if (data && sheet.autoGenerateColumns && !sheet.boundColumns.size) sheet.bindColumns(Object.keys(data[0] ?? {}).map(name => ({ name })));
    // Removing the source takes the bound cells with it, like the trial.
    if (!data && !sheet.cellSource && sheet.boundColumns.size)
      for (const col of sheet.boundColumns.keys())
        sheet.clear(0, col, Math.max(previous, sheet.getRowCount()), 1, VIEW, StorageType.data);
    sheet.loadBinding();
}

export function bindColumns(sheet: Worksheet, columns: { name: string; displayName?: string; size?: number }[]): void {
    sheet.boundColumns.clear(); columns.forEach((column, index) => sheet.boundColumns.set(index, column));
    sheet.setColumnCount(columns.length); sheet.loadBinding();
}

export function loadBinding(sheet: Worksheet, ): void {
    sheet.suspendPaint(); sheet.suspendDirty();
    try { for (const [col, column] of sheet.boundColumns) {
      sheet.setValue(0, col, column.displayName ?? column.name, SheetArea.colHeader);
      if (column.size !== undefined) sheet.setColumnWidth(col, column.size);
      sheet.source?.forEach((item, row) => sheet.setValue(row, col, getPath(item, column.name)));
    } } finally { sheet.resumeDirty(); sheet.resumePaint(); }
}

export function getHyperlink(sheet: Worksheet, row: number, col: number, area = VIEW): unknown {
    const hyperlink = sheet.cell(row, col, area)?.hyperlink;
    if (!hyperlink) return null;
    const fresh = Object.prototype.hasOwnProperty.call(hyperlink, '_fresh');
    const record = clone(hyperlink as JsonRecord);
    delete record._fresh;
    if (fresh) return { command: '', drawUnderline: true, isVisited: false, target: 0, tooltip: '', url: '', ...record };
    return { command: '', drawUnderline: true, target: 0, tooltip: '', url: '', ...record };
}

export function setHyperlink(sheet: Worksheet, row: number, col: number, value: JsonRecord | null, area = VIEW): void {
    const cell = sheet.ensure(row, col, area);
    if (!value) delete cell.hyperlink;
    else {
      const stored = {
        command: '',
        drawUnderline: true,
        target: 0,
        tooltip: '',
        url: '',
        ...clone(value),
      } as JsonRecord;
      Object.defineProperty(stored, '_fresh', { value: true, enumerable: false, configurable: true });
      cell.hyperlink = stored;
    }
    sheet.prune(row, col, area);
    sheet.changed(row, col, area, 'hyperlink', undefined, value ?? undefined);
}

export function _autoExpandTables(sheet: Worksheet, row: number, col: number, previousValue?: unknown): void {
    void previousValue;
    for (const table of sheet.tables.all()) {
      if (!table.allowAutoExpand()) continue;
      const data = table.dataRange();
      const insideColumns = col >= data.col && col < data.col + data.colCount;
      const insideRows = row >= data.row && row < data.row + data.rowCount;
      if (insideColumns && row === data.row + data.rowCount) {
        table._grow(1, 0);
        const info = { sheet: sheet, sheetName: sheet.name(), table };
        sheet._emit(Events.TableRowsChanged, info);
      }
      if (insideRows && col === data.col + data.colCount) {
        const lastColumn = table.columns.length;
        table._grow(0, 1);
        table.setColumnName(lastColumn, `Column${lastColumn + 1}`);
        const info = { sheet: sheet, sheetName: sheet.name(), table };
        sheet._emit(Events.TableColumnsChanged, info);
      }
    }
}

export function changed(sheet: Worksheet,
    row: number,
    col: number,
    sheetArea: number,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
  ): void {
    sheet.parent?._renderer()?.invalidateCell(row, col);
    const type = row < 0 ? Events.ColumnChanged : col < 0 ? Events.RowChanged : Events.CellChanged;
    if (sheet.events.has(type) || sheet.parent?._hasEvent(type)) sheet._emit(type, {
      sheet: sheet,
      sheetName: sheet.sheetName,
      row,
      col,
      sheetArea,
      propertyName,
      oldValue,
      newValue,
      isUndo: sheet.parent?._isUndoing() ?? false,
    });
    sheet.slicers._onCellChanged(row, col);
    sheet.batch.invalidate();
}

export function axisInfo(sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    sheetArea: number,
    propertyName: string,
    oldValue: unknown,
    newValue: unknown,
    amount?: number,
  ): EventInfo {
    const info: EventInfo = {
      sheet: sheet,
      sheetName: sheet.sheetName,
      [axis]: index,
      sheetArea,
      propertyName,
      oldValue,
      newValue,
      isUndo: sheet.parent?._isUndoing() ?? false,
    };
    if (amount !== undefined) info.count = amount;
    return info;
}

export function axisChanged(sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    area: number,
    property: string,
    old: unknown,
    value: unknown,
    amount?: number,
  ): void {
    sheet._emit(
      axis === 'row' ? Events.RowChanged : Events.ColumnChanged,
      sheet.axisInfo(axis, index, area, property, old, value, amount),
    );
    sheet.invalidateLayout();
}

export function name(sheet: Worksheet, value?: string): string | Worksheet {
    if (value === undefined) return sheet.sheetName;
    if (!value || /[\[\]:*?\\/]/.test(value) || value.length > 31) throw new Error('Invalid worksheet name');
    const existing = sheet.parent?.getSheetFromName(value);
    if (existing && existing !== sheet) throw new Error('Worksheet name already exists');
    const old = sheet.sheetName;
    if (old === value) return sheet;
    const info = { sheet: sheet, oldValue: old, newValue: value, cancel: false };
    sheet._emit(Events.SheetNameChanging, info);
    if (info.cancel) return sheet;
    sheet.sheetName = value;
    sheet.calcEngine?.sheetRenamed?.(sheet, old, value);
    sheet.batch.invalidate();
    sheet._emit(Events.SheetNameChanged, { sheet: sheet, oldValue: old, newValue: value });
    return sheet;
}

export function protect(sheet: Worksheet, password?: string): void {
    const options: JsonRecord = { ...(sheet.options.protectionOptions as JsonRecord | undefined) };
    if (password) Object.assign(options, { algorithmName: 'SHA-512', ...hashSheetPassword(password) }, { spinCount: 100000 });
    else { delete options.hashValue; delete options.saltValue; delete options.algorithmName; }
    sheet.options.protectionOptions = options;
    sheet._passwordRequired = !!password;
    sheet.options.isProtected = true;
}

export function unprotect(sheet: Worksheet, password?: string): boolean {
    if (!sheet.options.isProtected) return true;
    const options = (sheet.options.protectionOptions ?? {}) as JsonRecord;
    if (sheet._passwordRequired && !verifySheetPassword(password ?? '', String(options.saltValue ?? ''), String(options.hashValue ?? '')))
      return false;
    sheet.options.isProtected = false;
    sheet._passwordRequired = false;
    return true;
}

export function hasPassword(sheet: Worksheet, ): boolean {
    return !!sheet.options.isProtected && sheet._passwordRequired;
}

export function _isEditableCell(sheet: Worksheet, row: number, col: number, area = VIEW): boolean {
    if (!sheet.options.isProtected) return true;
    return sheet.getActualStyle(row, col, area).locked === false;
}

export function _isSelectableCell(sheet: Worksheet, row: number, col: number): boolean {
    if (!sheet.options.isProtected) return true;
    const options = (sheet.options.protectionOptions ?? {}) as JsonRecord;
    const locked = sheet.getActualStyle(row, col).locked !== false;
    return locked ? options.allowSelectLockedCells !== false : options.allowSelectUnlockedCells !== false;
}

export function addCustomName(sheet: Worksheet,
    name: string,
    formula: string,
    baseRow: number,
    baseCol: number,
    comment?: string,
    isReadOnly?: boolean,
  ): void {
    assertCustomName(name, formula);
    assertNameFormula(formula.replace(/^=/, ''), sheet.calcEngine?.isR1C1?.() ?? false);
    const key = name.toLowerCase();
    // The trial refuses a second name that collides with one it already holds,
    // ignoring case: adding `MYA` and then `mya` throws `invalid custom name`.
    const taken = sheet.names.get(key);
    if (taken) throw new Error(INVALID_CUSTOM_NAME);
    const info = new NameInfo(name, formula.replace(/^=/, ''), baseRow, baseCol, comment, isReadOnly);
    info._onRename = (previous, next) => {
      const existing = sheet.names.get(next.toLowerCase());
      if (existing && existing !== info) throw new Error('Name already exists');
      sheet.names.delete(previous.toLowerCase());
      sheet.names.set(next.toLowerCase(), info);
    };
    sheet.names.set(key, info);
    info._onChange = () => sheet.calcEngine?.namesChanged?.();
    sheet.calcEngine?.namesChanged?.();
}

export function getCustomName(sheet: Worksheet, name: string): NameInfo {
    return sheet.names.get(name.toLowerCase())!;
}

export function removeCustomName(sheet: Worksheet, name: string): void {
    sheet.names.delete(name.toLowerCase());
    sheet.calcEngine?.namesChanged?.();
}

export function clearCustomNames(sheet: Worksheet, ): void {
    sheet.names.clear();
    sheet.calcEngine?.namesChanged?.();
}

export function clearPendingChanges(sheet: Worksheet,
    info: { row?: number; col?: number; rowCount?: number; colCount?: number; clearType?: number } = {},
  ): void {
    if (info.clearType !== undefined && !(info.clearType & 1)) return;
    const range = new Range(
      info.row ?? 0,
      info.col ?? 0,
      info.rowCount ?? sheet.rows.count,
      info.colCount ?? sheet.cols.count,
    );
    for (const [r, c] of sheet.dirty.entries()) if (range.contains(r, c)) sheet.dirty.set(r, c, undefined);
    if (info.row === undefined && info.col === undefined && info.rowCount === undefined && info.colCount === undefined) {
      sheet.insertedRows.clear();
      sheet.deletedRows.clear();
    }
}

export function rowFilter(sheet: Worksheet, value?: RowFilterBase | null): RowFilterBase | null {
    if (value === undefined) return sheet.rowFilterValue;
    sheet.rowFilterValue = value ?? null;
    if (sheet.rowFilterValue) sheet.rowFilterValue._attach(sheet);
    sheet.batch.invalidate(true);
    return sheet.rowFilterValue;
}

export function addNamedStyle(sheet: Worksheet, style: Style): void {
    if (typeof style.name !== 'string' || !style.name) throw new Error('Named style requires a name');
    sheet.namedStyles.set(style.name.toLowerCase(), style);
}

export function getNamedStyle(sheet: Worksheet, name: string): Style {
    return sheet.namedStyles.get(name.toLowerCase())!;
}

export function getNamedStyles(sheet: Worksheet, ): Style[] {
    return [...sheet.namedStyles.values()];
}

export function removeNamedStyle(sheet: Worksheet, name: string): void {
    sheet.namedStyles.delete(name.toLowerCase());
}

export function _fastValue(sheet: Worksheet, row: number, col: number): unknown {
    if (sheet.hasBoundValues) return sheet.getValue(row, col);
    return sheet.viewCellStore ? (sheet.viewCellStore.getValue(row, col) ?? null) : null;
}

export function _getValue(sheet: Worksheet, row: number, col: number, area = VIEW, valueType = ValueType.normal): unknown {
    [row, col] = a1Cell(sheet, row, col, undefined);
    coordinate(row);
    coordinate(col);
    if (valueType !== ValueType.normal) notImplemented('GC.Spread.Sheets.Worksheet.getValue(valueType)');
    if (area === VIEW && sheet.hasBoundValues) {
      if (sheet.cellSource) { const path = sheet.getBindingPath(row, col); if (path) return sheet.cellSource.getValue(path) ?? null; }
      const tableValue = sheet.tables._hasAny() ? sheet.tables.find(row, col)?._bindingValue(row, col) : undefined;
      if (tableValue) return tableValue.value ?? null;
      const column = sheet.boundColumns.get(col);
      if (sheet.source?.[row] && column) return getPath(sheet.source[row], column.name) ?? null;
    }
    if (area === VIEW && (sheet._dataRangesActive || sheet.extraJSON.dataRanges)) {
      const shadow = sheet.dataRanges._valueAt(row, col);
      if (shadow.found) return shadow.value ?? null;
    }
    return sheet.areas.get(area)?.cells.getValue(row, col) ?? null;
}

export function _setValue(sheet: Worksheet, row: number, col: number, value: unknown, area = VIEW, ignoreRecalc = false): void {
    [row, col, value] = a1Cell(sheet, row, col, value);
    coordinate(row);
    coordinate(col);
    if (area === VIEW && sheet._dataRangesActive && sheet.dataRanges._blocksWrite(row, col)) {
      // The trial drops direct model writes that land inside a data range and
      // re-reads the provider on the next access (probe f40dr1b-map).
      sheet.dataRanges._invalidate(row, col);
      return;
    }
    const scenarioCapture = area === VIEW && sheet.parent?._scenariosCapturing === true && sheet._scenarioCaptureStart(row, col);
    const data = sheet.area(area), oldValue = data.cells.getValue(row, col) ?? null;
    if (area === VIEW) sheet.calcEngine?.cellWriting?.(sheet, row, col);
    const cell = data.cells.peek(row, col), oldFormula = cell?.formula;
    data.cells.setValue(row, col, value);
    if (area === VIEW && sheet.hasBoundValues) {
      if (sheet.source?.[row] && sheet.boundColumns.has(col)) setPath(sheet.source[row], sheet.boundColumns.get(col)!.name, value);
      if (sheet.cellSource && sheet.getBindingPath(row, col)) sheet.cellSource.setValue(sheet.getBindingPath(row, col), value);
      if (sheet.tables._hasAny()) sheet.tables.find(row, col)?._setBindingValue(row, col, value);
    }
    if (cell) sheet.prune(row, col, area);
    if (!Object.is(oldValue, value ?? null) || oldFormula !== undefined) {
      if (area === VIEW) markDirty(sheet, row, col, oldValue, value ?? null);
      if (!ignoreRecalc && area === VIEW && sheet.calcEngine) queueCalc(sheet, { kind: 'value', row, col, value });
      changed(sheet, row, col, area, 'value', oldValue, value ?? null);
    }
    if (scenarioCapture) sheet._scenarioCaptureEnd(row, col);
}

export function markDirty(sheet: Worksheet, row: number, col: number, oldValue: unknown, newValue: unknown): void {
    if (sheet.dirtyDepth) return;
    sheet.dirty.record(row, col, oldValue, newValue);
}

export function _getFormula(sheet: Worksheet, row: number, col: number, area = VIEW): string | null {
    coordinate(row);
    coordinate(col);
    return sheet.areas.get(area)?.cells.peek(row, col)?.formula ?? null;
}

export function _tag(sheet: Worksheet, argc: number, value?: unknown): unknown {
    if (!argc) return sheet.area().tag;
    sheet.area().tag = value;
    return sheet;
}

export function _usedRange(sheet: Worksheet): { row: number; col: number } {
    let row = 0, col = 0;
    for (const [r, c, cell] of sheet.area().cells.entries()) if (cell.value != null || cell.formula) { row = Math.max(row, r); col = Math.max(col, c); }
    return { row, col };
}

export function suspendPaint(sheet: Worksheet): void {
    sheet.batch.paint++;
}

export function resumePaint(sheet: Worksheet): void {
    sheet.batch.paint = Math.max(0, sheet.batch.paint - 1);
    if (!sheet.batch.paint && !sheet.parent?.isPaintSuspended()) { sheet.batch.flush(); sheet.parent?._renderer()?.schedule(); }
}

export function isPaintSuspended(sheet: Worksheet): boolean {
    return sheet.batch.paint > 0 || !!sheet.parent?.isPaintSuspended();
}

export function suspendCalcService(sheet: Worksheet, _ignoreDirty = false): void {
    sheet.batch.calc++;
}

export function resumeCalcService(sheet: Worksheet, recalcAll = false): void {
    sheet.batch.calc = Math.max(0, sheet.batch.calc - 1);
    sheet.flushCalc(recalcAll);
}

/** Options Proxy used by the `Worksheet` constructor: any set repaints. */
export function _invalidatingProxy<T extends object>(sheet: Worksheet, target: T): T {
    return new Proxy(target, {
      set: (t, key, value) => { Reflect.set(t, key, value); sheet.invalidateLayout(); return true; },
    });
}

/** `defaults` Proxy used by the `Worksheet` constructor: mirrors the size onto the axis. */
export function _defaultsProxy(sheet: Worksheet, target: Worksheet['dimensions']): Worksheet['dimensions'] {
    return new Proxy(target, {
      set: (t, key, value) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          throw new RangeError('Invalid default dimension');
        Reflect.set(t, key, value);
        const axis =
          key === 'rowHeight'
            ? sheet.rows
            : key === 'colWidth'
              ? sheet.cols
              : key === 'colHeaderRowHeight'
                ? sheet.headerRows
                : sheet.headerCols;
        axis.defaultSize = value;
        sheet.invalidateLayout();
        return true;
      },
    });
}

/** Default `settings` record for a fresh `Worksheet`. */
export function _defaultSheetSettings(): JsonRecord {
    return {
      visible: 1,
      zoomFactor: 1,
      frozenRowCount: 0,
      frozenColCount: 0,
      frozenTrailingRowCount: 0,
      frozenTrailingColCount: 0,
      showRowOutline: true,
      showColumnOutline: true,
      topCellIndex: 0,
      leftCellIndex: 0,
    };
}

export function area(sheet: Worksheet, area = VIEW): AreaData {
    let data = sheet.areas.get(area);
    if (area === VIEW && data) {
      sheet.viewCellStore = data.cells;
      sheet.viewAreaCache = data;
    }
    if (!data) {
      const defaultStyle = new Style();
      defaultStyle.themeFont = 'Body';
      sheet.areas.set(
        area,
        (data = {
          cells: new CellStore(),
          rowStyles: new Map(),
          colStyles: new Map(),
          defaultStyle,
          spans: [],
        }),
      );
      if (area === VIEW) {
        sheet.viewCellStore = data.cells;
        sheet.viewAreaCache = data;
      }
    }
    return data;
}

export function cell(sheet: Worksheet, row: number, col: number, area = VIEW): CellData | undefined {
    if (area === VIEW && sheet.viewAreaCache) return sheet.viewAreaCache.cells.peek(row, col);
    return sheet.areas.get(area)?.cells.peek(row, col);
}

export function ensure(sheet: Worksheet, row: number, col: number, area = VIEW): CellData {
    const data = area === VIEW && sheet.viewAreaCache ? sheet.viewAreaCache : sheet.area(area);
    let cell = data.cells.get(row, col);
    if (!cell) data.cells.set(row, col, (cell = {}));
    return cell;
}

export function prune(sheet: Worksheet, row: number, col: number, area = VIEW): void {
    const cell = sheet.areas.get(area)?.cells.peek(row, col);
    if (cell && !Object.keys(cell).length) sheet.area(area).cells.set(row, col, undefined);
}

export function a1Cell(sheet: Worksheet, row: unknown, col: unknown, value: unknown): [number, number, unknown] {
    if (typeof row === 'string') {
      const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(row.trim());
      if (m) {
        let c = 0;
        for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
        return [Number(m[2]) - 1, c - 1, col];
      }
    }
    return [row as number, col as number, value];
}

export function getCell(sheet: Worksheet, row: number, col: number, area = VIEW): CellRange {
    return new CellRange(sheet, row, col, 1, 1, area);
}

export function getRange(sheet: Worksheet, row: number | string, col = 0, rowCount = 1, colCount = 1, area = VIEW): CellRange {
    if (typeof row === 'string') {
      const address = row.replace(/^.*!/, '').replace(/\$/g, '');
      const [start, end = start] = address.split(':');
      const parse = (part: string): [number, number] => {
        const match = part.match(/^([A-Za-z]*)(\d*)$/);
        if (!match || !part) throw new Error('Invalid range address');
        let c = 0;
        for (const ch of match[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
        return [match[2] ? Number(match[2]) - 1 : -1, match[1] ? c - 1 : -1];
      };
      const [r, c] = parse(start),
        [er, ec] = parse(end);
      return new CellRange(sheet, r, c, r < 0 ? -1 : er - r + 1, c < 0 ? -1 : ec - c + 1, col || VIEW);
    }
    return new CellRange(sheet, row, col, rowCount, colCount, area);
}

export function _viewCellStore(sheet: Worksheet, ): CellStore<CellData> | undefined {
    return sheet.viewCellStore;
}

export function _arrayFormula(sheet: Worksheet, row: number, col: number): { rowCount: number; colCount: number } | undefined {
    return sheet.areas.get(VIEW)?.cells.peek(row, col)?.arrayFormula;
}

export function getSpan(sheet: Worksheet, row: number, col: number, area = VIEW): Range | null {
    return sheet.area(area).spans.find((s) => s.contains(row, col)) ?? null;
}

export function getSpans(sheet: Worksheet, range?: Range, area = VIEW): Range[] {
    return sheet.area(area)
      .spans.filter((s) => !range || s.intersect(range.row, range.col, range.rowCount, range.colCount))
      .map((s) => new Range(s.row, s.col, s.rowCount, s.colCount));
}

export function isDirty(sheet: Worksheet, ): boolean {
    return sheet.dirty.size > 0;
}

export function hasPendingChanges(sheet: Worksheet, ): boolean {
    return sheet.isDirty();
}

export function getDirtyCells(sheet: Worksheet, row = 0, col = 0, rowCount = sheet.rows.count, colCount = sheet.cols.count): DirtyCell[] {
    const range = new Range(row, col, rowCount, colCount);
    return [...sheet.dirty.entries()].filter(([r, c]) => range.contains(r, c)).map(([, , v]) => ({ ...v }));
}

export function suspendDirty(sheet: Worksheet, ): void {
    sheet.dirtyDepth++;
}

export function resumeDirty(sheet: Worksheet, ): void {
    sheet.dirtyDepth = Math.max(0, sheet.dirtyDepth - 1);
}

export function isDirtySuspended(sheet: Worksheet, ): boolean {
    return sheet.dirtyDepth > 0;
}

export function _flushPaint(sheet: Worksheet, ): void {
    sheet.batch.flush();
}

export function _onInvalidate(sheet: Worksheet, callback: (layout: boolean) => void): void {
    sheet.batch.onInvalidate = callback;
}

export function _resumeWorkbookCalc(sheet: Worksheet, recalcAll = false): void {
    sheet.flushCalc(recalcAll);
}

export function recalcAll(sheet: Worksheet, _refreshAll = false): void {
    sheet.calcEngine?.recalcAll?.();
}

export function addCustomFunction(sheet: Worksheet, fn: import('./calc/functions-api.js').CalcFunction): void {
    assertCustomFunction(fn);
    sheet.calcEngine?.addFunction?.(fn, sheet);
}

export function getCustomFunction(sheet: Worksheet, name: string): unknown {
    // The trial's public getter only sees the functions registered on this
    // sheet; workbook-scope functions stay invisible here.
    return sheet.calcEngine?.getSheetFunction?.(sheet, name);
}

export function removeCustomFunction(sheet: Worksheet, name: string): void {
    sheet.calcEngine?.removeCustomFunction?.(name, sheet);
}

export function clearCustomFunctions(sheet: Worksheet): void {
    sheet.calcEngine?.clearFunctions?.(sheet);
}

export function getPrecedents(sheet: Worksheet, row: number, col: number): CellsInfo[] {
    return sheet.calcEngine?.precedentsOf?.(sheet, row, col) ?? [];
}

export function getDependents(sheet: Worksheet, row: number, col: number): CellsInfo[] {
    return sheet.calcEngine?.dependentsOfCell?.(sheet, row, col) ?? [];
}

export function getFormulaInformation(sheet: Worksheet, row: number, col: number): FormulaInfo {
    const stored = row >= 0 && col >= 0 ? _getFormula(sheet, row, col) : null;
    return sheet.calcEngine?.formulaInformationOf?.(sheet, row, col, stored) ?? {};
}

export function invalidateLayout(sheet: Worksheet, ): void {
    sheet.batch.invalidate(true);
}

export function repaint(sheet: Worksheet, _clipRect?: unknown): void {
    sheet.batch.invalidate();
}

export function _isFreshHyperlink(sheet: Worksheet, row: number, col: number): boolean {
    const hyperlink = sheet.cell(row, col, VIEW)?.hyperlink;
    return !!hyperlink && Object.prototype.hasOwnProperty.call(hyperlink, '_fresh');
}

export function _setCalcEngine(sheet: Worksheet, engine?: ICalcEngine): void {
    sheet.calcEngine = engine;
}

export function _translateFormula(sheet: Worksheet, formula: string, rows: number, columns: number): string {
    return sheet.calcEngine?.translateFormula
      ? sheet.calcEngine.translateFormula(formula, rows, columns)
      : adjustFormula(formula, rows, columns);
}

export function _setFormulaText(sheet: Worksheet, row: number, col: number, formula: string): void {
    const cell = sheet.areas.get(VIEW)?.cells.peek(row, col);
    if (cell) cell.formula = formula;
}

export function getParent(sheet: Worksheet, ): WorkbookHost {
    return sheet.parent!;
}

export function _attach(sheet: Worksheet, parent?: WorkbookHost): void {
    sheet.parent = parent;
    sheet.calcEngine = parent?._calcEngine() as ICalcEngine | undefined;
}
