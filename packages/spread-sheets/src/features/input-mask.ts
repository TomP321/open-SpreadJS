import { notImplemented } from '../not-implemented.js';
export interface MaskOptions { pattern: string; placeholder?: string; excludeLiteral?: boolean; excludePlaceholder?: boolean }
interface Unit { literal?: string; alternatives?: string[]; test?: RegExp; transform?: 'upper' | 'lower'; min: number; max: number }
const patterns = new Map<string, string>();
export function getNamedPatterns(): { name: string; pattern: string }[] { return [...patterns].map(([name, pattern]) => ({ name, pattern })); }
export function namedPattern(name: string, pattern?: string | null): string | void { if (pattern === undefined) return patterns.get(name); if (pattern === null) patterns.delete(name); else patterns.set(name, pattern); }
function units(input: string): Unit[] {
  let pattern = input;
  for (let depth = 0; depth < 16; depth++) { let next = pattern; for (const [name, replacement] of patterns) next = next.replaceAll(name, replacement); if (next === pattern) break; pattern = next; if (depth === 15) throw new Error('Parse Unknown Pattern Failure'); }
  const result: Unit[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]; let unit: Unit;
    if (ch === '\\') { if (++i >= pattern.length) break; unit = { literal: pattern[i], min: 1, max: 1 }; }
    else if ('a0<>#'.includes(ch)) unit = { test: ch === '0' ? /[0-9]/ : ch === '#' ? /[\s\S]/ : /[\p{L}]/u, transform: ch === '>' ? 'upper' : ch === '<' ? 'lower' : undefined, min: 1, max: 1 };
    else if (ch === '[') {
      let end = i + 1; while (end < pattern.length && (pattern[end] !== ']' || pattern[end - 1] === '\\')) end++; if (end === pattern.length) throw new Error('Parse Unknown Pattern Failure');
      const raw = pattern.slice(i + 1, end), chars = raw.replace(/a/g, '\\p{L}').replace(/0/g, '0-9').replace(/[<>]/g, '\\p{L}');
      unit = { test: new RegExp(`[${chars}]`, 'u'), transform: raw.includes('>') ? 'upper' : raw.includes('<') ? 'lower' : undefined, min: 1, max: 1 }; i = end;
    } else if (ch === '(') { const end = pattern.indexOf(')', i + 1); if (end < 0) throw new Error('Parse Unknown Pattern Failure'); unit = { alternatives: pattern.slice(i + 1, end).split('|'), min: 1, max: 1 }; i = end; }
    else if ('{}])'.includes(ch)) throw new Error('Parse Unknown Pattern Failure');
    else unit = { literal: ch, min: 1, max: 1 };
    if (pattern[i + 1] === '{') {
      const match = /^\{(\d*)(,?)(\d*)\}/.exec(pattern.slice(i + 1));
      if (!match || !match[1] && !match[3]) throw new Error('Parse Unknown Pattern Failure');
      unit.min = Number(match[1] || 0); unit.max = match[2] ? match[3] ? Number(match[3]) : 2147483648 : unit.min;
      if (unit.min > unit.max) throw new Error('Parse Unknown Pattern Failure'); i += match[0].length;
    }
    result.push(unit);
  }
  return result;
}
export function validatePattern(pattern: string): { success: boolean; message?: string } {
  if (!pattern) return { success: false, message: 'Empty Pattern' };
  if (/^(?:yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t|[/: -])+$/.test(pattern) && /[yMdHhms]/.test(pattern)) { const fields = pattern.match(/yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t/g) ?? []; const keys = fields.map(f => f[0]); return new Set(keys).size === keys.length ? { success: true } : { success: false, message: 'Parse Unknown Pattern Failure' }; }
  try { const parsed = units(pattern); if (!parsed.some(u => u.test || u.alternatives)) return { success: false, message: 'No Restriction Can Be Entered' }; return { success: true }; }
  catch { return { success: false, message: 'Parse Unknown Pattern Failure' }; }
}
export function applyMask(text: string, options: MaskOptions, editing = false): string {
  // Calendar masks require calendar-aware field editing; fail explicitly until supported.
  if (/(?:yyyy|yy|MM|dd|HH|hh|ss|tt)/.test(options.pattern)) return notImplemented('InputMask date fields');
  const parsed = units(options.pattern), chars = [...text], placeholder = options.placeholder || '_'; let cursor = 0, result = '';
  for (const unit of parsed) {
    if (unit.literal !== undefined) { if (chars[cursor] === unit.literal) cursor++; if (editing || !options.excludeLiteral) result += unit.literal.repeat(Math.min(unit.min, 10000)); continue; }
    if (unit.alternatives) { const remaining = chars.slice(cursor).join(''); const choice = unit.alternatives.find(s => s.toLowerCase().startsWith(remaining.toLowerCase()) || remaining.toLowerCase().startsWith(s.toLowerCase())) ?? unit.alternatives[0]; result += choice; cursor += choice.length; continue; }
    let consumed = 0;
    while (cursor < chars.length && consumed < unit.max && result.length < 100000) {
      const ch = chars[cursor++];
      if (ch === placeholder) { if (editing || !options.excludePlaceholder) result += placeholder; consumed++; continue; }
      if (!unit.test?.test(ch)) continue;
      result += unit.transform === 'upper' ? ch.toUpperCase() : unit.transform === 'lower' ? ch.toLowerCase() : ch; consumed++;
    }
    if (consumed < unit.min && (editing || !options.excludePlaceholder)) result += placeholder.repeat(Math.min(10000, unit.min - consumed));
  }
  return result;
}
