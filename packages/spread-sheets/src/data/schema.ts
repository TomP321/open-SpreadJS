import { notImplemented } from '../not-implemented.js';

type SchemaColumn = { [key: string]: unknown };

function parseDate(value: string, pattern: string): Date {
  const tokens = pattern.match(/yyyy|MM|dd|hh|HH|mm|ss|000/g);
  const values = value.match(/\d+/g);
  if (!tokens || !values || tokens.length !== values.length || !['yyyy', 'MM', 'dd'].every(token => tokens.includes(token))) {
    return notImplemented('GC.Data.Table.fetch date pattern');
  }
  const parts = Object.fromEntries(tokens.map((token, index) => [token, Number(values[index])]));
  return new Date(parts.yyyy!, parts.MM! - 1, parts.dd!, parts.hh ?? parts.HH ?? 0, parts.mm ?? 0, parts.ss ?? 0, parts['000'] ?? 0);
}

export function convertSchemaValue(raw: unknown, column: SchemaColumn): unknown {
  if (raw == null) return raw;
  const pattern = typeof column.dataPattern === 'string' ? column.dataPattern : undefined;
  switch (column.dataType) {
    case 'number': {
      const value = pattern === ',' && typeof raw === 'string' ? raw.replace(',', '.') : raw;
      const number = Number(value);
      return Number.isNaN(number) ? 0 : number;
    }
    case 'string': return String(raw);
    case 'boolean': return pattern ? String(raw) === pattern.split('|')[0] : Boolean(raw);
    case 'date': return pattern && typeof raw === 'string' ? parseDate(raw, pattern) : new Date(raw as string | number);
    case 'object':
    case 'array': {
      if (typeof raw !== 'string') return raw;
      try {
        const value: unknown = JSON.parse(raw);
        if (column.dataType === 'array' ? Array.isArray(value) : value !== null && typeof value === 'object' && !Array.isArray(value)) {
          return value;
        }
      } catch { /* Keep malformed JSON unchanged. */ }
      return raw;
    }
    default: return raw;
  }
}
