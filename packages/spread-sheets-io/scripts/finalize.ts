import fs from 'node:fs';
for (const ext of ['d.ts', 'd.cts']) fs.writeFileSync(`dist/gc.spread.sheets.io.${ext}`, "import '@mescius/spread-sheets';\nexport {};\n");
