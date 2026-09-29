import { useState } from 'react';
import { formatDateValue, parseDateText, type ResolvedField, type SchematicTemplate } from '@mepapp/core';
import { IconCalendar } from '../icons.js';
import { describeFieldDefault, groupResolvedFields } from '../schematicTextEdit.js';

export interface SchematicFieldsFormProps {
  fields: ResolvedField[];
  /** The template's date format: date fields are typed and shown in it. */
  dateFormat?: SchematicTemplate['dateFormat'];
  /** `undefined` removes the stored value, so the field's default applies again. */
  onChange: (field: ResolvedField, value: string | undefined) => void;
}

/** A date typed in the template's format, stored as YYYY-MM-DD. The calendar button is a native date input under a transparent layer. */
function DateInput({ field, dateFormat, onChange }: { field: ResolvedField; dateFormat: SchematicTemplate['dateFormat']; onChange: (value: string) => void }) {
  const pattern = dateFormat ?? 'dd-mm-yyyy';
  const [draft, setDraft] = useState<string | null>(null);
  const stored = field.stored ?? '';
  const text = draft ?? (stored === '' ? '' : formatDateValue(stored, dateFormat));
  const invalid = draft !== null && draft.trim() !== '' && parseDateText(draft, dateFormat) === undefined;
  const placeholder = field.stored === undefined && field.defaultText !== '' ? formatDateValue(field.defaultText, dateFormat) : pattern;
  const isoForPicker = parseDateText(text, dateFormat) ?? (field.stored === undefined ? field.defaultText : '');
  return (
    <>
      <div className="mep-date-input">
        <input
          id={`sch-field-${field.id}`}
          type="text"
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value.trim() === '') onChange('');
            else {
              const iso = parseDateText(e.target.value, dateFormat);
              if (iso !== undefined) onChange(iso);
            }
          }}
          onBlur={() => {
            if (!invalid) setDraft(null);
          }}
        />
        <label className="mep-date-input-picker" title="Pick a date">
          <span aria-hidden="true">
            <IconCalendar size={16} />
          </span>
          <input
            type="date"
            aria-label={`${field.label}: pick a date`}
            tabIndex={-1}
            value={isoForPicker}
            onChange={(e) => {
              if (e.target.value === '') return;
              setDraft(null);
              onChange(e.target.value);
            }}
          />
        </label>
      </div>
      {invalid && <span className="mep-schematic-field-error">Type the date as {pattern}. This text is not stored.</span>}
    </>
  );
}

function FieldInput({ field, dateFormat, onChange }: { field: ResolvedField; dateFormat: SchematicTemplate['dateFormat']; onChange: SchematicFieldsFormProps['onChange'] }) {
  const value = field.stored ?? '';
  const placeholder = field.stored === undefined ? field.defaultText : '';
  const hint = describeFieldDefault(field, dateFormat);
  const set = (next: string) => onChange(field, next);
  return (
    <div className="mep-schematic-field">
      <label htmlFor={`sch-field-${field.id}`}>{field.label}</label>
      {field.type === 'multiline' ? (
        <textarea id={`sch-field-${field.id}`} rows={3} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
      ) : field.type === 'date' ? (
        <DateInput field={field} dateFormat={dateFormat} onChange={set} />
      ) : (
        <input id={`sch-field-${field.id}`} type="text" inputMode={field.type === 'number' ? 'decimal' : undefined} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
      )}
      {hint && <span className="mep-schematic-hint">{hint}</span>}
      {field.stored !== undefined && (
        <button type="button" onClick={() => onChange(field, undefined)} title="Remove the entered value and use the default again">
          Reset
        </button>
      )}
    </div>
  );
}

/** The values that the template asks for, split into the ones shared by every schematic of the project and the ones of this schematic. */
export function SchematicFieldsForm({ fields, dateFormat, onChange }: SchematicFieldsFormProps) {
  const { shared, schematic } = groupResolvedFields(fields);
  if (fields.length === 0) return <p className="mep-schematic-hint">This template has no fields to fill in.</p>;
  return (
    <>
      {shared.length > 0 && (
        <div className="mep-section">
          <h4>Shared by all schematics</h4>
          {shared.map((field) => (
            <FieldInput key={field.id} field={field} dateFormat={dateFormat} onChange={onChange} />
          ))}
        </div>
      )}
      {schematic.length > 0 && (
        <div className="mep-section">
          <h4>This schematic</h4>
          {schematic.map((field) => (
            <FieldInput key={field.id} field={field} dateFormat={dateFormat} onChange={onChange} />
          ))}
        </div>
      )}
    </>
  );
}
