/**
 * SparklineEx model, formula functions and workbook registration.
 * Every expected value below is the official 19.2.5 trial's answer, observed
 * through the public API by the black-box probe (.probe/api-sweep-probe.mjs).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import type { Workbook } from '../src/workbook.js';
import type { Function as SparklineFunctionObject } from '../src/calc/functions-api.js';

function SparklineNamespace(): Record<string, unknown> {
  return GC.Spread.Sheets.Sparklines as unknown as Record<string, unknown>;
}

const CLASS_NAMES = [
  'AreaSparkline', 'BoxPlotSparkline', 'BulletSparkline', 'CascadeSparkline', 'ColumnSparkline', 'GaugeKPISparkline',
  'HBarSparkline', 'HistogramSparkline', 'ImageSparkline', 'LineSparkline', 'LollipopVariSparkline', 'MonthSparkline',
  'ParetoSparkline', 'PieSparkline', 'ProgressSparkline', 'RangeBlockSparkline', 'ScatterSparkline', 'SparklineEx',
  'SpreadSparkline', 'StackedSparkline', 'VariSparkline', 'VBarSparkline', 'WinlossSparkline', 'YearSparkline',
];
const FUNCTION_NAMES: Record<string, string> = {
  AreaSparkline: 'AREASPARKLINE', BoxPlotSparkline: 'BOXPLOTSPARKLINE', BulletSparkline: 'BULLETSPARKLINE',
  CascadeSparkline: 'CASCADESPARKLINE', ColumnSparkline: 'COLUMNSPARKLINE', GaugeKPISparkline: 'GAUGEKPISPARKLINE',
  HBarSparkline: 'HBARSPARKLINE', HistogramSparkline: 'HISTOGRAMSPARKLINE', ImageSparkline: 'IMAGE',
  LineSparkline: 'LINESPARKLINE', LollipopVariSparkline: 'LOLLIPOPVARISPARKLINE', MonthSparkline: 'MONTHSPARKLINE',
  ParetoSparkline: 'PARETOSPARKLINE', PieSparkline: 'PIESPARKLINE', ProgressSparkline: 'PROGRESSSPARKLINE',
  RangeBlockSparkline: 'RANGEBLOCKSPARKLINE', ScatterSparkline: 'SCATTERSPARKLINE', SpreadSparkline: 'SPREADSPARKLINE',
  StackedSparkline: 'STACKEDSPARKLINE', VariSparkline: 'VARISPARKLINE', VBarSparkline: 'VBARSPARKLINE',
  WinlossSparkline: 'WINLOSSSPARKLINE', YearSparkline: 'YEARSPARKLINE',
};
/** Trial `createFunction()` arity and per-slot flags (slots 0..5 probed). */
const TRIAL_FUNCTIONS: Record<string, { min: number; max: number; array: number[]; reference: number[]; context: boolean }> = {
  AREASPARKLINE: { min: 1, max: 7, array: [0], reference: [0], context: false },
  BOXPLOTSPARKLINE: { min: 1, max: 10, array: [0], reference: [0], context: false },
  BULLETSPARKLINE: { min: 3, max: 17, array: [], reference: [0, 1, 2, 3, 4, 5], context: false },
  CASCADESPARKLINE: { min: 1, max: 10, array: [0, 2], reference: [0, 2], context: false },
  COLUMNSPARKLINE: { min: 2, max: 5, array: [0, 2], reference: [0, 2], context: false },
  GAUGEKPISPARKLINE: { min: 4, max: 255, array: [], reference: [0, 1, 2, 3, 5], context: false },
  HBARSPARKLINE: { min: 1, max: 4, array: [], reference: [0], context: false },
  HISTOGRAMSPARKLINE: { min: 1, max: 9, array: [0, 1, 2, 3, 4, 5], reference: [0], context: false },
  LINESPARKLINE: { min: 2, max: 5, array: [0, 2], reference: [0, 2], context: false },
  LOLLIPOPVARISPARKLINE: { min: 3, max: 13, array: [0, 1], reference: [0, 1, 3, 4, 5], context: false },
  MONTHSPARKLINE: { min: 3, max: 7, array: [2, 3], reference: [2, 3], context: false },
  PARETOSPARKLINE: { min: 2, max: 12, array: [0, 2], reference: [0, 2], context: false },
  PIESPARKLINE: { min: 1, max: 255, array: [0], reference: [0], context: false },
  PROGRESSSPARKLINE: { min: 2, max: 5, array: [], reference: [], context: false },
  RANGEBLOCKSPARKLINE: { min: 2, max: 2, array: [], reference: [0], context: true },
  SCATTERSPARKLINE: { min: 1, max: 18, array: [0, 1], reference: [0, 1], context: false },
  SPREADSPARKLINE: { min: 1, max: 7, array: [0], reference: [0], context: false },
  STACKEDSPARKLINE: { min: 1, max: 13, array: [0, 1, 2], reference: [0, 1, 2], context: false },
  VARISPARKLINE: { min: 1, max: 10, array: [], reference: [0, 1, 2, 3, 4, 5], context: false },
  VBARSPARKLINE: { min: 1, max: 4, array: [], reference: [0], context: false },
  WINLOSSSPARKLINE: { min: 2, max: 5, array: [0, 2], reference: [0, 2], context: false },
  YEARSPARKLINE: { min: 2, max: 6, array: [1, 2], reference: [1, 2], context: false },
};

type SparklineExObject = {
  typeName: string;
  createFunction(): { name: string; minArgs: number; maxArgs: number; typeName: string; acceptsArray(i: number): boolean; acceptsReference(i: number): boolean; isContextSensitive(): boolean; acceptsError(i: number): boolean; acceptsMissingArgument(i: number): boolean; isBranch(): boolean; isVolatile(): boolean } | null;
  name(): string | undefined;
  toJSON(): Record<string, unknown>;
  fromJSON(settings: object): void;
  paint(context: CanvasRenderingContext2D, value: unknown, x: number, y: number, width: number, height: number): void;
};
type SparklineClass = new () => SparklineExObject;

function sparkClass(name: string): SparklineClass {
  return (SparklineNamespace()[name] ?? null) as SparklineClass;
}
function classes(): Record<string, SparklineClass> {
  const result: Record<string, SparklineClass> = {};
  for (const name of CLASS_NAMES) result[name] = sparkClass(name);
  return result;
}

/**
 * The trial's probe sheet: numbers in I..L (columns 8..11), dates in G and
 * matching day values in H, plus the `a1..a3`/`b1..b3` sentinels in A31:B33
 * that the argument-mapping probe used, so the same formulas read the same data.
 */
function fixture(): { sheet: Worksheet; workbook: Workbook } {
  const workbook = new GC.Spread.Sheets.Workbook();
  workbook.setSheetCount(1);
  const sheet = workbook.getActiveSheet() as Worksheet;
  const columns = [[3, -2, 5, 1, 4, -3, 2, 6], [1, 2, 3, 4, 5, 6, 7, 8], [7, 6, 5, 4, 3, 2, 1, 0], [10, 20, 30, 40, 50, 60, 70, 80]];
  for (let column = 0; column < 4; column++) for (let row = 0; row < 12; row++) sheet.setValue(row, 8 + column, columns[column][row]);
  for (let row = 0; row < 400; row++) {
    sheet.setValue(row, 6, new Date(2024, 0, row + 1));
    sheet.setValue(row, 7, (row % 9) + 1);
  }
  ['a1', 'a2', 'a3'].forEach((value, row) => sheet.setValue(30 + row, 0, value));
  ['b1', 'b2', 'b3'].forEach((value, row) => sheet.setValue(30 + row, 1, value));
  return { sheet, workbook };
}

describe('SparklineEx classes (trial shapes)', () => {
  it('constructs every class with no arguments', () => {
    for (const name of CLASS_NAMES) {
      const ctor = classes()[name]!;
      expect(typeof ctor, name).toBe('function');
      expect(ctor.length, name).toBe(0);
      const instance = new ctor();
      expect(instance instanceof ctor, name).toBe(true);
      expect(instance instanceof classes().SparklineEx!, name).toBe(true);
    }
  });

  it('owns only `typeName` (empty string) on the base instance', () => {
    const base = new (classes().SparklineEx!)();
    expect(Object.keys(base)).toEqual(['typeName']);
    expect(base.typeName).toBe('');
    expect(base.name()).toBeUndefined();
    expect(base.toJSON()).toEqual({ typeName: '' });
    expect(base.createFunction()).toBeNull();
    base.fromJSON({ foo: 1 });
    expect(base.toJSON()).toEqual({ typeName: '', foo: 1 });
  });

  it('leaves `paint` silent on the base class', () => {
    const calls: string[] = [];
    const context = recordingContext(calls);
    new (classes().SparklineEx!)().paint(context, {}, 0, 0, 20, 20);
    expect(calls).toEqual([]);
  });

  it('reports the trial function name and serialises typeName plus that name', () => {
    for (const name of CLASS_NAMES.filter((item) => item !== 'SparklineEx')) {
      const instance = new (classes()[name]!)();
      expect(instance.typeName, name).toBe('');
      expect(instance.name(), name).toBe(FUNCTION_NAMES[name]);
      const json = instance.toJSON();
      expect(Object.keys(json).sort().length, name).toBe(2);
      expect(json.typeName, name).toBe('');
      expect(Object.values(json).includes(FUNCTION_NAMES[name]!), name).toBe(true);
    }
  });

  it('builds function objects with the trial name, arity and flags', () => {
    for (const [className, functionName] of Object.entries(FUNCTION_NAMES)) {
      const fn = new (classes()[className]!)().createFunction();
      if (functionName === 'IMAGE') {
        expect(fn, className).toBeNull();
        continue;
      }
      const trial = TRIAL_FUNCTIONS[functionName]!;
      expect(fn, className).not.toBeNull();
      expect(fn!.name, className).toBe(functionName);
      expect(fn!.typeName, className).toBe('');
      expect(fn!.minArgs, className).toBe(trial.min);
      expect(fn!.maxArgs, className).toBe(trial.max);
      const slots = (flags: boolean[]) => flags.map((value, index) => (value ? index : -1)).filter((index) => index >= 0);
      expect(slots([0, 1, 2, 3, 4, 5].map((index) => fn!.acceptsArray(index))), className).toEqual(trial.array);
      expect(slots([0, 1, 2, 3, 4, 5].map((index) => fn!.acceptsReference(index))), className).toEqual(trial.reference);
      expect(fn!.isContextSensitive(), className).toBe(trial.context);
      expect(fn!.acceptsError(0), className).toBe(false);
      expect(fn!.acceptsMissingArgument(0), className).toBe(false);
      expect(fn!.isBranch(), className).toBe(false);
      expect(fn!.isVolatile(), className).toBe(false);
    }
  });

  it('keeps the YEARSPARKLINE day tables on the class', () => {
    const year = classes().YearSparkline as unknown as { daysOfMonth: number[]; dayInYear: number[] };
    expect(year.daysOfMonth).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    expect(year.dayInYear).toEqual([31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]);
  });
});

describe('sparkline formula functions (trial evaluation)', () => {
  const VALID: [string, string][] = [
    ['AREASPARKLINE', '=AREASPARKLINE(I1:I8)'],
    ['BOXPLOTSPARKLINE', '=BOXPLOTSPARKLINE(I1:I7)'],
    ['BULLETSPARKLINE', '=BULLETSPARKLINE(30,50,100)'],
    ['CASCADESPARKLINE', '=CASCADESPARKLINE(I1:I4)'],
    ['COLUMNSPARKLINE', '=COLUMNSPARKLINE(I1:I8,1)'],
    ['GAUGEKPISPARKLINE', '=GAUGEKPISPARKLINE(10,5,0,10)'],
    ['HBARSPARKLINE', '=HBARSPARKLINE(0.5)'],
    ['HISTOGRAMSPARKLINE', '=HISTOGRAMSPARKLINE(I1:J4)'],
    ['LINESPARKLINE', '=LINESPARKLINE(I1:I8,1)'],
    ['LOLLIPOPVARISPARKLINE', '=LOLLIPOPVARISPARKLINE(I1:I3,J1:J3,1)'],
    ['MONTHSPARKLINE', '=MONTHSPARKLINE(2024,1,G1:H31)'],
    ['PARETOSPARKLINE', '=PARETOSPARKLINE(I1:I4,1)'],
    ['PIESPARKLINE', '=PIESPARKLINE(J1:J3)'],
    ['PROGRESSSPARKLINE', '=PROGRESSSPARKLINE(0.6,0)'],
    ['RANGEBLOCKSPARKLINE', '=RANGEBLOCKSPARKLINE(I1:J2,"=SUM(I1:I2)")'],
    ['SCATTERSPARKLINE', '=SCATTERSPARKLINE(I1:I4)'],
    ['SPREADSPARKLINE', '=SPREADSPARKLINE(I1:I7)'],
    ['STACKEDSPARKLINE', '=STACKEDSPARKLINE(I1:J3)'],
    ['VARISPARKLINE', '=VARISPARKLINE(1,2,3,4)'],
    ['VBARSPARKLINE', '=VBARSPARKLINE(0.5)'],
    ['WINLOSSSPARKLINE', '=WINLOSSSPARKLINE(I1:I8,1)'],
    ['YEARSPARKLINE', '=YEARSPARKLINE(2024,G1:H90)'],
  ];

  /**
   * Trial value records of the same formulas, read from the official package
   * with `sheet.getValue()` (see .probe/report-spark-values.json). The LINE
   * family is compared without the trial's private `setting` internals: only
   * `setting.options` is public.
   */
  const SERIES_OPTIONS = {
    axisColor: 'black', displayEmptyCellsAs: 0, displayHidden: false, displayXAxis: false,
    firstMarkerColor: '#95b3d7', highMarkerColor: 'Blue', lastMarkerColor: '#95b3d7', lineWeight: 1,
    lowMarkerColor: 'Blue', manualMax: 0, manualMin: 0, markersColor: '#244062', maxAxisType: 0, minAxisType: 0,
    negativeColor: 'Brown', rightToLeft: false, seriesColor: '#244062', showFirst: false, showHigh: false,
    showLast: false, showLow: false, showMarkers: false, showNegative: false,
  };
  const TRIAL_RECORDS: Record<string, Record<string, unknown>> = {
    AREASPARKLINE: { colorNegative: null, colorPositive: null, line1: null, line2: null, maxi: null, mini: null, points: [3, -2, 5, 1, 4, -3, 2, 6] },
    BOXPLOTSPARKLINE: {
      acceptableEnd: null, acceptableStart: null, boxPlotClass: null, colorScheme: null, median: 2,
      perc02: -2.88, perc09: -2.46, perc10: -2.4, perc90: 4.4, perc91: 4.46, perc98: 4.88,
      points: [3, -2, 5, 1, 4, -3, 2], q1: -0.5, q3: 3.5, scaleEnd: null, scaleStart: null,
      showAverage: null, stDev: 2.770102775666474, style: null, vertical: null,
    },
    BULLETSPARKLINE: {
      allowMeasureOverMaxi: null, bad: null, badColor: null, barSize: null, colorScheme: null, forecast: null,
      forecastColor: null, good: null, goodColor: null, maxi: 100, maxiColor: null, measure: 30,
      measureColor: null, target: 50, targetColor: null, tickUnit: null, vertical: null,
    },
    CASCADESPARKLINE: {
      colorNegative: null, colorPositive: null, colorTotal: null, itemTypeRange: [], labels: [],
      maximum: null, minimum: null, pointIndex: null, points: [3, -2, 5, 1], vertical: null,
    },
    COLUMNSPARKLINE: {
      data: { col: 8, colCount: 1, row: 0, rowCount: 8 }, dataOrientation: 1, dataSheetName: 'Sheet1',
      dateAxisData: null, dateAxisDataSheetName: null, dateAxisOrientation: null, dateValues: [], displayDateAxis: null,
      setting: { options: SERIES_OPTIONS },
      sparklineType: 1, values: [[3], [-2], [5], [1], [4], [-3], [2], [6]],
    },
    GAUGEKPISPARKLINE: {
      currentValueOption: { font: 'bold 22px Calibri', fontAfterZoom: null, label: 5, value: 5 },
      gaugeType: 0, maxAngle: 90,
      maxValueOption: { font: '12px Calibri', fontAfterZoom: null, label: 10, value: 10 },
      minAngle: -90, minValueOption: { font: '12px Calibri', fontAfterZoom: null, label: 0, value: 0 },
      radiusRatio: 0, ranges: [], showLabel: true,
      targetValueOption: { font: '16px Calibri', fontAfterZoom: null, label: 10, value: 10 },
    },
    HBARSPARKLINE: { axisVisible: null, barHeight: null, colorScheme: null, value: 0.5 },
    HISTOGRAMSPARKLINE: {
      barColor: '#5B9BD5', barWidth: 1, continuous: true, edgeColor: '#C0C0C0', labelColor: '#000000',
      labelFontStyle: null, paintLabel: false,
      values: [
        { axis: '[-2,-1]', value: 1 }, { axis: '(-1,0]', value: 0 }, { axis: '(0,1]', value: 2 },
        { axis: '(1,2]', value: 1 }, { axis: '(2,3]', value: 2 }, { axis: '(3,4]', value: 1 }, { axis: '(4,5]', value: 1 },
      ],
    },
    LINESPARKLINE: {
      data: { col: 8, colCount: 1, row: 0, rowCount: 8 }, dataOrientation: 1, dataSheetName: 'Sheet1',
      dateAxisData: null, dateAxisDataSheetName: null, dateAxisOrientation: null, dateValues: [], displayDateAxis: null,
      setting: { options: SERIES_OPTIONS },
      sparklineType: 0, values: [[3], [-2], [5], [1], [4], [-3], [2], [6]],
    },
    LOLLIPOPVARISPARKLINE: {
      absolute: null, actualValue: [1, 2, 3], colorNegative: null, colorPositive: null, index: 1, legend: null,
      lollipopHeaderColor: null, maxi: null, mini: null, plannedValue: [3, -2, 5], reference: null, tickUnit: null, vertical: null,
    },
    MONTHSPARKLINE: {
      emptyColor: null, endColor: null, middleColor: null, month: 1, startColor: null, year: 2024,
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4],
    },
    PARETOSPARKLINE: {
      barSize: null, colorRange: [], highlightPosition: null, label: null, labelColor: null, pointIndex: 1,
      points: [3, -2, 5, 1], target: null, target2: null, target2Color: null, targetColor: null, vertical: null,
    },
    PIESPARKLINE: { colors: [], values: [1, 2, 3] },
    PROGRESSSPARKLINE: { bandColor: 'Accent 1 80', barColor: 'Accent 1', mode: 0, progress: 0.6, showValue: true },
    RANGEBLOCKSPARKLINE: {
      bindingObject: '=SUM(I1:I2)', templateRange: { col: 8, colCount: 2, row: 0, rowCount: 2 }, templateSheetName: 'Sheet1',
    },
    SCATTERSPARKLINE: {
      color1: null, color2: null, dash: null, drawLines: null, drawSymbol: null, hLine: null, maxX: null, maxY: null,
      minX: null, minY: null, points1: [[3], [-2], [5], [1]], points2: [], tags: null, vLine: null,
      xMaxZone: null, xMinZone: null, yMaxZone: null, yMinZone: null,
    },
    SPREADSPARKLINE: {
      colorScheme: null, scaleEnd: null, scaleStart: null, showAverage: null, style: null, vertical: null,
      spreadData: [
        { key: -3, value: 1 }, { key: -2, value: 1 }, { key: 1, value: 1 }, { key: 2, value: 1 },
        { key: 3, value: 1 }, { key: 4, value: 1 }, { key: 5, value: 1 },
      ],
    },
    STACKEDSPARKLINE: {
      color: null, colorRange: [], highlightPosition: null, labelRange: [], maximum: null, points: [3, 1, -2, 2, 5, 3],
      targetBlue: null, targetGreen: null, targetRed: null, targetYellow: null, textOrientation: null, textSize: null, vertical: null,
    },
    VARISPARKLINE: {
      colorNegative: null, colorPositive: null, legend: null, mark: null, maxi: 4, mini: 3, reference: 2,
      tickUnit: null, variance: 1, vertical: null,
    },
    VBARSPARKLINE: { axisVisible: null, barWidth: null, colorScheme: null, value: 0.5 },
    WINLOSSSPARKLINE: {
      data: { col: 8, colCount: 1, row: 0, rowCount: 8 }, dataOrientation: 1, dataSheetName: 'Sheet1',
      dateAxisData: null, dateAxisDataSheetName: null, dateAxisOrientation: null, dateValues: [], displayDateAxis: null,
      setting: { options: SERIES_OPTIONS },
      sparklineType: 2, values: [[3], [-2], [5], [1], [4], [-3], [2], [6]],
    },
    YEARSPARKLINE: {
      emptyColor: null, endColor: null, middleColor: null, startColor: null, year: 2024,
      values: Array.from({ length: 90 }, (_, index) => (index % 9) + 1),
    },
  };

  /** The trial's SparklineSetting object carries private fields; only `options` is public. */
  function comparable(record: Record<string, unknown>): Record<string, unknown> {
    const setting = record.setting as { options?: Record<string, unknown> } | undefined;
    const result: Record<string, unknown> = { ...record };
    if (setting) result.setting = { options: setting.options };
    return result;
  }

  it('evaluates every built-in function to a sparkline cell value with empty text', () => {
    const { sheet, workbook } = fixture();
    VALID.forEach(([name, formula], index) => {
      sheet.setFormula(12 + index, 0, formula);
      expect(sheet.getValue(12 + index, 0), name).toBeInstanceOf(Object);
      expect(sheet.getText(12 + index, 0), name).toBe('');
    });
    workbook.destroy();
  });

  it('builds the trial value record for every built-in function', () => {
    const { sheet, workbook } = fixture();
    VALID.forEach(([name, formula], index) => {
      sheet.setFormula(12 + index, 0, formula);
      const value = sheet.getValue(12 + index, 0) as { name: string; typeName: string; value: Record<string, unknown> };
      expect(value.name, name).toBe(name);
      expect(value.typeName, name).toBe('SparklineExValue');
      expect(comparable(value.value), name).toEqual(TRIAL_RECORDS[name]);
    });
    workbook.destroy();
  });

  it('stores the trial sparkline setting defaults on the series functions', () => {
    const { sheet, workbook } = fixture();
    sheet.setFormula(12, 0, '=LINESPARKLINE(I1:I8,1)');
    const value = sheet.getValue(12, 0) as { value: { setting: { options: Record<string, unknown> } } };
    expect(value.value.setting.options).toEqual(SERIES_OPTIONS);
    workbook.destroy();
  });

  it('applies the trial option order and raw values of every argument slot', () => {
    const { sheet, workbook } = fixture();
    const cases: [string, string, Record<string, unknown>][] = [
      ['AREA', '=AREASPARKLINE(I1:I8,11,12,13,14,"cp","cn")', { points: [3, -2, 5, 1, 4, -3, 2, 6], mini: 11, maxi: 12, line1: 13, line2: 14, colorPositive: 'cp', colorNegative: 'cn' }],
      ['BULLET', '=BULLETSPARKLINE(30,50,100,80,20,90,10,"cs",true,"mc","tcc","mac","gc","bc","fc",true,0.4)', {
        measure: 30, target: 50, maxi: 100, good: 80, bad: 20, forecast: 90, tickUnit: 10, colorScheme: 'cs', vertical: true,
        measureColor: 'mc', targetColor: 'tcc', maxiColor: 'mac', goodColor: 'gc', badColor: 'bc', forecastColor: 'fc',
        allowMeasureOverMaxi: true, barSize: 0.4,
      }],
      ['VARI', '=VARISPARKLINE(11,12,13,14,15,16,true,"cp","cn",true)', {
        variance: 11, reference: 12, mini: 13, maxi: 14, mark: 15, tickUnit: 16, legend: true,
        colorPositive: 'cp', colorNegative: 'cn', vertical: true,
      }],
      ['HBAR', '=HBARSPARKLINE(0.25,"cs",true,7)', { value: 0.25, colorScheme: 'cs', axisVisible: true, barHeight: 7 }],
      ['VBAR', '=VBARSPARKLINE(0.25,"cs",true,7)', { value: 0.25, colorScheme: 'cs', axisVisible: true, barWidth: 7 }],
      ['SCATTER', '=SCATTERSPARKLINE(I1:I4,J1:J4,11,12,13,14,15,16,17,18,19,20,"tags",true,false,"c1","c2",true)', {
        points1: [[3], [-2], [5], [1]], points2: [[1], [2], [3], [4]], minX: 11, maxX: 12, minY: 13, maxY: 14,
        hLine: 15, vLine: 16, xMinZone: 17, xMaxZone: 18, yMinZone: 19, yMaxZone: 20, tags: 'tags',
        drawSymbol: true, drawLines: false, color1: 'c1', color2: 'c2', dash: true,
      }],
      ['SPREAD', '=SPREADSPARKLINE(I1:I7,true,11,12,1,"cs",true)', {
        spreadData: [{ key: -3, value: 1 }, { key: -2, value: 1 }, { key: 1, value: 1 }, { key: 2, value: 1 }, { key: 3, value: 1 }, { key: 4, value: 1 }, { key: 5, value: 1 }],
        showAverage: true, scaleStart: 11, scaleEnd: 12, style: 1, colorScheme: 'cs', vertical: true,
      }],
      ['STACKED', '=STACKEDSPARKLINE(I1:J3,A31:A33,B31:B33,99,1,2,3,4,"col",7,true,1,12)', {
        points: [3, 1, -2, 2, 5, 3], colorRange: ['a1', 'a2', 'a3'], labelRange: ['b1', 'b2', 'b3'], maximum: 99,
        targetRed: 1, targetGreen: 2, targetBlue: 3, targetYellow: 4, color: 'col', highlightPosition: 7,
        vertical: true, textOrientation: 1, textSize: 12,
      }],
      ['LOLLIPOP', '=LOLLIPOPVARISPARKLINE(I1:I3,J1:J3,1,true,5,-9,11,0.5,true,"cp","cn","hc",true)', {
        plannedValue: [3, -2, 5], actualValue: [1, 2, 3], index: 1, absolute: true, reference: 5, mini: -9, maxi: 11,
        tickUnit: 0.5, legend: true, colorPositive: 'cp', colorNegative: 'cn', lollipopHeaderColor: 'hc', vertical: true,
      }],
      ['CASCADE', '=CASCADESPARKLINE(I1:I4,2,A31:A33,-10,100,"cp","cn",true,B31:B33,"ct")', {
        points: [3, -2, 5, 1], pointIndex: 2, labels: ['a1', 'a2', 'a3'], minimum: -10, maximum: 100,
        colorPositive: 'cp', colorNegative: 'cn', vertical: true, itemTypeRange: ['b1', 'b2', 'b3'], colorTotal: 'ct',
      }],
      ['PARETO', '=PARETOSPARKLINE(I1:I4,1,J1:J2,0.5,0.8,2,"lbl",true,"tc","t2c","lc",0.3)', {
        points: [3, -2, 5, 1], pointIndex: 1, colorRange: [1, 2], target: 0.5, target2: 0.8, highlightPosition: 2,
        label: 'lbl', vertical: true, targetColor: 'tc', target2Color: 't2c', labelColor: 'lc', barSize: 0.3,
      }],
      ['BOXPLOT', '=BOXPLOTSPARKLINE(I1:I7,"5ns",true,11,12,13,14,"cs",1,true)', {
        points: [3, -2, 5, 1, 4, -3, 2], boxPlotClass: '5ns', showAverage: true, scaleStart: 11, scaleEnd: 12,
        acceptableStart: 13, acceptableEnd: 14, colorScheme: 'cs', style: 1, vertical: true,
        q1: -0.5, q3: 3.5, median: 2, perc02: -2.88, perc09: -2.46, perc10: -2.4, perc90: 4.4, perc91: 4.46, perc98: 4.88,
        stDev: 2.770102775666474,
      }],
      ['HISTOGRAM', '=HISTOGRAMSPARKLINE(I1:J4,true,true,2,3,"bc","lfs","lc","ec")', {
        continuous: true, paintLabel: true, barWidth: 3, barColor: 'bc', labelFontStyle: 'lfs', labelColor: 'lc', edgeColor: 'ec',
        values: [{ axis: '[-2,0]', value: 1 }, { axis: '(0,2]', value: 3 }, { axis: '(2,4]', value: 3 }, { axis: '(4,6]', value: 1 }],
      }],
      ['PROGRESS', '=PROGRESSSPARKLINE(0.75,1,"bar","band",false)', { progress: 0.75, mode: 1, barColor: 'bar', bandColor: 'band', showValue: false }],
      ['PIE', '=PIESPARKLINE(I1:J2,"p1","p2","p3","p4")', { values: [3, 1, -2, 2], colors: ['p1', 'p2', 'p3', 'p4'] }],
      ['MONTH', '=MONTHSPARKLINE(2024,1,G1:H31,"ec","sc","mc","xc")', {
        year: 2024, month: 1, emptyColor: 'ec', startColor: 'sc', middleColor: 'mc', endColor: 'xc',
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4],
      }],
      ['YEAR', '=YEARSPARKLINE(2024,G1:H90,"ec","sc","mc","xc")', {
        year: 2024, emptyColor: 'ec', startColor: 'sc', middleColor: 'mc', endColor: 'xc',
        values: Array.from({ length: 90 }, (_, index) => (index % 9) + 1),
      }],
      ['GAUGE', '=GAUGEKPISPARKLINE(21,22,23,24,true,"tl","cl","ml","xl")', {
        targetValueOption: { value: 21, label: 'tl', font: '16px Calibri', fontAfterZoom: null },
        currentValueOption: { value: 22, label: 'cl', font: 'bold 22px Calibri', fontAfterZoom: null },
        minValueOption: { value: 23, label: 'ml', font: '12px Calibri', fontAfterZoom: null },
        maxValueOption: { value: 24, label: 'xl', font: '12px Calibri', fontAfterZoom: null },
        gaugeType: 0, minAngle: -90, maxAngle: 90, radiusRatio: 0, ranges: [], showLabel: true,
      }],
    ];
    let row = 40;
    for (const [label, formula, expected] of cases) {
      sheet.setFormula(row, 0, formula);
      const value = sheet.getValue(row, 0) as { value: Record<string, unknown> };
      const got: Record<string, unknown> = { ...value.value };
      for (const key of Object.keys(expected)) if (key in got) expect(got[key], `${label}.${key}`).toEqual(expected[key]);
      row++;
    }
    workbook.destroy();
  });

  it('maps MONTH and YEAR data ranges to day values like the trial', () => {
    const { sheet, workbook } = fixture();
    // 2023 has no dates in the range: the trial reports an empty value list.
    sheet.setFormula(40, 0, '=MONTHSPARKLINE(2023,2,G1:H28)');
    expect((sheet.getValue(40, 0) as { value: { values: unknown[] } }).value.values).toEqual([]);
    // A short range covers only the days it holds.
    sheet.setFormula(41, 0, '=MONTHSPARKLINE(2024,1,G1:H15)');
    expect((sheet.getValue(41, 0) as { value: { values: unknown[] } }).value.values.length).toBe(15);
    // Dates outside the requested month are dropped (February 2024 is a leap month).
    sheet.setFormula(42, 0, '=MONTHSPARKLINE(2024,2,G32:H60)');
    expect((sheet.getValue(42, 0) as { value: { values: unknown[] } }).value.values.length).toBe(29);
    sheet.setFormula(43, 0, '=YEARSPARKLINE(2025,G1:H365)');
    expect((sheet.getValue(43, 0) as { value: { values: unknown[] } }).value.values).toEqual([]);
    // A date-only range keeps one `null` per day.
    sheet.setFormula(44, 0, '=MONTHSPARKLINE(2024,1,G1:G31)');
    expect((sheet.getValue(44, 0) as { value: { values: unknown[] } }).value.values).toEqual(new Array(31).fill(null));
    workbook.destroy();
  });

  it('reports the trial names: VARISPARKLINE exists, VARIANESPARKLINE does not', () => {
    const { sheet, workbook } = fixture();
    sheet.setFormula(12, 0, '=VARISPARKLINE(1,2,3)');
    expect(sheet.getValue(12, 0)).toBeInstanceOf(Object);
    sheet.setFormula(13, 0, '=VARIANESPARKLINE(1)');
    expect(sheet.getText(13, 0)).toBe('#NAME?');
    workbook.destroy();
  });

  it('rejects out-of-range argument counts with an invalid formula, like the trial', () => {
    const { sheet, workbook } = fixture();
    const invalid = ['=LINESPARKLINE(I1:I8)', '=BULLETSPARKLINE(1,2)', '=PROGRESSSPARKLINE(150)', '=HBARSPARKLINE(0.5,"blue",true,10,5)', '=LINESPARKLINE(I1:I8,1,2,3,4,5,6,7,8)'];
    for (const formula of invalid) {
      expect(() => sheet.setFormula(14, 0, formula), formula).toThrow(/Invalid Formula/);
      expect(sheet.getValue(14, 0)).toBeNull();
    }
    workbook.destroy();
  });

  it('rejects the argument shapes the trial rejects with #VALUE!', () => {
    const { sheet, workbook } = fixture();
    // The same formulas the trial probe rejected (its data columns sit in I/J there).
    const invalid = [
      '=MONTHSPARKLINE(2024,3,I1:I31)',
      '=MONTHSPARKLINE(2024,3,I1:J31)',
      '=YEARSPARKLINE(2024,I1:J12)',
      '=PARETOSPARKLINE(I1:I4,J1:J4)',
      '=PROGRESSSPARKLINE(0.5,"pie")',
      '=GAUGEKPISPARKLINE(10,5,8,4)',
      '=LOLLIPOPVARISPARKLINE(I1:I3,J1:J3,I1)',
    ];
    invalid.forEach((formula, index) => {
      sheet.setFormula(20 + index, 0, formula);
      expect(sheet.getText(20 + index, 0), formula).toBe('#VALUE!');
    });
    workbook.destroy();
  });

  it('accepts the argument shapes the trial accepts', () => {
    const { sheet, workbook } = fixture();
    const valid = [
      '=MONTHSPARKLINE(2024,3,G91:H120)',
      '=MONTHSPARKLINE(2024,3,G91:I95)',
      '=YEARSPARKLINE(2024,G1:H90)',
      '=YEARSPARKLINE(2024,G1:G90)',
      '=PARETOSPARKLINE(I1:I4,I1)',
      '=PROGRESSSPARKLINE(0.5,1)',
      '=GAUGEKPISPARKLINE(10,5,4,8)',
      '=GAUGEKPISPARKLINE(10,5,0,10,true,"T","C","M","X")',
      '=LOLLIPOPVARISPARKLINE(I1:I3,J1:J3,1)',
      '=LOLLIPOPVARISPARKLINE(I1:J3,J1:J3,2)',
      '=HISTOGRAMSPARKLINE(I1:I4)',
      '=SCATTERSPARKLINE(I1:I4)',
      '=PIESPARKLINE(5)',
      '=SPREADSPARKLINE(I1:J4)',
      '=STACKEDSPARKLINE(I1:J3,I1:J1,10)',
      '=VARISPARKLINE(1)',
      '=IMAGE("http://x/y.png")',
    ];
    valid.forEach((formula, index) => {
      sheet.setFormula(20 + index, 0, formula);
      const text = sheet.getText(20 + index, 0);
      // IMAGE has no calc function on the trial either (the cell stays empty).
      expect(text, formula).toBe(formula.startsWith('=IMAGE') ? '' : '');
      if (!formula.startsWith('=IMAGE')) expect(sheet.getValue(20 + index, 0), formula).toBeInstanceOf(Object);
    });
    workbook.destroy();
  });

  it('draws each formula sparkline into the cell (own canvas painters)', async () => {
    const { paintFormulaSparkline } = await import('../src/features/sparklines.js');
    const { drawSparklineRecord } = await import('../src/features/sparkline-draw.js');
    // Trial records (above) plus the number of marks the trial paints for them:
    // one bar/mark per value or bin; a line series connects its points with a
    // polyline (its own primitive) plus one marker per value when `showMarkers`.
    // Orientation 0 (the m5-sparklines visual scenario, gate-passing): the series
    // is read down the value rows of a vertical data range.
    const RECORDS: { name: string; value: Record<string, unknown>; marks: number }[] = [
      { name: 'LINESPARKLINE', value: { values: [[3], [-2], [5]], dataOrientation: 0, sparklineType: 0, setting: { options: { seriesColor: '#244062', lineWeight: 1, showMarkers: true } } }, marks: 4 },
      { name: 'COLUMNSPARKLINE', value: { values: [[3], [-2], [5]], dataOrientation: 0, sparklineType: 1, setting: { options: { seriesColor: '#244062' } } }, marks: 3 },
      { name: 'WINLOSSSPARKLINE', value: { values: [[3], [-2], [5]], dataOrientation: 0, sparklineType: 2, setting: { options: { seriesColor: '#244062' } } }, marks: 3 },
      { name: 'PIESPARKLINE', value: TRIAL_RECORDS.PIESPARKLINE, marks: 3 },
      { name: 'AREASPARKLINE', value: { points: [3, -2, 5], mini: null, maxi: null, line1: null, line2: null, colorPositive: '#52973f', colorNegative: '#c00000' }, marks: 2 },
      { name: 'HBARSPARKLINE', value: { value: 0.5, colorScheme: 'blue', axisVisible: true, barHeight: 10 }, marks: 2 },
      { name: 'VBARSPARKLINE', value: { value: 0.5, colorScheme: 'blue', axisVisible: true, barWidth: 10 }, marks: 2 },
      { name: 'SCATTERSPARKLINE', value: { ...TRIAL_RECORDS.SCATTERSPARKLINE, points1: [[3], [-2], [5], [1]], points2: [[4], [8], [15], [22]] }, marks: 4 },
      { name: 'BULLETSPARKLINE', value: { ...TRIAL_RECORDS.BULLETSPARKLINE, good: 80, bad: 20 }, marks: 4 },
      { name: 'SPREADSPARKLINE', value: TRIAL_RECORDS.SPREADSPARKLINE, marks: 7 },
      { name: 'STACKEDSPARKLINE', value: TRIAL_RECORDS.STACKEDSPARKLINE, marks: 6 },
      { name: 'VARISPARKLINE', value: TRIAL_RECORDS.VARISPARKLINE, marks: 2 },
      { name: 'LOLLIPOPVARISPARKLINE', value: TRIAL_RECORDS.LOLLIPOPVARISPARKLINE, marks: 6 },
      { name: 'BOXPLOTSPARKLINE', value: TRIAL_RECORDS.BOXPLOTSPARKLINE, marks: 6 },
      { name: 'CASCADESPARKLINE', value: { ...TRIAL_RECORDS.CASCADESPARKLINE, pointIndex: 2 }, marks: 4 },
      { name: 'PARETOSPARKLINE', value: TRIAL_RECORDS.PARETOSPARKLINE, marks: 13 },
      { name: 'MONTHSPARKLINE', value: TRIAL_RECORDS.MONTHSPARKLINE, marks: 31 },
      { name: 'YEARSPARKLINE', value: { ...TRIAL_RECORDS.YEARSPARKLINE, values: [5, 8, 3] }, marks: 3 },
      { name: 'PROGRESSSPARKLINE', value: TRIAL_RECORDS.PROGRESSSPARKLINE, marks: 2 },
      { name: 'GAUGEKPISPARKLINE', value: TRIAL_RECORDS.GAUGEKPISPARKLINE, marks: 4 },
      { name: 'HISTOGRAMSPARKLINE', value: TRIAL_RECORDS.HISTOGRAMSPARKLINE, marks: 7 },
      { name: 'RANGEBLOCKSPARKLINE', value: TRIAL_RECORDS.RANGEBLOCKSPARKLINE, marks: 2 },
    ];
    const { sheet, workbook } = fixture();
    for (const { name, value, marks } of RECORDS) {
      const calls: string[] = [];
      const context = recordingContext(calls);
      const handled = /^(LINE|COLUMN|WINLOSS|PIE|AREA|HBAR|VBAR)/.test(name)
        ? (paintFormulaSparkline(context, { name, value }, 0, 0, 60, 20, sheet), true)
        : drawSparklineRecord(context, name, value, 0, 0, 60, 20, sheet);
      expect(handled, name).toBe(true);
      const commits = calls.filter((key) => key === 'fillRect' || key === 'stroke' || key === 'fill' || key === 'arc' || key === 'strokeRect' || key === 'fillText');
      const path = calls.filter((key) => key === 'moveTo' || key === 'lineTo');
      expect(commits.length, name).toBeGreaterThan(0);
      // A sparkline paints one primitive per rendered value (or bin), and a
      // series connects its points with a polyline.
      expect(commits.length + path.length, name).toBeGreaterThanOrEqual(marks);
    }
    workbook.destroy();
  });
});

/** A canvas stand-in that records every call the painters make. */
function recordingContext(calls: string[]): CanvasRenderingContext2D {
  return new Proxy<Record<string, unknown>>(
    {},
    {
      get: (target, key: string) =>
        key in target
          ? target[key]
          : (...args: unknown[]) => {
            void args;
            calls.push(key);
          },
      set: (target, key: string, item) => {
        target[key] = item;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

describe('Workbook.addSparklineEx / removeSparklineEx (trial behaviour)', () => {
  /** The documented subclass pattern: `SparklineEx.apply(this, arguments)`. */
  function makeCustom(): { instance: SparklineExObject & { color: string } } {
    function MySparklineEx(this: SparklineExObject & { color: string }, color: string) {
      (classes().SparklineEx as unknown as { call(target: object): void }).call(this);
      this.typeName = 'MySparklineEx';
      this.color = color;
    }
    MySparklineEx.prototype = new (classes().SparklineEx!)();
    (MySparklineEx.prototype as unknown as { createFunction: () => unknown }).createFunction = function () {
      const fn = new GC.Spread.CalcEngine.Functions.Function('CIRCLE', 0, 0) as unknown as SparklineFunctionObject & { evaluate(): unknown };
      fn.evaluate = () => ({ radius: 5, color: 'green' });
      return fn;
    };
    (MySparklineEx.prototype as unknown as { paint: (context: CanvasRenderingContext2D) => void }).paint = (context) => {
      context.beginPath();
      context.arc(4, 4, 2, 0, Math.PI * 2);
      context.strokeStyle = 'green';
      context.stroke();
    };
    const ctor = MySparklineEx as unknown as new (color: string) => SparklineExObject & { color: string };
    return { instance: new ctor('green') };
  }

  it('keeps registered sparklines out of the workbook custom-function table', () => {
    const { workbook } = fixture();
    const { instance } = makeCustom();
    expect(instance.name()).toBe('CIRCLE');
    expect(instance.typeName).toBe('MySparklineEx');
    expect(workbook.getCustomFunction('CIRCLE')).toBeFalsy();
    workbook.addSparklineEx(instance as never);
    expect(workbook.getCustomFunction('CIRCLE')).toBeFalsy();
    workbook.destroy();
  });

  it('makes the registered function callable and paints an empty cell text', () => {
    const { sheet, workbook } = fixture();
    const { instance } = makeCustom();
    workbook.addSparklineEx(instance as never);
    sheet.setFormula(2, 2, '=CIRCLE()');
    expect(sheet.getValue(2, 2)).toBeInstanceOf(Object);
    expect(sheet.getText(2, 2)).toBe('');
    workbook.destroy();
  });

  it('serialises custom registrations under `sparklineExs` and drops them on removal', () => {
    const { workbook } = fixture();
    const { instance } = makeCustom();
    workbook.addSparklineEx(instance as never);
    const entries = workbook.toJSON().sparklineExs as Record<string, unknown>[];
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(1);
    expect(entries[0]!.typeName).toBe('MySparklineEx');
    expect(entries[0]!.color).toBe('green');
    expect(Object.values(entries[0]!).includes('CIRCLE')).toBe(true);
    expect(workbook.removeSparklineEx('CIRCLE')).toBeUndefined();
    const rest = workbook.toJSON().sparklineExs as Record<string, unknown>[] | undefined;
    expect(rest === undefined || rest.length === 0).toBe(true);
    workbook.destroy();
  });

  it('does not serialize built-in class registrations (trial `sparklineExs` stays empty)', () => {
    const { workbook } = fixture();
    workbook.addSparklineEx(new (classes().PieSparkline!)() as never);
    workbook.addSparklineEx(new (classes().SparklineEx!)() as never);
    const entries = workbook.toJSON().sparklineExs as Record<string, unknown>[] | undefined;
    expect(entries ?? []).toEqual([]);
    workbook.destroy();
  });

  it('accepts removal of an unregistered name without throwing', () => {
    const { workbook } = fixture();
    expect(() => workbook.removeSparklineEx('Nope')).not.toThrow();
    workbook.destroy();
  });
});
