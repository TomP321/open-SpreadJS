import * as GanttProject from './gantt/project.js';
import * as GanttMapping from './gantt/mapping.js';
import * as GanttDependency from './gantt/dependency.js';
import * as GanttCollection from './gantt/collection.js';
import * as GanttCalendar from './gantt/calendar.js';
import * as GanttAppearance from './gantt/appearance.js';
import { GanttSheet as GanttSheetClass } from './gantt/sheet/index.js';
import { tableSheetCommands } from './tablesheet/commands.js';
import { commandConstants } from './command-constants.js';
import { startTransaction, endTransaction, undoTransaction } from './transactions.js';
import { NamedCellTemplatesManager } from './named-cell-templates.js';
import { CellStateManager } from './features/cell-state.js';
import { TableSheet } from './tablesheet/index.js';
import { TableSheetPanel } from './tablesheet/panel.js';
import { ReportSheet, TemplateSheet } from './report/index.js';
import { getNamedPatterns, namedPattern, validatePattern } from './features/input-mask.js';
import { FormulaTextBox, NameBox, StatusBar, StatusItem, findControl, findSheetControl } from './features/controls.js';
import { Commands as formulaPanelCommands, FormulaEditor as FormulaPanelEditor, findControl as formulaPanelFindControl } from './features/formula-panel.js';
import { ioNamespace } from './io-core.js';
import { Collaboration } from './collaboration.js';
import { CellBindingSource } from './features/binding.js';
import { FloatingObject, FloatingObjectCollection, Picture } from './features/floating-objects.js';
import { CameraShape, ConnectorShape, FormControlShape, GroupShape, PictureShape, Shape, ShapeBase, ShapeCollection, ShapeStyle } from './features/shapes.js';
import { Sparkline, SparklineGroup, SparklineSetting } from './features/sparklines.js';
import {
  AreaSparkline, BoxPlotSparkline, BulletSparkline, CascadeSparkline, ColumnSparkline, GaugeKPISparkline,
  HBarSparkline, HistogramSparkline, ImageSparkline, LineSparkline, LollipopVariSparkline, MonthSparkline,
  ParetoSparkline, PieSparkline, ProgressSparkline, RangeBlockSparkline, ScatterSparkline, SparklineEx,
  SpreadSparkline, StackedSparkline, VariSparkline, VBarSparkline, WinlossSparkline, YearSparkline,
} from './features/sparkline-ex.js';
import { Barcode as BarcodeNamespace } from './features/barcode-ex.js';
import { ScenarioPanel } from './features/scenario-panel.js';
import { ThreadedCommentPanel } from './features/threaded-comment-panel.js';
import { ContextMenu, MenuView } from './features/context-menu.js';
import { TouchToolStrip, TouchToolStripItem, TouchToolStripSeparator } from './touch.js';
import { PaperSize, PrintInfo, SheetPageInfo, WorkbookPaginator, WorksheetPaginator } from './print.js';
import { ColorScheme, Theme, ThemeColors, ThemeFont, ThemeFonts, Themes } from './themes.js';
import { GC as Enums } from './generated/enums.js';
import { Workbook } from './workbook.js';
import { Worksheet } from './worksheet.js';
import { CellRange } from './range.js';
import { Style, LineBorder, Range, NameInfo, Point, Rect } from './primitives.js';
import { Events, CommonEvents } from './events.js';
import { FormatterBase, GeneralFormatter } from './formatter.js';
import { CultureInfo, CultureManager } from './culture.js';
import { UserManager } from './user-manager.js';
import { CommandManager, UndoManager } from './commands.js';
import { Comment, CommentDeleteUndoAction, CommentManager, CommentPropertyUndoAction, Padding } from './comments.js';
import {
  ContentType,
  ThreadedComment,
  ThreadedCommentFilterType,
  ThreadedCommentManager,
  Reply,
  AddThreadedCommentUndoAction,
  AddThreadedCommentReplyUndoAction,
  NavigateNextThreadedCommentAction,
  NavigatePreviousThreadedCommentAction,
  RemoveThreadedCommentUndoAction,
  RemoveThreadedCommentReplyUndoAction,
  UpdateThreadedCommentUndoAction,
  UpdateThreadedCommentReplyUndoAction,
  cloneContentBlock,
  fromSJSThreadedComment,
  replyToCapabilityCommentText,
  replyToIReply,
  toSJSThreadedComment,
} from './threaded-comments.js';
import { BuiltInRowActions } from './built-in-row-actions.js';
import { Table, TableColumn, TableManager, TableStyle, TableTheme, TableThemes, CustomTableThemeManager } from './features/tables.js';
import {
  PivotTable, PivotTableStyle, PivotTableTheme, PivotTableThemes, CustomPivotTableThemeManager,
  PivotTableManager, bindPivotHooks, PivotTableViewManager, installPivotInteraction, PivotPanel,
} from './pivot/index.js';
import { PivotTableItemSlicer, PivotTableTimelineSlicer } from './features/slicers/pivot-slicer.js';
import { ScenarioManager } from './features/scenarios.js';
import { DataRange, DataRangeManager } from './features/data-ranges.js';
import { OutlineColumn } from './features/outline-column.js';
import { CustomDocPropsManager, CustomThemeManagerBase, SheetTabStyleManager } from './features/workbook-managers.js';
import { HideRowFilter, RowFilterBase } from './features/filters.js';
import {
  Condition,
  ConditionRuleBase,
  ConditionalFormats,
  DataBarRule,
  IconCriterion,
  IconSetRule,
  NormalConditionRule,
  ScaleRule,
  ScaleValue,
  SparklineRule,
  StateRule,
  SparklineFormulaBuilder,
  DateExConditionExpectType,
  CF_CELL_PLACEHOLDER,
  CF_RANGE_PLACEHOLDER,
  normalizeSparklineFormulaPlaceholdersForCollaboration,
  restoreSparklineFormulaPlaceholders,
  validateSparklineOptions,
  validateSparklineType,
} from './features/conditional-formatting.js';
import {
  DefaultDataValidator,
  createDateValidator,
  createFormulaListValidator,
  createFormulaValidator,
  createListValidator,
  createNumberValidator,
  createTextLengthValidator,
  createTimeValidator,
} from './features/data-validation.js';
import {
  Base as CellTypeBase,
  Button,
  ButtonList,
  CheckBox,
  CheckBoxList,
  ColumnHeader,
  ComboBox,
  Corner,
  DataObject,
  Diagonal,
  FileUpload,
  HyperLink,
  Picture as PictureCellType,
  RadioButtonList,
  RangeTemplate,
  RowHeader,
  Text,
} from './features/cell-types.js';
import { Outline, OutlineInfo } from './features/outlines.js';
import { SearchCondition, SearchResult } from './search.js';
import { Chart, ChartCollection, getColor } from './features/charts.js';
import { installFallbacks } from './not-implemented.js';
import { WorkbookRenderer } from './rendering.js';
import { Interaction } from './interaction.js';
import { bindSlicerHosts } from './features/slicers/install.js';
import { CalcEngineApi, GlobalCalcEngineApi } from './calc/api.js';
import { PDFFontsManager } from './pdf/fonts-manager.js';
import { DataManager, Table as DataTable, View as DataView } from './data/index.js';
import { DataChart, DataChartManager, DataChartConfigPanel } from './datacharts/index.js';

/** `GC.Spread.Pivot`: shared enums plus the pivot classes (trial namespace). */
const PivotNamespace: Record<string, unknown> = {
  ...Enums.Pivot,
  ...Enums.Spread.Pivot,
  PivotTable,
  PivotTableStyle,
  PivotTableTheme,
  PivotTableThemes,
  CustomPivotTableThemeManager,
  PivotPanel,
  PivotTableItemSlicer,
  PivotTableTimelineSlicer,
};
// The declared `GC.Spread.Pivot.PivotTable.PivotTableViewManager` (views, TASK 42).
(PivotTable as unknown as Record<string, unknown>).PivotTableViewManager = PivotTableViewManager;

export const Spread = {
  ...Enums.Spread,
  Pivot: PivotNamespace,
  CalcEngine: { ...(Enums.Spread as { CalcEngine?: object }).CalcEngine, ...GlobalCalcEngineApi },
  Common: { CultureInfo, CultureManager, UserManager, Events: CommonEvents },
  Report: { ReportSheet, TemplateSheet },
  Formatter: { FormatterBase, GeneralFormatter },
  Commands: { ...Enums.Spread.Commands, CommandManager, UndoManager },
  Sheets: {
    ...Enums.Spread.Sheets,
    CalcEngine: {
      ...(Enums.Spread.Sheets as { CalcEngine?: object }).CalcEngine,
      ...CalcEngineApi,
      Functions: GlobalCalcEngineApi.Functions,
    },
    Commands: { ...commandConstants, ...tableSheetCommands, startTransaction, endTransaction, undoTransaction },
    InputMask: { getNamedPatterns, namedPattern, validatePattern },
    FormulaPanel: { FormulaEditor: FormulaPanelEditor, findControl: formulaPanelFindControl, Commands: formulaPanelCommands },
    Collaboration: { ...Enums.Spread.Sheets.Collaboration, Collaboration },
    IO: { ...(Enums.Spread.Sheets as { IO?: object }).IO, ...ioNamespace },
    FormulaTextBox: { FormulaTextBox, findControl },
    NameBox: { NameBox, findControl },
    StatusBar: { StatusBar, StatusItem, findControl },
    Bindings: { CellBindingSource },
    Barcode: BarcodeNamespace,
    FloatingObjects: { FloatingObject, FloatingObjectCollection, Picture },
    Charts: { ...Enums.Spread.Sheets.Charts, Chart, ChartCollection, getColor },
    DataCharts: { ...Enums.Spread.Sheets.DataCharts, DataChart, DataChartManager, DataChartConfigPanel },
    Shapes: { ...Enums.Spread.Sheets.Shapes, CameraShape, ConnectorShape, FormControlShape, GroupShape, Picture, PictureShape, Shape, ShapeBase, ShapeCollection, ShapeStyle },
    Sparklines: {
      ...Enums.Spread.Sheets.Sparklines,
      AreaSparkline, BoxPlotSparkline, BulletSparkline, CascadeSparkline, ColumnSparkline, GaugeKPISparkline,
      HBarSparkline, HistogramSparkline, ImageSparkline, LineSparkline, LollipopVariSparkline, MonthSparkline,
      ParetoSparkline, PieSparkline, ProgressSparkline, RangeBlockSparkline, ScatterSparkline, Sparkline,
      SparklineEx, SparklineGroup, SparklineSetting, SpreadSparkline, StackedSparkline, VBarSparkline,
      VariSparkline, WinlossSparkline, YearSparkline,
    },
    ContextMenu: { ContextMenu, MenuView },
    Touch: { TouchToolStrip, TouchToolStripItem, TouchToolStripSeparator },
    Workbook,
    Worksheet,
    NamedCellTemplates: { NamedCellTemplatesManager },
    CellState: { CellStateManager },
    TableSheet: { ...Enums.Spread.Sheets.TableSheet, TableSheet, TableSheetPanel, BuiltInRowActions },
    GanttSheet: { GanttSheet: GanttSheetClass, ...Enums.Spread.Sheets.GanttSheet, ...GanttCalendar, ...GanttAppearance, ...GanttCollection, ...GanttDependency, ...GanttMapping, ...GanttProject },
    CellRange,
    Style,
    LineBorder,
    Range,
    NameInfo,
    Point,
    Rect,
    Events,
    Comments: { ...Enums.Spread.Sheets.Comments, Comment, CommentManager, CommentDeleteUndoAction, CommentPropertyUndoAction, Padding },
    ThreadedComments: {
      ContentType,
      ThreadedComment,
      ThreadedCommentFilterType,
      ThreadedCommentManager,
      Reply,
      AddThreadedCommentUndoAction,
      AddThreadedCommentReplyUndoAction,
      RemoveThreadedCommentUndoAction,
      RemoveThreadedCommentReplyUndoAction,
      UpdateThreadedCommentUndoAction,
      UpdateThreadedCommentReplyUndoAction,
      NavigateNextThreadedCommentAction,
      NavigatePreviousThreadedCommentAction,
      cloneContentBlock,
      fromSJSThreadedComment,
      replyToCapabilityCommentText,
      replyToIReply,
      toSJSThreadedComment,
      ThreadedCommentPanel,
    },
    Tables: {
      ...Enums.Spread.Sheets.Tables,
      Table,
      TableColumn,
      TableManager,
      TableStyle,
      TableTheme,
      TableThemes,
      CustomTableThemeManager,
    },
    Filter: { ...Enums.Spread.Sheets.Filter, RowFilterBase, HideRowFilter },
    ConditionalFormatting: {
      ...Enums.Spread.Sheets.ConditionalFormatting,
      Condition,
      ConditionRuleBase,
      ConditionalFormats,
      NormalConditionRule,
      ScaleRule,
      ScaleValue,
      DataBarRule,
      IconCriterion,
      IconSetRule,
      StateRule,
      SparklineRule,
      SparklineFormulaBuilder,
      DateExConditionExpectType,
      CF_CELL_PLACEHOLDER,
      CF_RANGE_PLACEHOLDER,
      normalizeSparklineFormulaPlaceholdersForCollaboration,
      restoreSparklineFormulaPlaceholders,
      validateSparklineOptions,
      validateSparklineType,
    },
    DataValidation: {
      ...Enums.Spread.Sheets.DataValidation,
      DefaultDataValidator,
      createDateValidator,
      createFormulaListValidator,
      createFormulaValidator,
      createListValidator,
      createNumberValidator,
      createTextLengthValidator,
      createTimeValidator,
    },
    CellTypes: {
      ...Enums.Spread.Sheets.CellTypes,
      Base: CellTypeBase,
      Text,
      Button,
      CheckBox,
      ComboBox,
      HyperLink,
      CheckBoxList,
      RadioButtonList,
      ButtonList,
      Corner,
      ColumnHeader,
      RowHeader,
      DataObject,
      Diagonal,
      FileUpload,
      Picture: PictureCellType,
      RangeTemplate,
    },
    Outlines: { ...Enums.Spread.Sheets.Outlines, Outline, OutlineInfo },
    Scenarios: { ScenarioManager, ScenarioPanel },
    DataRange: { DataRange, DataRangeManager },
    OutlineColumn: { OutlineColumn },
    Search: { ...Enums.Spread.Sheets.Search, SearchCondition, SearchResult },
    PDF: { PDFFontsManager },
    Print: { ...Enums.Spread.Sheets.Print, PaperSize, PrintInfo, SheetPageInfo, WorksheetPaginator, WorkbookPaginator },
    Theme, ThemeColors, ThemeFonts, Themes, ThemeFont, ColorScheme,
    CustomThemeManagerBase, CustomDocPropsManager, SheetTabStyleManager,
    PivotTableManager,
    LicenseKey: '',
    // Core namespace functions (TASK 46, probes core46p..core46s).
    findControl: findSheetControl,
    // The trial resolves the type string against a small set of known cell-type names and
    // hands back the live global (probe core46r: 'Text' -> the DOM Text interface, 'Image'
    // and 'Lock' -> the trial page's globals for those legacy classes; every other name,
    // including case variants like 'text' or 'button', answers undefined).
    getTypeFromString: (typeString: string): unknown => {
      if (typeof typeString !== 'string' || !(typeString === 'Text' || typeString === 'Image' || typeString === 'Lock')) return undefined;
      const globalThis_ = globalThis as Record<string, unknown>;
      const value = globalThis_[typeString];
      return typeof value === 'function' ? value : undefined;
    },
    productInfo: { name: 'OpenSheets', version: '0.1.0' },
  },
};
export const Pivot = PivotNamespace;
const GC = { ...Enums, Spread, Pivot: PivotNamespace, Data: { ...Enums.Data, DataManager, Table: DataTable, View: DataView } };
bindSlicerHosts(Workbook, WorkbookRenderer);
bindPivotHooks(WorkbookRenderer);
installPivotInteraction(Interaction as unknown as { prototype: Record<string, unknown> });
installFallbacks(GC);
// These methods belong to the separately loaded IO add-on. The reference core
// exposes undefined until that add-on patches the shared Workbook constructor.
for (const method of ['import', 'export', 'open', 'save'])
  Object.defineProperty(Workbook.prototype, method, { value: undefined, writable: true, configurable: true });
export const Data = GC.Data;
export { userColor, blocksToText } from './threaded-comments.js';
export default GC;
