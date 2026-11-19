/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * TASK 60 item 2 — Insert-tab chart split-button galleries vs the trial.
 *
 * Measured reference (the trial at 1280x720, Insert tab):
 * - clicking the arrow AND the icon part of a preview split button opens a LARGE-ICON gallery;
 * - the control is enabled whenever the selection is usable as a chart source: any multi-cell
 *   range (even a fully empty block) and any single cell that holds a value; a single EMPTY
 *   cell greys all seven launchers out and their caret opens nothing (measured with grid clicks);
 * - the main "Charts" launcher (insertChart) is enabled in every selection state;
 * - gallery outer sizes: columnOrBar 226x186, treemap 82x186, funnel 250x430, line 240x254,
 *   pie 82x186, combo 226x98, scatter 240x254; tiles 72x66 with a 50px preview glyph;
 * - a tile inserts "Chart 1" (480x300 px) anchored 20 px right of the selection, one row below
 *   its first row, and leaves that chart selected;
 * - section captions and item tooltips come from the resources ("2-D Column", "Clustered Column",
 *   "High-Low-Close", ...) — never a raw config group key like "columnChartGroup".
 */
import { test, expect } from '@playwright/test';
import { boot } from './helpers';

const VIEWPORT = { width: 1280, height: 720 };
const GALLERIES: Record<string, unknown> = {
  columnOrBarChartPreview: 1, treeMapOrSunburstChartPreview: 1, funnelOrStockChartPreview: 1,
  lineOrAreaChartPreview: 1, pieOrDoughnutChartPreview: 1, comboChartPreview: 1, scatterOrBubbleChartPreview: 1,
};

interface GalleryInfo {
  x: number; y: number; width: number; height: number;
  titles: string[]; tiles: { w: number; h: number }[]; labels: string[]; text: string;
}

async function openChartGallery(page: any, command: string): Promise<GalleryInfo | null> {
  const button = await page.locator(`[data-command="ribbon.${command}"]`).first().boundingBox();
  expect(button, `found ${command}`).not.toBeNull();
  await page.mouse.click(button!.x + button!.width - 8, button!.y + button!.height / 2);
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const host = document.querySelector('.gc-designer-ribbon-dropdown.gc-designer-large-icon');
    if (!host) return null;
    const r = host.getBoundingClientRect();
    const tiles = Array.from(host.querySelectorAll('.gc-designer-chart-preview-tile, .gc-designer-ribbon-button')).map((t) => {
      const q = t.getBoundingClientRect();
      return { w: Math.round(q.width), h: Math.round(q.height) };
    });
    const labels = Array.from(host.querySelectorAll('[data-command]')).map((e) => e.getAttribute('aria-label') ?? '');
    return {
      x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
      titles: Array.from(host.querySelectorAll('.gc-designer-group-title')).map((t) => t.textContent!.trim()),
      tiles, labels, text: host.textContent ?? '',
    };
  });
}

async function selectRange(page: any, range: string): Promise<void> {
  const box = page.locator('input.gc-name-box-selector');
  await box.click();
  await box.press('Control+a');
  await box.fill(range);
  await box.press('Enter');
  await page.waitForTimeout(300);
}

for (const side of ['official', 'ours'] as const) {
  test(`${side}: chart galleries open on a data selection with trial geometry and resource labels`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    await page.click('text=Insert');
    await page.waitForTimeout(500);
    await selectRange(page, 'A1:F5');

    const expectations: Array<{ command: string; width: number; height: number; tiles: number; titles: string[] }> = [
      { command: 'columnOrBarChartPreview', width: 226, height: 186, tiles: 6, titles: ['2-D Column', '2-D Bar'] },
      { command: 'treeMapOrSunburstChartPreview', width: 82, height: 186, tiles: 2, titles: ['Treemap', 'Sunburst'] },
      { command: 'funnelOrStockChartPreview', width: 250, height: 430, tiles: 9, titles: ['Waterfall', 'Funnel', 'Stock', 'Radar'] },
      { command: 'lineOrAreaChartPreview', width: 240, height: 254, tiles: 9, titles: ['2-D Line', '2-D Area'] },
      { command: 'pieOrDoughnutChartPreview', width: 82, height: 186, tiles: 2, titles: ['Pie', 'Doughnut'] },
      { command: 'comboChartPreview', width: 226, height: 98, tiles: 3, titles: ['Combo'] },
      { command: 'scatterOrBubbleChartPreview', width: 240, height: 254, tiles: 6, titles: ['Scatter', 'Bubble'] },
    ];
    for (const want of expectations) {
      const gallery = await openChartGallery(page, want.command);
      expect(gallery, `${side}: ${want.command} opens a gallery`).not.toBeNull();
      expect(gallery!.width, `${want.command} width`).toBeCloseTo(want.width, 0);
      expect(gallery!.height, `${want.command} height`).toBeCloseTo(want.height, 0);
      expect(gallery!.titles, `${want.command} section captions`).toEqual(want.titles);
      const previewTiles = gallery!.tiles.filter((t) => t.w === 72 && t.h === 66);
      expect(previewTiles.length, `${want.command} tile count`).toBe(want.tiles);
      // TASK 60 item 2: no raw config keys may ever appear as labels.
      expect(gallery!.text, `${want.command} shows no raw group keys`).not.toMatch(/[a-z]+ChartGroup/);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }

    if (side === 'ours') {
      // Resource-driven item captions (tooltips) match the trial's transcribed strings.
      const gallery = await openChartGallery(page, 'columnOrBarChartPreview');
      expect(gallery!.labels.filter((l) => /Column|Bar/.test(l)).slice(0, 6), 'preview item labels')
        .toEqual(['Clustered Column', 'Stacked Column', '100% Stacked Column', 'Clustered Bar', 'Stacked Bar', '100% Stacked Bar']);
      await page.keyboard.press('Escape');
    }
    await page.close();
  });

  test(`${side}: preview galleries are enabled for single-cell and empty selections too`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    await page.click('text=Insert');
    await page.waitForTimeout(500);
    // The trial recomputes its ribbon command states only when the selection really changes,
    // so step through another cell first (the harness selects B2 while it boots the workbook).
    await selectRange(page, 'A1');
    await selectRange(page, 'B2');
    const single = await openChartGallery(page, 'columnOrBarChartPreview');
    expect(single, `${side}: single-cell selection still opens the gallery (trial)`).not.toBeNull();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await selectRange(page, 'G6:H7');
    const empty = await openChartGallery(page, 'columnOrBarChartPreview');
    expect(empty, `${side}: empty range still opens the gallery (trial)`).not.toBeNull();
    await page.keyboard.press('Escape');
    await page.close();
  });

  /* Trial rule measured through the grid selection path (TASK 60 item 2): a single *empty*
   * cell greys out all seven chart-preview launchers and their caret opens nothing, while a
   * multi-cell range (even an empty block) or a single cell with a value keeps them enabled. */
  test(`${side}: a single empty cell disables every chart-preview launcher`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    await page.click('text=Insert');
    await page.waitForTimeout(500);
    const commands = Object.keys(GALLERIES);
    await selectRange(page, 'G6');
    for (const command of commands) {
      const control = page.locator(`[data-command="ribbon.${command}"]`);
      await expect(control, `${side}: ${command} greyed on a single empty cell`).toHaveClass(/gc-designer-ribbon-list-disabled/);
    }
    const box = await page.locator('[data-command="ribbon.columnOrBarChartPreview"]').boundingBox();
    await page.mouse.click(box!.x + box!.width - 6, box!.y + box!.height / 2);
    await page.waitForTimeout(500);
    await expect(page.locator('.gc-designer-ribbon-dropdown.gc-designer-large-icon'), `${side}: caret opens nothing while greyed`).toHaveCount(0);
    // The main "Charts" launcher follows the same rule (measured on the trial): greyed with a
    // single empty cell, enabled with a usable selection.
    await expect(page.locator('[data-command="ribbon.insertChart"]'), `${side}: insertChart greyed like the trial`).toHaveClass(/gc-designer-ribbon-button-disable/);
    await selectRange(page, 'A1:F5');
    await expect(page.locator('[data-command="ribbon.insertChart"]'), `${side}: insertChart enabled on a data range`).not.toHaveClass(/disable/);
    for (const command of commands) {
      await expect(page.locator(`[data-command="ribbon.${command}"]`), `${side}: ${command} enabled on a data range`).not.toHaveClass(/gc-designer-ribbon-list-disabled/);
    }
    await page.close();
  });

  /* A gallery item inserts the chart the way the trial does (TASK 60 item 2, measured):
   * "Chart 1", the type's public ChartType value, 480x300 px, anchored 20 px to the right of
   * the selection and one row below its first row. */
  test(`${side}: a preview tile inserts the trial's chart geometry`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await boot(page, side);
    await page.click('text=Insert');
    await page.waitForTimeout(500);
    await selectRange(page, 'A1:F5');
    const button = await page.locator('[data-command="ribbon.columnOrBarChartPreview"]').first().boundingBox();
    await page.mouse.click(button!.x + button!.width - 6, button!.y + button!.height / 2);
    await page.waitForTimeout(500);
    const tile = await page.locator('[data-command="ribbon.clusteredColumnChart"]').first().boundingBox();
    await page.mouse.click(tile!.x + tile!.width / 2, tile!.y + tile!.height / 2);
    await page.waitForTimeout(1200);
    const chart = await page.evaluate(() => {
      const sheet = (window as any).__designerCompare.spread.getActiveSheet();
      const charts = (sheet.charts.all() as any[]).map((c) => ({ name: c.name(), type: c.chartType(), x: c.x(), y: c.y(), w: c.width(), h: c.height(), selected: !!c.isSelected() }));
      const GC = (window as any).GC;
      return { charts, clusteredColumn: GC.Spread.Sheets.Charts.ChartType.columnClustered };
    });
    expect(chart.charts.length, `${side}: one chart inserted`).toBe(1);
    const inserted = chart.charts[0];
    expect(inserted.name, `${side}: trial chart naming`).toBe('Chart 1');
    expect(inserted.type, `${side}: public ChartType value`).toBe(chart.clusteredColumn);
    expect(inserted.x, `${side}: x = selection right + 20`).toBeCloseTo(468, 0);
    expect(inserted.y, `${side}: y = one row below the selection top`).toBeCloseTo(20, 0);
    expect(inserted.w, `${side}: width`).toBeCloseTo(480, 0);
    expect(inserted.h, `${side}: height`).toBeCloseTo(300, 0);
    expect(inserted.selected, `${side}: the inserted chart is selected`).toBe(true);
    await page.close();
  });
}
