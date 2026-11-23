/* TASK 93 item 3: the per-type "Create Sparklines" dialogs the trial shows for
 * the formula sparklines whose gallery item is not the generic dialog
 * (HBar/VBar/Month/Year/Bullet/GaugeKPI/Progress/RangeBlock/Variance/Lollipop/
 * Image). Field list, order and defaults come from `sparkline-dialog-specs.ts`
 * (measured black-box); OK builds `=FUNCTION(arg,…)` from the raw tokens and
 * writes it into the single-cell Location Range (blank location = the active
 * cell, like the trial). Everything goes through the shared dialog host, so a
 * language package can restyle it through the registered template name. */
import React from 'react';
import type { DesignerApi as Designer } from '../designer-api.js';
import type { DialogData } from '../designer-api.js';
import { SPARK_DIALOG_SPECS, type SparkField } from '../sparkline-dialog-specs.js';
import { CustomSelect } from './custom-widgets.js';
import { RangePickButton } from './InsertDialogs.js';

interface Props { designer: Designer; data: DialogData; update: (path: string | undefined, value: unknown) => void }

/** The trial's range icon button next to a `range` field. */
const pickIcon: React.CSSProperties = { display: 'inline-flex', alignItems: 'center' };

export function FormulaSparklineBody({ designer, data, update }: Props): React.ReactElement {
  const fn = String(data.sparklineFunction ?? '');
  const spec = SPARK_DIALOG_SPECS[fn];
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    // Trial-measured dialog size per function.
    const size = SPARK_DIALOG_SIZES[fn];
    const host = hostRef.current?.closest('.gc-designer-dialog') as HTMLElement | null;
    if (host && size) { host.style.width = `${size[0]}px`; host.style.height = `${size[1]}px`; host.style.minHeight = `${size[1]}px`; }
  }, [fn]);
  if (!spec) return <div className="gc-formula-sparkline-dialog">—</div>;
  const values = (data.fields ?? {}) as Record<string, string>;
  const set = (key: string, value: unknown): void => update(`fields.${key}`, String(value ?? ''));
  const fieldRow = (field: SparkField): React.ReactElement => (
    <div key={field.key} className="gc-formula-sparkline-row">
      <label className="gc-dialog-label gc-formula-sparkline-label" htmlFor={`gc-spark-${field.key}`}>{field.label}</label>
      {field.kind === 'select' ? (
        <CustomSelect className="gc-dialog-select gc-formula-sparkline-input" ariaLabel={field.label}
          value={values[field.key] ?? field.def} options={field.options ?? []} onChange={(next) => set(field.key, next)} />
      ) : (
        <span style={pickIcon}>
          <input id={`gc-spark-${field.key}`} className={`gc-dialog-input gc-formula-sparkline-input${field.kind === 'range' ? ' range-input' : ''}`}
            type="text" value={values[field.key] ?? field.def} onChange={(event) => set(field.key, event.target.value)} aria-label={field.label.replace(/:$/, '')} />
          {field.kind === 'range' && (
            <RangePickButton component={{ bindingPath: `fields.${field.key}` }} data={data} ctx={{ designer }} update={update} />
          )}
        </span>
      )}
    </div>
  );
  return (
    <div ref={hostRef} className="gc-formula-sparkline-dialog">
      {spec.fields.map(fieldRow)}
      <div className="gc-formula-sparkline-row">
        <label className="gc-dialog-label gc-formula-sparkline-label" htmlFor="gc-spark-location">Location Range:</label>
        <span style={pickIcon}>
          <input id="gc-spark-location" className="gc-dialog-input gc-formula-sparkline-input range-input" type="text"
            value={String(data.locationRange ?? '')} onChange={(event) => update('locationRange', event.target.value)} aria-label="Location Range" />
          <RangePickButton component={{ bindingPath: 'locationRange' }} data={data} ctx={{ designer }} update={update} />
        </span>
      </div>
    </div>
  );
}

/** Dialog sizes measured on the trial per function (width x height). */
export const SPARK_DIALOG_SIZES: Record<string, [number, number]> = {
  HBARSPARKLINE: [298, 167], VBARSPARKLINE: [298, 167],
  MONTHSPARKLINE: [508, 251], YEARSPARKLINE: [508, 251],
  BULLETSPARKLINE: [488, 267], GAUGEKPISPARKLINE: [578, 380],
  PROGRESSSPARKLINE: [498, 200], RANGEBLOCKSPARKLINE: [328, 233],
  VARISPARKLINE: [508, 237], LOLLIPOPVARISPARKLINE: [508, 277],
  IMAGE: [548, 296],
};

/** Composes the formula for an OK'd custom dialog (raw tokens verbatim). */
export function formulaSparklineText(fn: string, data: DialogData): string {
  const spec = SPARK_DIALOG_SPECS[fn];
  if (!spec) return '';
  const values = (data.fields ?? {}) as Record<string, string>;
  return `=${fn}(${spec.args(values).join(',')})`;
}
