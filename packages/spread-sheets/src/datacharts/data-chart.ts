/**
 * The DataChart class (GC.Spread.Sheets.DataCharts.DataChart): a floating
 * object bound to a GC.Data table through an IDataChartConfig. Painting
 * happens on a canvas in the floating layer (paint.ts); serialisation is a
 * `shapes`-section entry with shapeType 9 (trial JSON shape).
 *
 * Trial-measured geometry model: x/y/width/height are the source of truth;
 * the start/end anchor members are derived from them against the current
 * row/column layout. Setters move/resize the chart without coupling the two
 * ends (unlike ShapeBase). Row/column add/remove shifts the anchor indices
 * (the chart follows the grid regardless of dynamicMove), row-height changes
 * do not move it.
 */
import { FloatingObject } from '../features/floating-objects.js';
import type { Worksheet } from '../worksheet.js';
import type { WorkbookRenderer } from '../rendering.js';
import { GC as ApiEnums } from '../generated/enums.js';
import type { IDataChartConfig, IPlotOption, DataChartType, JsonAny } from './types.js';
import { paintDataChartSurface } from './paint.js';

const DataChartTypeValues = ApiEnums.Spread.Sheets.DataCharts.DataChartType as unknown as Record<string, string>;

/** Default plot palette observed from the trial (bare `add`, every type). */
export const DEFAULT_PALETTE = ['#91cd77', '#5ca4e5', '#f6ca47', '#7783c4', '#f39e36', '#73C1DF'];

export const SHAPE_TYPE = 9;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const DEFAULT_PLOT_CONFIG = {
    palette: [...DEFAULT_PALETTE],
    tooltip: [{
        style: {
            fill: { type: 'CssColor' as const, color: '#ffffff' },
            stroke: { type: 'CssColor' as const, color: '#E0E0E0' },
            strokeWidth: 1,
        },
        textStyle: { color: '#555', fontSize: 12 },
    }],
    updateAnimation: { duration: 600 },
    hoverAnimation: { duration: 100, scale: 1.05 },
};

/** Extra per-type defaults the trial stamps at construction (pie labels, ...). */
function perTypePlotConfig(type: string): Record<string, unknown> {
    if (type === 'Pie' || type === 'Donut')
        return { text: [{ percentageVisible: true, template: '{PercentageCategory.value:0.00%}' }] };
    if (type === 'Rose') return { text: [{ valueVisible: true, template: '{valueField.value}' }] };
    return {};
}

/** The default config the trial stamps on `add()` before any setChartConfig. */
export function defaultChartConfig(type?: unknown): IDataChartConfig {
    const plotType = resolveType(type);
    const encodings: Record<string, unknown> = {};
    if (plotType === 'Pie' || plotType === 'Donut' || plotType === 'Rose') encodings.text = [];
    return {
        plots: [{
            type: plotType,
            encodings: encodings as never,
            config: { ...clone(DEFAULT_PLOT_CONFIG), ...perTypePlotConfig(plotType) } as never,
        }],
        config: {
            plotAreas: [{ padding: { top: 10, left: 10, right: 10, bottom: 10 } }],
            header: {
                title: 'Data Chart Title',
                padding: { top: 10, left: 10, right: 10, bottom: 10 },
                textStyle: { fontSize: 18, fontFamily: 'Calibri', color: '#555', alignment: 'Center' as never },
            },
            dvStyle: {
                fill: { type: 'CssColor', color: '#ffffff' },
                strokeWidth: 1,
                stroke: { type: 'CssColor', color: '#D8D8D8' },
            },
        },
    };
}

/** Accept enum keys ('column'), enum values ('Column') or junk (→ Column). */
export function resolveType(type: unknown): DataChartType {
    const text = String(type ?? '');
    const direct = DataChartTypeValues[text as keyof typeof DataChartTypeValues];
    if (direct) return direct as DataChartType;
    const byValue = Object.values(DataChartTypeValues).find(value => String(value).toLowerCase() === text.toLowerCase());
    return (byValue ?? DataChartTypeValues.column) as DataChartType;
}

export function resolveConfigType(type: unknown): DataChartType {
    return resolveType(type);
}

interface AnchorSnapshot {
    row: number; col: number; dy: number; dx: number;
    endRow: number; endCol: number; endDy: number; endDx: number;
}

export class DataChart extends FloatingObject {
    override typeName = String(SHAPE_TYPE);
    private _config: IDataChartConfig;
    /** @internal Paint cache (table revision + config hash). */
    _paintFingerprint = '';
    /** @internal Paint model (owned by paint.ts). */
    _paintModel: unknown = undefined;
    private _canvas?: HTMLCanvasElement;
    /** @internal serialised `cNvPr.id`. */
    _shapeId = 2;
    /** @internal Hover hit regions recorded by the painter (surface coords). */
    _hits: Array<{ x: number; y: number; width: number; height: number; title: string; lines: string[]; color: string }> = [];
    /**
     * @internal Header painted on the canvas. Trial (measured on the
     * header-title crop): the header is captured when the chart FIRST paints
     * (from the add()-stamped defaults or the config set before the first
     * render); a later `setChartConfig({config:{header:...}})` updates
     * getChartConfig but never paints a header. `null` = captured, no header.
     */
    _paintedHeader?: { title?: string; padding?: { top?: number; bottom?: number; left?: number; right?: number }; textStyle?: { fontSize?: number; fontFamily?: string; fontWeight?: string; fontStyle?: string; color?: string } } | null;
    private _tooltip?: HTMLElement;
    private _element?: HTMLElement;

    constructor(sheet?: Worksheet, name?: string, x = 0, y = 0, width = 200, height = 160, type?: unknown) {
        // Trial rules: empty name falls back to `Chart N`, missing size is 200x160.
        const safeName = name ? String(name) : `Chart ${1 + (sheet?.dataCharts.all().filter(item => String(item.name()).startsWith('Chart ')).length ?? 0)}`;
        super(safeName, Number.isFinite(Number(x)) ? Number(x) : 0, Number.isFinite(Number(y)) ? Number(y) : 0,
            Number.isFinite(Number(width)) ? Number(width) : 200, Number.isFinite(Number(height)) ? Number(height) : 160);
        this._sheet = sheet;
        Object.assign(this.props, { canPrint: true, alt: '', allowRotate: false, showHandle: true });
        this._config = defaultChartConfig(type);
        if (typeof document !== 'undefined') {
            this._canvas = document.createElement('canvas');
            this._canvas.style.cssText = 'width:100%;height:100%;display:block';
            this.content(this._canvas as unknown as HTMLElement);
        }
    }

    // ------------------------------------------------------------------ config

    /** Like the trial, unset answers true (the flag is only ever opted out). */
    canPrint(value?: boolean): boolean | this {
        if (value === undefined) return this.props.canPrint !== false;
        this.props.canPrint = !!value;
        return this;
    }

    override isVisible(value?: boolean): boolean | DataChart {
        if (value === undefined) return this.props.isVisible !== false;
        // Trial: hiding a data chart also drops its selection.
        if (!value && this.props.isSelected) this.isSelected(false);
        this.property('isVisible', value);
        return this;
    }

    getChartConfig(): IDataChartConfig {
        return clone(this._config);
    }

    setChartConfig(config: IDataChartConfig, inferMissingEncodings = false): void {
        const input = clone(config ?? {});
        if (!Array.isArray((input as { plots?: unknown }).plots)) throw new TypeError('DataChart config: plots must be an array.');
        const plots: IPlotOption[] = input.plots;
        for (const plot of plots) plot.type = resolveConfigType(plot.type);
        if (inferMissingEncodings) {
            for (const plot of plots) {
                const enc = plot.encodings;
                if (enc && (enc.values?.length ?? 0) && !enc.color) enc.color = { field: 'VALUE_NAMES' };
            }
        }
        const next = {} as IDataChartConfig;
        if (input.tableName !== undefined) next.tableName = input.tableName;
        next.plots = plots;
        next.config = input.config ?? {};
        this._config = next;
        this._paintFingerprint = '';
        this._changed();
    }

    /** @internal The live config object (no clone) for the painter. */
    _liveConfig(): IDataChartConfig {
        return this._config;
    }

    private _changed(): void {
        this._sheet?._view()?.schedule();
    }

    // ---------------------------------------------------------------- geometry

    private _rows() { return this._sheet?._rowLayout(); }
    private _cols() { return this._sheet?._columnLayout(); }

    /** Anchor indices/offsets derived from the stored pixel geometry. */
    private _derived(): AnchorSnapshot {
        const rows = this._rows(), cols = this._cols();
        const x = Number(this.props.x), y = Number(this.props.y);
        const endX = x + Number(this.props.width), endY = y + Number(this.props.height);
        const row = rows?.indexAtOffset(y) ?? Math.floor(y / 20);
        const col = cols?.indexAtOffset(x) ?? Math.floor(x / 62);
        const endRow = rows?.indexAtOffset(endY) ?? Math.floor(endY / 20);
        const endCol = cols?.indexAtOffset(endX) ?? Math.floor(endX / 62);
        return {
            row, col, endRow, endCol,
            dy: y - (rows?.prefixSum(row) ?? row * 20),
            dx: x - (cols?.prefixSum(col) ?? col * 62),
            endDy: endY - (rows?.prefixSum(endRow) ?? endRow * 20),
            endDx: endX - (cols?.prefixSum(endCol) ?? endCol * 62),
        };
    }

    private _setPixel(key: 'x' | 'y' | 'width' | 'height', value: number): this {
        const clamped = Math.max(key === 'width' || key === 'height' ? 1 : 0, Number(value));
        this.props[key] = clamped;
        this._changed();
        return this;
    }

    /**
     * Shift the anchor indices after rows/columns are added or removed (trial:
     * the data chart follows the grid; `dynamicMove` does not disable this).
     * @internal
     */
    _shiftAxis(axis: 'row' | 'col', index: number, amount: number, remove: boolean): void {
        const layout = axis === 'row' ? this._rows() : this._cols();
        if (!layout) return;
        const start = axis === 'row' ? Number(this.props.y) : Number(this.props.x);
        const startKey = axis === 'row' ? 'y' : 'x';
        const a = this._derived();
        const anchorIndex = axis === 'row' ? a.row : a.col;
        const offset = axis === 'row' ? a.dy : a.dx;
        const shifted = remove
            ? (anchorIndex >= index + amount ? anchorIndex - amount : anchorIndex >= index ? index : anchorIndex)
            : (anchorIndex >= index ? anchorIndex + amount : anchorIndex);
        this._setPixel(startKey as 'x', (layout.prefixSum(shifted) ?? shifted * (axis === 'row' ? 20 : 62)) + offset);
        void start;
    }

    // ----------------------------------------------------------- anchors API

    private _anchorGet(part: keyof AnchorSnapshot): number { return this._derived()[part]; }

    override startRow(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('row');
        const rows = this._rows();
        const a = this._derived();
        return this._setPixel('y', (rows?.prefixSum(Number(value)) ?? Number(value) * 20) + a.dy);
    }
    override startColumn(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('col');
        const cols = this._cols();
        const a = this._derived();
        return this._setPixel('x', (cols?.prefixSum(Number(value)) ?? Number(value) * 62) + a.dx);
    }
    override startRowOffset(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('dy');
        const rows = this._rows();
        const a = this._derived();
        return this._setPixel('y', (rows?.prefixSum(a.row) ?? a.row * 20) + Number(value));
    }
    override startColumnOffset(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('dx');
        const cols = this._cols();
        const a = this._derived();
        return this._setPixel('x', (cols?.prefixSum(a.col) ?? a.col * 62) + Number(value));
    }
    override endRow(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('endRow');
        const rows = this._rows();
        const a = this._derived();
        const bottom = (rows?.prefixSum(Number(value)) ?? Number(value) * 20) + a.endDy;
        return this._setPixel('height', bottom - Number(this.props.y));
    }
    override endColumn(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('endCol');
        const cols = this._cols();
        const a = this._derived();
        const right = (cols?.prefixSum(Number(value)) ?? Number(value) * 62) + a.endDx;
        return this._setPixel('width', right - Number(this.props.x));
    }
    override endRowOffset(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('endDy');
        const rows = this._rows();
        const a = this._derived();
        const bottom = (rows?.prefixSum(a.endRow) ?? a.endRow * 20) + Number(value);
        return this._setPixel('height', bottom - Number(this.props.y));
    }
    override endColumnOffset(value?: number): number | DataChart {
        if (value === undefined) return this._anchorGet('endDx');
        const cols = this._cols();
        const a = this._derived();
        const right = (cols?.prefixSum(a.endCol) ?? a.endCol * 62) + Number(value);
        return this._setPixel('width', right - Number(this.props.x));
    }

    /** @internal Derived anchors for serialisation. */
    override _anchors(): AnchorSnapshot { return this._derived(); }
    /** @internal Anchors follow the geometry: nothing to capture. */
    override _captureAnchors(): void { /* geometry is the source of truth */ }
    /** @internal Restore geometry from a serialised anchor pair. */
    override _setAnchors(value: AnchorSnapshot): void {
        const rows = this._rows(), cols = this._cols();
        const x = (cols?.prefixSum(value.col) ?? value.col * 62) + value.dx;
        const y = (rows?.prefixSum(value.row) ?? value.row * 20) + value.dy;
        const right = (cols?.prefixSum(value.endCol) ?? value.endCol * 62) + value.endDx;
        const bottom = (rows?.prefixSum(value.endRow) ?? value.endRow * 20) + value.endDy;
        Object.assign(this.props, { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) });
    }

    // ---------------------------------------------------------- serialisation

    override toJSON(): Record<string, unknown> {
        const a = this._anchors();
        const name = String(this.name());
        const props = this.props;
        return {
            isLocked: props.isLocked !== false,
            canPrint: props.canPrint !== false,
            dynamicMove: props.dynamicMove !== false,
            dynamicSize: props.dynamicSize !== false,
            allowResize: props.allowResize !== false,
            allowRotate: false,
            allowMove: props.allowMove !== false,
            showHandle: true,
            alt: String(props.alt ?? ''),
            shapeData: {
                anchorType: 0,
                startPoint: { row: a.row, col: a.col, rowOffset: a.dy, colOffset: a.dx },
                endPoint: { row: a.endRow, col: a.endCol, rowOffset: a.endDy, colOffset: a.endDx },
                editAs: 0,
                graphicFrame: {
                    shapeType: SHAPE_TYPE,
                    nvGraphicFramePr: {
                        cNvPr: { id: this._shapeId, name, hidden: this.isVisible() === false, title: '' },
                        cNvGraphicFramePr: { graphicFrameLocks: { noChangeAspect: false } },
                    },
                    xfrm: {
                        flipH: false, flipV: false, rot: 0,
                        off: { x: Number(props.x), y: Number(props.y) },
                        ext: { cx: Number(props.width), cy: Number(props.height) },
                    },
                    graphic: { graphicData: { dataChart: { chartConfig: clone(this._config) } } },
                },
            },
            name,
            shapeType: SHAPE_TYPE,
        };
    }

    /** Restores a data chart from its `shapes`-section entry (trial JSON). */
    static fromShape(sheet: Worksheet, json: Record<string, unknown>): DataChart {
        const shapeData = (json.shapeData ?? {}) as JsonAny;
        const frame = shapeData.graphicFrame ?? {};
        const off = frame.xfrm?.off ?? {};
        const ext = frame.xfrm?.ext ?? {};
        const chartConfig = (frame.graphic?.graphicData?.dataChart?.chartConfig ?? {}) as IDataChartConfig;
        const chart = new DataChart(sheet, String(json.name ?? 'DataChart1'),
            Number(off.x ?? 0), Number(off.y ?? 0), Number(ext.cx ?? 200), Number(ext.cy ?? 160),
            chartConfig.plots?.[0]?.type);
        chart._config = chartConfig;
        chart._shapeId = Number(frame.nvGraphicFramePr?.cNvPr?.id ?? 2);
        chart.props.isLocked = json.isLocked !== false;
        chart.props.canPrint = json.canPrint !== false;
        chart.props.dynamicMove = json.dynamicMove !== false;
        chart.props.dynamicSize = json.dynamicSize !== false;
        chart.props.allowResize = json.allowResize !== false;
        chart.props.allowMove = json.allowMove !== false;
        chart.props.alt = String(json.alt ?? '');
        if (frame.nvGraphicFramePr?.cNvPr?.hidden) chart.props.isVisible = false;
        const start = shapeData.startPoint;
        const end = shapeData.endPoint;
        if (start && end) chart._setAnchors({
            row: Number(start.row), col: Number(start.col), dx: Number(start.colOffset ?? 0), dy: Number(start.rowOffset ?? 0),
            endRow: Number(end.row), endCol: Number(end.col), endDx: Number(end.colOffset ?? 0), endDy: Number(end.rowOffset ?? 0),
        });
        return chart;
    }

    // -------------------------------------------------------------- painting

    /** Static-position rendering: x/y/width/height are used as-is. */
    override _render(view: WorkbookRenderer, layer: HTMLElement, zIndex: number): void {
        if (!this._element) {
            const element = document.createElement('div');
            element.className = 'opensheets-floating-object';
            element.tabIndex = 0;
            const content = document.createElement('div');
            content.className = 'opensheets-floating-content';
            if (this._canvas) content.append(this._canvas);
            element.append(content);
            for (const dir of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']) {
                const handle = document.createElement('div');
                handle.className = `opensheets-floating-handle handle-${dir}`;
                handle.dataset.direction = dir;
                element.append(handle);
            }
            element.addEventListener('pointerdown', event => {
                if (event.button === 2) {
                    if (!event.ctrlKey) for (const item of [...view.sheet!.charts.all(), ...(view.sheet!.dataCharts?.all() ?? [])]) if ((item as unknown) !== this) item.isSelected(false);
                    this.isSelected(true);
                    return;
                }
                if (event.button !== 0) return;
                event.stopPropagation();
                element.focus({ preventScroll: true });
                element.setPointerCapture(event.pointerId);
                if (!event.ctrlKey) for (const item of [...view.sheet!.charts.all(), ...(view.sheet!.dataCharts?.all() ?? [])]) if ((item as unknown) !== this) item.isSelected(false);
                this.isSelected(true);
                const dir = (event.target as HTMLElement).dataset.direction;
                const start = { x: event.clientX, y: event.clientY, left: Number(this.x()), top: Number(this.y()), width: Number(this.width()), height: Number(this.height()) };
                const move = (e: PointerEvent) => {
                    const dx = (e.clientX - start.x) / view.zoom, dy = (e.clientY - start.y) / view.zoom;
                    if (dir && this.allowResize()) {
                        if (dir.includes('e')) this.width(Math.max(1, start.width + dx));
                        if (dir.includes('s')) this.height(Math.max(1, start.height + dy));
                        if (dir.includes('w')) { this.x(Math.max(0, start.left + dx)); this.width(Math.max(1, start.width - dx)); }
                        if (dir.includes('n')) { this.y(Math.max(0, start.top + dy)); this.height(Math.max(1, start.height - dy)); }
                    }
                    else if (this.allowMove()) { this.x(Math.max(0, start.left + dx)); this.y(Math.max(0, start.top + dy)); }
                };
                const up = () => {
                    element.removeEventListener('pointermove', move);
                    element.removeEventListener('pointerup', up);
                };
                element.addEventListener('pointermove', move);
                element.addEventListener('pointerup', up);
            });
            element.addEventListener('pointermove', event => this._hover(event, view));
            element.addEventListener('pointerleave', () => this._hideTooltip());
            element.addEventListener('keydown', e => {
                if (e.key === 'Escape') { this.isSelected(false); view.root.focus(); }
                if (e.key === 'Delete') this._sheet?.dataCharts?.remove(String(this.name()));
            });
            this._element = element;
        }
        if (this._element.parentElement !== layer) layer.append(this._element);
        const x = Number(this.x()), y = Number(this.y());
        const width = Math.max(1, Number(this.width())), height = Math.max(1, Number(this.height()));
        Object.assign(this._element.style, {
            display: this.isVisible() ? '' : 'none',
            left: `${view.headerWidth + (x - view.scrollX) * view.zoom}px`,
            top: `${view.headerHeight + (y - view.scrollY) * view.zoom}px`,
            width: `${width * view.zoom}px`,
            height: `${height * view.zoom}px`,
            zIndex: String(zIndex),
        });
        this._element.classList.toggle('selected', !!this.isSelected());
        this._element.classList.toggle('resizable', !!this.allowResize());
        this._element.setAttribute('aria-label', String(this.alt() ?? this.name()));
        if (!this._canvas) return;
        const canvasWidth = Math.max(1, Math.round(width * view.zoom));
        const canvasHeight = Math.max(1, Math.round(height * view.zoom));
        const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
        if (this._canvas.width !== Math.round(canvasWidth * dpr) || this._canvas.height !== Math.round(canvasHeight * dpr)) {
            this._canvas.width = Math.round(canvasWidth * dpr);
            this._canvas.height = Math.round(canvasHeight * dpr);
        }
        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(canvasWidth / width, 0, 0, canvasHeight / height, 0, 0);
        paintDataChartSurface(this, ctx, width, height);
    }

    /** Trial-style hover tooltip: white box, light grey border, #555 text. */
    private _hover(event: PointerEvent, view: WorkbookRenderer): void {
        const element = this._element;
        if (!element) return;
        if ((event.target as HTMLElement).dataset.direction) return this._hideTooltip();
        const rect = element.getBoundingClientRect();
        const x = (event.clientX - rect.left) / view.zoom;
        const y = (event.clientY - rect.top) / view.zoom;
        const hit = this._hits.find(h => x >= h.x && x <= h.x + h.width && y >= h.y && y <= h.y + h.height);
        if (!hit) return this._hideTooltip();
        const tip = this._ensureTooltip(element);
        tip.textContent = '';
        const title = document.createElement('div');
        title.textContent = hit.title;
        title.style.cssText = 'font-weight:bold';
        tip.append(title);
        for (const line of hit.lines) {
            const row = document.createElement('div');
            const swatch = document.createElement('span');
            swatch.style.cssText = `display:inline-block;width:8px;height:8px;margin-right:6px;background:${hit.color}`;
            row.append(swatch, document.createTextNode(line));
            tip.append(row);
        }
        tip.style.display = 'block';
        tip.style.left = `${Math.min(Number(this.width()) - 8, x + 12)}px`;
        tip.style.top = `${Math.max(0, y - 12)}px`;
    }

    private _ensureTooltip(element: HTMLElement): HTMLElement {
        if (!this._tooltip) {
            const tip = document.createElement('div');
            tip.className = 'opensheets-datachart-tooltip';
            tip.style.cssText = 'display:none;position:absolute;z-index:3;pointer-events:none;background:#ffffff;border:1px solid #E0E0E0;color:#555;font:12px Calibri,"Segoe UI",Arial,sans-serif;padding:4px 8px;box-shadow:0 1px 3px rgba(0,0,0,0.15);white-space:nowrap';
            element.append(tip);
            this._tooltip = tip;
        }
        return this._tooltip;
    }

    private _hideTooltip(): void {
        if (this._tooltip) this._tooltip.style.display = 'none';
    }

    override _dispose(): void {
        this._element?.remove();
        this._element = undefined;
    }
}
