/*
 * Chart-preview galleries of the Insert tab (TASK 60 item 2).
 *
 * The trial renders each chart split-button arrow as a LARGE-ICON gallery: stacked sections
 * ("2-D Column", "Stock", ...) whose tiles are 72x66 px with a 50x50 chart preview glyph.
 * A press on the main part of the split button opens the same gallery (measured on the trial:
 * both the arrow and the icon area open it), and the control is enabled regardless of the
 * cell selection. Every label is resolved through the designer resources; the gallery never
 * shows a raw config key (the config group ids are only resource lookup keys here).
 *
 * Geometry/size measurements below were taken from the running trial's DOM (class structure,
 * host widths/heights, tile sizes, hover colour). Every glyph is our own vector drawing on
 * the shared 32-unit icon grid — no artwork was taken from the product we are matching.
 */
import React from 'react';
import { useDesigner } from '../store.js';
import { resource } from '../app-helpers.js';

/** Gallery layout per split-button command: outer host size + sections in trial order. */
export interface ChartGallerySection { key: string; items: string[] }
export interface ChartGallerySpec { width: number; height: number; sections: ChartGallerySection[] }

export const chartPreviewGalleries: Record<string, ChartGallerySpec> = {
  columnOrBarChartPreview: {
    width: 226, height: 186, sections: [
      { key: 'columnChartGroup', items: ['clusteredColumnChart', 'stackedColumnChart', 'stackedColumn100Chart'] },
      { key: 'barChartGroup', items: ['clusteredBarChart', 'stackedBarChart', 'stackedBar100Chart'] },
    ],
  },
  treeMapOrSunburstChartPreview: {
    width: 82, height: 186, sections: [
      { key: 'treemapChartGroup', items: ['treemapChart'] },
      { key: 'sunburstChartGroup', items: ['sunburstChart'] },
    ],
  },
  funnelOrStockChartPreview: {
    width: 250, height: 430, sections: [
      { key: 'waterfallChartGroup', items: ['waterfallChart'] },
      { key: 'funnelChartGroup', items: ['funnelChart'] },
      { key: 'stockChartGroup', items: ['stockHLCChart', 'stockOHLCChart', 'stockVHLCChart', 'stockVOHLCChart'] },
      { key: 'radarChartGroup', items: ['radarChart', 'radarWithMarkersChart', 'filledRadarChart'] },
    ],
  },
  lineOrAreaChartPreview: {
    width: 240, height: 254, sections: [
      { key: 'lineChartGroup', items: ['lineChart', 'lineStackedChart', 'lineStacked100Chart', 'lineMarkersChart', 'lineMarkersStackedChart', 'lineMarkersStacked100Chart'] },
      { key: 'areaChartGroup', items: ['areaChart', 'areaStackedChart', 'areaStacked100Chart'] },
    ],
  },
  pieOrDoughnutChartPreview: {
    width: 82, height: 186, sections: [
      { key: 'pieChartGroup', items: ['pieChart'] },
      { key: 'doughnutChartGroup', items: ['doughnutChart'] },
    ],
  },
  comboChartPreview: {
    width: 226, height: 98, sections: [
      { key: 'comboChartGroup', items: ['comboChartColumnAndLine', 'comboChartColumnAndArea', 'comboChartColumnAndLineAxis'] },
    ],
  },
  scatterOrBubbleChartPreview: {
    width: 240, height: 254, sections: [
      { key: 'scatterChartGroup', items: ['scatterChart', 'scatterSmoothMarkersChart', 'scatterSmoothChart', 'scatterStraightMarkersChart', 'scatterStraightChart'] },
      { key: 'bubbleChartGroup', items: ['bubbleChart'] },
    ],
  },
};

export const isChartPreviewGallery = (command: string): boolean => command in chartPreviewGalleries;

/* --- preview glyphs -------------------------------------------------------
   Series colours sampled from the trial gallery rendering: a light-blue primary
   series, a mid-grey secondary series and a white third series with a grey outline;
   grey axis strokes (measured #81befc / #d0d0d0 / #666666). */
const AX = '#666666';
const C1 = '#81befc';
const C1P = '#b4d8fb';
const C2 = '#d0d0d0';
const C2P = '#e7e7e7';
const WH = '#ffffff';
const DK = '#404040';

const fill = (d: string, color: string) => <path d={d} fill={color} stroke="none" />;
const box = (x: number, y: number, w: number, h: number, color: string, stroke?: string) =>
  <rect x={x} y={y} width={w} height={h} fill={color} stroke={stroke} strokeWidth={stroke ? 1 : 0} />;
const hair = (d: string, color = AX, width = 1.2) => <path d={d} fill="none" stroke={color} strokeWidth={width} />;
const strokePath = (d: string, color: string, width = 1.6) =>
  <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />;
const dot = (cx: number, cy: number, r: number, color: string, stroke?: string) =>
  <circle cx={cx} cy={cy} r={r} fill={color} stroke={stroke} strokeWidth={stroke ? 1 : 0} />;
const square = (cx: number, cy: number, s: number, color: string) => <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill={color} />;

/** L-shaped value/category axes used by every cartesian preview. */
const axes = <>{hair('M7 6v21h18')}{hair('M7 6h2.2', AX, 1.2)}</>;

/* Cartesian builders. Columns/bar rows sit on the axis corner (7,27). */
const columnSet = (clusters: Array<{ x: number; h1: number; h2: number; h3: number }>) =>
  clusters.map((c, i) => (
    <React.Fragment key={i}>
      {box(c.x, 27 - c.h1, 2.4, c.h1, C1)}
      {box(c.x + 2.6, 27 - c.h2, 2.4, c.h2, C2)}
      {box(c.x + 5.2, 27 - c.h3, 2.4, c.h3, WH, C2)}
    </React.Fragment>
  ));
const barSet = (rows: Array<{ y: number; l1: number; l2: number; l3: number }>) =>
  rows.map((r, i) => (
    <React.Fragment key={i}>
      {box(7, r.y, r.l1, 2.4, C1)}
      {box(7, r.y + 2.6, r.l2, 2.4, C2)}
      {box(7, r.y + 5.2, r.l3, 2.4, WH, C2)}
    </React.Fragment>
  ));
const stackedColumns = (cols: Array<{ x: number; h1: number; h2: number }>, full = false) =>
  cols.map((c, i) => {
    const total = full ? 21 : c.h1 + c.h2;
    const h1 = full ? Math.round(total * c.h1 / (c.h1 + c.h2)) : c.h1;
    return (
      <React.Fragment key={i}>
        {box(c.x, 27 - h1, 4.6, h1, C1)}
        {box(c.x, 27 - total, 4.6, total - h1, full ? C2 : C2P, full ? undefined : C2)}
      </React.Fragment>
    );
  });
const stackedBars = (rows: Array<{ y: number; l1: number; l2: number }>, full = false) =>
  rows.map((r, i) => {
    const total = full ? 21 : r.l1 + r.l2;
    const l1 = full ? Math.round(total * r.l1 / (r.l1 + r.l2)) : r.l1;
    return (
      <React.Fragment key={i}>
        {box(7, r.y, l1, 4.6, C1)}
        {box(7 + l1, r.y, total - l1, 4.6, full ? C2 : C2P, full ? undefined : C2)}
      </React.Fragment>
    );
  });
const lineBlue = 'M8 21l4-6 4 3 4-8 4 5 4-6';
const lineGray = 'M8 24l4-2 4-6 4 5 4-2 4 1';
const markersOn = (d: string, spots: Array<[number, number]>, color: string) =>
  <>{strokePath(d, color, 1.4)}{spots.map(([x, y], i) => <React.Fragment key={i}>{square(x, y, 2.6, color)}</React.Fragment>)}</>;
const areaUnder = (d: string, color: string, lineColor: string) => (
  <>{fill(`${d}L28 27H7Z`, color)}{strokePath(d, lineColor, 1.4)}</>
);

/* Stock marks: vertical high-low stroke, optional open/close ticks, optional volume bars. */
const stockMark = (x: number, high: number, low: number, close: number, open: number | null, volume?: number) => (
  <React.Fragment>
    {hair(`M${x} ${high}V${low}`, DK, 1.2)}
    {hair(`M${x - 2} ${low}h2`, DK, 1.4)}
    {hair(`M${x} ${high}h2`, DK, 1.4)}
    {open != null ? hair(`M${x - 2} ${open}h2`, DK, 1.4) : null}
    {open != null ? hair(`M${x} ${open}h2`, DK, 1.4) : null}
    {volume != null ? box(x - 2.5, 27 - volume, 5, volume, C2P, C2) : null}
  </React.Fragment>
);

/* Radar geometry: pentagon web + data polygon. */
const RADAR_POINTS = (radii: number[]) => {
  const cx = 16.5, cy = 17;
  return radii.map((r, i) => {
    const a = (-90 + i * 72) * Math.PI / 180;
    return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)] as [number, number];
  });
};
const radarWeb = <>
  {RADAR_POINTS([10.5, 10.5, 10.5, 10.5, 10.5]).map(([x, y], i, all) => (
    <React.Fragment key={i}>{i < 4 ? hair(`M${x} ${y}L${all[i + 1][0]} ${all[i + 1][1]}`, C2, 1) : hair(`M${x} ${y}L${all[0][0]} ${all[0][1]}`, C2, 1)}</React.Fragment>
  ))}
  {RADAR_POINTS([5.2, 5.2, 5.2, 5.2, 5.2]).map(([x, y], i, all) => (
    <React.Fragment key={i}>{i < 4 ? hair(`M${x} ${y}L${all[i + 1][0]} ${all[i + 1][1]}`, C2P, 1) : hair(`M${x} ${y}L${all[0][0]} ${all[0][1]}`, C2P, 1)}</React.Fragment>
  ))}
  {RADAR_POINTS([10.5, 10.5, 10.5, 10.5, 10.5]).map(([x, y], i) => <React.Fragment key={i}>{hair(`M16.5 17L${x} ${y}`, C2P, 0.9)}</React.Fragment>)}
</>;
const radarData = RADAR_POINTS([7.5, 10.5, 4.5, 9, 6]);
const radarPoly = radarData.map(([x, y]) => `${x} ${y}`).join('L');

/** Sunburst: three concentric segmented rings (arcs). */
const ringArc = (r: number, from: number, to: number, color: string, width: number) => {
  const cx = 16.5, cy = 17;
  const a0 = from * Math.PI / 180, a1 = to * Math.PI / 180;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = to - from > 180 ? 1 : 0;
  return <path d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`} fill="none" stroke={color} strokeWidth={width} />;
};

const glyphs: Record<string, React.ReactNode> = {
  // 2-D Column / 2-D Bar
  clusteredColumnChart: <>{axes}{columnSet([{ x: 9, h1: 15, h2: 11, h3: 8 }, { x: 16, h1: 17, h2: 9, h3: 12 }, { x: 23, h1: 12, h2: 14, h3: 6 }])}</>,
  stackedColumnChart: <>{axes}{stackedColumns([{ x: 9, h1: 10, h2: 7 }, { x: 16, h1: 13, h2: 4 }, { x: 23, h1: 8, h2: 9 }])}</>,
  stackedColumn100Chart: <>{axes}{stackedColumns([{ x: 9, h1: 12, h2: 9 }, { x: 16, h1: 8, h2: 13 }, { x: 23, h1: 15, h2: 6 }], true)}</>,
  clusteredBarChart: <>{axes}{barSet([{ y: 8, l1: 16, l2: 12, l3: 8 }, { y: 15.5, l1: 12, l2: 17, l3: 6 }, { y: 23, l1: 8, l2: 14, l3: 11 }])}</>,
  stackedBarChart: <>{axes}{stackedBars([{ y: 8.5, l1: 10, l2: 8 }, { y: 16, l1: 13, l2: 4 }, { y: 23.5, l1: 7, l2: 11 }])}</>,
  stackedBar100Chart: <>{axes}{stackedBars([{ y: 8.5, l1: 12, l2: 9 }, { y: 16, l1: 8, l2: 13 }, { y: 23.5, l1: 14, l2: 7 }], true)}</>,

  // Treemap / Sunburst
  treemapChart: <>
    {box(7, 6, 12, 13, C1)}{box(7, 19, 6, 8, C1P, C1)}{box(13, 19, 6, 8, C2P, C2)}
    {box(19, 6, 9, 8, C2)}{box(19, 14, 9, 13, WH, C2)}{box(19, 21, 4.5, 6, C2P, C2)}{box(23.5, 21, 4.5, 6, C2P, C2)}
  </>,
  sunburstChart: <>
    {ringArc(11, -90, 90, C1, 4.5)}{ringArc(11, 90, 220, C2, 4.5)}{ringArc(11, 220, 270, C1P, 4.5)}
    {ringArc(6.5, -120, 40, C1P, 4)}{ringArc(6.5, 40, 160, C2P, 4)}{ringArc(6.5, 160, 240, C1, 4)}
    {dot(16.5, 17, 2.6, C1)}
  </>,

  // Waterfall / Funnel
  waterfallChart: <>
    {axes}
    {box(9, 11, 2.8, 16, C1)}
    {box(13.5, 12, 2.8, 5, WH, C2)}
    {box(18, 10, 2.8, 4, C2)}
    {box(22.5, 14, 2.8, 6, WH, C2)}
    {box(27 - 2.8, 8, 2.8, 19, C1)}
    {hair('M11.8 11h1.7M16.3 12h1.7M20.8 14h1.7M23.3 14h1.4', AX, 1)}
  </>,
  funnelChart: <>
    {fill('M6 7h21l-3 5.5H9z', C1P)}{fill('M9 14h15l-2.6 5.5h-9.8z', C1)}{fill('M11.6 21h9.8l-2 5.5h-5.8z', DK)}
    {strokePath('M6 7h21', WH, 1)}{strokePath('M9 14h15', WH, 1)}{strokePath('M11.6 21h9.8', WH, 1)}
  </>,

  // Stock
  stockHLCChart: <>
    {hair('M7 5v22h18')}
    {stockMark(11, 8, 22, 14, null)}{stockMark(17, 6, 19, 10, null)}{stockMark(23, 10, 24, 20, null)}
  </>,
  stockOHLCChart: <>
    {hair('M7 5v22h18')}
    {stockMark(11, 8, 22, 14, 18)}{stockMark(17, 6, 19, 10, 13)}{stockMark(23, 10, 24, 20, 15)}
  </>,
  stockVHLCChart: <>
    {hair('M7 5v22h18')}
    {stockMark(11, 6, 17, 11, null, 6)}{stockMark(17, 5, 15, 9, null, 9)}{stockMark(23, 8, 18, 15, null, 4)}
  </>,
  stockVOHLCChart: <>
    {hair('M7 5v22h18')}
    {stockMark(11, 6, 17, 11, 14, 6)}{stockMark(17, 5, 15, 9, 12, 9)}{stockMark(23, 8, 18, 15, 11, 4)}
  </>,

  // Radar
  radarChart: <>{radarWeb}{strokePath(`M${radarPoly}`, C1, 1.6)}{strokePath(`M${RADAR_POINTS([5, 8.5, 6.5, 4, 8]).map(([x, y]) => `${x} ${y}`).join('L')}`, C2, 1.3)}</>,
  radarWithMarkersChart: <>{radarWeb}{strokePath(`M${radarPoly}`, AX, 1.4)}{radarData.map(([x, y], i) => <React.Fragment key={i}>{dot(x, y, 2, i % 2 ? C2 : C1)}</React.Fragment>)}</>,
  filledRadarChart: <>{radarWeb}{fill(`M${radarPoly}Z`, C1P)}{strokePath(`M${radarPoly}`, C1, 1.4)}</>,

  // 2-D Line
  lineChart: <>{axes}{strokePath(lineGray, C2, 1.4)}{strokePath(lineBlue, C1, 1.6)}</>,
  lineStackedChart: <>{axes}{areaUnder(lineGray, C2P, C2)}{strokePath('M8 12l4-3 4 4 4-6 4 3 4-4', C1, 1.6)}</>,
  lineStacked100Chart: <>
    {axes}
    {areaUnder('M8 25l4-3 4 2 4-4 4 1 4-3L28 24V27H7Z', C2P, C2)}
    {areaUnder('M8 14l4-4 4 5 4-7 4 4 4-5', WH, C1)}
  </>,
  lineMarkersChart: <>{axes}{strokePath(lineGray, C2, 1.3)}{markersOn(lineBlue, [[8, 21], [12, 15], [16, 18], [20, 10], [24, 15], [28, 9]], C1)}</>,
  lineMarkersStackedChart: <>
    {axes}
    {areaUnder(lineGray, C2P, C2)}{markersOn(lineGray, [[8, 24], [12, 22], [16, 16], [20, 21], [24, 19], [28, 20]], C2)}
    {strokePath('M8 12l4-3 4 4 4-6 4 3 4-4', C1, 1.5)}
  </>,
  lineMarkersStacked100Chart: <>
    {axes}
    {areaUnder('M8 25l4-3 4 2 4-4 4 1 4-3L28 24V27H7Z', C2P, C2)}
    {markersOn('M8 14l4-4 4 5 4-7 4 4 4-5', [[8, 14], [12, 10], [16, 15], [20, 8], [24, 12], [28, 7]], C1)}
  </>,

  // 2-D Area
  areaChart: <>{axes}{areaUnder(lineGray, C2P, C2)}{areaUnder('M8 15l4-5 4 4 4-7 4 3 4-5', C1P, C1)}</>,
  areaStackedChart: <>
    {axes}
    {fill('M8 24l4-3 4 3 4-4 4 2 4-3V27H7V24Z', C2P)}{strokePath('M8 24l4-3 4 3 4-4 4 2 4-3', C2, 1.2)}
    {fill('M8 16l4-4 4 4 4-6 4 3 4-5L28 21L24 18 20 21 16 18 12 21 8 16Z', C1P)}
    {strokePath('M8 16l4-4 4 4 4-6 4 3 4-5', C1, 1.3)}
  </>,
  areaStacked100Chart: <>
    {axes}
    {fill('M7 27h21V22l-4-2-4 3-4-4-4 3-4-2V27Z', C2P)}
    {fill('M7 6h21v16l-4-2-4 3-4-4-4 3-4-2V6Z', C1P)}
    {strokePath('M28 22l-4-2-4 3-4-4-4 3-4-2H7', C2, 1.2)}
    {strokePath('M28 22l-4-2-4 3-4-4-4 3-4-2', AX, 0.8)}
  </>,

  // Pie / Doughnut
  pieChart: <>
    {fill('M16.5 17 L16.5 6 A11 11 0 1 1 6.8 20.9 Z', C1P)}
    {fill('M18.2 15.4 L18.2 5.6 A11 11 0 0 1 27.6 14.2 Z', C1)}
    {strokePath('M16.5 17 L16.5 6 A11 11 0 1 1 6.8 20.9 Z', AX, 1)}
    {strokePath('M18.2 15.4 L18.2 5.6 A11 11 0 0 1 27.6 14.2 Z', AX, 1)}
  </>,
  doughnutChart: <>
    {fill('M16.5 17 L16.5 6 A11 11 0 1 1 6.8 20.9 Z', C1P)}
    {fill('M18.2 15.4 L18.2 5.6 A11 11 0 0 1 27.6 14.2 Z', C1)}
    {dot(16.5, 17, 4.6, WH)}
    {strokePath('M16.5 17 L16.5 6 A11 11 0 1 1 6.8 20.9 Z', AX, 1)}
    {strokePath('M18.2 15.4 L18.2 5.6 A11 11 0 0 1 27.6 14.2 Z', AX, 1)}
    {strokePath('M16.5 12.4a4.6 4.6 0 1 0 .1 0Z', AX, 1)}
  </>,

  // Combo
  comboChartColumnAndLine: <>
    {axes}
    {box(9, 15, 2.4, 12, C1)}{box(11.6, 19, 2.4, 8, C2)}
    {box(16, 11, 2.4, 16, C1)}{box(18.6, 18, 2.4, 9, C2)}
    {box(23, 17, 2.4, 10, C1)}{box(25.6, 13, 2.4, 14, C2)}
    {strokePath('M9 11l5 6 7-9 7 4', DK, 1.6)}
  </>,
  comboChartColumnAndArea: <>
    {axes}
    {areaUnder('M8 14l4-4 4 5 4-7 4 4 4-5', C2P, C2)}
    {box(9, 17, 2.6, 10, WH, C2)}{box(12, 19, 2.6, 8, WH, C2)}
    {box(16, 15, 2.6, 12, C1)}{box(19, 18, 2.6, 9, WH, C2)}
    {box(23, 20, 2.6, 7, WH, C2)}{box(26, 16, 2.6, 11, WH, C2)}
  </>,
  comboChartColumnAndLineAxis: <>
    {axes}{hair('M28 6v21')}
    {box(9, 15, 2.6, 12, C1)}{box(12, 19, 2.6, 8, C2)}
    {box(16, 11, 2.6, 16, C1)}{box(19, 17, 2.6, 10, C2)}
    {box(23, 18, 2.6, 9, C1)}{box(26, 14, 2.6, 13, C2)}
    {strokePath('M9 10l5 7 6-9 7 5', DK, 1.6)}
  </>,

  // Scatter / Bubble
  scatterChart: <>
    {axes}
    {dot(10, 20, 1.9, C1)}{dot(12.5, 13, 1.9, C1)}{dot(17, 22, 1.9, C1)}{dot(20.5, 10, 1.9, C1)}{dot(23, 17, 1.9, C1)}
    {dot(14.5, 24, 1.9, C2)}{dot(21, 23, 1.9, C2)}{dot(26, 8, 1.9, C2)}
  </>,
  scatterSmoothMarkersChart: <>
    {axes}
    {strokePath('M9 22C13 14 17 24 21 13S26 9 27 10', C1, 1.4)}
    {dot(9, 22, 1.8, C1)}{dot(14.5, 18, 1.8, C1)}{dot(21, 13, 1.8, C1)}{dot(27, 10, 1.8, C1)}
    {strokePath('M9 25C14 22 18 26 22 20S26 19 27 18', C2, 1.3)}
    {dot(9, 25, 1.6, C2)}{dot(18, 25, 1.6, C2)}{dot(27, 18, 1.6, C2)}
  </>,
  scatterSmoothChart: <>
    {axes}
    {strokePath('M9 22C13 14 17 24 21 13S26 9 27 10', C1, 1.6)}
    {strokePath('M9 25C14 22 18 26 22 20S26 19 27 18', C2, 1.4)}
  </>,
  scatterStraightMarkersChart: <>
    {axes}
    {strokePath('M9 22l5-6 6 6 7-10', C1, 1.3)}
    {dot(9, 22, 1.8, C1)}{dot(14, 16, 1.8, C1)}{dot(20, 22, 1.8, C1)}{dot(27, 12, 1.8, C1)}
    {strokePath('M9 25l6-2 6 4 6-7', C2, 1.2)}
    {dot(9, 25, 1.6, C2)}{dot(15, 23, 1.6, C2)}{dot(21, 27, 1.6, C2)}{dot(27, 20, 1.6, C2)}
  </>,
  scatterStraightChart: <>
    {axes}
    {strokePath('M9 22l5-6 6 6 7-10', C1, 1.6)}
    {strokePath('M9 25l6-2 6 4 6-7', C2, 1.4)}
  </>,
  bubbleChart: <>
    {axes}
    {dot(12, 13, 4.4, C2)}{dot(19, 9.5, 2.4, C2P, C2)}{dot(15.5, 21, 4, C1P, C1)}{dot(23, 19, 2.8, C1)}
  </>,
};

export function chartPreviewGlyph(name: string): React.ReactNode {
  return glyphs[name] ?? null;
}

function ChartPreviewIcon({ name }: { name: string }): React.ReactElement {
  return (
    <svg width={50} height={50} viewBox="0 0 32 32" fill="none" stroke="none" aria-hidden="true" focusable="false" shapeRendering="geometricPrecision" data-icon={`chart-preview-${name}`}>
      {chartPreviewGlyph(name)}
    </svg>
  );
}

/* --- gallery ---------------------------------------------------------------
   Trial layout (measured): host padding 4px + 1px border; each section = 20px
   bold title + a flex-wrap row of 72x66 tiles (2px bottom margin); tiles have a
   #f5f5f5 hover background; preview glyph is 50x50 centred in the tile. */
export function ChartPreviewGallery({ command }: { command: string }): React.ReactElement {
  const d = useDesigner();
  const spec = chartPreviewGalleries[command];
  if (!spec) return <div className="gc-designer-ribbon-menu-list" />;
  const sectionTitle = (key: string): string => resource(d, `\${res.ribbon.insert.chartGroups.${key}}`);
  const itemTitle = (name: string): string => {
    const text = resource(d, `\${res.ribbon.insert.chartTypes.${name}}`);
    if (text) return text;
    const command2 = d.getCommand(name) as { title?: string } | undefined;
    return resource(d, command2?.title ?? '') || name;
  };
  return (
    <div className="gc-designer-chart-gallery" role="group">
      {spec.sections.map((section) => (
        <div key={section.key} className="gc-designer-chart-gallery-section">
          <div className="gc-designer-group-title"><div className="gc-designer-text">{sectionTitle(section.key)}</div></div>
          <div className="gc-designer-group-content">
            {section.items.map((item) => (
              <div
                key={item}
                className="gc-designer-ribbon-button gc-designer-chart-preview-tile gc-designer-list-content-item-focusable"
                role="menuitem"
                title={itemTitle(item)}
                aria-label={itemTitle(item)}
                data-command={`ribbon.${item}`}
                onClick={(event) => {
                  event.stopPropagation();
                  d.executeCommand(item, item);
                  d.openMenu = null;
                  d.invalidate();
                }}
              >
                <div className="gc-designer-ribbon-button-icon">
                  <div className={`gc-designer-ribbon-icon gc-designer-chart-preview-icon ribbon-insert-chart-preview-${item} chart-preview-icon`}><ChartPreviewIcon name={item} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
