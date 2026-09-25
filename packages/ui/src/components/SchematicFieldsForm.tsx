import type { ResolvedField } from '@mepapp/core';
import { describeFieldDefault, groupResolvedFields } from '../schematicTextEdit.js';

export interface SchematicFieldsFormProps {
  fields: ResolvedField[];
  /** `undefined` removes the stored value, so the field's default applies again. */
  onChange: (field: ResolvedField, value: string | undefined) => void;
}

function FieldInput({ field, onChange }: { field: ResolvedField; onChange: SchematicFieldsFormProps['onChange'] }) {
  const value = field.stored ?? '';
  const placeholder = field.stored === undefined ? field.defaultText : '';
  const hint = describeFieldDefault(field);
  const set = (next: string) => onChange(field, next);
  return (
    <div className="mep-schematic-field">
      <label htmlFor={`sch-field-${field.id}`}>{field.label}</label>
      {field.type === 'multiline' ? (
        <textarea id={`sch-field-${field.id}`} rows={3} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
      ) : (
        <input id={`sch-field-${field.id}`} type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} />
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
export function SchematicFieldsForm({ fields, onChange }: SchematicFieldsFormProps) {
  const { shared, schematic } = groupResolvedFields(fields);
  if (fields.length === 0) return <p className="mep-schematic-hint">This template has no fields to fill in.</p>;
  return (
    <>
      {shared.length > 0 && (
        <div className="mep-section">
          <h4>Shared by all schematics</h4>
          {shared.map((field) => (
            <FieldInput key={field.id} field={field} onChange={onChange} />
          ))}
        </div>
      )}
      {schematic.length > 0 && (
        <div className="mep-section">
          <h4>This schematic</h4>
          {schematic.map((field) => (
            <FieldInput key={field.id} field={field} onChange={onChange} />
          ))}
        </div>
      )}
    </>
  );
}
