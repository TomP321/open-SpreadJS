import { CalcError, BarcodeExValue, ImageExValue, SparklineExValue, isErrorString } from './calc/values.js';
import { GeneralFormatter, dateToSerial, serialToDate } from './formatter.js';
import { LineBorder, Style, styleProperties } from './primitives.js';
export type JsonRecord = Record<string, unknown>;
export function object(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return `/OADate(${dateToSerial(value)})/`;
  if (Array.isArray(value))
    return Array.from(value, (item) => serializeValue(item === undefined ? null : item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, serializeValue(v)]),
    );
  return value;
}
export function deserializeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const date = value.match(/^\/OADate\((-?[\d.]+)\)\/$/);
    if (date) return serialToDate(Number(date[1]));
  }
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    if (record.typeName === 'SparklineExValue' && typeof record.name === 'string') {
      const payload = object(deserializeValue(record.value));
      // TASK 46: the trial stores barcode results as `SparklineExValue` records flagged
      // `isBarcode`; a stored `BarcodeExValue` type name is still accepted (older files).
      if (payload.isBarcode === true) return new BarcodeExValue(record.name, payload);
      return new SparklineExValue(record.name, payload);
    }
    if (record.typeName === 'BarcodeExValue' && typeof record.name === 'string') return new BarcodeExValue(record.name, object(deserializeValue(record.value)));
    if (record.typeName === 'ImageExValue') return new ImageExValue(object(deserializeValue(record.value)));
    if (typeof record.error === 'string' && isErrorString(record.error)) return new CalcError(record.error);
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deserializeValue(v)]));
  return value;
}
export function styleToJSON(style: Style | string | null | undefined): unknown {
  if (!style || typeof style === 'string') return style;
  const result: JsonRecord = {};
  for (const key of [...styleProperties, 'quotePrefix'])
    if (Object.prototype.propertyIsEnumerable.call(style, key) && style[key] !== undefined)
      result[key] =
        style[key] instanceof GeneralFormatter
          ? (style[key] as GeneralFormatter).formatString()
          : style[key] && typeof (style[key] as { toJSON?: unknown }).toJSON === 'function'
            ? (style[key] as { toJSON(): unknown }).toJSON()
            : serializeValue(style[key]);
  if (result.cellType !== undefined) {
    if (result.name === undefined) result.name = null;
    if (result.fontForColumnWidth === undefined) result.fontForColumnWidth = null;
  }
  if (typeof style.font === 'string') {
    const font = style.font.match(/^(.*?)\s*(\d+(?:\.\d+)?(?:px|pt|em|rem|%))(?:\/[\d.]+)?\s+(.+)$/);
    if (font) {
      if (/italic|oblique/.test(font[1]) && result.fontStyle === undefined)
        result.fontStyle = font[1].match(/italic|oblique/)![0];
      if (/bold|[1-9]00/.test(font[1]) && result.fontWeight === undefined)
        result.fontWeight = font[1].match(/bold|[1-9]00/)![0];
      result.fontSize ??= font[2];
      result.fontFamily ??= font[3];
    }
  }
  return result;
}
export function styleFromJSON(value: unknown): Style | string {
  if (typeof value === 'string') return value;
  const style = Object.assign(new Style(), object(value));
  for (const key of ['borderLeft', 'borderRight', 'borderTop', 'borderBottom', 'diagonalDown', 'diagonalUp'])
    if (style[key]) {
      const border = object(style[key]);
      style[key] = new LineBorder(String(border.color ?? 'black'), Number(border.style ?? 0));
    }
  return style;
}
export function differences(actual: unknown, expected: unknown, path = '$'): string[] {
  if (Object.is(actual, expected)) return [];
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const a = object(actual),
      b = object(expected);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      differences(a[key], b[key], `${path}.${key}`),
    );
  }
  return [`${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`];
}
/** Recursively omit option defaults, preserving unknown user options. */
export function optionDifferences(options: JsonRecord, defaults: JsonRecord): JsonRecord {
  const result: JsonRecord = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (value && defaults[key] && typeof value === 'object' && !Array.isArray(value)) {
      const diff = optionDifferences(object(value), object(defaults[key]));
      if (Object.keys(diff).length) result[key] = diff;
    } else if (JSON.stringify(value) !== JSON.stringify(defaults[key])) result[key] = serializeValue(value);
  }
  return result;
}
export function mergeOptions(target: JsonRecord, source: JsonRecord): void {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object'
    )
      mergeOptions(object(target[key]), object(value));
    else target[key] = deserializeValue(value);
  }
}
