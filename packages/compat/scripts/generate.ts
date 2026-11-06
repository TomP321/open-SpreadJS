import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { repoRoot, officialDeclaration, writeInventory } from './inventory.js';

const inventory = writeInventory();
const generated = path.join(repoRoot, 'packages/spread-sheets/src/generated');
fs.mkdirSync(generated, { recursive: true });
const enums = inventory.entries.filter(e => e.kind === 'enum');
const lines = ['// Generated from public API enum facts; no vendor implementation or comments.', 'export namespace GC {'];
for (const entry of enums) {
  const parts = entry.path.split('.').slice(1);
  const name = parts.pop()!;
  lines.push(...parts.map(p => `export namespace ${p} {`), `export enum ${name} {`);
  for (const [key, value] of Object.entries(entry.values!)) lines.push(`${JSON.stringify(key)} = ${JSON.stringify(value)},`);
  lines.push('}', ...parts.map(() => '}'));
}
lines.push('}');
fs.writeFileSync(path.join(generated, 'enums.ts'), lines.join('\n') + '\n');
// The declaration contract is reproduced through the AST printer, stripping all comments.
// It describes unsupported APIs as well; runtime fallbacks explicitly throw NotImplemented.
const source = ts.createSourceFile(officialDeclaration, fs.readFileSync(officialDeclaration, 'utf8'), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter({ removeComments: true });
const contract = printer.printFile(source).replace(/export\s*=\s*GC\s*;/g, '');
fs.writeFileSync(path.join(generated, 'contract.txt'), contract);
const runtime = inventory.entries.filter(e => ['namespace', 'class', 'function', 'variable'].includes(e.kind)).map(e => ({ path: e.path, kind: e.kind, members: e.members.filter(m => m.kind !== 'ctor').map(m => ({name: m.name, kind: m.kind, declarationKind: m.declarationKind})) }));
fs.writeFileSync(path.join(generated, 'stubs.json'), JSON.stringify(runtime, null, 2) + '\n');
fs.writeFileSync(path.join(repoRoot, 'packages/compat/test/enum-facts.json'), JSON.stringify(enums.map(e => ({ path: e.path, values: e.values })), null, 2) + '\n');
console.log(`Generated ${enums.length} enums, declaration contract, and explicit API fallbacks.`);

const reactFile = path.join(repoRoot, 'packages/compat/node_modules/@mescius/spread-sheets-react/dist/gc.spread.sheets.react.d.ts');
const reactSource = ts.createSourceFile(reactFile, fs.readFileSync(reactFile, 'utf8'), ts.ScriptTarget.Latest, true);
const reactInterfaces = reactSource.statements.filter(ts.isInterfaceDeclaration).map(node => printer.printNode(ts.EmitHint.Unspecified, node, reactSource)).join('\n');
fs.writeFileSync(path.join(repoRoot, 'packages/spread-sheets-react/src/props.ts'), '// Generated public prop signatures, without vendor comments.\nimport type * as React from "react";\nimport type GC from "@opensheets/spread-sheets";\n' + reactInterfaces + '\n');
