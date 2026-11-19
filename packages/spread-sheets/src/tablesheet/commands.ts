import type { Command, CommandOptions } from '../commands.js';
import type { Workbook } from '../workbook.js';
import { TableSheet } from './index.js';

const names = ['TableSheetSortColumn', 'TableSheetAddSortColumn', 'TableSheetRemoveSortColumn',
  'TableSheetFilterColumn', 'TableSheetRemoveFilterColumn'] as const;

function command(name: typeof names[number]): Command {
  return {
    canUndo: true,
    execute(context: unknown, options: CommandOptions, undo: boolean): boolean {
      const workbook = context as Workbook;
      const sheet = workbook.getSheetFromName(String(options.sheetName));
      if (!(sheet instanceof TableSheet)) return false;
      const column = sheet.getDataView()?.getColumn(Number(options.col)) as { value?: string; name?: string } | undefined;
      const field = column?.value ?? column?.name;
      if (!field) return false;
      const filtering = name.includes('Filter');
      if (undo) {
        if (filtering) sheet.filter(options._previous as Parameters<TableSheet['filter']>[0]);
        else sheet.sort(options._previous as Parameters<TableSheet['sort']>[0]);
        return true;
      }
      if (!Object.hasOwn(options, '_previous')) options._previous = (filtering ? sheet.filter() : sheet.sort()).map(item => ({ ...item }));
      if (filtering) {
        const filters = sheet.filter().filter(filter => filter.field !== field);
        if (name === 'TableSheetFilterColumn') filters.push({
          field, ...(options.values ? { values: options.values as { value: unknown }[] } : {}),
          ...(options.condition ? { condition: options.condition } : {}),
          ...(options.paths ? { paths: options.paths as { path: unknown[]; type?: string }[] } : {}),
        });
        sheet.filter(filters);
      } else {
        const sorts = name === 'TableSheetSortColumn' ? [] : sheet.sort().filter(sort => sort.field !== field);
        if (name !== 'TableSheetRemoveSortColumn') sorts.push({
          field, ascending: Boolean(options.ascending),
          ...(options.compare ? { compare: options.compare as (a: unknown, b: unknown, ascending: boolean) => number } : {}),
        });
        sheet.sort(sorts);
      }
      return true;
    },
  };
}
export const tableSheetCommands = Object.fromEntries(names.map(name => [name, command(name)])) as Record<typeof names[number], Command>;
