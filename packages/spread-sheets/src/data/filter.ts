export type Filter = { field: string; value?: unknown; operator?: string };

export function matchesFilter(value: unknown, filter: Filter): boolean {
  const expected = filter.value;
  if (expected instanceof Date && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(filter.operator ?? 'eq')) {
    return (filter.operator ?? 'eq') === 'eq' && value instanceof Date && value.getTime() === expected.getTime();
  }
  switch (filter.operator ?? 'eq') {
    case 'eq': return expected == null ? value == null : value === expected;
    case 'neq': return expected == null ? value != null : value !== expected;
    case 'gt': return (value as number) > (expected as number);
    case 'gte': return (value as number) >= (expected as number);
    case 'lt': return (value as number) < (expected as number);
    case 'lte': return (value as number) <= (expected as number);
    case 'contains': return String(value).includes(String(expected));
    case 'doesnotcontain': return !String(value).includes(String(expected));
    case 'startswith': return String(value).startsWith(String(expected));
    case 'endswith': return String(value).endsWith(String(expected));
    default: return false;
  }
}
