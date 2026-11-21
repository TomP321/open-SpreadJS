/**
 * Ribbon definitions for the selection-driven contextual tabs (TASK 74):
 * "Table Design", "Chart Design", "Sparkline" (cell sparklines) and
 * "Sparkline" (formula sparklines), plus the re-grouped "Shape Format" tab.
 *
 * The tab ids, group captions, group order, command nesting, command ids and
 * control types were read from the reference product's public contract —
 * `DefaultConfig.ribbon` (ids/nesting), `Designer.getCommand()` (command types,
 * icon class names) and the visible labels transcribed from the running trial
 * (`res.ribbon.<tab>.<key>`, `Designer.getResources()`); every icon here is our
 * own vector artwork authored in `icons.tsx`.
 *
 * Consumed by `config.ts` (ribbon tree), `commands/index.ts` (command map) and
 * `contextual-actions.ts` (behaviour, enablement, checked/value state).
 */
import type { ICommand, IButtonGroup, ICommandGroup, IRibbonPanel } from './types.js';

type Spec = Omit<ICommand, 'commandName'>;

/* Builder shorthand mirroring config.ts / pivot-ribbon.ts. */
const dir = (direction: string, children: (ICommandGroup | string)[], className?: string): ICommandGroup => ({ direction, children, ...(className ? { className } : {}) });
const dropdown = (command: string, children: (ICommandGroup | string)[], extra: Partial<ICommandGroup> = {}): ICommandGroup => ({ command, type: 'dropdown', children, ...extra });
const sep = (): ICommandGroup => ({ type: 'separator' });
const g = (label: string, thumbnailClass: string, commandGroup: ICommandGroup, extra: Partial<IButtonGroup> = {}): IButtonGroup => ({
  label, thumbnailClass, thumbnailGroupId: thumbnailClass, commandGroup, ...extra,
});

const r = (path: string): string => `\${res.${path}}`;
const c = (command: string): string => command;

/* ----------------------------------------------------------- Table Design --- */

/**
 * Properties: the trial stacks a caption above the table-name field (`tableName`
 * is a `text` control there). Our ribbon renders captions as their own label
 * command plus an editable combo, exactly like the PivotTable Name pair (TASK 47).
 */
export const tableDesignGroups: IButtonGroup[] = [
  g('Properties', 'ribbon-thumbnail-properties', {
    children: [dir('vertical', [
      { commands: ['tableNameLabel'] },
      { commands: ['tableName'] },
      { commands: ['resizeTable'] },
    ], 'no-padding-top')],
  }, { class: 'rb-table-properties' }),
  g('Tools', 'ribbon-thumbnail-tools', {
    children: [dir('vertical', [{ commands: ['convertToRange'] }, { commands: ['tableAllowAutoExpand'] }], 'no-padding-top')],
  }, { class: 'rb-table-tools' }),
  g('Table Style Options', 'ribbon-thumbnail-tablestyleoptions', {
    children: [
      dir('vertical', [{ commands: ['tableStyleHeaderRow'] }, { commands: ['tableStyleTotalRow'] }, { commands: ['tableStyleBandedRows'] }], 'no-padding-top'),
      dir('vertical', [{ commands: ['tableStyleFirstColumn'] }, { commands: ['tableStyleLastColumn'] }, { commands: ['tableStyleBandedColumns'] }], 'no-padding-top'),
      dir('vertical', [{ commands: ['tableStyleResizeHandler'] }, { commands: ['tableStyleFilterButton'] }, { commands: ['tableStyleTotalRowList'] }], 'no-padding-top'),
    ],
  }, { class: 'rb-table-style-options' }),
  g('Table Styles', 'ribbon-thumbnail-tablestyles', {
    children: [dropdown('formatTable2', [c('formatTableListContent'), sep(), c('newTableStyle'), c('clearTableStyle')], { dropdownMaxWidth: 510 })],
  }, { class: 'rb-table-styles' }),
  g('Table Binding', 'ribbon-thumbnail-table-binding', {
    children: [dir('vertical', [
      { commands: ['tableBindingSourceLabel'] },
      { commands: ['tableBindingSource'] },
      { commands: ['ConvertToDataTable'] },
      { commands: ['ConvertFromDataTable'] },
    ], 'no-padding-top')],
  }, { class: 'rb-table-binding' }),
];

/* ----------------------------------------------------------- Chart Design --- */

/** "Add Chart Element": the trial nests one flyout per chart element (TASK 74). */
export const chartDesignGroups: IButtonGroup[] = [
  g('Chart Layouts', 'ribbon-thumbnail-chartlayouts', {
    children: [dir('horizontal', [
      dropdown('addChartElement', [
        dropdown('axes', ['axesPrimaryHorizontal', 'axesPrimaryVertical', 'axesSecondaryHorizontal', 'axesSecondaryVertical', sep(), 'axesMoreAxisOption']),
        dropdown('axisTitles', ['axisTitlesPrimaryHorizontal', 'axisTitlesPrimaryVertical', 'axisTitlesSecondaryHorizontal', 'axisTitlesSecondaryVertical', sep(), 'axisTitlesMoreAxisTitlesOption']),
        dropdown('chartTitle', ['chartTitleNone', 'chartTitleAboveChart', sep(), 'chartTitleMoreChartTitleOption']),
        /* Row order measured on the trial (`.probe/t74/flyout14-official.json`,
         * DOM walk top-to-bottom): Axes, Axis Titles, Chart Title, GridLines,
         * Data Labels, Legend, Error Bars, Trendline. */
        dropdown('gridLines', ['gridLinesPrimaryMajorHorizontal', 'gridLinesPrimaryMajorVertical', 'gridLinesPrimaryMinorHorizontal', 'gridLinesPrimaryMinorVertical', 'gridLinesSecondaryMajorHorizontal', 'gridLinesSecondaryMajorVertical', 'gridLinesSecondaryMinorHorizontal', 'gridLinesSecondaryMinorVertical', sep(), 'gridLinesMoreGridLinesOption']),
        dropdown('dataLabels', ['dataLabelsNone', 'dataLabelsCenter', 'dataLabelsInsideBase', 'dataLabelsInsideEnd', 'dataLabelsOutsideEnd', sep(), 'dataLabelShow', sep(), 'dataLabelsMoreDataLabelsOption']),
        dropdown('legend', ['legendNone', 'legendRight', 'legendTop', 'legendLeft', 'legendBottom', sep(), 'legendMoreLegendOption']),
        dropdown('errorBars', ['errorBarNone', 'errorBarStandardError', 'errorBarPercentage', 'errorBarStandardDeviation', sep(), 'errorBarMoreOption']),
        dropdown('trendline', ['trendlineNone', 'trendlineLinear', 'trendlineExponential', 'trendlineLinearForecast', 'trendlineMovingAverage', sep(), 'trendlineMoreOption']),
      ]),
      dropdown('quickLayout', ['quickLayoutListContent'], { dropdownMaxWidth: 190 }),
    ])],
  }, { class: 'rb-chart-layouts' }),
  g('Chart Styles', 'ribbon-thumbnail-chartstyles', { commands: ['changeColors', 'chartStyle'] }, { class: 'rb-chart-styles' }),
  g('Data', 'ribbon-thumbnail-chartdata', { commands: ['switchRowColumn', 'selectData'] }, { class: 'rb-chart-data' }),
  g('Type', 'ribbon-thumbnail-charttype', { commands: ['changeChartType'] }, { class: 'rb-chart-type' }),
  g('Location', 'ribbon-thumbnail-chartlocation', { commands: ['moveChart'] }, { class: 'rb-chart-location' }),
  g('Accessibility', 'ribbon-thumbnail-chart-alt-text', { commands: ['chartAltText'] }, { class: 'rb-chart-accessibility' }),
  g('Format Pane', 'ribbon-thumbnail-formatPane', { commands: ['FormatPane'] }, { class: 'rb-chart-format-pane' }),
];

/* ------------------------------------------------------------- Sparkline ---- */

/** Cell sparklines (trial id `sparkLineDesign`): Type / Show / Style / Group. */
export const sparklineGroups: IButtonGroup[] = [
  g('Type', 'ribbon-thumbnai-sparkline-type', { commands: ['lineSparkline', 'columnSparkline', 'winLossSparkline'] }, { class: 'rb-sparkline-type' }),
  g('Show', 'ribbon-thumbnail-sparkline-show', {
    children: [
      dir('vertical', [{ commands: ['showHighpoint'] }, { commands: ['showLowPoint'] }, { commands: ['showNegativePoint'] }], 'no-padding-top'),
      dir('vertical', [{ commands: ['showFirstPoint'] }, { commands: ['showLastPoint'] }, { commands: ['showMarkers'] }], 'no-padding-top'),
    ],
  }, { class: 'rb-sparkline-show' }),
  g('Style', 'ribbon-thumbnail-sparkline-style', {
    children: [dir('vertical', [
      dir('vertical', [{ commands: ['sparklineColor'] }, { commands: ['sparklineMarkerColor'] }], 'gc-designer-component-vertical-no-flex'),
      { commands: ['sparklineWeight'] },
    ])],
  }, { class: 'rb-sparkline-style' }),
  g('Group', 'ribbon-thumbnail-sparkline-groups', {
    children: [dir('vertical', [
      dir('vertical', [{ commands: ['sparklineGroup'] }, { commands: ['sparklineUnGroup'] }], 'gc-designer-component-vertical-no-flex'),
      dropdown('clearSparkline', ['clearSelectedSparkline', 'clearSelectedSparklineGroups']),
    ])],
  }, { class: 'rb-sparkline-group' }),
];

/** Formula sparklines (trial id `formulaSparkLineDesign`): one Argument group. */
export const formulaSparklineGroups: IButtonGroup[] = [
  g('Argument', 'ribbon-thumbnail-argument', { commands: ['formulaSparklineSetting'] }, { class: 'rb-formula-sparkline' }),
];

/* ---------------------------------------------------- contextual tab list --- */

/** The contextual tabs TASK 74 adds, in the trial's ribbon order. */
export const contextualTabs: IRibbonPanel[] = [
  { id: 'tableDesign', text: 'Table Design', buttonGroups: tableDesignGroups, contextual: true },
  { id: 'chartDesign', text: 'Chart Design', buttonGroups: chartDesignGroups, contextual: true },
  { id: 'formulaSparkLineDesign', text: 'Sparkline', buttonGroups: formulaSparklineGroups, contextual: true },
  { id: 'sparkLineDesign', text: 'Sparkline', buttonGroups: sparklineGroups, contextual: true },
];

/* ------------------------------------------------------------ command map --- */

/** Command specs merged into the designer's default command map. */
export const contextualCommandSpecs: Record<string, Spec> = {
  /* Table Design ---------------------------------------------------------- */
  tableNameLabel: { text: r('ribbon.tableDesign.tableName'), title: r('ribbon.tableDesign.tableName'), type: 'label', maxWidth: 99 },
  tableName: { title: r('ribbon.tableDesign.tableName'), type: 'comboBox', comboWidth: 110 },
  resizeTable: { text: r('ribbon.tableDesign.resizeTable'), title: r('ribbon.tableDesign.resizeTable'), iconClass: 'ribbon-button-resize-table' },
  convertToRange: { text: r('ribbon.tableDesign.toRange'), title: r('ribbon.tableDesign.toRange'), iconClass: 'ribbon-button-converttorange' },
  tableAllowAutoExpand: { text: r('ribbon.tableDesign.allowAutoExpand'), title: r('ribbon.tableDesign.allowAutoExpand'), type: 'checkbox' },
  tableStyleHeaderRow: { text: r('ribbon.tableDesign.headerRow'), title: r('ribbon.tableDesign.headerRow'), type: 'checkbox' },
  tableStyleTotalRow: { text: r('ribbon.tableDesign.totalRow'), title: r('ribbon.tableDesign.totalRow'), type: 'checkbox' },
  tableStyleBandedRows: { text: r('ribbon.tableDesign.bandedRows'), title: r('ribbon.tableDesign.bandedRows'), type: 'checkbox' },
  tableStyleFirstColumn: { text: r('ribbon.tableDesign.firstColumn'), title: r('ribbon.tableDesign.firstColumn'), type: 'checkbox' },
  tableStyleLastColumn: { text: r('ribbon.tableDesign.lastColumn'), title: r('ribbon.tableDesign.lastColumn'), type: 'checkbox' },
  tableStyleBandedColumns: { text: r('ribbon.tableDesign.bandedColumns'), title: r('ribbon.tableDesign.bandedColumns'), type: 'checkbox' },
  tableStyleResizeHandler: { text: r('ribbon.tableDesign.reszieHandler'), title: r('ribbon.tableDesign.reszieHandler'), type: 'checkbox' },
  tableStyleFilterButton: { text: r('ribbon.tableDesign.filterButton'), title: r('ribbon.tableDesign.filterButton'), type: 'checkbox' },
  tableStyleTotalRowList: { text: r('ribbon.tableDesign.totalRowList'), title: r('ribbon.tableDesign.totalRowList'), type: 'checkbox' },
  tableBindingSourceLabel: { text: r('ribbon.tableDesign.tableBindingSource'), title: r('ribbon.tableDesign.tableBindingSource'), type: 'label', maxWidth: 99 },
  /* Trial Table Binding group is 208px wide and its binding input fills 199px
   * (measure2-official.json). */
  tableBindingSource: { title: r('ribbon.tableDesign.tableBindingSource'), type: 'comboBox', comboWidth: 199 },
  ConvertToDataTable: { text: r('ribbon.tableDesign.convertToDataTable'), title: r('ribbon.tableDesign.convertToDataTable'), iconClass: 'ribbon-button-convert-to-data-table' },
  ConvertFromDataTable: { text: r('ribbon.tableDesign.convertFromDataTable'), title: r('ribbon.tableDesign.convertFromDataTable'), iconClass: 'ribbon-button-convert-from-data-table' },

  /* Chart Design ---------------------------------------------------------- */
  /* Button widths are the trial's rendered control boxes (measure29-official.json /
   * measure9-official.json DOM geometry); our host maps maxWidth onto that width. */
  addChartElement: { text: r('ribbon.chartDesign.addChartElementText'), title: r('ribbon.chartDesign.addChartElementTitle'), iconClass: 'ribbon-button-add-chart-element', bigButton: true, maxWidth: 72 },
  axes: { text: r('addChartElement.axes.axes'), title: r('addChartElement.axes.axes'), iconClass: 'ribbon-control-dropdown-axes' },
  axesPrimaryHorizontal: { text: r('addChartElement.primaryHorizontal'), title: r('addChartElement.primaryHorizontal'), iconClass: 'ribbon-control-dropdown-axes' },
  axesPrimaryVertical: { text: r('addChartElement.primaryVertical'), title: r('addChartElement.primaryVertical'), iconClass: 'ribbon-control-dropdown-axes' },
  axesSecondaryHorizontal: { text: r('addChartElement.secondaryHorizontal'), title: r('addChartElement.secondaryHorizontal'), iconClass: 'ribbon-control-dropdown-axes' },
  axesSecondaryVertical: { text: r('addChartElement.secondaryVertical'), title: r('addChartElement.secondaryVertical'), iconClass: 'ribbon-control-dropdown-axes' },
  axesMoreAxisOption: { text: r('addChartElement.axes.moreAxisOption'), title: r('addChartElement.axes.moreAxisOption') },
  axisTitles: { text: r('addChartElement.axisTitles.axisTitles'), title: r('addChartElement.axisTitles.axisTitles'), iconClass: 'ribbon-control-dropdown-axistitles' },
  axisTitlesPrimaryHorizontal: { text: r('addChartElement.primaryHorizontal'), title: r('addChartElement.primaryHorizontal'), iconClass: 'ribbon-control-dropdown-axistitles' },
  axisTitlesPrimaryVertical: { text: r('addChartElement.primaryVertical'), title: r('addChartElement.primaryVertical'), iconClass: 'ribbon-control-dropdown-axistitles' },
  axisTitlesSecondaryHorizontal: { text: r('addChartElement.secondaryHorizontal'), title: r('addChartElement.secondaryHorizontal'), iconClass: 'ribbon-control-dropdown-axistitles' },
  axisTitlesSecondaryVertical: { text: r('addChartElement.secondaryVertical'), title: r('addChartElement.secondaryVertical'), iconClass: 'ribbon-control-dropdown-axistitles' },
  axisTitlesMoreAxisTitlesOption: { text: r('addChartElement.axisTitles.moreAxisTitlesOption'), title: r('addChartElement.axisTitles.moreAxisTitlesOption') },
  chartTitle: { text: r('addChartElement.chartTitle.chartTitle'), title: r('addChartElement.chartTitle.chartTitle'), iconClass: 'ribbon-control-dropdown-charttitle' },
  chartTitleNone: { text: r('addChartElement.none'), title: r('addChartElement.none'), iconClass: 'ribbon-control-dropdown-charttitle' },
  chartTitleAboveChart: { text: r('addChartElement.aboveChart'), title: r('addChartElement.aboveChart'), iconClass: 'ribbon-control-dropdown-charttitle' },
  chartTitleMoreChartTitleOption: { text: r('addChartElement.chartTitle.moreChartTitleOption'), title: r('addChartElement.chartTitle.moreChartTitleOption') },
  errorBars: { text: r('addChartElement.errorBar.errorBar'), title: r('addChartElement.errorBar.errorBar'), iconClass: 'ribbon-control-dropdown-errorbar' },
  errorBarNone: { text: r('addChartElement.none'), title: r('addChartElement.none'), iconClass: 'ribbon-control-dropdown-errorbar' },
  errorBarStandardError: { text: r('addChartElement.errorBarStandardError'), title: r('addChartElement.errorBarStandardError'), iconClass: 'ribbon-control-dropdown-errorbar' },
  errorBarPercentage: { text: r('addChartElement.errorBarPercentage'), title: r('addChartElement.errorBarPercentage'), iconClass: 'ribbon-control-dropdown-errorbar' },
  errorBarStandardDeviation: { text: r('addChartElement.errorBarStandardDeviation'), title: r('addChartElement.errorBarStandardDeviation'), iconClass: 'ribbon-control-dropdown-errorbar' },
  errorBarMoreOption: { text: r('addChartElement.errorBar.moreErrorBarOption'), title: r('addChartElement.errorBar.moreErrorBarOption') },
  gridLines: { text: r('addChartElement.gridLines.gridLines'), title: r('addChartElement.gridLines.gridLines'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesPrimaryMajorHorizontal: { text: r('addChartElement.primaryMajorHorizontal'), title: r('addChartElement.primaryMajorHorizontal'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesPrimaryMajorVertical: { text: r('addChartElement.primaryMajorVertical'), title: r('addChartElement.primaryMajorVertical'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesPrimaryMinorHorizontal: { text: r('addChartElement.primaryMinorHorizontal'), title: r('addChartElement.primaryMinorHorizontal'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesPrimaryMinorVertical: { text: r('addChartElement.primaryMinorVertical'), title: r('addChartElement.primaryMinorVertical'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesSecondaryMajorHorizontal: { text: r('addChartElement.secondaryMajorHorizontal'), title: r('addChartElement.secondaryMajorHorizontal'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesSecondaryMajorVertical: { text: r('addChartElement.secondaryMajorVertical'), title: r('addChartElement.secondaryMajorVertical'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesSecondaryMinorHorizontal: { text: r('addChartElement.secondaryMinorHorizontal'), title: r('addChartElement.secondaryMinorHorizontal'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesSecondaryMinorVertical: { text: r('addChartElement.secondaryMinorVertical'), title: r('addChartElement.secondaryMinorVertical'), iconClass: 'ribbon-control-dropdown-gridlines' },
  gridLinesMoreGridLinesOption: { text: r('addChartElement.gridLines.moreGridLinesOption'), title: r('addChartElement.gridLines.moreGridLinesOption') },
  dataLabels: { text: r('addChartElement.dataLabels.dataLabels'), title: r('addChartElement.dataLabels.dataLabels'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelsNone: { text: r('addChartElement.none'), title: r('addChartElement.none'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelsCenter: { text: r('addChartElement.center'), title: r('addChartElement.center'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelsInsideBase: { text: r('addChartElement.insideBase'), title: r('addChartElement.insideBase'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelsInsideEnd: { text: r('addChartElement.insideEnd'), title: r('addChartElement.insideEnd'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelsOutsideEnd: { text: r('addChartElement.outsideEnd'), title: r('addChartElement.outsideEnd'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelShow: { text: r('addChartElement.show'), title: r('addChartElement.show'), iconClass: 'ribbon-control-dropdown-datalabels' },
  dataLabelsMoreDataLabelsOption: { text: r('addChartElement.dataLabels.moreDataLabelsOption'), title: r('addChartElement.dataLabels.moreDataLabelsOption') },
  legend: { text: r('addChartElement.legend.legend'), title: r('addChartElement.legend.legend'), iconClass: 'ribbon-control-dropdown-legend' },
  legendNone: { text: r('addChartElement.none'), title: r('addChartElement.none'), iconClass: 'ribbon-control-dropdown-legend' },
  legendRight: { text: r('addChartElement.right'), title: r('addChartElement.right'), iconClass: 'ribbon-control-dropdown-legend' },
  legendTop: { text: r('addChartElement.top'), title: r('addChartElement.top'), iconClass: 'ribbon-control-dropdown-legend' },
  legendLeft: { text: r('addChartElement.left'), title: r('addChartElement.left'), iconClass: 'ribbon-control-dropdown-legend' },
  legendBottom: { text: r('addChartElement.bottom'), title: r('addChartElement.bottom'), iconClass: 'ribbon-control-dropdown-legend' },
  legendMoreLegendOption: { text: r('addChartElement.legend.moreLegendOption'), title: r('addChartElement.legend.moreLegendOption') },
  trendline: { text: r('addChartElement.trendline.trendline'), title: r('addChartElement.trendline.trendline'), iconClass: 'ribbon-control-dropdown-trendline' },
  trendlineNone: { text: r('addChartElement.none'), title: r('addChartElement.none'), iconClass: 'ribbon-control-dropdown-trendline' },
  trendlineLinear: { text: r('addChartElement.trendlineLinear'), title: r('addChartElement.trendlineLinear'), iconClass: 'ribbon-control-dropdown-trendline' },
  trendlineExponential: { text: r('addChartElement.trendlineExponential'), title: r('addChartElement.trendlineExponential'), iconClass: 'ribbon-control-dropdown-trendline' },
  trendlineLinearForecast: { text: r('addChartElement.trendlineLinearForecast'), title: r('addChartElement.trendlineLinearForecast'), iconClass: 'ribbon-control-dropdown-trendline' },
  trendlineMovingAverage: { text: r('addChartElement.trendlineMovingAverage'), title: r('addChartElement.trendlineMovingAverage'), iconClass: 'ribbon-control-dropdown-trendline' },
  trendlineMoreOption: { text: r('addChartElement.trendline.moreTrendlineOption'), title: r('addChartElement.trendline.moreTrendlineOption') },
  /* Button widths are the trial's rendered control boxes (measure29-official.json /
   * measure9-official.json DOM geometry); our host maps maxWidth onto that width. */
  quickLayout: { text: r('ribbon.chartDesign.quickLayoutText'), title: r('ribbon.chartDesign.quickLayoutTitle'), iconClass: 'ribbon-button-quick-layout', bigButton: true, maxWidth: 72 },
  quickLayoutListContent: { text: r('ribbon.chartDesign.layoutList'), title: r('ribbon.chartDesign.layoutList'), type: 'listContent', maxWidth: 190 },
  changeColors: { text: r('ribbon.chartDesign.changeColors'), title: r('ribbon.chartDesign.changeColors'), type: 'dropdown', iconClass: 'ribbon-button-change-colors', bigButton: true, maxWidth: 72, dropdownMaxWidth: 225 },
  chartStyle: { text: r('ribbon.chartDesign.chartStylesText'), title: r('ribbon.chartDesign.chartStyles'), type: 'dropdown', iconClass: 'ribbon-button-chart-styles', bigButton: true, maxWidth: 72, dropdownMaxWidth: 905 },
  switchRowColumn: { text: r('ribbon.chartDesign.switchRowColumnText'), title: r('ribbon.chartDesign.switchRowColumnTitle'), iconClass: 'ribbon-button-switch-row-column', bigButton: true, maxWidth: 70 },
  selectData: { text: r('ribbon.chartDesign.selectDataText'), title: r('ribbon.chartDesign.selectDataTitle'), iconClass: 'ribbon-button-selectData', bigButton: true, maxWidth: 70 },
  changeChartType: { text: r('ribbon.chartDesign.changeChartTypeText'), title: r('ribbon.chartDesign.changeChartTypeTitle'), iconClass: 'ribbon-button-change-chart-type', bigButton: true, maxWidth: 70 },
  moveChart: { text: r('ribbon.chartDesign.moveChartText'), title: r('ribbon.chartDesign.moveChartTitle'), iconClass: 'ribbon-button-move-chart', bigButton: true, maxWidth: 70 },
  chartAltText: { text: r('ribbon.chartDesign.chartAltText'), title: r('ribbon.chartDesign.chartAltText'), iconClass: 'ribbon-button-chart-alt-text', bigButton: true, maxWidth: 51 },
  /** Shared by Shape Format and Chart Design (trial command `FormatPane`). */
  FormatPane: { text: r('ribbon.shapeDesign.formatPane'), title: r('ribbon.shapeDesign.displayFormatPane'), type: 'button', iconClass: 'ribbon-button-formatPane', bigButton: true, maxWidth: 70 },

  /* Sparkline ------------------------------------------------------------- */
  /* Sparkline tab geometry from `.probe/t74/measure9-official.json` (DOM boxes):
   * Type 50/53/61, Style colour rows 120/107, Group rows 71/84/86 h24 (trial
   * renders them as icon+text horizontal rows, not big buttons). */
  lineSparkline: { text: r('ribbon.sparkLineDesign.line'), title: r('ribbon.sparkLineDesign.lineTip'), iconClass: 'ribbon-button-sparkline-line-type', bigButton: true, maxWidth: 50 },
  columnSparkline: { text: r('ribbon.sparkLineDesign.column'), title: r('ribbon.sparkLineDesign.columnTip'), iconClass: 'ribbon-button-sparkline-column-type', bigButton: true, maxWidth: 53 },
  winLossSparkline: { text: r('ribbon.sparkLineDesign.winLoss'), title: r('ribbon.sparkLineDesign.winLossTip'), iconClass: 'ribbon-button-sparkline-winloss-type', bigButton: true, maxWidth: 61 },
  showHighpoint: { text: r('ribbon.sparkLineDesign.highPoint'), title: r('ribbon.sparkLineDesign.highPointTip'), type: 'checkbox' },
  showLowPoint: { text: r('ribbon.sparkLineDesign.lowPoint'), title: r('ribbon.sparkLineDesign.lowPointTip'), type: 'checkbox' },
  showNegativePoint: { text: r('ribbon.sparkLineDesign.negativePoint'), title: r('ribbon.sparkLineDesign.negativePointTip'), type: 'checkbox' },
  showFirstPoint: { text: r('ribbon.sparkLineDesign.firstPoint'), title: r('ribbon.sparkLineDesign.firstPointTip'), type: 'checkbox' },
  showLastPoint: { text: r('ribbon.sparkLineDesign.lastPoint'), title: r('ribbon.sparkLineDesign.lastPointTip'), type: 'checkbox' },
  showMarkers: { text: r('ribbon.sparkLineDesign.markers'), title: r('ribbon.sparkLineDesign.markersTip'), type: 'checkbox' },
  sparklineColor: { text: r('ribbon.sparkLineDesign.sparklineColor'), title: r('ribbon.sparkLineDesign.sparklineColor'), type: 'colorPicker', iconClass: 'sparkline-color-icon', maxWidth: 120 },
  sparklineMarkerColor: { text: r('ribbon.sparkLineDesign.markerColor'), title: r('ribbon.sparkLineDesign.markerColor'), type: 'colorPicker', iconClass: 'ribbon-button-sparkline-marker-color', maxWidth: 107 },
  /** The trial combo shows the weight as a POINT text (`½ pt`) and is not editable:
   *  the core stores px, the trial displays px × 0.75 (measured: 1 px → `¾ pt`,
   *  picking "1 pt" writes 4/3 px — `.probe/t74/combo28-official.json` + 5188 probe). */
  sparklineWeight: { text: r('ribbon.sparkLineDesign.sparklineWeight'), title: r('ribbon.sparkLineDesign.sparklineWeight'), type: 'comboBox', comboWidth: 115 },
  sparklineGroup: { text: r('ribbon.sparkLineDesign.group'), title: r('ribbon.sparkLineDesign.groupTip'), iconClass: 'ribbon-button-sparkline-group', maxWidth: 71 },
  sparklineUnGroup: { text: r('ribbon.sparkLineDesign.unGroup'), title: r('ribbon.sparkLineDesign.unGroupTip'), iconClass: 'ribbon-button-sparkline-ungroup', maxWidth: 84 },
  clearSparkline: { text: r('ribbon.sparkLineDesign.clear'), title: r('ribbon.sparkLineDesign.clearSparkline'), iconClass: 'ribbon-button-clearall', maxWidth: 86, type: 'dropdown', dropdownMaxWidth: 230 },
  clearSelectedSparkline: { text: r('ribbon.sparkLineDesign.clearSparkline'), title: r('ribbon.sparkLineDesign.clearSparkline'), iconClass: 'ribbon-button-clearall' },
  clearSelectedSparklineGroups: { text: r('ribbon.sparkLineDesign.clearSparklineGroup'), title: r('ribbon.sparkLineDesign.clearSparklineGroup'), iconClass: 'ribbon-button-clearall' },
  /* Trial big button: 55×80 ("Settings" in an "Argument" group; the tab appears
   * without activation, like the cell-sparkline tab — 5188 probe Nov 20). */
  formulaSparklineSetting: { text: r('ribbon.formulaSparklineDesign.settings'), title: r('ribbon.formulaSparklineDesign.settings'), iconClass: 'ribbon-button-formula-sparkline-settings', bigButton: true, maxWidth: 55 },
};

/** Shape Format (trial id `shapeDesign`): the trial's ten groups and their order.
 *  Two groups keep our rendering of the trial's inline galleries (TASK 55 measured
 *  the seven quick-style tiles and the shapes gallery), so the trial's
 *  `insertShapeList`/`changeShapeStyle` ids stay registered as commands
 *  (see `shapeDesignCommandSpecs`) while the config keeps our tile commands. */
export const shapeDesignGroups: IButtonGroup[] = [
  g('Insert Shapes', 'ribbon-thumbnail-shapeinsertshape', {
    children: [dir('horizontal', [c('shapeFormatInsertShapes'), c('changeShape')])],
  }, { class: 'rb-shape-insert' }),
  g('Shape Styles', 'ribbon-thumbnail-shapeStyles', {
    children: [dir('horizontal', [
      c('shapeStyle1'), c('shapeStyle2'), c('shapeStyle3'), c('shapeStyle4'), c('shapeStyle5'), c('shapeStyle6'), c('shapeStyle7'),
      dropdown('shapeStylesMore', []),
    ])],
  }, { class: 'rb-shape-styles' }),
  g('Accessibility', 'ribbon-thumbnail-chart-alt-text', { commands: ['shapeAltText'] }, { class: 'rb-shape-accessibility' }),
  g('Rotate', 'ribbon-thumbnail-shaperotate', { children: [dropdown('shapeRotate', ['shapeRightRotate90', 'shapeLeftRotate'])] }, { class: 'rb-shape-rotate' }),
  g('Group', 'ribbon-thumbnail-shapegroup', { children: [dropdown('shapeCommandGroup', ['shapeGroup', 'shapeUnGroup'])] }, { class: 'rb-shape-group' }),
  g('Align', 'ribbon-thumbnail-shapealign', {
    children: [dropdown('shapeCommandAlign', ['shapeAlignLeft', 'shapeAlignCenter', 'shapeAlignRight', sep(), 'shapeAlignTop', 'shapeAlignMiddle', 'shapeAlignBottom', sep(), 'shapeHorizontalDistribute', 'shapeShapeVerticalDistribute', sep(), 'shapeSnapToGrid', 'shapeSnapToShape'])],
  }, { class: 'rb-shape-align' }),
  g('Arrange', 'ribbon-thumbnail-shape-arrange', {
    children: [dir('horizontal', [
      dropdown('bringShapeForwardGroup', ['bringShapeForward', 'bringShapeToFront']),
      dropdown('sendShapeBackwardGroup', ['sendShapeBackward', 'sendShapeToBack']),
    ])],
  }, { class: 'rb-shape-arrange' }),
  /* The trial shows this group as a "Size" launcher with Height/Width inputs; at the
   * measured 1280px width it collapses exactly like our `shapeSize` dropdown does. */
  g('Size', 'ribbon-thumbnail-shapesize', { children: [dir('vertical', [dropdown('shapeSize', [])])] }, { class: 'rb-shape-size' }),
  g('Selection Pane', 'ribbon-thumbnail-selection-panel', { commands: ['selectionPaneButton'] }, { class: 'rb-shape-selection-pane' }),
  g('Format Pane', 'ribbon-thumbnail-formatPane', { commands: ['FormatPane'] }, { class: 'rb-shape-format-pane' }),
];

/** Shape Format command names TASK 74 adds to the default command map. The
 *  trial renders the two inline galleries (`insertShapeList`, `changeShapeStyle`)
 *  through its list-preview control; our host keeps the equivalent tiles under
 *  the commands measured in TASK 55 (`shapeStyle1..7` + the styles spinner), so
 *  these two stay registered as behaviour-compatible aliases of the same groups. */
export const shapeDesignCommandSpecs: Record<string, Spec> = {
  insertShapeList: { text: r('ribbon.shapeDesign.shape'), title: r('ribbon.shapeDesign.insertShape'), type: 'dropdown', iconClass: 'ribbon-button-shapes' },
  changeShapeStyle: { text: r('ribbon.shapeDesign.changeShapeStyle'), title: r('ribbon.shapeDesign.changeShapeStyle'), type: 'dropdown', iconClass: 'ribbon-button-shape-change', dropdownMaxWidth: 430, subCommands: ['shapeStyle1', 'shapeStyle2', 'shapeStyle3', 'shapeStyle4', 'shapeStyle5', 'shapeStyle6', 'shapeStyle7'] },
  shapeRightRotate90: { text: r('ribbon.shapeDesign.rotateright90'), title: r('ribbon.shapeDesign.rotateright90'), iconClass: 'ribbon-button-rotate-right-90' },
  shapeLeftRotate: { text: r('ribbon.shapeDesign.rotateleft90'), title: r('ribbon.shapeDesign.rotateleft90'), iconClass: 'ribbon-button-rotate-left-90' },
  shapeCommandGroup: { text: r('ribbon.shapeDesign.group'), title: r('ribbon.shapeDesign.group'), type: 'dropdown', iconClass: 'ribbon-thumbnail-shapegroup' },
  shapeCommandAlign: { text: r('ribbon.shapeDesign.align'), title: r('ribbon.shapeDesign.align'), type: 'dropdown', iconClass: 'ribbon-thumbnail-shapealign' },
  shapeAlignLeft: { text: r('ribbon.shapeDesign.alignLeft'), title: r('ribbon.shapeDesign.alignLeft'), iconClass: 'ribbon-button-shape-align-left' },
  shapeAlignCenter: { text: r('ribbon.shapeDesign.alignCenter'), title: r('ribbon.shapeDesign.alignCenter'), iconClass: 'ribbon-button-shape-align-center' },
  shapeAlignRight: { text: r('ribbon.shapeDesign.alignRight'), title: r('ribbon.shapeDesign.alignRight'), iconClass: 'ribbon-button-shape-align-right' },
  shapeAlignTop: { text: r('ribbon.shapeDesign.alignTop'), title: r('ribbon.shapeDesign.alignTop'), iconClass: 'ribbon-button-shape-align-top' },
  shapeAlignMiddle: { text: r('ribbon.shapeDesign.alignMiddle'), title: r('ribbon.shapeDesign.alignMiddle'), iconClass: 'ribbon-button-shape-align-middle' },
  shapeAlignBottom: { text: r('ribbon.shapeDesign.alignBottom'), title: r('ribbon.shapeDesign.alignBottom'), iconClass: 'ribbon-button-shape-align-bottom' },
  shapeHorizontalDistribute: { text: r('ribbon.shapeDesign.hDistribute'), title: r('ribbon.shapeDesign.hDistribute'), iconClass: 'ribbon-button-shape-distribute-horizontal' },
  shapeShapeVerticalDistribute: { text: r('ribbon.shapeDesign.vDistribute'), title: r('ribbon.shapeDesign.vDistribute'), iconClass: 'ribbon-button-shape-distribute-vertical' },
  shapeSnapToGrid: { text: r('ribbon.shapeDesign.snapGrid'), title: r('ribbon.shapeDesign.snapGrid'), iconClass: 'ribbon-button-shape-snap-grid' },
  shapeSnapToShape: { text: r('ribbon.shapeDesign.snapShape'), title: r('ribbon.shapeDesign.snapShape'), iconClass: 'ribbon-button-shape-snap-shape' },
  bringShapeForwardGroup: { text: r('ribbon.shapeDesign.bringForward'), title: r('ribbon.shapeDesign.bringForward'), iconClass: 'ribbon-thumbnail-shape-bring-forward' },
  sendShapeBackwardGroup: { text: r('ribbon.shapeDesign.sendBackward'), title: r('ribbon.shapeDesign.sendBackward'), iconClass: 'ribbon-thumbnail-shape-send-backward' },
  shapeSizeHeight: { text: r('ribbon.shapeDesign.height'), title: r('ribbon.shapeDesign.heightTitle'), type: 'spinner', iconClass: 'ribbon-thumbnail-shapesize' },
  shapeSizeWidth: { text: r('ribbon.shapeDesign.width'), title: r('ribbon.shapeDesign.widthTitle'), type: 'spinner', iconClass: 'ribbon-thumbnail-shapesize' },
  /* The trial's group captions double as commands (enablement/style hooks). */
  tableStyleOptions: { text: r('ribbon.tableDesign.styleOptions'), title: r('ribbon.tableDesign.styleOptions'), type: 'checkbox' },
};

/** Every command id the contextual tabs contribute to the command map. */
export const contextualCommandNames: Set<string> = new Set([
  ...Object.keys(contextualCommandSpecs),
  ...Object.keys(shapeDesignCommandSpecs),
]);

/** Commands whose galleries are drawn by `ribbon/menus.tsx` (TASK 74). */
export const chartGalleryCommands = new Set(['quickLayout', 'quickLayoutListContent', 'changeColors', 'chartStyle']);

/**
 * Tabs the trial shows but never activates (`.probe/t74/measure9-official.json`,
 * `spark-cell`: the rail carries "Sparkline" while `activeRibbonTab()` stays
 * `home`). Every other contextual tab takes the focus when it appears.
 *
 * TASK 77 (probes t77-follow/t77-manualclose on the live trial): the pivot tabs behave the
 * same way for SELECTION re-entry — creating a pivot activates `PivotTable Analyze`, but
 * clicking back into a pivot cell later shows the tabs while the active tab stays `Home`.
 * Creation activates explicitly in `createPivot` (`d.activeTab = 'pivotTableAnalyze'`), so the
 * automatic fresh-tab activation skips these ids.
 */
export const contextualTabsWithoutActivation = new Set([
  'sparkLineDesign', 'formulaSparkLineDesign', 'pivotTableAnalyze', 'pivotTableDesign',
]);

