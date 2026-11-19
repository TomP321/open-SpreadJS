/* Named-expression editing through the public workbook/worksheet name APIs. */
import type { GCRoot, Workbook, Worksheet } from './core-internals.js';

export interface DefinedNameEntry {
  id: string; text: string; value: string; name: string; scope: string; refersTo: string; comment: string; readOnly: boolean;
  /** Name created by a table rather than by the user (the trial's Table Names filter). */
  fromTable?: boolean;
}

/** Table-owned name prefixes and suffixes observed in the trial's Name Manager. */
const TABLE_NAME = /^_?wup|_filterdatabase$/i;

type NameOwner = Workbook | Worksheet;

export function definedNames(workbook: Workbook): DefinedNameEntry[] {
  const entries: DefinedNameEntry[] = [];
  const append = (owner: NameOwner, scope: string, prefix: string): void => {
    for (const info of owner.getCustomNames()) {
      const name = info.getName(), id = prefix + name;
      entries.push({
        id, text: name, value: id, name, scope,
        refersTo: `=${String(info.getExpression()).replace(/^=/, '')}`,
        comment: info.getComment() ?? '', readOnly: info.isReadOnly?.() ?? false,
        fromTable: TABLE_NAME.test(name),
      });
    }
  };
  append(workbook, 'Workbook', '');
  for (let i = 0; i < workbook.getSheetCount(); i++) append(workbook.getSheet(i), workbook.getSheet(i).name(), `sheet:${i}:`);
  return entries.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
}

/** The trial's `Filter with:` list, in menu order, as `[stable value, label]`. */
export const nameFilters: [value: string, label: string][] = [
  ['Clear', 'Clear Filter'], ['Workbook', 'Name Scoped to Workbook'], ['Worksheet', 'Name Scoped to Worksheet'],
  ['Errors', 'Name With Errors'], ['NoErrors', 'Name Without Errors'], ['Defined', 'Defined Names'], ['Tables', 'Table Names'],
];
/** Trial label of a `Filter with:` choice; both the short value and the label are accepted. */
export function nameFilterLabel(choice: string): string {
  return nameFilters.find(([value, label]) => value === choice || label === choice)?.[1] ?? choice;
}

/**
 * Cell value of a defined name, formatted the way the trial's Value column
 * shows it: an array or range reference becomes `{...}`, an error keeps its
 * text (`#REF!`), a constant is shown as its value.
 */
export function definedNameValue(gc: GCRoot, workbook: Workbook, entry: DefinedNameEntry): string {
  const expression = entry.refersTo.replace(/^=/, '');
  const inline = /#(REF|NAME|VALUE|DIV\/0|NULL|NUM|N\/A)[!?]/.exec(expression);
  if (inline) return inline[0];
  const sheets = Array.from({ length: workbook.getSheetCount() }, (_, i) => workbook.getSheet(i));
  const owner = entry.scope === 'Workbook' ? sheets[0] : sheets.find((sheet) => sheet.name() === entry.scope) ?? sheets[0];
  try {
    const value = gc?.Spread?.Sheets?.CalcEngine?.evaluateFormula?.(owner, expression, 0, 0);
    if (value === undefined || value === null) return '{...}';
    if (typeof value === 'object') {
      const error = (value as { error?: string }).error ?? (value as { _error?: string })._error;
      if (error) return String(error);
      return '{...}';
    }
    return String(value);
  } catch {
    return '{...}';
  }
}

/** Filter predicate of the trial's `Filter with:` combo. */
export function matchNameFilter(entry: DefinedNameEntry, filter: string, value: string): boolean {
  switch (nameFilterLabel(filter)) {
    case '': case 'Filter': case 'Clear Filter': return true;
    case 'Name Scoped to Workbook': return entry.scope === 'Workbook';
    case 'Name Scoped to Worksheet': return entry.scope !== 'Workbook';
    case 'Name With Errors': return value.startsWith('#');
    case 'Name Without Errors': return !value.startsWith('#');
    case 'Defined Names': return !entry.fromTable && !value.startsWith('#');
    case 'Table Names': return !!entry.fromTable;
    default: return true;
  }
}
function nameOwner(workbook: Workbook, scope: string): NameOwner {
  if (scope === 'Workbook') return workbook;
  for (let i = 0; i < workbook.getSheetCount(); i++) if (workbook.getSheet(i).name() === scope) return workbook.getSheet(i);
  throw new Error(`Worksheet ${scope} does not exist`);
}
export function validDefinedName(name: string): boolean {
  if (name.length > 255 || !/^[\p{L}_\\][\p{L}\p{N}_.\\]*$/u.test(name) || /^[rc]$/i.test(name) || /^r\d+c\d+$/i.test(name)) return false;
  const cell = /^([a-z]{1,3})([1-9]\d*)$/i.exec(name);
  if (!cell) return true;
  let column = 0;
  for (const letter of cell[1]!.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
  return column > 16384 || Number(cell[2]) > 1048576;
}
export function validateDefinedName(workbook: Workbook, data: Record<string, unknown>, previousId?: string): void {
  const name = String(data.name ?? '').trim(), scope = String(data.scope ?? 'Workbook'), formula = String(data.refersTo ?? '').trim();
  if (!validDefinedName(name)) throw new Error('Enter a valid name that is not a cell reference.');
  if (!formula || formula === '=') throw new Error('Enter a reference or formula.');
  const entries = definedNames(workbook), previous = entries.find((item) => item.id === previousId);
  if (previous?.readOnly) throw new Error('This name is read-only.');
  if (entries.some((item) => item.id !== previousId && item.scope === scope && item.name.toLowerCase() === name.toLowerCase())) throw new Error('This name already exists in the selected scope.');
  nameOwner(workbook, scope);
}
export function saveDefinedName(workbook: Workbook, data: Record<string, unknown>, previousId?: string): void {
  validateDefinedName(workbook, data, previousId);
  const name = String(data.name ?? '').trim(), scope = String(data.scope ?? 'Workbook'), formula = String(data.refersTo ?? '').trim();
  const previous = definedNames(workbook).find((item) => item.id === previousId);
  const owner = nameOwner(workbook, scope);
  if (previous && previous.scope === scope) {
    const info = owner.getCustomName(previous.name);
    info.set(name, formula.replace(/^=/, ''), info.getRow(), info.getColumn(), String(data.comment ?? ''));
  } else {
    owner.addCustomName(name, formula, 0, 0, String(data.comment ?? ''));
    if (previous) nameOwner(workbook, previous.scope).removeCustomName(previous.name);
  }
}
export function deleteDefinedName(workbook: Workbook, id: string): void {
  const entry = definedNames(workbook).find((item) => item.id === id);
  if (!entry || entry.readOnly) return;
  nameOwner(workbook, entry.scope).removeCustomName(entry.name);
}
