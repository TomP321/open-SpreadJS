/**
 * The three Chart Design tab galleries (TASK 74): Quick Layout (10 layout
 * thumbnails), Change Colors (14 palette rows) and Chart Styles (6 style
 * thumbnails). Every preview is our own vector artwork composed from the same
 * preset data the commands write (contextual-actions.ts), so each thumbnail
 * truthfully shows what its item applies; tile geometry follows the reference
 * product's popup boxes measured black-box (`.probe/t74/measure29-official.json`:
 * 61×54 quick-layout tiles in rows of 3, 224×38 color rows, 216×136 style tiles).
 */
import React from 'react';
import { useDesigner } from '../store.js';
import type { DesignerApi as Designer } from '../designer-api.js';
import { chartColorPalettes, chartStylePresets, paletteStripColors, quickLayoutPresets, type ChartLayoutPatch, type ChartLayoutPreset } from '../contextual-actions.js';
import { resource } from '../app-helpers.js';
import { tabThemeDefaults } from './colors.js';

/** Series colors of the default workbook theme (accent 1..6). */
const SERIES = [tabThemeDefaults[4], tabThemeDefaults[5], tabThemeDefaults[6], tabThemeDefaults[7]];
const INK = '#595959';
const RULE = '#d9d9d9';

/**
 * Tooltip lines of the gallery items, transcribed from the running reference UI
 * (`.probe/t74/measure36.mjs`: each tile's `title` attribute as shown on screen).
 * A Quick Layout tile names every element the layout switches on, a Chart Styles
 * tile shows only its number, and a Change Colors row names its six bands.
 * The wording is ours; the element names are the ones our presets write.
 */
export const quickLayoutTooltips = [
  'Layout1\nChart Title\nLegend(Right)\nHorizontal Axis\nVertical Axis\nMajor Gridlines',
  'Layout2\nChart Title\nLegend(Top)\nHorizontal Axis',
  'Layout3\nChart Title\nLegend(Bottom)\nHorizontal Axis\nVertical Axis\nMajor Gridlines',
  'Layout4\nLegend(Bottom)\nDataLabels(Outside End)\nHorizontal Axis\nVertical Axis',
  'Layout5\nChart Title\nVertical Axis Title\nDataLabels(Outside End)\nHorizontal Axis\nVertical Axis\nMajor Gridlines',
  'Layout6\nLegend(Right)\nHorizontal Axis Title\nVertical Axis Title\nHorizontal Axis\nVertical Axis\nMajor Gridlines\nMinor Gridlines',
  'Layout7\nChart Title\nHorizontal Axis Title\nVertical Axis Title\nHorizontal Axis\nVertical Axis',
  'Layout8\nChart Title\nLegend(Right)\nHorizontal Axis Title\nVertical Axis Title\nHorizontal Axis\nVertical Axis\nMajor Gridlines',
  'Layout9\nChart Title\nLegend(Right)\nDataLabels(Inside End)\nHorizontal Axis\nVertical Axis\nMajor Gridlines',
  'Layout10\nLegend(Right)\nHorizontal Axis\nVertical Axis\nMajor Gridlines',
];

/** Chart Styles tile labels — the trial names them style1..style6 (`.probe/t74/measure36`). */
export const chartStyleTooltips = chartStylePresets.map((_, index) => `style${index + 1}`);

/** One Change Colors row label: "Colorful Palette 4" plus the names of its bands. */
export function colorPaletteLabel(sectionTitle: string, paletteKey: string, index: number): string {
  return `${sectionTitle} Palette ${index + 1}\n${paletteHint(paletteKey)}`;
}

/** The six theme accents in the order the default workbook lists them. */
const ACCENT_NAMES = ['Blue', 'Orange', 'Gray', 'Gold', 'Blue', 'Green'];
const GRAY_NAMES = ['Dark Gray', 'Light Gray', 'Gray', 'Dark Gray', 'Light Gray', 'Gray'];

function tokenName(token: string): string {
  const tinted = /^(accent \d|text 1)\s+(-?\d+)$/.exec(token);
  const base = tinted ? tinted[1] : token;
  const tint = Number(tinted?.[2] ?? 0);
  const accent = /^accent (\d)$/.exec(base);
  const name = accent ? ACCENT_NAMES[Number(accent[1]) - 1] : 'Gray';
  return tint < 0 ? `Dark ${name}` : tint > 0 ? `Light ${name}` : name;
}

/** Second tooltip line of a Change Colors row: the names of its six bands. */
function paletteHint(key: string): string {
  const palette = chartColorPalettes[key];
  if (!palette) return '';
  const tokens = palette[1];
  if (tokens.length === 1) {
    const ramp = palette[0] === 3 ? 'light to dark' : 'dark to light';
    return `${tokenName(tokens[0])} gradient, ${ramp}`;
  }
  const bands = tokens.slice(0, 6).map(tokenName);
  return bands.every((name) => /Gray/.test(name)) ? GRAY_NAMES.join(', ') : bands.join(', ');
}

/** Bar cluster used by every preview: heights (of 100) and x positions. */
const BAR_HEIGHTS = [0.85, 0.5, 0.62, 0.42];

function BarCluster({ x, y, w, h, scale = 1 }: { x: number; y: number; w: number; h: number; scale?: number }): React.ReactElement {
  const bars = BAR_HEIGHTS.map((height, index) => (
    <rect key={index} x={x + index * (w / 4)} y={y - h * height * scale} width={w / 5} height={h * height * scale} fill={SERIES[index]} />
  ));
  return <g>{bars}</g>;
}

/** Miniature column chart honoring one measured Quick Layout preset. */
export function QuickLayoutThumb({ preset }: { preset: ChartLayoutPreset }): React.ReactElement {
  const plot = { x: 9, y: 37, w: 34, h: 22 };
  const valueAxis: ChartLayoutPatch | undefined = preset.axes.find((axis) => axis.key === 'primaryValue');
  const categoryAxis: ChartLayoutPatch | undefined = preset.axes.find((axis) => axis.key === 'primaryCategory');
  const major = valueAxis?.major === true;
  const minor = valueAxis?.minor === true;
  const valueVisible = valueAxis?.visible !== false;
  const categoryVisible = categoryAxis?.visible !== false;
  const legendPos = preset.legendPosition;
  const grid = major || minor;
  const gridLines = major && minor ? [6, 12, 18] : major ? [11, 22] : [];
  return (
    <svg viewBox="0 0 55 48" width="55" height="48" aria-hidden="true" shapeRendering="geometricPrecision">
      <rect x="0.5" y="0.5" width="54" height="47" rx="2" fill="#ffffff" stroke={RULE} />
      {preset.title ? <rect x="16" y="3.5" width="23" height="4" rx="1" fill={INK} /> : null}
      {preset.title && preset.axes.some((axis) => axis.titleText === 'Axis Titles') ? <rect x="19" y="8.5" width="17" height="2.5" rx="1" fill="#8c8c8c" /> : null}
      {grid ? gridLines.map((offset) => <rect key={offset} x={plot.x} y={plot.y - offset} width={plot.w} height="0.8" fill={RULE} />) : null}
      {valueVisible !== false ? <rect x={plot.x - 1.2} y={plot.y - plot.h} width="1.2" height={plot.h} fill="#8c8c8c" /> : null}
      {categoryVisible !== false ? <rect x={plot.x} y={plot.y} width={plot.w} height="1.2" fill="#8c8c8c" /> : null}
      <BarCluster x={plot.x + 1} y={plot.y - 1.2} w={plot.w - 2} h={plot.h - 2} />
      {preset.labelsShow ? BAR_HEIGHTS.map((height, index) => <rect key={index} x={plot.x + 1 + index * ((plot.w - 2) / 4) - 0.5} y={plot.y - 1.2 - (plot.h - 2) * height - 3} width={(plot.w - 2) / 4 + 1} height="2" rx="0.5" fill="#f2f2f2" stroke="#9e9e9e" strokeWidth="0.4" />) : null}
      {preset.axes.some((axis) => axis.titleText === 'Axis Titles') && categoryVisible !== false ? <rect x={plot.x} y={plot.y + 2.5} width={plot.w} height="2.5" rx="1" fill="#8c8c8c" /> : null}
      {preset.axes.some((axis) => axis.titleText === 'Axis Titles') && valueVisible !== false ? <rect x={plot.x - 5.5} y={plot.y - plot.h} width="2.5" height={plot.h} rx="1" fill="#8c8c8c" /> : null}
      {preset.legendVisible ? (legendPos === 1 ? <LegendRow x={14} y={preset.title ? 7 : 3.5} /> : legendPos === 4 ? <LegendRow x={14} y={43} /> : <LegendColumn x={46} y={16} />) : null}
    </svg>
  );
}

/** Three series chips in one row (bottom/top legend). */
function LegendRow({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g>
      {SERIES.slice(0, 3).map((color, index) => (
        <g key={color}>
          <rect x={x + index * 10} y={y} width="3.5" height="3.5" fill={color} />
          <rect x={x + index * 10 + 4.5} y={y + 1.2} width="4.5" height="1.4" fill="#c8c8c8" />
        </g>
      ))}
    </g>
  );
}

/** Vertical legend chips at the right edge. */
function LegendColumn({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g>
      {SERIES.slice(0, 3).map((color, index) => (
        <g key={color}>
          <rect x={x} y={y + index * 7} width="3" height="3" fill={color} />
          <rect x={x + 4} y={y + index * 7 + 1} width="4" height="1.2" fill="#c8c8c8" />
        </g>
      ))}
    </g>
  );
}

/** One Change Colors row: the palette's six resolved swatches stacked as bands. */
function ColorPaletteRow({ d, paletteKey, label }: { d: Designer; paletteKey: string; label: string }): React.ReactElement {
  const colors = paletteStripColors(d, paletteKey);
  return (
    <div
      className="gc-color-items-container gc-designer-color-palette-row"
      role="menuitem"
      data-command="ribbon.changeColors"
      data-value={paletteKey}
      aria-label={label}
      title={label}
      onClick={() => { d.executeCommand('changeColors', 'changeColors', paletteKey); d.openMenu = null; d.invalidate(); }}
    >
      {colors.map((color, index) => <div key={index} className="gc-color-item" style={{ background: color }} />)}
    </div>
  );
}

export function ChangeColorsGallery(): React.ReactElement {
  const d = useDesigner();
  const sections = [
    { title: resource(d, '${res.ribbon.chartDesign.colorful}') || 'Colorful', keys: ['colorfulPalette1', 'colorfulPalette2', 'colorfulPalette3', 'colorfulPalette4'] },
    { title: resource(d, '${res.ribbon.chartDesign.monochromatic}') || 'Monochromatic', keys: Array.from({ length: 13 }, (_, index) => `monochromaticPalette${index + 1}`) },
  ];
  return (
    <div className="gc-designer-gallery gc-change-colors-gallery">
      {sections.map((section) => (
        <div key={section.title} className="gc-designer-gallery-section">
          <div className="gc-designer-gallery-title">{section.title}</div>
          {section.keys.map((key, index) => (
            <ColorPaletteRow key={key} d={d} paletteKey={key} label={colorPaletteLabel(section.title, key, index)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Miniature chart applying one measured Chart Style preset. */
function ChartStyleThumb({ preset }: { preset: { pcMajor: boolean; pvMajor: boolean; legendPosition: number; labelsShow: boolean; chartBack: string; chartInk: string } }): React.ReactElement {
  const dark = preset.chartBack.includes('rgb');
  const back = dark ? '#5d5d5d' : '#ffffff';
  const ink = dark ? '#ffffff' : INK;
  const rule = dark ? '#7d7d7d' : RULE;
  const plot = { x: 34, y: 96, w: 132, h: 64 };
  return (
    <svg viewBox="0 0 200 124" width="200" height="124" aria-hidden="true" shapeRendering="geometricPrecision">
      <rect x="0.5" y="0.5" width="199" height="123" rx="2" fill={back} stroke={RULE} />
      <rect x="62" y="8" width="76" height="9" rx="2" fill={ink} />
      {preset.pvMajor ? [22, 43, 64].map((offset) => <rect key={offset} x={plot.x} y={plot.y - offset} width={plot.w} height="1" fill={rule} />) : null}
      {preset.pcMajor ? [33, 66, 99].map((offset) => <rect key={offset} x={plot.x + offset} y={plot.y - plot.h} width="1" height={plot.h} fill={rule} />) : null}
      <rect x={plot.x - 2} y={plot.y - plot.h} width="2" height={plot.h} fill={ink} />
      <rect x={plot.x} y={plot.y} width={plot.w} height="2" fill={ink} />
      <BarCluster x={plot.x + 4} y={plot.y - 2} w={plot.w - 8} h={plot.h - 4} />
      {preset.labelsShow ? BAR_HEIGHTS.map((height, index) => <rect key={index} x={plot.x + 4 + index * ((plot.w - 8) / 4) - 1} y={plot.y - 2 - (plot.h - 4) * height - 7} width={(plot.w - 8) / 4 + 2} height="4" rx="1" fill={dark ? '#e8e8e8' : '#f2f2f2'} stroke={ink} strokeWidth="0.6" />) : null}
      {preset.legendPosition === 1 ? <LegendRow x={70} y={20} /> : <LegendRow x={70} y={112} />}
    </svg>
  );
}

export function ChartStyleGallery(): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-designer-gallery gc-chart-style-gallery">
      {chartStylePresets.map((preset, index) => (
        <div
          key={index}
          className="gc-designer-gallery-tile gc-chart-style-tile"
          role="option"
          data-command="ribbon.chartStyle"
          data-value={`style${index}`}
          aria-label={`style${index + 1}`}
          title={`style${index + 1}`}
          onClick={() => { d.executeCommand('chartStyle', 'chartStyle', index + 1); d.openMenu = null; d.invalidate(); }}
        >
          <ChartStyleThumb preset={preset} />
        </div>
      ))}
    </div>
  );
}

export function QuickLayoutGallery(): React.ReactElement {
  const d = useDesigner();
  return (
    <div className="gc-designer-gallery gc-quick-layout-gallery">
      {quickLayoutPresets.map((preset, index) => (
        <div
          key={index}
          className="gc-designer-gallery-tile gc-quick-layout-tile"
          role="option"
          data-command="ribbon.quickLayoutListContent"
          data-value={`layout${index + 1}`}
          aria-label={`Layout${index + 1}`}
          title={quickLayoutTooltips[index] ?? `Layout${index + 1}`}
          onClick={() => { d.executeCommand('quickLayout', 'quickLayoutListContent', index + 1); d.openMenu = null; d.invalidate(); }}
        >
          <QuickLayoutThumb preset={preset} />
        </div>
      ))}
    </div>
  );
}
