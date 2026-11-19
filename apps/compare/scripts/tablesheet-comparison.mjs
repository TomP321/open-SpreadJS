import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

process.chdir(resolve(fileURLToPath(new URL('../../..', import.meta.url))));
mkdirSync('.probe', { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.playwright-browsers');

// --- ensure a Vite server for THIS tree answers on our port (5189) -----------
const BASE = process.env.TABLESHEET_COMPARE_URL ?? 'http://127.0.0.1:5189';
async function alive() {
  try { const r = await fetch(BASE + '/data-manager-comparison.html'); return r.ok; } catch { return false; }
}
let server;
if (!(await alive())) {
  server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], {
    cwd: resolve('apps/compare'), stdio: ['ignore', 'ignore', 'inherit'], detached: true,
  });
  for (let i = 0; i < 60 && !(await alive()); i++) await new Promise(r => setTimeout(r, 500));
  if (!(await alive())) { console.error('vite did not come up on ' + BASE); process.exit(1); }
}
const stopServer = () => { if (server) try { process.kill(-server.pid); } catch { /* already gone */ } };
process.on('exit', stopServer);

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/data-manager-comparison.html`);
await page.waitForFunction(() => !!window.dataManagerLibraries);

const scenarios = [
  'initial', 'edit', 'add', 'remove', 'sort', 'filter', 'groupBy', 'removeGroupBy', 'expandGroup', 'expandGroupItem', 'groupOutlinePosition',
  'detailColumnsVisible', 'groupOutlineRowHeader', 'addHierarchyItemAbove', 'addHierarchyItemAfter', 'addHierarchyItemBefore',
  'addHierarchyItemBelow', 'promoteHierarchyLevel', 'demoteHierarchyLevel', 'expandAllHierarchyLevels',
  'collapseAllHierarchyLevels', 'expandHierarchyLevel', 'moveUp', 'moveDown', 'hierarchyFilter',
  'namedSort', 'togglePinnedRows', 'togglePinnedColumns', 'applyTableTheme', 'currentTheme',
  'getTableTheme', 'rowActionOptions', 'setDefaultRowHeight', 'hierarchyParent', 'hierarchyChildrenPath', 'hierarchyLevel',
  'hierarchyOutlineToggle', 'hierarchySorted', 'hierarchySortedEdit', 'hierarchyFilteredEdit',
  'tableSheetPanel', 'panelExternalGroup', 'panelSummary', 'panelVisibilityRefresh', 'findControlHosts', 'applyFreeHeaderArea', 'freeHeaderSpans',
  'applyNamedCellTemplate', 'templateCellState', 'templateStateHover', 'templateFutureRow', 'templateRoundTrip', 'workbookRoundTrip',
  'trialWorkbookImport', 'trialSortedWorkbookImport', 'trialImportsOurWorkbook', 'trialImportsOurSortedWorkbook', 'sortedWorkbookJSON',
  'trialFilteredWorkbookImport', 'trialImportsOurFilteredWorkbook',
  'richJSONTrialImport', 'richJSONImportsOurWorkbook', 'richJSONShape',
  // Print scenarios last: they load the trial's print add-on once (prototype-wide
  // extension) and must not perturb the other scenarios' trial behavior.
  'printInfo', 'tableSheetPageInfo',
  'hierarchyWithoutUnparse_Custom',
  'hierarchyFilteredPromotionRefilter', 'hierarchyFilteredInsertionRefilter', 'hierarchyFilteredInsertionMatching',
  'hierarchyFilteredInsertionExisting',
  'hierarchyFilteredRootInsertion',
  ...['hierarchySortedEdit', 'hierarchyFilteredEdit'].flatMap(mode => [
    'addHierarchyItemAbove', 'addHierarchyItemBefore', 'addHierarchyItemAfter', 'addHierarchyItemBelow',
    'promoteHierarchyLevel', 'demoteHierarchyLevel', 'moveUp', 'moveDown',
  ].map(method => `${mode}_${method}`)),
  ...['Level', 'ChildrenPath'].flatMap(type => ['addHierarchyItemAbove', 'addHierarchyItemBelow',
    'promoteHierarchyLevel', 'demoteHierarchyLevel', 'moveUp', 'moveDown'].map(method => `${method}_${type}`)),
  ...['addHierarchyItemAbove', 'addHierarchyItemBefore', 'addHierarchyItemAfter', 'addHierarchyItemBelow',
    'promoteHierarchyLevel', 'demoteHierarchyLevel', 'moveUp', 'moveDown'].map(method => `${method}_Custom`),
  ...['hierarchySortedEdit', 'hierarchyFilteredEdit'].flatMap(mode => ['addHierarchyItemAfter', 'addHierarchyItemBelow',
    'promoteHierarchyLevel', 'demoteHierarchyLevel', 'moveUp', 'moveDown'].map(method => `${mode}_${method}_Custom`)),
];
const all = {};
const wanted = process.env.TABLESHEET_SCENARIO?.split(',').filter(Boolean);
for (const scenario of scenarios.filter(name => (!wanted || wanted.includes(name))
  && (!process.env.TABLESHEET_SCENARIO_PREFIX || name.startsWith(process.env.TABLESHEET_SCENARIO_PREFIX)))) {
  all[scenario] = {};
  for (const kind of ['official', 'ours']) {
    all[scenario][kind] = await page.evaluate(async ({ kind, scenario }) => {
      document.querySelector('#probe-style')?.remove();
      if (kind === 'ours') {
        const link = document.createElement('link');
        link.id = 'probe-style';
        link.rel = 'stylesheet';
        link.href = '/@fs/home/ubuntu/HDD/spreadjs-strata2/packages/spread-sheets/styles/gc.spread.sheets.css';
        document.head.append(link);
        await new Promise(resolve => { link.onload = resolve; link.onerror = resolve; });
      }
      document.body.innerHTML = '<div id="host" style="width:800px;height:500px"></div>';
      const GC = window.dataManagerLibraries[kind];
      const spread = new GC.Spread.Sheets.Workbook(document.getElementById('host'), { sheetCount: 0 });
      class NameCompare extends GC.Spread.CalcEngine.Functions.Function {
        constructor() { super('NameCompare', 3, 3); }
        evaluate(a, b, ascending) { return (ascending ? -1 : 1) * String(a).localeCompare(String(b)); }
      }
      spread.addCustomFunction(new NameCompare());
      window.probeSpread = spread;
      const parts = scenario.split('_');
      const [operation] = parts;
      // `<mode>_<method>` -> hierarchyType is the edit method (Parent schema).
      // `<op>_<Type>` or `<mode>_<method>_<Type>` -> last segment selects the schema type.
      const typeSuffix = ['Level', 'ChildrenPath', 'Custom', 'Parent'].includes(parts.at(-1)) ? parts.at(-1) : undefined;
      const hierarchyType = typeSuffix ?? parts[1];
      const editMethod = parts[1];
      const hierarchy = /Hierarchy|hierarchy|moveUp|moveDown/.test(scenario);
      const data = Array.from({ length: 50 }, (_, i) => ({
        id: i, parentId: i > 0 && i < 4 ? 0 : null, level: i > 0 && i < 4 ? 1 : 0, children: [], name: `Name ${i}`,
        city: i % 2 ? 'Paris' : 'Rome', score: i * 2, active: i % 2 === 0, order: i,
      }));
      if (scenario === 'hierarchyFilteredInsertionExisting') data.splice(0, data.length,
        { id: 1, parentId: null, order: 0, city: 'Rome' }, { id: 2, parentId: 1, order: 1, city: 'Rome' },
        { id: 3, parentId: 1, order: 2, city: 'Paris' }, { id: 4, parentId: null, order: 3, city: 'Rome' });
      if (scenario === 'hierarchyFilteredRootInsertion') data.splice(0, data.length,
        { id: 1, parentId: null, order: 0, city: 'Rome' }, { id: 2, parentId: null, order: 1, city: 'Paris' },
        { id: 3, parentId: null, order: 2, city: 'Rome' });
      if (scenario === 'hierarchyChildrenPath' || hierarchyType === 'ChildrenPath') data[0].children = data.splice(1, 3);
      if (hierarchyType === 'Custom') data.forEach((row, index) => {
        row.id = index === 0 ? '1' : index < 4 ? `1.${index}` : String(index - 2);
      });
      const schema = hierarchy ? {
        hierarchy: scenario === 'hierarchyChildrenPath' || hierarchyType === 'ChildrenPath' ? { type: 'ChildrenPath', column: 'children' }
          : scenario === 'hierarchyLevel' || hierarchyType === 'Level' ? { type: 'Level', column: 'level' }
            : hierarchyType === 'Custom' ? { type: 'Custom', column: 'id',
              parse: ({ data: row }) => String(row.id).split('.').slice(0, -1).join('.'),
              ...(operation === 'hierarchyWithoutUnparse' ? {} : {
                unparse: ({ index, parentData }) => `${parentData ? `${parentData.id}.` : ''}${index + 1}`,
              }) }
            : { type: 'Parent', column: 'parentId' },
        columns: { id: { isPrimaryKey: true }, parentId: {}, level: {}, children: {}, name: {}, city: {}, score: {}, active: {},
          order: { dataType: 'rowOrder' } },
      } : undefined;
      try {
        const table = spread.dataManager().addTable('t', { data, ...(schema ? { schema } : {}) });
        const view = table.addView('v', [
          { value: 'id', caption: 'ID', width: 80 },
          { value: 'name', caption: 'Name', width: 130, ...(hierarchy ? { outlineColumn: true } : {}) },
          { value: 'city', caption: 'City', width: 100 }, { value: 'score', caption: 'Score', width: 90 },
          { value: 'active', caption: 'Active', width: 90 },
        ]);
        await view.fetch();
        const sheet = spread.addSheetTab(0, 'Data', GC.Spread.Sheets.SheetType.tableSheet);
        sheet.setDataView(view);
        if (['tableSheetPanel', 'panelExternalGroup', 'panelSummary', 'panelVisibilityRefresh'].includes(scenario)) {
          const panelHost = document.createElement('div');
          panelHost.id = 'panel';
          panelHost.style.cssText = 'position:absolute;right:0;top:0;width:230px;height:500px;background:white';
          document.getElementById('host').style.position = 'relative';
          document.getElementById('host').append(panelHost);
        }
        window.probeSheet = sheet;
        window.probeView = view;
        const groups = [
          { field: 'city', caption: 'City', summaryFields: [{ formula: '=SUM([score])', relateTo: 'score' }] },
          { field: 'active', caption: 'Active' },
        ];
        if (['removeGroupBy', 'expandGroup', 'expandGroupItem', 'groupOutlinePosition',
          'detailColumnsVisible', 'groupOutlineRowHeader'].includes(scenario)) sheet.groupBy(groups);
        const filteredWorkbookImport = async sourceGC => {
          const source = new sourceGC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
          const sourceTable = source.dataManager().addTable('trial', { data: [{ name: 'Ada' }, { name: 'Ben' }] });
          const sourceView = sourceTable.addView('people', ['name']);
          await sourceView.fetch();
          const sourceSheet = source.addSheetTab(0, 'Trial', sourceGC.Spread.Sheets.SheetType.tableSheet);
          sourceSheet.setDataView(sourceView);
          sourceSheet.filter([{ field: 'name', values: [{ value: 'Ada' }] }]);
          const json = JSON.parse(JSON.stringify(source.toJSON({ includeBindingSource: true })));
          const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
          await restored.fromJSON(json);
          const tab = restored.getSheetTab('Trial');
          const resultView = tab?.getDataView?.();
          const result = { rows: Array.from({ length: resultView?.visibleLength() ?? 0 }, (_, row) => resultView.getRowData(row)),
            filter: tab?.filter?.(), rowFilter: json.sheetTabs.Trial.rowFilter, view: json.dataManager.tables[0].views[0] };
          source.destroy();
          restored.destroy();
          return result;
        };
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const loadPanelCss = async () => {
          if (document.getElementById('panel-css')) return;
          const link = document.createElement('link');
          link.id = 'panel-css';
          link.rel = 'stylesheet';
          link.href = '/node_modules/@mescius/spread-sheets/styles/gc.spread.sheets.css';
          document.head.append(link);
          await new Promise(r => { link.onload = r; link.onerror = r; });
        };
        const miniWorkbook = host => {
          const fp = host.querySelector('.gc-table-sheet-field-panel');
          if (!fp) return null;
          try { return GC.Spread.Sheets.findControl(fp) ?? null; } catch { return null; }
        };
        const miniValues = wb => {
          const s = wb?.getActiveSheet?.();
          if (!s) return null;
          const clean = v => (v && typeof v === 'object' && 'richText' in v) ? (v.text ?? '[rt]') : v;
          return { rc: s.getRowCount(), cc: s.getColumnCount(),
            values: Array.from({ length: s.getRowCount() }, (_, r) => Array.from({ length: s.getColumnCount() },
              (_, c) => clean(s.getValue(r, c)))) };
        };
        const viewColumnsVisible = () => (view.getColumn() ?? []).map(c => {
          const visible = typeof c.visible === 'function' ? c.visible() : c.visible;
          return { value: String(c.value ?? c.name ?? ''), visible: visible !== false };
        });
        // Panel text without the embedded mini-workbook internals (the reference keeps
        // hidden Spread toolstrip/clipboard DOM inside the field panel; its text is noise).
        const panelText = host => {
          const out = [];
          const walk = el => {
            if (el.classList?.contains('gc-table-sheet-field-panel') || el.tagName === 'CANVAS') return;
            for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) out.push(n.textContent.trim());
            for (const c of el.children) walk(c);
          };
          walk(host);
          return out.join(' ');
        };
        // Shared rich-workbook builders for the TASK 49 item 2 JSON interchange
        // scenarios (mirror of .probe/api-sweep-probe.mjs item2).
        const richBuild = async sourceGC => {
          const wb = new sourceGC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
          const data = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `Name ${i + 1}`,
            city: i % 2 ? 'Paris' : 'Rome', score: (i + 1) * 3 }));
          const table = wb.dataManager().addTable('rich', { data });
          const viewA = table.addView('peopleA', [
            { value: 'id', caption: 'ID', width: 80 }, { value: 'name', caption: 'Name', width: 130 },
            { value: 'city', caption: 'City', width: 100 }, { value: 'score', caption: 'Score', width: 90 }]);
          const viewB = table.addView('peopleB', ['name', 'city']);
          await viewA.fetch();
          await viewB.fetch();
          viewA.getColumn()[2].visible = false; // hidden field (panel-style)
          const sA = wb.addSheetTab(0, 'SheetA', sourceGC.Spread.Sheets.SheetType.tableSheet);
          sA.setDataView(viewA);
          sA.togglePinnedRows([1]);
          sA.togglePinnedColumns([1]);
          sA.rowActionOptions([{ name: 'mark', icons: ['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="12" height="12"%3E'
            + '%3Ccircle cx="6" cy="6" r="4" fill="blue"/%3E%3C/svg%3E'], iconSelector: () => true }]);
          sA.applyTableTheme(sourceGC.Spread.Sheets.Tables.TableThemes.dark1);
          sA.currentTheme('Civic');
          const sB = wb.addSheetTab(1, 'SheetB', sourceGC.Spread.Sheets.SheetType.tableSheet);
          sB.setDataView(viewB);
          sB.groupBy([{ field: 'city', caption: 'City', summaryFields: [{ formula: '=SUM([score])', relateTo: 'score' }] }]);
          sB.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
          await new Promise(r => setTimeout(r, 300));
          const json = JSON.parse(JSON.stringify(wb.toJSON({ includeBindingSource: true })));
          wb.destroy();
          return json;
        };
        const richState = async (targetGC, json) => {
          const wb = new targetGC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
          await wb.fromJSON(json);
          await new Promise(r => setTimeout(r, 300));
          const tab = name => wb.getSheetTab?.(name) ?? wb.getSheetFromName?.(name);
          const themeName = sheet => { try { return sheet?.getTableTheme?.()?.name?.() ?? null; } catch { return null; } };
          const currentName = sheet => {
            try {
              const t = sheet?.currentTheme?.();
              if (typeof t === 'string') return t;
              const j = JSON.parse(JSON.stringify(t));
              return j.name ?? j._ps?.name ?? j._name ?? null;
            } catch { return null; }
          };
          const cols = sheet => (sheet?.getDataView?.()?.getColumn() ?? []).map(c => {
            const visible = typeof c.visible === 'function' ? c.visible() : c.visible;
            return { value: String(c.value ?? c.name ?? ''), width: c.width ?? null, visible: visible !== false };
          });
          const a = tab('SheetA'), b = tab('SheetB');
          const pinnedOf = name => {
            try {
              const views = wb.toJSON(true).dataManager?.tables?.[0]?.views ?? [];
              const view = views.find(v => v.name === name) ?? {};
              return { rows: view.pinnedRows ?? null, cols: view.pinnedColumns ?? null, order: view.columnIndexMap ?? null };
            } catch { return null; }
          };
          const state = {
            A: a && { view: a.getDataView?.()?.name ?? null, cols: cols(a),
              actions: (a.rowActionOptions?.() ?? []).map(o => o.name), themeName: themeName(a), current: currentName(a),
              pinned: pinnedOf('peopleA'), rows: a.getRowCount?.() ?? null },
            B: b && { view: b.getDataView?.()?.name ?? null, groups: JSON.parse(JSON.stringify(b.groupBy?.() ?? null)),
              filter: JSON.parse(JSON.stringify(b.filter?.() ?? null)), pinned: pinnedOf('peopleB') },
          };
          wb.destroy();
          return state;
        };
        const richDigest = json => {
          const sheetA = json.sheetTabs?.SheetA ?? {}, sheetB = json.sheetTabs?.SheetB ?? {};
          const views = json.dataManager?.tables?.[0]?.views ?? [];
          const viewShape = view => ({ keys: Object.keys(view ?? {}).sort(),
            columns: (view?.columns ?? []).map(c => String(c.value ?? c.name ?? '')
              + (c.visible === false ? '(hid)' : '') + (c.width != null ? ':' + c.width : '')),
            columnIndexMap: view?.columnIndexMap ?? null, pinnedRows: view?.pinnedRows ?? null,
            pinnedColumns: view?.pinnedColumns ?? null, groupInfo: view?.groupInfo ?? null, filterInfo: view?.filterInfo ?? null });
          return {
            A: { sheetKeys: Object.keys(sheetA).sort(), additionKeys: Object.keys(sheetA.addition ?? {}).sort(),
              grouping: sheetA.addition?.grouping ?? null, defaults: sheetA.addition?.defaults ?? null,
              optionsKeys: Object.keys(sheetA.addition?.options ?? {}).sort(),
              rowActionNames: (sheetA.addition?.rowActionOptions ?? []).map(o => o.name),
              currentThemeName: sheetA.addition?.currentTheme?.name ?? null,
              lastGroupCount: sheetA.addition?.rowFilter?.lastGroupCount ?? sheetA.rowFilter?.lastGroupCount ?? null,
              names: (sheetA.names ?? []).map(n => n.name), frozen: [sheetA.frozenRowCount ?? null, sheetA.frozenColCount ?? null],
              theme: sheetA.theme ?? null },
            B: { additionKeys: Object.keys(sheetB.addition ?? {}).sort(),
              grouping: sheetB.addition?.grouping ?? null, lastGroupCount: sheetB.addition?.rowFilter?.lastGroupCount ?? sheetB.rowFilter?.lastGroupCount ?? null,
              filterItemMap: sheetB.rowFilter?.filterItemMap ?? null, names: (sheetB.names ?? []).map(n => n.name),
              theme: sheetB.theme ?? null },
            views: views.map(viewShape),
          };
        };
        const loadPrintAddon = async () => {
          if (kind !== 'official' || window.__printAddon) return;
          // The trial print pipeline is an add-on extending the global GC namespace.
          window.GC = GC;
          await import('/node_modules/@mescius/spread-sheets-print/dist/gc.spread.sheets.print.min.js');
          window.__printAddon = true;
          await new Promise(r => setTimeout(r, 200));
        };
        const calls = {          initial: () => undefined,
          edit: () => undefined,
          add: () => sheet.addRow({ id: 50, name: 'New', city: 'Rome', score: 100, active: true }),
          remove: () => sheet.removeRow(1),
          sort: () => sheet.sort([{ field: 'score', ascending: false }]),
          filter: () => sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]),
          groupBy: () => sheet.groupBy(groups),
          removeGroupBy: () => sheet.removeGroupBy(),
          expandGroup: () => sheet.expandGroup('city', false),
          expandGroupItem: () => sheet.expandGroupItem(0, 0, false),
          groupOutlinePosition: () => sheet.groupOutlinePosition(1),
          detailColumnsVisible: () => sheet.detailColumnsVisible(false),
          groupOutlineRowHeader: () => sheet.groupOutlinePosition(2),
          addHierarchyItemAbove: () => sheet.addHierarchyItemAbove(1, { id: 100, name: 'Added' }),
          addHierarchyItemAfter: () => sheet.addHierarchyItemAfter(1, { id: 100, name: 'Added' }),
          addHierarchyItemBefore: () => sheet.addHierarchyItemBefore(1, { id: 100, name: 'Added' }),
          addHierarchyItemBelow: () => sheet.addHierarchyItemBelow(1, { id: 100, name: 'Added' }),
          promoteHierarchyLevel: () => sheet.promoteHierarchyLevel(1),
          demoteHierarchyLevel: () => sheet.demoteHierarchyLevel(2),
          expandAllHierarchyLevels: () => sheet.expandAllHierarchyLevels(),
          collapseAllHierarchyLevels: () => sheet.collapseAllHierarchyLevels(),
          expandHierarchyLevel: () => sheet.expandHierarchyLevel(1),
          moveUp: () => sheet.moveUp(2),
          moveDown: () => sheet.moveDown(1),
          hierarchyFilter: () => sheet.filter([{ field: 'name', paths: [{ path: ['Name 0'] }] }]),
          namedSort: () => sheet.sort([{ field: 'name', ascending: true, compare: 'NameCompare' }]),
          togglePinnedRows: () => sheet.togglePinnedRows([1, 2]),
          togglePinnedColumns: () => sheet.togglePinnedColumns([1, 2]),
          applyTableTheme: () => sheet.applyTableTheme(GC.Spread.Sheets.Tables.TableThemes.dark1),
          currentTheme: () => sheet.currentTheme('Civic'),
          getTableTheme: () => sheet.getTableTheme(),
          hierarchyParent: () => undefined,
          hierarchyChildrenPath: () => undefined,
          hierarchyLevel: () => undefined,
          hierarchyOutlineToggle: () => undefined,
          hierarchySorted: () => sheet.sort([{ field: 'name', ascending: false }]),
          hierarchySortedEdit: () => {
            sheet.sort([{ field: 'name', ascending: false }]);
            if (editMethod?.startsWith('add')) sheet[editMethod](1, { id: 100, name: 'Added' });
            else if (editMethod) sheet[editMethod](1);
            else sheet.moveDown(1);
          },
          hierarchyWithoutUnparse: () => {
            sheet.addHierarchyItemAbove(2, { id: 'new', name: 'Added' });
            sheet.promoteHierarchyLevel(2);
            sheet.demoteHierarchyLevel(2);
            sheet.moveUp(2);
            sheet.moveDown(2);
          },
          hierarchyFilteredEdit: () => {
            sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
            if (editMethod?.startsWith('add')) sheet[editMethod](1, { id: 100, name: 'Added' });
            else if (editMethod) sheet[editMethod](1);
            else sheet.addHierarchyItemBelow(0, { id: 100, name: 'Added' });
          },
          hierarchyFilteredPromotionRefilter: () => {
            const filters = [{ field: 'city', values: [{ value: 'Rome' }] }];
            sheet.filter(filters);
            sheet.promoteHierarchyLevel(1);
            sheet.filter(filters);
          },
          hierarchyFilteredInsertionRefilter: () => {
            const filters = [{ field: 'city', values: [{ value: 'Rome' }] }];
            sheet.filter(filters);
            sheet.addHierarchyItemBelow(0, { id: 100, name: 'Added' });
            const before = Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row));
            sheet.filter(filters);
            return { before, after: Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row)) };
          },
          hierarchyFilteredInsertionMatching: () => {
            sheet.filter([{ field: 'city', values: [{ value: 'Rome' }] }]);
            sheet.addHierarchyItemBelow(0, { id: 100, name: 'Added', city: 'Rome' });
          },
          hierarchyFilteredInsertionExisting: () => {
            const filters = [{ field: 'city', values: [{ value: 'Rome' }] }];
            sheet.filter(filters);
            sheet.addHierarchyItemBelow(0, { id: 5, city: 'Rome' });
            const before = Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row));
            sheet.filter(filters);
            return { before, after: Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row)) };
          },
          hierarchyFilteredRootInsertion: () => {
            const filters = [{ field: 'city', values: [{ value: 'Rome' }] }];
            sheet.filter(filters);
            sheet.addHierarchyItemAfter(0, { id: 4, city: 'Rome' });
            const before = Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row));
            sheet.filter(filters);
            return { before, after: Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row)) };
          },
          applyNamedCellTemplate: () => {
            spread.namedCellTemplates.add('highlight', { style: { backColor: '#ffe080', foreColor: '#202020' } });
            sheet.applyNamedCellTemplate('highlight', ['name']);
            return spread.namedCellTemplates.get('highlight');
          },
          templateCellState: () => {
            const source = new GC.Spread.Sheets.Worksheet();
            const style = new GC.Spread.Sheets.Style();
            style.backColor = 'red';
            source.cellStates.add(new GC.Spread.Sheets.Range(0, 0, 1, 1), GC.Spread.Sheets.CellStatesType.hover, style);
            spread.namedCellTemplates.createFromCell('state', source, 0, 0);
            return spread.namedCellTemplates.get('state');
          },
          templateStateHover: () => {
            const style = new GC.Spread.Sheets.Style();
            style.backColor = 'red';
            spread.namedCellTemplates.add('state', { cellStates: [{ state: GC.Spread.Sheets.CellStatesType.hover, style }] });
            sheet.applyNamedCellTemplate('state', ['name']);
            return spread.namedCellTemplates.get('state');
          },
          templateFutureRow: async () => {
            spread.namedCellTemplates.add('highlight', { style: { backColor: '#ffe080' } });
            sheet.applyNamedCellTemplate('highlight', ['name']);
            await sheet.addRow({ id: 50, name: 'New', city: 'Rome', score: 100, active: true });
            return { length: view.visibleLength(), last: view.getRowData(view.visibleLength() - 1) };
          },
          templateRoundTrip: async () => {
            spread.namedCellTemplates.add('highlight', { style: { backColor: '#ffe080' } });
            sheet.applyNamedCellTemplate('highlight', ['name']);
            const json = spread.toJSON({ includeBindingSource: true });
            const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            await restored.fromJSON(json);
            let tab;
            try { tab = restored.getSheetTab('Data'); } catch { tab = restored.getSheetFromName('Data'); }
            if (typeof tab?.getActualStyle !== 'function') tab = restored.getSheetFromName('Data');
            const result = { backColor: tab?.getActualStyle(0, 1)?.backColor };
            restored.destroy();
            return result;
          },
          workbookRoundTrip: async () => {
            const json = spread.toJSON({ includeBindingSource: true });
            const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            await restored.fromJSON(json);
            let tab;
            try { tab = restored.getSheetTab('Data'); } catch { tab = restored.getSheetFromName('Data'); }
            const result = { sheet: json.sheetTabs?.Data ?? json.sheets?.Data, dataManager: json.dataManager,
              restored: tab ? { first: tab.getDataView?.()?.getRowData(0)?.name,
                hasView: typeof tab.getDataView === 'function' } : null };
            restored.destroy();
            return result;
          },
          sortedWorkbookJSON: () => {
            sheet.sort([{ field: 'name', ascending: false }]);
            const json = spread.toJSON({ includeBindingSource: true });
            return { rowFilter: json.sheetTabs.Data.rowFilter, addition: json.sheetTabs.Data.addition,
              view: json.dataManager.tables[0].views[0] };
          },
          trialFilteredWorkbookImport: async () => filteredWorkbookImport(window.dataManagerLibraries.official),
          trialImportsOurFilteredWorkbook: async () => filteredWorkbookImport(window.dataManagerLibraries.ours),
          richJSONTrialImport: async () => {
            const json = await richBuild(window.dataManagerLibraries.official);
            return { loaded: await richState(GC, json) };
          },
          richJSONImportsOurWorkbook: async () => {
            const json = await richBuild(window.dataManagerLibraries.ours);
            return { loaded: await richState(GC, json) };
          },
          richJSONShape: async () => ({ kindJson: richDigest(await richBuild(GC)) }),
          // TASK 49 item 3: TableSheet print pagination rectangles through Workbook.pageInfo.
          tableSheetPageInfo: async () => {
            await loadPrintAddon();
            const wb = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            const table = wb.dataManager().addTable('t', { data: Array.from({ length: 30 }, (_, i) => ({
              id: i + 1, name: `Name ${i + 1}`, city: i % 2 ? 'Paris' : 'Rome', score: (i + 1) * 7,
              active: i % 3 === 0, note: 'x'.repeat(30) })) });
            const view = table.addView('v', [
              { value: 'id', caption: 'ID', width: 80 }, { value: 'name', caption: 'Name', width: 160 },
              { value: 'city', caption: 'City', width: 120 }, { value: 'score', caption: 'Score', width: 100 },
              { value: 'active', caption: 'Active', width: 90 }, { value: 'note', caption: 'Note', width: 300 }]);
            await view.fetch();
            const printSheet = wb.addSheetTab(0, 'PrintData', GC.Spread.Sheets.SheetType.tableSheet);
            printSheet.setDataView(view);
            await new Promise(r => setTimeout(r, 250));
            const read = () => { try { return JSON.parse(JSON.stringify(wb.pageInfo() ?? null)); } catch (e) { return 'throw:' + String(e).slice(0, 80); } };
            const out = { plain: read(), rows: printSheet.getRowCount() };
            printSheet.printInfo().fitPagesWide(1);
            out.fitWide = read();
            const pi = printSheet.printInfo();
            out.printAreaEcho = (() => { try { return [pi.rowStart(), pi.rowEnd(), pi.columnStart(), pi.columnEnd()]; } catch { return null; } })();
            pi.rowStart(3); pi.rowEnd(12); pi.columnStart(1); pi.columnEnd(2);
            out.printAreaAfterSet = read();
            out.printAreaEcho2 = (() => { try { return [pi.rowStart(), pi.rowEnd(), pi.columnStart(), pi.columnEnd()]; } catch { return null; } })();
            printSheet.groupBy([{ field: 'city' }]);
            await new Promise(r => setTimeout(r, 250));
            out.groupedFitWide = read();
            wb.destroy();
            return out;
          },
          trialWorkbookImport: async () => {
            const official = window.dataManagerLibraries.official;
            const source = new official.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            const sourceTable = source.dataManager().addTable('trial', { data: [{ name: 'Ada' }] });
            const sourceView = sourceTable.addView('people', ['name']);
            await sourceView.fetch();
            source.addSheetTab(0, 'Trial', official.Spread.Sheets.SheetType.tableSheet).setDataView(sourceView);
            const json = JSON.parse(JSON.stringify(source.toJSON({ includeBindingSource: true })));
            const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            await restored.fromJSON(json);
            const tab = restored.getSheetTab('Trial');
            const result = { first: tab?.getDataView?.()?.getRowData(0), hasView: !!tab?.getDataView?.() };
            source.destroy();
            restored.destroy();
            return result;
          },
          trialSortedWorkbookImport: async () => {
            const official = window.dataManagerLibraries.official;
            const source = new official.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            const sourceTable = source.dataManager().addTable('trial', { data: [{ name: 'Ada' }, { name: 'Ben' }] });
            const sourceView = sourceTable.addView('people', ['name']);
            await sourceView.fetch();
            const sourceSheet = source.addSheetTab(0, 'Trial', official.Spread.Sheets.SheetType.tableSheet);
            sourceSheet.setDataView(sourceView);
            sourceSheet.sort([{ field: 'name', ascending: false }]);
            const json = JSON.parse(JSON.stringify(source.toJSON({ includeBindingSource: true })));
            const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            await restored.fromJSON(json);
            const tab = restored.getSheetTab('Trial');
            const view = tab?.getDataView?.();
            const result = { rows: Array.from({ length: view?.visibleLength() ?? 0 }, (_, row) => view.getRowData(row)),
              sort: tab?.sort?.() };
            source.destroy();
            restored.destroy();
            return result;
          },
          trialImportsOurWorkbook: async () => {
            const ours = window.dataManagerLibraries.ours;
            const source = new ours.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            const sourceTable = source.dataManager().addTable('trial', { data: [{ name: 'Ada' }] });
            const sourceView = sourceTable.addView('people', ['name']);
            await sourceView.fetch();
            source.addSheetTab(0, 'Trial', ours.Spread.Sheets.SheetType.tableSheet).setDataView(sourceView);
            const json = JSON.parse(JSON.stringify(source.toJSON({ includeBindingSource: true })));
            const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            await restored.fromJSON(json);
            const tab = restored.getSheetTab('Trial');
            const result = { first: tab?.getDataView?.()?.getRowData(0), hasView: !!tab?.getDataView?.() };
            source.destroy();
            restored.destroy();
            return result;
          },
          trialImportsOurSortedWorkbook: async () => {
            const ours = window.dataManagerLibraries.ours;
            const source = new ours.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            const sourceTable = source.dataManager().addTable('trial', { data: [{ name: 'Ada' }, { name: 'Ben' }] });
            const sourceView = sourceTable.addView('people', ['name']);
            await sourceView.fetch();
            const sourceSheet = source.addSheetTab(0, 'Trial', ours.Spread.Sheets.SheetType.tableSheet);
            sourceSheet.setDataView(sourceView);
            sourceSheet.sort([{ field: 'name', ascending: false }]);
            const json = JSON.parse(JSON.stringify(source.toJSON({ includeBindingSource: true })));
            const restored = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
            await restored.fromJSON(json);
            const tab = restored.getSheetTab('Trial');
            const view = tab?.getDataView?.();
            const result = { rows: Array.from({ length: view?.visibleLength() ?? 0 }, (_, row) => view.getRowData(row)),
              sort: tab?.sort?.() };
            source.destroy();
            restored.destroy();
            return result;
          },
          applyFreeHeaderArea: () => {
            const header = new GC.Spread.Sheets.Worksheet();
            header.setRowCount(2);
            header.setValue(0, 0, 'Summary');
            header.setValue(1, 1, 'Details');
            header.setRowHeight(0, 45);
            sheet.applyFreeHeaderArea(header.toJSON());
            const json = sheet.applyFreeHeaderArea();
            return { rowCount: json?.rowCount, columnCount: json?.columnCount };
          },
          freeHeaderSpans: () => {
            const header = new GC.Spread.Sheets.Worksheet();
            header.setRowCount(2);
            header.setValue(0, 0, 'Merged heading');
            header.addSpan(0, 0, 2, 2);
            sheet.applyFreeHeaderArea(header.toJSON());
            const json = sheet.applyFreeHeaderArea();
            return { rowCount: json?.rowCount, columnCount: json?.columnCount };
          },
          printInfo: async () => {
            await loadPrintAddon();
            const info = sheet.printInfo();
            info.fitPagesWide(2);
            return { fitPagesWide: info.fitPagesWide() };
          },
          // Panel scenarios (TASK 49 item 1): ported to the mini-workbook TableSheetPanel
          // (TASK 33 structure). Trial behaviors probed in .probe/api-sweep-item1.json.
          tableSheetPanel: async () => {
            if (kind === 'official') await loadPanelCss();
            const host = document.getElementById('panel');
            const panel = new GC.Spread.Sheets.TableSheet.TableSheetPanel('fields', sheet, host);
            await sleep(700);
            const mini = miniWorkbook(host);
            return {
              panelFound: GC.Spread.Sheets.TableSheet.TableSheetPanel.findControl(host) === panel,
              miniFound: !!mini,
              miniValues: miniValues(mini),
              groupTip: host.querySelector('.gc-table-sheet-group-tip')?.textContent ?? null,
              crossPanelHidden: !!host.querySelector('.gc-table-sheet-cross-panel'),
            };
          },
          panelVisibilityRefresh: async () => {
            if (kind === 'official') await loadPanelCss();
            const host = document.getElementById('panel');
            new GC.Spread.Sheets.TableSheet.TableSheetPanel('fields', sheet, host);
            await sleep(700);
            const mini = miniWorkbook(host);
            const canvas = host.querySelector('.gc-table-sheet-field-panel canvas');
            if (!canvas || !mini) return { controlFound: false, error: 'no mini canvas' };
            const r = canvas.getBoundingClientRect();
            // Continue after the driver's real mouse click at these viewport coordinates.
            window.probePanelFinish = async () => {
              await sleep(500);
              const m = miniWorkbook(host);
              const viewVisible = viewColumnsVisible();
              const checked = m ? miniValues(m) : null;
              sheet.sort([{ field: 'name', ascending: true }]);
              await sleep(600);
              return {
                controlFound: true,
                checkedBefore: checked,
                viewVisibleAfterToggle: viewVisible,
                viewVisibleAfterSort: viewColumnsVisible(),
                checkedAfterSort: m ? miniValues(m) : null,
                firstRow: view.getRowData(0),
              };
            };
            return { pendingClick: { x: r.x + 14, y: r.y + 2 * 20 + 10 }, controlFound: true };
          },
          panelExternalGroup: async () => {
            if (kind === 'official') await loadPanelCss();
            const host = document.getElementById('panel');
            new GC.Spread.Sheets.TableSheet.TableSheetPanel('fields', sheet, host);
            await sleep(700);
            sheet.groupBy([{ field: 'city', caption: 'Location' }]);
            await sleep(600);
            return {
              groups: JSON.parse(JSON.stringify(sheet.groupBy() ?? null)),
              chips: [...host.querySelectorAll('li.gc-table-sheet-group-item')].map(li => ({
                text: li.querySelector('.gc-table-sheet-group-item-label')?.textContent?.trim() ?? li.textContent.trim(),
                selected: li.className.includes('selected'),
                aria: li.getAttribute('aria-label') ?? null,
                removeTitle: li.querySelector('.gc-table-sheet-group-item-remove')?.getAttribute('title') ?? null,
              })),
              summaryLabel: host.querySelector('.gc-table-sheet-summary-label')?.textContent ?? null,
              panelText: panelText(host),
            };
          },
          panelSummary: async () => {
            if (kind === 'official') await loadPanelCss();
            sheet.groupBy([{ field: 'city' }]);
            const host = document.getElementById('panel');
            new GC.Spread.Sheets.TableSheet.TableSheetPanel('fields', sheet, host);
            await sleep(700);
            const add = host.querySelector('span.gc-table-sheet-summary-function');
            if (add) for (const ty of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
              add.dispatchEvent(new MouseEvent(ty, { bubbles: true, cancelable: true, button: 0 }));
            await sleep(500);
            const input = host.querySelector('input.gc-table-sheet-summary-item-input-formula');
            if (input) {
              input.value = '=SUM([score])';
              for (const ev of ['input', 'change']) input.dispatchEvent(new Event(ev, { bubbles: true }));
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
              await sleep(600);
            }
            return { controlFound: !!input, groups: JSON.parse(JSON.stringify(sheet.groupBy() ?? null)),
              summaryRows: [...host.querySelectorAll('ul.gc-table-sheet-summary-list-container li')]
                .map(li => [...li.querySelectorAll('input')].map(i => ({ cls: i.className, value: i.value }))) };
          },
          rowActionOptions: () => sheet.rowActionOptions([{
            name: 'mark', icons: ['data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="12" height="12"%3E'
              + '%3Ccircle cx="6" cy="6" r="4" fill="blue"/%3E%3C/svg%3E'], iconSelector: () => true,
          }]),
          setDefaultRowHeight: () => sheet.setDefaultRowHeight(40),
          // TASK 49 item 5: GC.Spread.Sheets.findControl / TableSheetPanel.findControl on
          // workbook hosts, id strings, child elements and panels (probe item5a: identical).
          findControlHosts: async () => {
            if (kind === 'official') await loadPanelCss();
            const host = document.getElementById('host');
            const classify = value => value === undefined ? 'undefined' : value === null ? 'null'
              : value === spread ? 'workbook' : value === window.probePanel ? 'panel'
                : value === window.probeMini ? 'mini' : typeof value;
            const out = {
              nsHost: classify(GC.Spread.Sheets.findControl(host)),
              nsId: classify(GC.Spread.Sheets.findControl('host')),
              nsCanvasChild: classify(GC.Spread.Sheets.findControl(host.querySelector('canvas') ?? host)),
            };
            const panelHost = document.createElement('div');
            panelHost.id = 'panel5';
            panelHost.style.cssText = 'position:absolute;right:0;top:0;width:220px;height:400px';
            document.getElementById('host').style.position = 'relative';
            document.getElementById('host').append(panelHost);
            window.probePanel = new GC.Spread.Sheets.TableSheet.TableSheetPanel('fields5', sheet, panelHost);
            await sleep(700);
            window.probeMini = GC.Spread.Sheets.findControl(panelHost.querySelector('.gc-table-sheet-field-panel') ?? panelHost);
            out.nsPanelHost = classify(GC.Spread.Sheets.findControl(panelHost));
            out.nsPanelId = classify(GC.Spread.Sheets.findControl('panel5'));
            out.clsPanelHost = classify(GC.Spread.Sheets.TableSheet.TableSheetPanel.findControl(panelHost));
            out.clsPanelId = classify(GC.Spread.Sheets.TableSheet.TableSheetPanel.findControl('panel5'));
            out.nsMiniInner = classify(window.probeMini);
            window.probePanel.destroy();
            await sleep(300);
            out.clsPanelAfterDestroy = classify(GC.Spread.Sheets.TableSheet.TableSheetPanel.findControl(panelHost));
            out.nsAfterPanelDestroy = classify(GC.Spread.Sheets.findControl(panelHost));
            // Workbook destroy check on a scratch host (the scenario host is torn down by
            // the comparison driver).
            const scratchHost = document.createElement('div');
            scratchHost.id = 'scratch5';
            document.body.append(scratchHost);
            const scratch = new GC.Spread.Sheets.Workbook(scratchHost, { sheetCount: 0 });
            out.scratchBeforeDestroy = classify(GC.Spread.Sheets.findControl(scratchHost));
            scratch.destroy();
            out.nsAfterWorkbookDestroy = classify(GC.Spread.Sheets.findControl(scratchHost));
            out.nsIdAfterWorkbookDestroy = classify(GC.Spread.Sheets.findControl('scratch5'));
            scratchHost.remove();
            return out;
          },
        };
        let result;
        try { result = await calls[operation](); } catch (error) { result = { error: String(error), stack: error.stack }; }
        if (result === sheet || result === spread) result = '[sheet]';
        if (hierarchy) await new Promise(resolve => setTimeout(resolve, 100));
        return { result, rowCount: sheet.getRowCount(), visibleLength: view.visibleLength(), first: view.getRowData(0),
          ...(hierarchy ? { rows: Array.from({ length: view.visibleLength() }, (_, row) => view.getRowData(row)), data } : {}) };
      } catch (error) { return { error: String(error) }; }
    }, { kind, scenario });
    const pending = all[scenario]?.[kind]?.result?.pendingClick;
    if (pending) {
      await page.mouse.click(pending.x, pending.y);
      const finished = await page.evaluate(() => window.probePanelFinish());
      const wrapper = await page.evaluate(() => ({ rowCount: window.probeSheet.getRowCount(),
        visibleLength: window.probeView.visibleLength(), first: window.probeView.getRowData(0) }));
      all[scenario][kind] = { result: finished, ...wrapper };
    }
    await page.waitForTimeout(100);
    if (scenario === 'edit') {
      await page.mouse.click(160, 45);
      await page.keyboard.type('Edited');
      await page.keyboard.press('Enter');
      all[scenario][kind].edit = await page.evaluate(() => ({
        row: window.probeView.getRowData(0), changes: window.probeSheet.getChanges(),
      }));
    }
    if (scenario === 'hierarchyOutlineToggle') {
      await page.mouse.click(142, 53);
    }
    if (scenario === 'templateStateHover') await page.mouse.move(165, 45);
    await page.locator('#host').screenshot({ path: `.probe/tablesheet-${scenario}-${kind}.png` });
    await page.evaluate(() => window.probeSpread?.destroy());
  }
  const official = PNG.sync.read(readFileSync(`.probe/tablesheet-${scenario}-official.png`));
  const ours = PNG.sync.read(readFileSync(`.probe/tablesheet-${scenario}-ours.png`));
  const diff = new PNG({ width: official.width, height: official.height });
  const changed = pixelmatch(official.data, ours.data, diff.data, official.width, official.height, { threshold: 0.1 });
  all[scenario].differencePercent = 100 * changed / (official.width * official.height);
  writeFileSync(`.probe/tablesheet-${scenario}-diff.png`, PNG.sync.write(diff));
  console.log(`${scenario}: ${all[scenario].differencePercent.toFixed(2)}%`);
}
const seen = new WeakSet();
writeFileSync('.probe/tablesheet-comparison.json', JSON.stringify(all, (_key, value) => {
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
  }
  return value;
}, 2));
await browser.close();
