import { bench, describe } from 'vitest';
import { Worksheet } from '../src/model.js';

const numeric = new Worksheet();
numeric.setRowCount(1_000_000);
for (let r = 0; r < 200_000; r++) numeric.setValue(r, 0, r);
const serial = new Worksheet();
for (let r = 0; r < 100_000; r++) serial.setValue(r, 0, r);

describe('model performance', () => {
  bench('setValue: 200k numbers in a dense column', () => {
    const sheet = new Worksheet();
    for (let r = 0; r < 200_000; r++) sheet.setValue(r, 0, r);
  });
  bench('setValue: 200k scattered rows across 50 columns', () => {
    const sheet = new Worksheet(); sheet.setRowCount(1_000_000); sheet.setColumnCount(16384);
    for (let r = 0; r < 200_000; r++) sheet.setValue(r, r % 50, r);
  });
  bench('getValue: 200k numbers', () => {
    for (let r = 0; r < 200_000; r++) numeric.getValue(r, 0);
  });
  bench('setRowHeight and offset lookup: 10k sparse changes', () => {
    const sheet = new Worksheet();
    sheet.setRowCount(1_000_000);
    for (let r = 0; r < 10_000; r++) {
      sheet.setRowHeight(r * 97, 25);
      sheet._rowLayout().indexAtOffset(r * 1940);
    }
  });
  bench('toJSON: 100k populated cells', () => { serial.toJSON(); });
});
