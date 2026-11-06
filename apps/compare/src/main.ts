// The official trial is executed as an opaque black box in this app only.
import * as Official from '@mescius/spread-sheets';
import OpenSheets from '@opensheets/spread-sheets';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.css';
import './style.css';
import { scenarios, selectScenario } from './scenarios/index.js';

declare global {
  interface Window {
    __referenceGC: typeof Official;
    __implementationGC: typeof OpenSheets;
    __compare?: { ready: boolean; scenario: string; official: InstanceType<typeof Official.Spread.Sheets.Workbook>; ours: InstanceType<typeof OpenSheets.Spread.Sheets.Workbook> };
  }
}
window.__referenceGC = Official;
window.__implementationGC = OpenSheets;
const root = document.getElementById('root')!;
root.innerHTML = '<header><div><p>OPENSHEETS / COMPATIBILITY LAB</p><h1>Workbook comparison</h1></div><label>Scenario <select id="scenario"></select></label></header><main><section><h2>SpreadJS 19.2.5 · trial</h2><div id="official-pane" class="pane"></div></section><section><h2>OpenSheets 0.1.0</h2><div id="ours-pane" class="pane"></div></section></main><p class="note">The same scenario runs in both panes. Black-box rendering and interaction comparison.</p>';
try {
  const scenario = selectScenario(new URLSearchParams(location.search).get('scenario'));
  const select = document.getElementById('scenario') as HTMLSelectElement;
  for (const item of scenarios) select.add(new Option(item.title, item.name));
  select.value = scenario.name;
  select.addEventListener('change', () => { const url = new URL(location.href); url.searchParams.set('scenario', select.value); location.href = url.href; });
  const options = { sheetCount: scenario.sheetCount };
  const official = new Official.Spread.Sheets.Workbook(document.getElementById('official-pane')!, options);
  const ours = new OpenSheets.Spread.Sheets.Workbook(document.getElementById('ours-pane')!, options);
  window.__compare = { ready: false, scenario: scenario.name, official, ours };
  scenario.run(official);
  scenario.run(ours);
  ours.refresh();
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (scenario.name === 'editing') ours.getActiveSheet().startEdit(false);
  window.__compare.ready = true;
  window.addEventListener('beforeunload', () => { official.destroy(); ours.destroy(); });
} catch (error) {
  const notice = document.createElement('pre'); notice.setAttribute('role', 'alert'); notice.textContent = String(error); root.append(notice);
  throw error;
}
