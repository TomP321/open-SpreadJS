import { address, obj, type IoOptions, type RecordValue } from './common.js';
/** Delimiters may be multi-character; doubled quotes and embedded newlines are retained. */
export function parseCsv(text:string,columnDelimiter=',',rowDelimiter='\r\n'):string[][] {
  if(!columnDelimiter||!rowDelimiter||columnDelimiter===rowDelimiter)throw new Error('Invalid CSV delimiters');
  const out:string[][]=[];let row:string[]=[],field='',quoted=false,atStart=true,i=text.charCodeAt(0)===0xfeff?1:0;
  while(i<text.length){
    if(quoted){if(text[i]==='"'){if(text[i+1]==='"'){field+='"';i+=2;}else{quoted=false;i++;}}else field+=text[i++];continue;}
    if(atStart&&text[i]==='"'){quoted=true;atStart=false;i++;continue;}
    if(text.startsWith(columnDelimiter,i)){row.push(field);field='';atStart=true;i+=columnDelimiter.length;continue;}
    // With the default CRLF option the trial accepts LF files as well.
    const length=text.startsWith(rowDelimiter,i)?rowDelimiter.length:rowDelimiter==='\r\n'&&text[i]==='\n'?1:0;
    if(length){row.push(field);out.push(row);row=[];field='';atStart=true;i+=length;continue;}
    field+=text[i++];atStart=false;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(field!==''||row.length||!out.length){row.push(field);out.push(row);}return out;
}
export function csvValue(s:string):unknown {
  if(s==='')return undefined;const trim=s.trim();if(/^true$/i.test(trim))return true;if(/^false$/i.test(trim))return false;
  if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trim)&&Number.isFinite(+trim))return +trim;
  if(/^\d{4}-\d{1,2}-\d{1,2}(?:[T ][\d:.+-]+Z?)?$/.test(trim)||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trim)){
    const d=new Date(trim);if(Number.isFinite(+d))return `/OADate(${(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds(),d.getMilliseconds())-Date.UTC(1899,11,30))/86400000})/`;
  }
  return s;
}
export function csvSheet(text:string,options:IoOptions={},name='Sheet1'):RecordValue {
  const rows=parseCsv(text,String(options.columnDelimiter??','),String(options.rowDelimiter??'\r\n')),data:RecordValue={};let maxCol=0;
  rows.forEach((cols,r)=>{maxCol=Math.max(maxCol,cols.length);const row:RecordValue={};cols.forEach((v,c)=>{const value=csvValue(v);if(value!==undefined)row[c]={value};});if(Object.keys(row).length)data[r]=row;});
  return {name,rowCount:Math.max(200,rows.length),columnCount:Math.max(20,maxCol),data:{dataTable:data},theme:'Office2007'};
}
export interface CsvWorkbook {
  getActiveSheetIndex():number;
  getSheet(index:number):{getRowCount():number;getColumnCount():number;getText(row:number,col:number):string};
}
export function writeCsv(book:CsvWorkbook,options:IoOptions={}):string {
  const r=obj(options.range),sheet=book.getSheet(Number(r.sheetIndex??book.getActiveSheetIndex()));if(!sheet)throw new Error('Invalid sheet');
  const row=Number(r.row??0),col=Number(r.column??0),rows=Number(r.rowCount??sheet.getRowCount()-row),cols=Number(r.columnCount??sheet.getColumnCount()-col),rd=String(options.rowDelimiter??'\r\n'),cd=String(options.columnDelimiter??',');
  if(!rd||!cd||row<0||col<0||rows<0||cols<0||row+rows>sheet.getRowCount()||col+cols>sheet.getColumnCount())throw new Error('Invalid CSV range');
  const result:string[]=[];for(let i=0;i<rows;i++){const fields:string[]=[];for(let j=0;j<cols;j++)fields.push('"'+String(sheet.getText(row+i,col+j)??'').replace(/"/g,'""')+'"');result.push(fields.join(cd)+rd);}return result.join('');
}
void address;
