/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { buildContextItems, tableAt, type ContextMenuState } from '../src/context-menu-items.js';
import { resolveText } from '../src/resolve.js';
import { englishResources } from '../src/resources.js';

// TASK 87: labels are `${res.contextMenu.*}` placeholders; resolve them against the
// English resources before comparing (the expected strings stay the trial's originals).
const r = (value: unknown): string => resolveText(value, englishResources);

/** Minimal stand-in for a core Worksheet: only what the menu builder reads. */
function fakeSheet(over: Record<string, unknown> = {}): any {
  return {
    _clipboardMode: () => 'none',
    _usedRange: () => ({ row: 4, col: 5 }),
    getHyperlink: () => null,
    getRowHeight: () => 20,
    getColumnWidth: () => 70,
    getRowCount: () => 200,
    getColumnCount: () => 20,
    getActiveRowIndex: () => 2,
    getActiveColumnIndex: () => 2,
    getSelections: () => [{ row: 2, col: 2, rowCount: 1, colCount: 1 }],
    setActiveCell: vi.fn(),
    setSelection: vi.fn(),
    tables: { all: () => [] },
    comments: { get: () => null },
    threadedComments: { get: () => null },
    charts: { all: () => [], get: () => null },
    ...over,
  };
}

const fakeTable = (row: number, col: number, rowCount: number, colCount: number): any => ({
  name: () => 'Sales',
  range: () => ({ row, col, rowCount, colCount }),
});

function fakeDesigner(sheet: any): any {
  const noop = () => undefined;
  return {
    getWorkbook: () => ({ getActiveSheet: () => sheet }),
    executeBuiltin: vi.fn(noop),
    executeSpecial: vi.fn(noop),
    runUndoable: vi.fn(noop),
    invalidate: noop,
    showFormatCells: noop,
    showSort: noop,
    showNewName: noop,
    showHyperlink: noop,
    commentUi: () => ({ openThread: noop, insertComment: noop }),
    showPasteSpecial: noop,
    showInsertCellsDialog: noop,
    showDeleteCellsDialog: noop,
    showTransformCells: noop,
    showCellTagDialog: noop,
    showHeaderTag: noop,
    showCornerTag: noop,
    showDefaultValueDialog: noop,
    showRichTextDialog: noop,
    showCreateCellTemplateDialog: noop,
    showDimensionDialog: noop,
    showHeadersDialog: noop,
    showOutlineColumnDialog: noop,
    executeChartCommand: noop,
    saveChartAsPicture: noop,
    showChangeChartTypeDialog: noop,
    showSelectDataDialog: noop,
    showMoveChartDialog: noop,
    showFormatChartAreaDialog: noop,
    host: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    workbookStructureProtected: false,
  };
}

const labels = (items: { label: string }[]): string[] => items.map((item) => r(item.label));
const entry = (items: any[], label: string): any => items.find((item) => r(item.label) === label);

const state = (kind: ContextMenuState['kind'], row = 8, col = 7, objectName?: string): ContextMenuState => ({ kind, row, col, objectName });

describe('cell context', () => {
  it('matches the trial entries for a plain cell (no clipboard, no table)', () => {
    const d = fakeDesigner(fakeSheet());
    expect(labels(buildContextItems(d, state('cell')))).toEqual([
      'Cut', 'Copy', 'Paste Options:', 'Insert...', 'Delete...', 'Clear Contents', 'Filter', 'Sort',
      'New Threaded Comment', 'Insert Comment', 'Format Cells...', 'Transform Cells...', 'Link...', 'Rich text...',
      'Define Name...', 'Tag...', 'Default Value...', 'Create Cell Template...',
    ]);
    const items = buildContextItems(d, state('cell'));
    expect(entry(items, 'Paste Options:').pasteRow).toHaveLength(6);
    expect(entry(items, 'Sort').submenu?.map((sub: any) => r(sub.label))).toEqual(['Sort A to Z', 'Sort Z to A', 'Custom Sort...']);
    expect(entry(items, 'Insert...').submenu).toBeUndefined();
  });

  it('shows table submenus instead of the dialogs for a cell inside a table', () => {
    const sheet = fakeSheet({ tables: { all: () => [fakeTable(0, 0, 4, 5)] } });
    const items = buildContextItems(fakeDesigner(sheet), state('cell', 2, 1));
    expect(labels(items)).toEqual([
      'Cut', 'Copy', 'Paste Options:', 'Insert', 'Delete', 'Clear Contents', 'Filter', 'Sort', 'Table',
      'New Threaded Comment', 'Insert Comment', 'Format Cells...', 'Link...', 'Rich text...',
      'Define Name...', 'Tag...', 'Default Value...', 'Create Cell Template...',
    ]);
    expect(entry(items, 'Transform Cells...')).toBeUndefined();
    // Single cell B2 (not touching the right/bottom table edge): only Left + Above.
    expect(entry(items, 'Insert').submenu?.map((sub: any) => r(sub.label))).toEqual(['Table Columns to the Left', 'Table Rows Above']);
    expect(entry(items, 'Delete').submenu?.map((sub: any) => r(sub.label))).toEqual(['Table Columns', 'Table Rows']);
    expect(entry(items, 'Table').submenu?.map((sub: any) => r(sub.label))).toEqual(['Totals Row', 'Convert to Range', 'Convert to Data Table']);
  });

  it('reveals the right/bottom table inserts when the selection touches those edges', () => {
    const sheet = fakeSheet({
      tables: { all: () => [fakeTable(0, 0, 4, 5)] },
      getSelections: () => [{ row: 2, col: 3, rowCount: 1, colCount: 2 }], // ends at the last table column
    });
    const items = buildContextItems(fakeDesigner(sheet), state('cell', 2, 3));
    expect(entry(items, 'Insert').submenu?.map((sub: any) => r(sub.label))).toEqual(['Table Columns to the Left', 'Table Columns to the Right', 'Table Rows Above']);
  });

  it('switches to the clipboard variant after a copy', () => {
    const sheet = fakeSheet({ _clipboardMode: () => 'copy' });
    const items = buildContextItems(fakeDesigner(sheet), state('cell'));
    expect(labels(items)).toEqual([
      'Cut', 'Copy', 'Paste Options:', 'Paste Special...', 'Delete...', 'Clear Contents', 'Insert Copied Cells...', 'Filter', 'Sort',
      'New Threaded Comment', 'Insert Comment', 'Format Cells...', 'Transform Cells...', 'Link...', 'Rich text...',
      'Define Name...', 'Tag...', 'Default Value...', 'Create Cell Template...',
    ]);
    expect(entry(items, 'Insert Copied Cells...').submenu?.map((sub: any) => r(sub.label))).toEqual(['Shift Cells Right', 'Shift Cells Down']);
  });

  it('keeps the plain in-table menu (no Insert Copied Cells) after a copy inside a table', () => {
    // Trial probe (`.probe/t6/t3-truth2.json` → iccMenuInTable): with a clipboard pending, a
    // right-click inside a table shows the normal in-table menu plus the paste row — the trial
    // suppresses `Insert Copied Cells...` there.
    const sheet = fakeSheet({ _clipboardMode: () => 'copy', tables: { all: () => [fakeTable(0, 0, 4, 5)] } });
    const items = buildContextItems(fakeDesigner(sheet), state('cell', 2, 1));
    expect(labels(items)).toEqual([
      'Cut', 'Copy', 'Paste Options:', 'Paste Special...', 'Insert', 'Delete', 'Clear Contents', 'Filter', 'Sort', 'Table',
      'New Threaded Comment', 'Insert Comment', 'Format Cells...', 'Link...', 'Rich text...',
      'Define Name...', 'Tag...', 'Default Value...', 'Create Cell Template...',
    ]);
    expect(entry(items, 'Insert Copied Cells...')).toBeUndefined();
    expect(entry(items, 'Transform Cells...')).toBeUndefined();
  });

  it('routes Convert to Range through the trial confirm dialog', () => {
    const sheet = fakeSheet({ tables: { all: () => [fakeTable(0, 0, 4, 5)] } });
    const d = fakeDesigner(sheet);
    d.showConvertTableDialog = vi.fn();
    const items = buildContextItems(d, state('cell', 2, 1));
    entry(items, 'Table').submenu!.find((sub: any) => r(sub.label) === 'Convert to Range')!.action!();
    expect(d.showConvertTableDialog).toHaveBeenCalledWith('Sales');
  });

  it('drops Paste Special and renames the insert submenu after a cut', () => {
    const sheet = fakeSheet({ _clipboardMode: () => 'cut' });
    const items = buildContextItems(fakeDesigner(sheet), state('cell'));
    expect(entry(items, 'Paste Special...')).toBeUndefined();
    expect(entry(items, 'Insert Cut Cells...').submenu?.map((sub: any) => r(sub.label))).toEqual(['Shift Cells Right', 'Shift Cells Down']);
  });
});

describe('header, corner, chart and shape contexts', () => {
  it('matches the trial row-header list', () => {
    // Trial lists re-measured live 2026-11-17 (TASK 51 .probe/t51): Transform Cells... is
    // present on the header menus even with an empty clipboard.
    const items = buildContextItems(fakeDesigner(fakeSheet()), state('row', 3, -1));
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste Options:', 'Insert', 'Delete', 'Clear Contents', 'Format Cells...', 'Transform Cells...', 'Tag...', 'Row Height...', 'Hide', 'Unhide', 'Headers...']);
  });

  it('matches the trial column-header list (adds Outline Column)', () => {
    const items = buildContextItems(fakeDesigner(fakeSheet()), state('col', -1, 2));
    // Trial column-header menu (live 2026-11-17): "Transform Cells..." shows unless the column
    // lies inside a table (where the menu matches the table-cell menu, like the pass2 crop).
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste Options:', 'Insert', 'Delete', 'Clear Contents', 'Format Cells...', 'Transform Cells...', 'Tag...', 'Column Width...', 'Hide', 'Unhide', 'Headers...', 'Outline Column...']);
  });

  it('matches the trial corner list and hides Remove Hyperlinks when nothing is linked', () => {
    const items = buildContextItems(fakeDesigner(fakeSheet()), state('corner', -1, -1));
    // Trial corner menu (measured live TASK 51): no Table entry, Transform Cells... after Format Cells...
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste Options:', 'Clear Contents', 'Filter', 'Sort', 'Format Cells...', 'Transform Cells...', 'Define Name...', 'Tag...']);
    const linked = fakeSheet({ getHyperlink: (_r: number, c: number) => (c === 2 ? { url: 'x' } : null) });
    expect(labels(buildContextItems(fakeDesigner(linked), state('corner', -1, -1)))).toContain('Remove Hyperlinks');
    // With a table present the trial swaps "Transform Cells..." for the Table submenu (m2-corner.png).
    const tabled = fakeSheet({ tables: { all: () => [fakeTable(0, 0, 4, 5)] } });
    const tableCorner = buildContextItems(fakeDesigner(tabled), state('corner', -1, -1));
    expect(labels(tableCorner)).not.toContain('Transform Cells...');
    expect(entry(tableCorner, 'Table')?.submenu?.map((sub: any) => r(sub.label))).toEqual(['Totals Row', 'Convert to Range', 'Convert to Data Table']);
  });

  it('matches the trial chart list with group/z-order submenus', () => {
    const items = buildContextItems(fakeDesigner(fakeSheet()), state('chart', 0, 0, 'Chart1'));
    // The trial names this row per hit zone (Format Chart Area / Plot Area / Data Series);
    // the stable default label the gate verifies is "Format Chart Area...".
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Reset to Match Style', 'Change Chart Type...', 'Select Data...', 'Move Chart...', 'Format Chart Area...', 'Group', 'Bring Forward', 'Send Backward', 'Save as Picture']);
    expect(entry(items, 'Bring Forward').submenu?.map((sub: any) => r(sub.label))).toEqual(['Bring Forward', 'Bring To Front']);
    expect(entry(items, 'Group').submenu?.every((sub: any) => sub.disabled)).toBe(true);
  });
});

describe('tableAt', () => {
  it('finds the table containing a cell and none outside', () => {
    const table = fakeTable(0, 0, 4, 5);
    expect(tableAt({ tables: { all: () => [table] } }, 2, 2)?.table).toBe(table);
    expect(tableAt({ tables: { all: () => [table] } }, 6, 2)).toBeNull();
  });
});
