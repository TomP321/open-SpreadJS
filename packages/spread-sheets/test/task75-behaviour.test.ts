/* TASK 75 r5: behaviour parity findings from the Designer ribbon-command sweep
 * (apps/designer-compare, `?side=official` vs `?side=ours`, `.probe/t75r5/`).
 * Each test pins one workbook-JSON difference the sweep reported. */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const SS = GC.Spread.Sheets;
const { Workbook, Range } = SS;
const { ChartType } = SS.Charts;

/** The sweep fixture sheet `Data`: header row + four numeric rows, F = Total. */
function fixture(): { wb: InstanceType<typeof Workbook>; sheet: ReturnType<InstanceType<typeof Workbook>['getActiveSheet']> } {
  const wb = new Workbook();
  const sheet = wb.getActiveSheet();
  sheet.name('Data');
  sheet.setArray(0, 0, [
    ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'],
    ['North', 120, 135, 150, 165, 570],
    ['South', 90, 105, 95, 125, 415],
    ['East', 75, 80, 90, 100, 345],
    ['West', 110, 115, 105, 130, 460],
  ]);
  return { wb, sheet };
}

function chartSpace(chart: unknown): Record<string, never> {
  return (chart as { toJSON(): { shapeData: { graphicFrame: { graphic: { graphicData: { chart: { chartSpace: Record<string, never> } } } } } } })
    .toJSON().shapeData.graphicFrame.graphic.graphicData.chart.chartSpace;
}

describe('TASK 75 r5 filter restore', () => {
  it('shows filter-hidden rows without a `visible: true` record (Clear Filter)', () => {
    // Trial (setFilter → clearFilter/clearFilterData/reapplyFilter probes): the filter shows the
    // rows it hid behind the scenes, so the saved workbook carries no `rows` array at all.
    const { sheet } = fixture();
    const filter = new SS.Filter.HideRowFilter(new Range(0, 1, 5, 4));
    sheet.rowFilter(filter);
    filter.addFilterItem(0, new SS.ConditionalFormatting.Condition(1, { compareType: 0, expected: 135 }));
    filter.filter(0);
    expect(sheet.toJSON().rows).toBeDefined();
    filter.reset();
    expect(sheet.getRowVisible(1)).toBe(true);
    expect(sheet.toJSON().rows).toBeUndefined();
  });

  it('shows filter-hidden rows without a record on unfilter() too', () => {
    const { sheet } = fixture();
    const filter = new SS.Filter.HideRowFilter(new Range(0, 1, 5, 4));
    sheet.rowFilter(filter);
    filter.addFilterItem(0, new SS.ConditionalFormatting.Condition(1, { compareType: 0, expected: 135 }));
    filter.filter(0);
    filter.unfilter();
    expect(sheet.toJSON().rows).toBeUndefined();
  });

  it('keeps the explicit `visible: true` record for the public setter (Unhide Rows)', () => {
    // The other half of the probe: `sheet.setRowVisible(r, true)` DOES materialise.
    const { sheet } = fixture();
    sheet.setRowVisible(6, false);
    sheet.setRowVisible(6, true);
    const rows = sheet.toJSON().rows as ({ visible?: boolean } | null)[];
    expect(rows[6]).toMatchObject({ visible: true });
  });
});

describe('TASK 75 r5 bubble chart over one cell', () => {
  it('builds one series with the cell as yVal and no xVal', () => {
    // Trial (bubbleChart gallery item on a single cell): `ser.length` 1, yVal the cell,
    // sizes the literal 1 — ours produced no series at all.
    const { sheet } = fixture();
    const chart = sheet.charts.add('Bubble', ChartType.bubble, 350, 20, 300, 200, 'B2');
    const groups = (chartSpace(chart).chart as { plotArea: { chartGroups: Record<string, never>[] } }).plotArea.chartGroups;
    expect(groups[0].chartType).toBe(3);
    const ser = groups[0].ser as Record<string, never>[];
    expect(ser).toHaveLength(1);
    expect(ser[0].xVal).toBeUndefined();
    expect((ser[0].yVal as { numRef: { f: string } }).numRef.f).toBe('Data!$B$2');
    expect((ser[0].bubbleSize as { numLit: { ptCount: number; pt: string[] } }).numLit).toMatchObject({ ptCount: 1, pt: ['1'] });
    expect((ser[0].spPr as { solidFill: unknown }).solidFill).toEqual({ schemeClr: { val: 4 } });
  });

  it('still writes xVal when the range carries a category column', () => {
    const { sheet } = fixture();
    const chart = sheet.charts.add('Bubble2', ChartType.bubble, 350, 20, 300, 200, 'A1:C5');
    const groups = (chartSpace(chart).chart as { plotArea: { chartGroups: Record<string, never>[] } }).plotArea.chartGroups;
    const ser = groups[0].ser as Record<string, never>[];
    expect(ser.length).toBeGreaterThan(0);
    expect(ser[0].xVal).toBeDefined();
  });
});

describe('TASK 75 r5 stock series-count validation', () => {
  const message = (order: string) =>
    `To create this stock chart, arrange the data on your sheet in this order: ${order}. Use dates or stock names as labels.`;

  it('rejects HLC unless the data gives exactly three series', () => {
    // Trial probe `.probe/t75r5/p4.json`: HLC accepts A1:D5 (3 series) and refuses B2 (1),
    // A1:C5 (2) and A1:E5 (4); ours only validated the OHLC families.
    const { sheet } = fixture();
    const add = (range: string) => () => sheet.charts.add('C' + range, ChartType.stockHLC, 350, 20, 300, 200, range);
    expect(add('B2')).toThrow(message('high price, low price, closing price'));
    expect(add('A1:C5')).toThrow(message('high price, low price, closing price'));
    expect(add('A1:E5')).toThrow(message('high price, low price, closing price'));
    expect(add('A1:D5')).not.toThrow();
  });

  it('rejects an OHLC range with too MANY series as well', () => {
    const { sheet } = fixture();
    expect(() => sheet.charts.add('C2', ChartType.stockOHLC, 350, 20, 300, 200, 'A1:F5', 1))
      .toThrow(message('opening price, high price, low price, closing price'));
    expect(() => sheet.charts.add('C3', ChartType.stockOHLC, 350, 20, 300, 200, 'A1:E5', 1)).not.toThrow();
  });
});

describe('TASK 75 r5 gallery combo series styles', () => {
  it('_applyGalleryComboStyle materialises fill, line and the bar dataObject', () => {
    // Measured for all three presets in `.probe/t75r5/p2.json`; `series().add()` alone does
    // NOT do this (`.probe/t75r5/p3.json`), so it is a property of the gallery preset.
    const { sheet } = fixture();
    const chart = sheet.charts.add('Combo', ChartType.columnClustered, 350, 20, 300, 200, 'B2:E4');
    const series = chart.series();
    const built = series.get() as { yValues: string }[];
    series.remove(built.length - 1);
    series.add({ yValues: built[built.length - 1].yValues, chartType: ChartType.line });
    (chart as unknown as { _applyGalleryComboStyle(): void })._applyGalleryComboStyle();
    const space = chartSpace(chart);
    const groups = (space.chart as { plotArea: { chartGroups: Record<string, never>[] } }).plotArea.chartGroups;
    expect((space.chart as { dispBlanksAs: number }).dispBlanksAs).toBe(1);
    const bar = groups[0].ser as Record<string, never>[];
    expect(bar[0].spPr).toEqual({
      solidFill: { schemeClr: { val: 4 } },
      ln: { solidFill: { srgbClr: { val: [0, 0, 0] } }, w: 0, prstDash: 0 },
    });
    expect(bar[0].extLst).toEqual({
      ext: [{
        uri: '{6F2FDCE9-48DA-4B69-8628-5D25D57E5C99}',
        dataObject: { extDataType: 0, spPr: { solidFill: { srgbClr: { val: [255, 255, 255] } }, ln: { noFill: true } } },
      }],
    });
    const line = groups[1].ser as Record<string, never>[];
    expect(line[0].spPr).toEqual({ solidFill: { schemeClr: { val: 6 } }, ln: { w: 2 } });
    expect(line[0].extLst).toBeUndefined();
  });

  it('gives an AREA first group the black line but no dataObject extension', () => {
    // comboChartColumnAndArea: group 0 is areaStacked — `ln` only, the bar group carries the extLst.
    const { sheet } = fixture();
    const chart = sheet.charts.add('Combo2', ChartType.areaStacked, 350, 20, 300, 200, 'B2:E4');
    (chart as unknown as { _applyGalleryComboStyle(): void })._applyGalleryComboStyle();
    const groups = (chartSpace(chart).chart as { plotArea: { chartGroups: Record<string, never>[] } }).plotArea.chartGroups;
    const area = groups[0].ser as Record<string, never>[];
    expect((area[0].spPr as Record<string, never>).ln).toEqual({ solidFill: { srgbClr: { val: [0, 0, 0] } }, w: 0, prstDash: 0 });
    expect(area[0].extLst).toBeUndefined();
    expect((chartSpace(chart).chart as { dispBlanksAs: number }).dispBlanksAs).toBe(1);
  });
});
