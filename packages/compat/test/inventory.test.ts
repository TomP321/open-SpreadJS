import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { extract } from '../scripts/inventory.js';
it('extracts merged namespaces, signatures, member kinds and evaluated enum facts without comments', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opensheets-inventory-'));
  try {
    const file = path.join(directory, 'api.d.ts');
    fs.writeFileSync(file, `
      /** Vendor prose must not appear. */
      declare namespace GC.Example {
        enum Flag { none = 0, read = 1 << 2, write = read + 1, both = read | write, label = 'text' }
        class Model<T extends { value: number }> { constructor(name: string); static make(): Model; value: number; run(x: string): void; run(x: number): void; }
        interface Options { enabled?: boolean; run(): void }
        function create(options: Options): Model;
        const version: string;
        type Value = string | number;
      }
      declare namespace GC.Example { function extra(): void; }
    `);
    const inventory = extract(file);
    expect(JSON.stringify(inventory)).not.toContain('Vendor prose');
    expect(inventory.entries.filter(e => e.path === 'GC.Example' && e.kind === 'namespace')).toHaveLength(1);
    expect(inventory.entries.find(e => e.path === 'GC.Example.Flag')?.values).toEqual({ none: 0, read: 4, write: 5, both: 5, label: 'text' });
    const model = inventory.entries.find(e => e.path === 'GC.Example.Model')!;
    expect(model.signatures[0]).toContain('T extends {');
    expect(model.signatures[0]).toContain('value: number;');
    const members = model.members;
    expect(members.map(m => m.kind)).toEqual(['ctor', 'static', 'property', 'method', 'method']);
    expect(members.filter(m => m.name === 'run').map(m => m.signatures[0])).toEqual(['run(x: string): void;', 'run(x: number): void;']);
    for (const kind of ['interface', 'function', 'variable', 'type']) expect(inventory.entries.some(e => e.kind === kind)).toBe(true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
