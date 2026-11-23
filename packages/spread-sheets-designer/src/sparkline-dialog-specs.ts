/* TASK 93 item 3: the formula sparklines the official Designer offers under
 * Insert ▸ Sparklines. Black-box measurements on the running trial (server
 * 5186, `?side=official`) split the 23 gallery entries into:
 *  - the generic "Create Sparklines" dialog (349x248: Data Range + Location
 *    Range + a checked `isFormulaSparkline` checkbox): LINE, AREA, COLUMN,
 *    WINLOSS, PIE, STACKED, CASCADE, PARETO, HISTOGRAM, SCATTER, SPREADS, BOXPLOT;
 *  - per-type dialogs with one input per formula argument (labels measured
 *    verbatim, e.g. `PlannedValue:` / `ColorPositive:`): HBAR (298x167), VBAR,
 *    MONTH (508x251), YEAR (508x251), BULLET (488x267), GAUGEKPI (578x380),
 *    PROGRESS (498x200), RANGEBLOCK (328x233), VARIANCE (508x237),
 *    LOLLIPOP VARIANCE (508x277), IMAGE (548x296).
 * OK writes the formula into the (single-cell) Location Range; the core draws
 * every one of them through `features/sparkline-draw.ts`. */

export interface SparkField {
  key: string;
  /** Dialog label (trial text, e.g. `PlannedValue:`). */
  label: string;
  /** `range` gets the trial's range-picker button; the value goes into the formula verbatim. */
  kind: 'range' | 'text' | 'number' | 'select';
  /** Default formula token (inserted verbatim; empty slot renders as the trial's empty argument). */
  def: string;
  options?: { text: string; value: string }[];
}

export interface SparkDialogSpec {
  /** Dialog fields in trial order (the Location Range row is appended by the body). */
  fields: SparkField[];
  /** Builds the formula body (without `=FN(`) from the raw field values. */
  args: (values: Record<string, string>) => string[];
}

const raw = (values: Record<string, string>, key: string): string => String(values[key] ?? '');

/** The custom dialog specs (the generic ones are not listed). */
export const SPARK_DIALOG_SPECS: Record<string, SparkDialogSpec> = {
  HBARSPARKLINE: {
    fields: [
      { key: 'value', label: 'Value:', kind: 'text', def: '"0"' },
      { key: 'colorScheme', label: 'ColorScheme:', kind: 'text', def: '"0"' },
    ],
    args: (v) => [raw(v, 'value'), raw(v, 'colorScheme')],
  },
  VBARSPARKLINE: {
    fields: [
      { key: 'value', label: 'Value:', kind: 'text', def: '"0"' },
      { key: 'colorScheme', label: 'ColorScheme:', kind: 'text', def: '"0"' },
    ],
    args: (v) => [raw(v, 'value'), raw(v, 'colorScheme')],
  },
  MONTHSPARKLINE: {
    // Trial: MONTHSPARKLINE(,1,L2,"lightgray","lightgreen","green","darkgreen").
    fields: [
      { key: 'year', label: 'Year:', kind: 'text', def: '' },
      { key: 'month', label: 'Month:', kind: 'number', def: '1' },
      { key: 'data', label: 'Data Range:', kind: 'range', def: '' },
    ],
    args: (v) => [raw(v, 'year'), raw(v, 'month') || '1', raw(v, 'data'), '"lightgray"', '"lightgreen"', '"green"', '"darkgreen"'],
  },
  YEARSPARKLINE: {
    fields: [
      { key: 'year', label: 'Year:', kind: 'text', def: '' },
      { key: 'data', label: 'Data Range:', kind: 'range', def: '' },
    ],
    args: (v) => [raw(v, 'year'), raw(v, 'data')],
  },
  BULLETSPARKLINE: {
    // Trial dialog: 7 inputs (measure, target, maxi, good, bad, forecast, tick unit).
    fields: [
      { key: 'measure', label: 'Measure:', kind: 'text', def: '0' },
      { key: 'target', label: 'Target:', kind: 'text', def: '0' },
      { key: 'maxi', label: 'Maxi:', kind: 'text', def: '0' },
      { key: 'good', label: 'Good:', kind: 'text', def: '0' },
      { key: 'bad', label: 'Bad:', kind: 'text', def: '0' },
      { key: 'forecast', label: 'Forecast:', kind: 'text', def: '0' },
      { key: 'tickUnit', label: 'TickUnit:', kind: 'text', def: '0' },
    ],
    args: (v) => ['measure', 'target', 'maxi', 'good', 'bad', 'forecast', 'tickUnit'].map((key) => raw(v, key)),
  },
  GAUGEKPISPARKLINE: {
    // Trial dialog sections Value / Show / Style; inputs 0,0,0,0 (the four value
    // slots), -90, 90 (min/max angle) and 0% (radius ratio).
    fields: [
      { key: 'targetValue', label: 'TargetValue:', kind: 'text', def: '0' },
      { key: 'currentValue', label: 'CurrentValue:', kind: 'text', def: '0' },
      { key: 'minValue', label: 'MinValue:', kind: 'text', def: '0' },
      { key: 'maxValue', label: 'MaxValue:', kind: 'text', def: '0' },
      { key: 'showLabel', label: 'ShowLabel:', kind: 'text', def: 'TRUE' },
      { key: 'minAngle', label: 'MinAngle:', kind: 'text', def: '-90' },
      { key: 'maxAngle', label: 'MaxAngle:', kind: 'text', def: '90' },
      { key: 'radiusRatio', label: 'RadiusRatio:', kind: 'text', def: '0' },
    ],
    // Slots 5..9 (the label fonts/colors) stay empty, like the trial's formula.
    args: (v) => [raw(v, 'targetValue'), raw(v, 'currentValue'), raw(v, 'minValue'), raw(v, 'maxValue'), raw(v, 'showLabel'), '', '', '', '', '', raw(v, 'minAngle'), raw(v, 'maxAngle'), raw(v, 'radiusRatio')],
  },
  PROGRESSSPARKLINE: {
    fields: [
      { key: 'value', label: 'Value:', kind: 'text', def: '"0"' },
      { key: 'mode', label: 'Mode:', kind: 'number', def: '0' },
    ],
    args: (v) => [raw(v, 'value'), raw(v, 'mode') || '0'],
  },
  RANGEBLOCKSPARKLINE: {
    fields: [
      { key: 'data', label: 'Data Range:', kind: 'range', def: '' },
      { key: 'binding', label: 'BindingObject:', kind: 'text', def: '' },
    ],
    args: (v) => [raw(v, 'data'), raw(v, 'binding')],
  },
  VARISPARKLINE: {
    fields: [
      { key: 'variance', label: 'Variance:', kind: 'text', def: '"0"' },
      { key: 'reference', label: 'Reference:', kind: 'text', def: '""' },
      { key: 'mini', label: 'Mini:', kind: 'number', def: '0' },
      { key: 'maxi', label: 'Maxi:', kind: 'number', def: '0' },
      { key: 'mark', label: 'Mark:', kind: 'number', def: '0' },
      { key: 'tickUnit', label: 'TickUnit:', kind: 'number', def: '0' },
      { key: 'colorPositive', label: 'ColorPositive:', kind: 'text', def: '' },
      { key: 'colorNegative', label: 'ColorNegative:', kind: 'text', def: '' },
    ],
    args: (v) => ['variance', 'reference', 'mini', 'maxi', 'mark', 'tickUnit', 'colorPositive', 'colorNegative'].map((key) => raw(v, key)),
  },
  LOLLIPOPVARISPARKLINE: {
    fields: [
      { key: 'plannedValue', label: 'PlannedValue:', kind: 'text', def: '"0"' },
      { key: 'actualValue', label: 'ActualValue:', kind: 'text', def: '""' },
      { key: 'index', label: 'Index:', kind: 'number', def: '0' },
      { key: 'absolute', label: 'Absolute', kind: 'text', def: 'TRUE' },
      { key: 'mini', label: 'Mini:', kind: 'number', def: '0' },
      { key: 'maxi', label: 'Maxi:', kind: 'number', def: '0' },
      { key: 'reference', label: 'Reference:', kind: 'number', def: '0' },
      { key: 'tickUnit', label: 'TickUnit:', kind: 'text', def: 'TRUE' },
      { key: 'colorPositive', label: 'ColorPositive:', kind: 'text', def: '' },
      { key: 'colorNegative', label: 'ColorNegative:', kind: 'text', def: '' },
    ],
    args: (v) => ['plannedValue', 'actualValue', 'index', 'absolute', 'mini', 'maxi', 'reference', 'tickUnit', 'colorPositive', 'colorNegative'].map((key) => raw(v, key)),
  },
  IMAGE: {
    // "Insert Image Function": the trial prefills the first slot quoted ("0").
    fields: [
      { key: 'source', label: 'Source:', kind: 'text', def: '"0"' },
      { key: 'altText', label: 'AltText:', kind: 'text', def: '""' },
      { key: 'sizing', label: 'Sizing:', kind: 'select', def: '0', options: [
        { text: '0 (default)', value: '0' }, { text: '1 (property)', value: '1' }, { text: '2 (cell)', value: '2' },
      ] },
      { key: 'height', label: 'Height:', kind: 'number', def: '0' },
      { key: 'width', label: 'Width:', kind: 'number', def: '0' },
    ],
    args: (v) => ['source', 'altText', 'sizing', 'height', 'width'].map((key) => raw(v, key)),
  },
};

/** Ribbon command id -> formula function name (the whole Insert ▸ Sparklines gallery). */
export const SPARKLINE_COMMAND_FUNCTIONS: Record<string, string> = {
  sparklinesLineSparkline: 'LINESPARKLINE',
  sparklinesAreaSparkline: 'AREASPARKLINE',
  sparklinesColumnSparkline: 'COLUMNSPARKLINE',
  sparklinesWinLossSparkline: 'WINLOSSSPARKLINE',
  sparklinesStackedSparkline: 'STACKEDSPARKLINE',
  sparklinesCascadeSparkline: 'CASCADESPARKLINE',
  sparklinesParetoSparkline: 'PARETOSPARKLINE',
  sparklinesHBarSparkline: 'HBARSPARKLINE',
  sparklinesVBarSparkline: 'VBARSPARKLINE',
  sparklinesHistogramSparkline: 'HISTOGRAMSPARKLINE',
  sparklinesPieSparkline: 'PIESPARKLINE',
  sparklinesScatterSparkline: 'SCATTERSPARKLINE',
  sparklinesSpreadsSparkline: 'SPREADSPARKLINE',
  sparklinesMonthSparkline: 'MONTHSPARKLINE',
  sparklinesYearSparkline: 'YEARSPARKLINE',
  sparklinesBoxPlotSparkline: 'BOXPLOTSPARKLINE',
  sparklinesBulletSparkline: 'BULLETSPARKLINE',
  sparklinesVarianceSparkline: 'VARISPARKLINE',
  sparklinesRangeBlockSparkline: 'RANGEBLOCKSPARKLINE',
  sparklinesGaugeKPISparkline: 'GAUGEKPISPARKLINE',
  sparklineImageSparkline: 'IMAGE',
  sparklinesLollipopVarianceSparkline: 'LOLLIPOPVARISPARKLINE',
  sparklinesProgressSparkline: 'PROGRESSSPARKLINE',
};

/**
 * The trial's generic-dialog families: the gallery items whose dialog only
 * offers Data Range / Location Range / isFormulaSparkline (measured list).
 * LINE/COLUMN/WINLOSS split multi-series data across one location cell per
 * series; every other generic type writes one formula into a single cell.
 */
export function isGenericSparklineDialog(fn: string): boolean {
  return !SPARK_DIALOG_SPECS[fn];
}
