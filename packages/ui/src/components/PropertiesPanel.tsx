import type { RefObject } from 'react';
import type { SketchScene, StampInfo } from '@mepapp/render';
import { coerceDefaultValue, type CustomPropertyDefinition } from '@mepapp/core';

export interface PropertiesPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  selection: StampInfo[];
  capacityInput: string;
  setCapacityInput: (value: string) => void;
  /** Global Properties definitions (Terminal/Equipment only) — see GlobalPropertiesDialog. */
  customPropertyDefs: { terminal: CustomPropertyDefinition[]; equipment: CustomPropertyDefinition[] };
}

export function PropertiesPanel({ sceneRef, selection, capacityInput, setCapacityInput, customPropertyDefs }: PropertiesPanelProps) {
  if (selection.length === 0) {
    return <div className="mep-empty-panel">Select an element to see its properties.</div>;
  }
  if (selection.length > 1) {
    return <div className="mep-empty-panel">{selection.length} elements selected. Select one to edit its properties.</div>;
  }

  const stamp = selection[0];

  return (
    <div>
      <div className="mep-elem-row">
        <div>
          <b>Stamp · {stamp.id}</b>
          <span>{Math.round(stamp.nativeWidth)} × {Math.round(stamp.nativeHeight)} pt</span>
        </div>
      </div>
      <div className="mep-section">
        <h4>Transform</h4>
        <div className="mep-field-row">
          <label>X (pt)</label>
          <input
            type="number"
            value={Math.round(stamp.transform.position.x * 100) / 100}
            onChange={(e) => sceneRef.current?.setSelectedPosition({ x: Number(e.target.value), y: stamp.transform.position.y })}
          />
        </div>
        <div className="mep-field-row">
          <label>Y (pt)</label>
          <input
            type="number"
            value={Math.round(stamp.transform.position.y * 100) / 100}
            onChange={(e) => sceneRef.current?.setSelectedPosition({ x: stamp.transform.position.x, y: Number(e.target.value) })}
          />
        </div>
        <div className="mep-field-row">
          <label>Rotation</label>
          <input
            type="number"
            value={Math.round(stamp.transform.rotationDegrees * 1000) / 1000}
            onChange={(e) => sceneRef.current?.setSelectedRotationDegrees(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="mep-section">
        <h4>Flow</h4>
        <div className="mep-field-row">
          <label>Capacity</label>
          <input
            type="number"
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            onBlur={() => sceneRef.current?.setTerminalCapacity(stamp.id, Number(capacityInput) || 0)}
          />
        </div>
      </div>
      {(stamp.category === 'terminal' || stamp.category === 'equipment') && customPropertyDefs[stamp.category].length > 0 && (
        <div className="mep-section">
          <h4>Custom Properties</h4>
          {customPropertyDefs[stamp.category].map((def) => (
            <div className="mep-field-row" key={def.name}>
              <label>{def.name}</label>
              <input
                type={def.kind === 'numeric' ? 'number' : 'text'}
                value={stamp.properties?.[def.name] ?? coerceDefaultValue(def)}
                onChange={(e) =>
                  sceneRef.current?.setStampProperty(
                    stamp.id,
                    def.name,
                    def.kind === 'numeric' ? Number(e.target.value) : e.target.value,
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
      {stamp.category === 'equipment' && stamp.ports.length >= 2 && (
        <div className="mep-section">
          <h4>Linked ports</h4>
          <p className="mep-hint">
            Checked ports on this element act as one connectivity node — e.g. a unit's supply and return, so a segment
            between them never bridges the two networks.
          </p>
          {stamp.ports.map((port) => {
            const checked = stamp.linkedPortIds?.includes(port.id) ?? false;
            return (
              <label key={port.id} className="mep-checkbox-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = stamp.linkedPortIds ?? [];
                    const next = e.target.checked ? [...current, port.id] : current.filter((id) => id !== port.id);
                    sceneRef.current?.setPortGroup(stamp.id, next);
                  }}
                />
                {port.name}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
