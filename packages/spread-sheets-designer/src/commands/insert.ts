/* Insert-tab model actions: pictures, shapes, camera, form controls, text boxes,
 * sparklines and barcodes. Every command writes through the public sheet model so
 * the workbook JSON (and the paired browser specs) observe the same state as the trial. */
import type { DesignerApi as Designer } from '../designer-api.js';
import type GC from '@mescius/spread-sheets';
import type { DesignerShape, GCRoot, SelectionRange, Worksheet } from '../core-internals.js';
import { chartsOf, extendView, recordView, shapesOf } from '../core-internals.js';

const activeSheet = (d: Designer): Worksheet => d.getWorkbook().getActiveSheet();
const activeRanges = (sheet: Worksheet): SelectionRange[] => {
  const ranges = sheet.getSelections();
  if (ranges.length) return ranges;
  const r = sheet.getActiveRowIndex(), c = sheet.getActiveColumnIndex();
  return [{ row: r, col: c, rowCount: 1, colCount: 1 }];
};

/** Shape constructor in our core's argument form (the contract lists only the `(sheet, name, model, ...)` shape). */
type ShapeCtor = new (name: string, autoShapeType: number, x: number, y: number, width: number, height: number) => DesignerShape;
const shapeCtor = (GC: GCRoot): ShapeCtor => {
  const ShapeClass = GC.Spread.Sheets.Shapes.Shape;
  return extendView<ShapeCtor, typeof ShapeClass>(ShapeClass);
};

/* Gallery metadata. The category names, item ids and order are transcribed from the
 * running trial's shape gallery DOM (`insert-shape-item-<id>` classes); geometry names
 * are the public AutoShapeType presets. */
export interface ShapeGalleryEntry { id: string; preset: string; startArrow?: boolean; endArrow?: boolean }
export interface ShapeGalleryGroup { title: string; items: ShapeGalleryEntry[] }

const CONNECTORS: ShapeGalleryEntry[] = [
  { id: 'noHeadStraight', preset: 'line' },
  { id: 'endArrowHeadStraight', preset: 'line', endArrow: true },
  { id: 'beginEndArrowHeadStraight', preset: 'line', startArrow: true, endArrow: true },
  { id: 'Elbow', preset: 'Elbow' },
  { id: 'endArrowHeadElbow', preset: 'Elbow', endArrow: true },
  { id: 'beginEndArrowHeadElbow', preset: 'Elbow', startArrow: true, endArrow: true },
  { id: 'Curved', preset: 'Curved' },
  { id: 'endArrowHeadCurved', preset: 'Curved', endArrow: true },
  { id: 'beginEndArrowHeadCurved', preset: 'Curved', startArrow: true, endArrow: true },
];
const RECTANGLES: ShapeGalleryEntry[] = [
  'rectangle', 'roundedRectangle', 'snip1Rectangle', 'snip2SameRectangle', 'snip2DiagRectangle',
  'snipRoundRectangle', 'round1Rectangle', 'round2SameRectangle', 'round2DiagRectangle',
].map(id => ({ id, preset: id }));
const BASIC_SHAPES: ShapeGalleryEntry[] = [
  'hor-text-box', 'oval', 'isoscelesTriangle', 'rightTriangle', 'parallelogram', 'trapezoid', 'diamond',
  'regularPentagon', 'hexagon', 'heptagon', 'octagon', 'decagon', 'dodecagon', 'pie', 'chord', 'tear',
  'frame', 'halfFrame', 'corner', 'diagonalStripe', 'cross', 'plaque', 'can', 'cube', 'bevel', 'donut',
  'noSymbol', 'blockArc', 'foldedCorner', 'smileyFace', 'heart', 'lightningBolt', 'sun', 'moon', 'cloud',
  'arc', 'doubleBracket', 'doubleBrace', 'leftBracket', 'rightBracket', 'leftBrace', 'rightBrace',
  'upDownArrowCallout', 'actionButtonHome', 'actionButtonHelp', 'actionButtonInformation',
  'actionButtonBackorPrevious', 'actionButtonForwardorNext', 'actionButtonBeginning', 'actionButtonEnd',
  'actionButtonReturn', 'actionButtonDocument', 'actionButtonSound', 'actionButtonMovie',
  'flowchartOfflineStorage', 'leftRightRibbon', 'chartStar', 'chartPlus', 'lineInverse',
  'leftCircularArrow', 'leftRightCircularArrow', 'swooshArrow', 'chartX', 'gear6', 'gear9', 'funnel',
  'pieWedge', 'nonIsoscelesTrapezoid', 'cornerTabs', 'squareTabs', 'plaqueTabs',
].map(id => ({ id, preset: id }));
const BLOCK_ARROWS: ShapeGalleryEntry[] = [
  'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'leftRightArrow', 'upDownArrow', 'quadArrow',
  'leftRightUpArrow', 'bentArrow', 'uTurnArrow', 'leftUpArrow', 'bentUpArrow', 'curvedRightArrow',
  'curvedLeftArrow', 'curvedUpArrow', 'curvedDownArrow', 'stripedRightArrow', 'notchedRightArrow',
  'pentagon', 'chevron', 'rightArrowCallout', 'downArrowCallout', 'leftArrowCallout', 'upArrowCallout',
  'leftRightArrowCallout', 'quadArrowCallout', 'circularArrow',
].map(id => ({ id, preset: id }));
const EQUATION: ShapeGalleryEntry[] = ['mathPlus', 'mathMinus', 'mathMultiply', 'mathDivide', 'mathEqual', 'mathNotEqual'].map(id => ({ id, preset: id }));
const FLOWCHART: ShapeGalleryEntry[] = [
  'flowchartProcess', 'flowchartAlternateProcess', 'flowchartDecision', 'flowchartData',
  'flowchartPredefinedProcess', 'flowchartInternalStorage', 'flowchartDocument', 'flowchartMultidocument',
  'flowchartTerminator', 'flowchartPreparation', 'flowchartManualInput', 'flowchartManualOperation',
  'flowchartConnector', 'flowchartOffpageConnector', 'flowchartCard', 'flowchartPunchedTape',
  'flowchartSummingJunction', 'flowchartOr', 'flowchartCollate', 'flowchartSort', 'flowchartExtract',
  'flowchartMerge', 'flowchartStoredData', 'flowchartDelay', 'flowchartSequentialAccessStorage',
  'flowchartMagneticDisk', 'flowchartDirectAccessStorage', 'flowchartDisplay',
].map(id => ({ id, preset: id }));
const STARS: ShapeGalleryEntry[] = [
  'explosion1', 'explosion2', 'shape4pointStar', 'shape5pointStar', 'star6Point', 'star7Point',
  'shape8pointStar', 'star10Point', 'star12Point', 'shape16pointStar', 'shape24pointStar',
  'shape32pointStar', 'upRibbon', 'downRibbon', 'curvedUpRibbon', 'curvedDownRibbon',
  'verticalScroll', 'horizontalScroll', 'wave', 'doubleWave',
].map(id => ({ id, preset: id }));
const CALLOUTS: ShapeGalleryEntry[] = [
  'rectangularCallout', 'roundedRectangularCallout', 'ovalCallout', 'cloudCallout', 'lineCallout2',
  'lineCallout3', 'lineCallout4', 'lineCallout2AccentBar', 'lineCallout3AccentBar', 'lineCallout4AccentBar',
  'lineCallout2NoBorder', 'lineCallout3NoBorder', 'lineCallout4NoBorder',
  'lineCallout2BorderandAccentBar', 'lineCallout3BorderandAccentBar', 'lineCallout4BorderandAccentBar',
].map(id => ({ id, preset: id }));

export const shapeGalleryGroups: ShapeGalleryGroup[] = [
  { title: 'Lines', items: CONNECTORS },
  { title: 'Rectangles', items: RECTANGLES },
  { title: 'Basic Shapes', items: BASIC_SHAPES },
  { title: 'Block Arrows', items: BLOCK_ARROWS },
  { title: 'Equation Shapes', items: EQUATION },
  { title: 'Flowchart', items: FLOWCHART },
  { title: 'Stars and Banners', items: STARS },
  { title: 'Callouts', items: CALLOUTS },
];
/** The trial draws the Lines group with 16px icons, every other group with 20px. */
export const shapeGalleryIconSize = (title: string): number => (title === 'Lines' ? 16 : 20);
export const shapeGalleryById = new Map<string, ShapeGalleryEntry>(shapeGalleryGroups.flatMap(g => g.items).map(e => [e.id, e]));

/** Form Controls gallery: item id, trial shape name and paint object type. */
export const formControls: { id: string; label: string; objectType: string; width: number; height: number }[] = [
  { id: 'button', label: 'Button', objectType: 'Button', width: 120, height: 24 },
  { id: 'combobox', label: 'Combo Box', objectType: 'ComboBox', width: 120, height: 24 },
  { id: 'checkbox', label: 'Check Box', objectType: 'CheckBox', width: 120, height: 24 },
  { id: 'spinbutton', label: 'Spin Button', objectType: 'SpinButton', width: 120, height: 24 },
  { id: 'listbox', label: 'List Box', objectType: 'ListBox', width: 132, height: 96 },
  { id: 'optionbutton', label: 'Option Button', objectType: 'OptionButton', width: 120, height: 24 },
  { id: 'groupbox', label: 'Group Box', objectType: 'GroupBox', width: 144, height: 96 },
  { id: 'label', label: 'Label', objectType: 'Label', width: 120, height: 24 },
  { id: 'scrollbar', label: 'Scroll Bar', objectType: 'ScrollBar', width: 120, height: 24 },
];

/** Sparklines gallery: groups with the trial labels, ids and formula functions. */
export const sparklineGroups: { title: string; items: { command: string; title: string; formula: string | null }[] }[] = [
  { title: 'Line Sparkline', items: [
    { command: 'sparklinesLineSparkline', title: 'Insert Line Sparkline', formula: 'LINESPARKLINE' },
    { command: 'sparklinesAreaSparkline', title: 'Insert Area Sparkline', formula: 'AREASPARKLINE' },
  ] },
  { title: 'Bar Sparkline', items: [
    { command: 'sparklinesColumnSparkline', title: 'Insert Column Sparkline', formula: 'COLUMNSPARKLINE' },
    { command: 'sparklinesWinLossSparkline', title: 'Insert Win/Loss Sparkline', formula: 'WINLOSSSPARKLINE' },
    { command: 'sparklinesStackedSparkline', title: 'Insert Stacked Sparkline', formula: null },
    { command: 'sparklinesCascadeSparkline', title: 'Insert Cascade Sparkline', formula: null },
    { command: 'sparklinesParetoSparkline', title: 'Insert Pareto Sparkline', formula: null },
    { command: 'sparklinesHBarSparkline', title: 'Insert Hbar Sparkline', formula: 'HBARSPARKLINE' },
    { command: 'sparklinesVBarSparkline', title: 'Insert Vbar Sparkline', formula: 'VBARSPARKLINE' },
    { command: 'sparklinesHistogramSparkline', title: 'Insert Histogram Sparkline', formula: null },
  ] },
  { title: 'Pie Sparkline', items: [{ command: 'sparklinesPieSparkline', title: 'Insert Pie Sparkline', formula: 'PIESPARKLINE' }] },
  { title: 'Scatter Sparkline', items: [
    { command: 'sparklinesScatterSparkline', title: 'Insert Scatter Sparkline', formula: null },
    { command: 'sparklinesSpreadsSparkline', title: 'Insert Spread Sparkline', formula: null },
  ] },
  { title: 'Calendar Sparkline', items: [
    { command: 'sparklinesMonthSparkline', title: 'Insert Month Sparkline', formula: null },
    { command: 'sparklinesYearSparkline', title: 'Insert Year Sparkline', formula: null },
  ] },
  { title: 'Other Sparkline', items: [
    { command: 'sparklinesBoxPlotSparkline', title: 'Insert BoxPlot Sparkline', formula: null },
    { command: 'sparklinesBulletSparkline', title: 'Insert Bullet Sparkline', formula: null },
    { command: 'sparklinesVarianceSparkline', title: 'Insert Variance Sparkline', formula: null },
    { command: 'sparklinesRangeBlockSparkline', title: 'Insert RangeBlock Sparkline', formula: null },
    { command: 'sparklinesGaugeKPISparkline', title: 'Insert GaugeKPI Sparkline', formula: null },
    { command: 'sparklineImageSparkline', title: 'Insert Image Function', formula: null },
    { command: 'sparklinesLollipopVarianceSparkline', title: 'Insert Lollipop Variance Sparkline', formula: null },
    { command: 'sparklinesProgressSparkline', title: 'Insert Progress Sparkline', formula: null },
  ] },
];

/* ------------------------------------------------------------- helpers --- */

const columnName = (index: number): string => {
  let out = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
};

export interface A1Range { row: number; col: number; rowCount: number; colCount: number }

/** Parses `$B$2` or `B2:E5` (optionally sheet-qualified); throws like the trial's validation. */
export function parseA1(reference: string): A1Range {
  const cleaned = reference.trim().replace(/\'/g, '');
  const match = /^(?:([^!]+)!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(cleaned);
  if (!match) throw new Error('Invalid cell reference');
  const col = (letters: string): number => [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const c1 = col(match[2]), r1 = Number(match[3]) - 1;
  const c2 = match[4] ? col(match[4]) : c1, r2 = match[5] ? Number(match[5]) - 1 : r1;
  return { row: Math.min(r1, r2), col: Math.min(c1, c2), rowCount: Math.abs(r2 - r1) + 1, colCount: Math.abs(c2 - c1) + 1 };
}

export function toA1(range: A1Range, absolute = false): string {
  const dollar = absolute ? '$' : '';
  const a = `${dollar}${columnName(range.col)}${dollar}${range.row + 1}`;
  if (range.rowCount === 1 && range.colCount === 1) return a;
  const b = `${dollar}${columnName(range.col + range.colCount - 1)}${dollar}${range.row + range.rowCount}`;
  return `${a}:${b}`;
}

export function selectionRange(d: Designer): A1Range {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  const row = Math.max(0, range.row), col = Math.max(0, range.col);
  return {
    row, col,
    rowCount: range.rowCount < 0 ? 1 : Math.max(1, range.rowCount),
    colCount: range.colCount < 0 ? 1 : Math.max(1, range.colCount),
  };
}

/** Sheet-content pixel rectangle for a model x/y/width/height window (draw tool math). */
export function shapeRectFromDrag(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.max(4, Math.abs(x1 - x0)),
    height: Math.max(4, Math.abs(y1 - y0)),
  };
}

/* ------------------------------------------------------------- shapes --- */

export function addShapeFromGallery(d: Designer, entry: ShapeGalleryEntry, box: { x: number; y: number; width: number; height: number }): DesignerShape {
  const sheet = activeSheet(d);
  const GC = d.gc;
  const shapes = shapesOf(sheet);
  const shape: DesignerShape = new (shapeCtor(GC))(d.nextShapeName(entry.preset), autoShapeTypeId(GC, entry.preset), box.x, box.y, box.width, box.height);
  shape.presetName(entry.preset);
  if (entry.startArrow || entry.endArrow) shape.setArrowHeads(!!entry.startArrow, !!entry.endArrow);
  if (/^(line|Elbow|Curved)/.test(entry.preset)) shape.fill({ visible: false });
  shapes.add(shape);
  shapes.all().forEach((item) => item.isSelected(item === shape));
  return shape;
}

export function addTextBox(d: Designer, box: { x: number; y: number; width: number; height: number }): DesignerShape {
  const sheet = activeSheet(d);
  return shapesOf(sheet).addTextBox(d.nextShapeName('rectangle'), box.x, box.y, box.width, box.height);
}

export function addFormControl(d: Designer, control: { id: string; label: string; objectType: string; width: number; height: number }, box: { x: number; y: number; width?: number; height?: number }): DesignerShape {
  const sheet = activeSheet(d);
  const shapes = shapesOf(sheet);
  const count = shapes.all().filter((shape) => shape.control()).length + 1;
  const name = shapes.uniqueName(control.label);
  const shape = shapes.addFormControl(name, { objectType: control.objectType }, box.x, box.y, box.width ?? control.width, box.height ?? control.height);
  shape.text(`${control.objectType.replace(/([A-Z])/g, ' $1').trim().replace(/ /g, '')} ${count}`);
  shapes.all().forEach((item) => item.isSelected(item === shape));
  return shape;
}

function autoShapeTypeId(gc: GCRoot, preset: string): number {
  const table = gc?.Spread?.Sheets?.Shapes?.AutoShapeType;
  if (!table) return 1;
  const value = recordView(table)[preset];
  return typeof value === 'number' ? value : 1;
}

/**
 * Camera shape, exactly like the trial: it is placed on the current selection, sized to the
 * referenced range, named "Picture N" and stores the reference as `=Sheet!<as typed>`.
 */
export function addCamera(d: Designer, reference: string): DesignerShape {
  const sheet = activeSheet(d);
  const source = rangeToPixels(sheet, parseA1(reference));
  const at = selectionRange(d);
  const origin = rangeToPixels(sheet, { row: at.row, col: at.col, rowCount: 1, colCount: 1 });
  const typed = String(reference).trim().replace(/^=/, '');
  const qualified = typed.includes('!') ? typed : `${sheet.name().includes(' ') ? `'${sheet.name()}'` : sheet.name()}!${typed}`;
  const name = shapesOf(sheet).uniqueName(d.nextShapeName('Picture'));
  return shapesOf(sheet).addCameraShape(name, `=${qualified}`, origin.x, origin.y, source.width, source.height);
}

/** Pixel bounds of a cell range (view-independent, zoom 1). */
export function rangeToPixels(sheet: Worksheet, range: A1Range): { x: number; y: number; width: number; height: number } {
  let x = 0, y = 0;
  for (let c = 0; c < range.col; c++) x += sheet.getColumnWidth(c, 1) ?? 75;
  for (let r = 0; r < range.row; r++) y += sheet.getRowHeight(r, 1) ?? 22;
  let width = 0, height = 0;
  for (let c = range.col; c < range.col + range.colCount; c++) width += sheet.getColumnWidth(c, 1) ?? 75;
  for (let r = range.row; r < range.row + range.rowCount; r++) height += sheet.getRowHeight(r, 1) ?? 22;
  return { x, y, width, height };
}

export function selectedShapes(d: Designer): DesignerShape[] {
  return shapesOf(activeSheet(d)).all().filter((shape) => shape.isSelected());
}

export function deleteShapes(d: Designer): void {
  for (const shape of selectedShapes(d)) shapesOf(activeSheet(d)).remove(String(shape.name()));
}

/* --------------------------------------------------------- sparklines --- */

const FORMULA_SPARKLINES = new Set(['AREASPARKLINE', 'PIESPARKLINE', 'HBARSPARKLINE', 'VBARSPARKLINE']);

/**
 * Computes the formulas to write for a "Create Sparklines" submission.
 * Mirrors the trial: formula kinds require a single location cell; the LINE /
 * COLUMN / WINLOSS family splits block data into one series per row and needs
 * one location cell per series (all in a single column or row).
 */
export function sparklineFormulas(fn: string, dataRef: string, locationRef: string): { row: number; col: number; formula: string }[] {
  const data = parseA1(dataRef);
  const location = parseA1(locationRef);
  if (FORMULA_SPARKLINES.has(fn) || !/^(LINE|COLUMN|WINLOSS)/.test(fn)) {
    if (location.rowCount > 1 || location.colCount > 1) {
      throw new Error('Location reference does not support cell range, it should be single cell');
    }
    return [{ row: location.row, col: location.col, formula: `=${fn}(${toA1(data)})` }];
  }
  const singleColumn = data.rowCount > 1 && data.colCount === 1;
  const series = singleColumn || data.rowCount === 1 ? 1 : data.rowCount;
  if (series === 1) {
    if (location.rowCount > 1 || location.colCount > 1) {
      throw new Error('Location reference does not support cell range, it should be single cell');
    }
    const orientation = singleColumn ? 0 : 1;
    return [{ row: location.row, col: location.col, formula: `=${fn}(${toA1(data)},${orientation})` }];
  }
  if (location.rowCount > 1 && location.colCount > 1) {
    throw new Error('Location reference is not valid because the cells are not all in the same column or row. Select cells that are all in a single column or row');
  }
  const cells: { row: number; col: number }[] = [];
  for (let i = 0; i < series; i++) cells.push({ row: location.row + (location.rowCount > 1 ? i : 0), col: location.col + (location.rowCount > 1 ? 0 : i) });
  return cells.map((cell, i) => ({
    ...cell,
    formula: `=${fn}(${toA1({ row: data.row + i, col: data.col, rowCount: 1, colCount: data.colCount })},1)`,
  }));
}

/* ------------------------------------------------- chart-preview gallery --- */

/**
 * The trial's chart-preview gallery items insert the chart straight into the sheet (measured
 * black-box on the running trial with A1:F5 selected): the chart is anchored one row below the
 * top row of the selection, 20 px to the right of the selection, sized 480x300 px, named
 * "Chart N", and it ends up as the selected floating object.
 * Values are the public `GC.Spread.Sheets.Charts.ChartType` member names.
 */
const CHART_PREVIEW_TYPE: Record<string, string> = {
  clusteredColumnChart: 'columnClustered', stackedColumnChart: 'columnStacked', stackedColumn100Chart: 'columnStacked100',
  clusteredBarChart: 'barClustered', stackedBarChart: 'barStacked', stackedBar100Chart: 'barStacked100',
  treemapChart: 'treemap', sunburstChart: 'sunburst', waterfallChart: 'waterfall', funnelChart: 'funnel',
  stockHLCChart: 'stockHLC', stockOHLCChart: 'stockOHLC', stockVHLCChart: 'stockVHLC', stockVOHLCChart: 'stockVOHLC',
  radarChart: 'radar', radarWithMarkersChart: 'radarMarkers', filledRadarChart: 'radarFilled',
  lineChart: 'line', lineStackedChart: 'lineStacked', lineStacked100Chart: 'lineStacked100',
  lineMarkersChart: 'lineMarkers', lineMarkersStackedChart: 'lineMarkersStacked', lineMarkersStacked100Chart: 'lineMarkersStacked100',
  areaChart: 'area', areaStackedChart: 'areaStacked', areaStacked100Chart: 'areaStacked100',
  pieChart: 'pie', doughnutChart: 'doughnut',
  scatterChart: 'xyScatter', scatterSmoothMarkersChart: 'xyScatterSmooth', scatterSmoothChart: 'xyScatterSmoothNoMarkers',
  scatterStraightMarkersChart: 'xyScatterLines', scatterStraightChart: 'xyScatterLinesNoMarkers', bubbleChart: 'bubble',
};

/**
 * The trial's combo presets, measured through the public charts API on the running
 * trial: the first TWO series of the data range go into the preset's first plot
 * group, every remaining series into the second one (`Chart 1` at 468,20 480x300 for
 * `A1:F5` — the same anchor the single-type gallery items use). `axisGroup` 1 puts
 * the second group on a secondary pair of axes (Clustered Column - Line On
 * Secondary Axis). Group order matches the trial's `chartGroups` array.
 */
export const COMBO_CHART_PLAN: Record<string, { first: string; second: string; axisGroup: number }> = {
  comboChartColumnAndLine: { first: 'columnClustered', second: 'line', axisGroup: 0 },
  // Measured black-box (paired spec task65): the trial's secondary-axis preset puts
  // its second group on `lineMarkers` (ChartType 26), not plain `line`.
  comboChartColumnAndLineAxis: { first: 'columnClustered', second: 'lineMarkers', axisGroup: 1 },
  comboChartColumnAndArea: { first: 'areaStacked', second: 'columnClustered', axisGroup: 0 },
};

/** Every gallery item the seven Insert-tab chart-preview split buttons offer. */
export const chartPreviewCommands = [...Object.keys(CHART_PREVIEW_TYPE), ...Object.keys(COMBO_CHART_PLAN)];

/**
 * Trial rule (TASK 60 item 2, measured through the grid selection path): the seven
 * chart-preview split buttons are enabled when the selection covers more than one cell —
 * even a fully empty block — or when its single cell holds a value. A single empty cell
 * greys all of them out. The main "Charts" launcher (`insertChart`) follows the same rule
 * plus the feature-presence half in `chartsFeatureAvailable` below.
 */
export function chartPreviewEnabled(sheet: Worksheet): boolean {
  for (const range of activeRanges(sheet)) {
    const rowCount = Math.max(1, range.rowCount), colCount = Math.max(1, range.colCount);
    if (rowCount * colCount > 1) return true;
    const value = sheet.getValue(Math.max(0, range.row), Math.max(0, range.col));
    if (value !== null && value !== undefined && value !== '') return true;
  }
  return false;
}

/**
 * Second half of the trial's chart-launcher rule (paired with `?plugins=none`, see
 * `apps/designer-compare/test/data-regressions.spec.ts`): with the charts add-in not
 * loaded the trial greys out all eight Insert-tab chart launchers, because
 * `GC.Spread.Sheets.Charts` is missing and the commands would have nothing to call.
 * OpenSheets ships its charts engine inside the core bundle, so this guard is inert in
 * this product — it exists so a host that loads the designer against a core build
 * without charts gets the trial's greyed-out ribbon instead of a throwing click.
 */
export function chartsFeatureAvailable(d: Designer): boolean {
  const chartType = d.gc?.Spread?.Sheets.Charts?.ChartType;
  return typeof chartType === 'object' && chartType !== null;
}

/**
 * The trial's full enable rule for `insertChart` and the seven chart-preview buttons.
 * TASK 70 (measured on the trial with paired probes): the trial does NOT evaluate this
 * rule on every ribbon render. Its state is computed when the designer is created and
 * recomputed only when the USER changes the selection (grid click/drag, keyboard, the
 * name box) — data or style writes through the API (the compare app's boot script!) fire
 * CellChanged/ValueChanged and even move the selection, yet the eight launchers stay
 * greyed out (`data-regressions.spec.ts`). So the value is cached on the designer:
 * `snapshotChartLauncherState` runs at construction, `invalidateChartLauncherState` runs
 * on user-marked `SelectionChanged` args (`byUser: true`, see core `sheet-selection.ts`)
 * and on active-sheet changes; every other render reads the cache.
 */
export function chartCommandsEnabled(d: Designer): boolean {
  const cache = d._chartLauncherState;
  if (cache && !cache.dirty) return cache.value;
  return snapshotChartLauncherState(d);
}

/** (Re)computes and caches the chart-launcher enabled state on the designer. */
export function snapshotChartLauncherState(d: Designer): boolean {
  const value = chartsFeatureAvailable(d) && chartPreviewEnabled(activeSheet(d));
  d._chartLauncherState = { value, dirty: false };
  return value;
}

/** Marks the cached chart-launcher state stale: the next read recomputes it (user selection change). */
export function invalidateChartLauncherState(d: Designer): void {
  if (d._chartLauncherState) d._chartLauncherState.dirty = true;
  else snapshotChartLauncherState(d);
}

const nextChartName = (sheet: Worksheet): string => {
  const charts = chartsOf(sheet);
  let index = charts.all().length + 1;
  while (charts.get(`Chart ${index}`)) index++;
  return `Chart ${index}`;
};

/** Runs one chart-preview gallery item: inserts the chart over the sheet like the trial. */
export function insertChartPreview(d: Designer, name: string): boolean {
  const typeName = CHART_PREVIEW_TYPE[name];
  if (!typeName) return false;
  const sheet = activeSheet(d);
  const chartType = chartTypeValue(d, typeName);
  const at = selectionRange(d);
  const bounds = rangeToPixels(sheet, at);
  // Trial anchor: the row below the selection's first row, 20 px right of the selection.
  const below = rangeToPixels(sheet, { row: at.row + 1, col: 0, rowCount: 1, colCount: 0 });
  const charts = chartsOf(sheet);
  const chart = charts.add(nextChartName(sheet), chartType, bounds.x + bounds.width + 20, below.y, 480, 300, toA1(at));
  charts.all().forEach((item) => item.isSelected(item === chart));
  return true;
}

/** The numeric `Charts.ChartType` member of a public type name. */
function chartTypeValue(d: Designer, typeName: string): number {
  const enumTable: Record<string, unknown> = d.gc?.Spread?.Sheets?.Charts?.ChartType ?? {};
  const chartType = Number(enumTable[typeName]);
  if (!Number.isFinite(chartType)) throw new Error(`NotImplemented: chart type ${typeName}`);
  return chartType;
}

/**
 * Runs one combo chart-preview item (TASK 65 item 3). The trial's combo carries two
 * plot groups: the first two series in the preset's first group, the rest in the
 * second one, optionally on a secondary axis. Built through the public charts API
 * (`charts.add` + `series().remove/add` with a per-series `chartType`/`axisGroup`).
 */
export function insertComboChart(d: Designer, name: string, plan?: { first: string; second: string; axisGroup: number }, at?: SelectionRange): boolean {
  const spec = plan ?? COMBO_CHART_PLAN[name];
  if (!spec) return false;
  const sheet = activeSheet(d);
  const first = chartTypeValue(d, spec.first);
  const second = chartTypeValue(d, spec.second);
  const range = at ?? selectionRange(d);
  const bounds = rangeToPixels(sheet, range);
  const below = rangeToPixels(sheet, { row: range.row + 1, col: 0, rowCount: 1, colCount: 0 });
  const charts = chartsOf(sheet);
  const chart = charts.add(nextChartName(sheet), first, bounds.x + bounds.width + 20, below.y, 480, 300, toA1(range));
  const series = chart.series();
  const built = (series.get() ?? []) as Record<string, unknown>[];
  if (built.length > 2) {
    const extras = built.slice(2);
    for (let index = built.length - 1; index >= 2; index--) series.remove(index);
    for (const item of extras) {
      series.add({
        name: item.name === undefined ? undefined : String(item.name),
        xValues: item.xValues === undefined ? undefined : String(item.xValues),
        yValues: item.yValues === undefined ? undefined : String(item.yValues),
        chartType: second, axisGroup: spec.axisGroup,
      });
    }
  }
  // The trial builds gallery charts internally, so the series-cache corruption its
  // public `series()` API leaves behind (mirrored by the core) never applies here:
  // `dataRange()` keeps answering the full range, like the official insert.
  recordView(chart)._rangeBroken = false;
  charts.all().forEach((item) => item.isSelected(item === chart));
  return true;
}

/* ------------------------------------------------------------- barcode --- */

/**
 * Re-shapes an existing chart into the given per-series plan (TASK 65 item 3):
 * series 0 stays in the first plot group (`chart.chartType`), the rest are
 * re-added through the public `series()` API with their `chartType`/`axisGroup`.
 */
export function applySeriesPlans(d: Designer, chart: GC.Spread.Sheets.Charts.Chart, plans: { name: string; xValues?: string; yValues?: string; chartType: number; axisGroup: number }[]): boolean {
  if (!chart || !plans.length) return false;
  const first = plans[0];
  chart.chartType(first.chartType as GC.Spread.Sheets.Charts.ChartType);
  const series = chart.series();
  const built = (series.get() ?? []) as unknown[];
  // Rebuild the whole list so the first row's Secondary Axis checkbox also applies.
  for (let index = built.length - 1; index >= 0; index--) series.remove(index);
  series.add(plans.map((plan) => ({
    name: plan.name, xValues: plan.xValues, yValues: plan.yValues,
    chartType: plan.chartType, axisGroup: plan.axisGroup,
  })));
  d.invalidate();
  return true;
}

const escapeText = (value: string): string => `"${String(value).replace(/"/g, '""')}"`;
const quiet = (value: unknown): string => (value === undefined || value === null || value === '' || Number(value) === 0 ? '' : String(Number(value)));

/** Builds the BC_* formula exactly like the trial's Barcode dialog (defaults included). */
export function barcodeFormula(data: Record<string, unknown>): string {
  const type = String(data.barcodeType ?? 'QRCODE');
  const value = String(data.value ?? '');
  const color = String(data.color ?? '#000');
  const back = String(data.backColor ?? '#FFF');
  const numeric = /^(EAN13|EAN8)$/.test(type) && /^\d+$/.test(value) ? value : escapeText(value);
  if (type === 'QRCODE') {
    const model = String(data.model ?? '2');
    const version = String(data.version ?? 'auto');
    const mask = String(data.mask ?? 'auto');
    const connection = data.connection ? 'TRUE' : 'FALSE';
    const connectionNo = Number(data.connectionNo ?? 0);
    const charCode = data.charCode ? escapeText(String(data.charCode)) : '';
    const charset = escapeText(String(data.charset ?? 'UTF-8'));
    const qz = ['quietLeft', 'quietTop', 'quietRight', 'quietBottom'].map(key => quiet(data[key]));
    return `BC_QRCODE(${numeric},${escapeText(color)},${escapeText(back)},"${String(data.errorLevel ?? 'L')}",${model},"${version}","${mask}",${connection},${connectionNo},${charCode},${charset},${qz[0]},${qz[1]},${qz[2]},${qz[3]})`;
  }
  const showLabel = data.showLabel ? 'TRUE' : 'FALSE';
  const labelPosition = escapeText(String(data.labelPosition ?? 'top').toLowerCase());
  const qz = ['quietLeft', 'quietTop', 'quietRight', 'quietBottom'].map(key => quiet(data[key]));
  const fontStyle = data.fontStyle ? escapeText(String(data.fontStyle)) : '';
  const fontWeight = data.fontWeight ? escapeText(String(data.fontWeight)) : '';
  const decoration = data.textDecoration ? escapeText(String(data.textDecoration)) : '';
  const addOn = data.addOn ? escapeText(String(data.addOn)) : '';
  const addOnPosition = data.addOnLabelPosition ? escapeText(String(data.addOnLabelPosition)) : '';
  const align = data.textAlign ? escapeText(String(data.textAlign)) : '';
  const family = data.fontFamily ? escapeText(String(data.fontFamily)) : '';
  const size = data.fontSize ? String(Number(data.fontSize)) : '';
  return `BC_${type}(${numeric},${escapeText(color)},${escapeText(back)},${showLabel},${qz[0]},${qz[1]},${labelPosition},${fontStyle},${fontWeight},${decoration},${addOn},${addOnPosition},${align},${family},${size},${qz[2]},)`;
}

/* ------------------------------------------------------------- action --- */

/** Handles Insert-tab commands that mutate the model through undoable actions. */
export function applyInsertAction(d: Designer, name: string, args: Record<string, unknown>): boolean {
  const sheet = activeSheet(d);
  const data = (args.data ?? {}) as Record<string, unknown>;
  if (CHART_PREVIEW_TYPE[name]) return insertChartPreview(d, name);
  if (COMBO_CHART_PLAN[name]) return insertComboChart(d, name);
  switch (name) {
    case 'addShape': {
      const entry = shapeGalleryById.get(String(args.galleryId));
      if (!entry) throw new Error(`Unknown shape ${String(args.galleryId)}`);
      addShapeFromGallery(d, entry, args.box as { x: number; y: number; width: number; height: number });
      return true;
    }
    case 'addTextBox': addTextBox(d, args.box as { x: number; y: number; width: number; height: number }); return true;
    case 'addFormControl': {
      const control = formControls.find(item => item.id === String(args.controlId));
      if (!control) throw new Error(`Unknown form control ${String(args.controlId)}`);
      // The trial keeps a control's fixed height and uses the drag's start point.
      const box = args.box as { x: number; y: number };
      addFormControl(d, control, { x: box.x, y: box.y });
      return true;
    }
    case 'pasteShapes': {
      const items = (args.items ?? []) as Record<string, unknown>[];
      const GC = d.gc;
      const shapes = shapesOf(sheet);
      for (const item of items) {
        const copy = JSON.parse(JSON.stringify(item));
        copy.name = shapes.uniqueName(String(item.name ?? 'rectangle'));
        copy.x = Number(item.x ?? 0) + 10;
        copy.y = Number(item.y ?? 0) + 10;
        const shape: DesignerShape = new (shapeCtor(GC))(String(copy.name), Number(copy.shapeType ?? 1), Number(copy.x), Number(copy.y), Number(copy.width ?? 100), Number(copy.height ?? 100));
        shape.fromJSON(copy);
        if (shape.fromShapeJSON) shape.fromShapeJSON(copy);
        shapes.add(shape);
      }
      shapes.all().forEach((shape) => shape.isSelected(false));
      return true;
    }
    case 'applySparklines': {
      const fn = String(data.sparklineFunction ?? 'LINESPARKLINE');
      const items = sparklineFormulas(fn, String(data.dataRange ?? ''), String(data.locationRange ?? ''));
      for (const item of items) sheet.setFormula(item.row, item.col, item.formula);
      return true;
    }
    case 'applyBarcode': {
      const reference = String(data.location ?? '');
      const target = reference ? parseA1(reference) : selectionRange(d);
      sheet.setFormula(target.row, target.col, barcodeFormula(data));
      return true;
    }
    case 'deleteShapes': deleteShapes(d); return true;
    case 'applyShapeHyperlink': {
      for (const shape of selectedShapes(d)) shape.hyperlink(data.url ? { url: String(data.url), tooltip: String(data.tooltip ?? '') } : null);
      return true;
    }
    case 'applyShapeText': {
      const shapes = shapesOf(sheet);
      const shape = d._editingShapeName ? shapes.get(d._editingShapeName) : selectedShapes(d)[0];
      if (shape) shape.text(String(data.text ?? ''));
      d._editingShapeName = null;
      return true;
    }
    case 'applyCamera': addCamera(d, String(data.reference ?? toA1(selectionRange(d), true))); return true;
    case 'applyPicture': {
      const shapes = shapesOf(sheet);
      const box = (data.box ?? (() => {
        const { x, y, width, height } = rangeToPixels(sheet, selectionRange(d));
        return { x, y, width: Math.min(180, width), height: Math.min(140, height) };
      })()) as { x: number; y: number; width: number; height: number };
      const name = shapes.uniqueName(d.nextShapeName('Picture'));
      const shape = shapes.addPictureShape(name, String(data.src ?? ''), box.x, box.y, box.width, box.height);
      shapes.all().forEach((item) => item.isSelected(item === shape));
      return true;
    }
    case 'applyPictureInCell': {
      const range = selectionRange(d);
      const GC = d.gc;
      for (const item of activeRanges(sheet)) {
        const row = Math.max(0, item.row), col = Math.max(0, item.col);
        // Our core ships `CellTypes.Picture` (the contract lists no picture cell type yet).
        const cellTypes = extendView<{ Picture: new () => GC.Spread.Sheets.CellTypes.Base & { src(value?: string): unknown } }, typeof GC.Spread.Sheets.CellTypes>(GC.Spread.Sheets.CellTypes);
        const type = new cellTypes.Picture();
        type.src(String(data.src ?? ''));
        sheet.setCellType(row, col, type);
        void range;
      }
      return true;
    }
    case 'applyShapeStyle': {
      const shapes = shapesOf(sheet);
      const shape = shapes.get(String(data.name ?? '')) ?? selectedShapes(d)[0];
      if (!shape) return true;
      if (data.fill !== undefined) shape.fill(data.fill);
      if (data.line !== undefined) shape.line(data.line);
      if (data.position !== undefined) {
        const p = data.position as Record<string, unknown>;
        if (p.x !== undefined) shape.x(Math.max(0, Number(p.x)));
        if (p.y !== undefined) shape.y(Math.max(0, Number(p.y)));
        if (p.width !== undefined) shape.width(Math.max(1, Number(p.width)));
        if (p.height !== undefined) shape.height(Math.max(1, Number(p.height)));
      }
      if (data.rotation !== undefined) shape.rotation(Number(data.rotation));
      if (data.text !== undefined) shape.text(String(data.text));
      return true;
    }
    default: return false;
  }
}
