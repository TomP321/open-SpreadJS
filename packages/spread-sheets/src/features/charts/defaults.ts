/**
 * Default chartSpace fragments and default getter objects, transcribed from
 * the trial's serialised JSON (measured black-box through the public API).
 */
import type { JsonRecord } from './types.js';

export const TEXT_COLOR = { val: 1, lumMod: [65000], lumOff: [35000] }; // text 1 35
export const LINE_COLOR = { val: 1, lumMod: [15000], lumOff: [85000] }; // text 1 85
export const ACCENT_SOLID = (n: number): JsonRecord => ({ schemeClr: { val: 3 + n } });

export function defRPr(sz?: number, extra: JsonRecord = {}): JsonRecord {
  const rPr: JsonRecord = { latin: { typeface: '+mn-lt' }, ...(sz === undefined ? {} : { sz }), b: false, solidFill: { schemeClr: { ...TEXT_COLOR } }, ...extra };
  return rPr;
}

/** The default one-paragraph txPr with an empty run (sz undefined = inherit). */
export function txPr(sz?: number, withEndParaRPr = true, overrides: JsonRecord = {}): JsonRecord {
  const rPr = defRPr(sz, overrides.rPr ?? {});
  const p: JsonRecord = { elements: [{ elementType: 0, t: '', rPr }], pPr: { defRPr: { ...rPr } } };
  if (withEndParaRPr) p.endParaRPr = {};
  return { p: [p] };
}

export function solidFill(color: JsonRecord): JsonRecord { return { solidFill: color }; }

export function defaultTitle(): JsonRecord {
  const tx = txPr(18.67);
  tx.bodyPr = {};
  tx.lstStyle = {};
  return { txPr: tx, overlay: false, spPr: { noFill: true, ln: { noFill: true }, effectLst: {} } };
}

export function defaultLegend(legendPos = 4): JsonRecord {
  return { legendPos, spPr: { noFill: true, ln: { noFill: true } }, txPr: txPr(12, true) };
}

let nextAxId = 11000011;
/** Deterministic per-chart axis ids (the harness normalises the numeric values). */
export function makeAxisIds(): [number, number, number, number] {
  const a = nextAxId; nextAxId += 7;
  return [a, a + 1, a + 2, a + 3];
}

export function categoryAxis(axId: number, crossAx: number, axPos = 0): JsonRecord {
  return {
    axisType: 0, axId, delete: false, majorTickMark: 2, minorTickMark: 2, tickLblPos: 2,
    title: null, axPos,
    scaling: { orientation: 1 },
    spPr: { ln: { solidFill: { schemeClr: { ...LINE_COLOR } } } },
    numFmt: { formatCode: 'General' },
    txPr: txPr(12, true),
    auto: true, lblOffset: 0, tickMarkSkip: 1, noMultiLvlLbl: true,
    AxisGroup: 0, AxisType: 0, crosses: 1, crossAx,
  };
}

export function valueAxis(axId: number, crossAx: number): JsonRecord {
  return {
    axisType: 3, axId, delete: false, majorTickMark: 2, minorTickMark: 2, tickLblPos: 2,
    title: null, axPos: 1,
    scaling: { orientation: 1 },
    spPr: { ln: { solidFill: { schemeClr: { ...LINE_COLOR } } } },
    numFmt: { formatCode: 'General' },
    txPr: txPr(12, true),
    majorGridlines: { spPr: { ln: { solidFill: { srgbClr: { val: [217, 217, 217] } }, w: 1 }, effectLst: {} } },
    AxisGroup: 0, AxisType: 1, crosses: 1, crossBetween: 0, crossAx,
  };
}

export function scatterValueAxis(axId: number, crossAx: number, axPos: number): JsonRecord {
  const axis = valueAxis(axId, crossAx);
  axis.axPos = axPos;
  axis.AxisType = 0;
  delete axis.crossBetween;
  return axis;
}

export function chartSpaceDefaults(): JsonRecord {
  return {
    typeName: 'chartSpace',
    roundedCorners: false,
    spPr: {
      solidFill: { schemeClr: { val: 0 } },
      ln: { solidFill: { schemeClr: { ...LINE_COLOR } }, w: 1 },
    },
    txPr: txPr(undefined, true),
  };
}

/** Default getter objects exactly as the trial's public getters report them. */
export const GETTER_DEFAULTS: Record<string, JsonRecord> = {
  title: {
    text: '', color: 'rgb(89,89,89)', transparency: 0, backColor: 'transparent',
    backColorTransparency: 0, fontFamily: 'Calibri', fontSize: 18.67, bold: false,
  },
  legend: {
    visible: true, position: 4,
    borderStyle: { transparency: 0, color: 'rgb(0,0,0)', dashStyle: 0 },
    backColor: '', backColorTransparency: 0, color: 'rgba(89,89,89,1)',
    fontFamily: 'Calibri', fontSize: 12,
  },
  chartArea: {
    backColor: 'background 1 0', backColorTransparency: 0, color: 'text 1 35', transparency: 0,
    fontFamily: 'Calibri', fontSize: 13.33,
    border: { color: 'text 1 85', transparency: 0, width: 1, dashStyle: 0 },
  },
  plotArea: {
    backColor: '', backColorTransparency: 0,
    border: { color: '', transparency: 0, width: 1, dashStyle: 0 },
  },
  dataLabels: {
    showValue: false, showSeriesName: false, showCategoryName: false, showDataLabelsRange: false,
  },
  seriesDataLabels: {
    showValue: false, showSeriesName: false, showCategoryName: false, showDataLabelsRange: false,
  },
  axisLine: { color: 'text 1 85', width: 1, transparency: 0 },
  axisStyle: { color: 'rgb(89,89,89)', fontFamily: 'Calibri', fontSize: 12, transparency: 0 },
  seriesBorderBar: { color: 'rgb(0,0,0)', transparency: 0, lineType: 0, width: 0 },
  seriesBorderPie: { color: 'rgb(255,255,255)', transparency: 0, lineType: 0, width: 2 },
  seriesBorderLine: { color: '', transparency: 0, lineType: 0, width: 2 },
};

export const DATA_LABEL_DEFAULTS: Record<string, JsonRecord> = {
  full: {
    showValue: true, showSeriesName: false, showCategoryName: false,
    numberFormatLinked: true, showDataLabelsRange: false, dataLabelsRange: '',
    color: 'rgb(89,89,89)', transparency: 0, fontFamily: 'Calibri', fontSize: 13.33,
    fontBold: false, backColor: '', backColorTransparency: 0,
    borderColor: '', borderColorTransparency: 0, separator: ', ', format: 'General',
  },
};
