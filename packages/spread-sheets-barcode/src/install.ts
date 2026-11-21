/**
 * Registration shim shared by the three distributions (ESM, CJS, script-tag UMD).
 *
 * All of the barcode machinery (encoders, cell values, painters, the `BC_*` calc functions)
 * lives in the core; the add-in contract is only "find the core, tell it to expose `BC_*`".
 * The core publishes that handshake as the non-enumerable `_registerBarcodeFunctions` hook
 * on `GC.Spread.Sheets` (not part of the declared public surface — TASK 73).
 */

/** The core's hidden barcode hook, as seen from outside the core's own bundle. */
interface BarcodeCoreView {
  Spread?: { Sheets?: { _registerBarcodeFunctions?: () => void } };
}

/**
 * Registers the `BC_*` formula layer on `gc`. Returns `true` when the layer was registered
 * (or already was — the core's registration is idempotent), `false` when `gc` is not an
 * OpenSheets core. Never throws on a missing foreign core: an add-on must not break the host
 * page; it warns, exactly like the other unmet-host cases in this workspace.
 */
export function install(gc: unknown): boolean {
  const register = (gc as BarcodeCoreView | null | undefined)?.Spread?.Sheets?._registerBarcodeFunctions;
  if (typeof register !== 'function') {
    console.warn('[opensheets/spread-sheets-barcode] no OpenSheets core found (GC.Spread.Sheets._registerBarcodeFunctions is missing); install the @opensheets core under the @mescius/spread-sheets name, load the barcode add-in after it, and BC_* formulas will evaluate.');
    return false;
  }
  register();
  return true;
}
