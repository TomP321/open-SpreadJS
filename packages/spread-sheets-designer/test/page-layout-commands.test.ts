/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * TASK 7: Page Layout ribbon commands must write through the model
 * (sheet.printInfo(), page breaks, sheet.backgroundImage) and the ribbon state
 * must read it back — nothing may live in a Designer-local store.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import GC from '@mescius/spread-sheets';
import { applyBuiltin, commandEnabled } from '../src/commands/actions.js';
import { Designer } from '../src/designer.js';
import { applyPageSetupDraft, pageSetupDraft } from '../src/page-setup.js';

function makeDesigner(): { d: any; sheet: any; workbook: any } {
  const workbook = new (GC as any).Spread.Sheets.Workbook();
  const sheet = workbook.getActiveSheet();
  const d: any = Object.assign(Object.create(Designer.prototype), {
    gc: GC,
    workbook,
    getWorkbook: () => workbook,
    invalidate: () => undefined,
    _pageSetupSynced: new WeakSet(),
  });
  return { d, sheet, workbook };
}

describe('Page Layout commands write through printInfo', () => {
  let d: any, sheet: any;
  beforeEach(() => {
    ({ d, sheet } = makeDesigner());
  });
  const pi = () => sheet.printInfo();

  it('Scale to Fit combos update fitPagesWide/Tall and zoomFactor', () => {
    // Trial (TASK 75 sweep): bare executes are ignored — the ribbon combos apply the
    // selection through their property name.
    applyBuiltin(d, 'fitPageWidth', { value: '2 pages' });
    expect(pi().fitPagesWide()).toBe(-1);
    applyBuiltin(d, 'fitPageWidth', { propertyName: 'fitPageWidth', value: '2 pages' });
    expect(pi().fitPagesWide()).toBe(2);
    applyBuiltin(d, 'fitPageWidth', { propertyName: 'fitPageWidth', value: 'Automatic' });
    expect(pi().fitPagesWide()).toBe(-1);
    applyBuiltin(d, 'fitPageTall', { propertyName: 'fitPageTall', value: '1 page' });
    expect(pi().fitPagesTall()).toBe(1);
    applyBuiltin(d, 'fitPageScale', { propertyName: 'fitPageScale', value: 85 });
    expect(pi().zoomFactor()).toBeCloseTo(0.85);
  });

  it('Orientation, margins and paper size update printInfo', () => {
    applyBuiltin(d, 'orientationLandscape');
    expect(pi().orientation()).toBe(2);
    applyBuiltin(d, 'orientationPortrait');
    expect(pi().orientation()).toBe(1);
    applyBuiltin(d, 'marginWide');
    expect(pi().margin()).toEqual({ top: 100, bottom: 100, left: 100, right: 100, header: 50, footer: 50 });
    applyBuiltin(d, 'marginNarrow');
    expect(pi().margin().left).toBe(25);
    applyBuiltin(d, 'marginNormal');
    expect(pi().margin().left).toBe(70);
    applyBuiltin(d, 'paperA4');
    expect(pi().paperSize().kind()).toBe(9);
    applyBuiltin(d, 'paperKindSelector', { value: 'Legal' });
    expect(pi().paperSize().kind()).toBe(5);
    expect(pi().paperSize().width()).toBe(850);
  });

  it('Set/Clear Print Area writes the range and the Print_Area defined name', () => {
    sheet.setValue(1, 1, 'a');
    sheet.setSelection(1, 1, 3, 4);
    expect(commandEnabled(d, 'clearPrintArea')).toBe(false);
    applyBuiltin(d, 'setPrintArea');
    expect([pi().rowStart(), pi().columnStart(), pi().rowEnd(), pi().columnEnd()]).toEqual([1, 1, 3, 4]);
    const name = sheet.getCustomName('Print_Area');
    expect(String(name?.getExpression?.() ?? '')).toContain('$B$2:$E$4');
    // The trial persists the print area with the sheet, through this name.
    expect(JSON.stringify(sheet.toJSON())).toMatch(/Print_Area/);
    expect(commandEnabled(d, 'clearPrintArea')).toBe(true);
    applyBuiltin(d, 'clearPrintArea');
    expect(pi().rowStart()).toBe(-1);
    expect(sheet.getCustomName('Print_Area')).toBeFalsy();
  });

  it('Print Gridlines / Print Headings / PrintLineVisible toggle printInfo and the sheet', () => {
    expect(pi().showGridLine()).toBe(false);
    applyBuiltin(d, 'pageLayoutPrintGridlines');
    expect(pi().showGridLine()).toBe(true);
    applyBuiltin(d, 'pageLayoutPrintGridlines');
    expect(pi().showGridLine()).toBe(false);
    // Inherit (0) behaves as checked in the ribbon, so the first click hides.
    applyBuiltin(d, 'pageLayoutPrintHeadings');
    expect(pi().showRowHeader()).toBe(1);
    expect(pi().showColumnHeader()).toBe(1);
    applyBuiltin(d, 'pageLayoutPrintHeadings');
    expect(pi().showRowHeader()).toBe(2);
    expect(sheet.isPrintLineVisible()).toBe(false);
    applyBuiltin(d, 'printLineVisible');
    expect(sheet.isPrintLineVisible()).toBe(true);
  });

  it('Background Repeat / Over Content toggle the sheet background options', () => {
    // Without a background the toggles are no-ops (the trial disables them too).
    applyBuiltin(d, 'worksheetBackgroundRepeat');
    applyBuiltin(d, 'worksheetBackgroundOverContent');
    sheet.backgroundImage('data:image/png;base64,AAAA', {});
    applyBuiltin(d, 'worksheetBackgroundRepeat');
    expect(sheet.getBackgroundImageInfo().option.layout).toBe('repeat');
    applyBuiltin(d, 'worksheetBackgroundRepeat');
    expect(sheet.getBackgroundImageInfo().option.layout).toBe('none');
    applyBuiltin(d, 'worksheetBackgroundOverContent');
    expect(sheet.getBackgroundImageInfo().option.paintOrder).toBe('over-content');
    expect(sheet.backgroundImage()).toBe('data:image/png;base64,AAAA');
  });

  it('Breaks menu inserts, removes and resets manual page breaks', () => {
    sheet.setSelection(2, 3, 1, 1);
    applyBuiltin(d, 'insertPageBreak');
    expect(sheet.getRowPageBreak(2)).toBe(true);
    expect(sheet.getColumnPageBreak(3)).toBe(true);
    // The trial leaves the print lines off; they show only via the PrintLineVisible checkbox.
    expect(sheet.isPrintLineVisible()).toBe(false);
    applyBuiltin(d, 'printLineVisible');
    expect(sheet.isPrintLineVisible()).toBe(true);
    expect(commandEnabled(d, 'removePageBreak')).toBe(true);
    expect(commandEnabled(d, 'resetAllPageBreaks')).toBe(true);
    applyBuiltin(d, 'removePageBreak');
    expect(sheet.getRowPageBreak(2)).toBe(false);
    expect(sheet.getColumnPageBreak(3)).toBe(false);
    sheet.setRowPageBreak(5, true);
    sheet.setColumnPageBreak(7, true);
    applyBuiltin(d, 'resetAllPageBreaks');
    expect(sheet.getRowPageBreak(5)).toBe(false);
    expect(sheet.getColumnPageBreak(7)).toBe(false);
    expect(commandEnabled(d, 'resetAllPageBreaks')).toBe(false);
    // At the origin there is nothing to break before (the trial disables Insert).
    sheet.setSelection(0, 0, 1, 1);
    expect(commandEnabled(d, 'insertPageBreak')).toBe(false);
  });

  it('printInfo changes round-trip through the undo snapshot (toJSON/fromJSON)', () => {
    applyBuiltin(d, 'orientationLandscape');
    applyBuiltin(d, 'marginWide');
    const json = JSON.parse(JSON.stringify(sheet.toJSON()));
    expect(json.printInfo).toBeTruthy();
    applyBuiltin(d, 'orientationPortrait');
    sheet.fromJSON(json);
    expect(sheet.printInfo().orientation()).toBe(2);
    expect(sheet.printInfo().margin().top).toBe(100);
  });
});

describe('Page Setup dialog draft reaches the model', () => {
  let d: any, sheet: any;
  beforeEach(() => {
    ({ d, sheet } = makeDesigner());
  });

  it('Print Titles writes repeat row/column bounds into printInfo', () => {
    applyPageSetupDraft(sheet, {
      ...pageSetupDraft(sheet),
      printArea: '$B$2:$D$4',
      repeatRows: '$1:$2',
      repeatColumns: '$A:$C',
    });
    const pi = sheet.printInfo();
    expect([pi.repeatRowStart(), pi.repeatRowEnd()]).toEqual([0, 1]);
    expect([pi.repeatColumnStart(), pi.repeatColumnEnd()]).toEqual([0, 2]);
    const back = pageSetupDraft(sheet);
    expect(back.repeatRows).toBe('$1:$2');
    expect(back.repeatColumns).toBe('$A:$C');
    expect(back.printArea).toBe('$B$2:$D$4');
  });

  it('showPageSetup submits the edited draft back into printInfo', () => {
    d.showDialog = (name: string, data: any, callback: any) => {
      expect(name).toBe('pageSetupDialog');
      callback({ ...data, draft: { ...data.draft, orientation: 2, repeatRows: '$2:$3', printGridlines: true } });
    };
    Designer.prototype.showPageSetup.call(d, 'print');
    const pi = sheet.printInfo();
    expect(pi.orientation()).toBe(2);
    expect([pi.repeatRowStart(), pi.repeatRowEnd()]).toEqual([1, 2]);
    expect(pi.showGridLine()).toBe(true);
  });
});

describe('Theme galleries apply through the public theme API', () => {
  let d: any, sheet: any, workbook: any;
  beforeEach(() => {
    ({ d, sheet, workbook } = makeDesigner());
    workbook.addSheet(1);
  });

  it('Themes applies the whole named theme like the trial (colours and fonts)', () => {
    d.applyWorkbookTheme('Civic');
    for (const candidate of workbook.sheets) {
      const theme = candidate.currentTheme();
      expect(theme.name()).toBe('Civic');
      expect(theme.colors().name()).toBe('Civic');
      expect(theme.font().name()).toBe('Georgia'); // Civic's own font scheme
    }
    // The sheet JSON keeps the plain built-in name, not a custom record.
    expect(sheet.toJSON().theme).toBe('Civic');
    // Cells referencing theme colours now resolve through the new palette.
    expect(sheet._themePalette()['accent 1']).toBe(sheet.currentTheme().colors().getColor('Accent 1'));
  });

  it('Colors replaces the colour scheme and keeps the current font scheme', () => {
    d.applyWorkbookTheme('Civic');
    d.applyThemeColors('Aspect');
    const theme = sheet.currentTheme();
    expect(theme.name()).toBe('custom-theme');
    expect(theme.colors().name()).toBe('Aspect');
    // The shared built-in scheme instances are never mutated.
    expect((GC as any).Spread.Sheets.ThemeColors.Aspect).toBeTruthy();
    // The Colours gallery patches colours only: the theme's font scheme stays.
    expect(theme.font().name()).toBe('Georgia');
  });

  it('Fonts replaces the font scheme on every sheet', () => {
    d.applyThemeFonts('Office');
    for (const candidate of workbook.sheets) {
      const theme = candidate.currentTheme();
      expect(theme.name()).toBe('custom-theme');
      expect(theme.font().name()).toBe('Office');
    }
  });
});

describe('Print button', () => {
  it('Designer.print delegates to the workbook print pipeline', () => {
    const { d, workbook } = makeDesigner();
    let called = 0;
    Object.defineProperty(workbook, 'print', { value: () => { called++; }, configurable: true });
    d.print();
    expect(called).toBe(1);
  });
});
