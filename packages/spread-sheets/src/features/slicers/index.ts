/**
 * Slicers feature entry point. Importing this module registers the public
 * classes on the GC namespaces (see install.ts) — worksheet.ts pulls it in so
 * the registration always happens with the core bundle.
 */
import './install.js';

export { GeneralSlicerData } from './general-data.js';
export { TableSlicerData } from './table-data.js';
export { Slicer } from './slicer.js';
export { SlicerCollection } from './collection.js';
export { ItemSlicer, DOMTableSlicer } from './dom-slicer.js';
export {
  SlicerBorder, SlicerStyle, SlicerStyleInfo, SlicerStyles, TimelineStyle, TimelineStyles, resolveSlicerColor,
} from './styles.js';
export { CustomSlicerThemeManager, CustomTimelineThemeManager } from './themes-manager.js';
export type {
  ISlicerConditional, ISlicerDataItem, ISlicerFilteredData, ISlicerListener, ISlicerRangeConditional,
  SlicerItem, SlicerBorderStyle, ISlicerChangedEventArgs,
} from './types.js';
