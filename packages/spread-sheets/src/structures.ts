/**
 * Row store backing a SparseGrid row (TASK 79): two parallel arrays kept sorted by
 * column. A `Map<number, T>` per row costs ~1.1 KiB for a 20-column row (bucket table +
 * entry records); the parallel arrays cost ~200 B for the same row and stay
 * binary-search fast, which is what the 100k-distinct-styles benchmark measured against
 * the reference product. Iterators snapshot the row so mutation during iteration keeps
 * the previous Map semantics (visited entries survive deletion mid-loop).
 */
class SparseRow<T> {
  cols: number[] = [];
  vals: (T | undefined)[] = [];
  get size(): number {
    return this.cols.length;
  }
  /** Index of `col`, or `~insertPos` when absent. */
  private find(col: number): number {
    const cols = this.cols;
    let lo = 0,
      hi = cols.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1,
        c = cols[mid]!;
      if (c === col) return mid;
      if (c < col) lo = mid + 1;
      else hi = mid - 1;
    }
    return ~lo;
  }
  get(col: number): T | undefined {
    const i = this.find(col);
    return i < 0 ? undefined : this.vals[i];
  }
  has(col: number): boolean {
    return this.find(col) >= 0;
  }
  set(col: number, value: T | undefined): void {
    const i = this.find(col);
    if (i >= 0) {
      if (value === undefined) {
        this.cols.splice(i, 1);
        this.vals.splice(i, 1);
      } else this.vals[i] = value;
      return;
    }
    if (value === undefined) return;
    const at = ~i;
    this.cols.splice(at, 0, col);
    this.vals.splice(at, 0, value);
  }
  /** [col, value] pairs in ascending column order (row copy: safe under mutation). */
  *ascending(): IterableIterator<[number, T]> {
    const cols = this.cols.slice() as number[],
      vals = this.vals.slice() as T[];
    for (let i = 0; i < cols.length; i++) yield [cols[i]!, vals[i]!];
  }
  /** [col, value] pairs in descending column order (row copy, see `ascending`). */
  *descending(): IterableIterator<[number, T]> {
    const cols = this.cols.slice() as number[],
      vals = this.vals.slice() as T[];
    for (let i = cols.length - 1; i >= 0; i--) yield [cols[i]!, vals[i]!];
  }
}

/** Row chunks keep an empty million-row worksheet constant in size. */
export class SparseGrid<T> {
  private chunks = new Map<number, Map<number, SparseRow<T>>>();
  get(row: number, col: number): T | undefined {
    return this.chunks
      .get(Math.floor(row / 256))
      ?.get(row)
      ?.get(col);
  }
  has(row: number, col: number): boolean {
    return this.get(row, col) !== undefined;
  }
  set(row: number, col: number, value: T | undefined): void {
    const chunkIndex = Math.floor(row / 256);
    let chunk = this.chunks.get(chunkIndex),
      cells = chunk?.get(row);
    if (value === undefined) {
      cells?.set(col, undefined);
      if (!cells?.size) chunk?.delete(row);
      if (!chunk?.size) this.chunks.delete(chunkIndex);
      return;
    }
    if (!chunk) this.chunks.set(chunkIndex, (chunk = new Map()));
    if (!cells) chunk.set(row, (cells = new SparseRow()));
    cells.set(col, value);
  }
  *entries(): IterableIterator<[number, number, T]> {
    for (const chunk of this.chunks.values())
      for (const [row, cells] of chunk) for (const [col, value] of cells.ascending()) yield [row, col, value];
  }
  /**
   * Like `entries()` but in ascending (row, col) order, or descending with
   * `reverse`. Columns are stored sorted, so only chunk and row keys may need
   * sorting; ordered writes (setArray) hit the cheap monotonicity check.
   */
  *orderedEntries(reverse = false): IterableIterator<[number, number, T]> {
    const sign = reverse ? -1 : 1;
    const chunkKeys = [...this.chunks.keys()].sort((a, b) => sign * (a - b));
    for (const chunkKey of chunkKeys) {
      const chunk = this.chunks.get(chunkKey);
      if (!chunk) continue;
      const rowKeys = [...chunk.keys()];
      for (let i = 1; i < rowKeys.length; i++)
        if ((rowKeys[i]! - rowKeys[i - 1]!) * sign <= 0) {
          rowKeys.sort((a, b) => sign * (a - b));
          break;
        }
      for (const row of rowKeys) {
        const cells = chunk.get(row);
        if (!cells) continue;
        for (const [col, value] of reverse ? cells.descending() : cells.ascending()) yield [row, col, value];
      }
    }
  }
  clear(): void {
    this.chunks.clear();
  }
  get size(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) for (const row of chunk.values()) count += row.size;
    return count;
  }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean, crossStart = Number.NEGATIVE_INFINITY, crossEnd = Number.POSITIVE_INFINITY): void {
    const entries = [...this.entries()];
    this.clear();
    for (const [r, c, value] of entries) {
      const old = axis === 'row' ? r : c;
      const cross = axis === 'row' ? c : r;
      if (cross < crossStart || cross > crossEnd) {
        this.set(r, c, value);
        continue;
      }
      if (remove && old >= index && old < index + count) continue;
      const next = old >= index + (remove ? count : 0) ? old + (remove ? -count : count) : old;
      this.set(axis === 'row' ? next : r, axis === 'col' ? next : c, value);
    }
  }
}

/** Sparse Fenwick tree of deviations from a uniform size, including hidden items. */
export class AxisLayout {
  private tree = new Map<number, number>();
  private sizes = new Map<number, number>();
  private hidden = new Set<number>();
  /** Indices explicitly shown (serialised as `visible: true`); see `setVisible`. */
  private shown = new Set<number>();
  constructor(
    public count: number,
    private baseSize: number,
  ) {}
  get defaultSize(): number {
    return this.baseSize;
  }
  set defaultSize(value: number) {
    this.baseSize = value;
    this.rebuild();
  }
  getSize(index: number): number {
    return this.hidden.has(index) ? 0 : (this.sizes.get(index) ?? this.baseSize);
  }
  getStoredSize(index: number): number | undefined {
    return this.sizes.get(index);
  }
  isVisible(index: number): boolean {
    return !this.hidden.has(index);
  }
  setSize(index: number, size: number): void {
    const old = this.getSize(index);
    this.sizes.set(index, size);
    this.update(index, this.getSize(index) - old);
  }
  /**
   * TASK 75 (Unhide Rows/Cols probes): an explicit show keeps a materialised
   * `visible: true` record in the sheet JSON, so the axis also tracks the rows/columns
   * somebody *showed*. `record:false` is the internal path (outline collapse/expand),
   * which the trial does not serialise at all.
   */
  setVisible(index: number, visible: boolean, record = true): void {
    const old = this.getSize(index);
    if (visible) {
      this.hidden.delete(index);
      if (record) this.shown.add(index);
    } else {
      this.hidden.add(index);
      this.shown.delete(index);
    }
    this.update(index, this.getSize(index) - old);
  }
  /**
   * Drops the materialised `visible: true` record of an index without touching the layout.
   * TASK 75 (`clearFilter` probe): the trial restores filtered-out rows silently, so no
   * `rows: [{visible: true}]` entry survives clearing a filter.
   */
  unrecordVisible(index: number): void {
    this.shown.delete(index);
  }
  resize(count: number): void {
    this.count = count;
    for (const i of this.sizes.keys()) if (i >= count) this.sizes.delete(i);
    for (const i of this.hidden) if (i >= count) this.hidden.delete(i);
    for (const i of this.shown) if (i >= count) this.shown.delete(i);
    this.rebuild();
  }
  reset(start: number, count: number): void {
    const end = start + count;
    for (const i of this.sizes.keys()) if (i >= start && i < end) this.sizes.delete(i);
    for (const i of this.hidden) if (i >= start && i < end) this.hidden.delete(i);
    for (const i of this.shown) if (i >= start && i < end) this.shown.delete(i);
    this.rebuild();
  }
  private update(index: number, delta: number): void {
    for (let i = index + 1; i <= this.count; i += i & -i) {
      const value = (this.tree.get(i) ?? 0) + delta;
      if (value) this.tree.set(i, value);
      else this.tree.delete(i);
    }
  }
  private rebuild(): void {
    this.tree.clear();
    for (const i of new Set([...this.sizes.keys(), ...this.hidden]))
      this.update(i, this.getSize(i) - this.baseSize);
  }
  /** Sum of sizes in [0, end). */
  prefixSum(end: number): number {
    end = Math.max(0, Math.min(this.count, end));
    let total = end * this.baseSize;
    for (let i = end; i > 0; i -= i & -i) total += this.tree.get(i) ?? 0;
    return total;
  }
  sum(start: number, count: number): number {
    return this.prefixSum(start + count) - this.prefixSum(start);
  }
  /** First visible item whose right/bottom edge exceeds offset; count beyond the end. */
  indexAtOffset(offset: number): number {
    if (offset < 0) return 0;
    let index = 0,
      prefix = 0,
      bit = 1;
    while (bit * 2 <= this.count) bit *= 2;
    for (; bit; bit = Math.floor(bit / 2)) {
      const next = index + bit;
      if (next <= this.count) {
        const size = (next & -next) * this.baseSize + (this.tree.get(next) ?? 0);
        if (prefix + size <= offset) {
          index = next;
          prefix += size;
        }
      }
    }
    return index;
  }
  shift(index: number, count: number, remove: boolean): void {
    const translate = (i: number) =>
      remove && i >= index && i < index + count
        ? -1
        : i >= index + (remove ? count : 0)
          ? i + (remove ? -count : count)
          : i;
    this.sizes = new Map([...this.sizes].map(([i, v]) => [translate(i), v] as const).filter(([i]) => i >= 0));
    this.hidden = new Set([...this.hidden].map(translate).filter((i) => i >= 0));
    this.shown = new Set([...this.shown].map(translate).filter((i) => i >= 0));
    this.count += remove ? -count : count;
    this.rebuild();
  }
  *entries(): IterableIterator<[number, { size?: number; visible?: boolean }]> {
    for (const i of [...new Set([...this.sizes.keys(), ...this.hidden, ...this.shown])].sort((a, b) => a - b)) {
      const value: { size?: number; visible?: boolean } = {};
      if (this.sizes.has(i)) value.size = this.sizes.get(i);
      if (this.hidden.has(i)) value.visible = false;
      else if (this.shown.has(i)) value.visible = true;
      yield [i, value];
    }
  }
}

/** Column chunks allocate only touched blocks; tags distinguish holes, NaN and null. */
class ColumnValueGrid {
  private columns = new Map<number, Map<number, { values: Float64Array; tags: Uint8Array; other?: Map<number, unknown>; used: number }>>();
  private length = 0;
  private lastCol = -1;
  private lastChunk = -1;
  private lastBlock?: { values: Float64Array; tags: Uint8Array; other?: Map<number, unknown>; used: number };
  get size(): number { return this.length; }
  private block(row: number, col: number, create = false) {
    const chunk = Math.floor(row / 1024);
    if (col === this.lastCol && chunk === this.lastChunk && this.lastBlock) return this.lastBlock;
    let column = this.columns.get(col);
    if (!column && create) this.columns.set(col, column = new Map());
    let block = column?.get(chunk);
    if (!block && create) column!.set(chunk, block = { values: new Float64Array(1024), tags: new Uint8Array(1024), used: 0 });
    this.lastCol = col; this.lastChunk = chunk; this.lastBlock = block;
    return block;
  }
  has(row: number, col: number): boolean { return !!this.block(row, col)?.tags[row % 1024]; }
  get(row: number, col: number): unknown {
    const block = this.block(row, col), index = row % 1024;
    const tag = block?.tags[index];
    return tag === 1 ? block!.values[index] : tag === 2 ? null : tag === 4 ? block!.other?.get(index) : undefined;
  }
  set(row: number, col: number, value: unknown): void {
    const block = this.block(row, col, true)!, index = row % 1024;
    if (!block.tags[index]) { block.used++; this.length++; }
    if (block.tags[index] === 4) block.other?.delete(index);
    if (typeof value === 'number') { block.tags[index] = 1; block.values[index] = value; }
    else if (value === null) block.tags[index] = 2;
    else if (value === undefined) block.tags[index] = 3;
    else { block.tags[index] = 4; (block.other ??= new Map()).set(index, value); }
  }
  delete(row: number, col: number): void {
    const block = this.block(row, col), index = row % 1024;
    if (!block?.tags[index]) return;
    block.tags[index] = 0; block.other?.delete(index); block.used--; this.length--;
    if (!block.used) {
      const column = this.columns.get(col)!;
      column.delete(Math.floor(row / 1024));
      if (!column.size) this.columns.delete(col);
      this.lastBlock = undefined;
    }
  }
  *entries(): IterableIterator<[number, number, unknown]> {
    for (const [col, column] of [...this.columns]) for (const [chunk, block] of [...column])
      for (let i = 0; i < 1024; i++) if (block.tags[i]) {
        const tag = block.tags[i];
        yield [chunk * 1024 + i, col, tag === 1 ? block.values[i] : tag === 2 ? null : tag === 4 ? block.other?.get(i) : undefined];
      }
  }
  /** Row-major ordered traversal: scan aligned 1024-row windows across the touched columns. */
  *orderedEntries(reverse = false): IterableIterator<[number, number, unknown]> {
    const sign = reverse ? -1 : 1;
    const cols = [...this.columns.keys()].sort((a, b) => sign * (a - b));
    if (!cols.length) return;
    const chunkSet = new Set<number>();
    for (const col of cols) for (const chunk of this.columns.get(col)!.keys()) chunkSet.add(chunk);
    const chunks = [...chunkSet].sort((a, b) => sign * (a - b));
    for (const chunk of chunks) {
      const active = cols
        .map((col) => ({ col, block: this.columns.get(col)!.get(chunk) }))
        .filter((entry) => entry.block && entry.block.used);
      if (!active.length) continue;
      for (let i = reverse ? 1023 : 0; reverse ? i >= 0 : i < 1024; i += sign)
        for (const { col, block } of active) {
          const tag = block!.tags[i];
          if (!tag) continue;
          yield [chunk * 1024 + i, col, tag === 1 ? block!.values[i] : tag === 2 ? null : tag === 4 ? block!.other?.get(i) : undefined];
        }
    }
  }
  clear(): void { this.columns.clear(); this.length = 0; this.lastBlock = undefined; }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean, crossStart = Number.NEGATIVE_INFINITY, crossEnd = Number.POSITIVE_INFINITY): void {
    const entries = [...this.entries()]; this.clear();
    for (const [r, c, value] of entries) {
      const old = axis === 'row' ? r : c;
      const cross = axis === 'row' ? c : r;
      if (cross < crossStart || cross > crossEnd) {
        this.set(r, c, value);
        continue;
      }
      if (remove && old >= index && old < index + count) continue;
      const next = old >= index + (remove ? count : 0) ? old + (remove ? -count : count) : old;
      this.set(axis === 'row' ? next : r, axis === 'col' ? next : c, value);
    }
  }
}

interface RowValueBlock {
  columns: Uint32Array;
  tags: Uint8Array;
  values?: Float64Array;
  other?: Map<number, unknown>;
  used: number;
}
/** One packed primary slot per touched row; extra columns use dense column blocks. */
export class ValueGrid {
  private pages = new Map<number, RowValueBlock>();
  private overflow = new ColumnValueGrid();
  private length = 0;
  private lastPage = -1;
  private lastBlock?: RowValueBlock;
  get size(): number { return this.length + this.overflow.size; }
  private block(row: number, create = false): RowValueBlock | undefined {
    const page = Math.floor(row / 1024);
    if (page === this.lastPage && this.lastBlock) return this.lastBlock;
    let block = this.pages.get(page);
    if (!block && create) this.pages.set(page, block = { columns: new Uint32Array(1024), tags: new Uint8Array(1024), used: 0 });
    this.lastPage = page; this.lastBlock = block; return block;
  }
  has(row: number, col: number): boolean {
    const block = this.block(row), i = row % 1024;
    return block?.columns[i] === col + 1 ? !!block.tags[i] : this.overflow.has(row, col);
  }
  get(row: number, col: number): unknown {
    const block = this.block(row), i = row % 1024;
    if (block?.columns[i] !== col + 1) return this.overflow.get(row, col);
    const tag = block.tags[i];
    return tag === 1 ? block.values![i] : tag === 2 ? null : tag === 4 ? block.other?.get(i) : undefined;
  }
  set(row: number, col: number, value: unknown): void {
    const block = this.block(row, true)!, i = row % 1024;
    if (col >= 0xffffffff || (!block.columns[i] && this.overflow.has(row, col)) || (block.columns[i] && block.columns[i] !== col + 1)) { this.overflow.set(row, col, value); return; }
    block.columns[i] = col + 1;
    if (!block.tags[i]) { this.length++; block.used++; }
    if (block.tags[i] === 4) block.other?.delete(i);
    if (typeof value === 'number') { block.tags[i] = 1; (block.values ??= new Float64Array(1024))[i] = value; }
    else if (value === null) block.tags[i] = 2;
    else if (value === undefined) block.tags[i] = 3;
    else { block.tags[i] = 4; (block.other ??= new Map()).set(i, value); }
  }
  delete(row: number, col: number): void {
    const block = this.block(row), i = row % 1024;
    if (block?.columns[i] !== col + 1) { this.overflow.delete(row, col); return; }
    if (!block.tags[i]) return;
    block.tags[i] = 0; block.other?.delete(i); this.length--; block.used--;
    if (!block.used) { this.pages.delete(Math.floor(row / 1024)); this.lastBlock = undefined; }
  }
  *entries(): IterableIterator<[number, number, unknown]> {
    for (const [page, block] of [...this.pages]) for (let i = 0; i < 1024; i++) if (block.tags[i]) {
      const tag = block.tags[i];
      yield [page * 1024 + i, block.columns[i] - 1, tag === 1 ? block.values![i] : tag === 2 ? null : tag === 4 ? block.other?.get(i) : undefined];
    }
    yield* this.overflow.entries();
  }
  /** Ordered (row, col) traversal: the primary-slot stream merged with the overflow stream. */
  *orderedEntries(reverse = false): IterableIterator<[number, number, unknown]> {
    const sign = reverse ? -1 : 1;
    yield* mergeOrdered(this.primaryStream(reverse), this.overflow.orderedEntries(reverse), sign as 1 | -1);
  }
  private *primaryStream(reverse: boolean): IterableIterator<[number, number, unknown]> {
    const sign = reverse ? -1 : 1;
    const pages = [...this.pages.keys()].sort((a, b) => sign * (a - b));
    for (const page of pages) {
      const block = this.pages.get(page);
      if (!block) continue;
      for (let i = reverse ? 1023 : 0; reverse ? i >= 0 : i < 1024; i += sign) {
        const tag = block.tags[i];
        if (!tag) continue;
        yield [page * 1024 + i, block.columns[i] - 1, tag === 1 ? block.values![i] : tag === 2 ? null : tag === 4 ? block.other?.get(i) : undefined];
      }
    }
  }
  clear(): void { this.pages.clear(); this.overflow.clear(); this.length = 0; this.lastBlock = undefined; }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean, crossStart = Number.NEGATIVE_INFINITY, crossEnd = Number.POSITIVE_INFINITY): void {
    const entries = [...this.entries()]; this.clear();
    for (const [r, c, value] of entries) {
      const old = axis === 'row' ? r : c;
      const cross = axis === 'row' ? c : r;
      if (cross < crossStart || cross > crossEnd) {
        this.set(r, c, value);
        continue;
      }
      if (remove && old >= index && old < index + count) continue;
      const next = old >= index + (remove ? count : 0) ? old + (remove ? -count : count) : old;
      this.set(axis === 'row' ? next : r, axis === 'col' ? next : c, value);
    }
  }
}

/** Merge two already-ordered (row, col) entry streams into one ordered stream. */
function* mergeOrdered<T, U>(
  left: IterableIterator<[number, number, T]>,
  right: IterableIterator<[number, number, U]>,
  sign: 1 | -1,
): IterableIterator<[number, number, T | U]> {
  let a = left.next();
  let b = right.next();
  while (!a.done && !b.done) {
    const [ar, ac] = a.value;
    const [br, bc] = b.value;
    const takeLeft = ar * sign < br * sign || (ar === br && ac * sign <= bc * sign);
    if (takeLeft) {
      yield a.value;
      a = left.next();
    } else {
      yield b.value;
      b = right.next();
    }
  }
  while (!a.done) {
    yield a.value;
    a = left.next();
  }
  while (!b.done) {
    yield b.value;
    b = right.next();
  }
}

/** Plain numeric cells have no cell object. Metadata is materialized only for mutations. */
export class CellStore<T extends { value?: unknown }> {
  private numeric = new ValueGrid();
  private metadata = new SparseGrid<T>();
  getValue(row: number, col: number): unknown { return this.numeric.get(row, col) ?? this.metadata.get(row, col)?.value; }
  peek(row: number, col: number): T | undefined { return this.metadata.get(row, col); }
  has(row: number, col: number): boolean { return this.metadata.has(row, col) || this.numeric.has(row, col); }
  get size(): number { return this.numeric.size + this.metadata.size; }
  setValue(row: number, col: number, value: unknown): void {
    const meta = this.metadata.get(row, col);
    if (typeof value === 'number' && !meta) this.numeric.set(row, col, value);
    else {
      this.numeric.delete(row, col);
      if (meta) { if (value == null) delete meta.value; else meta.value = value; }
      else if (value != null) this.metadata.set(row, col, { value } as T);
    }
  }
  get(row: number, col: number): T | undefined {
    let cell = this.metadata.get(row, col);
    if (this.numeric.has(row, col)) {
      cell = { value: this.numeric.get(row, col) } as T;
      this.numeric.delete(row, col); this.metadata.set(row, col, cell);
    }
    return cell;
  }
  set(row: number, col: number, cell: T | undefined): void {
    this.numeric.delete(row, col);
    if (cell && typeof cell.value === 'number' && Object.keys(cell).length === 1) {
      this.metadata.set(row, col, undefined); this.numeric.set(row, col, cell.value);
    } else this.metadata.set(row, col, cell);
  }
  *entries(): IterableIterator<[number, number, T]> {
    for (const [row, col, value] of this.numeric.entries()) yield [row, col, { value } as T];
    yield* this.metadata.entries();
  }
  /** Ordered (row, col) traversal across the numeric and metadata stores. */
  *orderedEntries(reverse = false): IterableIterator<[number, number, T]> {
    const sign = reverse ? -1 : 1;
    yield* mergeOrdered<T, T>(this.numericStream(reverse), this.metadata.orderedEntries(reverse), sign as 1 | -1);
  }
  private *numericStream(reverse: boolean): IterableIterator<[number, number, T]> {
    for (const [row, col, value] of this.numeric.orderedEntries(reverse)) yield [row, col, { value } as T];
  }
  clear(): void { this.numeric.clear(); this.metadata.clear(); }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean, crossStart = Number.NEGATIVE_INFINITY, crossEnd = Number.POSITIVE_INFINITY): void {
    this.numeric.shift(axis, index, count, remove, crossStart, crossEnd);
    this.metadata.shift(axis, index, count, remove, crossStart, crossEnd);
  }
}

export class DirtyGrid {
  private before = new ValueGrid();
  private after = new ValueGrid();
  get size(): number { return this.before.size; }
  /**
   * The trial keeps the value each change replaced, so a second write to the
   * same cell updates `oldValue` instead of keeping the first one.
   */
  record(row: number, col: number, oldValue: unknown, newValue: unknown): void {
    this.before.set(row, col, oldValue ?? undefined);
    this.after.set(row, col, newValue);
  }
  update(row: number, col: number, value: unknown): void {
    if (this.before.has(row, col)) this.after.set(row, col, value);
  }
  set(row: number, col: number, _value: undefined): void { this.before.delete(row, col); this.after.delete(row, col); }
  *entries() {
    for (const [row, col, oldValue] of this.before.entries())
      // The trial's key order is `row, col, newValue, oldValue` (and it carries
      // no `oldValue` at all when the cell had no previous value).
      yield [row, col, { row, col, newValue: this.after.get(row, col), oldValue }] as const;
  }
  clear(): void { this.before.clear(); this.after.clear(); }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    this.before.shift(axis, index, count, remove); this.after.shift(axis, index, count, remove);
  }
}
