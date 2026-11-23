import { expect, it } from 'vitest';
import { readXlsx, writeXlsx } from '../src/xlsx.js';
import { readZip, validatePackage, writeZip, xmlFile } from '../src/zip.js';
import { parseCsv, csvSheet } from '../src/csv.js';
import { obj } from '../src/common.js';
import { decryptXlsx } from '../src/encryption.js';
import { Workbook } from '../../spread-sheets/src/model.js';
function book(){return {sheets:{Data:{name:'Data',rowCount:1000000,columnCount:16384,data:{dataTable:{0:{0:{value:' <&😀 '},1:{value:42.5},2:{value:true},3:{value:{error:'#DIV/0!'}},4:{value:'/OADate(45293)/'}},2:{0:{formula:'B1*2',value:85}},999999:{16383:{value:'edge'}}}},spans:[{row:3,col:0,rowCount:2,colCount:2}],rows:{1:{size:33,visible:false}},columns:{2:{size:111,visible:false}},frozenRowCount:1,frozenColCount:2,names:[{name:'local',formula:'Data!$A$1'}],comments:[{rowIndex:0,colIndex:0,text:'Hello <&'}],sheetTabColor:'#ff00ff'},Hidden:{name:'Hidden',index:1,visible:0,data:{}}},names:[{name:'Global',formula:'Data!$B$1'}]};}
it('keeps the implicit Body font below table fonts and explicit cell fonts',async()=>{
  const source={sheets:{Data:{name:'Data',data:{defaultDataNode:{style:{themeFont:'Body'}},dataTable:{0:{0:{value:'Header'}},1:{0:{value:'Arial',style:{font:'bold 12pt Arial',fontFamily:'Arial'}}}}},tables:[{name:'T',row:0,col:0,rowCount:2,colCount:1,style:'medium2',columns:[{id:1,name:'Header'}]}]}}};
  const json=readXlsx(writeXlsx(source).bytes).json,w=new Workbook();
  await w.fromJSON(json);
  expect(w.getActiveSheet().getActualStyle(0,0)).toMatchObject({foreColor:'white',fontWeight:'bold'});
  const cell=obj(obj(obj(obj(obj(json.sheets).Data).data).dataTable)[1])[0];
  expect(obj(obj(cell).style).fontFamily).toBe('Arial');
  expect(obj(obj(cell).style).themeFont).toBeUndefined();w.destroy();
});
it('writes shared formula blocks with complete ranges and preserves distinct references above anchors',()=>{
  const data={0:{0:{value:1}},2:{1:{formula:'A1',value:1},2:{formula:'A2'}},3:{1:{formula:'A2'},2:{formula:'A2'}},4:{1:{formula:'A3'}}};
  const json={sheets:{Data:{name:'Data',data:{dataTable:data}}}};
  const {bytes}=writeXlsx(json);const xml=xmlFile(readZip(bytes),'xl/worksheets/sheet1.xml');
  expect(xml).toContain('ref="B3:B5"');
  const cells=obj(obj(obj(obj(readXlsx(bytes).json.sheets).Data).data).dataTable);
  for(const [r,row]of Object.entries(data))for(const [c,cell]of Object.entries(row))if('formula'in cell)expect(obj(obj(cells[r])[c]).formula).toBe(cell.formula);
  expect(xmlFile(readZip(writeXlsx(json,{exportSharedFormula:false}).bytes),'xl/worksheets/sheet1.xml')).not.toContain('t="shared"');
});
it('writes a structurally valid sparse XLSX and reads the scope without dense allocation',()=>{const written=writeXlsx(book());const files=readZip(written.bytes);validatePackage(files);expect(written.bytes.length).toBeLessThan(10000);expect(xmlFile(files,'xl/worksheets/sheet1.xml').match(/<row\b/g)).toHaveLength(4);const {json}=readXlsx(written.bytes);const s=obj(obj(json.sheets).Data),data=obj(obj(s.data).dataTable);expect(obj(data[0])).toMatchObject({0:{value:' <&😀 '},1:{value:42.5},2:{value:true},3:{value:{error:'#DIV/0!'}},4:{value:'/OADate(45293)/'}});expect(obj(data[2])).toMatchObject({0:{formula:'B1*2',value:85}});expect(s).toMatchObject({rowCount:1000000,columnCount:16384,frozenRowCount:1,frozenColCount:2,spans:[{row:3,col:0,rowCount:2,colCount:2}],sheetTabColor:'#ff00ff',comments:[{rowIndex:0,colIndex:0,text:'Hello <&'}]});expect(obj(obj(json.sheets).Hidden).visible).toBe(0);expect(json.names).toMatchObject([{name:'Global',formula:'Data!$B$1'}]);});
it('reads independently hand-authored shared/array formulas and inline strings',()=>{const files=readZip(writeXlsx({sheets:{Data:{name:'Data',data:{}}}}).bytes);files['xl/worksheets/sheet1.xml']=new TextEncoder().encode('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E4"/><sheetData><row r="1"><c r="A1"><f t="shared" ref="A1:B2" si="0">C1+$D$1+E$1+$F1</f><v>1</v></c><c r="B1"><f t="shared" si="0"/><v>2</v></c></row><row r="2"><c r="A2"><f t="shared" si="0"/><v>3</v></c><c r="B2"><f t="shared" si="0"/><v>4</v></c><c r="E2" t="inlineStr"><is><r><t>Hello </t></r><r><t>XML</t></r></is></c></row><row r="3"><c r="A3"><f t="array" ref="A3:A4">ROW(A1:A2)</f><v>1</v></c></row></sheetData></worksheet>');const {json}=readXlsx(writeZip(files));const cells=obj(obj(obj(obj(json.sheets).Data).data).dataTable);expect(obj(obj(cells[0])[1]).formula).toBe('D1+$D$1+F$1+$F1');expect(obj(obj(cells[1])[1]).formula).toBe('D2+$D$1+F$1+$F2');expect(obj(obj(cells[1])[4]).value).toBe('Hello XML');expect(obj(obj(cells[2])[0]).arrayFormula).toEqual({rowCount:2,colCount:1});});
it('accounts for and preserves unknown sheet XML parts across editing and export',()=>{const files=readZip(writeXlsx({sheets:{Data:{name:'Data',data:{}}}}).bytes);const xml=xmlFile(files,'xl/worksheets/sheet1.xml').replace('</worksheet>','<extLst><ext uri="urn:independent:test"><payload>Keep me</payload></ext></extLst></worksheet>');files['xl/worksheets/sheet1.xml']=new TextEncoder().encode(xml);const imported=readXlsx(writeZip(files));expect(imported.state.warnings).toContain('Data: extLst is retained as opaque XLSX XML');expect(xmlFile(readZip(writeXlsx(imported.json,{},imported.state).bytes),'xl/worksheets/sheet1.xml')).toContain('<payload>Keep me</payload>');});
it('honors includeStyles/includeFormulas and encrypts the package when a password is given',()=>{const json={sheets:{Data:{name:'Data',data:{dataTable:{0:{0:{value:2,formula:'1+1',style:{backColor:'#ff0000'}}}}}}}};const read=readXlsx(writeXlsx(json,{includeStyles:false,includeFormulas:false}).bytes).json;expect(obj(obj(obj(obj(obj(read.sheets).Data).data).dataTable)[0])[0]).toEqual({value:2});
  const enc=writeXlsx(json,{password:'secret'}).bytes;
  expect([...enc.slice(0,4)]).toEqual([0xd0,0xcf,0x11,0xe0]);
  expect(()=>readXlsx(enc)).toThrow();
  expect(obj(obj(obj(obj(obj(readXlsx(decryptXlsx(enc,'secret')).json.sheets).Data).data).dataTable)[0])[0]).toMatchObject({value:2});
  try{decryptXlsx(enc,'wrong');expect.unreachable();}catch(error){expect(obj(error).errorCode).toBe(3);}
});
it('prepends row-header and column-header content as frozen columns/rows on export',()=>{const json={sheets:{Data:{name:'Data',rowCount:5,columnCount:3,data:{dataTable:{0:{0:{value:'x'}},1:{1:{formula:'A1',value:1}}}},rowHeaderData:{dataTable:{0:{0:{value:'RH0'}},1:{0:{value:'RH1'}}},defaultDataNode:{}},colHeaderData:{dataTable:{0:{0:{value:'CH0'},1:{value:'CH1'}}},defaultDataNode:{}}}}};
  const {bytes}=writeXlsx(json,{rowHeadersAsFrozenColumns:true});const xml=xmlFile(readZip(bytes),'xl/worksheets/sheet1.xml');
  expect(xml).toContain('<pane xSplit="1"');expect(xml).toContain('r="A2"');expect(xml).toContain('r="B1"');expect(xml).toContain('>B1</f>');expect(xml).not.toContain('<c r="A1"><f');
  const back=obj(obj(obj(obj(readXlsx(bytes).json.sheets).Data).data).dataTable);expect(obj(back[1])[0]).toMatchObject({value:'RH1'});expect(obj(back[0])[1]).toMatchObject({value:'x'});expect(obj(back[1])[2]).toMatchObject({formula:'B1'});
  const {bytes:colBytes}=writeXlsx(json,{columnHeadersAsFrozenRows:true});const colXml=xmlFile(readZip(colBytes),'xl/worksheets/sheet1.xml');
  expect(colXml).toContain('<pane ySplit="1"');expect(colXml).toContain('r="A1"');expect(colXml).toContain('r="B1"');expect(colXml).toContain('>A2</f>');
});
it('exports auto-merged equal runs as real merged cells when includeAutoMergedCells is set',()=>{const json={sheets:{Data:{name:'Data',data:{dataTable:{0:{0:{value:'a'},1:{value:'b'}},1:{0:{value:'a'},1:{value:'c'}},2:{0:{value:'a'}}}},autoMergeRangeInfos:[{range:{row:0,col:0,rowCount:3,colCount:2},direction:1,mode:0,sheetArea:3}]}}};
  expect(xmlFile(readZip(writeXlsx(json).bytes),'xl/worksheets/sheet1.xml')).not.toContain('mergeCell');
  expect(xmlFile(readZip(writeXlsx(json,{includeAutoMergedCells:true}).bytes),'xl/worksheets/sheet1.xml')).toContain('<mergeCell ref="A1:A3"/>');
});
it('saveAsView writes the rendered text only for formula format strings',()=>{const json={sheets:{Data:{name:'Data',data:{dataTable:{0:{0:{value:7,style:{formatter:'=CONCATENATE(TEXT(@,"0.0"),"!")'}}},1:{0:{value:0.5,style:{formatter:'0.0%'}}}}}}}};
  const {json:back}=readXlsx(writeXlsx(json,{saveAsView:true,displayText:()=>'7.0!'}).bytes);const cells=obj(obj(obj(obj(back.sheets).Data).data).dataTable);
  expect(obj(cells[0])[0]).toMatchObject({value:'7.0!'});expect(obj(cells[1])[0]).toMatchObject({value:0.5});
  const plain=xmlFile(readZip(writeXlsx(json).bytes),'xl/worksheets/sheet1.xml');expect(plain).toContain('<v>7</v>');
});
it('writes macro-enabled XLSM/XLTM content types that the importer reads back',()=>{const json={sheets:{Data:{name:'Data',data:{dataTable:{0:{0:{value:1}}}}}}};
  for(const ext of ['XLSM','XLTM']){const {bytes}=writeXlsx(json,{excelFileType:ext});const types=xmlFile(readZip(bytes),'[Content_Types].xml');
    expect(types).toContain(ext==='XLSM'?'vnd.ms-excel.sheet.macroEnabled.main+xml':'vnd.ms-excel.template.macroEnabled.main+xml');
    expect(obj(obj(obj(obj(obj(readXlsx(bytes).json.sheets).Data).data).dataTable)[0])[0]).toMatchObject({value:1});}
  expect(()=>writeXlsx(json,{excelFileType:'XLSB'})).toThrow('NotImplemented');
});
it('keeps sheet defaults under row/column/cell overrides and exposes print defined names',()=>{
  const json={sheets:{Data:{name:'Data',data:{defaultDataNode:{style:{font:'bold 12pt Arial',backColor:'#ffff00'}},rowDataArray:{1:{style:{foreColor:'#ff0000'}}},columnDataArray:{1:{style:{formatter:'0.000'}}},dataTable:{0:{0:{value:1}},1:{1:{value:2,style:{backColor:'#00ff00'}}}}},printInfo:{printArea:"'Data'!$A$1:$B$2",pageSetup:{orientation:'landscape'}}}}};
  const {json:read}=readXlsx(writeXlsx(json).bytes);const sheet=obj(obj(read.sheets).Data),cells=obj(obj(sheet.data).dataTable);
  expect(obj(obj(cells[0])[0]).style).toMatchObject({font:'bold 12pt Arial',backColor:'#ffff00'});
  expect(obj(obj(cells[1])[1]).style).toMatchObject({font:'bold 12pt Arial',backColor:'#00ff00',foreColor:'#ff0000',formatter:'0.000'});
  expect(sheet.names).toEqual([{name:'Print_Area',formula:'Data!$A$1:$B$2',row:0,col:0}]);
  expect(sheet.printInfo).toEqual(json.sheets.Data.printInfo);
  const xml=xmlFile(readZip(writeXlsx(read).bytes),'xl/workbook.xml');
  expect(xml.match(/name="_xlnm.Print_Area"/g)).toHaveLength(1);
});
it('CSV handles custom separators, quotes, Unicode, empty fields and typed values',()=>{expect(parseCsv('\ufeff"a||b"||"a""b"END"line\n2"||END','||','END')).toEqual([['a|b','a"b'],['line\n2','']]);expect(parseCsv('a,b\n1,2')).toEqual([['a','b'],['1','2']]);expect(()=>parseCsv('"unclosed')).toThrow();expect(obj(obj(csvSheet('001,true,=1+2').data).dataTable)).toEqual({0:{0:{value:1},1:{value:true},2:{value:'=1+2'}}});});
