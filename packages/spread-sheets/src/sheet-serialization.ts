/**
 * SSJSON serialization for `Worksheet`: the bodies of
 * `Worksheet.toJSON()` / `Worksheet.fromJSON()`, moved out of
 * `worksheet.ts` unchanged (`this` renamed to the `sheet` parameter).
 */
import { GC } from './generated/enums.js';
import { Sparkline, SparklineGroup, SparklineSetting } from './features/sparklines.js';
import { AxisLayout } from './structures.js';
import { clone, Range, Style } from './primitives.js';
import { autoMergeInfosFromJSON, autoMergeInfosToJSON } from './auto-merge.js';
import { coalesceSharedFormulas, expandSharedFormula } from './sheet-shared-formulas.js';
import { designerSerializationMode } from './serialization-mode.js';
import { Comment } from './comments.js';
import { rangeToAddress, validatorFromJSON } from './features/data-validation.js';
import { filterFromJSON } from './features/filters.js';
import { isSlicerShapeJson } from './features/slicers/shapes-section.js';
import { isRealPasswordVerifier } from './protection.js';
import {
  deserializeValue,
  list,
  mergeOptions,
  object,
  optionDifferences,
  serializeValue,
  styleFromJSON,
  styleToJSON,
  type JsonRecord,
} from './serialization.js';
import worksheetDefaults from './worksheet-defaults.json';
import {
  type CellData,
  type SerializationOptions,
} from './sheet-common.js';
import type { Worksheet } from './worksheet.js';

const { SheetArea } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

export function worksheetToJSON(sheet: Worksheet, options: SerializationOptions = {}): JsonRecord {
    const result: JsonRecord = {
      ...clone(sheet.extraJSON),
      name: sheet.sheetName,
      isSelected: sheet.settings.isSelected ?? (!sheet.parent || sheet.parent.getActiveSheet() === sheet),
      visible: sheet.settings.visible,
      theme: sheet.settings.theme ?? 'Office',
    };
    const put = (key: string, value: unknown, defaultValue: unknown) => {
      if (JSON.stringify(value) !== JSON.stringify(defaultValue)) result[key] = value;
    };
    put('rowCount', sheet.rows.count, 200);
    put('columnCount', sheet.cols.count, 20);
    put('rowHeaderColCount', sheet.headerCols.count, 1);
    put('colHeaderRowCount', sheet.headerRows.count, 1);
    put('activeRow', sheet.activeRow, 0);
    put('activeCol', sheet.activeCol, 0);
    for (const key of [
      'zoomFactor',
      'frozenRowCount',
      'frozenColCount',
      'frozenTrailingRowCount',
      'frozenTrailingColCount',
      'showRowOutline',
      'showColumnOutline',
    ])
      put(key, sheet.settings[key], key === 'zoomFactor' ? 1 : key.startsWith('show') ? true : 0);
    // Stick-to-edge is the second argument of the public frozen-trailing setters.
    // Like the trial, it is only serialised once it differs from the default `true`.
    put('frozenTrailingRowStickToEdge', sheet.settings.frozenTrailingRowStickToEdge ?? true, true);
    put('frozenTrailingColumnStickToEdge', sheet.settings.frozenTrailingColumnStickToEdge ?? true, true);
    let sharedFormulas: JsonRecord | undefined;
    for (const [area, key] of [
      [VIEW, 'data'],
      [SheetArea.rowHeader, 'rowHeaderData'],
      [SheetArea.colHeader, 'colHeaderData'],
    ] as const) {
      const data = sheet.area(area),
        serialized: JsonRecord = {},
        table: JsonRecord = {};      for (const [r, c, cell] of data.cells.entries()) {
        const node: JsonRecord = {};
        for (const [property, value] of Object.entries(cell)) {
          if (property === 'style') {
            if (!options.ignoreStyle) node.style = styleToJSON(cell.style);
          } else if (property === 'formula') {
            if (!options.ignoreFormula) node.formula = value;
          } else if (property === 'validator') {
            // Validators are serialised once per range in sheet.validations.
          } else node[property] = serializeValue(value);
        }
        if (options._ioArrayInfo && node.formula && !node.arrayInfo) {
          const spill = sheet.calcEngine?.getSpillRange?.(sheet, r, c);
          if (cell.arrayFormula) node.arrayInfo = { row: r, col: c, ...cell.arrayFormula };
          else if (spill) node.arrayInfo = { row: r, col: c, rowCount: spill.r2 - r + 1, colCount: spill.c2 - c + 1, isDynamicArray: true };
        }
        if (Object.keys(node).length) {
          const row = object(table[r]);
          row[c] = node;
          table[r] = row;
        }
      }
      if (Object.keys(table).length) {
        serialized.dataTable = table;
        // Trial parity (TASK 75): equal relative formula patterns coalesce into
        // sheet-level `sharedFormulas` groups, members serialise as `{si: n}`.
        if (area === VIEW && !options.ignoreFormula && designerSerializationMode()) {
          sharedFormulas = coalesceSharedFormulas(table);
        }
      }
      if (!options.ignoreStyle) {
        for (const [styles, name] of [
          [data.rowStyles, 'rowDataArray'],
          [data.colStyles, 'columnDataArray'],
        ] as const)
          if (styles.size) {
            const array: unknown[] = [];
            for (const [index, style] of styles) array[index] = { style: styleToJSON(style) };
            serialized[name] = array;
          }
      }
      const defaultNode: JsonRecord = {};
      if (!options.ignoreStyle) defaultNode.style = styleToJSON(data.defaultStyle);
      if (data.tag !== undefined) defaultNode.tag = serializeValue(data.tag);
      if (Object.keys(defaultNode).length) serialized.defaultDataNode = defaultNode;
      result[key] = serialized;
    }
    for (const [axis, key] of [
      [sheet.rows, 'rows'],
      [sheet.cols, 'columns'],
      [sheet.headerCols, 'rowHeaderColInfos'],
      [sheet.headerRows, 'colHeaderRowInfos'],
    ] as const) {
      const entries = new Map<number, JsonRecord>(axis.entries()),
        meta = sheet.metadata.get(axis);
      if (meta) for (const [i, value] of meta) entries.set(i, { ...entries.get(i), ...value });
      /* Trial (TASK 75 r3 probe): rows/columns hidden by an outline collapse are NOT
       * serialised as `visible: false` — the outline entry's `viewCollapsed` restores the
       * hidden state on load (see Outline.fromJSON). */
      if (key === 'rows' || key === 'columns') {
        const outline = key === 'rows' ? sheet.rowOutlines : sheet.columnOutlines;
        for (const [i, v] of [...entries]) {
          if (v.visible === false && outline.isCollapsed(i)) {
            delete v.visible;
            if (!Object.keys(v).length) entries.delete(i);
          }
        }
      }
      if (entries.size) {
        const array: unknown[] = [];
        for (const [i, v] of entries) array[i] = v;
        result[key] = array;
      }
    }
    result.defaultData = {};
    result.leftCellIndex = sheet.settings.leftCellIndex;
    result.topCellIndex = sheet.settings.topCellIndex;
    for (const [area, key] of [
      [VIEW, 'spans'],
      [SheetArea.rowHeader, 'rowHeaderSpan'],
      [SheetArea.colHeader, 'colHeaderSpan'],
    ] as const) {
      const spans = sheet.area(area).spans;
      if (spans.length)
        result[key] = spans.map((s) => ({
          row: s.row,
          col: s.col,
          rowCount: s.rowCount,
          colCount: s.colCount,
        }));
    }
    result.selections = {
      ...Object.fromEntries(
        sheet.selections.map((s, i) => [
          i,
          { row: s.row, col: s.col, rowCount: s.rowCount, colCount: s.colCount },
        ]),
      ),
      length: sheet.selections.length,
    };
    result.rowOutlines = sheet.rowOutlines.toJSON();
    result.columnOutlines = sheet.columnOutlines.toJSON();
    if (sheet.validationRecords.length)
      result.validations = sheet.validationRecords.map((record) => {
        record.validator._ranges(record.ranges);
        const json = record.validator.toJSON();
        json.ranges = record.ranges.map(rangeToAddress).join(', ');
        return json;
      });
    const conditionalJSON = sheet.conditionalFormats.toJSON();
    if (conditionalJSON.rules) result.conditionalFormats = conditionalJSON;
    if (sheet.tables._hasAny()) result.tables = sheet.tables.all().map((table) => table.toJSON());
    if (sheet.pivotTables._hasAny()) result.pivotTables = sheet.pivotTables._list().map((table: { _toJSON(): Record<string, unknown> }) => table._toJSON());
    if (sheet.sparklineCells.size) result.sparklineGroups = [...new Set([...sheet.sparklineCells.values()].map(s => s.group() as SparklineGroup))].map(g => g.toJSON());
    if (sheet.rowFilterValue) result.rowFilter = sheet.rowFilterValue.toJSON();
    if (!sheet.sparklineCells.size) delete result.sparklineGroups;
    const objects = [...sheet.floatingObjects.all(), ...sheet.pictures.all()];
    if (objects.length) result.floatingObjects = objects.map(o => o.toJSON()); else delete result.floatingObjects;
    const slicerShapes = sheet.slicers._count() ? sheet.slicers._toShapesJSON() : [];
    const chartShapes = sheet.charts._toShapesJSON();
    const dataChartShapes = sheet.dataCharts._toShapesJSON();
    if (sheet.shapes.all().length || slicerShapes.length || chartShapes.length || dataChartShapes.length)
      result.shapes = [...sheet.shapes.toJSON(), ...slicerShapes, ...chartShapes, ...dataChartShapes];
    else delete result.shapes;
    if (sheet.charts._hasFlag()) result.preserveUnsupportedChartFlag = sheet.charts.preserveUnsupportedChart() ?? false;
    else delete result.preserveUnsupportedChartFlag;
    if (sheet.slicers.all().length) result.slicers = sheet.slicers.toJSON(); else delete result.slicers;
    result.cellStates = sheet.cellStates._toJSON();
    result.states ??= {};
    result.outlineColumnOptions ??= {};
    result.autoMergeRangeInfos = autoMergeInfosToJSON(sheet);
    if (sheet.comments.all().length) result.comments = sheet.comments.all().map((c) => c.toJSON());
    const commentStyles = sheet.comments._toSheetJSON();
    if (Object.keys(commentStyles).length) result.c = commentStyles;
    if (sheet.threadedComments.size()) result.threadedComments = sheet.threadedComments.toJSON();
    if (sheet.names.size) result.names = sheet.getCustomNames().map((n) => n.toJSON());
    Object.assign(result, optionDifferences(sheet.options, worksheetDefaults));
    if (!options.ignoreStyle && sheet.namedStyles.size)
      result.namedStyles = sheet.getNamedStyles().map(styleToJSON);
    const defaults = optionDifferences(sheet.dimensions, {
      rowHeight: 20,
      colWidth: 62,
      colHeaderRowHeight: 20,
      rowHeaderColWidth: 40,
    });
    if (Object.keys(defaults).length) result.defaults = defaults;
    // Designer-build parity (TASK 75): the Designer core always serialises print
    // settings with the default paper size; the plain build stays lazy.
    if (sheet._printInfo !== undefined || sheet._printInfoJSON !== undefined || designerSerializationMode())
      result.printInfo = sheet.printInfo()._toJSON();
    const backgroundImage = sheet._backgroundImageJSON();
    if (backgroundImage) result.backgroundImage = backgroundImage;
    // Trial (TASK 75 sweep): only the sheet option `printLineVisible` persists (through
    // the options diff above); the runtime `isPrintLineVisible()` toggle (the ribbon
    // command) is view-only and must not appear in the JSON.
    if (sheet.sortStateValue) result.sortState = { ...sheet.sortStateValue };
    if (sharedFormulas) result.sharedFormulas = sharedFormulas;
    return serializeValue(result) as JsonRecord;
}

export function worksheetFromJSON(sheet: Worksheet, settings: object): void {
    const json = object(settings);
    sheet._ioThemeColors = undefined;
    sheet._printInfo = undefined;
    sheet._printInfoJSON = json.printInfo ? { ...(json.printInfo as Record<string, unknown>) } : undefined;
    autoMergeInfosFromJSON(sheet, json.autoMergeRangeInfos);
    const background = json.backgroundImage;
    sheet._backgroundImage =
      background && typeof background === 'object'
        ? {
          src: (background as Record<string, unknown>).src ? String((background as Record<string, unknown>).src) : null,
          layout: (background as Record<string, unknown>).layout === 'repeat' ? 'repeat' : (background as Record<string, unknown>).layout === 'none' ? 'none' : undefined,
          paintOrder: (background as Record<string, unknown>).paintOrder === 'over-content' ? 'over-content' : (background as Record<string, unknown>).paintOrder === 'normal' ? 'normal' : undefined,
        }
        : { src: typeof background === 'string' && background ? background : null };
    sheet.areas.clear();
    sheet.viewCellStore = undefined;
    sheet.viewAreaCache = undefined;
    sheet.namedStyles.clear();
    sheet.names.clear();
    sheet.comments.clear();
    sheet.threadedComments.clear();
    sheet.dirty.clear();
    sheet.calcQueue.clear();
    sheet.metadata.clear();
    sheet.sheetName = String(json.name ?? sheet.sheetName);
    sheet.rows = new AxisLayout(Number(json.rowCount ?? 200), 20);
    sheet.cols = new AxisLayout(Number(json.columnCount ?? 20), 62);
    sheet.headerRows = new AxisLayout(Number(json.colHeaderRowCount ?? 1), 20);
    sheet.headerCols = new AxisLayout(Number(json.rowHeaderColCount ?? 1), 40);
    Object.assign(sheet.dimensions, {
      rowHeight: 20,
      colWidth: 62,
      colHeaderRowHeight: 20,
      rowHeaderColWidth: 40,
    });
    for (const [key, value] of Object.entries(object(json.defaults))) {
      if (key in sheet.dimensions && typeof value === 'number') Reflect.set(sheet.defaults, key, value);
    }
    sheet.activeRow = Number(json.activeRow ?? 0);
    sheet.activeCol = Number(json.activeCol ?? 0);
    if (json.sortState) sheet.sortStateValue = { ...(json.sortState as Record<string, unknown>) } as never;
    sheet.settings = {
      visible: 1,
      zoomFactor: 1,
      frozenRowCount: 0,
      frozenColCount: 0,
      frozenTrailingRowCount: 0,
      frozenTrailingColCount: 0,
      frozenTrailingRowStickToEdge: true,
      frozenTrailingColumnStickToEdge: true,
      showRowOutline: true,
      showColumnOutline: true,
      leftCellIndex: 0,
      topCellIndex: 0,
    };
    for (const key of [...Object.keys(sheet.settings), 'theme'])
      if (json[key] !== undefined) sheet.settings[key] = json[key];
    if (!sheet.parent && json.isSelected !== undefined) sheet.settings.isSelected = json.isSelected;
    for (const key of Object.keys(sheet.options)) delete sheet.options[key];
    Object.assign(sheet.options, clone(worksheetDefaults));
    for (const key of [
      ...Object.keys(worksheetDefaults),
      'sheetTabColor',
      'selectionBackColor',
      'selectionBorderColor',
    ])
      if (json[key] !== undefined) mergeOptions(sheet.options, { [key]: json[key] });
    /* Trial (TASK 75 sweep): the serialized flag corresponds to the sheet OPTION; load
     * it AFTER the options rebuild above (the round-2 placement was wiped by the reset). */
    if (json.printLineVisible === true) sheet.options.printLineVisible = true;
    sheet._passwordRequired = !!sheet.options.isProtected && isRealPasswordVerifier(sheet.options.protectionOptions as JsonRecord);
    const sharedRecord = object(json.sharedFormulas);
    const sharedGroups = new Map<string, { text: string; baseRow: number; baseColumn: number }>();
    for (const [si, raw] of Object.entries(sharedRecord)) {
      if (si === 'nextIndex') continue;
      const g = object(raw);
      if (typeof g.formula === 'string')
        sharedGroups.set(si, { text: g.formula, baseRow: Number(g.baseRow ?? 0), baseColumn: Number(g.baseColumn ?? 0) });
    }
    for (const [area, key] of [
      [VIEW, 'data'],
      [SheetArea.rowHeader, 'rowHeaderData'],
      [SheetArea.colHeader, 'colHeaderData'],
    ] as const) {
      const raw = object(json[key]),
        data = sheet.area(area);
      for (const [r, row] of Object.entries(object(raw.dataTable)))
        for (const [c, node] of Object.entries(object(row))) {
          const cell = deserializeValue(node) as CellData;
          if (object(node).style !== undefined) cell.style = styleFromJSON(object(node).style);
          if (cell.formula !== undefined && typeof cell.formula === 'object') {
            const group = sharedGroups.get(String((cell.formula as JsonRecord).si));
            const text = group && expandSharedFormula(group.text, group.baseRow, group.baseColumn, +r, +c);
            if (text) cell.formula = text;
            else delete cell.formula;
          }
          data.cells.set(+r, +c, cell);
        }
      for (const [map, name] of [
        [data.rowStyles, 'rowDataArray'],
        [data.colStyles, 'columnDataArray'],
      ] as const)
        for (const [i, node] of Object.entries(object(raw[name])))
          if (node && object(node).style !== undefined) map.set(+i, styleFromJSON(object(node).style));
      const node = object(raw.defaultDataNode);
      if (node.style !== undefined) {
        const style = styleFromJSON(node.style);
        data.defaultStyle =
          typeof style === 'string' ? Object.assign(new Style(), { parentName: style }) : style;
      }
      data.tag = deserializeValue(node.tag);
    }
    for (const [axis, key] of [
      [sheet.rows, 'rows'],
      [sheet.cols, 'columns'],
      [sheet.headerCols, 'rowHeaderColInfos'],
      [sheet.headerRows, 'colHeaderRowInfos'],
    ] as const)
      for (const [i, raw] of Object.entries(object(json[key]))) {
        if (!raw) continue;
        const node = object(raw);
        if (typeof node.size === 'number') axis.setSize(+i, node.size);
        if (node.visible === false) axis.setVisible(+i, false);
        // Trial (TASK 75): an explicit `visible: true` record survives a load/save round-trip.
        else if (node.visible === true) axis.setVisible(+i, true);
        const metadata = { ...node };
        delete metadata.size;
        delete metadata.visible;
        if (Object.keys(metadata).length) {
          let map = sheet.metadata.get(axis);
          if (!map) sheet.metadata.set(axis, (map = new Map()));
          map.set(+i, metadata);
        }
      }
    for (const [area, key] of [
      [VIEW, 'spans'],
      [SheetArea.rowHeader, 'rowHeaderSpan'],
      [SheetArea.colHeader, 'colHeaderSpan'],
    ] as const)
      for (const raw of list(json[key])) {
        const s = object(raw);
        sheet.area(area).spans.push(
          new Range(Number(s.row), Number(s.col), Number(s.rowCount), Number(s.colCount)),
        );
      }
    const selections = object(json.selections);
    sheet.selections =
      json.selections === undefined
        ? [new Range(0, 0, 1, 1)]
        : Object.entries(selections)
            .filter(([key]) => key !== 'length')
            .map(([, raw]) => {
              const s = object(raw);
              return new Range(Number(s.row), Number(s.col), Number(s.rowCount), Number(s.colCount));
            });
    for (const raw of list(json.namedStyles)) {
      const style = styleFromJSON(raw);
      if (typeof style !== 'string') sheet.addNamedStyle(style);
    }
    for (const raw of list(json.names)) {
      const n = object(raw);
      sheet.addCustomName(
        String(n.name),
        String(n.formula),
        Number(n.row ?? 0),
        Number(n.col ?? 0),
        n.comment as string | undefined,
        Boolean(n.isReadOnly),
      );
    }
    for (const raw of list(json.comments)) {
      const c = new Comment();
      c.fromJSON(object(raw));
      sheet.comments.set(c.rowIndex(), c.colIndex(), c);
    }
    if (json.c && typeof json.c === 'object') sheet.comments._fromSheetJSON(json.c as JsonRecord);
    if (json.threadedComments && typeof json.threadedComments === 'object')
      sheet.threadedComments.fromJSON(json.threadedComments as JsonRecord);
    sheet.validationRecords = [];
    for (const raw of list(json.validations)) {
      const record = validatorFromJSON(raw);
      sheet.validationRecords.push(record.record);
      for (const rect of record.record.ranges)
        for (let r = rect.row; r < rect.row + rect.rowCount; r++)
          for (let c = rect.col; c < rect.col + rect.colCount; c++)
            sheet.ensure(r, c).validator = record.validator;
    }
    sheet.floatingObjects._fromJSON(list(json.floatingObjects).map(object));
    sheet.pictures._fromJSON(list(json.floatingObjects).map(object));
    sheet.shapes._fromJSON(list(json.shapes).map(object).filter(o => !isSlicerShapeJson(o) && Number(o.shapeType) !== 8 && Number(o.shapeType) !== 9));
    sheet.charts._fromShapesJSON(list(json.shapes).map(object).filter(o => Number(o.shapeType) === 8));
    sheet.dataCharts._fromShapesJSON(list(json.shapes).map(object).filter(o => Number(o.shapeType) === 9));
    sheet.sparklineCells.clear();
    for (const raw of list(json.sparklineGroups)) {
      const g = object(raw), setting = new SparklineSetting(object(g.setting) as Record<string, string | number | boolean>), group = new SparklineGroup(Number(g.sparklineType), setting);
      for (const data of list(g.sparklines)) { const spark = Sparkline.fromJSON(object(data), group.sparklineType, setting); spark._sheet = sheet; group.add(spark); sheet.sparklineCells.set(`${spark.row}:${spark.column}`, spark); }
    }
    sheet.conditionalFormats.fromJSON(json.conditionalFormats ?? {});
    sheet.cellStates._fromJSON(json.cellStates);
    sheet.tables._clear();
    sheet.tables._fromJSON(json.tables);
    sheet.slicers.fromJSON(json.slicers);
    sheet.rowOutlines.fromJSON(json.rowOutlines ?? { items: [] });
    sheet.columnOutlines.fromJSON(json.columnOutlines ?? { items: [] });
    if (json.rowFilter) {
      const filter = filterFromJSON(json.rowFilter);
      sheet.rowFilterValue = filter;
      filter._attach(sheet);
      for (const row of ((json.rowFilter as JsonRecord).filteredOutRows as number[] | undefined) ?? [])
        sheet.setRowVisible(row, false);
    } else sheet.rowFilterValue = null;
    const known = new Set([
      'name',
      'rowCount',
      'columnCount',
      'rowHeaderColCount',
      'colHeaderRowCount',
      'activeRow',
      'activeCol',
      'data',
      'rowHeaderData',
      'colHeaderData',
      'rows',
      'columns',
      'rowHeaderColInfos',
      'colHeaderRowInfos',
      'defaultData',
      'spans',
      'rowHeaderSpan',
      'colHeaderSpan',
      'selections',
      'comments',
      'c',
      'threadedComments',
      'validations',
      'conditionalFormats',
      'cellStates',
      'tables',
      'pivotTables',
      'slicers',
      'rowFilter',
      'rowOutlines',
      'columnOutlines',
      'namedStyles',
      'names',
      'defaults',
      'index',
      'order',
      'isSelected',
      'printInfo',
      'sharedFormulas',
      'sortState',
      'backgroundImage',
      'gantt',
      ...Object.keys(sheet.settings),
      ...Object.keys(sheet.options),
    ]);
    sheet.extraJSON = Object.fromEntries(
      Object.entries(json)
        .filter(([key]) => !known.has(key))
        .map(([key, value]) => [key, clone(value)]),
    );
    sheet.invalidateLayout();
}
