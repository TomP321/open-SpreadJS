import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Separate processes prevent previous sheets' deferred ArrayBuffer disposal from
// contaminating the retained-memory baseline. Both layouts include cold startup.
const results = [1, 20].map(columns => JSON.parse(execFileSync(process.execPath, ['--expose-gc', '-e', `
const GC = require(${JSON.stringify(path.resolve('dist/gc.spread.sheets.cjs'))});
global.gc();
const before = process.memoryUsage();
const sheet = new GC.Spread.Sheets.Worksheet();
const start = performance.now();
for (let i = 0; i < 200000; i++) sheet.setValue(Math.floor(i / ${columns}), i % ${columns}, i);
const setMs = performance.now() - start;
const getStart = performance.now(); let sum = 0;
for (let i = 0; i < 200000; i++) sum += sheet.getValue(Math.floor(i / ${columns}), i % ${columns});
const getMs = performance.now() - getStart;
global.gc();
const after = process.memoryUsage();
console.log(JSON.stringify({ columns: ${columns}, setMs, getMs,
  heapMB: (after.heapUsed - before.heapUsed) / 1048576,
  bufferMB: (after.arrayBuffers - before.arrayBuffers) / 1048576,
  totalMB: (after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers) / 1048576,
  sum, last: sheet.getValue(Math.floor(199999 / ${columns}), 199999 % ${columns}) }));
`], { encoding: 'utf8' })) as Record<string, number>);
process.stdout.write(JSON.stringify(results, null, 2) + '\n');
