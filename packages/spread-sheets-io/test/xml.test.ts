import { describe, expect, it } from 'vitest';
import { attrs, children, escapeXml, parseXml, textOf, unescapeXml } from '../src/xml.js';
import { readZip, writeZip, xmlFile } from '../src/zip.js';
import { cellPosition, resolvePart, shiftFormula } from '../src/common.js';
import { builtinFormats, colorXml, isDateFormat, readColor, readStyles, readTheme, StyleWriter, themeXml, tintColor } from '../src/styles.js';
describe('independent XML and OPC layer',()=>{
  it('round-trips Unicode, XML entities, literal entity strings and carriage returns',()=>{const value='😀 <&> "\'\r &amp;';expect(unescapeXml(escapeXml(value))).toBe(value);expect(textOf(parseXml('<a:x xmlns:a="u">a<![CDATA[<&]]><a:t>&#x1f600;</a:t></a:x>'))).toBe('a<&😀');expect(attrs(' a="x&amp;y" b=\'a"b\'')).toEqual({a:'x&y',b:'a"b'});});
  it('rejects DTDs and unbalanced XML',()=>{expect(()=>parseXml('<!DOCTYPE a [<!ENTITY e SYSTEM "x">]><a/>')).toThrow();expect(()=>parseXml('<a><b></a>')).toThrow();expect(()=>parseXml('<a>')).toThrow();});
  it('handles namespace prefixes and empty elements',()=>{const n=parseXml('<r><s:c r="A1"/><s:c r="B1"><s:v>2</s:v></s:c></r>');expect(children(n,'c')).toHaveLength(2);});
  it('ZIP works for empty and Unicode parts and rejects unsafe package paths',()=>{const files=readZip(writeZip({'a.xml':'<a>日本語</a>','empty':''}));expect(xmlFile(files,'a.xml')).toBe('<a>日本語</a>');expect(files.empty).toHaveLength(0);expect(()=>readZip(writeZip({'../bad':'x'}))).toThrow('Unsafe');});
  it('resolves relative relationships without escaping the package',()=>{expect(resolvePart('xl/worksheets/sheet1.xml','../comments1.xml')).toBe('xl/comments1.xml');expect(resolvePart('xl/workbook.xml','/xl/styles.xml')).toBe('xl/styles.xml');expect(()=>resolvePart('','../bad')).toThrow();expect(cellPosition('$XFD$1048576')).toEqual([1048575,16383]);expect(()=>cellPosition('XFE1')).toThrow();});
});
describe('style and shared formula mapping',()=>{
  it('recognizes built-in/custom date formats without mistaking literals for dates',()=>{expect(builtinFormats[14]).toBe('m/d/yyyy');for(const f of ['m/d/yyyy','yyyy-mm-dd hh:mm','[h]:mm:ss','mm:ss.0'])expect(isDateFormat(f),f).toBe(true);for(const f of ['General','0.00E+00','0 "months"','[Red]0.00','0\\m'])expect(isDateFormat(f),f).toBe(false);});
  it('maps indexed, theme, system colors and positive/negative tint',()=>{expect(readTheme(themeXml())).toHaveLength(12);expect(readColor(parseXml('<color theme="4"/>'))).toBe('#4f81bd');expect(readColor(parseXml('<color indexed="10"/>'))).toBe('#ff0000');expect(tintColor('000000',0.5)).toBe('808080');expect(tintColor('FFFFFF',-0.5)).toBe('808080');expect(colorXml('Accent 1 40')).toBe('<color theme="4" tint="0.4"/>');});
  it('round-trips fonts, alignment, protection, fills, borders and custom number formats',()=>{const w=new StyleWriter();const id=w.add({font:'italic bold 12pt Arial',foreColor:'#ff0000',backColor:'#00ff00',borderLeft:{style:6,color:'#0000ff'},formatter:'0.0000',hAlign:2,vAlign:1,wordWrap:true,shrinkToFit:true,textIndent:2,textOrientation:-30,locked:false,hidden:true});const r=readStyles(w.xml());expect(r.styles[id]).toMatchObject({font:'italic bold 12pt Arial',foreColor:'#ff0000',backColor:'#00ff00',borderLeft:{style:6,color:'#0000ff'},formatter:'0.0000',hAlign:2,vAlign:1,wordWrap:true,shrinkToFit:true,textIndent:2,textOrientation:-30,locked:false,hidden:true});expect(w.add({formatter:'0.00'})).toBe(w.add({formatter:'0.00'}));});
  it('shifts mixed/absolute references but protects strings, names and structured references',()=>{expect(shiftFormula('SUM(A1,$B2,C$3,$D$4,"A1",\'A1\'!E5,Table1[A1],A:A,1:2)',2,1)).toBe('SUM(B3,$B4,D$3,$D$4,"A1",\'A1\'!F7,Table1[A1],B:B,3:4)');expect(shiftFormula('A1',-1,0)).toBe('#REF!');});
  it('protects unquoted sheet names that resemble references and distinguishes negative relative offsets',()=>{
    expect(shiftFormula('A1!B2+Sheet1!$C3',2,1)).toBe('A1!C4+Sheet1!$C5');
    expect(shiftFormula('A1',-2,0,true)).not.toBe(shiftFormula('A2',-2,0,true));
    expect(shiftFormula('A1+$B$1',-2,0,true)).toBe(shiftFormula('A2+$B$1',-3,0,true));
  });
});
