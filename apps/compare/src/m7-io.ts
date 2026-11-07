import * as Official from '@mescius/spread-sheets';
import '@mescius/spread-sheets-io';
import Ours from '@opensheets/spread-sheets';
import '@opensheets/spread-sheets-io';
import '@mescius/spread-sheets/styles/gc.spread.sheets.excel2013white.css';
import '@opensheets/spread-sheets/styles/gc.spread.sheets.css';
import './style.css';
import { handFixture as handBytes } from './m7-hand-fixtures.js';
import { buildFixture } from './m7-fixtures.js';
import { obj, arr, type RecordValue } from '../../../packages/spread-sheets-io/src/common.js';
import { readZip, xmlFile, validatePackage } from '../../../packages/spread-sheets-io/src/zip.js';
import { defaultTheme, readTheme, tintColor } from '../../../packages/spread-sheets-io/src/styles.js';
type Book=InstanceType<typeof Ours.Spread.Sheets.Workbook>;
const Gs=[Official as unknown as typeof Ours,Ours];
const root=document.getElementById('root')!;
root.innerHTML='<header><h1>M7 · IO cross-import comparison</h1></header><main><section><h2>Official</h2><div id="official-pane" class="pane"></div></section><section><h2>OpenSheets</h2><div id="ours-pane" class="pane"></div></section></main>';
const books=Gs.map((g,i)=>new g.Spread.Sheets.Workbook(document.getElementById(i?'ours-pane':'official-pane')!));
function exportBook(w:Book,o:RecordValue={fileType:0}):Promise<Blob>{return new Promise((resolve,reject)=>w.export(resolve,reject,o as never));}
function importBook(w:Book,b:Blob,o:RecordValue={fileType:0}):Promise<unknown>{return new Promise((resolve,reject)=>w.import(b as File,resolve,reject,o as never));}
function normalize(value:unknown):unknown {if(value===undefined)return null;if(value instanceof Date)return {date:value.toISOString()};if(value&&typeof value==='object'&&/^#(?:DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|SPILL!|CALC!)$/.test(String(value)))return {error:String(value)};if(value===null||typeof value!=='object')return typeof value==='number'?Math.round(value*1e10)/1e10:value;if(Array.isArray(value))return Array.from(value,normalize);return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined&&typeof v!=='function').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)]));}
function color(value:unknown,theme:string[]):string|null {
  if(value===undefined||value===null||value==='')return null;const s=String(value),names=['Background 1','Text 1','Background 2','Text 2','Accent 1','Accent 2','Accent 3','Accent 4','Accent 5','Accent 6','Hyperlink','Followed Hyperlink'];const i=names.findIndex(n=>s===n||s.startsWith(n+' '));if(i>=0){const t=Number(s.slice(names[i].length).trim()||0)/100;return '#'+tintColor(theme[i],t).toLowerCase();}
  const ctx=document.createElement('canvas').getContext('2d')!;ctx.fillStyle=s;return String(ctx.fillStyle).toLowerCase();
}
function style(raw:unknown,theme:string[]):unknown {
  const s=obj(raw),font=String(s.font??'11pt Calibri'),m=font.match(/([\d.]+)(px|pt)\s+(.+)$/),fontSize=s.fontSize??(m?m[1]+m[2]:'11pt'),size=parseFloat(String(fontSize))*(String(fontSize).includes('px')?0.75:1);
  const result:RecordValue={fontFamily:String(s.fontFamily??m?.[3]??'Calibri').replace(/["']/g,'').toLowerCase(),fontPoints:Math.round(size*1000)/1000,fontWeight:/bold|[6-9]00/.test(String(s.fontWeight??font))?'bold':'normal',fontStyle:/italic|oblique/.test(String(s.fontStyle??font))?'italic':'normal',foreColor:color(s.foreColor??'#000000',theme),backColor:color(s.backColor,theme),formatter:s.formatter??'General'};
  for(const [k,v]of Object.entries({hAlign:3,vAlign:0,wordWrap:false,shrinkToFit:false,textIndent:0,textOrientation:0,textDecoration:0,locked:true,hidden:false}))result[k]=s[k]??v;
  for(const k of ['borderLeft','borderRight','borderTop','borderBottom','diagonalUp','diagonalDown']){const b=obj(s[k]);result[k]=b.style?{style:b.style,color:color(b.color??'#000000',theme)}:null;}
  return normalize(result);
}
/** Canonical JSON resolves named style indirection and equivalent font/color forms.
 * Random identities and the trial's exact evaluation sheet are excluded only from
 * semantic JSON; raw toJSON is saved alongside it for a complete audit. */
function snapshot(w:Book,theme=defaultTheme):unknown {
  const json=w.toJSON() as RecordValue;const sheets=Object.values(obj(json.sheets)).map(obj).filter(s=>s.name!=='Evaluation Version').sort((a,b)=>Number(a.index)-Number(b.index));
  return normalize({names:json.names??[],sheets:sheets.map(s=>{const ws=w.getSheetFromName(String(s.name)),cells:RecordValue={},table=obj(obj(s.data).dataTable);for(const [rk,row]of Object.entries(table))for(const ck of Object.keys(obj(row))){const r=+rk,c=+ck;cells[`${r},${c}`]={value:normalize(ws.getValue(r,c)),formula:ws.getFormula(r,c)??null,style:style(ws.getActualStyle(r,c),theme),hyperlink:ws.getHyperlink(r,c)??null,arrayInfo:obj(obj(row)[ck]).arrayInfo??null};}
    const dimensions=(axis:unknown,get:(i:number)=>number,visible:(i:number)=>boolean)=>Object.fromEntries(Object.keys(obj(axis)).filter(k=>obj(axis)[k]).map(k=>[k,{size:get(+k),visible:visible(+k)}]));
    return {name:s.name,rowCount:ws.getRowCount(),columnCount:ws.getColumnCount(),visible:ws.visible(),tabColor:color(ws.options.sheetTabColor,theme),cells,spans:ws.getSpans(),rows:dimensions(s.rows,i=>ws.getRowHeight(i),i=>ws.getRowVisible(i)),columns:dimensions(s.columns,i=>ws.getColumnWidth(i),i=>ws.getColumnVisible(i)),frozenRows:ws.frozenRowCount(),frozenColumns:ws.frozenColumnCount(),names:s.names??[],comments:arr(s.comments).map(c=>{const n=obj(c);return {row:n.rowIndex,col:n.colIndex,text:n.text};}),validations:s.validations??[],conditionalFormats:s.conditionalFormats??{},tables:s.tables??[],rowFilter:s.rowFilter??null,rowOutlines:s.rowOutlines??{},columnOutlines:s.columnOutlines??{},isProtected:ws.options.isProtected,protectionOptions:ws.options.protectionOptions,printInfo:s.printInfo??null};})});
}
async function fixture(name:string,hand=false){
  const source=Gs.map(g=>new g.Spread.Sheets.Workbook());const files:Blob[]=[];
  try {for(let i=0;i<source.length;i++){if(hand)await importBook(source[i],new Blob([handBytes(name) as Uint8Array<ArrayBuffer>]));else buildFixture(Gs[i],source[i],name);files.push(await exportBook(source[i]));}}finally{source.forEach(w=>w.destroy());}
  const results:unknown[]=[];
  if(hand){const bytes=handBytes(name),b=new Blob([bytes as Uint8Array<ArrayBuffer>]);const callbacks=[];for(const w of books)callbacks.push(await importBook(w,b));results.push({from:'hand',callbacks,snapshots:books.map(w=>snapshot(w)),rawJSON:books.map(w=>w.toJSON()),exportBytes:Array.from(bytes)});}
  for(let from=0;from<files.length;from++){
    const archive=readZip(new Uint8Array(await files[from].arrayBuffer()));validatePackage(archive);const theme=readTheme(xmlFile(archive,'xl/theme/theme1.xml'));
    const callbacks=[];for(const w of books)callbacks.push(await importBook(w,files[from]));
    results.push({from:from?'ours':'official',callbacks,snapshots:books.map(w=>snapshot(w,theme)),rawJSON:books.map(w=>w.toJSON()),zipParts:Object.keys(archive).sort(),exportBytes:Array.from(new Uint8Array(await files[from].arrayBuffer()))});
  }
  await document.fonts.ready;await new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));return results;
}
declare global {interface Window {__m7:{ready:boolean;fixture:typeof fixture;books:Book[];snapshot:typeof snapshot;exportBook:typeof exportBook;importBook:typeof importBook}}}
window.__m7={ready:true,fixture,books,snapshot,exportBook,importBook};
