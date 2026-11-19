/**
 * GC.Spread.Pivot / GC.Pivot public type shapes (TASK 41).
 * Field names and semantics follow the v19.2.5 public d.ts contract.
 * Enums are re-exported from the single generated source so that the values
 * shared between `GC.Pivot` and `GC.Spread.Pivot` keep reference identity.
 */
import type { Style } from '../primitives.js';
import type { Range } from '../primitives.js';
import { GC as EnumsRoot } from '../generated/enums.js';

export const DataPosition = EnumsRoot.Pivot.DataPosition;
export const SubtotalType = EnumsRoot.Pivot.SubtotalType;
export const SortType = EnumsRoot.Pivot.SortType;
export const PivotDataType = EnumsRoot.Pivot.PivotDataType;
export const PivotSourceFieldType = EnumsRoot.Pivot.PivotSourceFieldType;
export const PivotConditionType = EnumsRoot.Pivot.PivotConditionType;
export const PivotCaptionFilterOperator = EnumsRoot.Pivot.PivotCaptionFilterOperator;
export const PivotValueFilterOperator = EnumsRoot.Pivot.PivotValueFilterOperator;
export const PivotTop10FilterOperator = EnumsRoot.Pivot.PivotTop10FilterOperator;
export const PivotTop10FilterType = EnumsRoot.Pivot.PivotTop10FilterType;
export const PivotShowDataAs = EnumsRoot.Pivot.PivotShowDataAs;
export const PivotShowDataAsBaseItemType = EnumsRoot.Pivot.PivotShowDataAsBaseItemType;
export const DisplayFields = EnumsRoot.Spread.Pivot.DisplayFields;
export const GrandTotalPosition = EnumsRoot.Spread.Pivot.GrandTotalPosition;
export const SubtotalsPosition = EnumsRoot.Spread.Pivot.SubtotalsPosition;
export const PivotTableFieldType = EnumsRoot.Spread.Pivot.PivotTableFieldType;
export const PivotTableLayoutType = EnumsRoot.Spread.Pivot.PivotTableLayoutType;
export const PivotAreaType = EnumsRoot.Spread.Pivot.PivotAreaType;
export const PivotAreaAxisType = EnumsRoot.Spread.Pivot.PivotAreaAxisType;
export const PivotAreaReference = EnumsRoot.Spread.Pivot.PivotAreaReference;
export const CalcItemAggregation = EnumsRoot.Spread.Pivot.CalcItemAggregation;
export type DataPosition = EnumsRoot.Pivot.DataPosition;
export type SubtotalType = EnumsRoot.Pivot.SubtotalType;
export type SortType = EnumsRoot.Pivot.SortType;
export type PivotDataType = EnumsRoot.Pivot.PivotDataType;
export type PivotSourceFieldType = EnumsRoot.Pivot.PivotSourceFieldType;
export type PivotConditionType = EnumsRoot.Pivot.PivotConditionType;
export type PivotCaptionFilterOperator = EnumsRoot.Pivot.PivotCaptionFilterOperator;
export type PivotValueFilterOperator = EnumsRoot.Pivot.PivotValueFilterOperator;
export type PivotTop10FilterOperator = EnumsRoot.Pivot.PivotTop10FilterOperator;
export type PivotTop10FilterType = EnumsRoot.Pivot.PivotTop10FilterType;
export type PivotShowDataAs = EnumsRoot.Pivot.PivotShowDataAs;
export type PivotShowDataAsBaseItemType = EnumsRoot.Pivot.PivotShowDataAsBaseItemType;
export type DisplayFields = EnumsRoot.Spread.Pivot.DisplayFields;
export type GrandTotalPosition = EnumsRoot.Spread.Pivot.GrandTotalPosition;
export type SubtotalsPosition = EnumsRoot.Spread.Pivot.SubtotalsPosition;
export type PivotTableFieldType = EnumsRoot.Spread.Pivot.PivotTableFieldType;
export type PivotTableLayoutType = EnumsRoot.Spread.Pivot.PivotTableLayoutType;
export type PivotAreaType = EnumsRoot.Spread.Pivot.PivotAreaType;
export type PivotAreaAxisType = EnumsRoot.Spread.Pivot.PivotAreaAxisType;
export type PivotAreaReference = EnumsRoot.Spread.Pivot.PivotAreaReference;
export type CalcItemAggregation = EnumsRoot.Spread.Pivot.CalcItemAggregation;

export interface IPivotDataSource { source: string; autoRefresh?: boolean }
export type PivotSource = string | IPivotDataSource;

export interface IPivotItemInfo { fieldName: string; fieldItem: string }
export interface IValueInfo { sourceName: string; subtotalType: SubtotalType }
export interface IPivotNodeInfo { fieldInfos: IPivotItemInfo[]; valueInfo: IValueInfo }
export interface IPivotOverwriteNodeInfo extends IPivotNodeInfo { value: number }

export interface IDataPosition { display?: boolean; positionType: DataPosition; positionIndex: number }

export interface ITextCollectionCondition { list: string[]; isAll: boolean }
export interface IPivotTextFilterInfo { textItem: ITextCollectionCondition }
export interface IPivotCaptionConditionFilterInfo {
  conType: PivotConditionType; val: string[]; operator: PivotCaptionFilterOperator;
}
export interface IPivotValueConditionInfo {
  conType: PivotConditionType; val: number[]; operator: PivotValueFilterOperator;
}
export interface IPivotTop10ConditionFilterInfo {
  conType: PivotConditionType; val: number; type: PivotTop10FilterType; operator: PivotTop10FilterOperator;
}
export type IPivotConditionFilterInfo = {
  conditionByName: string;
  condition: IPivotCaptionConditionFilterInfo | IPivotValueConditionInfo | IPivotTop10ConditionFilterInfo | Record<string, unknown>;
};

export interface IPivotViewSortInfo {
  sortType?: SortType;
  sortValueFieldName?: string;
  sortByPivotReferences?: IPivotReference[];
  customSortCallback?: (items: unknown[], info: { sortType: SortType }) => unknown[];
  customSortList?: (string | number)[];
}

export interface ICalcFieldInfo { fieldName: string; formula: string }
export interface ICalcItemInfo { sourceName: string; calcItemName: string; formula: string; priority: number }
export interface IDateGroupInfo { start?: Date; end?: Date; by: number; groupInterval?: number }
export interface IDateGroupsInfo { originFieldName: string; dateGroups: IDateGroupInfo[] }
export interface INumberGroupInfo { originFieldName: string; numberGroup: { start?: number; end?: number; by: number } }
export interface ITextGroupInfo { originFieldName: string; textGroup: { fieldName: string; groupItems: Record<string, (string | number)[]> } }
export interface IPivotTableView { name: string; config: ISerializeInfo }

export interface IPivotReference {
  fieldName: string;
  subtotal?: boolean;
  subtotalTypes?: SubtotalType[];
  items?: string[];
}

export interface IPivotArea {
  type?: PivotAreaType;
  fieldName?: string;
  labelOnly?: boolean;
  dataOnly?: boolean;
  grandRow?: boolean;
  grandCol?: boolean;
  references?: IPivotReference[];
}

export interface IPivotStyle { pivotArea?: IPivotArea; style?: Style }

export type IPivotAreasCollection = { [pivotTableName: string]: IPivotArea[] };

export interface IDimensionSubtotalsInfo { useDefault: boolean; types: SubtotalType[] }

export interface IFieldInfo {
  fieldName: string;
  sourceName: string;
  dataType: PivotDataType;
  pivotArea: PivotTableFieldType;
  pivotIndex: number;
  start?: Date | number;
  end?: Date | number;
}
export interface ISourceFieldInfo { name: string; fieldType?: PivotSourceFieldType }

export interface IPivotTablePosition { row: number; col: number; sheetName?: string }
export interface IPivotTableRange { page: Range | null; content: Range | null }

export interface IPivotShowDataAsInfo {
  showDataAs: PivotShowDataAs;
  baseFieldName?: string;
  baseFieldItemType?: PivotShowDataAsBaseItemType;
  baseFieldItem?: string;
}

export interface IPivotTableOption {
  allowMultipleFiltersPerField?: boolean;
  fillDownLabels?: boolean;
  insertBlankLineAfterEachItem?: boolean;
  grandTotalPosition?: GrandTotalPosition;
  subtotalsPosition?: SubtotalsPosition;
  displayFieldsInPageFilterArea?: DisplayFields;
  reportFilterFieldsPerColumn?: number;
  bandRows?: boolean;
  bandColumns?: boolean;
  showRowHeader?: boolean;
  showColumnHeader?: boolean;
  showDrill?: boolean;
  showMissing?: boolean;
  missingCaption?: string | number;
  rowLabelIndent?: number;
  printDrill?: boolean;
  itemPrintTitles?: boolean;
  fieldPrintTitles?: boolean;
  showFilter?: boolean;
  showToolTip?: boolean;
  mergeItem?: boolean;
  isShowErrorValue?: boolean;
  errorValueInfo?: string;
  rowHeaderCaption?: string;
  colHeaderCaption?: string;
  showHeaders?: boolean;
  calcItemAggregation?: CalcItemAggregation;
  enableDataValueEditing?: boolean;
  hideValuesRow?: boolean;
}

export interface ISerializeFieldInfo {
  sourceName: string;
  displayName: string;
  subtotal?: SubtotalType;
  labelFilter?: IPivotTextFilterInfo | IPivotConditionFilterInfo;
  valueFilter?: IPivotConditionFilterInfo;
  sortInfo?: IPivotViewSortInfo;
  isShowSubtotalTop?: boolean;
  isShowSubtotal?: boolean;
}

export interface ISerializeInfo {
  layoutType?: PivotTableLayoutType;
  options?: Record<string, unknown>;
  theme?: string;
  valuePosition?: IDataPosition;
  pivotTablePosition?: number[];
  fieldsInfo?: ISerializeFieldInfo[][];
  styles?: IPivotStyle[];
  collapseItems?: Record<string, unknown>;
  showDataAsList?: { valueFieldName: string; showDataAsInfo: IPivotShowDataAsInfo }[];
  dimensionSubtotalsInfo?: Record<string, IDimensionSubtotalsInfo>;
  showNoDataInfo?: Record<string, unknown>;
  fieldSortMap?: { sortMaps: Record<string, unknown>; sortTypes: Record<string, unknown> };
}
