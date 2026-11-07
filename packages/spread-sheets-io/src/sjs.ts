/** SJS is a ZIP of JSON workbook/sheet parts. The public save/open protocol
 * and black-box public API output establish this schema; no vendor code is used. */
import { address, arr, obj, relsPath, type IoOptions, type IoState, type RecordValue } from './common.js';
import { child, children, declaration, escapeXml, parseXml, tag, textOf, type XmlNode } from './xml.js';
import { MAIN, REL, readZip, writeZip, xmlFile, relationships, relationshipXml } from './zip.js';
import { defaultTheme, readStyles, StyleWriter, themeXml } from './styles.js';
import { readXlsx, writeXlsx, type XlsxResult } from './xlsx.js';
export const sjsVersion={fileVer:'1.1',proName:'sjs',proVer:'19.2.5'};
function toNode(n:XmlNode):RecordValue {return {n_:n.name,...n.attrs,...(n.children.length||n.text?{c_:[...(n.text?[n.text]:[]),...n.children.map(toNode)]}:{})};}
function fromNode(value:unknown):string {if(value===null||value===undefined)return '';if(typeof value!=='object')return escapeXml(value);const n=obj(value);if(!n.n_)throw new Error('Invalid SJS XML node');return tag(String(n.n_),Object.fromEntries(Object.entries(n).filter(([k,v])=>!['n_','c_','r_','lossless','rels','order'].includes(k)&&typeof v!=='object')),arr(n.c_).map(fromNode).join(''));}
function nodeChildren(n:unknown,name:string):RecordValue[] {return arr(obj(n).c_).map(obj).filter(n=>n.n_===name);}
function numbers(n:RecordValue):[string,RecordValue][] {return Object.entries(n).filter(([k,v])=>/^\d+$/.test(k)&&v&&typeof v==='object').map(([k,v])=>[k,obj(v)]);}
const styleFields:Record<string,string>={h:'hAlign',v:'vAlign',l:'locked',d:'hidden',w:'wordWrap',i:'textIndent',x:'textOrientation',q:'shrinkToFit'};
const fontLists:Record<string,string>={font:'htmlFonts',fontStyle:'fontStyles',fontWeight:'fontWeights',fontSize:'fontSizes',fontFamily:'fontFamilies'};
function decodePairs(value:unknown):RecordValue {if(typeof value==='object')return obj(value);return Object.fromEntries(String(value??'').split(',').filter(Boolean).map(p=>{const i=p.indexOf(':');return [p.slice(0,i),+p.slice(i+1)];}));}
/** Interned style components keep repeated cell formatting out of the cell data. */
class SjsStyles {
  data:RecordValue={sharedColors:[],commonSharedStrings:[],cellXfs:[],cellStyleXfs:[],sharedObjects:[],namedStylesMap:{},defaultStyleNames:{defaultTableStyle:'TableStyleMedium2'},originCellXfs:[],originNamedStylesXfs:[],numFmts:[],formatStrings:[],fonts:[],htmlFonts:[],fontStyles:[],fontWeights:[],fontSizes:[],fontFamilies:[],fills:['{"t":0}','{"t":5}'],borderItems:[],borders:[],dxfs:{},tableStyles:{n_:'tableStyles',count:0,defaultTableStyle:'TableStyleMedium2',defaultPivotStyle:'PivotStyleLight16'}};
  constructor(data?:RecordValue){if(data)this.data=data;}
  private add(key:string,value:unknown):number {const list=this.data[key] as unknown[];const k=JSON.stringify(value),old=list.findIndex(v=>JSON.stringify(v)===k);if(old>=0)return old;list.push(value);return list.length-1;}
  encode(s:RecordValue):number {
    const out:RecordValue={};
    if(s.backColor)out.c=this.add('fills',this.add('sharedColors',s.backColor));
    const font:RecordValue={};for(const [field,key]of Object.entries({f:'font',i:'fontStyle',b:'fontWeight',s:'fontSize',n:'fontFamily'})){if(s[key]!==undefined)font[field]=this.add(fontLists[key],s[key]);}
    if(s.foreColor)font.c=this.add('sharedColors',s.foreColor);if(s.textDecoration!==undefined)font.u=s.textDecoration;if(s.themeFont)font.t=s.themeFont==='Headings'?1:0;
    const pairs=(o:RecordValue)=>Object.entries(o).map(([k,v])=>k+':'+v).join(',');
    if(Object.keys(font).length)out.f=this.add('fonts',pairs(font));
    const borders:RecordValue={};for(const [k,name]of Object.entries({l:'borderLeft',r:'borderRight',t:'borderTop',b:'borderBottom',d:'diagonalDown',u:'diagonalUp'})){const b=obj(s[name]);if(b.style)borders[k]=this.add('borderItems',JSON.stringify({s:b.style,c:this.add('sharedColors',b.color??'#000000')}));}if(Object.keys(borders).length)out.b=this.add('borders',pairs(borders));
    for(const [k,name]of Object.entries(styleFields))if(s[name]!==undefined)out[k]=typeof s[name]==='boolean'?+s[name]:s[name];
    if(s.formatter){const id=this.add('formatStrings',JSON.stringify({n:164+arr(this.data.formatStrings).length,c:s.formatter}));out.j=this.add('numFmts','f:'+id);}
    return this.add('originCellXfs',pairs(out));
  }
  decode(index:number,origin=true):RecordValue {
    const at=(key:string,i:unknown)=>arr(this.data[key])[Number(i)],fields=decodePairs(at(origin?'originCellXfs':'cellXfs',index)),out:RecordValue={};
    const json=(value:unknown)=>typeof value==='string'?obj(JSON.parse(value)):obj(value);
    if(fields.c!==undefined){const fill=at('fills',fields.c);if(typeof fill==='number')out.backColor=at('sharedColors',fill);}
    if(fields.f!==undefined){const font=decodePairs(at('fonts',fields.f));for(const [k,name]of Object.entries({f:'font',i:'fontStyle',b:'fontWeight',s:'fontSize',n:'fontFamily'}))if(font[k]!==undefined)out[name]=at(fontLists[name],font[k]);if(font.c!==undefined)out.foreColor=at('sharedColors',font.c);if(font.u!==undefined)out.textDecoration=font.u;if(font.t!==undefined)out.themeFont=font.t?'Headings':'Body';}
    if(fields.b!==undefined){const borders=decodePairs(at('borders',fields.b));for(const [k,name]of Object.entries({l:'borderLeft',r:'borderRight',t:'borderTop',b:'borderBottom',d:'diagonalDown',u:'diagonalUp'}))if(borders[k]!==undefined){const b=json(at('borderItems',borders[k]));out[name]={style:b.s,color:at('sharedColors',b.c)};}}
    for(const [k,name]of Object.entries(styleFields))if(fields[k]!==undefined)out[name]=['locked','hidden','wordWrap','shrinkToFit'].includes(name)?!!fields[k]:fields[k];
    if(fields.j!==undefined){const fmt=decodePairs(at('numFmts',fields.j)),data=json(at('formatStrings',fmt.f));out.formatter=data.c;}
    return out;
  }
}
function jsonPath(path:string):string {if(path==='xl/workbook.xml')return 'workbook.json';if(/\/theme\/theme\d+\.xml$/.test(path))return 'theme.json';if(path==='xl/styles.xml')return 'styles.json';if(path==='xl/sharedStrings.xml')return 'sharedStrings.json';return path.replace(/^xl\//,'').replace(/^worksheets\//,'sheets/').replace(/\.(?:xml|vml)$/,'.json');}
function xmlPath(path:string):string {if(path==='workbook.json')return 'xl/workbook.xml';if(path==='theme.json')return 'xl/theme/theme1.xml';return (path.startsWith('docProps/')?'':'xl/')+path.replace(/^sheets\//,'worksheets/').replace(/\.json$/,'.xml');}
export function writeSjs(json:RecordValue,options:IoOptions={},state?:IoState):{bytes:Uint8Array;warnings:string[]} {
  const xlsx=writeXlsx(json,{...options,password:undefined,exportSharedFormula:false},state),xml=readZip(xlsx.bytes),files:Record<string,string|Uint8Array>={},styles=new SjsStyles();
  const sheets=Object.values(obj(json.sheets)).map(obj).sort((a,b)=>Number(a.index??0)-Number(b.index??0));
  const styleMap=readStyles(xmlFile(xml,'xl/styles.xml'),defaultTheme).styles.map(s=>styles.encode(s));
  const strings=children(parseXml(xmlFile(xml,'xl/sharedStrings.xml')),'si').map(textOf);
  files['sharedStrings.json']=JSON.stringify(strings);files['styles.json']=JSON.stringify(styles.data);files['theme.json']=JSON.stringify(sheets[0]?.theme??'Office2007');files['docProps/docPropsCore.json']='{}';files['docProps/docPropsApp.json']='{}';
  for(const [path]of Object.entries(xml)){
    if(!path.endsWith('.xml')&&!path.endsWith('.vml'))continue;if(path==='[Content_Types].xml'||['xl/styles.xml','xl/sharedStrings.xml','xl/theme/theme1.xml'].includes(path))continue;
    const root=parseXml(xmlFile(xml,path)),node=toNode(root),rels=relationships(xml,path);
    if(rels.length)node.rels=toNode(parseXml(relationshipXml(rels)));
    if(root.name==='workbook')node.lossless={version:sjsVersion,...Object.fromEntries(Object.entries(json).filter(([k])=>!['sheets','names','sheetCount','version'].includes(k)))};
    if(root.name==='worksheet'){
      const index=Object.keys(xml).filter(p=>/^xl\/worksheets\/sheet\d+\.xml$/.test(p)).indexOf(path),source=sheets[index]??{},data=nodeChildren(node,'sheetData')[0];
      const packed:RecordValue={n_:'sheetData',rowCount:source.rowCount??200,colCount:source.columnCount??20};
      for(const row of children(child(root,'sheetData'),'row')){
        const r=+(row.attrs.r??1)-1,pr:RecordValue={r:r+1};for(const [a,k]of [['ht','h'],['hidden','hd'],['outlineLevel','ol'],['collapsed','cl']])if(row.attrs[a]!==undefined)pr[k]=+row.attrs[a];if(row.attrs.s!==undefined)pr.e=styleMap[+row.attrs.s];
        for(const c of children(row,'c')){const col=/^([A-Z]+)/.exec(c.attrs.r)?.[1]??'A';let ci=0;for(const ch of col)ci=ci*26+ch.charCodeAt(0)-64;const pc:RecordValue={},v=child(c,'v'),raw=textOf(v),f=child(c,'f');
          if(v){if(c.attrs.t==='s')pc.v=+raw;else if(c.attrs.t==='b')pc.b=+raw;else if(c.attrs.t==='e')pc.v={error:raw};else if(c.attrs.t==='str'){pc.v=strings.push(raw)-1;}else pc.n=+raw;}
          if(c.attrs.s!==undefined)pc.e=styleMap[+c.attrs.s];if(f){pc.f=textOf(f);pc.c=1;if(f.attrs.t==='array')pc.a={...f.attrs};}pr[ci-1]=pc;
        }packed[r]=pr;
      }
      const items=arr(node.c_);items[items.indexOf(data)]=packed;
      const defaults=obj(obj(source.data).defaultDataNode).style;
      node.lossless={...Object.fromEntries(Object.entries(source).filter(([k])=>!['name','data','rows','columns','names','index','order'].includes(k))),defaultStyle:defaults??{themeFont:'Body'},rowInfos:source.rows??[],colInfos:source.columns??[],definedNames:source.names??[],selectRanges:Object.entries(obj(source.selections)).filter(([k])=>k!=='length').map(([,v])=>v)};node.order=index;
    }
    files[jsonPath(path)]=JSON.stringify(node);
  }
  files['sharedStrings.json']=JSON.stringify(strings);
  return {bytes:writeZip(files),warnings:xlsx.warnings};
}
export function isSjs(files:Record<string,Uint8Array>):boolean {return !!files['workbook.json'];}
export function readSjs(bytes:Uint8Array,options:IoOptions={}):XlsxResult {
  const source=readZip(bytes),files:Record<string,string|Uint8Array>={},read=(p:string):unknown=>source[p]?JSON.parse(xmlFile(source,p)):undefined,book=obj(read('workbook.json'));
  if(book.n_!=='workbook')throw new Error('Invalid SJS workbook');
  const styles=new SjsStyles(obj(read('styles.json'))),theme=read('theme.json')??'Office2007',writer=new StyleWriter(defaultTheme),strings=arr(read('sharedStrings.json'));
  const styleMap=arr(styles.data.originCellXfs).map((_,i)=>writer.add(styles.decode(i))),cellMap=arr(styles.data.cellXfs).map((_,i)=>writer.add(styles.decode(i,false)));
  files['xl/theme/theme1.xml']=themeXml(defaultTheme);
  files['xl/sharedStrings.xml']=declaration+tag('sst',{xmlns:MAIN,count:strings.length,uniqueCount:strings.length},strings.map(s=>tag('si',{},tag('t',{'xml:space':'preserve'},escapeXml(typeof s==='string'?s:obj(s).text??'')))).join(''));
  const sheetLossless:RecordValue[]=[];
  for(const path of Object.keys(source)){
    if(!path.endsWith('.json')||['theme.json','styles.json','sharedStrings.json'].includes(path))continue;const node=obj(read(path));if(!node.n_)continue;
    const output=xmlPath(path);
    if(node.n_==='worksheet'){
      const packed=nodeChildren(node,'sheetData')[0],rows:string[]=[];
      if(!packed)throw new Error('Missing SJS sheet data');
      for(const [rk,row]of numbers(packed)){
        const cells:string[]=[];for(const [ck,cell]of numbers(row)){
          const attrs:RecordValue={r:address(+rk,+ck),s:cell.e===undefined?(cell.s===undefined?undefined:cellMap[+String(cell.s)]):styleMap[+String(cell.e)]};let value='';
          if(cell.n!==undefined)value=tag('v',{},escapeXml(cell.n));else if(cell.o!==undefined){value=tag('v',{},escapeXml(cell.o));const s=styles.decode(Number(cell.e??0));attrs.s=writer.add({...s,formatter:s.formatter??'M/d/yyyy'});}else if(cell.b!==undefined){attrs.t='b';value=tag('v',{},String(cell.b));}else if(cell.v!==undefined){if(obj(cell.v).error){attrs.t='e';value=tag('v',{},escapeXml(obj(cell.v).error));}else{attrs.t='s';value=tag('v',{},escapeXml(cell.v));}}
          const formula=cell.f===undefined?'':tag('f',cell.a?{...obj(cell.a),t:'array'}:{},escapeXml(cell.f));cells.push(tag('c',attrs,formula+value));
        }
        rows.push(tag('row',{r:+rk+1,ht:row.h,hidden:row.hd,outlineLevel:row.ol,collapsed:row.cl,s:row.e===undefined?undefined:styleMap[+String(row.e)]},cells.join('')));
      }
      const body=arr(node.c_).map(n=>n===packed?tag('sheetData',{},rows.join('')):fromNode(n)).join('');
      files[output]=declaration+tag('worksheet',{xmlns:MAIN,'xmlns:r':REL},body);sheetLossless.push({...obj(node.lossless),name:node.name});
    }else files[output]=declaration+fromNode(node);
    if(node.rels)files[relsPath(output)]=declaration+fromNode(node.rels);
  }
  files['xl/styles.xml']=writer.xml();
  files['_rels/.rels']=relationshipXml([{id:'rId1',type:REL+'/officeDocument',target:'xl/workbook.xml'}]);
  files['[Content_Types].xml']=declaration+tag('Types',{xmlns:'http://schemas.openxmlformats.org/package/2006/content-types'},tag('Default',{Extension:'xml',ContentType:'application/xml'})+tag('Default',{Extension:'rels',ContentType:'application/vnd.openxmlformats-package.relationships+xml'}));
  // Legacy VML relationship targets use .vml although their JSON parts do not.
  for(const path of Object.keys(files).filter(p=>p.endsWith('.rels'))){const root=parseXml(String(files[path]));for(const n of children(root,'Relationship'))if(n.attrs.Target?.endsWith('.vml')){const base=path.replace(/_rels\/([^/]+)\.rels$/,'$1');const target=new URL(n.attrs.Target,'https://sjs/'+base).pathname.slice(1),xml=target.replace(/\.vml$/,'.xml');if(files[xml]){files[target]=files[xml];delete files[xml];}}}
  const result=readXlsx(writeZip(files),options),sheets=Object.values(obj(result.json.sheets)).map(obj);
  Object.assign(result.json,obj(book.lossless));result.json.version='19.2.5';
  sheets.forEach((s,i)=>{const lossless={...sheetLossless[i]};delete lossless.name;const defaultStyle=lossless.defaultStyle;delete lossless.defaultStyle;if(defaultStyle&&options.includeStyles!==false)obj(s.data).defaultDataNode={style:defaultStyle};if(lossless.definedNames)s.names=lossless.definedNames;for(const k of ['definedNames','rowInfos','colInfos','selectRanges'])delete lossless[k];Object.assign(s,lossless);s.theme=lossless.theme??theme;});
  return result;
}
