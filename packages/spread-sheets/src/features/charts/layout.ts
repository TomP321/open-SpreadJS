/**
 * Chart layout: chart-area frame plus title/legend bands and the plot rect, all in the
 * chart-rect coordinate system (the canvas element itself sits 1 px up-left of it — see
 * charts/chart.ts). Trial values on a 420x280 column chart: plot = x 23.35..398,
 * y 48.5..212 data rows; legend text centre at height-25; title glyphs at y 7..19.
 */
export interface Rect { x: number; y: number; width: number; height: number }

export interface ChartLayout {
  frame: Rect;
  title: Rect | null;
  legend: Rect | null;
  plot: Rect;
  /** Line groups use their own category band layout (trial: wider, centred). */
  plotLine: Rect;
  valueLabelWidth: number;
  categoryLabelHeight: number;
}

export interface LayoutInput {
  titleText: string;
  titleFontSize: number;
  legendVisible: boolean;
  legendPosition: number;
  leftGutter: number;
  rightGutter: number;
  bottomGutter: number;
  /** Horizontal bar charts sit the plot higher under the title band. */
  horizontal?: boolean;
  /** Pie/doughnut: tighter title band and no category gutter below. */
  pieLike?: boolean;
  /** Stacked (non-percent) areas draw 8 px higher under the title band. */
  areaStackedLike?: boolean;
  /** Scatter/bubble plots start 11 px lower (the trial leaves label headroom). */
  topPadExtra?: number;
  /** Floor for the plot left edge (trial: bars/lines 23, stock charts 16). */
  leftFloor?: number;
}

export function computeLayout(width: number, height: number, options: LayoutInput & { inset?: number }): ChartLayout {
  const inset = options.inset ?? 0;
  const frame: Rect = { x: inset + 0.5, y: inset + 0.5, width: Math.max(1, width - 1 - inset * 2), height: Math.max(1, height - 1 - inset * 2) };
  const hasTitle = !!options.titleText;
  const topPad = inset + (hasTitle
    ? (options.pieLike ? 31 : options.horizontal ? 30 : options.areaStackedLike ? 30 : Math.round(options.titleFontSize * 1.35) + 14)
    : 8) + (options.topPadExtra ?? 0);
  const showLegend = options.legendVisible;
  const legendTop = showLegend && options.legendPosition === 1;
  const legendBottom = showLegend && options.legendPosition === 4;
  const legendLeft = showLegend && options.legendPosition === 3;
  const legendSide = showLegend && (options.legendPosition === 2 || options.legendPosition === 5 || legendLeft);
  const bottomPad = inset + options.bottomGutter + (legendBottom ? (options.pieLike ? 52 : 48) : 0);
  const rightPad = inset + options.rightGutter + (legendSide && !legendLeft ? 82 : 0);
  const leftPad = inset + (legendLeft ? 107 : options.leftGutter);
  let title: Rect | null = null;
  if (hasTitle) {
    const h = Math.round(options.titleFontSize * 1.2);
    // The trial centres the title over the plot band (from the label gutter to
    // the plot right edge), which sits a few px left of the chart centre.
    title = { x: inset + 8, y: inset + 4, width: Math.max(10, width - inset * 2 - 25 - 8), height: h };
  }
  let legend: Rect | null = null;
  if (options.legendVisible) {
    if (legendBottom) legend = { x: inset + 4, y: height - inset - 36, width: width - inset * 2 - 8, height: 20 };
    else if (legendTop) legend = { x: inset + 4, y: topPad + 6, width: width - inset * 2 - 8, height: 20 };
    else legend = { x: legendLeft ? inset + 12 : width - inset - 83, y: topPad, width: legendLeft ? 90 : 70, height: Math.min(120, height - topPad - bottomPad) };
  }
  const leftEdge = Math.max(inset + (options.leftFloor ?? 23), leftPad);
  const plot: Rect = {
    x: leftEdge,
    y: topPad + (legendTop ? 50 : 0),
    width: Math.max(10, width - leftEdge - rightPad),
    height: Math.max(10, height - topPad - (legendTop ? 50 : 0) - bottomPad),
  };
  // The trial lays line-chart categories on their own, wider band (measured:
  // right edge only ~13 px from the chart edge, points at band centres).
  const lineRight = legendSide ? plot.x + plot.width : width - inset - 12;
  const plotLine: Rect = { x: plot.x, y: plot.y, width: Math.max(plot.width, lineRight - plot.x), height: plot.height };
  return { frame, title, legend, plot, plotLine, valueLabelWidth: plot.x, categoryLabelHeight: 28 };
}

/**
 * Trial-measured gutters (420x280 column chart, TASK 54 canvas probe
 * `.probe/t54/probe-t54-canvas54.json` + the sweep fixtures): plot right edge = chart rect
 * +398 (gutter 22), bottom band 30 px (category labels) when no legend below.
 */
export const RIGHT_GUTTER = 22;
export const BOTTOM_GUTTER = 30;
export const LEGEND_BAND = 48;
