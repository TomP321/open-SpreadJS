import { clone, Range, Style } from './primitives.js';
import { GC } from './generated/enums.js';
import type { Worksheet } from './worksheet.js';
import { ruleFromJSON } from './features/conditional-formatting.js';
import { DefaultDataValidator } from './features/data-validation.js';
import type { JsonRecord } from './serialization.js';

const VIEW = GC.Spread.Sheets.SheetArea.viewport;

export type NamedCellTemplate = {
  name?: string;
  style?: Partial<Style> | string;
  conditionalFormats?: object[];
  dataValidations?: object[];
  cellStates?: object[];
};

export class NamedCellTemplatesManager {
  private templates = new Map<string, NamedCellTemplate>();

  add(name: string, template: NamedCellTemplate): void {
    this.templates.set(name, { ...clone(template), name });
  }
  get(name: string): NamedCellTemplate | null {
    const template = this.templates.get(name);
    return template ? clone(template) : null;
  }
  all(): NamedCellTemplate[] { return [...this.templates.values()].map(template => clone(template)); }
  has(name: string): boolean { return this.templates.has(name); }
  remove(name: string): NamedCellTemplate | null {
    const template = this.get(name);
    this.templates.delete(name);
    return template;
  }
  clear(): void { this.templates.clear(); }
  createFromCell(name: string, sheet: Worksheet, row: number, col: number, options: {
    style?: boolean; conditionalFormat?: boolean; dataValidation?: boolean; cellState?: boolean;
  } = {}): void {
    const style = options.style === false ? undefined : sheet.getStyle(row, col);
    const rules = options.conditionalFormat === false ? [] : sheet.conditionalFormats.getRules(row, col);
    const validator = options.dataValidation === false ? null : sheet.getDataValidator(row, col) as
      { toJSON?: () => object } | null;
    const cellStates = options.cellState === false ? [] : sheet.cellStates._at(row, col);
    this.add(name, {
      ...(style ? { style } : {}),
      ...(rules.length ? { conditionalFormats: rules.map(rule => rule.toJSON()) } : {}),
      ...(validator?.toJSON ? { dataValidations: [validator.toJSON()] } : {}),
      ...(cellStates.length ? { cellStates } : {}),
    });
  }
}

/** The style a template contributes: an inline style record or a registered named style. */
function templateStyle(sheet: Worksheet, template: NamedCellTemplate): Style | null {
  if (typeof template.style === 'string') return sheet.getNamedStyle(template.style) ?? null;
  if (!template.style) return null;
  return Object.assign(new Style(), clone(template.style));
}

/**
 * Applies a registered template to a cell area (`CellRange.applyNamedCellTemplate`
 * and `Worksheet.applyNamedCellTemplate`): the template style is written to every
 * cell of the area, its conditional formats and data validations are registered
 * for the area, and whole-row/whole-column areas (`rowCount` or `colCount` of -1)
 * expand to the current axis size. An unknown template name is ignored, as in the
 * trial; `cellStates` recorded by `createFromCell` are kept in the template but
 * not attached to the target cells yet.
 */
export function applyNamedCellTemplate(
  sheet: Worksheet,
  name: string,
  row: number,
  col: number,
  rowCount: number,
  colCount: number,
  area: number,
): void {
  const template = (sheet.parent as { namedCellTemplates?: NamedCellTemplatesManager } | undefined)?.namedCellTemplates?.get(name);
  if (!template) return;
  const start = { row: Math.max(0, row), col: Math.max(0, col) };
  const rows = rowCount < 0 ? sheet.getRowCount(area) - start.row : rowCount;
  const columns = colCount < 0 ? sheet.getColumnCount(area) - start.col : colCount;
  const style = templateStyle(sheet, template);
  if (style) {
    // Whole-row and whole-column areas use the trial's row/column style entries.
    if (col === -1 && row >= 0) for (let r = start.row; r < start.row + rows; r++) sheet.setStyle(r, -1, style, area);
    else if (row === -1 && col >= 0) for (let c = start.col; c < start.col + columns; c++) sheet.setStyle(-1, c, style, area);
    else
      for (let r = start.row; r < start.row + rows; r++)
        for (let c = start.col; c < start.col + columns; c++) sheet.setStyle(r, c, style, area);
  }
  for (const definition of template.conditionalFormats ?? []) {
    const rule = ruleFromJSON(definition as JsonRecord);
    if (!rule) continue;
    rule.ranges([new Range(start.row, start.col, rows, columns)]);
    sheet.conditionalFormats.addRule(rule);
  }
  for (const definition of template.dataValidations ?? []) {
    const validator = new DefaultDataValidator();
    validator.fromJSON(definition as Record<string, unknown>);
    sheet.setDataValidator(start.row, start.col, rows, columns, validator, area);
  }
}

/**
 * `Worksheet.applyNamedCellTemplate`: applies a template to one or more areas.
 * Accepted addresses are A1 ranges (`A1:C3`), whole rows (`5:6`), whole columns
 * (`A:A`), the whole sheet (`#All` — not supported by the trial either) and table
 * structured references (`Table1`, `Table1[[#Data]]`, `Table1[[#Headers]]`,
 * `Table1[[#Totals]]`). Unresolvable addresses and unknown template names are
 * ignored, as in the trial.
 */
export function applyNamedCellTemplateAddress(sheet: Worksheet, name: string, address: unknown): void {
  if (Array.isArray(address)) {
    for (const item of address) applyNamedCellTemplateAddress(sheet, name, item);
    return;
  }
  if (typeof address !== 'string') {
    const range = address as { row?: number; col?: number; rowCount?: number; colCount?: number };
    if (typeof range?.row === 'number' && typeof range.col === 'number')
      applyNamedCellTemplate(sheet, name, range.row, range.col, range.rowCount ?? 1, range.colCount ?? 1, VIEW);
    return;
  }
  const reference = address.match(/^([^:\[!]+)\[\[(#[^\]]*)\]\]$/);
  if (reference) {
    const table = sheet.tables.findByName(reference[1]!);
    if (!table) return;
    const section = reference[2]!.toLowerCase();
    const header = table.headerIndex();
    const footer = table.footerIndex();
    const area =
      section === '#data' ? table.dataRange()
        : section === '#headers' ? (header < 0 ? null : new Range(header, table.col, 1, table.colCount))
        : section === '#totals' ? (footer < 0 ? null : new Range(footer, table.col, 1, table.colCount))
        : table.range();
    if (area) applyNamedCellTemplate(sheet, name, area.row, area.col, area.rowCount, area.colCount, VIEW);
    return;
  }
  try {
    const range = sheet.getRange(address);
    applyNamedCellTemplate(sheet, name, range.row, range.col, range.rowCount, range.colCount, range.sheetArea);
  } catch {
    // The trial ignores addresses it cannot resolve.
  }
}
