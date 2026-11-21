/**
 * Serialization-mode switch (TASK 75).
 *
 * The reference product ships two builds of the same core: the plain SpreadJS
 * bundle and the one embedded in the Designer. The Designer build serialises
 * more eagerly — every sheet writes its default `printInfo`, the workbook
 * always writes `pivotCaches`, equal relative formula patterns coalesce into
 * `sharedFormulas`, and a loaded sheet materialises `allowCellOverflow:
 * false`. The plain build omits all of that (see
 * `test/fixtures/official-*.json`). Our single core reproduces the Designer
 * build's behaviour only while the Designer package is installed.
 */
let designerMode = false;

/** @internal Called by `installDesigner` (hidden `Spread.Sheets._setDesignerSerialization` hook). */
export function setDesignerSerializationMode(on: boolean): void {
  designerMode = on;
}

/** True when the Designer build's eager serialisation applies. */
export function designerSerializationMode(): boolean {
  return designerMode;
}
