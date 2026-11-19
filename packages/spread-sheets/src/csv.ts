/**
 * `Worksheet.getCsv` / `Worksheet.setCsv`, following the values the official
 * 19.2.5 trial produces (probe `.probe/report-item3*.json`):
 *
 * - every emitted cell is wrapped in double quotes and internal quotes are
 *   doubled; the cell text is the *formatted* text (`TRUE` for booleans,
 *   `1/2/2020` for a default-formatted date, `50.00%` for a `0.00%` cell),
 *   empty and missing cells become an empty quoted field;
 * - a negative `row` starts at the first row and adds the column-header line
 *   (labels `A`, `B`, ...), a negative `column` starts at the first column and
 *   prepends the row-header label (`1`, `2`, ...) to every data line; the
 *   header line carries an empty *unquoted* corner field when both are
 *   negative. Those labels only exist for a sheet inside a workbook - a
 *   detached sheet writes the same window without them. When both sizes are
 *   `-1` (the whole sheet) no labels are written at all;
 * - a negative size means "up to the end of that axis"; a size outside
 *   `[-1, count - start]` throws like the trial
 *   (`Invalid rowCount: 205 (must be between -1 and 200).`);
 * - `rowCount` 0 emits an empty quoted field, `columnCount` 0 emits one empty
 *   line per row (plus the label when the sheet has a workbook);
 * - the delimiters default to `\r\n` and a tab;
 * - on import the text is parsed as CSV: quoted fields keep the delimiters they
 *   contain (their outer quotes are dropped, `""` becomes `"`), an empty field
 *   becomes `null`, and every field is converted with the format engine
 *   (`true`/`FALSE` booleans, `2020-01-02` and `1/2/2020` dates, `-15%` and
 *   `1e3` numbers; `0x10`, `null`, `NaN` and `1e999` stay text).
 */
import { GC } from './generated/enums.js';
import { GeneralFormatter } from './formatter.js';
import type { Worksheet } from './worksheet.js';

const SheetArea = GC.Spread.Sheets.SheetArea;

const DEFAULT_ROW_DELIMITER = '\r\n';
const DEFAULT_COLUMN_DELIMITER = '\t';

/** `A`, `B`, ... for a column index (the labels the trial writes into the header line). */
function columnLabel(index: number): string {
  let label = '';
  for (let value = index; ; value = Math.floor(value / 26) - 1) {
    label = String.fromCharCode(65 + (value % 26)) + label;
    if (value < 26) break;
  }
  return label;
}

function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

/** The trial's range validation: sizes are `-1..count - start`. */
function bound(name: 'rowCount' | 'columnCount', value: number, limit: number): number {
  if (value < -1 || value > limit) throw new RangeError(`Invalid ${name}: ${value} (must be between -1 and ${limit}).`);
  return value;
}

/** The trial's cell text for CSV export, `TRUE`/`FALSE` for booleans. */
function cellText(sheet: Worksheet, row: number, col: number): string {
  if (row < 0 || col < 0 || row >= sheet.getRowCount() || col >= sheet.getColumnCount()) return '';
  const value = sheet.getValue(row, col);
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  const text = sheet.getText(row, col);
  return typeof text === 'string' ? text : text === undefined || text === null ? '' : String(text);
}

export function getCsv(
  sheet: Worksheet,
  row: number,
  column: number,
  rowCount: number,
  columnCount: number,
  rowDelimiter = DEFAULT_ROW_DELIMITER,
  columnDelimiter = DEFAULT_COLUMN_DELIMITER,
): string {
  const startRow = row < 0 ? 0 : row;
  const startColumn = column < 0 ? 0 : column;
  const rows = bound('rowCount', rowCount, sheet.getRowCount() - startRow);
  const columns = bound('columnCount', columnCount, sheet.getColumnCount() - startColumn);
  const wholeSheet = rows < 0 && columns < 0 && row < 0 && column < 0;
  // Header labels only exist for a sheet that belongs to a workbook: a detached
  // `new Worksheet(...)` writes the same window without any label line or label
  // column (trial-verified, see .probe/report-item3m.json `csv-rules`).
  const labelled = !!sheet.parent;
  const endRow = rows < 0 ? sheet.getRowCount() - 1 : startRow + rows - 1;
  const endColumn = columns < 0 ? sheet.getColumnCount() - 1 : startColumn + columns - 1;
  const lines: string[] = [];
  if (row < 0 && !wholeSheet && labelled) {
    const header: string[] = column < 0 ? [''] : [];
    for (let c = startColumn; c <= endColumn; c++) header.push(quote(columnLabel(c)));
    lines.push(header.join(columnDelimiter));
  }
  for (let r = startRow; r <= endRow && r < sheet.getRowCount(); r++) {
    const cells: string[] = [];
    if (column < 0 && !wholeSheet && labelled) cells.push(quote(String(r + 1)));
    for (let c = startColumn; c <= endColumn && c < sheet.getColumnCount(); c++) cells.push(quote(cellText(sheet, r, c)));
    lines.push(cells.join(columnDelimiter));
  }
  return lines.map((line) => line + rowDelimiter).join('');
}

/**
 * Splits CSV text into rows of raw fields (quotes kept), honouring quoted
 * sections that contain the delimiters - including a row delimiter, which the
 * trial keeps inside the field.
 */
function parseRows(text: string, rowDelimiter: string, columnDelimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    atFieldStart = true,
    index = 0;
  const endField = () => {
    row.push(field);
    field = '';
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (index < text.length) {
    const character = text[index];
    if (!quoted && character === '"' && atFieldStart) {
      quoted = true;
      field += character;
      atFieldStart = false;
      index++;
      continue;
    }
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '""';
          index += 2;
          continue;
        }
        quoted = false;
        field += character;
        index++;
        continue;
      }
      field += character;
      index++;
      continue;
    }
    if (text.startsWith(rowDelimiter, index)) {
      index += rowDelimiter.length;
      endRow();
      continue;
    }
    if (text.startsWith(columnDelimiter, index)) {
      index += columnDelimiter.length;
      endField();
      continue;
    }
    field += character;
    atFieldStart = false;
    index++;
  }
  if (field !== '' || row.length || !atFieldStart) endRow();
  return rows;
}

/**
 * The value the trial stores for one CSV field, using the format engine. A
 * percent- or exponent-shaped field also carries the number format the trial
 * gives the cell (`-15%` displays as `-15%`, `1e3` as `1.00E+03`).
 */
function parseField(raw: string): { value: unknown; format?: string } {
  const quoted = raw.startsWith('"') && raw.endsWith('"') && raw.length > 1;
  const text = quoted ? raw.slice(1, -1).replace(/""/g, '"') : raw;
  const value = new GeneralFormatter('General').parse(text);
  const format =
    typeof value === 'number' && text.trimEnd().endsWith('%')
      ? '0%'
      : typeof value === 'number' && /^[+-]?(\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(text.trim())
        ? '0.00E+00'
        : undefined;
  return { value, format };
}

export function setCsv(
  sheet: Worksheet,
  row: number,
  column: number,
  text: string,
  rowDelimiter = DEFAULT_ROW_DELIMITER,
  columnDelimiter = DEFAULT_COLUMN_DELIMITER,
): void {
  const source = String(text ?? '');
  if (!source) return;
  const rows = parseRows(source, rowDelimiter, columnDelimiter);
  sheet.suspendPaint();
  sheet.suspendCalcService();
  try {
    rows.forEach((fields, lineIndex) => {
      fields.forEach((field, fieldIndex) => {
        const { value, format } = parseField(field);
        sheet.setValue(row + lineIndex, column + fieldIndex, value, SheetArea.viewport);
        if (format) sheet.setFormatter(row + lineIndex, column + fieldIndex, format);
      });
    });
  } finally {
    sheet.resumeCalcService();
    sheet.resumePaint();
  }
}
