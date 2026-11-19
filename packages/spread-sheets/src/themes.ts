/*
 * Workbook themes: `Theme`, `ColorScheme`, `ThemeFont` and the built-in
 * `Themes` / `ThemeColors` / `ThemeFonts` tables, plus the helpers that turn a
 * theme value into fonts or a colour palette. Contract: the public d.ts of
 * @mescius/spread-sheets 19.2.5 together with the trial's public runtime
 * surface (`sheet.currentTheme()`, `ThemeColors.Office.toJSON()`, …) — no
 * vendor source was inspected.
 *
 * Colours inside a serialised theme use the `{a,r,g,b}` channel record the
 * trial writes; `getColor` resolves display names such as `'Accent 1 80'`
 * (theme colour plus a percentage tint) to a hex string.
 */

export type ColorSchemeKey =
  | 'background1' | 'background2' | 'text1' | 'text2'
  | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6'
  | 'hyperlink' | 'followedHyperlink';

/** JSON colour record: alpha plus red/green/blue channels (0..255). */
export interface ColorRGBA {
  a: number;
  r: number;
  g: number;
  b: number;
}

/** Serialised theme value as it appears in `sheet.toJSON().theme`. */
export type ThemeValue = string | Record<string, unknown>;

const COLOR_KEYS: ColorSchemeKey[] = [
  'background1', 'background2', 'text1', 'text2',
  'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
  'hyperlink', 'followedHyperlink',
];

/** Display name of every theme colour, as `getColor` and the pickers use it. */
export const THEME_COLOR_NAMES: Record<ColorSchemeKey, string> = {
  background1: 'Background 1', background2: 'Background 2', text1: 'Text 1', text2: 'Text 2',
  accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4',
  accent5: 'Accent 5', accent6: 'Accent 6', hyperlink: 'Hyperlink', followedHyperlink: 'Followed Hyperlink',
};

function parseHex(input: string): ColorRGBA {
  const text = String(input ?? '').trim();
  const hex = text.replace('#', '');
  const short = hex.length === 3 || hex.length === 4 ? [...hex.slice(0, 3)].map((c) => c + c).join('') : hex.slice(0, 6);
  const value = Number.parseInt(short || '0', 16);
  if (!Number.isFinite(value)) return { a: 255, r: 0, g: 0, b: 0 };
  return { a: 255, r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** `#RRGGBB` (upper case) for a channel record. */
export function rgbToHex(color: ColorRGBA): string {
  const clamp = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${clamp(color.r)}${clamp(color.g)}${clamp(color.b)}`.toUpperCase();
}

function toColor(value: string | ColorRGBA): ColorRGBA {
  if (typeof value === 'string') return parseHex(value);
  return { a: Number(value.a ?? 255), r: Number(value.r ?? 0), g: Number(value.g ?? 0), b: Number(value.b ?? 0) };
}

/**
 * Excel tint semantics: a positive percentage blends towards white, a negative
 * one towards black. Used for display names such as `'Accent 1 80'`.
 */
export function tintColor(color: ColorRGBA, percent: number): ColorRGBA {
  const tint = Math.max(-1, Math.min(1, Number(percent) / 100 || 0));
  const target = tint < 0 ? 0 : 255;
  const factor = Math.abs(tint);
  return {
    a: color.a,
    r: Math.round(color.r + (target - color.r) * factor),
    g: Math.round(color.g + (target - color.g) * factor),
    b: Math.round(color.b + (target - color.b) * factor),
  };
}

/** `'Accent 1 80'` -> `['accent1', 80]`; `null` for anything else. */
function splitThemeName(name: string): [ColorSchemeKey, number] | null {
  const match = /^(background\s+[12]|text\s+[12]|accent\s+[1-6]|followed\s+hyperlink|hyperlink)(?:\s+(-?\d+(?:\.\d+)?))?$/i.exec(String(name ?? '').trim());
  if (!match) return null;
  const flat = match[1].toLowerCase().replace(/\s+/g, '');
  const key = COLOR_KEYS.find((candidate) => candidate.toLowerCase() === flat);
  return key ? [key, Number(match[2] ?? 0)] : null;
}

/**
 * Named set of the twelve workbook theme colours. Constructor arguments follow
 * the public d.ts order; the colour accessors get the colour as `{a,r,g,b}` or
 * set it, `getColor(name)` resolves a display name to a hex string.
 */
export class ColorScheme {
  private _name: string;
  private _colors: Record<ColorSchemeKey, ColorRGBA>;
  constructor(
    name: string,
    background1?: string,
    background2?: string,
    text1?: string,
    text2?: string,
    accent1?: string,
    accent2?: string,
    accent3?: string,
    accent4?: string,
    accent5?: string,
    accent6?: string,
    link?: string,
    followedLink?: string,
  ) {
    this._name = String(name ?? '');
    const given = [background1, background2, text1, text2, accent1, accent2, accent3, accent4, accent5, accent6, link, followedLink];
    this._colors = {} as Record<ColorSchemeKey, ColorRGBA>;
    COLOR_KEYS.forEach((key, index) => {
      this._colors[key] = parseHex(given[index] ?? '#000000');
    });
  }
  name(value?: string): string | this {
    if (value === undefined) return this._name;
    this._name = String(value);
    return this;
  }
  /**
   * Resolves a theme colour reference: a bare key (`'accent1'`) or a hex colour
   * is returned as-is, a display name (`'Accent 1'`, `'Accent 1 80'`) becomes a
   * lower-case hex colour, matching the trial.
   */
  getColor(name: string): string {
    const text = String(name ?? '').trim();
    const parsed = splitThemeName(text);
    if (parsed) return rgbToHex(tintColor(this._colors[parsed[0]], parsed[1])).toLowerCase();
    const key = COLOR_KEYS.find((candidate) => candidate.toLowerCase() === text.toLowerCase());
    if (key) return text;
    return rgbToHex(parseHex(text)).toLowerCase();
  }
  /** @internal Channel record copy for a key. */
  _color(key: ColorSchemeKey): ColorRGBA {
    return { ...this._colors[key] };
  }
  /** @internal `#RRGGBB` for a key. */
  css(key: ColorSchemeKey): string {
    return rgbToHex(this._colors[key]);
  }
  private _accessor(key: ColorSchemeKey, value?: string | ColorRGBA): ColorRGBA | this {
    if (value === undefined) return this._color(key);
    this._colors[key] = toColor(value);
    return this;
  }
  background1(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('background1', value); }
  background2(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('background2', value); }
  textColor1(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('text1', value); }
  textColor2(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('text2', value); }
  accent1(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('accent1', value); }
  accent2(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('accent2', value); }
  accent3(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('accent3', value); }
  accent4(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('accent4', value); }
  accent5(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('accent5', value); }
  accent6(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('accent6', value); }
  hyperlink(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('hyperlink', value); }
  followedHyperlink(value?: string | ColorRGBA): ColorRGBA | this { return this._accessor('followedHyperlink', value); }
  /** The trial serialises the scheme name followed by the twelve colours. */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = { name: this._name };
    for (const key of COLOR_KEYS) result[key] = this._color(key);
    return result;
  }
  /** Reads a serialised scheme (`{a,r,g,b}` records or hex strings). */
  fromJSON(json: Record<string, unknown> | undefined): this {
    if (!json) return this;
    if (json.name !== undefined) this._name = String(json.name);
    for (const key of COLOR_KEYS) {
      const value = json[key];
      if (typeof value === 'string') this._colors[key] = parseHex(value);
      else if (value && typeof value === 'object') this._colors[key] = toColor(value as ColorRGBA);
    }
    return this;
  }
  /** Builds a scheme from a serialised record. */
  static fromJSON(json: Record<string, unknown> | undefined): ColorScheme {
    return new ColorScheme(String(json?.name ?? '')).fromJSON(json);
  }
  clone(): ColorScheme {
    return new ColorScheme(this._name).fromJSON(this.toJSON());
  }
}

// Parses the compact script fallback tables kept in `FONT_DATA` below.
function parseFontScripts(spec: string): ScriptTypeface[] {
  return spec.split('|').filter(Boolean).map((entry) => {
    const at = entry.indexOf('=');
    return { script: entry.slice(0, at), typeface: entry.slice(at + 1) };
  });
}

/** Per-script fallback typeface inside a serialised theme font. */
export interface ScriptTypeface {
  script: string;
  typeface: string;
}

/**
 * Heading/body font pair of a workbook theme. Only the built-in schemes carry
 * the script fallback tables — a hand-made font serialises without them, which
 * is what the trial does for custom themes.
 */
export class ThemeFont {
  private _name: string;
  private _heading: string;
  private _body: string;
  private _headingEastAsian: string;
  private _bodyEastAsian: string;
  private _headingScripts: ScriptTypeface[];
  private _bodyScripts: ScriptTypeface[];
  /** True for built-in schemes and anything deserialised from their records. */
  private _carriesTables = false;
  /** True for the built-in gallery entries (`ThemeFonts.Office` and friends). */
  private _gallery = false;
  constructor(name: string, headingFont: string, bodyFont: string, headingEastAsianFont?: string, bodyEastAsianFont?: string) {
    this._name = String(name ?? '');
    this._heading = String(headingFont ?? '');
    this._body = String(bodyFont ?? '');
    this._headingEastAsian = String(headingEastAsianFont ?? '');
    this._bodyEastAsian = String(bodyEastAsianFont ?? '');
    const builtin = FONT_SCRIPTS[this._name];
    if (builtin) {
      this._headingScripts = builtin.heading.map((entry) => ({ ...entry }));
      this._bodyScripts = builtin.body.map((entry) => ({ ...entry }));
      this._carriesTables = true;
    } else {
      this._headingScripts = [];
      this._bodyScripts = [];
    }
  }
  /** @internal Typed readers for the renderer and the designer. */
  _nameValue(): string { return this._name; }
  /** @internal */ _getHeading(): string { return this._heading; }
  /** @internal */ _getBody(): string { return this._body; }
  name(value?: string): string | this {
    if (value === undefined) return this._name;
    this._name = String(value);
    return this;
  }
  headingFont(value?: string): string | this {
    if (value === undefined) return this._heading;
    this._heading = String(value);
    return this;
  }
  bodyFont(value?: string): string | this {
    if (value === undefined) return this._body;
    this._body = String(value);
    return this;
  }
  headingEastAsianFont(value?: string): string | this {
    if (value === undefined) return this._headingEastAsian;
    this._headingEastAsian = String(value);
    return this;
  }
  bodyEastAsianFont(value?: string): string | this {
    if (value === undefined) return this._bodyEastAsian;
    this._bodyEastAsian = String(value);
    return this;
  }
  /** Gets/sets the heading fallback of one script (`'Jpan'`, `'Arab'`, …). */
  headingFontScriptTypeface(script: string, typeface?: string): string | this {
    const found = this._headingScripts.find((entry) => entry.script === script);
    if (typeface === undefined) return found ? found.typeface : '';
    if (found) found.typeface = String(typeface);
    else this._headingScripts.push({ script: String(script), typeface: String(typeface) });
    return this;
  }
  /** Gets/sets the body fallback of one script. */
  bodyFontScriptTypeface(script: string, typeface?: string): string | this {
    const found = this._bodyScripts.find((entry) => entry.script === script);
    if (typeface === undefined) return found ? found.typeface : '';
    if (found) found.typeface = String(typeface);
    else this._bodyScripts.push({ script: String(script), typeface: String(typeface) });
    return this;
  }
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (this._name) result.name = this._name;
    result.headingFont = this._heading;
    result.bodyFont = this._body;
    if (this._carriesTables) {
      // The reference serialises built-in font schemes (and their clones) with
      // both East-Asian fallback keys — null when unset — and both tables.
      result.bodyEastAsianFont = this._bodyEastAsian || null;
      result.headingEastAsianFont = this._headingEastAsian || null;
      result.headingFontScriptTypefaces = this._headingScripts.map((entry) => ({ ...entry }));
      result.bodyFontScriptTypefaces = this._bodyScripts.map((entry) => ({ ...entry }));
    } else {
      if (this._headingEastAsian) result.headingEastAsianFont = this._headingEastAsian;
      if (this._bodyEastAsian) result.bodyEastAsianFont = this._bodyEastAsian;
      if (this._headingScripts.length) result.headingFontScriptTypefaces = this._headingScripts.map((entry) => ({ ...entry }));
      if (this._bodyScripts.length) result.bodyFontScriptTypefaces = this._bodyScripts.map((entry) => ({ ...entry }));
    }
    return result;
  }
  fromJSON(json: Record<string, unknown> | undefined): this {
    if (!json) return this;
    if (json.name !== undefined) this._name = String(json.name);
    if (json.headingFont !== undefined) this._heading = String(json.headingFont);
    if (json.bodyFont !== undefined) this._body = String(json.bodyFont);
    if (json.headingEastAsianFont !== undefined) this._headingEastAsian = json.headingEastAsianFont === null ? '' : String(json.headingEastAsianFont);
    if (json.bodyEastAsianFont !== undefined) this._bodyEastAsian = json.bodyEastAsianFont === null ? '' : String(json.bodyEastAsianFont);
    if (Array.isArray(json.headingFontScriptTypefaces)) this._headingScripts = (json.headingFontScriptTypefaces as ScriptTypeface[]).map((entry) => ({ ...entry }));
    if (Array.isArray(json.bodyFontScriptTypefaces)) this._bodyScripts = (json.bodyFontScriptTypefaces as ScriptTypeface[]).map((entry) => ({ ...entry }));
    if (Array.isArray(json.headingFontScriptTypefaces) || Array.isArray(json.bodyFontScriptTypefaces)
      || json.headingEastAsianFont === null || json.bodyEastAsianFont === null) this._carriesTables = true;
    return this;
  }
  /** Builds a font pair from a serialised record. */
  static fromJSON(json: Record<string, unknown> | undefined): ThemeFont {
    return new ThemeFont(String(json?.name ?? ''), String(json?.headingFont ?? ''), String(json?.bodyFont ?? '')).fromJSON(json);
  }
  clone(): ThemeFont {
    return new ThemeFont(this._name, this._heading, this._body, this._headingEastAsian, this._bodyEastAsian)
      .fromJSON(this.toJSON());
  }
}

/** A workbook theme: name + colour scheme + heading/body font pair. */
export class Theme {
  private _name: string;
  private _colors: ColorScheme;
  private _font: ThemeFont;
  /** Built-in themes serialise as their name; custom ones as a full record. */
  private _builtIn = false;
  constructor(name: string, colorScheme?: ColorScheme, headingFont?: string, bodyFont?: string) {
    this._name = String(name ?? '');
    this._colors = colorScheme ?? new ColorScheme(name);
    this._font = new ThemeFont('', String(headingFont ?? ''), String(bodyFont ?? ''));
  }
  /** @internal Mark as one of the built-in themes (serialises by name). */
  _asBuiltIn(): this {
    this._builtIn = true;
    return this;
  }
  /** @internal Typed readers used by the renderer and the designer. */
  _colorsValue(): ColorScheme { return this._colors; }
  /** @internal */ _fontValue(): ThemeFont { return this._font; }
  /** @internal */ _headingFont(): string { return this._font._getHeading(); }
  /** @internal */ _bodyFont(): string { return this._font._getBody(); }
  name(value?: string): string | this {
    if (value === undefined) return this._name;
    this._name = String(value);
    return this;
  }
  colors(value?: ColorScheme): ColorScheme | this {
    if (value === undefined) return this._colors;
    this._colors = value;
    return this;
  }
  font(value?: ThemeFont): ThemeFont | this {
    if (value === undefined) return this._font;
    this._font = value;
    return this;
  }
  headingFont(value?: string): string | this {
    if (value === undefined) return this._font._getHeading();
    this._font.headingFont(String(value));
    return this;
  }
  /** Alias of `headingFont` in the public surface. */
  headerFont(value?: string): string | this {
    if (value === undefined) return this._font._getHeading();
    this._font.headingFont(String(value));
    return this;
  }
  bodyFont(value?: string): string | this {
    if (value === undefined) return this._font._getBody();
    this._font.bodyFont(String(value));
    return this;
  }
  /** Resolves a theme colour reference through the colour scheme. */
  getColor(name: string): string {
    return this._colors.getColor(name);
  }
  /** `'Heading'`/`'Body'` resolve to the theme font, anything else passes through. */
  getFont(name?: string): string {
    if (name === undefined) return this._font._nameValue();
    const key = String(name).toLowerCase();
    if (key === 'heading') return this._font._getHeading();
    if (key === 'body') return this._font._getBody();
    return String(name);
  }
  /** Built-in themes serialise to their name, custom themes to a record. */
  toJSON(): string | Record<string, unknown> {
    if (this._builtIn) return this._name;
    return {
      name: this._name,
      themeColor: this._colors.toJSON(),
      headingFont: this._font._getHeading(),
      bodyFont: this._font._getBody(),
      font: this._font.toJSON(),
    };
  }
  /** Reads a serialised theme (a built-in name or a custom record). */
  fromJSON(value: ThemeValue | undefined | null): this {
    if (!value) return this;
    if (typeof value === 'string') {
      const builtin = Themes[value];
      if (builtin) {
        this._name = builtin._nameValue();
        this._colors = builtin._colorsValue();
        this._font = builtin._fontValue();
      } else this._name = value;
      return this;
    }
    if (value.name !== undefined) this._name = String(value.name);
    if (value.themeColor && typeof value.themeColor === 'object') this._colors = ColorScheme.fromJSON(value.themeColor as Record<string, unknown>);
    const font = value.font && typeof value.font === 'object' ? (value.font as Record<string, unknown>) : undefined;
    if (font) this._font = ThemeFont.fromJSON(font);
    else if (value.headingFont !== undefined || value.bodyFont !== undefined) {
      this._font = new ThemeFont('', String(value.headingFont ?? ''), String(value.bodyFont ?? ''));
    }
    return this;
  }
  /** Builds a theme from a serialised theme value. */
  static fromJSON(value: ThemeValue | undefined | null): Theme {
    return new Theme('').fromJSON(value);
  }
  clone(): Theme {
    const copy = new Theme(this._name, this._colors.clone(), this._font._getHeading(), this._font._getBody());
    copy.font(this._font.clone());
    return copy;
  }
  /** @internal */ _nameValue(): string { return this._name; }
}

/* --------------------------------------------------------- built-in data */

// [background1, background2, text1, text2, accent1..6, hyperlink, followedHyperlink]
// Read from the trial through `ThemeColors.X.toJSON()` (public API).
const COLOR_DATA: Record<string, [string, string, string, string, string, string, string, string, string, string, string, string]> = {
  Default: ['#FFFFFF', '#EEECE1', '#000000', '#1F497D', '#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646', '#0000FF', '#800080'],
  Office: ['#FFFFFF', '#E7E6E6', '#000000', '#44546A', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47', '#0563C1', '#954F72'],
  Office2007: ['#FFFFFF', '#EEECE1', '#000000', '#1F497D', '#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646', '#0000FF', '#800080'],
  Apex: ['#FFFFFF', '#C9C2D1', '#000000', '#69676D', '#CEB966', '#9CB084', '#6BB1C9', '#6585CF', '#7E6BC9', '#A379BB', '#410082', '#932968'],
  Aspect: ['#FFFFFF', '#E3DED1', '#000000', '#323232', '#F07F09', '#9F2936', '#1B587C', '#4E8542', '#604878', '#C19859', '#6B9F25', '#B26B02'],
  Concourse: ['#FFFFFF', '#DEF5FA', '#000000', '#464646', '#2DA2BF', '#DA1F28', '#EB641B', '#39639D', '#474B78', '#7D3C4A', '#FF8119', '#44B9E8'],
  Civic: ['#FFFFFF', '#C5D1D7', '#000000', '#646B86', '#D16349', '#CCB400', '#8CADAE', '#8C7B70', '#8FB08C', '#D19049', '#00A3D6', '#694F07'],
  Oriel: ['#FFFFFF', '#FFF39D', '#000000', '#575F6D', '#FE8637', '#7598D9', '#B32C16', '#F5CD2D', '#AEBAD5', '#777C84', '#D2611C', '#3B435B'],
  Origin: ['#FFFFFF', '#DDE9EC', '#000000', '#464653', '#727CA3', '#9FB8CD', '#D2DA7A', '#FADA7A', '#B88472', '#8E736A', '#B292CA', '#6B5680'],
  Paper: ['#FFFFFF', '#FEFAC9', '#000000', '#444D26', '#A5B592', '#F3A447', '#E7BC29', '#D092A7', '#9C85C0', '#809EC2', '#8E58B6', '#7F6F6F'],
  Solstice: ['#FFFFFF', '#E7DEC9', '#000000', '#4F271C', '#3891A7', '#FEB80A', '#C32D2E', '#84AA33', '#964305', '#475A8D', '#8DC765', '#AA8A14'],
  Technic: ['#FFFFFF', '#D4D2D0', '#000000', '#3B3B3B', '#6EA0B0', '#CCAF0A', '#8D89A4', '#748560', '#9E9273', '#7E848D', '#00C8C3', '#A116E0'],
  Trek: ['#FFFFFF', '#FBEEC9', '#000000', '#4E3B30', '#F0A22E', '#A5644E', '#B58B80', '#C3986D', '#A19574', '#C17529', '#AD1F1F', '#FFC42F'],
  Urban: ['#FFFFFF', '#DEDEDE', '#000000', '#424456', '#53548A', '#438086', '#A04DA3', '#C4652D', '#8B5D3D', '#5C92B5', '#67AFBD', '#C2A874'],
  Verve: ['#FFFFFF', '#D2D2D2', '#000000', '#666666', '#FF388C', '#E40059', '#9C007F', '#68007F', '#005BD3', '#00349E', '#17BBFD', '#FF79C2'],
  Equity: ['#FFFFFF', '#E9E5DC', '#000000', '#696464', '#D34817', '#9B2D1F', '#A28E6A', '#956251', '#918485', '#855D5D', '#CC9900', '#96A9A9'],
  Flow: ['#FFFFFF', '#DBF5F9', '#000000', '#04617B', '#0F6FC6', '#009DD9', '#0BD0D9', '#10CF9B', '#7CCA62', '#A5C249', '#E2D700', '#85DFD0'],
  Foundry: ['#FFFFFF', '#EAEBDE', '#000000', '#676A55', '#72A376', '#B0CCB0', '#A8CDD7', '#C0BEAF', '#CEC597', '#E8B7B7', '#DB5353', '#903638'],
  Median: ['#FFFFFF', '#EBDDC3', '#000000', '#775F55', '#94B6D2', '#DD8047', '#A5AB81', '#D8B25C', '#7BA79D', '#968C8C', '#F7B615', '#704404'],
  Metro: ['#FFFFFF', '#D6ECFF', '#000000', '#4E5B6F', '#7FD13B', '#EA157A', '#FEB80A', '#00ADDC', '#738AC8', '#1AB39F', '#EB8803', '#5F7791'],
  Module: ['#FFFFFF', '#D4D4D6', '#000000', '#5A6378', '#F0AD00', '#60B5CC', '#E66C7D', '#6BB76D', '#E88651', '#C64847', '#168BBA', '#680000'],
  Opulent: ['#FFFFFF', '#F4E7ED', '#000000', '#B13F9A', '#B83D68', '#AC66BB', '#DE6C36', '#F9B639', '#CF6DA4', '#FA8D3D', '#FFDE66', '#D490C5'],
};

// [headingFont, bodyFont, heading script fallbacks, body script fallbacks], read
// from the trial through `ThemeFonts.X.toJSON()` (black-box observation). The two
// table strings are '|'-separated 'script=typeface' entries in the reference order.
const FONT_DATA: Record<string, [string, string, string, string]> = {
  Office: ["Calibri Light", "Calibri", 'Jpan=游ゴシック Light|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Times New Roman|Hebr=Times New Roman|Thai=Tahoma|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur|Geor=Sylfaen', 'Jpan=游ゴシック|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Arial|Hebr=Arial|Thai=Tahoma|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur|Geor=Sylfaen'],
  Office2007: ["Cambria", "Calibri", 'Jpan=ＭＳ Ｐゴシック|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Times New Roman|Hebr=Times New Roman|Thai=Tahoma|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur', 'Jpan=ＭＳ Ｐゴシック|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Arial|Hebr=Arial|Thai=Tahoma|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur'],
  LucidaBook: ["Lucida Sans", "Book Antiqua", 'Grek=Arial|Cyrl=Arial|Jpan=HG丸ｺﾞｼｯｸM-PRO|Hang=휴먼옛체|Hans=黑体|Hant=微軟正黑體|Arab=Tahoma|Hebr=Levenim MT|Thai=FreesiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Grek=Times New Roman|Cyrl=Times New Roman|Jpan=HG明朝B|Hang=돋움|Hans=宋体|Hant=新細明體|Arab=Times New Roman|Hebr=David|Thai=EucrosiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  Verdana: ["Verdana", "Verdana", 'Jpan=ＭＳ ゴシック|Hang=굴림|Hans=微软雅黑|Hant=微軟正黑體|Arab=Tahoma|Hebr=Tahoma|Thai=FreesiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Verdana|Uigh=Microsoft Uighur', 'Jpan=ＭＳ ゴシック|Hang=굴림|Hans=微软雅黑|Hant=微軟正黑體|Arab=Tahoma|Hebr=Tahoma|Thai=FreesiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Verdana|Uigh=Microsoft Uighur'],
  LucidaSansUnicode: ["Lucida Sans Unicode", "Lucida Sans Unicode", 'Jpan=ＭＳ Ｐゴシック|Hang=맑은 고딕|Hans=黑体|Hant=微軟正黑體|Arab=Arial|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Uigh=Microsoft Uighur', 'Jpan=ＭＳ Ｐゴシック|Hang=맑은 고딕|Hans=黑体|Hant=微軟正黑體|Arab=Arial|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Uigh=Microsoft Uighur'],
  Georgia: ["Georgia", "Georgia", 'Jpan=ＭＳ Ｐゴシック|Hang=돋움|Hans=方正舒体|Hant=微軟正黑體|Arab=Arial|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur', 'Jpan=ＭＳ Ｐ明朝|Hang=바탕|Hans=方正舒体|Hant=新細明體|Arab=Times New Roman|Hebr=Times New Roman|Thai=Angsana New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  CenturySchoolbook: ["Century Schoolbook", "Century Schoolbook", 'Jpan=ＭＳ Ｐ明朝|Hang=휴먼매직체|Hans=华文楷体|Hant=新細明體|Arab=Times New Roman|Hebr=Times New Roman|Thai=KodchiangUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur', 'Jpan=ＭＳ Ｐ明朝|Hang=휴먼매직체|Hans=宋体|Hant=新細明體|Arab=Times New Roman|Hebr=Times New Roman|Thai=KodchiangUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  BookmanGillSansMT: ["Bookman Old Style", "Gill Sans MT", 'Grek=Cambria|Cyrl=Cambria|Jpan=HG明朝E|Hang=돋움|Hans=宋体|Hant=標楷體|Arab=Times New Roman|Hebr=Times New Roman|Thai=Browallia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur', 'Grek=Calibri|Cyrl=Calibri|Jpan=ＭＳ Ｐゴシック|Hang=맑은 고딕|Hans=华文新魏|Hant=新細明體|Arab=Arial|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur'],
  Constantia: ["Constantia", "Constantia", 'Jpan=HG明朝E|Hang=궁서|Hans=华文新魏|Hant=標楷體|Arab=Times New Roman|Hebr=Times New Roman|Thai=Browallia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur', 'Jpan=HG明朝E|Hang=궁서|Hans=华文新魏|Hant=標楷體|Arab=Times New Roman|Hebr=Times New Roman|Thai=Browallia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  GillSansMT: ["Gill Sans MT", "Gill Sans MT", 'Grek=Corbel|Cyrl=Corbel|Jpan=HGｺﾞｼｯｸE|Hang=휴먼매직체|Hans=华文中宋|Hant=微軟正黑體|Arab=Majalla UI|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Grek=Corbel|Cyrl=Corbel|Jpan=HGｺﾞｼｯｸE|Hang=HY엽서L|Hans=华文中宋|Hant=微軟正黑體|Arab=Majalla UI|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur'],
  FranklinGothicArial: ["Franklin Gothic Book", "Arial", 'Jpan=ＭＳ Ｐゴシック|Hang=HY견고딕|Hans=宋体|Hant=微軟正黑體|Arab=Tahoma|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur', 'Jpan=HGｺﾞｼｯｸM|Hang=HY중고딕|Hans=黑体|Hant=微軟正黑體|Arab=Tahoma|Hebr=Levenim MT|Thai=LilyUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur'],
  FranklinGothic: ["Franklin Gothic Medium", "Franklin Gothic Book", 'Jpan=HG創英角ｺﾞｼｯｸUB|Hang=돋움|Hans=隶书|Hant=微軟正黑體|Arab=Tahoma|Hebr=Aharoni|Thai=LilyUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur', 'Jpan=HGｺﾞｼｯｸE|Hang=돋움|Hans=华文楷体|Hant=微軟正黑體|Arab=Tahoma|Hebr=Aharoni|Thai=LilyUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur'],
  TrebuchetGeorgia: ["Trebuchet MS", "Georgia", 'Jpan=HGｺﾞｼｯｸM|Hang=맑은 고딕|Hans=方正姚体|Hant=微軟正黑體|Arab=Tahoma|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Jpan=HG明朝B|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Arial|Hebr=Times New Roman|Thai=Angsana New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  CenturyGothic: ["Century Gothic", "Century Gothic", 'Jpan=HGｺﾞｼｯｸM|Hang=HY중고딕|Hans=幼圆|Hant=微軟正黑體|Arab=Tahoma|Hebr=Gisha|Thai=DilleniaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Jpan=ＭＳ ゴシック|Hang=HY중고딕|Hans=幼圆|Hant=微軟正黑體|Arab=Tahoma|Hebr=Gisha|Thai=DilleniaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Verdana|Uigh=Microsoft Uighur'],
  FranklinGothicPerpetua: ["Franklin Gothic Book", "Perpetua", 'Grek=Calibri|Cyrl=Calibri|Jpan=HGｺﾞｼｯｸM|Hang=바탕|Hans=幼圆|Hant=微軟正黑體|Arab=Tahoma|Hebr=Aharoni|Thai=LilyUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Grek=Cambria|Cyrl=Cambria|Jpan=HG創英ﾌﾟﾚｾﾞﾝｽEB|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Times New Roman|Hebr=Aharoni|Thai=EucrosiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  CalibriConstantia: ["Calibri", "Constantia", 'Jpan=ＭＳ Ｐゴシック|Hang=HY중고딕|Hans=隶书|Hant=微軟正黑體|Arab=Traditional Arabic|Hebr=Arial|Thai=Cordia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur', 'Jpan=HGP明朝E|Hang=HY신명조|Hans=宋体|Hant=新細明體|Arab=Majalla UI|Hebr=David|Thai=Browallia New|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  Rockwell: ["Rockwell", "Rockwell", 'Grek=Cambria|Cyrl=Cambria|Jpan=HG明朝B|Hang=바탕|Hans=方正姚体|Hant=微軟正黑體|Arab=Times New Roman|Hebr=David|Thai=JasmineUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur', 'Grek=Cambria|Cyrl=Cambria|Jpan=HG明朝B|Hang=바탕|Hans=方正姚体|Hant=標楷體|Arab=Times New Roman|Hebr=David|Thai=JasmineUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=MoolBoran|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Times New Roman|Uigh=Microsoft Uighur'],
  TwCenMT: ["Tw Cen MT", "Tw Cen MT", 'Grek=Calibri|Cyrl=Calibri|Jpan=HGPｺﾞｼｯｸE|Hang=HY얕은샘물M|Hans=华文仿宋|Hant=微軟正黑體|Arab=Arial|Hebr=Levenim MT|Thai=FreesiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Grek=Calibri|Cyrl=Calibri|Jpan=HGPｺﾞｼｯｸE|Hang=HY얕은샘물M|Hans=华文仿宋|Hant=微軟正黑體|Arab=Arial|Hebr=Levenim MT|Thai=FreesiaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur'],
  ConsolasCorbel: ["Consolas", "Corbel", 'Jpan=HG丸ｺﾞｼｯｸM-PRO|Hang=HY중고딕|Hans=华文楷体|Hant=新細明體|Arab=Tahoma|Hebr=Levenim MT|Thai=DilleniaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Jpan=HGｺﾞｼｯｸM|Hang=맑은 고딕|Hans=宋体|Hant=新細明體|Arab=Tahoma|Hebr=Miriam|Thai=DilleniaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur'],
  Corbel: ["Corbel", "Corbel", 'Jpan=HGｺﾞｼｯｸM|Hang=HY엽서L|Hans=华文楷体|Hant=新細明體|Arab=Tahoma|Hebr=Miriam|Thai=DilleniaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur', 'Jpan=HGｺﾞｼｯｸM|Hang=HY엽서L|Hans=华文楷体|Hant=新細明體|Arab=Tahoma|Hebr=Miriam|Thai=DilleniaUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur'],
  TrebuchetMS: ["Trebuchet MS", "Trebuchet MS", 'Jpan=HG丸ｺﾞｼｯｸM-PRO|Hang=HY그래픽M|Hans=黑体|Hant=微軟正黑體|Arab=Tahoma|Hebr=Gisha|Thai=IrisUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Tahoma|Uigh=Microsoft Uighur', 'Jpan=HG丸ｺﾞｼｯｸM-PRO|Hang=HY그래픽M|Hans=华文新魏|Hant=微軟正黑體|Arab=Tahoma|Hebr=Gisha|Thai=IrisUPC|Ethi=Nyala|Beng=Vrinda|Gujr=Shruti|Khmr=DaunPenh|Knda=Tunga|Guru=Raavi|Cans=Euphemia|Cher=Plantagenet Cherokee|Yiii=Microsoft Yi Baiti|Tibt=Microsoft Himalaya|Thaa=MV Boli|Deva=Mangal|Telu=Gautami|Taml=Latha|Syrc=Estrangelo Edessa|Orya=Kalinga|Mlym=Kartika|Laoo=DokChampa|Sinh=Iskoola Pota|Mong=Mongolian Baiti|Viet=Arial|Uigh=Microsoft Uighur'],
};

/** Parsed script fallback tables of the built-in font schemes. */
const FONT_SCRIPTS: Record<string, { heading: ScriptTypeface[]; body: ScriptTypeface[] }> =
  Object.fromEntries(Object.entries(FONT_DATA).map(([name, [, , hs, bs]]) => [name, { heading: parseFontScripts(hs), body: parseFontScripts(bs) }]));

// theme name -> [colour scheme, font scheme], in the gallery order the trial uses.
const THEME_SCHEMES: [string, string, string][] = [
  ['Default', 'Default', 'Office2007'],
  ['Office', 'Office', 'Office'],
  ['Office2007', 'Office2007', 'Office2007'],
  ['Apex', 'Apex', 'LucidaBook'],
  ['Aspect', 'Aspect', 'Verdana'],
  ['Concourse', 'Concourse', 'LucidaSansUnicode'],
  ['Civic', 'Civic', 'Georgia'],
  ['Oriel', 'Oriel', 'CenturySchoolbook'],
  ['Origin', 'Origin', 'BookmanGillSansMT'],
  ['Paper', 'Paper', 'Constantia'],
  ['Solstice', 'Solstice', 'GillSansMT'],
  ['Technic', 'Technic', 'FranklinGothicArial'],
  ['Trek', 'Trek', 'FranklinGothic'],
  ['Urban', 'Urban', 'TrebuchetGeorgia'],
  ['Verve', 'Verve', 'CenturyGothic'],
  ['Equity', 'Equity', 'FranklinGothicPerpetua'],
  ['Flow', 'Flow', 'CalibriConstantia'],
  ['Foundry', 'Foundry', 'Rockwell'],
  ['Median', 'Median', 'TwCenMT'],
  ['Metro', 'Metro', 'ConsolasCorbel'],
  ['Module', 'Module', 'Corbel'],
  ['Opulent', 'Opulent', 'TrebuchetMS'],
];

const FONT_SCHEME_BY_THEME: Record<string, string> = Object.fromEntries(THEME_SCHEMES.map(([theme, , font]) => [theme, font]));

/** Static name order of the colour schemes, exactly as the trial declares them. */
const COLOR_SCHEME_ORDER = [
  'Default', 'Office2007', 'Office', 'Apex', 'Aspect', 'Concourse', 'Civic', 'Oriel', 'Origin',
  'Paper', 'Solstice', 'Technic', 'Trek', 'Urban', 'Verve', 'Equity', 'Flow', 'Foundry', 'Median',
  'Metro', 'Module', 'Opulent',
];
/** Static name order of the font schemes, exactly as the trial declares them. */
const FONT_SCHEME_ORDER = [
  'Office', 'Office2007', 'LucidaBook', 'Verdana', 'LucidaSansUnicode', 'Georgia', 'CenturySchoolbook',
  'BookmanGillSansMT', 'Constantia', 'GillSansMT', 'FranklinGothicArial', 'FranklinGothic',
  'TrebuchetGeorgia', 'CenturyGothic', 'FranklinGothicPerpetua', 'CalibriConstantia', 'Rockwell',
  'TwCenMT', 'ConsolasCorbel', 'Corbel', 'TrebuchetMS',
];

/**
 * Builder for the three built-in theme tables. In the trial they are
 * `typeof 'function'` and `new ThemeColors()` answers a property-free object,
 * while their gallery entries are their own enumerable properties. A bound
 * constructor reproduces exactly that: constructible, without a `prototype`
 * own property, and after deleting the configurable `name`/`length` exports
 * the own property names are the gallery names only.
 */
function staticThemeTable<T>(): Record<string, T> {
  function ThemeTable() {}
  const table = ThemeTable.bind(ThemeTable) as unknown as Record<string, T>;
  delete (table as Record<string, unknown>)['name'];
  delete (table as Record<string, unknown>)['length'];
  return table;
}

/**
 * `GC.Spread.Sheets.ThemeColors`: the built-in colour schemes, one entry per
 * gallery name (`ThemeColors.Office`, …).
 */
export const ThemeColors: Record<string, ColorScheme> = staticThemeTable();
for (const name of COLOR_SCHEME_ORDER)
  ThemeColors[name] = new ColorScheme(name, ...COLOR_DATA[name]);

/** `GC.Spread.Sheets.ThemeFonts`: the built-in heading/body font pairs, see `ThemeColors`. */
export const ThemeFonts: Record<string, ThemeFont> = staticThemeTable();
for (const name of FONT_SCHEME_ORDER)
  ThemeFonts[name] = new ThemeFont(name, FONT_DATA[name][0], FONT_DATA[name][1]);

/**
 * `GC.Spread.Sheets.Themes`: the built-in theme gallery, one entry per theme.
 * Every theme but `Default` serialises as its name — `Default` pairs the legacy
 * colour scheme with the Office 2007 fonts, and the trial serialises it as a full
 * record with a plain (script-table-free) font pair.
 */
export const Themes: Record<string, Theme> = staticThemeTable();
for (const [name, colors, fonts] of THEME_SCHEMES) {
  const theme = new Theme(name, ThemeColors[colors], FONT_DATA[fonts][0], FONT_DATA[fonts][1]);
  if (name === 'Default') Themes[name] = theme;
  else {
    theme.font(ThemeFonts[fonts]);
    Themes[name] = theme._asBuiltIn();
  }
}

/** Theme names in the order the reference designer's gallery lists them. */
export const THEME_ORDER: string[] = THEME_SCHEMES.map(([name]) => name);

/* ------------------------------------------------- serialisation helpers */

/** The colour-scheme name of a serialised theme value. */
export function themeColorName(theme: ThemeValue | undefined | null): string {
  if (!theme) return 'Office';
  if (typeof theme === 'string') return theme;
  const colors = theme.themeColor as { name?: unknown } | undefined;
  return String(colors?.name ?? theme.name ?? 'Office');
}

/** The font-scheme name of a serialised theme value. */
export function themeFontName(theme: ThemeValue | undefined | null): string {
  if (!theme) return 'Office';
  if (typeof theme === 'string') return FONT_SCHEME_BY_THEME[theme] ?? theme;
  const font = theme.font as { name?: unknown } | undefined;
  return String(font?.name ?? theme.name ?? 'Office');
}

/** Resolves a theme value to a `Theme`; built-in names give the shared instance. */
export function themeFromValue(theme: ThemeValue | undefined | null): Theme {
  if (typeof theme === 'string' || theme === undefined || theme === null) {
    return Themes[themeColorName(theme)] ?? Themes.Office;
  }
  return Theme.fromJSON(theme);
}

/** Resolved theme fonts: `[heading, body]`, Calibri fallback. */
export function themeFonts(theme: ThemeValue | undefined | null): [string, string] {
  const value = themeFromValue(theme);
  return [value._headingFont() || 'Calibri', value._bodyFont() || 'Calibri'];
}

/**
 * Palette for `parseColor`/`resolveColor`: the lower-case display names the
 * cell JSON uses (`'accent 1'`) map to the scheme's hex colours, so theme
 * references follow the workbook theme instead of the fixed default palette.
 */
export function themePalette(theme: ThemeValue | undefined | null): Record<string, string> {
  const colors = themeFromValue(theme)._colorsValue();
  const palette: Record<string, string> = {};
  for (const key of COLOR_KEYS) palette[THEME_COLOR_NAMES[key].toLowerCase()] = colors.css(key).toLowerCase();
  return palette;
}

/**
 * The custom theme the designer writes when the user picks colours or fonts that
 * no built-in theme combines: the current theme with one part replaced.
 */
export function customTheme(base: ThemeValue | undefined | null, patch: { colors?: ColorScheme; font?: ThemeFont }): Theme {
  const current = themeFromValue(base).clone();
  if (patch.colors) current.colors(patch.colors);
  if (patch.font) current.font(patch.font);
  current.name('custom-theme');
  return current;
}
