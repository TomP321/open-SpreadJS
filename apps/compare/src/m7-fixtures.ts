import type GC from '@opensheets/spread-sheets';
type Book=InstanceType<typeof GC.Spread.Sheets.Workbook>;
export const fixtureNames=['m7-values-styles','m7-structure','m7-data-features','m7-formulas'] as const;
export function buildFixture(G:typeof GC,w:Book,name:string):void {
  const S=G.Spread.Sheets,s=w.getActiveSheet();s.name('Data');s.setRowCount(40);s.setColumnCount(10);
  if(name==='m7-values-styles'){
    s.setArray(0,0,[['Text <& 😀',42.5,true,new Date(2024,0,2)],['two\nlines',-12,false,new Date(2024,4,3,12,30)]]);
    const styles=[{font:'bold 12pt Arial',foreColor:'#cc0033',backColor:'#fff2cc',borderBottom:new S.LineBorder('#336699',S.LineStyle.double),hAlign:S.HorizontalAlign.center,vAlign:S.VerticalAlign.center},{formatter:'#,##0.00',backColor:'#e2f0d9',borderLeft:new S.LineBorder('#336699',S.LineStyle.thin)},{textOrientation:30,textIndent:1,wordWrap:true},{formatter:'yyyy-mm-dd'}];
    styles.forEach((st,c)=>s.setStyle(0,c,Object.assign(new S.Style(),st)));
    s.setStyle(1,0,Object.assign(new S.Style(),{wordWrap:true,font:'italic 11pt Calibri'}));s.setFormatter(1,3,'yyyy-mm-dd hh:mm');s.setRowHeight(0,36);s.setRowHeight(1,42);for(let c=0;c<4;c++)s.setColumnWidth(c,130);
    s.setFormula(3,1,'1/0');s.setValue(3,0,'Error value');
  }else if(name==='m7-structure'){
    s.setValue(0,0,'Merged report');s.addSpan(0,0,1,3);s.setStyle(0,0,Object.assign(new S.Style(),{font:'bold 14pt Calibri',backColor:'#ddebf7'}));
    s.setArray(2,0,[['Item','Quantity','Cost'],['Apples',3,12.5],['Pears',4,9.75],['Plums',2,7.2]]);s.setColumnWidth(0,120);s.setColumnWidth(1,96);s.setColumnWidth(2,110);s.setRowHeight(0,32);s.setRowVisible(8,false);s.setColumnVisible(5,false);s.frozenRowCount(1);s.frozenColumnCount(1);s.rowOutlines.group(3,3);s.columnOutlines.group(1,2);s.options.sheetTabColor='#7030a0';
    w.addCustomName('Amounts','=Data!$C$4:$C$6',0,0);s.addCustomName('LocalName','=Data!$A$1',0,0);
    w.addSheet(1,new S.Worksheet('Hidden'));w.getSheet(1).visible(0);w.getSheet(1).setValue(0,0,'Hidden content');
    s.options.isProtected=true;s.options.protectionOptions.allowSelectLockedCells=true;
  }else if(name==='m7-data-features'){
    s.setArray(0,0,[['Name','Score','Choice'],['Ada',42,'red'],['Lin',88,'green'],['Max',65,'blue']]);for(let c=0;c<3;c++)s.setColumnWidth(c,118);
    const t=s.tables.add('Scores',0,0,4,3,S.Tables.TableThemes.medium2);t.bandRows(true);
    s.setHyperlink(5,0,{url:'https://example.com/path?q=1&x=2',tooltip:'Example'});s.setValue(5,0,'Example');s.comments.add(1,0,'A note with < & Unicode 日本語');
    s.setDataValidator(1,2,3,1,S.DataValidation.createListValidator('red,green,blue'));
    s.conditionalFormats.addCellValueRule(S.ConditionalFormatting.ComparisonOperators.greaterThan,70,0,Object.assign(new S.Style(),{backColor:'#c6efce',foreColor:'#006100'}),[new S.Range(1,1,3,1)]);
    s.conditionalFormats.add2ScaleRule(S.ConditionalFormatting.ScaleValueType.number,0,'#ffffff',S.ConditionalFormatting.ScaleValueType.number,100,'#638ec6',[new S.Range(7,0,3,1)]);s.setArray(7,0,[[10],[50],[90]]);
  }else if(name==='m7-formulas'){
    w.options.allowDynamicArray=true;s.setArray(0,0,[[2,3],[4,5],[6,7]]);s.setFormula(0,2,'SUM(A1:B1)');s.setFormula(1,2,'SUM(A2:B2)');s.setFormula(2,2,'SUM(A3:B3)');s.setFormula(4,0,'SEQUENCE(2,2)');s.setArrayFormula(7,0,2,1,'A1:A2*2');s.setFormula(10,0,'"text"&A1');s.setFormula(11,0,'1=1');
  }else throw new Error('Unknown IO fixture '+name);
}
