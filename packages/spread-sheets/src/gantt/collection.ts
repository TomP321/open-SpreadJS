/**
 * Ordered mutable collection used by Gantt style rules.
 *
 * Trial parity (TASK 54 probe `.probe/t54/`, steps `t54-gantt`/`t54-coll`, cases
 * `collection:surface` and `coll:shape`; trial values recorded in docs/STATUS.md):
 * - `length` is a NON-ENUMERABLE ACCESSOR ON THE PROTOTYPE (`own` has no `length`, the
 *   prototype descriptor is `{get:true}`), and it reports a NUMBER — `collection.length()`
 *   throws `collection.length is not a function` in the trial;
 * - the instance mirrors NOTHING: `collection[0]` is undefined and `Array.from(collection)`
 *   only works through the array-like protocol, so it yields `length` UNDEFINED entries;
 * - spread stays broken (no `Symbol.iterator` in either runtime);
 * - `all()` returns the live internal array (the same object on every call) and direct
 *   mutations of it keep `length` correct.
 * The published type keeps `length` callable (`(() => number) & number`) so TypeScript code
 * written against the official `length(): number` declaration still compiles, exactly like the
 * trial type does while its runtime throws.
 */
export type CollectionLength = number & (() => number);

export class Collection<T> {
  private items: T[];

  constructor(items: T[] = []) { this.items = items; }

  /** Trial-measured accessor; see the class note above. */
  get length(): CollectionLength { return this.items.length as unknown as CollectionLength; }

  add(item: T): void { this.items.push(item); }
  all(): T[] { return this.items; }
  clear(): void { this.items.length = 0; }
  getIndexByItem(item: T): number { return this.items.indexOf(item); }
  getItemAt(index: number): T { return this.items[index]; }
  getRule(name: string): T | null {
    return this.items.find(item => (item as { name?: string } | null | undefined)?.name === name) ?? null;
  }
  insert(index: number, item: T): void { this.items.splice(index, 0, item); }
  remove(item: T): void { this.items.splice(this.items.indexOf(item), 1); }
  removeAt(index: number): void { this.items.splice(index, 1); }
  setItemAt(index: number, item: T): void { this.items[index] = item; }
}
