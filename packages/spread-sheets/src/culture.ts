import englishFormats from './en-us-formats.json';
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
  equalCharacters: string[] | undefined = undefined;
  fontScriptCode?: string;
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
  private cultureName = '';
  name(): string {
    return this.cultureName;
  }
  _setName(name: string): void {
    this.cultureName = name;
  }
}
export class CultureManager {
  private static current = 'en-us';
  private static cultures = new Map<string, CultureInfo>();
  private static languages = new Map<string, object>();
  static addCultureInfo(name: string, culture: CultureInfo, language: object = {}): void {
    name = name.toLowerCase();
    culture._setName(name);
    this.cultures.set(name, culture);
    this.languages.set(name, language);
  }
  static culture(name?: string, _force = false): string {
    if (name !== undefined) {
      const normalized = name.toLowerCase();
      if (!this.cultures.has(normalized)) throw new Error(`Unknown culture: ${name}`);
      this.current = normalized;
    }
    return this.current;
  }
  static getCultureInfo(name: string | number = this.current): CultureInfo {
    return ((typeof name === 'number'
      ? [...this.cultures.values()].find((c) => c.id === name)
      : this.cultures.get(name.toLowerCase())) ?? null)!;
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
CultureManager.addCultureInfo('en-us', english);
