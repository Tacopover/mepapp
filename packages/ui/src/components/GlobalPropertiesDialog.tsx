import { useState } from 'react';
import { isReservedCircuitPropertyName, isReservedPropertyName, isReservedRoomPropertyName, type CustomPropertyDefinition, type CustomPropertyKind, type GlobalPropertyDefs } from '@mepapp/core';
import { Dialog } from './Dialog.js';

export type { GlobalPropertyDefs };

type Category = keyof GlobalPropertyDefs;

/** Per category, old property name to new name, for each saved property the user renamed. */
export type GlobalPropertyRenames = Record<Category, Record<string, string>>;

export interface GlobalPropertiesDialogProps {
  definitions: GlobalPropertyDefs;
  onSave: (next: GlobalPropertyDefs, renamed: GlobalPropertyRenames) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<Category, string> = { terminal: 'Terminal', equipment: 'Equipment', circuit: 'Circuit', room: 'Room' };

function validate(defs: CustomPropertyDefinition[], category: Category): string | null {
  const seen = new Set<string>();
  for (const def of defs) {
    const trimmed = def.name.trim();
    if (!trimmed) return 'Property name cannot be empty.';
    const lower = trimmed.toLowerCase();
    const reserved = category === 'circuit' ? isReservedCircuitPropertyName(lower) : category === 'room' ? isReservedRoomPropertyName(lower) : isReservedPropertyName(lower);
    if (reserved) return `"${trimmed}" is already a built-in field.`;
    if (seen.has(lower)) return `"${trimmed}" is used twice.`;
    seen.add(lower);
  }
  return null;
}

/**
 * Per-installation custom property editor (ui-atlas-layout-mapping.md §4's
 * "Global Properties" row) — Menu → Global Properties. Terminal, Equipment
 * Circuit and Room. Segment/Fitting need a new undo command first (their edits go
 * through SketchDocument's CommandManager) and are deferred.
 */
export function GlobalPropertiesDialog({ definitions, onSave, onClose }: GlobalPropertiesDialogProps) {
  const [draft, setDraft] = useState<GlobalPropertyDefs>(definitions);
  // The saved name each row started from (null for an added row), index for index with draft — so a rename can carry the values over.
  const [origins, setOrigins] = useState<Record<Category, (string | null)[]>>(() => ({
    terminal: definitions.terminal.map((d) => d.name),
    equipment: definitions.equipment.map((d) => d.name),
    circuit: definitions.circuit.map((d) => d.name),
    room: definitions.room.map((d) => d.name),
  }));
  const [category, setCategory] = useState<Category>('terminal');

  const rows = draft[category];
  const error = validate(rows, category);
  const hasError = (Object.keys(CATEGORY_LABELS) as Category[]).some((c) => validate(draft[c], c) !== null);

  function updateRows(next: CustomPropertyDefinition[], nextOrigins: (string | null)[] = origins[category]) {
    setDraft((prev) => ({ ...prev, [category]: next }));
    setOrigins((prev) => ({ ...prev, [category]: nextOrigins }));
  }

  function updateRow(index: number, patch: Partial<CustomPropertyDefinition>) {
    updateRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    updateRows(
      rows.filter((_, i) => i !== index),
      origins[category].filter((_, i) => i !== index),
    );
  }

  function addRow() {
    updateRows([...rows, { name: '', kind: 'text', defaultValue: '' }], [...origins[category], null]);
  }

  function handleSave() {
    if (hasError) return;
    const renamed = Object.fromEntries(
      (Object.keys(CATEGORY_LABELS) as Category[]).map((c) => [
        c,
        Object.fromEntries(draft[c].flatMap((row, i) => {
          const origin = origins[c][i];
          return origin !== null && origin !== row.name ? [[origin, row.name]] : [];
        })),
      ]),
    ) as GlobalPropertyRenames;
    onSave(draft, renamed);
  }

  return (
    <Dialog
      title="Global Properties"
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={hasError}>
            Save
          </button>
        </>
      }
    >
      <p className="mep-hint">
        Custom fields added here apply to every document on this install, not just the one currently open. Every
        existing element of the type gets the new field with its default value.
      </p>
      <div className="mep-subtabs">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
          <button key={c} type="button" className={c === category ? 'on' : ''} onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="mep-section">
        {rows.map((row, i) => (
          <div className="mep-property-row" key={i}>
            <input
              placeholder="Property name"
              value={row.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
            />
            <div className="mep-seg2">
              {(['text', 'numeric'] as CustomPropertyKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={row.kind === kind ? 'on' : ''}
                  onClick={() => updateRow(i, { kind })}
                >
                  {kind === 'text' ? 'Text' : 'Numeric'}
                </button>
              ))}
            </div>
            <input
              placeholder="Default"
              value={row.defaultValue}
              onChange={(e) => updateRow(i, { defaultValue: e.target.value })}
            />
            <button type="button" className="mep-property-row-remove" onClick={() => removeRow(i)} title="Remove">
              ✕
            </button>
          </div>
        ))}
        {error && <p className="mep-field-error">{error}</p>}
        <button type="button" onClick={addRow}>
          + Add property
        </button>
      </div>
    </Dialog>
  );
}
