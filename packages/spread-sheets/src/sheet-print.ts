/**
 * Sheet presentation API of `Worksheet`: theme, print settings (printInfo,
 * print area, manual page breaks, print line) and the background image.
 * Bodies moved out of `worksheet.ts` unchanged (`this` renamed to the `sheet`
 * parameter; `return this` becomes `return sheet` and the class-side
 * delegator casts the chained result back to `this`).
 */
import { GC } from './generated/enums.js';
import { Events } from './events.js';
import { PrintInfo, PRINT_AREA_NAME, printAreaFormula } from './print.js';
import { invalidatePrintLines } from './print-doc.js';
import { Theme, themeFonts, themePalette, themeFromValue, type ThemeValue } from './themes.js';
import type { Worksheet } from './worksheet.js';

const { SheetArea } = GC.Spread.Sheets;
const VIEW = SheetArea.viewport;

/** Accepts a `PrintInfo` instance or (lenient, like the reference at runtime) a raw JSON object. */
export function printInfo(sheet: Worksheet, value?: PrintInfo | Record<string, unknown>): PrintInfo | Worksheet {
    if (sheet._printInfo === undefined) {
      sheet._printInfo = new PrintInfo(sheet);
      sheet._printInfo._onChange(() => {
        invalidatePrintLines(sheet);
        sheet.invalidateLayout();
      });
      if (sheet._printInfoJSON) {
        sheet._printInfo._fromJSON(sheet._printInfoJSON);
        sheet._printInfoJSON = undefined;
      }
    }
    if (value === undefined) return sheet._printInfo;
    const next = new PrintInfo(sheet);
    if (value instanceof PrintInfo) {
      value._copyTo(next);
      // A print area set on an unbound instance becomes sheet sheet's name.
      if (next._hasTouched('rowStart')) {
        sheet._setPrintAreaRange(
          Math.max(0, Math.min(next.rowStart() as number, next.rowEnd() as number)),
          Math.max(0, Math.min(next.columnStart() as number, next.columnEnd() as number)),
          Math.max(0, Math.max(next.rowStart() as number, next.rowEnd() as number)),
          Math.max(0, Math.max(next.columnStart() as number, next.columnEnd() as number)),
        );
      }
    } else next._fromJSON(value);
    next._onChange(() => {
      invalidatePrintLines(sheet);
      sheet.invalidateLayout();
    });
    sheet._printInfo = next;
    invalidatePrintLines(sheet);
    sheet.invalidateLayout();
    return sheet;
}

export function _setPrintAreaRange(sheet: Worksheet, row1: number, col1: number, row2: number, col2: number): void {
    sheet.addCustomName(
      PRINT_AREA_NAME,
      printAreaFormula(sheet.name(), row1, col1, row2, col2),
      0,
      0,
      undefined,
      false,
    );
    sheet.invalidateLayout();
}

export function _clearPrintAreaName(sheet: Worksheet, ): void {
    if (sheet.names.has(PRINT_AREA_NAME.toLowerCase())) {
      sheet.removeCustomName(PRINT_AREA_NAME);
      sheet.invalidateLayout();
    }
}

export function setRowPageBreak(sheet: Worksheet, row: number, value: boolean): void {
    sheet.setAxisMetadata('row', row, VIEW, 'pageBreak', !!value);
    invalidatePrintLines(sheet);
    sheet.invalidateLayout();
}

export function getRowPageBreak(sheet: Worksheet, row: number): boolean {
    return sheet.axisMetadata('row', VIEW).get(row)?.pageBreak === true;
}

export function setColumnPageBreak(sheet: Worksheet, col: number, value: boolean): void {
    sheet.setAxisMetadata('col', col, VIEW, 'pageBreak', !!value);
    invalidatePrintLines(sheet);
    sheet.invalidateLayout();
}

export function getColumnPageBreak(sheet: Worksheet, col: number): boolean {
    return sheet.axisMetadata('col', VIEW).get(col)?.pageBreak === true;
}

export function _pageBreakIndices(sheet: Worksheet, axis: 'row' | 'col'): number[] {
    const out: number[] = [];
    for (const [index, meta] of sheet.axisMetadata(axis, VIEW))
      if (meta.pageBreak === true) out.push(index);
    return out.sort((a, b) => a - b);
}

export function _manualPageBreaks(sheet: Worksheet, ): { rows: number[]; cols: number[] } {
    return { rows: sheet._pageBreakIndices('row'), cols: sheet._pageBreakIndices('col') };
}

export function isPrintLineVisible(sheet: Worksheet, value?: boolean): boolean {
    if (value === undefined) return sheet._printLineVisible || sheet.options.printLineVisible === true;
    sheet._printLineVisible = !!value;
    invalidatePrintLines(sheet);
    sheet.invalidateLayout();
    return true;
}

export function backgroundImage(sheet: Worksheet, src?: string | null, option?: { layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' }): string | null {
    if (src === undefined) return sheet._backgroundImage.src;
    if (src === null || src === '') sheet._backgroundImage = { src: null };
    else {
      const next: { src: string; layout?: 'repeat' | 'none'; paintOrder?: 'normal' | 'over-content' } = { src: String(src) };
      if (option?.layout) next.layout = option.layout === 'repeat' ? 'repeat' : 'none';
      if (option?.paintOrder) next.paintOrder = option.paintOrder === 'over-content' ? 'over-content' : 'normal';
      sheet._backgroundImage = next;
    }
    sheet.invalidateLayout();
    return sheet._backgroundImage.src;
}

export function _backgroundImageJSON(sheet: Worksheet, ): Record<string, unknown> | undefined {
    const bg = sheet._backgroundImage;
    if (!bg.src) return undefined;
    const result: Record<string, unknown> = {};
    if (bg.layout) result.layout = bg.layout;
    if (bg.paintOrder) result.paintOrder = bg.paintOrder;
    result.src = bg.src;
    return result;
}

export function getBackgroundImageInfo(sheet: Worksheet, ): { backgroundImage: string | null; option: Record<string, unknown> } {
    return {
      backgroundImage: sheet._backgroundImage.src,
      option: { ...(sheet._backgroundImage.layout ? { layout: sheet._backgroundImage.layout } : {}), ...(sheet._backgroundImage.paintOrder ? { paintOrder: sheet._backgroundImage.paintOrder } : {}) },
    };
}

export function currentTheme(sheet: Worksheet, value?: string | Theme | Record<string, unknown>): Theme | Worksheet {
    if (value === undefined) return themeFromValue(sheet.settings.theme as ThemeValue);
    sheet.settings.theme = value instanceof Theme ? value.toJSON() as ThemeValue : value as ThemeValue;
    invalidatePrintLines(sheet);
    sheet.invalidateLayout();
    return sheet;
}

export function _themeValue(sheet: Worksheet, ): ThemeValue {
    return (sheet.settings.theme as ThemeValue) ?? 'Office';
}

export function _themeFonts(sheet: Worksheet, ): [string, string] {
    return themeFonts(sheet._themeValue());
}

export function _themePalette(sheet: Worksheet, ): Record<string, string> {
    return themePalette(sheet._themeValue());
}

export function visible(sheet: Worksheet, value?: number | boolean): number | Worksheet {
    if (value === undefined) return Number(sheet.settings.visible);
    const old = sheet.settings.visible,
      next = value === true ? 1 : value === false ? 0 : value;
    const info = {
      sheetName: sheet.sheetName,
      sheetIndex: sheet.parent?.getSheetIndex(sheet.sheetName) ?? -1,
      propertyName: 'visible',
      oldValue: old,
      newValue: next,
      cancel: false,
    };
    sheet._emit(Events.SheetChanging, info);
    if (!info.cancel) {
      sheet.settings.visible = next;
      sheet.invalidateLayout();
      sheet._emit(Events.SheetChanged, info);
    }
    return sheet;
}

export function zoom(sheet: Worksheet, value?: number): number | Worksheet {
    if (value === undefined) return Number(sheet.settings.zoomFactor);
    if (value < 0.1 || value > 4 || !Number.isFinite(value))
      throw new RangeError('Zoom must be between 0.1 and 4');
    sheet.settings.zoomFactor = value;
    sheet.invalidateLayout();
    return sheet;
}

export function tabColor(sheet: Worksheet, value?: string): string | undefined | Worksheet {
    if (value === undefined) return sheet.options.sheetTabColor;
    sheet.options.sheetTabColor = value;
    sheet.batch.invalidate();
    return sheet;
}

export function showRowOutline(sheet: Worksheet, value?: boolean): boolean | Worksheet {
    if (value === undefined) return Boolean(sheet.settings.showRowOutline);
    sheet.settings.showRowOutline = value;
    return sheet;
}

export function showColumnOutline(sheet: Worksheet, value?: boolean): boolean | Worksheet {
    if (value === undefined) return Boolean(sheet.settings.showColumnOutline);
    sheet.settings.showColumnOutline = value;
    return sheet;
}
