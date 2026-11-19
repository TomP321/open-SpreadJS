/**
 * Slicers are also registered as worksheet "shapes" (shapeType 6) in the trial's
 * sheet JSON so the floating-object hit-test / z-order machinery can see them.
 * This mirrors that serialisation using the slicer's own anchor record; it does
 * not read or copy any official bundle.
 */
import type { Slicer } from './slicer.js';
import type { JsonRecord } from '../../serialization.js';

/** shapeType 6 = a graphic-frame (slicer) anchor shape in the trial's schema. */
const SLICER_SHAPE_TYPE = 6;

/** True when a `shapes` JSON entry is one we generated for a slicer (loader skips it). */
export function isSlicerShapeJson(json: JsonRecord): boolean {
  return json.shapeType === SLICER_SHAPE_TYPE || json.slicerType === 'table';
}

/** Build the trial-shaped `shapes` entry for one table slicer. */
export function slicerShapeEntry(slicer: Slicer, index: number): JsonRecord {
  const a = slicer._anchors();
  const props = slicer.propsValue();
  const custom = slicer.customProps as Record<string, unknown>;
  return {
    isLocked: slicer.isLocked() !== false,
    canPrint: custom.canPrint !== false,
    dynamicMove: !!props.dynamicMove,
    dynamicSize: !!props.dynamicSize,
    allowResize: props.allowResize !== false,
    allowRotate: false,
    allowMove: props.allowMove !== false,
    showHandle: true,
    alt: String(custom.alt ?? ''),
    shapeData: {
      anchorType: 0,
      startPoint: { row: a.row, col: a.col, rowOffset: a.dy, colOffset: a.dx },
      endPoint: { row: a.endRow, col: a.endCol, rowOffset: a.endDy, colOffset: a.endDx },
      editAs: 0,
      graphicFrame: {
        shapeType: SLICER_SHAPE_TYPE,
        nvGraphicFramePr: {
          cNvPr: { id: index + 2, name: slicer.name(), hidden: false, title: '' },
          cNvGraphicFramePr: { graphicFrameLocks: { noChangeAspect: false } },
        },
        xfrm: {
          flipH: false,
          flipV: false,
          rot: 0,
          off: { x: props.x, y: props.y },
          ext: { cx: props.width, cy: props.height },
        },
        graphic: { graphicData: { slicer: {} } },
      },
    },
    name: slicer.name(),
    shapeType: SLICER_SHAPE_TYPE,
    slicerType: 'table',
  };
}
