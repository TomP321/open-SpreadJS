#!/usr/bin/env node
/**
 * TASK 52 drop-in check (item 4): build and run the sample applications from freshly
 * packed tarballs, the way an application switches to OpenSheets (TASK 73 added (g), the
 * barcode add-in scenario, and its official black-box twin; TASK 76 added (h), the
 * all-add-ins scenario, and its official twin):
 *
 *   "@mescius/spread-sheets": "npm:@opensheets/spread-sheets@^0.1.0"   (registry alias recipe)
 *   "@mescius/spread-sheets": "file:<tarball>"                         (local tarball recipe)
 *
 * npm refuses `npm:` aliases for local tarballs ("aliases only work for registry deps"), so the
 * sample apps map the tarballs onto the @mescius names with `file:` specs; the alias map, the
 * package contents and every import path in the app code are otherwise identical to the
 * registry recipe (apps/dropin-check/README.md documents both).
 *
 * Per app: materialize from templates/ -> npm install -> tsc --noEmit -> build -> headless
 * Chromium (page files served through request interception, no server port) -> assertions ->
 * screenshot. Each run records where every aliased package resolved to, so a second copy of the
 * core (two module instances) can never pass unnoticed.
 *
 * Run: pnpm dropin:check    (node apps/dropin-check/scripts/dropin-check.mjs [--pack] [--keep])
 * Evidence: .probe/t52/apps/<id>/, .probe/t52/screenshots/, .probe/t52/dropin-report.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const TEMPLATES = path.join(ROOT, 'apps', 'dropin-check', 'templates');
const T52 = path.join(ROOT, '.probe', 't52');
const TARBALLS = path.join(T52, 'tarballs');
const APPS = path.join(T52, 'apps');
const SHOTS = path.join(T52, 'screenshots');
const CACHE = path.join(T52, 'npm-cache');
// Nothing listens on this port: every response is fulfilled through page.route() below. The
// official trial only builds its sheets when the page has a real localhost origin (measured in
// .probe/t52/probe-official-umd*.mjs), so the pages are addressed as 127.0.0.1:5189.
const ORIGIN = 'http://127.0.0.1:5189';
const PACKAGES = path.join(ROOT, 'packages');

const args = process.argv.slice(2);
const PACK = args.includes('--pack');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const selected = (id) => !ONLY || ONLY.includes(id);
const log = (line) => process.stdout.write(`${line}\n`);
const VERSION = JSON.parse(fs.readFileSync(path.join(PACKAGES, 'spread-sheets', 'package.json'), 'utf8')).version;

function exec(cmd, cmdArgs, cwd) {
  try {
    const out = execFileSync(cmd, cmdArgs, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.slice(-4000) };
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ''}\n${error.stderr ?? ''}`.slice(-6000), message: error.message };
  }
}

/** The official trial package as installed in this workspace (black-box reference only). */
function officialDir(name) {
  const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
  const match = fs.readdirSync(pnpmDir).find((entry) => entry.startsWith(`@mescius+${name}@`));
  if (!match) throw new Error(`the official ${name} package is not installed in this workspace`);
  return path.join(pnpmDir, match, 'node_modules', '@mescius', name);
}

const OFFICIAL = {
  core: officialDir('spread-sheets'),
  io: officialDir('spread-sheets-io'),
  designer: officialDir('spread-sheets-designer'),
  resources: officialDir('spread-sheets-designer-resources-en'),
  react: officialDir('spread-sheets-react'),
  barcode: officialDir('spread-sheets-barcode'),
  charts: officialDir('spread-sheets-charts'),
  pdf: officialDir('spread-sheets-pdf'),
  pivot: officialDir('spread-sheets-pivot-addon'),
  print: officialDir('spread-sheets-print'),
  shapes: officialDir('spread-sheets-shapes'),
  tablesheet: officialDir('spread-sheets-tablesheet'),
  slicers: officialDir('spread-sheets-slicers'),
  languagepackages: officialDir('spread-sheets-languagepackages'),
  ganttsheet: officialDir('spread-sheets-ganttsheet'),
  reportsheet: officialDir('spread-sheets-reportsheet-addon'),
  datacharts: officialDir('spread-sheets-datacharts-addon'),
};

const tarballName = (packageDirName) => `opensheets-${packageDirName}-${VERSION}.tgz`;

/* ------------------------------------------------------------- app specs --- */

const VITE_SERVE = ({ appDir }) => [
  { prefix: '/assets', dir: path.join(appDir, 'dist', 'assets') },
  { prefix: '/', dir: path.join(appDir, 'dist') },
];

const APPS_SPEC = [
  {
    id: 'a-vite-core',
    template: 'a-vite-core',
    kind: 'vite',
    title: '(a) plain Vite + TypeScript: import * as GC from the aliased core, theme CSS import',
    aliases: ['spread-sheets'],
    build: true,
    serve: VITE_SERVE,
    required: {
      sheetName: 'Sales',
      formulaValue: 2100,
      chartCount: 1,
      findControlIsWorkbook: true,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
    mustResolveTo: '@mescius only',
  },
  {
    id: 'b-vite-react',
    template: 'b-vite-react',
    kind: 'vite',
    title: '(b) React app: <SpreadSheets><Worksheet><Column/></Worksheet></SpreadSheets>',
    aliases: ['spread-sheets', 'spread-sheets-react'],
    build: true,
    serve: VITE_SERVE,
    required: {
      sheetName: 'Reactive',
      columnWidth: 150,
      formulaValue: 1130,
      chartCount: 1,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
    mustResolveTo: '@mescius only',
  },
  {
    id: 'c-vite-designer',
    template: 'c-vite-designer',
    kind: 'vite',
    title: '(c) Designer app: new GC.Spread.Sheets.Designer.Designer(host) in a Vite app',
    aliases: ['spread-sheets', 'spread-sheets-designer', 'spread-sheets-designer-resources-en'],
    build: true,
    serve: VITE_SERVE,
    viewport: { width: 1280, height: 800 },
    fullPage: true,
    mustResolveTo: '@mescius only',
    required: {
      designerInstalledOnAppGC: true,
      hostedWorkbookIsCoreWorkbook: true,
      sheetName: 'Design',
      formulaValue: 2100,
      chartCount: 1,
      resourceBoldLabel: 'Bold',
    },
    positive: { 'dom.canvasCount': 1, 'dom.designerContainers': 1, 'dom.ribbonTabs': 8, commandCount: 100 },
  },
  {
    id: 'd-cjs-node',
    template: 'd-cjs-node',
    kind: 'esbuild-cjs',
    title: '(d) CommonJS app: require("@mescius/spread-sheets") under Node and bundled for the browser',
    aliases: ['spread-sheets'],
    build: true,
    nodeRun: ['node', 'src/main.cjs'],
    serve: ({ appDir }) => [
      { prefix: '/bundle.js', file: path.join(appDir, 'dist', 'bundle.js') },
      { prefix: '/bundle.css', file: path.join(appDir, 'dist', 'bundle.css') },
      { prefix: '/', dir: appDir },
    ],
    required: {
      sheetName: 'CJS',
      formulaValue: 2100,
      chartCount: 1,
      findControlIsWorkbook: true,
      restoredFormulaValue: 2100,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
  },
  {
    id: 'e-umd-script',
    template: 'e-umd-script',
    kind: 'static',
    title: '(e) UMD page: <script> tags straight out of node_modules, window.GC (+ IO plugin)',
    aliases: ['spread-sheets', 'spread-sheets-io'],
    serve: ({ appDir }) => [
      { prefix: '/node_modules', dir: path.join(appDir, 'node_modules') },
      { prefix: '/', dir: appDir },
    ],
    required: {
      globalGCType: 'object',
      workbookCtorType: 'function',
      ioMethods: ['function', 'function', 'function', 'function'],
      sheetName: 'Script',
      formulaValue: 2100,
      formattedTotal: '2,100',
      chartCount: 1,
      findControlIsWorkbook: true,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
  },
  {
    // GAP-52-3 closure (TASK 59): the React wrapper's script-tag build
    // (`dist/gc.spread.sheets.react.min.js`, the official file name) loaded
    // through <script> tags with the React/ReactDOM UMD globals.
    id: 'f-umd-react',
    template: 'f-umd-react',
    kind: 'static',
    title: '(f) React wrapper through script tags: React/ReactDOM UMD + gc.spread.sheets.react.min.js renders <SpreadSheets><Worksheet>',
    aliases: ['spread-sheets', 'spread-sheets-react'],
    serve: ({ appDir }) => [
      { prefix: '/node_modules', dir: path.join(appDir, 'node_modules') },
      { prefix: '/', dir: appDir },
    ],
    required: {
      reactGlobalType: 'object',
      reactDOMGlobalType: 'object',
      reactNamespaceType: 'object',
      namespaceKeys: ['Column', 'SpreadSheets', 'Worksheet'],
      sheetName: 'Reactive',
      columnWidth: 150,
      formulaValue: 1130,
      chartCount: 1,
      workbookInitialized: true,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
    mustResolveTo: '@mescius only',
  },
  {
    // TASK 73: the barcode add-in package is a real install. An app that aliases
    // `@mescius/spread-sheets-barcode` to us must keep getting `BC_*` (the core-only answer is
    // `#NAME?`, like the trial; after the add-in loads, the formula evaluates the barcode record).
    id: 'g-vite-barcode',
    template: 'g-vite-barcode',
    kind: 'vite',
    title: '(g) barcode add-in app: aliased core + @mescius/spread-sheets-barcode, =BC_QRCODE("x") evaluates the barcode record',
    aliases: ['spread-sheets', 'spread-sheets-barcode'],
    build: true,
    serve: VITE_SERVE,
    required: {
      sheetName: 'Barcode',
      // `getFormula` returns the formula text without the leading `=` — measured identical on
      // the official twin (g-vite-barcode-official), like every other SpreadJS scenario here.
      formulaText: 'BC_QRCODE("Drop In")',
      displayText: '',
      barcodeName: 'BC_QRCODE',
      recordText: 'Drop In',
      recordIsBarcode: true,
      findControlIsWorkbook: true,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
    mustResolveTo: '@mescius only',
  },
  {
    // TASK 76: EVERY official add-in aliased to our package of the same name, imported by one
    // app. The build must resolve all thirteen @mescius/* names to our tarballs, and the page
    // must show a chart, a shape, a slicer, a pivot table and a paginated print preview
    // (plus the barcode/IO features and the tablesheet/gantt/report/language-packages hosts).
    id: 'h-vite-addons',
    template: 'h-vite-addons',
    kind: 'vite',
    title: '(h) all add-ins app: core + 12 aliased add-in packages; chart, shape, slicer, pivot and print preview all work',
    aliases: [
      'spread-sheets',
      'spread-sheets-io',
      'spread-sheets-barcode',
      'spread-sheets-charts',
      'spread-sheets-shapes',
      'spread-sheets-print',
      'spread-sheets-pdf',
      'spread-sheets-languagepackages',
      'spread-sheets-ganttsheet',
      'spread-sheets-pivot-addon',
      'spread-sheets-reportsheet-addon',
      'spread-sheets-slicers',
      'spread-sheets-tablesheet',
    ],
    build: true,
    serve: VITE_SERVE,
    viewport: { width: 1280, height: 760 },
    required: {
      sheetName: 'Addons',
      formulaValue: 2100,
      chartCount: 1,
      chartName: 'UnitsChart',
      shapeCount: 1,
      shapeName: 'Box',
      pivotCount: 1,
      slicerCount: 1,
      slicerField: 'Region',
      printApi: true,
      printShowGridLine: true,
      // The manual row page break at row 8 must split the sheet into two print-preview pages
      // (our core's paginator; the official trial bundle answers null — recorded, not gated).
      printPageCount: 2,
      pdfApi: true,
      barcodeName: 'BC_QRCODE',
      recordIsBarcode: true,
      ioMethods: ['function', 'function', 'function', 'function'],
      tableSheetApi: true,
      ganttApi: true,
      reportApi: true,
      languagePackagesApi: true,
      findControlIsWorkbook: true,
    },
    positive: { 'dom.canvasCount': 1, 'dom.sheetHosts': 1 },
    mustResolveTo: '@mescius only',
  },
];

/** Black-box twins: the same page scripts against the official trial packages. */
/** Script tags of official add-on packages the trial needs for scenarios our core already covers. */
const OFFICIAL_ADDON_SCRIPTS = [
  ['shapes', 'dist/gc.spread.sheets.shapes.min.js'],
  ['charts', 'dist/gc.spread.sheets.charts.min.js'],
  ['barcode', 'dist/gc.spread.sheets.barcode.min.js'],
  ['print', 'dist/gc.spread.sheets.print.min.js'],
  ['pdf', 'dist/gc.spread.sheets.pdf.min.js'],
  ['io', 'dist/gc.spread.sheets.io.min.js'],
  ['pivot-addon', 'dist/gc.spread.pivot.pivottables.min.js'],
  ['tablesheet', 'dist/gc.spread.sheets.tablesheet.min.js'],
  ['slicers', 'dist/gc.spread.sheets.slicers.min.js'],
  ['languagepackages', 'dist/gc.spread.calcengine.languagepackages.min.js'],
  ['ganttsheet', 'dist/gc.spread.sheets.ganttsheet.min.js'],
  ['reportsheet-addon', 'dist/gc.spread.report.reportsheet.min.js'],
  ['datacharts-addon', 'dist/gc.spread.sheets.datacharts.min.js'],
]
  .map(([name, file]) => `<script src="./node_modules/@mescius/spread-sheets-${name}/${file}"></script>`)
  .join('\n    ');

const TWINS = [
  {
    id: 'e-umd-official',
    fromTemplate: 'e-umd-script',
    title: '(e) the identical page against the official trial (core + IO through script tags)',
    serve: [
      { prefix: '/node_modules/@mescius/spread-sheets-io', dir: OFFICIAL.io },
      { prefix: '/node_modules/@mescius/spread-sheets', dir: OFFICIAL.core },
    ],
    extraScripts: `<script src="./node_modules/@mescius/spread-sheets-shapes/dist/gc.spread.sheets.shapes.min.js"></script>
    <script src="./node_modules/@mescius/spread-sheets-charts/dist/gc.spread.sheets.charts.min.js"></script>`,
    serve2: [
      { prefix: '/node_modules/@mescius/spread-sheets-shapes', dir: OFFICIAL.shapes },
      { prefix: '/node_modules/@mescius/spread-sheets-charts', dir: OFFICIAL.charts },
    ],
    gated: false,
    compareWith: 'e-umd-script',
    ignoreKeys: ['hostClasses', 'canvasCountSeen'],
  },
  {
    id: 'c-umd-ours',
    fromTemplate: 'u-umd-designer',
    title: '(c) our Designer through script tags / window.GC (the published browser bundle)',
    reuseInstallOf: 'c-vite-designer',
    gated: true,
    required: {
      designerInstalled: true,
      sheetName: 'Design',
      formulaValue: 2100,
      chartCount: 1,
      resourceBoldLabel: 'Bold',
    },
    positive: { 'dom.canvasCount': 1, 'dom.designerContainers': 1, 'dom.ribbonTabs': 8, commandCount: 100 },
    compareWith: 'c-vite-designer',
    ignoreKeys: ['commandCount'],
    viewport: { width: 1280, height: 800 },
    fullPage: true,
  },
  {
    id: 'c-umd-official',
    fromTemplate: 'u-umd-designer',
    title: '(c) the identical script-tag page against the official trial designer',
    serve: [
      { prefix: '/node_modules/@mescius/spread-sheets-designer-resources-en', dir: OFFICIAL.resources },
      { prefix: '/node_modules/@mescius/spread-sheets-designer', dir: OFFICIAL.designer },
      { prefix: '/node_modules/@mescius/spread-sheets', dir: OFFICIAL.core },
    ],
    extraScripts: OFFICIAL_ADDON_SCRIPTS,
    serve2: [
      { prefix: '/node_modules/@mescius/spread-sheets-charts', dir: OFFICIAL.charts },
      { prefix: '/node_modules/@mescius/spread-sheets-shapes', dir: OFFICIAL.shapes },
      { prefix: '/node_modules/@mescius/spread-sheets-barcode', dir: OFFICIAL.barcode },
      { prefix: '/node_modules/@mescius/spread-sheets-print', dir: OFFICIAL.print },
      { prefix: '/node_modules/@mescius/spread-sheets-pdf', dir: OFFICIAL.pdf },
      { prefix: '/node_modules/@mescius/spread-sheets-io', dir: OFFICIAL.io },
      { prefix: '/node_modules/@mescius/spread-sheets-pivot-addon', dir: OFFICIAL.pivot },
      { prefix: '/node_modules/@mescius/spread-sheets-tablesheet', dir: OFFICIAL.tablesheet },
      { prefix: '/node_modules/@mescius/spread-sheets-slicers', dir: OFFICIAL.slicers },
      { prefix: '/node_modules/@mescius/spread-sheets-languagepackages', dir: OFFICIAL.languagepackages },
      { prefix: '/node_modules/@mescius/spread-sheets-ganttsheet', dir: OFFICIAL.ganttsheet },
      { prefix: '/node_modules/@mescius/spread-sheets-reportsheet-addon', dir: OFFICIAL.reportsheet },
      { prefix: '/node_modules/@mescius/spread-sheets-datacharts-addon', dir: OFFICIAL.datacharts },
    ],
    gated: false,
    compareWith: 'c-umd-ours',
    viewport: { width: 1280, height: 800 },
    fullPage: true,
  },
  {
    id: 'b-vite-react-official',
    fromTemplate: 'z-official-react',
    title: '(b) the same React app built against the official React wrapper (black-box reference)',
    install: true,
    build: true,
    serve: VITE_SERVE,
    gated: false,
    compareWith: 'b-vite-react',
    viewport: { width: 1280, height: 760 },
  },
  {
    id: 'f-umd-react-official',
    fromTemplate: 'z-official-react-umd',
    title: '(f) the identical React script-tag page against the official wrapper UMD (black-box reference)',
    install: true,
    gated: false,
    compareWith: 'f-umd-react',
  },
  {
    id: 'c-vite-designer-official',
    fromTemplate: 'z-official-designer',
    title: '(c) the same Designer app built against the official packages (black-box reference)',
    install: true,
    build: true,
    serve: VITE_SERVE,
    gated: false,
    compareWith: 'c-vite-designer',
    viewport: { width: 1280, height: 800 },
    fullPage: true,
  },
  {
    id: 'g-vite-barcode-official',
    fromTemplate: 'z-official-barcode',
    title: '(g) the same barcode app built against the official trial core + barcode add-in (black-box reference)',
    install: true,
    build: true,
    serve: VITE_SERVE,
    gated: false,
    compareWith: 'g-vite-barcode',
  },
  {
    id: 'h-vite-addons-official',
    fromTemplate: 'z-official-addons',
    title: '(h) the same all-add-ins app built against the official trial packages (black-box reference)',
    install: true,
    build: true,
    serve: VITE_SERVE,
    gated: false,
    compareWith: 'h-vite-addons',
    viewport: { width: 1280, height: 760 },
  },
];



/* ------------------------------------------------------------- utilities --- */

function materialize(templateDir, dir, substitutions = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const source = path.join(TEMPLATES, templateDir);
  const walk = (from, to) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        walk(src, dst);
        continue;
      }
      let body = fs.readFileSync(src, 'utf8');
      body = body.replaceAll('{{TARBALLS}}', TARBALLS).replaceAll('{{VERSION}}', VERSION);
      body = body.replaceAll('{{EXTRA_SCRIPT}}', substitutions.extraScript ?? '');
      for (const [key, value] of Object.entries(substitutions.official ?? {}))
        body = body.replaceAll(`{{OFFICIAL_${key}}}`, value);
      fs.writeFileSync(dst, body);
    }
  };
  walk(source, dir);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** Where each aliased package resolves to inside the installed tree. */
function resolutionReport(appDir, names) {
  const script = `const { createRequire } = require('node:module');
const req = createRequire(${JSON.stringify(path.join(appDir, 'probe.cjs'))});
const out = {};
for (const name of ${JSON.stringify(names)}) {
  try { out[name] = req.resolve(name); } catch (error) { out[name] = 'UNRESOLVED: ' + error.message; }
}
process.stdout.write(JSON.stringify(out));`;
  const result = exec(process.execPath, ['-e', script], ROOT);
  if (!result.ok) return { ok: false, raw: result.out };
  const paths = JSON.parse(result.out);
  for (const [name, file] of Object.entries(paths)) {
    if (typeof file === 'string' && !file.startsWith(path.join(appDir, 'node_modules')))
      paths[name] = `RESOLVED OUTSIDE THE APP: ${file}`;
  }
  return { ok: true, paths };
}

/** Every copy of an @opensheets package that the installed tree holds, under any alias name. */
function packageInstances(appDir) {
  const found = new Set();
  const scan = (at, depth) => {
    if (depth > 6 || !fs.existsSync(at)) return;
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(at, entry.name);
      if (entry.name.startsWith('@')) {
        scan(full, depth + 1);
        continue;
      }
      const manifest = path.join(full, 'package.json');
      if (fs.existsSync(manifest)) {
        const name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
        if (typeof name === 'string' && name.startsWith('@opensheets/')) found.add(`${name} at ${path.relative(appDir, full)}`);
      }
      if (entry.name === 'node_modules') scan(full, depth + 1);
    }
  };
  scan(path.join(appDir, 'node_modules'), 0);
  return [...found].sort();
}

function serveRules(appDir, spec) {
  const rules = (typeof spec.serve === 'function' ? spec.serve({ appDir }) : spec.serve) ?? [{ prefix: '/', dir: appDir }];
  return rules
    .map((rule) => ({ prefix: rule.prefix.replace(/\/+$/, ''), dir: rule.dir ?? null, file: rule.file ?? null }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

async function runPage(browser, spec, appDir, screenshot) {
  const rules = serveRules(appDir, spec);
  const page = await browser.newPage({ viewport: spec.viewport ?? { width: 1280, height: 760 } });
  const consoleErrors = [];
  const pageErrors = [];
  const pageCrashed = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => pageErrors.push(String(error.message).split('\n')[0].slice(0, 300)));
  page.on('requestfailed', (request) => consoleErrors.push(`requestfailed ${request.url()} ${request.failure()?.errorText ?? ''}`));
  const read = (file) => ({
    status: 200,
    contentType: MIME[path.extname(file)] ?? 'application/octet-stream',
    body: fs.readFileSync(file),
  });
  await page.route('**/*', (route) => {
    const key = new URL(route.request().url()).pathname;
    for (const rule of rules) {
      if (rule.file && key === rule.prefix) return void route.fulfill(read(rule.file));
      if (!rule.dir) continue;
      let relative = null;
      if (rule.prefix === '') relative = key.replace(/^\//, '');
      else if (key === rule.prefix) relative = 'index.html';
      else if (key.startsWith(`${rule.prefix}/`)) relative = key.slice(rule.prefix.length + 1);
      if (relative === null) continue;
      const file = path.join(rule.dir, relative);
      if (file.startsWith(rule.dir) && fs.existsSync(file) && fs.statSync(file).isFile()) return void route.fulfill(read(file));
    }
    return void route.fulfill({ status: 404, contentType: 'text/plain', body: 'dropin-check: not served' });
  });
  const problems = [];
  let result = null;
  page.on('crash', () => pageCrashed.push('the page process crashed'));
  try {
    const response = await page.goto(`${ORIGIN}/${spec.page ?? 'index.html'}`, { waitUntil: 'load', timeout: 60000 });
    if (!response || !response.ok()) problems.push(`page did not load: HTTP ${response?.status() ?? 'no response'}`);
    await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 90000 });
    // The renderer paints in request frames: let them run before reading and photographing the page.
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 500)));
    }));
    result = await page.evaluate(() => window.__RESULT__ ?? null);
    if (result) {
      result.canvasCountSeen = await page.evaluate(() => {
        let ink = 0;
        let seen = 0;
        for (const canvas of Array.from(document.querySelectorAll('canvas'))) {
          seen += 1;
          try {
            const context = canvas.getContext('2d');
            if (!context || canvas.width === 0 || canvas.height === 0) continue;
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const base = (data[0] << 16) | (data[1] << 8) | data[2];
            for (let i = 0; i < data.length; i += 4) {
              if (((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) !== base) ink += 1;
            }
          } catch {
            ink = -1;
          }
        }
        return { seen, ink };
      });
      result.canvasPaintedPixels = result.canvasCountSeen?.ink ?? -1;
      result.dom = await page.evaluate(() => ({
        canvasCount: document.querySelectorAll('canvas').length,
        buttonCount: document.querySelectorAll('button').length,
        designerContainers: document.querySelectorAll('.gc-designer-container').length,
        sheetHosts: document.querySelectorAll('.opensheets-host, .gc-spread-sheets-host').length,
        controlCount: document.querySelectorAll('button, [role="button"], [class*="btn"]').length,
        ribbonTabs: (() => {
          const container = document.querySelector('.gc-designer-container') ?? document.body;
          // innerText (not textContent): adjacent inline ribbon items have no whitespace between
          // them in textContent, which would glue "FileHomeInsert…" together.
          const text = ` ${(container.innerText ?? container.textContent ?? '').replace(/\s+/g, ' ')} `;
          return ['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Settings'].filter((label) => text.includes(` ${label} `)).length;
        })(),
      }));
    }
  } catch (error) {
    problems.push(`page run failed: ${String(error.message).split('\n')[0]}`);
  }
  try {
    await page.screenshot({ path: screenshot, fullPage: spec.fullPage ?? false });
  } catch (error) {
    problems.push(`screenshot failed: ${String(error.message).split('\n')[0]}`);
  }
  await page.close().catch(() => undefined);
  problems.push(...pageCrashed);
  return { result, problems, consoleErrors: consoleErrors.slice(0, 8), pageErrors: pageErrors.slice(0, 8) };
}

function evaluate(spec, result) {
  if (!result) return ['no __RESULT__ object: the page never reported its state'];
  const failures = [];
  for (const [key, expected] of Object.entries(spec.required ?? {})) {
    const actual = result[key];
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      failures.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  for (const [key, minimum] of Object.entries(spec.positive ?? {})) {
    const actual = key.startsWith('dom.') ? result.dom?.[key.slice(4)] : result[key];
    if (typeof actual !== 'number' || actual < minimum)
      failures.push(`${key}: expected >= ${minimum}, got ${JSON.stringify(actual)}`);
  }
  if (typeof result.canvasPaintedPixels === 'number' && result.canvasPaintedPixels < 2000)
    failures.push(`the canvas painted nothing meaningful (${result.canvasPaintedPixels} pixels differ from the canvas background)`);
  return failures;
}

function compareResults(reference, ours, ignore = []) {
  if (!ours || !reference) return 'not comparable';
  const keys = [...new Set([...Object.keys(ours), ...Object.keys(reference)])].filter((key) => !ignore.includes(key)).sort();
  const diffs = [];
  for (const key of keys) {
    if (JSON.stringify(ours[key]) !== JSON.stringify(reference[key]))
      diffs.push(`${key}: ours ${JSON.stringify(ours[key])} / reference ${JSON.stringify(reference[key])}`);
  }
  return { keys: keys.length, identical: keys.length - diffs.length, diffs };
}

/* ------------------------------------------------------------------ main --- */

async function main() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(ROOT, '.playwright-browsers');
  if (PACK) {
    fs.mkdirSync(TARBALLS, { recursive: true });
    for (const dir of fs.readdirSync(PACKAGES)) {
      const manifestPath = path.join(PACKAGES, dir, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (pkg.private || !pkg.name?.startsWith('@opensheets/')) continue;
      const packed = exec('npm', ['pack', '--pack-destination', TARBALLS, '--no-color'], path.join(PACKAGES, dir));
      if (!packed.ok) throw new Error(`npm pack failed for ${pkg.name}: ${packed.out}`);
    }
  }
  if (!ONLY) fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const officialTokens = OFFICIAL;
  const missing = APPS_SPEC
    .flatMap((spec) => spec.aliases.map((name) => path.join(TARBALLS, tarballName(name))))
    .filter((file) => !fs.existsSync(file));
  if (missing.length) throw new Error(`tarball(s) missing, run with --pack first: ${missing.join(', ')}`);

  const report = [];
  // Playwright resolves its browser registry when the module loads, so the env var is set first
  // and the import happens inside main().
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();

  for (const spec of APPS_SPEC) {
    if (!selected(spec.id)) continue;
    const appDir = path.join(APPS, spec.id);
    const entry = { id: spec.id, title: spec.title, ok: false, status: 'running', problems: [], steps: {} };
    report.push(entry);
    log(`> ${spec.id}: materialize + install`);
    materialize(spec.template, appDir);

    const install = exec('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=warn', `--cache=${CACHE}`], appDir);
    entry.steps.install = install.ok ? 'ok' : `FAILED\n${install.out}`;
    if (!install.ok) {
      entry.problems.push('npm install from the local tarballs failed');
      entry.status = 'install-failed';
      continue;
    }
    entry.steps.resolved = resolutionReport(appDir, spec.aliases.map((name) => `@mescius/${name}`));
    entry.steps.packageInstances = packageInstances(appDir);
    if (spec.mustResolveTo) {
      const foreign = Object.values(entry.steps.resolved.paths ?? {}).filter((file) => typeof file === 'string' && file.startsWith('RESOLVED OUTSIDE'));
      if (foreign.length) entry.problems.push(`an aliased package resolved outside the app tree: ${foreign.join(' | ')}`);
      const coreCopies = entry.steps.packageInstances.filter((item) => item.startsWith('@opensheets/spread-sheets at '));
      if (coreCopies.length !== 1) entry.problems.push(`the installed tree must hold exactly one copy of the core, it holds ${coreCopies.length}: ${coreCopies.join(', ')}`);
    }

    if (spec.kind !== 'static') {
      const typecheck = exec(path.join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], appDir);
      entry.steps.typecheck = typecheck.ok ? 'ok' : `FAILED\n${typecheck.out}`;
      if (!typecheck.ok) entry.problems.push('tsc --noEmit against the installed typings failed');
    }
    if (spec.build) {
      const built = exec('npm', ['run', '--silent', 'build'], appDir);
      entry.steps.build = built.ok ? 'ok' : `FAILED\n${built.out}`;
      if (!built.ok) entry.problems.push(`${spec.kind} build failed`);
    }
    if (spec.nodeRun) {
      const nodeRun = exec(spec.nodeRun[0], spec.nodeRun.slice(1), appDir);
      entry.steps.nodeRun = nodeRun.ok ? JSON.parse(nodeRun.out) : `FAILED\n${nodeRun.out}`;
      if (!nodeRun.ok) entry.problems.push('the CommonJS entry point failed under Node');
    }

    log(`> ${spec.id}: page run`);
    const run = await runPage(browser, spec, appDir, path.join(SHOTS, `${spec.id}.png`));
    entry.steps.result = run.result;
    entry.steps.pageErrors = run.pageErrors;
    entry.steps.consoleErrors = run.consoleErrors;
    entry.screenshot = `screenshots/${spec.id}.png`;
    entry.problems.push(...run.problems, ...evaluate(spec, run.result));
    if (run.pageErrors.length) entry.problems.push(`uncaught page errors: ${run.pageErrors.join(' | ')}`);
    entry.ok = entry.problems.length === 0;
    entry.status = entry.ok ? 'ok' : 'failed';
  }

  // GAP-52-1 (TASK 52) is closed in product code: the designer package now imports the core
  // through the specifier the application installs (peerDependency `@mescius/spread-sheets`), so
  // npm lays out ONE core copy and `new GC.Spread.Sheets.Designer.Designer(host)` boots without a
  // consumer-side alias bridge. This block verifies the closure instead of working around the gap:
  // it fails when a second copy of the core is laid out in the installed tree.
  const designer = report.find((item) => item.id === 'c-vite-designer');
  if (designer?.steps.install === 'ok') {
    const instances = designer.steps.packageInstances ?? [];
    // The aliased copy (`node_modules/@mescius/...`, whose package.json still carries the published
    // @opensheets name) is the ONE legal copy; a copy under the plain `@opensheets/...` path is the
    // second core instance GAP-52-1 measured, and it must be gone.
    const coreInstances = instances.filter((item) => item.startsWith('@opensheets/spread-sheets at '));
    const unaliased = coreInstances.filter((item) => !item.includes(' at node_modules/@mescius/'));
    if (unaliased.length || coreInstances.length > 1)
      designer.problems.push(`GAP-52-1 is not closed: the installed tree holds ${coreInstances.length} copies of the core (${coreInstances.join(', ')}).`);
    designer.ok = designer.problems.length === 0;
    designer.status = designer.ok ? 'ok' : 'failed';
    designer.steps.gapClosure = {
      key: 'GAP-52-1',
      status: designer.ok && !unaliased.length && coreInstances.length === 1
        ? 'closed - no bridge: one core copy (the aliased one), Designer installed on the GC the app imported'
        : 'NOT closed',
      coreCopies: coreInstances,
      unaliasedCoreCopies: unaliased,
      packageInstances: instances,
      designerInstalledOnAppGC: designer.steps.result?.designerInstalledOnAppGC ?? null,
      hostedWorkbookIsCoreWorkbook: designer.steps.result?.hostedWorkbookIsCoreWorkbook ?? null,
      build: designer.steps.build,
      typecheck: designer.steps.typecheck,
      note: 'TASK 52 ran this app a second time through a consumer-side vite alias bridge (vite.config.bridged.mjs + .bridged/core-bridge.js). The bridge is gone: the sample is built and run exactly as npm installs it.',
    };
  }

  for (const twin of TWINS) {
    if (!selected(twin.id)) continue;
    const appDir = path.join(APPS, twin.id);
    const entry = {
      id: twin.id,
      title: twin.title,
      ok: false,
      gated: twin.gated !== false,
      status: twin.gated === false ? 'black-box reference (official trial, watermarked; not gated)' : 'running',
      problems: [],
      steps: {},
      screenshot: `screenshots/${twin.id}.png`,
    };
    report.push(entry);
    log(`> ${twin.id}: materialize${twin.install ? ' + install' : ''}`);
    materialize(twin.fromTemplate, appDir, { extraScript: twin.extraScript ?? twin.extraScripts, official: officialTokens });
    if (twin.reuseInstallOf) {
      const source = path.join(APPS, twin.reuseInstallOf, 'node_modules');
      if (!fs.existsSync(source)) {
        entry.status = 'skipped';
        entry.problems.push('the app whose install it reuses failed');
        continue;
      }
      fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });
      for (const item of fs.readdirSync(source))
        fs.cpSync(path.join(source, item), path.join(appDir, 'node_modules', item), { recursive: true });
    }
    if (twin.install) {
      const install = exec('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=warn', `--cache=${CACHE}`], appDir);
      entry.steps.install = install.ok ? 'ok' : `FAILED\n${install.out}`;
      if (!install.ok) {
        entry.problems.push('npm install failed');
        entry.status = 'install-failed';
        continue;
      }
      entry.steps.packageInstances = packageInstances(appDir);
    }
    if (twin.build) {
      const built = exec('npm', ['run', '--silent', 'build'], appDir);
      entry.steps.build = built.ok ? 'ok' : `FAILED\n${built.out}`;
      if (!built.ok) entry.problems.push('build failed');
    }
    log(`> ${twin.id}: page run`);
    const run = await runPage(browser, { ...twin, serve: [...(typeof twin.serve === 'function' ? twin.serve({ appDir }) : twin.serve ?? []), ...(twin.serve2 ?? []), { prefix: '/', dir: appDir }] }, appDir, path.join(SHOTS, `${twin.id}.png`));
    entry.steps.result = run.result;
    entry.steps.pageErrors = run.pageErrors;
    entry.steps.consoleErrors = run.consoleErrors;
    entry.problems.push(...run.problems);
    if (entry.gated) {
      if (run.pageErrors.length) entry.problems.push(`uncaught page errors: ${run.pageErrors.join(' | ')}`);
      entry.problems.push(...evaluate(twin, run.result));
    }
    if (twin.compareWith) {
      const other = report.find((item) => item.id === twin.compareWith);
      entry.steps.comparedWith = compareResults(run.result, other?.steps?.result, twin.ignoreKeys);
    }
    entry.ok = entry.problems.length === 0;
    if (entry.ok) entry.status = entry.gated ? 'ok' : 'reference run recorded';
  }

  await browser.close();
  fs.writeFileSync(path.join(T52, 'dropin-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  for (const entry of report) {
    const mark = entry.gap ? 'GAP ' : entry.gated === false ? (entry.ok ? 'REF ' : 'ref~') : entry.ok ? 'OK  ' : 'FAIL';
    log(`${mark} ${entry.id} - ${entry.title}`);
    for (const problem of entry.problems.slice(0, 8)) log(`     - ${problem}`);
  }
  const gaps = report.filter((entry) => entry.gap);
  const references = report.filter((entry) => entry.gated === false);
  const failing = report.filter((entry) => !entry.ok && !entry.gap && entry.gated !== false);
  log(`${report.length - failing.length - gaps.length - references.length} gated runs green (${failing.length} gated failures, ${gaps.length} recorded gap, ${references.length} black-box reference runs)`);
  if (failing.length) process.exitCode = 1;
}

main().catch((error) => {
  log(`dropin-check crashed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
