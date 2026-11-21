/**
 * TASK 80: calc behaviour pinned from the differential oracle
 * (apps/compare/oracle cases run against the official SpreadJS 19.2.5 trial,
 * TZ=UTC; every expectation below is the trial's own answer recorded in
 * test-results/oracle/report.json — never hand-written).
 */
import { describe, it } from 'vitest';
import GC from '../src/index.js';

type Norm = null | number | string | boolean | { error: string } | { date: string } | { other: string } | { json: unknown };
type Case = { id: string; cells?: Record<string, unknown>; formula: string; at?: string; read?: string[]; options?: Record<string, unknown>; expect: Norm[][] };

function normalize(v: unknown): Norm {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { other: String(v) };
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Date) return { date: Number.isNaN(v.getTime()) ? 'Invalid' : v.toISOString() };
  const s = String(v);
  if (/^#[A-Z0-9/!?]+[!?A]?$/.test(s)) return { error: s };
  return { other: s };
}
const LETTERS = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function addr(a: string): [number, number] {
  const m = /^([A-Za-z]+)(\d+)$/.exec(a)!;
  return [Number(m[2]) - 1, LETTERS(m[1]!)];
}
function runCase(c: Case): Norm[][] {
  const wb = new GC.Spread.Sheets.Workbook();
  for (const [k, v] of Object.entries(c.options ?? {})) (wb.options as Record<string, unknown>)[k] = v;
  const sheet = wb.getActiveSheet();
  for (const [a, value] of Object.entries(c.cells ?? {})) {
    const [r, col] = addr(a);
    if (typeof value === 'string' && value.startsWith('=')) sheet.setFormula(r, col, value.slice(1));
    else if (value && typeof value === 'object' && 'date' in value) sheet.setValue(r, col, new Date((value as { date: string }).date));
    else sheet.setValue(r, col, value as never);
  }
  const at = addr(c.at ?? 'H1');
  sheet.setFormula(at[0], at[1], c.formula);
  wb.calculate();
  const flat: Norm[] = [];
  for (const spec of c.read ?? [c.at ?? 'H1']) {
    const [a, b = a] = spec.split(':');
    const [r1, c1] = addr(a!);
    const [r2, c2] = addr(b!);
    for (let r = r1; r <= r2; r++) for (let col = c1; col <= c2; col++) flat.push(normalize(sheet.getValue(r, col)));
  }
  return [flat];
}
function sameValue(a: Norm, b: Norm): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-300);
    return Math.abs(a - b) / scale < 1e-12 || Math.abs(a - b) < 1e-15;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

const CASES: Case[] = [
  {
  "id": "op-1",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1+2*3",
  "expect": [
  [
  7
  ]
  ]
  },
  {
  "id": "op-2",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "(1+2)*3",
  "expect": [
  [
  9
  ]
  ]
  },
  {
  "id": "op-3",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "-2^2",
  "expect": [
  [
  4
  ]
  ]
  },
  {
  "id": "op-4",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "2^-1",
  "expect": [
  [
  0.5
  ]
  ]
  },
  {
  "id": "op-5",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "2^3^2",
  "expect": [
  [
  64
  ]
  ]
  },
  {
  "id": "op-6",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "10/4",
  "expect": [
  [
  2.5
  ]
  ]
  },
  {
  "id": "op-7",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "7-10",
  "expect": [
  [
  -3
  ]
  ]
  },
  {
  "id": "op-8",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1/0",
  "expect": [
  [
  {
  "error": "#DIV/0!"
  }
  ]
  ]
  },
  {
  "id": "op-9",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "0/0",
  "expect": [
  [
  {
  "error": "#DIV/0!"
  }
  ]
  ]
  },
  {
  "id": "op-10",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "5%",
  "expect": [
  [
  0.05
  ]
  ]
  },
  {
  "id": "op-11",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "50%^2",
  "expect": [
  [
  0.25
  ]
  ]
  },
  {
  "id": "op-12",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "-5%",
  "expect": [
  [
  -0.05
  ]
  ]
  },
  {
  "id": "op-13",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1+2&3",
  "expect": [
  [
  "33"
  ]
  ]
  },
  {
  "id": "op-14",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"a\"&\"b\"",
  "expect": [
  [
  "ab"
  ]
  ]
  },
  {
  "id": "op-15",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1&2",
  "expect": [
  [
  "12"
  ]
  ]
  },
  {
  "id": "op-16",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "TRUE+1",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "op-17",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "TRUE&\"x\"",
  "expect": [
  [
  "TRUEx"
  ]
  ]
  },
  {
  "id": "op-18",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"3\"+4",
  "expect": [
  [
  7
  ]
  ]
  },
  {
  "id": "op-19",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"3\"*\"4\"",
  "expect": [
  [
  12
  ]
  ]
  },
  {
  "id": "op-20",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"abc\"+1",
  "expect": [
  [
  {
  "error": "#VALUE!"
  }
  ]
  ]
  },
  {
  "id": "op-21",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1=1",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-22",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1<>1",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "op-23",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"a\"=\"A\"",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-24",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"a\"<\"b\"",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-25",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"b\"<\"a\"",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "op-26",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1<\"a\"",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-27",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "TRUE>1",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-28",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"10\"<\"9\"",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-29",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1e3+1",
  "expect": [
  [
  1001
  ]
  ]
  },
  {
  "id": "op-30",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": ".5+.25",
  "expect": [
  [
  0.75
  ]
  ]
  },
  {
  "id": "op-31",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1E-300*1E-300",
  "expect": [
  [
  0
  ]
  ]
  },
  {
  "id": "op-32",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1E+308*10",
  "expect": [
  [
  {
  "other": "Infinity"
  }
  ]
  ]
  },
  {
  "id": "op-33",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "0.1+0.2",
  "expect": [
  [
  0.3
  ]
  ]
  },
  {
  "id": "op-34",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "1-0.9",
  "expect": [
  [
  0.1
  ]
  ]
  },
  {
  "id": "op-35",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "--\"5\"",
  "expect": [
  [
  5
  ]
  ]
  },
  {
  "id": "op-36",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "+\"x\"",
  "expect": [
  [
  "x"
  ]
  ]
  },
  {
  "id": "op-37",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "=A1+A2",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "op-38",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "A1:A3",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "op-39",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "A1*B4",
  "expect": [
  [
  {
  "error": "#VALUE!"
  }
  ]
  ]
  },
  {
  "id": "op-40",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "B5*2",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "op-41",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "C4+1",
  "expect": [
  [
  {
  "error": "#VALUE!"
  }
  ]
  ]
  },
  {
  "id": "op-42",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "Z99+1",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "op-43",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "Z99&\"x\"",
  "expect": [
  [
  "x"
  ]
  ]
  },
  {
  "id": "op-44",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "A1:A2 A2:A3",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "op-45",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM(A1:A3 A2:A5)",
  "expect": [
  [
  5
  ]
  ]
  },
  {
  "id": "op-46",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM((A1:A2,A4:A5))",
  "expect": [
  [
  12
  ]
  ]
  },
  {
  "id": "op-47",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "{1,2;3,4}",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "op-48",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM({1,2;3,4})",
  "expect": [
  [
  10
  ]
  ]
  },
  {
  "id": "op-49",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "{1,\"a\";TRUE,#N/A}",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "op-50",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "#DIV/0!+1",
  "expect": [
  [
  {
  "error": "#DIV/0!"
  }
  ]
  ]
  },
  {
  "id": "op-51",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ISERROR(#REF!)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "op-52",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "\"\"\"quoted\"\"\"",
  "expect": [
  [
  "\"quoted\""
  ]
  ]
  },
  {
  "id": "op-53",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "LEN(\"\")",
  "expect": [
  [
  0
  ]
  ]
  },
  {
  "id": "math-54",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM(A1:A5)",
  "expect": [
  [
  15
  ]
  ]
  },
  {
  "id": "math-55",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM(A1:B5)",
  "expect": [
  [
  36.5
  ]
  ]
  },
  {
  "id": "math-56",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM(B4,1)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "math-57",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM(\"3\",2)",
  "expect": [
  [
  5
  ]
  ]
  },
  {
  "id": "math-58",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUM(B1:B5,C1:C5)",
  "expect": [
  [
  21.5
  ]
  ]
  },
  {
  "id": "math-60",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "PRODUCT(A1:A5)",
  "expect": [
  [
  120
  ]
  ]
  },
  {
  "id": "math-61",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROUND(2.5,0)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "math-62",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROUND(-2.5,0)",
  "expect": [
  [
  -3
  ]
  ]
  },
  {
  "id": "math-63",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROUND(1.005,2)",
  "expect": [
  [
  1.01
  ]
  ]
  },
  {
  "id": "math-64",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROUND(1234.5678,-2)",
  "expect": [
  [
  1200
  ]
  ]
  },
  {
  "id": "math-65",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROUNDUP(1.21,1)",
  "expect": [
  [
  1.3
  ]
  ]
  },
  {
  "id": "math-66",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROUNDDOWN(-1.29,1)",
  "expect": [
  [
  -1.2
  ]
  ]
  },
  {
  "id": "math-67",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MROUND(10,3)",
  "expect": [
  [
  9
  ]
  ]
  },
  {
  "id": "math-68",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "CEILING(2.5,1)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "math-69",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "CEILING(-2.5,-2)",
  "expect": [
  [
  -4
  ]
  ]
  },
  {
  "id": "math-70",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "CEILING.MATH(-5.5,2,-1)",
  "expect": [
  [
  -6
  ]
  ]
  },
  {
  "id": "math-71",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "FLOOR(2.5,1)",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "math-72",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "FLOOR.MATH(-5.5)",
  "expect": [
  [
  -6
  ]
  ]
  },
  {
  "id": "math-73",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "INT(-1.5)",
  "expect": [
  [
  -2
  ]
  ]
  },
  {
  "id": "math-74",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "TRUNC(-1.59,1)",
  "expect": [
  [
  -1.5
  ]
  ]
  },
  {
  "id": "math-75",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MOD(10,3)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "math-76",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MOD(-10,3)",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "math-77",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MOD(10,-3)",
  "expect": [
  [
  -2
  ]
  ]
  },
  {
  "id": "math-78",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MOD(5,0)",
  "expect": [
  [
  {
  "error": "#DIV/0!"
  }
  ]
  ]
  },
  {
  "id": "math-79",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ABS(-3)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "math-80",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SIGN(-0.1)",
  "expect": [
  [
  -1
  ]
  ]
  },
  {
  "id": "math-81",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SQRT(16)",
  "expect": [
  [
  4
  ]
  ]
  },
  {
  "id": "math-82",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SQRT(-1)",
  "expect": [
  [
  {
  "error": "#NUM!"
  }
  ]
  ]
  },
  {
  "id": "math-83",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "POWER(2,10)",
  "expect": [
  [
  1024
  ]
  ]
  },
  {
  "id": "math-84",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "POWER(0,0)",
  "expect": [
  [
  {
  "error": "#NUM!"
  }
  ]
  ]
  },
  {
  "id": "math-85",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "EXP(1)",
  "expect": [
  [
  2.71828182845905
  ]
  ]
  },
  {
  "id": "math-86",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "LN(10)",
  "expect": [
  [
  2.30258509299405
  ]
  ]
  },
  {
  "id": "math-87",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "LOG(100)",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "math-88",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "LOG(8,2)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "math-89",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "LOG10(0)",
  "expect": [
  [
  {
  "error": "#NUM!"
  }
  ]
  ]
  },
  {
  "id": "math-90",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "PI()",
  "expect": [
  [
  3.14159265358979
  ]
  ]
  },
  {
  "id": "math-91",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SIN(PI()/2)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "math-92",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "COS(0)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "math-93",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "TAN(1)",
  "expect": [
  [
  1.5574077246549
  ]
  ]
  },
  {
  "id": "math-94",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ASIN(2)",
  "expect": [
  [
  {
  "error": "#NUM!"
  }
  ]
  ]
  },
  {
  "id": "math-95",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ATAN2(1,1)",
  "expect": [
  [
  0.785398163397448
  ]
  ]
  },
  {
  "id": "math-96",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "DEGREES(PI())",
  "expect": [
  [
  180
  ]
  ]
  },
  {
  "id": "math-97",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "RADIANS(180)",
  "expect": [
  [
  3.14159265358979
  ]
  ]
  },
  {
  "id": "math-98",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "FACT(5)",
  "expect": [
  [
  120
  ]
  ]
  },
  {
  "id": "math-99",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "FACT(-1)",
  "expect": [
  [
  {
  "error": "#NUM!"
  }
  ]
  ]
  },
  {
  "id": "math-100",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "FACTDOUBLE(7)",
  "expect": [
  [
  105
  ]
  ]
  },
  {
  "id": "math-101",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "COMBIN(10,3)",
  "expect": [
  [
  120
  ]
  ]
  },
  {
  "id": "math-102",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "PERMUT(10,3)",
  "expect": [
  [
  720
  ]
  ]
  },
  {
  "id": "math-103",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "GCD(12,18,24)",
  "expect": [
  [
  6
  ]
  ]
  },
  {
  "id": "math-104",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "LCM(4,6)",
  "expect": [
  [
  12
  ]
  ]
  },
  {
  "id": "math-105",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "QUOTIENT(7,2)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "math-106",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "EVEN(1.5)",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "math-107",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ODD(-2)",
  "expect": [
  [
  -3
  ]
  ]
  },
  {
  "id": "math-108",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMPRODUCT(A1:A3,B1:B3)",
  "expect": [
  [
  61.5
  ]
  ]
  },
  {
  "id": "math-109",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMPRODUCT((A1:A5>2)*A1:A5)",
  "expect": [
  [
  12
  ]
  ]
  },
  {
  "id": "math-110",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMSQ(A1:A3)",
  "expect": [
  [
  14
  ]
  ]
  },
  {
  "id": "math-111",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMIF(A1:A5,\">2\")",
  "expect": [
  [
  12
  ]
  ]
  },
  {
  "id": "math-112",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMIF(C1:C3,\"*an*\",A1:A3)",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "math-113",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMIFS(A1:A5,A1:A5,\">1\",A1:A5,\"<5\")",
  "expect": [
  [
  9
  ]
  ]
  },
  {
  "id": "math-114",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUBTOTAL(9,A1:A5)",
  "expect": [
  [
  15
  ]
  ]
  },
  {
  "id": "math-115",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUBTOTAL(101,A1:A5)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "math-116",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "AGGREGATE(9,6,A1:B5)",
  "expect": [
  [
  35.5
  ]
  ]
  },
  {
  "id": "math-117",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ROMAN(1999)",
  "expect": [
  [
  "MCMXCIX"
  ]
  ]
  },
  {
  "id": "math-118",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "ARABIC(\"MCMXCIX\")",
  "expect": [
  [
  1999
  ]
  ]
  },
  {
  "id": "math-119",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "BASE(255,16)",
  "expect": [
  [
  "ff"
  ]
  ]
  },
  {
  "id": "math-120",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "DECIMAL(\"FF\",16)",
  "expect": [
  [
  255
  ]
  ]
  },
  {
  "id": "math-121",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MDETERM({1,2;3,4})",
  "expect": [
  [
  -2
  ]
  ]
  },
  {
  "id": "math-122",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SERIESSUM(2,1,1,{1,2,3})",
  "expect": [
  [
  34
  ]
  ]
  },
  {
  "id": "math-123",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SQRTPI(2)",
  "expect": [
  [
  2.506628274631
  ]
  ]
  },
  {
  "id": "math-124",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "MULTINOMIAL(2,3,4)",
  "expect": [
  [
  1260
  ]
  ]
  },
  {
  "id": "math-125",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 10,
  "B2": -20,
  "B3": 30.5,
  "B4": "text",
  "B5": true,
  "C1": "apple",
  "C2": "Banana",
  "C3": "cherry",
  "C4": "",
  "C5": "  spaced  "
  },
  "formula": "SUMX2MY2(A1:A3,A2:A4)",
  "expect": [
  [
  -15
  ]
  ]
  }
];

describe('calc-oracle-operators-math', () => {
  it.each(CASES)('$id: =$formula', (c) => {
    const got = runCase(c);
    for (let i = 0; i < c.expect.length; i++)
      for (let j = 0; j < c.expect[i]!.length; j++) {
        if (!sameValue(got[i]?.[j], c.expect[i]![j]))
          throw new Error(`${c.id}: =${c.formula} at [${i}][${j}]: got ${JSON.stringify(got[i]?.[j])}, trial wants ${JSON.stringify(c.expect[i]![j])}`);
      }
  });
});
