// @vitest-environment jsdom
/**
 * TASK 53 item 3 (report sweep): the chrome a `ReportSheet` displays.
 *
 * Measured on the official 19.2.5 trial through the public API and its own rendering
 * (`.probe/t53/probe-report-geometry.json`, `.probe/t53/report-mode-<mode>-<side>.png`):
 * the trial paints row/column headers and cell gridlines for a report sheet **only in Design
 * mode**; in `Preview` and `PaginatedPreview` the report cells fill the whole viewport — no
 * header band, no corner box, no gridlines. Before this fix our preview render painted a normal
 * worksheet grid over the report, which cost the report compare sweep 8.1% of every screenshot.
 */
import { expect, it } from 'vitest';
import GC from '../src/index.js';
import { sheetChrome } from '../src/sheet-chrome.js';
import { ReportSheet } from '../src/report/index.js';
import type { WorkbookRenderer } from '../src/rendering.js';

const { Workbook } = GC.Spread.Sheets;

const rows = [{ region: 'East' }, { region: 'West' }];

async function reportOn(hostless: undefined | HTMLElement): Promise<{ workbook: InstanceType<typeof Workbook>; report: ReportSheet }> {
  const workbook = new Workbook(hostless, { sheetCount: 0 }) as InstanceType<typeof Workbook>;
  await workbook.dataManager().addTable('T', { data: rows }).fetch();
  const report = workbook.addSheetTab(0, 'Report', 3) as ReportSheet;
  report.getTemplate().setTemplateCell(0, 0, { type: 'List', binding: 'T[region]' });
  report.refresh();
  return { workbook, report };
}

it('reports the trial chrome switches of a ReportSheet for every render mode', async () => {
  const { report } = await reportOn(undefined);
  expect(report.renderMode()).toBe('Preview');
  expect(sheetChrome(report)).toEqual({ headers: false, gridlines: false });
  report.renderMode('PaginatedPreview');
  expect(sheetChrome(report)).toEqual({ headers: false, gridlines: false });
  report.renderMode('Design');
  expect(sheetChrome(report)).toEqual({ headers: true, gridlines: true });
});

it('leaves a plain worksheet displayed with headers and gridlines', async () => {
  const workbook = new Workbook(undefined, { sheetCount: 1 }) as InstanceType<typeof Workbook>;
  expect(sheetChrome(workbook.getSheet(0))).toEqual({ headers: true, gridlines: true });
});

it('lays out a previewed ReportSheet without the header band (renderer geometry)', async () => {
  // jsdom has no 2D canvas backend: stub a context so the workbook builds its renderer.
  (globalThis as Record<string, unknown>).CanvasRenderingContext2D = class {};
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return new Proxy({}, {
      get: (_target, key: string) => {
        if (key === 'canvas') return this;
        if (key === 'measureText') return () => ({ width: 8 });
        if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
        if (key === 'createPattern') return () => ({});
        if (key === 'getTransform') return () => ({ a: 1, d: 1 });
        return () => undefined;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
  document.body.innerHTML = '<div id="sheet"></div>';
  const { workbook, report } = await reportOn(document.getElementById('sheet')!);
  const view = workbook._renderer() as WorkbookRenderer;
  // Keep the paint pass scheduled out of this test: only the layout numbers are asserted here
  // (jsdom has no real 2D backend, so `paint` would fail in a later animation frame).
  workbook.suspendPaint();
  for (const [name, size] of [['clientWidth', 400], ['clientHeight', 300]] as const)
    Object.defineProperty(view.root, name, { configurable: true, value: size });

  view.layout();
  expect([view.headerWidth, view.headerHeight]).toEqual([0, 0]);

  report.renderMode('Design');
  view.layout();
  expect([view.headerWidth, view.headerHeight]).toEqual([40, 20]);
  workbook.destroy();
});
