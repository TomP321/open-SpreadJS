import type { IButtonGroup, ICommandGroup, IDesignerConfig, IRibbonPanel } from './types.js';
import { createCommandMap } from './commands/index.js';
import { pivotContextualTabs } from './pivot-ribbon.js';

const c = (command: string): string => command;
const dir = (direction: string, children: (ICommandGroup | string)[]): ICommandGroup => ({ direction, children });
const dropdown = (command: string, children: (ICommandGroup | string)[], extra: Partial<ICommandGroup> = {}): ICommandGroup => ({ command, type: 'dropdown', children, ...extra });
const group = (command: string, children: (ICommandGroup | string)[], extra: Partial<ICommandGroup> = {}): ICommandGroup => ({ command, type: 'group', children, ...extra });
const g = (label: string, thumbnailClass: string, commandGroup: ICommandGroup, extra: Partial<IButtonGroup> = {}): IButtonGroup => ({
  label, thumbnailClass, thumbnailGroupId: thumbnailClass, commandGroup, ...extra,
});

const homeGroups: IButtonGroup[] = [
  {
    label: 'Undo', thumbnailClass: 'ribbon-thumbnail-undoredo', thumbnailGroupId: 'ribbon-thumbnail-undoredo',
    commandGroup: {
      children: [
        { direction: 'vertical', className: 'gc-designer-ribbon-undo-redo-btn', children: [c('undo'), c('redo')] },
        dir('vertical', [c('undoList'), c('redoList')]),
      ],
    },
  },
  {
    label: 'Clipboard', thumbnailClass: 'ribbon-thumbnail-clipboard', thumbnailGroupId: 'ribbon-thumbnail-clipboard',
    commandGroup: {
      children: [
        dropdown('pasteAll', [
          group('PasteGroup', [
            c('pasteAll'), c('pasteFormulas'), c('pasteFormulasAndFormatting'), c('pasteFormulaAndNumberFormat'),
            c('pasteKeepSourceFormatting'), c('pasteNoBorders'), c('pasteColumnWidth'), c('pasteTranspose'),
          ]),
          group('PasteValueGroup', [
            c('pasteValues'), c('pasteValuesAndFormatting'), c('pasteValueAndNumberFormat'), c('pasteValueAndSourceFormat'),
          ]),
          group('OtherPasteGroup', [c('pasteFormatting'), c('pasteLink'), c('pasteLinkedPicture')]),
          { type: 'separator' },
          c('openPasteSpecialDialog'),
        ]),
        dir('vertical', [c('cut'), c('copy'), c('formatPainter')]),
      ],
    },
  },
  {
    label: 'Font', indicator: 'indicatorFonts', thumbnailClass: 'ribbon-thumbnail-fonts', thumbnailGroupId: 'ribbon-thumbnail-fonts',
    commandGroup: {
      children: [
        dir('vertical', [
          { direction: 'horizontal', className: 'gc-designer-font-row', children: [c('fontFamily'), c('fontSize'), c('increaseFontsize'), c('decreaseFontsize')] },
          { direction: 'horizontal', className: 'gc-designer-font-row', children: [
            c('fontWeight'), c('fontItalic'), c('fontUnderline'), c('fontDoubleUnderline'), c('separator'),
            dropdown('border', [
              c('bottomBorder'), c('topBorder'), c('leftBorder'), c('rightBorder'), c('separator'),
              c('noBorder'), c('allBorder'), c('outsideBorder'), c('thickBoxBorder'), c('separator'),
              c('bottomDoubleBorder'), c('thickBottomBorder'), c('topBottomBorder'), c('topThickBottomBorder'),
              c('topDoubleBottomBorder'), c('moreBorder'),
            ]),
            c('separator'), c('backColor'), c('foreColor'),
          ] },
        ]),
      ],
    },
  },
  {
    label: 'Alignment', indicator: 'indicatorAlignment', thumbnailClass: 'ribbon-thumbnail-alignment', thumbnailGroupId: 'ribbon-thumbnail-alignment', class: 'rb-alignment',
    commandGroup: {
      children: [
        dir('vertical', [
          dir('horizontal', [
            c('topAlign'), c('middleAlign'), c('bottomAlign'), c('separator'),
            dropdown('orientationList', [
              c('angleCounterclockwise'), c('angleClockwise'), c('verticalText'), c('rotateTextUp'),
              c('rotateTextDown'), c('separator'), c('formatCellAlignment'),
            ]),
          ]),
          dir('horizontal', [
            c('leftAlign'), c('centerAlign'), c('rightAlign'), c('separator'),
            c('decreaseIndent'), c('increaseIndent'),
          ]),
        ]),
        { type: 'separator' },
        dir('vertical', [
          dir('horizontal', [c('wrapText')]),
          dir('horizontal', [dropdown('mergeCenter', [c('mergeCenterButton'), c('mergeAcross'), c('mergeCells'), c('unMergeCells')])]),
        ]),
      ],
    },
  },
  {
    label: 'Number', indicator: 'indicatorNumbers', thumbnailClass: 'ribbon-thumbnail-numbers', thumbnailGroupId: 'ribbon-thumbnail-numbers',
    commandGroup: {
      children: [
        dir('vertical', [
          dropdown('ribbonNumberFormat', [
            c('formatGeneral'), c('numberFormat'), c('currencyFormat'), c('accountingFormat'),
            c('shortDateFormat'), c('longDateformat'), c('timeFormat'), c('percentageFormat'),
            c('fractionFormat'), c('scientificFormat'), c('textFormat'), c('separator'), c('formatMore'),
          ]),
          { direction: 'horizontal', className: 'ribbon-format-quick-actions', children: [c('formatPercentage'), c('formatComma'), c('separator'), c('increaseDecimal'), c('decreaseDecimal')] },
        ]),
      ],
    },
  },
  {
    label: 'Styles', thumbnailClass: 'ribbon-thumbnail-styles', thumbnailGroupId: 'ribbon-thumbnail-styles',
    commandGroup: {
      children: [
        dropdown('conditionFormat', [
          dropdown('highlightCellsRules', [
            c('highlightCellsRulesGreaterThan'), c('highlightCellsRulesLessThan'), c('highlightCellsRulesBetween'),
            c('highlightCellsRulesEqualTo'), c('highlightCellsRulesContains'), c('highlightCellsRulesDateOccurring'),
            c('highlightCellsRulesDuplicateValues'), c('separator'), c('highlightCellsMoreRules'),
          ]),
          dropdown('topBottomRules', [
            c('topBottomRulesTop10'), c('topBottomRulesTop10Percent'), c('topBottomRulesBottom10'),
            c('topBottomRulesBottom10Percent'), c('topBottomRulesAboveAverage'), c('topBottomRulesBelowAverage'),
            c('separator'), c('topBottomRulesMoreRules'),
          ]),
          c('separator'),
          dropdown('dataBar', [
            group('gradientFill', ['gradientFillBlueDataBar', 'gradientFillGreenDataBar', 'gradientFillRedDataBar', 'gradientFillOrangeDataBar', 'gradientFillLightBlueDataBar', 'gradientFillPurpleDataBar']),
            group('solidFill', ['solidFillBlueDataBar', 'solidFillGreenDataBar', 'solidFillRedDataBar', 'solidFillOrangeDataBar', 'solidFillLightBlueDataBar', 'solidFillPurpleDataBar']),
            c('separator'), c('moreDataBarRules'),
          ], { dropdownMaxWidth: 126 }),
          dropdown('colorScalesList', [
            group('colorScalesList2', ['colorScaleGyr', 'colorScaleRyg', 'colorScaleGwr', 'colorScaleRwg', 'colorScaleBwr', 'colorScaleRwb', 'colorScaleWr', 'colorScaleRw', 'colorScaleGw', 'colorScaleWg', 'colorScaleGy', 'colorScaleYg']),
            c('separator'), c('moreColorScaleRules'),
          ], { dropdownMaxWidth: 170 }),
          dropdown('iconSetList', [
            group('directional', ['iconSetThreeArrowsColored', 'iconSetThreeArrowsGray', 'iconSet3Triangles', 'iconSetFourArrowsGray', 'iconSetFourArrowsColored', 'iconSetFiveArrowsGray', 'iconSetFiveArrowsColored']),
            group('shapes', ['iconSetThreeTrafficLightsUnRimmed', 'iconSetThreeTrafficLightsRimmed', 'iconSetThreeSigns', 'iconSetFourTrafficLights', 'iconSetFourRedToBlack']),
            group('indicators', ['iconSetThreeSymbolsCircled', 'iconSetThreeSymbolsUnCircled', 'iconSetThreeFlags']),
            group('ratings', ['iconSetThreeStars', 'iconSetFourRatings', 'iconSetFiveQuarters', 'iconSetFiveRatings', 'iconSetFiveBoxes']),
            c('separator'), c('moreIconSetRules'),
          ], { dropdownMaxWidth: 230 }),
          c('separator'), c('conditionFormatNewRule'),
          dropdown('clearRules', [c('clearCellRules'), c('clearSheetRules')]),
          c('conditionFormatManageRule'),
        ], { dropdownMaxWidth: 250 }),
        dropdown('formatTable2', [c('formatTableListContent'), c('separator'), c('newTableStyle'), c('clearTableStyle')], { keyTip: 'T', dropdownMaxWidth: 510 }),
        dropdown('cellStyles', [c('cellStylesListContent'), c('separator'), c('newCellStyle'), c('separator'), c('manageCellState')], { dropdownMaxWidth: 634 }),
        dropdown('namedCellTemplates', [c('namedCellTemplatesListContent')], { dropdownMaxWidth: 634 }),
        dropdown('cellEditors', [
          dropdown('cellType', [
            c('ribbonButtonButtonCellType'), c('checkboxCellType'), c('comboBoxCellType'), c('fileUploadCellType'),
            c('hyperlinkCellType'), c('rangeTemplateCellType'), c('dataObjectCellType'), c('separator'),
            c('diagonalCellType'), c('checkboxListCellType'), c('radioListCellType'), c('buttonListCellType'),
            c('separator'), c('clearCellType'),
          ]),
          dropdown('cellDropdowns', [
            c('calculatorCellType'), c('colorPickerCellType'), c('dateTimePickerCellType'), c('listCellType'),
            c('monthPickerCellType'), c('sliderCellType'), c('timePickerCellType'), c('workflowList'),
            c('multiColumnPicker'), c('separator'), c('clearCellDropdown'),
          ]),
        ]),
      ],
    },
  },
  {
    label: 'Cells', thumbnailClass: 'ribbon-thumbnail-cells', thumbnailGroupId: 'ribbon-thumbnail-cells',
    commandGroup: {
      children: [
        dropdown('cellsInsert', [c('insertCells'), c('separator'), c('insertSheetRows'), c('insertSheetColumns'), c('separator'), c('insertSheet')]),
        dropdown('cellsDelete', [c('deleteCells'), c('separator'), c('deleteSheetRows'), c('deleteSheetColumns'), c('separator'), c('deleteSheet')]),
        dropdown('cellsFormat', [
          c('cellFormatRowHeight'), c('autoFitRowHeight'), c('defaultRowHeight'), c('separator'),
          c('cellFormatColumnWidth'), c('autoFitColumnWidth'), c('defaultColumnWidth'), c('separator'),
          c('hideRows'), c('hideColumns'), c('unHideRows'), c('unHideColumns'), c('separator'), c('headers'),
          c('separator'), c('cellFormatProtectSheet'), c('unProtectSheet'), c('lockCells'), c('unLockCells'),
        ]),
      ],
    },
  },
  {
    label: 'Editing', thumbnailClass: 'ribbon-thumbnail-editing', thumbnailGroupId: 'ribbon-thumbnail-editing',
    commandGroup: {
      children: [
        dir('vertical', [
          dropdown('editingAutoSum', [c('editingAutoSum'), c('average'), c('countNumbers'), c('max'), c('min')]),
          dropdown('editingFillDown', [c('down'), c('right'), c('up'), c('left'), c('series')]),
          dropdown('clear', [c('clearAll'), c('clearFormat'), c('clearContent'), c('clearComments')]),
        ]),
        dropdown('editingSortFilter', [c('sortAZ'), c('sortZA'), c('customSortEditing'), c('setFilter'), c('clearFilter'), c('reapplyFilter')]),
        dropdown('editingFind', [c('find'), c('replace'), c('goto'), c('gotoSpecial')]),
      ],
    },
  },
];

const chartPreviews: ICommandGroup[] = [
  dropdown('columnOrBarChartPreview', [
    group('columnChartGroup', [c('clusteredColumnChart'), c('stackedColumnChart'), c('stackedColumn100Chart')]),
    group('barChartGroup', [c('clusteredBarChart'), c('stackedBarChart'), c('stackedBar100Chart')]),
  ]),
  dropdown('treeMapOrSunburstChartPreview', [
    group('treemapChartGroup', [c('treemapChart')]), group('sunburstChartGroup', [c('sunburstChart')]),
  ]),
  dropdown('funnelOrStockChartPreview', [
    group('waterfallChartGroup', [c('waterfallChart')]), group('funnelChartGroup', [c('funnelChart')]),
    group('stockChartGroup', [c('stockHLCChart'), c('stockOHLCChart'), c('stockVHLCChart'), c('stockVOHLCChart')]),
    group('radarChartGroup', [c('radarChart'), c('radarWithMarkersChart'), c('filledRadarChart')]),
  ]),
  dropdown('lineOrAreaChartPreview', [
    group('lineChartGroup', [c('lineChart'), c('lineStackedChart'), c('lineStacked100Chart'), c('lineMarkersChart'), c('lineMarkersStackedChart'), c('lineMarkersStacked100Chart')]),
    group('areaChartGroup', [c('areaChart'), c('areaStackedChart'), c('areaStacked100Chart')]),
  ]),
  dropdown('pieOrDoughnutChartPreview', [group('pieChartGroup', [c('pieChart')]), group('doughnutChartGroup', [c('doughnutChart')])]),
  dropdown('comboChartPreview', [group('comboChartGroup', [c('comboChartColumnAndLine'), c('comboChartColumnAndArea'), c('comboChartColumnAndLineAxis')])]),
  dropdown('scatterOrBubbleChartPreview', [
    group('scatterChartGroup', [c('scatterChart'), c('scatterSmoothMarkersChart'), c('scatterSmoothChart'), c('scatterStraightMarkersChart'), c('scatterStraightChart')]),
    group('bubbleChartGroup', [c('bubbleChart')]),
  ]),
];

const insertGroups: IButtonGroup[] = [
  g('Tables', 'ribbon-thumbnail-table', { children: [dropdown('insertTable', [c('insertTableFromDataTable')]), dropdown('insertPivotTable', [c('insertPivotTableFromDataTable')])] }, { visibleWhen: '!ReportSheetActive' }),
  g('Charts', 'ribbon-thumbnail-chart', {
    direction: 'horizontal',
    children: [
      c('insertChart'),
      dir('vertical', [dir('horizontal', chartPreviews.slice(0, 3)), dir('horizontal', chartPreviews.slice(3, 6)), dir('horizontal', chartPreviews.slice(6))]),
      c('insertBarCode'),
      dropdown('sparklineGallery', [
        group('lineSparklineGroup', [c('sparklinesLineSparkline'), c('sparklinesAreaSparkline')]),
        group('barSparklineGroup', [c('sparklinesColumnSparkline'), c('sparklinesWinLossSparkline'), c('sparklinesStackedSparkline'), c('sparklinesCascadeSparkline'), c('sparklinesParetoSparkline'), c('sparklinesHBarSparkline'), c('sparklinesVBarSparkline'), c('sparklinesHistogramSparkline')]),
        group('pieSparklineGroup', [c('sparklinesPieSparkline')]),
        group('scatterSparklineGroup', [c('sparklinesScatterSparkline'), c('sparklinesSpreadsSparkline')]),
        group('calendarSparklineGroup', [c('sparklinesMonthSparkline'), c('sparklinesYearSparkline')]),
        group('otherSparklineGroup', [c('sparklinesBoxPlotSparkline'), c('sparklinesBulletSparkline'), c('sparklinesVarianceSparkline'), c('sparklinesRangeBlockSparkline'), c('sparklinesGaugeKPISparkline'), c('sparklineImageSparkline'), c('sparklinesLollipopVarianceSparkline'), c('sparklinesProgressSparkline')]),
      ]),
    ],
  }),
  g('Illustrations', 'ribbon-thumbnail-illustration', {
    children: [
      dropdown('insertPicture', [c('placeInCells'), c('placeOverCells')]),
      dropdown('insertShape', [c('insertShapeRectangle'), c('insertShapeEllipse'), c('insertShapeLine'), c('insertShapeArrow'), c('insertShapeTriangle'), c('insertShapeDiamond')]),
      c('insertCameraShape'), dropdown('insertFormControlShape', [c('insertFormControlButton'), c('insertFormControlCheckbox'), c('insertFormControlCombo'), c('insertFormControlList')]),
    ],
  }),
  g('Links', 'ribbon-thumbnail-hyperlink', { commands: [c('insertHyperLink')] }, { visibleWhen: '!ReportSheetActive' }),
  g('Controls', 'ribbon-thumbnail-insertTextBox', { commands: [c('insertCheckbox'), c('InsertTextBox')] }),
];

const pageSetupGroup: ICommandGroup = {
  children: [
    dir('horizontal', [
      dropdown('margins', [c('marginNormal'), c('marginWide'), c('marginNarrow'), c('separator'), c('customMargins')]),
      dropdown('orientation', [c('orientationPortrait'), c('orientationLandscape')]),
      dropdown('paperSize', [c('paperLetter'), c('paperLegal'), c('paperA4'), c('paperA3')]),
      dropdown('printArea', [c('setPrintArea'), c('clearPrintArea')]),
      dropdown('breaks', [c('insertPageBreak'), c('removePageBreak'), c('separator'), c('resetAllPageBreaks')]),
      c('printTitles'),
    ]),
  ],
};
const pageLayoutGroups: IButtonGroup[] = [
  g('Themes', 'ribbon-thumbnail-themes', { children: [c('ThemeSetting'), dir('vertical', [c('ThemeColors'), c('ThemeFonts')])] }),
  g('Page Setup', 'ribbon-thumbnail-page-setup', pageSetupGroup, { indicator: 'indicatorPage', class: 'rb-page-setup' }),
  g('Background', 'ribbon-thumbnail-page-setup', { children: [c('worksheetBackground'), dir('vertical', [c('worksheetBackgroundRepeat'), c('worksheetBackgroundOverContent')])] }),
  g('Scale to Fit', 'ribbon-thumbnail-scale-to-fit', {
    children: [dir('horizontal', [
      dir('vertical', [c('scaleToFitWidthText'), c('scaleToFitHeightText'), c('scaleToFitScaleText')]),
      dir('vertical', [c('fitPageWidth'), c('fitPageTall'), c('fitPageScale')]),
    ])],
  }, { indicator: 'indicatorPage', visibleWhen: '!ReportSheetActive' }),
  g('Sheet Options', 'ribbon-thumbnail-sheet-option', {
    children: [dir('horizontal', [
      dir('vertical', [c('pageLayoutGridlinesText'), c('pageLayoutViewGridlines'), c('pageLayoutPrintGridlines')]),
      { type: 'separator', className: 'rb-sep-1' },
      dir('vertical', [c('pageLayoutHeadingsText'), c('pageLayoutViewHeadings'), c('pageLayoutPrintHeadings')]),
      { type: 'separator', className: 'rb-sep-2' },
      c('printLineVisible'),
    ])],
  }, { indicator: 'indicatorSheet', class: 'rb-sheet-options' }),
];

const formulaFunctionGroups: ICommandGroup = {
  children: [
    dropdown('formulaAutoSum', [c('editingAutoSum'), c('average'), c('countNumbers'), c('max'), c('min')]),
    c('formulaFinancial'), c('logicalFormula'), c('formulaText'), c('formulaDateTime'), c('formulaLookupReference'), c('formulaMathTrig'),
    dropdown('moreFunctions', [
      dropdown('formulaStatistical', []), dropdown('formulaEngineering', []), dropdown('formulaInformation', []),
      dropdown('formulaDatabase', []), dropdown('formulaWeb', []),
    ]),
  ],
};
const formulasGroups: IButtonGroup[] = [
  g('Functions', 'ribbon-button-insertfunction', { commands: [c('insertFunction')] }),
  g('Functions Library', 'ribbon-thumbnail-functions', formulaFunctionGroups),
  g('Names', 'ribbon-thumbnail-names', { commands: [c('nameManager')] }, { visibleWhen: '!ReportSheetActive' }),
  g('Formula Auditing', 'ribbon-thumbnail-formula-auditing', { direction: 'vertical', commands: [c('showFormulas'), c('showFormulaEditorPanel')] }, { class: 'rb-formula-auditing' }),
  g('Calculation', 'ribbon-thumbnail-formula-calculation', {
    children: [dir('horizontal', [dropdown('calculationOptionsPanel', [c('calculationOptionAutomatic'), c('calculationOptionPartial'), c('calculationOptionManual')]), dir('vertical', [c('calculateNow'), c('calculateSheet')])])],
  }, { visibleWhen: '!ReportSheetActive', class: 'rb-formula-calculation' }),
];

const dataGroups: IButtonGroup[] = [
  g('Data Binding', 'ribbon-thumbnail-data-sources', { children: [dropdown('templateDesignMode', [c('loadSchema'), c('saveSchema'), c('clearBindingPath'), c('autoGenerateLabel'), c('bindDataManager')])] }, { visibleWhen: '!activeSpreadIsDesignSpread' }),
  g('Queries & Connections', 'ribbon-thumbnail-queriedAndConnections', { commands: [c('editLinks')] }, { visibleWhen: '!ReportSheetActive && !activeSpreadIsDesignSpread' }),
  g('Sort & Filter', 'ribbon-thumbnail-sortAndFilter', {
    children: [dir('horizontal', [
      dir('vertical', [c('sortAZData'), c('sortZAData')]), c('customSortData'), c('setFilterData'), dir('vertical', [c('clearFilterData'), c('reapplyFilterData')]),
    ])],
  }, { visibleWhen: '!ReportSheetActive && !activeSpreadIsDesignSpread' }),
  g('Data Tools', 'ribbon-thumbnail-datatools', {
    children: [dir('horizontal', [c('textToColumn'), dropdown('dataValidation', [c('dropdownDataValidation'), c('circleInvalidDataCommand'), c('clearInvalidCircles')]), c('removeDuplicates')])],
  }),
  g('Outline', 'ribbon-thumbnail-outline', {
    children: [
      dir('horizontal', [
        dir('vertical', [dropdown('group', [c('innerGroup'), c('autoOutline')]), dropdown('ungroup', [c('innerUngroup'), c('clearOutline')]), c('subtotal')]),
        dir('vertical', [c('showDetail'), c('hideDetail')]),
      ]),
    ],
  }, { visibleWhen: '!ReportSheetActive && !activeSpreadIsDesignSpread', indicator: 'indicatorOutline' }),
  g('Forecast', 'ribbon-thumbnail-forecast', { children: [dropdown('whatIfAnalysis', [c('showScenarioPanel'), c('goalSeek'), c('dataTable')])] }, { visibleWhen: '!ReportSheetActive && !TableSheetActive && !DataManagerActive && !IsInTableSheetDesignMode && !GanttSheetActive && !activeSpreadIsDesignSpread' }),
];

const reviewGroups: IButtonGroup[] = [
  g('Threaded Comments', 'ribbon-thumbnail-threaded-comments', { commands: [c('NewThreadedComment'), c('DeleteThreadedComment'), c('PreviousThreadedComment'), c('NextThreadedComment'), c('ShowThreadedComments')] }),
];

const viewGroups: IButtonGroup[] = [
  g('Show/Hide', 'ribbon-thumbnail-showhide', {
    children: [dir('horizontal', [
      dir('vertical', [c('showHideRowHeader'), c('showHideColumnHeader')]),
      dir('vertical', [c('showHideVGridLine'), c('showHideHGridLine')]),
      dir('vertical', [c('showHideTabStrip'), c('showHideNewTab')]),
      dir('vertical', [dropdown('focusCell', [c('focusCellMenuItem'), c('focusCellColor'), c('focusCellShowAutoHighlight')])]),
    ])],
  }, { class: 'rb-showhide' }),
  g('Zoom', 'ribbon-thumbnail-zoom', { commands: [c('zoom'), c('zoomDefault'), c('zoomSelection')] }),
  g('Viewport', 'ribbon-thumbnail-viewport', { children: [dir('horizontal', [dropdown('viewportFreezePanes', [c('freezePanes'), c('freezeTopRow'), c('freezeFirstColumn'), c('freezeBottomRow'), c('freezeLastColumn')]), c('unfreezePanes')])] }),
  g('Pane', 'ribbon-thumbnail-chart-alt-text', { commands: [c('selectionPaneButton')] }, { visibleWhen: '!ReportSheetActive' }),
  g('Command Palette', '', { children: [dir('horizontal', [c('commandPaletteButton')])] }),
];

/* Shape Format contextual tab (trial 19.2.5): groups observed on the official
 * designer with a shape selected — Insert Shapes, Shape Styles (Change Shape +
 * six quick styles), Accessibility, Rotate, Group, Align, Arrange (order
 * dropdown, Size dialog, Selection Pane) and Format Pane. */
const shapeFormatGroups: IButtonGroup[] = [
  g('Insert Shapes', 'ribbon-thumbnail-shape-insert', { children: [c('shapeFormatInsertShapes')] }, { class: 'rb-shape-insert' }),
  g('Shape Styles', 'ribbon-thumbnail-shape-styles', {
    children: [dir('horizontal', [
      c('changeShape'),
      dir('horizontal', [
        c('shapeStyle1'), c('shapeStyle2'), c('shapeStyle3'), c('shapeStyle4'), c('shapeStyle5'), c('shapeStyle6'), c('shapeStyle7'),
        dropdown('shapeStylesMore', []),
      ]),
    ])],
  }, { class: 'rb-shape-styles' }),
  g('Accessibility', 'ribbon-thumbnail-shape-accessibility', { children: [dir('vertical', [c('shapeAltText')])] }),
  g('Rotate', 'ribbon-thumbnail-shape-rotate', { children: [dir('vertical', [dropdown('shapeRotate', [])])] }),
  g('Group', 'ribbon-thumbnail-shape-group', { children: [dir('vertical', [dropdown('shapeGroup', [c('shapeUnGroup')])])] }),
  g('Align', 'ribbon-thumbnail-shape-align', { children: [dir('vertical', [dropdown('shapeAlign', [])])] }),
  g('Arrange', 'ribbon-thumbnail-shape-arrange', {
    children: [dir('horizontal', [
      c('bringShapeForward'), c('sendShapeBackward'),
      dropdown('shapeSize', []),
      c('selectionPaneButton'),
    ])],
  }),
  g('Format Pane', 'ribbon-thumbnail-shape-format-pane', { children: [dir('vertical', [c('shapeFormatPane')])] }),
];

const settingsGroups: IButtonGroup[] = [  g('Spread Settings', 'ribbon-thumbnail-spreadsettings', {
    children: [dir('horizontal', [c('spreadSettingGeneral'), dir('vertical', [c('spreadSettingScrollBar'), c('spreadSettingCalculation'), c('spreadSettingTabStrip')])])],
  }, { class: 'rb-spread-settings' }),
  g('Sheet Settings', 'ribbon-thumbnail-sheetsettings', {
    children: [dir('horizontal', [c('sheetSettingGeneral'), dir('vertical', [c('sheetSettingGridLine'), c('sheetSettingHeaders')])])],
  }, { class: 'rb-sheet-settings' }),
];

const mainTabs: IRibbonPanel[] = [
  { id: 'home', text: 'Home', buttonGroups: homeGroups },
  { id: 'insert', text: 'Insert', buttonGroups: insertGroups },
  { id: 'pageLayout', text: 'Page Layout', buttonGroups: pageLayoutGroups },
  { id: 'formulas', text: 'Formulas', buttonGroups: formulasGroups },
  { id: 'data', text: 'Data', buttonGroups: dataGroups },
  { id: 'review', text: 'Review', buttonGroups: reviewGroups },
  { id: 'view', text: 'View', buttonGroups: viewGroups },
  { id: 'settings', text: 'Settings', buttonGroups: settingsGroups },
  { id: 'shapeFormat', text: 'Shape Format', buttonGroups: shapeFormatGroups, contextual: true },
  ...pivotContextualTabs,
];

const toolbarHome: IButtonGroup[] = [
  { buttonGroupName: 'Clipboard', commandGroup: { children: [dir('horizontal', [c('undo'), c('redo'), c('separator'), c('pasteAll'), c('cut'), c('copy'), c('formatPainter')])] } },
  { overflow: true, overflowTitle: 'More Font Options', commandGroup: { children: [dir('horizontal', [c('fontFamily'), c('fontSize'), c('fontWeight'), c('fontItalic'), c('fontUnderline'), c('border'), c('backColor'), c('foreColor')])] } },
  { buttonGroupName: 'Alignment', commandGroup: { children: [dir('horizontal', [c('leftAlign'), c('centerAlign'), c('rightAlign'), c('topAlign'), c('middleAlign'), c('bottomAlign'), c('orientationList'), c('wrapText'), c('mergeCenter')])] } },
  { buttonGroupName: 'Cells', commandGroup: { children: [dir('horizontal', [c('ribbonNumberFormat'), c('formatPercentage'), c('formatComma'), c('increaseDecimal'), c('decreaseDecimal'), c('cellsInsert'), c('cellsDelete'), c('cellsFormat')])] } },
  { buttonGroupName: 'Editing', commandGroup: { children: [dir('horizontal', [c('editingAutoSum'), c('editingSortFilter'), c('editingFind')])] } },
];
const toolbarTabs: IRibbonPanel[] = mainTabs.map((tab) => tab.id === 'home' ? { ...tab, buttonGroups: toolbarHome } : tab);

const sidePanels = [
  { position: 'top' as const, allowResize: true, minHeight: '34px', maxHeight: '200px', height: '34px', command: 'formulaBarPanel', uiTemplate: 'formulaBarTemplate' },
  { position: 'bottom' as const, command: 'statusBarPanel', uiTemplate: 'statusBarPanelTemplate' },
  { position: 'full' as const, command: 'fileMenuPanel', uiTemplate: 'fileMenuPanelTemplate' },
];

const contextMenu = [
  'contextMenuCut', 'contextMenuCopy', 'contextMenuPaste', 'designerPasteAll', 'pasteFormula', 'designerPasteValues',
  'designerPasteFormatting', 'contextMenuPasteSpecial', 'gc.spread.contextMenu.insertRows',
  'gc.spread.contextMenu.deleteRows', 'gc.spread.contextMenu.insertColumns', 'gc.spread.contextMenu.deleteColumns',
  'gc.spread.contextMenu.clearContents', 'insertCopiedCells', 'insertCutCells', 'gc.spread.contextMenu.insertSheet',
  'gc.spread.contextMenu.deleteSheet', 'gc.spread.contextMenu.insertComment', 'gc.spread.contextMenu.deleteComment',
  'gc.spread.contextMenu.toggleComment', 'formatCells', 'defineName', 'link', 'editHyperlink', 'removeHyperlink',
  'gc.spread.contextMenu.filter', 'sort', 'protectSheet', 'unprotectSheet', 'columnWidth', 'rowHeight',
  'gc.spread.contextMenu.hideRows', 'gc.spread.contextMenu.unhideRows', 'gc.spread.contextMenu.hideColumns',
  'gc.spread.contextMenu.unhideColumns', 'showTabColor', 'gc.spread.contextMenu.hideSheet', 'contextMenuUnhideSheet',
];

const base: IDesignerConfig = {
  commandMap: createCommandMap(),
  ribbon: mainTabs,
  fileMenu: 'fileMenuButton',
  sidePanels,
  contextMenu,
  quickAccessBar: [],
};

/** Public mutable default config, matching the trial's tab ids, order and nesting. */
export const DefaultConfig: IDesignerConfig = base;

export const ToolBarModeConfig: IDesignerConfig = {
  ...base,
  ribbon: { panels: toolbarTabs, ribbonHeight: 50 },
  commandMap: createCommandMap(),
};

/**
 * Split the configured ribbon into the always-visible main tabs and the
 * contextual tabs (trial's "Shape Format") that the host renders only while
 * their trigger holds, mirroring the documented main-tab list.
 */
export function resolveRibbon(config: IDesignerConfig): { panels: IRibbonPanel[]; contextualPanels: IRibbonPanel[]; ribbonHeight: number } {
  const all = Array.isArray(config.ribbon) ? config.ribbon : config.ribbon?.panels ?? mainTabs;
  const ribbonHeight = Array.isArray(config.ribbon) ? 142 : config.ribbon?.ribbonHeight ?? 142;
  return {
    panels: all.filter((p) => !p.contextual),
    contextualPanels: all.filter((p) => p.contextual),
    ribbonHeight,
  };
}

/** Official collapse order and 1px thresholds re-measured from the v19 trial (smooth 1px resizes, 2026-11-17). */
export const ribbonCollapseThresholds: Record<string, { label: string; width: number }[]> = {
  home: [
    { label: 'Editing', width: 1565 }, { label: 'Cells', width: 1407 }, { label: 'Styles', width: 1295 },
    { label: 'Number', width: 982 }, { label: 'Alignment', width: 913 }, { label: 'Font', width: 693 },
    { label: 'Clipboard', width: 530 }, { label: 'Undo', width: 504 },
  ],
  insert: [{ label: 'Controls', width: 896 }, { label: 'Illustrations', width: 824 }, { label: 'Charts', width: 673 }],
  pageLayout: [
    { label: 'Sheet Options', width: 1177 }, { label: 'Scale to Fit', width: 988 }, { label: 'Background', width: 893 },
    { label: 'Page Setup', width: 782 },
  ],
  formulas: [{ label: 'Calculation', width: 1088 }, { label: 'Formula Auditing', width: 954 }, { label: 'Functions Library', width: 872 }],
  data: [{ label: 'Outline', width: 896 }, { label: 'Data Tools', width: 821 }, { label: 'Sort & Filter', width: 671 }, { label: 'Queries & Connections', width: 520 }],
  review: [],
  view: [{ label: 'Viewport', width: 997 }, { label: 'Zoom', width: 908 }, { label: 'Show/Hide', width: 787 }],
  settings: [],
};
