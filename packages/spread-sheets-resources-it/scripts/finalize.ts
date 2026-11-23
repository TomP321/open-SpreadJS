import fs from 'node:fs';

// The ESM/CJS entries import the core peer, so tsup generates no typings for
// this package (its own d.ts would drag the whole core namespace in). The
// published surface is small and stable, so the declarations are written here.
const declarations = `/**
 * Italian (it-IT) resources for the OpenSheets spreadsheet core.
 * Importing the package (or loading \`dist/gc.spread.sheets.resources.it.min.js\`
 * after the core) registers the \`it-it\` culture and its UI string table.
 */
export declare const cultureName: string;
export declare const cultureDisplayName: string;
/** The it-IT culture data (number/date formats, predefined Excel formats). */
export declare const culture: Record<string, unknown>;
/** The core UI string table, keyed by namespace (\`contextMenu\`, \`filter\`, ...). */
export declare const resources: Record<string, unknown>;
/** Registers the culture and the strings on the given core namespace; false when no core was found. */
export declare function registerItalian(gc: unknown): boolean;
declare const _default: Record<string, unknown>;
export default _default;
`;
fs.writeFileSync('dist/index.d.ts', declarations);
fs.writeFileSync('dist/index.d.cts', declarations);
console.log('resources-it: wrote dist/index.d.ts, dist/index.d.cts');
