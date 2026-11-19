/**
 * The Chart class: a floating object whose canonical model is the chartSpace
 * JSON the trial serialises inside `shapeData.graphicFrame.graphic.graphicData`.
 * Public getters/setters convert to that model (see accessors.ts); painting
 * happens on a canvas hosted by the floating-object layer (paint.ts).
 */
import { FloatingObject } from '../floating-objects.js';
import type { Worksheet } from '../../worksheet.js';
import type { WorkbookRenderer } from '../../rendering.js';
import { GC as ApiEnums } from '../../generated/enums.js';
import type { JsonRecord } from './types.js';
import { CT_SHAPE_TYPE, GroupType } from './types.js';
import { DEFAULT_COLOR_LIST } from './color-schemes.js';
import { buildChartSpace, buildSeries, refsFor, rebuildRefs, autoOrientation } from './chart-space.js';
import { parseRanges } from './refs.js';
import { getAxes, getLegend, getTitle, setAxes, setLegend, setTitle } from './accessors.js';
import { buildDataLabelEntry, refreshPlotAreaSpPr, typeDefaultLabelPosition } from './dlabels.js';
import { resolveRefText } from './data.js';
import { SeriesCollection, flattenSeries, groupPublicType, seriesGetter } from './series.js';
import { LAYOUT_PUBLIC_TYPE } from './data-charts.js';
import { paintChart } from './paint.js';

const ChartType = ApiEnums.Spread.Sheets.Charts.ChartType;

function unionRange(formulas: unknown[]): { row: number; col: number; rowCount: number; colCount: number } | null {
  const rects = formulas.flatMap(f => parseRanges(f));
  if (!rects.length) return null;
  const top = Math.min(...rects.map(r => r.row));
  const left = Math.min(...rects.map(r => r.col));
  const bottom = Math.max(...rects.map(r => r.row + r.rowCount - 1));
  const right = Math.max(...rects.map(r => r.col + r.colCount - 1));
  return { row: top, col: left, rowCount: bottom - top + 1, colCount: right - left + 1 };
}

export class Chart extends FloatingObject {
  override typeName = '2';
  /** Canonical chartSpace model (trial-compatible). */
  _space!: JsonRecord;
  _loaded = false;
  _manualSeries = false;
  /** Set after series add/set/remove: mirrors the trial's broken internal cache. */
  _rangeBroken = false;
  _typeBroken = false;
  /** Set once `ignoreHidden()` ran (series getters mirror its negation). */
  _ignoreHidden?: boolean;

  private _dataFingerprint = '';
  /** @internal serialised shape id (`cNvPr.id`). */
  _shapeId = 2;
  _useAnimation = false;
  private _series?: SeriesCollection;
  private _canvas?: HTMLCanvasElement;
  private _hoverStyle?: JsonRecord;
  private _formatOvers?: JsonRecord;

  constructor(sheet?: Worksheet, name?: string, chartType?: number, x = 0, y = 0, width = 300, height = 200,
    dataRange?: string, dataOrientation?: number, colorScheme?: unknown) {
    super(String(name ?? 'Chart'), x, y, width, height);
    this._sheet = sheet;
    Object.assign(this.props, {
      chartType: Number(chartType ?? ChartType.columnClustered),
      // No explicit orientation: take the one the trial would pick for this range shape.
      dataOrientation: Number(dataOrientation ?? autoOrientation(String(dataRange ?? ''), sheet)),
      explicitOrientation: dataOrientation !== undefined,
      dataRange: String(dataRange ?? ''),
      canPrint: true, alt: '',
    });
    this._rebuildSpace(colorScheme as [number, string[]] | undefined);
    // The trial runs a deferred initial layout pass a moment after creation;
    // that pass stamps plotArea.spPr.ln (visible from the next snapshot on).
    if (typeof setTimeout === 'function') {
      this._lnTimer = setTimeout(() => {
        this._lnTimer = undefined;
        this._lnReady = true;
        refreshPlotAreaSpPr(this._space);
        this._sheet?._view()?.schedule();
      }, 2000);
      (this._lnTimer as { unref?: () => void }).unref?.();
    }
    if (typeof document !== 'undefined') {
      this._canvas = document.createElement('canvas');
      this._canvas.style.cssText = 'width:100%;height:100%;display:block';
      this.content(this._canvas as unknown as HTMLElement);
    }
  }

  private _rebuildSpace(colorScheme?: [number, string[]]): void {
    const sheetName = this._sheet?.name() ?? 'Sheet1';
    this._space = buildChartSpace({
      chartType: Number(this.props.chartType), dataRange: this._normalizedDataRange(),
      sheetName, orientation: Number(this.props.dataOrientation), name: String(this.name()),
      explicitOrientation: !!this.props.explicitOrientation,
    }, colorScheme ?? ([0, [...DEFAULT_COLOR_LIST]] as [number, string[]]), this._sheet);
  }

  private _normalizedDataRange(): string {
    const text = String(this.props.dataRange ?? '');
    const rects = parseRanges(text);
    if (!rects.length) return text;
    const sheetName = this._sheet?.name() ?? 'Sheet1';
    const join = (r: JsonRecord) => `${sheetName}!$${colLetters(r.col)}$${r.row + 1}:$${colLetters(r.col + r.colCount - 1)}$${r.row + r.rowCount}`;
    return rects.map(join).join(',');
  }

  // ------------------------------------------------------------------ data

  chartType(value?: number): number | this {
    if (value === undefined) return this._typeBroken ? 0 : Number(this.props.chartType);
    // Trial: `combo` is a placeholder enum member, never settable.
    if (Number(value) === 0) throw new Error('Can not set combo chart type!');
    this.props.chartType = Number(value);
    this._typeBroken = false;
    const scheme = this._space.colorScheme as [number, string[]] | undefined;
    this._rebuildSpace(scheme);
    this._changed();
    return this;
  }

  dataRange(value?: string): string | this {
    if (value === undefined) {
      // The trial's dataRange getter breaks once the series list was mutated
      // (it JSON-parses an internal cache that the series ops clear).
      if (this._rangeBroken) throw new Error('"undefined" is not valid JSON');
      return this._normalizedDataRange();
    }
    this.props.dataRange = String(value);
    const sheetName = this._sheet?.name() ?? 'Sheet1';
    rebuildRefs(this._space, {
      chartType: Number(this.props.chartType), dataRange: this._normalizedDataRange(),
      sheetName, orientation: Number(this.props.dataOrientation), name: String(this.name()),
    }, true, this._sheet);
    this._changed();
    return this;
  }

  switchDataOrientation(): boolean {
    if (this._manualSeries) return false;
    this.props.dataOrientation = Number(this.props.dataOrientation) === 1 ? 0 : 1;
    const sheetName = this._sheet?.name() ?? 'Sheet1';
    // Rebuilt series carry no spPr (the palette colour stays implicit).
    // The trial keeps the SWITCHED orientation (trial probe `.probe/t54/sweep-chart-r5c.log`
    // axis-scale/orientation-switch: $B$1..$D$1 column series on the 3x3 fixture), so this
    // rebuild must treat it as an explicit orientation.
    rebuildRefs(this._space, {
      chartType: Number(this.props.chartType), dataRange: this._normalizedDataRange(),
      sheetName, orientation: Number(this.props.dataOrientation), name: String(this.name()),
      explicitOrientation: true,
    }, false);
    this._changed();
    return true;
  }

  series(): SeriesCollection {
    return this._series ??= new SeriesCollection(this);
  }

  /** @internal */ _markSeriesManual(): void { this._manualSeries = true; }
  /** @internal Mirrors the trial: after series ops some getters misreport. */
  _markSeriesOp(kind: 'add' | 'add-new-group' | 'set' | 'remove'): void {
    this._rangeBroken = true;
    if (kind !== 'add') this._typeBroken = true;
  }
  /** @internal */ _changed(): void {
    if (this._lnReady) refreshPlotAreaSpPr(this._space);
    this._sheet?._view()?.schedule();
  }

  private _lnReady = false;
  private _lnTimer?: unknown;

  /** @internal Cancels the deferred layout stamp when the chart is removed. */
  override _dispose(): void {
    if (this._lnTimer !== undefined && typeof clearTimeout === 'function') clearTimeout(this._lnTimer as ReturnType<typeof setTimeout>);
    this._lnTimer = undefined;
    super._dispose();
  }

  /** @internal */ _buildSeries(chartType: number, refs: { name: string, category: string, value: string }[], startIdx: number, withStyle = true): JsonRecord[] {
    return buildSeries(chartType, refs, startIdx, withStyle);
  }
  /** @internal */ _seriesView(group: JsonRecord, ser: JsonRecord): JsonRecord {
    const rect = unionRange([(ser.val?.numRef ?? ser.val?.strRef ?? ser.yVal?.numRef ?? {}).f
      ?? ser.formulaObj?.numDim ?? ser.formulaObj?.strDim]);
    return seriesGetter(this, group, ser, rect ? rect.rowCount * rect.colCount : 0);
  }

  colorScheme(value?: unknown): unknown {
    if (value === undefined) return this._space.colorScheme;
    const scheme = value as [number, string[]];
    this._space.colorScheme = [Number(scheme?.[0]) || 0, [...(scheme?.[1] ?? [])]];
    this._changed();
    return this;
  }

  // ------------------------------------------------------------- style getters

  title(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) return getTitle(this._space, this._loaded, ref => (this._sheet ? resolveRefText(this._sheet, ref) : ''));
    setTitle(this._space, value);
    this._changed();
    return this;
  }

  legend(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) {
      // Trial quirk (black-box): the stock family's legend getter dies inside
      // an internal JSON round-trip (`undefined is not valid JSON`).
      if ((this._space.chart?.plotArea?.chartGroups ?? []).some((g: JsonRecord) => Number(g.chartType) === 0))
        throw new Error('"undefined" is not valid JSON');
      return getLegend(this._space, this._loaded);
    }
    setLegend(this._space, value);
    this._changed();
    return this;
  }

  axes(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) {
      const out = getAxes(this._space, this._loaded) as JsonRecord;
      // The trial's getter reports the value axis of every 100%-stacked chart
      // with the `0%` number format even though the JSON keeps `General`.
      if ([14, 20, 25, 28, 38].includes(Number(this.props.chartType)) && out?.primaryValue) out.primaryValue.format = '0%';
      return out;
    }
    setAxes(this._space, value);
    this._changed();
    return this;
  }

  chartArea(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) {
      const spPr = this._space.spPr ?? {};
      const out: JsonRecord = {
        backColor: spPr.solidFill ? colorText(spPr.solidFill) : 'background 1 0', backColorTransparency: 0,
        color: 'text 1 35', transparency: 0, fontFamily: 'Calibri', fontSize: 13.33,
        border: {
          color: spPr.ln?.solidFill ? colorText(spPr.ln.solidFill) : 'text 1 85', transparency: 0,
          width: Number(spPr.ln?.w ?? 1), dashStyle: Number(spPr.ln?.prstDash ?? 0),
        },
      };
      return out;
    }
    const spPr = this._space.spPr ??= {};
    if (value.backColor !== undefined) {
      if (value.backColor === 'transparent' || value.backColor === '') spPr.solidFill = { schemeClr: { val: 0 } };
      else spPr.solidFill = colorObject(value.backColor);
    }
    if (value.border) {
      spPr.ln = spPr.ln ?? {};
      if (value.border.color !== undefined) spPr.ln.solidFill = colorObject(value.border.color);
      if (value.border.width !== undefined) spPr.ln.w = Number(value.border.width);
      if (value.border.dashStyle !== undefined) spPr.ln.prstDash = Number(value.border.dashStyle);
    }
    this._changed();
    return this;
  }

  plotArea(value?: JsonRecord): JsonRecord | this {
    const area = this._space.chart.plotArea;
    if (value === undefined) {
      const out: JsonRecord = {
        backColor: area.spPr?.solidFill ? colorText(area.spPr.solidFill) : '', backColorTransparency: 0,
        border: {
          color: area.spPr?.ln?.solidFill ? colorText(area.spPr.ln.solidFill) : '', transparency: 0,
          width: Number(area.spPr?.ln?.w ?? 1), dashStyle: Number(area.spPr?.ln?.prstDash ?? 0),
        },
      };
      const manual = area.layout?.manualLayout;
      if (manual) out.layout = { x: manual.x, y: manual.y, width: manual.w, height: manual.h };
      return out;
    }
    if (value.layout) {
      const l = value.layout as JsonRecord;
      area.layout = { manualLayout: { x: Number(l.x ?? 0), y: Number(l.y ?? 0), w: Number(l.width ?? 0), h: Number(l.height ?? 0), xMode: 0, yMode: 0, layoutTarget: 0 } };
      area.spPr = { noFill: true, ln: { noFill: true } };
    }
    if (value.backColor !== undefined) {
      area.spPr = area.spPr ?? {};
      const obj = colorObject(value.backColor);
      if (!obj) { area.spPr.noFill = true; delete area.spPr.solidFill; }
      else { delete area.spPr.noFill; area.spPr.solidFill = obj; }
    }
    if (value.border) {
      area.spPr = area.spPr ?? {};
      area.spPr.ln = area.spPr.ln ?? {};
      if (value.border.color !== undefined) {
        const obj = colorObject(value.border.color);
        if (obj) { delete area.spPr.ln.noFill; area.spPr.ln.solidFill = obj; }
        else area.spPr.ln.noFill = true;
      }
      if (value.border.width !== undefined) area.spPr.ln.w = Number(value.border.width);
    }
    this._changed();
    return this;
  }

  dataLabels(value?: JsonRecord): JsonRecord | this {
    const sers = flattenSeries(this);
    if (value === undefined) {
      const first = sers.find(entry => entry.ser.dLbls);
      const dl0 = sers[0]?.ser.dataLabels as JsonRecord | undefined;
      if (dl0 && sers[0].group.plotSurface !== undefined) {
        // DataCharts: the getter mirrors the first series' label template.
        return {
          showValue: false, showSeriesName: false, showCategoryName: !!dl0.visibility?.categoryName,
          position: Number(dl0.dLblPos ?? 2), format: dl0.numFmt?.formatCode ?? 'General', separator: dl0.separator ?? ', ',
          numberFormatLinked: dl0.numFmt?.sourceLinked !== false, color: 'rgb(255,255,255)', transparency: 0,
          fontFamily: 'Calibri', fontSize: 13.33, fontBold: false, backColor: '', backColorTransparency: 0,
          borderColor: '', borderColorTransparency: 0,
        };
      }
      const pie = Number(this.props.chartType) === 10 || Number(this.props.chartType) === 3;
      if (!first) {
        const minimal: JsonRecord = { showValue: false, showSeriesName: false, showCategoryName: false, showDataLabelsRange: false };
        if (pie) minimal.showPercentage = false;
        return minimal;
      }
      const out = first.ser.dLbls as JsonRecord;
      const rPr = (out.txPr?.p?.[0]?.elements?.[0]?.rPr ?? {}) as JsonRecord;
      const result: JsonRecord = {
        showValue: !!out.showVal, showSeriesName: !!out.showSerName, showCategoryName: !!out.showCatName,
        position: Number(out.dLblPos ?? typeDefaultLabelPosition(Number(this.props.chartType))),
        format: out.numFmt?.formatCode ?? 'General', separator: out.separator ?? ', ',
        numberFormatLinked: out.numFmt?.sourceLinked !== false, showDataLabelsRange: false, dataLabelsRange: '',
        color: rPr.solidFill?.srgbClr ? colorText(rPr.solidFill) : 'rgb(89,89,89)', transparency: 0, fontFamily: 'Calibri', fontSize: Number(rPr.sz ?? 13.33),
        fontBold: !!rPr.b, backColor: '', backColorTransparency: 0,
        borderColor: '', borderColorTransparency: 0,
      };
      if (pie) result.showPercentage = !!out.showPercent;
      return result;
    }
    const chartType = Number(this.props.chartType);
    for (const { ser } of sers) {
      ser.dLbls = buildDataLabelEntry({
        existing: ser.dLbls, chartType, idx: Number(ser.idx ?? 0),
        position: value.position, value,
      });
    }
    this._changed();
    return this;
  }

  hoverStyle(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) return this._hoverStyle ?? {};
    this._hoverStyle = { ...(this._hoverStyle ?? {}), ...value };
    this._changed();
    return this;
  }

  formatOvers(value?: JsonRecord): JsonRecord | this {
    if (value === undefined) return this._formatOvers ?? {};
    this._formatOvers = { ...value };
    this._changed();
    return this;
  }

  ignoreHidden(value?: boolean): boolean | this {
    if (value === undefined) return this._space.chart.plotVisOnly !== false;
    this._ignoreHidden = !!value;
    this._space.chart.plotVisOnly = !!value;
    this._changed();
    return this;
  }

  displayBlanksAs(value?: number): number | this {
    if (value === undefined) return Number(this._space.chart.dispBlanksAs ?? 1);
    this._space.chart.dispBlanksAs = Number(value);
    this._changed();
    return this;
  }

  displayNaAsBlank(value?: boolean): boolean | this {
    if (value === undefined) return !!this._space.chart.dispNaAsBlank;
    this._space.chart.dispNaAsBlank = !!value;
    if (value) {
      this._space.chart.extLst = {
        ext: [{ uri: '{56B9EC1D-385E-4148-901F-78D8002777C0}', dataObject: { extDataType: 2, dispNaAsBlank: '1' } }],
      };
    } else if (this._space.chart.extLst) delete this._space.chart.extLst;
    this._changed();
    return this;
  }

  useAnimation(value?: boolean): boolean | this {
    if (value === undefined) return !!this._useAnimation;
    this._useAnimation = !!value;
    this._changed();
    return this;
  }

  getFormula(path: string): string { void path; return ''; }
  setFormula(path: string, formula: string): void { void path; void formula; }

  canPrint(value?: boolean): boolean | this {
    if (value === undefined) return this.props.canPrint !== false;
    this.props.canPrint = !!value;
    return this;
  }

  alt(value?: string): string | this {
    if (value === undefined) return String(this.props.alt ?? '');
    this.props.alt = String(value ?? '');
    return this;
  }

  /** The chart host element is not exposed by the current charts runtime. */
  getHost(): HTMLElement[] {
    throw new Error('since version 17.0.0, the getHost method is not available in the charts plugin, to use this method, please use the legacy-charts plugin.');
  }

  toImageSrc(): string {
    const canvas = document.createElement('canvas');
    const w = Math.max(1, Math.round(Number(this.width())));
    const h = Math.max(1, Math.round(Number(this.height())));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) paintChart(this, ctx, w, h);
    return canvas.toDataURL('image/png');
  }

  toImageSrcAsync(): Promise<string> { return Promise.resolve(this.toImageSrc()); }

  override cloneContent(): HTMLElement { return (this.content() as HTMLElement ?? document.createElement('div')).cloneNode(true) as HTMLElement; }
  override refreshContent(): void { this._changed(); }

  // -------------------------------------------------------------- serialisation

  override toJSON(): JsonRecord {
    const a = this._anchors();
    const name = String(this.name());
    const props = this.props;
    return {
      isLocked: props.isLocked !== false,
      canPrint: props.canPrint !== false,
      dynamicMove: props.dynamicMove !== false,
      dynamicSize: props.dynamicSize !== false,
      allowResize: props.allowResize !== false,
      allowRotate: false,
      allowMove: props.allowMove !== false,
      showHandle: true,
      alt: String(props.alt ?? ''),
      shapeData: {
        anchorType: 0,
        startPoint: { row: a.row, col: a.col, rowOffset: a.dy, colOffset: a.dx },
        endPoint: { row: a.endRow, col: a.endCol, rowOffset: a.endDy, colOffset: a.endDx },
        editAs: 0,
        graphicFrame: {
          shapeType: CT_SHAPE_TYPE,
          nvGraphicFramePr: {
            cNvPr: { id: this._shapeId, name, hidden: false, title: '' },
            cNvGraphicFramePr: { graphicFrameLocks: { noChangeAspect: false } },
          },
          xfrm: {
            flipH: false, flipV: false, rot: 0,
            off: { x: Number(props.x), y: Number(props.y) },
            ext: { cx: Number(props.width), cy: Number(props.height) },
          },
          graphic: { graphicData: { chart: { chartSpace: this._space, useAnimation: !!this._useAnimation } } },
        },
      },
      name,
      shapeType: CT_SHAPE_TYPE,
    };
  }

  /** Restores a chart from its serialised shape entry (trial JSON). */
  static fromShape(sheet: Worksheet, json: JsonRecord): Chart {
    const frame = json.shapeData?.graphicFrame ?? {};
    const off = frame.xfrm?.off ?? {};
    const chart = new Chart(sheet, String(json.name ?? 'Chart'), ChartType.columnClustered,
      Number(off.x ?? 0), Number(off.y ?? 0), Number(off.cx ?? 300), Number(off.cy ?? 200), '', 0);
    chart._space = (frame.graphic?.graphicData?.chart?.chartSpace ?? chart._space) as JsonRecord;
    // Loading a serialised chart re-lays-it-out in the trial (plotArea `ln`).
    chart._lnReady = true;
    refreshPlotAreaSpPr(chart._space);
    chart._useAnimation = !!frame.graphic?.graphicData?.chart?.useAnimation;
    chart._shapeId = Number(frame.nvGraphicFramePr?.cNvPr?.id ?? 2);
    chart._loaded = true;
    for (const key of ['isLocked', 'canPrint', 'dynamicMove', 'dynamicSize', 'allowResize', 'allowMove'])
      if (json[key] !== undefined) chart.props[key] = !!json[key];
    chart.props.alt = String(json.alt ?? '');
    const region = (chart._space.chart?.plotArea?.plotAreaRegion ?? undefined) as JsonRecord | undefined;
    const primary = (chart._space.chart?.plotArea?.chartGroups ?? [])[0];
    const allGroups: JsonRecord[] = chart._space.chart?.plotArea?.chartGroups ?? [];
    const sers: JsonRecord[] = region
      ? (region.series ?? []).map((ser: JsonRecord) => ({
        cat: { strRef: { f: ser.formulaObj?.strDim } },
        val: { numRef: { f: ser.formulaObj?.numDim } },
        tx: { strRef: { f: ser.tx?.txData?.f?.formula } },
      }))
      : allGroups.flatMap(g => (g.ser ?? []) as JsonRecord[]);
    const rects = sers.flatMap(ser => {
      const cat = (ser.cat?.strRef ?? ser.cat?.numRef ?? ser.xVal?.numRef ?? {}).f;
      const val = (ser.val?.numRef ?? ser.xVal?.numRef ?? ser.yVal?.numRef ?? {}).f;
      const tx = ser.tx?.strRef?.f;
      return parseRanges([cat, val, tx].filter(Boolean).join(','));
    });
    const bounding = unionRange(rects.map(r => `${colLetters(r.col)}${r.row + 1}:${colLetters(r.col + r.colCount - 1)}${r.row + r.rowCount}`));
    const firstCat = (sers[0]?.cat?.strRef ?? sers[0]?.cat?.numRef ?? {}).f;
    const catRect = parseRanges(firstCat)[0];
    chart.props.dataOrientation = catRect && catRect.rowCount > 1 && catRect.colCount === 1 ? 1 : 0;
    chart.props.dataRange = bounding
      ? `${sheet.name()}!$${colLetters(bounding.col)}$${bounding.row + 1}:$${colLetters(bounding.col + bounding.colCount - 1)}$${bounding.row + bounding.rowCount}`
      : '';
    const stockGroup = allGroups.find(g => Number(g.chartType) === GroupType.stock && g.hiLowLines !== undefined);
    if (region) {
      chart.props.chartType = LAYOUT_PUBLIC_TYPE[Number(region.series?.[0]?.layoutId)] ?? ChartType.columnClustered;
    } else if (stockGroup) {
      // Trial restores the exact stock ChartType from the group structure:
      // volume bar group present -> VHLC/VOHLC, otherwise HLC/OHLC.
      const n = (stockGroup.ser ?? []).length;
      chart.props.chartType = allGroups.length > 1 ? (n >= 4 ? 52 : 51) : (n >= 4 ? 50 : 49);
    } else {
      chart.props.chartType = primary ? groupPublicType(primary) : ChartType.columnClustered;
    }
    const start = json.shapeData?.startPoint;
    const end = json.shapeData?.endPoint;
    if (start && end) chart._setAnchors({
      row: Number(start.row), col: Number(start.col), dx: Number(start.colOffset ?? 0), dy: Number(start.rowOffset ?? 0),
      endRow: Number(end.row), endCol: Number(end.col), endDx: Number(end.colOffset ?? 0), endDy: Number(end.rowOffset ?? 0),
    });
    return chart;
  }

  // -------------------------------------------------------------- rendering

  override _render(view: WorkbookRenderer, layer: HTMLElement, zIndex: number): void {
    super._render(view, layer, zIndex);
    // Trial box offset (TASK 54 canvas probe `.probe/t54/probe-t54-canvas54.json`): the trial
    // renders every chart 1 px left/above the declared rect — for a chart added at (200,10)
    // the chart-area frame lines are data columns 199..618 and rows 9..288 (the declared rect
    // is 200..619 / 10..289). Anchor the floating element (canvas + selection handles) there;
    // paintChart compensates with a +1 translate so the chart CONTENT stays at the trial's
    // rect-relative positions (plot left 23.35, floor 202 rel. to the chart rect).
    if (this.element && this.element.style.left) {
      this.element.style.left = `${parseFloat(this.element.style.left) - view.zoom}px`;
      this.element.style.top = `${parseFloat(this.element.style.top) - view.zoom}px`;
    }
    if (!this._canvas) return;
    const width = Math.max(1, Math.round(Number(this.width()) * view.zoom));
    const height = Math.max(1, Math.round(Number(this.height()) * view.zoom));
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    if (this._canvas.width !== Math.round(width * dpr) || this._canvas.height !== Math.round(height * dpr)) {
      this._canvas.width = Math.round(width * dpr);
      this._canvas.height = Math.round(height * dpr);
    }
    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;
    const sheetWidth = Math.max(1, Number(this.width()));
    const sheetHeight = Math.max(1, Number(this.height()));
    ctx.setTransform(width / sheetWidth, 0, 0, height / sheetHeight, 0, 0);
    paintChart(this, ctx, sheetWidth, sheetHeight);
  }
}

function colLetters(index: number): string {
  let value = index + 1;
  let out = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    out = String.fromCharCode(65 + mod) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

/** The trial stamps `plotArea.spPr.ln = {noFill:true}` when it re-lays-out the chart. */
export { refreshPlotAreaSpPr as normalizePlotAreaSpPr };

function colorText(colorObj: JsonRecord): string {
  if (colorObj.srgbClr) return `rgb(${(colorObj.srgbClr.val as number[]).join(',')})`;
  const part = (['background 1', 'text 1', 'background 2', 'text 2', 'accent 1', 'accent 2', 'accent 3', 'accent 4', 'accent 5', 'accent 6', 'hyperlink', 'followed hyperlink'])[Number(colorObj.schemeClr?.val ?? 1)] ?? 'text 1';
  const mod = (colorObj.schemeClr?.lumMod?.[0] ?? 100000) / 1000;
  const off = (colorObj.schemeClr?.lumOff?.[0] ?? 0) / 1000;
  const tint = off > 0 ? off : -(100 - mod);
  return `${part} ${tint}`;
}

function colorObject(value: unknown): JsonRecord {
  const text = String(value ?? '');
  const accent = /^accent ([1-6])(?: ([+-]?\d+(?:\.\d+)?))?$/i.exec(text);
  if (accent) {
    const tint = accent[2] === undefined ? 0 : Number(accent[2]);
    const obj: JsonRecord = { schemeClr: { val: 3 + Number(accent[1]) } };
    if (tint > 0) { obj.schemeClr.lumMod = [(100 - tint) * 1000]; obj.schemeClr.lumOff = [tint * 1000]; }
    else if (tint < 0) obj.schemeClr.lumMod = [(100 + tint) * 1000];
    return obj;
  }
  const rgb = /^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/i.exec(text);
  if (rgb) return { srgbClr: { val: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] } };
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { srgbClr: { val: [(n >> 16) & 255, (n >> 8) & 255, n & 255] } };
  }
  const named: Record<string, string> = { red: '#ff0000', green: '#008000', blue: '#0000ff', white: '#ffffff', black: '#000000', yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080' };
  if (named[text.toLowerCase()]) return colorObject(named[text.toLowerCase()]);
  return { srgbClr: { val: [0, 0, 0] } };
}


export { refsFor, unionRange };
