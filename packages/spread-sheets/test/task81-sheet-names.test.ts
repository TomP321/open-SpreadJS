/**
 * TASK 81 core gap 3: Workbook.fromJSON rebases the Sheet<N> name counter, exactly like the
 * trial. Measured live on the official trial (2026-11-20 probe batch — the earlier
 * `t77-sheetnames.json` finding that "fromJSON re-establishes the counter" refined to the exact
 * rule): the counter restarts at the NUMBER OF LOADED SHEETS (baseline 1), and the addSheet
 * loop then skips names that already exist. Every case below is the trial's own answer:
 *   [Data]                    -> Sheet2      [Data, Sheet3]          -> Sheet4
 *   [Sheet1, Sheet2]          -> Sheet3      [Alpha, Beta]           -> Sheet3
 *   [Data, Sheet2, Sheet5]    -> Sheet4      [Sheet5]                -> Sheet2
 *   (no sheets)               -> Sheet2      [Data, Sheet1]          -> Sheet3
 * The LIVE monotonic rule (names continue after deletions, no reuse) is unchanged.
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import type { Workbook } from '../src/model.js';

type SheetSettings = { index: number; name: string };

const jsonOf = (names: string[]): Record<string, unknown> => {
  const sheets: Record<string, SheetSettings> = {};
  names.forEach((name, index) => { sheets[name] = { index, name }; });
  return { sheets, sheetCount: names.length };
};

const sheetNames = (wb: Workbook): string[] => {
  const out: string[] = [];
  for (let i = 0; i < wb.getSheetCount(); i++) out.push(wb.getSheet(i).name());
  return out;
};

function afterFromJSON(names: string[], adds = 1, insertAt = 1): string[] {
  const wb = new GC.Spread.Sheets.Workbook();
  wb.fromJSON(JSON.parse(JSON.stringify(jsonOf(names))));
  for (let i = 0; i < adds; i++) wb.addSheet(insertAt);
  return sheetNames(wb);
}

describe('TASK 81 fromJSON rebases the sheet-name counter (trial-probed rule)', () => {
  it('loads the measured cases identically to the trial', () => {
    expect(afterFromJSON(['Data'])).toEqual(['Data', 'Sheet2']);
    expect(afterFromJSON(['Data', 'Sheet3'])).toEqual(['Data', 'Sheet4', 'Sheet3']);
    expect(afterFromJSON(['Sheet1', 'Sheet2'])).toEqual(['Sheet1', 'Sheet3', 'Sheet2']);
    expect(afterFromJSON(['Alpha', 'Beta'])).toEqual(['Alpha', 'Sheet3', 'Beta']);
    expect(afterFromJSON(['Data', 'Sheet2', 'Sheet5'])).toEqual(['Data', 'Sheet4', 'Sheet2', 'Sheet5']);
    expect(afterFromJSON(['Sheet5'])).toEqual(['Sheet5', 'Sheet2']);
    expect(afterFromJSON(['Data', 'Sheet1'])).toEqual(['Data', 'Sheet3', 'Sheet1']);
  });

  it('an empty fromJSON still starts generation at Sheet2 (trial probe G)', () => {
    const wb = new GC.Spread.Sheets.Workbook();
    wb.fromJSON(jsonOf([]) as never);
    expect(wb.getSheetCount()).toBe(0);
    wb.addSheet(0);
    expect(sheetNames(wb)).toEqual(['Sheet2']);
  });

  it('keeps the live monotonic rule across deletions (no rebasing outside fromJSON)', () => {
    const wb = new GC.Spread.Sheets.Workbook();
    wb.getActiveSheet().name('Data');
    wb.addSheet(1); wb.addSheet(2); wb.addSheet(3);
    expect(sheetNames(wb)).toEqual(['Data', 'Sheet2', 'Sheet3', 'Sheet4']);
    wb.removeSheet(2); wb.removeSheet(1);
    wb.addSheet(1);
    expect(sheetNames(wb)).toEqual(['Data', 'Sheet5', 'Sheet4']); // the trial's afterDelete answer
  });

  it('reloads the t77-sheetnames sequence: live drift is reset by fromJSON', () => {
    const wb = new GC.Spread.Sheets.Workbook();
    wb.getActiveSheet().name('Data');
    const base = JSON.parse(JSON.stringify(wb.toJSON()));
    wb.addSheet(1); wb.addSheet(2); wb.addSheet(3);
    wb.removeSheet(2); wb.removeSheet(1);
    wb.addSheet(1);
    expect(sheetNames(wb)).toEqual(['Data', 'Sheet5', 'Sheet4']);
    wb.fromJSON(base); // the sweep re-loads its baseline before every command row
    wb.addSheet(1);
    expect(sheetNames(wb)).toEqual(['Data', 'Sheet2']); // trial: the reloaded counter names it Sheet2
  });
});
