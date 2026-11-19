/**
 * Which sheet chrome (row/column headers, cell gridlines) the current sheet displays.
 *
 * TASK 53 measured on the official trial (`.probe/t53/probe-report-geometry.json`,
 * `.probe/t53/report-mode-<Design|Preview|PaginatedPreview>-<official|ours>.png`):
 * a `ReportSheet` shows headers and cell gridlines only in `Design` mode. In `Preview` and
 * `PaginatedPreview` the trial paints the report cells into the whole viewport — no header band,
 * no corner box, no gridlines — which is where our 8.1% report-sweep pixel diff came from (we drew
 * a normal worksheet grid on top of the report).
 */
import type { Worksheet } from './worksheet.js';

export type SheetChrome = { headers: boolean; gridlines: boolean };

const FULL: SheetChrome = { headers: true, gridlines: true };

/** `ReportSheet.renderMode()` of the sheet, `undefined` for sheets that are not reports. */
function reportMode(sheet: Worksheet): string | undefined {
  const report = sheet as Worksheet & { _isReportSheet?: boolean; renderMode?: () => string };
  if (!report._isReportSheet || typeof report.renderMode !== 'function') return undefined;
  try {
    return report.renderMode();
  } catch {
    return undefined;
  }
}

export function sheetChrome(sheet: Worksheet): SheetChrome {
  const mode = reportMode(sheet);
  if (mode === undefined) return FULL;
  const design = mode === 'Design';
  return { headers: design, gridlines: design };
}
