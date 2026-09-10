import type { RefObject } from 'react';
import type { SegmentInfo, SketchScene, StampInfo } from '@mepapp/render';
import {
  coerceDefaultValue,
  getStampDefinition,
  NETWORK_TYPE_LIBRARY,
  type CustomPropertyDefinition,
  type NetworkType,
  type StampDefinition,
} from '@mepapp/core';
import { IconRotate } from '../icons.js';

export interface PropertiesPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  selection: StampInfo[];
  /** The lone selected segment's read model — see SketchScene.getSelectedSegmentInfo. Only non-null when exactly one segment (and nothing else) is selected. */
  selectedSegment: SegmentInfo | null;
  /** The active document's adopted network types — the selected segment's "Network Type" dropdown. */
  networkTypes: NetworkType[];
  capacityInput: string;
  setCapacityInput: (value: string) => void;
  /** Global Properties definitions (Terminal/Equipment only) — see GlobalPropertiesDialog. */
  customPropertyDefs: { terminal: CustomPropertyDefinition[]; equipment: CustomPropertyDefinition[] };
  /** The active document's user-authored elements — looked up against the selected stamp's definitionId to gate the "Edit ports…" action to custom (source: 'custom') elements only; the four hardcoded STAMP_LIBRARY entries stay read-only. */
  customStampDefinitions: StampDefinition[];
  onEditPorts: (definitionId: string) => void;
}

export function PropertiesPanel({
  sceneRef,
  selection,
  selectedSegment,
  networkTypes,
  capacityInput,
  setCapacityInput,
  customPropertyDefs,
  customStampDefinitions,
  onEditPorts,
}: PropertiesPanelProps) {
  if (selection.length === 0 && selectedSegment) {
    // Every library type, resolved against this document's own adopted
    // overrides (name/color/etc), plus any duplicated types that only exist
    // in this document — same effective-list logic as StampsPanel's tiles.
    const availableNetworkTypes = [
      ...NETWORK_TYPE_LIBRARY.map((lib) => networkTypes.find((t) => t.id === lib.id) ?? lib),
      ...networkTypes.filter((t) => !NETWORK_TYPE_LIBRARY.some((lib) => lib.id === t.id)),
    ];
    return (
      <div>
        <div className="mep-elem-row">
          <div style={{ flex: 1 }}>
            <b>Segment · {selectedSegment.id}</b>
            <span>{Math.round(selectedSegment.lengthPt)} pt</span>
          </div>
        </div>
        <div className="mep-section">
          <h4>Network</h4>
          <div className="mep-field-row">
            <label>Network Type</label>
            <select
              value={selectedSegment.networkTypeId}
              onChange={(e) => sceneRef.current?.setNetworkTypeForSegmentNetwork(selectedSegment.id, e.target.value)}
            >
              {!availableNetworkTypes.some((t) => t.id === selectedSegment.networkTypeId) && (
                <option value={selectedSegment.networkTypeId}>Unknown type</option>
              )}
              {availableNetworkTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <p className="mep-hint">Changing the network type retags every segment connected to this one in the same run.</p>
        </div>
      </div>
    );
  }
  if (selection.length === 0) {
    return <div className="mep-empty-panel">Select an element to see its properties.</div>;
  }
  if (selection.length > 1) {
    return <div className="mep-empty-panel">{selection.length} elements selected. Select one to edit its properties.</div>;
  }

  const stamp = selection[0];
  const definition = stamp.definitionId ? getStampDefinition(stamp.definitionId, customStampDefinitions) : undefined;

  return (
    <div>
      <div className="mep-elem-row">
        <div style={{ flex: 1 }}>
          <b>Stamp · {stamp.id}</b>
          <span>{Math.round(stamp.nativeWidth)} × {Math.round(stamp.nativeHeight)} pt</span>
        </div>
        {definition?.source === 'custom' && (
          <button type="button" onClick={() => onEditPorts(definition.id)}>
            Edit ports…
          </button>
        )}
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
          <div className="mep-rotate-nudge">
            <button type="button" onClick={() => sceneRef.current?.rotateSelectionBy(-90)} title="Rotate -90°">
              <IconRotate size={13} />
            </button>
            <input
              type="number"
              value={Math.round(stamp.transform.rotationDegrees * 1000) / 1000}
              onChange={(e) => sceneRef.current?.setSelectedRotationDegrees(Number(e.target.value))}
            />
            <button type="button" className="flip" onClick={() => sceneRef.current?.rotateSelectionBy(90)} title="Rotate +90°">
              <IconRotate size={13} />
            </button>
          </div>
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
