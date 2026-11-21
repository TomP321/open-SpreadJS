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
  "id": "fin-364",
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
  "formula": "PMT(0.05/12,360,200000)",
  "expect": [
  [
  -1073.64324602428
  ]
  ]
  },
  {
  "id": "fin-365",
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
  "formula": "PMT(0,12,1200)",
  "expect": [
  [
  -100
  ]
  ]
  },
  {
  "id": "fin-366",
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
  "formula": "FV(0.05/12,120,-100)",
  "expect": [
  [
  15528.2279445667
  ]
  ]
  },
  {
  "id": "fin-367",
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
  "formula": "PV(0.08/12,240,-1000)",
  "expect": [
  [
  119554.291702376
  ]
  ]
  },
  {
  "id": "fin-368",
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
  "formula": "NPER(0.01,-100,1000)",
  "expect": [
  [
  10.5886444594232
  ]
  ]
  },
  {
  "id": "fin-369",
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
  "formula": "RATE(360,-1073.64,200000)",
  "expect": [
  [
  0.00416664453634552
  ]
  ]
  },
  {
  "id": "fin-370",
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
  "formula": "NPV(0.1,-1000,300,400,500)",
  "expect": [
  [
  -19.1243767502221
  ]
  ]
  },
  {
  "id": "fin-371",
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
  "formula": "IRR({-1000,300,400,500})",
  "expect": [
  [
  0.0889633946933498
  ]
  ]
  },
  {
  "id": "fin-372",
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
  "formula": "XNPV(0.1,{-1000,300,400},{45000,45200,45400})",
  "expect": [
  [
  -354.937232270273
  ]
  ]
  },
  {
  "id": "fin-373",
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
  "formula": "XIRR({-1000,300,400,500},{45000,45200,45400,45600})",
  "expect": [
  [
  0.168286177290024
  ]
  ]
  },
  {
  "id": "fin-374",
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
  "formula": "IPMT(0.05/12,1,360,200000)",
  "expect": [
  [
  -833.333333333333
  ]
  ]
  },
  {
  "id": "fin-375",
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
  "formula": "PPMT(0.05/12,1,360,200000)",
  "expect": [
  [
  -240.309912690946
  ]
  ]
  },
  {
  "id": "fin-376",
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
  "formula": "CUMIPMT(0.05/12,360,200000,1,12,0)",
  "expect": [
  [
  -9932.98826115638
  ]
  ]
  },
  {
  "id": "fin-377",
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
  "formula": "SLN(10000,1000,5)",
  "expect": [
  [
  1800
  ]
  ]
  },
  {
  "id": "fin-378",
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
  "formula": "SYD(10000,1000,5,1)",
  "expect": [
  [
  3000
  ]
  ]
  },
  {
  "id": "fin-379",
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
  "formula": "DDB(10000,1000,5,1)",
  "expect": [
  [
  4000
  ]
  ]
  },
  {
  "id": "fin-380",
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
  "formula": "DB(10000,1000,5,1)",
  "expect": [
  [
  3690
  ]
  ]
  },
  {
  "id": "fin-381",
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
  "formula": "VDB(10000,1000,5,0,1)",
  "expect": [
  [
  4000
  ]
  ]
  },
  {
  "id": "fin-382",
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
  "formula": "EFFECT(0.05,12)",
  "expect": [
  [
  0.051161897881733
  ]
  ]
  },
  {
  "id": "fin-383",
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
  "formula": "NOMINAL(0.05,12)",
  "expect": [
  [
  0.0488894854037802
  ]
  ]
  },
  {
  "id": "fin-384",
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
  "formula": "MIRR({-1000,300,400,500},0.1,0.12)",
  "expect": [
  [
  0.0981566924463155
  ]
  ]
  },
  {
  "id": "fin-385",
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
  "formula": "DOLLARDE(1.02,16)",
  "expect": [
  [
  1.125
  ]
  ]
  },
  {
  "id": "fin-386",
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
  "formula": "PDURATION(0.025,2000,2200)",
  "expect": [
  [
  3.85986616262266
  ]
  ]
  },
  {
  "id": "fin-387",
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
  "formula": "RRI(10,1000,2000)",
  "expect": [
  [
  0.0717734625362931
  ]
  ]
  }
];

describe('calc-oracle-financial', () => {
  it.each(CASES)('$id: =$formula', (c) => {
    const got = runCase(c);
    for (let i = 0; i < c.expect.length; i++)
      for (let j = 0; j < c.expect[i]!.length; j++) {
        if (!sameValue(got[i]?.[j], c.expect[i]![j]))
          throw new Error(`${c.id}: =${c.formula} at [${i}][${j}]: got ${JSON.stringify(got[i]?.[j])}, trial wants ${JSON.stringify(c.expect[i]![j])}`);
      }
  });
});
