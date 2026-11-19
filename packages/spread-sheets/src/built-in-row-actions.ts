/**
 * `GC.Spread.Sheets.TableSheet.BuiltInRowActions` (TASK 44).
 *
 * Contract: the core d.ts declares a class with a no-arg constructor and six
 * static `IRowActionOptions` members. Observed from the 19.2.5 trial with the
 * tablesheet add-on loaded (probe `ts:builtin` / `ts:newrowactions`):
 * - `dirtyStatus`: `{ name: 'dirtyStatus', icons: [3 icons] }`
 * - `pinRow`: `{ name: 'pinRow', command: 'PinRow', icons: [1 icon] }`
 * - `removeRow`: `{ name: 'removeRow', command: 'RemoveRow', icons: [10] }`
 *   (`10`, `2`, `4` are `GC.Spread.Sheets.ButtonImageType` enum values)
 * - `resetRow`: `{ name: 'resetRow', command: 'ResetRow', icons: [2] }`
 * - `saveRow`: `{ name: 'saveRow', command: 'SaveRow', icons: [4] }`
 * - `warningInfo`: `{ name: 'warningInfo', icons: [1 icon] }`
 *
 * The trial's data-URI icons are its own artwork. Per the clean-room rules we
 * draw our own 12x12 SVG glyphs (measured colour family `#666666`); the
 * ButtonImageType enum numbers match the trial because they are public API
 * data. This file lives outside `src/tablesheet/` on purpose (module ownership).
 */

/** Minimal base64 encoder so the data URIs work in every host (no `btoa` dependency). */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toBase64 = (text: string): string => {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 !== undefined ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += b2 !== undefined ? B64[b2 & 63] : '=';
  }
  return out;
};

const svg = (body: string): string =>
  `data:image/svg+xml;base64,${toBase64(
    `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="12" height="12" fill="transparent"/>${body}</svg>`,
  )}`;

// Our own glyphs: pencil (modified), plus (added), check (saved), pin, exclamation.
const pencilIcon = svg('<path d="M8.6 1.6L10.4 3.4L4 9.8L1.8 10.2L2.2 8L8.6 1.6Z" fill="#666666"/>');
const plusIcon = svg('<path d="M5.4 1H6.6V5.4H11V6.6H6.6V11H5.4V6.6H1V5.4H5.4V1Z" fill="#666666"/>');
const checkIcon = svg('<path d="M4.8 8.4L2 5.6L2.9 4.7L4.8 6.6L9.1 2.3L10 3.2L4.8 8.4Z" fill="#666666"/>');
const pinIcon = svg('<path d="M6.8 1H8V6H10V7H7.6L7.5 10.4L6.5 10.4L6.4 7H4V6H5.2V4H3V3H5.2V1H6.8ZM6.8 3V6H6.4V3H6.8Z" fill="#666666"/>');
const warningIcon = svg('<path d="M6 1C3.2 1 1 3.2 1 6C1 8.8 3.2 11 6 11C8.8 11 11 8.8 11 6C11 3.2 8.8 1 6 1ZM5.4 3H6.6V7.5H5.4V3ZM5.4 8.5H6.6V10H5.4V8.5Z" fill="#E65249"/>');

export class BuiltInRowActions {
  static dirtyStatus = {
    name: 'dirtyStatus',
    icons: [pencilIcon, plusIcon, checkIcon],
  };
  static pinRow = {
    name: 'pinRow',
    command: 'PinRow',
    icons: [pinIcon],
  };
  static removeRow = {
    name: 'removeRow',
    command: 'RemoveRow',
    icons: [10],
  };
  static resetRow = {
    name: 'resetRow',
    command: 'ResetRow',
    icons: [2],
  };
  static saveRow = {
    name: 'saveRow',
    command: 'SaveRow',
    icons: [4],
  };
  static warningInfo = {
    name: 'warningInfo',
    icons: [warningIcon],
  };
}
