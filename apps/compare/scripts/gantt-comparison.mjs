import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { runGanttViewScenarios } from './gantt-view-scenarios.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
process.chdir(root);
mkdirSync('.probe', { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.playwright-browsers');
const { chromium } = await import('@playwright/test');
const server = spawn(resolve(root, 'apps/compare/node_modules/.bin/vite'), ['apps/compare', '--host', '127.0.0.1', '--port', '58242', '--strictPort',
  '--config', 'apps/compare/vite.config.ts'], { cwd: root, stdio: 'ignore' });
const browser = await chromium.launch({ headless: true });

/**
 * The scenario builders below are shared by both runtimes: every one of them only uses the public
 * `GC.Spread.Sheets.GanttSheet` API of the library it is handed, and returns a compact string so
 * the two sides can be compared field by field. They cover the scheduling behaviours of TASK 32d:
 * `grammar`/`dep` (predecessor strings and `invalidDependency` cases), `range`/`lookup`/`outline`/
 * `row`/`sort`/`sortField` (task ranges, lookups, outline edits and sorting), `anchor`/`summary`/
 * `leaf` (summary cascades, roll-ups and leaf defaults), `manual` (tasks with missing fields),
 * `lag`/`lagstr` (FS/SS/FF/SF with lag in every unit and sign), `calendar`/`project`/`mapping`
 * (calendar statics, fresh-project defaults, data mapping) and `coll`/`rule`/`collection`
 * (the style-rule collection and rule surface).
 */
const CASES_SOURCE = `
  const fmt = d => d instanceof Date && !Number.isNaN(d.getTime())
    ? \`\${d.getFullYear()}/\${d.getMonth() + 1}/\${d.getDate()} \${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}:\${String(d.getSeconds()).padStart(2, '0')}\` : String(d);
  const dur = v => v == null ? String(v) : \`\${v.value}|\${v.unit}|\${v.time}\`;
  const rows = p => p.tasks.map(t => \`\${t.taskNumber}(\${t.level}):\${fmt(t.start)}-\${fmt(t.finish)}(\${dur(t.duration)})\`).join(' ; ');
  const disp = t => \`sd=\${fmt(t.startDisplayed)} fd=\${fmt(t.finishDisplayed)} ms=\${String(t.isMilestone)} nm=\${String(t.isNormal)} sum=\${String(t.isSummary)} thru=\${fmt(t.completeThrough)} c=\${t.complete}\`;
  const day = (m, d, h, mi) => new Date(2025, m - 1, d, h === undefined ? 8 : h, mi === undefined ? 0 : mi);
  const mk = (durations, indent) => {
    const p = new gantt.Project('P');
    p.startDate = day(1, 6);
    p.addTasks(durations.map(value => ({ duration: String(value) })));
    if (indent) p.indentTasks(indent);
    return p;
  };
  const cases = {};
  const add = (name, build) => { cases[name] = build; };

  // 1. Predecessor string grammar and invalidDependency cases (trial probes 2, 3, 5).
  const texts = [...new Set([
    '1FS,2SS', '1FS+1d,2SS', '1FS+1,2SS', '1FS+1d,2', '1,2FS', '1FS,2', '1FS+1d,3SS+2d', '1SS+1h,2FS',
    '1FS,1FS', '1FS,1SS', '1FS,3FS,4SS', '1FS+1d,2SS,3FF', '1FS-1d,2SS', '1FS+1x,2SS', '1FS++1,2SS',
    '1FS+ 1d,2SS', '1FS+1d, 2SS', '1FS+1d ,2SS', '2FS,3SS', '1FS,3FS',
    '1FS+1 days', '1FS+2 day', '2FS+2 day', '1FS+2 days', '1FS+1 das', '1FS+1 dayx', '1FS+2day', '1FS+2 d',
    '1FS+30 mins', '1FS+2 wks', '1FS+2 w', '1FS+2 w x', '1FS+1day2', '1FS+1 d2 h', '1FS++ 1d', '1FS+-1d',
    '1FS-+1d', '1FS,,2SS', '1FS + 1d', '1FS+1 day', '1FS +1', '1FS - 1d', '1FS+ d', '1FS+', '1FS- ',
    '1FS-1mon', '1FS+.5d', '1FS+2h30min', '1FS+a', '1FS+1d ', '1FS 1 d', '1 FS+1d', ' 1FS+1d', '1FS+1MON',
    '1FS+1D', '1FS+15min', '1FS+1week', '1SS-2h', '1FF+3d', '1SF-1h', '1FS+0d', '1FS+0', '1FS+1h1m',
    '1FS 1FS', '1 SS', '01FS', '+1FS', '1FS+1d,', ',1FS', '1FSS', '1X', '2FS;1FS', '1FS,5SS', '5',
    '1fs+1d , 2SS+ 1 day ,3ff-2hrs', '3SS+0,1FS+',
  ])];
  texts.forEach(text => add('grammar:' + text, () => {
    const p = mk(['1d', '1d', '1d', '1d', '1d']);
    try {
      p.getTask(5).predecessors = text;
      const read = p.getTask(5).predecessors;
      const deps = p.dependencies.length;
      const types = p.dependencies.map(d => d.type).join('/');
      p.resumeSchedule();
      return \`ok read=\${JSON.stringify(read)} deps=\${deps} types=\${types} \${rows(p)}\`;
    } catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length}\`; }
  }));
  add('grammar:sameOnTask3', () => {
    const p = mk(['1d', '1d', '1d']);
    try { p.getTask(3).predecessors = '1FS 1FS'; return 'no-throw read=' + JSON.stringify(p.getTask(3).predecessors); }
    catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length}\`; }
  });
  const dependencyCases = {
    dupIdentical: p => { try { p.addDependency([{ fromTaskNumber: 1, toTaskNumber: 2 }, { fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }]); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } },
    dupReplaceType: p => { p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }); p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' }); return \`deps=\${p.dependencies.length} read=\${JSON.stringify(p.getTask(2).predecessors)}\`; },
    self: p => { try { p.addDependency({ fromTaskNumber: 2, toTaskNumber: 2 }); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } },
    unknownNumber: p => { try { p.addDependency({ fromTaskNumber: 1, toTaskNumber: 999 }); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } },
    rootNumber: p => { try { p.addDependency({ fromTaskNumber: 0, toTaskNumber: 2 }); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } },
    cycleString: p => { p.getTask(2).predecessors = '1FS'; try { p.getTask(1).predecessors = '2FS'; return 'no-throw'; } catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length}\`; } },
    cycleAdd: p => { p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2 }); try { p.addDependency({ fromTaskNumber: 2, toTaskNumber: 1 }); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } },
    parentChild: p => { p.indentTasks([2, 3]); try { p.addDependency({ fromTaskNumber: 1, toTaskNumber: 3, type: 'FS' }); return 'deps=' + p.dependencies.length; } catch (e) { return 'throws ' + String(e); } },
    childParent: p => { p.indentTasks([2, 3]); try { p.addDependency({ fromTaskNumber: 3, toTaskNumber: 1, type: 'FS' }); return 'deps=' + p.dependencies.length; } catch (e) { return 'throws ' + String(e); } },
    indentDropsLink: p => { p.getTask(3).predecessors = '1FS'; p.indentTasks([2, 3]); p.resumeSchedule(); return \`deps=\${p.dependencies.length} read=\${JSON.stringify(p.getTask(3).predecessors)} \${rows(p)}\`; },
    removeDep: p => { p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' }); p.removeDependency(p.dependencies[0]); p.resumeSchedule(); return \`deps=\${p.dependencies.length} \${rows(p)}\`; },
    clearString: p => { p.getTask(2).predecessors = '1FS'; p.resumeSchedule(); p.getTask(2).predecessors = ''; p.resumeSchedule(); return \`read=\${JSON.stringify(p.getTask(2).predecessors)} succ1=\${JSON.stringify(p.getTask(1).successors)} \${rows(p)}\`; },
    successorsMirror: p => { p.getTask(2).predecessors = '1FS'; p.resumeSchedule(); return \`succ1=\${JSON.stringify(p.getTask(1).successors)} pred2=\${JSON.stringify(p.getTask(2).predecessors)}\`; },
    depObjects: p => { const dep = new gantt.TaskDependency(p.getTask(1), p.getTask(2), 'FF'); p.addDependency(dep); return \`from=\${p.dependencies[0].from.taskNumber} to=\${p.dependencies[0].to.taskNumber} type=\${p.dependencies[0].type}\`; },
    bareDependency: () => { const dep = new gantt.TaskDependency(); return \`from=\${String(dep.from)} to=\${String(dep.to)} type=\${dep.type}\`; },
  };
  Object.keys(dependencyCases).forEach(name => add('dep:' + name, () => dependencyCases[name](mk(['1d', '1d', '1d', '1d']))));
  add('dep:existingPairOtherType', () => { const p = mk(['1d', '1d', '1d', '1d']); p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
    try { p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' }); return \`no-throw deps=\${p.dependencies.length} read=\${JSON.stringify(p.getTask(2).predecessors)}\`; }
    catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length}\`; } });
  add('dep:halfInvalidBatch', () => { const p = mk(['1d', '1d', '1d', '1d']);
    try { p.addDependency([{ fromTaskNumber: 1, toTaskNumber: 3 }, { fromTaskNumber: 2, toTaskNumber: 2 }]); return 'no-throw deps=' + p.dependencies.length; }
    catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length}\`; } });
  add('dep:stringReplacesTypedLink', () => { const p = mk(['1d', '1d', '1d', '1d']); p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }); p.resumeSchedule();
    const before = rows(p);
    try { p.getTask(2).predecessors = '1SS'; p.resumeSchedule(); return \`\${before} || deps=\${p.dependencies.length} read=\${JSON.stringify(p.getTask(2).predecessors)} \${rows(p)}\`; }
    catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length}\`; } });
  add('dep:stringHalfInvalidKeepsLinks', () => { const p = mk(['1d', '1d', '1d', '1d']); p.getTask(2).predecessors = '1FS'; p.resumeSchedule();
    try { p.getTask(2).predecessors = '3FS,2SS'; return 'no-throw'; }
    catch (e) { return \`throws \${String(e)} deps=\${p.dependencies.length} read=\${JSON.stringify(p.getTask(2).predecessors)}\`; } });
  add('dep:removeForeignDependency', () => { const p = mk(['1d', '1d']); const other = mk(['1d', '1d']);
    other.addDependency({ fromTaskNumber: 1, toTaskNumber: 2 });
    try { p.removeDependency(other.dependencies[0]); return \`no-throw deps=\${p.dependencies.length}\`; }
    catch (e) { return 'throws ' + String(e); } });
  add('dep:removeMissingLink', () => { const p = mk(['1d', '1d']); const ghost = new gantt.TaskDependency(p.getTask(1), p.getTask(2), 'FF');
    try { p.removeDependency(ghost); return \`no-throw deps=\${p.dependencies.length} \${rows(p)}\`; } catch (e) { return 'throws ' + String(e); } });
  add('dep:removeNothing', () => { const p = mk(['1d', '1d']); try { p.removeDependency([]); return 'no-throw deps=' + p.dependencies.length; } catch (e) { return 'throws ' + String(e); } });
  add('dep:addNothing', () => { const p = mk(['1d', '1d']); try { p.addDependency([]); return 'no-throw deps=' + p.dependencies.length; } catch (e) { return 'throws ' + String(e); } });
  ['countZero:1:0', 'countNegative:1:-1', 'countDefault:3:', 'countTwo:3:2', 'taskZero:0:1', 'taskHigh:9:1'].forEach(spec => {
    const [label, first, second] = spec.split(':');
    add('range:' + label, () => {
      const p = mk(['1d', '1d', '1d']);
      const args = [Number(first)];
      if (second !== '') args.push(Number(second));
      try { p.removeTasksByRange(args[0], args.length > 1 ? args[1] : undefined); return \`count=\${p.count} \${rows(p)}\`; }
      catch (e) { return 'throws ' + String(e); }
    });
  });
  add('range:stringCount', () => { const p = mk(['1d', '1d', '1d']); try { p.removeTasksByRange(1, '2'); return \`count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('lookup:taskHigh', () => { const p = mk(['1d', '1d']); const t = p.getTask(99); return t === undefined ? 'undefined' : t === null ? 'null' : \`task=\${t.taskNumber}\`; });
  add('lookup:taskZero', () => { const p = mk(['1d', '1d']); const t = p.getTask(0); return t === undefined ? 'undefined' : t === null ? 'null' : \`task=\${t.taskNumber} level=\${t.level}\`; });
  add('lookup:rowHigh', () => { const p = mk(['1d', '1d']); const t = p.getTaskByRow(99); return t === undefined ? 'undefined' : t === null ? 'null' : \`task=\${t.taskNumber}\`; });
  add('lookup:afterRemove', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); p.removeTasks(1); const t = p.getTask(2); return \`count=\${p.count} task2=\${t === undefined ? 'undefined' : t === null ? 'null' : t.taskNumber} rootChildren=\${p.root.children.length}\`; });
  ['indentHigh:99', 'indentZero:0', 'outdentHigh:99'].forEach(spec => {
    const [label, number] = spec.split(':');
    add('outline:' + label, () => { const p = mk(['1d', '1d', '1d', '1d'], [2, 3]);
      try { (label === 'outdentHigh' ? p.outdentTasks(Number(number)) : p.indentTasks(Number(number))); return \`no-throw levels=\${p.tasks.map(t => t.level).join(',')}\`; }
      catch (e) { return 'throws ' + String(e); } });
  });
  add('outline:stringIndent', () => { const p = mk(['1d', '1d', '1d', '1d']); try { p.indentTasks(['2']); return \`levels=\${p.tasks.map(t => t.level).join(',')}\`; } catch (e) { return 'throws ' + String(e); } });
  add('outline:removeZero', () => { const p = mk(['1d', '1d']); try { p.removeTasks(0); return \`no-throw count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('outline:removeEmptyList', () => { const p = mk(['1d', '1d']); try { p.removeTasks([]); return \`no-throw count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('outline:insertZero', () => { const p = mk(['1d', '1d']); try { p.insertTasks(0, { name: 'I0' }); return \`no-throw count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('outline:addLevelZero', () => { const p = mk(['1d']); try { const r = p.addTasks({ name: 'z' }, 0); return \`level=\${r[0].level} count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('outline:addCountZero', () => { const p = mk(['1d']); const r = p.addTasks(0); return \`added=\${r.length} count=\${p.count}\`; });
  add('outline:addNothing', () => { const p = mk(['1d']); const r = p.addTasks(); return \`added=\${r.length} count=\${p.count}\`; });
  add('schedule:extraResume', () => { const p = mk(['1d', '1d']); p.getTask(1).duration = '3d'; const a = rows(p); p.resumeSchedule(); p.resumeSchedule(); return a + ' || ' + rows(p); });
  add('schedule:suspendThenResumeTwice', () => { const p = mk(['1d', '1d']); p.suspendSchedule(); p.suspendSchedule(); p.getTask(1).duration = '3d'; const mid = rows(p); p.resumeSchedule(); const one = rows(p); p.resumeSchedule(); return \`\${mid} | \${one} | \${rows(p)}\`; });
  add('schedule:suspendLeafDuration', () => { const p = mk(['1d', '1d']); p.getTask(2).predecessors = '1FS'; p.resumeSchedule(); p.suspendSchedule(); p.getTask(1).duration = '3d'; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendManualLeafDuration', () => { const p = mk(['1d', '1d']); p.getTask(1).mode = 'Manual'; p.getTask(1).start = day(1, 8); p.suspendSchedule(); p.getTask(1).duration = '2d'; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendChildDuration', () => { const p = mk(['1d', '1d'], [2]); p.suspendSchedule(); p.getTask(2).duration = '3d'; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendSummaryDuration', () => { const p = mk(['1d', '1d'], [2]); p.suspendSchedule(); p.getTask(1).duration = '4d'; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendManualStart', () => { const p = mk(['1d']); p.getTask(1).mode = 'Manual'; p.suspendSchedule(); p.getTask(1).start = day(1, 20); const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendFinishClear', () => { const p = mk(['2d', '1d']); p.suspendSchedule(); p.getTask(1).finish = null; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendNullStartLeaf', () => { const p = mk(['2d', '2d']); p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }); p.suspendSchedule(); p.getTask(2).start = null; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendAnchoredSummary', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = day(1, 20); p.suspendSchedule(); p.getTask(2).duration = '3d'; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendSummaryStartPin', () => { const p = mk(['1d', '1d'], [2]); p.suspendSchedule(); p.getTask(1).start = day(1, 20); const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendSummaryFinishClear', () => { const p = mk(['2d', '2d'], [2]); p.suspendSchedule(); p.getTask(1).finish = null; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('schedule:suspendManualLeafFinishClear', () => { const p = mk(['1d']); p.getTask(1).mode = 'Manual'; p.getTask(1).start = day(1, 6); p.getTask(1).finish = day(1, 10, 17); p.suspendSchedule(); p.getTask(1).finish = null; const mid = rows(p); p.resumeSchedule(); return mid + ' || ' + rows(p); });
  add('summary:durationSetterUnpinned', () => { const p = mk(['1d', '1d'], [2]); p.getTask(1).duration = '4d'; return rows(p); });
  add('summary:durationSetterNarrower', () => { const p = mk(['1d', '3d'], [2]); p.getTask(1).duration = '1d'; return rows(p); });
  add('summary:durationDataUnpinned', () => rows(mk(['4d', '1d'], [2])));
  add('summary:durationDataNarrower', () => rows(mk(['1d', '3d'], [2])));
  add('summary:durationSetterCleared', () => { const p = mk(['1d', '3d'], [2]); p.getTask(1).duration = null; return rows(p); });
  add('summary:durationSetterAfterAnchor', () => { const p = mk(['1d', '3d'], [2]); p.getTask(1).start = day(1, 20); p.getTask(1).duration = '1d'; return rows(p); });
  add('summary:durationThenChildEdit', () => { const p = mk(['1d', '1d'], [2]); p.getTask(1).duration = '4d'; p.getTask(2).duration = '2d'; return rows(p); });
  add('summary:childEditAfterDurationPin', () => { const p = mk(['1d', '1d'], [2]); p.getTask(1).duration = '4d'; p.getTask(2).start = day(1, 20); return rows(p); });
  add('leaf:finishClearUnpinned', () => { const p = mk(['2d', '1d']); p.getTask(1).finish = null; return rows(p); });
  add('leaf:startClearUnpinned', () => { const p = mk(['2d', '1d']); p.getTask(1).start = null; return rows(p); });
  add('leaf:startClearWithSuccessor', () => { const p = mk(['2d', '2d']); p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }); p.getTask(1).start = null; return rows(p); });
  add('leaf:durationNullDefault', () => { const p = mk(['2d', '1d']); p.getTask(2).duration = null; return rows(p) + ' | ' + disp(p.getTask(2)); });
  add('leaf:finishClearThenDuration', () => { const p = mk(['2d', '1d']); p.getTask(1).finish = null; p.getTask(1).duration = '3d'; return rows(p); });
  add('dep:stringNumbers', () => { const p = mk(['1d', '1d']); p.removeTasks(['1']); return \`count=\${p.count}\`; });
  add('dep:duplicateRemove', () => { const p = mk(['1d', '1d']); p.removeTasks([1, 1]); return \`count=\${p.count}\`; });
  add('dep:rangeExactEnd', () => { const p = mk(['1d', '1d', '1d']); try { p.removeTasksByRange(3, 1); return \`count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('dep:rangeBeyond', () => { const p = mk(['1d', '1d', '1d']); try { p.removeTasksByRange(3, 2); return \`count=\${p.count}\`; } catch (e) { return 'throws ' + String(e); } });
  add('outline:insertLevelLow', () => { const p = mk(['1d', '1d']); try { p.insertTasks(1, { name: 'I2' }, 2); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } });
  add('outline:insertLevelMatch', () => { const p = mk(['1d', '1d']); const r = p.insertTasks(2, { name: 'J2' }, 2); return \`\${r.map(t => \`\${t.name}:\${t.level}\`).join(',')} || \${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.level}:\${t.taskNumber}\`).join(',')}\`; });
  add('outline:insertLevelHigh', () => { const p = mk(['1d', '1d']); try { p.insertTasks(2, { name: 'K3' }, 3); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } });
  add('outline:appendDefaultLevel', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); const r = p.addTasks({ name: 'D' }); return \`level=\${r[0].level} | \${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.level}\`).join(',')}\`; });
  add('outline:insertDefaultLevel', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); const r = p.insertTasks(1, { name: 'E' }); return \`level=\${r[0].level} | \${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.level}:\${t.taskNumber}\`).join(',')}\`; });
  add('outline:insertAtCount', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); const r = p.insertTasks(p.count, { name: 'IE' }); return \`\${r.map(t => \`\${t.name}:\${t.level}:\${t.taskNumber}\`).join(',')} count=\${p.count}\`; });
  add('outline:insertOutOfRange', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); try { p.insertTasks(99, { name: 'I99' }); return 'no-throw count=' + p.count; } catch (e) { return 'throws ' + String(e); } });
  add('outline:removeSummary', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); p.removeTasks(1); return \`count=\${p.count} tasks=\${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.level}:\${t.taskNumber}\`).join(',')} deps=\${p.dependencies.length}\`; });
  add('outline:indentElder', () => { const p = mk(['1d', '1d', '1d', '1d'], [2, 3]); p.indentTasks(4); p.outdentTasks(2); return p.tasks.map(t => t.level).join(','); });
  const sortFields = ['name', 'start', 'finish', 'duration', 'mode', 'complete', 'level', 'taskNumber', 'rowIndex',
    'isSummary', 'isMilestone', 'isNormal', 'completeThrough', 'predecessors', 'successors', 'startDisplayed',
    'finishDisplayed', 'style', 'parent', 'children', 'value', 'getValue'];
  sortFields.forEach(field => add('sortField:' + field, () => {
    const p = mk(['1d', '2d']);
    try { p.sort([field], [true]); return \`ok sorted=\${p.sorted} rows=\${p.tasksSorted.map(t => t ? t.name ?? 'root' : 'null').join(',')}\`; }
    catch (e) { return 'throws ' + String(e); }
  }));
  add('sort:lengthMismatch', () => { const p = mk(['1d']); try { p.sort(['name'], [true, false]); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } });
  add('sort:emptyAsc', () => { const p = mk(['1d']); try { p.sort(['name'], [], true); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } });
  add('sort:renumberWithoutStructure', () => { const p = mk(['1d']); try { p.sort(['name'], [true], false, true); return 'no-throw'; } catch (e) { return 'throws ' + String(e); } });
  const outlineNames = () => { const p = mk(['1d', '1d', '1d', '1d']); p.tasks.slice(1).forEach((t, i) => { t.name = ['zebra', 'yak', 'fox', 'ant'][i]; }); p.indentTasks([2, 3]); return p; };
  add('sort:keepRenumber', () => { const p = outlineNames(); p.sort(['name'], [true], true, true); return \`sorted=\${p.sorted} rows=\${p.tasksSorted.map(t => t ? \`\${t.name}:\${t.taskNumber}:\${t.rowIndex}:\${t.level}\` : 'null').join(',')} tasks=\${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.taskNumber}:\${t.rowIndex}\`).join(',')}\`; });
  add('sort:keepOnly', () => { const p = outlineNames(); p.sort(['name'], [true], true); return \`sorted=\${p.sorted} rows=\${p.tasksSorted.map(t => t ? \`\${t.name}:\${t.taskNumber}:\${t.rowIndex}:\${t.level}\` : 'null').join(',')} tasks=\${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.taskNumber}:\${t.rowIndex}\`).join(',')}\`; });
  add('sort:dropStructure', () => { const p = outlineNames(); p.sort(['name'], [true], false); return \`sorted=\${p.sorted} rows=\${p.tasksSorted.map(t => t ? \`\${t.name}:\${t.taskNumber}:\${t.rowIndex}:\${t.level}\` : 'null').join(',')} tasks=\${p.tasks.map(t => \`\${t.name ?? 'root'}:\${t.taskNumber}:\${t.rowIndex}\`).join(',')}\`; });
  add('sort:descendKeep', () => { const p = outlineNames(); p.sort(['name'], [false], true); return \`sorted=\${p.sorted} rows=\${p.tasksSorted.map(t => t ? \`\${t.name}:\${t.taskNumber}:\${t.rowIndex}:\${t.level}\` : 'null').join(',')}\`; });
  add('sort:noFields', () => { const p = outlineNames(); p.sort([]); return \`sorted=\${p.sorted} rows=\${p.tasksSorted.map(t => t ? \`\${t.name}:\${t.taskNumber}:\${t.rowIndex}:\${t.level}\` : 'null').join(',')}\`; });
  add('sort:byStart', () => { const p = new gantt.Project('W6'); p.startDate = day(1, 6); p.addTasks([
    { name: 'late', mode: 'Manual', start: day(1, 20) }, { name: 'early', mode: 'Manual', start: day(1, 6) },
    { name: 'nullStart', mode: 'Manual', finish: day(1, 8, 17) }, { name: 'dur3', duration: '3d' }, { name: 'dur1', duration: '1d' }]);
    p.sort(['start'], [true]); const asc = p.tasksSorted.map(t => t ? t.name : 'null').join(',');
    p.sort(['start'], [false]); return \`asc=\${asc} desc=\${p.tasksSorted.map(t => t ? t.name : 'null').join(',')}\`; });
  add('sort:taskNumber', () => { const p = new gantt.Project('W6d'); p.startDate = day(1, 6); p.addTasks([{ name: 'n2', duration: '1d' }, { name: 'n10', duration: '1d' }, { name: 'n1', duration: '1d' }]);
    p.sort(['taskNumber'], [true]); return p.tasksSorted.map(t => t ? t.name : 'null').join(','); });
  add('row:getTaskByRow', () => { const p = mk(['1d', '1d', '1d'], [2, 3]); const plain = [0, 1, 2, 3].map(n => \`\${n}:\${p.getTaskByRow(n) ? p.getTaskByRow(n).taskNumber : 'null'}\`).join(',');
    p.sort(['taskNumber'], [false]); const sorted = [0, 1, 2, 3].map(n => \`\${n}:\${p.getTaskByRow(n) ? p.getTaskByRow(n).taskNumber : 'null'}\`).join(','); return \`plain=\${plain} sorted=\${sorted}\`; });
  add('project:freshDefaults', () => { const p = new gantt.Project('Fresh');
    const settings = p.calendarSettings, layout = p.layout, ts = p.timescale;
    const tier = name => \`\${String(ts[name].unit)}|\${ts[name].count}|\${ts[name].labelAlign}|\${ts[name].showTickLines}|\${String(ts[name].formatter)}\`;
    return \`start=\${fmt(p.startDate)} finish=\${fmt(p.finishDate)} status=\${String(p.statusDate)} current=\${fmt(p.currentDate)} count=\${p.count} sorted=\${p.sorted} deps=\${p.dependencies.length} tasksSorted=\${p.tasksSorted.length} rootName=\${p.root.name} root=\${fmt(p.root.start)}-\${fmt(p.root.finish)}(\${dur(p.root.duration)}) level=\${p.root.level} number=\${p.root.taskNumber} row=\${p.root.rowIndex} parent=\${String(p.root.parent)} mode=\${p.root.mode} summary=\${p.root.isSummary} milestone=\${String(p.root.isMilestone)} normal=\${p.root.isNormal} complete=\${p.root.complete} through=\${fmt(p.root.completeThrough)} sd=\${fmt(p.root.startDisplayed)} fd=\${fmt(p.root.finishDisplayed)} children=\${p.root.children.length} style=\${String(p.root.style)} calendar=\${p.calendar.name} weeks=\${p.calendar.customWorkWeeks.length} settings=\${JSON.stringify({ dpm: settings.daysPerMonth, digits: settings.defaultDurationDecimalDigits, unit: settings.defaultDurationUnit, ft: settings.defaultFinishTime, st: settings.defaultStartTime, hpd: settings.hoursPerDay, hpw: settings.hoursPerWeek, labels: settings.unitLabels, plurals: settings.unitLabelsPlurals, weekStart: settings.weekStartOn })} layout=\${JSON.stringify({ barHeight: layout.barHeight, barTextDateFormat: layout.barTextDateFormat, linkLineMode: layout.linkLineMode, roundBarsToWholeDays: layout.roundBarsToWholeDays, tipDateFormat: layout.tipDateFormat })} timescale=\${JSON.stringify({ autoFitMode: ts.autoFitMode, margin: ts.margin, maxDate: fmt(ts.maxDate), minDate: fmt(ts.minDate), showScaleSeparator: ts.showScaleSeparator, tierMode: ts.tierMode, topTextStyle: ts.timescaleTopTierTextStyle, middleTextStyle: ts.timescaleMiddleTierTextStyle, bottomTextStyle: ts.timescaleBottomTierTextStyle, zoomFactor: ts.zoomFactor, nonWorkingTime: { color: ts.nonWorkingTime.color, drawMode: ts.nonWorkingTime.drawMode, pattern: ts.nonWorkingTime.pattern } })} tiers=\${tier('topTier')} \${tier('middleTier')} \${tier('bottomTier')} rules=\${p.taskStyleRules.all().length} ruleNames=\${p.taskStyleRules.all().map(r => \`\${r.name}|\${String(r.typeName)}\`).join(',')}\`; });
  // The trial declares "length(): number" in its d.ts, but its collection instance exposes
  // length as a plain number; this case records the difference instead of hiding it.
  add('collection:surface', () => { const p = new gantt.Project('C');
    const collection = p.taskStyleRules;
    const methods = ['add', 'all', 'clear', 'getIndexByItem', 'getItemAt', 'getRule', 'insert', 'length', 'remove', 'removeAt', 'setItemAt']
      .map(name => \`\${name}:\${typeof collection[name]}\`).join(',');
    let viaMethod = 'n/a';
    try { viaMethod = String(collection.length()); } catch (e) { viaMethod = 'THROWS ' + String(e).slice(0, 40); }
    return \`namespace=\${typeof gantt.Collection} methods=\${methods} lengthValue=\${String(collection.length)} viaMethodCall=\${viaMethod} ruleCount=\${collection.all().length} getRule=\${String(collection.getRule('task') ? collection.getRule('task').name : null)}\`; });
  add('project:bareMembers', () => {
    const calendar = new gantt.Calendar();
    const custom = new gantt.CustomWorkWeek([[], [], [], [], [], [], []]);
    const one = Array.from({ length: 7 }, () => [{ start: { hour: 8, minute: 0 }, end: { hour: 12, minute: 0 } }]);
    const week = new gantt.WorkWeek(one);
    const dependency = new gantt.TaskDependency();
    const tier = new gantt.TimescaleTier();
    const rule = new gantt.TaskbarStyleRule('Bare');
    const gridlines = new gantt.GanttGridlines();
    const nonWorking = new gantt.NonWorkingTimeStyle();
    const safeDate = value => { try { return String(rule.getFromDate(value)); } catch (e) { return 'THROWS ' + String(e).slice(0, 30); } };
    return \`calendar=\${String(calendar.name)} week=\${!!calendar.defaultWorkWeek} custom=\${String(calendar.customWorkWeeks)} | cweek=\${String(custom.start)}-\${String(custom.finish)} | workDay3=\${JSON.stringify(week.getWorkDay(3))} | dep=\${String(dependency.from)}-\${String(dependency.to)}-\${dependency.type} lag=\${String(dependency.lag)} | tier=\${String(tier.unit)}|\${tier.count}|\${tier.labelAlign}|\${tier.showTickLines}|\${String(tier.formatter)} | rule=\${rule.name}|\${String(rule.style)}|\${String(rule.typeName)}|from=\${safeDate({})}|json=\${JSON.stringify(rule.toJSON())} | grid=\${JSON.stringify(gridlines.bottomTierColumn)}|\${JSON.stringify(gridlines.currentDate)}|\${JSON.stringify(gridlines.ganttRows)}|\${JSON.stringify(gridlines.middleTierColumn)}|\${JSON.stringify(gridlines.projectFinish)}|\${JSON.stringify(gridlines.projectStart)}|\${JSON.stringify(gridlines.statusDate)}|\${JSON.stringify(gridlines.topTierColumn)} | nwt=\${nonWorking.color}|\${nonWorking.drawMode}|\${nonWorking.pattern}\`; });
  add('calendar:statics', () => {
    const counts = calendar => [0, 1, 2, 3, 4, 5, 6].map(i => (calendar.defaultWorkWeek.getWorkDay(i) ?? []).length).join(',');
    const intervals = calendar => [0, 1, 2, 3, 4, 5, 6].map(i => JSON.stringify(calendar.defaultWorkWeek.getWorkDay(i) ?? [])).join(';');
    return \`\${gantt.Calendar.standard.name}/\${gantt.Calendar.hours24.name}/\${gantt.Calendar.nightShift.name} standard=\${counts(gantt.Calendar.standard)} hours24=\${counts(gantt.Calendar.hours24)} night=\${counts(gantt.Calendar.nightShift)} standardDays=\${intervals(gantt.Calendar.standard)} nightDays=\${intervals(gantt.Calendar.nightShift)}\`; });
  add('mapping:projectFormat', () => { const p = new gantt.Project('M'); const m = new gantt.GanttMapping();
    const text = value => { try { const d = p.parseDuration(value); return d ? \`\${d.value}|\${d.unit}|\${d.time}=\${p.formatDuration(d)}\` : String(d); } catch (e) { return 'THROWS ' + String(e).slice(0, 30); } };
    const run = (label, fn) => { try { return label + '=' + String(fn()); } catch (e) { return label + ' THROWS ' + String(e).slice(0, 30); } };
    return ['1d', '2d', '90min', '1.5d', '1w', '1mon', '0d', '4h', '2', '1'].map(text).join(' ; ')
      + ' | ' + run('int', () => m.formatInt(1234.5))
      + ' ' + run('bool', () => JSON.stringify([m.formatBoolean(true), m.formatBoolean(false)]))
      + ' ' + run('mode', () => m.formatMode('Manual'))
      + ' ' + run('date', () => m.formatDate(new Date(2025, 0, 6, 8, 30)))
      + ' ' + run('parseInt', () => JSON.stringify([m.parseInt('1,234'), m.parseInt('abc'), m.parseInt(true)]))
      + ' ' + run('parseBoolean', () => JSON.stringify([m.parseBoolean('true'), m.parseBoolean('no'), m.parseBoolean(1)]))
      + ' ' + run('parseMode', () => JSON.stringify([m.parseMode('Manual'), m.parseMode('x')]))
      + ' ' + run('parseDate', () => JSON.stringify(m.parseDate('2025-01-06 08:00')))
      + ' ' + run('parseSerial', () => JSON.stringify(m.parseDate('45661'))); });

  // 2. Summary start/finish cascade and recompute on child edits (trial probes 2, 3, 4, 5, 6, 7, 8).
  const anchored = () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = day(1, 20); return p; };
  add('anchor:auto', () => rows(anchored()));
  add('anchor:saturday', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = day(1, 11); return rows(p); });
  add('anchor:sunday', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = day(1, 12); return rows(p); });
  add('anchor:mondayThenSaturday', () => { const p = anchored(); const before = rows(p); p.getTask(1).start = day(1, 11); return before + ' || ' + rows(p); });
  add('anchor:saturdayThenMonday', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = day(1, 11); const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:childDurationEdit', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = day(1, 11); p.getTask(2).duration = '1d'; return rows(p); });
  add('anchor:childFsDep', () => { const p = anchored(); p.addDependency({ fromTaskNumber: 2, toTaskNumber: 3, type: 'FS' }); return rows(p); });
  add('anchor:outdentChild', () => { const p = anchored(); p.outdentTasks(3); return rows(p); });
  add('anchor:addChild', () => { const p = anchored(); p.addTasks({ name: 'C', duration: '2d' }, 2); return rows(p); });
  add('anchor:childNullStart', () => { const p = anchored(); p.getTask(2).start = null; return rows(p); });
  add('anchor:sortName', () => { const p = anchored(); p.sort(['name'], [true]); return rows(p) + ' || sorted=' + p.sorted; });
  add('anchor:childComplete', () => { const p = anchored(); p.getTask(2).complete = 0.5; return rows(p); });
  add('anchor:projectStartLater', () => { const p = anchored(); p.startDate = day(1, 27); return rows(p); });
  add('anchor:clearStartAfterCascade', () => { const p = anchored(); p.getTask(1).start = null; return rows(p); });
  add('anchor:clearStartFresh', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).start = null; return rows(p); });
  add('anchor:clearFinish', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).finish = day(1, 20, 17); const before = rows(p); p.getTask(1).finish = null; return before + ' || ' + rows(p); });
  add('anchor:finishPin', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).finish = day(1, 21, 17); return rows(p); });
  add('anchor:finishPinThenChildEdit', () => { const p = mk([2, 2], [2]); p.getTask(1).finish = day(1, 20, 17); const before = rows(p); p.getTask(2).duration = '1d'; return before + ' || ' + rows(p); });
  add('anchor:finishPinThenStartPin', () => { const p = mk([2, 2], [2]); p.getTask(1).finish = day(1, 20, 17); p.getTask(1).start = day(1, 6); return rows(p); });
  add('anchor:manualClearStart', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).mode = 'Manual'; p.getTask(1).start = day(1, 20); p.getTask(1).start = null; return rows(p); });
  add('anchor:manualStartCascade', () => { const p = mk([2, 2, 2], [2, 3]); p.getTask(1).mode = 'Manual'; p.getTask(1).start = day(1, 20); return rows(p); });
  add('anchor:manualFromData', () => { const p = new gantt.Project('X1'); p.startDate = day(1, 6); p.addTasks([{ name: 'S', mode: 'Manual', start: day(1, 10), duration: '3d' }, { name: 'A', duration: '1d' }, { name: 'B', duration: '1d' }]); p.indentTasks([2, 3]); return rows(p); });
  add('anchor:manualChildClearStart', () => { const p = mk([2, 2], [2]); p.getTask(1).start = day(1, 20); p.getTask(1).start = null; p.addTasks({ name: 'B', duration: '1d' }, 2); return rows(p); });
  add('anchor:durationEdit', () => { const p = mk([1, 1, 3], [2, 3]); p.getTask(1).start = day(1, 20); p.getTask(1).duration = '4d'; return rows(p); });
  add('anchor:finishEdit', () => { const p = mk([1, 1, 3], [2, 3]); p.getTask(1).start = day(1, 20); p.getTask(1).finish = day(1, 24, 17); return rows(p); });
  add('anchor:childEditInside', () => { const p = mk([1, 1, 3], [2, 3]); p.getTask(1).start = day(1, 20); p.getTask(2).duration = '2d'; const a = rows(p); p.getTask(3).start = day(1, 6); return a + ' || ' + rows(p); });
  add('anchor:grandchildInside', () => { const p = mk([1, 1, 1, 3], []); p.indentTasks([2, 3, 4]); p.indentTasks([3, 4]); const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:manualChildSaturday', () => { const p = mk([1, 1, 1], [2, 3]); p.getTask(3).mode = 'Manual'; p.getTask(3).start = day(1, 13); p.getTask(3).duration = '1d'; const before = rows(p); p.getTask(1).start = day(1, 11); return before + ' || ' + rows(p); });
  add('anchor:wideChildren', () => { const p = mk([1, 2, 1], [2, 3]); p.getTask(3).mode = 'Manual'; p.getTask(3).start = day(1, 10); p.getTask(3).duration = '1d'; const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:rootStartEdit', () => { const p = mk([1, 1, 3], [2, 3]); p.getTask(1).start = day(1, 13); p.root.start = day(1, 20); p.root.finish = day(1, 20, 17); return rows(p); });
  add('anchor:chainedInside', () => { const p = mk([1, 2, 1], [2, 3]); p.addDependency({ fromTaskNumber: 2, toTaskNumber: 3, type: 'FS' }); const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:stringDeferral', () => { const p = mk([3, 1, 1, 2], [3, 4]); p.getTask(2).predecessors = '1FS'; const stale = rows(p); p.resumeSchedule(); return \`stale=\${stale} flushed=\${rows(p)}\`; });
  add('anchor:threeChildrenSaturday', () => { const p = mk([1, 1, 1, 1], [2, 3, 4]); p.getTask(1).start = day(1, 11); return rows(p); });
  add('anchor:threeChildrenMonday', () => { const p = mk([1, 1, 1, 1], [2, 3, 4]); const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:chainedSaturday', () => { const p = mk([1, 1, 3], [2, 3]); p.addDependency({ fromTaskNumber: 2, toTaskNumber: 3, type: 'FS' }); p.getTask(1).start = day(1, 11); return rows(p); });
  add('anchor:midDayAnchor', () => { const p = mk([1, 1, 3], [2, 3]); p.getTask(1).start = day(1, 10, 15); const a = rows(p); const q = mk([1, 1, 3], [2, 3]); q.getTask(1).start = day(1, 13, 14); const b = rows(q); const r = mk([1, 1, 3], [2, 3]); r.getTask(1).start = day(1, 13, 18); return \`\${a} || \${b} || \${r}\`; });
  add('anchor:saturdayProjectStart', () => { const p = mk([1, 1, 3], [2, 3]); p.startDate = day(1, 11); return rows(p); });
  add('anchor:depOnSummary', () => { const p = mk([2, 2, 2, 2], [2, 3]); const before = rows(p); p.addDependency({ fromTaskNumber: 4, toTaskNumber: 1, type: 'FS' }); return before + ' || ' + rows(p) + ' deps=' + p.dependencies.length; });
  add('anchor:depOnAnchoredSummary', () => { const p = mk([2, 2, 2], [2]); p.getTask(1).start = day(1, 20); const before = rows(p); p.addDependency({ fromTaskNumber: 3, toTaskNumber: 1, type: 'FS' }); return before + ' || ' + rows(p); });
  add('anchor:constraintEarlierThanAnchor', () => { const p = mk([2, 2, 2, 1], [2, 3]); p.getTask(1).start = day(1, 13); const before = rows(p); p.addDependency({ fromTaskNumber: 4, toTaskNumber: 1, type: 'FS' }); return before + ' || ' + rows(p); });
  add('anchor:nestedCascade', () => { const p = mk([1, 1, 2, 2], []); p.indentTasks(2); p.indentTasks([3, 4]); const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:indentUnderAnchored', () => { const p = mk([2, 2, 2], [2]); p.getTask(1).start = day(1, 20); const before = rows(p); p.indentTasks(3); return before + ' || ' + rows(p); });
  add('anchor:manualChildOutside', () => { const p = new gantt.Project('X6'); p.startDate = day(1, 6); p.addTasks([{ name: 'S', duration: '1d' }, { name: 'M', mode: 'Manual', start: day(1, 8), duration: '1d' }, { name: 'A', duration: '1d' }]); p.indentTasks([2, 3]); const before = rows(p); p.getTask(1).start = day(1, 20); return before + ' || ' + rows(p); });
  add('anchor:removeAnchoredSummary', () => { const p = mk([2, 2, 1], [2]); p.getTask(1).start = day(1, 20); p.removeTasks(1); return \`count=\${p.count} \${rows(p)}\`; });
  add('anchor:milestoneChildCleared', () => { const p = mk([2, 2], [2]); p.getTask(1).start = day(1, 13); const before = rows(p); p.getTask(2).start = null; p.getTask(2).duration = '0d'; return before + ' || ' + rows(p); });
  add('summary:childFinishExtension', () => { const p = mk([1, 1], [2]); const before = rows(p); p.getTask(2).finish = day(1, 15, 17); return before + ' || ' + rows(p); });
  add('summary:rollUpAfterChildEdit', () => { const p = mk([1, 1, 3], [2, 3]); const before = rows(p); p.getTask(2).duration = '3d'; p.getTask(3).start = null; return before + ' || ' + rows(p) + ' | ' + disp(p.getTask(1)); });
  add('summary:completionRollup', () => { const p = mk([1, 1], [2]); p.getTask(2).complete = 0.5; p.resumeSchedule(); return \`c=\${p.getTask(1).complete} \${disp(p.getTask(1))} dur=\${dur(p.getTask(1).duration)}\`; });
  add('summary:manualSummaryFinishThenChild', () => { const p = mk([1, 1, 1], [2, 3, 4]); p.getTask(1).mode = 'Manual'; p.getTask(1).finish = day(1, 20, 17); p.getTask(2).duration = '3d'; return rows(p); });

  // 3. Manual tasks with missing start/finish/duration (trial probes 2, 3, 5, 6, 7).
  const sided = () => { const p = new gantt.Project('M'); p.startDate = day(1, 6); p.addTasks([
    { name: 'StartOnly', mode: 'Manual', start: day(1, 8) }, { name: 'FinishOnly', mode: 'Manual', finish: day(1, 8, 17) },
    { name: 'DurOnly', mode: 'Manual', duration: '2d' }, { name: 'StartDur', mode: 'Manual', start: day(1, 8), duration: '2d' },
    { name: 'FinishDur', mode: 'Manual', finish: day(1, 10, 17), duration: '2d' }, { name: 'AutoFinish', finish: day(1, 10, 17) },
    { name: 'AutoDurNull', duration: '1d' }]); return p; };
  add('manual:sidedTasks', () => sided().tasks.slice(1).map(t => \`\${t.name}: \${fmt(t.start)}-\${fmt(t.finish)}(\${dur(t.duration)}) \${disp(t)}\`).join(' ; '));
  add('manual:finishDurNull', () => { const p = sided(); p.getTask(5).duration = null; return \`\${fmt(p.getTask(5).start)}-\${fmt(p.getTask(5).finish)}(\${dur(p.getTask(5).duration)}) sd=\${fmt(p.getTask(5).startDisplayed)} fd=\${fmt(p.getTask(5).finishDisplayed)}\`; });
  add('manual:finishOnlyThenDuration', () => { const p = sided(); p.getTask(3).finish = day(1, 12, 17); const a = \`\${fmt(p.getTask(3).start)}-\${fmt(p.getTask(3).finish)}(\${dur(p.getTask(3).duration)})\`; p.getTask(3).duration = null; return a + ' || ' + \`\${fmt(p.getTask(3).start)}-\${fmt(p.getTask(3).finish)}(\${dur(p.getTask(3).duration)}) sd=\${fmt(p.getTask(3).startDisplayed)} fd=\${fmt(p.getTask(3).finishDisplayed)}\`; });
  add('manual:probe3Sequence', () => { const p = new gantt.Project('T'); p.startDate = day(1, 6); p.addTasks({ duration: '1d' });
    p.addTasks({ mode: 'Manual', finish: day(1, 10, 17), duration: '1d' }); p.addTasks({ mode: 'Manual', finish: day(1, 12, 17) });
    p.addTasks({ mode: 'Manual', duration: '1d' }); const setup = rows(p);
    p.getTask(2).duration = null; const a = \`\${fmt(p.getTask(2).start)}-\${fmt(p.getTask(2).finish)}(\${dur(p.getTask(2).duration)})\`;
    p.getTask(3).duration = '2d'; const b = \`\${fmt(p.getTask(3).start)}-\${fmt(p.getTask(3).finish)}(\${dur(p.getTask(3).duration)})\`;
    p.getTask(3).duration = null; const c = \`\${fmt(p.getTask(3).start)}-\${fmt(p.getTask(3).finish)}(\${dur(p.getTask(3).duration)})\`;
    p.getTask(4).duration = '2d'; p.getTask(4).finish = day(1, 14, 17);
    return \`\${setup} || \${a} || \${b} || \${c} || \${fmt(p.getTask(4).start)}-\${fmt(p.getTask(4).finish)}(\${dur(p.getTask(4).duration)})\`; });
  add('manual:clearedStart', () => { const p = new gantt.Project('X2'); p.startDate = day(1, 6); p.addTasks({ mode: 'Manual', start: day(1, 6), finish: day(1, 10, 17) });
    const before = rows(p); p.getTask(1).start = null;
    return \`\${before} || \${fmt(p.getTask(1).start)}-\${fmt(p.getTask(1).finish)}(\${dur(p.getTask(1).duration)}) sd=\${fmt(p.getTask(1).startDisplayed)} fd=\${fmt(p.getTask(1).finishDisplayed)}\`; });
  add('manual:bothDatesThenDuration', () => { const p = new gantt.Project('V5'); p.startDate = day(1, 6); p.addTasks({ mode: 'Manual', start: day(1, 6), finish: day(1, 10, 17) });
    const before = rows(p); p.getTask(1).duration = '2d'; const after = rows(p);
    const q = new gantt.Project('V5b'); q.startDate = day(1, 6); q.addTasks({ mode: 'Manual', start: day(1, 6), finish: day(1, 10, 17) }); q.getTask(1).duration = '0d';
    return \`\${before} || \${after} || \${rows(q)}\`; });
  add('manual:noonFinishBackCompute', () => { const p = new gantt.Project('W8'); p.startDate = day(1, 6); p.addTasks({ mode: 'Manual', finish: new Date(2025, 0, 13, 12, 0, 0, 0) }); p.getTask(1).duration = '2d'; return \`\${fmt(p.getTask(1).start)} -> \${fmt(p.getTask(1).finish)}\`; });
  add('manual:modeSwitchOnAutoTask', () => { const p = mk(['3d', '1d']); p.getTask(1).mode = 'Manual'; const a = \`\${fmt(p.getTask(1).start)}-\${fmt(p.getTask(1).finish)}(\${dur(p.getTask(1).duration)})\`;
    p.getTask(1).start = day(1, 9); const b = \`\${fmt(p.getTask(1).start)}-\${fmt(p.getTask(1).finish)}(\${dur(p.getTask(1).duration)})\`;
    p.getTask(1).duration = '2d'; const c = \`\${fmt(p.getTask(1).start)}-\${fmt(p.getTask(1).finish)}(\${dur(p.getTask(1).duration)})\`;
    p.getTask(2).mode = 'Manual'; p.getTask(2).finish = day(1, 13, 17); const d = \`\${fmt(p.getTask(2).start)}-\${fmt(p.getTask(2).finish)}(\${dur(p.getTask(2).duration)})\`;
    p.getTask(2).start = day(1, 10); const e = \`\${fmt(p.getTask(2).start)}-\${fmt(p.getTask(2).finish)}(\${dur(p.getTask(2).duration)})\`;
    p.getTask(2).duration = '0d'; return \`\${a} || \${b} || \${c} || \${d} || \${e} || \${fmt(p.getTask(2).start)}-\${fmt(p.getTask(2).finish)}(\${dur(p.getTask(2).duration)}) ms=\${String(p.getTask(2).isMilestone)}\`; });
  add('manual:autoLeafDatesIgnored', () => { const p = mk(['1d', '1d']); p.getTask(2).start = day(1, 10); const a = rows(p);
    p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }); const b = rows(p);
    p.getTask(2).finish = day(1, 15, 17); const c = rows(p); p.getTask(2).start = day(2, 3); return \`\${a} || \${b} || \${c} || \${rows(p)}\`; });
  add('manual:clearedLeafStart', () => { const p = new gantt.Project('W10'); p.startDate = day(1, 6); p.addTasks([{ name: 'A', duration: '3d' }, { name: 'B', duration: '2d' }]);
    p.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' }); const before = rows(p); p.getTask(2).start = null; return before + ' || ' + rows(p); });
  add('manual:setValueEffects', () => { const p = mk(['1d', '1d', '1d', '1d']); const t = p.getTask(2);
    t.setValue('name', 'zz'); const name = t.name; t.setValue('complete', 0.5); const complete = t.complete;
    t.setValue('start', day(1, 15)); p.resumeSchedule(); const start = fmt(t.start);
    t.mode = 'Manual'; t.setValue('finish', day(1, 17, 17)); p.resumeSchedule();
    return \`name=\${name} complete=\${complete} start=\${start} finish=\${fmt(t.finish)} dur=\${dur(t.duration)}\`; });
  add('manual:completeClamp', () => { const out = []; for (const v of [-20, -0.2, 0, 0.5, 1, 25, 50, 100, 150]) { const p = mk(['1d']); p.getTask(1).complete = v; out.push(\`\${v}->\${p.getTask(1).complete} thru=\${fmt(p.getTask(1).completeThrough)}\`); } return out.join(' ; '); });
  add('manual:throughPercent', () => { const p = new gantt.Project('Q6'); p.startDate = day(1, 6); p.addTasks({ duration: '3d', complete: 50 }); const t = p.getTask(1); const before = \`\${t.complete} thru=\${fmt(t.completeThrough)}\`; t.complete = 0.25; return before + ' then ' + \`\${t.complete} thru=\${fmt(t.completeThrough)}\`; });
  add('manual:throughSetter', () => { const p = mk(['3d']); p.getTask(1).complete = 0.5; const before = fmt(p.getTask(1).completeThrough); p.getTask(1).completeThrough = day(1, 8, 12); return \`before=\${before} after=\${fmt(p.getTask(1).completeThrough)} c=\${p.getTask(1).complete}\`; });
  add('manual:durationsInUnits', () => { const p = new gantt.Project('D'); p.startDate = day(1, 6); p.addTasks([{ duration: '1.5d' }, { duration: '90min' }, { duration: '1wk' }, { duration: '1mon' }, { duration: '0.5h' }]);
    return p.tasks.slice(1).map(t => \`\${dur(t.duration)} \${fmt(t.start)}->\${fmt(t.finish)}\`).join(' ; '); });

  // 4. FS/SS/FF/SF with lag in every unit and sign (trial probe 11 lag matrix).
  const lagPair = () => { const p = new gantt.Project('P'); p.startDate = day(1, 6); p.addTasks([{ name: 'T1', duration: '3d' }, { name: 'T2', duration: '2d' }]); return p; };
  const forms = {
    'none': () => undefined,
    'parse:1d': p => p.parseDuration('1d'), 'parse:4h': p => p.parseDuration('4h'), 'parse:30min': p => p.parseDuration('30min'),
    'parse:1w': p => p.parseDuration('1w'), 'parse:1mon': p => p.parseDuration('1mon'), 'parse:0d': p => p.parseDuration('0d'),
    'parse:-1d': p => p.parseDuration('-1d'), 'parse:-4h': p => p.parseDuration('-4h'), 'parse:-1mon': p => p.parseDuration('-1mon'),
    'object:+1Day': () => ({ value: 1, unit: 'Day' }), 'object:-1Day': () => ({ value: -1, unit: 'Day' }),
    'object:+ms': () => ({ time: 28800000 }), 'object:-ms': () => ({ time: -28800000 }),
    'object:ctor4': null,
  };
  ['FS', 'SS', 'FF', 'SF'].forEach(type => Object.keys(forms).forEach(form => {
    add(\`lag:\${type}:\${form}\`, () => {
      const p = lagPair();
      if (form === 'object:ctor4') {
        const dep = new gantt.TaskDependency(p.getTask(1), p.getTask(2), type, p.parseDuration('1d'));
        p.addDependency(dep); p.resumeSchedule();
        return \`ctorLag=\${dur(dep.lag)} \${rows(p)}\`;
      }
      const dep = new gantt.TaskDependency(p.getTask(1), p.getTask(2), type);
      const value = forms[form](p);
      if (value !== undefined) dep.lag = value;
      p.addDependency(dep);
      const added = rows(p);
      p.resumeSchedule(); const flushed = rows(p);
      p.suspendSchedule(); p.getTask(1).duration = '3d'; p.resumeSchedule();
      return \`lag=\${dur(dep.lag)} added=\${added} flushed=\${flushed} nudged=\${rows(p)}\`;
    });
    ['+1d', '-4h', ''].forEach(suffix => add(\`lagstr:\${type}:\${suffix || 'none'}\`, () => {
      const p = lagPair();
      p.getTask(2).predecessors = \`1\${type}\${suffix}\`;
      const stale = rows(p); p.resumeSchedule();
      return \`read=\${JSON.stringify(p.getTask(2).predecessors)} lag=\${dur(p.dependencies[0] && p.dependencies[0].lag)} stale=\${stale} flushed=\${rows(p)}\`;
    }));
  }));
  // 5. Collection and style-rule surface of the public API (Task 32d item: remaining declared members).
  const fx = () => {
    const p = new gantt.Project('FX');
    p.startDate = day(1, 6);
    p.addTasks([
      { name: 'Auto', duration: '2d' }, { name: 'Zero', duration: '0d' },
      { name: 'SumHead', duration: '1d' }, { name: 'SumChild', duration: '2d' },
      { name: 'Manual', mode: 'Manual', start: day(1, 9), duration: '2d' },
      { name: 'ManMile', mode: 'Manual', start: day(1, 10), duration: '0d' },
      { name: 'StartOnly', mode: 'Manual', start: day(1, 13) },
      { name: 'FinishOnly', mode: 'Manual', finish: day(1, 15, 17) },
      { name: 'DurOnly', mode: 'Manual', duration: '1d' },
      { name: 'Progress', duration: '2d', complete: 0.5 },
    ]);
    p.indentTasks([4]);
    return p;
  };
  const probe = fn => { try { const value = fn(); return value === undefined ? 'undefined' : value === null ? 'null' : String(value); }
    catch (e) { return 'THROWS ' + String(e).slice(0, 44); } };
  const names = c => c.all().map(r => r.name).join(',');
  // The trial exposes length as a number property, ours as the declared method: read whichever exists.
  const size = c => probe(() => typeof c.length === 'function' ? c.length() : c.length);
  add('coll:getRuleLookups', () => { const c = new gantt.Project('C1').taskStyleRules;
    return ['nope', '', 'task', 'Task', 'projectSummary', null, undefined, 0, true].map(key =>
      \`\${String(key)}->\${probe(() => { const r = c.getRule(key); return r ? r.name : r; })}\`).join(' '); });
  add('coll:getRuleIdentity', () => { const c = new gantt.Project('C2').taskStyleRules;
    return names(c).split(',').map((name, i) => \`\${name}=\${c.getRule(name) === c.all()[i] ? 'same' : 'diff'}/\${String(c.getRule(name).typeName)}\`).join(' '); });
  add('coll:addRules', () => { const c = new gantt.Project('C3').taskStyleRules;
    const extra = new gantt.TaskbarStyleRule('Extra'); c.add(extra);
    const afterAdd = size(c);
    const first = names(c); c.add(extra); const duplicate = names(c);
    c.add(new gantt.TaskbarStyleRule('task'));
    return \`added=\${afterAdd} size=\${size(c)} duplicate=\${duplicate === first ? 'ignored' : duplicate.slice(-12)} dupNameLookup=\${probe(() => c.getRule('task') === c.all().find(r => r.name === 'task') ? 'first' : 'other')} extraLookup=\${probe(() => c.getRule('Extra') === extra ? 'same' : 'diff')} newTypeName=\${String(extra.typeName)} newStyle=\${JSON.stringify(extra.style)}\`; });
  add('coll:addInvalid', () => { const c = new gantt.Project('C4').taskStyleRules;
    const before = size(c);
    const out = [null, undefined, 'x', 1, {}, []].map(v => \`\${JSON.stringify(v)}:\${probe(() => c.add(v))}\`).join(' ');
    return \`\${out} | size \${before}->\${size(c)}\`; });
  add('coll:insertIndex', () => { const c = new gantt.Project('C5').taskStyleRules;
    const index = name => c.all().findIndex(r => r && r.name === name);
    c.insert(0, new gantt.TaskbarStyleRule('At0')); const at0 = index('At0');
    c.insert(-1, new gantt.TaskbarStyleRule('Neg')); const neg = index('Neg');
    c.insert(999, new gantt.TaskbarStyleRule('Tail')); const tail = index('Tail');
    const nullInsert = probe(() => c.insert(2, null));
    const hole = probe(() => { const r = c.getItemAt(2); return r === null ? 'null' : r === undefined ? 'undefined' : 'other'; });
    return \`at0=\${at0} neg=\${neg} tail=\${tail} size=\${size(c)} insertNull=\${nullInsert} lookup=\${hole}\`; });
  add('coll:getItemAtRange', () => { const c = new gantt.Project('C6').taskStyleRules;
    const at = key => probe(() => { const r = c.getItemAt(key); return r ? r.name : r; });
    return \`zero=\${at(0)} last=\${at(14)} past=\${at(999)} negative=\${at(-1)} string=\${at('1')} undefined=\${at(undefined)} nan=\${at(NaN)}\`; });
  add('coll:indexLookup', () => { const c = new gantt.Project('C7').taskStyleRules;
    const item = c.all()[2];
    return \`member=\${probe(() => c.getIndexByItem(item))} foreign=\${probe(() => c.getIndexByItem(new gantt.TaskbarStyleRule('Foreign')))} null=\${probe(() => c.getIndexByItem(null))} name=\${probe(() => c.getIndexByItem('task'))} undefined=\${probe(() => c.getIndexByItem(undefined))}\`; });
  add('coll:removeItem', () => { const c = new gantt.Project('C8').taskStyleRules;
    const before = names(c); c.remove(c.all()[0]); const after = names(c);
    const foreign = probe(() => c.remove(new gantt.TaskbarStyleRule('Foreign')));
    const nullRemove = probe(() => c.remove(null));
    return \`dropped=\${before.split(',')[0]} after=\${after} size=\${size(c)} foreign=\${foreign} null=\${nullRemove} final=\${size(c)}\`; });
  add('coll:removeAtRange', () => { const c = new gantt.Project('C9').taskStyleRules;
    const first = c.getItemAt(0).name; c.removeAt(0);
    const past = probe(() => c.removeAt(999)); const negative = probe(() => c.removeAt(-1));
    const hole = probe(() => { const r = c.getItemAt(13); return r === undefined ? 'undefined' : r === null ? 'null' : 'other'; });
    return \`first=\${first} past=\${past} negative=\${negative} size=\${size(c)} tailName=\${c.getItemAt(size(c) - 1).name} hole13=\${hole}\`; });
  add('coll:setItemAtRange', () => { const c = new gantt.Project('C10').taskStyleRules;
    const replaced = probe(() => c.setItemAt(0, new gantt.TaskbarStyleRule('Replaced')));
    const at0 = probe(() => c.getItemAt(0).name); const lookup = probe(() => c.getRule('task'));
    const past = probe(() => c.setItemAt(999, new gantt.TaskbarStyleRule('Past')));
    const sizePast = size(c); const at999 = probe(() => c.getItemAt(999).name);
    const gap = probe(() => { const r = c.getItemAt(500); return r === undefined ? 'undefined' : r === null ? 'null' : 'other'; });
    const negative = probe(() => c.setItemAt(-1, new gantt.TaskbarStyleRule('Negative')));
    return \`set=\${replaced} at0=\${at0} oldLookup=\${lookup} past=\${past} size=\${sizePast} at999=\${at999} gap500=\${gap} negative=\${negative} final=\${size(c)}\`; });
  add('coll:clearAndAdd', () => { const c = new gantt.Project('C11').taskStyleRules;
    const cleared = probe(() => c.clear());
    const after = \`\${size(c)} all=\${c.all().length} lookup=\${probe(() => c.getRule('task'))}\`;
    c.add(new gantt.TaskbarStyleRule('Added'));
    return \`cleared=\${cleared} \${after} then=\${names(c)} size=\${size(c)}\`; });
  add('coll:allIdentity', () => { const c = new gantt.Project('C12').taskStyleRules;
    const copy = c.all(); copy.push(new gantt.TaskbarStyleRule('Pushed'));
    const sameRef = probe(() => c.all() === c.all());
    return \`afterPush=\${size(c)} names=\${names(c).slice(-10)} sameArray=\${sameRef} isArray=\${String(Array.isArray(c))}\`; });
  add('coll:shape', () => { const c = new gantt.Project('C13').taskStyleRules;
    const iterate = probe(() => Array.from(c).length);
    const spread = probe(() => [...c].length);
    return \`isArray=\${String(Array.isArray(c))} iterator=\${String(typeof c[Symbol.iterator])} iterate=\${iterate} spread=\${spread} size=\${size(c)} allLength=\${c.all().length}\`; });
  add('rule:builtins', () => { const c = new gantt.Project('C14').taskStyleRules;
    return JSON.stringify(c.all().map(r => ({ name: r.name, typeName: r.typeName ?? null, json: r.toJSON() }))); });
  add('rule:matchFixture', () => { const p = fx(), c = p.taskStyleRules;
    const list = c.all().map(r => r.name);
    return p.tasks.slice(1).map(t => \`\${t.name}[\${t.mode[0]}\${t.isSummary ? 'S' : t.isMilestone ? 'M' : 'T'}]=\${list.map(n => probe(() => c.getRule(n).match(t) ? '1' : '0')).join('')}\`).join(' '); });
  add('rule:matchRoot', () => { const p = fx(), c = p.taskStyleRules;
    const root = p.root;
    return c.all().map(r => \`\${r.name}=\${probe(() => r.match(root) ? '1' : '0')}\`).join(' '); });
  add('rule:dates', () => { const p = fx(), c = p.taskStyleRules;
    return p.tasks.slice(1).map(t => \`\${t.name}=\${fmt(c.getRule('task').getFromDate(t))}-\${fmt(c.getRule('task').getToDate(t))} prog=\${fmt(c.getRule('progress').getFromDate(t))}-\${fmt(c.getRule('progress').getToDate(t))}\`).join(' ; '); });
  add('rule:baseClass', () => { const p = fx(), c = p.taskStyleRules, t = p.getTask(1);
    const rule = new gantt.TaskbarStyleRule('Base');
    const before = JSON.stringify(rule.toJSON());
    rule.style = { taskbarStyle: { middleColor: '#123456' } };
    const styled = JSON.stringify(rule.toJSON());
    const loaded = probe(() => rule.fromJSON({ name: 'Loaded', style: { taskbarStyle: { middleColor: '#654321' } } }));
    return \`json0=\${before} match=\${probe(() => rule.match(t))} from=\${fmt(rule.getFromDate(t))} to=\${fmt(rule.getToDate(t))} styled=\${styled} fromJSON=\${loaded} name=\${rule.name} json1=\${JSON.stringify(rule.toJSON())}\`; });
  add('rule:customRoundTrip', () => { const p = fx(), c = p.taskStyleRules;
    const custom = new gantt.TaskbarStyleRule('Custom');
    custom.style = { taskbarStyle: { middleColor: '#abcdef', middleShape: 'rectangleBar' } };
    c.add(custom);
    const stored = JSON.stringify(c.getItemAt(c.getIndexByItem(custom)).toJSON());
    const copy = new gantt.TaskbarStyleRule('Copy'); copy.fromJSON(custom.toJSON());
    return \`stored=\${stored} copyStyle=\${JSON.stringify(copy.toJSON())} size=\${size(c)} tail=\${names(c).slice(-8)}\`; });
  return cases;
`;

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  let loaded = false;
  for (let i = 0; i < 50 && !loaded; i++) {
    try { await page.goto('http://127.0.0.1:58242/gantt-comparison.html'); loaded = true; }
    catch { await new Promise(done => setTimeout(done, 100)); }
  }
  if (!loaded) throw new Error('Comparison server did not start');
  await page.waitForFunction(() => !!window.ganttLibraries);
  const results = {};
  const screenshots = {};
  for (const kind of ['official', 'ours']) {
    results[kind] = await page.evaluate(kind => {
      const GC = window.ganttLibraries[kind];
      document.body.innerHTML = '<div id="host" style="width:800px;height:500px"></div>';
      try {
        const spread = new GC.Spread.Sheets.Workbook(document.getElementById('host'), { sheetCount: 0 });
        const sheet = spread.addSheetTab(0, 'Gantt', GC.Spread.Sheets.SheetType.ganttSheet);
        const project = sheet.project;
        const gantt = GC.Spread.Sheets.GanttSheet;
        project.calendar = gantt.Calendar.standard.copyTo('Project calendar');
        project.calendar.customWorkWeeks.push(new gantt.CustomWorkWeek(
          Array.from({ length: 7 }, () => []), new Date(2025, 0, 10), new Date(2025, 0, 10)));
        project.startDate = new Date(2025, 0, 6, 8);
        project.addTasks(Array.from({ length: 10 }, (_, i) => ({ name: `Task ${i + 1}`,
          duration: i === 9 ? '0d' : `${i % 3 + 1}d`, ...(i === 8 ? { mode: 'Manual' } : {}) })));
        project.indentTasks([2, 3]);
        project.addDependency([{ fromTaskNumber: 3, toTaskNumber: 4, type: 'FS' },
          { fromTaskNumber: 4, toTaskNumber: 5, type: 'SS' }]);
        project.getTask(4).predecessors = '3FS+1d';
        project.getTask(5).predecessors = '4SS+1d';
        project.getTask(4).duration = '3d';
        const tiers = [gantt.TimescaleUnit.days, gantt.TimescaleUnit.weeks, gantt.TimescaleUnit.months];
        for (const unit of tiers) project.timescale.middleTier.unit = unit;
        return { tasks: project.tasks.map(t => ({ name: t.name, start: t.start, finish: t.finish, duration: t.duration })) };
      } catch (error) { return { error: String(error) }; }
    }, kind);
    await page.waitForTimeout(250);
    screenshots[kind] = PNG.sync.read(await page.screenshot());
    await page.screenshot({ path: `.probe/gantt-${kind}.png` });
  }
  const models = {};
  for (const kind of ['official', 'ours']) {
    models[kind] = await page.evaluate(kind => {
      const gantt = window.ganttLibraries[kind].Spread.Sheets.GanttSheet;
      const names = ['chain', 'mixed', 'negative', 'nested', 'manual', 'calendar', 'edit', 'completion',
        'linkedFS', 'linkedSS', 'linkedFF', 'linkedSF', 'linkedMix', 'reverse', 'empty', 'manualBoth', 'zeroCompletion',
        'lagUnits', 'negLagFlushed', 'mixedFlushed', 'deferResume', 'multiPred', 'midShift', 'manualSided',
        'displayedSummary', 'satWeek', 'overlapWeeks', 'hoursChain', 'milestoneEdge', 'ancestorIndent',
        'cycleString', 'badGrammar', 'manualSummary', 'stringPair'];
      return Object.fromEntries(names.map(name => {
        try {
          const slot = (h1, m1, h2, m2) => ({ start: { hour: h1, minute: m1 }, end: { hour: h2, minute: m2 } });
          const project = new gantt.Project('Model');
          project.startDate = new Date(2025, 0, 6, 8);
          if (name === 'calendar') {
            project.calendar = gantt.Calendar.standard.copyTo('Holiday');
            project.calendar.customWorkWeeks.push(new gantt.CustomWorkWeek(
              Array.from({ length: 7 }, () => []), new Date(2025, 0, 7), new Date(2025, 0, 7)));
          }
          if (name === 'midShift') project.startDate = new Date(2025, 0, 6, 12, 30);
          const count = name === 'chain' ? 10 : 4;
          project.addTasks(Array.from({ length: count }, (_, i) => ({ name: `Task ${i + 1}`, duration: name === 'calendar' ||
            ((name === 'mixed' || name.startsWith('linked')) && i === 0) || (name === 'reverse' && i === 2) ? '3d' : '1d',
            ...(name === 'manual' && i === 1 ? { mode: 'Manual', start: new Date(2025, 0, 8, 8) } : {}) })));
          if (name === 'manualBoth') {
            project.removeTasks([1, 2, 3, 4]);
            project.addTasks({ mode: 'Manual', start: new Date(2025, 0, 6, 8), finish: new Date(2025, 0, 8, 17) });
          }
          if (name === 'nested') { project.indentTasks([2, 3, 4]); project.indentTasks([3, 4]); }
          if (name === 'chain') for (let i = 2; i <= count; i++) project.getTask(i).predecessors = `${i - 1}FS+1d`;
          if (name === 'mixed' || name === 'mixedFlushed') ['1SS', '2FF', '3SF'].forEach((value, i) => { project.getTask(i + 2).predecessors = value; });
          if (name === 'negative' || name === 'negLagFlushed') project.getTask(2).predecessors = '1FS-4h';
          if (name.startsWith('linked') && name !== 'linkedMix') {
            project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: name.slice(6) });
          }
          if (name === 'linkedMix') project.addDependency([
            { fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' },
            { fromTaskNumber: 2, toTaskNumber: 3, type: 'FF' },
            { fromTaskNumber: 3, toTaskNumber: 4, type: 'SF' },
            { fromTaskNumber: 1, toTaskNumber: 4, type: 'FS' },
          ]);
          if (name === 'reverse') project.addDependency({ fromTaskNumber: 3, toTaskNumber: 1, type: 'FS' });
          if (name === 'empty') project.removeTasks([1, 2, 3, 4]);
          if (name === 'edit') { project.getTask(2).predecessors = '1FS'; project.getTask(1).duration = '3d'; }
          if (name === 'completion') {
            project.indentTasks([2, 3]);
            project.getTask(2).complete = 1;
            project.getTask(2).duration = '3d';
          }
          if (name === 'zeroCompletion') {
            project.indentTasks([2, 3]);
            project.getTask(2).complete = 1;
            project.getTask(2).duration = '0d';
            project.getTask(3).duration = '0d';
          }
          if (name === 'lagUnits') {
            project.getTask(2).predecessors = '1FS+30min';
            project.getTask(3).predecessors = '2SS+2h';
            project.getTask(4).predecessors = '3FF-1w';
          }
          if (name === 'deferResume') {
            project.getTask(2).predecessors = '1FS';
            project.getTask(3).predecessors = '2SS';
          }
          if (name === 'deferResume' || name === 'mixedFlushed' || name === 'negLagFlushed' ||
            name === 'lagUnits') project.resumeSchedule();
          if (name === 'multiPred') {
            project.addDependency([
              { fromTaskNumber: 1, toTaskNumber: 4, type: 'FS' },
              { fromTaskNumber: 2, toTaskNumber: 4, type: 'SS' },
              { fromTaskNumber: 3, toTaskNumber: 4, type: 'FF' },
            ]);
          }
          if (name === 'midShift') project.addDependency([
            { fromTaskNumber: 1, toTaskNumber: 2, type: 'SS' },
            { fromTaskNumber: 2, toTaskNumber: 3, type: 'FF' },
            { fromTaskNumber: 1, toTaskNumber: 4, type: 'SF' },
          ]);
          if (name === 'manualSided') {
            project.addTasks([
              { name: 'S', mode: 'Manual', start: new Date(2025, 0, 8, 8) },
              { name: 'F', mode: 'Manual', finish: new Date(2025, 0, 9, 17) },
              { name: 'D', mode: 'Manual', duration: '2d' },
              { name: 'SD', mode: 'Manual', start: new Date(2025, 0, 10, 8), duration: '1d' },
            ]);
          }
          if (name === 'displayedSummary') {
            project.addTasks({ name: 'MS', mode: 'Manual', start: new Date(2025, 0, 8, 8) });
            project.indentTasks([2, 3, 4, 5]);
          }
          if (name === 'satWeek') {
            project.calendar = gantt.Calendar.standard.copyTo('Sat');
            const days = Array.from({ length: 7 }, (_, i) => i === 0 ? [] :
              (i === 6 ? [slot(8, 0, 12, 0)] : [slot(8, 0, 12, 0), slot(13, 0, 17, 0)]));
            project.calendar.defaultWorkWeek = new gantt.WorkWeek(days);
            project.removeTasks([1, 2, 3, 4]);
            project.addTasks([{ name: 'Long', duration: '5d' }, { name: 'Short', duration: '1d' }]);
          }
          if (name === 'overlapWeeks') {
            project.calendar = gantt.Calendar.standard.copyTo('Overlap');
            const full = Array.from({ length: 7 }, (_, i) => i === 0 ? [] : [slot(8, 0, 12, 0), slot(13, 0, 17, 0)]);
            const short = Array.from({ length: 7 }, (_, i) => i === 0 || i === 3 ? [] : [slot(8, 0, 12, 0), slot(13, 0, 17, 0)]);
            project.calendar.customWorkWeeks.push(new gantt.CustomWorkWeek(full, new Date(2025, 0, 7), new Date(2025, 0, 9)));
            project.calendar.customWorkWeeks.push(new gantt.CustomWorkWeek(short, new Date(2025, 0, 9), new Date(2025, 0, 10)));
            project.removeTasks([1, 2, 3, 4]);
            project.addTasks({ name: 'Span', duration: '4d' });
          }
          if (name === 'hoursChain' || name === 'milestoneEdge') {
            project.removeTasks([1, 2, 3, 4]);
            project.addTasks(name === 'hoursChain'
              ? [{ duration: '4h' }, { duration: '4h' }]
              : [{ duration: '2d' }, { duration: '0d' }]);
            project.addDependency({ fromTaskNumber: 1, toTaskNumber: 2, type: 'FS' });
          }
          if (name === 'ancestorIndent') {
            project.getTask(3).predecessors = '1FS';
            project.indentTasks([2, 3]);
          }
          if (name === 'cycleString') {
            project.getTask(2).predecessors = '1FS';
            project.getTask(1).predecessors = '2FS';
          }
          if (name === 'badGrammar') project.getTask(2).predecessors = '1FS 1FS';
          if (name === 'manualSummary') {
            project.indentTasks([2, 3, 4]);
            project.getTask(1).mode = 'Manual';
            project.getTask(1).finish = new Date(2025, 0, 20, 17);
            project.getTask(2).duration = '3d';
          }
          if (name === 'stringPair') {
            project.getTask(4).predecessors = '1FS+1d,2SS';
            project.addDependency({ fromTaskNumber: 3, toTaskNumber: 4, type: 'FF' });
          }
          if (name === 'ancestorIndent' || name === 'stringPair') project.resumeSchedule();
          return [name, project.tasks.map(task => ({ start: task.start, finish: task.finish,
            duration: task.duration, summary: task.isSummary, complete: task.complete,
            through: task.completeThrough, pred: task.predecessors }))];
        } catch (error) { return [name, { error: String(error) }]; }
      }));
    }, kind);
  }
  const modelMatches = Object.fromEntries(Object.keys(models.official).map(name => {
    const official = models.official[name], ours = models.ours[name];
    if (!Array.isArray(official) || !Array.isArray(ours)) {
      return [name, JSON.stringify(official) === JSON.stringify(ours) ? { matched: 1, total: 1 } : { official, ours }];
    }
    let matched = 0, total = 0;
    for (let i = 0; i < official.length; i++) for (const field of Object.keys(official[i])) {
      total++;
      if (JSON.stringify(official[i][field]) === JSON.stringify(ours[i]?.[field])) matched++;
    }
    return [name, { matched, total }];
  }));
  // Case-by-case comparison of the TASK 32d scheduling scenarios. Every case returns one string
  // built from the public API; a case counts as matched when the two strings are identical.
  const cases = {};
  for (const kind of ['official', 'ours']) {
    cases[kind] = await page.evaluate(({ kind, source }) => {
      const gantt = window.ganttLibraries[kind].Spread.Sheets.GanttSheet;
      const built = new Function('gantt', source)(gantt);
      const out = {};
      for (const name of Object.keys(built)) {
        try { out[name] = String(built[name]()); } catch (error) { out[name] = `CASE-ERROR ${String(error)}`; }
      }
      return out;
    }, { kind, source: CASES_SOURCE });
  }
  const caseMatches = {};
  const caseDiffs = {};
  for (const name of Object.keys(cases.official)) {
    const group = name.split(':')[0];
    const entry = caseMatches[group] ?? (caseMatches[group] = { matched: 0, total: 0, failed: [] });
    entry.total++;
    if (cases.official[name] === cases.ours[name]) entry.matched++;
    else (entry.failed ??= []).push(name);
    if (cases.official[name] !== cases.ours[name])
      caseDiffs[name] = { official: cases.official[name], ours: cases.ours[name] };
  }
  let screenshotDiffPercent = null;
  if (!results.official.error && !results.ours.error) {
    const a = screenshots.official;
    const b = screenshots.ours;
    const diff = new PNG({ width: a.width, height: b.height });
    screenshotDiffPercent = 100 * pixelmatch(a.data, b.data, diff.data, a.width, a.height) / (a.width * a.height);
  }
  const modelTotals = Object.values(modelMatches).reduce((sum, entry) => sum + (entry.total ?? 1), 0);
  const modelMatched = Object.values(modelMatches).reduce((sum, entry) => sum + (entry.matched ?? 0), 0);
  const caseTotals = Object.values(caseMatches).reduce((sum, entry) => sum + entry.total, 0);
  const caseMatched = Object.values(caseMatches).reduce((sum, entry) => sum + entry.matched, 0);
  // TASK 36b item 4: screenshot the four GanttSheet view scenarios in both libraries and
  // report the pixel diff percentage of each (full canvas, no masking).
  let viewScenarios = null;
  try {
    viewScenarios = await runGanttViewScenarios(browser, 'http://127.0.0.1:58242');
  } catch (error) { viewScenarios = { error: String(error) }; }
  console.log(JSON.stringify({
    results, screenshotDiffPercent, modelMatches,
    modelSummary: { matched: modelMatched, total: modelTotals },
    caseMatches, caseSummary: { matched: caseMatched, total: caseTotals },
    viewScenarios,
    caseDiffs,
  }, null, 2));
} finally {
  await browser.close();
  server.kill();
}
