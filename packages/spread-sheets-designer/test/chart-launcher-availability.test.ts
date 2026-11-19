/*
 * The trial's chart-launcher enable rule and its STATE CACHE, both measured with paired
 * probes (apps/designer-compare on `?side=official`, this round):
 *   1. `GC.Spread.Sheets.Charts` must be loaded, otherwise all eight Insert-tab chart
 *      launchers are greyed out (the trial with `?plugins=none` after a user selection);
 *   2. the selection must be usable as a chart source (TASK 60 item 2): any multi-cell
 *      range (even an empty block) or a single cell that holds a value;
 *   3. the trial evaluates the rule when the designer is created and re-evaluates it ONLY
 *      on user selection changes (grid click/keyboard/name box -> `SelectionChanged`).
 *      Data writes (`setArray`), styles, column widths and even programmatic
 *      `setSelection`/`setActiveCell` do NOT re-evaluate it: the compare app's boot script
 *      selects the value cell B2 through the API, yet the trial paints all eight launchers
 *      disabled (`data-regressions.spec.ts` — the gate this design reproduces).
 * Our core marks interaction-driven `SelectionChanged` args with `byUser: true`
 * (`packages/spread-sheets/src/sheet-selection.ts`); the designer invalidates the cached
 * state only there and on active-sheet changes.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { commandEnabled } from '../src/commands/actions.js';
import { invalidateChartLauncherState, snapshotChartLauncherState } from '../src/commands/insert.js';

const CHART_COMMANDS = ['insertChart', 'columnOrBarChartPreview', 'treeMapOrSunburstChartPreview', 'funnelOrStockChartPreview',
  'lineOrAreaChartPreview', 'pieOrDoughnutChartPreview', 'comboChartPreview', 'scatterOrBubbleChartPreview'];

/** A core namespace copy with `Sheets.Charts` removed (the trial's add-on-absent state). */
function gcWithoutCharts(): any {
  const sheets = { ...(GC as any).Spread.Sheets, Charts: undefined };
  return { ...(GC as any), Spread: { ...(GC as any).Spread, Sheets: sheets } };
}

function makeDesigner(options: { charts?: boolean } = {}): any {
  const workbook = new GC.Spread.Sheets.Workbook();
  return {
    gc: options.charts === false ? gcWithoutCharts() : GC,
    spreadsheet: workbook,
    getWorkbook: () => workbook,
    getCommand: () => undefined,
    getActiveSheet: () => workbook.getActiveSheet(),
    invalidate: () => undefined,
    host: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
    options: {},
  };
}

describe('chart launcher enablement (trial parity)', () => {
  it('enables all eight launchers for a multi-cell selection while charts are loaded', () => {
    const d = makeDesigner();
    d.getWorkbook().getActiveSheet().setSelection(0, 0, 5, 6);
    for (const name of CHART_COMMANDS) expect(commandEnabled(d, name), name).toBe(true);
  });

  it('greys all eight out when the charts feature is absent (the trial with `?plugins=none`)', () => {
    const d = makeDesigner({ charts: false });
    d.getWorkbook().getActiveSheet().setSelection(0, 0, 5, 6);
    for (const name of CHART_COMMANDS) expect(commandEnabled(d, name), name).toBe(false);
  });

  it('greys all eight out for a single empty cell; data and API selections do NOT re-enable them, a user selection change does', () => {
    const withCharts = makeDesigner();
    const sheet = withCharts.getWorkbook().getActiveSheet();
    sheet.setRowCount(200);
    sheet.clear(0, 0, 200, 20, GC.Spread.Sheets.SheetArea.viewport);
    sheet.setSelection(0, 0, 1, 1);
    for (const name of CHART_COMMANDS) expect(commandEnabled(withCharts, name), name).toBe(false);
    // The trial's startup evidence: filling the selected cell through the API (or selecting a
    // data range programmatically) leaves the eight launchers greyed out — the cache is stale on
    // purpose until a USER selection change arrives (what the designer does on `byUser: true`).
    sheet.setValue(0, 0, 12);
    sheet.setSelection(0, 0, 5, 6);
    for (const name of CHART_COMMANDS) expect(commandEnabled(withCharts, name), name).toBe(false);
    invalidateChartLauncherState(withCharts);
    for (const name of CHART_COMMANDS) expect(commandEnabled(withCharts, name), name).toBe(true);
  });

  it('snapshots at construction and recomputes on the first read after invalidation (active-sheet switch)', () => {
    const withCharts = makeDesigner();
    const sheet = withCharts.getWorkbook().getActiveSheet();
    sheet.setSelection(0, 0, 5, 6); // API selection: the snapshot taken below must not see it as fresh
    snapshotChartLauncherState(withCharts); // what the Designer constructor does
    sheet.clearSelection(); // API: cached value survives (trial startup semantics)
    expect(commandEnabled(withCharts, 'insertChart')).toBe(true); // still the snapshot
    invalidateChartLauncherState(withCharts); // ActiveSheetChanged / byUser SelectionChanged
    expect(commandEnabled(withCharts, 'insertChart')).toBe(false); // empty selection -> greyed out
  });
});
