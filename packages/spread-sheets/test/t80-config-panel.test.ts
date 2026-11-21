// @vitest-environment jsdom
/**
 * TASK 80: headless coverage of DataChartConfigPanel (datacharts/config-panel.ts).
 * The trial exposes the same structure as `<sjs-data-chart-config-editor>`
 * (Inspector / Data Binding tabs, a Chart Type row, property search and
 * collapsible sections); these tests pin that structure and the two-way wiring
 * between the panel controls and the selected data chart's config.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { DataChartConfigPanel } from '../src/datacharts/config-panel.js';

const { Workbook } = GC.Spread.Sheets;
const { DataChartType } = GC.Spread.Sheets.DataCharts;
const Panel = (GC.Spread.Sheets.DataCharts as unknown as { DataChartConfigPanel: typeof import('../src/datacharts/config-panel.js').DataChartConfigPanel }).DataChartConfigPanel;
// The type picker enumerates GC off the global scope (UMD parity); tests provide it.
(globalThis as Record<string, unknown>).GC = GC;

function workbookWithDataChart() {
  const host = document.createElement('div');
  document.body.append(host);
  const wb = new Workbook(host);
  const sheet = wb.getActiveSheet();
  const dc = sheet.dataCharts.add('DC', 0, 0, 300, 200, DataChartType.column);
  dc.setChartConfig({ plots: [{ type: 'column' as never, encodings: { values: [{ field: 'Sales' }], category: { field: 'Product' } } }] } as never);
  const panelHost = document.createElement('div');
  document.body.append(panelHost);
  const panel: DataChartConfigPanel = new Panel(panelHost, wb);
  return { wb, sheet, dc, panel, panelHost };
}

describe('DataChartConfigPanel structure', () => {
  it('mounts the trial custom element with tabs, a type row, search and the nine sections', () => {
    const { panel } = workbookWithDataChart();
    const root = panel.element()!;
    expect(root.tagName.toLowerCase()).toBe('sjs-data-chart-config-editor');
    expect([...root.querySelectorAll('span')].map((s) => s.textContent)).toEqual(expect.arrayContaining(['Inspector', 'Data Binding', 'Chart Type']));
    expect(root.querySelector('select.opensheets-dc-type')).toBeTruthy();
    expect(root.querySelector('input[placeholder="Search property name here..."]')).toBeTruthy();
    const list = root.querySelector('.opensheets-dc-panel-list')!;
    const sections = [...list.children].map((el) => el.textContent!.slice(0, 20));
    for (const name of ['Chart Style', 'Data Labels', 'Tool Tip', 'Animation', 'Appearance', 'Title', 'Layout', 'Category Axis', 'Value Axis 1 (v1)'])
      expect(sections.some((text) => text.startsWith(name)), name).toBe(true);
    expect(root.querySelector<HTMLSelectElement>('select.opensheets-dc-type')!.options.length).toBeGreaterThan(10);
  });
  it('static findControl round-trips from the host and from the editor element', () => {
    const { panel, panelHost } = workbookWithDataChart();
    expect(Panel.findControl(panelHost)).toBe(panel);
    expect(Panel.findControl('no-such-host')).toBeNull();
  });
});

describe('DataChartConfigPanel wiring', () => {
  it('shows the selected chart type and writes a type change back to the config', () => {
    const { panel, dc } = workbookWithDataChart();
    const select = panel.element()!.querySelector<HTMLSelectElement>('select.opensheets-dc-type')!;
    expect(select.value).toBe('Column');
    select.value = 'Bar';
    select.dispatchEvent(new Event('change'));
    expect(String((dc.getChartConfig() as { plots: { type: string }[] }).plots[0]!.type)).toBe('Bar');
  });
  it('round-trips the header title through the Title section input', () => {
    const { panel, dc } = workbookWithDataChart();
    const title = panel.element()!.querySelector<HTMLInputElement>('input.opensheets-dc-title')!;
    title.value = 'Quarterly Sales';
    title.dispatchEvent(new Event('input'));
    expect(title.value).toBe('Quarterly Sales');
    const config = dc.getChartConfig() as { config?: { header?: { title?: string } } };
    expect(config.config?.header?.title).toBe('Quarterly Sales');
    panel.refresh();
    expect(panel.element()!.querySelector<HTMLInputElement>('input.opensheets-dc-title')!.value).toBe('Quarterly Sales');
  });
  it('the property search hides non-matching sections', () => {
    const { panel } = workbookWithDataChart();
    const root = panel.element()!;
    const search = root.querySelector<HTMLInputElement>('input[placeholder="Search property name here..."]')!;
    search.value = 'axis'; // matches only the two axis sections
    search.dispatchEvent(new Event('input'));
    const rows = [...root.querySelectorAll('.opensheets-dc-panel-list > *')] as HTMLElement[];
    const hidden = rows.filter((el) => el.style.display === 'none');
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.length).toBeLessThan(rows.length);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    expect(rows.every((el) => el.style.display !== 'none')).toBe(true);
  });
  it('detach removes the markup and destroy unregisters the findControl', () => {
    const { panel, panelHost } = workbookWithDataChart();
    panel.detach();
    expect(panel.element()).toBeNull();
    expect(panelHost.querySelector('sjs-data-chart-config-editor')).toBeNull();
    panel.destroy();
    expect(Panel.findControl(panelHost)).toBeNull();
    // Re-attach onto a second workbook after destroy (detach/attach cycle).
    const wb2 = new Workbook();
    panel.attach(wb2);
    expect(panel.element()!.tagName.toLowerCase()).toBe('sjs-data-chart-config-editor');
    panel.destroy();
    expect(panel.element()).toBeNull();
  });
});
