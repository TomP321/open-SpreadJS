// Table theme JSON shapes (TASK 80 split of table-theme-data.ts).
export interface ThemeStyleJSON {
  backColor?: string; foreColor?: string; font?: string; fontFamily?: string;
  fontSize?: string; fontStyle?: string; fontWeight?: string;
  borderLeft?: { color?: string; style?: number }; borderTop?: { color?: string; style?: number };
  borderRight?: { color?: string; style?: number }; borderBottom?: { color?: string; style?: number };
  borderHorizontal?: { color?: string; style?: number }; borderVertical?: { color?: string; style?: number };
}
export interface ThemeJSON {
  name?: string; headerRowStyle?: ThemeStyleJSON; footerRowStyle?: ThemeStyleJSON;
  wholeTableStyle?: ThemeStyleJSON; firstRowStripStyle?: ThemeStyleJSON; secondRowStripStyle?: ThemeStyleJSON;
  firstColumnStripStyle?: ThemeStyleJSON; secondColumnStripStyle?: ThemeStyleJSON;
  firstHeaderCellStyle?: ThemeStyleJSON; lastHeaderCellStyle?: ThemeStyleJSON;
  firstFooterCellStyle?: ThemeStyleJSON; lastFooterCellStyle?: ThemeStyleJSON;
  highlightFirstColumnStyle?: ThemeStyleJSON; highlightLastColumnStyle?: ThemeStyleJSON;
  firstRowStripSize?: number; secondRowStripSize?: number; firstColumnStripSize?: number; secondColumnStripSize?: number;
}
