import { clone, Range, type Style } from '../primitives.js';
import type { Worksheet } from '../worksheet.js';

type Entry = { range: Range; state: number; style: Partial<Style>; area: number; owner?: string };

export class CellStateManager {
  private entries: Entry[] = [];
  constructor(private sheet: Worksheet) {}
  _hasAny(): boolean { return this.entries.length > 0; }
  add(range: Range, state: number, style: Partial<Style>, area = 3): void {
    this.entries.push({ range: new Range(range.row, range.col, range.rowCount, range.colCount), state, style: clone(style), area });
    this.sheet._invalidate();
  }
  /**
   * The stored states, in insertion order (trial: `cellStates.all()` answers
   * `{range, style, state}` per entry, with the range as a plain record).
   * Designer states (an `owner`) are excluded, like the trial's own list.
   */
  all(): { range: { row: number; col: number; rowCount: number; colCount: number }; style: Partial<Style>; state: number }[] {
    return this.entries.filter((entry) => !entry.owner).map((entry) => ({
      range: { row: entry.range.row, col: entry.range.col, rowCount: entry.range.rowCount, colCount: entry.range.colCount },
      style: clone(entry.style), state: entry.state,
    }));
  }
  clear(range: Range, area = 3): void {
    this.entries = this.entries.flatMap(entry => {
      if (entry.area !== area) return [entry];
      const r = entry.range;
      const top = Math.max(r.row, range.row), left = Math.max(r.col, range.col);
      const bottom = Math.min(r.row + r.rowCount, range.row + range.rowCount);
      const right = Math.min(r.col + r.colCount, range.col + range.colCount);
      if (top >= bottom || left >= right) return [entry];
      const pieces = [new Range(r.row, r.col, top - r.row, r.colCount),
        new Range(bottom, r.col, r.row + r.rowCount - bottom, r.colCount),
        new Range(top, r.col, bottom - top, left - r.col),
        new Range(top, right, bottom - top, r.col + r.colCount - right)];
      return pieces.filter(piece => piece.rowCount > 0 && piece.colCount > 0).map(piece => ({ ...entry, range: piece }));
    });
    this.sheet._invalidate();
  }
  _at(row: number, col: number, area = 3): { state: number; style: Partial<Style> }[] {
    return this.entries.filter(({ range, area: entryArea }) => entryArea === area && row >= range.row && col >= range.col
      && row < range.row + range.rowCount && col < range.col + range.colCount)
      .map(({ state, style }) => ({ state, style: clone(style) }));
  }
  _replaceOwned(owner: string, range: Range, states: { state: number; style: Partial<Style> }[]): void {
    this.entries = this.entries.filter(entry => entry.owner !== owner);
    for (const { state, style } of states) {
      this.entries.push({ owner, range: new Range(range.row, range.col, range.rowCount, range.colCount),
        state, style: clone(style), area: 3 });
    }
    this.sheet._invalidate();
  }
  _clearOwned(prefix: string): void {
    this.entries = this.entries.filter(entry => !entry.owner?.startsWith(prefix));
  }
  _toJSON(): Record<string, Record<string, { range: Range; style: Partial<Style> }[]>> {
    const result: Record<string, Record<string, { range: Range; style: Partial<Style> }[]>> = {};
    for (const entry of this.entries) {
      if (entry.owner) continue;
      const areas = result[entry.state] ??= {};
      (areas[entry.area] ??= []).push({ range: entry.range, style: clone(entry.style) });
    }
    return result;
  }
  _fromJSON(value: unknown): void {
    this.entries = [];
    if (!value || typeof value !== 'object') return;
    for (const [state, rawAreas] of Object.entries(value)) {
      if (!rawAreas || typeof rawAreas !== 'object') continue;
      for (const [area, rawEntries] of Object.entries(rawAreas)) {
        if (!Array.isArray(rawEntries)) continue;
        for (const raw of rawEntries) {
          const range = raw?.range;
          if (!range || !raw.style) continue;
          this.add(new Range(range.row, range.col, range.rowCount, range.colCount), Number(state), raw.style, Number(area));
        }
      }
    }
  }
}
