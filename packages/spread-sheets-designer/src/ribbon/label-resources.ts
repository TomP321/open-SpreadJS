/**
 * TASK 87: mapping from the stable English ribbon identities (tab ids, group
 * labels) to resource-tree paths, so a language package loaded before designer
 * creation translates the tab strip and the group captions.
 *
 * The config keeps the English label as IDENTITY (collapse thresholds,
 * collapsed-group metrics and the `ribbon.ribbonGroupId.<label>` command ids
 * reference it), while the RENDERERS resolve the displayed text through this
 * map. English stays the default: resolving a path against the English
 * resources yields the same string. Only labels that exist in the resource
 * tree are mapped; everything else keeps its config text.
 */

/** Group label (config identity) -> resource path. */
export const ribbonGroupLabelResources: Record<string, string> = {
  Undo: 'ribbon.accessBar.undo',
  Clipboard: 'ribbon.home.clipboard',
  Font: 'ribbon.home.fonts',
  Alignment: 'ribbon.home.alignment',
  Number: 'ribbon.home.numbers',
  Styles: 'ribbon.home.styles',
  Cells: 'ribbon.home.cells',
  Editing: 'ribbon.home.editing',
  'Sort & Filter': 'ribbon.home.sortFilterTitle',
  // Contextual tabs (Table/Chart/Sparkline/Shape Design), TASK 87.
  Properties: 'ribbon.tableDesign.property',
  Tools: 'ribbon.tableDesign.tools',
  'Table Style Options': 'ribbon.tableDesign.tableOption',
  'Table Styles': 'ribbon.tableDesign.tableStyle',
  'Table Binding': 'ribbon.tableDesign.tableBinding',
  'Chart Layouts': 'ribbon.chartDesign.chartLayouts',
  Data: 'ribbon.chartDesign.data',
  'Chart Styles': 'ribbon.chartDesign.chartStyles',
  Type: 'ribbon.sparkLineDesign.type',
  Argument: 'ribbon.formulaSparklineDesign.argument',
  Location: 'ribbon.chartDesign.location',
  'Insert Shapes': 'ribbon.shapeDesign.insertShape',
  'Shape Styles': 'ribbon.shapeDesign.changeShapeStyle',
  Rotate: 'ribbon.shapeDesign.rotate',
  Align: 'ribbon.shapeDesign.align',
  'Format Pane': 'ribbon.shapeDesign.formatPane',
  Accessibility: 'ribbon.chartDesign.accessiblity',
  Show: 'ribbon.sparkLineDesign.show',
  Style: 'ribbon.sparkLineDesign.style',
  Group: 'ribbon.sparkLineDesign.groups',
  Shape: 'ribbon.shapeDesign.shape',
  Size: 'ribbon.shapeDesign.size',
  Arrange: 'ribbon.shapeDesign.arrange',
  'Selection Pane': 'ribbon.groups.selectionPane',
  // Main-tab group captions outside Home (TASK 87 round 2).
  Tables: 'ribbon.groups.tables',
  Charts: 'ribbon.groups.charts',
  Illustrations: 'ribbon.groups.illustrations',
  Links: 'ribbon.groups.links',
  Controls: 'ribbon.groups.controls',
  Themes: 'ribbon.groups.themes',
  'Page Setup': 'ribbon.groups.pageSetup',
  Background: 'ribbon.groups.background',
  'Scale to Fit': 'ribbon.groups.scaleToFit',
  'Sheet Options': 'ribbon.groups.sheetOptions',
  Functions: 'ribbon.groups.functions',
  'Functions Library': 'ribbon.groups.functionsLibrary',
  Names: 'ribbon.groups.names',
  'Formula Auditing': 'ribbon.groups.formulaAuditing',
  Calculation: 'ribbon.groups.calculation',
  'Data Binding': 'ribbon.groups.dataBinding',
  'Queries & Connections': 'ribbon.groups.queriesConnections',
  'Data Tools': 'ribbon.groups.dataTools',
  Outline: 'ribbon.groups.outline',
  Forecast: 'ribbon.groups.forecast',
  'Threaded Comments': 'ribbon.groups.threadedComments',
  'Show/Hide': 'ribbon.groups.showHide',
  Zoom: 'ribbon.groups.zoom',
  Viewport: 'ribbon.groups.viewport',
  Pane: 'ribbon.groups.pane',
  'Command Palette': 'ribbon.groups.commandPalette',
  'Spread Settings': 'ribbon.groups.spreadSettings',
  'Sheet Settings': 'ribbon.groups.sheetSettings',
  // PivotTable contextual tabs.
  PivotTable: 'ribbon.groups.pivotTable',
  'Active Field': 'ribbon.groups.activeField',
  Filter: 'ribbon.groups.filter',
  Actions: 'ribbon.groups.actions',
  Calculations: 'ribbon.groups.calculations',
  Layout: 'ribbon.groups.layout',
  'PivotTable Style Options': 'ribbon.groups.pivotStyleOptions',
  'PivotTable Styles': 'ribbon.groups.pivotStyles',
};

/** Tab id -> resource path (main tabs + the contextual tabs in the resource tree). */
export const ribbonTabLabelResources: Record<string, string> = {
  home: 'ribbon.home.home',
  insert: 'ribbon.home.insert',
  pageLayout: 'ribbon.home.pageLayout',
  formulas: 'ribbon.home.formulas',
  data: 'ribbon.home.data',
  review: 'ribbon.home.review',
  view: 'ribbon.home.view',
  settings: 'ribbon.home.settings',
  tableDesign: 'ribbon.tableDesign.design',
  chartDesign: 'ribbon.chartDesign.design',
  sparkLineDesign: 'ribbon.sparkLineDesign.design',
  formulaSparkLineDesign: 'ribbon.formulaSparklineDesign.design',
  shapeDesign: 'ribbon.shapeDesign.title',
  pivotTableAnalyze: 'ribbon.pivot.analyze',
  pivotTableDesign: 'ribbon.pivot.design',
};
