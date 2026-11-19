/** Convert a zero-based template position to its A1 address. */
export function cellAddress(row: number, col: number): string {
  let letters = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  }
  return `${letters}${row + 1}`;
}

/** Parse a single A1 cell reference, including optional absolute markers. */
export function parseCellAddress(value: string): [number, number] | undefined {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(value);
  if (!match) return undefined;
  const col = [...match[1]!.toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  return [Number(match[2]) - 1, col];
}
