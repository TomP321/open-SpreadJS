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
