import type { RefObject } from 'react';
import type { FittingInfo, SegmentInfo, SketchScene, StampInfo } from '@mepapp/render';
import {
  coerceDefaultValue,
  getStampDefinition,
  NETWORK_TYPE_LIBRARY,
  type CustomPropertyDefinition,
  type FittingKind,
  type NetworkType,
  type SegmentShape,
  type StampDefinition,
} from '@mepapp/core';
import { IconRotate } from '../icons.js';
import { setStampAppearanceDefault } from '../stampAppearanceDefaults.js';
import { ColorPicker } from './ColorPicker.js';
import { stampLabelFor } from './StampsPanel.js';
import type { StampLabelLanguage } from './LanguageToggle.js';

const VARIES = 'Varies';

const FITTING_KINDS: FittingKind[] = ['junction', 'elbow', 'tee', 'reducer', 'cross'];
const FITTING_KIND_LABELS: Record<FittingKind, string> = {
  junction: 'Junction',
  elbow: 'Elbow',
  tee: 'Tee',
  reducer: 'Reducer',
  cross: 'Cross',
};

/** MEPSketcher's own defaults for a segment gaining dimensions it never had (Segment.cs: Diameter 200.0, Width/Height 400.0/300.0) — reused here so switching a segment's Shape for the first time doesn't leave the new fields blank. */
const DEFAULT_DIAMETER = 200;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;

/** Distinct values of `pick(item)` across `items` — one value if every item agrees, undefined if they differ. Drives the multi-select "same value vs Varies" fields. */
function commonValue<T, V>(items: T[], pick: (item: T) => V): V | undefined {
  if (items.length === 0) return undefined;
  const first = pick(items[0]);
  return items.every((item) => pick(item) === first) ? first : undefined;
}

/** Remembers this edit as the definition's default appearance (see stampAppearanceDefaults.ts) for every edited stamp that was placed from the palette (has a definitionId) — an ad hoc uploaded stamp has nothing to key the memory on. */
function rememberAppearance(stamps: StampInfo[], appearance: { color?: string; scale?: number }) {
  for (const stamp of stamps) {
    if (stamp.definitionId) setStampAppearanceDefault(stamp.definitionId, appearance);
  }
}

export interface PropertiesPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  selection: StampInfo[];
  /** The lone selected segment's read model — see SketchScene.getSelectedSegmentInfo. Only non-null when exactly one segment (and nothing else) is selected. */
  selectedSegment: SegmentInfo | null;
  /** A pure multi-segment selection's read models — see SketchScene.getSelectedSegments. Only non-empty when 2+ segments (and nothing else) are selected. */
  selectedSegments: SegmentInfo[];
  /** The lone selected fitting's read model — see SketchScene.getSelectedFittingInfo. Only non-null when exactly one fitting (and nothing else) is selected. */
  selectedFitting: FittingInfo | null;
  /** The active document's adopted network types — the selected segment's "Network Type" dropdown. */
  networkTypes: NetworkType[];
  capacityInput: string;
  setCapacityInput: (value: string) => void;
  /** Global Properties definitions (Terminal/Equipment only) — see GlobalPropertiesDialog. */
  customPropertyDefs: { terminal: CustomPropertyDefinition[]; equipment: CustomPropertyDefinition[] };
  /** The active document's user-authored elements — looked up against the selected stamp's definitionId to gate the "Edit ports…" action to custom (source: 'custom') elements only; the four hardcoded STAMP_LIBRARY entries stay read-only. */
  customStampDefinitions: StampDefinition[];
  /** Resolves a stamp definition's display name the same way the Stamps tab does — see stampLabelFor. */
  labelLanguage: StampLabelLanguage;
  onEditPorts: (definitionId: string) => void;
}

export function PropertiesPanel({
  sceneRef,
  selection,
  selectedSegment,
  selectedSegments,
  selectedFitting,
  networkTypes,
  capacityInput,
  setCapacityInput,
  customPropertyDefs,
  customStampDefinitions,
  labelLanguage,
  onEditPorts,
}: PropertiesPanelProps) {
  // Every library type, resolved against this document's own adopted
  // overrides (name/color/etc), plus any duplicated types that only exist
  // in this document — same effective-list logic as StampsPanel's tiles.
  // Shared by the single- and multi-segment branches below.
  const availableNetworkTypes = [
    ...NETWORK_TYPE_LIBRARY.map((lib) => networkTypes.find((t) => t.id === lib.id) ?? lib),
    ...networkTypes.filter((t) => !NETWORK_TYPE_LIBRARY.some((lib) => lib.id === t.id)),
  ];

  if (selection.length === 0 && selectedSegment) {
    return (
      <div>
        <div className="mep-elem-row">
          <div style={{ flex: 1 }}>
            <b>Segment · {selectedSegment.id}</b>
            <span>{Math.round(selectedSegment.lengthPt)} pt</span>
          </div>
        </div>
        <div className="mep-section">
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
          <div className="mep-field-row">
            <label>Shape</label>
            <select
              value={selectedSegment.shape}
              onChange={(e) => {
                const shape = e.target.value as SegmentShape;
                sceneRef.current?.updateSegmentFields(selectedSegment.id, {
                  shape,
                  diameter: shape === 'round' ? (selectedSegment.diameter ?? DEFAULT_DIAMETER) : undefined,
                  width: shape === 'rectangular' ? (selectedSegment.width ?? DEFAULT_WIDTH) : undefined,
                  height: shape === 'rectangular' ? (selectedSegment.height ?? DEFAULT_HEIGHT) : undefined,
                });
              }}
            >
              <option value="round">Round</option>
              <option value="rectangular">Rectangular</option>
            </select>
          </div>
          {selectedSegment.shape === 'round' ? (
            <div className="mep-field-row">
              <label>Diameter (pt)</label>
              <input
                type="number"
                value={selectedSegment.diameter ?? DEFAULT_DIAMETER}
                onChange={(e) => sceneRef.current?.updateSegmentFields(selectedSegment.id, { diameter: Number(e.target.value) || 0 })}
              />
            </div>
          ) : (
            <>
              <div className="mep-field-row">
                <label>Width (pt)</label>
                <input
                  type="number"
                  value={selectedSegment.width ?? DEFAULT_WIDTH}
                  onChange={(e) => sceneRef.current?.updateSegmentFields(selectedSegment.id, { width: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="mep-field-row">
                <label>Height (pt)</label>
                <input
                  type="number"
                  value={selectedSegment.height ?? DEFAULT_HEIGHT}
                  onChange={(e) => sceneRef.current?.updateSegmentFields(selectedSegment.id, { height: Number(e.target.value) || 0 })}
                />
              </div>
            </>
          )}
          <div className="mep-field-row">
            <label>Material</label>
            <input
              type="text"
              value={selectedSegment.material ?? ''}
              onChange={(e) => sceneRef.current?.updateSegmentFields(selectedSegment.id, { material: e.target.value })}
            />
          </div>
          <p className="mep-hint">Changing the network type retags every segment connected to this one in the same run.</p>
        </div>
      </div>
    );
  }
  if (selection.length === 0 && selectedFitting) {
    return (
      <div>
        <div className="mep-elem-row">
          <div style={{ flex: 1 }}>
            <b>Fitting · {selectedFitting.id}</b>
          </div>
        </div>
        <div className="mep-section">
          <div className="mep-field-row">
            <label>Kind</label>
            <select
              value={selectedFitting.kind}
              onChange={(e) => sceneRef.current?.setFittingKind(selectedFitting.id, e.target.value as FittingKind)}
            >
              {FITTING_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {FITTING_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="mep-field-row">
            <label>X (pt)</label>
            <input type="number" value={Math.round(selectedFitting.position.x * 100) / 100} disabled />
          </div>
          <div className="mep-field-row">
            <label>Y (pt)</label>
            <input type="number" value={Math.round(selectedFitting.position.y * 100) / 100} disabled />
          </div>
        </div>
      </div>
    );
  }
  if (selection.length === 0 && selectedSegments.length > 1) {
    const networkTypeId = commonValue(selectedSegments, (s) => s.networkTypeId);
    const shape = commonValue(selectedSegments, (s) => s.shape);
    const diameter = commonValue(selectedSegments, (s) => s.diameter);
    const width = commonValue(selectedSegments, (s) => s.width);
    const height = commonValue(selectedSegments, (s) => s.height);
    const material = commonValue(selectedSegments, (s) => s.material);

    return (
      <div>
        <div className="mep-elem-row">
          <div style={{ flex: 1 }}>
            <b>{selectedSegments.length} segments selected</b>
          </div>
        </div>
        <div className="mep-section">
          <div className="mep-field-row">
            <label>Network Type{networkTypeId === undefined ? ` (${VARIES})` : ''}</label>
            <select
              value={networkTypeId ?? ''}
              onChange={(e) => sceneRef.current?.updateSegmentsForSelection({ networkTypeId: e.target.value })}
            >
              {networkTypeId === undefined && <option value="">{VARIES}</option>}
              {availableNetworkTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mep-field-row">
            <label>Shape{shape === undefined ? ` (${VARIES})` : ''}</label>
            <select
              value={shape ?? ''}
              onChange={(e) => {
                const nextShape = e.target.value as SegmentShape;
                sceneRef.current?.updateSegmentsForSelection({
                  shape: nextShape,
                  diameter: nextShape === 'round' ? (diameter ?? DEFAULT_DIAMETER) : undefined,
                  width: nextShape === 'rectangular' ? (width ?? DEFAULT_WIDTH) : undefined,
                  height: nextShape === 'rectangular' ? (height ?? DEFAULT_HEIGHT) : undefined,
                });
              }}
            >
              {shape === undefined && <option value="">{VARIES}</option>}
              <option value="round">Round</option>
              <option value="rectangular">Rectangular</option>
            </select>
          </div>
          {shape === 'round' && (
            <div className="mep-field-row">
              <label>Diameter (pt){diameter === undefined ? ` (${VARIES})` : ''}</label>
              <input
                type="number"
                value={diameter ?? ''}
                placeholder={diameter === undefined ? VARIES : undefined}
                onChange={(e) => sceneRef.current?.updateSegmentsForSelection({ diameter: Number(e.target.value) || 0 })}
              />
            </div>
          )}
          {shape === 'rectangular' && (
            <>
              <div className="mep-field-row">
                <label>Width (pt){width === undefined ? ` (${VARIES})` : ''}</label>
                <input
                  type="number"
                  value={width ?? ''}
                  placeholder={width === undefined ? VARIES : undefined}
                  onChange={(e) => sceneRef.current?.updateSegmentsForSelection({ width: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="mep-field-row">
                <label>Height (pt){height === undefined ? ` (${VARIES})` : ''}</label>
                <input
                  type="number"
                  value={height ?? ''}
                  placeholder={height === undefined ? VARIES : undefined}
                  onChange={(e) => sceneRef.current?.updateSegmentsForSelection({ height: Number(e.target.value) || 0 })}
                />
              </div>
            </>
          )}
          <div className="mep-field-row">
            <label>Material{material === undefined ? ` (${VARIES})` : ''}</label>
            <input
              type="text"
              value={material ?? ''}
              placeholder={material === undefined ? VARIES : undefined}
              onChange={(e) => sceneRef.current?.updateSegmentsForSelection({ material: e.target.value })}
            />
          </div>
          <p className="mep-hint">Editing here applies only to the selected segments, not their whole connected runs.</p>
        </div>
      </div>
    );
  }
  if (selection.length === 0) {
    return <div className="mep-empty-panel">Select an element to see its properties.</div>;
  }
  if (selection.length > 1) {
    const editableCategories = [...new Set(selection.map((s) => s.category))].filter(
      (c): c is 'terminal' | 'equipment' => c === 'terminal' || c === 'equipment',
    );
    // Only a Custom Property common to every selected stamp's category is shown — a field that only applies to one of a mixed terminal+equipment selection has no stamp of the other kind to write it onto.
    const commonCustomPropertyDefs = editableCategories.reduce<CustomPropertyDefinition[]>((acc, category, i) => {
      const defs = customPropertyDefs[category];
      return i === 0 ? defs : acc.filter((def) => defs.some((d) => d.name === def.name));
    }, []);
    const rotation = commonValue(selection, (s) => s.transform.rotationDegrees);
    const color = commonValue(selection, (s) => s.color);
    const scalePercent = commonValue(selection, (s) => Math.round(s.transform.scale.x * 100));
    const capacity = commonValue(selection, (s) => s.capacity);

    return (
      <div>
        <div className="mep-elem-row">
          <div style={{ flex: 1 }}>
            <b>{selection.length} elements selected</b>
          </div>
        </div>
        <div className="mep-section">
          <div className="mep-field-row">
            <label>Rotation</label>
            <div className="mep-rotate-nudge">
              <button type="button" onClick={() => sceneRef.current?.rotateSelectionBy(-90)} title="Rotate -90°">
                <IconRotate size={13} />
              </button>
              <input
                type="number"
                value={rotation !== undefined ? Math.round(rotation * 1000) / 1000 : ''}
                placeholder={rotation === undefined ? VARIES : undefined}
                onChange={(e) => sceneRef.current?.setRotationForSelection(Number(e.target.value))}
              />
              <button type="button" className="flip" onClick={() => sceneRef.current?.rotateSelectionBy(90)} title="Rotate +90°">
                <IconRotate size={13} />
              </button>
            </div>
          </div>
          <div className="mep-field-row">
            <label>Color{color === undefined ? ` (${VARIES})` : ''}</label>
            <ColorPicker
              value={color}
              onChange={(value) => {
                sceneRef.current?.setColorForSelection(value);
                rememberAppearance(selection, { color: value });
              }}
            />
          </div>
          <div className="mep-field-row">
            <label>Scale %</label>
            <input
              type="number"
              min={1}
              value={scalePercent ?? ''}
              placeholder={scalePercent === undefined ? VARIES : undefined}
              onChange={(e) => {
                const factor = Number(e.target.value) / 100;
                sceneRef.current?.setScaleForSelection(factor);
                rememberAppearance(selection, { scale: factor });
              }}
            />
          </div>
          <div className="mep-field-row">
            <label>Capacity</label>
            <input
              type="number"
              value={capacity ?? ''}
              placeholder={capacity === undefined ? VARIES : undefined}
              onChange={(e) => sceneRef.current?.setCapacityForSelection(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        {commonCustomPropertyDefs.length > 0 && (
          <div className="mep-section">
            <h4>Custom</h4>
            {commonCustomPropertyDefs.map((def) => {
              const value = commonValue(selection, (s) => s.properties?.[def.name] ?? coerceDefaultValue(def));
              return (
                <div className="mep-field-row" key={def.name}>
                  <label>{def.name}</label>
                  <input
                    type={def.kind === 'numeric' ? 'number' : 'text'}
                    value={value ?? ''}
                    placeholder={value === undefined ? VARIES : undefined}
                    onChange={(e) =>
                      sceneRef.current?.setStampPropertyForSelection(def.name, def.kind === 'numeric' ? Number(e.target.value) : e.target.value)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const stamp = selection[0];
  const definition = stamp.definitionId ? getStampDefinition(stamp.definitionId, customStampDefinitions) : undefined;

  return (
    <div>
      <div className="mep-elem-row">
        <div style={{ flex: 1 }}>
          <b>{definition ? stampLabelFor(definition, labelLanguage) : stamp.id}</b>
          <span>{Math.round(stamp.nativeWidth)} × {Math.round(stamp.nativeHeight)} pt</span>
        </div>
        {definition?.source === 'custom' && (
          <button type="button" onClick={() => onEditPorts(definition.id)}>
            Edit ports…
          </button>
        )}
      </div>
      <div className="mep-section">
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
        <div className="mep-field-row">
          <label>Color</label>
          <ColorPicker
            value={stamp.color ?? '#000000'}
            onChange={(value) => {
              sceneRef.current?.setColorForSelection(value);
              rememberAppearance([stamp], { color: value });
            }}
          />
        </div>
        <div className="mep-field-row">
          <label>Scale %</label>
          <input
            type="number"
            min={1}
            value={Math.round(stamp.transform.scale.x * 100)}
            onChange={(e) => {
              const factor = Number(e.target.value) / 100;
              sceneRef.current?.setScaleForSelection(factor);
              rememberAppearance([stamp], { scale: factor });
            }}
          />
        </div>
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
          <h4>Custom</h4>
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
