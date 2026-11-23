/**
 * TASK 91: the `General` number format's width-fitting rule (the Excel rule the trial follows).
 *
 * A `General` numeric cell never simply shows `####` when its full text is too wide: the trial
 * first shortens the number until it fits the column, and only falls back to the hash run when
 * nothing fits. Measured on the trial (black box, zoom 100 % and 150 %, columns 24..200 px):
 *
 * - The base text is `String(value)` (`-0.2222222`, `1234567890123`, `1e-7`, `1e+21`), with the
 *   current culture's decimal separator (it-IT `396,5`).
 * - A JS `e`-notation text with a 10-digit-or-larger exponent (`1e+21`, `1e-10`) is replaced by
 *   the canonical `d.dddddE±dd` form (mantissa padded to five decimals) before fitting — the
 *   lowercase JS form is never shown for those.
 * - Candidates are then tried in this order; the first that fits is painted:
 *   1. plain decimals reduced one place at a time, rounded half away from zero, keeping the
 *      removed places as `0`s (`123456.789` -> `123456.8`, `0.9999999` -> `1.00`); candidates
 *      that round away every decimal are skipped (`0.00001` -> no `0.0000`);
 *   2. the 0-decimal integer when it is nonzero (`396.5` -> `397`, `-2.5` -> `-3`);
 *   3. scientific `d.dddddE±dd` down to `dE±dd` (mantissa decimals 5..0) — integers and
 *      exponent bases use it too (`1234567890123` -> `1E+12`, `0.00001` -> `1E-05`);
 *   4. the zero integer (`-1e-12` -> `0`, `-0.4` -> `0`) — always tried last for tiny values.
 * - Exception (measured on `1e-7`/`1.5e-7`): a JS `e` base with a |exponent| < 10 wins the WHOLE
 *   scientific chain only in a very wide column — when `avail >= w(base) + w(dE±dd) + 3` it is
 *   painted as is (trial: `1e-7` at 68 px, `1.5e-7` at 76 px columns); below that gate the trial
 *   paints scientific down to `dE±dd` and then `0` — never the narrow lowercase form.
 * - Nothing fits -> the caller keeps its `#` overflow run.
 *
 * Fitting uses the paint context's own text measurement, so it is identical on every platform
 * and scale-invariant: the trial shows the same text at zoom 100 % and 150 % because widths and
 * fonts scale together.
 */
import { CultureManager } from './culture.js';

/** The current culture's decimal separator (`.` for en-us, `,` for it-it...). */
export function currentDecimalSeparator(): string {
  const culture = CultureManager.getCultureInfo(CultureManager.culture());
  return culture?.NumberFormat?.numberDecimalSeparator ?? '.';
}

/**
 * TASK 91 test hook (opt-in, off by default → zero cost when disabled): records the text the
 * renderer actually painted for every `General` numeric cell of the current paint pass, so
 * compatibility specs can assert the fitted DISPLAY strings as text (not pixels).
 */
let fitLog: Map<string, string> | null = null;
export function setGeneralFitLog(on: boolean): Map<string, string> | null {
  if (on) fitLog ??= new Map<string, string>();
  else fitLog = null;
  return fitLog;
}
export function recordGeneralFit(key: string, shown: string): void {
  fitLog?.set(key, shown);
}

/** The `General` display text of a number: `String(value)` with the culture's decimal separator. */
export function generalNumberText(value: number): string {
  const text = String(value);
  const dec = currentDecimalSeparator();
  return dec === '.' ? text : text.replace('.', dec);
}

/** Round half away from zero through the decimal string (so `1.005` -> `1.01`, `-2.5` -> `-3`). */
function roundDecimal(abs: number, decimals: number): number {
  // `toFixed` first so numbers whose String() is already `e` notation (`1e-12`) shift correctly.
  const shifted = Number(`${abs.toFixed(decimals + 2)}e${decimals}`);
  if (!Number.isFinite(shifted)) return abs;
  return Number(`${Math.round(shifted)}e-${decimals}`);
}

/** `1.23457E+12`-style scientific candidate with `decimals` mantissa decimals (exponent >= 2 digits). */
function scientific(abs: number, decimals: number): string | null {
  const text = abs.toExponential(decimals);
  const match = /^(\d+)(?:\.(\d+))?e([+-])(\d+)$/.exec(text);
  if (!match) return null;
  const mantissa = match[2] ? `${match[1]}.${match[2]}` : match[1];
  const exponent = match[4].length >= 2 ? match[4] : `0${match[4]}`;
  return `${mantissa}E${match[3]}${exponent}`;
}

/**
 * The text a General numeric cell paints when `base` does not fit `avail` pixels, or `null` when
 * nothing fits (the caller then paints its `#` run). `measure` runs in the same pixel space as
 * `avail` (the caller passes the paint context, so zoom scales both sides alike).
 */
export function generalFitText(
  value: number,
  base: string,
  avail: number,
  measure: (text: string) => number,
): string | null {
  if (!Number.isFinite(value)) return null;
  const dec = currentDecimalSeparator();
  const localize = (text: string): string => (dec === '.' ? text : text.replace('.', dec));
  const fits = (text: string): boolean => measure(text) <= avail;
  const raw = String(value);
  const sign = raw.startsWith('-') ? '-' : '';
  const absRaw = sign ? raw.slice(1) : raw;
  const candidates: string[] = [];
  const push = (unsigned: string | null): void => {
    if (unsigned === null) return;
    // A rounded zero never keeps the minus sign (the trial paints `0`, not `-0`).
    candidates.push(localize(unsigned === '0' ? unsigned : sign + unsigned));
  };

  const exponent = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(absRaw);
  if (exponent) {
    // A 10-or-more-digit exponent is never shown in the lowercase JS form: the canonical
    // `d.dddddE±dd` text is the base (trial: `1e+21` shows `1.00000E+21` even in 200 px).
    const from = dec === '.' ? absRaw : absRaw.replace(dec, '.');
    const expDigits = Math.abs(Number(exponent[3]));
    if (expDigits >= 10) {
      const canonical = scientific(Number(from), 5);
      if (canonical !== null && fits(localize(canonical))) return localize(sign + canonical);
      for (let decimals = 4; decimals >= 0; decimals--) push(scientific(Number(from), decimals));
    } else {
      // A shorter (|exponent| < 10) JS `e` base (`1e-7`, `1.5e-7`) is NOT shown as soon as it
      // fits — the trial paints the scientific chain instead (`1E-07`, `1.00E-07`...) and falls
      // back to the lowercase base only in a very wide column. Measured (trial font, zoom 100 %):
      // `1e-7` (24 px) appears at 68 px columns but not at 64; `1.5e-7` (35 px) at 76 but not 72.
      // The gate `avail >= w(base) + w(d0 scientific) + 3` (62 px / 73 px) matches both series.
      const base = localize(sign + absRaw);
      const d0 = scientific(Number(from), 0);
      if (d0 !== null && avail >= measure(base) + measure(localize(d0)) + 3) return base;
      for (let decimals = 5; decimals >= 0; decimals--) push(scientific(Number(from), decimals));
    }
    const wholeText = String(roundDecimal(Math.abs(value), 0));
    if (!wholeText.includes('e')) push(wholeText);
  } else if (absRaw.includes('.')) {
    if (fits(base)) return base;
    const decimals = absRaw.slice(absRaw.indexOf('.') + 1).length;
    const abs = Number(dec === '.' ? absRaw : absRaw.replace(dec, '.'));
    let roundedToZero = false;
    for (let d = decimals - 1; d >= 1; d--) {
      const rounded = roundDecimal(abs, d);
      if (rounded === 0) {
        roundedToZero = true;
        continue; // `0.0000`-style candidates are never painted
      }
      push(rounded.toFixed(d));
    }
    const whole = roundDecimal(abs, 0);
    if (whole !== 0) push(String(whole));
    for (let d = 5; d >= 0; d--) push(scientific(abs, d));
    if (roundedToZero || whole === 0) push('0');
  } else {
    // Plain integer base: scientific notation is the only shortening (the base cannot be reduced).
    if (fits(base)) return base;
    const abs = Number(absRaw);
    for (let d = 5; d >= 0; d--) push(scientific(abs, d));
  }

  for (const candidate of candidates) if (fits(candidate)) return candidate;
  return null;
}
