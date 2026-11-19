/**
 * Charts feature entry: public classes plus registration into the
 * `GC.Spread.Sheets.Charts` namespace object (before index.ts spreads the
 * enum namespace into the public GC surface).
 */
import { GC } from '../../generated/enums.js';
import { Chart } from './chart.js';
import { ChartCollection } from './collection.js';
import { SeriesCollection } from './series.js';
import { ColorSchemes, getColor } from './color-schemes.js';

export { Chart, ChartCollection, SeriesCollection, ColorSchemes, getColor };

const chartsNamespace = GC.Spread.Sheets.Charts as unknown as Record<string, unknown>;
chartsNamespace.Chart = Chart;
chartsNamespace.ChartCollection = ChartCollection;
chartsNamespace.SeriesCollection = SeriesCollection;
chartsNamespace.ColorSchemes = ColorSchemes;
chartsNamespace.getColor = getColor;
