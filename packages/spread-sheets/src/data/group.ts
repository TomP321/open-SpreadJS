export type GroupDescription = { field: string; [key: string]: unknown };

export function groupRows<T>(rows: T[], groups: GroupDescription[], value: (row: T, field: string) => unknown): T[] {
  const visit = (items: T[], level: number): T[] => {
    const group = groups[level];
    if (!group) return items;
    const buckets = new Map<unknown, T[]>();
    for (const row of items) {
      const key = value(row, group.field);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    return [...buckets.values()].flatMap(bucket => visit(bucket, level + 1));
  };
  return visit(rows, 0);
}
