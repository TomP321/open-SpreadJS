import fs from 'node:fs';
fs.mkdirSync('styles', { recursive: true });
const css = fs.readFileSync('src/styles.css', 'utf8');
for (const name of ['gc.spread.sheets.designer.min.css', 'gc.spread.sheets.designer.light.min.css', 'gc.spread.sheets.designer.dark.min.css']) {
  fs.writeFileSync(`styles/${name}`, css);
}
const cjs = 'dist/gc.spread.sheets.designer.cjs';
if (fs.existsSync(cjs)) {
  const source = fs.readFileSync(cjs, 'utf8');
  if (!source.endsWith('module.exports = module.exports.default;\n')) fs.appendFileSync(cjs, '\nmodule.exports = module.exports.default;\n');
}
