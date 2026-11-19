import fs from 'node:fs';
const cjs = 'dist/gc.spread.sheets.designer.react.cjs';
if (fs.existsSync(cjs)) fs.appendFileSync(cjs, '\nmodule.exports = module.exports;\n');
