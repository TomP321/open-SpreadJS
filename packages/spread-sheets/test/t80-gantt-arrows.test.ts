/**
 * TASK 80: unit coverage for the Gantt dependency-connector routing
 * (gantt/view/arrows.ts). The routing/geometry constants were measured
 * black-box off the trial (task notes in the file); pixel parity of the whole
 * view stays under the Playwright gantt gates.
 */
import { describe, expect, it } from 'vitest';
import {
  GANTT_ARROW_COLOR, GANTT_ARROW_COLOR_SF, arrowRoute, barGeometry, drawArrowPath, drawDependencyArrows,
} from '../src/gantt/view/arrows.js';
import { TaskDependency } from '../src/gantt/dependency.js';
import type { Task } from '../src/gantt/project.js';
import type { GanttArrow } from '../src/gantt/view/arrows.js';

interface Call { name: string; args: unknown[] }
let log: Call[] = [];
function recordingContext(): CanvasRenderingContext2D {
  const stored: Record<string, unknown> = {};
  return new Proxy({}, {
    get: (_t, k: string) => {
      if (k in stored) return stored[k];
      return (...args: unknown[]) => { log.push({ name: k, args }); };
    },
    set: (_t, k: string, v) => { stored[k] = v; log.push({ name: 'set:' + k, args: [v] }); return true; },
  }) as unknown as CanvasRenderingContext2D;
}

const DAY = 86_400_000;
const BASE_YEAR = 2024;
// Wall-clock dates (TASK 92 fix: the previous UTC-aligned construction made
// the day-boundary snapping depend on the machine time zone).
const day = (n: number) => new Date(BASE_YEAR, 0, 1 + n);
const dateToX = (d: Date) => Math.round(((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(BASE_YEAR, 0, 1)) / DAY) * 50);

function leaf(fromDay: number, toDay: number): Task {
  return {
    taskNumber: 1, isSummary: false, isMilestone: false, mode: 'Auto',
    start: day(fromDay), finish: day(toDay), _childList: () => [],
  } as unknown as Task;
}

const box = (left: number, right: number, top: number, bottom: number) => ({ left, right, top, bottom, midY: (top + bottom) / 2 });

describe('barGeometry', () => {
  it('maps a leaf task to the 11 px bar at rowTop + 10 (30 px reference row)', () => {
    const geo = barGeometry(leaf(0, 4), 0, 30, dateToX)!;
    expect(geo.left).toBe(dateToX(day(0)));
    expect(geo.right).toBe(dateToX(day(4))); // finish already sits on a day boundary (ceilToDay is a no-op)
    expect(geo.top).toBe(10);
    expect(geo.bottom).toBe(21);
    expect(geo.midY).toBe(15.5);
  });
  it('scales the bar with the row height', () => {
    const geo = barGeometry(leaf(0, 4), 100, 60, dateToX)!;
    expect(geo.top).toBe(100 + 10 * 2); // 30 px reference scaled by rowHeight / 30
    expect(geo.bottom - geo.top).toBe(22);
  });
  it('uses a diamond box for milestones and a thin line for summaries', () => {
    const milestone = { taskNumber: 2, isSummary: false, isMilestone: true, mode: 'Auto', start: day(2), finish: day(2) } as unknown as Task;
    const geo = barGeometry(milestone, 0, 30, dateToX)!;
    expect(geo.right - geo.left).toBe(geo.bottom - geo.top); // diamond
    const summary = {
      taskNumber: 3, isSummary: true, isMilestone: false, mode: 'Auto', start: day(0), finish: day(3),
      _childList: () => [leaf(0, 3)],
    } as unknown as Task;
    const s = barGeometry(summary, 0, 30, dateToX)!;
    expect(s.bottom - s.top).toBe(2); // summary bar is a 2 px line
  });
});

describe('arrowRoute (trial routing model)', () => {
  const from = box(100, 150, 10, 21);
  const to = box(200, 260, 40, 51);
  it('FS exits the source right edge, drops into the target top', () => {
    const r = arrowRoute(from, to, 'FS', 1, 30);
    expect(r.points[0]).toEqual({ x: 151, y: 15.5 });
    expect(r.points[1]!.x).toBe(151 + 4.5); // FS_VPAD
    expect(r.head.dir).toBe('down');
    expect(r.head.y).toBe(40); // into the target's top edge (target below source)
    expect(r.points[2]).toEqual({ x: r.head.x, y: r.head.y });
  });
  it('FS rises into the bottom edge when the target sits above the source', () => {
    const r = arrowRoute(from, box(200, 260, -40, -29), 'FS', 1, -50);
    expect(r.head.dir).toBe('up');
    expect(r.head.y).toBe(-29);
  });
  it('SS waits left of the source and runs into the target mid-line', () => {
    const r = arrowRoute(from, to, 'SS', 1, 30);
    expect(r.points[0]).toEqual({ x: 100, y: 15.5 });
    expect(r.points[1]!.x).toBe(100 - 1 - 6.5); // SS_VPAD
    expect(r.head).toEqual({ x: 202, y: to.midY, dir: 'right' });
  });
  it('FF wraps right of the target and points back left into its right edge', () => {
    const r = arrowRoute(from, to, 'FF', 1, 30);
    expect(r.points[1]!.x).toBe(260 + 1 + 2.5); // FF_VPAD
    expect(r.head).toEqual({ x: 260, y: to.midY, dir: 'left' });
  });
  it('SF paints near-black and uses a fixed exit at the source left edge', () => {
    const r = arrowRoute(from, to, 'SF', 1, 30);
    expect(r.points[0]!.x).toBe(100);
    expect(GANTT_ARROW_COLOR_SF).toBe('#232323');
  });
  it('scales every pad with the row scale', () => {
    const full = arrowRoute(from, to, 'FS', 2, 30);
    expect(full.points[1]!.x).toBe(151 + 9); // 4.5 * 2
  });
});

describe('drawArrowPath / drawDependencyArrows', () => {
  it('strokes the polyline once and fills the arrow head', () => {
    const r = arrowRoute(box(0, 50, 0, 11), box(100, 150, 30, 41), 'FS', 1, 20);
    log = [];
    drawArrowPath(recordingContext(), r.points, r.head, 1, GANTT_ARROW_COLOR);
    expect(log.filter((c) => c.name === 'lineTo').length).toBeGreaterThanOrEqual(r.points.length);
    expect(log.some((c) => c.name === 'stroke')).toBe(true);
    expect(log.some((c) => c.name === 'set:strokeStyle' && c.args[0] === GANTT_ARROW_COLOR)).toBe(true);
    expect(log.some((c) => c.name === 'set:fillStyle')).toBe(true); // the head is a filled path
    log = [];
    drawArrowPath(recordingContext(), r.points.slice(0, 1), r.head, 1, GANTT_ARROW_COLOR);
    expect(log).toHaveLength(0); // fewer than two points: nothing painted
  });
  it('draws FS connectors in the under pass and SF connectors only in the over pass', () => {
    const a = leaf(0, 4), b = leaf(6, 9);
    const arrows: GanttArrow[] = [
      { dependency: new TaskDependency<Task>(a, b, 'FS'), fromRow: 0, toRow: 1 },
      { dependency: new TaskDependency<Task>(b, a, 'SF'), fromRow: 1, toRow: 0 },
    ];
    const options = { x: 0, width: 800, bodyTop: 0, bodyBottom: 300, rowsTop: 0, rowHeight: 30, scrollY: 0, dateToX, pass: 'under' as const };
    log = [];
    drawDependencyArrows(recordingContext(), arrows, options);
    expect(log.filter((c) => c.name === 'stroke')).toHaveLength(1); // only the FS line
    expect(log.some((c) => c.name === 'set:strokeStyle' && c.args[0] === GANTT_ARROW_COLOR)).toBe(true);
    log = [];
    drawDependencyArrows(recordingContext(), arrows, { ...options, pass: 'over' });
    expect(log.filter((c) => c.name === 'stroke')).toHaveLength(1); // only the SF line
    expect(log.some((c) => c.name === 'set:strokeStyle' && c.args[0] === GANTT_ARROW_COLOR_SF)).toBe(true);
  });
  it('skips connectors whose rows scrolled outside the body clip', () => {
    const arrows: GanttArrow[] = [{ dependency: new TaskDependency<Task>(leaf(0, 4), leaf(6, 9), 'FS'), fromRow: 100, toRow: 101 }];
    log = [];
    drawDependencyArrows(recordingContext(), arrows, {
      x: 0, width: 800, bodyTop: 0, bodyBottom: 300, rowsTop: 0, rowHeight: 30, scrollY: 0, dateToX, pass: 'under',
    });
    expect(log.filter((c) => c.name === 'stroke')).toHaveLength(0);
  });
  it('drops tasks without dates from the routing (no geometry, no ink)', () => {
    const noDates = { taskNumber: 1, isSummary: false, isMilestone: false, mode: 'Auto' } as unknown as Task;
    const arrows: GanttArrow[] = [{ dependency: new TaskDependency<Task>(noDates, leaf(1, 2), 'FS'), fromRow: 0, toRow: 1 }];
    log = [];
    drawDependencyArrows(recordingContext(), arrows, {
      x: 0, width: 800, bodyTop: 0, bodyBottom: 300, rowsTop: 0, rowHeight: 30, scrollY: 0, dateToX, pass: 'under',
    });
    expect(log.filter((c) => c.name === 'stroke')).toHaveLength(0);
  });
});
