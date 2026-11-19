/**
 * `sheet.charts`: manages all charts of a worksheet. Serialisation goes
 * through the sheet's `shapes` section (shapeType 8), like the trial's
 * charts plugin; the top-level `preserveUnsupportedChartFlag` follows the
 * collection flag.
 */
import type { Worksheet } from '../../worksheet.js';
import type { JsonRecord } from './types.js';
import { CT_SHAPE_TYPE } from './types.js';
import { Chart } from './chart.js';
import { refreshPlotAreaSpPr } from './dlabels.js';

export class ChartCollection {
  private items: Chart[] = [];
  private _flag: boolean | undefined;
  private _paintCallBack: unknown;

  constructor(private sheet?: Worksheet) {}

  add(name: string, chartType: number, x: number, y: number, width: number, height: number,
    dataRange?: string, dataOrientation?: number, colorScheme?: unknown): Chart {
    if (!name) throw new Error('Chart name must be specified');
    // Trial: `combo` is a placeholder enum member, never constructible.
    if (Number(chartType) === 0) throw new Error('Can not set combo chart type!');
    const existing = this.get(name);
    if (existing) throw new Error(`The name of the chart '${name}' already exists`);
    const chart = new Chart(this.sheet, name, Number(chartType), Number(x), Number(y), Number(width), Number(height),
      dataRange === undefined ? undefined : String(dataRange),
      // `undefined` means "let the runtime choose like the trial" (see autoOrientation).
      dataOrientation === undefined || dataOrientation === null ? undefined : Number(dataOrientation), colorScheme);
    chart._shapeId = 2 + this.items.length;
    this.items.push(chart);
    chart._captureAnchors();
    this.sheet?._view()?.schedule();
    return chart;
  }

  all(): Chart[] { return [...this.items]; }

  get(name: string): Chart | null { return this.items.find(item => String(item.name()) === String(name)) ?? null; }

  remove(name: string): void {
    const index = this.items.findIndex(item => String(item.name()) === String(name));
    if (index < 0) return;
    // Trial (TASK 54 `remove` probe): removing a chart runs a layout pass that stamps the
    // detached chart's `plotArea.spPr.ln = { noFill: true }`.
    if (this.items[index]) refreshPlotAreaSpPr((this.items[index] as unknown as { _space: JsonRecord })._space);
    this.items[index]._dispose();
    this.items.splice(index, 1);
    this.sheet?._view()?.schedule();
  }

  clear(): void {
    for (const item of this.items) item._dispose();
    this.items = [];
    this.sheet?._view()?.schedule();
  }

  zIndex(name: string, zIndex?: number): unknown {
    const item = this.get(name);
    if (!item) return -1;
    if (zIndex === undefined) return this.items.indexOf(item);
    this.items.splice(this.items.indexOf(item), 1);
    this.items.splice(Math.max(0, Math.min(this.items.length, Number(zIndex))), 0, item);
    this.sheet?._view()?.schedule();
    return this;
  }

  preserveUnsupportedChart(flag?: boolean, paintCallBack?: unknown): boolean | undefined {
    if (flag === undefined && paintCallBack === undefined) return this._flag;
    if (flag !== undefined) this._flag = !!flag;
    if (paintCallBack !== undefined) this._paintCallBack = paintCallBack;
    return this._flag;
  }

  /** @internal True when the sheet JSON must carry `preserveUnsupportedChartFlag`. */
  _hasFlag(): boolean { return this._flag !== undefined || this.items.length > 0; }

  /** @internal Shape entries appended to the sheet's `shapes` section. */
  _toShapesJSON(): JsonRecord[] { return this.items.map(item => item.toJSON()); }

  /** @internal Restores charts from shapeType-8 entries of the shapes section. */
  _fromShapesJSON(list: JsonRecord[]): void {
    this.clear();
    for (const json of list) {
      if (Number(json.shapeType) !== CT_SHAPE_TYPE) continue;
      const chart = Chart.fromShape(this.sheet as Worksheet, json);
      this.items.push(chart);
    }
    this.sheet?._view()?.schedule();
  }

  /** @internal Count of charts (renderer hook guard). */
  _count(): number { return this.items.length; }
}
