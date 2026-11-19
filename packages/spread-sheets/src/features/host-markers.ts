/**
 * Host element markers the workbook writes on the div it is attached to.
 *
 * TASK 53 item 2, measured on the official trial DOM through the public API only
 * (`.probe/t53/probe-host53.json`, page script `.probe/t53/host-probe-page.mjs`):
 * - after `new GC.Spread.Sheets.Workbook(host)`, the host div carries the class
 *   `gc-no-user-select` on top of whatever classes the application put there, and
 * - the host's inline style gains `overflow: visible` (the trial appends it to the
 *   application's own style text instead of replacing the attribute).
 * - after `workbook.destroy()` the trial host no longer has `gc-no-user-select`, while the
 *   `overflow: visible` it added stays.
 * Our own class (`opensheets-host`, the hook our stylesheet hangs on) is kept as well; the trial
 * measures as `gc-no-user-select` only, so anything that selects the host must work through both.
 */
export const NO_SELECT_CLASS = 'gc-no-user-select';

/** One marker set per workbook attachment, so a second workbook on the same host keeps the markers
 *  alive when the first one is destroyed. */
const attachments = new WeakMap<HTMLElement, number>();

/** Applies the trial host markers; returns the element untouched apart from class + inline overflow. */
export function attachHostMarkers(host: HTMLElement): void {
  attachments.set(host, (attachments.get(host) ?? 0) + 1);
  host.classList.add(NO_SELECT_CLASS);
  // The trial overwrites an inline `overflow` the application set (measured: `overflow: hidden`
  // becomes `overflow: visible`), and it never puts the old value back on destroy.
  host.style.overflow = 'visible';
}

/** Removes the class again (leaving the inline `overflow` the trial leaves behind). */
export function detachHostMarkers(host: HTMLElement): void {
  const left = (attachments.get(host) ?? 1) - 1;
  if (left > 0) {
    attachments.set(host, left);
    return;
  }
  attachments.delete(host);
  host.classList.remove(NO_SELECT_CLASS);
}
