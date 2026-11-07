import { arr, bool, obj, type RecordValue } from './common.js';
import { child, children, descendants, elements, escapeXml, parseXml, section, tag, type XmlNode, declaration } from './xml.js';
import { MAIN } from './zip.js';
export const builtinFormats: Record<number,string> = {
  0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',11:'0.00E+00',12:'# ?/?',13:'# ??/??',14:'m/d/yyyy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',18:'h:mm AM/PM',19:'h:mm:ss AM/PM',20:'h:mm',21:'h:mm:ss',22:'m/d/yyyy h:mm',37:'#,##0 ;(#,##0)',38:'#,##0 ;[Red](#,##0)',39:'#,##0.00;(#,##0.00)',40:'#,##0.00;[Red](#,##0.00)',45:'mm:ss',46:'[h]:mm:ss',47:'mmss.0',48:'##0.0E+0',49:'@',
};
export function isDateFormat(format: string): boolean {
  const s=format.replace(/"[^"]*"|\\.|_.|\*.|\[(?![hms]+\])[^\]]*\]/gi,'');
  return /[ymdhis]/i.test(s)&&!/^General$/i.test(s);
}
export const defaultTheme = ['FFFFFF','000000','EEECE1','1F497D','4F81BD','C0504D','9BBB59','8064A2','4BACC6','F79646','0000FF','800080'];
const colorNames = ['Background 1','Text 1','Background 2','Text 2','Accent 1','Accent 2','Accent 3','Accent 4','Accent 5','Accent 6','Hyperlink','Followed Hyperlink'];
const indexed = ['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000','000080','808000','800080','008080','C0C0C0','808080','9999FF','993366','FFFFCC','CCFFFF','660066','FF8080','0066CC','CCCCFF','000080','FF00FF','FFFF00','00FFFF','800080','800000','008080','0000FF','00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99','3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696','003366','339966','003300','333300','993300','993366','333399','333333'];
export function readTheme(xml: string): string[] {
  if(!xml)return [...defaultTheme];const n=descendants(parseXml(xml),'clrScheme')[0];if(!n)return [...defaultTheme];
  const slots=['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];
  return slots.map((slot,i)=>{const c=child(n,slot)?.children[0];return c?.attrs.lastClr??c?.attrs.val??defaultTheme[i];});
}
/** OOXML tint changes HSL luminance, preserving hue and saturation. */
export function tintColor(rgb: string, tint: number): string {
  const parts=rgb.match(/.{2}/g)!.map(x=>parseInt(x,16)/255),max=Math.max(...parts),min=Math.min(...parts),d=max-min;
  let l=(max+min)/2, h=0, s=0;
  if(d){s=d/(1-Math.abs(2*l-1));h=max===parts[0]?((parts[1]-parts[2])/d)%6:max===parts[1]?(parts[2]-parts[0])/d+2:(parts[0]-parts[1])/d+4;h=(h/6+1)%1;}
  l=tint<0?l*(1+tint):l+(1-l)*tint;
  const a=s*Math.min(l,1-l),f=(n:number)=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return [f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function readColor(n: XmlNode | undefined, theme: string[] = defaultTheme): string | undefined {
  if(!n)return undefined;const a=n.attrs;
  let rgb=a.rgb?.slice(-6)??(a.theme!==undefined?theme[+a.theme]:a.indexed!==undefined?indexed[+a.indexed]:a.auto?'000000':undefined);
  if(!rgb)return undefined;if(a.tint)rgb=tintColor(rgb,+a.tint);return '#'+rgb.toLowerCase();
}
export function colorXml(value: unknown, theme: string[]=defaultTheme, name='color'): string {
  const color=String(value??'#000000').trim();const idx=colorNames.findIndex(s=>color===s||color.startsWith(s+' '));
  if(idx>=0){const t=color.slice(colorNames[idx].length).trim();return tag(name,{theme:idx,tint:t?+t/100:undefined});}
  let rgb=color.replace(/^#/,'');
  if(/^[a-f\d]{3}$/i.test(rgb))rgb=rgb.split('').map(x=>x+x).join('');
  if(!/^[a-f\d]{6,8}$/i.test(rgb)){
    const named:Record<string,string>={black:'000000',white:'ffffff',red:'ff0000',green:'008000',blue:'0000ff',yellow:'ffff00',gray:'808080',grey:'808080',orange:'ffa500',purple:'800080',transparent:'ffffff'};
    rgb=named[color.toLowerCase()]??'';
    const m=/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);if(m)rgb=m.slice(1,4).map(x=>Math.max(0,Math.min(255,+x)).toString(16).padStart(2,'0')).join('');
    if(!rgb)throw new Error(`NotImplemented: XLSX CSS colour ${color}`);
  }
  void theme;return tag(name,{rgb:(rgb.length===6?'FF':'')+rgb.toUpperCase()});
}
const borderStyles=['','thin','medium','dashed','dotted','thick','double','hair','mediumDashed','dashDot','mediumDashDot','dashDotDot','mediumDashDotDot','slantDashDot'];
const hAligns=['left','center','right','general','centerContinuous','distributed','justify'];
const vAligns=['top','center','bottom','justify','distributed'];
function readFont(n: XmlNode|undefined,theme:string[]):RecordValue {
  if(!n)return {};const s:RecordValue={};const name=child(n,'name')?.attrs.val,size=child(n,'sz')?.attrs.val;
  const bold=child(n,'b'),italic=child(n,'i');
  if(name)s.fontFamily=name;if(size)s.fontSize=size+'pt';
  if(bold)s.fontWeight=bool(bold.attrs.val,true)?'bold':'normal';if(italic)s.fontStyle=bool(italic.attrs.val,true)?'italic':'normal';
  if(name||size||bold||italic)s.font=`${italic&&bool(italic.attrs.val,true)?'italic ':''}${bold&&bool(bold.attrs.val,true)?'bold ':''}${size??11}pt ${name??'Calibri'}`;
  const c=readColor(child(n,'color'),theme);if(c)s.foreColor=c;
  if(child(n,'u'))s.textDecoration=child(n,'u')?.attrs.val==='double'?2:1;if(child(n,'strike'))s.textDecoration=Number(s.textDecoration??0)|4;
  const scheme=child(n,'scheme')?.attrs.val;if(scheme)s.themeFont=scheme==='major'?'Headings':'Body';
  return s;
}
function readFill(n:XmlNode|undefined,theme:string[]):RecordValue {const p=child(n,'patternFill');const c=readColor(child(p,'fgColor'),theme);return p?.attrs.patternType==='solid'&&c?{backColor:c}:{};}
function readBorder(n:XmlNode|undefined,theme:string[]):RecordValue {
  const s:RecordValue={};for(const [xml,key] of [['left','borderLeft'],['right','borderRight'],['top','borderTop'],['bottom','borderBottom'],['diagonal','diagonalDown']] as const){const b=child(n,xml);if(!b?.attrs.style)continue;const style=borderStyles.indexOf(b.attrs.style);s[key]={color:readColor(child(b,'color'),theme)??'#000000',style:Math.max(0,style)};if(xml==='diagonal'){if(bool(n?.attrs.diagonalUp))s.diagonalUp=s[key];if(!bool(n?.attrs.diagonalDown))delete s[key];}}return s;
}
export interface ReadStyles { styles: RecordValue[]; formats:string[]; dxfs:RecordValue[]; theme:string[] }
export function readStyles(xml:string,theme:string[]=defaultTheme): ReadStyles {
  const root=xml?parseXml(xml):undefined;
  const fonts=children(child(root,'fonts'),'font').map(n=>readFont(n,theme)),fills=children(child(root,'fills'),'fill').map(n=>readFill(n,theme)),borders=children(child(root,'borders'),'border').map(n=>readBorder(n,theme));
  const formats:Record<number,string>={...builtinFormats};for(const n of children(child(root,'numFmts'),'numFmt'))formats[+n.attrs.numFmtId]=n.attrs.formatCode;
  const all=children(child(root,'cellXfs'),'xf');const effectiveFormats:string[]=[];
  const styles=all.map(n=>{const a=n.attrs;const s:RecordValue={vAlign:2,...fonts[+(a.fontId??0)],...fills[+(a.fillId??0)],...borders[+(a.borderId??0)]};
    const format=formats[+(a.numFmtId??0)]??'General';effectiveFormats.push(format);if(format!=='General')s.formatter=format;
    const al=child(n,'alignment');if(al){const a=al.attrs;if(a.horizontal)s.hAlign=Math.max(0,hAligns.indexOf(a.horizontal));if(a.vertical)s.vAlign=Math.max(0,vAligns.indexOf(a.vertical));if(a.wrapText!==undefined)s.wordWrap=bool(a.wrapText);if(a.shrinkToFit!==undefined)s.shrinkToFit=bool(a.shrinkToFit);if(a.indent)s.textIndent=+a.indent;if(a.textRotation)s.textOrientation=+a.textRotation===255?255:+a.textRotation>90?90-(+a.textRotation):+a.textRotation;}
    const protection=child(n,'protection');if(protection?.attrs.locked!==undefined)s.locked=bool(protection.attrs.locked);if(protection?.attrs.hidden!==undefined)s.hidden=bool(protection.attrs.hidden);if(bool(a.quotePrefix))s.quotePrefix=true;
    return s;});
  const dxfs=children(child(root,'dxfs'),'dxf').map(n=>({...readFont(child(n,'font'),theme),...readFill(child(n,'fill'),theme),...readBorder(child(n,'border'),theme),...(child(n,'numFmt')?{formatter:child(n,'numFmt')!.attrs.formatCode}:{})}));
  return {styles:styles.length?styles:[{}],formats:effectiveFormats.length?effectiveFormats:['General'],dxfs,theme};
}
function fontXml(s:RecordValue,theme:string[],dxf=false):string {
  const f=String(s.font??'').match(/^(.*?)\s*(\d+(?:\.\d+)?)(px|pt)\s+(.+)$/);
  const family=s.fontFamily??f?.[4],size=s.fontSize?parseFloat(String(s.fontSize))*(String(s.fontSize).endsWith('px')?0.75:1):f?+f[2]*(f[3]==='px'?0.75:1):undefined;
  const bold=s.fontWeight!==undefined?/bold|[6-9]00/.test(String(s.fontWeight)):f?/bold|[6-9]00/.test(f[1]):undefined;
  const italic=s.fontStyle!==undefined?/italic|oblique/.test(String(s.fontStyle)):f?/italic|oblique/.test(f[1]):undefined;
  const t=Number(s.textDecoration??0);
  return tag('font',{},(bold===undefined?'':tag('b',{val:+bold}))+(italic===undefined?'':tag('i',{val:+italic}))+(size===undefined?(dxf?'':tag('sz',{val:11})):tag('sz',{val:size}))+(family===undefined?(dxf?'':tag('name',{val:'Calibri'})):tag('name',{val:family}))+(s.foreColor?colorXml(s.foreColor,theme):dxf?'':tag('color',{theme:1}))+(t&3?tag('u',{val:t&2?'double':'single'}):'')+(t&4?tag('strike'):'')+(s.themeFont?tag('scheme',{val:s.themeFont==='Headings'?'major':'minor'}):''));
}
function fillXml(s:RecordValue,theme:string[]):string {return tag('fill',{},tag('patternFill',{patternType:s.backColor?'solid':'none'},s.backColor?colorXml(s.backColor,theme,'fgColor')+tag('bgColor',{indexed:64}):''));}
function borderXml(s:RecordValue,theme:string[],dxf=false):string {
  return tag('border',{diagonalUp:s.diagonalUp?1:undefined,diagonalDown:s.diagonalDown?1:undefined},[['left','borderLeft'],['right','borderRight'],['top','borderTop'],['bottom','borderBottom'],['diagonal','diagonalDown']].map(([xml,key])=>{const b=obj(s[key]??(xml==='diagonal'?s.diagonalUp:undefined));if(!Object.keys(b).length)return dxf?'':tag(xml);return tag(xml,{style:borderStyles[Number(b.style)]||undefined},b.color?colorXml(b.color,theme):'');}).join(''));
}
function key(s:RecordValue):string {return JSON.stringify(Object.entries(s).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)));}
export class StyleWriter {
  private fonts:string[]=[];private fills:string[]=[];private borders:string[]=[];private xfs:string[]=[];private dxfs:string[]=[];private formats:Record<number,string>={};private styles=new Map<string,number>();private dxfKeys=new Map<string,number>();
  private original='';
  constructor(private theme:string[]=defaultTheme,xml=''){
    this.original=xml;
    for(const [sectionName,item,target]of [['fonts','font',this.fonts],['fills','fill',this.fills],['borders','border',this.borders],['cellXfs','xf',this.xfs],['dxfs','dxf',this.dxfs]]as const)target.push(...elements(section(xml,sectionName),item));
    if(xml){const r=readStyles(xml,theme);r.styles.forEach((s,i)=>this.styles.set(key(s),i));for(const n of children(child(parseXml(xml),'numFmts'),'numFmt'))this.formats[+n.attrs.numFmtId]=n.attrs.formatCode;}
    if(!this.fonts.length)this.fonts.push(fontXml({themeFont:'Body'},theme));if(!this.fills.length)this.fills.push(fillXml({},theme),tag('fill',{},tag('patternFill',{patternType:'gray125'})));if(!this.borders.length)this.borders.push(borderXml({},theme));if(!this.xfs.length)this.xfs.push(tag('xf',{numFmtId:0,fontId:0,fillId:0,borderId:0,xfId:0},tag('alignment',{vertical:'top'})));this.styles.set(key({}),0);
  }
  private intern(list:string[],xml:string):number {const i=list.indexOf(xml);if(i>=0)return i;list.push(xml);return list.length-1;}
  private formatId(format:unknown):number {if(!format||format==='General')return 0;const b=Object.entries(builtinFormats).find(([,f])=>f===format);if(b)return +b[0];const old=Object.entries(this.formats).find(([,f])=>f===format);if(old)return +old[0];let id=164;while(this.formats[id]!==undefined)id++;this.formats[id]=String(format);return id;}
  add(s:RecordValue):number {
    const k=key(s),old=this.styles.get(k);if(old!==undefined)return old;
    const fontId=this.intern(this.fonts,fontXml(s,this.theme)),fillId=this.intern(this.fills,fillXml(s,this.theme)),borderId=this.intern(this.borders,borderXml(s,this.theme)),numFmtId=this.formatId(s.formatter);
    const alignment:RecordValue={horizontal:s.hAlign===undefined?undefined:hAligns[Number(s.hAlign)],vertical:s.vAlign===undefined?undefined:vAligns[Number(s.vAlign)],wrapText:s.wordWrap,shrinkToFit:s.shrinkToFit,indent:s.textIndent,textRotation:s.textOrientation===undefined?undefined:Number(s.textOrientation)<0?90-Number(s.textOrientation):s.textOrientation};
    const hasAl=Object.values(alignment).some(v=>v!==undefined),hasPr=s.locked!==undefined||s.hidden!==undefined;
    const xml=tag('xf',{numFmtId,fontId,fillId,borderId,xfId:0,applyFont:1,applyFill:1,applyBorder:1,applyNumberFormat:1,applyAlignment:hasAl?1:undefined,applyProtection:hasPr?1:undefined,quotePrefix:s.quotePrefix?1:undefined},(hasAl?tag('alignment',alignment):'')+(hasPr?tag('protection',{locked:s.locked,hidden:s.hidden}):''));
    const id=this.intern(this.xfs,xml);this.styles.set(k,id);return id;
  }
  dxf(s:RecordValue):number {const k=key(s),old=this.dxfKeys.get(k);if(old!==undefined)return old;
    const body=(s.font||s.fontFamily||s.foreColor||s.fontWeight||s.fontStyle||s.fontSize||s.textDecoration?fontXml(s,this.theme,true):'')+(s.backColor?fillXml(s,this.theme).replace('<bgColor indexed="64"/>',colorXml(s.backColor,this.theme,'bgColor')):'')+(Object.keys(s).some(k=>k.startsWith('border')||k.startsWith('diagonal'))?borderXml(s,this.theme,true):'')+(s.formatter?tag('numFmt',{numFmtId:this.formatId(s.formatter),formatCode:s.formatter}):'');
    const id=this.intern(this.dxfs,tag('dxf',{},body));this.dxfKeys.set(k,id);return id;
  }
  xml():string {
    const list=(name:string,items:string[])=>tag(name,{count:items.length},items.join(''));
    return declaration+tag('styleSheet',{xmlns:MAIN},list('numFmts',Object.entries(this.formats).map(([id,formatCode])=>tag('numFmt',{numFmtId:id,formatCode})))+list('fonts',this.fonts)+list('fills',this.fills)+list('borders',this.borders)+(section(this.original,'cellStyleXfs')||list('cellStyleXfs',[tag('xf',{numFmtId:0,fontId:0,fillId:0,borderId:0},tag('alignment',{vertical:'top'}))]))+list('cellXfs',this.xfs)+(section(this.original,'cellStyles')||list('cellStyles',[tag('cellStyle',{name:'Normal',xfId:0,builtinId:0})]))+list('dxfs',this.dxfs)+(section(this.original,'tableStyles')||tag('tableStyles',{count:0,defaultTableStyle:'TableStyleMedium2',defaultPivotStyle:'PivotStyleLight16'})));
  }
}
export function themeXml(colors:string[]=defaultTheme):string {
  const slots=['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];
  return declaration+tag('a:theme',{'xmlns:a':'http://schemas.openxmlformats.org/drawingml/2006/main',name:'OpenSheets'},tag('a:themeElements',{},tag('a:clrScheme',{name:'OpenSheets'},slots.map((s,i)=>tag('a:'+s,{},tag('a:srgbClr',{val:colors[i]}))).join(''))+tag('a:fontScheme',{name:'OpenSheets'},['major','minor'].map(s=>tag(`a:${s}Font`,{},tag('a:latin',{typeface:s==='minor'?'Calibri':'Cambria'})+tag('a:ea',{typeface:''})+tag('a:cs',{typeface:''}))).join(''))+tag('a:fmtScheme',{name:'OpenSheets'},tag('a:fillStyleLst')+tag('a:lnStyleLst')+tag('a:effectStyleLst')+tag('a:bgFillStyleLst'))));
}
void arr;void escapeXml;
