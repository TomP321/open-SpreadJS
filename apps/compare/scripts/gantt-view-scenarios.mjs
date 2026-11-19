/**
 * TASK 36b item 4: screenshot the GanttSheet *view* scenarios in both the official trial and
 * OpenSheets (same public-API script for both) and report the pixel diff percentage per
 * scenario. Scenarios: default project, summary + milestone outline, non-working time shading
 * colour, and a timescale zoom. No masking and no filler content: every pixel of the sheet
 * canvas participates in the diff.
 *
 * Run directly (`node gantt-view-scenarios.mjs`) to start the compare server on 5187 and print
 * the report, or import {@link runGanttViewScenarios} from another harness that already has a
 * browser and a served `gantt-comparison.html` page.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(root, '.playwright-browsers');

export const VIEW_SCENARIOS = ['default', 'summary-milestone', 'non-working', 'timescale-zoom', 'dependencies'];

/** Runs in the page for one (kind, scenario); uses only the public GanttSheet API. */
export const BUILD_SOURCE = `
  const scenario = window.__scenario, ours = window.__kind === 'ours';
  document.body.innerHTML = ours
    ? '<div id="host" class="opensheets-host" style="position:absolute;left:8px;top:8px;width:1200px;height:600px"></div>'
    : '<div id="host" style="position:absolute;left:8px;top:8px;width:1200px;height:600px"></div>';
  const spread = new GC.Spread.Sheets.Workbook(document.getElementById('host'), { sheetCount: 0 });
  const sheet = spread.addSheetTab(0, 'GanttSheet1', GC.Spread.Sheets.SheetType.ganttSheet);
  const data = [
    { id: 1, taskNumber: 1, name: 'Design', duration: '3 days', start: '2026-11-13 8:00', finish: '2026-11-17 17:00', predecessors: '', mode: 'Auto', complete: 0 },
    { id: 2, taskNumber: 2, name: 'Build', duration: '2 days', start: '2026-11-18 8:00', finish: '2026-11-19 17:00', predecessors: '1', mode: 'Auto', complete: 0 },
    { id: 3, taskNumber: 3, name: 'Milestone', duration: '0 days', start: '2026-11-19 17:00', finish: '2026-11-19 17:00', predecessors: '2', mode: 'Auto', complete: 0 },
    { id: 4, taskNumber: 4, name: 'Manual task', duration: '4 days', start: '2026-11-16 8:00', finish: '2026-11-19 17:00', predecessors: '2', mode: 'Manual', complete: 0 },
  ];
  if (scenario === 'dependencies') {
    // Extra leaf so an SF link can end on its own bar.
    data.push({ id: 5, taskNumber: 5, name: 'Report', duration: '2 days', start: '2026-11-23 8:00', finish: '2026-11-24 17:00', predecessors: '', mode: 'Auto', complete: 0 });
  }
  const table = spread.dataManager().addTable('tasks', {
    batch: true, data,
    schema: { columns: { id: { isPrimaryKey: true, dataType: 'number' }, taskNumber: { dataType: 'number' },
      name: { dataType: 'string' }, duration: { dataType: 'string' }, start: { dataType: 'date' },
      finish: { dataType: 'date' }, predecessors: { dataType: 'string' }, mode: { dataType: 'string' },
      complete: { dataType: 'number' } } },
  });
  const view = table.addView('gv', [
    { value: 'taskNumber', caption: 'NO.', width: 60 },
    { value: 'name', caption: 'Task Name', width: 200 },
    { value: 'duration', caption: 'Duration', width: 90 },
    { value: 'start', caption: 'Start', width: 110 },
    { value: 'finish', caption: 'Finish', width: 110 },
    { value: 'predecessors', caption: 'Predecessors', width: 120 },
  ]);
  await view.fetch();
  sheet.bindGanttView(view);
  if (scenario === 'summary-milestone') {
    // Make task 2 (Build) a summary of tasks 3 and 4: summary bar + nested milestone + manual bar.
    sheet.project.indentTasks([3, 4]);
    sheet.project.resumeSchedule();
  }
  if (scenario === 'dependencies') {
    // Outline (task 2 summarises 3 and 4) plus one link of every type, including arrows that
    // start or end on the summary bar, the milestone diamond and the manual bar.
    sheet.project.indentTasks([3, 4]);
    const project = sheet.project;
    project.resumeSchedule();
    project.getTask(2).predecessors = '1';        // FS into a summary bar
    project.getTask(3).predecessors = '1SS';      // SS into a milestone diamond
    project.getTask(4).predecessors = '1FF';      // FF into a manual bar
    project.getTask(5).predecessors = '3SF';      // SF from the milestone into a leaf bar
    project.resumeSchedule();
  }
  if (scenario === 'non-working') sheet.project.timescale.nonWorkingTime.color = '#E8E8E8';
  if (scenario === 'timescale-zoom') sheet.project.timescale.zoomTo(2.5);
  sheet.suspendPaint();
  sheet.resumePaint();
  await new Promise(done => setTimeout(done, 900));
  const canvas = document.querySelector('#host canvas');
  const rect = canvas.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
`;

/**
 * Screenshot every view scenario for both libraries on `origin` (e.g. `http://127.0.0.1:5187`)
 * and return `{ scenario: { canvas, diffPixels, diffPercent } }`. PNGs land under
 * `.probe/gantt/scenario-<name>-<kind|diff>.png`.
 */
export async function runGanttViewScenarios(browser, origin, page) {
  mkdirSync(resolve(root, '.probe/gantt'), { recursive: true });
  let ownsPage = false;
  if (!page) {
    page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(`${origin}/gantt-comparison.html`);
    ownsPage = true;
  }
  await page.waitForFunction(() => !!window.ganttLibraries);
  const shots = {};
  for (const kind of ['official', 'ours']) {
    // Our stylesheet targets the same class names as the trial's; add it only when the page
    // hosts our library so it can never influence the official screenshots.
    if (kind === 'ours' && !page.__ganttViewStyleAdded) {
      await page.addStyleTag({ path: resolve(root, 'packages/spread-sheets/styles/gc.spread.sheets.css') });
      page.__ganttViewStyleAdded = true;
    }
    for (const scenario of VIEW_SCENARIOS) {
      await page.evaluate(({ kind, scenario }) => { window.__kind = kind; window.__scenario = scenario; }, { kind, scenario });
      const rect = await page.evaluate(({ kind, source }) => {
        const GC = window.ganttLibraries[kind];
        return new Function('GC', `return (async () => { ${source} })()`)(GC);
      }, { kind, source: BUILD_SOURCE });
      const file = `.probe/gantt/scenario-${scenario}-${kind}.png`;
      await page.screenshot({ path: file, clip: { x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height) } });
      shots[scenario] = shots[scenario] ?? {};
      shots[scenario][kind] = { file, ...rect };
    }
  }

  const report = {};
  for (const scenario of VIEW_SCENARIOS) {
    const a = PNG.sync.read(readFileSync(shots[scenario].official.file));
    const b = PNG.sync.read(readFileSync(shots[scenario].ours.file));
    const width = Math.min(a.width, b.width), height = Math.min(a.height, b.height);
    const diff = new PNG({ width, height });
    // Compare the common top-left area of the two canvases (their chrome differs by a few px).
    const aData = crop(a, width, height), bData = crop(b, width, height);
    const changed = pixelmatch(aData, bData, diff.data, width, height, { threshold: 0.1 });
    writeFileSync(`.probe/gantt/scenario-${scenario}-diff.png`, PNG.sync.write(diff));
    report[scenario] = {
      canvas: [width, height],
      diffPixels: changed,
      diffPercent: +(100 * changed / (width * height)).toFixed(2),
    };
  }
  if (ownsPage) await page.close();
  return report;
}

/** Extracts the top-left width x height area of a PNG into a raw RGBA buffer. */
function crop(png, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    png.data.copy(out, y * width * 4, y * png.width * 4, y * png.width * 4 + width * 4);
  return out;
}

// Direct invocation: start the compare server on 5187, run all scenarios, print the report.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(root);
  const { chromium } = await import('@playwright/test');
  const server = spawn(resolve(root, 'apps/compare/node_modules/.bin/vite'),
    ['apps/compare', '--host', '127.0.0.1', '--port', '5187', '--strictPort', '--config', 'apps/compare/vite.config.ts'],
    { cwd: root, stdio: 'ignore' });
  const browser = await chromium.launch({ headless: true });
  try {
    let report = null;
    for (let i = 0; i < 60 && !report; i++) {
      try {
        report = await runGanttViewScenarios(browser, 'http://127.0.0.1:5187');
      } catch (error) {
        if (i === 59) throw error;
        await new Promise(done => setTimeout(done, 300));
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    server.kill();
  }
}
