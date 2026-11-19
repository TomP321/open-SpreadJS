/*
 * `Workbook.savePDF` (Task 16): vector PDF export of the print pages.
 *
 * The pages come from the same `collectPrintPages` pagination the browser print
 * path uses and every page is painted by the same `paintPrintPage` code; the
 * only difference is the target, a `PdfCanvasContext` instead of a real 2D
 * canvas, so the PDF is the print preview in vector form.
 */
import type { Workbook } from '../workbook.js';
import type { Worksheet } from '../worksheet.js';
import {
  collectPrintImages,
  collectPrintPages,
  loadPrintImages,
  paintPrintPage,
} from '../print-doc.js';
import { PdfCanvasContext, PdfResourcePool, createPdfReport, PX_TO_PT, type PdfReport } from './pdf-context.js';
import {
  PdfArray,
  PdfDict,
  PdfName,
  PdfRef,
  PdfTextString,
  PdfWriter,
  pdfDate,
  pdfDocumentId,
} from './pdf-writer.js';

/** Metadata written into the PDF `/Info` dictionary. */
export interface SavePdfOptions {
  creator?: string;
  title?: string;
  author?: string;
  keywords?: string;
  subject?: string;
  /** Override the `D:` timestamps, for deterministic output in tests. */
  createdAt?: Date;
}

export interface PdfError {
  errorCode: number;
  errorMessage: string;
}

/**
 * Error codes handed to `savePDF`'s `errorCallback`. The official signature
 * documents the `{ errorCode, errorMessage }` shape but no enumeration of
 * values (the reference plugin is not part of the core package), so these
 * codes are ours and follow the validation the browser print path already does.
 */
export const PdfErrorCode = {
  /** The selection produced no printable page (hidden sheet or empty range). */
  emptyDocument: 1,
  /** `sheetIndex` is not an integer inside the sheet collection. */
  invalidSheetIndex: 2,
  /** Unexpected failure while collecting or painting the pages. */
  exportFailed: 3,
} as const;

export class PdfExportError extends Error {
  constructor(readonly errorCode: number, message: string) {
    super(message);
    this.name = 'PdfExportError';
  }
}

export interface PdfExportResult {
  bytes: Uint8Array;
  /** Number of PDF pages, equal to the number of print pages. */
  pages: number;
  report: PdfReport;
}

/** Sheet indices `savePDF` exports: every visible sheet, or the given index. */
export function resolvePdfSheetIndexes(workbook: Workbook, sheetIndex?: number): number[] {
  if (sheetIndex === undefined || sheetIndex === null) {
    return workbook.sheets
      .map((_, index) => index)
      .filter((index) => (workbook.getSheet(index) as Worksheet).visible() !== 0);
  }
  if (!Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= workbook.getSheetCount()) {
    throw new PdfExportError(PdfErrorCode.invalidSheetIndex, 'Invalid  sheet index.');
  }
  return [sheetIndex];
}

function infoDictionary(options: SavePdfOptions, created: Date, report: PdfReport): PdfDict {
  const dict = new PdfDict();
  // `/Info` strings are written in PDFDocEncoding-compatible WinAnsi too; a
  // character outside it is replaced by `?` and recorded like page text.
  const missing: number[] = [];
  const add = (key: string, value: string | undefined): void => {
    if (value === undefined || value === '') return;
    dict.set(key, new PdfTextString(value, missing));
  };
  add('Title', options.title);
  add('Author', options.author);
  add('Subject', options.subject);
  add('Keywords', options.keywords);
  add('Creator', options.creator ?? 'OpenSheets');
  add('Producer', 'OpenSheets PDF writer');
  const stamp = pdfDate(created);
  dict.set('CreationDate', new PdfTextString(stamp));
  dict.set('ModDate', new PdfTextString(stamp));
  for (const code of missing) report.missingChars.add(code);
  return dict;
}

/** Build the PDF of the workbook's print pages. */
export async function exportWorkbookPdf(
  workbook: Workbook,
  options: SavePdfOptions = {},
  sheetIndex?: number,
): Promise<PdfExportResult> {
  const indexes = resolvePdfSheetIndexes(workbook, sheetIndex);
  const runs = collectPrintPages(workbook, indexes);
  const total = runs.reduce((sum, run) => sum + run.pages.length, 0);
  if (!total) throw new PdfExportError(PdfErrorCode.emptyDocument, 'There is no page to export.');
  const sources = [...new Set(runs.flatMap((run) => collectPrintImages(run.sheet)))];
  const images = await loadPrintImages(sources);
  const writer = new PdfWriter();
  const pool = new PdfResourcePool(writer);
  const report = createPdfReport();
  const contexts: PdfCanvasContext[] = [];
  const pageDicts: PdfDict[] = [];
  for (const run of runs) {
    const sheet = run.sheet;
    for (const page of run.pages) {
      const context = new PdfCanvasContext({ width: page.paperSize.width, height: page.paperSize.height, pool, report });
      paintPrintPage(context, sheet, page, images, run.pages.length);
      contexts.push(context);
      pageDicts.push(new PdfDict()
        .set('Type', new PdfName('Page'))
        .set('MediaBox', [0, 0, page.paperSize.width * PX_TO_PT, page.paperSize.height * PX_TO_PT])
        .set('Contents', new PdfRef(context.contentObject)));
    }
  }
  for (const context of contexts) await context.finish();
  await pool.flush();

  const pagesObject = writer.reserve();
  const kids: PdfRef[] = [];
  for (const page of pageDicts) {
    page.set('Parent', new PdfRef(pagesObject));
    kids.push(new PdfRef(writer.addObject(page)));
  }
  writer.setObject(pagesObject, new PdfDict()
    .set('Type', new PdfName('Pages'))
    .set('Kids', new PdfArray(kids))
    .set('Count', pageDicts.length));
  const resources = new PdfRef(writer.addObject(pool.resources()));
  for (const page of pageDicts) page.set('Resources', resources);
  const root = new PdfDict()
    .set('Type', new PdfName('Catalog'))
    .set('Pages', new PdfRef(pagesObject));
  const bytes = writer.build(root, infoDictionary(options, options.createdAt ?? new Date(), report),
    pdfDocumentId(`${pageDicts.length}:${String(options.title ?? '')}`));
  return { bytes, pages: pageDicts.length, report };
}

/**
 * Summarise the approximations of an export for the developer console. Never
 * throws and never blocks: unsupported drawing calls are counted, not fatal,
 * because a partial PDF is more useful than none.
 */
export function warnPdfReport(report: PdfReport, pages: number): void {
  const counts = Object.entries(report.counts).filter(([, value]) => value > 0);
  if (!counts.length && !report.missingChars.size) return;
  const parts = counts.map(([key, value]) => `${key} x${value}`);
  if (report.missingChars.size) parts.push(`${report.missingChars.size} non-WinAnsi character(s) drawn as "?"`);
  console.warn(`OpenSheets savePDF: approximated ${parts.join(', ')} on ${pages} page(s).`);
}

/** Public `Workbook.savePDF` implementation: reports through callbacks only. */
export function saveWorkbookPdf(
  workbook: Workbook,
  successCallback?: (blob: Blob) => void,
  errorCallback?: (error: PdfError) => void,
  options?: SavePdfOptions,
  sheetIndex?: number,
): void {
  void exportWorkbookPdf(workbook, options ?? {}, sheetIndex).then(
    (result) => {
      warnPdfReport(result.report, result.pages);
      // Runtimes without a `Blob` constructor still receive the raw bytes.
      const payload: Blob | Uint8Array = typeof Blob === 'function'
        ? new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
        : result.bytes;
      try {
        successCallback?.(payload as Blob);
      } catch (error) {
        console.warn(`OpenSheets savePDF: successCallback threw: ${String(error)}`);
      }
    },
    (error: unknown) => {
      const code = error instanceof PdfExportError ? error.errorCode : PdfErrorCode.exportFailed;
      const message = error instanceof Error ? error.message : String(error);
      if (typeof errorCallback === 'function') {
        try {
          errorCallback({ errorCode: code, errorMessage: message });
        } catch (callbackError) {
          console.warn(`OpenSheets savePDF: errorCallback threw: ${String(callbackError)}`);
        }
      } else {
        console.warn(`OpenSheets savePDF failed (errorCode ${code}): ${message}`);
      }
    },
  );
}
