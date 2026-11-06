import { GC as Enums } from './generated/enums.js';
import { Workbook, Worksheet } from './model.js';
import { CellRange } from './range.js';
import { Style, LineBorder, Range, NameInfo } from './primitives.js';
import { Events } from './events.js';
import { GeneralFormatter } from './formatter.js';
import { CultureInfo, CultureManager } from './culture.js';
import { CommandManager, UndoManager } from './commands.js';
import { Comment, CommentManager } from './comments.js';
import { installFallbacks, STUB } from './not-implemented.js';

export const Spread = {
  ...Enums.Spread,
  Common: { CultureInfo, CultureManager },
  Formatter: { GeneralFormatter },
  Commands: { ...Enums.Spread.Commands, CommandManager, UndoManager },
  Sheets: {
    ...Enums.Spread.Sheets,
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
for (const method of [Worksheet.prototype.autoFitRow, Worksheet.prototype.autoFitColumn])
  Object.defineProperty(method, STUB, { value: true });
installFallbacks(GC);
export const Data = GC.Data;
export default GC;
