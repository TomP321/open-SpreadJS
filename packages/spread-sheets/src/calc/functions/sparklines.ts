import type { BuiltinFunction } from '../evaluate.js';
import { sparklineFor, SPARKLINE_FUNCTION_SPECS } from '../../features/sparkline-ex.js';

/**
 * The built-in small-chart formula functions. Each delegates to the shared
 * SparklineEx class instance of its name (trial arity from `createFunction`).
 */
export const SPARKLINE_FUNCTIONS: BuiltinFunction[] = SPARKLINE_FUNCTION_SPECS
  .filter((spec) => spec.name !== 'IMAGE')
  .map((spec) => ({
    name: spec.name,
    min: spec.min,
    max: spec.max,
    arrayArgs: true,
    evaluate(args, ctx) {
      return sparklineFor(spec.name)!.evaluateFormula(args, ctx);
    },
  }));
