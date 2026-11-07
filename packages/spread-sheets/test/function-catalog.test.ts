// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '../src/calc/engine.js';
import { functionCatalog } from '../src/calc/function-catalog.js';
import { FormulaHints, builtinHintNames } from '../src/features/formula-hints.js';
import type { Workbook } from '../src/model.js';

describe('function catalog', () => {
  it.each([
    ['AVERAGE', 'number1, [number2], ...'],
    ['AVERAGEIF', 'range, criteria, [average_range]'],
    ['AVERAGEIFS', 'average_range, criteria_range1, criteria1, [criteria_range2], [criteria2], ...'],
    ['COUNT', 'value1, [value2], ...'],
    ['COUNTA', 'value1, [value2], ...'],
    ['COUNTIFS', 'criteria_range1, criteria1, [criteria_range2], [criteria2], ...'],
    ['IF', 'logical_test, value_if_true, [value_if_false]'],
    ['INDEX', 'array, row_num, [column_num]'],
    ['LEFT', 'text, [num_chars]'],
    ['MATCH', 'lookup_value, lookup_array, [match_type]'],
    ['MAX', 'number1, [number2], ...'],
    ['MIN', 'number1, [number2], ...'],
    ['RIGHT', 'text, [num_chars]'],
    ['SUBSTITUTE', 'text, old_text, new_text, [instance_num]'],
    ['SUBTOTAL', 'function_num, ref1, [ref2], ...'],
    ['SUM', 'number1, [number2], ...'],
    ['SUMIF', 'range, criteria, [sum_range]'],
    ['SUMIFS', 'sum_range, criteria_range1, criteria1, [criteria_range2], [criteria2], ...'],
    ['VLOOKUP', 'lookup_value, table_array, col_index_num, [range_lookup]'],
    ['NOW', ''],
  ])('shows the documented signature for %s', (name, signature) => {
    const anchor = document.createElement('div');
    const workbook = { getCustomFunction: () => undefined } as unknown as Workbook;
    const hints = new FormulaHints(workbook, anchor, () => {});
    const formula = `=${name}(`;
    hints.update(formula, formula.length);
    expect(document.querySelector('[role=tooltip]')?.textContent).toBe(`${name}(${signature})`);
    expect(functionCatalog[name].description.trim()).not.toBe('');
    hints.close();
  });
  it('gives every autocomplete function a description and signature', () => {
    const names = [...new Set(builtinHintNames().map(name => name.toUpperCase()))].sort();
    for (const name of names) {
      const entry = functionCatalog[name];
      expect(entry, `catalog entry for ${name}`).toBeDefined();
      expect(entry.description.trim(), `description for ${name}`).not.toBe('');
      expect(Array.isArray(entry.parameters), `signature for ${name}`).toBe(true);
      for (const parameter of entry.parameters) expect(parameter.trim(), `parameter in ${name}`).not.toBe('');
    }
  });
  it.each([
    ['=CASCADESPARKLINE(A1,1,', '[labelsRange]'],
    ['=ERF(1,', '[upper_limit]'],
    ['=EUROCONVERT(1,"EUR","DEM",', '[full_precision]'],
    ['=EXPAND(A1,2,', '[columns]'],
    ['=FILTER(A1,B1,', '[if_empty]'],
    ['=FIND("a","abc",', '[start_num]'],
    ['=FIXED(1,', '[decimals]'],
    ['=FLOOR.MATH(1,', '[significance]'],
    ['=FV(1,2,3,', '[pv]'],
    ['=GCD(1,2,3,', '[number2]'],
    ['=GETPIVOTDATA("Sales",A1,"Region","East","Year",', '[item1]'],
    ['=GESTEP(1,', '[step]'],
    ['=HEX2BIN(1,', '[places]'],
    ['=HLOOKUP(1,A1,2,', '[range_lookup]'],
    ['=HSTACK(A1,B1,C1,', '[array2]'],
    ['=HYPERLINK("url",', '[friendly_name]'],
    ['=IFS(TRUE,1,FALSE,2,', '[logical_test2]'],
    ['=IMSUM(1,2,3,', '[inumber2]'],
    ['=INDIRECT("A1",', '[a1]'],
    ['=IRR(A1,', '[guess]'],
    ['=LOG(10,', '[base]'],
    ['=CEILING.MATH(1,', '[significance]'],
    ['=CEILING.PRECISE(1,', '[significance]'],
    ['=CHOOSE(1,2,3,4,', '[value2]'],
    ['=CHOOSECOLS(A1,1,2,3,', '[col_num2]'],
    ['=CHOOSEROWS(A1,1,2,3,', '[row_num2]'],
    ['=COLUMNSPARKLINE(A1,1,', '[dateAxisData]'],
    ['=COMPLEX(1,2,', '[suffix]'],
    ['=CONCAT(1,2,3,', '[text2]'],
    ['=CONCATENATE(1,2,3,', '[text2]'],
    ['=COUPDAYS(1,2,3,', '[basis]'],
    ['=DAYS360(1,2,', '[method]'],
    ['=DB(1,2,3,4,', '[month]'],
    ['=DDB(1,2,3,4,', '[factor]'],
    ['=DEC2BIN(1,', '[places]'],
    ['=DEC2HEX(1,', '[places]'],
    ['=DEC2OCT(1,', '[places]'],
    ['=DELTA(1,', '[number2]'],
    ['=DEVSQ(1,2,3,', '[number2]'],
    ['=DOLLAR(1,', '[decimals]'],
    ['=DROP(A1,1,', '[columns]'],
    ['=SUM(1,2,3,', '[number2]'],
    ['=SUMIFS(A1,B1,1,C1,2,D1,', '[criteria2]'],
    ['=SUMIFS(A1,B1,1,C1,2,', '[criteria_range2]'],
    ['=IF(A1,1,2,', undefined],
    ['=ACCRINT(1,2,3,4,5,6,', '[basis]'],
    ['=ACCRINTM(1,2,3,', '[par]'],
    ['=ADDRESS(1,2,', '[abs_num]'],
    ['=AGGREGATE(1,2,3,4,5,', '[ref2]'],
    ['=AMORDEGRC(1,2,3,4,5,6,', '[basis]'],
    ['=AMORLINC(1,2,3,4,5,6,', '[basis]'],
    ['=AND(1,2,3,', '[logical2]'],
    ['=AREASPARKLINE(A1,', '[min]'],
    ['=ARRAYTOTEXT(A1,', '[format]'],
    ['=AVEDEV(1,2,3,', '[number2]'],
    ['=AVERAGEA(1,2,3,', '[value2]'],
    ['=BASE(1,2,', '[min_length]'],
    ['=BETA.DIST(1,2,3,4,', '[A]'],
    ['=BETA.INV(1,2,3,', '[A]'],
    ['=BETADIST(1,2,3,', '[A]'],
    ['=BETAINV(1,2,3,', '[A]'],
    ['=BIN2HEX(1,', '[places]'],
    ['=BIN2OCT(1,', '[places]'],
    ['=BINOM.DIST.RANGE(1,2,3,', '[number_s2]'],
    ['=BULLETSPARKLINE(1,2,3,', '[good]'],
    ['=EURO("DEM",', undefined],
    ['=LAG(1,', '[offset_value]'],
    ['=LAG(1,2,', '[default_value]'],
    ['=NTILE(3,', undefined],
    ['=OBJECT("a",1,', '[property2]'],
    ['=OBJECT("a",1,"b",2,', '[property2]'],
    ['=OBJECT("a",1,"b",2,3,', '[expression2]'],
    ['=PIESPARKLINE(A1,', '[color1]'],
    ['=PIESPARKLINE(A1,1,2,', '[color1]'],
    ['=QUERY("T","c",', '[returnObject]'],
    ['=R.YOY(A1,B1,', '[ContextCell2]'],
    ['=R.CURRENTPAGE(', '[use_grouped_context]'],
    ['=REFRESH(A1,1,', '[interval]'],
    ['=SJS.ENDWITH("a","b",', '[match_mode]'],
    ['=SJS.FISCALYEAR(1,', '[start_month]'],
    ['=SJS.TABLE(A1,B1,C1,', '[inputs2]'],
    ['=SJS.TABLE(A1,B1,C1,D1,E1,F1,', '[input_cell2]'],
    ['=SJS.UUID(', '[number]'],
    ['=WINDOWDEF(', '[partition_by]'],
  ])('highlights the active argument in %s', (formula, expected) => {
    const hints = new FormulaHints({ getCustomFunction: () => undefined } as unknown as Workbook, document.createElement('div'), () => {});
    hints.update(formula, formula.length);
    expect(document.querySelector('[role=tooltip] b')?.textContent).toBe(expected);
    hints.close();
  });
});
