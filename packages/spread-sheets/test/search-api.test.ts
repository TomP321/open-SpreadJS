/**
 * TASK 38 item 5 - `Workbook.search` / `Worksheet.search` and the
 * `GC.Spread.Sheets.Search` records.
 *
 * Every expected value below is what the official SpreadJS 19.2.5 trial answers
 * for the same public calls (`.probe/api-sweep-probe.mjs`, reports
 * `.probe/report-item5*.json`).
 */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';

const { Workbook, Worksheet } = GC.Spread.Sheets;
const { SearchCondition, SearchResult, SearchFoundFlags, SearchFlags, SearchOrder } = GC.Spread.Sheets.Search;
const { SheetArea } = GC.Spread.Sheets;
type Sheet = InstanceType<typeof Worksheet>;
type Book = InstanceType<typeof Workbook>;
type Condition = InstanceType<typeof SearchCondition>;
type Answer = InstanceType<typeof SearchResult>;

/** The three-row sheet most of the trial snippets searched. */
function fill(sheet: Sheet): Sheet {
  sheet.setArray(0, 0, [
    ['alpha', 'Beta', 'gamma'],
    ['delta', 'ALPHAx', 'epsilon'],
    ['zeta', 'eta', 'GAMMA'],
  ]);
  return sheet;
}

const found = (answer: { searchFoundFlag: number; foundRowIndex: number; foundColumnIndex: number; foundString: unknown }) => [
  answer.searchFoundFlag,
  answer.foundRowIndex,
  answer.foundColumnIndex,
  answer.foundString,
];

const find = (sheet: Sheet, text: string, mutate?: (condition: Condition) => void) => {
  const condition = new SearchCondition();
  condition.searchString = text;
  mutate?.(condition);
  return sheet.search(condition);
};

describe('Search.SearchCondition and Search.SearchResult', () => {
  it('carries the trial defaults and field order', () => {
    const condition = new SearchCondition();
    expect(Object.keys(condition)).toEqual([
      'startSheetIndex',
      'endSheetIndex',
      'searchString',
      'searchFlags',
      'searchOrder',
      'searchTarget',
      'sheetArea',
      'rowStart',
      'columnStart',
      'rowEnd',
      'columnEnd',
      'findBeginRow',
      'findBeginColumn',
    ]);
    expect(condition.startSheetIndex).toBe(-1);
    expect(condition.endSheetIndex).toBe(-1);
    expect(condition.searchString).toBeNull();
    expect(condition.searchFlags).toBe(SearchFlags.none);
    expect(condition.searchOrder).toBe(SearchOrder.zOrder);
    expect(condition.searchTarget).toBe(SearchFoundFlags.cellText);
    expect(condition.sheetArea).toBe(SheetArea.viewport);
    expect(condition.rowStart).toBe(-1);
    expect(condition.columnStart).toBe(-1);
    expect(condition.rowEnd).toBe(-1);
    expect(condition.columnEnd).toBe(-1);
    // The trial keeps its own scan cursors on the record as well.
    expect(condition.findBeginRow).toBe(-1);
    expect(condition.findBeginColumn).toBe(-1);

    const answer = new SearchResult();
    expect(Object.keys(answer)).toEqual(['foundColumnIndex', 'foundRowIndex', 'searchFoundFlag', 'foundSheetIndex', 'foundString']);
    expect(found(answer)).toEqual([SearchFoundFlags.none, -1, -1, null]);
    expect(answer.foundSheetIndex).toBe(-1);
  });

  it('answers an unanswered search with the empty record', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    const answer = find(sheet, 'nothing here');
    expect(found(answer)).toEqual([SearchFoundFlags.none, -1, -1, null]);
    expect(answer.foundSheetIndex).toBe(-1);
    wb.destroy();
  });
});

describe('Worksheet.search', () => {
  it('finds the first cell in row order and reports the whole cell text', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    // Trial item `search-2`: `gamma` is found at row 0 column 2 and `foundString`
    // is the text of the cell, not the matched part of it.
    expect(found(find(sheet, 'gamma'))).toEqual([SearchFoundFlags.cellText, 0, 2, 'gamma']);
    expect(found(find(sheet, 'Bet'))).toEqual([SearchFoundFlags.cellText, 0, 1, 'Beta']);
    expect(found(find(sheet, 'alpha'))).toEqual([SearchFoundFlags.cellText, 0, 0, 'alpha']);
    expect(found(find(sheet, 'epsilon'))).toEqual([SearchFoundFlags.cellText, 1, 2, 'epsilon']);
    // A sheet-level search never names its own sheet.
    expect(find(sheet, 'gamma').foundSheetIndex).toBe(-1);
    wb.destroy();
  });

  it('is case sensitive unless ignoreCase is set', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    // Trial item `search-2`: `GAMMA` reaches the cell that spells it, and with
    // `ignoreCase` the scan stops at the first cell matching either spelling.
    expect(found(find(sheet, 'GAMMA'))).toEqual([SearchFoundFlags.cellText, 2, 2, 'GAMMA']);
    expect(found(find(sheet, 'GAMMA', (c) => (c.searchFlags = SearchFlags.ignoreCase)))).toEqual([
      SearchFoundFlags.cellText,
      0,
      2,
      'gamma',
    ]);
    wb.destroy();
  });

  it('matches the whole text only with exactMatch', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    expect(found(find(sheet, 'Beta', (c) => (c.searchFlags = SearchFlags.exactMatch)))).toEqual([
      SearchFoundFlags.cellText,
      0,
      1,
      'Beta',
    ]);
    expect(found(find(sheet, 'Bet', (c) => (c.searchFlags = SearchFlags.exactMatch)))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    wb.destroy();
  });

  it('matches wildcards against the whole text, whichever way it scans', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    sheet.setFormula(3, 0, '="gamma"&A1');
    wb.calculate();
    // Trial item `search-8`: `a*a` finds `alpha`; the reverse scan finds the same
    // cell because `ALPHAx` and `gammaalpha` do not match the pattern end to end.
    expect(found(find(sheet, 'a*a', (c) => (c.searchFlags = SearchFlags.useWildCards)))).toEqual([
      SearchFoundFlags.cellText,
      0,
      0,
      'alpha',
    ]);
    expect(
      found(
        find(sheet, 'a*a', (c) => {
          c.searchFlags = SearchFlags.useWildCards;
          c.searchOrder = SearchOrder.nOrder;
        }),
      ),
    ).toEqual([SearchFoundFlags.cellText, 0, 0, 'alpha']);
    expect(found(find(sheet, 'bet?', (c) => (c.searchFlags = SearchFlags.useWildCards | SearchFlags.ignoreCase)))).toEqual([
      SearchFoundFlags.cellText,
      0,
      1,
      'Beta',
    ]);
    expect(found(find(sheet, 'z*z', (c) => (c.searchFlags = SearchFlags.useWildCards)))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    wb.destroy();
  });

  it('starts at rowStart and columnStart; rowEnd and columnEnd do not cut the scan', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    sheet.setFormula(3, 0, '="gamma"&A1');
    sheet.setValue(2, 4, 1234.5);
    wb.calculate();
    // Trial items `search-7` and `search-8`.
    expect(found(find(sheet, 'gamma', (c) => (c.rowStart = 1)))).toEqual([SearchFoundFlags.cellText, 3, 0, 'gammaalpha']);
    expect(found(find(sheet, 'gamma', (c) => (c.rowStart = 2)))).toEqual([SearchFoundFlags.cellText, 3, 0, 'gammaalpha']);
    expect(found(find(sheet, 'epsilon', (c) => (c.rowStart = 0)))).toEqual([SearchFoundFlags.cellText, 1, 2, 'epsilon']);
    // `rowEnd` below the found cell changes nothing.
    expect(found(find(sheet, 'epsilon', (c) => (c.rowEnd = 0)))).toEqual([SearchFoundFlags.cellText, 1, 2, 'epsilon']);
    expect(found(find(sheet, 'GAMMA', (c) => (c.rowEnd = 1)))).toEqual([SearchFoundFlags.cellText, 2, 2, 'GAMMA']);
    // `columnStart` moves the start inside the first row only.
    expect(found(find(sheet, 'gamma', (c) => (c.columnStart = 2)))).toEqual([SearchFoundFlags.cellText, 0, 2, 'gamma']);
    // The start column only limits the first row the scan runs through: the trial
    // reaches `epsilon` (column 2) from a start at column 5 (item `search-7`), and
    // the same rule here skips `gamma` in row 0 and answers the formula cell.
    expect(found(find(sheet, 'gamma', (c) => (c.columnStart = 3)))).toEqual([SearchFoundFlags.cellText, 3, 0, 'gammaalpha']);
    expect(found(find(sheet, 'epsilon', (c) => {
      c.columnStart = 5;
      c.columnEnd = 5;
    }))).toEqual([SearchFoundFlags.cellText, 1, 2, 'epsilon']);
    expect(found(find(sheet, '1234', (c) => (c.columnEnd = 1)))).toEqual([SearchFoundFlags.cellText, 2, 4, '1234.5']);
    // A start beyond the grid finds nothing (trial item `search-9`).
    expect(found(find(sheet, 'gamma', (c) => (c.rowStart = 500)))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    const beyond = new Workbook();
    fill(beyond.getActiveSheet());
    expect(found(find(beyond.getActiveSheet(), 'gamma', (c) => (c.columnStart = 50)))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    beyond.destroy();
    wb.destroy();
  });

  it('scans backwards with SearchOrder.nOrder', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    sheet.setFormula(3, 0, '="gamma"&A1');
    wb.calculate();
    expect(found(find(sheet, 'gamma', (c) => (c.searchOrder = SearchOrder.nOrder)))).toEqual([
      SearchFoundFlags.cellText,
      3,
      0,
      'gammaalpha',
    ]);
    wb.destroy();
  });

  it('searches the targets the condition asks for and reports the union of the ones that matched', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    sheet.setFormula(3, 0, '="gamma"&A1');
    sheet.setTag(4, 0, 'gamma tag');
    sheet.comments.add(4, 1, 'a gamma comment');
    wb.calculate();
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = SearchFoundFlags.cellTag)))).toEqual([
      SearchFoundFlags.cellTag,
      4,
      0,
      'gamma tag',
    ]);
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = SearchFoundFlags.cellComment)))).toEqual([
      SearchFoundFlags.cellComment,
      4,
      1,
      'a gamma comment',
    ]);
    // The formula target reads the formula with its leading `=`, and the text a
    // cell without a formula displays (trial items `formulaText`, `textTarget8`).
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = SearchFoundFlags.cellFormula)))).toEqual([
      SearchFoundFlags.cellFormula,
      0,
      2,
      'gamma',
    ]);
    expect(found(find(sheet, 'A1', (c) => {
      c.searchTarget = SearchFoundFlags.cellFormula;
      c.rowStart = 1;
    }))).toEqual([SearchFoundFlags.cellFormula, 3, 0, '="gamma"&A1']);
    expect(found(find(sheet, 'alpha', (c) => {
      c.searchTarget = SearchFoundFlags.cellFormula;
      c.rowStart = 1;
    }))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    // Cell text plus formula at the same cell answers both bits, and the answer
    // carries the text of the higher target (trial item `formulaUnion`).
    expect(found(find(sheet, 'gamma', (c) => {
      c.searchTarget = SearchFoundFlags.cellText | SearchFoundFlags.cellFormula;
      c.rowStart = 1;
    }))).toEqual([SearchFoundFlags.cellText | SearchFoundFlags.cellFormula, 3, 0, '="gamma"&A1']);
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = 15)))).toEqual([
      SearchFoundFlags.cellText | SearchFoundFlags.cellFormula,
      0,
      2,
      'gamma',
    ]);
    // A target bit the trial does not search finds nothing, on its own or mixed.
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = 2)))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = SearchFoundFlags.none)))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    wb.destroy();
  });

  it('searches threaded comments and merges their reply text', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    expect(sheet.threadedComments.add(0, 0, [{ message: [{ type: 0, value: 'gamma threaded' }], createdAt: new Date(), authorId: 'u1' }])).toBeTruthy();
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = SearchFoundFlags.cellThreadedComment)))).toEqual([
      SearchFoundFlags.cellThreadedComment,
      0,
      0,
      'gamma threaded',
    ]);
    // A threaded comment is not cell text (trial item `search-9`).
    expect(found(find(sheet, 'gamma threaded', (c) => (c.searchTarget = SearchFoundFlags.cellText)))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    expect(found(find(sheet, 'gamma', (c) => (c.searchTarget = 1 | 16 | 32)))).toEqual([
      SearchFoundFlags.cellThreadedComment,
      0,
      0,
      'gamma threaded',
    ]);
    wb.destroy();
  });

  it('reads the text the cell displays, formatted', () => {
    const wb = new Workbook();
    const sheet = wb.getActiveSheet();
    sheet.setFormatter(2, 0, '0.00');
    sheet.setValue(2, 0, 1.5);
    sheet.setValue(2, 1, new Date(2020, 0, 2));
    sheet.setValue(2, 2, true);
    sheet.setValue(2, 4, 1234.5);
    // Trial item `search-6b`: the search text is the formatted cell text.
    expect(found(find(sheet, '1.50'))).toEqual([SearchFoundFlags.cellText, 2, 0, '1.50']);
    expect(found(find(sheet, '1.5'))).toEqual([SearchFoundFlags.cellText, 2, 0, '1.50']);
    // A date value is not reached through its date text (trial item `search-6b`).
    expect(found(find(sheet, '2/1/2020', (c) => (c.searchFlags = SearchFlags.ignoreCase)))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    expect(found(find(sheet, 'TRUE'))).toEqual([SearchFoundFlags.cellText, 2, 2, 'TRUE']);
    expect(found(find(sheet, '1234', (c) => (c.searchTarget = SearchFoundFlags.cellFormula)))).toEqual([
      SearchFoundFlags.cellFormula,
      2,
      4,
      '1234.5',
    ]);
    wb.destroy();
  });

  it('searches hidden rows and merged spans like the trial', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    sheet.addSpan(0, 2, 1, 2);
    expect(found(find(sheet, 'gamma'))).toEqual([SearchFoundFlags.cellText, 0, 2, 'gamma']);
    sheet.setRowVisible(0, false);
    expect(found(find(sheet, 'gamma'))).toEqual([SearchFoundFlags.cellText, 0, 2, 'gamma']);
    sheet.setRowVisible(0, true);
    wb.destroy();
  });

  it('searches only the sheet it is called on', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    wb.addSheet(1, new Worksheet('SearchOther'));
    wb.getSheet(1).setValue(7, 7, 'gamma here');
    wb.calculate();
    // The sheet index window belongs to `Workbook.search` alone (trial item `search-5`).
    expect(found(find(sheet, 'gamma here', (c) => {
      c.startSheetIndex = 1;
      c.endSheetIndex = 1;
    }))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    wb.destroy();
  });

  it('needs the scan cursors the record carries', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    // The trial reads `findBeginRow`/`findBeginColumn` from the condition; a
    // look-alike object without them never reaches a cell (item `search-5`).
    const foreign: Record<string, unknown> = {
      searchString: 'gamma',
      searchTarget: 1,
      searchFlags: 0,
      searchOrder: 0,
      sheetArea: 3,
      rowStart: -1,
      rowEnd: -1,
      columnStart: -1,
      columnEnd: -1,
      startSheetIndex: -1,
      endSheetIndex: -1,
    };
    expect(found((sheet.search as (condition: unknown) => Answer)(foreign))).toEqual([
      SearchFoundFlags.none,
      -1,
      -1,
      null,
    ]);
    foreign.findBeginRow = -1;
    foreign.findBeginColumn = -1;
    expect(found((sheet.search as (condition: unknown) => Answer)(foreign))).toEqual([
      SearchFoundFlags.cellText,
      0,
      2,
      'gamma',
    ]);
    // Without a condition at all the trial answers `null` (item `search-5`).
    expect((sheet.search as () => unknown)()).toBeNull();
    wb.destroy();
  });

  it('answers nothing for an empty or missing search string', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    expect(found(find(sheet, ''))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    expect(found(find(sheet, null as unknown as string))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    const untouched = new SearchCondition();
    expect(found(sheet.search(untouched))).toEqual([SearchFoundFlags.none, -1, -1, null]);
    wb.destroy();
  });

  it('leaves the cursors where the trial leaves them', () => {
    const wb = new Workbook();
    const sheet = fill(wb.getActiveSheet());
    const condition = new SearchCondition();
    condition.searchString = 'gamma';
    const first = sheet.search(condition);
    const second = sheet.search(condition);
    expect(found(first)).toEqual(found(second));
    expect([condition.findBeginRow, condition.findBeginColumn]).toEqual([-1, -1]);
    wb.destroy();
  });
});

describe('Workbook.search', () => {
  const run = (wb: Book, text: string, mutate?: (condition: Condition) => void) => {
    const condition = new SearchCondition();
    condition.searchString = text;
    mutate?.(condition);
    return wb.search(condition);
  };

  it('reports the sheet it found', () => {
    const wb = new Workbook();
    fill(wb.getActiveSheet());
    wb.addSheet(1, new Worksheet('SearchOther'));
    wb.getSheet(1).setValue(7, 7, 'gamma here');
    wb.calculate();
    const first = run(wb, 'gamma');
    expect([first.searchFoundFlag, first.foundSheetIndex, first.foundRowIndex, first.foundColumnIndex, first.foundString]).toEqual([
      SearchFoundFlags.cellText,
      0,
      0,
      2,
      'gamma',
    ]);
    const other = run(wb, 'gamma here');
    expect([other.searchFoundFlag, other.foundSheetIndex, other.foundRowIndex, other.foundColumnIndex, other.foundString]).toEqual([
      SearchFoundFlags.cellText,
      1,
      7,
      7,
      'gamma here',
    ]);
    wb.destroy();
  });

  it('honours the sheet window and drops a window that does not fit', () => {
    const wb = new Workbook();
    fill(wb.getActiveSheet());
    wb.addSheet(1, new Worksheet('SearchOther'));
    wb.getSheet(1).setValue(7, 7, 'gamma here');
    wb.calculate();
    const inside = run(wb, 'gamma here', (c) => {
      c.startSheetIndex = 1;
      c.endSheetIndex = 1;
    });
    expect([inside.searchFoundFlag, inside.foundSheetIndex]).toEqual([SearchFoundFlags.cellText, 1]);
    // Trial item `search-8`: an end index past the last sheet finds nothing, and
    // so does a window that runs backwards.
    const over = run(wb, 'gamma', (c) => {
      c.startSheetIndex = 0;
      c.endSheetIndex = 2;
    });
    expect(over.searchFoundFlag).toBe(SearchFoundFlags.none);
    const out = run(wb, 'gamma here', (c) => {
      c.startSheetIndex = 2;
      c.endSheetIndex = 3;
    });
    expect(out.searchFoundFlag).toBe(SearchFoundFlags.none);
    const swapped = run(wb, 'gamma', (c) => {
      c.startSheetIndex = 1;
      c.endSheetIndex = 0;
    });
    expect([swapped.searchFoundFlag, swapped.foundSheetIndex]).toEqual([SearchFoundFlags.none, -1]);
    expect(run(wb, 'nothing at all').searchFoundFlag).toBe(SearchFoundFlags.none);
    expect((wb.search as () => unknown)()).toBeNull();
    wb.destroy();
  });
});
