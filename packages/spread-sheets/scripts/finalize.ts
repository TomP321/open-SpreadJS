import fs from 'node:fs';

const cjs = 'dist/gc.spread.sheets.cjs';
// Default-import interop (`require(...) === GC`), while keeping the package's named
// exports reachable on the returned namespace object (Data, Spread, ...).
fs.appendFileSync(cjs, '\n{ const named = module.exports; module.exports = named.default; for (const key of Object.keys(named)) if (key !== "default") module.exports[key] = named[key]; }\n');
const contract = fs.readFileSync('src/generated/contract.txt', 'utf8');
// Only `productInfo` is declared beyond the vendor contract (it is measured on the trial
// runtime). The barcode layer's `_registerBarcodeFunctions` hook is deliberately undeclared
// and non-enumerable so the public surface equals the d.ts (TASK 73).
const extras =
  '\ndeclare namespace GC.Spread.Sheets {\n  const productInfo: { readonly name: string; readonly version: string };\n}\n';
fs.writeFileSync('dist/gc.spread.sheets.d.cts', contract + extras + '\nexport = GC;\n');
fs.writeFileSync('dist/gc.spread.sheets.d.ts', contract + extras + '\nexport { GC as default };\nexport import Spread = GC.Spread;\nexport import Data = GC.Data;\nexport import Pivot = GC.Pivot;\n');
