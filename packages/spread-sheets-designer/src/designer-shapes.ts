/* Shape / picture / chart operations of the Designer: the draw tool, picture
 * picker, inline text editing, the shape command dispatcher (context menu and
 * Shape Format tab), the shape Size/Link dialogs and the chart Cut/Copy,
 * z-order, Save-as-Picture and chart dialog commands. The class methods are
 * thin wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import type GC from '@mescius/spread-sheets';
import type { DesignerShape } from './core-internals.js';
import { chartInternals, chartsOf, chartsNamespace, internals, shapesOf } from './core-internals.js';
import { toA1, selectedShapes as insertSelectedShapes, applySeriesPlans } from './commands/insert.js';
import { CHART_TYPE_CATEGORIES, CHART_TYPE_TILES, type ChartSeriesPlan } from './dialogs/ChartTypeDialogs.js';
import { activeRanges, activeSheet, topCell } from './commands/actions.js';
import { currentRegion } from './data-engine.js';
import { selectionBounds } from './commands/base.js';
import { messageText } from './resolve.js';
import { SPARK_DIALOG_SPECS } from './sparkline-dialog-specs.js';

const insertColumnName = (index: number): string => toA1({ row: 0, col: index, rowCount: 1, colCount: 1 }).replace(/\d+$/, '');

/** Arms the drag-on-sheet placement tool for shapes/text boxes/form controls. */
export function armDrawTool(d: Designer, tool: NonNullable<Designer['drawTool']>): void {
  d.drawTool = tool;
  d.openMenu = null;
  d.invalidate();
}
/** Completes a draw-tool drag with the sheet-pixel rectangle the user drew. */
export function finishDrawTool(d: Designer, box: { x: number; y: number; width: number; height: number }): void {
  const tool = d.drawTool;
  d.drawTool = null;
  if (!tool) return;
  if (tool.kind === 'shape' && tool.galleryId) d.runUndoable('addShape', { galleryId: tool.galleryId, box });
  else if (tool.kind === 'textBox') d.runUndoable('addTextBox', { box });
  else if (tool.kind === 'formControl') d.runUndoable('addFormControl', { controlId: tool.controlId ?? 'button', box });
  d.invalidate();
}
/** Runs after a real mouse drag on the sheet; when the tool expects a range it hands the range to onDone. */
export async function placePicture(d: Designer, mode: 'in' | 'over'): Promise<void> {
  const file = await pickImageFile(d);
  if (!file) return;
  if (mode === 'in') d.runUndoable('applyPictureInCell', { data: { src: file.src } });
  else d.runUndoable('applyPicture', { data: { src: file.src } });
  d.invalidate();
}

/** Opens the native file picker for picture insertion; resolves with a data URL. */
export function pickImageFile(_d: Designer): Promise<{ src: string; name: string } | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.dataset.command = 'pictureFileInput';
    input.style.cssText = 'position:absolute;left:-9999px';
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ src: String(reader.result ?? ''), name: file.name });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** "Create camera shape" dialog with the current selection pre-filled ($A$1 style like the trial). */
export function showCameraDialog(d: Designer): void {
  const sheet = activeSheet(d);
  const range = activeRanges(sheet)[0];
  const reference = range ? toA1({ row: Math.max(0, range.row), col: Math.max(0, range.col), rowCount: Math.max(1, range.rowCount), colCount: Math.max(1, range.colCount) }, true) : 'A1';
  d.showDialog('cameraShapeDialogTemplate', { reference }, (data) => {
    const value = String(data.reference ?? reference);
    try { d.runUndoable('applyCamera', { data: { reference: value } }); }
    catch (error) { d.showMessageBox(String((error as Error)?.message ?? error), messageText(d, 'createCameraShape', 'Create camera shape'), 3); }
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'createCameraShape', 'Create camera shape'), 3); });
}

export function showBarcodeDialog(d: Designer): void {
  const { row, col } = topCell(activeSheet(d));
  const data = {
    location: `${insertColumnName(col)}${row + 1}`, value: '', color: '', backColor: '',
    quietLeft: '', quietTop: '', quietRight: '', quietBottom: '',
    barcodeType: '', errorLevel: 'L', model: '2', version: 'auto', mask: 'auto',
    connection: 'false', connectionNo: 0, charCode: '', charset: 'UTF-8', showLabel: 'false',
    labelPosition: 'Top', fontStyle: 'Normal', fontWeight: 'Normal', textDecoration: 'None',
    addOn: '', addOnLabelPosition: 'Top', textAlign: 'Center', fontFamily: 'sans-serif', fontSize: 12,
  };
  d.showDialog('barcodeDialogTemplate', data, (submitted) => {
    if (!String(submitted.barcodeType ?? '')) return; // like the trial: no type, no barcode
    const clean = {
      ...submitted,
      connection: submitted.connection === true || submitted.connection === 'true',
      showLabel: submitted.showLabel === true || submitted.showLabel === 'true',
    };
    try { d.runUndoable('applyBarcode', { data: clean }); }
    catch (error) { d.showMessageBox(String((error as Error)?.message ?? error), messageText(d, 'barcodeDialog', 'Barcode Dialog'), 3); }
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'barcodeDialog', 'Barcode Dialog'), 3); });
}

/** "Create Sparklines" dialog; `sparklineFunction` selects LINE/AREA/COLUMN/... formulas.
 *  TASK 68: like the trial, a single-cell selection expands to the current region.
 *  TASK 93: the formula types the trial gives a dedicated dialog (per-argument fields)
 *  open `formulaSparklineDialogTemplate` instead; the generic dialog now carries the
 *  trial's `isFormulaSparkline` checkbox (checked by default). */
export function showSparklineDialog(d: Designer, sparklineFunction: string): void {
  const sheet = activeSheet(d);
  const bounds = selectionBounds(sheet);
  const region = bounds.rowCount <= 1 && bounds.colCount <= 1
    ? currentRegion(sheet, { row: Math.max(0, bounds.row), col: Math.max(0, bounds.col), rowCount: 1, colCount: 1 })
    : bounds;
  const spec = SPARK_DIALOG_SPECS[sparklineFunction];
  if (spec) {
    const data = {
      sparklineFunction,
      fields: Object.fromEntries(spec.fields.map((field) => [field.key, field.def])),
      locationRange: '',
    };
    d.showDialog('formulaSparklineDialogTemplate', data, (submitted) => {
      try { d.runUndoable('applyFormulaSparkline', { data: { ...submitted, sparklineFunction } }); }
      catch (error) { d.showMessageBox(String((error as Error)?.message ?? error), messageText(d, 'createSparklines', 'Create Sparklines'), 3); }
    }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'createSparklines', 'Create Sparklines'), 3); });
    return;
  }
  const data = {
    sparklineFunction,
    dataRange: toA1({ row: Math.max(0, region.row), col: Math.max(0, region.col), rowCount: Math.max(1, region.rowCount), colCount: Math.max(1, region.colCount) }),
    locationRange: '', isFormulaSparkline: true,
  };
  d.showDialog('createSparklinesDialogTemplate', data, (submitted) => {
    try { d.runUndoable('applySparklines', { data: { ...submitted, sparklineFunction } }); }
    catch (error) { d.showMessageBox(String((error as Error)?.message ?? error), 'SpreadJS Designer', 3); }
  }, (error) => { if ((error as Error)?.message !== 'Cancelled') d.showMessageBox(String(error), messageText(d, 'createSparklines', 'Create Sparklines'), 3); });
}

export function showShapeLinkDialog(d: Designer): void {
  const shape = insertSelectedShapes(d)[0];
  if (!shape) return;
  const current = shape.hyperlink() as { url?: string; tooltip?: string } | null;
  d.showDialog('shapeHyperlinkDialogTemplate', { url: current?.url ?? '', tooltip: current?.tooltip ?? '' },
    (data) => d.runUndoable('applyShapeHyperlink', { data: { url: String(data.url ?? '') } }),
    (error) => { void error; });
}

/** Exports the selected shape as a PNG download ("Save as Picture"). */
export function saveShapeAsPicture(d: Designer): void {
  const shape = insertSelectedShapes(d)[0];
  if (!shape) return;
  const host = shape.getHost()[0];
  const canvas = host?.querySelector('canvas') as HTMLCanvasElement | undefined;
  if (!canvas) return;
  const anchor = document.createElement('a');
  anchor.href = canvas.toDataURL('image/png');
  anchor.download = `${String(shape.name())}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Chart Cut/Copy/z-order commands from the chart context menu. */
type ChartZList = { all(): unknown[]; zIndex(name: string, index?: number): unknown };
function moveChartZ(charts: ChartZList, name: string, target: (index: number, length: number) => number): void {
  const index = Number(charts.zIndex(name));
  if (!(index >= 0)) return;
  charts.zIndex(name, target(index, charts.all().length));
}

export function executeChartCommand(d: Designer, name: string): void {
  const sheet = activeSheet(d);
  const charts = chartsOf(sheet);
  const selected = charts.all().filter(chart => chart.isSelected());
  const names = selected.map(chart => String(chart.name()));
  switch (name) {
    case 'cut': d._chartClipboard = { cut: true, items: selected.map(chart => JSON.parse(JSON.stringify(chart.toJSON()))) }; charts.remove(names[0] ?? ''); break;
    case 'copy': d._chartClipboard = { cut: false, items: selected.map(chart => JSON.parse(JSON.stringify(chart.toJSON()))) }; break;
    /* The trial moves charts through the collection's stacking list; the public
     * chart API is `zIndex(name, index)` (0 = back), so the commands express the
     * four moves through it. (The shape collection has the verb methods itself.) */
    case 'bringForward': for (const n of names) moveChartZ(charts, n, (i, l) => Math.min(l - 1, i + 1)); break;
    case 'sendBackward': for (const n of names) moveChartZ(charts, n, (i) => Math.max(0, i - 1)); break;
    case 'bringToFront': for (const n of names) moveChartZ(charts, n, (_i, l) => l - 1); break;
    case 'sendToBack': for (const n of names) moveChartZ(charts, n, () => 0); break;
    default: break;
  }
  d.invalidate();
}
/** "Save as Picture" for charts: rasterize our SVG artwork to PNG and download. */
export function saveChartAsPicture(d: Designer, chart: GC.Spread.Sheets.Charts.Chart): void {
  const extras = chartInternals(chart);
  const markup = String(extras?.svgMarkup?.() ?? '');
  if (!markup) return;
  const width = Number(chart.width()) || 300, height = Number(chart.height()) || 200;
  const image = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context?.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(url);
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${String(chart.name())}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
  image.src = url;
}
/**
 * Change Chart Type dialog (TASK 65 item 3). Category tiles change the whole
 * chart through the public `chart.chartType()` API; the Combo tiles and the
 * Custom Combination editor rebuild the plot groups through `chart.series()`
 * with a per-series `chartType`/`axisGroup`, like the trial's inserts.
 */
export function showChangeChartTypeDialog(d: Designer, chart: GC.Spread.Sheets.Charts.Chart): void {
  const cast = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
  const enums = cast(cast(cast(cast(d.gc).Spread).Sheets).Charts).ChartType as Record<string, number>;
  const typeNameOf = (value: number): string | undefined =>
    Object.entries(enums).find(([, member]) => Number(member) === value)?.[0];
  const seriesView = ((chart.series().get() ?? []) as unknown[]) as Record<string, unknown>[];
  const series = seriesView.map((item): ChartSeriesPlan => ({
    name: String(item.name ?? ''), xValues: item.xValues ? String(item.xValues) : undefined, yValues: item.yValues ? String(item.yValues) : undefined,
    chartType: Number(item.chartType ?? enums.columnClustered), axisGroup: Number(item.axisGroup ?? 0),
  }));
  const current = typeNameOf(Number(chart.chartType?.() ?? enums.columnClustered));
  const category = CHART_TYPE_CATEGORIES.find((name) => (CHART_TYPE_TILES[name] ?? []).some((tile) => tile.typeName === current)) ?? 'Column';
  const tile = Math.max(0, (CHART_TYPE_TILES[category] ?? []).findIndex((item) => item.typeName === current));
  d.showDialog('changeChartTypeDialogTemplate', { category, tile, series }, (data) => {
    if (!chart) return;
    const selected = (CHART_TYPE_TILES[String(data.category ?? 'Column')] ?? [])[Number(data.tile ?? 0)];
    if (!selected) return;
    if (selected.custom) {
      // The editor writes side maps (`seriesType.i`, `seriesAxis.i`) on top of the plans.
      const types = (data.seriesType ?? {}) as Record<string, string>;
      const axes = (data.seriesAxis ?? {}) as Record<string, number>;
      const plans = series.map((row, index) => ({
        ...row,
        chartType: types[index] !== undefined ? Number(enums[types[index]] ?? row.chartType) : row.chartType,
        axisGroup: axes[index] !== undefined ? Number(axes[index]) : row.axisGroup,
      }));
      applySeriesPlans(d, chart, plans);
    } else if (selected.plan) {
      applySeriesPlans(d, chart, [
        ...series.slice(0, 2).map((row) => ({ ...row, chartType: Number(enums[selected.plan!.first] ?? row.chartType), axisGroup: 0 })),
        ...series.slice(2).map((row) => ({ ...row, chartType: Number(enums[selected.plan!.second] ?? row.chartType), axisGroup: selected.plan!.axisGroup })),
      ]);
    } else if (selected.typeName !== undefined) {
      chart.chartType(Number(enums[selected.typeName]) as GC.Spread.Sheets.Charts.ChartType);
    }
    d.invalidate();
  }, () => undefined);
}
export function showSelectDataDialog(d: Designer, chart: GC.Spread.Sheets.Charts.Chart): void {
  const current = (chartInternals(chart)?.data?.() ?? {}) as { formula?: string };
  d.showDialog('selectDataDialogTemplate', { range: String(current.formula ?? '') }, (data) => {
    if (chart) { chartInternals(chart)?.data?.({ formula: String(data.range ?? '') }); d.invalidate(); }
  }, () => undefined);
}
/**
 * Move Chart dialog (TASK 68), matching the trial: "New sheet:" with a name
 * editor, "Object in:" with the sheet dropdown; OK re-creates the chart on the
 * target sheet (`charts.add` + the series plans) and carries its chartSpace
 * payload over so styles survive. Like the trial the dialog also opens without
 * a selected chart (OK then just closes).
 */
export function showMoveChartDialog(d: Designer, chart: GC.Spread.Sheets.Charts.Chart | null): void {
  const workbook = d.getWorkbook();
  const names: string[] = [];
  for (let index = 0; index < workbook.getSheetCount(); index++) names.push(workbook.getSheet(index).name());
  const currentName = chart ? sheetNameOfChart(d, chart) : '';
  d.showDialog('moveChartDialogTemplate', {
    mode: 'object', newSheetName: '', sheetName: currentName || (names[0] ?? ''), sheets: names,
  }, (data) => {
    if (!chart) return;
    const mode = String(data.mode ?? 'object');
    let target: GC.Spread.Sheets.Worksheet | null = null;
    if (mode === 'new') {
      const name = String(data.newSheetName ?? '').trim();
      if (!name || names.includes(name)) { d.showMessageBox(messageText(d, 'sheetNameExists', 'A sheet with that name already exists.'), messageText(d, 'moveChart', 'Move Chart'), 3); return; }
      target = addNamedSheet(workbook, name);
    } else {
      target = workbook.getSheetFromName(String(data.sheetName ?? '')) ?? null;
    }
    if (!target || target === chartSheetOf(chart)) return;
    moveChartToSheet(d, chart, target);
    d.invalidate();
  }, () => undefined);
}
function sheetNameOfChart(d: Designer, chart: GC.Spread.Sheets.Charts.Chart): string {
  return chartSheetOf(chart)?.name() ?? (d.getWorkbook().getActiveSheet()?.name() ?? '');
}
/** Appends a regular worksheet with the given name (the trial's Move Chart ▸ New sheet). */
function addNamedSheet(workbook: GC.Spread.Sheets.Workbook, name: string): GC.Spread.Sheets.Worksheet {
  const at = workbook.getSheetCount();
  workbook.addSheet(at);
  const created = workbook.getSheet(at);
  created.name(name);
  return created;
}
/** Re-creates the chart on the target sheet through the public `charts.add` API and carries
 *  its chartSpace payload over so type, series and styles survive the move (TASK 68). */
function moveChartToSheet(d: Designer, chart: GC.Spread.Sheets.Charts.Chart, target: GC.Spread.Sheets.Worksheet): void {
  const enums = chartsNamespace(d.gc).ChartType;
  const seriesView = ((chart.series().get() ?? []) as unknown[]) as Record<string, unknown>[];
  const firstType = Number(seriesView[0]?.chartType ?? chart.chartType?.() ?? enums.columnClustered);
  const name = String(chart.name());
  const position = { x: Number(chart.x?.() ?? 0), y: Number(chart.y?.() ?? 0), width: Number(chart.width()), height: Number(chart.height()) };
  const formula = String(chartInternals(chart)?.data?.()?.formula ?? '');
  const space = chartInternals(chart)?._space;
  chartSheetOf(chart)?.charts.remove(name);
  const created = chartInternals(chartsOf(target).add(name, firstType, position.x, position.y, position.width, position.height, formula || undefined));
  if (space !== undefined && created) created._space = JSON.parse(JSON.stringify(space));
  internals(target)._view?.()?.schedule?.();
}
function chartSheetOf(chart: GC.Spread.Sheets.Charts.Chart | null): GC.Spread.Sheets.Worksheet | null {
  return chart ? chartInternals(chart)?._sheet ?? null : null;
}
/**
 * TASK 68: the official commandMap names `changeChartTypeDialog`, `selectData`
 * and `moveChartDialog` are reachable through `executeCommand`. They act on the
 * selected chart (like the trial's Chart Tools); without one, Change Chart Type
 * and Select Data do nothing while Move Chart still shows its dialog.
 */
export function showChartCommandDialog(d: Designer, kind: 'changeChartType' | 'selectData' | 'moveChart'): void {
  const sheet = activeSheet(d);
  const selected = chartsOf(sheet).all().find((chart) => chart.isSelected?.()) ?? null;
  const chart = selected ?? (kind === 'moveChart' ? null : chartsOf(sheet).all()[0] ?? null);
  if (kind === 'changeChartType') { if (chart) showChangeChartTypeDialog(d, chart); return; }
  if (kind === 'selectData') { if (chart) showSelectDataDialog(d, chart); return; }
  showMoveChartDialog(d, chart);
}
/** Chart Design ▸ Accessibility ▸ Alt Text: the trial's description dialog. */
export function showChartAltTextDialog(d: Designer): void {
  const chart = selectedChartsOf(d)[0];
  if (!chart) return;
  const current = String((chart as { alt(value?: string): unknown }).alt() ?? '');
  d.showDialog('chartAltTextDialogTemplate', { alt: current }, (submitted) => {
    (chart as { alt(value?: string): unknown }).alt(String(submitted.alt ?? ''));
    d.invalidate();
  }, (error) => { void error; });
}

/** Charts the Chart Design tab acts on (trial: the selected floating chart). */
function selectedChartsOf(d: Designer): Array<GC.Spread.Sheets.Charts.Chart> {
  return chartsOf(activeSheet(d)).all().filter((chart) => chart.isSelected?.() === true);
}

export function showFormatChartAreaDialog(d: Designer, chart: GC.Spread.Sheets.Charts.Chart): void {
  const style = (chartInternals(chart)?.chartAreaStyle?.() ?? {}) as Record<string, string>;
  d.showDialog('formatChartAreaDialogTemplate', { fill: String(style.fill ?? '#ffffff'), stroke: String(style.stroke ?? '#d9d9d9') }, (data) => {
    if (chart) { chartInternals(chart)?.chartAreaStyle?.({ fill: String(data.fill ?? '#ffffff'), stroke: String(data.stroke ?? '#d9d9d9') }); d.invalidate(); }
  }, () => undefined);
}

/** Inline text editing of a shape: a contentEditable overlay positioned over it. */
export function beginShapeTextEdit(d: Designer): void {
  const shape = insertSelectedShapes(d)[0];
  // TASK 81: only text-bearing shapes edit inline (trial: PictureShape/CameraShape carry no text
  // accessor, and a group handle carries none either).
  if (!shape || typeof shape.text !== 'function' || typeof shape.lockText !== 'function' || shape.lockText()) return;
  const host = d.sheetHost;
  const objectElement = shape.getHost()[0];
  if (!objectElement) return;
  const box = objectElement.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  const editor = document.createElement('div');
  editor.className = 'opensheets-shape-text-editor';
  editor.contentEditable = 'true';
  editor.style.cssText = `position:absolute;left:${box.left - hostBox.left}px;top:${box.top - hostBox.top}px;width:${box.width}px;height:${box.height}px;z-index:900;display:flex;align-items:center;justify-content:center;text-align:center;outline:1px solid #4472c4;background:transparent;font:12px Calibri,sans-serif`;
  editor.textContent = String(shape.text() ?? '');
  host.appendChild(editor);
  editor.focus();
  document.getSelection()?.selectAllChildren(editor);
  d._editingShapeName = String(shape.name());
  const commit = (): void => {
    const text = editor.textContent ?? '';
    editor.remove();
    d._editingShapeName = null;
    d.runUndoable('applyShapeText', { data: { text } });
  };
  editor.addEventListener('blur', commit);
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { editor.removeEventListener('blur', commit); editor.remove(); d._editingShapeName = null; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); editor.blur(); }
  });
  d.invalidate();
}

/* Insert-tab shape commands (context menu / ribbon). */
export function executeShapeCommand(d: Designer, name: string, value?: unknown): void {
  const sheet = activeSheet(d);
  const shapes = shapesOf(sheet);
  const selected = insertSelectedShapes(d);
  switch (name) {
    case 'contextMenuCutShapes': case 'contextMenuCopyShapes': {
      d._shapeClipboard = selected.map(shape => JSON.parse(JSON.stringify(shape.toJSON())));
      if (name === 'contextMenuCutShapes') d.runUndoable('deleteShapes', {});
      break;
    }
    case 'pasteShapes': {
      if (!d._shapeClipboard?.length) return;
      d.runUndoable('pasteShapes', { items: d._shapeClipboard });
      break;
    }
    case 'bringShapeForward': for (const shape of selected) shapes.bringForward(String(shape.name())); break;
    /* The trial's Arrange split button applies "Bring Forward" on the main click. */
    case 'shapeArrange': for (const shape of selected) shapes.bringForward(String(shape.name())); break;
    case 'sendShapeBackward': for (const shape of selected) shapes.sendBackward(String(shape.name())); break;
    case 'bringShapeToFront': for (const shape of selected) shapes.bringToFront(String(shape.name())); break;
    case 'sendShapeToBack': for (const shape of selected) shapes.sendToBack(String(shape.name())); break;
    case 'shapeGroup': shapes.group(selected); break;
    case 'shapeUnGroup': for (const shape of selected) shapes.ungroup(shape as never); break;
    case 'deleteShapes': case 'contextMenuDeleteShapes': d.runUndoable('deleteShapes', {}); break;
    case 'formatShapes': case 'shapeAltText': case 'shapeFormatPane': d._formatShapePanel = selected.length ? String(selected[0].name()) : d._formatShapePanel; break;
    case 'editShapeText': beginShapeTextEdit(d); return;
    case 'editShapeHyperlink': showShapeLinkDialog(d); break;
    case 'removeShapeHyperlink': for (const shape of selected) shape.hyperlink(null); break;
    case 'saveAsPicture': saveShapeAsPicture(d); break;
    /* Shape Format ribbon tab (task 8). */
    case 'shapeFormatInsertShapes': armDrawTool(d, { kind: 'shape', galleryId: 'rectangle' }); break;
    case 'changeShape': if (value !== undefined) for (const shape of selected) if (typeof shape.shapeType === 'function') shape.shapeType(Number(value)); break;
    case 'shapeRotate': {
      for (const shape of selected) {
        const current = Number(shape.rotation() ?? 0);
        const next = value === 'left' ? current - 90 : value === 'reset' ? 0 : current + 90;
        shape.rotation(((next % 360) + 360) % 360);
      }
      break;
    }
    case 'shapeAlign': alignSelectedShapes(selected, String(value ?? 'left')); break;
    case 'shapeSize': showShapeSizeDialog(d, selected[0]); break;
    /* TASK 74: the trial's Shape Format command ids. The split-button parents
     * (`shapeCommandGroup`, `bringShapeForwardGroup`, ...) run their default
     * action on the main click, exactly like the trial's ribbon. */
    case 'insertShapeList': armDrawTool(d, { kind: 'shape', galleryId: 'rectangle' }); break;
    case 'shapeCommandGroup': shapes.group(selected); break;
    case 'shapeRightRotate90': rotateSelected(selected, 90); break;
    case 'shapeLeftRotate': rotateSelected(selected, -90); break;
    case 'shapeAlignLeft': alignSelectedShapes(selected, 'left'); break;
    case 'shapeAlignCenter': alignSelectedShapes(selected, 'center'); break;
    case 'shapeAlignRight': alignSelectedShapes(selected, 'right'); break;
    case 'shapeAlignTop': alignSelectedShapes(selected, 'top'); break;
    case 'shapeAlignMiddle': alignSelectedShapes(selected, 'middle'); break;
    case 'shapeAlignBottom': alignSelectedShapes(selected, 'bottom'); break;
    case 'shapeHorizontalDistribute': distributeSelected(selected, 'horizontal'); break;
    case 'shapeShapeVerticalDistribute': distributeSelected(selected, 'vertical'); break;
    case 'shapeSnapToGrid': snapSelectedToGrid(d, selected); break;
    case 'shapeSnapToShape': snapSelectedToShapes(selected); break;
    case 'shapeSizeHeight': { const height = Number(value); if (Number.isFinite(height) && height > 0) for (const shape of selected) shape.height(height); break; }
    case 'shapeSizeWidth': { const width = Number(value); if (Number.isFinite(width) && width > 0) for (const shape of selected) shape.width(width); break; }
    case 'bringShapeForwardGroup': for (const shape of selected) shapes.bringForward(String(shape.name())); break;
    case 'sendShapeBackwardGroup': for (const shape of selected) shapes.sendBackward(String(shape.name())); break;
    case 'shapeStyle1': case 'shapeStyle2': case 'shapeStyle3': case 'shapeStyle4': case 'shapeStyle5': case 'shapeStyle6': case 'shapeStyle7': {
      // Preset order follows the tile frame colors (TASK 55): black-outline, blue, orange, gray, yellow, light blue, green.
      const palette: Record<string, { fill: string; line: string } | null> = {
        shapeStyle1: null, shapeStyle2: { fill: '#4472c4', line: '#2f5597' },
        shapeStyle3: { fill: '#ed7d31', line: '#c55a11' }, shapeStyle4: { fill: '#a5a5a5', line: '#767171' },
        shapeStyle5: { fill: '#ffc000', line: '#bf8f00' }, shapeStyle6: { fill: '#5b9bd5', line: '#2e75b6' },
        shapeStyle7: { fill: '#70ad47', line: '#548235' },
      };
      const style = palette[name];
      for (const shape of selected) {
        if (style) shape.fill({ visible: true, color: style.fill, transparency: 0 }).line({ visible: true, color: style.line, width: 2, dash: 0 });
        else shape.fill({ visible: false, color: '#000000', transparency: 0 }).line({ visible: true, color: '#000000', width: 1, dash: 0 });
      }
      break;
    }
    default: break;
  }
  d.invalidate();
}

/** Turn the selected shapes by a quarter turn (trial: Rotate Right/Left 90°). */
function rotateSelected(selected: DesignerShape[], delta: number): void {
  for (const shape of selected) {
    const next = (Number(shape.rotation() ?? 0) + delta) % 360;
    shape.rotation(((next % 360) + 360) % 360);
  }
}

/**
 * Distribute the selected shapes evenly inside their bounding box
 * (Shape Format ▸ Align ▸ Distribute Horizontally / Vertically).
 */
function distributeSelected(selected: DesignerShape[], axis: 'horizontal' | 'vertical'): void {
  if (selected.length < 3) return;
  const box = selected.map((shape) => ({ shape, x: Number(shape.x()), y: Number(shape.y()), w: Number(shape.width()), h: Number(shape.height()) }));
  const start = axis === 'horizontal' ? Math.min(...box.map((b) => b.x)) : Math.min(...box.map((b) => b.y));
  const end = axis === 'horizontal' ? Math.max(...box.map((b) => b.x + b.w)) : Math.max(...box.map((b) => b.y + b.h));
  const size = axis === 'horizontal' ? (b: { w: number; h: number }) => b.w : (b: { w: number; h: number }) => b.h;
  const total = box.reduce((sum, b) => sum + size(b), 0);
  const gap = (end - start - total) / (box.length - 1);
  box.sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y));
  let cursor = start;
  for (const item of box) {
    if (axis === 'horizontal') item.shape.x(Math.round(cursor));
    else item.shape.y(Math.round(cursor));
    cursor += size(item) + gap;
  }
}

/** Sheet-area pixel offsets of the row/column boundaries the grid snapping aligns to. */
function gridBoundaries(sheet: ReturnType<typeof activeSheet>, axis: 'row' | 'col', limit: number): number[] {
  const out: number[] = [0];
  const count = axis === 'row' ? sheet.getRowCount() : sheet.getColumnCount();
  let pixels = 0;
  for (let index = 0; index < count; index++) {
    pixels += axis === 'row' ? Number(sheet.getRowHeight(index)) : Number(sheet.getColumnWidth(index));
    out.push(pixels);
    if (pixels > limit) break;
  }
  return out;
}

function nearestBoundary(boundaries: number[], value: number): number {
  let best = boundaries[0] ?? 0;
  for (const boundary of boundaries) if (Math.abs(boundary - value) < Math.abs(best - value)) best = boundary;
  return best;
}

/** Shape Format ▸ Align ▸ Snap to Grid: snap the shape edges to the nearest cell line. */
function snapSelectedToGrid(d: Designer, selected: DesignerShape[]): void {
  const sheet = activeSheet(d);
  for (const shape of selected) {
    const x = Number(shape.x()), y = Number(shape.y());
    const w = Number(shape.width()), h = Number(shape.height());
    shape.x(nearestBoundary(gridBoundaries(sheet, 'col', x + w + 200), x));
    shape.y(nearestBoundary(gridBoundaries(sheet, 'row', y + h + 200), y));
  }
}

/** Shape Format ▸ Align ▸ Snap to Shape: snap onto the nearest edge of the other shapes. */
function snapSelectedToShapes(selected: DesignerShape[]): void {
  if (selected.length < 2) return;
  const edges = selected.flatMap((shape) => [
    { axis: 'x' as const, value: Number(shape.x()) },
    { axis: 'x' as const, value: Number(shape.x()) + Number(shape.width()) },
    { axis: 'y' as const, value: Number(shape.y()) },
    { axis: 'y' as const, value: Number(shape.y()) + Number(shape.height()) },
  ]);
  for (const shape of selected) {
    const x = Number(shape.x()), y = Number(shape.y()), w = Number(shape.width()), h = Number(shape.height());
    for (const axis of ['x', 'y'] as const) {
      const own = axis === 'x' ? [x, x + w] : [y, y + h];
      const size = axis === 'x' ? w : h;
      const candidates = edges.filter((edge) => edge.axis === axis && own.every((value) => value !== edge.value));
      if (!candidates.length) continue;
      const targets = own.map((value) => nearestBoundary(candidates.map((candidate) => candidate.value), value));
      const moved = targets.reduce((sum, value) => sum + value, 0) / targets.length;
      if (axis === 'x') shape.x(Math.round(moved));
      else shape.y(Math.round(moved));
      void size;
    }
  }
}

/** Align the selected shapes along an axis of their common bounding box. */
function alignSelectedShapes(selected: DesignerShape[], mode: string): void {
  if (selected.length < 2) return;
  // The public Shape contract positions with x()/y() (left/top are constructor args).
  const box = selected.map((shape) => ({ l: Number(shape.x()), t: Number(shape.y()), w: Number(shape.width()), h: Number(shape.height()) }));
  const minL = Math.min(...box.map((b) => b.l));
  const maxR = Math.max(...box.map((b) => b.l + b.w));
  const minT = Math.min(...box.map((b) => b.t));
  const maxB = Math.max(...box.map((b) => b.t + b.h));
  selected.forEach((shape, i) => {
    const b = box[i];
    if (mode === 'left') shape.x(minL);
    else if (mode === 'right') shape.x(maxR - b.w);
    else if (mode === 'center') shape.x(Math.round((minL + maxR) / 2 - b.w / 2));
    else if (mode === 'top') shape.y(minT);
    else if (mode === 'bottom') shape.y(maxB - b.h);
    else if (mode === 'middle') shape.y(Math.round((minT + maxB) / 2 - b.h / 2));
  });
}

/** "Size and Position" dialog for the active shape (ribbon Size dropdown). */
export function showShapeSizeDialog(d: Designer, shape: DesignerShape | undefined): void {
  if (!shape) return;
  const data = { left: Math.round(Number(shape.x())), top: Math.round(Number(shape.y())), width: Math.round(Number(shape.width())), height: Math.round(Number(shape.height())) };
  d.showDialog('shapeSizeDialogTemplate', data, (submitted) => {
    const num = (key: string, fallback: number): number => { const v = Number(submitted[key]); return Number.isFinite(v) && v >= 0 ? v : fallback; };
    shape.x(num('left', data.left));
    shape.y(num('top', data.top));
    shape.width(Math.max(1, num('width', data.width)));
    shape.height(Math.max(1, num('height', data.height)));
    d.invalidate();
  }, (error) => { void error; });
}
