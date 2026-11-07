import { SPARKLINE_FUNCTIONS } from './sparklines.js';
import { registerFunctions } from '../evaluate.js';
import { MATH_FUNCTIONS } from './math.js';
import { LOGICAL_FUNCTIONS } from './logical.js';
import { TEXT_FUNCTIONS } from './text.js';
import { STAT_FUNCTIONS } from './stat.js';
import { LOOKUP_FUNCTIONS } from './lookup.js';
import { DYNAMIC_FUNCTIONS } from './dynamic.js';
import { DATE_FUNCTIONS } from './date.js';
import { FINANCIAL_FUNCTIONS } from './financial.js';
import { ENGINEERING_FUNCTIONS } from './engineering.js';
import { STAT_EXTRA_FUNCTIONS } from './stat-extra.js';
import { DATABASE_FUNCTIONS } from './database.js';
import { FINANCIAL_EXTRA_FUNCTIONS } from './financial-extra.js';
import { TEXT_EXTRA_FUNCTIONS } from './text-extra.js';
import { MISC_FUNCTIONS } from './misc.js';

registerFunctions([...SPARKLINE_FUNCTIONS, ...MATH_FUNCTIONS, ...LOGICAL_FUNCTIONS, ...TEXT_FUNCTIONS, ...STAT_FUNCTIONS, ...LOOKUP_FUNCTIONS, ...DYNAMIC_FUNCTIONS, ...DATE_FUNCTIONS, ...FINANCIAL_FUNCTIONS, ...ENGINEERING_FUNCTIONS, ...STAT_EXTRA_FUNCTIONS, ...DATABASE_FUNCTIONS, ...FINANCIAL_EXTRA_FUNCTIONS, ...TEXT_EXTRA_FUNCTIONS, ...MISC_FUNCTIONS]);

export { MATH_FUNCTIONS, LOGICAL_FUNCTIONS, TEXT_FUNCTIONS, STAT_FUNCTIONS, LOOKUP_FUNCTIONS, DYNAMIC_FUNCTIONS };
