import { GC as Enums } from './generated/enums.js';
import { Workbook, Worksheet } from './model.js';
import { installFallbacks } from './not-implemented.js';

export const Spread = {
  ...Enums.Spread,
  Sheets: {
    ...Enums.Spread.Sheets,
    Workbook,
    Worksheet,
    LicenseKey: '',
    productInfo: { name: 'OpenSheets', version: '0.1.0' },
  },
};
export const Pivot = Enums.Pivot;
const GC = { ...Enums, Spread, Pivot };
installFallbacks(GC);
export const Data = GC.Data;
export default GC;
