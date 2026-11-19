/**
 * DataCharts public config types (GC.Spread.Sheets.DataCharts).
 *
 * These mirror the shape of the public IDataChartConfig family documented in
 * the API reference: a data chart binds to a GC.Data table (`tableName`) and
 * draws one or more `plots`, each with `encodings` (field-based channels) and
 * optional `config`. Written from the public contract only.
 */

import { GC } from '../generated/enums.js';

export type Aggregate = GC.Spread.Sheets.DataCharts.Aggregate;
export type AnimationEasing = GC.Spread.Sheets.DataCharts.AnimationEasing;
export type AxisPosition = GC.Spread.Sheets.DataCharts.AxisPosition;
export type AxisType = GC.Spread.Sheets.DataCharts.AxisType;
export type ComparisonOperator = GC.Spread.Sheets.DataCharts.ComparisonOperator;
export type DataChartType = GC.Spread.Sheets.DataCharts.DataChartType;
export type DateMode = GC.Spread.Sheets.DataCharts.DateMode;
export type FontStyle = GC.Spread.Sheets.DataCharts.FontStyle;
export type FormatType = GC.Spread.Sheets.DataCharts.FormatType;
export type FunnelType = GC.Spread.Sheets.DataCharts.FunnelType;
export type HAlign = GC.Spread.Sheets.DataCharts.HAlign;
export type LegendPosition = GC.Spread.Sheets.DataCharts.LegendPosition;
export type LegendType = GC.Spread.Sheets.DataCharts.LegendType;
export type LineAspect = GC.Spread.Sheets.DataCharts.LineAspect;
export type LogicalOperation = GC.Spread.Sheets.DataCharts.LogicalOperation;
export type OrderType = GC.Spread.Sheets.DataCharts.OrderType;
export type Orientation = GC.Spread.Sheets.DataCharts.Orientation;
export type OverlappingLabels = GC.Spread.Sheets.DataCharts.OverlappingLabels;
export type StringOperator = GC.Spread.Sheets.DataCharts.StringOperator;
export type SymbolShape = GC.Spread.Sheets.DataCharts.SymbolShape;
export type TextOverflow = GC.Spread.Sheets.DataCharts.TextOverflow;
export type TextPosition = GC.Spread.Sheets.DataCharts.TextPosition;
export type TickMark = GC.Spread.Sheets.DataCharts.TickMark;
export type ValueOptionType = GC.Spread.Sheets.DataCharts.ValueOptionType;
export type ValueScaleType = GC.Spread.Sheets.DataCharts.ValueScaleType;
export type VAlign = GC.Spread.Sheets.DataCharts.VAlign;

/** A plain CSS color wrapper, e.g. `{ type: "CssColor", color: "#4f81bd" }`. */
export interface ICssColorOptions {
    type: 'CssColor';
    color?: string;
}

export type ColorOptions = ICssColorOptions;
export type ColorString = string;

export type DataValueType = number | boolean | Date | string | null;

export interface IValueOption {
    type?: ValueOptionType;
    value?: number;
}

export interface IValueScaleOption {
    type?: ValueScaleType;
}

export interface IAxisUnitOption {
    dateMode?: DateMode;
    value?: number;
}

export interface IPaddingOption {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
}

export interface IStyleOption {
    fill?: ColorOptions;
    fillOpacity?: number;
    stroke?: ColorOptions;
    strokeDasharray?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
}

export interface ILineStyle {
    stroke?: ColorOptions;
    strokeWidth?: number;
    strokeDasharray?: string;
    strokeOpacity?: number;
}

export interface ITextStyleOption {
    alignment?: HAlign;
    color?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: FontStyle;
    fontWeight?: string;
    opacity?: number;
    overflow?: TextOverflow;
}

export interface ILabelStyleOption {
    color?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: FontStyle;
    fontWeight?: string;
    opacity?: number;
    overflow?: TextOverflow;
    padding?: IPaddingOption;
}

export interface ITitleStyleOption {
    color?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: FontStyle;
    fontWeight?: string;
    opacity?: number;
    padding?: IPaddingOption;
}

export interface ITextDecorationOption {
    lineThrough?: boolean;
    overline?: boolean;
    underline?: boolean;
}

export interface IToolTipStyleOption {
    fill?: ColorOptions;
    stroke?: ColorOptions;
    strokeWidth?: number;
    fillOpacity?: number;
    strokeOpacity?: number;
}

export interface IToolTipTextStyleOption {
    color?: string;
    fontFamily?: string;
    fontSize?: number;
    fontStyle?: FontStyle;
    fontWeight?: string;
    opacity?: number;
    textDecoration?: ITextDecorationOption;
}

export interface ISymbolStyleOption {
    symbolShape?: SymbolShape;
    symbolSize?: number;
}

export interface IBorderRadius {
    bottomLeft?: number;
    bottomRight?: number;
    topLeft?: number;
    topRight?: number;
}

export interface IBarStyleOption {
    overlap?: number;
    width?: number;
    borderRadius?: IBorderRadius;
}

export interface IDataPointStyleOption extends IStyleOption {
    symbol?: ISymbolStyleOption;
    bar?: IBarStyleOption;
}

export interface IQuadrangleStyleOption {
    leftBorder?: ILineStyle;
    rightBorder?: ILineStyle;
    topBorder?: ILineStyle;
    bottomBorder?: ILineStyle;
}

export interface IConnectingLineStyle {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    firstLineLength?: number;
    secondLineLength?: number;
}

export interface IAnimationOption {
    duration?: number;
    easing?: AnimationEasing;
    scale?: number;
    startDelay?: number;
}

export interface IFormatOption {
    type?: FormatType;
    value: string;
}

export interface IAxisOption {
    type?: AxisType;
    labels?: boolean;
    axisLine?: boolean;
    reversed?: boolean;
    title?: string;
    max?: IValueOption;
    min?: IValueOption;
    position?: AxisPosition;
    origin?: number;
    format?: IFormatOption | IFormatOption[];
    majorUnit?: IAxisUnitOption;
    overlappingLabels?: OverlappingLabels;
    dateMode?: DateMode;
    hoverStyle?: ITextStyleOption;
    labelAngle?: number[];
    labelStyle?: ILabelStyleOption;
    logBase?: number;
    majorGrid?: boolean;
    majorTickSize?: number;
    majorTicks?: TickMark;
    minorGrid?: boolean;
    minorTickSize?: number;
    minorTicks?: TickMark;
    minorUnit?: IAxisUnitOption;
    scale?: IValueScaleOption;
    style?: IStyleOption;
    titleStyle?: ITitleStyleOption;
    lineStyle?: ILineStyle;
    majorGridStyle?: ILineStyle;
    majorTickStyle?: ILineStyle;
    minorGridStyle?: ILineStyle;
    minorTickStyle?: ILineStyle;
    plots?: string[];
}

export interface IConfigLegendOption {
    wrapping?: boolean;
}

export interface ILegendOptions {
    title?: string;
    type?: LegendType;
    height?: number;
    width?: number;
    maxHeight?: number;
    maxWidth?: number;
    position?: LegendPosition;
    textStyle?: ITextStyleOption;
    hAlign?: HAlign;
    vAlign?: VAlign;
    padding?: IPaddingOption;
}

export interface IPlotAreaOption {
    axes?: IAxisOption[];
    column?: number;
    padding?: IPaddingOption;
    row?: number;
    textStyle?: ITextStyleOption;
    legends?: ILegendOptions[];
    legend?: IConfigLegendOption;
}

export interface IPlotAreaLayoutOption {
    columnWidths?: IValueOption[];
    rowHeights?: IValueOption[];
}

export interface IHeaderOption {
    title?: string;
    textStyle?: ITextStyleOption;
    padding?: IPaddingOption;
    style?: IStyleOption;
}

export interface IPaletteItemOption {
    color: ColorOptions;
}

export interface IConfigOption {
    dvStyle?: IStyleOption;
    palette?: IPaletteItemOption[];
    plotAreaLayout?: IPlotAreaLayoutOption;
    plotAreas?: IPlotAreaOption[];
    style?: IStyleOption;
    textStyle?: ITextStyleOption;
    header?: IHeaderOption;
}

export interface IFieldBasicOption {
    field: string;
    displayName?: string;
}

export interface ISortEncodingOption {
    field: string;
    aggregate?: Aggregate;
    order?: OrderType;
}

export interface ICategoryEncodingOption extends IFieldBasicOption {
    sort?: ISortEncodingOption;
    dateMode?: DateMode;
    child?: ICategoryEncodingOption;
}

export interface IColorEncodingOption extends IFieldBasicOption {
    aggregate?: Aggregate;
}

export interface IContentEncodingOption extends IFieldBasicOption {
    aggregate?: Aggregate;
}

export interface IValueEncodingOption extends IFieldBasicOption {
    aggregate?: Aggregate;
}

export interface IRangeVectorsOption {
    lower?: IFieldBasicOption;
    upper?: IFieldBasicOption;
}

export interface IRangeValueEncodingOption {
    vectors?: IRangeVectorsOption;
    aggregate?: Aggregate;
}

export interface IStockVectorsOption {
    high?: IFieldBasicOption;
    low?: IFieldBasicOption;
    open?: IFieldBasicOption;
    close?: IFieldBasicOption;
}

export interface IStockValueEncodingOption {
    vectors?: IStockVectorsOption;
}

export interface ITrellisEncodingOption extends IFieldBasicOption {
    sort?: ISortEncodingOption;
    child?: ITrellisEncodingOption;
}

export interface IValueFilter {
    field: string;
    operate: ComparisonOperator | StringOperator;
    value: DataValueType | DataValueType[];
    excludeMatched?: boolean;
    ignoreCase?: boolean;
}

export interface IValueFilterGroup {
    conditions: IFilterOption[];
    operate: LogicalOperation;
}

export type IFilterOption = IValueFilter | IValueFilterGroup;

export interface IPlotEncodingsOption {
    values?:
        | IValueEncodingOption[]
        | IRangeValueEncodingOption[]
        | IStockValueEncodingOption[];
    category?: ICategoryEncodingOption;
    details?: IFieldBasicOption[];
    color?: IColorEncodingOption;
    size?: IFieldBasicOption;
    tooltip?: IContentEncodingOption[];
    filter?: IFilterOption;
    row?: ITrellisEncodingOption;
    column?: ITrellisEncodingOption;
}

export interface IPlotConfigTextOption {
    template?: string;
    format?: IFormatOption;
    style?: IStyleOption;
    textStyle?: ITextStyleOption;
    connectingLineStyle?: IConnectingLineStyle;
    maxWidth?: number;
    offset?: number;
    overlappingLabels?: OverlappingLabels;
    position?: TextPosition;
}

export interface IPlotConfigTooltipOption {
    style?: IToolTipStyleOption;
    textStyle?: IToolTipTextStyleOption;
}

export interface IPlotConfigTrellisOption {
    style?: IStyleOption;
    textStyle?: ITextStyleOption;
    hoverStyle?: ITextStyleOption;
    padding?: IPaddingOption;
    includeAxesInCells?: boolean;
    includeEmptyCells?: boolean;
}

export interface IFunnelOption {
    funnelType?: FunnelType;
    /** @deprecated shape is determined by the data */
    topWidth?: number;
    /** @deprecated shape is determined by the data */
    bottomWidth?: number;
    /** @deprecated shape is determined by the data */
    neckHeight?: number;
    orientation?: Orientation;
    reversed?: boolean;
}

export interface IWaterfallOption {
    showTotal?: boolean;
    totalLabel?: string;
    orientation?: Orientation;
    connectingLineStyle?: IStyleOption;
}

export interface ITreemapHeaderOption {
    template?: string;
    textStyle?: ITextStyleOption;
}

export interface ITreemapOption {
    header?: ITreemapHeaderOption;
}

export interface IPlotConfigOption {
    hoverStyle?: IDataPointStyleOption;
    innerRadius?: number;
    outerRadius?: number;
    lineAspect?: LineAspect;
    palette?: string[];
    usePositiveNegativeColors?: boolean;
    startAngle?: number;
    style?: IDataPointStyleOption;
    /** @deprecated use the plot `type` instead */
    swapAxes?: boolean;
    sweep?: number;
    symbols?: boolean;
    text?: IPlotConfigTextOption[];
    tooltip?: IPlotConfigTooltipOption[];
    hoverAnimation?: IAnimationOption;
    updateAnimation?: IAnimationOption;
    funnel?: IFunnelOption;
    waterfall?: IWaterfallOption;
    treemap?: ITreemapOption;
    trellis?: IPlotConfigTrellisOption;
}

export interface IPlotOption {
    type: DataChartType;
    name?: string;
    encodings?: IPlotEncodingsOption;
    config?: IPlotConfigOption;
}

export interface IDataChartConfig {
    plots: IPlotOption[];
    config?: IConfigOption;
    tableName?: string;
}

/** Type guard used by the manager when validating setChartConfig input. */
export function isFilterGroup(filter: IFilterOption): filter is IValueFilterGroup {
    return Array.isArray((filter as IValueFilterGroup).conditions);
}

/** Loose JSON record for reading serialised trial shapes (@internal). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonAny = Record<string, any>;
