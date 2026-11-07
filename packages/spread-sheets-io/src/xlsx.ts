import { strToU8 } from 'fflate';
import { address, arr, bool, cellPosition, normalFormula, obj, range, rangeAddress, relsPath, resolvePart, shiftFormula, type IoOptions, type IoState, type RecordValue, type Rect } from './common.js';
import { child, children, declaration, descendants, elements, escapeXml, parseXml, section, tag, textOf, type XmlNode } from './xml.js';
import { defaultTheme, isDateFormat, readColor, readStyles, readTheme, StyleWriter, themeXml, colorXml } from './styles.js';
import { MAIN, readZip, related, relationships, relationshipXml, REL, validatePackage, writeZip, xmlFile, type Relationship } from './zip.js';
import { commentsVml, commentsXml, readAutoFilter, readComments, readConditional, readTable, readValidations, writeAutoFilter, writeConditional, writeHyperlinks, writeTable, writeValidations } from './features.js';
export interface XlsxResult { json: RecordValue; state: IoState }
function putCell(data:RecordValue,r:number,c:number):RecordValue {let row=obj(data[r]);if(!data[r])data[r]=row={};let cell=obj(row[c]);if(!row[c])row[c]=cell={};return cell;}
function parseSpreadsheetText(n:XmlNode|undefined):string {return descendants(n,'t').map(textOf).join('').replace(/_x([\da-f]{4})_/gi,(_,hex:string)=>String.fromCharCode(parseInt(hex,16)));}
function spreadsheetText(value:unknown):string {return String(value??'').replace(/_x[\da-f]{4}_/gi,m=>'_x005F_'+m.slice(1)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,c=>`_x${c.charCodeAt(0).toString(16).padStart(4,'0')}_`);}
function outline(items:unknown):RecordValue {return {items:arr(items)};}
const knownSheetSections=new Set(['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetProtection','autoFilter','mergeCells','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','tableParts','legacyDrawing']);
function namesRead(node:XmlNode|undefined,sheets:RecordValue[],workbook:RecordValue):void {
  const names:RecordValue[]=[];
  for(const n of children(node,'definedName')){const a=n.attrs,formula=textOf(n);if(a.name==='_xlnm.Print_Area'||a.name==='_xlnm.Print_Titles'){const s=sheets[+(a.localSheetId??0)];if(s){const p=obj(s.printInfo);p[a.name==='_xlnm.Print_Area'?'printArea':'printTitles']=formula;s.printInfo=p;s.names=[...arr(s.names),{name:a.name.slice(6),formula:normalFormula(formula).replace(/'([A-Za-z_][A-Za-z\d_.]*)'!/g,'$1!'),row:0,col:0}];}continue;}
    const entry={name:a.name,formula:normalFormula(formula),row:0,col:0,...(a.comment?{comment:a.comment}:{})};
    if(a.localSheetId!==undefined){const s=sheets[+a.localSheetId];if(s)s.names=[...arr(s.names),entry];}else names.push(entry);
  }
  if(names.length)workbook.names=names;
}
export function readXlsx(bytes:Uint8Array,options:IoOptions={}):XlsxResult {
  const files=readZip(bytes);validatePackage(files);
  const bookPath=related(files,'','officeDocument'),book=parseXml(xmlFile(files,bookPath)),rels=relationships(files,bookPath),themePath=related(files,bookPath,'theme'),theme=readTheme(xmlFile(files,themePath)),styles=readStyles(xmlFile(files,related(files,bookPath,'styles')),theme);
  const sharedPath=related(files,bookPath,'sharedStrings'),strings=Array.from(elements(xmlFile(files,sharedPath),'si'),s=>parseSpreadsheetText(parseXml(s)));
  const sheetPaths:string[]=[],warnings:string[]=[],sheets:RecordValue[]=[],inlineStrings:{row:number;col:number;value:string}[][]=[];
  const date1904=bool(child(book,'workbookPr')?.attrs.date1904),view=child(child(book,'bookViews'),'workbookView');
  const json:RecordValue={version:'19.2.5',sheetCount:0,sheets:{},activeSheetIndex:+(view?.attrs.activeTab??0)};
  if(view?.attrs.showSheetTabs!==undefined)json.tabStripVisible=bool(view.attrs.showSheetTabs);if(view?.attrs.tabRatio)json.tabStripRatio=+view.attrs.tabRatio/1000;
  if(view?.attrs.showHorizontalScroll!==undefined)json.showHorizontalScrollbar=bool(view.attrs.showHorizontalScroll);if(view?.attrs.showVerticalScroll!==undefined)json.showVerticalScrollbar=bool(view.attrs.showVerticalScroll);
  for(const sn of children(child(book,'sheets'),'sheet')) {
    const rel=rels.find(r=>r.id===sn.attrs['r:id']);if(!rel||rel.external)throw new Error('Invalid sheet relationship');
    const path=resolvePart(bookPath,rel.target),xml=xmlFile(files,path);if(!xml)throw new Error('Missing sheet');
    if(!rel.type.endsWith('/worksheet')){warnings.push(`${sn.attrs.name}: non-worksheet sheet is retained in archive but cannot be displayed`);continue;}
    sheetPaths.push(path);inlineStrings.push([]);const index=sheets.length,data:RecordValue={},rows:RecordValue={},columns:RecordValue={},rowStyles:RecordValue={},colStyles:RecordValue={},rowOutline:unknown[]=[],colOutline:unknown[]=[];
    // Only the current row/cell has an XML tree. Metadata is parsed separately.
    const meta=parseXml(xml.replace(/<(?:\w+:)?sheetData\b[^>]*>[\s\S]*?<\/(?:\w+:)?sheetData>/,'<sheetData/>'));
    const sheetView=child(child(meta,'sheetViews'),'sheetView'),format=child(meta,'sheetFormatPr')?.attrs??{},dimension=child(meta,'dimension')?.attrs.ref;
    const dim=dimension?range(dimension):{row:0,col:0,rowCount:200,colCount:20};
    const s:RecordValue={name:sn.attrs.name,index,order:index,visible:sn.attrs.state==='veryHidden'?2:sn.attrs.state==='hidden'?0:1,isSelected:bool(sheetView?.attrs.tabSelected,index===json.activeSheetIndex),rowCount:Math.max(1,dim.row+dim.rowCount),columnCount:Math.max(1,dim.col+dim.colCount),theme:'Office2007',data:{dataTable:data},rows,columns,rowOutlines:outline(rowOutline),columnOutlines:outline(colOutline)};
    const defaults:RecordValue={};if(format.defaultRowHeight)defaults.rowHeight=+format.defaultRowHeight*4/3;if(format.defaultColWidth)defaults.colWidth=Math.round(+format.defaultColWidth*7);s.defaults=defaults;
    if(options.includeStyles!==false&&styles.styles[0])obj(s.data).defaultDataNode={style:styles.styles[0]};
    const shared=new Map<string,{formula:string;row:number;col:number}>(),pending:{cell:RecordValue;si:string;row:number;col:number}[]=[];
    let lastRow=-1;
    for(const rowXml of elements(xml,'row')){
      const row=parseXml(rowXml),r=row.attrs.r?+row.attrs.r-1:lastRow+1;lastRow=r;if(r<0||r>1048575)throw new Error('Row out of bounds');
      const a=row.attrs,info:RecordValue={};if(a.ht)info.size=+a.ht*4/3;if(bool(a.hidden))info.visible=false;if(Object.keys(info).length)rows[r]=info;
      if(a.s!==undefined&&options.includeStyles!==false)rowStyles[r]={style:styles.styles[+a.s]};
      if(a.outlineLevel||a.collapsed)rowOutline[r]={level:+(a.outlineLevel??0)-1,collapsed:bool(a.collapsed),viewCollapsed:bool(a.hidden)&&+(a.outlineLevel??0)>0};
      let lastCol=-1;
      for(const cn of children(row,'c')){const [cr,cc]=cn.attrs.r?cellPosition(cn.attrs.r):[r,lastCol+1];lastCol=cc;const cell=putCell(data,cr,cc),v=child(cn,'v'),f=child(cn,'f'),type=cn.attrs.t,styleIndex=+(cn.attrs.s??0),raw=textOf(v);
        if(v){if(type==='s'){if(strings[+raw]===undefined)throw new Error('Invalid shared-string index');cell.value=strings[+raw];}else if(type==='b')cell.value=bool(raw);else if(type==='e')cell.value={error:raw};else if(type==='str')cell.value=raw;else if(type==='d'){const date=new Date(raw);if(!Number.isFinite(+date))throw new Error('Invalid date');cell.value=`/OADate(${(+date-Date.UTC(1899,11,30))/86400000})/`;}else if(raw!==''){const num=+raw;if(!Number.isFinite(num))throw new Error('Invalid number');cell.value=isDateFormat(styles.formats[styleIndex]??'General')?`/OADate(${num+(date1904?1462:0)})/`:num;}}
        if(type==='inlineStr'){const inline=child(cn,'is');cell.value=parseSpreadsheetText(inline);const runs=children(inline,'r');if(runs.length)inlineStrings[index].push({row:cr,col:cc,value:parseSpreadsheetText(runs[runs.length-1])});}
        if(options.includeStyles!==false&&cn.attrs.s!==undefined)cell.style=styles.styles[styleIndex]??{};
        if(f&&options.includeFormulas!==false){const formula=normalFormula(textOf(f));if(f.attrs.t==='shared'){if(formula){shared.set(f.attrs.si,{formula,row:cr,col:cc});cell.formula=formula;}else pending.push({cell,si:f.attrs.si,row:cr,col:cc});}else cell.formula=formula;
          if(f.attrs.t==='array'&&f.attrs.ref){const rect=range(f.attrs.ref);const dynamic=cn.attrs.cm!==undefined||descendants(f,'dynamicArrayProperties').length>0;cell.arrayInfo={...rect,...(dynamic?{isDynamicArray:true}:{})};if(!dynamic)cell.arrayFormula={rowCount:rect.rowCount,colCount:rect.colCount};else json.allowDynamicArray=true;}
        }
        s.rowCount=Math.max(Number(s.rowCount),cr+1);s.columnCount=Math.max(Number(s.columnCount),cc+1);
      }
    }
    for(const p of pending){const master=shared.get(p.si);if(!master)throw new Error('Missing shared formula master');p.cell.formula=shiftFormula(master.formula,p.row-master.row,p.col-master.col);}
    for(const n of children(child(meta,'cols'),'col')){const a=n.attrs,min=+a.min-1,max=+a.max-1;if(min<0||max>16383||max<min)throw new Error('Column out of bounds');for(let c=min;c<=max;c++){const info:RecordValue={};if(a.width)info.size=Math.round(+a.width*7);if(bool(a.hidden))info.visible=false;if(Object.keys(info).length)columns[c]=info;if(a.style!==undefined&&options.includeStyles!==false)colStyles[c]={style:styles.styles[+a.style]};if(a.outlineLevel||a.collapsed)colOutline[c]={level:+(a.outlineLevel??0)-1,collapsed:bool(a.collapsed),viewCollapsed:bool(a.hidden)&&+(a.outlineLevel??0)>0};}}
    if(Object.keys(rowStyles).length)obj(s.data).rowDataArray=rowStyles;if(Object.keys(colStyles).length)obj(s.data).columnDataArray=colStyles;
    if(sheetView){const a=sheetView.attrs;if(a.zoomScale)s.zoomFactor=+a.zoomScale/100;if(a.showZeros!==undefined)s.showZeros=bool(a.showZeros);if(a.rightToLeft!==undefined)s.rightToLeft=bool(a.rightToLeft);if(a.showGridLines!==undefined)s.gridline={showHorizontalGridline:bool(a.showGridLines),showVerticalGridline:bool(a.showGridLines)};if(a.showRowColHeaders!==undefined){s.rowHeaderVisible=bool(a.showRowColHeaders);s.colHeaderVisible=bool(a.showRowColHeaders);}const pane=child(sheetView,'pane');if(pane&&['frozen','frozenSplit'].includes(pane.attrs.state)){s.frozenRowCount=+(pane.attrs.ySplit??0);s.frozenColCount=+(pane.attrs.xSplit??0);}const top=pane?.attrs.topLeftCell??a.topLeftCell;if(top){const [r,c]=cellPosition(top);s.topCellIndex=r;s.leftCellIndex=c;}const sels=children(sheetView,'selection');if(sels.length){const sn=sels.find(n=>n.attrs.pane===pane?.attrs.activePane)??sels[0];const active=cellPosition(sn.attrs.activeCell??'A1');s.activeRow=active[0];s.activeCol=active[1];const selections=(sn.attrs.sqref??sn.attrs.activeCell??'A1').split(/\s+/).map(range);s.selections={...Object.fromEntries(selections.map((x,i)=>[i,x])),length:selections.length};}}
    const sheetPr=child(meta,'sheetPr');const tab=readColor(child(sheetPr,'tabColor'),theme);if(tab)s.sheetTabColor=tab;
    const merges=children(child(meta,'mergeCells'),'mergeCell').map(n=>range(n.attrs.ref));if(merges.length)s.spans=merges;
    const protect=child(meta,'sheetProtection');if(protect){s.isProtected=bool(protect.attrs.sheet,true);const p:RecordValue={};for(const k of ['insertRows','insertColumns','deleteRows','deleteColumns','sort','autoFilter','formatCells','formatRows','formatColumns','objects','scenarios','selectLockedCells','selectUnlockedCells'])if(protect.attrs[k]!==undefined)p[k==='objects'?'allowEditObjects':k==='scenarios'?'allowEditScenarios':'allow'+k[0].toUpperCase()+k.slice(1)]=!bool(protect.attrs[k]);if(p.allowEditObjects===undefined)p.allowEditObjects=!bool(protect.attrs.objects);if(p.allowEditScenarios===undefined)p.allowEditScenarios=!bool(protect.attrs.scenarios);s.protectionOptions=p;}
    const sheetRels=relationships(files,path);
    for(const link of children(child(meta,'hyperlinks'),'hyperlink')){const a=link.attrs,rel=sheetRels.find(r=>r.id===a['r:id']),url=rel?.target??(a.location?'#'+a.location:'');const rect=range(a.ref);for(let r=rect.row;r<rect.row+rect.rowCount;r++)for(let c=rect.col;c<rect.col+rect.colCount;c++)putCell(data,r,c).hyperlink={url,tooltip:a.tooltip??'',target:0,command:'',drawUnderline:true,isVisited:false};}
    const cp=related(files,path,'comments');if(cp)s.comments=readComments(xmlFile(files,cp));
    const dvs=readValidations(child(meta,'dataValidations'));if(dvs.length)s.validations=dvs;
    if(options.includeStyles!==false)s.conditionalFormats=readConditional(children(meta,'conditionalFormatting'),styles,warnings);
    const tablePaths=children(child(meta,'tableParts'),'tablePart').map(n=>sheetRels.find(r=>r.id===n.attrs['r:id'])).filter((r):r is Relationship=>!!r&&!r.external).map(r=>resolvePart(path,r.target));if(tablePaths.length)s.tables=tablePaths.map(p=>readTable(xmlFile(files,p),warnings));
    const af=readAutoFilter(child(meta,'autoFilter'));if(af)s.rowFilter=af;
    const p:RecordValue=obj(s.printInfo);for(const k of ['printOptions','pageMargins','pageSetup','headerFooter']){const n=child(meta,k);if(n)p[k]=k==='headerFooter'?{...n.attrs,...Object.fromEntries(n.children.map(c=>[c.name,textOf(c)]))}:{...n.attrs};}if(Object.keys(p).length)s.printInfo=p;
    for(const node of meta.children)if(!knownSheetSections.has(node.name)&&node.name!=='sheetData')warnings.push(`${s.name}: ${node.name} is retained as opaque XLSX XML`);
    for(const [r,row]of Object.entries(data))for(const [c,raw]of Object.entries(obj(row))){void r;void c;const cell=obj(raw);if(Object.keys(cell).length===0)delete obj(row)[c];}
    sheets.push(s);obj(json.sheets)[String(s.name)]=s;
    const progress=options.progress;if(typeof progress==='function')progress({sheetName:s.name,step:'loadSheet',progress:sheets.length/Math.max(1,children(child(book,'sheets'),'sheet').length)});
  }
  namesRead(child(book,'definedNames'),sheets,json);json.sheetCount=sheets.length;
  const calc=child(book,'calcPr');if(calc){json.referenceStyle=calc.attrs.refMode==='R1C1'?1:0;if(calc.attrs.iterate!==undefined)json.iterativeCalculation=bool(calc.attrs.iterate);if(calc.attrs.iterateCount)json.iterativeCalculationMaximumIterations=+calc.attrs.iterateCount;if(calc.attrs.iterateDelta)json.iterativeCalculationMaximumChange=+calc.attrs.iterateDelta;}
  for(const k of ['dynamicReferences','calcOnDemand','incrementalCalculation'])if(options[k]!==undefined)json[k]=options[k];
  return {json,state:{archive:files,sheetPaths,theme,inlineStrings,warnings:[...new Set(warnings)]}};
}
function ownStyle(value:unknown,names:Map<string,RecordValue>,seen=new Set<string>()):RecordValue {if(typeof value==='string'){if(seen.has(value))return {};seen.add(value);return ownStyle(names.get(value),names,seen);}const s=obj(value);return {...(s.parentName?ownStyle(s.parentName,names,seen):{}),...s};}
function namesXml(json:RecordValue,sheets:RecordValue[]):string {
  const all:string[]=[];const emit=(n:unknown,i?:number)=>{const x=obj(n);all.push(tag('definedName',{name:x.name,localSheetId:i,comment:x.comment},escapeXml(normalFormula(String(x.formula??'')))));};
  arr(json.names).forEach(n=>emit(n));sheets.forEach((s,i)=>{arr(s.names).forEach(n=>{const x=obj(n);if(x.name==='Print_Area'||x.name==='Print_Titles'){if(!obj(s.printInfo)[x.name==='Print_Area'?'printArea':'printTitles'])emit({...x,name:'_xlnm.'+x.name},i);}else emit(n,i);});for(const [key,name]of [['printArea','_xlnm.Print_Area'],['printTitles','_xlnm.Print_Titles']])if(obj(s.printInfo)[key])all.push(tag('definedName',{name,localSheetId:i},escapeXml(obj(s.printInfo)[key])));});return all.length?tag('definedNames',{},all.join('')):'';
}
function topLevelRaw(xml:string):{name:string;raw:string}[] {
  if(!xml)return [];const noData=xml.replace(/<(?:\w+:)?sheetData\b[^>]*>[\s\S]*?<\/(?:\w+:)?sheetData>/,'<sheetData/>');const root=parseXml(noData);return root.children.map(n=>({name:n.name,raw:section(noData,n.name)}));
}
export function writeXlsx(json:RecordValue,options:IoOptions={},state?:IoState):{bytes:Uint8Array;warnings:string[]} {
  if(options.password)throw new Error('NotImplemented: encrypted XLSX export');
  for(const k of ['saveAsView','rowHeadersAsFrozenColumns','columnHeadersAsFrozenRows','includeAutoMergedCells'])if(options[k])throw new Error(`NotImplemented: XLSX ${k}`);
  const warnings:string[]=[],sheets=Object.values(obj(json.sheets)).map(obj).sort((a,b)=>Number(a.index??0)-Number(b.index??0));
  if(!sheets.length)throw new Error('Workbook has no sheets');
  const files:Record<string,Uint8Array|string>={...state?.archive},oldFiles=state?.archive??{},bookPath=state?related(oldFiles,'','officeDocument'):'xl/workbook.xml',base=bookPath.slice(0,bookPath.lastIndexOf('/')+1),oldRels=state?relationships(oldFiles,bookPath):[];
  const themePath=related(oldFiles,bookPath,'theme')||`${base}theme/theme1.xml`,stylesPath=related(oldFiles,bookPath,'styles')||`${base}styles.xml`,sharedPath=related(oldFiles,bookPath,'sharedStrings')||`${base}sharedStrings.xml`;
  const theme=state?readTheme(xmlFile(oldFiles,themePath)):defaultTheme,styles=new StyleWriter(theme,xmlFile(oldFiles,stylesPath)),names=new Map<string,RecordValue>(arr(json.namedStyles).map(x=>[String(obj(x).name),obj(x)]));
  const strings:string[]=[],stringIds=new Map<string,number>();let stringCount=0;const shared=(s:string)=>{stringCount++;const old=stringIds.get(s);if(old!==undefined)return old;const id=strings.length;strings.push(s);stringIds.set(s,id);return id;};
  const bookRels=oldRels.filter(r=>!['worksheet','styles','sharedStrings','theme','calcChain'].some(k=>r.type.endsWith('/'+k)));
  const rid=(rels:Relationship[],type:string,target:string,external=false)=>{let i=1;while(rels.some(r=>r.id==='rId'+i))i++;const id='rId'+i;rels.push({id,type:REL+'/'+type,target,external});return id;};
  const relative=(target:string)=>target.startsWith(base)?target.slice(base.length):'/'+target;
  rid(bookRels,'styles',relative(stylesPath));rid(bookRels,'theme',relative(themePath));rid(bookRels,'sharedStrings',relative(sharedPath));
  const sheetEntries:string[]=[],parts:{path:string;type:string}[]=[];let tableId=0,hasDynamic=false;
  const ext=String(options.excelFileType??'XLSX');if(ext!=='XLSX'&&ext!=='XLTX')throw new Error(`NotImplemented: Excel file type ${ext}`);
  sheets.forEach((s,i)=>{
    const path=state?.sheetPaths[i]??`${base}worksheets/sheet${i+1}.xml`,oldXml=xmlFile(oldFiles,path),oldRoot=oldXml?parseXml(oldXml.replace(/<(?:\w+:)?sheetData\b[^>]*>[\s\S]*?<\/(?:\w+:)?sheetData>/,'<sheetData/>')):undefined;
    const id=rid(bookRels,'worksheet',relative(path));sheetEntries.push(tag('sheet',{name:s.name,sheetId:i+1,'r:id':id,state:s.visible===0?'hidden':s.visible===2?'veryHidden':undefined}));
    parts.push({path,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'});
    const rels=relationships(oldFiles,path).filter(r=>!['hyperlink','table','comments','vmlDrawing'].some(k=>r.type.endsWith('/'+k))),data=obj(s.data),cells=obj(data.dataTable),sheetNames=new Map(names);arr(s.namedStyles).forEach(n=>sheetNames.set(String(obj(n).name),obj(n)));
    const rowStyles=obj(data.rowDataArray),colStyles=obj(data.columnDataArray),defaultStyle=ownStyle(obj(data.defaultDataNode).style,sheetNames),rows=obj(s.rows),cols=obj(s.columns),rowOutlines=arr(obj(s.rowOutlines).items),colOutlines=arr(obj(s.columnOutlines).items),defaults=obj(s.defaults);
    const colIndices=new Set([...Object.keys(cols),...Object.keys(colStyles),...Object.keys(colOutlines)]);
    const colXml=[...colIndices].sort((a,b)=>+a-+b).map(k=>{const c=obj(cols[k]),o=obj(colOutlines[+k]),st=options.includeStyles===false?undefined:colStyles[k]?styles.add({...defaultStyle,...ownStyle(obj(colStyles[k]).style,sheetNames)}):undefined;return tag('col',{min:+k+1,max:+k+1,width:c.size===undefined?undefined:Math.floor(Number(c.size)/7*256)/256,customWidth:c.size===undefined?undefined:1,hidden:c.visible===false?1:undefined,style:st,outlineLevel:o.level===undefined?undefined:Math.max(0,Number(o.level)+1),collapsed:o.collapsed?1:undefined});}).join('');
    const rowIndices=new Set([...Object.keys(cells),...Object.keys(rows),...Object.keys(rowStyles),...Object.keys(rowOutlines)]);
    const xmlRows:string[]=[];
    const sharedMasters=new Map<string,{id:number;row:number;col:number;lastRow:number}>(),sharedRanges:{id:number;row:number;col:number;lastRow:number}[]=[];
    for(const rk of [...rowIndices].sort((a,b)=>+a-+b)){
      const r=+rk,info=obj(rows[rk]),o=obj(rowOutlines[r]),rowStyle=ownStyle(obj(rowStyles[rk]).style,sheetNames),xmlCells:string[]=[];
      for(const [ck,raw]of Object.entries(obj(cells[rk])).sort(([a],[b])=>+a-+b)){
        const c=+ck,cell=obj(raw);let value=cell.value;
        // The core's implicit Body theme font is a default, not a direct cell
        // style: materializing it would override table fonts and explicit Arial.
        const inherited=Object.keys(defaultStyle).some(k=>k!=='themeFont')?defaultStyle:{};
        const explicit={...ownStyle(obj(colStyles[ck]).style,sheetNames),...rowStyle,...ownStyle(cell.style,sheetNames)};
        const style=options.includeStyles===false?{}:{...inherited,...explicit};
        if((explicit.font||explicit.fontFamily)&&explicit.themeFont===undefined)delete style.themeFont;
        const d=typeof value==='string'?/^\/OADate\(([-\d.]+)\)\/$/.exec(value):null;if(d){value=+d[1];if(!style.formatter)style.formatter='M/d/yyyy';}
        let formula=options.includeFormulas===false?undefined:cell.formula as string|undefined;
        if(value===undefined&&!formula&&!Object.keys(style).length&&options.includeEmptyRegionCells!==true)continue;
        const a:RecordValue={r:address(r,c)};if(options.includeStyles!==false){const si=styles.add(style);if(si)a.s=si;}
        let f='';
        if(formula){formula=normalFormula(formula);const ai=obj(cell.arrayInfo??cell.arrayFormula);if(ai.isDynamicArray){a.cm=1;hasDynamic=true;}if(ai.rowCount&&ai.colCount)f=tag('f',{t:'array',ref:rangeAddress({row:r,col:c,rowCount:Number(ai.rowCount),colCount:Number(ai.colCount)}),aca:ai.isDynamicArray?1:undefined},escapeXml(formula));
          else if(options.exportSharedFormula!==false){const translated=c+':'+shiftFormula(formula,-r,-c,true),master=sharedMasters.get(translated);if(master&&master.lastRow===r-1){master.lastRow=r;f=tag('f',{t:'shared',si:master.id});}else {const id=sharedRanges.length,next={id,row:r,col:c,lastRow:r};sharedMasters.set(translated,next);sharedRanges.push(next);f=tag('f',{t:'shared',si:id,ref:`__opensheets_shared_${id}__`},escapeXml(formula));}}
          else f=tag('f',{},escapeXml(formula));
        }
        let v='';if(typeof value==='number'){if(Number.isFinite(value))v=tag('v',{},String(value));else{a.t='e';v=tag('v',{},'#NUM!');}}
        else if(typeof value==='boolean'){a.t='b';v=tag('v',{},value?'1':'0');}
        else if(value&&typeof value==='object'&&typeof obj(value).error==='string'){a.t='e';v=tag('v',{},escapeXml(obj(value).error));}
        else if(value!==undefined&&value!==null){if(formula){a.t='str';v=tag('v',{},escapeXml(spreadsheetText(value)));}else{a.t='s';v=tag('v',{},String(shared(spreadsheetText(value))));}}
        xmlCells.push(tag('c',a,f+v));
      }
      const st=options.includeStyles===false?undefined:Object.keys(rowStyle).length?styles.add({...defaultStyle,...rowStyle}):undefined;
      xmlRows.push(tag('row',{r:r+1,ht:info.size===undefined?undefined:Number(info.size)*0.75,customHeight:info.size===undefined?undefined:1,hidden:info.visible===false?1:undefined,s:st,customFormat:st===undefined?undefined:1,outlineLevel:o.level===undefined?undefined:Math.max(0,Number(o.level)+1),collapsed:o.collapsed?1:undefined},xmlCells.join('')));
    }
    const countRows=Math.max(Number(s.rowCount??200),1),countCols=Math.max(Number(s.columnCount??20),1),fr=Number(s.frozenRowCount??0),fc=Number(s.frozenColCount??0),top=Number(s.topCellIndex??fr),left=Number(s.leftCellIndex??fc),pane=fr&&fc?'bottomRight':fr?'bottomLeft':'topRight';
    const sels=Object.entries(obj(s.selections)).filter(([k])=>k!=='length').map(([,v])=>rangeAddress(v as Rect));
    const view=tag('sheetViews',{},tag('sheetView',{workbookViewId:0,tabSelected:Number(json.activeSheetIndex??0)===i?1:undefined,showGridLines:obj(s.gridline).showHorizontalGridline===false||obj(s.gridline).showVerticalGridline===false?0:undefined,showRowColHeaders:s.rowHeaderVisible===false&&s.colHeaderVisible===false?0:undefined,showZeros:s.showZeros===false?0:undefined,rightToLeft:s.rightToLeft?1:undefined,zoomScale:s.zoomFactor===undefined?undefined:Number(s.zoomFactor)*100,topLeftCell:address(fr?0:top,fc?0:left)},(fr||fc?tag('pane',{xSplit:fc||undefined,ySplit:fr||undefined,topLeftCell:address(Math.max(fr,top),Math.max(fc,left)),activePane:pane,state:'frozen'}):'')+tag('selection',{pane:fr||fc?pane:undefined,activeCell:address(Number(s.activeRow??0),Number(s.activeCol??0)),sqref:sels.join(' ')||'A1'})));
    const pr=tag('sheetPr',{},(s.sheetTabColor?colorXml(s.sheetTabColor,theme,'tabColor'):'')+(child(oldRoot,'sheetPr')?section(section(oldXml,'sheetPr'),'outlinePr'):''));
    const protection=s.isProtected?tag('sheetProtection',{...child(oldRoot,'sheetProtection')?.attrs,sheet:1,...Object.fromEntries(Object.entries(obj(s.protectionOptions)).filter(([k])=>k.startsWith('allow')).map(([k,v])=>[k==='allowEditObjects'?'objects':k==='allowEditScenarios'?'scenarios':k[5].toLowerCase()+k.slice(6),v?0:1]))}):'';
    const spans=arr(s.spans),merge=spans.length?tag('mergeCells',{count:spans.length},spans.map(x=>tag('mergeCell',{ref:rangeAddress(x as Rect)})).join('')):'';
    const tables=arr(s.tables).map(t=>{tableId++;const p=`${base}tables/table${tableId}.xml`;files[p]=writeTable(t,tableId,warnings);parts.push({path:p,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml'});return tag('tablePart',{'r:id':rid(rels,'table','/'+p)});});
    const hyperlinks=writeHyperlinks(cells,rels);let commentDrawing='';if(arr(s.comments).length){const p=`${base}comments${i+1}.xml`,vml=`${base}drawings/comments${i+1}.vml`;files[p]=commentsXml(s.comments);files[vml]=commentsVml(s.comments);rid(rels,'comments','/'+p);commentDrawing=tag('legacyDrawing',{'r:id':rid(rels,'vmlDrawing','/'+vml)});parts.push({path:p,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml'});}
    const print=obj(s.printInfo);let printXml='';for(const k of ['printOptions','pageMargins','pageSetup','headerFooter']){const data=obj(print[k]);if(!Object.keys(data).length)continue;if(k==='headerFooter'){const fields=['oddHeader','oddFooter','evenHeader','evenFooter','firstHeader','firstFooter'];printXml+=tag(k,Object.fromEntries(Object.entries(data).filter(([key])=>!fields.includes(key))),fields.filter(f=>data[f]!==undefined).map(f=>tag(f,{},escapeXml(data[f]))).join(''));}else printXml+=tag(k,data);}
    const af=s.rowFilter?writeAutoFilter(s.rowFilter,(()=>{const r=obj(obj(s.rowFilter).range) as unknown as Rect;return {...r,row:Math.max(0,r.row-1),rowCount:r.rowCount+(r.row>0?1:0)};})()):'';
    const preserved=topLevelRaw(oldXml).filter(n=>!knownSheetSections.has(n.name)).map(n=>n.raw).join('');
    const rootAttrs=oldRoot?.attrs??{xmlns:MAIN,'xmlns:r':REL};
    const sharedById=new Map(sharedRanges.map(m=>[m.id,m]));
    const rowXml=xmlRows.join('').replace(/ref="__opensheets_shared_(\d+)__"/g,(_,id:string)=>{const m=sharedById.get(+id)!;return `ref="${rangeAddress({row:m.row,col:m.col,rowCount:m.lastRow-m.row+1,colCount:1})}"`;});
    files[path]=declaration+tag('worksheet',rootAttrs,pr+tag('dimension',{ref:`A1:${address(countRows-1,countCols-1)}`})+view+tag('sheetFormatPr',{defaultRowHeight:Number(defaults.rowHeight??20)*0.75,defaultColWidth:Math.floor(Number(defaults.colWidth??62)/7*256)/256})+(colXml?tag('cols',{},colXml):'')+tag('sheetData',{},rowXml)+protection+af+merge+(options.includeStyles===false?'':writeConditional(s.conditionalFormats,styles,warnings))+writeValidations(s.validations)+hyperlinks+printXml+commentDrawing+(tables.length?tag('tableParts',{count:tables.length},tables.join('')):'')+preserved);
    if(rels.length)files[relsPath(path)]=relationshipXml(rels);else delete files[relsPath(path)];
  });
  const oldBook=xmlFile(oldFiles,bookPath),bookRoot=oldBook?parseXml(oldBook):undefined;
  const bookPr=child(bookRoot,'workbookPr')?.attrs??{};delete bookPr.date1904;
  const bookView=tag('bookViews',{},tag('workbookView',{activeTab:json.activeSheetIndex??0,firstSheet:json.startSheetIndex??0,tabRatio:Number(json.tabStripRatio??0.5)*1000,showSheetTabs:json.tabStripVisible,showHorizontalScroll:json.showHorizontalScrollbar,showVerticalScroll:json.showVerticalScrollbar}));
  files[bookPath]=declaration+tag('workbook',bookRoot?.attrs??{xmlns:MAIN,'xmlns:r':REL},tag('workbookPr',bookPr)+bookView+tag('sheets',{},sheetEntries.join(''))+namesXml(json,sheets)+tag('calcPr',{calcId:0,calcMode:json.calculationMode===1?'manual':'auto',fullCalcOnLoad:1,refMode:json.referenceStyle===1?'R1C1':undefined,iterate:json.iterativeCalculation,iterateCount:json.iterativeCalculationMaximumIterations,iterateDelta:json.iterativeCalculationMaximumChange})+(bookRoot?.children.filter(n=>!['workbookPr','bookViews','sheets','definedNames','calcPr'].includes(n.name)).map(n=>section(oldBook,n.name)).join('')??''));
  files[relsPath(bookPath)]=relationshipXml(bookRels);files['_rels/.rels']=relationshipXml([{id:'rId1',type:REL+'/officeDocument',target:bookPath}]);
  files[stylesPath]=styles.xml();if(!files[themePath])files[themePath]=themeXml(theme);files[sharedPath]=declaration+tag('sst',{xmlns:MAIN,count:stringCount,uniqueCount:strings.length},strings.map(s=>tag('si',{},tag('t',{'xml:space':'preserve'},escapeXml(s)))).join(''));
  if(hasDynamic){
    const path=related(oldFiles,bookPath,'sheetMetadata')||`${base}metadata.xml`;
    if(!files[path]){
      const types=tag('metadataTypes',{count:1},tag('metadataType',{name:'XLDAPR',minSupportedVersion:120000,copy:1,pasteAll:1,pasteValues:1,merge:1,splitFirst:1,rowColShift:1,clearFormats:1,clearComments:1,assign:1,coerce:1,cellMeta:1}));
      const properties=tag('xda:dynamicArrayProperties',{fDynamic:1,fCollapsed:0});
      const extension=tag('ext',{uri:'{BDBB8CDC-FA1E-496E-A857-3C3F30C029C3}'},properties);
      const future=tag('futureMetadata',{name:'XLDAPR',count:1},tag('bk',{},tag('extLst',{},extension)));
      const cells=tag('cellMetadata',{count:1},tag('bk',{},tag('rc',{t:1,v:0})));
      files[path]=declaration+tag('metadata',{xmlns:MAIN,'xmlns:xda':'http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray'},types+future+cells);
    }
    if(!bookRels.some(r=>r.type.endsWith('/sheetMetadata')))rid(bookRels,'sheetMetadata',relative(path));
    files[relsPath(bookPath)]=relationshipXml(bookRels);
    parts.push({path,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml'});
  }
  const typesXml=xmlFile(oldFiles,'[Content_Types].xml'),types=typesXml?parseXml(typesXml):undefined;
  const overrides=new Map(children(types,'Override').map(n=>[n.attrs.PartName,n.attrs.ContentType]));
  overrides.set('/'+bookPath,ext==='XLTX'?'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');overrides.set('/'+stylesPath,'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml');overrides.set('/'+themePath,'application/vnd.openxmlformats-officedocument.theme+xml');overrides.set('/'+sharedPath,'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml');parts.forEach(p=>overrides.set('/'+p.path,p.type));
  const defs=new Map(children(types,'Default').map(n=>[n.attrs.Extension,n.attrs.ContentType]));defs.set('rels','application/vnd.openxmlformats-package.relationships+xml');defs.set('xml','application/xml');defs.set('vml','application/vnd.openxmlformats-officedocument.vmlDrawing');
  files['[Content_Types].xml']=declaration+tag('Types',{xmlns:'http://schemas.openxmlformats.org/package/2006/content-types'},[...defs].map(([Extension,ContentType])=>tag('Default',{Extension,ContentType})).join('')+[...overrides].filter(([p])=>files[p.slice(1)]!==undefined).map(([PartName,ContentType])=>tag('Override',{PartName,ContentType})).join(''));
  if(options.losslessEditing!==false&&state)warnings.push(...state.warnings);
  if(!state){for(const s of sheets)for(const k of ['floatingObjects','sparklineGroups','charts','pivotTables','slicers'])if(arr(s[k]).length)warnings.push(`${s.name}: ${k} XLSX export is not mapped`);}
  return {bytes:writeZip(files),warnings:[...new Set(warnings)]};
}
void strToU8;
