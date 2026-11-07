/** Shared formula syntax colouring for the cell editor and the formula text box (M5f). */

/** Reference colours assigned to distinct references in order of first appearance, cycling every seven. */
export const referencePalette = ['#0000ff', '#008000', '#9900cc', '#800000', '#00cc33', '#cc6600', '#cc0099'];

export interface FormulaSegment { text: string; color?: string }
export interface FormulaReference { text: string; color: string; start: number; sheetName?: string; row1: number; col1: number; row2: number; col2: number }

const wordStart = /[A-Za-z_$]/;
const wordChar = /[A-Za-z0-9_.$]/;

/** Convert A, B, ... AA to a zero-based column index, or -1 when out of range. */
function columnIndex(letters: string): number {
  if (letters.length > 3) return -1;
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

/** Split an A1-style address (optionally sheet-qualified and absolute) into grid coordinates. */
export function parseReference(text: string): { sheetName?: string; row1: number; col1: number; row2: number; col2: number } | undefined {
  let rest = text, sheetName: string | undefined;
  const bang = rest.lastIndexOf('!');
  if (bang >= 0) {
    sheetName = rest.slice(0, bang);
    rest = rest.slice(bang + 1);
    if (sheetName.startsWith("'") && sheetName.endsWith("'")) sheetName = sheetName.slice(1, -1).replaceAll("''", "'");
    else if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheetName)) return undefined;
  }
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/.exec(rest);
  if (!match) return undefined;
  const col1 = columnIndex(match[1]), col2 = match[3] ? columnIndex(match[3]) : col1;
  const row1 = Number(match[2]) - 1, row2 = match[4] ? Number(match[4]) - 1 : row1;
  if (col1 < 0 || col2 < 0 || row1 < 0 || row2 < 0) return undefined;
  return { sheetName, row1, col1, row2, col2 };
}

/** Tokenize a formula into colour segments: every token gets its own colour; references cycle the palette. */
export function colorFormula(text: string): { segments: FormulaSegment[], references: FormulaReference[] } {
  const segments: FormulaSegment[] = [], references: FormulaReference[] = [];
  const colors = new Map<string, string>();
  const plain = (value: string) => {
    const last = segments.at(-1);
    if (last && !last.color) last.text += value; else segments.push({ text: value });
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      let end = index + 1;
      while (end < text.length) { if (text[end] === '"' && text[end + 1] !== '"') { end++; break; } end += text[end] === '"' ? 2 : 1; }
      plain(text.slice(index, end)); index = end; continue;
    }
    if (char === '#') { // error literal such as #DIV/0! or #NAME?
      let end = index + 1;
      while (end < text.length && /[A-Za-z0-9/?!]/.test(text[end])) end++;
      plain(text.slice(index, end)); index = end; continue;
    }
    const previous = index > 0 ? text[index - 1] : '';
    const numberTail = /[\d.]/.test(previous) && /[A-Za-z]/.test(char); // letter continues a numeric literal (1.5e3, 1E+3)
    if (char === "'" || wordStart.test(char)) {
      const start = index;
      while (index < text.length) {
        const ch = text[index];
        if (wordChar.test(ch)) { index++; continue; }
        if (ch === "'") { // quoted sheet name, '' escapes a quote
          index++;
          while (index < text.length) { if (text[index] === "'" && text[index + 1] === "'") index += 2; else if (text[index] === "'") { index++; break; } else index++; }
          continue;
        }
        if (ch === '!' && (wordStart.test(text[index + 1] ?? '') || text[index + 1] === "'")) { index++; continue; }
        if (ch === ':' && index > start && (wordStart.test(text[index + 1] ?? '') || text[index + 1] === "'" || text[index + 1] === '$') && wordChar.test(text[index - 1] ?? '')) { index++; continue; }
        break;
      }
      const word = text.slice(start, index);
      const upper = word.toUpperCase();
      if (numberTail || upper === 'TRUE' || upper === 'FALSE' || (text[index] === '(' && !word.includes('!'))) { plain(word); continue; }
      const key = upper.replaceAll('$', '');
      let color = colors.get(key);
      if (!color) { color = referencePalette[colors.size % referencePalette.length]; colors.set(key, color); }
      segments.push({ text: word, color });
      const parsed = parseReference(word);
      if (parsed) references.push({ text: word, color, start, ...parsed });
      else references.push({ text: word, color, start, row1: -1, col1: -1, row2: -1, col2: -1 });
      continue;
    }
    plain(char); index++;
  }
  return { segments, references };
}

/** Build the coloured span tree that mirrors the formula text. */
export function colorSpans(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const segment of colorFormula(text).segments) {
    const span = document.createElement('span');
    span.textContent = segment.text;
    if (segment.color) span.style.color = segment.color;
    fragment.append(span);
  }
  return fragment;
}
