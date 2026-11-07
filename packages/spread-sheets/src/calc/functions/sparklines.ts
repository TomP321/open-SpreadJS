import type { BuiltinFunction } from '../evaluate.js';
import { ReferenceValue, SparklineExValue } from '../values.js';
import { sparklineDefaults } from '../../features/sparklines.js';
export const SPARKLINE_FUNCTIONS: BuiltinFunction[] = ['LINESPARKLINE', 'COLUMNSPARKLINE', 'WINLOSSSPARKLINE', 'PIESPARKLINE', 'AREASPARKLINE', 'HBARSPARKLINE', 'VBARSPARKLINE'].map(name => ({
  name, min: /^(LINE|COLUMN|WINLOSS)/.test(name) ? 2 : 1, max: 10, arrayArgs: true,
  evaluate(args, ctx) {
    const array = args.array(0).array;
    const ref = args.value(0);
    const area = ref instanceof ReferenceValue ? ref.areas[0] : null;
    if (/^(LINE|COLUMN|WINLOSS)/.test(name)) {
      const orientation = args.number(1);
      const settingsText = args.count > 4 ? args.text(4) : '';
      const setting = { ...sparklineDefaults };
      // Formula settings use a JSON object supplied as text.
      if (settingsText) { try { Object.assign(setting, JSON.parse(settingsText)); } catch { /* unrecognised settings use defaults, as the trial */ } }
      return new SparklineExValue(name, { values: array, dataOrientation: orientation, setting: { options: setting }, sparklineType: name === 'LINESPARKLINE' ? 0 : name === 'COLUMNSPARKLINE' ? 1 : 2, data: area ? { row: area.r1, col: area.c1, rowCount: area.r2 - area.r1 + 1, colCount: area.c2 - area.c1 + 1 } : null, dataSheetName: area?.sheet.name() ?? ctx.sheet.name() });
    }
    return new SparklineExValue(name, { values: array.flat(), colors: Array.from({ length: Math.max(0, args.count - 1) }, (_, i) => args.text(i + 1)) });
  },
}));
