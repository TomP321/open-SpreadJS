/**
 * Reads chart source data through the sheet: resolves A1 references to
 * category texts and numeric values, like the trial feeds them to the painter.
 */
import type { Worksheet } from '../../worksheet.js';
import { parseRanges, type Rect } from './refs.js';

export interface SeriesData {
  name: string;
  categories: (string | number)[];
  values: (number | null)[];
}

function readRect(sheet: Worksheet, rect: Rect): (string | number | null | Date)[] {
  const out: (string | number | null | Date)[] = [];
  for (let r = 0; r < rect.rowCount; r++)
    for (let c = 0; c < rect.colCount; c++) out.push(sheet.getValue(rect.row + r, rect.col + c) as string | number | null | Date);
  return out;
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function numberOf(value: unknown, displayBlanksAs: number): number | null {
  if (value === null || value === undefined || value === '') return displayBlanksAs === 2 ? 0 : null;
  const n = value instanceof Date ? value.getTime() / 86400000 + 25569 : Number(value);
  return Number.isFinite(n) ? n : (displayBlanksAs === 2 ? 0 : null);
}

/** Resolve a single-cell or range reference into display text (series name). */
export function resolveRefText(sheet: Worksheet, formula: unknown): string {
  const rect = parseRanges(formula)[0];
  if (!rect) return String(formula ?? '');
  const values = readRect(sheet, rect);
  return textOf(values[0]);
}

/** Resolve a reference into a value list (numbers for value refs). */
export function resolveRefValues(sheet: Worksheet, formula: unknown, displayBlanksAs: number): (number | null)[] {
  const rects = parseRanges(formula);
  const out: (number | null)[] = [];
  for (const rect of rects) {
    for (const value of readRect(sheet, rect)) out.push(numberOf(value, displayBlanksAs));
  }
  return out;
}

/** Resolve a reference into category texts. */
export function resolveRefCategories(sheet: Worksheet, formula: unknown): (string | number)[] {
  const rects = parseRanges(formula);
  const out: (string | number)[] = [];
  for (const rect of rects) {
    for (const value of readRect(sheet, rect)) {
      if (value === null || value === undefined) out.push('');
      else if (typeof value === 'number') out.push(value);
      else out.push(textOf(value));
    }
  }
  return out;
}

export interface ChartDataSet {
  categories: (string | number)[];
  series: SeriesData[];
}

/** Read every series of the model into plain arrays (for painting). */
export function readSeriesData(sheet: Worksheet, entries: { name: string; category: string; value: string }[], displayBlanksAs: number): ChartDataSet {
  const series: SeriesData[] = entries.map(entry => ({
    name: resolveRefText(sheet, entry.name),
    categories: resolveRefCategories(sheet, entry.category),
    values: resolveRefValues(sheet, entry.value, displayBlanksAs),
  }));
  const categories = series[0]?.categories ?? [];
  return { categories, series };
}
