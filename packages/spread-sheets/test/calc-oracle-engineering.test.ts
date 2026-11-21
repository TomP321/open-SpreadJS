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
  "id": "eng-388",
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
  "formula": "DEC2BIN(10)",
  "expect": [
  [
  "1010"
  ]
  ]
  },
  {
  "id": "eng-389",
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
  "formula": "DEC2BIN(-1)",
  "expect": [
  [
  "1111111111"
  ]
  ]
  },
  {
  "id": "eng-390",
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
  "formula": "BIN2DEC(\"1010\")",
  "expect": [
  [
  10
  ]
  ]
  },
  {
  "id": "eng-391",
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
  "formula": "DEC2HEX(255,4)",
  "expect": [
  [
  "00FF"
  ]
  ]
  },
  {
  "id": "eng-392",
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
  "formula": "HEX2DEC(\"FF\")",
  "expect": [
  [
  255
  ]
  ]
  },
  {
  "id": "eng-393",
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
  "formula": "OCT2DEC(\"17\")",
  "expect": [
  [
  15
  ]
  ]
  },
  {
  "id": "eng-394",
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
  "formula": "BITAND(12,10)",
  "expect": [
  [
  8
  ]
  ]
  },
  {
  "id": "eng-395",
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
  "formula": "BITOR(12,10)",
  "expect": [
  [
  14
  ]
  ]
  },
  {
  "id": "eng-396",
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
  "formula": "BITXOR(12,10)",
  "expect": [
  [
  6
  ]
  ]
  },
  {
  "id": "eng-397",
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
  "formula": "BITLSHIFT(1,4)",
  "expect": [
  [
  16
  ]
  ]
  },
  {
  "id": "eng-398",
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
  "formula": "DELTA(1,1)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "eng-399",
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
  "formula": "GESTEP(5,4)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "eng-400",
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
  "formula": "COMPLEX(3,4)",
  "expect": [
  [
  "3+4i"
  ]
  ]
  },
  {
  "id": "eng-401",
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
  "formula": "IMABS(\"3+4i\")",
  "expect": [
  [
  5
  ]
  ]
  },
  {
  "id": "eng-402",
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
  "formula": "IMSUM(\"1+i\",\"2-3i\")",
  "expect": [
  [
  "3-2i"
  ]
  ]
  },
  {
  "id": "eng-403",
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
  "formula": "CONVERT(1,\"m\",\"ft\")",
  "expect": [
  [
  3.28083989501312
  ]
  ]
  },
  {
  "id": "eng-404",
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
  "formula": "CONVERT(100,\"C\",\"F\")",
  "expect": [
  [
  212
  ]
  ]
  },
  {
  "id": "eng-405",
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
  "formula": "ERF(1)",
  "expect": [
  [
  0.842700792949715
  ]
  ]
  },
  {
  "id": "eng-406",
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
  "formula": "ERFC(1)",
  "expect": [
  [
  0.157299207050285
  ]
  ]
  },
  {
  "id": "eng-407",
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
  "formula": "BESSELJ(1.5,1)",
  "expect": [
  [
  0.5579365079101
  ]
  ]
  }
];

describe('calc-oracle-engineering', () => {
  it.each(CASES)('$id: =$formula', (c) => {
    const got = runCase(c);
    for (let i = 0; i < c.expect.length; i++)
      for (let j = 0; j < c.expect[i]!.length; j++) {
        if (!sameValue(got[i]?.[j], c.expect[i]![j]))
          throw new Error(`${c.id}: =${c.formula} at [${i}][${j}]: got ${JSON.stringify(got[i]?.[j])}, trial wants ${JSON.stringify(c.expect[i]![j])}`);
      }
  });
});
