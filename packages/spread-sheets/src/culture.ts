import englishFormats from './en-us-formats.json';
import japaneseFormats from './ja-jp-formats.json';
export interface NumberCulture {
  currencyDecimalSeparator?: string;
  currencyGroupSeparator?: string;
  currencySymbol?: string;
  numberDecimalSeparator?: string;
  numberGroupSeparator?: string;
  listSeparator?: string;
  arrayListSeparator?: string;
  arrayGroupSeparator?: string;
  [key: string]: unknown;
}
export interface DateCulture {
  abbreviatedDayNames?: string[];
  abbreviatedMonthGenitiveNames?: string[];
  abbreviatedMonthNames?: string[];
  amDesignator?: string;
  dayNames?: string[];
  fullDateTimePattern?: string;
  longDatePattern?: string;
  longTimePattern?: string;
  monthDayPattern?: string;
  monthGenitiveNames?: string[];
  monthNames?: string[];
  pmDesignator?: string;
  shortDatePattern?: string;
  shortTimePattern?: string;
  yearMonthPattern?: string;
  defaultDatePattern?: string;
  [key: string]: unknown;
}
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  '',
];
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export class CultureInfo {
  DateTimeFormat: DateCulture = {
    abbreviatedDayNames: days.map((d) => d.slice(0, 3)),
    abbreviatedMonthNames: months.map((m) => m.slice(0, 3)),
    abbreviatedMonthGenitiveNames: months.map((m) => m.slice(0, 3)),
    dayNames: [...days],
    monthNames: [...months],
    monthGenitiveNames: [...months],
    amDesignator: 'AM',
    pmDesignator: 'PM',
    shortDatePattern: 'MM/dd/yyyy',
    shortTimePattern: 'HH:mm',
    longDatePattern: 'dddd, dd MMMM yyyy',
    longTimePattern: 'HH:mm:ss',
    fullDateTimePattern: 'dddd, dd MMMM yyyy HH:mm:ss',
    monthDayPattern: 'MMMM dd',
    yearMonthPattern: 'yyyy MMMM',
    defaultDatePattern: 'MM/dd/yyyy H:mm:ss',
  };
  displayName = '';
  /**
   * Pairs of characters the culture treats as equivalent (`"pair<->base"`
   * spelling). The trial's core cultures store the field on every instance;
   * only ja-JP populates it with the ten documented Japanese pairs (probe
   * `culture:ctor-own`/`culture:names`), all other cultures keep it unset.
   */
  equalCharacters: string[] | undefined = undefined;
  /** Writing-system hint (e.g. `'Hans'`); unset in the trial's built-in cultures. */
  fontScriptCode?: string;
  /** Trial runtime fields of every core culture instance (probe `culture8`). */
  instanceType = 'CultureInfo';
  TimelineDateOrder: number[] = [2, 3, 1];
  TimelineDateSuffix: Record<string, string> = { year: '', quarter: '', month: '', date: '' };
  id = -1;
  LocalNumberFormat: Record<number, string> = {};
  NumberFormat: NumberCulture = {
    currencyDecimalSeparator: '.',
    currencyGroupSeparator: ',',
    currencySymbol: '¤',
    numberDecimalSeparator: '.',
    numberGroupSeparator: ',',
    listSeparator: ',',
    arrayListSeparator: ',',
    arrayGroupSeparator: ';',
    dbNumber: {},
  };
  paperKind = 1;
  predefinedFormats: Record<string, unknown> = {};
  TextFormat = { lineBreakingChar: [' ', '-'] };
  private cultureId = '';
  name(): string {
    return this.cultureId;
  }
  _setName(name: string): void {
    this.cultureId = name;
  }
}
export class CultureManager {
  /**
   * Names keep the casing they were registered or set with (trial probe
   * `culture:builtin-names`: the built-ins answer `'en-US'`/`'ja-JP'`, a user
   * registration answers exactly what `addCultureInfo`/`culture` was given);
   * lookups are case-insensitive.
   */
  private static current = 'en-us';
  private static cultures = new Map<string, CultureInfo>();
  private static languages = new Map<string, object>();
  static addCultureInfo(name: string, culture: CultureInfo, language: object = {}): void {
    this.cultures.set(name.toLowerCase(), culture);
    this.languages.set(name.toLowerCase(), language);
  }
  static culture(name?: string, _force = false): string {
    if (name !== undefined) {
      const key = name.toLowerCase();
      const culture = this.cultures.get(key);
      if (!culture) throw new Error(`Unknown culture: ${name}`);
      // A culture that never received a name (created by hand and registered
      // under the given spelling) reports the spelling it was set with.
      this.current = culture.name() || name;
    }
    return this.current;
  }
  static getCultureInfo(name: string | number = this.current): CultureInfo {
    return ((typeof name === 'number'
      ? [...this.cultures.values()].find((c) => c.id === name)
      : this.cultures.get(String(name).toLowerCase())) ?? null)!;
  }
  static getLanguage(name: string): object {
    return this.languages.get(name.toLowerCase()) ?? {};
  }
  static getResources(name = this.current): object {
    return this.getLanguage(name);
  }
}
const english = new CultureInfo();
english.id = 1033;
english.displayName = 'English (United States)';
english.predefinedFormats = englishFormats;
english.NumberFormat.currencySymbol = '$';
Object.assign(english.DateTimeFormat, {
  shortDatePattern: 'M/d/yyyy',
  defaultDatePattern: 'M/d/yyyy H:mm:ss',
  shortTimePattern: 'h:mm tt',
  longTimePattern: 'h:mm:ss tt',
  longDatePattern: 'dddd, MMMM dd, yyyy',
  fullDateTimePattern: 'dddd, MMMM dd, yyyy h:mm:ss tt',
  yearMonthPattern: 'MMMM, yyyy',
});
english.instanceType = 'ENCulture'; // trial probe `culture8`: the core en-US culture reports this runtime tag
english._setName('en-US');
CultureManager.addCultureInfo('en-us', english);
// The trial core also ships ja-JP (probe `culture2/culture7`: `getCultureInfo`
// answers a culture with the ten `equalCharacters` pairs, kanji month/day
// names and the Japanese number symbols); its data fields were transcribed
// through the public API.
const japanese = new CultureInfo();
Object.assign(japanese, {
  id: japaneseFormats.id,
  displayName: japaneseFormats.displayName,
  paperKind: japaneseFormats.paperKind,
  equalCharacters: japaneseFormats.equalCharacters,
  TimelineDateOrder: japaneseFormats.TimelineDateOrder,
  TimelineDateSuffix: japaneseFormats.TimelineDateSuffix,
});
Object.assign(japanese.DateTimeFormat, japaneseFormats.DateTimeFormat);
Object.assign(japanese.NumberFormat, japaneseFormats.NumberFormat);
Object.assign(japanese.TextFormat, japaneseFormats.TextFormat);
Object.assign(japanese.LocalNumberFormat, japaneseFormats.LocalNumberFormat);
japanese.predefinedFormats = japaneseFormats.predefinedFormats;
japanese.instanceType = japaneseFormats.instanceType;
japanese.TimelineDateOrder = japaneseFormats.TimelineDateOrder;
japanese.TimelineDateSuffix = japaneseFormats.TimelineDateSuffix;
japanese._setName('ja-JP');
CultureManager.addCultureInfo('ja-jp', japanese);
