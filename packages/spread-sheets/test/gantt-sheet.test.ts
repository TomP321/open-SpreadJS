import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { GanttSheet } from '../src/gantt/sheet/index.js';
import { TableSheet } from '../src/tablesheet/index.js';
import { Project } from '../src/gantt/project.js';
import { GanttGridlines } from '../src/gantt/appearance.js';
import { GanttMapping } from '../src/gantt/mapping.js';
import { barDateLabel, dayWidthFor, ganttBarKind, projectDateRange, taskBarSpan, weekLabel } from '../src/gantt/view/chart.js';

const day = (month: number, date: number, hour = 8) => new Date(2025, month - 1, date, hour);

function workbook() {
  return new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
}

describe('GanttSheet (TASK 36 item 1)', () => {
  it('addSheetTab with the gantt SheetType builds a GanttSheet extending TableSheet', () => {
    const wb = workbook();
    const sheet = wb.addSheetTab(0, 'Gantt', GC.Spread.Sheets.SheetType.ganttSheet);
    expect(sheet).toBeInstanceOf(GanttSheet);
    expect(sheet).toBeInstanceOf(TableSheet);
    expect((sheet as GanttSheet)._isGanttSheet).toBe(true);
    expect(GC.Spread.Sheets.GanttSheet.GanttSheet).toBe(GanttSheet);
    wb.destroy();
  });

  it('exposes project, mapping, gridlines and progressLine members with no NotImplemented left', () => {
    const sheet = new GanttSheet('Plan');
    expect(sheet.project).toBeInstanceOf(Project);
    expect(sheet.mapping).toBeInstanceOf(GanttMapping);
    expect(sheet.gridlines).toBeInstanceOf(GanttGridlines);
    // The trial leaves progressLine undefined until a progress line is configured.
    expect(sheet.progressLine).toBeUndefined();
    expect(sheet.project.root.name).toBe('Plan');
    // Every declared member is callable, not a NotImplemented stub.
    expect(typeof sheet.bindGanttView).toBe('function');
    expect(typeof sheet.getActiveTask).toBe('function');
    expect(typeof sheet.getTaskByRow).toBe('function');
    expect(typeof sheet.getSelections).toBe('function');
    expect(() => sheet.suspendPaint()).not.toThrow();
    expect(() => sheet.resumePaint()).not.toThrow();
  });

  it('getTaskByRow and getActiveTask read the project row order', () => {
    const sheet = new GanttSheet('Tasks');
    const project = sheet.project;
    project.startDate = day(1, 6);
    project.addTasks([{ name: 'A', duration: '1d' }, { name: 'B', duration: '2d' }]);
    expect(sheet.getTaskByRow(0)).toBe(project.root);
    expect(sheet.getTaskByRow(1).name).toBe('A');
    expect(sheet.getTaskByRow(2).name).toBe('B');
    expect(sheet.getTaskByRow(99)).toBeUndefined();
    sheet.setActiveCell(2, 0);
    expect(sheet.getActiveTask().name).toBe('B');
  });

  it('maps no task grid while unbound (trial probe t54-gantt-grid: 0 rows, 0 cols)', () => {
    // Trial-measured (probe .probe/t54/probe-t54-gantt-grid.json, identical setup): a GanttSheet
    // without a bound data view has getRowCount()/getColumnCount() 0 and every grid cell reads
    // empty, even after tasks are scheduled on the project. The earlier grid synthesis
    // contradicted the trial, so this test now asserts the trial values.
    const sheet = new GanttSheet('Grid');
    const project = sheet.project;
    project.startDate = day(1, 6);
    project.addTasks([{ name: 'A', duration: '2d' }, { name: 'B', duration: '1d' }]);
    project.getTask(2).predecessors = '1FS';
    project.resumeSchedule();
    expect(sheet.getColumnCount()).toBe(0);
    expect(sheet.getRowCount()).toBe(0);
    expect(sheet.getValue(0, 2, 1)).toBeUndefined();
    expect(sheet.getValue(1, 0)).toBeUndefined();
    expect(sheet.getValue(1, 1)).toBeUndefined();
    expect(sheet.getValue(1, 2)).toBeUndefined();
    expect(sheet.getValue(2, 5)).toBeUndefined();
    // The project model keeps working on the unbound sheet (the trial schedules on it too).
    expect(project.count).toBe(3);
    expect(project.getTask(1).name).toBe('A');
    expect(project.getTask(2).predecessors).toBe('1');
  });

  it('bindGanttView imports tasks from a bound data view through the mapping', async () => {
    const wb = workbook();
    const table = wb.dataManager().addTable('plan', {
      data: [
        { name: 'Design', duration: '3d', start: day(1, 6), finish: day(1, 10, 17) },
        { name: 'Build', duration: '1w', start: day(1, 13), finish: day(1, 17, 17) },
      ],
      schema: { columns: { name: { dataType: 'string' }, duration: { dataType: 'string' },
        start: { dataType: 'date' }, finish: { dataType: 'date' } } },
    });
    const view = table.addView('g', ['name', 'duration', 'start', 'finish']);
    await view.fetch();
    const sheet = wb.addSheetTab(0, 'Bound', GC.Spread.Sheets.SheetType.ganttSheet) as GanttSheet;
    sheet.bindGanttView(view, { defaultMode: 'Manual', enableGanttColumn: false });
    expect(sheet.enableGanttColumn()).toBe(false);
    expect(sheet.project.count).toBe(3);
    expect(sheet.getTaskByRow(1).name).toBe('Design');
    // '1w' parses to a 5-working-day length through the mapping.
    expect(sheet.getTaskByRow(2).duration?.unit).toBe('Week');
    expect(sheet.getTaskByRow(2).duration?.value).toBe(1);
    wb.destroy();
  });

  it('grid edits go through the project setters and reschedule the task', async () => {
    // Grid edits exist on a BOUND sheet only (trial probe t54-gantt-grid: an unbound GanttSheet
    // carries no task grid at all), so the edit path is exercised on a sheet bound to a view.
    const wb = workbook();
    const table = wb.dataManager().addTable('edit', {
      data: [{ name: 'A', duration: '1d' }, { name: 'B', duration: '1d' }],
      schema: { columns: { name: { dataType: 'string' }, duration: { dataType: 'string' } } },
    });
    const view = table.addView('g', ['name', 'duration']);
    await view.fetch();
    const sheet = wb.addSheetTab(0, 'Edit', GC.Spread.Sheets.SheetType.ganttSheet) as GanttSheet;
    sheet.bindGanttView(view);
    const project = sheet.project;
    project.startDate = day(1, 6);
    project.getTask(2).predecessors = '1FS';
    project.resumeSchedule();
    // The bound sheet carries the task grid: root row + the two view rows, six columns.
    expect(sheet.getColumnCount()).toBe(6);
    expect(sheet.getRowCount()).toBe(3);
    // Editing the duration column of task A stretches A and pushes B.
    sheet.setValue(1, 2, '3d');
    expect(project.getTask(1).duration?.value).toBe(3);
    expect(project.getTask(2).start!.getDate()).toBeGreaterThan(project.getTask(1).start!.getDate());
    // Editing the name column writes the task name.
    sheet.setValue(1, 1, 'Renamed');
    expect(project.getTask(1).name).toBe('Renamed');
    wb.destroy();
  });

  it('serialises a gantt section matching the trial and round-trips it through workbook JSON', async () => {
    const wb = workbook();
    const table = wb.dataManager().addTable('plan', {
      batch: true,
      data: [{ name: 'Design', duration: '3 days', start: day(1, 6), finish: day(1, 8, 17) }],
      schema: { columns: { name: { dataType: 'string' }, duration: { dataType: 'string' },
        start: { dataType: 'date' }, finish: { dataType: 'date' } } },
    });
    const view = table.addView('g', ['name', 'duration', 'start', 'finish']);
    await view.fetch();
    const sheet = wb.addSheetTab(0, 'GanttSheet1', GC.Spread.Sheets.SheetType.ganttSheet) as GanttSheet;
    sheet.bindGanttView(view);
    // Non-default gantt settings that must survive the round trip.
    sheet.project.timescale.nonWorkingTime.color = '#E8E8E8';
    sheet.project.timescale.zoomTo(2.5);
    sheet.project.statusDate = day(1, 8, 17);
    sheet.progressLine = { display: true, referenceDate: 'statusDate',
      pathType: { returnToReferenceDate: false, pointConnectionType: 'orthogonal' },
      lineStyle: { lineColor: '#FF0000', lineType: 1 }, pointStyle: { shape: 'circle', color: '#00FF00' } };
    const json = wb.toJSON();
    const tab = (json.sheetTabs as Record<string, Record<string, unknown>>)['GanttSheet1'];
    expect(tab.sheetType).toBe(0);
    const gantt = tab.gantt as Record<string, Record<string, unknown>>;
    expect(Object.keys(gantt).sort()).toEqual(['gridlines', 'options', 'progressLine', 'project', 'taskbarColumn']);
    expect(gantt.project.timescale as Record<string, unknown>).toMatchObject({ tierMode: 2, pixelPerDay: 80 });
    const nonWorking = (gantt.project.timescale as Record<string, unknown>).nonWorkingTime as Record<string, unknown>;
    expect(nonWorking.color).toBe('#E8E8E8');
    expect((gantt.project as Record<string, unknown>).taskStyleRules).toHaveLength(15);
    expect(gantt.options).toMatchObject({ enableGanttColumn: true });
    expect(gantt.project).toHaveProperty('currentDate');
    expect(gantt.project).toHaveProperty('calendar');
    expect(gantt.gridlines).toHaveProperty('currentDate');
    // Round-trip: rebuild a fresh workbook from the JSON and read the gantt state back.
    const wb2 = new GC.Spread.Sheets.Workbook(undefined, { sheetCount: 0 });
    await wb2.fromJSON(json);
    const sheet2 = wb2.getSheet(0) as GanttSheet;
    expect(sheet2).toBeInstanceOf(GanttSheet);
    expect(sheet2.project.timescale.nonWorkingTime.color).toBe('#E8E8E8');
    expect(sheet2.project.timescale.zoomFactor).toBeCloseTo(2.5, 5);
    expect(sheet2.progressLine?.display).toBe(true);
    expect(sheet2.progressLine?.referenceDate).toBe('statusDate');
    expect(sheet2.gridlines.currentDate.lineColor).toBe('#8BBF8A');
    wb.destroy();
    wb2.destroy();
  });
});

describe('GanttSheet view (TASK 36b)', () => {
  it('gridlines carries the trial default line styles', () => {
    const sheet = new GanttSheet('GL');
    const g = sheet.gridlines;
    expect(g.currentDate).toEqual({ lineColor: '#8BBF8A', lineType: 1 });
    expect(g.ganttRows.lineColor).toBe('transparent');
    expect(g.projectStart).toEqual({ lineColor: '#808080', lineType: 4 });
    expect(g.projectFinish).toEqual({ lineColor: '#808080', lineType: 4 });
    // Setting a style is retained and drives the chart painter (read back on repaint).
    g.ganttRows = { lineColor: '#FF0000', lineType: 1 };
    expect(sheet.gridlines.ganttRows.lineColor).toBe('#FF0000');
  });

  it('progressLine stays undefined until a line is configured', () => {
    const sheet = new GanttSheet('PL');
    expect(sheet.progressLine).toBeUndefined();
    sheet.progressLine = {
      display: true, referenceDate: 'statusDate',
      pathType: { returnToReferenceDate: false, pointConnectionType: 'diagonal' },
      lineStyle: { lineColor: '#000000', lineType: 1 },
      pointStyle: { shape: 'circle', color: '#000000' },
    };
    expect(sheet.progressLine?.display).toBe(true);
  });

  it('getSelections reports the default single-cell range', () => {
    const sheet = new GanttSheet('Sel');
    const selections = sheet.getSelections();
    expect(Array.isArray(selections)).toBe(true);
    expect(selections[0]).toMatchObject({ row: 0, col: 0, rowCount: 1, colCount: 1 });
  });

  it('suspendPaint/resumePaint batch project row changes into one grid rebuild', async () => {
    // Bound sheet (a GanttSheet carries its grid only while a view is bound).
    const wb = workbook();
    const table = wb.dataManager().addTable('susp', {
      data: [{ name: 'X', duration: '1d' }],
      schema: { columns: { name: { dataType: 'string' }, duration: { dataType: 'string' } } },
    });
    const view = table.addView('g', ['name', 'duration']);
    await view.fetch();
    const sheet = wb.addSheetTab(0, 'Susp', GC.Spread.Sheets.SheetType.ganttSheet) as GanttSheet;
    sheet.bindGanttView(view);
    sheet.project.startDate = day(1, 6);
    sheet.suspendPaint();
    sheet.project.addTasks([{ name: 'A', duration: '1d' }, { name: 'B', duration: '1d' }]);
    sheet.resumePaint();
    expect(sheet.getRowCount()).toBe(4);
    expect(sheet.getValue(2, 1)).toBe('A');
    wb.destroy();
  });

  it('date columns paint real Dates with a dropdown button while getValue keeps the formatted text', async () => {
    // Bound sheet: the task grid (and its date columns) exists only for a bound data view.
    const wb = workbook();
    const table = wb.dataManager().addTable('dates', {
      data: [{ name: 'A', duration: '1d' }],
      schema: { columns: { name: { dataType: 'string' }, duration: { dataType: 'string' } } },
    });
    const view = table.addView('g', ['name', 'duration']);
    await view.fetch();
    const sheet = wb.addSheetTab(0, 'DateCell', GC.Spread.Sheets.SheetType.ganttSheet) as GanttSheet;
    sheet.bindGanttView(view);
    sheet.project.startDate = day(1, 6);
    const startColumn = sheet._columns().findIndex(column => column.field === 'start');
    expect(String(sheet.getValue(1, startColumn))).toMatch(/^2025.01.06 08:00$/);
    expect(sheet._renderValue(1, startColumn)).toBeInstanceOf(Date);
    const style = sheet.getActualStyle(1, startColumn, 3);
    expect(style.foreColor).toBe('#000000');
    expect(Array.isArray(style.cellButtons)).toBe(true);
    expect((style.cellButtons as Record<string, unknown>[])[0]).toMatchObject({ position: 1, imageType: 5 });
    // Non-date columns have no dropdown button.
    const nameColumn = sheet._columns().findIndex(column => column.field === 'name');
    expect(sheet.getActualStyle(1, nameColumn, 3).cellButtons).toBeFalsy();
    wb.destroy();
  });

  it('the task grid bolds the project and summary rows like the trial', async () => {
    // Bound sheet: the bold task-grid rows exist only for a bound data view.
    const wb = workbook();
    const table = wb.dataManager().addTable('bold', {
      data: [{ name: 'Group', duration: '2d' }, { name: 'A', duration: '1d' }],
      schema: { columns: { name: { dataType: 'string' }, duration: { dataType: 'string' } } },
    });
    const view = table.addView('g', ['name', 'duration']);
    await view.fetch();
    const sheet = wb.addSheetTab(0, 'Bold', GC.Spread.Sheets.SheetType.ganttSheet) as GanttSheet;
    sheet.bindGanttView(view);
    const project = sheet.project;
    project.startDate = day(1, 6);
    project.indentTasks([2]);
    sheet.resumePaint();
    // Trial-measured sizes: row 0 bold 16px ('GanttSheet1' ink 84px), summaries bold 11pt ('Build' 34px).
    expect(String(sheet.getActualStyle(0, 1, 3).font)).toMatch(/bold.*16px/);
    expect(String(sheet.getActualStyle(1, 1, 3).font)).toMatch(/bold/);
    expect(String(sheet.getActualStyle(1, 1, 3).font)).toMatch(/11pt/);
    expect(String(sheet.getActualStyle(2, 1, 3).font ?? '')).not.toContain('bold');
    // Summary rows paint their text 4px above the middle line; plain rows keep the plain nudge.
    const nudge = (sheet as unknown as { _ganttTextNudge(row: number): number })._ganttTextNudge.bind(sheet);
    expect(nudge(0)).toBe(0);
    expect(nudge(1)).toBe(-4);
    expect(nudge(2)).toBe(0);
    wb.destroy();
  });

  it('chart helpers map tasks to trial bar geometry', () => {
    const sheet = new GanttSheet('Chart');
    const project = sheet.project;
    project.startDate = new Date(2026, 10, 16, 8);
    project.addTasks([
      { name: 'Task', duration: '3d' },
      { name: 'Done', duration: '2d', complete: 50 },
    ]);
    project.getTask(2).predecessors = '1FS';
    project.resumeSchedule();
    const task = project.getTask(1);
    const leaf = taskBarSpan(task)!;
    // Bars snap to whole days: a finish carrying a time rolls to the next midnight.
    expect(leaf.finish.getTime()).toBe(new Date(2026, 10, 19).getTime());
    expect(ganttBarKind(task)).toBe('task');
    expect(ganttBarKind(project.root)).toBe('projectSummary');
    const projectRoot = taskBarSpan(project.root)!;
    expect(projectRoot.start.getTime()).toBe(new Date(2026, 10, 16, 8).getTime());
    expect(dayWidthFor(project.timescale)).toBeCloseTo(46.38, 2);
    expect(weekLabel(new Date(2026, 10, 22))).toBe('11/22');
    expect(barDateLabel(new Date(2026, 10, 20, 17, 0))).toBe('2026-11-20 17:00');
    const range = projectDateRange([project.root, task, project.getTask(2)]);
    expect(range.start!.getTime()).toBe(new Date(2026, 10, 16, 8).getTime());
  });
});
