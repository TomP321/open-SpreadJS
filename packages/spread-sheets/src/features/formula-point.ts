/** Whether a reference can begin at the current formula caret. */
export function referenceAllowed(text: string, caret: number): boolean {
  if (!text.startsWith('=') || caret < 1) return false;
  const prefix = text.slice(0, caret);
  let quoted = false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === '"') { if (quoted && prefix[i + 1] === '"') i++; else quoted = !quoted; }
  }
  return !quoted && /[=(,+\-*/^&<>:]\s*$/.test(prefix);
}

export function insertReference(text: string, start: number, end: number, reference: string): string {
  return text.slice(0, start) + reference + text.slice(end);
}

/** Close unmatched opening parentheses outside quoted text on a UI commit. */
export function closeFormulaParentheses(text: string): string {
  let depth = 0, quoted = false, sheetQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && !sheetQuoted) { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
    else if (ch === "'" && !quoted) { if (sheetQuoted && text[i + 1] === "'") i++; else sheetQuoted = !sheetQuoted; }
    else if (!quoted && !sheetQuoted) { if (ch === '(') depth++; else if (ch === ')') depth--; }
  }
  return text + ')'.repeat(Math.max(0, depth));
}
