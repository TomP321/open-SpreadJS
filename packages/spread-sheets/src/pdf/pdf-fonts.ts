/*
 * Base-14 font support for the PDF writer (Task 16).
 *
 * The width tables below are the Adobe AFM metrics of the standard fourteen
 * fonts (AFM files are public Adobe metric data), written here as plain
 * arrays, plus the WinAnsi (code page 1252) code-page mapping.
 *
 * Layout of every width table: 256 entries indexed by the WinAnsi *byte*
 * value; entries 32..126 are the printable ASCII widths from the AFM, and the
 * high range (160..255) is filled from the metric-compatible Latin base letter
 * (an accented glyph has the same advance as its base letter in these fonts).
 * Codes without a usable approximation fall back to the width of `n`.
 */

/** Widths of WinAnsi codes 32..126, in 1/1000 em. */
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const TIMES_ASCII = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
  921, 722, 667, 667, 722, 667, 611, 722, 722, 278, 500, 722, 611, 833, 722, 722,
  556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
  333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
  500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 389, 400, 275, 400, 541,
];
const TIMES_BOLD_ASCII = [
  250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
  930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778,
  611, 778, 722, 556, 611, 722, 667, 1000, 667, 722, 611, 333, 278, 333, 570, 500,
  333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
  556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 389, 390, 280, 390, 570,
];
const TIMES_ITALIC_ASCII = [
  250, 333, 420, 500, 500, 833, 778, 214, 333, 333, 500, 675, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 675, 675, 675, 500,
  920, 611, 611, 667, 722, 611, 611, 722, 722, 333, 444, 667, 556, 833, 667, 722,
  611, 722, 611, 556, 611, 722, 611, 833, 611, 556, 556, 389, 278, 389, 422, 500,
  333, 500, 500, 444, 500, 444, 278, 500, 500, 278, 278, 444, 278, 722, 500, 500,
  500, 500, 389, 389, 278, 500, 444, 667, 444, 444, 389, 400, 275, 400, 541,
];
const TIMES_BOLD_ITALIC_ASCII = [
  250, 389, 555, 500, 500, 833, 778, 278, 333, 333, 500, 570, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
  930, 667, 667, 667, 722, 667, 667, 722, 778, 389, 500, 667, 611, 889, 722, 722,
  667, 722, 667, 556, 611, 722, 667, 889, 667, 611, 611, 333, 278, 333, 570, 500,
  333, 500, 500, 444, 500, 444, 333, 500, 556, 278, 278, 500, 278, 778, 556, 500,
  500, 556, 389, 389, 333, 556, 500, 722, 500, 500, 389, 348, 280, 348, 570,
];

/**
 * WinAnsi codes 161..255 -> the ASCII character with the same advance in the
 * base-14 fonts (0 means "no approximation known"). Latin letters map to their
 * unaccented base; punctuation and symbols keep the AFM widths already known
 * for the range via `HIGH_WIDTHS`.
 */
const HIGH_BASE_LETTERS: Record<number, string> = {
  161: '!', 162: 'c', 163: 'L', 164: 'y', 166: '|', 167: 'S', 168: '"', 169: 'C',
  170: 'a', 171: '<', 172: '=', 174: 'R', 175: '-', 176: 'o', 177: '+', 178: '2',
  179: '3', 180: "'", 181: 'u', 182: 'P', 183: '.', 184: ',', 185: '1', 186: 'o',
  187: '>', 188: '4', 189: '2', 190: '4', 191: '?', 192: 'A', 193: 'A', 194: 'A',
  195: 'A', 196: 'A', 197: 'A', 198: 'AE', 199: 'C', 200: 'E', 201: 'E', 202: 'E',
  203: 'E', 204: 'I', 205: 'I', 206: 'I', 207: 'I', 208: 'D', 209: 'N', 210: 'O',
  211: 'O', 212: 'O', 213: 'O', 214: 'O', 215: 'x', 216: 'O', 217: 'U', 218: 'U',
  219: 'U', 220: 'U', 221: 'Y', 222: 'T', 223: 'B', 224: 'a', 225: 'a', 226: 'a',
  227: 'a', 228: 'a', 229: 'a', 230: 'ae', 231: 'c', 232: 'e', 233: 'e', 234: 'e',
  235: 'e', 236: 'i', 237: 'i', 238: 'i', 239: 'i', 240: 'd', 241: 'n', 242: 'o',
  243: 'o', 244: 'o', 245: 'o', 246: 'o', 247: '/', 248: 'o', 249: 'u', 250: 'u',
  251: 'u', 252: 'u', 253: 'y', 254: 'p', 255: 'y',
  // Latin-1 range codes 161..255 covered above; 160 (nbsp) is the space width.
};

/** Unicode code points that live in WinAnsi codes 128..159 (cp1252 only). */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134,
  0x2021: 135, 0x02c6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140,
  0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147, 0x201d: 148, 0x2022: 149,
  0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155,
  0x0153: 156, 0x017e: 158, 0x0178: 159,
};

/** Unicode code point -> WinAnsi byte, or null when the encoding cannot write it. */
export function winAnsiByteFor(code: number): number | null {
  if (code === 0x0d || code === 0x0a || code === 0x09) return code;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return CP1252_HIGH[code] ?? null;
}

/** A base-14 font: PostScript name, AFM metrics and the CSS families it serves. */
export interface Base14Font {
  readonly name: string;
  readonly widths: readonly number[];
  readonly ascender: number;
  readonly descender: number;
}

function buildWidths(ascii: readonly number[]): number[] {
  const widths = new Array<number>(256).fill(ascii[110 - 32] /* 'n' */);
  for (let i = 0; i < ascii.length; i++) widths[32 + i] = ascii[i];
  widths[160] = ascii[0];
  for (const [code, base] of Object.entries(HIGH_BASE_LETTERS)) {
    let width = 0;
    for (let i = 0; i < base.length; i++) width += ascii[base.charCodeAt(i) - 32] ?? 0;
    widths[Number(code)] = width;
  }
  return widths;
}

function font(name: string, ascii: readonly number[], ascender: number, descender: number): Base14Font {
  return { name, widths: buildWidths(ascii), ascender, descender };
}

export const BASE14_FONTS: Record<string, Base14Font> = {
  Helvetica: font('Helvetica', HELVETICA_ASCII, 718, -207),
  'Helvetica-Bold': font('Helvetica-Bold', HELVETICA_BOLD_ASCII, 718, -207),
  'Helvetica-Oblique': font('Helvetica-Oblique', HELVETICA_ASCII, 718, -207),
  'Helvetica-BoldOblique': font('Helvetica-BoldOblique', HELVETICA_BOLD_ASCII, 718, -207),
  'Times-Roman': font('Times-Roman', TIMES_ASCII, 683, -217),
  'Times-Bold': font('Times-Bold', TIMES_BOLD_ASCII, 683, -217),
  'Times-Italic': font('Times-Italic', TIMES_ITALIC_ASCII, 683, -217),
  'Times-BoldItalic': font('Times-BoldItalic', TIMES_BOLD_ITALIC_ASCII, 683, -217),
  Courier: font('Courier', new Array(95).fill(600), 629, -157),
  'Courier-Bold': font('Courier-Bold', new Array(95).fill(600), 629, -157),
  'Courier-Oblique': font('Courier-Oblique', new Array(95).fill(600), 629, -157),
  'Courier-BoldOblique': font('Courier-BoldOblique', new Array(95).fill(600), 629, -157),
};

export interface PdfFontSelection {
  readonly fontKey: keyof typeof BASE14_FONTS;
  /** Font size in the canvas' own units (CSS pixels of the current transform). */
  readonly size: number;
}

const MONO = /courier|mono|consolas|menlo|lucida console/i;
const SERIF = /times|georgia|garamond|minion|serif|mincho|song|simsun|roman/i;

/** Pick the closest base-14 font for a CSS `font` shorthand (Task 17 adds TrueType embedding). */
export function selectFont(cssFont: string, size: number, bold: boolean, italic: boolean): PdfFontSelection {
  const family = String(cssFont || '').replace(/sans-serif/gi, 'swiss');
  const serif = SERIF.test(family);
  const mono = MONO.test(family);
  let key: string;
  if (mono) key = 'Courier';
  else if (serif) key = 'Times-Roman';
  else key = 'Helvetica';
  if (mono) {
    if (bold && italic) key = 'Courier-BoldOblique';
    else if (bold) key = 'Courier-Bold';
    else if (italic) key = 'Courier-Oblique';
  } else if (serif) {
    if (bold && italic) key = 'Times-BoldItalic';
    else if (bold) key = 'Times-Bold';
    else if (italic) key = 'Times-Italic';
  } else {
    if (bold && italic) key = 'Helvetica-BoldOblique';
    else if (bold) key = 'Helvetica-Bold';
    else if (italic) key = 'Helvetica-Oblique';
  }
  return { fontKey: key as keyof typeof BASE14_FONTS, size };
}

/** Parsed CSS `font` shorthand: `[[italic] [bold]] <size><unit> <family>`. */
export interface CssFont {
  /** False when the string is not a valid shorthand (a browser keeps the old font). */
  readonly parsed: boolean;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Font size in CSS pixels. */
  readonly size: number;
  readonly family: string;
}

const CSS_DEFAULT_FONT = Object.freeze({ parsed: true, bold: false, italic: false, size: 16, family: 'sans-serif' }) satisfies CssFont;

const ABSOLUTE_SIZES: Record<string, number> = {
  'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32,
};

/**
 * Parse the CSS `font` shorthand the canvas accepts. Style keywords may appear
 * in any order before the size; the size must be followed by a family list.
 */
export function parseCssFont(font: string): CssFont {
  const text = String(font || '').trim();
  if (!text) return CSS_DEFAULT_FONT;
  const italic = /(^|\s)(italic|oblique)(\s|$)/i.test(text);
  const bold = /(^|\s)(bold|bolder|[6-9]00)(\s|$)/i.test(text);
  let size: number = CSS_DEFAULT_FONT.size;
  let rest = '';
  const sizeMatch = /(^|\s)(\d+(?:\.\d+)?)(px|pt|em|rem|%)(?=\s|\/|$)/.exec(text);
  const keywordMatch = /(^|\s)(xx?-small|small|medium|large|x?-large|xx-large)(?=\s|\/|$)/i.exec(text);
  if (sizeMatch) {
    const value = Number(sizeMatch[2]);
    const unit = sizeMatch[3] ?? 'px';
    size = value * (unit === 'pt' ? 4 / 3 : unit === 'em' || unit === 'rem' ? 16 : unit === '%' ? 0.16 : 1);
    rest = text.slice((sizeMatch.index ?? 0) + sizeMatch[0].length);
  } else if (keywordMatch) {
    size = ABSOLUTE_SIZES[keywordMatch[2].toLowerCase()] ?? 16;
    rest = text.slice((keywordMatch.index ?? 0) + keywordMatch[0].length);
  } else {
    return { parsed: false, bold, italic, size: 0, family: '' };
  }
  // Drop an optional `/line-height`; keep the whole family list for `ctx.font`.
  const family = rest.replace(/^\s*\/[^,\s]*/, '').trim();
  if (!family) return { parsed: false, bold, italic, size, family: '' };
  return { parsed: true, bold, italic, size, family };
}

/** First family name of a list, without its quotes. */
export function firstFontFamily(family: string): string {
  return family.split(',')[0]!.trim().replace(/^["']|["']$/g, '') || 'sans-serif';
}

/** Advance width of `text` in em units for a base-14 font (sum of 1/1000 widths). */
export function textEmWidth(fontKey: keyof typeof BASE14_FONTS, text: string, missing?: number[]): number {
  const widths = BASE14_FONTS[fontKey].widths;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    if (code > 0xffff) i++;
    const byte = winAnsiByteFor(code);
    if (byte === null) { missing?.push(code); total += widths[0x3f]; continue; }
    total += widths[byte];
  }
  return total / 1000;
}
