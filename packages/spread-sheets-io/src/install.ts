import { decryptXlsx, encryptXlsx } from './encryption.js';
import { isCompound } from './compound.js';
import { csvSheet, writeCsv } from './csv.js';
import { arr, obj, type IoOptions, type IoState, type RecordValue } from './common.js';
import { readXlsx, writeXlsx } from './xlsx.js';
import { defaultTheme, tintColor } from './styles.js';
export interface IoWorkbook {
  toJSON(options?:RecordValue):RecordValue;
  fromJSON(data:object,options?:RecordValue):void|Promise<void>;
  getActiveSheetIndex():number;
  getSheet(index:number):{name():string;fromJSON(data:object):void;getRowCount():number;getColumnCount():number;getText(row:number,col:number):string};
  calculate():void;
}
export interface IoGC { Spread:{Sheets:{Workbook:{prototype:object}}} }
export type IoCallback=(...args:unknown[])=>void;
const formatError=()=>({errorCode:1,errorMessage:'Incorrect file format.'});
const state=new WeakMap<object,IoState>();
function applyImportedMetadata(book:IoWorkbook,json:RecordValue,theme:string[]):void {
  const palette:Record<string,string>={};
  const names=['Background 1','Text 1','Background 2','Text 2','Accent 1','Accent 2','Accent 3','Accent 4','Accent 5','Accent 6','Hyperlink','Followed Hyperlink'];
  names.forEach((name,i)=>{palette[name]='#'+theme[i];for(let t=-100;t<=100;t++)palette[name+' '+t]='#'+tintColor(theme[i],t/100);});
  Object.values(obj(json.sheets)).map(obj).forEach((raw,i)=>{
    const s=book.getSheet(i) as ReturnType<IoWorkbook['getSheet']>&{_ioThemeColors?:Record<string,string>;conditionalFormats?:{_xlsxImported:boolean};getFormula(row:number,col:number,area?:number):string|null};
    s._ioThemeColors=palette;
    if(s.conditionalFormats)s.conditionalFormats._xlsxImported=true;
    const anchors:{row:number;col:number;rows:number;cols:number}[]=[];
    for(const [rk,row]of Object.entries(obj(obj(raw.data).dataTable)))for(const [ck,cell]of Object.entries(obj(row))){const a=obj(obj(cell).arrayFormula);if(a.rowCount)anchors.push({row:+rk,col:+ck,rows:Number(a.rowCount),cols:Number(a.colCount)});}
    if(anchors.length){const get=s.getFormula.bind(s);Object.defineProperty(s,'getFormula',{configurable:true,value:(r:number,c:number,area?:number)=>{const own=get(r,c,area);if(own||(area!==undefined&&area!==3))return own;const a=anchors.find(a=>r>=a.row&&r<a.row+a.rows&&c>=a.col&&c<a.col+a.cols);return a?get(a.row,a.col,area):null;}});}
  });
}
function report(messages:string[]):void {for(const message of new Set(messages))console.warn('NotImplemented: XLSX '+message);}
function validateOptions(o:IoOptions):void {
  for(const key of ['frozenColumnsAsRowHeaders','frozenRowsAsColumnHeaders','rowHeadersAsFrozenColumns','columnHeadersAsFrozenRows','includeAutoMergedCells','saveAsView','saveR1C1Formula','incrementalLoad','convertSheetTableToDataTable'])if(o[key])throw new Error(`NotImplemented: IO ${key}`);
}
function jsonOptions(o:IoOptions):RecordValue {return {ignoreStyle:o.includeStyles===false,ignoreFormula:o.includeFormulas===false,includeBindingSource:o.includeBindingSource,_ioOwnedData:true,_ioArrayInfo:true};}
function errorResult(error:unknown):RecordValue {if(error instanceof Error&&error.message.startsWith('NotImplemented:')){console.warn(error.message);return {errorCode:0,errorMessage:error.message};}return formatError();}
async function bytesOf(file:Blob):Promise<Uint8Array> {
  if(typeof file.arrayBuffer==='function')return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(file);});
}
async function doImport(book:IoWorkbook,file:Blob,o:IoOptions):Promise<void> {
  validateOptions(o);let bytes=await bytesOf(file);const kind=o.fileType??0;
  if(isCompound(bytes))bytes=decryptXlsx(bytes,o.password);
  if(kind===0){const result=readXlsx(bytes,o);
    // Core+IO has no print module: retain print parts privately for export.
    result.state.printInfo=Object.values(obj(result.json.sheets)).map(s=>{const sheet=obj(s),print=obj(sheet.printInfo);delete sheet.printInfo;return print;});
    for(const [sheetIndex,cells]of (result.state.inlineStrings??[]).entries())for(const entry of cells){const sheet=obj(Object.values(obj(result.json.sheets))[sheetIndex]);obj(obj(obj(obj(sheet.data).dataTable)[entry.row])[entry.col]).value=entry.value;}
    await book.fromJSON(result.json,jsonOptions(o));applyImportedMetadata(book,result.json,result.state.theme??defaultTheme);state.set(book,result.state);report(result.state.warnings);}
  else if(kind===1){const parsed:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid workbook JSON');await book.fromJSON(parsed,jsonOptions(o));state.delete(book);}
  else if(kind===2){const text=new TextDecoder(String(o.encoding??'utf-8')).decode(bytes),s=book.getSheet(book.getActiveSheetIndex());s.fromJSON(csvSheet(text,o,s.name()));state.delete(book);}
  else throw new Error('Unknown file type');
  if(o.fullRecalc)book.calculate();
}
async function doExport(book:IoWorkbook,o:IoOptions):Promise<Blob> {
  validateOptions(o);const kind=o.fileType??0;
  if(kind===2)return new Blob([writeCsv(book,o)],{type:'text/plain;charset=utf-8'});
  const json=book.toJSON(jsonOptions(o));
  if(kind===1)return new Blob([JSON.stringify(json)],{type:'text/plain;charset=utf-8'});
  if(kind!==0)throw new Error('Unknown file type');
  const previous=state.get(book);if(previous?.printInfo)Object.values(obj(json.sheets)).forEach((s,i)=>{if(Object.keys(previous.printInfo?.[i]??{}).length)obj(s).printInfo=previous.printInfo![i];});
  const result=writeXlsx(json,{...o,password:undefined},o.losslessEditing===false?undefined:previous);report(result.warnings);
  const bytes=o.password?encryptXlsx(result.bytes,o.password):result.bytes;
  return new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
/** Install against the host constructor; no second core copy is bundled. */
export function install(GC:IoGC):void {
  const proto=GC.Spread.Sheets.Workbook.prototype;
  Object.defineProperty(proto,'import',{configurable:true,writable:true,value:function(this:IoWorkbook,file:Blob|undefined,success?:IoCallback,error?:IoCallback,options:IoOptions={}){
    if(!file)return;
    if(!(file instanceof Blob)){error?.(formatError());return;}
    // Blob reading makes callbacks asynchronous, even for malformed content.
    void doImport(this,file,options??{}).then(()=>success?.((options?.fileType??0)===0?{}:'file loaded'),e=>error?.(e&&typeof e==='object'&&'errorCode'in e?e:errorResult(e)));
  }});
  Object.defineProperty(proto,'export',{configurable:true,writable:true,value:function(this:IoWorkbook,success?:IoCallback,error?:IoCallback,options:IoOptions={}){
    const o=options??{},kind=o.fileType??0;
    if(kind!==0&&kind!==1&&kind!==2)return;
    if(kind===1||kind===2){try{validateOptions(o);const text=kind===1?JSON.stringify(this.toJSON(jsonOptions(o))):writeCsv(this,o);success?.(new Blob([text],{type:'text/plain;charset=utf-8'}));}catch(e){error?.(errorResult(e));}return;}
    void doExport(this,o).then(blob=>success?.(blob),e=>error?.(errorResult(e)));
  }});
  // SJS uses the separate open/save protocol. Until that archive protocol is
  // implemented, make it fail explicitly instead of writing disguised SSJSON.
  Object.defineProperty(proto,'open',{configurable:true,writable:true,value:function(this:IoWorkbook,file:Blob,success?:IoCallback,error?:IoCallback,options:IoOptions={}){
    if(!file)return;const name=(file as File).name??'';if(/\.(?:xlsx|xltx|xlsm|xltm)$/i.test(name)){Reflect.get(this,'import').call(this,file,success,error,{...options,fileType:0});return;}queueMicrotask(()=>error?.({errorCode:0,errorMessage:'NotImplemented: SJS open'}));
  }});
  Object.defineProperty(proto,'save',{configurable:true,writable:true,value:function(this:IoWorkbook,_success?:IoCallback,error?:IoCallback){queueMicrotask(()=>error?.({errorCode:0,errorMessage:'NotImplemented: SJS save'}));}});
  Object.defineProperty(Reflect.get(proto,'save'),Symbol.for('@opensheets/NotImplemented'),{value:true});
}
void arr;void obj;
