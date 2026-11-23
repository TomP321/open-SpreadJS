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
const rc = (key: string): string => `\${res.ribbon.commands.${key}}`;

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
  insertPivotTable: { text: rc('insertPivotTableText'), title: rc('insertPivotTable'), type: 'dropdown', iconClass: 'ribbon-button-insert-pivot-table', bigButton: true, dropdownMaxWidth: 190 },
  insertPivotTableFromDataTable: { text: rc('insertPivotTableFromDataTableText'), title: rc('insertPivotTableFromDataTable'), type: 'dropdown', dropdownArrow: true, iconClass: 'ribbon-button-pivot-table-from-data-table' },

  /* PivotTable Analyze tab -------------------------------------------------- */
  pivotTableNameLabel: { text: rc('pivotTableNameLabel'), title: rc('pivotTableNameLabel'), type: 'label', maxWidth: 99 },
  pivotTableName: { title: rc('pivotTableName'), type: 'comboBox', comboWidth: 110 },
  pivotTableOptions: { text: rc('pivotTableOptionsText'), title: rc('pivotTableOptions'), iconClass: 'ribbon-button-pivot-table-analyze-options', type: 'button' },
  pivotTableOptionsSub: { text: rc('pivotTableOptionsSubText'), title: rc('pivotTableOptionsSub') },
  pivotTableShowReportFilterPages: { text: rc('pivotTableShowReportFilterPagesText'), title: rc('pivotTableShowReportFilterPages') },
  pivotTableActiveFieldLabel: { text: rc('pivotTableActiveFieldLabel'), title: rc('pivotTableActiveFieldLabel'), type: 'label', maxWidth: 105 },
  pivotTableActiveField: { title: rc('pivotTableActiveField'), type: 'comboBox', comboWidth: 108 },
  pivotTableFieldSetting: { text: rc('pivotTableFieldSettingText'), title: rc('pivotTableFieldSetting'), iconClass: 'ribbon-button-pivot-table-field-setting', type: 'button' },
  pivotTableExpandField: { text: rc('pivotTableExpandField'), title: rc('pivotTableExpandField'), iconClass: 'ribbon-button-pivot-table-expand-field' },
  pivotTableCollapseField: { text: rc('pivotTableCollapseField'), title: rc('pivotTableCollapseField'), iconClass: 'ribbon-button-pivot-table-collapse-field' },
  pivotFilterConnections: { text: rc('pivotFilterConnections'), title: rc('pivotFilterConnections'), iconClass: 'ribbon-button-pivot-table-filter-connections', bigButton: true, maxWidth: 70 },
  pivotTableGroupSelection: { text: rc('pivotTableGroupSelection'), title: rc('pivotTableGroupSelection'), iconClass: 'ribbon-button-pivot-table-group-selection' },
  pivotTableUnGroup: { text: rc('pivotTableUnGroup'), title: rc('pivotTableUnGroup'), iconClass: 'ribbon-button-pivot-table-ungroup' },
  pivotTableGroupField: { text: rc('pivotTableGroupField'), title: rc('pivotTableGroupField'), iconClass: 'ribbon-button-pivot-table-group-field' },
  pivotRibbonRefresh: { text: rc('pivotRibbonRefresh'), title: rc('pivotRibbonRefresh'), iconClass: 'ribbon-button-pivot-table-refresh', bigButton: true, maxWidth: 55 },
  pivotTableChangeDataSource: { text: rc('pivotTableChangeDataSource'), title: rc('pivotTableChangeDataSource'), iconClass: 'ribbon-button-pivot-table-changeDataSource', bigButton: true, maxWidth: 70 },
  pivotTableClearList: { text: rc('pivotTableClearList'), title: rc('pivotTableClearList'), type: 'dropdown', iconClass: 'ribbon-button-pivot-table-clear', bigButton: true, dropdownMaxWidth: 170, maxWidth: 56 },
  pivotTableClearAll: { text: rc('pivotTableClearAll'), title: rc('pivotTableClearAll'), iconClass: 'ribbon-button-pivot-table-clear-all' },
  pivotTableClearFilters: { text: rc('pivotTableClearFilters'), title: rc('pivotTableClearFilters') },
  pivotTableMove: { text: rc('pivotTableMove'), title: rc('pivotTableMove'), iconClass: 'ribbon-button-pivot-table-move', bigButton: true, maxWidth: 70 },
  pivotTableFieldsItemsSets: { text: rc('pivotTableFieldsItemsSetsText'), title: rc('pivotTableFieldsItemsSets'), type: 'dropdown', iconClass: 'ribbon-button-pivot-table-fields-items-sets', bigButton: true, dropdownMaxWidth: 200 },
  pivotTableCalculatedField: { text: rc('pivotTableCalculatedFieldText'), title: rc('pivotTableCalculatedField') },
  PivotTableCalculatedItem: { text: rc('PivotTableCalculatedItemText'), title: rc('PivotTableCalculatedItem') },
  PivotTableSolveOrder: { text: rc('PivotTableSolveOrderText'), title: rc('PivotTableSolveOrder') },
  pivotTableListFormulas: { text: rc('pivotTableListFormulas'), title: rc('pivotTableListFormulas'), iconClass: 'ribbon-button-pivot-table-analyze-options' },
  pivotTableFieldList: { text: rc('pivotTableFieldList'), title: rc('pivotTableFieldList'), type: 'checkbox', iconClass: 'ribbon-button-pivot-table-field-list', bigButton: true, maxWidth: 62 },
  pivotTableButtons: { text: rc('pivotTableButtons'), title: rc('pivotTableButtons'), type: 'checkbox', iconClass: 'ribbon-button-pivot-table-drill-button', bigButton: true },
  pivotTableShowHeaders: { text: rc('pivotTableShowHeaders'), title: rc('pivotTableShowHeaders'), type: 'checkbox', iconClass: 'ribbon-button-pivot-table-field-headers', bigButton: true, maxWidth: 76 },

  /* Design tab -------------------------------------------------------------- */
  pivotTableSubtotals: { text: rc('pivotTableSubtotals'), title: rc('pivotTableSubtotals'), type: 'dropdown', iconClass: 'ribbon-button-pivot-table-subtotal', bigButton: true, dropdownMaxWidth: 300, maxWidth: 62 },
  pivotTableSubtotalsNotShow: { text: rc('pivotTableSubtotalsNotShow'), title: rc('pivotTableSubtotalsNotShow'), iconClass: 'ribbon-button-pivot-table-not-subtotal' },
  pivotTableSubtotalsAtBottom: { text: rc('pivotTableSubtotalsAtBottom'), title: rc('pivotTableSubtotalsAtBottom'), iconClass: 'ribbon-button-pivot-table-subtotal-bottom' },
  pivotTableSubtotalsAtTop: { text: rc('pivotTableSubtotalsAtTop'), title: rc('pivotTableSubtotalsAtTop'), iconClass: 'ribbon-button-pivot-table-subtotal-top' },
  pivotTableGrandTotals: { text: rc('pivotTableGrandTotals'), title: rc('pivotTableGrandTotals'), type: 'dropdown', iconClass: 'ribbon-button-pivot-table-grand-total', bigButton: true, dropdownMaxWidth: 240, maxWidth: 62 },
  pivotTableGrandTotalsOffRowColumn: { text: rc('pivotTableGrandTotalsOffRowColumn'), title: rc('pivotTableGrandTotalsOffRowColumn'), iconClass: 'ribbon-button-pivot-table-off-row-col' },
  pivotTableGrandTotalsOnRowColumn: { text: rc('pivotTableGrandTotalsOnRowColumn'), title: rc('pivotTableGrandTotalsOnRowColumn'), iconClass: 'ribbon-button-pivot-table-on-row-col' },
  pivotTableGrandTotalsOnRowOnly: { text: rc('pivotTableGrandTotalsOnRowOnly'), title: rc('pivotTableGrandTotalsOnRowOnly'), iconClass: 'ribbon-button-pivot-table-on-row' },
  pivotTableGrandTotalsOnColumnOnly: { text: rc('pivotTableGrandTotalsOnColumnOnly'), title: rc('pivotTableGrandTotalsOnColumnOnly'), iconClass: 'ribbon-button-pivot-table-on-col' },
  pivotTableReportLayout: { text: rc('pivotTableReportLayout'), title: rc('pivotTableReportLayout'), type: 'dropdown', iconClass: 'ribbon-button-pivot-table-report-layout', bigButton: true, dropdownMaxWidth: 240, maxWidth: 62 },
  pivotTableReportLayoutShowInCompact: { text: rc('pivotTableReportLayoutShowInCompact'), title: rc('pivotTableReportLayoutShowInCompact'), iconClass: 'ribbon-button-pivot-table-show-compact' },
  pivotTableReportLayoutShowInOutline: { text: rc('pivotTableReportLayoutShowInOutline'), title: rc('pivotTableReportLayoutShowInOutline'), iconClass: 'ribbon-button-pivot-table-show-outline' },
  pivotTableReportLayoutShowInTabular: { text: rc('pivotTableReportLayoutShowInTabular'), title: rc('pivotTableReportLayoutShowInTabular'), iconClass: 'ribbon-button-pivot-table-show-tabular' },
  pivotTableReportLayoutRepeatAllItemLabels: { text: rc('pivotTableReportLayoutRepeatAllItemLabels'), title: rc('pivotTableReportLayoutRepeatAllItemLabels'), iconClass: 'ribbon-button-pivot-table-repeat-all' },
  pivotTableReportLayoutNotRepeatAllItemLabels: { text: rc('pivotTableReportLayoutNotRepeatAllItemLabels'), title: rc('pivotTableReportLayoutNotRepeatAllItemLabels'), iconClass: 'ribbon-button-pivot-table-not-repeat' },
  pivotTableBlankRows: { text: rc('pivotTableBlankRows'), title: rc('pivotTableBlankRows'), type: 'dropdown', iconClass: 'ribbon-button-pivot-table-blank-rows', bigButton: true, dropdownMaxWidth: 280, maxWidth: 62 },
  pivotTableInsertBlankRows: { text: rc('pivotTableInsertBlankRows'), title: rc('pivotTableInsertBlankRows'), iconClass: 'ribbon-button-pivot-table-insert-blank-rows' },
  pivotTableRemoveBlankRows: { text: rc('pivotTableRemoveBlankRows'), title: rc('pivotTableRemoveBlankRows'), iconClass: 'ribbon-button-pivot-table-remove-blank-rows' },
  pivotTableRowHeaders: { text: rc('pivotTableRowHeaders'), title: rc('pivotTableRowHeaders'), type: 'checkbox' },
  pivotTableColumnHeaders: { text: rc('pivotTableColumnHeaders'), title: rc('pivotTableColumnHeaders'), type: 'checkbox' },
  pivotTableBandedRows: { text: rc('pivotTableBandedRows'), title: rc('pivotTableBandedRows'), type: 'checkbox' },
  pivotTableBandedColumns: { text: rc('pivotTableBandedColumns'), title: rc('pivotTableBandedColumns'), type: 'checkbox' },
  pivotTableStyle: { text: rc('pivotTableStyle'), title: rc('pivotTableStyle'), type: 'dropdown', iconClass: 'ribbon-button-formattable', bigButton: true, dropdownMaxWidth: 510 },
  newPivotTableStyle: { text: rc('newPivotTableStyleText'), title: rc('newPivotTableStyle'), iconClass: 'ribbon-button-new-pivot-table-style' },
  clearPivotTableStyle: { text: rc('clearPivotTableStyle'), title: rc('clearPivotTableStyle'), iconClass: 'ribbon-button-clear-pivot-table-style' },
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
