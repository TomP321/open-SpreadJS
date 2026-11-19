/* TASK 60 item 3: per-gallery-item thumbnail boxes measured from the trial's rendered
 * shapes gallery (black-box: each tile element was screenshotted at deviceScaleFactor 3
 * and its ink bounding box measured). [fw, fh] = width/height as a fraction of the icon
 * cell, so the gallery draws every preset with the trial's own canonical aspect instead
 * of stretching it to the square cell. The shape paths themselves come from our core
 * geometry engine (shape-geometry.ts). */
export const shapeGalleryThumbBox: Record<string, [number, number]> = {
  'noHeadStraight': [0.875, 0.875],  // Line
  'endArrowHeadStraight': [0.875, 0.875],  // Line Arrow
  'beginEndArrowHeadStraight': [0.875, 0.875],  // Line Double Arrow
  'Elbow': [1.0, 0.75],  // Elbow Connector
  'endArrowHeadElbow': [1.0, 0.875],  // Elbow Arrow Connector
  'beginEndArrowHeadElbow': [1.0, 1.0],  // Elbow Double-Arrow Connector
  'Curved': [0.646, 0.771],  // Curved Connector
  'endArrowHeadCurved': [0.604, 0.875],  // Curved Arrow Connector
  'beginEndArrowHeadCurved': [0.625, 1.0],  // Curved Double-Arrow Connector
  'rectangle': [1.0, 0.767],  // Rectangle
  'roundedRectangle': [1.0, 0.767],  // Rounded Rectangle
  'snip1Rectangle': [1.0, 0.767],  // Snip Single Corner Rectangle
  'snip2SameRectangle': [1.0, 0.767],  // Snip Same Side Corner Rectangle
  'snip2DiagRectangle': [1.0, 0.767],  // Snip Diagonal Corner Rectangle
  'snipRoundRectangle': [1.0, 0.767],  // Snip and Round Single Corner Rectangle
  'round1Rectangle': [1.0, 0.767],  // Round Single Corner Rectangle
  'round2SameRectangle': [1.0, 0.7],  // Round Same Side Corner Rectangle
  'round2DiagRectangle': [1.0, 0.767],  // Round Diagonal Corner Rectangle
  'hor-text-box': [1.0, 0.767],  // Horizontal Text Box
  'oval': [0.95, 0.767],  // Oval
  'isoscelesTriangle': [0.817, 0.883],  // Isosceles Triangle
  'rightTriangle': [0.883, 0.883],  // Right Triangle
  'parallelogram': [1.0, 0.767],  // Parallelogram
  'trapezoid': [1.0, 0.833],  // Trapezoid
  'diamond': [0.933, 0.933],  // Diamond
  'regularPentagon': [0.933, 0.95],  // Regular Pentagon
  'hexagon': [0.833, 0.933],  // Hexagon
  'heptagon': [0.95, 0.95],  // Heptagon
  'octagon': [0.95, 0.95],  // Octagon
  'decagon': [0.95, 0.95],  // Decagon
  'dodecagon': [0.95, 0.95],  // Dodecagon
  'pie': [1.0, 1.0],  // Pie
  'chord': [1.0, 1.0],  // Chord
  'tear': [1.0, 1.0],  // Tear
  'frame': [1.0, 1.0],  // Frame
  'halfFrame': [0.883, 0.883],  // Half Frame
  'corner': [0.9, 0.9],  // Corner
  'diagonalStripe': [1.0, 1.0],  // Diagonal Stripe
  'cross': [1.0, 0.95],  // Cross
  'plaque': [1.0, 0.95],  // Plaque
  'can': [0.7, 1.0],  // Can
  'cube': [0.95, 0.95],  // Cube
  'bevel': [1.0, 1.0],  // Bevel
  'donut': [1.0, 1.0],  // Donut
  'noSymbol': [1.0, 1.0],  // "No" Symbol
  'blockArc': [1.0, 0.567],  // Block Arc
  'foldedCorner': [0.9, 0.9],  // Folded Corner
  'smileyFace': [1.0, 1.0],  // Smiley Face
  'heart': [1.0, 0.9],  // Heart
  'lightningBolt': [0.867, 0.933],  // Lightning Bolt
  'sun': [0.95, 0.95],  // Sun
  'moon': [0.633, 1.0],  // Moon
  'cloud': [1.0, 0.767],  // Cloud
  'arc': [0.95, 0.767],  // Arc
  'doubleBracket': [0.95, 0.95],  // Double Bracket
  'doubleBrace': [1.0, 0.95],  // Double Brace
  'leftBracket': [0.333, 0.95],  // Left Bracket
  'rightBracket': [0.333, 0.95],  // Right Bracket
  'leftBrace': [0.333, 0.7],  // Left Brace
  'rightBrace': [0.333, 0.7],  // Right Brace
  'upDownArrowCallout': [0.9, 1.0],  // Up-Down Arrow Callout
  'actionButtonHome': [1.0, 1.0],  // Action Button Home
  'actionButtonHelp': [1.0, 1.0],  // Action Button Help
  'actionButtonInformation': [1.0, 1.0],  // Action Button Information
  'actionButtonBackorPrevious': [1.0, 1.0],  // Action Button Back or Previous
  'actionButtonForwardorNext': [1.0, 1.0],  // Action Button Forward or Next
  'actionButtonBeginning': [1.0, 1.0],  // Action Button Beginning
  'actionButtonEnd': [1.0, 1.0],  // Action Button End
  'actionButtonReturn': [1.0, 1.0],  // Action Button Return
  'actionButtonDocument': [1.0, 1.0],  // Action Button Document
  'actionButtonSound': [1.0, 1.0],  // Action Button Sound
  'actionButtonMovie': [1.0, 1.0],  // Action Button Movie
  'flowchartOfflineStorage': [0.867, 0.883],  // Flowchart: Offline Storage
  'leftRightRibbon': [1.0, 0.8],  // Left-Right Ribbon
  'chartStar': [0.95, 0.95],  // Chart Star
  'chartPlus': [0.95, 0.95],  // Chart Plus
  'lineInverse': [0.867, 0.867],  // Line Inverse
  'leftCircularArrow': [1.0, 0.633],  // Left Circular Arrow
  'leftRightCircularArrow': [1.0, 0.567],  // left-Right Circular Arrow
  'swooshArrow': [1.0, 0.883],  // Swoosh Arrow
  'chartX': [0.95, 0.95],  // Chart X
  'gear6': [1.0, 1.0],  // Gear 6
  'gear9': [1.0, 1.0],  // Gear 9
  'funnel': [1.0, 1.0],  // Funnel
  'pieWedge': [0.9, 0.9],  // Pie Wedge
  'nonIsoscelesTrapezoid': [1.0, 0.95],  // Non Isosceles Trapezoid
  'cornerTabs': [1.0, 1.0],  // Corner Tabs
  'squareTabs': [1.0, 1.0],  // Square Tabs
  'plaqueTabs': [1.0, 1.0],  // Plaque Tabs
  'rightArrow': [0.933, 0.933],  // Right Arrow
  'leftArrow': [0.95, 0.933],  // Left Arrow
  'upArrow': [0.933, 0.95],  // Up Arrow
  'downArrow': [0.933, 0.933],  // Down Arrow
  'leftRightArrow': [1.0, 0.933],  // Left-Right Arrow
  'upDownArrow': [0.933, 1.0],  // Up-Down Arrow
  'quadArrow': [0.933, 0.933],  // Quad Arrow
  'leftRightUpArrow': [1.0, 0.933],  // Left-Right-Up Arrow
  'bentArrow': [0.95, 0.933],  // Bent Arrow
  'uTurnArrow': [0.933, 0.9],  // u-Turn Arrow
  'leftUpArrow': [1.0, 1.0],  // Left-Up Arrow
  'bentUpArrow': [0.933, 0.817],  // Bent Up Arrow
  'curvedRightArrow': [0.633, 1.0],  // Curved Right Arrow
  'curvedLeftArrow': [0.633, 1.0],  // Curved Left Arrow
  'curvedUpArrow': [1.0, 0.633],  // Curved Up Arrow
  'curvedDownArrow': [1.0, 0.633],  // Curved Down Arrow
  'stripedRightArrow': [1.0, 1.0],  // Striped Right Arrow
  'notchedRightArrow': [0.95, 1.0],  // Notched Right Arrow
  'pentagon': [1.0, 0.7],  // Pentagon
  'chevron': [0.767, 0.7],  // Chevron
  'rightArrowCallout': [1.0, 0.95],  // Right Arrow Callout
  'downArrowCallout': [0.95, 1.0],  // Down Arrow Callout
  'leftArrowCallout': [1.0, 0.95],  // Left Arrow Callout
  'upArrowCallout': [0.95, 1.0],  // Up Arrow Callout
  'leftRightArrowCallout': [1.0, 1.0],  // Left-Right Arrow Callout
  'quadArrowCallout': [1.0, 1.0],  // Quad Arrow Callout
  'circularArrow': [0.95, 0.767],  // Circular Arrow
  'mathPlus': [0.9, 0.9],  // Plus
  'mathMinus': [0.9, 0.267],  // Minus
  'mathMultiply': [0.817, 0.817],  // Multiply
  'mathDivide': [0.833, 0.767],  // Division
  'mathEqual': [0.9, 0.567],  // Equal
  'mathNotEqual': [0.9, 0.95],  // Not Equal
  'flowchartProcess': [1.0, 0.767],  // Flowchart: Process
  'flowchartAlternateProcess': [1.0, 0.767],  // Flowchart: Alternate Process
  'flowchartDecision': [1.0, 0.567],  // Flowchart: Decision
  'flowchartData': [1.0, 0.767],  // Flowchart: Data
  'flowchartPredefinedProcess': [1.0, 0.833],  // Flowchart: Predefined Process
  'flowchartInternalStorage': [0.833, 0.833],  // Flowchart: Internal Storage
  'flowchartDocument': [1.0, 0.9],  // Flowchart: Document
  'flowchartMultidocument': [1.0, 0.833],  // Flowchart: Multidocument
  'flowchartTerminator': [1.0, 0.45],  // Flowchart: Terminator
  'flowchartPreparation': [1.0, 0.7],  // Flowchart: Preparation
  'flowchartManualInput': [1.0, 0.767],  // Flowchart: Manual Input
  'flowchartManualOperation': [1.0, 0.833],  // Flowchart: Manual Operation
  'flowchartConnector': [0.9, 0.9],  // Flowchart: Connector
  'flowchartOffpageConnector': [0.7, 0.717],  // Flowchart: Offpage Connector
  'flowchartCard': [1.0, 0.767],  // Flowchart: Card
  'flowchartPunchedTape': [1.0, 0.9],  // Flowchart: PunchedTape
  'flowchartSummingJunction': [0.95, 0.95],  // Flowchart: Summing Junction
  'flowchartOr': [0.95, 0.95],  // Flowchart: Or
  'flowchartCollate': [0.567, 0.9],  // Flowchart: Collate
  'flowchartSort': [0.567, 0.933],  // Flowchart: Sort
  'flowchartExtract': [0.9, 0.9],  // Flowchart: Extract
  'flowchartMerge': [0.9, 0.9],  // Flowchart: Merge
  'flowchartStoredData': [1.0, 0.767],  // Flowchart: Stored Data
  'flowchartDelay': [0.95, 0.95],  // Flowchart: Delay
  'flowchartSequentialAccessStorage': [1.0, 0.95],  // Flowchart: Sequential Access Storage
  'flowchartMagneticDisk': [1.0, 0.767],  // Flowchart: Magnetic Disk
  'flowchartDirectAccessStorage': [0.767, 1.0],  // Flowchart: Direct Access Storage
  'flowchartDisplay': [1.0, 1.0],  // Flowchart: Display
  'explosion1': [1.0, 1.0],  // Explosion 1
  'explosion2': [1.0, 1.0],  // Explosion 2
  'shape4pointStar': [0.933, 1.0],  // 4-Point Star
  'shape5pointStar': [1.0, 0.933],  // 5-Point Star
  'star6Point': [1.0, 1.0],  // 6-Point Star
  'star7Point': [1.0, 1.0],  // 7-Point Star
  'shape8pointStar': [1.0, 1.0],  // 8-Point Star
  'star10Point': [1.0, 1.0],  // 10-Point Star
  'star12Point': [0.95, 0.95],  // 12-Point Star
  'shape16pointStar': [0.95, 0.95],  // 16-Point Star
  'shape24pointStar': [0.95, 0.95],  // 24-Point Star
  'shape32pointStar': [0.95, 0.95],  // 32-Point Star
  'upRibbon': [1.0, 0.633],  // Up Ribbon
  'downRibbon': [1.0, 0.633],  // Down Ribbon
  'curvedUpRibbon': [1.0, 0.767],  // Curved Up Ribbon
  'curvedDownRibbon': [1.0, 0.767],  // Curved Down Ribbon
  'verticalScroll': [0.95, 1.0],  // Vertical Scroll
  'horizontalScroll': [1.0, 0.95],  // Horizontal Scroll
  'wave': [1.0, 0.883],  // Wave
  'doubleWave': [1.0, 0.9],  // Double Wave
  'rectangularCallout': [0.9, 0.95],  // Rectangular Callout
  'roundedRectangularCallout': [0.9, 0.883],  // Rounded Rectangular Callout
  'ovalCallout': [0.95, 0.95],  // Oval Callout
  'cloudCallout': [1.0, 1.0],  // Cloud Callout
  'lineCallout2': [1.0, 0.633],  // Line Callout 2
  'lineCallout3': [1.0, 0.633],  // Line Callout3
  'lineCallout4': [0.95, 0.883],  // Line Callout 4
  'lineCallout2AccentBar': [1.0, 0.633],  // Line Callout 2 (Accent Bar)
  'lineCallout3AccentBar': [1.0, 0.633],  // Line Callout 3 (Accent Bar)
  'lineCallout4AccentBar': [0.95, 0.883],  // Line Callout 4 (Accent Bar)
  'lineCallout2NoBorder': [1.0, 0.7],  // Line Callout 2 (No Border)
  'lineCallout3NoBorder': [1.0, 0.633],  // Line Callout 3 (No Border)
  'lineCallout4NoBorder': [0.95, 0.883],  // Line Callout 4 (No Border)
  'lineCallout2BorderandAccentBar': [1.0, 0.633],  // Line Callout 2 (Border and Accent Bar)
  'lineCallout3BorderandAccentBar': [1.0, 0.633],  // Line Callout 3 (Border and Accent Bar)
  'lineCallout4BorderandAccentBar': [0.95, 0.883],  // Line Callout 4 (Border and Accent Bar)
};
