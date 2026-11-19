/*
 * The colour combo of the Settings dialogs (Gridline Color, Sheet Tab Color).
 *
 * Structure follows the trial's `ColorComboEditor`: a bordered combo that shows
 * the current colour as a swatch and opens a gallery with `Theme Colors` (the
 * ten theme colours plus five tint/shade rows), `Standard Colors`, `No Color`
 * and `More Colors…`. The gallery values are the resolved `#RRGGBB` strings —
 * the trial writes e.g. `#5b9bd5` into `options.gridline.color` for Accent 1.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import { standardColors, themeColorBases, themeColorNames, themeColorTints, themeSwatchColor } from '../color-gallery.js';
import type { SettingValue } from '../settings-model.js';

export function ColorCombo({ value, width, ariaLabel, designer, onChange }: {
  value: string;
  width: number;
  ariaLabel: string;
  designer: Designer;
  onChange: (value: SettingValue) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: MouseEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const bases = themeColorBases(designer.getWorkbook().getActiveSheet());
  const swatch = value ? value : 'transparent';
  const pick = (color: string): void => { onChange(color); setOpen(false); };
  return (
    <span className="gc-color-combo" ref={root}>
      <div className="gc-combo-editor-container" role="combobox" aria-haspopup="true" aria-expanded={open} aria-label={ariaLabel} tabIndex={0}
        style={{ width: `${width}px` }} onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen((current) => !current); } }}>
        <span className="combo-content">
          <span className="gc-color-preview">
            <span className="color-preview-container"><span className="color-preview" style={{ backgroundColor: swatch }} /></span>
          </span>
        </span>
        <span className="dropdown-button" role="button" aria-label={ariaLabel} />
      </div>
      {open ? (
        <div className="gc-designer-ribbon-dropdown gc-color-combo-popup" role="menu" aria-label={ariaLabel}>
          <div className="gc-designer-color-menu-title">Theme Colors</div>
          <div className="gc-color-combo-grid">
            {themeColorTints.map((row, rowIndex) => row.map((tint, column) => {
              const label = rowIndex === 0 ? themeColorNames[column] : `${themeColorNames[column]} ${tint}`;
              return <div key={label} role="menuitem" aria-label={label} title={label} className="gc-color-picker-color-cell"
                style={{ background: themeSwatchColor(bases, column, tint) }} onClick={() => pick(themeSwatchColor(bases, column, tint).toUpperCase())} />;
            }))}
          </div>
          <div className="gc-designer-color-menu-title">Standard Colors</div>
          <div className="gc-color-combo-standard">
            {standardColors.map((color) => <div key={color} role="menuitem" aria-label={color} title={color} className="gc-color-picker-color-cell"
              style={{ background: color }} onClick={() => pick(color)} />)}
          </div>
          <div role="menuitem" className="gc-tab-no-color" onClick={() => pick('')}><span className="gc-tab-no-color-icon" aria-hidden="true" /><span>No Color</span></div>
          <div role="menuitem" className="gc-tab-more-colors" onClick={() => {
            setOpen(false);
            designer.showDialog('tabColorDialog', { red: '', green: '', blue: '', current: value || '#FFFFFF' }, (data: Record<string, unknown>) => {
              const hex = ['red', 'green', 'blue'].map((key) => Math.max(0, Math.min(255, Number(data[key]) || 0)).toString(16).padStart(2, '0')).join('');
              if (['red', 'green', 'blue'].every((key) => data[key] === '')) pick('');
              else pick(`#${data.pickerSelected ? hex : hex.toUpperCase()}`);
            });
          }}><svg className="gc-tab-more-colors-icon" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="7" fill="#ffca00" /><circle cx="2.5" cy="3.2" r="0.8" fill="#b5ba84" /><circle cx="3.3" cy="4.2" r="0.8" fill="#bbbb7d" /><circle cx="5" cy="2.8" r="1.2" fill="#3a81ca" /><circle cx="8.8" cy="2.9" r="1.25" fill="#4abb72" /><circle cx="9.6" cy="4" r="0.9" fill="#c1d05e" /><circle cx="2.9" cy="5.9" r="1.25" fill="#fa7947" /></svg><span>More Colors...</span></div>
        </div>
      ) : null}
    </span>
  );
}
