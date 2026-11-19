/*
 * Option tables and read/write adapters behind the Settings tab's
 * Spread Settings and Sheet Settings dialogs.
 *
 * Binding names are the public option names of the contract
 * (`IWorkbookOptions` / `IWorksheetOptions` of @mescius/spread-sheets 19.2.5);
 * the tab order, group titles, labels, control kinds, combo items and default
 * values were read from the running v19 trial's open dialogs.
 */

import type Core from '@mescius/spread-sheets';
import type { Workbook, Worksheet } from './core-internals.js';
import { internals, recordView } from './core-internals.js';

export type SettingValue = boolean | number | string;

export interface SettingOption { text: string; value: SettingValue }

/** One editable control of a settings dialog. */
export interface SettingField {
  /** Dialog binding path — the public option name the trial writes. */
  key: string;
  kind: 'checkbox' | 'combo' | 'number' | 'color' | 'radio' | 'button';
  /** Row label; checkboxes carry their label after the box. */
  label: string;
  options?: SettingOption[];
  min?: number;
  max?: number;
  /** Text drawn right after the control (the `%` of Tab Strip Ratio). */
  suffix?: string;
  /** Rows the trial indents because they refine the row above them. */
  indent?: boolean;
  /** Caption of a `button` field. */
  text?: string;
  /** Radio group: the trial puts the choices on the label's row (Auto Text). */
  inline?: boolean;
  /** Radio group: how many columns the choices are laid out in. */
  columns?: number;
  /** Control width in px, for the tabs whose editors are narrower than default. */
  width?: number;
}

/** Layout metrics of one dialog tab, read from the trial's open window. */
export interface SettingLayout {
  /** Width of the left band, so the right column starts where the trial's does. */
  column: number;
  /** Label column width in px (rows where a label precedes the editor). */
  label?: number;
  /** Width of the number editors in px. */
  editor?: number;
  /** Width of the combo editors in px (the trial draws them wider than the numbers). */
  combo?: number;
  /** Row pitch in px. */
  row?: number;
}

export interface SettingGroup {
  /** Group title; the trial draws a rule under plain titles. */
  title?: string;
  /** `Selection Policy` and `Header Options` are bordered fieldsets. */
  bordered?: boolean;
  fields: SettingField[];
}

/** One horizontal band of a tab: a left group and an optional right group. */
export interface SettingRow {
  groups: SettingGroup[];
  right?: SettingGroup[];
}

export interface SettingTab {
  key: string;
  text: string;
  rows: SettingRow[];
  /** Sub-tabs, as the Headers tab splits into Column / Row Headers. */
  subTabs?: { key: string; text: string; rows: SettingRow[] }[];
  /** Column geometry of this tab in the trial's window. */
  layout?: SettingLayout;
}

const check = (key: string, label: string): SettingField => ({ key, kind: 'checkbox', label });
const num = (key: string, label: string, extra: Partial<SettingField> = {}): SettingField => ({ key, kind: 'number', label, ...extra });
const pick = (key: string, label: string, options: SettingOption[], extra: Partial<SettingField> = {}): SettingField => ({ key, kind: 'combo', label, options, ...extra });
const action = (key: string, label: string, text: string): SettingField => ({ key, kind: 'button', label, text });

/** Scrollbar visibility takes `true | false | 'auto'` in the contract. */
const SCROLLBAR: SettingOption[] = [{ text: 'Show', value: true }, { text: 'Hide', value: false }, { text: 'Auto', value: 'auto' }];
/** `GC.Spread.Sheets.AllowDragHeaderToMove`. */
const DRAG_HEADER: SettingOption[] = [{ text: 'None', value: 0 }, { text: 'Column', value: 1 }, { text: 'Row', value: 2 }, { text: 'Both', value: 3 }];
/** `GC.Spread.Sheets.ResizeMode`. */
const RESIZE_MODE: SettingOption[] = [{ text: 'Normal', value: 0 }, { text: 'Split', value: 1 }];
/** `GC.Spread.Sheets.ReferenceStyle`. */
const REFERENCE_STYLE: SettingOption[] = [{ text: 'A1', value: 0 }, { text: 'R1C1', value: 1 }];
/** `GC.Spread.Sheets.TabStripPosition`, in the trial's combo order. */
const TAB_STRIP_POSITION: SettingOption[] = [{ text: 'Bottom', value: 0 }, { text: 'Top', value: 1 }, { text: 'Left', value: 2 }, { text: 'Right', value: 3 }];
/** `GC.Spread.Sheets.AllSheetsListVisibility`. */
const ALL_SHEETS_LIST: SettingOption[] = [{ text: 'Auto', value: 2 }, { text: 'Show', value: 1 }, { text: 'Hide', value: 0 }];
/** `GC.Spread.Sheets.CopyPasteHeaderOptions`, in the order the dialog lays them out. */
const COPY_PASTE_HEADERS: SettingOption[] = [
  { text: 'No Headers', value: 0 }, { text: 'Row Headers', value: 1 },
  { text: 'All Headers', value: 3 }, { text: 'Column Headers', value: 2 },
];
/** `GC.Spread.Sheets.HeaderAutoText`. */
const HEADER_AUTO_TEXT: SettingOption[] = [{ text: 'Blank', value: 0 }, { text: 'Numbers', value: 1 }, { text: 'Letters', value: 2 }];
/** `GC.Spread.Sheets.SelectionPolicy`. */
const SELECTION_POLICY: SettingOption[] = [{ text: 'Single Select', value: 0 }, { text: 'Range Select', value: 1 }, { text: 'MultiRange Select', value: 2 }];

/** Spread Settings tabs, in the trial's order. */
export const spreadSettingTabs: SettingTab[] = [
  {
    key: 'general',
    text: 'General',
    layout: { column: 270, label: 125, editor: 102, combo: 120 },
    rows: [
      {
        groups: [{
          title: 'Settings',
          fields: [
            check('allowUserDragDrop', 'Allow Drag and Drop'),
            check('allowUserDragFill', 'Allow Drag and Fill'),
            check('allowUndo', 'Allow Undo'),
            check('allowUserDragMerge', 'Allow Drag and Merge'),
            check('allowAutoCreateHyperlink', 'Allow Auto Create Hyperlink'),
            check('allowAutoExtendFilterRange', 'Allow Auto Extend Filter Range'),
            check('formulaFormatHint', 'Formula Format Hints'),
            pick('allowDragHeaderToMove', 'Drag Header to Move', DRAG_HEADER),
            pick('rowResizeMode', 'Row Resize Mode', RESIZE_MODE),
            pick('columnResizeMode', 'Column Resize Mode', RESIZE_MODE),
            action('builtInFileIcons', 'Built-in File Icons', 'Manage Icons'),
          ],
        }],
        right: [{
          fields: [
            check('allowUserEditFormula', 'Allow User to Enter Formulas'),
            check('allowUserZoom', 'Allow Zoom'),
            check('allowDynamicArray', 'Allow DynamicArray'),
            check('allowInvalidFormula', 'Allow Invalid Formula'),
            check('enableAccessibility', 'Enable Accessibility'),
            check('scrollByPixel', 'Pixel Scrolling'),
            num('scrollPixel', 'Scroll by <pixels>', { min: 1 }),
            check('dynamicReferences', 'Use GetPivotData functions for PivotTable references'),
            num('maxUndoRedoStackSize', 'Undo/Redo Stack Size', { max: 2147483647 }),
          ],
        }],
      },
    ],
  },
  {
    key: 'scrollBars',
    text: 'ScrollBars',
    layout: { column: 350, label: 130, editor: 100 },
    rows: [
      {
        groups: [{
          title: 'Visibility',
          fields: [
            pick('showVerticalScrollbar', 'Vertical ScrollBar', SCROLLBAR),
            check('scrollbarShowMax', 'ScrollBar ShowMax'),
            check('useMobileScrollbar', 'Use Mobile Scrollbar'),
          ],
        }],
        right: [{
          fields: [
            pick('showHorizontalScrollbar', 'Horizontal ScrollBar', SCROLLBAR),
            check('scrollbarMaxAlign', 'ScrollBar MaxAlign'),
            check('scrollIgnoreHidden', 'Scroll Ignore Hidden'),
          ],
        }],
      },
    ],
  },
  {
    key: 'calculation',
    text: 'Calculation',
    layout: { column: 703, label: 134, editor: 46, row: 30 },
    rows: [{
      groups: [{
        // `Reference Style` sits where the other tabs put their group title.
        title: 'Reference Style',
        fields: [
          { key: 'referenceStyle', kind: 'radio', label: '', options: REFERENCE_STYLE, columns: 1 },
          check('incrementalCalculation', 'Enable incremental calculation'),
          check('calcOnDemand', 'Calculate on Demand'),
          check('iterativeCalculation', 'Enable iterative calculation'),
          num('iterativeCalculationMaximumIterations', 'Maximum Iterations:', { min: 1, max: 32767 }),
          num('iterativeCalculationMaximumChange', 'Maximum Change:'),
        ],
      }],
    }],
  },
  {
    key: 'tabStrip',
    text: 'Tab Strip',
    layout: { column: 350, label: 180, editor: 102, combo: 120, row: 29 },
    rows: [
      {
        groups: [{
          title: 'Settings',
          fields: [
            check('tabStripVisible', 'Tab Strip Visible'),
            check('newTabVisible', 'New Tab Visible'),
            num('tabStripRatio', 'Tab Strip Ratio(as percentage)', { min: 1, max: 100, suffix: '%' }),
            num('tabStripWidth', 'Tab Strip Width', { min: 80 }),
            pick('tabStripPosition', 'Tab Strip Position', TAB_STRIP_POSITION),
            pick('allSheetsListVisible', 'All Sheets List Visible', ALL_SHEETS_LIST),
          ],
        }],
        right: [{ fields: [check('tabEditable', 'Tab Strip Editable')] }],
      },
      {
        groups: [{
          title: 'Styles',
          fields: [action('defaultSheetTabStyles', 'Sheet Tab State Styles', 'Manage Style')],
        }],
      },
    ],
  },
  {
    key: 'clipboard',
    text: 'Clipboard',
    layout: { column: 350 },
    rows: [
      {
        groups: [{
          title: 'Settings',
          fields: [
            check('allowCopyPasteExcelStyle', 'Allow Copy Paste Excel Style'),
            check('pasteSkipInvisibleRange', 'Allow Paste Skip Invisible Range'),
          ],
        }],
        right: [{ fields: [check('allowExtendPasteRange', 'Allow Paste Extend Range')] }],
      },
      {
        groups: [{ fields: [{ key: 'copyPasteHeaderOptions', kind: 'radio', label: 'Header Options', options: COPY_PASTE_HEADERS, columns: 2 }] }],
      },
    ],
  },
  { key: 'customList', text: 'Custom Lists', rows: [] },
  { key: 'namedPattern', text: 'Named Patterns', rows: [] },
];

/** Sheet Settings tabs, in the trial's order. */
export const sheetSettingTabs: SettingTab[] = [
  {
    key: 'general',
    text: 'General',
    layout: { column: 290, label: 180, editor: 72, row: 26 },
    rows: [
      {
        groups: [{
          fields: [
            num('colCount', 'Column Count', { min: 0 }),
            num('rowCount', 'Row Count', { min: 0 }),
            num('frozenColumnCount', 'Frozen Column Count', { min: 0 }),
            num('frozenLeftColumn', 'Left Column', { min: 0, indent: true }),
            num('frozenRowCount', 'Frozen Row Count', { min: 0 }),
            num('frozenTopRow', 'Top Row', { min: 0, indent: true }),
            num('frozenTrailingColumnCount', 'Trailing Frozen Column Count', { min: 0, max: 100 }),
            { key: 'frozenTrailingColumnStickToEdge', kind: 'checkbox', label: 'Stick to Edge', indent: true },
            num('frozenTrailingRowCount', 'Trailing Frozen Row Count', { min: 0, max: 100 }),
            { key: 'frozenTrailingRowStickToEdge', kind: 'checkbox', label: 'Stick to Edge', indent: true },
          ],
        }],
        right: [
          { title: 'Selection Policy', bordered: true, fields: [{ key: 'selectionPolicy', kind: 'radio', label: '', options: SELECTION_POLICY, columns: 1 }] },
          {
            fields: [
              check('allowCellOverflow', 'Allow Overflow'),
              check('showZeros', 'Show Zero Value Cells'),
              check('addColumnButtonVisible', 'Add Column Button Visible'),
              check('addRowButtonVisible', 'Add Row Button Visible'),
              check('rightToLeft', 'Right-to-left'),
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'gridlines',
    text: 'Grid Lines',
    layout: { column: 300, label: 100, editor: 150, row: 34 },
    rows: [{
      groups: [{ fields: [check('showHorizontalGridline', 'Horizontal Gridline'), check('showVerticalGridline', 'Vertical Gridline')] }],
      right: [{ fields: [{ key: 'gridlineColor', kind: 'color', label: 'Gridline Color' }] }],
    }],
  },
  {
    key: 'headers',
    text: 'Headers',
    layout: { column: 710, label: 180, editor: 72, row: 26 },
    rows: [],
    subTabs: [
      {
        key: 'columnHeaders',
        text: 'Column Headers',
        rows: [{
          groups: [{
            fields: [
              num('colHeaderRowCount', 'Column Header Row Count', { min: 0, max: 100 }),
              { key: 'colHeaderAutoText', kind: 'radio', label: 'Column Header Auto Text', options: HEADER_AUTO_TEXT, inline: true, width: 250 },
              num('colHeaderAutoTextIndex', 'Column Header Auto Index', { min: -1, max: 100 }),
              num('colHeaderDefRowHeight', 'Default Row Height', { min: 0, max: 100 }),
              check('colHeaderVisible', 'Column Header Visible'),
            ],
          }],
        }],
      },
      {
        key: 'rowHeaders',
        text: 'Row Headers',
        rows: [{
          groups: [{
            fields: [
              num('rowHeaderColCount', 'Row Header Column Count', { min: 0, max: 100 }),
              { key: 'rowHeaderAutoText', kind: 'radio', label: 'Row Header Auto Text', options: HEADER_AUTO_TEXT, inline: true, width: 250 },
              num('rowHeaderAutoTextIndex', 'Row Header Auto Index', { min: -1, max: 100 }),
              num('rowHeaderDefColWidth', 'Default Column Width', { min: 0, max: 100 }),
              check('rowHeaderVisible', 'Row Header Visible'),
            ],
          }],
        }],
      },
    ],
  },
  {
    key: 'sheetTab',
    text: 'SheetTab',
    layout: { column: 710, label: 180, editor: 110, row: 34 },
    rows: [{
      groups: [{
        fields: [
          { key: 'sheetTabColor', kind: 'color', label: 'Sheet Tab Color:' },
          action('sheetTabStateStyles', 'Sheet Tab State Styles:', 'Manage Style'),
        ],
      }],
    }],
  },
];

/** The tab each Settings ribbon command selects (observed in the trial). */
export const settingsTabForCommand: Record<string, string> = {
  spreadSettingGeneral: 'general',
  spreadSettingScrollBar: 'scrollBars',
  spreadSettingCalculation: 'calculation',
  spreadSettingTabStrip: 'tabStrip',
  sheetSettingGeneral: 'general',
  sheetSettingGridLine: 'gridlines',
  sheetSettingHeaders: 'headers',
};

/** Reads and writes one dialog's options on a live workbook or worksheet. */
export interface SettingsOwner {
  get(key: string): SettingValue;
  set(key: string, value: SettingValue): void;
}

const numeric = (value: unknown, fallback: number): number => (Number.isFinite(Number(value)) ? Number(value) : fallback);
/** `GC.Spread.Sheets.SheetArea.colHeader` / `.rowHeader` — the header areas. */
const COL_HEADER_AREA = 1;
const ROW_HEADER_AREA = 2;
const scalar = (value: unknown): SettingValue =>
  typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' ? value : value === undefined ? false : String(value);

/** Adapter for the Spread Settings dialog (workbook options + undo manager). */
export function workbookSettingsOwner(workbook: Workbook): SettingsOwner {
  const options = recordView(workbook.options ?? {});
  return {
    get(key: string): SettingValue {
      switch (key) {
        case 'useMobileScrollbar': return options.scrollbarAppearance === 1;
        case 'maxUndoRedoStackSize': return numeric(workbook.undoManager?.()?.maxSize?.(), 2147483647);
        case 'tabStripRatio': return Math.round(numeric(options.tabStripRatio, 0.5) * 100);
        case 'builtInFileIcons': case 'defaultSheetTabStyles': return '';
        default: return scalar(options[key]);
      }
    },
    set(key: string, value: SettingValue): void {
      switch (key) {
        case 'useMobileScrollbar': options.scrollbarAppearance = value ? 1 : 0; return;
        case 'maxUndoRedoStackSize': workbook.undoManager?.()?.maxSize?.(Math.max(0, Math.floor(numeric(value, 2147483647)))); return;
        case 'tabStripRatio': options.tabStripRatio = Math.min(1, Math.max(0.01, numeric(value, 50) / 100)); return;
        case 'showVerticalScrollbar': case 'showHorizontalScrollbar':
          options[key] = value === 'auto' || value === 'auto ' ? 'auto' : value === true || value === 'true';
          return;
        case 'builtInFileIcons': case 'defaultSheetTabStyles': return;
        default: options[key] = value; return;
      }
    },
  };
}

/**
 * Adapter for the Sheet Settings dialog. `Left Column` / `Top Row` and the two
 * `Stick to Edge` boxes are the second arguments of the public frozen-pane
 * setters; the trial documents stick-to-edge as `true` by default.
 */
export function worksheetSettingsOwner(sheet: Worksheet): SettingsOwner {
  const options = recordView(sheet.options ?? {});
  const defaults = recordView(sheet.defaults ?? {});
  // `options.gridline` is a live object in the core, so read and write it in place.
  const gridline = (): Record<string, unknown> => (options.gridline ?? {}) as Record<string, unknown>;
  // The dialog shows the index of the first scrolling cell relative to the
  // frozen band, which is the second argument of the public frozen setters.
  // The reference exposes no getter for the frozen anchor (it is the second
  // argument of `frozenColumnCount`), so read it from the sheet's stored state.
  const anchor = (axis: 'column' | 'row'): number => {
    const stored = internals(sheet).settings;
    const frozen = axis === 'column' ? sheet.frozenColumnCount() : sheet.frozenRowCount();
    const key = axis === 'column' ? 'leftCellIndex' : 'topCellIndex';
    return Math.max(0, numeric(stored?.[key], frozen) - frozen);
  };
  // Stick-to-edge lives in the same internal record the public setters write and
  // `toJSON()` serialises (as `frozenTrailingRowStickToEdge`); the trial exposes no option for it.
  const stick = (axis: 'column' | 'row'): boolean => {
    const stored = internals(sheet).settings;
    return stored?.[axis === 'column' ? 'frozenTrailingColumnStickToEdge' : 'frozenTrailingRowStickToEdge'] !== false;
  };
  // Internal (non-contract) view used for `settings` and `tabColor` reads/writes.
  const si = internals(sheet);
  return {
    get(key: string): SettingValue {
      switch (key) {
        case 'colCount': return sheet.getColumnCount();
        case 'rowCount': return sheet.getRowCount();
        case 'frozenColumnCount': return sheet.frozenColumnCount();
        case 'frozenRowCount': return sheet.frozenRowCount();
        case 'frozenLeftColumn': return anchor('column');
        case 'frozenTopRow': return anchor('row');
        case 'frozenTrailingColumnCount': return sheet.frozenTrailingColumnCount();
        case 'frozenTrailingRowCount': return sheet.frozenTrailingRowCount();
        case 'frozenTrailingColumnStickToEdge': return stick('column');
        case 'frozenTrailingRowStickToEdge': return stick('row');
        case 'selectionPolicy': return numeric(sheet.selectionPolicy?.(), 2);
        case 'addColumnButtonVisible': return (options.addColumnButtonOption as { visible?: boolean } | undefined)?.visible === true;
        case 'addRowButtonVisible': return (options.addRowButtonOption as { visible?: boolean } | undefined)?.visible === true;
        case 'colHeaderRowCount': return numeric(sheet.getRowCount?.(COL_HEADER_AREA) ?? options.colHeaderRowCount, 1);
        case 'colHeaderAutoText': return numeric(options.colHeaderAutoText, 2);
        case 'colHeaderAutoTextIndex': return numeric(options.colHeaderAutoTextIndex, -1);
        case 'colHeaderDefRowHeight': return Math.round(numeric(defaults.colHeaderRowHeight, 20));
        case 'rowHeaderColCount': return numeric(sheet.getColumnCount?.(ROW_HEADER_AREA) ?? options.rowHeaderColCount, 1);
        case 'rowHeaderAutoText': return numeric(options.rowHeaderAutoText, 1);
        case 'rowHeaderAutoTextIndex': return numeric(options.rowHeaderAutoTextIndex, -1);
        case 'rowHeaderDefColWidth': return Math.round(numeric(defaults.rowHeaderColWidth, 40));
        case 'showHorizontalGridline': return gridline().showHorizontalGridline !== false;
        case 'showVerticalGridline': return gridline().showVerticalGridline !== false;
        case 'gridlineColor': return String(gridline().color ?? 'rgb(212, 212, 212)');
        case 'sheetTabColor': return String(options.sheetTabColor ?? si.tabColor?.() ?? '');
        case 'sheetTabStateStyles': return '';
        default: return scalar(options[key]);
      }
    },
    set(key: string, value: SettingValue): void {
      const num = numeric(value, 0);
      switch (key) {
        case 'colCount': if (num > 0) sheet.setColumnCount(num); return;
        case 'rowCount': if (num > 0) sheet.setRowCount(num); return;
        case 'frozenColumnCount': sheet.frozenColumnCount(Math.max(0, num)); return;
        case 'frozenLeftColumn': sheet.frozenColumnCount(sheet.frozenColumnCount(), Math.max(0, num)); return;
        case 'frozenRowCount': sheet.frozenRowCount(Math.max(0, num)); return;
        case 'frozenTopRow': sheet.frozenRowCount(sheet.frozenRowCount(), Math.max(0, num)); return;
        case 'frozenTrailingColumnCount': sheet.frozenTrailingColumnCount(Math.max(0, num)); return;
        case 'frozenTrailingRowCount': sheet.frozenTrailingRowCount(Math.max(0, num)); return;
        case 'frozenTrailingColumnStickToEdge':
          sheet.frozenTrailingColumnCount(sheet.frozenTrailingColumnCount(), !!value);
          return;
        case 'frozenTrailingRowStickToEdge':
          sheet.frozenTrailingRowCount(sheet.frozenTrailingRowCount(), !!value);
          return;
        case 'selectionPolicy': sheet.selectionPolicy?.(num as Core.Spread.Sheets.SelectionPolicy); return;
        case 'addColumnButtonVisible': options.addColumnButtonOption = { ...((options.addColumnButtonOption ?? {}) as Record<string, unknown>), visible: !!value }; return;
        case 'addRowButtonVisible': options.addRowButtonOption = { ...((options.addRowButtonOption ?? {}) as Record<string, unknown>), visible: !!value }; return;
        case 'colHeaderRowCount':
          options.colHeaderRowCount = Math.max(0, num);
          sheet.setRowCount(Math.max(0, num), COL_HEADER_AREA);
          return;
        case 'colHeaderAutoText': options.colHeaderAutoText = num; return;
        case 'colHeaderAutoTextIndex': options.colHeaderAutoTextIndex = num; return;
        case 'colHeaderDefRowHeight': defaults.colHeaderRowHeight = Math.max(0, num); return;
        case 'rowHeaderColCount':
          options.rowHeaderColCount = Math.max(0, num);
          sheet.setColumnCount(Math.max(0, num), ROW_HEADER_AREA);
          return;
        case 'rowHeaderAutoText': options.rowHeaderAutoText = num; return;
        case 'rowHeaderAutoTextIndex': options.rowHeaderAutoTextIndex = num; return;
        case 'rowHeaderDefColWidth': defaults.rowHeaderColWidth = Math.max(0, num); return;
        case 'showHorizontalGridline': case 'showVerticalGridline': case 'gridlineColor': {
          const name = key === 'gridlineColor' ? 'color' : key;
          gridline()[name] = key === 'gridlineColor' ? String(value) : !!value;
          return;
        }
        case 'sheetTabColor':
          // The core stores `null` here (contract types the option `string`); keep the exact value the settings model wrote before.
          (options as Record<string, unknown>).sheetTabColor = value ? String(value) : null;
          if (typeof si.tabColor === 'function') si.tabColor(value ? String(value) : null);
          return;
        case 'sheetTabStateStyles': return;
        default: options[key] = value; return;
      }
    },
  };
}

/** Every field of a tab list, sub-tabs included. */
export function settingFields(tabs: SettingTab[]): SettingField[] {
  const fields: SettingField[] = [];
  for (const tab of tabs) {
    const walk = (rows: SettingRow[]): void => {
      for (const row of rows) {
        for (const group of [...row.groups, ...(row.right ?? [])]) fields.push(...group.fields);
      }
    };
    walk(tab.rows);
    for (const sub of tab.subTabs ?? []) walk(sub.rows);
  }
  return fields;
}

/** Snapshot of every editable value of a dialog. */
export function readSettings(owner: SettingsOwner, tabs: SettingTab[]): Record<string, SettingValue> {
  const data: Record<string, SettingValue> = {};
  for (const field of settingFields(tabs)) if (field.kind !== 'button') data[field.key] = owner.get(field.key);
  return data;
}

/** Writes back only what the user changed. */
export function applySettings(owner: SettingsOwner, before: Record<string, SettingValue>, after: Record<string, SettingValue>): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(after)) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) { owner.set(key, after[key]); changed.push(key); }
  }
  return changed;
}

/** Lists the trial's Custom Lists tab shows for a fresh workbook. */
export const BUILT_IN_CUSTOM_LISTS: string[][] = [
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
];

/** The workbook's own lists (`options.customList`); the four built-ins are implicit. */
export function userCustomLists(workbook: Workbook): string[][] {
  const stored = workbook?.options?.customList;
  return Array.isArray(stored) ? stored.filter((items: unknown) => Array.isArray(items) && items.length > 0).map((items: unknown[]) => items.map(String)) : [];
}

/** Gallery caption of a list: the trial joins the entries with commas. */
export function customListCaption(items: string[]): string { return items.join(','); }

/** The trial's `List entries` box keeps one entry per line. */
export function customListEntries(items: string[]): string { return items.join('\n'); }

/** Parses the `List entries` box: one entry per line, empty lines ignored. */
export function parseCustomListEntries(text: string): string[] {
  return String(text ?? '').split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * `InputMask.namedPattern()` operations that turn `before` into `after`.
 * Removed and changed names are written back with their pattern, deleted ones
 * with `null`, which is how the public API clears a named pattern.
 */
export function namedPatternEdits(
  before: { name: string; pattern: string }[],
  after: { name: string; pattern: string }[],
): { name: string; pattern: string | null }[] {
  const patternOf = (list: { name: string; pattern: string }[], name: string): string | undefined =>
    list.find((entry) => entry.name === name)?.pattern;
  const ops: { name: string; pattern: string | null }[] = [];
  for (const entry of before) if (patternOf(after, entry.name) === undefined) ops.push({ name: entry.name, pattern: null });
  for (const entry of after) if (patternOf(before, entry.name) !== entry.pattern) ops.push({ name: entry.name, pattern: entry.pattern });
  return ops;
}
