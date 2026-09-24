import { useState, type RefObject } from 'react';
import { getCircuitTypeFromLibrary, getCircuitTypeUsage, type Circuit, type CircuitType, type Panel } from '@mepapp/core';
import type { SketchScene } from '@mepapp/render';
import { Dialog } from './Dialog.js';

export interface CircuitTypesDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  circuitTypes: CircuitType[];
  circuits: Circuit[];
  panels: Panel[];
  onClose: () => void;
}

/**
 * Edits the circuit types of the active document (electrical-circuits-model.md Phase E7): name,
 * abbreviation, description, units and default capacity. A built-in type can be changed and reset
 * but not deleted. A type that a circuit or a panel default uses cannot be deleted either, so no
 * circuit is left pointing at a type that is gone. The edits are not undoable, like the network
 * type edits.
 */
export function CircuitTypesDialog({ sceneRef, circuitTypes, circuits, panels, onClose }: CircuitTypesDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(circuitTypes[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const selected = circuitTypes.find((t) => t.id === selectedId) ?? circuitTypes[0];

  const addType = () => {
    const created = sceneRef.current?.createCircuitType();
    if (created) setSelectedId(created.id);
  };

  return (
    <Dialog title="Circuit types" onClose={onClose} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-circuit-types">
        <div className="mep-circuit-types-list" role="listbox" aria-label="Circuit types">
          {circuitTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              role="option"
              aria-selected={type.id === selected?.id}
              className={`mep-circuit-types-item${type.id === selected?.id ? ' on' : ''}`}
              disabled={dirty && type.id !== selected?.id}
              title={dirty && type.id !== selected?.id ? 'Save or revert your changes first' : undefined}
              onClick={() => setSelectedId(type.id)}
            >
              <span>{type.name}</span>
              <span className="mep-circuit-types-abbr">{type.abbreviation}</span>
            </button>
          ))}
          <button type="button" className="mep-circuit-types-new" disabled={dirty} title={dirty ? 'Save or revert your changes first' : undefined} onClick={addType}>
            + New circuit type
          </button>
        </div>
        {selected && (
          <CircuitTypeForm
            key={`${selected.id}|${selected.name}|${selected.abbreviation}|${selected.description}|${selected.units}|${selected.defaultCapacity}`}
            sceneRef={sceneRef}
            type={selected}
            usage={getCircuitTypeUsage(selected.id, circuits, panels)}
            onDirtyChange={setDirty}
            onDeleted={() => setSelectedId(null)}
          />
        )}
      </div>
    </Dialog>
  );
}

interface CircuitTypeFormProps {
  sceneRef: RefObject<SketchScene | null>;
  type: CircuitType;
  usage: { circuitCount: number; panelCount: number };
  onDirtyChange: (dirty: boolean) => void;
  onDeleted: () => void;
}

/** The fields of one circuit type. Local draft with explicit Save and Revert. Its parent gives it a `key` built from the saved values, so it re-seeds after a save or a reset. */
function CircuitTypeForm({ sceneRef, type, usage, onDirtyChange, onDeleted }: CircuitTypeFormProps) {
  const [name, setName] = useState(type.name);
  const [abbreviation, setAbbreviation] = useState(type.abbreviation);
  const [description, setDescription] = useState(type.description);
  const [units, setUnits] = useState(type.units);
  const [capacity, setCapacity] = useState(String(type.defaultCapacity));
  const [error, setError] = useState<string | null>(null);

  const builtIn = getCircuitTypeFromLibrary(type.id);
  const changedFromBuiltIn =
    !!builtIn &&
    (builtIn.name !== type.name ||
      builtIn.abbreviation !== type.abbreviation ||
      builtIn.description !== type.description ||
      builtIn.units !== type.units ||
      builtIn.defaultCapacity !== type.defaultCapacity);
  const dirty = name !== type.name || abbreviation !== type.abbreviation || description !== type.description || units !== type.units || capacity !== String(type.defaultCapacity);
  const inUse = usage.circuitCount > 0 || usage.panelCount > 0;

  const markDirty = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setError(null);
    onDirtyChange(true);
  };

  const revert = () => {
    setName(type.name);
    setAbbreviation(type.abbreviation);
    setDescription(type.description);
    setUnits(type.units);
    setCapacity(String(type.defaultCapacity));
    setError(null);
    onDirtyChange(false);
  };

  const save = () => {
    const trimmed = capacity.trim();
    const result = sceneRef.current?.updateCircuitType(type.id, {
      name,
      abbreviation,
      description,
      units,
      defaultCapacity: trimmed === '' ? Number.NaN : Number(trimmed),
    });
    if (result) {
      setError(result);
      return;
    }
    onDirtyChange(false);
  };

  const remove = () => {
    if (sceneRef.current?.deleteCircuitType(type.id) === 'deleted') {
      onDirtyChange(false);
      onDeleted();
    }
  };

  const reset = () => {
    if (sceneRef.current?.resetCircuitType(type.id)) onDirtyChange(false);
  };

  const usageText = inUse
    ? `Used by ${usage.circuitCount} circuit${usage.circuitCount === 1 ? '' : 's'} and ${usage.panelCount} panel default${usage.panelCount === 1 ? '' : 's'}.`
    : 'Not used by any circuit or panel default.';

  return (
    <div className="mep-circuit-types-form">
      <div className="mep-field-row">
        <label htmlFor="ct-name">Name</label>
        <input id="ct-name" type="text" value={name} onChange={(e) => markDirty(setName)(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="ct-abbreviation">Abbreviation</label>
        <input id="ct-abbreviation" type="text" value={abbreviation} onChange={(e) => markDirty(setAbbreviation)(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="ct-description">Description</label>
        <input id="ct-description" type="text" value={description} onChange={(e) => markDirty(setDescription)(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="ct-units">Units</label>
        <input id="ct-units" type="text" value={units} onChange={(e) => markDirty(setUnits)(e.target.value)} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="ct-capacity">Default capacity</label>
        <input id="ct-capacity" type="text" inputMode="decimal" value={capacity} onChange={(e) => markDirty(setCapacity)(e.target.value)} />
      </div>
      {error && (
        <div className="mep-circuit-types-error" role="alert">
          {error}
        </div>
      )}
      <div className="mep-circuit-types-usage">{builtIn ? `Built-in type. ${usageText}` : usageText}</div>
      <div className="mep-circuit-types-actions">
        <button type="button" onClick={save} disabled={!dirty}>
          Save
        </button>
        <button type="button" onClick={revert} disabled={!dirty}>
          Revert
        </button>
        {builtIn ? (
          <button type="button" onClick={reset} disabled={!changedFromBuiltIn || dirty} title={changedFromBuiltIn ? 'Restore the built-in values' : 'This type has the built-in values'}>
            Reset to built-in
          </button>
        ) : (
          <button
            type="button"
            onClick={remove}
            disabled={inUse || dirty}
            title={inUse ? 'Give these circuits and panels another type first' : 'Delete this circuit type'}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
