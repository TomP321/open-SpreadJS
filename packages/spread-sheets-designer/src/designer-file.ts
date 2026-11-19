/* File operations of the Designer (Backstage ▸ New / Open / Save / Save a
 * copy): all of them work on the active workbook through the public model and
 * fire the `FileLoading` / `FileLoaded` designer events. The class methods are
 * thin wrappers around these functions. */
import type { DesignerApi as Designer } from './designer-api.js';
import type GC from '@mescius/spread-sheets';
import { emitDesignerEvent } from './designer-registry.js';

export function newWorkbook(d: Designer): void {
  const wb = d.getWorkbook();
  while (wb.getSheetCount() > 1) wb.removeSheet(wb.getSheetCount() - 1);
  if (wb.getSheetCount() === 0) wb.setSheetCount(1);
  const sheet = wb.getSheet(0);
  // 0xff: the core's "every stored kind" clear mask (the enum lists single bits; the mask combines them).
  sheet.clear(0, 0, sheet.getRowCount(), sheet.getColumnCount(), 3 as GC.Spread.Sheets.SheetArea, 255 as GC.Spread.Sheets.StorageType);
  sheet.setActiveCell(0, 0);
  d.fileMenuOpen = false;
  d.invalidate();
  emitDesignerEvent('FileLoaded', { designer: d, fileName: 'New Workbook' });
}
export async function openFile(d: Designer, file?: File): Promise<void> {
  if (!file) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ssjson,.sjs,.json,application/json';
    input.onchange = () => { const chosen = input.files?.[0]; if (chosen) void openFile(d, chosen); };
    input.click();
    return;
  }
  emitDesignerEvent('FileLoading', { designer: d, fileName: file.name });
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    await d.getWorkbook().fromJSON(json);
    d.fileMenuOpen = false;
    d.invalidate();
    emitDesignerEvent('FileLoaded', { designer: d, fileName: file.name });
  } catch (error) {
    emitDesignerEvent('FileLoaded', { designer: d, fileName: file.name, error });
    d.showMessageBox(`Cannot open the specified file.\n${String((error as Error)?.message ?? error)}`, 'Open', 3);
  }
}
export function saveFile(d: Designer, asNew = false): void {
  const json = JSON.stringify(d.getWorkbook().toJSON(), null, 2);
  const name = `workbook${asNew ? '-copy' : ''}.ssjson`;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  d.fileMenuOpen = false;
  d.invalidate();
  emitDesignerEvent('FileLoaded', { designer: d, fileName: name });
}
