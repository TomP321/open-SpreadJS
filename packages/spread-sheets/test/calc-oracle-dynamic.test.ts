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
  if (v instanceof Date) return { date: Number.isNaN(v.getTime()) ? 'Invalid' : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString() };
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
    else if (value && typeof value === 'object' && 'date' in value) sheet.setValue(r, col, ((s => /Z$/.test(s) ? new Date(s.slice(0, -1)) : new Date(s))((value as { date: string }).date)));
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
  "id": "dyn-1",
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
  "formula": "SEQUENCE(3,2,10,5)",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  10,
  15,
  null,
  null,
  20,
  25,
  null,
  null,
  30,
  35,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-2",
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
  "formula": "SORT({3;1;2})",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  1,
  null,
  null,
  null,
  2,
  null,
  null,
  null,
  3,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-3",
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
  "formula": "UNIQUE({1;2;2;3})",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  1,
  null,
  null,
  null,
  2,
  null,
  null,
  null,
  3,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-4",
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
  "formula": "FILTER(A1:A5,A1:A5>2)",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  3,
  null,
  null,
  null,
  4,
  null,
  null,
  null,
  5,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-5",
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
  "formula": "TRANSPOSE(A1:A3)",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  1,
  2,
  3,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-6",
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
  "formula": "A1:A3*2",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  2,
  null,
  null,
  null,
  4,
  null,
  null,
  null,
  6,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-7",
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
  "formula": "TEXTSPLIT(\"a,b,c\",\",\")",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  "a",
  "b",
  "c",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-8",
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
  "formula": "VSTACK({1,2},{3,4})",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  1,
  2,
  null,
  null,
  3,
  4,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-9",
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
  "formula": "RANDARRAY(2,2)*0",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  0,
  0,
  null,
  null,
  0,
  0,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-10",
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
  "formula": "MODE.MULT({1,2,2,3,3})",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  2,
  null,
  null,
  null,
  3,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-11",
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
  "formula": "FREQUENCY(A1:A5,{2,4})",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  2,
  null,
  null,
  null,
  2,
  null,
  null,
  null,
  1,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  },
  {
  "id": "dyn-12",
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
  "formula": "TOCOL({1,2;3,4})",
  "at": "H1",
  "read": [
  "H1:K5"
  ],
  "options": {
  "allowDynamicArray": true
  },
  "expect": [
  [
  1,
  null,
  null,
  null,
  2,
  null,
  null,
  null,
  3,
  null,
  null,
  null,
  4,
  null,
  null,
  null,
  null,
  null,
  null,
  null
  ]
  ]
  }
];

describe('calc-oracle-dynamic', () => {
  it.each(CASES)('$id: =$formula', (c) => {
    const got = runCase(c);
    for (let i = 0; i < c.expect.length; i++)
      for (let j = 0; j < c.expect[i]!.length; j++) {
        if (!sameValue(got[i]?.[j], c.expect[i]![j]))
          throw new Error(`${c.id}: =${c.formula} at [${i}][${j}]: got ${JSON.stringify(got[i]?.[j])}, trial wants ${JSON.stringify(c.expect[i]![j])}`);
      }
  });
});
