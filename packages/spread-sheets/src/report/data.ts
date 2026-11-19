import { notImplemented } from '../not-implemented.js';

type Row = Record<string, unknown>;
type Condition = {
  and?: Condition[]; or?: Condition[]; column?: string; operator?: string;
  value?: unknown; parameter?: string; dataColumn?: { columnName: string };
};

function matches(row: Row, condition: Condition, parameters: Row): boolean {
  if (condition.and) return condition.and.every(item => matches(row, item, parameters));
  if (condition.or) return condition.or.some(item => matches(row, item, parameters));
  if (!condition.column || !condition.operator) return notImplemented('ReportSheet filter condition');
  const left = row[condition.column];
  const right = condition.parameter !== undefined ? parameters[condition.parameter]
    : condition.dataColumn ? row[condition.dataColumn.columnName] : condition.value;
  const a = left as string | number;
  const b = right as string | number;
  switch (condition.operator) {
    case 'Equal': return left === right;
    case 'NotEqual': return left !== right;
    case 'GreaterThan': return a > b;
    case 'GreaterThanOrEqual': return a >= b;
    case 'LessThan': return a < b;
    case 'LessThanOrEqual': return a <= b;
    case 'StartWith': return String(left).startsWith(String(right));
    case 'NotStartWith': return !String(left).startsWith(String(right));
    case 'EndWith': return String(left).endsWith(String(right));
    case 'NotEndWith': return !String(left).endsWith(String(right));
    case 'Contains': return String(left).includes(String(right));
    case 'NotContains': return !String(left).includes(String(right));
    case 'In': return Array.isArray(right) && right.includes(left);
    case 'NotIn': return Array.isArray(right) && !right.includes(left);
    default: return notImplemented('ReportSheet filter operator');
  }
}

export function selectRows(rows: Row[], cell: { filter?: unknown; sortOptions?: unknown }, parameters: Row): Row[] {
  const filter = cell.filter as { condition?: Condition } | undefined;
  let selected = filter?.condition ? rows.filter(row => matches(row, filter.condition!, parameters)) : rows;
  const sorts = cell.sortOptions as { asc?: string; desc?: string; list?: string[] }[] | undefined;
  if (sorts?.length) {
    selected = [...selected].sort((a, b) => {
      for (const sort of sorts) {
        const key = sort.asc ?? sort.desc;
        if (!key) return notImplemented('ReportSheet sort option');
        const av = a[key] as string | number;
        const bv = b[key] as string | number;
        const order = sort.list ? sort.list.indexOf(String(av)) - sort.list.indexOf(String(bv))
          : av < bv ? -1 : av > bv ? 1 : 0;
        if (order) return sort.desc ? -order : order;
      }
      return 0;
    });
  }
  return selected;
}
