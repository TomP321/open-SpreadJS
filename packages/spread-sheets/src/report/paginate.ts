type Row = Record<string, unknown>;

/**
 * Page packing of a paginated preview (TASK 48, trial probes `report-pgcheck2..6` and
 * `gb1..gb7` in `report-residuals-probe`): records always pack strictly in data order,
 * `rowCountPerPage` per page. Groups never force a boundary - a group bigger than a page is
 * split across pages (with its header repeated as the continuation block's own header) and a
 * group boundary that falls on a full page is only a boundary because the page is full.
 * `paginateBeforeRow` on a grouping cell showed no effect on the packing in any trial probe;
 * the first-group title repeat is handled in `ReportSheet.renderPage`.
 */
export type PageSegment = { records: Row[]; start: number };

export function chunkRecords(records: Row[], perPage: number): PageSegment[] {
  const segments: PageSegment[] = [];
  for (let start = 0; start < records.length; start += perPage)
    segments.push({ records: records.slice(start, Math.min(records.length, start + perPage)), start });
  return segments.length ? segments : [{ records: [], start: 0 }];
}
