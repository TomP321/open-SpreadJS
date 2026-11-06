/** Row chunks keep an empty million-row worksheet constant in size. */
export class SparseGrid<T> {
  private chunks = new Map<number, Map<number, Map<number, T>>>();
  get(row: number, col: number): T | undefined {
    return this.chunks
      .get(Math.floor(row / 256))
      ?.get(row)
      ?.get(col);
  }
  set(row: number, col: number, value: T | undefined): void {
    const chunkIndex = Math.floor(row / 256);
    let chunk = this.chunks.get(chunkIndex),
      cells = chunk?.get(row);
    if (value === undefined) {
      cells?.delete(col);
      if (!cells?.size) chunk?.delete(row);
      if (!chunk?.size) this.chunks.delete(chunkIndex);
      return;
    }
    if (!chunk) this.chunks.set(chunkIndex, (chunk = new Map()));
    if (!cells) chunk.set(row, (cells = new Map()));
    cells.set(col, value);
  }
  *entries(): IterableIterator<[number, number, T]> {
    for (const chunk of this.chunks.values())
      for (const [row, cells] of chunk) for (const [col, value] of cells) yield [row, col, value];
  }
  clear(): void {
    this.chunks.clear();
  }
  get size(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) for (const row of chunk.values()) count += row.size;
    return count;
  }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    const entries = [...this.entries()];
    this.clear();
    for (const [r, c, value] of entries) {
      const old = axis === 'row' ? r : c;
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
  setVisible(index: number, visible: boolean): void {
    const old = this.getSize(index);
    if (visible) this.hidden.delete(index);
    else this.hidden.add(index);
    this.update(index, this.getSize(index) - old);
  }
  resize(count: number): void {
    this.count = count;
    for (const i of this.sizes.keys()) if (i >= count) this.sizes.delete(i);
    for (const i of this.hidden) if (i >= count) this.hidden.delete(i);
    this.rebuild();
  }
  reset(start: number, count: number): void {
    const end = start + count;
    for (const i of this.sizes.keys()) if (i >= start && i < end) this.sizes.delete(i);
    for (const i of this.hidden) if (i >= start && i < end) this.hidden.delete(i);
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
    this.count += remove ? -count : count;
    this.rebuild();
  }
  *entries(): IterableIterator<[number, { size?: number; visible?: boolean }]> {
    for (const i of [...new Set([...this.sizes.keys(), ...this.hidden])].sort((a, b) => a - b)) {
      const value: { size?: number; visible?: boolean } = {};
      if (this.sizes.has(i)) value.size = this.sizes.get(i);
      if (this.hidden.has(i)) value.visible = false;
      yield [i, value];
    }
  }
}

/** Column chunks allocate only touched blocks; tags distinguish holes, NaN and null. */
export class ValueGrid {
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
  clear(): void { this.columns.clear(); this.length = 0; this.lastBlock = undefined; }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    const entries = [...this.entries()]; this.clear();
    for (const [r, c, value] of entries) {
      const old = axis === 'row' ? r : c;
      if (remove && old >= index && old < index + count) continue;
      const next = old >= index + (remove ? count : 0) ? old + (remove ? -count : count) : old;
      this.set(axis === 'row' ? next : r, axis === 'col' ? next : c, value);
    }
  }
}

/** Plain numeric cells have no cell object. Metadata is materialized only for mutations. */
export class CellStore<T extends { value?: unknown }> {
  private numeric = new ValueGrid();
  private metadata = new SparseGrid<T>();
  getValue(row: number, col: number): unknown { return this.numeric.get(row, col) ?? this.metadata.get(row, col)?.value; }
  peek(row: number, col: number): T | undefined { return this.metadata.get(row, col); }
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
  clear(): void { this.numeric.clear(); this.metadata.clear(); }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    this.numeric.shift(axis, index, count, remove); this.metadata.shift(axis, index, count, remove);
  }
}

export class DirtyGrid {
  private before = new ValueGrid();
  private after = new ValueGrid();
  get size(): number { return this.before.size; }
  record(row: number, col: number, oldValue: unknown, newValue: unknown): void {
    if (!this.before.has(row, col)) this.before.set(row, col, oldValue ?? undefined);
    this.after.set(row, col, newValue);
  }
  update(row: number, col: number, value: unknown): void {
    if (this.before.has(row, col)) this.after.set(row, col, value);
  }
  set(row: number, col: number, _value: undefined): void { this.before.delete(row, col); this.after.delete(row, col); }
  *entries() {
    for (const [row, col, oldValue] of this.before.entries())
      yield [row, col, { row, col, oldValue, newValue: this.after.get(row, col) }] as const;
  }
  clear(): void { this.before.clear(); this.after.clear(); }
  shift(axis: 'row' | 'col', index: number, count: number, remove: boolean): void {
    this.before.shift(axis, index, count, remove); this.after.shift(axis, index, count, remove);
  }
}
