import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import inventory from '../api-inventory.json';
const require = createRequire(import.meta.url);
const GC: object = require('../../spread-sheets/dist/gc.spread.sheets.cjs');
const STUB = Symbol.for('@opensheets/NotImplemented');
function resolve(apiPath: string): PropertyDescriptor {
  let value: object = { GC };
  const parts = apiPath.split('.');
  for (const part of parts.slice(0, -1)) value = Object.getOwnPropertyDescriptor(value, part)!.value as object;
  return Object.getOwnPropertyDescriptor(value, parts.at(-1)!)!;
}
function check(descriptor: PropertyDescriptor, path: string) {
  for (const value of [descriptor.get, descriptor.set, descriptor.value]) {
    if (typeof value === 'function' && Reflect.get(value, STUB)) expect(() => value()).toThrow(`NotImplemented: ${path}`);
  }
}
it('all generated class, function and property fallbacks fail explicitly', () => {
  let checked = 0;
  for (const entry of inventory.entries) {
    if (!['class', 'function', 'variable'].includes(entry.kind)) continue;
    const descriptor = resolve(entry.path);
    expect(descriptor, entry.path).toBeDefined();
    check(descriptor, entry.path);
    if (entry.kind !== 'class') continue;
    for (const member of entry.members) {
      if (member.kind === 'ctor') continue;
      const target: object = member.kind === 'static' ? descriptor.value : descriptor.value.prototype;
      const memberDescriptor = Object.getOwnPropertyDescriptor(target, member.name)!;
      expect(memberDescriptor, `${entry.path}.${member.name}`).toBeDefined();
      check(memberDescriptor, `${entry.path}.${member.name}`);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(1000);
});
