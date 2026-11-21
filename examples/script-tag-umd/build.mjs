// Build for the script-tag example: assemble a self-contained dist/ folder —
// index.html + app.js + the exact node_modules bundles/stylesheets the page
// references (this is what "vendoring the script tags" looks like). Pure Node,
// no bundler, works offline. `--check-only` just verifies every referenced
// file exists (used as the example's typecheck stand-in).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.includes('--check-only');

// Collect every ./node_modules/... path referenced from index.html.
const html = readFileSync(join(here, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(\.\/node_modules\/[^"]+)"/g)].map((m) => m[1]);
if (refs.length === 0) throw new Error('index.html references no ./node_modules files');

if (!checkOnly) rmSync(join(here, 'dist'), { recursive: true, force: true });
let ok = true;
for (const ref of refs) {
  const from = resolve(here, ref);
  try {
    readFileSync(from);
  } catch {
    console.error(`missing: ${ref} (is pnpm install done at the repo root?)`);
    ok = false;
    continue;
  }
  if (!checkOnly) {
    const to = join(here, 'dist', ref);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
}
if (!checkOnly && ok) {
  cpSync(join(here, 'app.js'), join(here, 'dist', 'app.js'));
  writeFileSync(join(here, 'dist', 'index.html'), html);
}
if (!ok) process.exit(1);
console.log(`${checkOnly ? 'checked' : 'built'} ${refs.length} referenced bundle/style files -> ${checkOnly ? 'ok' : 'dist/'}`);
