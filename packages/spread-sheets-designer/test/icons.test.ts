import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createCommandMap } from '../src/commands/index.js';
import { DefaultConfig, resolveRibbon } from '../src/config.js';
import { DesignerIcon, hasIcon, iconColourCount } from '../src/icons.js';

describe('independently authored ribbon artwork', () => {
  const classes = new Set<string>();
  for (const command of Object.values(createCommandMap())) {
    if (command.iconClass) classes.add(command.iconClass);
    for (const item of command.dropdownList ?? []) {
      const iconClass = (item as { iconClass?: string }).iconClass;
      if (iconClass) classes.add(iconClass);
    }
  }
  for (const panel of resolveRibbon(DefaultConfig).panels) for (const group of panel.buttonGroups) if (group.thumbnailClass) classes.add(group.thumbnailClass);
  for (const panel of resolveRibbon(DefaultConfig).contextualPanels) for (const group of panel.buttonGroups) if (group.thumbnailClass) classes.add(group.thumbnailClass);

  it('has explicit artwork for every configured command and adaptive group icon', () => {
    expect([...classes].filter((name) => !hasIcon(name))).toEqual([]);
  });
  it.each([16, 32])('renders scalable vector geometry at %ipx without raster assets', (size) => {
    for (const className of classes) {
      const svg = renderToStaticMarkup(React.createElement(DesignerIcon, { className, size }));
      expect(svg).toContain(`width="${size}"`);
      expect(svg).toContain('viewBox="0 0 32 32"');
      expect(svg).not.toMatch(/<image|data:|NaN|undefined/);
    }
  });
  it('uses multiple colours for clipboard, charts, page layout and viewport artwork', () => {
    for (const name of ['ribbon-button-paste', 'ribbon-button-chart-column', 'ribbon-button-chart-pie', 'ribbon-button-margins', 'ribbon-button-freezepane']) expect(iconColourCount(name), name).toBeGreaterThan(1);
  });
  it('draws open action marks with strokes, so checks, links and plus signs remain visible', () => {
    for (const className of ['ribbon-button-insert', 'gc-ribbon-control-dropdown-datavalidationsmall', 'ribbon-button-hyperlink', 'ribbon-button-increaseFontSize']) {
      const svg = renderToStaticMarkup(React.createElement(DesignerIcon, { className }));
      expect(svg, className).toMatch(/<path[^>]*fill="none"[^>]*stroke="#[\da-f]+"[^>]*stroke-width="[\d.]+"/i);
    }
  });
});
