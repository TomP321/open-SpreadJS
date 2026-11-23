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
  "id": "logic-190",
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
  "formula": "IF(A1>0,\"pos\",\"neg\")",
  "expect": [
  [
  "pos"
  ]
  ]
  },
  {
  "id": "logic-191",
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
  "formula": "IF(A1>5,\"x\")",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-192",
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
  "formula": "IF(B4,1,2)",
  "expect": [
  [
  {
  "error": "#VALUE!"
  }
  ]
  ]
  },
  {
  "id": "logic-193",
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
  "formula": "IF(\"TRUE\",1,2)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "logic-194",
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
  "formula": "IF(1/0,1,2)",
  "expect": [
  [
  {
  "error": "#DIV/0!"
  }
  ]
  ]
  },
  {
  "id": "logic-195",
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
  "formula": "IFS(A1>2,\"a\",A1>0,\"b\")",
  "expect": [
  [
  "b"
  ]
  ]
  },
  {
  "id": "logic-196",
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
  "formula": "IFS(FALSE,1)",
  "expect": [
  [
  {
  "error": "#N/A"
  }
  ]
  ]
  },
  {
  "id": "logic-197",
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
  "formula": "IFERROR(1/0,\"err\")",
  "expect": [
  [
  "err"
  ]
  ]
  },
  {
  "id": "logic-198",
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
  "formula": "IFNA(NA(),\"na\")",
  "expect": [
  [
  "na"
  ]
  ]
  },
  {
  "id": "logic-199",
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
  "formula": "AND(TRUE,1,A1:A5)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-200",
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
  "formula": "AND(C1:C3)",
  "expect": [
  [
  {
  "error": "#VALUE!"
  }
  ]
  ]
  },
  {
  "id": "logic-201",
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
  "formula": "OR(FALSE,0)",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-202",
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
  "formula": "XOR(TRUE,TRUE,TRUE)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-203",
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
  "formula": "NOT(0)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-204",
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
  "formula": "SWITCH(2,1,\"one\",2,\"two\",\"other\")",
  "expect": [
  [
  "two"
  ]
  ]
  },
  {
  "id": "logic-205",
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
  "formula": "SWITCH(9,1,\"one\")",
  "expect": [
  [
  {
  "error": "#N/A"
  }
  ]
  ]
  },
  {
  "id": "logic-206",
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
  "formula": "CHOOSE(2,\"a\",\"b\",\"c\")",
  "expect": [
  [
  "b"
  ]
  ]
  },
  {
  "id": "logic-207",
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
  "formula": "CHOOSE(4,\"a\")",
  "expect": [
  [
  {
  "error": "#VALUE!"
  }
  ]
  ]
  },
  {
  "id": "logic-208",
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
  "formula": "ISNUMBER(B4)",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-209",
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
  "formula": "ISTEXT(C1)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-210",
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
  "formula": "ISBLANK(Z50)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-211",
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
  "formula": "ISBLANK(C4)",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-212",
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
  "formula": "ISLOGICAL(B5)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-213",
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
  "formula": "ISERR(NA())",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-214",
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
  "formula": "ISNA(NA())",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-215",
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
  "formula": "ISEVEN(4)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-216",
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
  "formula": "ISODD(3.9)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-217",
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
  "formula": "ISFORMULA(A1)",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-218",
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
  "formula": "ISREF(A1)",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-219",
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
  "formula": "N(B5)",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "logic-220",
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
  "formula": "N(\"x\")",
  "expect": [
  [
  0
  ]
  ]
  },
  {
  "id": "logic-221",
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
  "formula": "T(1)",
  "expect": [
  [
  ""
  ]
  ]
  },
  {
  "id": "logic-222",
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
  "formula": "TYPE(C1)",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "logic-223",
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
  "formula": "TYPE({1,2})",
  "expect": [
  [
  64
  ]
  ]
  },
  {
  "id": "logic-224",
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
  "formula": "ERROR.TYPE(#N/A)",
  "expect": [
  [
  7
  ]
  ]
  },
  {
  "id": "logic-225",
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
  "formula": "NA()",
  "expect": [
  [
  {
  "error": "#N/A"
  }
  ]
  ]
  },
  {
  "id": "logic-226",
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
  "formula": "ROW(B3)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "logic-227",
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
  "formula": "COLUMN(C1:E1)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "logic-228",
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
  "formula": "ROWS(A1:B5)",
  "expect": [
  [
  5
  ]
  ]
  },
  {
  "id": "logic-229",
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
  "formula": "COLUMNS(A1:C1)",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "logic-230",
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
  "formula": "CELL(\"address\",B2)",
  "expect": [
  [
  {
  "error": "#NAME?"
  }
  ]
  ]
  },
  {
  "id": "logic-231",
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
  "formula": "SHEET()",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "logic-232",
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
  "formula": "SHEETS()",
  "expect": [
  [
  1
  ]
  ]
  },
  {
  "id": "logic-233",
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
  "formula": "TRUE()",
  "expect": [
  [
  true
  ]
  ]
  },
  {
  "id": "logic-234",
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
  "formula": "FALSE()",
  "expect": [
  [
  false
  ]
  ]
  },
  {
  "id": "logic-235",
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
  "formula": "LET(x,2,y,3,x*y)",
  "expect": [
  [
  6
  ]
  ]
  },
  {
  "id": "logic-236",
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
  "formula": "LAMBDA(x,x*2)(4)",
  "expect": [
  [
  8
  ]
  ]
  }
];

describe('calc-oracle-logical', () => {
  it.each(CASES)('$id: =$formula', (c) => {
    const got = runCase(c);
    for (let i = 0; i < c.expect.length; i++)
      for (let j = 0; j < c.expect[i]!.length; j++) {
        if (!sameValue(got[i]?.[j], c.expect[i]![j]))
          throw new Error(`${c.id}: =${c.formula} at [${i}][${j}]: got ${JSON.stringify(got[i]?.[j])}, trial wants ${JSON.stringify(c.expect[i]![j])}`);
      }
  });
});
