// Table theme definitions observed through the public TableThemes API.
// Theme colour tokens resolve against the default Office palette.
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
export const TABLE_THEME_JSON: Record<string, ThemeJSON> = {
 "dark1": {
  "firstColumnStripStyle": {
   "backColor": "Text 1 25"
  },
  "firstRowStripStyle": {
   "backColor": "Text 1 25"
  },
  "footerRowStyle": {
   "backColor": "Text 1",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Text 1 25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Text 1 25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark1",
  "wholeTableStyle": {
   "backColor": "Text 1 50",
   "foreColor": "white"
  }
 },
 "dark10": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 3 80",
   "borderTop": {
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 4",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Dark10",
  "wholeTableStyle": {
   "backColor": "Accent 3 80"
  }
 },
 "dark11": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 5 80",
   "borderTop": {
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 6",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Dark11",
  "wholeTableStyle": {
   "backColor": "Accent 5 80"
  }
 },
 "dark2": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 -25"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 -25"
  },
  "footerRowStyle": {
   "backColor": "Accent 1 -50",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 1 -25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 1 -25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark2",
  "wholeTableStyle": {
   "backColor": "Accent 1",
   "foreColor": "white"
  }
 },
 "dark3": {
  "firstColumnStripStyle": {
   "backColor": "Accent 2 -25"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 2 -25"
  },
  "footerRowStyle": {
   "backColor": "Accent 2 -50",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 2 -25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 2 -25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark3",
  "wholeTableStyle": {
   "backColor": "Accent 2",
   "foreColor": "white"
  }
 },
 "dark4": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 -25"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 -25"
  },
  "footerRowStyle": {
   "backColor": "Accent 3 -50",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 3 -25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 3 -25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark4",
  "wholeTableStyle": {
   "backColor": "Accent 3",
   "foreColor": "white"
  }
 },
 "dark5": {
  "firstColumnStripStyle": {
   "backColor": "Accent 4 -25"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 4 -25"
  },
  "footerRowStyle": {
   "backColor": "Accent 4 -50",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 4 -25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 4 -25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark5",
  "wholeTableStyle": {
   "backColor": "Accent 4",
   "foreColor": "white"
  }
 },
 "dark6": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 -25"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 -25"
  },
  "footerRowStyle": {
   "backColor": "Accent 5 -50",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 5 -25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 5 -25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark6",
  "wholeTableStyle": {
   "backColor": "Accent 5",
   "foreColor": "white"
  }
 },
 "dark7": {
  "firstColumnStripStyle": {
   "backColor": "Accent 6 -25"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 6 -25"
  },
  "footerRowStyle": {
   "backColor": "Accent 6 -50",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "black",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 6 -25",
   "borderRight": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 6 -25",
   "borderLeft": {
    "color": "white",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Dark7",
  "wholeTableStyle": {
   "backColor": "Accent 6",
   "foreColor": "white"
  }
 },
 "dark8": {
  "firstColumnStripStyle": {
   "backColor": "Background 1 -35"
  },
  "firstRowStripStyle": {
   "backColor": "Background 1 -35"
  },
  "footerRowStyle": {
   "backColor": "Background 1 -15",
   "borderTop": {
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Text 1",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Dark8",
  "wholeTableStyle": {
   "backColor": "Background 1 -15"
  }
 },
 "dark9": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 1 80",
   "borderTop": {
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 2",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Dark9",
  "wholeTableStyle": {
   "backColor": "Accent 1 80"
  }
 },
 "light1": {
  "firstColumnStripStyle": {
   "backColor": "Text 1 80"
  },
  "firstRowStripStyle": {
   "backColor": "Text 1 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Text 1",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Text 1 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Text 1",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Text 1 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Text 1 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Text 1 -25"
  },
  "name": "Light1",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Text 1",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1",
    "style": 1
   },
   "foreColor": "Text 1 -25"
  }
 },
 "light10": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 2",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Accent 2",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 2",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 2",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light10",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 2",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Accent 2",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 2",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 2",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 2",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2",
    "style": 1
   }
  }
 },
 "light11": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 3",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Accent 3",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 3",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 3",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light11",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 3",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Accent 3",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 3",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 3",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 3",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3",
    "style": 1
   }
  }
 },
 "light12": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 4",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Accent 4",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 4",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 4",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light12",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 4",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Accent 4",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 4",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 4",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 4",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4",
    "style": 1
   }
  }
 },
 "light13": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 5",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Accent 5",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 5",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 5",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light13",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 5",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Accent 5",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 5",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 5",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 5",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5",
    "style": 1
   }
  }
 },
 "light14": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 6",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Accent 6",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 6",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 6",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light14",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 6",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Accent 6",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 6",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 6",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 6",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6",
    "style": 1
   }
  }
 },
 "light15": {
  "firstColumnStripStyle": {
   "backColor": "Text 1 80"
  },
  "firstRowStripStyle": {
   "backColor": "Text 1 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Text 1",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Text 1",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light15",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Text 1",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Text 1",
    "style": 1
   },
   "borderLeft": {
    "color": "Text 1",
    "style": 1
   },
   "borderRight": {
    "color": "Text 1",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1",
    "style": 1
   },
   "borderVertical": {
    "color": "Text 1",
    "style": 1
   }
  }
 },
 "light16": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 1",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 1",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light16",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 1",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 1",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 1",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 1",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 1",
    "style": 1
   }
  }
 },
 "light17": {
  "firstColumnStripStyle": {
   "backColor": "Accent 2 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 2 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 2",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 2",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light17",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 2",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 2",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 2",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 2",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 2",
    "style": 1
   }
  }
 },
 "light18": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 3",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 3",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light18",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 3",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 3",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 3",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 3",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 3",
    "style": 1
   }
  }
 },
 "light19": {
  "firstColumnStripStyle": {
   "backColor": "Accent 4 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 4 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 4",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 4",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light19",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 4",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 4",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 4",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 4",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 4",
    "style": 1
   }
  }
 },
 "light2": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 1",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 1 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 1",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 1 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 1 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 1 -25"
  },
  "name": "Light2",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 1",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1",
    "style": 1
   },
   "foreColor": "Accent 1 -25"
  }
 },
 "light20": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 5",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 5",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light20",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 5",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 5",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 5",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 5",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 5",
    "style": 1
   }
  }
 },
 "light21": {
  "firstColumnStripStyle": {
   "backColor": "Accent 6 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 6 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 6",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 6",
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light21",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 6",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 6",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 6",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 6",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 6",
    "style": 1
   }
  }
 },
 "light3": {
  "firstColumnStripStyle": {
   "backColor": "Accent 2 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 2 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 2",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 2 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 2",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 2 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 2 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 2 -25"
  },
  "name": "Light3",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 2",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2",
    "style": 1
   },
   "foreColor": "Accent 2 -25"
  }
 },
 "light4": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 3",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 3 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 3",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 3 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 3 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 3 -25"
  },
  "name": "Light4",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 3",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3",
    "style": 1
   },
   "foreColor": "Accent 3 -25"
  }
 },
 "light5": {
  "firstColumnStripStyle": {
   "backColor": "Accent 4 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 4 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 4",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 4 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 4",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 4 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 4 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 4 -25"
  },
  "name": "Light5",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 4",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4",
    "style": 1
   },
   "foreColor": "Accent 4 -25"
  }
 },
 "light6": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 5",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 5 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 5",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 5 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 5 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 5 -25"
  },
  "name": "Light6",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 5",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5",
    "style": 1
   },
   "foreColor": "Accent 5 -25"
  }
 },
 "light7": {
  "firstColumnStripStyle": {
   "backColor": "Accent 6 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 6 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 6",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 6 -25"
  },
  "headerRowStyle": {
   "borderBottom": {
    "color": "Accent 6",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 6 -25"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 6 -25"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "Accent 6 -25"
  },
  "name": "Light7",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 6",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6",
    "style": 1
   },
   "foreColor": "Accent 6 -25"
  }
 },
 "light8": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Text 1",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Text 1",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Text 1",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Text 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light8",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Text 1",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Text 1",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Text 1",
    "style": 1
   },
   "borderLeft": {
    "color": "Text 1",
    "style": 1
   },
   "borderRight": {
    "color": "Text 1",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1",
    "style": 1
   }
  }
 },
 "light9": {
  "firstColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 1",
    "style": 1
   }
  },
  "firstRowStripStyle": {
   "borderTop": {
    "color": "Accent 1",
    "style": 1
   }
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 1",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "headerRowStyle": {
   "backColor": "Accent 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Light9",
  "secondColumnStripStyle": {
   "borderLeft": {
    "color": "Accent 1",
    "style": 1
   }
  },
  "secondRowStripStyle": {
   "borderTop": {
    "color": "Accent 1",
    "style": 1
   }
  },
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 1",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 1",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 1",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1",
    "style": 1
   }
  }
 },
 "medium1": {
  "firstColumnStripStyle": {
   "backColor": "Text 1 80"
  },
  "firstRowStripStyle": {
   "backColor": "Text 1 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Text 1 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Text 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium1",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Text 1 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Text 1 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Text 1 20",
    "style": 1
   },
   "borderRight": {
    "color": "Text 1 20",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1 20",
    "style": 1
   }
  }
 },
 "medium10": {
  "firstColumnStripStyle": {
   "backColor": "Accent 2 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 2 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 2",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Accent 2",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 2",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 2",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium10",
  "wholeTableStyle": {
   "backColor": "Accent 2 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 },
 "medium11": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 3",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Accent 3",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 3",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 3",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium11",
  "wholeTableStyle": {
   "backColor": "Accent 3 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 },
 "medium12": {
  "firstColumnStripStyle": {
   "backColor": "Accent 4 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 4 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 4",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Accent 4",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 4",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 4",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium12",
  "wholeTableStyle": {
   "backColor": "Accent 4 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 },
 "medium13": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 5",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Accent 5",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 5",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 5",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium13",
  "wholeTableStyle": {
   "backColor": "Accent 5 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 },
 "medium14": {
  "firstColumnStripStyle": {
   "backColor": "Accent 6 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 6 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 6",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Accent 6",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 6",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 6",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium14",
  "wholeTableStyle": {
   "backColor": "Accent 6 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 },
 "medium15": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Text 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Text 1",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Text 1",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Text 1",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Text 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium15",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderHorizontal": {
    "style": 1
   },
   "borderLeft": {
    "style": 1
   },
   "borderRight": {
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "style": 1
   }
  }
 },
 "medium16": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Accent 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 1",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 1",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 1",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Accent 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium16",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderLeft": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderRight": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "color": "#D3D3D3",
    "style": 1
   }
  }
 },
 "medium17": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Accent 2",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 2",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 2",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 2",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Accent 2",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium17",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderLeft": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderRight": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "color": "#D3D3D3",
    "style": 1
   }
  }
 },
 "medium18": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Accent 3",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 3",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 3",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 3",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Accent 3",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium18",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderLeft": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderRight": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "color": "#D3D3D3",
    "style": 1
   }
  }
 },
 "medium19": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Accent 4",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 4",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 4",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 4",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Accent 4",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium19",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderLeft": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderRight": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "color": "#D3D3D3",
    "style": 1
   }
  }
 },
 "medium2": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 1 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium2",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 1 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 1 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 1 20",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 1 20",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1 20",
    "style": 1
   }
  }
 },
 "medium20": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Accent 5",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 5",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 5",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 5",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Accent 5",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium20",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderLeft": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderRight": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "color": "#D3D3D3",
    "style": 1
   }
  }
 },
 "medium21": {
  "firstColumnStripStyle": {
   "backColor": "#D3D3D3"
  },
  "firstFooterCellStyle": {
   "backColor": "Accent 6",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "firstRowStripStyle": {
   "backColor": "#D3D3D3"
  },
  "footerRowStyle": {
   "borderTop": {
    "style": 6
   },
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 6",
   "borderBottom": {
    "style": 2
   },
   "borderTop": {
    "style": 2
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 6",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 6",
   "foreColor": "white"
  },
  "lastFooterCellStyle": {
   "backColor": "Accent 6",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium21",
  "wholeTableStyle": {
   "borderBottom": {
    "style": 2
   },
   "borderLeft": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderRight": {
    "color": "#D3D3D3",
    "style": 1
   },
   "borderTop": {
    "style": 2
   },
   "borderVertical": {
    "color": "#D3D3D3",
    "style": 1
   }
  }
 },
 "medium22": {
  "firstColumnStripStyle": {
   "backColor": "Text 1 60"
  },
  "firstRowStripStyle": {
   "backColor": "Text 1 60"
  },
  "footerRowStyle": {
   "backColor": "Text 1 80",
   "borderBottom": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderRight": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1",
    "style": 2
   },
   "borderVertical": {
    "color": "Text 1 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Text 1 80",
   "borderBottom": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderRight": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Text 1 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium22",
  "wholeTableStyle": {
   "backColor": "Text 1 80",
   "borderBottom": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderRight": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderTop": {
    "color": "Text 1 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Text 1 40",
    "style": 1
   }
  }
 },
 "medium23": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 1 80",
   "borderBottom": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1",
    "style": 2
   },
   "borderVertical": {
    "color": "Accent 1 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 1 80",
   "borderBottom": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 1 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium23",
  "wholeTableStyle": {
   "backColor": "Accent 1 80",
   "borderBottom": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 1 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 1 40",
    "style": 1
   }
  }
 },
 "medium24": {
  "firstColumnStripStyle": {
   "backColor": "Accent 2 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 2 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 2 80",
   "borderBottom": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2",
    "style": 2
   },
   "borderVertical": {
    "color": "Accent 2 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 2 80",
   "borderBottom": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 2 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium24",
  "wholeTableStyle": {
   "backColor": "Accent 2 80",
   "borderBottom": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 2 40",
    "style": 1
   }
  }
 },
 "medium25": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 3 80",
   "borderBottom": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3",
    "style": 2
   },
   "borderVertical": {
    "color": "Accent 3 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 3 80",
   "borderBottom": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 3 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium25",
  "wholeTableStyle": {
   "backColor": "Accent 3 80",
   "borderBottom": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 3 40",
    "style": 1
   }
  }
 },
 "medium26": {
  "firstColumnStripStyle": {
   "backColor": "Accent 4 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 4 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 4 80",
   "borderBottom": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4",
    "style": 2
   },
   "borderVertical": {
    "color": "Accent 4 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 4 80",
   "borderBottom": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 4 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium26",
  "wholeTableStyle": {
   "backColor": "Accent 4 80",
   "borderBottom": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 4 40",
    "style": 1
   }
  }
 },
 "medium27": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 5 80",
   "borderBottom": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5",
    "style": 2
   },
   "borderVertical": {
    "color": "Accent 5 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 5 80",
   "borderBottom": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 5 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium27",
  "wholeTableStyle": {
   "backColor": "Accent 5 80",
   "borderBottom": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 5 40",
    "style": 1
   }
  }
 },
 "medium28": {
  "firstColumnStripStyle": {
   "backColor": "Accent 6 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 6 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 6 80",
   "borderBottom": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6",
    "style": 2
   },
   "borderVertical": {
    "color": "Accent 6 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 6 80",
   "borderBottom": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 6 40",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium28",
  "wholeTableStyle": {
   "backColor": "Accent 6 80",
   "borderBottom": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6 40",
    "style": 1
   },
   "borderVertical": {
    "color": "Accent 6 40",
    "style": 1
   }
  }
 },
 "medium3": {
  "firstColumnStripStyle": {
   "backColor": "Accent 2 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 2 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 2 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 2",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium3",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 2 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 2 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 2 20",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 2 20",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 2 20",
    "style": 1
   }
  }
 },
 "medium4": {
  "firstColumnStripStyle": {
   "backColor": "Accent 3 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 3 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 3 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 3",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium4",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 3 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 3 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 3 20",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 3 20",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 3 20",
    "style": 1
   }
  }
 },
 "medium5": {
  "firstColumnStripStyle": {
   "backColor": "Accent 4 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 4 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 4 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 4",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium5",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 4 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 4 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 4 20",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 4 20",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 4 20",
    "style": 1
   }
  }
 },
 "medium6": {
  "firstColumnStripStyle": {
   "backColor": "Accent 5 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 5 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 5 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 5",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium6",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 5 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 5 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 5 20",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 5 20",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 5 20",
    "style": 1
   }
  }
 },
 "medium7": {
  "firstColumnStripStyle": {
   "backColor": "Accent 6 80"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 6 80"
  },
  "footerRowStyle": {
   "borderTop": {
    "color": "Accent 6 20",
    "style": 6
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "black"
  },
  "headerRowStyle": {
   "backColor": "Accent 6",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "highlightLastColumnStyle": {
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold"
  },
  "name": "Medium7",
  "wholeTableStyle": {
   "borderBottom": {
    "color": "Accent 6 20",
    "style": 1
   },
   "borderHorizontal": {
    "color": "Accent 6 20",
    "style": 1
   },
   "borderLeft": {
    "color": "Accent 6 20",
    "style": 1
   },
   "borderRight": {
    "color": "Accent 6 20",
    "style": 1
   },
   "borderTop": {
    "color": "Accent 6 20",
    "style": 1
   }
  }
 },
 "medium8": {
  "firstColumnStripStyle": {
   "backColor": "Text 1 60"
  },
  "firstRowStripStyle": {
   "backColor": "Text 1 60"
  },
  "footerRowStyle": {
   "backColor": "Text 1",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Text 1",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Text 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Text 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium8",
  "wholeTableStyle": {
   "backColor": "Text 1 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 },
 "medium9": {
  "firstColumnStripStyle": {
   "backColor": "Accent 1 60"
  },
  "firstRowStripStyle": {
   "backColor": "Accent 1 60"
  },
  "footerRowStyle": {
   "backColor": "Accent 1",
   "borderTop": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "headerRowStyle": {
   "backColor": "Accent 1",
   "borderBottom": {
    "color": "white",
    "style": 2
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   },
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightFirstColumnStyle": {
   "backColor": "Accent 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "highlightLastColumnStyle": {
   "backColor": "Accent 1",
   "font": "bold 14.667px calibri",
   "fontFamily": "calibri",
   "fontSize": "14.667px",
   "fontWeight": "bold",
   "foreColor": "white"
  },
  "name": "Medium9",
  "wholeTableStyle": {
   "backColor": "Accent 1 80",
   "borderHorizontal": {
    "color": "white",
    "style": 1
   },
   "borderVertical": {
    "color": "white",
    "style": 1
   }
  }
 }
};

export const THEME_COLORS: Record<string, string> = {
 "Accent 1": "#4f81bd",
 "Accent 1 -25": "#376393",
 "Accent 1 -50": "#244262",
 "Accent 1 20": "#719cca",
 "Accent 1 40": "#95b5d7",
 "Accent 1 60": "#b8cee4",
 "Accent 1 80": "#dce7f1",
 "Accent 2": "#c0504d",
 "Accent 2 -25": "#973835",
 "Accent 2 -50": "#652523",
 "Accent 2 20": "#cd7270",
 "Accent 2 40": "#da9694",
 "Accent 2 60": "#e6b8b7",
 "Accent 2 80": "#f2dcdb",
 "Accent 3": "#9bbb59",
 "Accent 3 -25": "#78943d",
 "Accent 3 -50": "#506228",
 "Accent 3 20": "#b0c97a",
 "Accent 3 40": "#c4d79b",
 "Accent 3 60": "#d8e4bc",
 "Accent 3 80": "#ecf1de",
 "Accent 4": "#8064a2",
 "Accent 4 -25": "#614a7b",
 "Accent 4 -50": "#413153",
 "Accent 4 20": "#9983b4",
 "Accent 4 40": "#b2a0c7",
 "Accent 4 60": "#ccc0da",
 "Accent 4 80": "#e5dfec",
 "Accent 5": "#4bacc6",
 "Accent 5 -25": "#31869b",
 "Accent 5 -50": "#215a67",
 "Accent 5 20": "#6dbed1",
 "Accent 5 40": "#92cedc",
 "Accent 5 60": "#b7dee8",
 "Accent 5 80": "#daeff3",
 "Accent 6": "#f79646",
 "Accent 6 -25": "#e46d0a",
 "Accent 6 -50": "#994906",
 "Accent 6 20": "#f9ab6a",
 "Accent 6 40": "#fac08f",
 "Accent 6 60": "#fcd5b4",
 "Accent 6 80": "#fdead9",
 "Background 1": "#ffffff",
 "Background 1 -15": "#d8d8d8",
 "Background 1 -35": "#a5a5a5",
 "Background 2": "#eeece1",
 "Background 2 -15": "#d6d1b6",
 "Background 2 -35": "#b4aa7a",
 "Black": "Black",
 "Blue": "Blue",
 "Followed Hyperlink": "Followed Hyperlink",
 "Hyperlink": "#0000ff",
 "Red": "Red",
 "Text 1": "#000000",
 "Text 1 -25": "#000000",
 "Text 1 20": "#333333",
 "Text 1 25": "#3f3f3f",
 "Text 1 40": "#666666",
 "Text 1 50": "#7f7f7f",
 "Text 1 60": "#999999",
 "Text 1 80": "#cccccc",
 "Text 2": "#1f497d",
 "Text 2 -25": "#17375e",
 "Text 2 20": "#2d6ab5",
 "Text 2 40": "#538ed5",
 "Text 2 60": "#8db4e2",
 "Text 2 80": "#c5d9f1",
 "White": "White"
};

// Theme tokens resolved under the Excel 2013 white theme stylesheet.
export const THEME_COLORS_2013: Record<string, string> = {
 "Accent 1": "#5b9bd5",
 "Accent 1 -25": "#2f77b7",
 "Accent 1 -50": "#1f4f7a",
 "Accent 1 20": "#7bafdd",
 "Accent 1 40": "#9bc3e6",
 "Accent 1 60": "#bdd7ee",
 "Accent 1 80": "#ddebf7",
 "Accent 2": "#ed7d31",
 "Accent 2 -25": "#c75b12",
 "Accent 2 -50": "#853d0c",
 "Accent 2 20": "#f0975b",
 "Accent 2 40": "#f4b184",
 "Accent 2 60": "#f8cbad",
 "Accent 2 80": "#fce5d6",
 "Accent 3": "#a5a5a5",
 "Accent 3 -25": "#7c7c7c",
 "Accent 3 -50": "#525252",
 "Accent 3 20": "#b6b6b6",
 "Accent 3 40": "#c8c8c8",
 "Accent 3 60": "#dadada",
 "Accent 3 80": "#ececec",
 "Accent 4": "#ffc000",
 "Accent 4 -25": "#bf9000",
 "Accent 4 -50": "#806000",
 "Accent 4 20": "#ffcd33",
 "Accent 4 40": "#ffd966",
 "Accent 4 60": "#ffe699",
 "Accent 4 80": "#fff3cc",
 "Accent 5": "#4472c4",
 "Accent 5 -25": "#305796",
 "Accent 5 -50": "#203a64",
 "Accent 5 20": "#6990cf",
 "Accent 5 40": "#8eacdb",
 "Accent 5 60": "#b4c7e7",
 "Accent 5 80": "#d9e3f2",
 "Accent 6": "#70ad47",
 "Accent 6 -25": "#578336",
 "Accent 6 -50": "#3a5724",
 "Accent 6 20": "#8fc168",
 "Accent 6 40": "#abd08e",
 "Accent 6 60": "#c7e0b4",
 "Accent 6 80": "#e3efda",
 "Background 1": "#ffffff",
 "Background 1 -15": "#d8d8d8",
 "Background 1 -35": "#a5a5a5",
 "Background 2": "#e7e6e6",
 "Background 2 -15": "#c6c4c4",
 "Background 2 -35": "#999595",
 "Text 1": "#000000",
 "Text 1 -25": "#000000",
 "Text 1 20": "#333333",
 "Text 1 25": "#3f3f3f",
 "Text 1 40": "#666666",
 "Text 1 50": "#7f7f7f",
 "Text 1 60": "#999999",
 "Text 1 80": "#cccccc",
 "Text 2": "#44546a",
 "Text 2 -25": "#344050",
 "Text 2 20": "#5f7592",
 "Text 2 40": "#8497b0",
 "Text 2 60": "#acb9ca",
 "Text 2 80": "#d6dce4",
 "Hyperlink": "#0563c1",
 "Followed Hyperlink": "Followed Hyperlink",
 "White": "White",
 "Black": "Black",
 "Red": "Red",
 "Blue": "Blue"
};
