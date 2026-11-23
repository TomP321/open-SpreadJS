/* Change Chart Type dialog (TASK 65 item 3, the trial's "Custom Combination"
 * editor). Layout measured black-box on the running v19 trial (docs/STATUS.md,
 * TASK 65): ~640 x 500 dialog, a category list on the left (Column, Line, Pie,
 * Bar, Area, X Y(Scatter), Stock, Radar, Sunburst, TreeMap, Funnel, Waterfall,
 * Combo), a row of small type tiles on the right with the selected tile's
 * caption below; the Combo category carries the three gallery presets plus
 * "Custom Combination", whose tile shows "Choose the chart type and axis for
 * your data series:" with one row per series (a chart-type combo + a Secondary
 * Axis checkbox). All tile art is our own inline SVG geometry, sized to the
 * measured tile box; series changes go through the public `chart.series()` API
 * with a per-series `chartType`/`axisGroup`, exactly like the trial's insert. */
import React from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import { chartsNamespace } from '../core-internals.js';
import { CustomSelect } from './custom-widgets.js';
import { uiKey } from '../resolve.js';
import { T } from './t.js';

/** Category rows of the trial's left list, in its order. */
export const CHART_TYPE_CATEGORIES = [
  'Column', 'Line', 'Pie', 'Bar', 'Area', 'X Y(Scatter)', 'Stock', 'Radar', 'Sunburst', 'TreeMap', 'Funnel', 'Waterfall', 'Combo',
];

/** Tile kinds the small preview painter knows (own vector art per kind). */
export type ChartTileKind = 'column' | 'columnStacked' | 'bar' | 'line' | 'lineStacked' | 'area' | 'areaStacked' | 'pie' | 'doughnut' | 'scatter' | 'scatterLines' | 'comboColumnLine' | 'comboColumnLineAxis' | 'comboAreaColumn' | 'comboCustom';

/** One dialog tile: its caption, the public `ChartType` name it applies, and its art. */
export interface ChartTile {
  label: string;
  /** The `Charts.ChartType` member name (single-type change). */
  typeName?: string;
  kind: ChartTileKind;
  /** Combo preset: the two plot groups (see `COMBO_CHART_PLAN` in commands/insert.ts). */
  plan?: { first: string; second: string; axisGroup: number };
  /** The Custom Combination tile: shows the per-series editor. */
  custom?: boolean;
}

/** Tiles per category (the trial's set, filtered to the types our engine draws). */
export const CHART_TYPE_TILES: Record<string, ChartTile[]> = {
  Column: [
    { label: 'Clustered Column', typeName: 'columnClustered', kind: 'column' },
    { label: 'Stacked Column', typeName: 'columnStacked', kind: 'columnStacked' },
    { label: '100% Stacked Column', typeName: 'columnStacked100', kind: 'columnStacked' },
  ],
  Line: [
    { label: 'Line', typeName: 'line', kind: 'line' },
    { label: 'Stacked Line', typeName: 'lineStacked', kind: 'lineStacked' },
    { label: 'Line with Markers', typeName: 'lineMarkers', kind: 'line' },
  ],
  Pie: [
    { label: 'Pie', typeName: 'pie', kind: 'pie' },
    { label: 'Doughnut', typeName: 'doughnut', kind: 'doughnut' },
  ],
  Bar: [
    { label: 'Clustered Bar', typeName: 'barClustered', kind: 'bar' },
    { label: 'Stacked Bar', typeName: 'barStacked', kind: 'bar' },
    { label: '100% Stacked Bar', typeName: 'barStacked100', kind: 'bar' },
  ],
  Area: [
    { label: 'Area', typeName: 'area', kind: 'area' },
    { label: 'Stacked Area', typeName: 'areaStacked', kind: 'areaStacked' },
    { label: '100% Stacked Area', typeName: 'areaStacked100', kind: 'areaStacked' },
  ],
  'X Y(Scatter)': [
    { label: 'Scatter', typeName: 'xyScatter', kind: 'scatter' },
    { label: 'Scatter with Straight Lines', typeName: 'xyScatterLines', kind: 'scatterLines' },
    { label: 'Scatter with Smooth Lines', typeName: 'xyScatterSmooth', kind: 'scatterLines' },
  ],
  Stock: [{ label: 'High-Low-Close', typeName: 'stockHLC', kind: 'line' }],
  Radar: [
    { label: 'Radar', typeName: 'radar', kind: 'line' },
    { label: 'Filled Radar', typeName: 'radarFilled', kind: 'area' },
  ],
  Sunburst: [{ label: 'Sunburst', typeName: 'sunburst', kind: 'doughnut' }],
  TreeMap: [{ label: 'TreeMap', typeName: 'treemap', kind: 'column' }],
  Funnel: [{ label: 'Funnel', typeName: 'funnel', kind: 'bar' }],
  Waterfall: [{ label: 'Waterfall', typeName: 'waterfall', kind: 'columnStacked' }],
  Combo: [
    { label: 'Clustered Column - Line', kind: 'comboColumnLine', plan: { first: 'columnClustered', second: 'line', axisGroup: 0 } },
    { label: 'Clustered Column - Line On Secondary Axis', kind: 'comboColumnLineAxis', plan: { first: 'columnClustered', second: 'line', axisGroup: 1 } },
    { label: 'Stacked Area - Clustered Column', kind: 'comboAreaColumn', plan: { first: 'areaStacked', second: 'columnClustered', axisGroup: 0 } },
    { label: 'Custom Combination', kind: 'comboCustom', custom: true },
  ],
};

/** The per-series chart-type options of the Custom Combination editor. */
export const SERIES_CHART_TYPES: { label: string; typeName: string }[] = [
  { label: 'Clustered Column', typeName: 'columnClustered' },
  { label: 'Clustered Bar', typeName: 'barClustered' },
  { label: 'Line', typeName: 'line' },
  { label: 'Area', typeName: 'area' },
  { label: 'Stacked Area', typeName: 'areaStacked' },
  { label: 'XY Scatter', typeName: 'xyScatter' },
];

/** One series row of the Custom Combination editor. */
export interface ChartSeriesPlan {
  name: string;
  xValues?: string;
  yValues?: string;
  chartType: number;
  axisGroup: number;
}

/* ------------------------------------------------------------- tile art --- */

/** The 46 x 34 preview of a tile — our own paths, sized to the measured box. */
export function ChartTileArt({ kind }: { kind: ChartTileKind }): React.ReactElement {
  const stroke = '#7f7f7f';
  const blue = '#4f81bd';
  const orange = '#f08b3a';
  const common = { width: 46, height: 34 };
  switch (kind) {
    case 'column': return (
      <svg {...common} aria-hidden="true">
        <rect x="6" y="14" width="7" height="14" fill={blue} /><rect x="16" y="9" width="7" height="19" fill="#f2f2f2" stroke={stroke} />
        <rect x="26" y="17" width="7" height="11" fill={blue} /><rect x="36" y="6" width="7" height="22" fill="#f2f2f2" stroke={stroke} />
      </svg>
    );
    case 'columnStacked': return (
      <svg {...common} aria-hidden="true">
        <rect x="7" y="16" width="8" height="12" fill={blue} /><rect x="7" y="9" width="8" height="7" fill="#f2f2f2" stroke={stroke} />
        <rect x="20" y="18" width="8" height="10" fill={blue} /><rect x="20" y="12" width="8" height="6" fill="#f2f2f2" stroke={stroke} />
        <rect x="33" y="14" width="8" height="14" fill={blue} /><rect x="33" y="7" width="8" height="7" fill="#f2f2f2" stroke={stroke} />
      </svg>
    );
    case 'bar': return (
      <svg {...common} aria-hidden="true">
        <rect x="6" y="6" width="20" height="6" fill={blue} /><rect x="6" y="14" width="30" height="6" fill="#f2f2f2" stroke={stroke} />
        <rect x="6" y="22" width="14" height="6" fill={blue} />
      </svg>
    );
    case 'line': return (
      <svg {...common} aria-hidden="true">
        <polyline points="4,26 14,14 24,20 34,8 42,16" fill="none" stroke={blue} />
        <polyline points="4,28 14,24 24,26 34,18 42,22" fill="none" stroke={stroke} />
      </svg>
    );
    case 'lineStacked': return (
      <svg {...common} aria-hidden="true">
        <polyline points="4,26 14,18 24,22 34,12 42,16" fill="none" stroke={blue} />
        <polyline points="4,20 14,10 24,14 34,6 42,9" fill="none" stroke={orange} />
      </svg>
    );
    case 'area': return (
      <svg {...common} aria-hidden="true">
        <polygon points="4,30 4,18 16,12 28,18 42,10 42,30" fill={blue} opacity="0.75" />
      </svg>
    );
    case 'areaStacked': return (
      <svg {...common} aria-hidden="true">
        <polygon points="4,30 4,22 16,17 28,21 42,15 42,30" fill={blue} opacity="0.75" />
        <polygon points="4,17 16,11 28,15 42,8 42,15 28,21 16,17 4,22" fill="#f2f2f2" stroke={stroke} />
      </svg>
    );
    case 'pie': return (
      <svg {...common} aria-hidden="true">
        <circle cx="23" cy="17" r="12" fill={blue} />
        <path d="M23,17 L23,5 A12,12 0 0,1 34,12 Z" fill="#f2f2f2" stroke={stroke} />
      </svg>
    );
    case 'doughnut': return (
      <svg {...common} aria-hidden="true">
        <circle cx="23" cy="17" r="12" fill={blue} /><circle cx="23" cy="17" r="5" fill="#ffffff" />
        <path d="M23,17 L23,5 A12,12 0 0,1 34,12 L26,16 Z" fill="#f2f2f2" stroke={stroke} />
      </svg>
    );
    case 'scatter': return (
      <svg {...common} aria-hidden="true">
        {[6, 15, 23, 31, 40].map((x, i) => <circle key={x} cx={x} cy={26 - i * 4} r="2" fill={blue} />)}
      </svg>
    );
    case 'scatterLines': return (
      <svg {...common} aria-hidden="true">
        {[6, 15, 23, 31, 40].map((x, i) => <circle key={x} cx={x} cy={26 - i * 4} r="2" fill={blue} />)}
        <polyline points="6,26 15,22 23,18 31,14 40,10" fill="none" stroke={stroke} />
      </svg>
    );
    case 'comboColumnLine': case 'comboColumnLineAxis': case 'comboAreaColumn': case 'comboCustom': {
      const combo = kind === 'comboColumnLineAxis';
      const area = kind === 'comboAreaColumn';
      return (
        <svg {...common} aria-hidden="true">
          {area
            ? <polygon points="6,30 6,20 16,14 28,19 40,12 40,30" fill={blue} opacity="0.6" />
            : <>
              <rect x="6" y="16" width="7" height="14" fill={blue} /><rect x="17" y="10" width="7" height="20" fill="#f2f2f2" stroke={stroke} />
              <rect x="28" y="19" width="7" height="11" fill={blue} />
            </>}
          <polyline points="6,14 18,8 30,13 40,5" fill="none" stroke={orange} />
          {combo && <line x1="43" y1="4" x2="43" y2="30" stroke={stroke} strokeDasharray="2 2" />}
          {kind === 'comboCustom' && <path d="M34,30 l7,-7 4,4 -7,7 z" fill="#6f6f6f" />}
        </svg>
      );
    }
    default: return <svg {...common} aria-hidden="true" />;
  }
}

/* ----------------------------------------------------------------- body --- */

interface Props { designer: Designer; data: Record<string, unknown>; update: (path: string | undefined, value: unknown) => void }

/** The body: category list, tiles, caption and the Custom Combination editor. */
export function ChangeChartTypeBody({ designer, data, update }: Props): React.ReactElement {
  void designer;
  const category = String(data.category ?? 'Column');
  const tiles = CHART_TYPE_TILES[category] ?? [];
  const tileIndex = Math.min(tiles.length - 1, Math.max(0, Number(data.tile ?? 0)));
  const tile = tiles[tileIndex];
  const series = (data.series ?? []) as ChartSeriesPlan[];
  const typeNameOf = (value: number): string => {
    const enums: Record<string, number> = designer.gc?.Spread?.Sheets?.Charts ? chartsNamespace(designer.gc).ChartType : {};
    return SERIES_CHART_TYPES.find((item) => Number(enums[item.typeName]) === value)?.typeName ?? SERIES_CHART_TYPES[0].typeName;
  };
  return (
    <div className="gc-chart-type-dialog">
      <div className="gc-chart-type-categories" role="listbox" aria-label={T('chartCategory', 'Chart category')}>
        {CHART_TYPE_CATEGORIES.map((name) => (
          <div key={name} role="option" aria-selected={name === category}
            className={`gc-chart-type-category${name === category ? ' selected' : ''}`}
            onClick={() => update('category', name)}>{name}</div>
        ))}
      </div>
      <div className="gc-chart-type-right">
        <div className="gc-chart-type-tiles">
          {tiles.map((item, index) => (
            <button key={item.label} type="button" title={T(uiKey(item.label), item.label)}
              className={`gc-chart-type-tile${index === tileIndex ? ' selected' : ''}`}
              onClick={() => update('tile', index)}>
              <ChartTileArt kind={item.kind} />
            </button>
          ))}
        </div>
        <div className="gc-chart-type-caption">{tile ? T(uiKey(tile.label), tile.label) : ''}</div>
        <div className="gc-chart-type-separator" />
        {tile?.custom && (
          <div className="gc-chart-type-custom">
            <div className="gc-chart-type-custom-title">{T('chooseTheChartTypeAndAxisForYourDataSeries', 'Choose the chart type and axis for your data series:')}</div>
            <div className="gc-chart-type-series" role="table" aria-label={T('dataSeries', 'Data series')}>
              <div className="gc-chart-type-series-row gc-chart-type-series-head" role="row">
                <span role="columnheader">{T('seriesName', 'Series Name')}</span><span role="columnheader">{T('chartType', 'Chart Type')}</span><span role="columnheader">{T('secondaryAxis', 'Secondary Axis')}</span>
              </div>
              {series.map((row, index) => (
                <div className="gc-chart-type-series-row" role="row" key={index}>
                  <span role="cell" className="gc-chart-type-series-name">{row.name}</span>
                  <span role="cell">
                    <CustomSelect className="gc-dialog-select" ariaLabel={`Chart type for ${row.name}`}
                      value={typeNameOf(row.chartType)}
                      options={SERIES_CHART_TYPES.map((option) => ({ text: T(uiKey(option.label), option.label), value: option.typeName }))} onChange={(next) => update(`seriesType.${index}`, String(next))} />
                  </span>
                  <span role="cell" className="gc-chart-type-series-axis">
                    <input type="checkbox" aria-label={`Secondary axis for ${row.name}`} checked={row.axisGroup === 1}
                      onChange={(event) => update(`seriesAxis.${index}`, event.target.checked ? 1 : 0)} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
