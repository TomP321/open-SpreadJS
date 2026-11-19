/*
 * TASK 60 item 2: the chart-preview gallery specs (unit level).
 * The sizes/counts/captions below were measured from the running trial at 1280x720 (black-box
 * DOM measurement). This test guards that our gallery data keeps matching them, that every
 * gallery label resolves through the resources (no raw config key can leak into the UI), and
 * that every preview item has its own glyph.
 */
import { describe, expect, it } from 'vitest';
import { chartPreviewGalleries, chartPreviewGlyph } from '../src/ribbon/chart-galleries.js';
import { englishResources } from '../src/resources.js';

const res = englishResources as unknown as {
  ribbon: { insert: { chartGroups: Record<string, string>; chartTypes: Record<string, string> } };
};

const TRIAL_SIZES: Record<string, { width: number; height: number; tiles: number; titles: string[] }> = {
  columnOrBarChartPreview: { width: 226, height: 186, tiles: 6, titles: ['2-D Column', '2-D Bar'] },
  treeMapOrSunburstChartPreview: { width: 82, height: 186, tiles: 2, titles: ['Treemap', 'Sunburst'] },
  funnelOrStockChartPreview: { width: 250, height: 430, tiles: 9, titles: ['Waterfall', 'Funnel', 'Stock', 'Radar'] },
  lineOrAreaChartPreview: { width: 240, height: 254, tiles: 9, titles: ['2-D Line', '2-D Area'] },
  pieOrDoughnutChartPreview: { width: 82, height: 186, tiles: 2, titles: ['Pie', 'Doughnut'] },
  comboChartPreview: { width: 226, height: 98, tiles: 3, titles: ['Combo'] },
  scatterOrBubbleChartPreview: { width: 240, height: 254, tiles: 6, titles: ['Scatter', 'Bubble'] },
};

describe('chart-preview galleries (trial parity data)', () => {
  it('has exactly the seven Insert-tab preview commands', () => {
    expect(Object.keys(chartPreviewGalleries).sort()).toEqual(Object.keys(TRIAL_SIZES).sort());
  });

  for (const [command, trial] of Object.entries(TRIAL_SIZES)) {
    it(`${command}: sizes, sections and item counts match the trial`, () => {
      const spec = chartPreviewGalleries[command];
      expect(spec.width, 'host width').toBe(trial.width);
      expect(spec.height, 'host height').toBe(trial.height);
      expect(spec.sections.length, 'section count').toBe(trial.titles.length);
      const titles = spec.sections.map((section) => res.ribbon.insert.chartGroups[section.key]);
      expect(titles, 'section captions come from the resources').toEqual(trial.titles);
      const items = spec.sections.flatMap((section) => section.items);
      expect(items.length, 'preview tile count').toBe(trial.tiles);
      for (const item of items) {
        expect(res.ribbon.insert.chartTypes[item], `${item} title is a resource string`).toBeTruthy();
        expect(chartPreviewGlyph(item), `${item} has its own preview glyph`).toBeTruthy();
      }
    });
  }

  it('no preview item or section key is ever shown raw: every key maps to a resource string', () => {
    for (const spec of Object.values(chartPreviewGalleries)) {
      for (const section of spec.sections) {
        expect(section.key, `resource entry for ${section.key}`).toMatch(/Group$/);
        expect(res.ribbon.insert.chartGroups[section.key], section.key).toBeTruthy();
        // A resolved caption must never be the config key itself.
        expect(res.ribbon.insert.chartGroups[section.key]).not.toBe(section.key);
      }
    }
  });

  it('the 37 command specs used by the galleries title through ${res.ribbon.insert.chartTypes.*}', () => {
    const items = Object.values(chartPreviewGalleries).flatMap((spec) => spec.sections.flatMap((s) => s.items));
    expect(items.length).toBe(37);
    for (const name of new Set(items)) {
      expect(res.ribbon.insert.chartTypes[name], `resources cover ${name}`).toBeTruthy();
    }
  });
});
