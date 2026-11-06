// Differential calc oracle. The official trial is used strictly as a black box:
// we only call its public API (setValue/setFormula/getValue) and observe results.
import * as Official from '@mescius/spread-sheets';
import OpenSheets from '@opensheets/spread-sheets';

type CellInput = string | number | boolean | null | { date: string } | { error: string };
type SheetCells = Record<string, CellInput>;
export interface OracleCase {
  id: string;
  /** cells of the first sheet; strings starting with "=" are formulas */
  cells?: SheetCells;
  /** extra/explicit sheets by name (first entry = first sheet if `cells` absent) */
  sheets?: Record<string, SheetCells>;
  /** formula under test (optional: if absent, only `read` cells are compared) */
  formula?: string;
  /** where to put `formula`, default "H1" of the first sheet; may be "Sheet2!A1" */
  at?: string;
  /** cells to read and compare, default [at]; a range like "A1:C3" reads every cell (spills) */
  read?: string[];
  /** later edits; after each, `read` cells are compared again (tests incremental recalc).
   *  A step may instead call a public method: {"$call": ["addRows", 1, 2], "$sheet": "Sheet1"} (sheet method),
   *  {"$wb": ["removeSheet", 1]} (workbook method). "$enum:Path.To.Enum.member" strings in args resolve against GC.Spread.Sheets.
   *  `read` entries prefixed with "f:" (e.g. "f:B6" or "f:Sheet2!A1") read getFormula instead of getValue. */
  steps?: (SheetCells | { $call?: unknown[]; $wb?: unknown[]; $sheet?: string })[];
  /** workbook options to set before filling, e.g. {"referenceStyle":1} */
  options?: Record<string, unknown>;
}
type Normalized = null | number | string | boolean | { error: string } | { date: string } | { other: string };

const LETTERS = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function parseAddr(addr: string): { sheet?: string; r1: number; c1: number; r2: number; c2: number } {
  let sheet: string | undefined;
  const bang = addr.lastIndexOf('!');
  if (bang >= 0) { sheet = addr.slice(0, bang).replace(/^'|'$/g, '').replace(/''/g, "'"); addr = addr.slice(bang + 1); }
  const [a, b = a] = addr.replace(/\$/g, '').split(':');
  const m1 = /^([A-Za-z]+)(\d+)$/.exec(a!); const m2 = /^([A-Za-z]+)(\d+)$/.exec(b!);
  if (!m1 || !m2) throw new Error(`bad address ${addr}`);
  return { sheet, r1: +m1[2]! - 1, c1: LETTERS(m1[1]!), r2: +m2[2]! - 1, c2: LETTERS(m2[1]!) };
}

function normalize(v: unknown): Normalized {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { other: String(v) };
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return { date: isNaN(v.getTime()) ? 'Invalid' : v.toISOString() };
  const s = String(v);
  if (/^#[A-Z0-9/!?]+[!?A]?$/.test(s) || /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!|GETTING_DATA)$/.test(s)) return { error: s };
  return { other: s };
}

function fill(GC: any, sheet: any, cells: SheetCells) {
  for (const [addr, value] of Object.entries(cells)) {
    const { r1, c1 } = parseAddr(addr);
    if (typeof value === 'string' && value.startsWith('=')) sheet.setFormula(r1, c1, value.slice(1));
    else if (value && typeof value === 'object' && 'date' in value) sheet.setValue(r1, c1, new Date(value.date));
    else if (value && typeof value === 'object' && 'error' in value) sheet.setValue(r1, c1, GC.Spread.CalcEngine.CalcError.parse(value.error));
    else sheet.setValue(r1, c1, value);
  }
}

function runOne(GC: any, host: HTMLElement, c: OracleCase): Normalized[][] | { exception: string } {
  const el = document.createElement('div'); el.style.cssText = 'width:400px;height:300px'; host.append(el);
  let wb: any;
  try {
    const sheetDefs: [string, SheetCells][] = [];
    if (c.cells) sheetDefs.push(['Sheet1', c.cells]);
    for (const [name, cells] of Object.entries(c.sheets ?? {})) if (!(sheetDefs.length && sheetDefs[0]![0] === name)) sheetDefs.push([name, cells]);
    if (!sheetDefs.length) sheetDefs.push(['Sheet1', {}]);
    wb = new GC.Spread.Sheets.Workbook(el, { sheetCount: sheetDefs.length });
    for (const [k, v] of Object.entries(c.options ?? {})) wb.options[k] = v;
    wb.suspendPaint();
    sheetDefs.forEach(([name], i) => wb.getSheet(i).name(name));
    const sheetOf = (name?: string) => (name ? wb.getSheetFromName(name) : wb.getSheet(0));
    sheetDefs.forEach(([name, cells]) => fill(GC, sheetOf(name), cells));
    const at = c.at ?? 'H1';
    if (c.formula !== undefined) { const a = parseAddr(at); fill(GC, sheetOf(a.sheet), { [at.slice(at.lastIndexOf('!') + 1)]: c.formula.startsWith('=') ? c.formula : '=' + c.formula }); }
    const read = () => {
      const out: Normalized[] = [];
      for (const raw of c.read ?? [at]) {
        const isF = raw.startsWith('f:'); const addr = isF ? raw.slice(2) : raw;
        const a = parseAddr(addr); const sh = sheetOf(a.sheet);
        for (let r = a.r1; r <= a.r2; r++) for (let col = a.c1; col <= a.c2; col++) out.push(normalize(isF ? sh.getFormula(r, col) : sh.getValue(r, col)));
      }
      return out;
    };
    const stages = [read()];
    const resolveArg = (x: unknown) => typeof x === 'string' && x.startsWith('$enum:') ? x.slice(6).split('.').reduce((o: any, key) => o?.[key], GC.Spread.Sheets) : x;
    for (const step of c.steps ?? []) {
      if ('$call' in step || '$wb' in step) {
        const st = step as { $call?: unknown[]; $wb?: unknown[]; $sheet?: string };
        if (st.$call) { const [m, ...args] = st.$call as [string, ...unknown[]]; const sh = sheetOf(st.$sheet); sh[m](...args.map(resolveArg)); }
        if (st.$wb) { const [m, ...args] = st.$wb as [string, ...unknown[]]; wb[m](...args.map(resolveArg)); }
        stages.push(read()); continue;
      }
      for (const [addr, v] of Object.entries(step as SheetCells)) { const a = parseAddr(addr); fill(GC, sheetOf(a.sheet), { [addr.slice(addr.lastIndexOf('!') + 1)]: v }); }
      stages.push(read());
    }
    return stages;
  } catch (e) {
    return { exception: String((e as Error)?.stack ?? e).slice(0, 400) };
  } finally {
    try { wb?.destroy(); } catch { /* ignore */ }
    el.remove();
  }
}

function same(a: Normalized, b: Normalized): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-300);
    return Math.abs(a - b) / scale < 1e-12 || Math.abs(a - b) < 1e-15;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

declare global { interface Window { __oracle: { ready: boolean; run(cases: OracleCase[]): unknown[] } } }
window.__oracle = {
  ready: true,
  run(cases) {
    const host = document.getElementById('hosts')!;
    return cases.map(c => {
      const t0 = performance.now(); const official = runOne(Official, host, c); const t1 = performance.now();
      const ours = runOne(OpenSheets, host, c); const t2 = performance.now();
      let pass = false;
      // both threw: equal when the error message (first line, without the "Error: " prefix) matches
      const msg = (x: unknown) => String((x as { exception: string }).exception).split('\n')[0]!.replace(/^\w*Error: /, '').trim();
      if (!Array.isArray(official) && !Array.isArray(ours)) pass = msg(official) === msg(ours);
      else if (Array.isArray(official) && Array.isArray(ours) && official.length === ours.length)
        pass = official.every((stage, i) => stage.length === ours[i]!.length && stage.every((v, j) => same(v, ours[i]![j]!)));
      return { id: c.id, pass, official, ours, ms: { official: +(t1 - t0).toFixed(2), ours: +(t2 - t1).toFixed(2) } };
    });
  },
};
