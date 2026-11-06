import { GC as Enums } from './generated/enums.js';
import { Workbook, Worksheet } from './model.js';
import { CellRange } from './range.js';
import { Style, LineBorder, Range, NameInfo, Point } from './primitives.js';
import { Events } from './events.js';
import { GeneralFormatter } from './formatter.js';
import { CultureInfo, CultureManager } from './culture.js';
import { UserManager } from './user-manager.js';
import { CommandManager, UndoManager } from './commands.js';
import { Comment, CommentManager } from './comments.js';
import { Table, TableColumn, TableManager, TableStyle, TableTheme, TableThemes, CustomTableThemeManager } from './features/tables.js';
import { HideRowFilter, RowFilterBase } from './features/filters.js';
import {
  Condition,
  ConditionRuleBase,
  ConditionalFormats,
  DataBarRule,
  IconCriterion,
  IconSetRule,
  NormalConditionRule,
  ScaleRule,
  SparklineRule,
  StateRule,
} from './features/conditional-formatting.js';
import {
  DefaultDataValidator,
  createDateValidator,
  createFormulaListValidator,
  createFormulaValidator,
  createListValidator,
  createNumberValidator,
  createTextLengthValidator,
  createTimeValidator,
} from './features/data-validation.js';
import {
  Base as CellTypeBase,
  Button,
  ButtonList,
  CheckBox,
  CheckBoxList,
  ColumnHeader,
  ComboBox,
  Corner,
  DataObject,
  Diagonal,
  FileUpload,
  HyperLink,
  RadioButtonList,
  RangeTemplate,
  RowHeader,
  Text,
} from './features/cell-types.js';
import { Outline, OutlineInfo } from './features/outlines.js';
import { installFallbacks } from './not-implemented.js';
import { CalcEngineApi, GlobalCalcEngineApi } from './calc/api.js';

export const Spread = {
  ...Enums.Spread,
  CalcEngine: { ...(Enums.Spread as { CalcEngine?: object }).CalcEngine, ...GlobalCalcEngineApi },
  Common: { CultureInfo, CultureManager, UserManager },
  Formatter: { GeneralFormatter },
  Commands: { ...Enums.Spread.Commands, CommandManager, UndoManager },
  Sheets: {
    ...Enums.Spread.Sheets,
    CalcEngine: {
      ...(Enums.Spread.Sheets as { CalcEngine?: object }).CalcEngine,
      ...CalcEngineApi,
      Functions: GlobalCalcEngineApi.Functions,
    },
    Workbook,
    Worksheet,
    CellRange,
    Style,
    LineBorder,
    Range,
    NameInfo,
    Point,
    Events,
    Comments: { ...Enums.Spread.Sheets.Comments, Comment, CommentManager },
    Tables: {
      ...Enums.Spread.Sheets.Tables,
      Table,
      TableColumn,
      TableManager,
      TableStyle,
      TableTheme,
      TableThemes,
      CustomTableThemeManager,
    },
    Filter: { ...Enums.Spread.Sheets.Filter, RowFilterBase, HideRowFilter },
    ConditionalFormatting: {
      ...Enums.Spread.Sheets.ConditionalFormatting,
      Condition,
      ConditionRuleBase,
      ConditionalFormats,
      NormalConditionRule,
      ScaleRule,
      DataBarRule,
      IconCriterion,
      IconSetRule,
      StateRule,
      SparklineRule,
    },
    DataValidation: {
      ...Enums.Spread.Sheets.DataValidation,
      DefaultDataValidator,
      createDateValidator,
      createFormulaListValidator,
      createFormulaValidator,
      createListValidator,
      createNumberValidator,
      createTextLengthValidator,
      createTimeValidator,
    },
    CellTypes: {
      ...Enums.Spread.Sheets.CellTypes,
      Base: CellTypeBase,
      Text,
      Button,
      CheckBox,
      ComboBox,
      HyperLink,
      CheckBoxList,
      RadioButtonList,
      ButtonList,
      Corner,
      ColumnHeader,
      RowHeader,
      DataObject,
      Diagonal,
      FileUpload,
      RangeTemplate,
    },
    Outlines: { ...Enums.Spread.Sheets.Outlines, Outline, OutlineInfo },
    LicenseKey: '',
    productInfo: { name: 'OpenSheets', version: '0.1.0' },
  },
};
export const Pivot = Enums.Pivot;
const GC = { ...Enums, Spread, Pivot };
installFallbacks(GC);
export const Data = GC.Data;
export default GC;
