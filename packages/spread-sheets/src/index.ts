import { GC as Enums } from './generated/enums.js';
import { Workbook, Worksheet } from './model.js';
import { CellRange } from './range.js';
import { Style, LineBorder, Range, NameInfo } from './primitives.js';
import { Events } from './events.js';
import { GeneralFormatter } from './formatter.js';
import { CultureInfo, CultureManager } from './culture.js';
import { CommandManager, UndoManager } from './commands.js';
import { Comment, CommentManager } from './comments.js';
import { installFallbacks } from './not-implemented.js';
import { CalcEngineApi, GlobalCalcEngineApi } from './calc/api.js';

export const Spread = {
  ...Enums.Spread,
  CalcEngine: { ...(Enums.Spread as { CalcEngine?: object }).CalcEngine, ...GlobalCalcEngineApi },
  Common: { CultureInfo, CultureManager },
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
    Events,
    Comments: { ...Enums.Spread.Sheets.Comments, Comment, CommentManager },
    LicenseKey: '',
    productInfo: { name: 'OpenSheets', version: '0.1.0' },
  },
};
export const Pivot = Enums.Pivot;
const GC = { ...Enums, Spread, Pivot };
installFallbacks(GC);
export const Data = GC.Data;
export default GC;
