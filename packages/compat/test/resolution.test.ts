import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('typechecks aliased ESM and export= CommonJS consumers with NodeNext resolution', () => {
  const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'opensheets-types-'));
  const packages = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  try {
    const scope = path.join(consumer, 'node_modules/@mescius');
    fs.mkdirSync(scope, { recursive: true });
    for (const name of ['spread-sheets', 'spread-sheets-react']) fs.symlinkSync(path.join(packages, name), path.join(scope, name), 'dir');
    const esm = path.join(consumer, 'consumer.mts');
    fs.writeFileSync(esm, `
      import GC from '@mescius/spread-sheets';
      import * as Namespace from '@mescius/spread-sheets';
      import { SpreadSheets, Worksheet, Column, type SpreadSheetsProp } from '@mescius/spread-sheets-react';
      const workbook: GC.Spread.Sheets.Workbook = new Namespace.Spread.Sheets.Workbook();
      const props: SpreadSheetsProp = { workbookInitialized(value) { value.getSheet(0).setValue(0, 0, 1); } };
      new SpreadSheets(props); new Worksheet({ name: 'Typed' }); new Column({ width: 100 });
    `);
    const cjs = path.join(consumer, 'consumer.cts');
    fs.writeFileSync(cjs, `
      import GC = require('@mescius/spread-sheets');
      import Components = require('@mescius/spread-sheets-react');
      const workbook: GC.Spread.Sheets.Workbook = new GC.Spread.Sheets.Workbook();
      const props: Components.SpreadSheetsProp = { workbookInitialized(value) { value.getSheet(0).setValue(0, 0, 1); } };
      new Components.SpreadSheets(props);
    `);
    const program = ts.createProgram([esm, cjs], { strict: true, noEmit: true, esModuleInterop: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, types: [] });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  } finally { fs.rmSync(consumer, { recursive: true, force: true }); }
});
