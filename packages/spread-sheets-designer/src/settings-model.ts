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

/** TASK 87: dialog captions are placeholders under res.settings, resolved by the dialog host. */
const sr = (key: string): string => `\${res.settings.${key}}`;

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
const SCROLLBAR: SettingOption[] = [{ text: sr('show'), value: true }, { text: sr('hide'), value: false }, { text: sr('auto'), value: 'auto' }];
/** `GC.Spread.Sheets.AllowDragHeaderToMove`. */
const DRAG_HEADER: SettingOption[] = [{ text: sr('none'), value: 0 }, { text: sr('column'), value: 1 }, { text: sr('row'), value: 2 }, { text: sr('both'), value: 3 }];
/** `GC.Spread.Sheets.ResizeMode`. */
const RESIZE_MODE: SettingOption[] = [{ text: sr('normal'), value: 0 }, { text: sr('split'), value: 1 }];
/** `GC.Spread.Sheets.ReferenceStyle`. */
const REFERENCE_STYLE: SettingOption[] = [{ text: sr('a1'), value: 0 }, { text: sr('r1C1'), value: 1 }];
/** `GC.Spread.Sheets.TabStripPosition`, in the trial's combo order. */
const TAB_STRIP_POSITION: SettingOption[] = [{ text: sr('bottom'), value: 0 }, { text: sr('top'), value: 1 }, { text: sr('left'), value: 2 }, { text: sr('right'), value: 3 }];
/** `GC.Spread.Sheets.AllSheetsListVisibility`. */
const ALL_SHEETS_LIST: SettingOption[] = [{ text: sr('auto'), value: 2 }, { text: sr('show'), value: 1 }, { text: sr('hide'), value: 0 }];
/** `GC.Spread.Sheets.CopyPasteHeaderOptions`, in the order the dialog lays them out. */
const COPY_PASTE_HEADERS: SettingOption[] = [
  { text: sr('noHeaders'), value: 0 }, { text: sr('rowHeaders'), value: 1 },
  { text: sr('allHeaders'), value: 3 }, { text: sr('columnHeaders'), value: 2 },
];
/** `GC.Spread.Sheets.HeaderAutoText`. */
const HEADER_AUTO_TEXT: SettingOption[] = [{ text: sr('blank'), value: 0 }, { text: sr('numbers'), value: 1 }, { text: sr('letters'), value: 2 }];
/** `GC.Spread.Sheets.SelectionPolicy`. */
const SELECTION_POLICY: SettingOption[] = [{ text: sr('singleSelect'), value: 0 }, { text: sr('rangeSelect'), value: 1 }, { text: sr('multiRangeSelect'), value: 2 }];

/** Spread Settings tabs, in the trial's order. */
export const spreadSettingTabs: SettingTab[] = [
  {
    key: 'general',
    text: sr('general'),
    layout: { column: 270, label: 125, editor: 102, combo: 120 },
    rows: [
      {
        groups: [{
          title: sr('settings'),
          fields: [
            check('allowUserDragDrop', sr('allowUserDragDrop')),
            check('allowUserDragFill', sr('allowUserDragFill')),
            check('allowUndo', sr('allowUndo')),
            check('allowUserDragMerge', sr('allowUserDragMerge')),
            check('allowAutoCreateHyperlink', sr('allowAutoCreateHyperlink')),
            check('allowAutoExtendFilterRange', sr('allowAutoExtendFilterRange')),
            check('formulaFormatHint', sr('formulaFormatHint')),
            pick('allowDragHeaderToMove', sr('allowDragHeaderToMove'), DRAG_HEADER),
            pick('rowResizeMode', sr('rowResizeMode'), RESIZE_MODE),
            pick('columnResizeMode', sr('columnResizeMode'), RESIZE_MODE),
            action('builtInFileIcons', sr('builtInFileIcons'), sr('manageIcons')),
          ],
        }],
        right: [{
          fields: [
            check('allowUserEditFormula', sr('allowUserEditFormula')),
            check('allowUserZoom', sr('allowUserZoom')),
            check('allowDynamicArray', sr('allowDynamicArray')),
            check('allowInvalidFormula', sr('allowInvalidFormula')),
            check('enableAccessibility', sr('enableAccessibility')),
            check('scrollByPixel', sr('scrollByPixel')),
            num('scrollPixel', sr('scrollPixel'), { min: 1 }),
            check('dynamicReferences', sr('dynamicReferences')),
            num('maxUndoRedoStackSize', sr('maxUndoRedoStackSize'), { max: 2147483647 }),
          ],
        }],
      },
    ],
  },
  {
    key: 'scrollBars',
    text: sr('scrollBars'),
    layout: { column: 350, label: 130, editor: 100 },
    rows: [
      {
        groups: [{
          title: sr('visibility'),
          fields: [
            pick('showVerticalScrollbar', sr('showVerticalScrollbar'), SCROLLBAR),
            check('scrollbarShowMax', sr('scrollbarShowMax')),
            check('useMobileScrollbar', sr('useMobileScrollbar')),
          ],
        }],
        right: [{
          fields: [
            pick('showHorizontalScrollbar', sr('showHorizontalScrollbar'), SCROLLBAR),
            check('scrollbarMaxAlign', sr('scrollbarMaxAlign')),
            check('scrollIgnoreHidden', sr('scrollIgnoreHidden')),
          ],
        }],
      },
    ],
  },
  {
    key: 'calculation',
    text: sr('calculation'),
    layout: { column: 703, label: 134, editor: 46, row: 30 },
    rows: [{
      groups: [{
        // `Reference Style` sits where the other tabs put their group title.
        title: sr('referenceStyle'),
        fields: [
          { key: 'referenceStyle', kind: 'radio', label: '', options: REFERENCE_STYLE, columns: 1 },
          check('incrementalCalculation', sr('incrementalCalculation')),
          check('calcOnDemand', sr('calcOnDemand')),
          check('iterativeCalculation', sr('iterativeCalculation')),
          num('iterativeCalculationMaximumIterations', sr('iterativeCalculationMaximumIterations'), { min: 1, max: 32767 }),
          num('iterativeCalculationMaximumChange', sr('iterativeCalculationMaximumChange')),
        ],
      }],
    }],
  },
  {
    key: 'tabStrip',
    text: sr('tabStrip'),
    layout: { column: 350, label: 180, editor: 102, combo: 120, row: 29 },
    rows: [
      {
        groups: [{
          title: sr('settings'),
          fields: [
            check('tabStripVisible', sr('tabStripVisible')),
            check('newTabVisible', sr('newTabVisible')),
            num('tabStripRatio', sr('tabStripRatio'), { min: 1, max: 100, suffix: '%' }),
            num('tabStripWidth', sr('tabStripWidth'), { min: 80 }),
            pick('tabStripPosition', sr('tabStripPosition'), TAB_STRIP_POSITION),
            pick('allSheetsListVisible', sr('allSheetsListVisible'), ALL_SHEETS_LIST),
          ],
        }],
        right: [{ fields: [check('tabEditable', sr('tabEditable'))] }],
      },
      {
        groups: [{
          title: sr('styles'),
          fields: [action('defaultSheetTabStyles', sr('defaultSheetTabStyles'), sr('manageStyle'))],
        }],
      },
    ],
  },
  {
    key: 'clipboard',
    text: sr('clipboard'),
    layout: { column: 350 },
    rows: [
      {
        groups: [{
          title: sr('settings'),
          fields: [
            check('allowCopyPasteExcelStyle', sr('allowCopyPasteExcelStyle')),
            check('pasteSkipInvisibleRange', sr('pasteSkipInvisibleRange')),
          ],
        }],
        right: [{ fields: [check('allowExtendPasteRange', sr('allowExtendPasteRange'))] }],
      },
      {
        groups: [{ fields: [{ key: 'copyPasteHeaderOptions', kind: 'radio', label: sr('headerOptions'), options: COPY_PASTE_HEADERS, columns: 2 }] }],
      },
    ],
  },
  { key: 'customList', text: sr('customLists'), rows: [] },
  { key: 'namedPattern', text: sr('namedPatterns'), rows: [] },
];

/** Sheet Settings tabs, in the trial's order. */
export const sheetSettingTabs: SettingTab[] = [
  {
    key: 'general',
    text: sr('general'),
    layout: { column: 290, label: 180, editor: 72, row: 26 },
    rows: [
      {
        groups: [{
          fields: [
            num('colCount', sr('colCount'), { min: 0 }),
            num('rowCount', sr('rowCount'), { min: 0 }),
            num('frozenColumnCount', sr('frozenColumnCount'), { min: 0 }),
            num('frozenLeftColumn', sr('frozenLeftColumn'), { min: 0, indent: true }),
            num('frozenRowCount', sr('frozenRowCount'), { min: 0 }),
            num('frozenTopRow', sr('frozenTopRow'), { min: 0, indent: true }),
            num('frozenTrailingColumnCount', sr('frozenTrailingColumnCount'), { min: 0, max: 100 }),
            { key: 'frozenTrailingColumnStickToEdge', kind: 'checkbox', label: sr('stickToEdge'), indent: true },
            num('frozenTrailingRowCount', sr('frozenTrailingRowCount'), { min: 0, max: 100 }),
            { key: 'frozenTrailingRowStickToEdge', kind: 'checkbox', label: sr('stickToEdge'), indent: true },
          ],
        }],
        right: [
          { title: sr('selectionPolicy'), bordered: true, fields: [{ key: 'selectionPolicy', kind: 'radio', label: '', options: SELECTION_POLICY, columns: 1 }] },
          {
            fields: [
              check('allowCellOverflow', sr('allowCellOverflow')),
              check('showZeros', sr('showZeros')),
              check('addColumnButtonVisible', sr('addColumnButtonVisible')),
              check('addRowButtonVisible', sr('addRowButtonVisible')),
              check('rightToLeft', sr('rightToLeft')),
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'gridlines',
    text: sr('gridLines'),
    layout: { column: 300, label: 100, editor: 150, row: 34 },
    rows: [{
      groups: [{ fields: [check('showHorizontalGridline', sr('showHorizontalGridline')), check('showVerticalGridline', sr('showVerticalGridline'))] }],
      right: [{ fields: [{ key: 'gridlineColor', kind: 'color', label: sr('gridlineColor') }] }],
    }],
  },
  {
    key: 'headers',
    text: sr('headers'),
    layout: { column: 710, label: 180, editor: 72, row: 26 },
    rows: [],
    subTabs: [
      {
        key: 'columnHeaders',
        text: sr('columnHeaders'),
        rows: [{
          groups: [{
            fields: [
              num('colHeaderRowCount', sr('colHeaderRowCount'), { min: 0, max: 100 }),
              { key: 'colHeaderAutoText', kind: 'radio', label: sr('columnHeaderAutoText'), options: HEADER_AUTO_TEXT, inline: true, width: 250 },
              num('colHeaderAutoTextIndex', sr('colHeaderAutoTextIndex'), { min: -1, max: 100 }),
              num('colHeaderDefRowHeight', sr('colHeaderDefRowHeight'), { min: 0, max: 100 }),
              check('colHeaderVisible', sr('colHeaderVisible')),
            ],
          }],
        }],
      },
      {
        key: 'rowHeaders',
        text: sr('rowHeaders'),
        rows: [{
          groups: [{
            fields: [
              num('rowHeaderColCount', sr('rowHeaderColCount'), { min: 0, max: 100 }),
              { key: 'rowHeaderAutoText', kind: 'radio', label: sr('rowHeaderAutoText'), options: HEADER_AUTO_TEXT, inline: true, width: 250 },
              num('rowHeaderAutoTextIndex', sr('rowHeaderAutoTextIndex'), { min: -1, max: 100 }),
              num('rowHeaderDefColWidth', sr('rowHeaderDefColWidth'), { min: 0, max: 100 }),
              check('rowHeaderVisible', sr('rowHeaderVisible')),
            ],
          }],
        }],
      },
    ],
  },
  {
    key: 'sheetTab',
    text: sr('sheetTab'),
    layout: { column: 710, label: 180, editor: 110, row: 34 },
    rows: [{
      groups: [{
        fields: [
          { key: 'sheetTabColor', kind: 'color', label: sr('sheetTabColor') },
          action('sheetTabStateStyles', sr('sheetTabStateStyles'), sr('manageStyle')),
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
