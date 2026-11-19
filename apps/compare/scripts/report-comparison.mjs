import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

process.chdir(resolve(fileURLToPath(new URL('../../..', import.meta.url))));
mkdirSync('.probe', { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.playwright-browsers');
const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 820, height: 520 }, deviceScaleFactor: 1 });
await page.goto(`${process.env.REPORT_COMPARE_URL ?? 'http://127.0.0.1:5174'}/report-comparison.html`);
await page.waitForFunction(() => window.reportLibraries);
const results = {};
for (const scenario of ['list', 'group', 'two-level', 'nested-list', 'nested-filter', 'nested-sort', 'horizontal', 'pagination', 'paginated-list-summary', 'nested-summary', 'three-level-summary', 'sibling-context', 'grouped-pagination', 'grouped-page-2', 'pagination-pages', 'pagination-group-break', 'pagination-paper', 'cross-tab', 'cross-tab-nested', 'cross-tab-cells', 'cross-tab-collapse', 'cross-tab-initial', 'horizontal-collapse-children', 'expanded-span', 'editing-submit', 'entry-blank-insert', 'entry-grouped', 'entry-remote', 'independent-contexts', 'list-parent', 'nested-collapse', 'multirow-context', 'multirow-collapse']) {
  results[scenario] = {};
  const images = {};
  for (const kind of ['official', 'ours']) {
    results[scenario][kind] = await page.evaluate(async ({ kind, scenario }) => {
      document.body.innerHTML = '<div id="host" style="width:800px;height:500px"></div>';
      const GC = window.reportLibraries[kind];
      const spread = new GC.Spread.Sheets.Workbook(document.getElementById('host'), { sheetCount: 0 });
      window.reportProbe = spread;
        const data = [
          { region: 'East', city: 'A', amount: 1 }, { region: 'East', city: 'B', amount: 2 },
          { region: 'West', city: 'C', amount: 3 },
        ];
        if (scenario === 'sibling-context' || scenario === 'independent-contexts' || scenario === 'nested-collapse') {
          data.splice(1, 0, { region: 'East', city: 'A', amount: 4 });
        }
        const entry = scenario.startsWith('entry-');
        const table = entry && scenario === 'entry-remote'
          ? spread.dataManager().addTable('T', { remote: { read: () => Promise.resolve(data) } })
          : spread.dataManager().addTable('T', { data });
        await table.fetch();
      const report = spread.addSheetTab(0, 'Report', GC.Spread.Sheets.SheetType.reportSheet);
      const template = report.getTemplate();
      const nested = ['nested-list', 'nested-filter', 'nested-sort', 'nested-summary', 'three-level-summary', 'sibling-context', 'nested-collapse'].includes(scenario);
      const grouped = scenario === 'grouped-pagination' || scenario === 'grouped-page-2';
      const first = { type: scenario === 'group' || scenario === 'two-level' || nested || grouped ||
        scenario === 'cross-tab' || scenario === 'cross-tab-nested' || scenario === 'cross-tab-cells' ||
        scenario === 'cross-tab-collapse' || scenario === 'cross-tab-initial' || scenario === 'pagination-pages' ||
        scenario.startsWith('pagination-') || scenario.startsWith('entry-') ||
        scenario === 'independent-contexts' || scenario === 'multirow-context' || scenario === 'multirow-collapse'
        ? 'Group' : 'List', binding: 'T[region]' };
      if (scenario === 'horizontal' || scenario === 'horizontal-collapse-children') first.spillDirection = 'Horizontal';
      if (scenario === 'horizontal-collapse-children') {
        first.type = 'Group';
        first.binding = 'T[city]';
        template.setTemplateCell(1, 0, { type: 'List', binding: 'T[amount]', context: { vertical: 'A1' } });
      }
      template.setTemplateCell(0, 0, first);
      if (scenario === 'multirow-context' || scenario === 'multirow-collapse') template.setTemplateCell(1, 1,
        { type: scenario === 'multirow-collapse' ? 'Group' : 'List', binding: 'T[city]', context: { vertical: 'A1' } });
      if (scenario === 'multirow-collapse') template.setTemplateCell(1, 2,
        { type: 'List', binding: 'T[amount]', context: { vertical: 'B2' } });
      if (scenario === 'independent-contexts') template.setTemplateCell(0, 1,
        { type: 'Group', binding: 'T[city]', context: { vertical: 'None' } });
      if (scenario === 'independent-contexts') template.setTemplateCell(0, 2, { type: 'List', binding: 'T[amount]' });
      if (scenario === 'list-parent') template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]' });
      if (grouped) template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
      if (scenario === 'cross-tab') {
        template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
          context: { vertical: 'None' } });
        template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
          context: { vertical: 'A1', horizontal: 'B1' } });
      }
      if (scenario === 'cross-tab-cells') {
        template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
          context: { vertical: 'None' } });
        template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
          context: { vertical: 'A1', horizontal: 'B1' } });
      }
      if (scenario === 'cross-tab-nested') {
        template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal' });
        template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
          context: { vertical: 'A1', horizontal: 'B1' } });
      }
      const crossCollapse = scenario === 'cross-tab-collapse' || scenario === 'cross-tab-initial';
      if (crossCollapse) {
        template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]', spillDirection: 'Horizontal',
          context: { vertical: 'None' },
          ...(scenario === 'cross-tab-initial' ? { initialExpansionState: 'Collapsed' } : {}) });
        template.setTemplateCell(1, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum',
          context: { vertical: 'A1', horizontal: 'B1' } });
        if (scenario === 'cross-tab-initial') template.setTemplateCell(0, 0,
          { type: 'Group', binding: 'T[region]', initialExpansionState: 'Collapsed' });
      }
      if (scenario === 'expanded-span') template.addSpan(0, 0, 2, 1);
      if (scenario === 'editing-submit') {
        template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
        template.setDataEntrySetting([{ name: 'rule', tableName: 'T', fields: [
          { dbColumnName: 'region', formula: 'A1', isPrimary: true }, { dbColumnName: 'city', formula: 'B1' },
        ] }]);
      }
      if (scenario === 'group' || scenario === 'paginated-list-summary') {
        template.setTemplateCell(0, 1, { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum' });
      }
      if (scenario === 'two-level' || nested) {
        template.setTemplateCell(0, 1, { type: 'Group', binding: 'T[city]',
          ...(scenario === 'nested-sort' ? { sortOptions: [{ desc: 'city' }] } : {}) });
      }
      if (nested) template.setTemplateCell(0, 2, { type: scenario === 'three-level-summary' ? 'Group' : 'List', binding: 'T[amount]',
        ...(scenario === 'sibling-context' ? { context: { vertical: 'A1' } } : {}),
        ...(scenario === 'nested-filter' ? { filter: { condition: { column: 'amount', operator: 'GreaterThan', value: 1 } } } : {}) });
      if (scenario === 'nested-summary') template.setTemplateCell(0, 3,
        { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum', context: { vertical: 'A1' } });
      if (scenario === 'three-level-summary') template.setTemplateCell(0, 3,
        { type: 'Summary', binding: 'T[amount]', aggregate: 'Sum', context: { vertical: 'B1' } });
      if (scenario === 'pagination' || scenario === 'paginated-list-summary' || grouped) {
        template.setPaginationSetting({ rowPagination: { paginationDataCell: 'A1', rowCountPerPage: scenario === 'grouped-page-2' ? 1 : 2 } });
      }
      if (scenario === 'pagination-pages') {
        template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
        template.setPaginationSetting({ rowPagination: { paginationDataCell: 'B1', rowCountPerPage: 2 } });
      }
      const paginating = scenario === 'pagination' || scenario === 'paginated-list-summary' || grouped ||
        scenario === 'pagination-pages' || scenario.startsWith('pagination-');
      if (scenario === 'pagination-group-break') {
        template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
        template.setTemplateCell(2, 0, { type: 'Static' });
        template.setValue(2, 0, 'End');
        template.setPaginationSetting({ titleRow: { start: 0, end: 0 },
          rowPagination: { paginationDataCell: 'B1', rowCountPerPage: 2 } });
        template.setTemplateCell(0, 0, { type: 'Group', binding: 'T[region]', paginateBeforeRow: true });
      }
      if (scenario === 'pagination-paper') {
        template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
        template.setValue(1, 0, 'End');
        template.setPaginationSetting({ endRow: { start: 1, end: 1 }, paperSizePagination: true });
      }
      if (entry) {
        template.setTemplateCell(0, 1, { type: 'List', binding: 'T[city]' });
        template.setDataEntrySetting([{ name: 'rule', tableName: 'T', fields: [
          { dbColumnName: 'region', formula: 'A1', isPrimary: true }, { dbColumnName: 'city', formula: 'B1' },
        ] }]);
        if (scenario === 'entry-grouped') template.setTemplateCell(0, 2, { type: 'List', binding: 'T[amount]' });
      }
      try {
        report.renderMode(paginating ? 'PaginatedPreview' : 'Preview');
        if (scenario === 'grouped-page-2') report.currentPage(1);
        report.refresh();
        const out = {};
        if (entry) {
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
          const events = [];
          for (const name of ['ReportSheetDataChanging', 'ReportSheetDataChanged',
            'ReportSheetRecordsSubmitting', 'ReportSheetRecordsSubmitted']) {
            const key = GC.Spread.Sheets.Events[name];
            if (key === undefined) { events.push([name, 'no-event']); continue; }
            report.bind(key, (_sender, args) => events.push([name, args && args.type, args && args.row, args && args.col,
              args && args.newValue, args && args.cancel,
              args && (args.updateSuccessRecords || args.deleteSuccessRecords || args.updateFailedRecords ||
                args.deleteFailedRecords) !== undefined
                ? JSON.stringify([args.updateSuccessRecords, args.updateFailedRecords,
                  args.deleteSuccessRecords, args.deleteFailedRecords]).slice(0, 140) : undefined]));
          }
          const rows = () => { const r = report.getRange(); return Array.from({ length: r.rowCount }, (_, row) =>
            Array.from({ length: Math.min(r.colCount, 4) }, (_, col) => report.getValue(row, col))); };
          out.steps = [];
          out.steps.push(['initial', rows(), report.isDirty(), JSON.stringify(report.getChanges())]);
          report.addRecordAt(1, 1);
          out.steps.push(['add', rows(), report.isDirty(), JSON.stringify(report.getChanges())]);
          report.updateCellValue(2, 0, 'South');
          out.steps.push(['update-region', rows(), report.isDirty(), JSON.stringify(report.getChanges())]);
          report.updateCellValue(2, 1, 'Z');
          out.steps.push(['update', rows(), report.isDirty(), JSON.stringify(report.getChanges())]);
          out.dirtyStyle = JSON.stringify(report.options && report.options.dirtyStyle
            ? report.options.dirtyStyle.toJSON() : null);
          out.dirtyCorner = (() => { const st = report.getStyle(2, 1); const j = st && st.toJSON ? st.toJSON() : st;
            return JSON.stringify(j && j.decoration); })();
          if (scenario === 'entry-grouped') report.deleteRecordAt(1, 1);
          else { report.deleteRecordAt(4, 1); out.steps.push(['delete-blank', rows(), report.isDirty(),
            JSON.stringify(report.getChanges())]); }
          out.steps.push(['delete', rows(), report.isDirty(), JSON.stringify(report.getChanges())]);
          try { report.submit(); } catch (e) { out.submitError = String(e && e.message).slice(0, 100); }
          await sleep(250);
          out.afterSubmit = rows();
          out.changesAfterSubmit = JSON.stringify(report.getChanges());
          out.isDirtyAfterSubmit = report.isDirty();
          out.events = events;
          const tableData = (spread.dataManager().tables || {}).T;
          out.tableRows = tableData && typeof tableData.getDataItems === 'function'
            ? JSON.stringify(tableData.getDataItems()).slice(0, 400) : 'n/a';
          report.refresh();
          out.afterRefresh = rows();
        }
        report.renderMode(paginating ? 'PaginatedPreview' : 'Preview');
        if (scenario === 'grouped-page-2') report.currentPage(1);
        report.refresh();
        if (scenario === 'editing-submit') { report.updateCellValue(2, 1, 'Z'); report.submit(); report.refresh(); }
        if (scenario === 'nested-collapse' || scenario === 'multirow-collapse' ||
          scenario === 'horizontal-collapse-children') report.toggleCollapseState(0, 0, 'Collapsed', true);
        if (scenario === 'cross-tab-collapse') report.toggleCollapseState(0, 2, 'Collapsed', false);
        const range = report.getRange();
        const values = Array.from({ length: range.rowCount }, (_, row) =>
          Array.from({ length: range.colCount }, (_, col) => report.getValue(row, col)));
        const spans = [];
        for (let row = 0; row < range.rowCount; row++) for (let col = 0; col < range.colCount; col++) {
          const span = report.getSpan(row, col);
          if (span && span.row === row && span.col === col) spans.push({ row, col, rowCount: span.rowCount, colCount: span.colCount });
        }
        return { ...out, range: { row: range.row, col: range.col, rowCount: range.rowCount, colCount: range.colCount },
          values, spans, pages: report.getPagesCount(), ...(scenario === 'multirow-context' ? {
            contexts: [[0, 0], [1, 1], [2, 1], [3, 0], [4, 1]].map(([row, col]) => report.getCells(1, 1, row, col)),
          } : {}), ...(paginating ? {
            pageSheets: report.generatePageSheets(false, index => `Page ${index + 1}`).map(sheet => ({
              name: sheet.name(), rowCount: sheet.getRowCount(), colCount: sheet.getColumnCount(),
              spans: (() => { const list = []; for (let row = 0; row < sheet.getRowCount(); row++)
                for (let col = 0; col < sheet.getColumnCount(); col++) { const span = sheet.getSpan(row, col);
                  if (span && span.row === row && span.col === col) list.push([row, col, span.rowCount, span.colCount]); } return list; })(),
              values: Array.from({ length: sheet.getRowCount() }, (_, row) =>
                Array.from({ length: sheet.getColumnCount() }, (_, col) => sheet.getValue(row, col))),
            })),
          } : {}), ...(scenario === 'cross-tab-cells' ? {
            contexts: [[0, 1, 0, 0], [0, 1, 0, 1], [0, 1, 0, 2], [1, 1, 0, 0], [1, 1, 1, 1], [1, 1, 1, 2]]
              .map(([row, col, currentRow, currentCol]) => report.getCells(row, col, currentRow, currentCol)),
          } : {}), ...(crossCollapse ? {
            collapsed: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [3, 1]].map(([row, col]) => report.getCollapseState(row, col)),
            heights: [0, 1, 2, 3].map(row => report.getRowHeight(row)),
            widths: [0, 1, 2, 3].map(col => report.getColumnWidth(col)),
          } : {}), ...(scenario === 'nested-collapse' || scenario === 'multirow-collapse' ? {
            collapsed: [[0, 0], [0, 1], [2, 1], [3, 0], [3, 1]].map(([row, col]) => report.getCollapseState(row, col)),
            heights: [0, 1, 2, 3].map(row => report.getRowHeight(row)),
          } : {}), ...(scenario === 'horizontal-collapse-children' ? {
            collapsed: [[0, 0], [0, 1], [0, 2]].map(([row, col]) => report.getCollapseState(row, col)),
          } : {}) };
      } catch (error) { return { error: String(error) }; }
    }, { kind, scenario });
    await page.waitForTimeout(200);
    images[kind] = PNG.sync.read(await page.screenshot());
  }
  const { width, height } = images.official;
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(images.official.data, images.ours.data, diff.data, width, height);
  writeFileSync(`.probe/report-${scenario}-diff.png`, PNG.sync.write(diff));
  results[scenario].screenshotDiffPercent = 100 * pixels / (width * height);
  results[scenario].equal = JSON.stringify(results[scenario].official) === JSON.stringify(results[scenario].ours);
}
writeFileSync('.probe/report-comparison.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
