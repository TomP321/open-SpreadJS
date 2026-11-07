import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { Workbook } from '../../spread-sheets/src/model.js';
import { install, type IoWorkbook } from '../src/install.js';
const require=createRequire(import.meta.url);
it('leaves IO absent in the core until the side-effect plugin is loaded',()=>{const core=require('../../spread-sheets/dist/gc.spread.sheets.cjs');const wb=new core.Spread.Sheets.Workbook();for(const k of ['import','export','open','save'])expect(typeof wb[k]).toBe('undefined');require('../dist/gc.spread.sheets.io.cjs');for(const k of ['import','export','open','save'])expect(typeof wb[k]).toBe('function');wb.destroy();});
it('matches synchronous invalid-object errors, asynchronous Blob errors and return values',async()=>{install({Spread:{Sheets:{Workbook}}});const wb=new Workbook();const io=wb as unknown as IoWorkbook&{import(file:unknown,ok:(...a:unknown[])=>void,err:(...a:unknown[])=>void,o:object):void};const events:unknown[]=[];expect(io.import('bad',()=>{},e=>events.push(e),{fileType:0})).toBeUndefined();expect(events).toEqual([{errorCode:1,errorMessage:'Incorrect file format.'}]);events.length=0;const p=new Promise<void>(resolve=>{io.import(new Blob(['bad']),()=>{},e=>{events.push(e);resolve();},{fileType:0});events.push('returned');});expect(events).toEqual(['returned']);await p;expect(events[1]).toEqual({errorCode:1,errorMessage:'Incorrect file format.'});wb.destroy();});
it('attaches the browser distribution to the existing global constructor and exports real XLSX',async()=>{
  // Node's injected TextEncoder returns host typed arrays; keep the VM's binary
  // constructors in that same realm, as they would be in an actual browser.
  const context={Blob,TextEncoder,TextDecoder,Uint8Array,Uint16Array,Uint32Array,Int32Array,ArrayBuffer,queueMicrotask,console,setTimeout,clearTimeout,performance};
  // This is our own browser build, never the vendor's opaque bundle.
  const core=readFileSync(new URL('../../spread-sheets/dist/gc.spread.sheets.all.min.js',import.meta.url),'utf8');
  const plugin=readFileSync(new URL('../dist/gc.spread.sheets.io.umd.js',import.meta.url),'utf8');
  const result=runInNewContext(core+'\nconst before=GC.Spread.Sheets.Workbook;\n'+plugin+`\n(async()=>{
    if(before!==GC.Spread.Sheets.Workbook)throw new Error('Replaced the core constructor');
    const wb=new GC.Spread.Sheets.Workbook();wb.getActiveSheet().setValue(0,0,'browser');
    const blob=await new Promise((resolve,reject)=>wb.export(resolve,reject,{fileType:0}));
    const target=new GC.Spread.Sheets.Workbook();await new Promise((resolve,reject)=>target.import(blob,resolve,reject,{fileType:0}));
    const result={type:blob.type,value:target.getActiveSheet().getValue(0,0)};wb.destroy();target.destroy();return result;
  })()`,context) as Promise<unknown>;
  expect(await result).toEqual({type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',value:'browser'});
});
