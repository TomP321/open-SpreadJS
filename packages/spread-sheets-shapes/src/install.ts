/**
 * Host handshake shared by the three distributions (ESM, CJS, script-tag UMD).
 *
 * All of the auto-shape layer (`worksheet.shapes` and its machinery) lives in the core, so the add-in
 * contract here is only "find the core and stay harmless". Unlike the barcode add-in — whose
 * `BC_*` layer the core keeps behind the hidden `_registerBarcodeFunctions` hook — this
 * feature needs no activation, and `install` is a verified no-op. If a future core build
 * gates the feature the way it gates `BC_*`, this is the single place that would call the
 * corresponding hidden hook.
 */

/** The part of the core namespace the add-ins probe for a usable host. */
interface CoreView {
  Spread?: { Sheets?: { Workbook?: unknown } };
}

/**
 * Verifies that `gc` is an OpenSheets core (or any SpreadJS-shaped core: every feature this
 * package represents is already there, so no foreign-core special case exists). Returns
 * `true` when a core was found, `false` when the host loaded nothing — never throws: an
 * add-on must not break the host page, so a missing core produces a warning that names the
 * fix instead.
 */
export function install(gc: unknown): boolean {
  const sheets = (gc as CoreView | null | undefined)?.Spread?.Sheets;
  if (typeof sheets?.Workbook !== 'function') {
    console.warn('[opensheets/spread-sheets-shapes] no OpenSheets core found (GC.Spread.Sheets.Workbook is missing); install the @opensheets core under the @mescius/spread-sheets name, load the shapes add-in after it, and the auto-shape layer will be there.');
    return false;
  }
  return true;
}
