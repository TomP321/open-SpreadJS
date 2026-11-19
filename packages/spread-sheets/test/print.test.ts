// @vitest-environment jsdom
/* Unit tests for the printing model: PaperSize, PrintInfo, page splitting,
 * background images, page breaks and the print document builder. Default and
 * paper-size values were verified against the trial through its public API. */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import GC from '../src/index.js';
import type { Worksheet } from '../src/model.js';
import { PaperSize, PrintInfo, parsePageRange, expandHeaderFooter } from '../src/print.js';
import { printWorkbookAsync, collectPrintPages } from '../src/print-doc.js';

const { Workbook, Worksheet: WorksheetClass } = GC.Spread.Sheets;
const Print = GC.Spread.Sheets.Print;

/** Records nothing but keeps the painting code exercised. */
function installCanvas(): void {
  const noop = () => undefined;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    return new Proxy({}, {
      get: (_t, key: string) => {
        if (key === 'canvas') return this;
        if (key === 'measureText') return () => ({ width: 8 });
        if (key === 'createPattern') return () => ({});
        if (key === 'getTransform') return () => ({ a: 1, d: 1 });
        return noop;
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
}

beforeAll(installCanvas);

function sheetWith(rows: unknown[][]): Worksheet {
  const wb = new Workbook();
  const sheet = wb.getSheet(0) as Worksheet;
  sheet.setArray(0, 0, rows);
  return sheet;
}
function book(sheet: Worksheet): InstanceType<typeof Workbook> {
  return (sheet as unknown as { parent: InstanceType<typeof Workbook> }).parent;
}

describe('PaperSize', () => {
  it('defaults to Letter with the culture sizes', () => {
    const size = new PaperSize();
    expect(size.kind()).toBe(Print.PaperKind.letter);
    expect(size.width()).toBe(850);
    expect(size.height()).toBe(1100);
  });
  it('expands kinds and honours custom (w, h) construction', () => {
    const a4 = new PaperSize(Print.PaperKind.a4);
    expect(a4.kind()).toBe(9);
    expect(a4.width()).toBeCloseTo(826.7716535433073, 6);
    expect(a4.height()).toBeCloseTo(1169.2913385826773, 6);
    const custom = new PaperSize(300, 400);
    expect(custom.kind()).toBe(Print.PaperKind.custom);
    expect([custom.width(), custom.height()]).toEqual([300, 400]);
  });
  it('getPageSize returns the table sizes', () => {
    const size = new PaperSize();
    expect(size.getPageSize(Print.PaperKind.tabloid)).toEqual({ width: 1100, height: 1700 });
    expect(size.getPageSize(Print.PaperKind.a3).width).toBeCloseTo(1169.2913385826773, 6);
    expect(size.getPageSize(Print.PaperKind.custom)).toEqual({ width: 0, height: 0 });
  });
  it('kind() re-expands dimensions; width()/height() override them', () => {
    const size = new PaperSize();
    size.kind(Print.PaperKind.legal);
    expect([size.width(), size.height()]).toEqual([850, 1400]);
    size.width(500);
    expect(size.width()).toBe(500);
  });
});

describe('PrintInfo accessors', () => {
  it('matches the trial defaults', () => {
    const pi = new PrintInfo();
    expect([pi.bestFitColumns(), pi.bestFitRows(), pi.blackAndWhite()]).toEqual([false, false, false]);
    expect(pi.centering()).toBe(0);
    expect(pi.columnEnd()).toBe(-1);
    expect(pi.columnStart()).toBe(-1);
    expect([pi.differentFirstPage(), pi.differentOddAndEvenPages()]).toEqual([false, false]);
    expect(pi.firstPageNumber()).toBe(1);
    expect([pi.fitPagesTall(), pi.fitPagesWide()]).toEqual([-1, -1]);
    expect(pi.orientation()).toBe(Print.PrintPageOrientation.portrait);
    expect(pi.pageOrder()).toBe(0);
    expect(pi.pageRange()).toBe('');
    expect(pi.qualityFactor()).toBe(2);
    expect([pi.repeatColumnEnd(), pi.repeatColumnStart(), pi.repeatRowEnd(), pi.repeatRowStart()]).toEqual([-1, -1, -1, -1]);
    expect([pi.rowEnd(), pi.rowStart()]).toEqual([-1, -1]);
    expect(pi.showBorder()).toBe(true);
    expect([pi.showColumnHeader(), pi.showGridLine(), pi.showRowHeader()]).toEqual([0, false, 0]);
    expect(pi.useMax()).toBe(true);
    expect(pi.zoomFactor()).toBe(1);
    expect(pi.watermark()).toEqual([]);
    expect(pi.margin()).toEqual({ top: 75, bottom: 75, left: 70, right: 70, header: 30, footer: 30 });
    expect(pi.paperSize().kind()).toBe(Print.PaperKind.letter);
    expect(Object.keys(pi.pageHeaderFooter())).toEqual(['normal']);
  });
  it('setters chain and store values', () => {
    const pi = new PrintInfo();
    expect(pi.orientation(Print.PrintPageOrientation.landscape)).toBe(pi);
    expect(pi.orientation()).toBe(2);
    pi.margin({ top: 10 });
    // Verified against the trial: the getter returns exactly the object last
    // assigned (partial assignments replace, they do not merge).
    expect(pi.margin()).toEqual({ top: 10 });
    pi.pageHeaderFooter({ normal: { header: { center: '&P' }, footer: {} } });
    expect(pi.pageHeaderFooter().normal?.header?.center).toBe('&P');
    expect(pi.pageHeaderFooter().normal?.header?.left).toBe('');
    pi.watermark([{ x: 1, y: 2, width: 3, height: 4, imageSrc: 'i', page: 'odd' }]);
    expect(pi.watermark()[0].page).toBe('odd');
  });
  it('serialises the paper size plus explicitly assigned fields', () => {
    const pi = new PrintInfo();
    expect(pi._toJSON()).toEqual({ paperSize: { width: 850, height: 1100, kind: 1 } });
    pi.orientation(2).firstPageNumber(1);
    const json = pi._toJSON();
    expect(json.orientation).toBe(2);
    // Assignment marks the field dirty even when it equals the default.
    expect(json.firstPageNumber).toBe(1);
    expect(json.margin).toBeUndefined();
    pi.margin({ top: 75 });
    expect((pi._toJSON().margin as Record<string, unknown>).top).toBe(75);
  });
  it('round-trips through _fromJSON', () => {
    const pi = new PrintInfo();
    pi._fromJSON({ orientation: 2, fitPagesWide: 2, margin: { top: 5 }, paperSize: { width: 100, height: 200, kind: 0 } });
    expect(pi.orientation()).toBe(2);
    expect(pi.fitPagesWide()).toBe(2);
    expect(pi.margin().top).toBe(5);
    expect(pi.margin().left).toBe(70);
    expect(pi.paperSize()._toJSON()).toEqual({ width: 100, height: 200, kind: 0 });
  });
});

describe('worksheet printInfo binding', () => {
  it('is lazy: a fresh sheet JSON has no printInfo', () => {
    const sheet = sheetWith([['a']]);
    expect(sheet.toJSON().printInfo).toBeUndefined();
  });
  it('backs the print-area range with the Print_Area defined name', () => {
    const sheet = sheetWith([['a']]);
    const pi = sheet.printInfo();
    pi.rowStart(1);
    pi.columnStart(1);
    pi.rowEnd(3);
    pi.columnEnd(3);
    expect([pi.rowStart(), pi.rowEnd(), pi.columnStart(), pi.columnEnd()]).toEqual([1, 3, 1, 3]);
    const name = sheet.getCustomName('Print_Area');
    expect(String(name.getExpression())).toBe('Sheet1!$B$2:$D$4');
    const json = sheet.toJSON();
    expect(json.names).toEqual([{ name: 'Print_Area', formula: 'Sheet1!$B$2:$D$4', row: 0, col: 0, isReadOnly: false }]);
    // The range itself is not duplicated inside printInfo.
    expect((json.printInfo as Record<string, unknown>).rowStart).toBeUndefined();
    // Negative values clear the print area.
    pi.rowStart(-1);
    expect(sheet.toJSON().names).toBeUndefined();
    expect(pi.rowStart()).toBe(-1);
  });
  it('persists printInfo and restores it through fromJSON', () => {
    const sheet = sheetWith([['a']]);
    sheet.printInfo().orientation(2).fitPagesWide(2).qualityFactor(4);
    const json = sheet.toJSON();
    expect((json.printInfo as Record<string, unknown>).orientation).toBe(2);
    const other = new WorksheetClass();
    other.fromJSON(json);
    expect(other.printInfo().orientation()).toBe(2);
    expect(other.printInfo().fitPagesWide()).toBe(2);
    expect(other.printInfo().qualityFactor()).toBe(4);
  });
  it('replaces all settings when a PrintInfo is assigned', () => {
    const sheet = sheetWith([['a']]);
    const incoming = new PrintInfo();
    incoming.orientation(2).margin({ top: 100, bottom: 100, left: 100, right: 100, header: 50, footer: 50 });
    sheet.printInfo(incoming);
    expect(sheet.printInfo().orientation()).toBe(2);
    expect(sheet.printInfo().margin().left).toBe(100);
    // Replacing keeps the sheet-scoped print area separate.
    expect(sheet.toJSON().names).toBeUndefined();
  });
});

describe('page breaks, print line and background', () => {
  it('persists manual page breaks on the rows/columns arrays', () => {
    const sheet = sheetWith([['a']]);
    sheet.setRowPageBreak(2, true);
    sheet.setColumnPageBreak(1, true);
    expect(sheet.getRowPageBreak(2)).toBe(true);
    expect(sheet.getColumnPageBreak(1)).toBe(true);
    const json = sheet.toJSON();
    const rows = json.rows as Record<string, unknown>[];
    const columns = json.columns as Record<string, unknown>[];
    expect(rows[2].pageBreak).toBe(true);
    expect(columns[1].pageBreak).toBe(true);
    const other = new WorksheetClass();
    other.fromJSON(json);
    expect(other.getRowPageBreak(2)).toBe(true);
    expect(other.getColumnPageBreak(1)).toBe(true);
    sheet.setRowPageBreak(2, false);
    expect(sheet.getRowPageBreak(2)).toBe(false);
  });
  it('isPrintLineVisible toggles and persists', () => {
    const sheet = sheetWith([['a']]);
    expect(sheet.isPrintLineVisible()).toBe(false);
    sheet.isPrintLineVisible(true);
    expect(sheet.isPrintLineVisible()).toBe(true);
    expect(sheet.toJSON().printLineVisible).toBe(true);
    const other = new WorksheetClass();
    other.fromJSON(sheet.toJSON());
    expect(other.isPrintLineVisible()).toBe(true);
  });
  it('honours the sheet option printLineVisible', () => {
    const sheet = sheetWith([['a']]);
    sheet.options.printLineVisible = true;
    expect(sheet.isPrintLineVisible()).toBe(true);
    expect(sheet.toJSON().printLineVisible).toBe(true);
  });
  it('stores the background image with its layout options', () => {
    const sheet = sheetWith([['a']]);
    const src = 'data:image/png;base64,AAAA';
    expect(sheet.backgroundImage(src)).toBe(src);
    expect(sheet.getBackgroundImageInfo()).toEqual({ backgroundImage: src, option: {} });
    sheet.backgroundImage(src, { layout: 'repeat', paintOrder: 'over-content' });
    expect(sheet.getBackgroundImageInfo().option).toEqual({ layout: 'repeat', paintOrder: 'over-content' });
    const json = sheet.toJSON();
    expect(json.backgroundImage).toEqual({ src, layout: 'repeat', paintOrder: 'over-content' });
    const other = new WorksheetClass();
    other.fromJSON(json);
    expect(other.backgroundImage()).toBe(src);
    expect(other.getBackgroundImageInfo().option.layout).toBe('repeat');
    other.backgroundImage(null);
    expect(other.backgroundImage()).toBeNull();
    expect(other.toJSON().backgroundImage).toBeUndefined();
  });
  it('gets and sets the sheet theme name', () => {
    const sheet = sheetWith([['a']]);
    expect(sheet.currentTheme().name()).toBe('Office');
    sheet.currentTheme('Apex');
    expect(sheet.toJSON().theme).toBe('Apex');
    const other = new WorksheetClass();
    other.fromJSON(sheet.toJSON());
    expect(other.currentTheme().name()).toBe('Apex');
    expect(other._themeFonts()).toEqual(['Lucida Sans', 'Book Antiqua']);
  });
});

describe('pagination', () => {
  it('splits rows and columns of the used range onto pages', () => {
    const rows = Array.from({ length: 60 }, (_, i) => [`r${i}`]);
    const sheet = sheetWith(rows);
    for (let c = 0; c < 20; c++) sheet.setValue(0, c, `c${c}`);
    sheet.printInfo(); // touch, like the designer does
    const wb = book(sheet);
    const runs = collectPrintPages(wb, [0]);
    expect(runs).toHaveLength(1);
    const pages = runs[0].pages;
    // Letter portrait printable: 816x1056px minus 67.2/72 margins.
    const first = pages[0];
    expect(first.paperSize).toEqual({ width: 816, height: 1056 });
    expect(first.pageImageableArea.x).toBeCloseTo(67.2);
    expect(first.pageImageableArea.y).toBeCloseTo(72);
    expect(first.rowPage.headerSize).toBe(20);
    expect(first.columnPage.headerSize).toBe(40);
    expect(first.rowPage.itemStart).toBe(0);
    // 60 rows * 20px = 1200px over ~892px of page height -> at least 2 row pages.
    const rowCount = new Set(pages.map((p) => p.rowPage.itemEnd)).size;
    expect(rowCount).toBeGreaterThan(1);
    // Page numbers are contiguous starting at firstPageNumber.
    expect(pages.map((p) => p.pageNumber)).toEqual(pages.map((_, i) => i + 1));
  });
  it('respects the print area and manual page breaks', () => {
    const sheet = sheetWith(Array.from({ length: 8 }, (_, i) => [i, i]));
    const pi = sheet.printInfo();
    pi.rowStart(0);
    pi.rowEnd(7);
    pi.columnStart(0);
    pi.columnEnd(1);
    sheet.setRowPageBreak(4, true);
    const pages = collectPrintPages(book(sheet), [0])[0].pages;
    expect(pages.some((p) => p.rowPage.itemStart === 4)).toBe(true);
    expect(pages.every((p) => p.columnPage.itemEnd <= 1)).toBe(true);
  });
  it('starts numbering at firstPageNumber and honours the page range', () => {
    const sheet = sheetWith(Array.from({ length: 60 }, (_, i) => [`r${i}`, `s${i}`]));
    sheet.printInfo().firstPageNumber(7);
    let pages = collectPrintPages(book(sheet), [0])[0].pages;
    expect(pages[0].pageNumber).toBe(7);
    sheet.printInfo().firstPageNumber(1).pageRange('2');
    pages = collectPrintPages(book(sheet), [0])[0].pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].pageNumber).toBe(2);
  });
  it('scales content to fit the requested page counts', () => {
    const sheet = sheetWith(Array.from({ length: 100 }, (_, i) => Array.from({ length: 12 }, (_, c) => `${i}:${c}`)));
    sheet.printInfo().fitPagesWide(1).fitPagesTall(1);
    const pages = collectPrintPages(book(sheet), [0])[0].pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].scale).toBeLessThan(1);
  });
  it('orders pages down-then-over by default and over-then-down on request', () => {
    const sheet = sheetWith(Array.from({ length: 100 }, (_, i) => Array.from({ length: 12 }, (_, c) => `${i}:${c}`)));
    const pi = sheet.printInfo();
    let pages = collectPrintPages(book(sheet), [0])[0].pages;
    const downFirst = pages[1];
    expect(downFirst.rowPageIndexInSheet).toBe(1);
    expect(downFirst.columnPageIndexInSheet).toBe(0);
    pi.pageOrder(Print.PrintPageOrder.overThenDown);
    pages = collectPrintPages(book(sheet), [0])[0].pages;
    expect(pages[1].columnPageIndexInSheet).toBe(1);
    expect(pages[1].rowPageIndexInSheet).toBe(0);
  });
});

describe('print document', () => {
  it('renders one canvas page per printed page into a hidden iframe', async () => {
    const sheet = sheetWith(Array.from({ length: 10 }, (_, i) => [`v${i}`]));
    const wb = book(sheet);
    const count = await printWorkbookAsync(wb);
    expect(count).toBe(1);
    const frame = [...document.querySelectorAll('iframe')].pop() as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    expect(doc.querySelectorAll('div.gc-printPage')).toHaveLength(1);
    expect(doc.querySelectorAll('canvas')).toHaveLength(1);
    expect(doc.querySelector('style')!.textContent).toContain('gc-printPage');
  });
  it('marks black-and-white output with the grayscale class', async () => {
    const sheet = sheetWith([['x']]);
    sheet.printInfo().blackAndWhite(true);
    const count = await printWorkbookAsync(book(sheet));
    expect(count).toBe(1);
    const frame = [...document.querySelectorAll('iframe')].pop() as HTMLIFrameElement;
    expect(frame.contentDocument!.querySelector('.gc-printPage')!.className).toContain('grayscale');
  });
  it('rejects invalid sheet indexes like the reference', () => {
    const sheet = sheetWith([['x']]);
    const wb = book(sheet);
    expect(() => wb.print(9)).toThrow('Invalid  sheet index.');
    expect(() => wb.print('1' as unknown as number)).toThrow('Invalid  sheet index.');
  });
});

describe('helpers', () => {
  it('parses page range strings', () => {
    expect(parsePageRange('1,3,5-7', 10)).toEqual([1, 3, 5, 6, 7]);
    expect(parsePageRange('', 10)).toEqual([]);
    expect(parsePageRange('2-', 3)).toEqual([2, 3]);
  });
  it('expands header/footer codes', () => {
    const out = expandHeaderFooter('&A: page &P of &N', { sheetName: 'S', workbookName: 'W', pageNumber: 2, pageCount: 5, date: 'd', time: 't' });
    expect(out.map((s) => s.text).join('')).toBe('S: page 2 of 5');
    const styled = expandHeaderFooter('&Bbold', { sheetName: '', workbookName: '', pageNumber: 1, pageCount: 1, date: '', time: '' });
    expect(styled[0].bold).toBe(true);
    expect(styled[0].text).toBe('bold');
  });
});

void vi;
