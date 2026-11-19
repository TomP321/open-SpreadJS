/*
 * Real linear symbology encoders for the BC_* formulas.
 *
 * Pattern tables below are written from the public symbology specifications
 * (ANSI/AIM BC1-1995 Code 39, AIM BC2 Code 93, ISO/IEC 15417 Code 128, AIM BC3
 * Codabar and the GS1 General Specifications for GS1-128). All functions
 * return module strings ('1' = dark, '0' = light) WITHOUT quiet zones; the
 * renderer adds them.
 */

/* ------------------------------------------------------------- CODE 39 --- */

/** Two-of-five wide-bar pairs (1-based bar positions), indexed by pair number 1..10. */
const CODE39_PAIRS: [number, number][] = [[1, 5], [2, 5], [1, 2], [3, 5], [1, 3], [2, 3], [4, 5], [1, 4], [2, 4], [3, 4]];
/** Code 39 alphabet in checksum-value order (0..42); '*' is the delimiter. */
const CODE39_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
/**
 * Wide-space position (1..4) per decade group: digits s2, A-J s3, K-T s4,
 * U-Z - . space s1 (the star pattern `... | |▮▮|` closes the +30 column).
 */
const CODE39_GROUP_SPACE = [2, 3, 4, 1];
/** $ / + % : five narrow bars, three adjacent wide spaces with the narrow slot at s4, s3, s2, s1. */
const CODE39_SPECIAL: Record<string, number> = { $: 4, '/': 3, '+': 2, '%': 1 };

/** 9 element widths (bars on even indices) for one Code 39 character. */
function code39Widths(char: string): number[] | null {
  if (CODE39_SPECIAL[char] !== undefined) {
    const narrowSpace = CODE39_SPECIAL[char];
    const widths: number[] = [];
    for (let element = 1; element <= 9; element++) {
      if (element % 2 === 1) widths.push(1);
      else widths.push(element / 2 === narrowSpace ? 1 : 3);
    }
    return widths;
  }
  let pair: number;
  let group: number;
  if (char === '*') {
    pair = 10; // bars 3+4
    group = 3; // wide space s1
  } else {
    const index = CODE39_ALPHABET.indexOf(char);
    if (index < 0) return null;
    pair = index <= 9 ? (index === 0 ? 10 : index) : ((index - 10) % 10) + 1;
    group = index <= 9 ? 0 : Math.min(3, Math.floor((index - 10) / 10) + 1);
  }
  const [wide1, wide2] = CODE39_PAIRS[pair - 1];
  const wideSpace = CODE39_GROUP_SPACE[group];
  const widths: number[] = [];
  let bars = 0;
  let spaces = 0;
  for (let element = 1; element <= 9; element++) {
    if (element % 2 === 1) {
      bars++;
      widths.push(bars === wide1 || bars === wide2 ? 3 : 1);
    } else {
      spaces++;
      widths.push(spaces === wideSpace ? 3 : 1);
    }
  }
  return widths;
}

/**
 * Code 39 module string. `*` delimiters are added automatically and a narrow
 * inter-character space separates every symbol. Narrow = 1 module, wide = 3.
 * `withCheckDigit` appends the mod-43 check character.
 */
export function encodeCODE39(text: string, withCheckDigit = false): string | null {
  const data = String(text).toUpperCase();
  const chars: string[] = [];
  for (const char of data) {
    if (CODE39_ALPHABET.indexOf(char) < 0) return null;
    chars.push(char);
  }
  if (withCheckDigit) chars.push(CODE39_ALPHABET[code39Sum(data) % 43]);
  const symbols = ['*', ...chars, '*'];
  let modules = '';
  symbols.forEach((char, position) => {
    const widths = code39Widths(char);
    if (!widths) return;
    widths.forEach((width, index) => {
      modules += (index % 2 === 0 ? '1' : '0').repeat(width);
    });
    if (position < symbols.length - 1) modules += '0'; // inter-character gap
  });
  return modules;
}

const code39Sum = (data: string): number => {
  let sum = 0;
  for (const char of data) sum += CODE39_ALPHABET.indexOf(char);
  return sum;
};

/** Mod-43 check character of a Code 39 string (null when a character is invalid). */
export function code39CheckDigit(text: string): string | null {
  const data = String(text).toUpperCase();
  for (const char of data) if (CODE39_ALPHABET.indexOf(char) < 0) return null;
  return CODE39_ALPHABET[code39Sum(data) % 43];
}

/* ------------------------------------------------------------- CODABAR --- */

/*
 * Codabar (AIM BC3-1995): 7 elements per character (4 bars, 3 spaces,
 * alternating from a bar). The twelve basic symbols use exactly one wide bar
 * and one wide space; : . / + use three wide bars and no wide space; the
 * delimiters A-D use one wide bar and two adjacent wide spaces. Wide = 3
 * modules, narrow = 1, with one narrow inter-character space.
 */
/*
 * char -> [wide bar positions, wide space positions] (1-based). Transcribed
 * from the AIM BC3 pattern table as reproduced in public symbology references
 * (verified against a third-party decoder).
 */
const CODABAR_PATTERNS: Record<string, [number[], number[]]> = {
  '0': [[4], [3]], '1': [[3], [3]], '4': [[2], [3]], '5': [[1], [3]],
  '2': [[4], [2]], '-': [[3], [2]], '$': [[2], [2]], '9': [[1], [2]],
  '6': [[4], [1]], '7': [[3], [1]], '8': [[2], [1]], '3': [[1], [1]],
  '.': [[1, 2, 3], []], '/': [[1, 2, 4], []], ':': [[1, 3, 4], []], '+': [[2, 3, 4], []],
  A: [[2], [2, 3]], B: [[4], [1, 2]], C: [[4], [2, 3]], D: [[3], [2, 3]],
};

function codabarWidths(char: string): number[] | null {
  const entry = CODABAR_PATTERNS[char];
  if (!entry) return null;
  const [bars, spaces] = entry;
  const widths: number[] = [];
  for (let element = 1; element <= 7; element++) {
    if (element % 2 === 1) widths.push(bars.includes((element + 1) / 2) ? 3 : 1);
    else widths.push(spaces.includes(element / 2) ? 3 : 1);
  }
  return widths;
}

const codabarWrap = (text: string): string => {
  let data = String(text).toUpperCase();
  if (data && 'ABCD'.indexOf(data[0]) < 0) data = 'A' + data;
  if (data && 'ABCD'.indexOf(data[data.length - 1]) < 0) data += 'A';
  return data;
};

/** Codabar module string; data without delimiters is wrapped in A...A. */
export function encodeCODABAR(text: string): string | null {
  const data = codabarWrap(text);
  const widths: number[] = [];
  for (const char of data) {
    const pattern = codabarWidths(char);
    if (!pattern) return null;
    widths.push(...pattern, 1);
  }
  if (!widths.length) return null;
  widths.pop(); // no inter-character gap after the stop symbol
  let modules = '';
  widths.forEach((width, index) => {
    modules += (index % 2 === 0 ? '1' : '0').repeat(width);
  });
  return modules;
}

/** Codabar label: data with its delimiters. */
export const codabarLabel = (text: string): string => codabarWrap(text);

/* ------------------------------------------------------------- CODE 93 --- */

/*
 * Code 93 (AIM BC2-1995): 48 values, each 9 modules of three bars + three
 * spaces (widths 1..4). The width vectors below are the specification's
 * codeword table (values 0..46; 43-46 are the ($) (%) (/) (+) shifts used only
 * for full-ASCII). Every symbol ends with start (111141), data + mod-47 check
 * characters C and K, stop (111141) and a single-module termination bar.
 */
const CODE93_WIDTHS = [
  '131112', '111213', '111312', '111411', '121113', '121212', '121311', '111114', '131211', '141111',
  '211113', '211212', '211311', '221112', '221211', '231111', '112113', '112212', '112311', '122112',
  '132111', '111123', '111222', '111321', '121122', '131121', '212112', '212211', '211122', '211221',
  '221121', '222111', '112122', '112221', '122121', '123111', '121131', '311112', '311211', '321111',
  '112131', '113121', '211131', '121221', '312111', '311121', '122211',
];
const CODE93_START_STOP = '111141';
const CODE93_BASIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

/**
 * Code 93 module string (basic alphabet only; null for unsupported
 * characters). Check characters C (weights 1..20 from the right) and K
 * (weights 1..15 including C), both modulo 47, are always appended.
 */
export function encodeCODE93(text: string): string | null {
  const values: number[] = [];
  for (const char of String(text)) {
    const value = CODE93_BASIC.indexOf(char);
    if (value < 0) return null;
    values.push(value);
  }
  const weightedMod47 = (list: number[], limit: number): number => {
    let sum = 0;
    for (let i = 0; i < list.length; i++) sum += list[list.length - 1 - i] * (i % limit + 1);
    return sum % 47;
  };
  const c = weightedMod47(values, 20);
  const k = weightedMod47([...values, c], 15);
  let widths = CODE93_START_STOP;
  for (const value of [...values, c, k]) widths += CODE93_WIDTHS[value];
  widths += CODE93_START_STOP + '1'; // stop symbol + termination bar
  let modules = '';
  let dark = true;
  for (const digit of widths) {
    modules += (dark ? '1' : '0').repeat(Number(digit));
    dark = !dark;
  }
  return modules;
}

/** Code 93 label (the payload as entered). */
export const code93Label = (text: string): string => String(text);

/* ------------------------------------------------------------ CODE 128 --- */

/*
 * Code 128 (ISO/IEC 15417:2007): 106 patterns of six elements (three bars,
 * three spaces, widths 1..4, 11 modules) + the 7-element stop (2331112 + a
 * final 2-module bar counted in the widths). Values 0..102 are data/function,
 * 103..105 are Start A/B/C and 106 is Stop. The check character is the
 * weighted (start included, first two symbols weight 1) sum modulo 103.
 */
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '233111',
];
const CODE128_STOP = '2331112';
const CODE128_FNC1 = 102;
const CODE128_CODE_A = 101;
const CODE128_CODE_B = 100;
const CODE128_CODE_C = 99;
const CODE128_SHIFT = 98;

const isDigit = (char: string): boolean => char >= '0' && char <= '9';

/** Code set A: controls 0..31 map to 64..95, printable 32..95 map to 0..63. */
const code128AValue = (char: string): number | null => {
  const code = char.charCodeAt(0);
  if (code < 32) return code + 64;
  if (code <= 95) return code - 32;
  return null;
};
/** Code set B: printable ASCII 32..127 map to 0..95. */
const code128BValue = (char: string): number | null => {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 127) return code - 32;
  return null;
};

const code128DigitRun = (chars: string[], from: number): number => {
  let count = 0;
  while (from + count < chars.length && isDigit(chars[from + count])) count++;
  return count;
};

/** Emit chars[i..] in subset A or B; SHIFT when a single symbol needs the other. */
function code128PlainValues(chars: string[], i: number, set: 'A' | 'B', values: number[]): boolean {
  for (; i < chars.length; i++) {
    const char = chars[i];
    const value = set === 'A' ? code128AValue(char) : code128BValue(char);
    if (value !== null) values.push(value);
    else {
      const shifted = set === 'A' ? code128BValue(char) : code128AValue(char);
      if (shifted === null) return false;
      values.push(CODE128_SHIFT, shifted);
    }
  }
  return true;
}

/**
 * Automatic subset selection per the standard's compression guidance: subset C
 * for leading even digit runs of 4+, interior even runs of 6+ and trailing even
 * runs of 4+; subset A when control characters occur, otherwise B.
 */
function code128Encode(text: string): { start: number; values: number[] } | null {
  const chars = [...text];
  if (!chars.length) return null;
  let needsA = false;
  for (const char of chars) if (char.charCodeAt(0) < 32) needsA = true;
  const base: 'A' | 'B' = needsA ? 'A' : 'B';
  const start = needsA ? 103 : 104;
  const values: number[] = [];
  let i = 0;
  const lead = code128DigitRun(chars, 0);
  if (lead === chars.length && lead % 2 === 0 && lead >= 2) {
    for (; i < chars.length; i += 2) values.push(Number(chars[i] + chars[i + 1]));
    return { start: 105, values };
  }
  if (lead >= 4 && lead % 2 === 0) {
    for (; i < lead; i += 2) values.push(Number(chars[i] + chars[i + 1]));
    values.push(base === 'A' ? CODE128_CODE_A : CODE128_CODE_B);
    if (!code128PlainValues(chars, i, base, values)) return null;
    return { start: 105, values };
  }
  while (i < chars.length) {
    const run = code128DigitRun(chars, i);
    const atEnd = i + run === chars.length;
    if (run % 2 === 0 && run >= (atEnd ? 4 : 6)) {
      values.push(CODE128_CODE_C);
      for (let k = 0; k < run; k += 2) values.push(Number(chars[i + k] + chars[i + k + 1]));
      i += run;
      if (i < chars.length) values.push(base === 'A' ? CODE128_CODE_A : CODE128_CODE_B);
      continue;
    }
    if (run >= 5 && !atEnd && (run - 1) % 2 === 0 && run - 1 >= 4) {
      // Odd run in the middle: leave the first digit plain, then use C.
      const char = chars[i];
      values.push(base === 'A' ? (code128AValue(char) as number) : (code128BValue(char) as number));
      i++;
      values.push(CODE128_CODE_C);
      for (let k = 0; k < run - 1; k += 2) values.push(Number(chars[i + k] + chars[i + k + 1]));
      i += run - 1;
      if (i < chars.length) values.push(base === 'A' ? CODE128_CODE_A : CODE128_CODE_B);
      continue;
    }
    const before = values.length;
    if (!code128PlainValues(chars, i, base, values)) {
      if (values.length !== before) return null;
      return null;
    }
    break;
  }
  return { start, values };
}

function code128Finish(start: number, values: number[]): string {
  const all = [start, ...values];
  let sum = start;
  for (let i = 1; i < all.length; i++) sum += all[i] * i;
  const check = sum % 103;
  let widths = CODE128_PATTERNS[start];
  for (const value of values) widths += CODE128_PATTERNS[value];
  widths += CODE128_PATTERNS[check] + CODE128_STOP;
  let modules = '';
  let dark = true;
  for (const digit of widths) {
    modules += (dark ? '1' : '0').repeat(Number(digit));
    dark = !dark;
  }
  return modules;
}

/** Code 128 module string with automatic A/B/C subsets; null for bad input. */
export function encodeCODE128(text: string): string | null {
  const plan = code128Encode(String(text));
  if (!plan || !plan.values.length) return null;
  return code128Finish(plan.start, plan.values);
}

/* ------------------------------------------------------------ GS1-128 --- */

/**
 * GS1-128 (ISO/IEC 15417 with the GS1 encodation rules): Start C followed by
 * FNC1, digit pairs in subset C, an FNC1 separator after every bracketed
 * `(AI)data` group, and subset B for non-digit payload characters.
 */
export function encodeGS1128(text: string): string | null {
  const data = String(text);
  const values: number[] = [CODE128_FNC1];
  let inC = true;
  const latch = (to: 'B' | 'C'): void => {
    if (to === 'C' && !inC) values.push(CODE128_CODE_C);
    if (to === 'B' && inC) values.push(CODE128_CODE_B);
    inC = to === 'C';
  };
  const pushDigits = (digits: string): void => {
    if (!digits) return;
    if (digits.length % 2 === 1) {
      if (digits.length === 1) {
        latch('B');
        values.push(digits.charCodeAt(0) - 32);
        return;
      }
      const even = digits.length - 1;
      for (let i = 0; i + 1 < digits.length && i < even; i += 2) values.push(Number(digits.slice(i, i + 2)));
      latch('B');
      values.push(digits.charCodeAt(even) - 32);
      latch('C');
      return;
    }
    latch('C');
    for (let i = 0; i + 1 < digits.length; i += 2) values.push(Number(digits.slice(i, i + 2)));
  };
  const pushRest = (body: string): boolean => {
    let i = 0;
    while (i < body.length) {
      const digits = /^[0-9]+/.exec(body.slice(i))?.[0] ?? '';
      if (digits.length >= 4 && digits.length % 2 === 0) {
        pushDigits(digits);
        i += digits.length;
        continue;
      }
      const value = code128BValue(body[i]);
      if (value === null) return false;
      latch('B');
      values.push(value);
      i++;
    }
    return true;
  };
  if (data.includes('(')) {
    const groups = [...data.matchAll(/\((\d{2,4})\)([^()]*)/g)];
    if (!groups.length) return null;
    let covered = 0;
    for (const match of groups) {
      if (match.index !== covered) return null;
      covered += match[0].length;
      pushDigits(match[1]);
      if (!pushRest(match[2])) return null;
      values.push(CODE128_FNC1);
    }
    if (covered !== data.length) return null;
    while (values.length > 1 && values[values.length - 1] === CODE128_FNC1) values.pop();
    return code128Finish(105, values);
  }
  if (!pushRest(data)) return null;
  return code128Finish(105, values);
}

/** GS1-128 label (payload as entered). */
export const gs1128Label = (text: string): string => String(text);
/** Code 128 label (payload as entered). */
export const code128Label = (text: string): string => String(text);
