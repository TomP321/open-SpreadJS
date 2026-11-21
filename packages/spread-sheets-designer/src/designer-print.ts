/* Print / Page Layout / theme glue of the Designer: the print entry, the
 * trial-parity seeding of printInfo defaults, the Themes/Colors/Fonts
 * galleries and the Page Setup / Custom Header-Footer dialog openers.
 * The class methods are thin wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import { printInfoOf, recordView, workbookInternals } from './core-internals.js';
import type { Worksheet } from './core-internals.js';
import { applyPageSetupDraft, pageSetupDraft, type PageSetupDraft } from './page-setup.js';
import { activeSheet } from './commands/actions.js';

/** The trial's Page Layout tab seeds the print header/heading visibility and
 *  the first page number into printInfo the first time the tab is shown, and
 *  those values then appear in the saved JSON. Reproduced for parity. */
export function syncPageLayoutDefaults(d: Designer, sheet: Worksheet): void {
  if (d._pageSetupSynced.has(sheet)) return;
  d._pageSetupSynced.add(sheet);
  const pi = printInfoOf(sheet);
  if (pi.showRowHeader() === 0) pi.showRowHeader(sheet.options.rowHeaderVisible === false ? 1 : 2);
  if (pi.showColumnHeader() === 0) pi.showColumnHeader(sheet.options.colHeaderVisible === false ? 1 : 2);
  pi.firstPageNumber(pi.firstPageNumber());
}
/** Opens the Themes / Colors / Fonts gallery anchored at its ribbon button. */
export function openThemeMenu(d: Designer, command: string): void {
  const control = d.host.querySelector(`[data-command="ribbon.${command}"]`) as HTMLElement | null;
  const rect = control?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
  d._menuOwner = control;
  // Trial toggle (TASK 60 item 1): a press on the control that owns the open gallery dismisses it.
  if (d._menuToggleClosedByPress) { d._menuToggleClosedByPress = false; return; }
  d.openMenu = { command, anchor: rect, level: 0, nonce: Date.now() + Math.random() };
  d.invalidate();
}
/**
 * Themes gallery: the trial applies the whole named built-in theme (its
 * colour *and* font scheme) through `sheet.currentTheme(name)`; the sheet
 * JSON then keeps the plain built-in name instead of a custom record.
 */
export function applyWorkbookTheme(d: Designer, name: string): void {
  const themes = recordView(d.gc.Spread.Sheets.Themes);
  if (!themes[name]) return;
  for (const sheet of d.getWorkbook().sheets) sheet.currentTheme(name);
  d.invalidate();
}
/** Colors gallery: replaces the colour scheme of every sheet's theme. */
export function applyThemeColors(d: Designer, name: string): void {
  const schemes = recordView(d.gc.Spread.Sheets.ThemeColors);
  const scheme = schemes[name] as { clone(): unknown } | undefined;
  if (scheme) patchThemeSheets(d, 'colors', scheme);
}
/** Fonts gallery: replaces the font scheme of every sheet's theme. */
export function applyThemeFonts(d: Designer, name: string): void {
  const fonts = recordView(d.gc.Spread.Sheets.ThemeFonts);
  const font = fonts[name] as { clone(): unknown } | undefined;
  if (font) patchThemeSheets(d, 'font', font);
}
function patchThemeSheets(d: Designer, part: 'colors' | 'font', scheme: { clone(): unknown }): void {
  for (const sheet of d.getWorkbook().sheets) {
    // Clone so the shared built-in instances are never mutated.
    const theme = sheet.currentTheme().clone();
    if (part === 'colors') theme.colors(scheme.clone());
    else theme.font(scheme.clone());
    theme.name('custom-theme');
    sheet.currentTheme(theme);
  }
  d.invalidate();
}
/** Print button / File > Print: run the core workbook print pipeline. */
export function printDesigner(d: Designer): void {
  const workbook = workbookInternals(d.getWorkbook());
  if (typeof workbook.print === 'function') workbook.print();
  else d.showMessageBox('Printing is not available in this build.', 'Print', 3);
}
export function showPageSetup(d: Designer, initialTab: 'page' | 'margins' | 'header' | 'print' = 'page'): void {
  const sheet = activeSheet(d);
  const draft = pageSetupDraft(sheet);
  d.showDialog('pageSetupDialog', { draft, kind: initialTab }, (data) => {
    // Trial (TASK 75 sweep): the seeding of the header-visibility/first-page defaults
    // happens when the dialog commits, not while it is open.
    syncPageLayoutDefaults(d, sheet);
    applyPageSetupDraft(sheet, (data.draft as PageSetupDraft) ?? draft);
    d.invalidate();
  });
  if (d.dialog) d.dialog.initialTab = initialTab;
}
export function showCustomHeaderFooter(d: Designer, kind: 'header' | 'footer', current: Record<string, string>, done: (values: Record<string, string>) => void): void {
  d.showDialog(kind === 'header' ? 'customHeaderDialog' : 'customFooterDialog', { ...current }, (data) => {
    done({ left: String(data.left ?? ''), center: String(data.center ?? ''), right: String(data.right ?? '') });
  });
}
