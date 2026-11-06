import Official from '@mescius/spread-sheets';
import Ours from '@opensheets/spread-sheets';
import * as Namespace from '@opensheets/spread-sheets';
import type { SpreadSheetsProp, WorksheetProp, ColumnProp } from '@opensheets/spread-sheets-react';
import type { SpreadSheetsProp as OfficialSpreadProps, WorksheetProp as OfficialWorksheetProps, ColumnProp as OfficialColumnProps } from '@mescius/spread-sheets-react';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
export type WorkbookMembers = Assert<Equal<keyof Official.Spread.Sheets.Workbook, keyof Ours.Spread.Sheets.Workbook>>;
export type WorksheetMembers = Assert<Equal<keyof Official.Spread.Sheets.Worksheet, keyof Ours.Spread.Sheets.Worksheet>>;
export type WorkbookArguments = Assert<Equal<keyof Official.Spread.Sheets.IWorkBookDefaultOptions, keyof Ours.Spread.Sheets.IWorkBookDefaultOptions>>;
export type SpreadPropNames = Assert<Equal<keyof SpreadSheetsProp, keyof OfficialSpreadProps>>;
export type WorksheetPropNames = Assert<Equal<keyof WorksheetProp, keyof OfficialWorksheetProps>>;
export type ColumnPropNames = Assert<Equal<keyof ColumnProp, keyof OfficialColumnProps>>;
export function importForms() {
  const workbook: Ours.Spread.Sheets.Workbook = new Namespace.Spread.Sheets.Workbook();
  workbook.getActiveSheet().setValue(0, 0, 'Typed');
  return workbook;
}
export type WorkbookShape = Assert<Ours.Spread.Sheets.Workbook extends Official.Spread.Sheets.Workbook ? true : false>;
export type WorksheetShape = Assert<Ours.Spread.Sheets.Worksheet extends Official.Spread.Sheets.Worksheet ? true : false>;
export type SpreadProps = Assert<SpreadSheetsProp extends OfficialSpreadProps ? true : false>;
export type WorksheetProps = Assert<WorksheetProp extends OfficialWorksheetProps ? true : false>;
export type ColumnProps = Assert<ColumnProp extends OfficialColumnProps ? true : false>;
