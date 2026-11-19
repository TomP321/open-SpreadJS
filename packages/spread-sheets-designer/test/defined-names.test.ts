import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { definedNames, deleteDefinedName, matchNameFilter, nameFilterLabel, nameFilters, saveDefinedName, validDefinedName, type DefinedNameEntry } from '../src/defined-names.js';

describe('Designer defined names', () => {
  it('keeps workbook and worksheet scopes distinct when editing and deleting', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    const sheet = workbook.getActiveSheet();
    saveDefinedName(workbook, { name: 'Revenue', refersTo: '=A1*2', comment: 'Workbook total' });
    saveDefinedName(workbook, { name: 'Revenue', refersTo: '=B1', scope: sheet.name(), comment: 'Local' });
    const entries = definedNames(workbook);
    expect(entries.map((entry) => [entry.name, entry.scope, entry.comment])).toEqual([['Revenue', 'Workbook', 'Workbook total'], ['Revenue', sheet.name(), 'Local']]);
    saveDefinedName(workbook, { name: 'Costs', refersTo: '=C1', comment: 'Updated' }, 'Revenue');
    expect(workbook.getCustomName('Revenue')).toBeUndefined();
    expect(workbook.getCustomName('Costs').getExpression()).toBe('C1');
    expect(sheet.getCustomName('Revenue').getExpression()).toBe('B1');
    deleteDefinedName(workbook, entries[1]!.id);
    expect(sheet.getCustomNames()).toHaveLength(0);
    expect(workbook.getCustomNames()).toHaveLength(1);
  });
  it('rejects duplicate names in a scope and protects read-only names', () => {
    const workbook = new GC.Spread.Sheets.Workbook();
    saveDefinedName(workbook, { name: 'Budget', refersTo: '=1' });
    expect(() => saveDefinedName(workbook, { name: 'budget', refersTo: '=2' })).toThrow('already exists');
    workbook.addCustomName('Immutable', '42', 0, 0, '', true);
    expect(() => saveDefinedName(workbook, { name: 'Changed', refersTo: '=3' }, 'Immutable')).toThrow('read-only');
    deleteDefinedName(workbook, 'Immutable');
    expect(workbook.getCustomName('Immutable').getExpression()).toBe('42');
  });
  it('validates names without rejecting addresses beyond the worksheet limits', () => {
    for (const name of ['Revenue', '_Quarter.1', 'Équipe', 'XFE1', 'A1048577']) expect(validDefinedName(name), name).toBe(true);
    for (const name of ['', '1Name', 'Two Words', 'A1', 'XFD1048576', 'R1C1', 'R', 'c']) expect(validDefinedName(name), name).toBe(false);
  });
  it('filters by the trial\'s `Filter with:` choices, addressed by value or by label', () => {
    const entry = (scope: string): DefinedNameEntry => ({ id: scope, text: 'n', value: 'n', name: 'n', scope, refersTo: '=1', comment: '', readOnly: false });
    // The combo's option values are stable, so the visible (localisable) text is not the key.
    expect(nameFilters.map(([value]) => value)).toEqual(['Clear', 'Workbook', 'Worksheet', 'Errors', 'NoErrors', 'Defined', 'Tables']);
    expect(nameFilters.map(([, label]) => label)).toEqual(['Clear Filter', 'Name Scoped to Workbook', 'Name Scoped to Worksheet', 'Name With Errors', 'Name Without Errors', 'Defined Names', 'Table Names']);
    expect(nameFilterLabel('Worksheet')).toBe('Name Scoped to Worksheet');
    expect(nameFilterLabel('Name Scoped to Worksheet')).toBe('Name Scoped to Worksheet');
    expect(nameFilterLabel('Unknown')).toBe('Unknown');
    for (const choice of ['Worksheet', 'Name Scoped to Worksheet']) expect(matchNameFilter(entry('Data'), choice, '1'), choice).toBe(true);
    for (const choice of ['Worksheet', 'Name Scoped to Worksheet']) expect(matchNameFilter(entry('Workbook'), choice, '1'), choice).toBe(false);
    expect(matchNameFilter(entry('Workbook'), 'Workbook', '1')).toBe(true);
    expect(matchNameFilter(entry('Workbook'), '', '1')).toBe(true);
    expect(matchNameFilter(entry('Data'), 'Errors', '#REF!')).toBe(true);
    expect(matchNameFilter(entry('Data'), 'Errors', '1')).toBe(false);
  });
});
