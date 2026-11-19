/**
 * `sheet.dataCharts`: the DataChartManager — add/get/all/remove/clear/zIndex
 * for the worksheet's data charts. Serialisation goes through the sheet's
 * `shapes` section (shapeType 9), like the trial's datacharts add-on.
 */
import type { Worksheet } from '../worksheet.js';
import { Events } from '../events.js';
import { DataChart, SHAPE_TYPE, resolveType } from './data-chart.js';
import type { IDataChartConfig } from './types.js';

export class DataChartManager {
    private items: DataChart[] = [];
    private shiftBound = false;

    constructor(private sheet?: Worksheet) {}

    /** Row/column add/delete shifts the data-chart anchors (trial behaviour). */
    private ensureShiftBound(): void {
        if (this.shiftBound || !this.sheet) return;
        this.shiftBound = true;
        const sheet = this.sheet;
        const handle = (axis: 'row' | 'col') => (_sender: unknown, info: { sheet?: unknown; propertyName?: unknown; count?: unknown; row?: number; col?: number } | undefined) => {
            if (!info || sheet !== info.sheet) return;
            const property = String(info.propertyName ?? '');
            if (!/^(add|delete)(Rows|Columns)$/.test(property)) return;
            const index = Number(info[axis] ?? 0);
            const amount = Number(info.count ?? 0);
            const remove = property.startsWith('delete');
            for (const item of this.items) item._shiftAxis(axis, index, amount, remove);
            sheet._view()?.schedule();
        };
        sheet.bind(Events.RowChanged, handle('row') as never);
        sheet.bind(Events.ColumnChanged, handle('col') as never);
    }

    /**
     * Adds a data chart. Trial rules: a duplicate name is auto-suffixed
     * (`name_1`, `name_2`, ...), an empty name falls back to `Chart N`.
     */
    add(name: string, x: number, y: number, width: number, height: number, type: string): DataChart {
        const base = name ? String(name) : '';
        let finalName = base;
        if (base) {
            for (let i = 1; this.get(finalName); i++) finalName = `${base}_${i}`;
        }
        const chart = new DataChart(this.sheet, finalName, x, y, width, height, resolveType(type));
        chart._shapeId = this._nextShapeId();
        this.items.push(chart);
        chart._captureAnchors();
        this.ensureShiftBound();
        this.sheet?._view()?.schedule();
        return chart;
    }

    all(): DataChart[] { return [...this.items]; }

    get(name: string): DataChart | undefined {
        return this.items.find(item => String(item.name()) === String(name));
    }

    remove(name: string): void {
        const index = this.items.findIndex(item => String(item.name()) === String(name));
        if (index < 0) return;
        this.items[index]._dispose();
        this.items.splice(index, 1);
        this.sheet?._view()?.schedule();
    }

    clear(): void {
        for (const item of this.items) item._dispose();
        this.items = [];
        this.sheet?._view()?.schedule();
    }

    /** Getter returns the paint index (-1 for unknown names); setter re-orders. */
    zIndex(name: string, zIndex?: number): number | this {
        const item = this.get(name);
        if (!item) return -1;
        if (zIndex === undefined) return this.items.indexOf(item);
        this.items.splice(this.items.indexOf(item), 1);
        this.items.splice(Math.max(0, Math.min(this.items.length, Number(zIndex))), 0, item);
        this.sheet?._view()?.schedule();
        return this;
    }

    private _nextShapeId(): number {
        let max = 1;
        const sheet = this.sheet;
        const workbook = sheet?.getParent();
        const sheets: Worksheet[] = workbook ? [...workbook.sheets] : sheet ? [sheet] : [];
        for (const other of sheets) {
            for (const chart of other.charts.all()) max = Math.max(max, Number((chart as unknown as { _shapeId?: number })._shapeId ?? 1));
            for (const item of (other.dataCharts.all() as DataChart[])) max = Math.max(max, item._shapeId);
        }
        return max + 1;
    }

    /** @internal True when the sheet JSON must carry the shapes section for these. */
    _count(): number { return this.items.length; }

    /** @internal Shape entries appended to the sheet's `shapes` section. */
    _toShapesJSON(): Record<string, unknown>[] { return this.items.map(item => item.toJSON()); }

    /** @internal Restores data charts from shapeType-9 entries of the shapes section. */
    _fromShapesJSON(list: Record<string, unknown>[]): void {
        this.clear();
        for (const json of list) {
            if (Number(json.shapeType) !== SHAPE_TYPE) continue;
            this.items.push(DataChart.fromShape(this.sheet as Worksheet, json));
        }
        this.ensureShiftBound();
        this.sheet?._view()?.schedule();
    }

    /** @internal Rebind helper used by tests/tools: refresh bound table data now. */
    _refreshAll(): void {
        for (const item of this.items) item._paintFingerprint = '';
        this.sheet?._view()?.schedule();
    }
}

/** Shape entries that belong to data charts. */
export function isDataChartShapeJson(json: Record<string, unknown>): boolean {
    return Number(json.shapeType) === SHAPE_TYPE;
}

export type { IDataChartConfig };
