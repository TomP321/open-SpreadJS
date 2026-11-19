/* Unit tests for the workbook theme tables. Every value below was read from
 * the trial through the public GC.Spread.Sheets.Themes/ThemeColors/ThemeFonts
 * surface (see docs/DESIGNER.md "Page Layout (task 4)"). */
import { describe, expect, it } from 'vitest';
import GC from '../src/index.js';
import { ColorScheme, Theme, ThemeFont, THEME_ORDER } from '../src/themes.js';

const { Themes, ThemeColors, ThemeFonts } = GC.Spread.Sheets as unknown as {
  Themes: Record<string, Theme>;
  ThemeColors: Record<string, ColorScheme>;
  ThemeFonts: Record<string, ThemeFont>;
};

describe('built-in theme tables', () => {
  it('lists the 22 gallery themes in trial order', () => {
    expect(THEME_ORDER).toEqual([
      'Default', 'Office', 'Office2007', 'Apex', 'Aspect', 'Concourse', 'Civic', 'Oriel',
      'Origin', 'Paper', 'Solstice', 'Technic', 'Trek', 'Urban', 'Verve', 'Equity', 'Flow',
      'Foundry', 'Median', 'Metro', 'Module', 'Opulent',
    ]);
    expect(Object.getOwnPropertyNames(Themes).sort()).toEqual([...THEME_ORDER].sort());
  });
  it('carries the trial font pairs', () => {
    expect([Themes.Office.headingFont(), Themes.Office.bodyFont()]).toEqual(['Calibri Light', 'Calibri']);
    expect([Themes.Office2007.headingFont(), Themes.Office2007.bodyFont()]).toEqual(['Cambria', 'Calibri']);
    expect([Themes.Apex.headingFont(), Themes.Apex.bodyFont()]).toEqual(['Lucida Sans', 'Book Antiqua']);
    expect([Themes.Origin.headingFont(), Themes.Origin.bodyFont()]).toEqual(['Bookman Old Style', 'Gill Sans MT']);
    expect([Themes.Metro.headingFont(), Themes.Metro.bodyFont()]).toEqual(['Consolas', 'Corbel']);
  });
  it('carries the trial colour schemes', () => {
    const office = ThemeColors.Office;
    expect(office.accent1()).toEqual({ a: 255, r: 91, g: 155, b: 213 });
    expect(office.background2()).toEqual({ a: 255, r: 231, g: 230, b: 230 });
    expect(office.followedHyperlink()).toEqual({ a: 255, r: 149, g: 79, b: 114 });
    expect(ThemeColors.Default.accent1()).toEqual({ a: 255, r: 79, g: 129, b: 189 });
    expect(ThemeColors.Aspect.accent1()).toEqual({ a: 255, r: 240, g: 127, b: 9 });
    // Re-read from the trial on 2026-11-10 through `ThemeColors.Apex.toJSON()`.
    expect(ThemeColors.Apex.accent3()).toEqual({ a: 255, r: 0x6b, g: 0xb1, b: 0xc9 });
  });
  it('exposes the 21 font schemes of the Fonts gallery', () => {
    expect(Object.getOwnPropertyNames(ThemeFonts).sort()).toEqual([
      'BookmanGillSansMT', 'CalibriConstantia', 'CenturyGothic', 'CenturySchoolbook', 'ConsolasCorbel',
      'Constantia', 'Corbel', 'FranklinGothic', 'FranklinGothicArial', 'FranklinGothicPerpetua',
      'Georgia', 'GillSansMT', 'LucidaBook', 'LucidaSansUnicode', 'Office', 'Office2007', 'Rockwell',
      'TrebuchetGeorgia', 'TrebuchetMS', 'TwCenMT', 'Verdana',
    ].sort());
  });
});

describe('authored theme objects', () => {
  it('ColorScheme stores and serialises its twelve colours', () => {
    const scheme = new ColorScheme('customThemeColor', '#FFFFFF', '#E7E6E6', '#000000', '#44546A',
      '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47', '#0563C1', '#954F72');
    expect(scheme.name()).toBe('customThemeColor');
    expect(scheme.accent1()).toEqual({ a: 255, r: 0x5b, g: 0x9b, b: 0xd5 });
    expect(scheme.toJSON().text2).toEqual({ a: 255, r: 0x44, g: 0x54, b: 0x6a });
    scheme.accent1('#ff0000');
    expect(scheme.accent1()).toEqual({ a: 255, r: 255, g: 0, b: 0 });
    const round = ColorScheme.fromJSON(scheme.toJSON());
    expect(round.accent5()).toEqual(scheme.accent5());
  });
  it('Theme exposes colours and fonts as documented', () => {
    const theme = new Theme('My', new ColorScheme('My'), 'Alpha Head', 'Alpha Body');
    expect([theme.name(), theme.headingFont(), theme.bodyFont()]).toEqual(['My', 'Alpha Head', 'Alpha Body']);
    theme.bodyFont('Beta');
    expect(theme.font().bodyFont()).toBe('Beta');
    expect(theme.headerFont()).toBe('Alpha Head');
  });
});
