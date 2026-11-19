/**
 * Row/column structure for `Worksheet`: axis resize, full-axis and band
 * shifts, `clear` and `copyTo`/`moveTo` transfer and the sparse undo
 * snapshots. Bodies moved out of `worksheet.ts` unchanged (`this` renamed to
 * the `sheet` parameter); the class keeps thin delegating methods.
 */
import { GC } from './generated/enums.js';
import { clone, Range, Style } from './primitives.js';
import { adjustFormula } from './range.js';
import { Events } from './events.js';
import { notImplemented } from './not-implemented.js';
import { noteRowChange } from './sheet-state.js';
import { Comment } from './comments.js';
import {
  type CellData,
  coordinate,
  count,
} from './sheet-common.js';
import type { JsonRecord } from './serialization.js';
import type { Worksheet } from './worksheet.js';

const { SheetArea, StorageType, CopyToOptions } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

export function resizeAxis(sheet: Worksheet, axis: 'row' | 'col', value: number, area: number, guardContent?: number): void {
    count(value);
    if (guardContent) notImplemented('Worksheet.setCount(guardContent)');
    const layout = axis === 'row' ? sheet._rowLayout(area) : sheet._columnLayout(area),
      old = layout.count;
    if (value < old) sheet.shift(axis, value, old - value, area, true, false, false);
    else layout.resize(value);
    // The trial rebuilds the row/column collections on any resize whose count
    // changes (viewport areas and the header areas alike) and drops the
    // pending-change bookkeeping (dirty cells and inserted/deleted rows)
    // instead of shifting it - see .probe/report-item3o.json `resizedirty3`.
    if (value !== old) {
      sheet.dirty.clear();
      sheet.insertedRows.clear();
      sheet.deletedRows.clear();
    }
    sheet.invalidateLayout();
}

export function shiftAxisBand(sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    amount: number,
    crossStart: number,
    crossEnd: number,
    remove: boolean,
  ): void {
    coordinate(index);
    count(amount);
    if (!amount) return;
    if (crossEnd < crossStart) return;
    for (const [, data] of sheet.areas) {
      data.cells.shift(axis, index, amount, remove, crossStart, crossEnd);
      data.spans = data.spans.flatMap((span) => {
        const crossSize = axis === 'row' ? span.colCount : span.rowCount;
        const crossStartOfSpan = axis === 'row' ? span.col : span.row;
        if (crossStartOfSpan < crossStart || crossStartOfSpan + crossSize - 1 > crossEnd) return [span];
        const start = axis === 'row' ? span.row : span.col;
        const size = axis === 'row' ? span.rowCount : span.colCount;
        let nextStart = start,
          nextSize = size;
        if (remove) {
          const end = start + size,
            removed = Math.max(0, Math.min(end, index + amount) - Math.max(start, index));
          nextSize -= removed;
          nextStart = start >= index + amount ? start - amount : start >= index ? index : start;
        } else if (index <= start) nextStart += amount;
        else if (index < start + size) nextSize += amount;
        if (nextSize <= 0) return [];
        return [
          new Range(
            axis === 'row' ? nextStart : span.row,
            axis === 'col' ? nextStart : span.col,
            axis === 'row' ? nextSize : span.rowCount,
            axis === 'col' ? nextSize : span.colCount,
          ),
        ];
      });
    }
    if (axis === 'row') sheet.comments._shift('row', index, amount, remove, crossStart, crossEnd);
    else sheet.comments._shift('col', index, amount, remove, crossStart, crossEnd);
    if (sheet.calcEngine) sheet.calcEngine.adjustStructure?.(sheet, axis, index, amount, remove, crossStart, crossEnd);
    sheet._view()?.schedule();
}

export function shiftAxis(sheet: Worksheet,
    axis: 'row' | 'col',
    index: number,
    amount: number,
    area: number,
    remove: boolean,
    emit = true,
    trackChanges = true,
  ): void {
    coordinate(index);
    count(amount);
    const layout = axis === 'row' ? sheet._rowLayout(area) : sheet._columnLayout(area),
      old = layout.count;
    if (index > old || (remove && index + amount > old)) throw new RangeError('Invalid structural change');
    if (!amount) return;
    // Array-spill outputs are derived values; drop them before the shift so the
    // anchors re-spill instead of colliding with their own moved output.
    if (area === VIEW) sheet.calcEngine?.clearSpills?.(sheet);
    const property = `${remove ? 'delete' : 'add'}${axis === 'row' ? 'Rows' : 'Columns'}`;
    const changing = sheet.axisInfo(axis, index, area, property, old, amount, amount);
    changing.cancel = false;
    sheet._emit(axis === 'row' ? Events.RowChanging : Events.ColumnChanging, changing);
    if (changing.cancel) return;
    const translate = (i: number) =>
      remove && i >= index && i < index + amount
        ? -1
        : i >= index + (remove ? amount : 0)
          ? i + (remove ? -amount : amount)
          : i;
    for (const [id, data] of sheet.areas) {
      if ((axis === 'row' ? sheet._rowLayout(id) : sheet._columnLayout(id)) !== layout) continue;
      data.cells.shift(axis, index, amount, remove);
      const styles = axis === 'row' ? data.rowStyles : data.colStyles;
      const next = new Map([...styles].map(([i, s]) => [translate(i), s] as const).filter(([i]) => i >= 0));
      if (axis === 'row') data.rowStyles = next;
      else data.colStyles = next;
      data.spans = data.spans.flatMap((span) => {
        const start = axis === 'row' ? span.row : span.col,
          size = axis === 'row' ? span.rowCount : span.colCount;
        let nextStart = start,
          nextSize = size;
        if (remove) {
          const end = start + size,
            removed = Math.max(0, Math.min(end, index + amount) - Math.max(start, index));
          nextSize -= removed;
          nextStart = start >= index + amount ? start - amount : start >= index ? index : start;
        } else if (index <= start) nextStart += amount;
        else if (index < start + size) nextSize += amount;
        if (nextSize <= 0) return [];
        return [
          new Range(
            axis === 'row' ? nextStart : span.row,
            axis === 'col' ? nextStart : span.col,
            axis === 'row' ? nextSize : span.rowCount,
            axis === 'col' ? nextSize : span.colCount,
          ),
        ];
      });
    }
    const meta = sheet.metadata.get(layout);
    if (meta)
      sheet.metadata.set(
        layout,
        new Map([...meta].map(([i, v]) => [translate(i), v] as const).filter(([i]) => i >= 0)),
      );
    layout.shift(index, amount, remove);
    if (layout === (axis === 'row' ? sheet.rows : sheet.cols)) {
      sheet.dirty.shift(axis, index, amount, remove);
      if (axis === 'row' && area === VIEW && trackChanges) noteRowChange(sheet, index, amount, remove);
      sheet.comments._shift(axis, index, amount, remove);
      sheet.threadedComments._shift(axis, index, amount, remove);
      if (axis === 'row') sheet.rowOutlines._shift(index, amount, remove);
      else sheet.columnOutlines._shift(index, amount, remove);
    }
    if (area === VIEW) sheet.tables._shift(axis, index, amount, remove);
    if (emit) sheet.axisChanged(axis, index, area, property, old, amount, amount);
    else sheet.invalidateLayout();
    if (area === VIEW) sheet.conditionalFormats._shift(axis, index, amount, remove);
    if (area === VIEW && sheet.calcEngine) sheet.calcEngine.adjustStructure?.(sheet, axis, index, amount, remove);
}

export function clearRange(sheet: Worksheet, 
    row: number,
    col: number,
    rowCount: number,
    colCount: number,
    area = VIEW,
    storageType = StorageType.data,
  ): void {
    const range = new Range(row, col, rowCount, colCount).normalized(
        sheet.getRowCount(area),
        sheet.getColumnCount(area),
      ),
      data = sheet.area(area);
    const changedCells: { row: number; col: number; sheetArea: number }[] = [];
    // Batch recalculation until every cleared value has actually left the store;
    // otherwise dependents observe the old precedent during an eager flush.
    if (area === VIEW) sheet.suspendCalcService();
    try {
    for (const [r, c, cell] of data.cells.entries())
      if (range.contains(r, c)) {
        if (storageType & StorageType.data) {
          const old = cell.value;
          delete cell.value;
          delete cell.formula;
          if (area === VIEW) {
            if (old !== undefined) sheet.markDirty(r, c, old, null);
            sheet.queueCalc({ kind: 'value', row: r, col: c, value: null });
          }
        }
        if (storageType & StorageType.style) {
          delete cell.style;
          delete cell.validator;
        }
        if (storageType & StorageType.tag) delete cell.tag;
        if (storageType & StorageType.bindingPath) delete cell.bindingPath;
        if (storageType & StorageType.hyperlink) delete cell.hyperlink;
        if (storageType & StorageType.altText) delete cell.altText;
        data.cells.set(r, c, Object.keys(cell).length ? cell : undefined);
        changedCells.push({ row: r, col: c, sheetArea: area });
      }
    if (storageType & StorageType.style) {
      if (col === -1)
        for (const r of data.rowStyles.keys()) if (range.contains(r, 0)) data.rowStyles.delete(r);
      if (row === -1)
        for (const c of data.colStyles.keys()) if (range.contains(0, c)) data.colStyles.delete(c);
      if (row === -1 && col === -1) data.defaultStyle = Object.assign(new Style(), { themeFont: 'Body' });
    }
    if (area === VIEW && storageType & StorageType.style && sheet.validationRecords.length)
      sheet._removeValidatorRanges(range);
    if (area === VIEW && storageType & StorageType.comment) {
      for (const comment of sheet.comments.all())
        if (range.contains(comment.rowIndex(), comment.colIndex()))
          sheet.comments.remove(comment.rowIndex(), comment.colIndex());
      sheet.threadedComments.clear(range);
    }
    if (storageType & StorageType.axis) {
      if (col === -1) {
        sheet._rowLayout(area).reset(range.row, range.rowCount);
        for (const r of sheet.axisMetadata('row', area).keys())
          if (r >= range.row && r < range.row + range.rowCount) sheet.axisMetadata('row', area).delete(r);
      }
      if (row === -1) {
        sheet._columnLayout(area).reset(range.col, range.colCount);
        for (const c of sheet.axisMetadata('col', area).keys())
          if (c >= range.col && c < range.col + range.colCount) sheet.axisMetadata('col', area).delete(c);
      }
    }
    } finally {
      if (area === VIEW) sheet.resumeCalcService();
    }
    sheet._emit(Events.RangeChanged, {
      sheet: sheet,
      sheetName: sheet.sheetName,
      row,
      col,
      rowCount,
      colCount,
      changedCells,
      action: GC.Spread.Sheets.RangeChangedAction.clear,
      isUndo: false,
    });
    sheet.batch.invalidate();
}

export function transferRange(sheet: Worksheet, 
    fr: number,
    fc: number,
    tr: number,
    tc: number,
    rc: number,
    cc: number,
    option: number,
    move: boolean,
  ): void {
    const wholeColumns = fr === -1,
      wholeRows = fc === -1;
    tr = Math.max(0, tr);
    tc = Math.max(0, tc);
    const from = new Range(fr, fc, rc, cc).normalized(sheet.rows.count, sheet.cols.count),
      target = new Range(tr, tc, from.rowCount, from.colCount),
      data = sheet.area();
    const flags: [keyof CellData, number][] = [
      ['value', CopyToOptions.value],
      ['formula', CopyToOptions.formula],
      ['style', CopyToOptions.style],
      ['validator', CopyToOptions.style],
      ['tag', CopyToOptions.tag],
      ['bindingPath', CopyToOptions.bindingPath],
      ['defaultValue', CopyToOptions.defaultValue],
      ['altText', CopyToOptions.altText],
      ['hyperlink', CopyToOptions.hyperlink],
    ];
    const oldValues = new Map<string, { r: number; c: number; value: unknown; formula: string | null }>();
    const remember = (r: number, c: number) => {
      const key = `${r}:${c}`;
      if (!oldValues.has(key))
        oldValues.set(key, { r, c, value: sheet.getValue(r, c), formula: sheet.getFormula(r, c) });
    };
    if (option & (CopyToOptions.value | CopyToOptions.formula))
      for (const [r, c] of data.cells.entries()) {
        if (target.contains(r, c) || (move && from.contains(r, c))) remember(r, c);
        if (from.contains(r, c)) remember(r - from.row + tr, c - from.col + tc);
      }
    const cells = [...data.cells.entries()]
      .filter(([r, c]) => from.contains(r, c))
      .map(([r, c, v]) => {
        const copy = clone(v);
        const source = v.hyperlink as JsonRecord | undefined;
        if (copy.hyperlink && source && Object.prototype.hasOwnProperty.call(source, '_fresh'))
          Object.defineProperty(copy.hyperlink, '_fresh', { value: true, enumerable: false, configurable: true });
        return [r, c, copy] as const;
      });
    const spans = data.spans.filter((s) => from.containsRange(s)).map(clone);
    const comments = sheet.comments
      .all()
      .filter((c) => from.contains(c.rowIndex(), c.colIndex()))
      .map((c) => c.toJSON());
    const threads = sheet.threadedComments
      .all()
      .filter((t) => from.contains(t.row(), t.col()))
      .map((t) => ({ row: t.row(), col: t.col(), json: t.toJSON() }));
    for (const [r, c, cell] of [...data.cells.entries()])
      if (target.contains(r, c) || (move && from.contains(r, c))) {
        for (const [key, flag] of flags)
          if (option & flag && !(move && key === 'hyperlink')) delete cell[key];
        if (option & CopyToOptions.value) delete cell.formula;
        data.cells.set(r, c, Object.keys(cell).length ? cell : undefined);
      }
    for (const [r, c, cell] of cells) {
      const nr = r - from.row + tr,
        nc = c - from.col + tc;
      const dest = sheet.ensure(nr, nc);
      if (option & CopyToOptions.formula && cell.formula) delete dest.value;
      const sourceHyperlink = cell.hyperlink as JsonRecord | undefined;
      for (const [key, flag] of flags)
        if (option & flag && cell[key] !== undefined && !(move && key === 'hyperlink'))
          Object.assign(dest, {
            [key]:
              key === 'formula' && !move
                ? sheet.calcEngine?.translateFormula
                  ? sheet.calcEngine.translateFormula(String(cell[key]), nr - r, nc - c)
                  : adjustFormula(String(cell[key]), nr - r, nc - c)
                : cell[key],
          });
      if (sourceHyperlink && dest.hyperlink && Object.prototype.hasOwnProperty.call(sourceHyperlink, '_fresh'))
        Object.defineProperty(dest.hyperlink, '_fresh', { value: true, enumerable: false, configurable: true });
      sheet.prune(nr, nc);
    }
    if (option & CopyToOptions.style)
      for (const [styles, whole, start, end, destination] of [
        [data.colStyles, wholeColumns, from.col, from.col + from.colCount, tc],
        [data.rowStyles, wholeRows, from.row, from.row + from.rowCount, tr],
      ] as const)
        if (whole) {
          const source = [...styles]
            .filter(([i]) => i >= start && i < end)
            .map(([i, s]) => [i, clone(s)] as const);
          for (const i of styles.keys())
            if ((i >= destination && i < destination + end - start) || (move && i >= start && i < end))
              styles.delete(i);
          for (const [i, s] of source) styles.set(i - start + destination, s);
        }
    if (option & CopyToOptions.span) {
      data.spans = data.spans.filter(
        (s) => !target.intersect(s.row, s.col, s.rowCount, s.colCount) && !(move && from.containsRange(s)),
      );
      for (const s of spans) data.spans.push(s.offset(tc - from.col, tr - from.row));
    }
    if (option & CopyToOptions.comment) {
      for (const c of sheet.comments.all())
        if (
          target.contains(c.rowIndex(), c.colIndex()) ||
          (move && from.contains(c.rowIndex(), c.colIndex()))
        )
          sheet.comments.remove(c.rowIndex(), c.colIndex());
      for (const raw of comments) {
        const c = new Comment();
        c.fromJSON(raw);
        sheet.comments.set(Number(raw.rowIndex) - from.row + tr, Number(raw.colIndex) - from.col + tc, c);
      }
      for (const t of sheet.threadedComments.all())
        if (target.contains(t.row(), t.col()) || (move && from.contains(t.row(), t.col())))
          sheet.threadedComments.remove(t.row(), t.col());
      for (const t of threads) {
        const thread = sheet.threadedComments.add(t.row - from.row + tr, t.col - from.col + tc);
        thread?.fromJSON(t.json);
      }
    }
    sheet.suspendCalcService();
    try {
      if (move) sheet.calcEngine?.moveRange?.(sheet, from.row, from.col, tr, tc, from.rowCount, from.colCount);
      for (const { r, c, value, formula: oldFormula } of oldValues.values()) {
        const next = sheet.getValue(r, c);
        if (!Object.is(value, next) || oldFormula !== sheet.getFormula(r, c))
          sheet.markDirty(r, c, value, next);
        const formula = sheet.getFormula(r, c);
        if (formula) sheet.queueCalc({ kind: 'formula', row: r, col: c, formula });
        else sheet.queueCalc({ kind: 'value', row: r, col: c, value: next });
      }
    } finally {
      sheet.resumeCalcService();
    }
    sheet.batch.invalidate();
}

export function snapshotRanges(sheet: Worksheet, ranges: Range[]): () => void {
    const data = sheet.area(), contains = (row: number, col: number) => ranges.some(range => range.contains(row, col));
    const cells = [...data.cells.entries()].filter(([row, col]) => contains(row, col)).map(([row, col, cell]) => [row, col, clone(cell)] as const);
    const spans = data.spans.filter(span => ranges.some(range => range.intersect(span.row, span.col, span.rowCount, span.colCount))).map(clone);
    const notes = sheet.comments.all().filter(note => contains(note.rowIndex(), note.colIndex())).map(note => note.toJSON());
    const threads = sheet.threadedComments.all().filter(thread => contains(thread.row(), thread.col())).map(thread => ({ row: thread.row(), col: thread.col(), json: thread.toJSON() }));
    return () => {
      const old = new Map<string, { row: number; col: number; value: unknown }>();
      for (const [row, col, cell] of data.cells.entries()) if (contains(row, col)) {
        old.set(`${row}:${col}`, { row, col, value: cell.value }); data.cells.set(row, col, undefined);
      }
      for (const [row, col, cell] of cells) {
        if (!old.has(`${row}:${col}`)) old.set(`${row}:${col}`, { row, col, value: undefined });
        data.cells.set(row, col, clone(cell));
      }
      data.spans = data.spans.filter(span => !ranges.some(range => range.intersect(span.row, span.col, span.rowCount, span.colCount))).concat(spans.map(clone));
      for (const note of sheet.comments.all()) if (contains(note.rowIndex(), note.colIndex())) sheet.comments.remove(note.rowIndex(), note.colIndex());
      for (const raw of notes) { const note = new Comment(); note.fromJSON(raw); sheet.comments.set(note.rowIndex(), note.colIndex(), note); }
      for (const thread of sheet.threadedComments.all()) if (contains(thread.row(), thread.col())) sheet.threadedComments.remove(thread.row(), thread.col());
      for (const t of threads) { const thread = sheet.threadedComments.add(t.row, t.col); thread?.fromJSON(t.json); }
      for (const { row, col, value } of old.values()) {
        const next = sheet.getValue(row, col);
        if (!Object.is(value ?? null, next)) { sheet.markDirty(row, col, value, next); sheet._emit(Events.ValueChanged, { sheet: sheet, sheetName: sheet.name(), row, col, oldValue: value ?? null, newValue: next }); }
        const formula = sheet.getFormula(row, col);
        if (formula) sheet.queueCalc({ kind: 'formula', row, col, formula }); else sheet.queueCalc({ kind: 'value', row, col, value: next });
      }
      sheet.invalidateLayout();
    };
}
