import { useState } from 'react';
import { isReservedCircuitPropertyName, isReservedPropertyName, type CustomPropertyDefinition, type CustomPropertyKind } from '@mepapp/core';
import { Dialog } from './Dialog.js';

export interface GlobalPropertyDefs {
  terminal: CustomPropertyDefinition[];
  equipment: CustomPropertyDefinition[];
  circuit: CustomPropertyDefinition[];
}

export interface GlobalPropertiesDialogProps {
  definitions: GlobalPropertyDefs;
  onSave: (next: GlobalPropertyDefs) => void;
  onClose: () => void;
}

type Category = keyof GlobalPropertyDefs;

const CATEGORY_LABELS: Record<Category, string> = { terminal: 'Terminal', equipment: 'Equipment', circuit: 'Circuit' };

function validate(defs: CustomPropertyDefinition[], category: Category): string | null {
  const seen = new Set<string>();
  for (const def of defs) {
    const trimmed = def.name.trim();
    if (!trimmed) return 'Property name cannot be empty.';
    const lower = trimmed.toLowerCase();
    if ((category === 'circuit' ? isReservedCircuitPropertyName(lower) : isReservedPropertyName(lower))) return `"${trimmed}" is already a built-in field.`;
    if (seen.has(lower)) return `"${trimmed}" is used twice.`;
    seen.add(lower);
  }
  return null;
}

/**
 * Per-installation custom property editor (ui-atlas-layout-mapping.md §4's
 * "Global Properties" row) — Menu → Global Properties. Terminal, Equipment
 * and Circuit. Segment/Fitting need a new undo command first (their edits go
 * through SketchDocument's CommandManager) and are deferred.
 */
export function GlobalPropertiesDialog({ definitions, onSave, onClose }: GlobalPropertiesDialogProps) {
  const [draft, setDraft] = useState<GlobalPropertyDefs>(definitions);
  const [category, setCategory] = useState<Category>('terminal');

  const rows = draft[category];
  const error = validate(rows, category);
  const hasError = (Object.keys(CATEGORY_LABELS) as Category[]).some((c) => validate(draft[c], c) !== null);

  function updateRows(next: CustomPropertyDefinition[]) {
    setDraft((prev) => ({ ...prev, [category]: next }));
  }

  function updateRow(index: number, patch: Partial<CustomPropertyDefinition>) {
    updateRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    updateRows(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    updateRows([...rows, { name: '', kind: 'text', defaultValue: '' }]);
  }

  function handleSave() {
    if (hasError) return;
    onSave(draft);
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
