/** Metadata for formula hints. Optional arguments are shown in brackets. */
export interface FunctionHint {
  description: string;
  parameters: string[];
  /** Index of the first displayed argument in a repeating group. */
  repeatFrom?: number;
}

// Signatures are based on the public SpreadJS and Excel formula references.
// An ellipsis indicates that the preceding argument or argument group can repeat.
export const functionCatalog: Record<string, FunctionHint> = {
  AVERAGE: { description: 'Finds the arithmetic mean of numeric values.', parameters: ['number1', '[number2]', '...'] },
  AVERAGEIF: { description: 'Averages values selected by one condition.', parameters: ['range', 'criteria', '[average_range]'] },
  AVERAGEIFS: { description: 'Averages values that meet all supplied conditions.', parameters: ['average_range', 'criteria_range1', 'criteria1', '[criteria_range2]', '[criteria2]', '...'], repeatFrom: 3 },
  BOXPLOTSPARKLINE: { description: 'Shows the distribution of values as a compact box plot.', parameters: ['points', 'boxPlotClass', '[showAverage]', '[scaleStart]', '[scaleEnd]', '[acceptableStart]', '[acceptableEnd]', '[colorScheme]', '[style]', '[vertical]'] },
  COUNT: { description: 'Counts numeric values in its arguments.', parameters: ['value1', '[value2]', '...'] },
  COUNTA: { description: 'Counts nonempty values in its arguments.', parameters: ['value1', '[value2]', '...'] },
  COUNTIF: { description: 'Counts cells that meet a condition.', parameters: ['range', 'criteria'] },
  COUNTIFS: { description: 'Counts cells that meet all supplied conditions.', parameters: ['criteria_range1', 'criteria1', '[criteria_range2]', '[criteria2]', '...'], repeatFrom: 2 },
  IF: { description: 'Chooses a result according to a logical test.', parameters: ['logical_test', 'value_if_true', '[value_if_false]'] },
  IFERROR: { description: 'Replaces an error result with an alternative.', parameters: ['value', 'value_if_error'] },
  INDEX: { description: 'Selects a value or reference at a position in a range.', parameters: ['array', 'row_num', '[column_num]'] },
  LEFT: { description: 'Takes characters from the beginning of text.', parameters: ['text', '[num_chars]'] },
  MATCH: { description: 'Finds the position of a value in a range.', parameters: ['lookup_value', 'lookup_array', '[match_type]'] },
  MAX: { description: 'Finds the largest numeric value.', parameters: ['number1', '[number2]', '...'] },
  MIN: { description: 'Finds the smallest numeric value.', parameters: ['number1', '[number2]', '...'] },
  NOW: { description: 'Provides the current date and time.', parameters: [] },
  PI: { description: 'Provides the mathematical constant pi.', parameters: [] },
  RAND: { description: 'Generates a random number from zero up to one.', parameters: [] },
  RIGHT: { description: 'Takes characters from the end of text.', parameters: ['text', '[num_chars]'] },
  SCATTERSPARKLINE: { description: 'Plots pairs of values as a compact scatter chart.', parameters: ['points1', '[points2]', '[minX]', '[maxX]', '[minY]', '[maxY]', '[hLine]', '[vLine]', '[xMinZone]', '[xMaxZone]', '[yMinZone]', '[yMaxZone]', '[tags]', '[drawSymbol]', '[drawLines]', '[color1]', '[color2]', '[dash]'] },
  SPREADSPARKLINE: { description: 'Displays the distribution of values in a compact chart.', parameters: ['points', '[showAverage]', '[scaleStart]', '[scaleEnd]', '[style]', '[colorScheme]', '[vertical]'] },
  SUBSTITUTE: { description: 'Replaces matching text with new text.', parameters: ['text', 'old_text', 'new_text', '[instance_num]'] },
  SUBTOTAL: { description: 'Calculates a subtotal for a range.', parameters: ['function_num', 'ref1', '[ref2]', '...'] },
  SUM: { description: 'Adds numbers together.', parameters: ['number1', '[number2]', '...'] },
  SUMIF: { description: 'Adds values that meet a condition.', parameters: ['range', 'criteria', '[sum_range]'] },
  SUMIFS: { description: 'Adds values that meet multiple conditions.', parameters: ['sum_range', 'criteria_range1', 'criteria1', '[criteria_range2]', '[criteria2]', '...'], repeatFrom: 3 },
  TODAY: { description: 'Provides the current date.', parameters: [] },
  VLOOKUP: { description: 'Looks down the first column of a table for a matching value.', parameters: ['lookup_value', 'table_array', 'col_index_num', '[range_lookup]'] },
};
