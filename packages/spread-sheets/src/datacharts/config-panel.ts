/**
 * DataChartConfigPanel: side panel for the selected data chart. The trial
 * renders a `<sjs-data-chart-config-editor>` custom element (tabs Inspector /
 * Data Binding, a chart-type row, a property search and collapsible property
 * groups). We reproduce the public structure with our own markup, styling and
 * icons; the functional bits (chart type, title, legend, palette) are wired
 * to the active sheet's selected data chart.
 */
import type { Workbook } from '../workbook.js';
import type { DataChart } from './data-chart.js';
import { resolveConfigType } from './data-chart.js';
import { ltext } from '../localization.js';

/** DataChart config-panel captions (`dataChart.*` language namespace; the section lookup keys stay English). */
const dtext = (key: string, fallback: string, ...args: (string | number)[]) => ltext(`dataChart.${key}`, fallback, ...args);

const instances = new WeakMap<HTMLElement, DataChartConfigPanel>();

function resolveHost(host: HTMLElement | string): HTMLElement | null {
    if (typeof host !== 'string') return host;
    return document.getElementById(host) ?? document.querySelector<HTMLElement>(host);
}

const SECTIONS = ['Chart Style', 'Data Labels', 'Tool Tip', 'Animation', 'Appearance', 'Title', 'Layout', 'Category Axis', 'Value Axis 1 (v1)'];

const ELEMENT_TAG = 'sjs-data-chart-config-editor';

function ensureElementDefined(): void {
    if (typeof customElements === 'undefined' || customElements.get(ELEMENT_TAG)) return;
    class DataChartConfigEditor extends HTMLElement {
        panel: DataChartConfigPanel | null = null;
        connectedCallback(): void { this.panel?.refresh(); }
    }
    customElements.define(ELEMENT_TAG, DataChartConfigEditor);
}

export class DataChartConfigPanel {
    private root: HTMLElement | null = null;
    private host: HTMLElement | null;
    private workbook: Workbook | null = null;
    private unsubscribes: Array<() => void> = [];

    constructor(host: HTMLElement | string, spread: Workbook) {
        if (typeof document === 'undefined') throw new Error('DataChartConfigPanel requires a DOM.');
        ensureElementDefined();
        this.host = resolveHost(host);
        if (!this.host) throw new Error('Invalid host element.');
        instances.set(this.host, this);
        this.attach(spread);
    }

    attach(spread: Workbook): void {
        if (this.workbook) this.detach();
        this.workbook = spread;
        this.build();
        this.refresh();
    }

    detach(): void {
        this.unsubscribes.splice(0).forEach(fn => fn());
        this.root?.remove();
        this.root = null;
        this.workbook = null;
    }

    destroy(): void {
        this.detach();
        if (this.host) instances.delete(this.host);
    }

    /** The panel's host element (trial parity: findControl round-trips this). */
    element(): HTMLElement | null { return this.root; }

    private chart(): DataChart | null {
        const sheet = this.workbook?.getActiveSheet();
        if (!sheet) return null;
        return sheet.dataCharts.all().find(item => item.isSelected()) ?? sheet.dataCharts.all()[0] ?? null;
    }

    refresh(): void {
        if (!this.root) return;
        const chart = this.chart();
        const typeSelect = this.root.querySelector<HTMLSelectElement>('select.opensheets-dc-type');
        const titleInput = this.root.querySelector<HTMLInputElement>('input.opensheets-dc-title');
        const config = chart?.getChartConfig();
        if (typeSelect && config?.plots?.[0]) typeSelect.value = String(config.plots[0].type);
        if (titleInput) titleInput.value = String(config?.config?.header?.title ?? '');
    }

    static findControl(host: HTMLElement | string): DataChartConfigPanel | null {
        const element = resolveHost(host);
        if (!element) return null;
        const direct = instances.get(element);
        if (direct) return direct;
        const editor = element.querySelector?.(ELEMENT_TAG) as { panel?: DataChartConfigPanel } | null;
        return editor?.panel ?? null;
    }

    // -------------------------------------------------------------- template

    private build(): void {
        const doc = this.host!.ownerDocument ?? document;
        const root = doc.createElement(ELEMENT_TAG);
        root.setAttribute('style', 'display:block;width:100%;height:100%;background:#ffffff;color:#333;font:12px/1.5 Calibri,"Segoe UI",Arial,sans-serif;border:1px solid #e3e3e3;box-sizing:border-box;overflow-y:auto');
        const tabs = doc.createElement('div');
        tabs.setAttribute('style', 'display:flex;align-items:center;gap:18px;padding:8px 12px;border-bottom:1px solid #eee');
        tabs.append(this.tabLabel(doc, dtext('inspector', 'Inspector'), true), this.tabLabel(doc, dtext('dataBinding', 'Data Binding'), false));
        const typeRow = doc.createElement('div');
        typeRow.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f2f2f2');
        const typeLabel = doc.createElement('span');
        typeLabel.textContent = dtext('chartType', 'Chart Type');
        const typeSelect = doc.createElement('select');
        typeSelect.className = 'opensheets-dc-type';
        typeSelect.setAttribute('style', 'border:1px solid #d9d9d9;padding:2px 4px;background:#fff;color:#333');
        const enumObject = (doc.defaultView as { GC?: { Spread?: { Sheets?: { DataCharts?: { DataChartType?: Record<string, string> } } } } } | undefined)?.GC?.Spread?.Sheets?.DataCharts?.DataChartType
            ?? (globalThis as { GC?: { Spread?: { Sheets?: { DataCharts?: { DataChartType?: Record<string, string> } } } } }).GC?.Spread?.Sheets?.DataCharts?.DataChartType
            ?? {};
        for (const [key, value] of Object.entries(enumObject)) {
            const option = doc.createElement('option');
            option.value = String(value);
            option.textContent = key;
            typeSelect.append(option);
        }
        typeSelect.addEventListener('change', () => {
            const chart = this.chart();
            if (!chart) return;
            const config = chart.getChartConfig();
            if (config.plots[0]) config.plots[0].type = resolveConfigType(typeSelect.value);
            chart.setChartConfig(config);
        });
        typeRow.append(typeLabel, typeSelect);
        const search = doc.createElement('input');
        search.setAttribute('placeholder', dtext('searchProperties', 'Search property name here...'));
        search.setAttribute('style', 'width:calc(100% - 24px);margin:8px 12px;padding:4px 6px;border:1px solid #ddd;border-radius:2px');
        const list = doc.createElement('div');
        list.className = 'opensheets-dc-panel-list';
        for (const name of SECTIONS) {
            const section = this.section(doc, name);
            if (name === 'Title') {
                const titleInput = doc.createElement('input');
                titleInput.className = 'opensheets-dc-title';
                titleInput.setAttribute('style', 'width:100%;box-sizing:border-box;padding:3px;border:1px solid #ddd');
                titleInput.addEventListener('input', () => {
                    const chart = this.chart();
                    if (!chart) return;
                    const config = chart.getChartConfig();
                    config.config ??= {};
                    config.config.header ??= {};
                    config.config.header.title = titleInput.value || undefined;
                    if (!config.config.header.title) delete config.config.header.title;
                    chart.setChartConfig(config);
                });
                section.append(titleInput);
            }
            list.append(section);
        }
        search.addEventListener('input', () => {
            const query = search.value.toLowerCase();
            for (const child of Array.from(list.children))
                (child as HTMLElement).style.display = !query || child.textContent!.toLowerCase().includes(query) ? '' : 'none';
        });
        root.append(tabs, typeRow, search, list);
        this.host!.append(root);
        this.root = root;
        (root as unknown as { panel: DataChartConfigPanel }).panel = this;
    }

    private tabLabel(doc: Document, text: string, active: boolean): HTMLElement {
        const span = doc.createElement('span');
        span.textContent = text;
        span.setAttribute('style', `cursor:pointer;padding:4px 0;font-size:13px;color:${active ? '#2e8b57' : '#666'};border-bottom:2px solid ${active ? '#2e8b57' : 'transparent'}`);
        return span;
    }

    private section(doc: Document, name: string): HTMLElement {
        const wrap = doc.createElement('div');
        wrap.setAttribute('style', 'border-bottom:1px solid #f2f2f2');
        const header = doc.createElement('div');
        header.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;color:#2e8b57;cursor:pointer');
        header.textContent = dtext(`section.${name}`, name);
        const arrow = doc.createElement('span');
        arrow.textContent = '>';
        arrow.setAttribute('style', 'color:#999');
        header.append(arrow);
        const body = doc.createElement('div');
        body.setAttribute('style', 'display:none;padding:6px 12px');
        header.addEventListener('click', () => {
            body.style.display = body.style.display === 'none' ? '' : 'none';
        });
        wrap.append(header, body);
        return wrap;
    }
}
