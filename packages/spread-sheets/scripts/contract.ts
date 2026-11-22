import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// src/generated/contract.txt is NOT committed: it is the public declaration contract of
// @mescius/spread-sheets (installed by `pnpm install` as a devDependency of packages/compat),
// printed through the TypeScript AST printer with every comment removed. It is regenerated here
// before each build so the shipped .d.ts matches the official public API exactly.
const out = path.resolve('src/generated/contract.txt');
const official = path.resolve('../compat/node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.d.ts');
if (!fs.existsSync(official)) {
  if (fs.existsSync(out)) process.exit(0);
  console.error(`contract: ${official} not found — run \`pnpm install\` at the repository root first.`);
  process.exit(1);
}
const source = ts.createSourceFile(official, fs.readFileSync(official, 'utf8'), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter({ removeComments: true });
const contract = printer.printFile(source).replace(/export\s*=\s*GC\s*;/g, '');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, contract);
