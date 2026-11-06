import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import facts from './enum-facts.json';
const require = createRequire(import.meta.url);
const GC: unknown = require('../../spread-sheets/dist/gc.spread.sheets.cjs');
describe('all official enum facts (types only; no vendor runtime)', () => {
  for (const fact of facts) {
    it(fact.path, () => {
      let current: unknown = GC;
      for (const name of fact.path.split('.').slice(1)) current = (current as Record<string, unknown>)[name];
      const values = current as Record<string, unknown>;
      for (const [name, value] of Object.entries(fact.values)) expect(values[name], `${fact.path}.${name}`).toBe(value);
      expect(Object.keys(values).filter(k => !/^-?\d+$/.test(k)).sort()).toEqual(Object.keys(fact.values).sort());
    });
  }
});
