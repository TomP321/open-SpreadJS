import { address, arr, bool, cellPosition, normalFormula, obj, range, rangeAddress, type RecordValue, type Rect } from './common.js';
import { child, children, declaration, parseXml, tag, textOf, type XmlNode } from './xml.js';
import { colorXml, readColor, type ReadStyles, type StyleWriter } from './styles.js';
import { MAIN, type Relationship, REL } from './zip.js';
const comparison=['equal','notEqual','greaterThan','greaterThanOrEqual','lessThan','lessThanOrEqual','between','notBetween'];
const validationTypes=['none','whole','decimal','list','date','time','textLength','custom'];
const textOperators=['containsText','notContainsText','beginsWith','endsWith'];
const timePeriods=['today','yesterday','tomorrow','last7Days','thisMonth','lastMonth','nextMonth','thisWeek','lastWeek','nextWeek'];
const scaleTypes=['num','min','max','percent','percentile','autoMin','formula','autoMax'];
const iconSets=['3Arrows','3ArrowsGray','3Triangles','3Stars','3Flags','3TrafficLights1','3TrafficLights2','3Signs','3Symbols','3Symbols2','4Arrows','4ArrowsGray','4RedToBlack','4Rating','4TrafficLights','5Arrows','5ArrowsGray','5Rating','5Quarters','5Boxes'];
function formulaValue(value:unknown):string { if(typeof value==='string'){const d=/^\/OADate\(([-\d.]+)\)\/$/.exec(value);if(d)return d[1];if(value.startsWith('='))return value.slice(1);if(/^[+-]?\d+(?:\.\d+)?$/.test(value))return value;return '"'+value.replace(/"/g,'""')+'"';}return String(value??''); }
function readFormulaValue(value:string):unknown {if(/^"[\s\S]*"$/.test(value))return value.slice(1,-1).replace(/""/g,'"');if(value.trim()!==''&&Number.isFinite(+value))return +value;return '='+normalFormula(value);}
function conditionValue(c:RecordValue):unknown {return c.formula!==undefined?'='+c.formula:c.expected;}
export function writeValidations(values:unknown):string {
  const nodes=arr(values).map(v=>{const d=obj(v),c=obj(d.condition),type=Number(d.type??0),op=Number(d.comparisonOperator??(c.item1?6:c.compareType??0));
    let f1=c.item1?conditionValue(obj(c.item1)):conditionValue(c); const f2=c.item2?conditionValue(obj(c.item2)):undefined;
    if(type===3&&c.formula!==undefined)f1='='+c.formula;
    if((type===4||type===5)&&!c.item1) { /* dates use their own comparison enum */ }
    return tag('dataValidation',{type:validationTypes[type],operator:type!==3&&type!==7&&type!==0?comparison[op]:undefined,sqref:String(d.ranges??'A1').replace(/,\s*/g,' '),allowBlank:d.ignoreBlank!==false,showDropDown:d.inCellDropdown===false?1:undefined,showErrorMessage:d.showErrorMessage!==false,showInputMessage:d.showInputMessage!==false,errorStyle:['stop','warning','information'][Number(d.errorStyle??0)],errorTitle:d.errorTitle,error:d.errorMessage,promptTitle:d.inputTitle,prompt:d.inputMessage},(f1===undefined?'':tag('formula1',{},escapeFormula(type===3&&typeof f1==='string'&&!f1.startsWith('=')?'"'+f1.replace(/"/g,'""')+'"':formulaValue(f1))))+(f2===undefined?'':tag('formula2',{},escapeFormula(formulaValue(f2)))));
  });return nodes.length?tag('dataValidations',{count:nodes.length},nodes.join('')):'';
}
function escapeFormula(s:string):string {return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
export function readValidations(node:XmlNode|undefined):RecordValue[] {
  return children(node,'dataValidation').map(n=>{const a=n.attrs,type=Math.max(0,validationTypes.indexOf(a.type??'none')),op=Math.max(0,comparison.indexOf(a.operator??'between')),f1=textOf(child(n,'formula1')),f2=textOf(child(n,'formula2'));
    const rects=(a.sqref??'A1').split(/\s+/).map(range);let c:RecordValue;
    if(type===3)c=f1.startsWith('"')?{conType:12,expected:readFormulaValue(f1)}:{conType:4,formula:normalFormula(f1)};
    else if(type===7)c={conType:4,formula:normalFormula(f1),customValueType:4};
    else {const ct=type===4?5:type===5?13:type===6?7:1;const expected=(f:string)=>{const v=readFormulaValue(f);return (type===4||type===5)&&typeof v==='number'?`/OADate(${v})/`:v;};
      const part=(f:string,cmp:number):RecordValue=>({conType:ct,compareType:cmp,expected:expected(f),...(type===1?{integerValue:true}:{})});
      const dateOp:Record<number,number>={0:0,1:1,2:4,3:5,4:2,5:3};
      if(op===6||op===7)c={conType:0,compareType:op===6?1:0,item1:part(f1,type===4?5:op===6?3:4),item2:part(f2,type===4?3:op===6?5:2)};
      else c=part(f1,type===4||type===5?dateOp[op]:op);
    }
    c.ignoreBlank=bool(a.allowBlank);c.ranges=rects;
    const d:RecordValue={type,condition:c,ranges:rects.map(rangeAddress).join(', '),highlightStyle:'{"type":0,"color":"red"}'};
    if(type!==3&&type!==7&&type!==0&&(op!==6))d.comparisonOperator=op;
    if(!bool(a.allowBlank))d.ignoreBlank=false;if(bool(a.showDropDown))d.inCellDropdown=false;if(!bool(a.showErrorMessage))d.showErrorMessage=false;if(!bool(a.showInputMessage))d.showInputMessage=false;
    for(const [xml,key]of [['errorTitle','errorTitle'],['error','errorMessage'],['promptTitle','inputTitle'],['prompt','inputMessage']])if(a[xml])d[key]=a[xml];
    if(a.errorStyle&&a.errorStyle!=='stop')d.errorStyle=['stop','warning','information'].indexOf(a.errorStyle);return d;
  });
}
export function writeConditional(values:unknown,styles:StyleWriter,warnings:string[]):string {
  return arr(obj(values).rules).map((v,i)=>{const r=obj(v),t=Number(r.ruleType),a:RecordValue={priority:r.priority??i+1,stopIfTrue:r.stopIfTrue?1:undefined};let body='';
    if(r.style)a.dxfId=styles.dxf(obj(r.style));
    if(t===1){a.type='cellIs';a.operator=comparison[Number(r.operator??0)];body=tag('formula',{},escapeFormula(formulaValue(r.value1)))+([6,7].includes(Number(r.operator))?tag('formula',{},escapeFormula(formulaValue(r.value2))):'');}
    else if(t===3){a.type='expression';body=tag('formula',{},escapeFormula(normalFormula(String(r.formula??r.value1??''))));}
    else if(t===2){a.type=textOperators[Number(r.operator??0)];a.operator=a.type;a.text=r.text;const first=obj(arr(r.ranges)[0]);const ref=address(Number(first.row??0),Number(first.col??0)),q='"'+String(r.text??'').replace(/"/g,'""')+'"';const f=Number(r.operator)===1?`ISERROR(SEARCH(${q},${ref}))`:Number(r.operator)===2?`LEFT(${ref},LEN(${q}))=${q}`:Number(r.operator)===3?`RIGHT(${ref},LEN(${q}))=${q}`:`NOT(ISERROR(SEARCH(${q},${ref})))`;body=tag('formula',{},escapeFormula(f));}
    else if(t===4){a.type='timePeriod';a.timePeriod=timePeriods[Number(r.type)];if(!a.timePeriod){warnings.push(`CF date period ${r.type} has no standard mapping`);return '';}}
    else if(t===5){a.type='top10';a.rank=r.rank??10;a.percent=r.isPercent;a.bottom=Number(r.type)===1;}
    else if(t===6||t===7)a.type=t===6?'uniqueValues':'duplicateValues';
    else if(t===8){a.type='aboveAverage';a.aboveAverage=Number(r.type??0)%2===0;a.equalAverage=Number(r.type??0)>=2;}
    else if(t===10||t===11){a.type='colorScale';const keys=t===11?['min','mid','max']:['min','max'];body=tag('colorScale',{},keys.map(k=>tag('cfvo',{type:scaleTypes[Number(r[k+'Type']??0)],val:normalFormula(String(r[k+'Value']??0))})).join('')+keys.map(k=>colorXml(r[k+'Color'],undefined,'color')).join(''));}
    else if(t===12){a.type='dataBar';body=tag('dataBar',{showValue:r.showBarOnly?0:1},['min','max'].map(k=>tag('cfvo',{type:scaleTypes[Number(r[k+'Type']??0)],val:r[k+'Value']})).join('')+colorXml(r.color??'#638ec6'));if(r.gradient===false||r.showBorder||r.useNegativeFillColor)warnings.push('Advanced data-bar appearance needs x14 extension mapping');}
    else if(t===13){a.type='iconSet';const name=iconSets[Number(r.iconSetType??0)];if(!name){warnings.push('Custom icon set is not mapped');return '';}const criteria=arr(r.iconCriteria??r.criteria);const count=+name[0];body=tag('iconSet',{iconSet:name,showValue:r.showIconOnly?0:1,reverse:r.reverseIconOrder?1:0},Array.from({length:count},(_,j)=>{const c=obj(criteria[j-1]);return tag('cfvo',{type:j===0?'percent':({1:'num',4:'percent',5:'percentile',7:'formula'} as Record<number,string>)[Number(c.iconValueType??4)],val:j===0?0:c.value??j*100/count,gte:c.isGreaterThanOrEqualTo===false?0:1});}).join(''));}
    else {warnings.push(`Conditional rule type ${t} is not mapped`);return '';}
    return tag('conditionalFormatting',{sqref:arr(r.ranges).map(x=>rangeAddress(x as Rect)).join(' ')},tag('cfRule',a,body));
  }).join('');
}
export function readConditional(nodes:XmlNode[],styles:ReadStyles,warnings:string[]):RecordValue {
  const rules:RecordValue[]=[];
  for(const node of nodes)for(const n of children(node,'cfRule')){const a=n.attrs,r:RecordValue={ranges:(node.attrs.sqref??'A1').split(/\s+/).map(range)};if(a.dxfId!==undefined)r.style=styles.dxfs[+a.dxfId];if(a.priority&&+a.priority!==1)r.priority=+a.priority;if(bool(a.stopIfTrue))r.stopIfTrue=true;
    const fs=children(n,'formula').map(textOf);const type=a.type;
    if(type==='cellIs'){r.ruleType=1;r.operator=Math.max(0,comparison.indexOf(a.operator));r.value1='='+normalFormula(fs[0]??'');r.formula=normalFormula(fs[0]??'');if(a.text!==undefined)r.text=a.text;if(fs[1]!==undefined)r.value2='='+normalFormula(fs[1]);}
    else if(type==='expression'){r.ruleType=3;r.formula=normalFormula(fs[0]??'');r.value1='='+r.formula;}
    else if(textOperators.includes(type)){r.ruleType=2;r.operator=textOperators.indexOf(type);r.text=a.text??'';}
    else if(type==='timePeriod'){r.ruleType=4;r.type=timePeriods.indexOf(a.timePeriod);}
    else if(type==='top10'){r.ruleType=5;r.rank=+(a.rank??10);r.type=bool(a.bottom)?1:0;if(bool(a.percent))r.isPercent=true;}
    else if(type==='uniqueValues'||type==='duplicateValues')r.ruleType=type==='uniqueValues'?6:7;
    else if(type==='aboveAverage'){r.ruleType=8;r.type=(bool(a.aboveAverage,true)?0:1)+(bool(a.equalAverage)?2:0);}
    else if(type==='colorScale'||type==='dataBar'){const body=child(n,type),vs=children(body,'cfvo'),cs=children(body,'color');r.ruleType=type==='dataBar'?12:vs.length===3?11:10;const keys=vs.length===3?['min','mid','max']:['min','max'];keys.forEach((k,i)=>{r[k+'Type']=Math.max(0,scaleTypes.indexOf(vs[i]?.attrs.type??'num'));if(vs[i]?.attrs.val!==undefined)r[k+'Value']='='+normalFormula(vs[i].attrs.val);if(type==='colorScale')r[k+'Color']=readColor(cs[i],styles.theme)?.toUpperCase();});if(type==='dataBar'){r.color=readColor(cs[0],styles.theme);if(!bool(body?.attrs.showValue,true))r.showBarOnly=true;}}
    else if(type==='iconSet'){r.ruleType=13;const body=child(n,'iconSet');r.iconSetType=iconSets.indexOf(body?.attrs.iconSet??'3TrafficLights1');if(bool(body?.attrs.reverse))r.reverseIconOrder=true;if(!bool(body?.attrs.showValue,true))r.showIconOnly=true;r.iconCriteria=children(body,'cfvo').slice(1).map(v=>({iconValueType:({num:1,percent:4,percentile:5,formula:7} as Record<string,number>)[v.attrs.type],value:Number.isFinite(+v.attrs.val)?+v.attrs.val:v.attrs.val,isGreaterThanOrEqualTo:bool(v.attrs.gte,true)}));}
    else {warnings.push(`Conditional formatting ${type} retained in source XML`);continue;}
    rules.push(r);
  }return rules.length?{rules}:{};
}
export function writeAutoFilter(raw:unknown,override?:Rect):string {
  const f=obj(raw),rect=override??f.range as Rect|undefined;if(!rect)return '';
  const conditions=arr(f.filterItemMap).map(item=>{const it=obj(item);const cs=arr(it.conditions).map(obj);const allEquals=cs.every(c=>Number(c.compareType??0)===0);return tag('filterColumn',{colId:it.index},allEquals?tag('filters',{},cs.map(c=>tag('filter',{val:c.expected})).join('')):tag('customFilters',{and:0},cs.slice(0,2).map(c=>tag('customFilter',{operator:comparison[Number(c.compareType??0)],val:c.expected})).join('')));}).join('');
  return tag('autoFilter',{ref:rangeAddress(rect)},conditions);
}
export function readAutoFilter(n:XmlNode|undefined,table=false):RecordValue|undefined {
  if(!n?.attrs.ref)return undefined;let rect=range(n.attrs.ref);if(!table&&rect.rowCount>1)rect={...rect,row:rect.row+1,rowCount:rect.rowCount-1};
  const result:RecordValue={typeName:'HideRowFilter',range:rect,showFilterButton:true,dialogVisibleInfo:{},filteredOutRows:[],filterButtonVisibleInfo:Object.fromEntries(Array.from({length:rect.colCount},(_,i)=>[i,true]))};
  const items=children(n,'filterColumn').map(c=>{const filters=child(c,'filters');const vals=filters?children(filters,'filter'):children(child(c,'customFilters'),'customFilter');return {index:+c.attrs.colId,conditions:vals.map(v=>({conType:2,compareType:Math.max(0,comparison.indexOf(v.attrs.operator??'equal')),expected:v.attrs.val}))};});if(items.length){result.filterItemMap=items;result.filteredColumns=items.map(x=>x.index);}return result;
}
export function writeTable(raw:unknown,id:number,warnings:string[]):string {
  const t=obj(raw),rect=t as unknown as Rect,cols=arr(t.columns),style=String(t.style??'medium2'),hasHeader=t.showHeader!==false,hasFooter=t.showFooter===true;
  if(t.layoutStyle)warnings.push(`Table ${t.name}: per-column layout styles are not mapped`);
  const cs=cols.map((v,i)=>{const c=obj(v);return tag('tableColumn',{id:c.id??i+1,name:c.name??'Column'+(i+1),totalsRowLabel:c.footerValue},(c.dataAreaFormula?tag('calculatedColumnFormula',{},escapeFormula(normalFormula(String(c.dataAreaFormula)))):'')+(c.footerFormula?tag('totalsRowFormula',{},escapeFormula(normalFormula(String(c.footerFormula)))):''));}).join('');
  return declaration+tag('table',{xmlns:MAIN,id,name:t.name,displayName:t.name,ref:rangeAddress(rect),headerRowCount:hasHeader?1:0,totalsRowCount:hasFooter?1:undefined,totalsRowShown:hasFooter?1:0},(hasHeader?writeAutoFilter(t.rowFilter,{...rect,rowCount:rect.rowCount-(hasFooter?1:0)}):'')+tag('tableColumns',{count:cols.length},cs)+tag('tableStyleInfo',{name:'TableStyle'+style[0].toUpperCase()+style.slice(1),showFirstColumn:t.highlightFirstColumn===true,showLastColumn:t.highlightLastColumn===true,showRowStripes:t.bandRows!==false,showColumnStripes:t.bandColumns===true}));
}
export function readTable(xml:string,warnings:string[]):RecordValue {
  const n=parseXml(xml),a=n.attrs,rect=range(a.ref),style=child(n,'tableStyleInfo')?.attrs??{},showFooter=+(a.totalsRowCount??0)>0;
  const cols=children(child(n,'tableColumns'),'tableColumn').map(c=>{const x:RecordValue={id:+c.attrs.id,name:c.attrs.name};const cf=child(c,'calculatedColumnFormula'),tf=child(c,'totalsRowFormula');if(cf)x.dataAreaFormula=normalFormula(textOf(cf));if(tf)x.footerFormula=normalFormula(textOf(tf));if(c.attrs.totalsRowLabel)x.footerValue=c.attrs.totalsRowLabel;if(c.attrs.totalsRowFunction&&c.attrs.totalsRowFunction!=='custom')warnings.push(`Table totals function ${c.attrs.totalsRowFunction} retained, not mapped`);return x;});
  const result:RecordValue={name:a.displayName??a.name,...rect,style:(style.name??'TableStyleMedium2').replace(/^TableStyle/,'').replace(/^./,s=>s.toLowerCase()),columns:cols};
  if(a.headerRowCount==='0')result.showHeader=false;if(showFooter)result.showFooter=true;if(!bool(style.showRowStripes))result.bandRows=false;if(bool(style.showColumnStripes))result.bandColumns=true;if(bool(style.showFirstColumn))result.highlightFirstColumn=true;if(bool(style.showLastColumn))result.highlightLastColumn=true;
  const filter=readAutoFilter(child(n,'autoFilter'),true);if(filter){filter.range={...rect,row:rect.row+(a.headerRowCount==='0'?0:1),rowCount:rect.rowCount-(a.headerRowCount==='0'?0:1)-(showFooter?1:0)};filter.tableName=result.name;result.rowFilter=filter;}
  return result;
}
export function commentsXml(values:unknown):string {return declaration+tag('comments',{xmlns:MAIN},tag('authors',{},tag('author',{},'Author'))+tag('commentList',{},arr(values).map(v=>{const c=obj(v);return tag('comment',{ref:address(Number(c.rowIndex),Number(c.colIndex)),authorId:0},tag('text',{},tag('t',{'xml:space':'preserve'},escapeFormula(String(c.text??'')))));}).join('')));}
export function readComments(xml:string):RecordValue[] {return children(child(parseXml(xml),'commentList'),'comment').map(n=>{const [rowIndex,colIndex]=cellPosition(n.attrs.ref);return {rowIndex,colIndex,text:textOf(child(n,'text'))};});}
export function commentsVml(values:unknown):string {
  return `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">`+tag('o:shapelayout',{'v:ext':'edit'},tag('o:idmap',{'v:ext':'edit',data:1}))+tag('v:shapetype',{id:'_x0000_t202',coordsize:'21600,21600','o:spt':202,path:'m,l,21600r21600,l21600,xe'},tag('v:stroke',{joinstyle:'miter'})+tag('v:path',{gradientshapeok:'t','o:connecttype':'rect'}))+arr(values).map((v,i)=>{const c=obj(v);return tag('v:shape',{id:`_x0000_s${1025+i}`,type:'#_x0000_t202',style:'position:absolute;margin-left:80pt;margin-top:5pt;width:108pt;height:59pt;z-index:1;visibility:hidden',fillcolor:'#ffffe1','o:insetmode':'auto'},tag('v:fill',{color2:'#ffffe1'})+tag('v:shadow',{on:'t',color:'black',obscured:'t'})+tag('v:path',{'o:connecttype':'none'})+tag('v:textbox',{style:'mso-direction-alt:auto'},tag('div',{style:'text-align:left'},''))+tag('x:ClientData',{ObjectType:'Note'},tag('x:MoveWithCells')+tag('x:SizeWithCells')+tag('x:AutoFill',{},'False')+tag('x:Row',{},String(c.rowIndex))+tag('x:Column',{},String(c.colIndex))));}).join('')+'</xml>';
}
export function writeHyperlinks(data:RecordValue,rels:Relationship[]):string {
  const links:string[]=[];
  for(const [r,row]of Object.entries(data))for(const [c,raw]of Object.entries(obj(row))){const h=obj(obj(raw).hyperlink);if(!h.url)continue;const url=String(h.url),internal=url.startsWith('#');let id:string|undefined;if(!internal){id=`rId${rels.length+1}`;while(rels.some(r=>r.id===id))id+='x';rels.push({id,type:REL+'/hyperlink',target:url,external:true});}links.push(tag('hyperlink',{ref:address(+r,+c),'r:id':id,location:internal?url.slice(1):undefined,tooltip:h.tooltip,display:h.display}));}
  return links.length?tag('hyperlinks',{},links.join('')):'';
}
