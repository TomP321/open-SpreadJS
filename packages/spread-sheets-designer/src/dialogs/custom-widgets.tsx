/*
 * The designer's own dropdown and checkbox widgets, as the trial renders them
 * (black box): a bordered field with the current text and a small boxed
 * triangle button on the right, a popup list for choosing; a square checkbox
 * with our own check glyph. Used by the Sort dialog and the Name Manager so
 * they no longer rely on the native <select>/<input> look.
 */
import React, { useEffect, useRef, useState } from 'react';

export interface CustomOption { text: string; value: unknown }

/** The trial's dropdown: read-only text field + boxed triangle + popup list. */
export function CustomSelect({ value, options, onChange, className, ariaLabel, disabled, style }: {
  value: unknown; options: CustomOption[]; onChange: (value: unknown) => void;
  className?: string; ariaLabel?: string; disabled?: boolean; style?: React.CSSProperties;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const current = options.find((option) => String(option.value) === String(value ?? '')) ?? options.find((option) => option.value === value);
  return (
    <div ref={root} className={`gc-custom-select${open ? ' open' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`} style={style}>
      <div className="gc-custom-select-field" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-label={ariaLabel} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) setOpen((next) => !next); }}
        onKeyDown={(event) => { if (!disabled && (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowDown')) { event.preventDefault(); setOpen(true); } }}>
        <span className="gc-custom-select-text">{current?.text ?? ''}</span>
        <span className="gc-custom-select-arrow" aria-hidden="true"><i /></span>
      </div>
      {open && (
        <div className="gc-custom-select-list" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <div key={index} role="option" aria-selected={String(option.value) === String(current?.value)}
              className={`gc-dialog-list-item${String(option.value) === String(current?.value) ? ' selected' : ''}`}
              onClick={() => { setOpen(false); onChange(option.value); }}>{option.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The trial's checkbox: a square with an inset border and our own check glyph. */
export function CustomCheckbox({ checked, onChange, label, disabled, className }: {
  checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean; className?: string;
}): React.ReactElement {
  // TASK 70 (measured on the trial's Move or Copy dialog): the `role=checkbox` element is the
  // 16x19 BOX next to the label (a `.check-box-container` with a 16x16 visual inside), not a
  // wrapper around the text — the paired layout gate measures it and the label sits outside.
  // The click handler stays on the wrapper (label clicks bubble); keyboard focus is on the box.
  return (
    <div className={`gc-custom-checkbox${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}
      onClick={disabled ? undefined : () => onChange(!checked)}>
      <span role="checkbox" aria-checked={checked} aria-label={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
        className={`gc-custom-checkbox-box${checked ? ' checked' : ''}`}
        onKeyDown={(event) => { if (!disabled && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); onChange(!checked); } }}>
        <span className="gc-custom-checkbox-square"><svg width="9" height="9" viewBox="0 0 10 10"><path d="m1.5 5.2 2.4 2.6 4.6-5.4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg></span>
      </span>
      <span className="gc-custom-checkbox-label">{label}</span>
    </div>
  );
}

/** The trial's radio: a circle that fills with a dot when selected; mutually exclusive within a group name. */
export function CustomRadio({ checked, onChange, label, disabled, className }: {
  checked: boolean; onChange: () => void; label: string; disabled?: boolean; className?: string;
}): React.ReactElement {
  return (
    <div role="radio" aria-checked={checked} aria-label={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      className={`gc-custom-radio${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}
      onClick={disabled ? undefined : () => onChange()}
      onKeyDown={(event) => { if (!disabled && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); onChange(); } }}>
      <span className="gc-custom-radio-box" aria-hidden="true"><i /></span>
      <span className="gc-custom-radio-label">{label}</span>
    </div>
  );
}
