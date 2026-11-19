#!/usr/bin/env node
/*
 * Task 16/17 oracle: compare `Workbook.savePDF` against OUR OWN print rendering.
 *
 * The official trial does not load the PDF plugin, so there is no black-box
 * reference for a PDF: the reference is `paintPrintPage` on a real canvas. For
 * every print page we rasterise (a) the PDF with PyMuPDF and (b) the canvas
 * with Chromium, both at 100 dpi, and report the percentage of differing
 * pixels (anti-aliasing tolerance 32/255). Numbers are reported as they are;
 * nothing here tunes the scenario.
 *
 * Task 17 adds font registration: before each variant we ask the same
 * Chromium (CDP `CSS.getPlatformFontsForNode`) which font FILE it really
 * draws each style of the scenario family with, and register exactly those
 * TrueType programs through `PDFFontsManager.registerFont`. That is the
 * definition of "the font Chromium actually draws the canvas with": on this
 * machine `fc-match Calibri` answers DejaVu, while Chromium actually renders
 * Calibri as Liberation Serif (verified by CDP and pixel-identical glyph
 * hashes), so we follow the browser, not the CLI. The PDF then draws with
 * the very outlines and advances the canvas raster shows.
 *
 * Run: pnpm --filter @opensheets/compare pdf:oracle
 * Needs: python3 with PyMuPDF (pip install pymupdf) — local dev tool only.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const ROOT = path.resolve(APP, '../..');
const OUT = path.join(ROOT, '.probe/pdf-oracle');
const DPI = 100;
const THRESHOLD = 32 / 255;
const PT_PER_INCH = 72;
// Two font variants: task 17 registers the TrueType file Chromium actually
// draws each family with (resolved per variant via CDP), so the base-14
// mapping only remains for families nobody registered. The `images` variant
// adds a background tile and a watermark to exercise the image XObject path
// in a real browser.
const SCENARIOS = [
  { name: 'Arial', font: 'Arial', images: false },
  { name: 'Calibri', font: 'Calibri', images: false },
  { name: 'images', font: 'Arial', images: true },
];
const VARIANTS = SCENARIOS.filter((scenario) =>
  (process.env.PDF_ORACLE_VARIANTS ?? SCENARIOS.map((item) => item.name).join(',')).split(',').includes(scenario.name));
// Same browser location as playwright.config.ts (downloaded by `pnpm setup:compare`).
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(ROOT, '.playwright-browsers');

/** True only when `url` really serves our oracle page (a stale server answers with index.html). */
async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return false;
    return (await response.text()).includes('/src/pdf-oracle.ts');
  } catch {
    return false;
  }
}

async function serve() {
  const existing = process.env.CMP_BASE_URL ?? 'http://127.0.0.1:5174';
  if (await reachable(`${existing}/pdf-oracle.html`)) return { base: existing, child: null };
  const port = Number(process.env.PDF_ORACLE_PORT ?? 5198);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: APP,
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    if (await reachable(`${base}/pdf-oracle.html`)) return { base, child };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill('SIGKILL');
  throw new Error('vite did not come up');
}

/** Check the cross-reference table and page count with an independent reader. */
function validate(pdfPath, expectedPages) {
  const text = fs.readFileSync(pdfPath, 'latin1');
  const table = /xref\n0 (\d+)\n/.exec(text);
  if (!table) throw new Error(`${pdfPath}: no xref table`);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
  if (text.slice(startxref, startxref + 4) !== 'xref') throw new Error(`${pdfPath}: startxref does not point at the table`);
  const size = Number(table[1]);
  // `/Type /Pages` (the tree) never matches `/Type /Page[\s/>]`.
  const counts = (text.match(/\/Type \/Page[\s/>]/g) ?? []).length;
  const tree = (text.match(/\/Type \/Pages/g) ?? []).length;
  if (tree !== 1) throw new Error(`${pdfPath}: ${tree} /Type /Pages objects, expected 1`);
  if (counts !== expectedPages) throw new Error(`${pdfPath}: ${counts} /Type /Page objects, expected ${expectedPages}`);
  void size;
  return { objects: size, pages: counts };
}

/** Rasterise with pymupdf and return its per-page description (JSON lines). */
function rasterise(pdfPath, outDir) {
  const result = spawnSync('python3', [path.join(HERE, 'pdf-raster.py'), pdfPath, outDir, String(DPI)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`pdf-raster.py failed: ${result.stderr}`);
  const parsed = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  const document = parsed.find((item) => item.kind === 'document');
  const pages = parsed.filter((item) => item.kind === 'page').map((item) => ({
    index: item.page,
    width: item.mediaBox[0],
    height: item.mediaBox[1],
    px: item.raster[0],
    py: item.raster[1],
    images: item.images,
    textChars: item.textChars,
  }));
  return { document, pages };
}

function compare(pageDir, index) {
  const canvas = PNG.sync.read(fs.readFileSync(path.join(pageDir, `canvas-${index}.png`)));
  const pdf = PNG.sync.read(fs.readFileSync(path.join(pageDir, `page-${index}.png`)));
  if (canvas.width !== pdf.width || canvas.height !== pdf.height) {
    return { index, size: `${canvas.width}x${canvas.height} vs ${pdf.width}x${pdf.height}`, mismatch: null };
  }
  const diff = new PNG({ width: canvas.width, height: canvas.height });
  const changed = pixelmatch(canvas.data, pdf.data, diff.data, canvas.width, canvas.height, { threshold: THRESHOLD, alpha: 0, diffColor: [255, 0, 255] });
  fs.writeFileSync(path.join(pageDir, `diff-${index}.png`), PNG.sync.write(diff));
  return {
    index,
    size: `${canvas.width}x${canvas.height}`,
    changed,
    total: canvas.width * canvas.height,
    percent: (100 * changed) / (canvas.width * canvas.height),
  };
}

/**
 * Positions of continuous dark rows/columns: only printed grid lines and cell
 * borders form a run over most of the page, so agreeing positions prove the
 * vector geometry agrees and the remaining pixel differences are glyph shape
 * or anti-aliasing.
 */
function longLines(file, limit = 0.6, dark = 230) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width, height, data } = png;
  const longest = (count, at) => {
    let best = 0;
    let run = 0;
    for (let i = 0; i < count; i++) {
      const index = at(i);
      const isDark = (data[index] + data[index + 1] + data[index + 2]) / 3 < dark;
      run = isDark ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  };
  const rows = [];
  for (let y = 0; y < height; y++) {
    if (longest(width, (x) => (y * width + x) * 4) > width * limit) rows.push(y);
  }
  const cols = [];
  for (let x = 0; x < width; x++) {
    if (longest(height, (y) => (y * width + x) * 4) > height * limit) cols.push(x);
  }
  return { rows: groupLines(rows), cols: groupLines(cols) };
}

function groupLines(values) {
  const groups = [];
  for (const value of values) {
    const last = groups[groups.length - 1];
    if (last && value - last[last.length - 1] <= 2) last.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
}

function matchLines(source, other) {
  if (!source.length || !other.length) return { matched: source.length, total: source.length, worst: 0 };
  let matched = 0;
  let worst = 0;
  for (const value of source) {
    const distance = Math.min(...other.map((other2) => Math.abs(value - other2)));
    if (distance <= 1.5) matched++;
    worst = Math.max(worst, distance);
  }
  return { matched, total: source.length, worst };
}

function dataUrlToPng(dataUrl) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

/* ------------------------------------------------- canvas font resolution */

const FONT_STYLES = { normal: '', bold: 'font-weight:bold;', italic: 'font-style:italic;', boldItalic: 'font-weight:bold;font-style:italic;' };

/** TrueType faces Chromium itself uses to draw `family`, as base64 (task 17). */
async function canvasFontFaces(browser, family) {
  const probe = await browser.newPage();
  const cdp = await probe.context().newCDPSession(probe);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const spans = Object.values(FONT_STYLES)
    .map((css) => `<span style="${css}">Hamburgefons 0123456789</span>`).join('');
  await probe.setContent(`<style>span{display:block;font-size:40px;font-family:"${family.replace(/["\\]/g, '')}"}</style>${spans}`);
  const doc = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: 'span' });
  const names = {};
  const keys = Object.keys(FONT_STYLES);
  for (let i = 0; i < nodeIds.length && i < keys.length; i++) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: nodeIds[i] });
    const used = [...fonts].sort((a, b) => b.glyphCount - a.glyphCount)[0];
    if (used?.postScriptName) names[keys[i]] = used.postScriptName;
  }
  await probe.close();
  // PostScript name -> file on disk (fc-list can print both).
  const listing = spawnSync('fc-list', ['--format', '%{file}\t%{postscriptname}\n'], { encoding: 'utf8' });
  const fileFor = new Map();
  for (const line of String(listing.stdout).split('\n')) {
    const [file, postScript] = line.split('\t');
    if (file && postScript) fileFor.set(postScript.trim(), file.trim());
  }
  const faces = {};
  for (const [style, postScript] of Object.entries(names)) {
    const file = fileFor.get(postScript);
    if (file && fs.existsSync(file)) faces[style] = { file, base64: fs.readFileSync(file).toString('base64') };
  }
  return faces;
}

async function registerCanvasFonts(browser, page, families) {
  for (const family of [...new Set(families)]) {
    const faces = await canvasFontFaces(browser, family);
    const entries = Object.entries(faces);
    if (!entries.length) {
      console.log(`${family}: Chromium reported no TrueType file to register; the base-14 mapping stays.`);
      continue;
    }
    await page.evaluate((args) => window.__pdfOracle.registerFont(args[0], args[1]), [family, Object.fromEntries(entries.map(([style, face]) => [style, face.base64]))]);
    console.log(`${family}: registered canvas faces ${entries.map(([style, face]) => `${style}=${path.basename(face.file)}`).join(', ')}`);
  }
}

async function main() {
  const { chromium } = await import('@playwright/test');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const { base, child } = await serve();
  const browser = await chromium.launch();
  const rows = [];
  const warnings = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
    });
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));
    await page.goto(`${base}/pdf-oracle.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__pdfOracle && window.__pdfOracle.ready === true, null, { timeout: 30000 });
    // Task 17: embed exactly the fonts the canvas reference draws with.
    await registerCanvasFonts(browser, page, VARIANTS.map((variant) => variant.font));
    for (const { name: variant, font, images } of VARIANTS) {
      const info = await page.evaluate((value) => window.__pdfOracle.build(value[0], value[1]), [font, images]);
      const dir = path.join(OUT, variant);
      fs.mkdirSync(dir, { recursive: true });
      const pdfPath = path.join(dir, `${variant}.pdf`);
      const started = Date.now();
      const base64 = await page.evaluate(() => window.__pdfOracle.pdfBase64());
      fs.writeFileSync(pdfPath, Buffer.from(base64, 'base64'));
      const pdfMs = Date.now() - started;
      const structure = validate(pdfPath, info.pages);
      const { pages: pdfPages } = rasterise(pdfPath, dir);
      if (pdfPages.length !== info.pages) throw new Error(`${variant}: pymupdf sees ${pdfPages.length} pages, we painted ${info.pages}`);
      for (const item of pdfPages) {
        const expectedWidth = (item.width / PT_PER_INCH) * DPI;
        const expectedHeight = (item.height / PT_PER_INCH) * DPI;
        if (Math.abs(item.px - expectedWidth) > 1 || Math.abs(item.py - expectedHeight) > 1) {
          throw new Error(`${variant} page ${item.index}: raster ${item.px}x${item.py} does not match MediaBox ${item.width}x${item.height}pt at ${DPI} dpi`);
        }
      }
      for (let index = 0; index < info.pages; index++) {
        const dataUrl = await page.evaluate((value) => window.__pdfOracle.canvasPng(value), index);
        fs.writeFileSync(path.join(dir, `canvas-${index}.png`), dataUrlToPng(dataUrl));
      }
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ variant, pages: info.pages, paperPx: info.size, scale: info.scale }, null, 2));
      for (let index = 0; index < info.pages; index++) {
        const page = compare(dir, index);
        const canvasLines = longLines(path.join(dir, `canvas-${index}.png`));
        const pdfLines = longLines(path.join(dir, `page-${index}.png`));
        page.geometry = {
          rows: matchLines(canvasLines.rows, pdfLines.rows),
          cols: matchLines(canvasLines.cols, pdfLines.cols),
        };
        rows.push({ variant, bytes: fs.statSync(pdfPath).size, pdfMs, ...page });
      }
      const imageSummary = pdfPages.map((item) => item.images.length).join('/');
      const firstImages = pdfPages[0].images.map((image) => `${image.width}x${image.height}@${JSON.stringify(image.bbox)}`).join(' ');
      console.log(`${variant}: ${info.pages} print page(s), paper ${info.size.width}x${info.size.height}px, scale ${info.scale}, PDF ${fs.statSync(pdfPath).size} bytes in ${pdfMs}ms, ${structure.objects} objects, images/page ${imageSummary}${firstImages ? ` [${firstImages}]` : ''}`);
    }
  } finally {
    await browser.close();
    if (child) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  }
  // Control experiment: with the canvas fonts registered (task 17), the two
  // text variants draw with the two different fonts the browser actually uses,
  // so canvas-vs-canvas and pdf-vs-pdf should show comparable differences. A
  // much larger PDF-vs-canvas number than this residual would indicate our
  // embedding or layout diverging, not just the fonts differing.
  if (VARIANTS.length > 1) {
    const [first, second] = VARIANTS.map((item) => item.name);
    const count = rows.filter((row) => row.variant === first).length;
    for (let index = 0; index < count; index++) {
      const a = path.join(OUT, first, `canvas-${index}.png`);
      const b = path.join(OUT, second, `canvas-${index}.png`);
      const canvasA = PNG.sync.read(fs.readFileSync(a));
      const canvasB = PNG.sync.read(fs.readFileSync(b));
      const changed = pixelmatch(canvasA.data, canvasB.data, null, canvasA.width, canvasA.height, { threshold: THRESHOLD, alpha: 0 });
      const pdfA = PNG.sync.read(fs.readFileSync(path.join(OUT, first, `page-${index}.png`)));
      const pdfB = PNG.sync.read(fs.readFileSync(path.join(OUT, second, `page-${index}.png`)));
      const pdfChanged = pixelmatch(pdfA.data, pdfB.data, null, pdfA.width, pdfA.height, { threshold: THRESHOLD, alpha: 0 });
      console.log(`control page ${index + 1}: canvas ${first} vs ${second} = ${(100 * changed / (canvasA.width * canvasA.height)).toFixed(3)} %, pdf vs pdf = ${(100 * pdfChanged / (pdfA.width * pdfA.height)).toFixed(3)} %`);
    }
  }
  console.log('');
  console.log(`page                       size        differing px    % (> ${THRESHOLD.toFixed(3)} per channel ignored)`);
  let worst = 0;
  for (const row of rows) {
    const label = `${row.variant} page ${String(row.index + 1).padStart(2, '0')}`;
    if (row.changed === null) {
      console.log(`${label.padEnd(26)} ${row.size}  RASTER SIZE MISMATCH`);
      continue;
    }
    worst = Math.max(worst, row.percent);
    const geometry = row.geometry
      ? `lines rows ${row.geometry.rows.matched}/${row.geometry.rows.total} cols ${row.geometry.cols.matched}/${row.geometry.cols.total} (max ${Math.max(row.geometry.rows.worst, row.geometry.cols.worst).toFixed(1)}px)`
      : '';
    console.log(`${label.padEnd(26)} ${row.size.padEnd(11)} ${String(row.changed).padStart(9)}  ${row.percent.toFixed(3)} %  ${geometry}`);
  }
  console.log('');
  console.log(`worst page: ${worst.toFixed(3)} % (target < 3 %)`);
  const relevant = [...new Set(warnings.filter((text) => text.includes('savePDF') || text.includes('Oracle') || text.startsWith('pageerror')))];
  if (relevant.length) console.log(`\nbrowser warnings:\n${relevant.map((text) => `  ${text}`).join('\n')}`);
  const failing = rows.some((row) => row.changed === null || row.percent > 3) || worst > 3;
  console.log(failing ? '\nRESULT: below/above target, see the numbers above.' : '\nRESULT: every page within target.');
  if (!fs.existsSync(path.join(OUT, 'keep'))) fs.writeFileSync(path.join(OUT, 'keep'), 'artefacts of scripts/pdf-oracle.mjs\n');
}

main().catch((error) => {
  console.error(String(error?.stack ?? error));
  process.exit(1);
});
