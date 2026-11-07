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
