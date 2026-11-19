/**
 * Ribbon definitions for the PivotTable UI (TASK 47 item 3): the Insert >
 * PivotTable command plus the contextual "PivotTable Analyze" and "Design"
 * tabs with the trial's groups, captions, order and icon classes. Consumed by
 * `config.ts` (ribbon tree) and `commands/index.ts` (command map).
 *
 * The command ids, group labels and `iconClass`/`thumbnailClass` strings are
 * read from the reference product's public `DefaultConfig` / `getCommand()`
 * API (users customize the designer through these names); every icon is drawn
 * by our own code.
 */
import type { ICommand, IButtonGroup, ICommandGroup, IRibbonPanel } from './types.js';

type Spec = Omit<ICommand, 'commandName'>;

/* Builder shorthand mirroring config.ts (kept local: config imports this file). */
const dir = (direction: string, children: (ICommandGroup | string)[], className?: string): ICommandGroup => ({ direction, children, ...(className ? { className } : {}) });
const dropdown = (command: string, children: (ICommandGroup | string)[], extra: Partial<ICommandGroup> = {}): ICommandGroup => ({ command, type: 'dropdown', children, ...extra });
const g = (label: string, thumbnailClass: string, commandGroup: ICommandGroup, extra: Partial<IButtonGroup> = {}): IButtonGroup => ({
  label, thumbnailClass, thumbnailGroupId: thumbnailClass, commandGroup, ...extra,
});

/** Command specs merged into the designer's default command map. */
export const pivotCommandSpecs: Record<string, Spec> = {
  /* Insert tab ------------------------------------------------------------ */
  insertPivotTable: { text: 'PivotTable', title: 'Insert PivotTable', type: 'dropdown', iconClass: 'ribbon-button-insert-pivot-table', bigButton: true, dropdownMaxWidth: 190 },
  insertPivotTableFromDataTable: { text: 'From Data Table', title: 'Insert PivotTable From Data Table', type: 'dropdown', dropdownArrow: true, iconClass: 'ribbon-button-pivot-table-from-data-table' },

  /* PivotTable Analyze tab -------------------------------------------------- */
  pivotTableNameLabel: { text: 'PivotTable Name', title: 'PivotTable Name', type: 'label', maxWidth: 99 },
  pivotTableName: { title: 'PivotTable Name', type: 'comboBox', comboWidth: 110 },
  pivotTableOptions: { text: 'Options', title: 'PivotTable Options', iconClass: 'ribbon-button-pivot-table-analyze-options', type: 'button' },
  pivotTableOptionsSub: { text: 'PivotTable Options...', title: 'PivotTable Options' },
  pivotTableShowReportFilterPages: { text: 'Show Report Filter Pages...', title: 'Show Report Filter Pages' },
  pivotTableActiveFieldLabel: { text: 'Active Field', title: 'Active Field', type: 'label', maxWidth: 105 },
  pivotTableActiveField: { title: 'Active Field', type: 'comboBox', comboWidth: 108 },
  pivotTableFieldSetting: { text: 'Field Setting', title: 'Field Settings', iconClass: 'ribbon-button-pivot-table-field-setting', type: 'button' },
  pivotTableExpandField: { text: 'Expand Field', title: 'Expand Field', iconClass: 'ribbon-button-pivot-table-expand-field' },
  pivotTableCollapseField: { text: 'Collapse Field', title: 'Collapse Field', iconClass: 'ribbon-button-pivot-table-collapse-field' },
  pivotFilterConnections: { text: 'Filter Connections', title: 'Filter Connections', iconClass: 'ribbon-button-pivot-table-filter-connections', bigButton: true, maxWidth: 70 },
  pivotTableGroupSelection: { text: 'Group Selection', title: 'Group Selection', iconClass: 'ribbon-button-pivot-table-group-selection' },
  pivotTableUnGroup: { text: 'Ungroup', title: 'Ungroup', iconClass: 'ribbon-button-pivot-table-ungroup' },
  pivotTableGroupField: { text: 'Group Field', title: 'Group Field', iconClass: 'ribbon-button-pivot-table-group-field' },
  pivotRibbonRefresh: { text: 'Refresh', title: 'Refresh', iconClass: 'ribbon-button-pivot-table-refresh', bigButton: true, maxWidth: 55 },
  pivotTableChangeDataSource: { text: 'Change Data Source', title: 'Change Data Source', iconClass: 'ribbon-button-pivot-table-changeDataSource', bigButton: true, maxWidth: 70 },
  pivotTableClearList: { text: 'Clear', title: 'Clear', type: 'dropdown', iconClass: 'ribbon-button-pivot-table-clear', bigButton: true, dropdownMaxWidth: 170, maxWidth: 56 },
  pivotTableClearAll: { text: 'Clear All', title: 'Clear All', iconClass: 'ribbon-button-pivot-table-clear-all' },
  pivotTableClearFilters: { text: 'Clear Filters', title: 'Clear Filters' },
  pivotTableMove: { text: 'Move PivotTable', title: 'Move PivotTable', iconClass: 'ribbon-button-pivot-table-move', bigButton: true, maxWidth: 70 },
  pivotTableFieldsItemsSets: { text: 'Fields,Items, & Sets', title: 'Fields, Items, & Sets', type: 'dropdown', iconClass: 'ribbon-button-pivot-table-fields-items-sets', bigButton: true, dropdownMaxWidth: 200 },
  pivotTableCalculatedField: { text: 'Calculated Field...', title: 'Calculated Field' },
  PivotTableCalculatedItem: { text: 'Calculated Item...', title: 'Calculated Item' },
  PivotTableSolveOrder: { text: 'Solve Order...', title: 'Solve Order' },
  pivotTableListFormulas: { text: 'List Formulas', title: 'List Formulas', iconClass: 'ribbon-button-pivot-table-analyze-options' },
  pivotTableFieldList: { text: 'Field List', title: 'Field List', type: 'checkbox', iconClass: 'ribbon-button-pivot-table-field-list', bigButton: true, maxWidth: 62 },
  pivotTableButtons: { text: '+/- Buttons', title: '+/- Buttons', type: 'checkbox', iconClass: 'ribbon-button-pivot-table-drill-button', bigButton: true },
  pivotTableShowHeaders: { text: 'Field Headers', title: 'Field Headers', type: 'checkbox', iconClass: 'ribbon-button-pivot-table-field-headers', bigButton: true, maxWidth: 76 },

  /* Design tab -------------------------------------------------------------- */
  pivotTableSubtotals: { text: 'Subtotals', title: 'Subtotals', type: 'dropdown', iconClass: 'ribbon-button-pivot-table-subtotal', bigButton: true, dropdownMaxWidth: 300, maxWidth: 62 },
  pivotTableSubtotalsNotShow: { text: 'Do Not Show Subtotals', title: 'Do Not Show Subtotals', iconClass: 'ribbon-button-pivot-table-not-subtotal' },
  pivotTableSubtotalsAtBottom: { text: 'Show all Subtotals at Bottom of Group', title: 'Show all Subtotals at Bottom of Group', iconClass: 'ribbon-button-pivot-table-subtotal-bottom' },
  pivotTableSubtotalsAtTop: { text: 'Show all Subtotals at Top of Group', title: 'Show all Subtotals at Top of Group', iconClass: 'ribbon-button-pivot-table-subtotal-top' },
  pivotTableGrandTotals: { text: 'Grand Totals', title: 'Grand Totals', type: 'dropdown', iconClass: 'ribbon-button-pivot-table-grand-total', bigButton: true, dropdownMaxWidth: 240, maxWidth: 62 },
  pivotTableGrandTotalsOffRowColumn: { text: 'Off for Rows and Columns', title: 'Off for Rows and Columns', iconClass: 'ribbon-button-pivot-table-off-row-col' },
  pivotTableGrandTotalsOnRowColumn: { text: 'On for Rows and Columns', title: 'On for Rows and Columns', iconClass: 'ribbon-button-pivot-table-on-row-col' },
  pivotTableGrandTotalsOnRowOnly: { text: 'On for Rows Only', title: 'On for Rows Only', iconClass: 'ribbon-button-pivot-table-on-row' },
  pivotTableGrandTotalsOnColumnOnly: { text: 'On for Columns Only', title: 'On for Columns Only', iconClass: 'ribbon-button-pivot-table-on-col' },
  pivotTableReportLayout: { text: 'Report Layout', title: 'Report Layout', type: 'dropdown', iconClass: 'ribbon-button-pivot-table-report-layout', bigButton: true, dropdownMaxWidth: 240, maxWidth: 62 },
  pivotTableReportLayoutShowInCompact: { text: 'Show in Compact Form', title: 'Show in Compact Form', iconClass: 'ribbon-button-pivot-table-show-compact' },
  pivotTableReportLayoutShowInOutline: { text: 'Show in Outline Form', title: 'Show in Outline Form', iconClass: 'ribbon-button-pivot-table-show-outline' },
  pivotTableReportLayoutShowInTabular: { text: 'Show in Tabular Form', title: 'Show in Tabular Form', iconClass: 'ribbon-button-pivot-table-show-tabular' },
  pivotTableReportLayoutRepeatAllItemLabels: { text: 'Repeat All Item Labels', title: 'Repeat All Item Labels', iconClass: 'ribbon-button-pivot-table-repeat-all' },
  pivotTableReportLayoutNotRepeatAllItemLabels: { text: 'Do Not Repeat Item Labels', title: 'Do Not Repeat Item Labels', iconClass: 'ribbon-button-pivot-table-not-repeat' },
  pivotTableBlankRows: { text: 'Blank Rows', title: 'Blank Rows', type: 'dropdown', iconClass: 'ribbon-button-pivot-table-blank-rows', bigButton: true, dropdownMaxWidth: 280, maxWidth: 62 },
  pivotTableInsertBlankRows: { text: 'Insert Blank Line after Each Item', title: 'Insert Blank Line after Each Item', iconClass: 'ribbon-button-pivot-table-insert-blank-rows' },
  pivotTableRemoveBlankRows: { text: 'Remove Blank Line after Each Item', title: 'Remove Blank Line after Each Item', iconClass: 'ribbon-button-pivot-table-remove-blank-rows' },
  pivotTableRowHeaders: { text: 'Row Headers', title: 'Row Headers', type: 'checkbox' },
  pivotTableColumnHeaders: { text: 'Column Headers', title: 'Column Headers', type: 'checkbox' },
  pivotTableBandedRows: { text: 'Banded Rows', title: 'Banded Rows', type: 'checkbox' },
  pivotTableBandedColumns: { text: 'Banded Columns', title: 'Banded Columns', type: 'checkbox' },
  pivotTableStyle: { text: 'PivotTable Styles', title: 'PivotTable Styles', type: 'dropdown', iconClass: 'ribbon-button-formattable', bigButton: true, dropdownMaxWidth: 510 },
  newPivotTableStyle: { text: 'New Pivot Table Style...', title: 'New Pivot Table Style', iconClass: 'ribbon-button-new-pivot-table-style' },
  clearPivotTableStyle: { text: 'Clear', title: 'Clear', iconClass: 'ribbon-button-clear-pivot-table-style' },
};

/* PivotTable Analyze tab: the trial's groups, order and nesting. */
const pivotAnalyzeGroups: IButtonGroup[] = [
  g('PivotTable', 'ribbon-thumbnail-pivot-table', {
    children: [dir('vertical', [
      { commands: ['pivotTableNameLabel'] },
      { commands: ['pivotTableName'] },
      dir('horizontal', [{ commands: ['pivotTableOptions'] }, dropdown('pivotTableOptionsList', ['pivotTableOptionsSub', 'pivotTableShowReportFilterPages'])]),
    ], 'no-padding-top')],
  }),
  g('Active Field', 'ribbon-thumbnail-pivot-table-active-field', {
    children: [
      dir('vertical', [{ commands: ['pivotTableActiveFieldLabel'] }, { commands: ['pivotTableActiveField'] }, { commands: ['pivotTableFieldSetting'] }], 'no-padding-top'),
      dir('vertical', [{ commands: ['pivotTableExpandField'] }, { commands: ['pivotTableCollapseField'] }], 'no-padding-top'),
    ],
  }),
  g('Filter', 'ribbon-thumbnail-pivot-table-group', { children: [{ children: [{ commands: ['pivotFilterConnections'] }] }] }),
  g('Group', 'ribbon-thumbnail-pivot-table-group', {
    children: [{ direction: 'vertical', children: [{ commands: ['pivotTableGroupSelection'] }, { commands: ['pivotTableUnGroup'] }, { commands: ['pivotTableGroupField'] }] }],
  }),
  g('Data', 'ribbon-thumbnail-pivot-table-data', { children: [{ children: ['pivotRibbonRefresh', 'pivotTableChangeDataSource'] }] }),
  g('Actions', 'ribbon-thumbnail-pivot-table-actions', {
    children: [{ children: [dropdown('pivotTableClearList', ['pivotTableClearAll', 'pivotTableClearFilters']), 'pivotTableMove'] }],
  }),
  g('Calculations', 'ribbon-thumbnail-pivot-table-calculations', {
    children: [{ children: [dropdown('pivotTableFieldsItemsSets', ['pivotTableCalculatedField', 'PivotTableCalculatedItem', 'PivotTableSolveOrder', 'pivotTableListFormulas'])] }],
  }),
  g('Show', 'ribbon-thumbnail-pivot-table-show', {
    children: [{ commands: ['pivotTableFieldList', 'pivotTableButtons', 'pivotTableShowHeaders'] }],
  }),
];

/* Design tab (trial nesting: paired dropdown columns separated in the middle). */
const pivotDesignGroups: IButtonGroup[] = [
  g('Layout', 'ribbon-thumbnail-pivot-table-layout', {
    children: [{
      children: [
        dropdown('pivotTableSubtotals', ['pivotTableSubtotalsNotShow', 'pivotTableSubtotalsAtBottom', 'pivotTableSubtotalsAtTop']),
        dropdown('pivotTableGrandTotals', ['pivotTableGrandTotalsOffRowColumn', 'pivotTableGrandTotalsOnRowColumn', 'pivotTableGrandTotalsOnRowOnly', 'pivotTableGrandTotalsOnColumnOnly']),
      ],
    }, { type: 'separator' }, {
      children: [
        dropdown('pivotTableReportLayout', ['pivotTableReportLayoutShowInCompact', 'pivotTableReportLayoutShowInOutline', 'pivotTableReportLayoutShowInTabular', { type: 'separator' }, 'pivotTableReportLayoutRepeatAllItemLabels', 'pivotTableReportLayoutNotRepeatAllItemLabels']),
        dropdown('pivotTableBlankRows', ['pivotTableInsertBlankRows', 'pivotTableRemoveBlankRows']),
      ],
    }],
  }),
  g('PivotTable Style Options', 'ribbon-thumbnail-pivot-table-options', {
    children: [
      { direction: 'vertical', commands: ['pivotTableRowHeaders', 'pivotTableColumnHeaders'] },
      { direction: 'vertical', commands: ['pivotTableBandedRows', 'pivotTableBandedColumns'] },
    ],
  }),
  g('PivotTable Styles', 'ribbon-thumbnail-pivot-table-styles', {
    children: [dropdown('pivotTableStyle', ['pivotTableStyleListContent', { type: 'separator' }, 'newPivotTableStyle', 'clearPivotTableStyle'], { dropdownMaxWidth: 510 })],
  }),
];

/** The two contextual tabs (shown while the active cell is inside a pivot). */
export const pivotContextualTabs: IRibbonPanel[] = [
  { id: 'pivotTableAnalyze', text: 'PivotTable Analyze', buttonGroups: pivotAnalyzeGroups, contextual: true },
  { id: 'pivotTableDesign', text: 'Design', buttonGroups: pivotDesignGroups, contextual: true },
];
