/** Dot/bracket paths for cell and record binding, without evaluating source text. */
function parts(path: string): string[] { return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); }
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function getPath(source: unknown, path: string): unknown {
  let value = source;
  for (const part of parts(path)) { if (forbidden.has(part) || value == null) return undefined; value = (value as Record<string, unknown>)[part]; }
  return value;
}
export function setPath(source: object, path: string, value: unknown): void {
  const keys = parts(path); if (!keys.length || keys.some(key => forbidden.has(key))) throw new Error('Invalid binding path');
  let target = source as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) { const key = keys[i]; if (!target[key] || typeof target[key] !== 'object') target[key] = /^\d+$/.test(keys[i + 1]) ? [] : {}; target = target[key] as Record<string, unknown>; }
  target[keys[keys.length - 1]] = value;
}
export class CellBindingSource {
  private index: number;
  constructor(private source: object, activeRecordIndex = 0) { this.index = activeRecordIndex; }
  getSource(): object { return this.source; }
  activeRecordIndex(index?: number): number { if (index !== undefined) this.index = index; return this.index; }
  getValue(path: string): unknown { return getPath(Array.isArray(this.source) ? this.source[this.index] : this.source, path); }
  setValue(path: string, value: unknown): void { const source = Array.isArray(this.source) ? this.source[this.index] : this.source; if (source) setPath(source, path, value); }
}
