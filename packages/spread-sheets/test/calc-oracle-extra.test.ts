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
  "id": "t80-db-1",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Eng",
  "H5": 70000,
  "J1": "Dept",
  "J2": "Sales",
  "K1": "Salary",
  "K2": ">40000"
  },
  "formula": "DSUM(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  70000
  ]
  ]
  },
  {
  "id": "t80-db-2",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Eng",
  "H5": 70000,
  "J1": "Dept",
  "J2": "Sales",
  "K1": "Salary",
  "K2": ">40000"
  },
  "formula": "DSUM(F1:H4,\"Salary\",K1:K2)",
  "at": "P1",
  "expect": [
  [
  50000
  ]
  ]
  },
  {
  "id": "t80-db-3",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Eng",
  "H5": 70000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DAVERAGE(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  35000
  ]
  ]
  },
  {
  "id": "t80-db-4",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Eng",
  "H5": 70000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DCOUNT(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "t80-db-5",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DCOUNTA(F1:H4,\"Name\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "t80-db-6",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "J1": "Name",
  "J2": "Carol"
  },
  "formula": "DGET(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  40000
  ]
  ]
  },
  {
  "id": "t80-db-7",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DGET(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  {
  "error": "#NUM!"
  }
  ]
  ]
  },
  {
  "id": "t80-db-8",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DMAX(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  40000
  ]
  ]
  },
  {
  "id": "t80-db-9",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DMIN(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  30000
  ]
  ]
  },
  {
  "id": "t80-db-10",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DPRODUCT(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  1200000000
  ]
  ]
  },
  {
  "id": "t80-db-11",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Sales",
  "H5": 60000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DSTDEV(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  7071.06781186548
  ]
  ]
  },
  {
  "id": "t80-db-12",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Sales",
  "H5": 60000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DSTDEVP(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  5000
  ]
  ]
  },
  {
  "id": "t80-db-13",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Sales",
  "H5": 60000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DVAR(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  50000000
  ]
  ]
  },
  {
  "id": "t80-db-14",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "F3": "Bob",
  "G3": "Eng",
  "H3": 50000,
  "F4": "Carol",
  "G4": "Sales",
  "H4": 40000,
  "F5": "Dan",
  "G5": "Sales",
  "H5": 60000,
  "J1": "Dept",
  "J2": "Sales"
  },
  "formula": "DVARP(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  25000000
  ]
  ]
  },
  {
  "id": "t80-db-15",
  "cells": {
  "F1": "Name",
  "G1": "Dept",
  "H1": "Salary",
  "F2": "Alice",
  "G2": "Sales",
  "H2": 30000,
  "J1": "Nope",
  "J2": "Sales"
  },
  "formula": "DSUM(F1:H4,\"Salary\",J1:J2)",
  "at": "P1",
  "expect": [
  [
  0
  ]
  ]
  },
  {
  "id": "t80-fx-1",
  "formula": "COUPPCD(DATE(2011,1,25),DATE(2012,11,15),2,0)",
  "at": "P1",
  "expect": [
  [
  40497
  ]
  ]
  },
  {
  "id": "t80-fx-2",
  "formula": "COUPNCD(DATE(2011,1,25),DATE(2012,11,15),2,0)",
  "at": "P1",
  "expect": [
  [
  40678
  ]
  ]
  },
  {
  "id": "t80-fx-3",
  "formula": "COUPNUM(DATE(2011,1,25),DATE(2012,11,15),2,0)",
  "at": "P1",
  "expect": [
  [
  4
  ]
  ]
  },
  {
  "id": "t80-fx-4",
  "formula": "COUPDAYS(DATE(2011,1,25),DATE(2012,11,15),2,0)",
  "at": "P1",
  "expect": [
  [
  180
  ]
  ]
  },
  {
  "id": "t80-fx-5",
  "formula": "COUPDAYBS(DATE(2011,1,25),DATE(2012,11,15),2,0)",
  "at": "P1",
  "expect": [
  [
  70
  ]
  ]
  },
  {
  "id": "t80-fx-6",
  "formula": "COUPDAYSNC(DATE(2011,1,25),DATE(2012,11,15),2,0)",
  "at": "P1",
  "expect": [
  [
  110
  ]
  ]
  },
  {
  "id": "t80-fx-7",
  "formula": "ACCRINTM(DATE(2008,2,15),DATE(2008,5,15),0.0585,1000,3)",
  "at": "P1",
  "expect": [
  [
  14.4246575342466
  ]
  ]
  },
  {
  "id": "t80-fx-9",
  "formula": "TBILLPRICE(DATE(2008,3,31),DATE(2008,6,15),0.054294)",
  "at": "P1",
  "expect": [
  [
  98.8537933333333
  ]
  ]
  },
  {
  "id": "t80-fx-10",
  "formula": "TBILLYIELD(DATE(2008,3,31),DATE(2008,6,15),98.46)",
  "at": "P1",
  "expect": [
  [
  0.0740883286827675
  ]
  ]
  },
  {
  "id": "t80-fx-11",
  "formula": "TBILLEQ(DATE(2008,3,31),DATE(2008,6,15),0.054294)",
  "at": "P1",
  "expect": [
  [
  0.055686364151664
  ]
  ]
  },
  {
  "id": "t80-fx-12",
  "formula": "DISC(DATE(2008,2,16),DATE(2017,11,15),98.5,100,0)",
  "at": "P1",
  "expect": [
  [
  0.00153889997150185
  ]
  ]
  },
  {
  "id": "t80-fx-13",
  "formula": "PRICEDISC(DATE(2008,2,16),DATE(2017,11,15),0.054294,100,0)",
  "at": "P1",
  "expect": [
  [
  47.0784316666667
  ]
  ]
  },
  {
  "id": "t80-fx-14",
  "formula": "YIELDDISC(DATE(2008,2,16),DATE(2017,11,15),98.5,100,0)",
  "at": "P1",
  "expect": [
  [
  0.00156233499644857
  ]
  ]
  },
  {
  "id": "t80-fx-15",
  "formula": "INTRATE(DATE(2008,2,16),DATE(2008,5,1),9850,10000,1)",
  "at": "P1",
  "expect": [
  [
  0.0743147208121827
  ]
  ]
  },
  {
  "id": "t80-fx-16",
  "formula": "RECEIVED(DATE(2008,2,16),DATE(2008,5,1),9850,0.0563,1)",
  "at": "P1",
  "expect": [
  [
  9964.96465368908
  ]
  ]
  },
  {
  "id": "t80-fx-17",
  "formula": "PRICEMAT(DATE(2008,2,16),DATE(2008,4,1),DATE(2008,2,15),0.0575,0.061,0)",
  "at": "P1",
  "expect": [
  [
  99.9564602027595
  ]
  ]
  },
  {
  "id": "t80-fx-18",
  "formula": "YIELDMAT(DATE(2008,2,16),DATE(2008,4,1),DATE(2008,2,15),0.0575,99.98,0)",
  "at": "P1",
  "expect": [
  [
  0.059102380512547
  ]
  ]
  },
  {
  "id": "t80-fx-19",
  "formula": "PRICE(DATE(2008,2,15),DATE(2017,11,15),0.0575,0.0605,100,2,0)",
  "at": "P1",
  "expect": [
  [
  97.8038351819334
  ]
  ]
  },
  {
  "id": "t80-fx-20",
  "formula": "YIELD(DATE(2008,2,15),DATE(2017,11,15),0.0575,100.45,100,2,0)",
  "at": "P1",
  "expect": [
  [
  0.0568787380438507
  ]
  ]
  },
  {
  "id": "t80-fx-23",
  "formula": "AMORLINC(10000,DATE(2010,12,1),DATE(2011,12,31),500,5,1,0)",
  "at": "P1",
  "expect": [
  [
  0
  ]
  ]
  },
  {
  "id": "t80-fx-24",
  "formula": "AMORDEGRC(10000,DATE(2010,12,1),DATE(2011,12,31),500,5,1,1)",
  "at": "P1",
  "expect": [
  [
  0
  ]
  ]
  },
  {
  "id": "t80-fx-29",
  "formula": "COUPNUM(DATE(2011,1,25),DATE(2012,11,15),4,3)",
  "at": "P1",
  "expect": [
  [
  8
  ]
  ]
  },
  {
  "id": "t80-fx-30",
  "formula": "PRICE(DATE(2008,2,15),DATE(2017,11,15),0.0575,0.0605,100,2,1)",
  "at": "P1",
  "expect": [
  [
  97.8042900277264
  ]
  ]
  },
  {
  "id": "t80-sx-2",
  "formula": "FISHER(0.5)",
  "at": "P1",
  "expect": [
  [
  0.549306144334055
  ]
  ]
  },
  {
  "id": "t80-sx-3",
  "formula": "FISHERINV(0.549306144334055)",
  "at": "P1",
  "expect": [
  [
  0.5
  ]
  ]
  },
  {
  "id": "t80-sx-4",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5
  },
  "formula": "PERCENTRANK(A1:A5,2.5)",
  "at": "P1",
  "expect": [
  [
  0.375
  ]
  ]
  },
  {
  "id": "t80-sx-6",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5,
  "B1": 0.1,
  "B2": 0.2,
  "B3": 0.3,
  "B4": 0.2,
  "B5": 0.2
  },
  "formula": "PROB(A1:A5,B1:B5,2)",
  "at": "P1",
  "expect": [
  [
  0.2
  ]
  ]
  },
  {
  "id": "t80-sx-7",
  "cells": {
  "A1": 2,
  "A2": 3,
  "A3": 5,
  "A4": 1,
  "A5": 8,
  "B1": 6,
  "B2": 5,
  "B3": 8,
  "B4": 2,
  "B5": 9
  },
  "formula": "STEYX(A1:A5,B1:B5)",
  "at": "P1",
  "expect": [
  [
  1.47196014438797
  ]
  ]
  },
  {
  "id": "t80-sx-8",
  "cells": {
  "A1": 2,
  "A2": 3,
  "A3": 5,
  "A4": 1,
  "A5": 8,
  "B1": 6,
  "B2": 5,
  "B3": 8,
  "B4": 2,
  "B5": 9
  },
  "formula": "T.TEST(A1:A5,B1:B5,2,2)",
  "at": "P1",
  "expect": [
  [
  0.242569773195863
  ]
  ]
  },
  {
  "id": "t80-sx-9",
  "cells": {
  "A1": 2,
  "A2": 3,
  "A3": 5,
  "A4": 1,
  "A5": 8,
  "B1": 6,
  "B2": 5,
  "B3": 8,
  "B4": 2,
  "B5": 9
  },
  "formula": "F.TEST(A1:A5,B1:B5)",
  "at": "P1",
  "expect": [
  [
  0.980264296909171
  ]
  ]
  },
  {
  "id": "t80-sx-11",
  "cells": {
  "A1": 2,
  "A2": 3,
  "A3": 5,
  "A4": 1,
  "A5": 8
  },
  "formula": "Z.TEST(A1:A5,4)",
  "at": "P1",
  "expect": [
  [
  0.564018116314896
  ]
  ]
  },
  {
  "id": "t80-sx-12",
  "cells": {
  "A1": 2,
  "A2": 3,
  "A3": 5,
  "A4": 1,
  "A5": 8,
  "B1": 6,
  "B2": 5,
  "B3": 8,
  "B4": 2,
  "B5": 9
  },
  "formula": "TREND(A1:A5,B1:B5,{10;11})",
  "read": [
  "P1:P2"
  ],
  "expect": [
  [
  null,
  null
  ]
  ]
  },
  {
  "id": "t80-sx-13",
  "cells": {
  "A1": 1,
  "A2": 2,
  "A3": 3,
  "A4": 4,
  "A5": 5
  },
  "formula": "LOGINV(0.5,3,1)",
  "at": "P1",
  "expect": [
  [
  20.0855369231877
  ]
  ]
  },
  {
  "id": "t80-sx-14",
  "formula": "NEGBINOM.DIST(3,5,0.5,FALSE)",
  "at": "P1",
  "expect": [
  [
  0.13671875
  ]
  ]
  },
  {
  "id": "t80-sx-15",
  "formula": "BINOM.DIST.RANGE(100,0.5,50,60)",
  "at": "P1",
  "expect": [
  [
  0.522194518584737
  ]
  ]
  },
  {
  "id": "t80-sx-16",
  "formula": "HYPGEOM.DIST(1,4,8,20,TRUE)",
  "at": "P1",
  "expect": [
  [
  0.465428276573787
  ]
  ]
  },
  {
  "id": "t80-sx-17",
  "formula": "WEIBULL.DIST(105,20,100,FALSE)",
  "at": "P1",
  "expect": [
  [
  0.0355888640245043
  ]
  ]
  },
  {
  "id": "t80-sx-18",
  "formula": "GAMMADIST(10,9,2,FALSE)",
  "at": "P1",
  "expect": [
  [
  0.0326390196740794
  ]
  ]
  },
  {
  "id": "t80-sx-19",
  "formula": "GAMMAINV(0.068099401814534,9,2)",
  "at": "P1",
  "expect": [
  [
  10.0001766885127
  ]
  ]
  },
  {
  "id": "t80-sx-20",
  "formula": "GAMMALN.PRECISE(10)",
  "at": "P1",
  "expect": [
  [
  12.8018274800815
  ]
  ]
  },
  {
  "id": "t80-sx-21",
  "formula": "CHISQ.INV(0.5,4)",
  "at": "P1",
  "expect": [
  [
  3.35669398003332
  ]
  ]
  },
  {
  "id": "t80-sx-22",
  "formula": "F.INV(0.5,3,4)",
  "at": "P1",
  "expect": [
  [
  0.940534076367755
  ]
  ]
  },
  {
  "id": "t80-eng-1",
  "formula": "BIN2OCT(\"1010\")",
  "at": "P1",
  "expect": [
  [
  "12"
  ]
  ]
  },
  {
  "id": "t80-eng-2",
  "formula": "BIN2HEX(\"1010\",4)",
  "at": "P1",
  "expect": [
  [
  "000A"
  ]
  ]
  },
  {
  "id": "t80-eng-3",
  "formula": "OCT2BIN(\"7\")",
  "at": "P1",
  "expect": [
  [
  "111"
  ]
  ]
  },
  {
  "id": "t80-eng-4",
  "formula": "OCT2HEX(\"17\")",
  "at": "P1",
  "expect": [
  [
  "F"
  ]
  ]
  },
  {
  "id": "t80-eng-5",
  "formula": "HEX2BIN(\"F\")",
  "at": "P1",
  "expect": [
  [
  "1111"
  ]
  ]
  },
  {
  "id": "t80-eng-6",
  "formula": "HEX2OCT(\"F\")",
  "at": "P1",
  "expect": [
  [
  "17"
  ]
  ]
  },
  {
  "id": "t80-eng-7",
  "formula": "DEC2OCT(10)",
  "at": "P1",
  "expect": [
  [
  "12"
  ]
  ]
  },
  {
  "id": "t80-eng-8",
  "formula": "BITRSHIFT(16,3)",
  "at": "P1",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "t80-eng-9",
  "formula": "IMREAL(\"3+4i\")",
  "at": "P1",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "t80-eng-10",
  "formula": "IMAGINARY(\"3+4i\")",
  "at": "P1",
  "expect": [
  [
  4
  ]
  ]
  },
  {
  "id": "t80-eng-11",
  "formula": "IMARGUMENT(COMPLEX(0,1))",
  "at": "P1",
  "expect": [
  [
  1.5707963267949
  ]
  ]
  },
  {
  "id": "t80-eng-12",
  "formula": "IMCONJUGATE(\"3+4i\")",
  "at": "P1",
  "expect": [
  [
  "3-4i"
  ]
  ]
  },
  {
  "id": "t80-eng-13",
  "formula": "IMSUB(\"3+4i\",\"1+i\")",
  "at": "P1",
  "expect": [
  [
  "2+3i"
  ]
  ]
  },
  {
  "id": "t80-eng-14",
  "formula": "IMPRODUCT(\"3+4i\",\"5+i\")",
  "at": "P1",
  "expect": [
  [
  "11+23i"
  ]
  ]
  },
  {
  "id": "t80-eng-16",
  "formula": "IMPOWER(\"2+i\",3)",
  "at": "P1",
  "expect": [
  [
  "2.0000000000000018+11.000000000000002i"
  ]
  ]
  },
  {
  "id": "t80-eng-17",
  "formula": "IMSQRT(\"i\")",
  "at": "P1",
  "expect": [
  [
  "0.7071067811865476+0.7071067811865475i"
  ]
  ]
  },
  {
  "id": "t80-eng-18",
  "formula": "IMLN(\"1+i\")",
  "at": "P1",
  "expect": [
  [
  "0.3465735902799727+0.7853981633974483i"
  ]
  ]
  },
  {
  "id": "t80-eng-19",
  "formula": "IMCOS(IMEXP(COMPLEX(0,1)))",
  "at": "P1",
  "expect": [
  [
  "1.179501321915592-0.4857693871955125i"
  ]
  ]
  },
  {
  "id": "t80-eng-20",
  "formula": "CONVERT(1,\"mi\",\"yd\")",
  "at": "P1",
  "expect": [
  [
  1760
  ]
  ]
  },
  {
  "id": "t80-eng-21",
  "formula": "CONVERT(5,\"F\",\"C\")",
  "at": "P1",
  "expect": [
  [
  -15
  ]
  ]
  },
  {
  "id": "t80-eng-22",
  "formula": "CONVERT(1,\"lbm\",\"g\")",
  "at": "P1",
  "expect": [
  [
  453.592369999999
  ]
  ]
  },
  {
  "id": "t80-eng-23",
  "formula": "BESSELI(1.5,1)",
  "at": "P1",
  "expect": [
  [
  0.981666428577908
  ]
  ]
  },
  {
  "id": "t80-eng-25",
  "formula": "ERF.PRECISE(1)",
  "at": "P1",
  "expect": [
  [
  0.842700792949715
  ]
  ]
  },
  {
  "id": "t80-eng-26",
  "formula": "ERFC.PRECISE(1)",
  "at": "P1",
  "expect": [
  [
  0.157299207050285
  ]
  ]
  },
  {
  "id": "t80-eng-30",
  "formula": "ACOT(1)",
  "at": "P1",
  "expect": [
  [
  0.785398163397448
  ]
  ]
  },
  {
  "id": "t80-eng-31",
  "formula": "ACOTH(2)",
  "at": "P1",
  "expect": [
  [
  0.549306144334055
  ]
  ]
  },
  {
  "id": "t80-tx-1",
  "formula": "ENCODEURL(\"http://example.com/a b\")",
  "at": "P1",
  "expect": [
  [
  "http%3A%2F%2Fexample.com%2Fa%20b"
  ]
  ]
  },
  {
  "id": "t80-tx-2",
  "formula": "LEFTB(\"spreadjs\",3)",
  "at": "P1",
  "expect": [
  [
  "spr"
  ]
  ]
  },
  {
  "id": "t80-tx-3",
  "formula": "RIGHTB(\"spreadjs\",2)",
  "at": "P1",
  "expect": [
  [
  "js"
  ]
  ]
  },
  {
  "id": "t80-tx-4",
  "formula": "MIDB(\"spreadjs\",2,3)",
  "at": "P1",
  "expect": [
  [
  "pre"
  ]
  ]
  },
  {
  "id": "t80-tx-6",
  "formula": "FINDB(\"a\",\"banana\",2)",
  "at": "P1",
  "expect": [
  [
  2
  ]
  ]
  },
  {
  "id": "t80-tx-7",
  "formula": "SEARCHB(\"N\",\"Banana\")",
  "at": "P1",
  "expect": [
  [
  3
  ]
  ]
  },
  {
  "id": "t80-tx-8",
  "formula": "REPLACEB(\"spread\",2,3,\"XYZ\")",
  "at": "P1",
  "expect": [
  [
  "sXYZad"
  ]
  ]
  },
  {
  "id": "t80-tx-9",
  "formula": "ASC(\"Ｐａｎａｓｏｎｉｃ\")",
  "at": "P1",
  "expect": [
  [
  "Panasonic"
  ]
  ]
  },
  {
  "id": "t80-tx-10",
  "formula": "JIS(\"Panasonic\")",
  "at": "P1",
  "expect": [
  [
  {
  "error": "#NAME?"
  }
  ]
  ]
  }
];

describe('calc-oracle-extra', () => {
  it.each(CASES)('$id: =$formula', (c) => {
    const got = runCase(c);
    for (let i = 0; i < c.expect.length; i++)
      for (let j = 0; j < c.expect[i]!.length; j++) {
        if (!sameValue(got[i]?.[j], c.expect[i]![j]))
          throw new Error(`${c.id}: =${c.formula} at [${i}][${j}]: got ${JSON.stringify(got[i]?.[j])}, trial wants ${JSON.stringify(c.expect[i]![j])}`);
      }
  });
});
