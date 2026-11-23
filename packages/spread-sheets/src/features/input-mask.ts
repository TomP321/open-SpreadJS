export interface MaskOptions { pattern: string; placeholder?: string; excludeLiteral?: boolean; excludePlaceholder?: boolean }
interface Unit { literal?: string; alternatives?: string[]; test?: RegExp; transform?: 'upper' | 'lower'; min: number; max: number }
type PatternMap = Map<string, string | null>;
const patterns: PatternMap = new Map();
export function getNamedPatterns(): { name: string; pattern: string }[] { return [...patterns].filter(([, pattern]) => pattern !== null).map(([name, pattern]) => ({ name, pattern: pattern as string })); }
/** Trial semantics: setting `null` removes the name from the list but the name then reads back as `null`. */
export function namedPattern(name: string, pattern?: string | null): string | null | void { if (pattern === undefined) return patterns.get(name); if (pattern === null) patterns.set(name, null); else patterns.set(name, pattern); }
function units(input: string): Unit[] {
  let pattern = input;
  for (let depth = 0; depth < 16; depth++) { let next = pattern; for (const [name, replacement] of patterns) if (replacement !== null) next = next.replaceAll(name, replacement); if (next === pattern) break; pattern = next; if (depth === 15) throw new Error('Parse Unknown Pattern Failure'); }
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
/** Grammar facts the trial reports through `Error` messages reused verbatim in `IValidatePatternResult`. */
const MASK_UNKNOWN = 'Parse Unknown Pattern Failure';
const MASK_QUANTIFIER = 'Parse Quantifier Pattern Failure';
const MASK_QUANTIFIER_POSITION = 'Error Quantifier Position';
/** Expand named patterns and classify the mask grammar the way the trial's validator does. */
function scanMaskGrammar(input: string): boolean {
  let pattern = input;
  for (let depth = 0; depth < 16; depth++) {
    let next = pattern;
    for (const [name, replacement] of patterns) if (replacement !== null) next = next.replaceAll(name, replacement);
    if (next === pattern) break;
    pattern = next;
    if (depth === 15) throw new Error(MASK_UNKNOWN);
  }
  let restriction = false;
  let prevAtom = false;
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\') { if (++i >= pattern.length) break; prevAtom = true; i++; continue; }
    if (ch === '}') { if (!prevAtom) throw new Error(MASK_UNKNOWN); prevAtom = false; i++; continue; }
    if ('a0<>#'.includes(ch)) { restriction = true; prevAtom = true; i++; continue; }
    if (ch === '[') {
      let end = i + 1;
      while (end < pattern.length && (pattern[end] !== ']' || pattern[end - 1] === '\\')) end++;
      if (end >= pattern.length) throw new Error(MASK_UNKNOWN);
      restriction = true; prevAtom = true; i = end + 1; continue;
    }
    if (ch === '(') {
      let end = i + 1;
      while (end < pattern.length && pattern[end] !== ')') end++;
      if (end >= pattern.length) throw new Error(MASK_UNKNOWN);
      // A choice group only restricts input when it actually offers alternatives, and a quantifier may not follow it.
      if (pattern.slice(i + 1, end).includes('|')) restriction = true;
      prevAtom = false;
      i = end + 1;
      if (pattern[i] === '{') throw new Error(MASK_QUANTIFIER_POSITION);
      continue;
    }
    if (ch === '{') {
      const match = /^\{([^}]*)\}/.exec(pattern.slice(i));
      if (!match) throw new Error(MASK_UNKNOWN);
      if (!prevAtom) throw new Error(MASK_QUANTIFIER_POSITION);
      const quantifier = /^(\d*)(,)?(\d*)$/.exec(match[1]);
      const minText = quantifier?.[1] ?? '';
      const hasComma = quantifier?.[2] === ',';
      const maxText = quantifier?.[3] ?? '';
      if (!quantifier || (!minText && !maxText)) throw new Error(MASK_QUANTIFIER);
      const min = minText ? Number(minText) : 1;
      const max = maxText ? Number(maxText) : hasComma ? Number.MAX_SAFE_INTEGER : min;
      if (!hasComma && min < 1) throw new Error(MASK_QUANTIFIER);
      if (min > max) throw new Error(MASK_QUANTIFIER);
      i += match[0].length;
      continue;
    }
    prevAtom = true;
    i++;
  }
  return restriction;
}
export function validatePattern(pattern: string): { success: boolean; message?: string } {
  if (!pattern) return { success: false, message: 'Empty Pattern' };
  if (isDatePattern(pattern)) {
    // Trial rule: each calendar FIELD FAMILY (year, month, day, hour, minute, second, meridiem)
    // may appear at most once — `HH-hh` or `yyyy-...-yyyy` answer `Duplicated Date Time Pattern`.
    const DATE_FAMILIES: Record<string, string> = { yyyy: 'y', yy: 'y', MM: 'M', M: 'M', dd: 'd', d: 'd', HH: 'h', H: 'h', hh: 'h', h: 'h', mm: 'm', m: 'm', ss: 's', s: 's', tt: 't', t: 't' };
    const seen = new Set<string>();
    let i = 0;
    while (i < pattern.length) {
      const token = DATE_TOKEN.exec(pattern.slice(i));
      if (token) {
        const family = DATE_FAMILIES[token[0]!]!;
        if (seen.has(family)) return { success: false, message: 'Duplicated Date Time Pattern' };
        seen.add(family);
        i += token[0].length;
      } else i++;
    }
    return { success: true };
  }
  try {
    return scanMaskGrammar(pattern) ? { success: true } : { success: false, message: 'No Restriction Can Be Entered' };
  } catch (error) {
    const message = error instanceof Error && [MASK_UNKNOWN, MASK_QUANTIFIER, MASK_QUANTIFIER_POSITION].includes(error.message) ? error.message : MASK_UNKNOWN;
    return { success: false, message };
  }
}

/* Calendar patterns (yyyy yy MM M dd d HH H hh h mm m ss s tt t plus separators) use a
 * field-based parser: each token consumes its digits from the typed text and is padded with
 * the placeholder (editing) or zeros (committed) up to its width. */
const DATE_TOKEN = /^(yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t)/;
const DATE_WIDTHS: Record<string, { min: number; max: number; limit?: number }> = {
  yyyy: { min: 4, max: 4 }, yy: { min: 2, max: 2 }, MM: { min: 2, max: 2, limit: 12 }, M: { min: 1, max: 2, limit: 12 },
  dd: { min: 2, max: 2, limit: 31 }, d: { min: 1, max: 2, limit: 31 }, HH: { min: 2, max: 2, limit: 23 }, H: { min: 1, max: 2, limit: 23 },
  hh: { min: 2, max: 2, limit: 12 }, h: { min: 1, max: 2, limit: 12 }, mm: { min: 2, max: 2, limit: 59 }, m: { min: 1, max: 2, limit: 59 },
  ss: { min: 2, max: 2, limit: 59 }, s: { min: 1, max: 2, limit: 59 }, tt: { min: 2, max: 2 }, t: { min: 1, max: 1 },
};
/** A calendar pattern contains at least one date/time token and only tokens + separators. */
function isDatePattern(pattern: string): boolean {
  return /(yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t)/.test(pattern) && /^(?:yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t|[/: ,.\-\u2013])+$/.test(pattern);
}
function applyDateMask(text: string, options: MaskOptions, editing: boolean): string {
  const placeholder = options.placeholder || '_';
  const chars = [...text];
  let cursor = 0, out = '';
  let i = 0;
  const pattern = options.pattern;
  while (i < pattern.length) {
    const token = DATE_TOKEN.exec(pattern.slice(i));
    if (token) {
      i += token[0].length;
      const width = DATE_WIDTHS[token[0]];
      if (token[0] === 'tt' || token[0] === 't') {
        const rest = chars.slice(cursor).join('').trimStart().toLowerCase();
        const meridiem = rest.startsWith('p') ? (token[0] === 't' ? 'P' : 'PM') : rest.startsWith('a') ? (token[0] === 't' ? 'A' : 'AM') : '';
        if (meridiem) { out += meridiem; cursor += rest.startsWith('pm') || rest.startsWith('am') ? 2 : 1; }
        else if (editing || !options.excludePlaceholder) out += placeholder.repeat(width.min);
        continue;
      }
      let digits = '';
      while (digits.length < width.max && cursor < chars.length && /\d/.test(chars[cursor])) {
        // A token with a value limit only takes another digit while the pair stays in range.
        if (width.limit !== undefined && digits.length === width.max - 1 && Number(digits + chars[cursor]) > width.limit) break;
        digits += chars[cursor++];
      }
      if (editing) out += digits + placeholder.repeat(Math.max(0, width.min - digits.length));
      else if (digits) out += digits.padStart(width.min, '0');
      else if (!options.excludePlaceholder) out += '0'.repeat(width.min);
      continue;
    }
    const ch = pattern[i++];
    while (cursor < chars.length && !/\d|[ap]/i.test(chars[cursor]) && chars[cursor] === ch) cursor++;
    if (editing || !options.excludeLiteral) out += ch;
  }
  return out;
}
export function applyMask(text: string, options: MaskOptions, editing = false): string {
  return applyMaskInfo(text, options, editing).value;
}
/** Like applyMask but also reports the caret position right after the last typed (non-placeholder) character. */
export function applyMaskInfo(text: string, options: MaskOptions, editing = false): { value: string; caret: number } {
  if (isDatePattern(options.pattern)) return { value: applyDateMask(text, options, editing), caret: editing ? Math.max(0, text.length) : 0 };
  const parsed = units(options.pattern), chars = [...text], placeholder = options.placeholder || '_'; let cursor = 0, result = '', caret = 0;
  for (const unit of parsed) {
    if (unit.literal !== undefined) { if (chars[cursor] === unit.literal) cursor++; if (editing || !options.excludeLiteral) result += unit.literal.repeat(Math.min(unit.min, 10000)); continue; }
    if (unit.alternatives) { const remaining = chars.slice(cursor).join(''); const choice = unit.alternatives.find(s => s.toLowerCase().startsWith(remaining.toLowerCase()) || remaining.toLowerCase().startsWith(s.toLowerCase())) ?? unit.alternatives[0]; result += choice; cursor += choice.length; if (remaining) caret = result.length; continue; }
    let consumed = 0;
    while (cursor < chars.length && consumed < unit.max && result.length < 100000) {
      const ch = chars[cursor++];
      if (ch === placeholder) { if (editing || !options.excludePlaceholder) result += placeholder; consumed++; continue; }
      if (!unit.test?.test(ch)) continue;
      result += unit.transform === 'upper' ? ch.toUpperCase() : unit.transform === 'lower' ? ch.toLowerCase() : ch; consumed++; caret = result.length;
    }
    if (consumed < unit.min && (editing || !options.excludePlaceholder)) result += placeholder.repeat(Math.min(10000, unit.min - consumed));
  }
  return { value: result, caret };
}
