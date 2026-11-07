import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { handFixtureNames } from '../src/m7-hand-fixtures.js';
import { fixtureNames } from '../src/m7-fixtures.js';
import { comparePanes, limits, type Regions } from './pixel-report.js';
for(const name of [...fixtureNames,...handFixtureNames])test(`${name}: four-way XLSX cross import`,async({page})=>{
  await page.goto('/m7-io.html');await page.waitForFunction(()=>window.__m7?.ready);
  const results=await page.evaluate(name=>window.__m7.fixture(name,name.startsWith('m7-hand-')),name) as {from:string;snapshots:unknown[];rawJSON:unknown[];callbacks:unknown[];exportBytes:number[]}[];
  const dir=path.resolve('../../test-results/io');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(results,null,2));
  for(const r of results){await fs.writeFile(path.join(dir,name+'-'+r.from+'.xlsx'),new Uint8Array(r.exportBytes));expect.soft(r.snapshots[1],`${name}: ${r.from} export imported by both engines`).toEqual(r.snapshots[0]);expect.soft(r.callbacks[1],`${name}: callback result`).toEqual(r.callbacks[0]);}
});
for(const dpr of [1,2])test.describe(`M7 IO visuals DPR ${dpr}`,()=>{
  test.use({deviceScaleFactor:dpr});
  for(const name of fixtureNames.slice(0,3))test(`${name}: imported grid`,async({page})=>{
    await page.goto('/m7-io.html');await page.waitForFunction(()=>window.__m7?.ready);await page.evaluate(name=>window.__m7.fixture(name),name);
    const regions=await page.evaluate(()=>{const boxes=[];for(const w of window.__m7.books){const s=w.getActiveSheet(),json=s.toJSON() as {data?:{dataTable?:Record<string,Record<string,unknown>>}};for(const [r,row]of Object.entries(json.data?.dataTable??{}))for(const c of Object.keys(row))boxes.push(s.getCellRect(+r,+c));for(const span of s.getSpans()){const start=s.getCellRect(span.row,span.col),end=s.getCellRect(span.row+span.rowCount-1,span.col+span.colCount-1);boxes.push({x:start.x,y:start.y,width:end.x+end.width-start.x,height:end.y+end.height-start.y});}}
      const first=window.__m7.books[0].getActiveSheet().getCellRect(0,0),host=document.getElementById('official-pane')!,width=host.clientWidth-22,height=host.clientHeight-28;
      const x=Math.max(0,Math.min(...boxes.map(b=>b.x))-2),y=Math.max(0,Math.min(...boxes.map(b=>b.y))-2),right=Math.min(width,Math.max(...boxes.map(b=>b.x+b.width))+2),bottom=Math.min(height,Math.max(...boxes.map(b=>b.y+b.height))+2);
      return {content:[{x,y,width:right-x,height:bottom-y}],headers:[{x:0,y:0,width,height:first.y},{x:0,y:first.y,width:first.x,height:height-first.y}],tabs:[{x:0,y:height,width:host.clientWidth,height:28}],glyphs:[]};
    }) as Regions;
    const captures=[];const fullName=name+'-import'+(dpr===2?'-2x':'');for(const side of ['official','ours'])captures.push(await page.locator(`#${side}-pane`).screenshot({path:path.resolve(`../../test-results/compare/${fullName}-${side}.png`)}));
    const metrics=await comparePanes(fullName,captures[0],captures[1],regions,dpr);for(const region of ['content','headers','tabs','glyphs'] as const)expect.soft(metrics[region].ratio,`${fullName} ${region}: ${metrics[region].ratio*100}%`).toBeLessThan(limits[region]);
  });
});

const ioCases:Record<string,string>={
  'm7-csv-quoted-export':String.raw`(async()=>{sheet.setArray(0,0,[['text,with "quote"',42,true],['line\nnext',-3,false]]);return await helpers.exportFile({fileType:2,columnDelimiter:';',rowDelimiter:'\n',range:{sheetIndex:0,row:0,column:0,rowCount:2,columnCount:3}});})()`,
  'm7-csv-import-encoding':String.raw`(async()=>{const loaded=await helpers.importFile(new File([new Uint8Array([0x82,0xa0,0x2c,0x34,0x32])],'shift.csv'),{fileType:2,encoding:'shift-jis'});return {loaded,values:sheet.getArray(0,0,1,2)};})()`,
  'm7-csv-delimiters':String.raw`(async()=>{const loaded=await helpers.importFile(new Blob(['"a||b"||42ENDtrue||"two\nlines"']),{fileType:2,columnDelimiter:'||',rowDelimiter:'END'});return {loaded,values:sheet.getArray(0,0,2,2)};})()`,
  'm7-callback-timing-and-errors':String.raw`(async()=>{const result=[];for(const [file,ft]of [['bad',0],[new Blob(['bad']),0],[new Blob(['bad']),1],[new Blob(['a,b']),2]]){const events=[];const ret=wb.import(file,(...a)=>events.push(['ok',a]),(...a)=>events.push(['error',a]),{fileType:ft});events.push(['return',ret]);await new Promise(r=>setTimeout(r,250));result.push(events);}for(const ft of [1,2,99]){const events=[];const ret=wb.export(b=>events.push(['ok',b.type]),e=>events.push(['error',e]),{fileType:ft,range:{sheetIndex:0,row:0,column:0,rowCount:1,columnCount:1}});events.push(['return',ret]);await new Promise(r=>setTimeout(r,50));result.push(events);}return result;})()`,
  'm7-ssjson-include-flags':String.raw`(async()=>{sheet.name('Json');sheet.setValue(0,0,42);sheet.setFormula(1,0,'A1+1');sheet.setStyle(0,0,Object.assign(new GC.Spread.Sheets.Style(),{backColor:'#ff0000'}));const b=await new Promise((r,j)=>wb.export(r,j,{fileType:1,includeStyles:false,includeFormulas:false}));const result=await helpers.importFile(b,{fileType:1});const s=wb.getSheetFromName('Json');return {result,values:s.getArray(0,0,2,1),formula:s.getFormula(1,0),backColor:s.getActualStyle(0,0).backColor??null};})()`,
};
for(const [name,source]of Object.entries(ioCases))test(name,async({page})=>{await page.goto('/io-probe.html');await page.waitForFunction(()=>window.__ioProbe?.ready);const r=await page.evaluate(s=>window.__ioProbe.run(s),source);expect(r.ours).toEqual(r.official);});

test('m7-core: IO methods remain absent without the plugin',async({page})=>{await page.goto('/probe.html');await page.waitForFunction(()=>window.__probe?.ready);const r=await page.evaluate(()=>window.__probe.run(`['import','export','open','save'].map(k=>typeof wb[k])`));expect(r.ours).toEqual(r.official);});
