/*
 * Formula-function library used by the Formulas tab galleries and the function
 * dialogs.
 *
 * The category names, the member lists and the order inside every list are the
 * v19 trial's own: read from the running component through the public designer
 * API (`Designer.getCommand(name).dropdownList`) and from the open Insert
 * Function dialog (`Designer.getTemplate('insertFunctionDialogTemplate')` gives
 * the category order). Descriptions and argument names come from our core's
 * function catalog.
 */

import { functionCatalog } from '@mescius/spread-sheets/dist/gc.spread.sheets.internals.js';
import type { LanguagePackage } from '@mescius/spread-sheets/dist/gc.spread.sheets.internals.js';
import { designerCore } from './core-internals.js';
import { getPath, getResources } from './resolve.js';
const fc = (key: string): string => `\${res.ribbon.functionCategories.${key}}`;

/* ---------------------------------------------------------------------------
 * TASK 89: localization of the function UI through the active calc language
 * package. The data (category lists, dialog state, command names) stays
 * canonical English; only display names, argument separators and descriptions
 * follow the package, so everything round-trips through the engine unchanged.
 * The live registry lives in the core bundle, so the package object is read
 * from `GC.Spread.CalcEngine.LanguagePackages._activeLanguagePackage()`.
 * ------------------------------------------------------------------------- */

/** View of the core's hidden language-package accessors (our extension of the d.ts surface). */
interface LanguagePackagesAccess {
  _activeLanguagePackage?: () => LanguagePackage | undefined;
  _addDescriptions?: (languageName: string, descriptions: Record<string, string>) => boolean;
}

function languagePackagesAccess(): LanguagePackagesAccess | undefined {
  const calcEngine = designerCore()?.Spread?.CalcEngine as { LanguagePackages?: LanguagePackagesAccess } | undefined;
  return calcEngine?.LanguagePackages;
}

/** The active calc language package (undefined = plain English). */
export function activeCalcLanguage(): LanguagePackage | undefined {
  const language = languagePackagesAccess()?._activeLanguagePackage?.();
  if (language) syncCalcLanguageDescriptions(language);
  return language;
}

/** The resource subtree each package's descriptions were last filled from (changed subtree re-syncs). */
const syncedDescriptions = new WeakMap<LanguagePackage, object>();

/**
 * The autocomplete popup renders inside the CORE, so the loaded resource language's
 * `functionDescriptions` subtree must be merged into the active calc language package once —
 * through the core's own `_addDescriptions` accessor, which keeps everything in the core
 * bundle's live registry (importing the mutator value here would inline a SECOND registry).
 * Resource keys spell dots as underscores (`STDEV_P`); only names that the catalog really
 * writes with a dot are reversed, so genuine underscore names (`BC_CODABAR`) survive untouched.
 */
export function syncCalcLanguageDescriptions(language: LanguagePackage): void {
  const subtree = getPath(getResources(), 'functionDescriptions');
  if (!subtree || typeof subtree !== 'object') return;
  if (syncedDescriptions.get(language) === subtree) return;
  syncedDescriptions.set(language, subtree);
  const dotted = new Map<string, string>();
  for (const key of Object.keys(functionCatalog)) {
    const under = key.replace(/\./g, '_');
    if (under !== key) dotted.set(under, key);
  }
  const map: Record<string, string> = {};
  for (const [key, text] of Object.entries(subtree as Record<string, unknown>)) {
    if (typeof text !== 'string' || text === '') continue;
    map[dotted.get(key) ?? key] = text;
  }
  languagePackagesAccess()?._addDescriptions?.(language.languageName, map);
}

/** Eager entry point used at Designer startup (no-op while no package is active). */
export function syncCalcLanguageDescriptionsForActivePackage(): void {
  activeCalcLanguage();
}

/** The name a gallery/dialog shows and inserts (`SUM` -> `SOMMA` under `it`). */
export function functionDisplayName(name: string, language = activeCalcLanguage()): string {
  return (language?.englishToFunction(name) ?? name).toUpperCase();
}

/** The character that separates arguments in the active grammar (`,` or `;`). */
export function functionListSeparator(language = activeCalcLanguage()): string {
  return language?.listSeparator ?? ',';
}

/**
 * Localized one-line description: the loaded resource language's
 * `functionDescriptions.<NAME>` subtree (Italian strings ship with
 * `-designer-resources-it`) wins; the English catalog is the fallback.
 * Dots in function names (`STDEV.P`) become underscores in the resource keys,
 * because the resource tree addresses leaves by dotted paths.
 */
export function functionDescriptionLocalized(resources: unknown, name: string): string {
  const found = getPath(resources, `functionDescriptions.${name.replace(/\./g, '_')}`);
  return typeof found === 'string' && found !== '' ? found : functionDescription(name);
}

/** Categories of the Insert Function dialog, in the trial's order. */
export const functionCategories: string[] = [
  'Database', 'Date and Time', 'Engineering', 'Financial', 'Information', 'Logical',
  'Lookup and Reference', 'Math and Trigonometry', 'Statistical', 'Text', 'Web',
];

/** The dialog adds this category in front of the others while searching. */
export const recommendedCategory = 'Recommended';
/** The dialog's "everything" category. */
export const allCategory = 'All';

/**
 * TASK 87: display labels for the (data-bearing, English) category names through
 * the `ribbon.functionCategories` resource subtree, so a language package relabels
 * the Insert Function dialog and the Formulas tab galleries without touching keys.
 */
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  All: 'all', Recommended: 'recommended', Database: 'database', 'Date and Time': 'dateTime',
  Engineering: 'engineering', Financial: 'financial', Information: 'information', Logical: 'logical',
  'Lookup and Reference': 'lookupReference', 'Math and Trigonometry': 'mathTrig',
  Statistical: 'statistical', Text: 'text', Web: 'web',
};
export function functionCategoryDisplay(resources: unknown, category: string): string {
  const key = CATEGORY_LABEL_KEYS[category];
  if (!key) return category;
  const found = getPath(resources, `ribbon.functionCategories.${key}`);
  return typeof found === 'string' && found !== '' ? found : category;
}

/**
 * Functions the Formulas tab galleries leave out although the Insert Function
 * dialog lists them: the dynamic-array / LAMBDA family, which the trial keeps
 * out of the ribbon (verified against every gallery).
 */
export const ribbonHiddenFunctions: string[] = [
  'BYCOL', 'BYROW', 'CHOOSECOLS', 'CHOOSEROWS', 'DROP', 'EXPAND', 'FILTER', 'GROUPBY', 'HSTACK',
  'MAKEARRAY', 'MAP', 'PIVOTBY', 'RANDARRAY', 'REDUCE', 'SCAN', 'SEQUENCE', 'SORT', 'SORTBY',
  'TAKE', 'TEXTSPLIT', 'TOCOL', 'TOROW', 'UNIQUE', 'VSTACK', 'WRAPCOLS', 'WRAPROWS',
];

/** Gallery of a Formulas tab button: ribbon command name to dialog category. */
export const ribbonCategories: { command: string; category: string; label: string }[] = [
  { command: 'formulaFinancial', category: 'Financial', label: fc('financial') },
  { command: 'logicalFormula', category: 'Logical', label: fc('logical') },
  { command: 'formulaText', category: 'Text', label: fc('text') },
  { command: 'formulaDateTime', category: 'Date and Time', label: fc('dateTime') },
  { command: 'formulaLookupReference', category: 'Lookup and Reference', label: fc('lookupReference') },
  { command: 'formulaMathTrig', category: 'Math and Trigonometry', label: fc('mathTrig') },
];

/** Categories behind the Formulas tab's More Functions gallery. */
export const moreFunctionCategories: { command: string; category: string; label: string }[] = [
  { command: 'formulaStatistical', category: 'Statistical', label: fc('statistical') },
  { command: 'formulaEngineering', category: 'Engineering', label: fc('engineering') },
  { command: 'formulaInformation', category: 'Information', label: fc('information') },
  { command: 'formulaDatabase', category: 'Database', label: fc('database') },
  { command: 'formulaWeb', category: 'Web', label: fc('web') },
];

/** Every command that opens a function gallery, mapped to its dialog category. */
export const functionGalleryCategories: Record<string, string> = Object.fromEntries(
  [...ribbonCategories, ...moreFunctionCategories].map((entry) => [entry.command, entry.category]),
);

/** Function names per dialog category, in the trial's gallery order. */
export const categoryFunctions: Record<string, string[]> = {
  'Database': [
    'DAVERAGE', 'DCOUNT', 'DCOUNTA', 'DGET', 'DMAX', 'DMIN',
    'DPRODUCT', 'DSTDEV', 'DSTDEVP', 'DSUM', 'DVAR', 'DVARP',
  ],
  'Date and Time': [
    'DATE', 'DATEDIF', 'DATEVALUE', 'DATEPART', 'DAY', 'DAYS',
    'DAYS360', 'EDATE', 'EOMONTH', 'HOUR', 'ISOWEEKNUM', 'MINUTE',
    'MONTH', 'NETWORKDAYS', 'NETWORKDAYS.INTL', 'NOW', 'SECOND', 'TIME',
    'TIMEVALUE', 'TODAY', 'WEEKDAY', 'WEEKNUM', 'WORKDAY', 'WORKDAY.INTL',
    'YEAR', 'YEARFRAC',
  ],
  'Engineering': [
    'BESSELI', 'BESSELJ', 'BESSELK', 'BESSELY', 'BIN2DEC', 'BIN2HEX',
    'BIN2OCT', 'BITAND', 'BITLSHIFT', 'BITOR', 'BITRSHIFT', 'BITXOR',
    'COMPLEX', 'CONVERT', 'DEC2BIN', 'DEC2HEX', 'DEC2OCT', 'DELTA',
    'ERF', 'ERFC', 'ERF.PRECISE', 'ERFC.PRECISE', 'GESTEP', 'HEX2BIN',
    'HEX2DEC', 'HEX2OCT', 'IMABS', 'IMAGINARY', 'IMARGUMENT', 'IMCONJUGATE',
    'IMCOS', 'IMDIV', 'IMEXP', 'IMLN', 'IMLOG10', 'IMLOG2',
    'IMPOWER', 'IMPRODUCT', 'IMREAL', 'IMSIN', 'IMSQRT', 'IMSUB',
    'IMSUM', 'IMCOSH', 'IMCOT', 'IMCSC', 'IMCSCH', 'IMSEC',
    'IMSECH', 'IMSINH', 'IMTAN', 'OCT2BIN', 'OCT2DEC', 'OCT2HEX',
  ],
  'Financial': [
    'ACCRINT', 'ACCRINTM', 'AMORDEGRC', 'AMORLINC', 'COUPDAYBS', 'COUPDAYS',
    'COUPDAYSNC', 'COUPNCD', 'COUPNUM', 'COUPPCD', 'CUMIPMT', 'CUMPRINC',
    'DB', 'DDB', 'DISC', 'DOLLARDE', 'DOLLARFR', 'DURATION',
    'EFFECT', 'FV', 'FVSCHEDULE', 'INTRATE', 'IPMT', 'IRR',
    'ISPMT', 'MDURATION', 'MIRR', 'NOMINAL', 'NPER', 'NPV',
    'ODDFPRICE', 'ODDFYIELD', 'ODDLPRICE', 'ODDLYIELD', 'EURO', 'EUROCONVERT',
    'PMT', 'PPMT', 'PRICE', 'PRICEDISC', 'PRICEMAT', 'PV',
    'PDURATION', 'RRI', 'RATE', 'RECEIVED', 'SLN', 'SYD',
    'TBILLEQ', 'TBILLPRICE', 'TBILLYIELD', 'VDB', 'XIRR', 'XNPV',
    'YIELD', 'YIELDDISC', 'YIELDMAT',
  ],
  'Information': [
    'ERROR.TYPE', 'ISBLANK', 'ISERR', 'ISERROR', 'ISEVEN', 'ISLOGICAL',
    'ISFORMULA', 'ISNA', 'ISNONTEXT', 'ISNUMBER', 'ISODD', 'ISOMITTED',
    'ISREF', 'ISTEXT', 'N', 'NA', 'SHEET', 'SHEETS',
    'TYPE',
  ],
  'Logical': [
    'AND', 'BYCOL', 'BYROW', 'FALSE', 'IF', 'IFERROR',
    'IFNA', 'IFS', 'LAMBDA', 'MAKEARRAY', 'MAP', 'NOT',
    'OR', 'REDUCE', 'SCAN', 'SWITCH', 'TRUE', 'XOR',
  ],
  'Lookup and Reference': [
    'ADDRESS', 'AREAS', 'CHOOSE', 'CHOOSECOLS', 'CHOOSEROWS', 'COLUMN',
    'COLUMNS', 'DROP', 'EXPAND', 'FILTER', 'FORMULATEXT', 'GROUPBY',
    'HLOOKUP', 'HSTACK', 'HYPERLINK', 'INDEX', 'INDIRECT', 'LOOKUP',
    'MATCH', 'OFFSET', 'PIVOTBY', 'ROW', 'ROWS', 'SJS.TABLE',
    'SORT', 'SORTBY', 'TAKE', 'TOCOL', 'TOROW', 'TRANSPOSE',
    'TRIMRANGE', 'UNIQUE', 'VLOOKUP', 'VSTACK', 'WRAPCOLS', 'WRAPROWS',
    'XLOOKUP', 'XMATCH',
  ],
  'Math and Trigonometry': [
    'ABS', 'ACOS', 'ACOSH', 'ACOT', 'ACOTH', 'AGGREGATE',
    'ARABIC', 'ASIN', 'ASINH', 'ATAN', 'ATAN2', 'ATANH',
    'BASE', 'CEILING', 'CEILING.MATH', 'CEILING.PRECISE', 'COMBIN', 'COMBINA',
    'COS', 'COSH', 'COT', 'COTH', 'CSC', 'CSCH',
    'DECIMAL', 'DEGREES', 'EVEN', 'EXP', 'FACT', 'FACTDOUBLE',
    'FLOOR', 'FLOOR.MATH', 'FLOOR.PRECISE', 'GCD', 'INT', 'ISO.CEILING',
    'LCM', 'LN', 'LOG', 'LOG10', 'MDETERM', 'MINVERSE',
    'MMULT', 'MOD', 'MROUND', 'MULTINOMIAL', 'ODD', 'PI',
    'POWER', 'PRODUCT', 'QUOTIENT', 'RADIANS', 'RAND', 'RANDARRAY',
    'RANDBETWEEN', 'ROMAN', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'SEC',
    'SECH', 'SEQUENCE', 'SERIESSUM', 'SIGN', 'SIN', 'SINH',
    'SQRT', 'SQRTPI', 'SUBTOTAL', 'SUM', 'SUMIF', 'SUMIFS',
    'SUMPRODUCT', 'SUMSQ', 'SUMX2MY2', 'SUMX2PY2', 'SUMXMY2', 'TAN',
    'TANH', 'TRUNC',
  ],
  'Statistical': [
    'AVEDEV', 'AVERAGE', 'AVERAGEA', 'AVERAGEIF', 'AVERAGEIFS', 'BETADIST',
    'BETAINV', 'BETA.DIST', 'BETA.INV', 'BINOMDIST', 'BINOM.DIST', 'BINOM.DIST.RANGE',
    'BINOM.INV', 'CHIDIST', 'CHIINV', 'CHITEST', 'CHISQ.DIST', 'CHISQ.DIST.RT',
    'CHISQ.INV', 'CHISQ.INV.RT', 'CHISQ.TEST', 'CONFIDENCE', 'CONFIDENCE.NORM', 'CONFIDENCE.T',
    'CORREL', 'COUNT', 'COUNTA', 'COUNTBLANK', 'COUNTIF', 'COUNTIFS',
    'COVAR', 'COVARIANCE.P', 'COVARIANCE.S', 'CRITBINOM', 'DEVSQ', 'EXPONDIST',
    'EXPON.DIST', 'FDIST', 'FINV', 'FISHER', 'FISHERINV', 'FORECAST',
    'FREQUENCY', 'FTEST', 'F.DIST', 'F.DIST.RT', 'F.INV', 'F.INV.RT',
    'F.TEST', 'GAMMADIST', 'GAMMAINV', 'GAMMALN', 'GEOMEAN', 'GROWTH',
    'GAMMA', 'GAMMA.DIST', 'GAMMA.INV', 'GAMMALN.PRECISE', 'GAUSS', 'HARMEAN',
    'HYPGEOMDIST', 'HYPGEOM.DIST', 'INTERCEPT', 'KURT', 'LARGE', 'LINEST',
    'LOGEST', 'LOGINV', 'LOGNORMDIST', 'LOGNORM.DIST', 'LOGNORM.INV', 'MAX',
    'MAXA', 'MAXIFS', 'MEDIAN', 'MIN', 'MINA', 'MINIFS',
    'MODE', 'MODE.MULT', 'MODE.SNGL', 'NEGBINOMDIST', 'NEGBINOM.DIST', 'NORMDIST',
    'NORMINV', 'NORMSDIST', 'NORMSINV', 'NORM.DIST', 'NORM.INV', 'NORM.S.DIST',
    'NORM.S.INV', 'PEARSON', 'PERCENTILE', 'PERCENTRANK', 'PERMUT', 'PERCENTILE.EXC',
    'PERCENTILE.INC', 'PERCENTRANK.EXC', 'PERCENTRANK.INC', 'PERMUTATIONA', 'PHI', 'POISSON',
    'POISSON.DIST', 'PROB', 'QUARTILE', 'QUARTILE.EXC', 'QUARTILE.INC', 'RANK',
    'RANK.AVG', 'RANK.EQ', 'RSQ', 'SKEW', 'SKEW.P', 'SLOPE',
    'SMALL', 'STANDARDIZE', 'STDEV', 'STDEVA', 'STDEVP', 'STDEVPA',
    'STDEV.P', 'STDEV.S', 'STEYX', 'TDIST', 'TINV', 'TREND',
    'TRIMMEAN', 'TTEST', 'T.DIST', 'T.DIST.2T', 'T.DIST.RT', 'T.INV',
    'T.INV.2T', 'T.TEST', 'VAR', 'VARA', 'VARP', 'VARPA',
    'VAR.P', 'VAR.S', 'WEIBULL', 'WEIBULL.DIST', 'ZTEST', 'Z.TEST',
  ],
  'Text': [
    'ARRAYTOTEXT', 'ASC', 'BAHTTEXT', 'CHAR', 'CLEAN', 'CODE',
    'CONCAT', 'CONCATENATE', 'DBCS', 'DOLLAR', 'EXACT', 'FIND',
    'FIXED', 'LEFT', 'LEN', 'LET', 'LOWER', 'MID',
    'OBJECT', 'PERCENTOF', 'PROPER', 'PROPERTY', 'REGEXEXTRACT', 'REGEXREPLACE',
    'REGEXTEST', 'REPLACE', 'REPT', 'RIGHT', 'SEARCH', 'SEARCHB',
    'SJS.ENDWITH', 'SJS.STARTWITH', 'SJS.UUID', 'SUBSTITUTE', 'T', 'TEXT',
    'TEXTAFTER', 'TEXTBEFORE', 'TEXTJOIN', 'TEXTSPLIT', 'TRIM', 'UNICHAR',
    'UNICODE', 'UPPER', 'VALUE', 'VALUETOTEXT',
  ],
  'Web': [
    'ENCODEURL', 'FILTERJSON', 'FILTERXML', 'WEBSERVICE',
  ],
};

/** Every function the dialog lists under `All`. */
export const allFunctions: string[] = [
  'ABS', 'ACCRINT', 'ACCRINTM', 'ACOS', 'ACOSH', 'ACOT',
  'ACOTH', 'ADDRESS', 'AGGREGATE', 'AMORDEGRC', 'AMORLINC', 'AND',
  'ARABIC', 'AREAS', 'ARRAYTOTEXT', 'ASC', 'ASIN', 'ASINH',
  'ATAN', 'ATAN2', 'ATANH', 'AVEDEV', 'AVERAGE', 'AVERAGEA',
  'AVERAGEIF', 'AVERAGEIFS', 'BAHTTEXT', 'BASE', 'BESSELI', 'BESSELJ',
  'BESSELK', 'BESSELY', 'BETA.DIST', 'BETA.INV', 'BETADIST', 'BETAINV',
  'BIN2DEC', 'BIN2HEX', 'BIN2OCT', 'BINOM.DIST', 'BINOM.DIST.RANGE', 'BINOM.INV',
  'BINOMDIST', 'BITAND', 'BITLSHIFT', 'BITOR', 'BITRSHIFT', 'BITXOR',
  'BYCOL', 'BYROW', 'CEILING', 'CEILING.MATH', 'CEILING.PRECISE', 'CHAR',
  'CHIDIST', 'CHIINV', 'CHISQ.DIST', 'CHISQ.DIST.RT', 'CHISQ.INV', 'CHISQ.INV.RT',
  'CHISQ.TEST', 'CHITEST', 'CHOOSE', 'CHOOSECOLS', 'CHOOSEROWS', 'CLEAN',
  'CODE', 'COLUMN', 'COLUMNS', 'COMBIN', 'COMBINA', 'COMPLEX',
  'CONCAT', 'CONCATENATE', 'CONFIDENCE', 'CONFIDENCE.NORM', 'CONFIDENCE.T', 'CONVERT',
  'CORREL', 'COS', 'COSH', 'COT', 'COTH', 'COUNT',
  'COUNTA', 'COUNTBLANK', 'COUNTIF', 'COUNTIFS', 'COUPDAYBS', 'COUPDAYS',
  'COUPDAYSNC', 'COUPNCD', 'COUPNUM', 'COUPPCD', 'COVAR', 'COVARIANCE.P',
  'COVARIANCE.S', 'CRITBINOM', 'CSC', 'CSCH', 'CUMIPMT', 'CUMPRINC',
  'DATE', 'DATEDIF', 'DATEPART', 'DATEVALUE', 'DAVERAGE', 'DAY',
  'DAYS', 'DAYS360', 'DB', 'DBCS', 'DCOUNT', 'DCOUNTA',
  'DDB', 'DEC2BIN', 'DEC2HEX', 'DEC2OCT', 'DECIMAL', 'DEGREES',
  'DELTA', 'DEVSQ', 'DGET', 'DISC', 'DMAX', 'DMIN',
  'DOLLAR', 'DOLLARDE', 'DOLLARFR', 'DPRODUCT', 'DROP', 'DSTDEV',
  'DSTDEVP', 'DSUM', 'DURATION', 'DVAR', 'DVARP', 'EDATE',
  'EFFECT', 'ENCODEURL', 'EOMONTH', 'ERF', 'ERF.PRECISE', 'ERFC',
  'ERFC.PRECISE', 'ERROR.TYPE', 'EURO', 'EUROCONVERT', 'EVEN', 'EXACT',
  'EXP', 'EXPAND', 'EXPON.DIST', 'EXPONDIST', 'F.DIST', 'F.DIST.RT',
  'F.INV', 'F.INV.RT', 'F.TEST', 'FACT', 'FACTDOUBLE', 'FALSE',
  'FDIST', 'FILTER', 'FILTERJSON', 'FILTERXML', 'FIND', 'FINV',
  'FISHER', 'FISHERINV', 'FIXED', 'FLOOR', 'FLOOR.MATH', 'FLOOR.PRECISE',
  'FORECAST', 'FORMULATEXT', 'FREQUENCY', 'FTEST', 'FV', 'FVSCHEDULE',
  'GAMMA', 'GAMMA.DIST', 'GAMMA.INV', 'GAMMADIST', 'GAMMAINV', 'GAMMALN',
  'GAMMALN.PRECISE', 'GAUSS', 'GCD', 'GEOMEAN', 'GESTEP', 'GROUPBY',
  'GROWTH', 'HARMEAN', 'HEX2BIN', 'HEX2DEC', 'HEX2OCT', 'HLOOKUP',
  'HOUR', 'HSTACK', 'HYPERLINK', 'HYPGEOM.DIST', 'HYPGEOMDIST', 'IF',
  'IFERROR', 'IFNA', 'IFS', 'IMABS', 'IMAGINARY', 'IMARGUMENT',
  'IMCONJUGATE', 'IMCOS', 'IMCOSH', 'IMCOT', 'IMCSC', 'IMCSCH',
  'IMDIV', 'IMEXP', 'IMLN', 'IMLOG10', 'IMLOG2', 'IMPOWER',
  'IMPRODUCT', 'IMREAL', 'IMSEC', 'IMSECH', 'IMSIN', 'IMSINH',
  'IMSQRT', 'IMSUB', 'IMSUM', 'IMTAN', 'INDEX', 'INDIRECT',
  'INT', 'INTERCEPT', 'INTRATE', 'IPMT', 'IRR', 'ISBLANK',
  'ISERR', 'ISERROR', 'ISEVEN', 'ISFORMULA', 'ISLOGICAL', 'ISNA',
  'ISNONTEXT', 'ISNUMBER', 'ISO.CEILING', 'ISODD', 'ISOMITTED', 'ISOWEEKNUM',
  'ISPMT', 'ISREF', 'ISTEXT', 'KURT', 'LAMBDA', 'LARGE',
  'LCM', 'LEFT', 'LEN', 'LET', 'LINEST', 'LN',
  'LOG', 'LOG10', 'LOGEST', 'LOGINV', 'LOGNORM.DIST', 'LOGNORM.INV',
  'LOGNORMDIST', 'LOOKUP', 'LOWER', 'MAKEARRAY', 'MAP', 'MATCH',
  'MAX', 'MAXA', 'MAXIFS', 'MDETERM', 'MDURATION', 'MEDIAN',
  'MID', 'MIN', 'MINA', 'MINIFS', 'MINUTE', 'MINVERSE',
  'MIRR', 'MMULT', 'MOD', 'MODE', 'MODE.MULT', 'MODE.SNGL',
  'MONTH', 'MROUND', 'MULTINOMIAL', 'N', 'NA', 'NEGBINOM.DIST',
  'NEGBINOMDIST', 'NETWORKDAYS', 'NETWORKDAYS.INTL', 'NOMINAL', 'NORM.DIST', 'NORM.INV',
  'NORM.S.DIST', 'NORM.S.INV', 'NORMDIST', 'NORMINV', 'NORMSDIST', 'NORMSINV',
  'NOT', 'NOW', 'NPER', 'NPV', 'OBJECT', 'OCT2BIN',
  'OCT2DEC', 'OCT2HEX', 'ODD', 'ODDFPRICE', 'ODDFYIELD', 'ODDLPRICE',
  'ODDLYIELD', 'OFFSET', 'OR', 'PDURATION', 'PEARSON', 'PERCENTILE',
  'PERCENTILE.EXC', 'PERCENTILE.INC', 'PERCENTOF', 'PERCENTRANK', 'PERCENTRANK.EXC', 'PERCENTRANK.INC',
  'PERMUT', 'PERMUTATIONA', 'PHI', 'PI', 'PIVOTBY', 'PMT',
  'POISSON', 'POISSON.DIST', 'POWER', 'PPMT', 'PRICE', 'PRICEDISC',
  'PRICEMAT', 'PROB', 'PRODUCT', 'PROPER', 'PROPERTY', 'PV',
  'QUARTILE', 'QUARTILE.EXC', 'QUARTILE.INC', 'QUOTIENT', 'RADIANS', 'RAND',
  'RANDARRAY', 'RANDBETWEEN', 'RANK', 'RANK.AVG', 'RANK.EQ', 'RATE',
  'RECEIVED', 'REDUCE', 'REGEXEXTRACT', 'REGEXREPLACE', 'REGEXTEST', 'REPLACE',
  'REPT', 'RIGHT', 'ROMAN', 'ROUND', 'ROUNDDOWN', 'ROUNDUP',
  'ROW', 'ROWS', 'RRI', 'RSQ', 'SCAN', 'SEARCH',
  'SEARCHB', 'SEC', 'SECH', 'SECOND', 'SEQUENCE', 'SERIESSUM',
  'SHEET', 'SHEETS', 'SIGN', 'SIN', 'SINH', 'SJS.ENDWITH',
  'SJS.STARTWITH', 'SJS.TABLE', 'SJS.UUID', 'SKEW', 'SKEW.P', 'SLN',
  'SLOPE', 'SMALL', 'SORT', 'SORTBY', 'SQRT', 'SQRTPI',
  'STANDARDIZE', 'STDEV', 'STDEV.P', 'STDEV.S', 'STDEVA', 'STDEVP',
  'STDEVPA', 'STEYX', 'SUBSTITUTE', 'SUBTOTAL', 'SUM', 'SUMIF',
  'SUMIFS', 'SUMPRODUCT', 'SUMSQ', 'SUMX2MY2', 'SUMX2PY2', 'SUMXMY2',
  'SWITCH', 'SYD', 'T', 'T.DIST', 'T.DIST.2T', 'T.DIST.RT',
  'T.INV', 'T.INV.2T', 'T.TEST', 'TAKE', 'TAN', 'TANH',
  'TBILLEQ', 'TBILLPRICE', 'TBILLYIELD', 'TDIST', 'TEXT', 'TEXTAFTER',
  'TEXTBEFORE', 'TEXTJOIN', 'TEXTSPLIT', 'TIME', 'TIMEVALUE', 'TINV',
  'TOCOL', 'TODAY', 'TOROW', 'TRANSPOSE', 'TREND', 'TRIM',
  'TRIMMEAN', 'TRIMRANGE', 'TRUE', 'TRUNC', 'TTEST', 'TYPE',
  'UNICHAR', 'UNICODE', 'UNIQUE', 'UPPER', 'VALUE', 'VALUETOTEXT',
  'VAR', 'VAR.P', 'VAR.S', 'VARA', 'VARP', 'VARPA',
  'VDB', 'VLOOKUP', 'VSTACK', 'WEBSERVICE', 'WEEKDAY', 'WEEKNUM',
  'WEIBULL', 'WEIBULL.DIST', 'WORKDAY', 'WORKDAY.INTL', 'WRAPCOLS', 'WRAPROWS',
  'XIRR', 'XLOOKUP', 'XMATCH', 'XNPV', 'XOR', 'YEAR',
  'YEARFRAC', 'YIELD', 'YIELDDISC', 'YIELDMAT', 'Z.TEST', 'ZTEST',
];


/** Function names per Formulas tab gallery, in the order the trial lists them. */
export const ribbonCategoryFunctions: Record<string, string[]> = {
  'Financial': [
    'ACCRINT', 'ACCRINTM', 'AMORDEGRC', 'AMORLINC', 'COUPDAYBS', 'COUPDAYS',
    'COUPDAYSNC', 'COUPNCD', 'COUPNUM', 'COUPPCD', 'CUMIPMT', 'CUMPRINC',
    'DB', 'DDB', 'DISC', 'DOLLARDE', 'DOLLARFR', 'DURATION',
    'EFFECT', 'FV', 'FVSCHEDULE', 'INTRATE', 'IPMT', 'IRR',
    'ISPMT', 'MDURATION', 'MIRR', 'NOMINAL', 'NPER', 'NPV',
    'ODDFPRICE', 'ODDFYIELD', 'ODDLPRICE', 'ODDLYIELD', 'EURO', 'EUROCONVERT',
    'PMT', 'PPMT', 'PRICE', 'PRICEDISC', 'PRICEMAT', 'PV',
    'PDURATION', 'RRI', 'RATE', 'RECEIVED', 'SLN', 'SYD',
    'TBILLEQ', 'TBILLPRICE', 'TBILLYIELD', 'VDB', 'XIRR', 'XNPV',
    'YIELD', 'YIELDDISC', 'YIELDMAT',
  ],
  'Logical': [
    'AND', 'FALSE', 'IF', 'IFERROR', 'IFNA', 'IFS',
    'LAMBDA', 'NOT', 'OR', 'SWITCH', 'TRUE', 'XOR',
  ],
  'Text': [
    'ARRAYTOTEXT', 'ASC', 'BAHTTEXT', 'CHAR', 'CLEAN', 'CODE',
    'CONCAT', 'CONCATENATE', 'DBCS', 'DOLLAR', 'SJS.ENDWITH', 'EXACT',
    'FIND', 'FIXED', 'LEFT', 'LEN', 'LET', 'LOWER',
    'MID', 'OBJECT', 'PERCENTOF', 'PROPER', 'PROPERTY', 'REGEXEXTRACT',
    'REGEXREPLACE', 'REGEXTEST', 'REPLACE', 'REPT', 'RIGHT', 'SEARCH',
    'SEARCHB', 'SUBSTITUTE', 'SJS.STARTWITH', 'T', 'TEXT', 'TEXTAFTER',
    'TEXTBEFORE', 'TEXTJOIN', 'TRIM', 'UPPER', 'UNICHAR', 'UNICODE',
    'SJS.UUID', 'VALUE', 'VALUETOTEXT',
  ],
  'Date and Time': [
    'DATE', 'DATEDIF', 'DATEVALUE', 'DATEPART', 'DAY', 'DAYS',
    'DAYS360', 'EDATE', 'EOMONTH', 'HOUR', 'ISOWEEKNUM', 'MINUTE',
    'MONTH', 'NETWORKDAYS', 'NETWORKDAYS.INTL', 'NOW', 'SECOND', 'TIME',
    'TIMEVALUE', 'TODAY', 'WEEKDAY', 'WEEKNUM', 'WORKDAY', 'WORKDAY.INTL',
    'YEAR', 'YEARFRAC',
  ],
  'Lookup and Reference': [
    'ADDRESS', 'AREAS', 'CHOOSE', 'COLUMN', 'COLUMNS', 'FORMULATEXT',
    'HLOOKUP', 'HYPERLINK', 'INDEX', 'INDIRECT', 'LOOKUP', 'MATCH',
    'OFFSET', 'ROW', 'ROWS', 'SJS.TABLE', 'TRANSPOSE', 'TRIMRANGE',
    'VLOOKUP', 'XLOOKUP', 'XMATCH',
  ],
  'Math and Trigonometry': [
    'ABS', 'ACOS', 'ACOSH', 'ACOT', 'ACOTH', 'AGGREGATE',
    'ARABIC', 'ASIN', 'ASINH', 'ATAN', 'ATAN2', 'ATANH',
    'BASE', 'CEILING', 'CEILING.MATH', 'CEILING.PRECISE', 'COMBIN', 'COMBINA',
    'COS', 'COSH', 'COT', 'COTH', 'CSC', 'CSCH',
    'DECIMAL', 'DEGREES', 'EVEN', 'EXP', 'FACT', 'FACTDOUBLE',
    'FLOOR', 'FLOOR.MATH', 'FLOOR.PRECISE', 'GCD', 'INT', 'ISO.CEILING',
    'LCM', 'LN', 'LOG', 'LOG10', 'MDETERM', 'MINVERSE',
    'MMULT', 'MOD', 'MROUND', 'MULTINOMIAL', 'ODD', 'PI',
    'POWER', 'PRODUCT', 'QUOTIENT', 'RADIANS', 'RAND', 'RANDBETWEEN',
    'ROMAN', 'ROUND', 'ROUNDDOWN', 'ROUNDUP', 'SEC', 'SECH',
    'SERIESSUM', 'SIGN', 'SIN', 'SINH', 'SQRT', 'SQRTPI',
    'SUBTOTAL', 'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'SUMSQ',
    'SUMX2MY2', 'SUMX2PY2', 'SUMXMY2', 'TAN', 'TANH', 'TRUNC',
  ],
  'Statistical': [
    'AVEDEV', 'AVERAGE', 'AVERAGEA', 'AVERAGEIF', 'AVERAGEIFS', 'BETADIST',
    'BETAINV', 'BETA.DIST', 'BETA.INV', 'BINOMDIST', 'BINOM.DIST', 'BINOM.DIST.RANGE',
    'BINOM.INV', 'CHIDIST', 'CHIINV', 'CHITEST', 'CHISQ.DIST', 'CHISQ.DIST.RT',
    'CHISQ.INV', 'CHISQ.INV.RT', 'CHISQ.TEST', 'CONFIDENCE', 'CONFIDENCE.NORM', 'CONFIDENCE.T',
    'CORREL', 'COUNT', 'COUNTA', 'COUNTBLANK', 'COUNTIF', 'COUNTIFS',
    'COVAR', 'COVARIANCE.P', 'COVARIANCE.S', 'CRITBINOM', 'DEVSQ', 'EXPONDIST',
    'EXPON.DIST', 'FDIST', 'FINV', 'FISHER', 'FISHERINV', 'FORECAST',
    'FREQUENCY', 'FTEST', 'F.DIST', 'F.DIST.RT', 'F.INV', 'F.INV.RT',
    'F.TEST', 'GAMMADIST', 'GAMMAINV', 'GAMMALN', 'GEOMEAN', 'GROWTH',
    'GAMMA', 'GAMMA.DIST', 'GAMMA.INV', 'GAMMALN.PRECISE', 'GAUSS', 'HARMEAN',
    'HYPGEOMDIST', 'HYPGEOM.DIST', 'INTERCEPT', 'KURT', 'LARGE', 'LINEST',
    'LOGEST', 'LOGINV', 'LOGNORMDIST', 'LOGNORM.DIST', 'LOGNORM.INV', 'MAX',
    'MAXA', 'MAXIFS', 'MEDIAN', 'MIN', 'MINA', 'MINIFS',
    'MODE', 'MODE.MULT', 'MODE.SNGL', 'NEGBINOMDIST', 'NEGBINOM.DIST', 'NORMDIST',
    'NORMINV', 'NORMSDIST', 'NORMSINV', 'NORM.DIST', 'NORM.INV', 'NORM.S.DIST',
    'NORM.S.INV', 'PEARSON', 'PERCENTILE', 'PERCENTRANK', 'PERMUT', 'PERCENTILE.EXC',
    'PERCENTILE.INC', 'PERCENTRANK.EXC', 'PERCENTRANK.INC', 'PERMUTATIONA', 'PHI', 'POISSON',
    'POISSON.DIST', 'PROB', 'QUARTILE', 'QUARTILE.EXC', 'QUARTILE.INC', 'RANK',
    'RANK.AVG', 'RANK.EQ', 'RSQ', 'SKEW', 'SKEW.P', 'SLOPE',
    'SMALL', 'STANDARDIZE', 'STDEV', 'STDEVA', 'STDEVP', 'STDEVPA',
    'STDEV.P', 'STDEV.S', 'STEYX', 'TDIST', 'TINV', 'TREND',
    'TRIMMEAN', 'TTEST', 'T.DIST', 'T.DIST.2T', 'T.DIST.RT', 'T.INV',
    'T.INV.2T', 'T.TEST', 'VAR', 'VARA', 'VARP', 'VARPA',
    'VAR.P', 'VAR.S', 'WEIBULL', 'WEIBULL.DIST', 'ZTEST', 'Z.TEST',
  ],
  'Engineering': [
    'BESSELI', 'BESSELJ', 'BESSELK', 'BESSELY', 'BIN2DEC', 'BIN2HEX',
    'BIN2OCT', 'BITAND', 'BITLSHIFT', 'BITOR', 'BITRSHIFT', 'BITXOR',
    'COMPLEX', 'CONVERT', 'DEC2BIN', 'DEC2HEX', 'DEC2OCT', 'DELTA',
    'ERF', 'ERFC', 'ERF.PRECISE', 'ERFC.PRECISE', 'GESTEP', 'HEX2BIN',
    'HEX2DEC', 'HEX2OCT', 'IMABS', 'IMAGINARY', 'IMARGUMENT', 'IMCONJUGATE',
    'IMCOS', 'IMDIV', 'IMEXP', 'IMLN', 'IMLOG10', 'IMLOG2',
    'IMPOWER', 'IMPRODUCT', 'IMREAL', 'IMSIN', 'IMSQRT', 'IMSUB',
    'IMSUM', 'IMCOSH', 'IMCOT', 'IMCSC', 'IMCSCH', 'IMSEC',
    'IMSECH', 'IMSINH', 'IMTAN', 'OCT2BIN', 'OCT2DEC', 'OCT2HEX',
  ],
  'Information': [
    'ERROR.TYPE', 'ISBLANK', 'ISERR', 'ISERROR', 'ISEVEN', 'ISLOGICAL',
    'ISFORMULA', 'ISNA', 'ISNONTEXT', 'ISNUMBER', 'ISODD', 'ISOMITTED',
    'ISREF', 'ISTEXT', 'N', 'NA', 'SHEET', 'SHEETS',
    'TYPE',
  ],
  'Database': [
    'DAVERAGE', 'DCOUNT', 'DCOUNTA', 'DGET', 'DMAX', 'DMIN',
    'DPRODUCT', 'DSTDEV', 'DSTDEVP', 'DSUM', 'DVAR', 'DVARP',
  ],
  'Web': [
    'ENCODEURL', 'FILTERJSON', 'FILTERXML', 'WEBSERVICE',
  ],
};

/** Gallery entries for a category: what the Formulas tab lists for it. */
export function ribbonFunctions(category: string): string[] {
  return ribbonCategoryFunctions[category] ?? [];
}

/**
 * Names matching the search text, in the trial's `Recommended` order: functions
 * whose name starts with the text (alphabetically), then the ones merely
 * containing it, then the ones whose description mentions it.
 */
export function searchFunctions(search: string): string[] {
  const needle = String(search ?? '').trim().toLowerCase();
  if (!needle) return [...allFunctions];
  const language = activeCalcLanguage();
  const prefix: string[] = [];
  const inside: string[] = [];
  const described: string[] = [];
  for (const name of allFunctions) {
    const lower = name.toLowerCase();
    const localized = language ? (language.englishToFunction(name) ?? name).toLowerCase() : lower;
    if (lower.startsWith(needle) || localized.startsWith(needle)) prefix.push(name);
    else if (lower.includes(needle) || localized.includes(needle)) inside.push(name);
    else if ((functionCatalog[name]?.description ?? '').toLowerCase().includes(needle)) described.push(name);
  }
  return [...prefix, ...inside, ...described];
}

/**
 * Rows of the dialog's Function List for a category. Only the `Recommended`
 * gallery follows the search text: selecting one of the real categories shows
 * that whole category, even while the search box still holds a word (verified in
 * the trial's open dialog).
 */
export function categoryList(category: string, search = ''): string[] {
  if (category === recommendedCategory) return searchFunctions(search);
  if (category === allCategory) return [...allFunctions];
  return [...(categoryFunctions[category] ?? [])];
}

/** The dialog's category column: `Recommended` joins the list while searching. */
export function dialogCategories(search: string): string[] {
  return String(search ?? '').trim() ? [recommendedCategory, allCategory, ...functionCategories] : [allCategory, ...functionCategories];
}

/** Category a function belongs to; `All` when the library does not know it. */
export function categoryOf(name: string): string {
  for (const category of functionCategories) if (categoryFunctions[category]?.includes(name)) return category;
  return allCategory;
}

/** Argument names of a function; optional ones are bracketed. */
export function functionParameters(name: string): string[] {
  return functionCatalog[name]?.parameters ?? ['value'];
}

/**
 * Rows the Function Arguments dialog shows for a function: the trial draws one
 * row per argument, names without the optional-value brackets and without the
 * repeating-argument ellipsis row.
 */
export function functionArgumentRows(name: string): string[] {
  return functionParameters(name)
    .map((parameter) => parameter.replace(/^\[|\]$/g, '').trim())
    .filter((parameter) => parameter.length > 0 && parameter !== '...');
}

/** One-line description of a function, empty when unknown. */
export function functionDescription(name: string): string {
  return functionCatalog[name]?.description ?? '';
}

/**
 * Signature line, for example `ABS(number)` or `ASS(numero)`: optional markers are
 * dropped; the name and separators follow the active calc language package.
 */
export function functionSignature(name: string): string {
  const parameters = functionParameters(name)
    .map((parameter) => parameter.replace(/^\[|\]$/g, ''))
    .filter((parameter) => parameter && parameter !== '...');
  return `${functionDisplayName(name)}(${parameters.join(functionListSeparator())})`;
}

/**
 * Preview line of the Function Arguments dialog: only the filled arguments are
 * shown, without the `=` the trial puts in front of every field. The name and
 * the separator follow the active calc language package (TASK 89).
 */
export function formulaFromArguments(name: string, args: (string | undefined)[]): string {
  const values = args.map((value) => String(value ?? '').replace(/^=/, '').trim()).filter((value) => value.length > 0);
  return `${functionDisplayName(name)}(${values.join(functionListSeparator())})`;
}
