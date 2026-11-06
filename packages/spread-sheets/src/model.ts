import { GC } from './generated/enums.js';
import { notImplemented } from './not-implemented.js';

function coordinate(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Cell coordinates must be non-negative safe integers');
}

export class Worksheet {
  private sheetName: string;
  private readonly areas = new Map<number, Map<number, Map<number, unknown>>>();

  constructor(name = 'Sheet1') { this.sheetName = name; }

  name(): string;
  name(value: string): this;
  name(value?: string): string | this {
    if (value === undefined) return this.sheetName;
    this.sheetName = value;
    return this;
  }

  getValue(row: number, col: number, sheetArea = GC.Spread.Sheets.SheetArea.viewport, valueType = GC.Spread.Sheets.ValueType.normal): unknown {
    coordinate(row); coordinate(col);
    if (valueType !== GC.Spread.Sheets.ValueType.normal) notImplemented('GC.Spread.Sheets.Worksheet.getValue(valueType)');
    return this.areas.get(sheetArea)?.get(row)?.get(col) ?? null;
  }

  setValue(row: number, col: number, value: unknown, sheetArea = GC.Spread.Sheets.SheetArea.viewport, _ignoreRecalc?: boolean): void {
    coordinate(row); coordinate(col);
    if (value == null) {
      const rows = this.areas.get(sheetArea);
      const cells = rows?.get(row);
      cells?.delete(col);
      if (cells?.size === 0) rows?.delete(row);
      if (rows?.size === 0) this.areas.delete(sheetArea);
      return;
    }
    let rows = this.areas.get(sheetArea);
    if (!rows) this.areas.set(sheetArea, rows = new Map());
    let cells = rows.get(row);
    if (!cells) rows.set(row, cells = new Map());
    cells.set(col, value);
  }
}

export interface WorkbookOptions { sheetCount?: number }

export class Workbook {
  sheets: Worksheet[];
  private host?: HTMLElement;
  private addedHostClass = false;
  private destroyed = false;

  constructor(host?: HTMLElement | string, options: WorkbookOptions = {}) {
    for (const key of Object.keys(options)) if (key !== 'sheetCount') notImplemented(`GC.Spread.Sheets.Workbook.options.${key}`);
    const count = options.sheetCount ?? 1;
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('sheetCount must be a non-negative safe integer');
    if (typeof host === 'string') {
      const element = typeof document === 'undefined' ? null : document.getElementById(host);
      if (!element) throw new Error(`Workbook host not found: ${host}`);
      this.host = element;
    } else this.host = host;
    this.sheets = Array.from({ length: count }, (_, index) => new Worksheet(`Sheet${index + 1}`));
    if (this.host) {
      this.addedHostClass = !this.host.classList.contains('opensheets-host');
      this.host.classList.add('opensheets-host');
    }
  }

  getSheet(index: number): Worksheet {
    this.assertAlive();
    return this.sheets[index]!;
  }

  getActiveSheet(): Worksheet { return this.getSheet(0); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.addedHostClass) this.host?.classList.remove('opensheets-host');
    this.sheets.length = 0;
    this.host = undefined;
  }

  private assertAlive() { if (this.destroyed) throw new Error('Workbook has been destroyed'); }
}
