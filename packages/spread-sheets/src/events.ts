export class Events {
  static ActiveSheetChanged = 'ActiveSheetChanged';
  static ActiveSheetChanging = 'ActiveSheetChanging';
  static BeforePrint = 'BeforePrint';
  static ButtonClicked = 'ButtonClicked';
  static CalculationProgress = 'CalculationProgress';
  static CellChanged = 'CellChanged';
  static CellClick = 'CellClick';
  static CellDoubleClick = 'CellDoubleClick';
  static ClipboardChanged = 'ClipboardChanged';
  static ClipboardChanging = 'ClipboardChanging';
  static ClipboardPasted = 'ClipboardPasted';
  static ClipboardPasting = 'ClipboardPasting';
  static CollaborationEndRedo = 'CollaborationEndRedo';
  static CollaborationEndUndo = 'CollaborationEndUndo';
  static CollaborationStartRedo = 'CollaborationStartRedo';
  static CollaborationStartUndo = 'CollaborationStartUndo';
  static ColumnChanged = 'ColumnChanged';
  static ColumnChanging = 'ColumnChanging';
  static ColumnWidthChanged = 'ColumnWidthChanged';
  static ColumnWidthChanging = 'ColumnWidthChanging';
  static CommentChanged = 'CommentChanged';
  static CommentRemoved = 'CommentRemoved';
  static CommentRemoving = 'CommentRemoving';
  static DataFetchCompleted = 'DataFetchCompleted';
  static DragDropBlock = 'DragDropBlock';
  static DragDropBlockCompleted = 'DragDropBlockCompleted';
  static DragFillBlock = 'DragFillBlock';
  static DragFillBlockCompleted = 'DragFillBlockCompleted';
  static DragMerged = 'DragMerged';
  static DragMerging = 'DragMerging';
  static EditChange = 'EditChange';
  static EditEnded = 'EditEnded';
  static EditEnding = 'EditEnding';
  static EditorStatusChanged = 'EditorStatusChanged';
  static EditStarting = 'EditStarting';
  static EnterCell = 'EnterCell';
  static FloatingObjectChanged = 'FloatingObjectChanged';
  static FloatingObjectLoaded = 'FloatingObjectLoaded';
  static FloatingObjectRemoved = 'FloatingObjectRemoved';
  static FloatingObjectRemoving = 'FloatingObjectRemoving';
  static FloatingObjectSelectionChanged = 'FloatingObjectSelectionChanged';
  static FormControlButtonClicked = 'FormControlButtonClicked';
  static FormControlValueChanged = 'FormControlValueChanged';
  static InvalidOperation = 'InvalidOperation';
  static LeaveCell = 'LeaveCell';
  static LeftColumnChanged = 'LeftColumnChanged';
  static OutlineColumnCheckStatusChanged = 'OutlineColumnCheckStatusChanged';
  static PermissionChanged = 'PermissionChanged';
  static PictureChanged = 'PictureChanged';
  static PictureSelectionChanged = 'PictureSelectionChanged';
  static PivotTableChanged = 'PivotTableChanged';
  static PivotTableChanging = 'PivotTableChanging';
  static RangeChanged = 'RangeChanged';
  static RangeFilterCleared = 'RangeFilterCleared';
  static RangeFilterClearing = 'RangeFilterClearing';
  static RangeFiltered = 'RangeFiltered';
  static RangeFiltering = 'RangeFiltering';
  static RangeGroupStateChanged = 'RangeGroupStateChanged';
  static RangeGroupStateChanging = 'RangeGroupStateChanging';
  static RangeSorted = 'RangeSorted';
  static RangeSorting = 'RangeSorting';
  static ReportGenerationStageChanged = 'ReportGenerationStageChanged';
  static ReportSheetDataChanged = 'ReportSheetDataChanged';
  static ReportSheetDataChanging = 'ReportSheetDataChanging';
  static ReportSheetRecordsSubmitted = 'ReportSheetRecordsSubmitted';
  static ReportSheetRecordsSubmitting = 'ReportSheetRecordsSubmitting';
  static RowChanged = 'RowChanged';
  static RowChanging = 'RowChanging';
  static RowHeightChanged = 'RowHeightChanged';
  static RowHeightChanging = 'RowHeightChanging';
  static RowOperation = 'RowOperation';
  static ScenarioChanged = 'ScenarioChanged';
  static ScenarioChanging = 'ScenarioChanging';
  static SelectionChanged = 'SelectionChanged';
  static SelectionChanging = 'SelectionChanging';
  static ShapeChanged = 'ShapeChanged';
  static ShapeRemoved = 'ShapeRemoved';
  static ShapeRemoving = 'ShapeRemoving';
  static ShapeSelectionChanged = 'ShapeSelectionChanged';
  static SheetChanged = 'SheetChanged';
  static SheetChanging = 'SheetChanging';
  static SheetMoved = 'SheetMoved';
  static SheetMoving = 'SheetMoving';
  static SheetNameChanged = 'SheetNameChanged';
  static SheetNameChanging = 'SheetNameChanging';
  static SheetTabClick = 'SheetTabClick';
  static SheetTabDoubleClick = 'SheetTabDoubleClick';
  static SlicerChanged = 'SlicerChanged';
  static SparklineChanged = 'SparklineChanged';
  static TableColumnsChanged = 'TableColumnsChanged';
  static TableFilterCleared = 'TableFilterCleared';
  static TableFilterClearing = 'TableFilterClearing';
  static TableFiltered = 'TableFiltered';
  static TableFiltering = 'TableFiltering';
  static TableResized = 'TableResized';
  static TableResizing = 'TableResizing';
  static TableRowsChanged = 'TableRowsChanged';
  static TableSheetFilterCleared = 'TableSheetFilterCleared';
  static TableSheetFilterClearing = 'TableSheetFilterClearing';
  static TableSheetFiltered = 'TableSheetFiltered';
  static TableSheetFiltering = 'TableSheetFiltering';
  static TableSheetSortCleared = 'TableSheetSortCleared';
  static TableSheetSortClearing = 'TableSheetSortClearing';
  static TableSheetSorted = 'TableSheetSorted';
  static TableSheetSorting = 'TableSheetSorting';
  static ThreadedCommentChanged = 'ThreadedCommentChanged';
  static ThreadedCommentChanging = 'ThreadedCommentChanging';
  static TopRowChanged = 'TopRowChanged';
  static TouchToolStripOpening = 'TouchToolStripOpening';
  static UserFormulaEntered = 'UserFormulaEntered';
  static UserMentioned = 'UserMentioned';
  static UserMentioning = 'UserMentioning';
  static ValidationError = 'ValidationError';
  static ValueChanged = 'ValueChanged';
  static ViewZoomed = 'ViewZoomed';
  static ViewZooming = 'ViewZooming';
}

export interface ModelEvent {
  type: string;
  namespace: string;
  target: unknown;
  data?: unknown;
  preventDefault(): void;
  isDefaultPrevented(): boolean;
}
export type EventInfo = Record<string, unknown>;
export type EventHandler = (event: ModelEvent, info: EventInfo) => void;
interface Binding {
  type: string;
  namespaces: string[];
  data: unknown;
  handler: EventHandler;
}
export class EventHub {
  depth = 0;
  private bindings: Binding[] = [];
  constructor(private target: object) {}
  bind(types: string, data?: unknown, fn?: EventHandler): void {
    const handler = fn ?? (typeof data === 'function' ? (data as EventHandler) : undefined);
    if (!handler) return;
    for (const token of types.trim().split(/\s+/)) {
      const [type, ...namespaces] = token.split('.');
      if (type)
        this.bindings.push({ type, namespaces: namespaces.sort(), data: fn ? data : undefined, handler });
    }
  }
  unbind(types: string, handler?: EventHandler): void {
    for (const token of types.trim().split(/\s+/)) {
      const [type, ...namespaces] = token.split('.');
      this.bindings = this.bindings.filter(
        (b) =>
          !(
            (!type || b.type === type) &&
            namespaces.every((n) => b.namespaces.includes(n)) &&
            (!handler || b.handler === handler)
          ),
      );
    }
  }
  unbindAll(): void {
    this.bindings = [];
  }
  has(type: string): boolean { return this.bindings.some(binding => binding.type === type); }
  emit(type: string, info: EventInfo): void {
    if (this.depth || !this.bindings.length) return;
    for (const binding of [...this.bindings])
      if (binding.type === type) {
        let prevented = false;
        binding.handler.call(
          this.target,
          {
            type,
            namespace: binding.namespaces.join('.'),
            target: this.target,
            data: binding.data,
            preventDefault() {
              prevented = true;
            },
            isDefaultPrevented() {
              return prevented;
            },
          },
          info,
        );
      }
  }
}

/**
 * `GC.Spread.Common.Events` (TASK 44). Trial reflection: constructible class
 * with no instance members; holds the static user-event name
 * `CurrentUserChanged` (trial: `typeof === 'string'`, length 18).
 */
export class CommonEvents {
  static CurrentUserChanged = 'CurrentUserChanged';
}
