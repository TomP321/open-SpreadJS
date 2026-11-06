import fs from 'node:fs';

const cjs = 'dist/gc.spread.sheets.cjs';
fs.appendFileSync(cjs, '\nmodule.exports = module.exports.default;\n');
const contract = fs.readFileSync('src/generated/contract.txt', 'utf8');
const extras = '\ndeclare namespace GC.Spread.Sheets {\n  const productInfo: { readonly name: string; readonly version: string };\n}\n';
fs.writeFileSync('dist/gc.spread.sheets.d.cts', contract + extras + '\nexport = GC;\n');
fs.writeFileSync('dist/gc.spread.sheets.d.ts', contract + extras + '\nexport { GC as default };\nexport import Spread = GC.Spread;\nexport import Data = GC.Data;\nexport import Pivot = GC.Pivot;\n');
