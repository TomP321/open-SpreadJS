import { describe, expect, it } from 'vitest';
import { TaskbarStyleRule } from '../src/gantt/appearance.js';

describe('Gantt taskbar style rules', () => {
  it('uses the trial base rule behavior and serializes its settings', () => {
    const rule = new TaskbarStyleRule('test');
    const task = { start: new Date(2025, 0, 6, 8), finish: new Date(2025, 0, 6, 17) };
    expect(rule.toJSON()).toEqual({ name: 'test' });
    expect(rule.match(task)).toBe(false);
    expect(rule.getFromDate(task)).toBe(task.start);
    expect(rule.getToDate(task)).toBe(task.finish);
    rule.fromJSON({ name: 'changed', style: { foo: 1 }, typeName: 'hello' } as { style: Record<string, unknown> });
    expect(rule.toJSON()).toEqual({ name: 'test', style: { foo: 1 } });
    rule.typeName = 'custom';
    expect(rule.toJSON()).toEqual({ name: 'test', style: { foo: 1 }, typeName: 'custom' });
  });
});
