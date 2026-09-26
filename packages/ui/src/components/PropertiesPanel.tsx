import type { RefObject } from 'react';
import type { FittingInfo, SegmentInfo, SketchScene, StampInfo } from '@mepapp/render';
import {
  buildStampPropertyContext,
  coerceDefaultValue,
  getStampDefinition,
  NETWORK_TYPE_LIBRARY,
  type Circuit,
  type CircuitType,
  type CustomPropertyDefinition,
  type FittingKind,
  type NetworkType,
  type Panel,
  type PanelSection,
  type SegmentShape,
  type StampDefinition,
} from '@mepapp/core';
import { IconRotate } from '../icons.js';
import { setStampAppearanceDefault } from '../stampAppearanceDefaults.js';
import { CircuitProperties, PanelProperties } from './CircuitPanelProperties.js';
import { ColorPicker } from './ColorPicker.js';
import { stampLabelFor } from './StampsPanel.js';
import { TerminalCircuitSection } from './TerminalCircuitSection.js';
import type { StampLabelLanguage } from './LanguageToggle.js';

const VARIES = 'Varies';

/** SegmentInfo.solvedCapacity is null both before any solve has run and when a solve left this particular segment unresolved — one label covers both, since the Properties panel has no way to tell them apart without also knowing whether flowResult is null. */
function formatSolvedCapacity(value: number | null): string {
  return value === null ? 'Not solved' : String(value);
}

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
  /** Global Properties definitions (Terminal, Equipment and Circuit) — see GlobalPropertiesDialog. */
  customPropertyDefs: { terminal: CustomPropertyDefinition[]; equipment: CustomPropertyDefinition[]; circuit: CustomPropertyDefinition[] };
  /** The active document's user-authored elements — looked up against the selected stamp's definitionId to gate the "Edit ports…" action to custom (source: 'custom') elements only; the four hardcoded STAMP_LIBRARY entries stay read-only. */
  customStampDefinitions: StampDefinition[];
  /** Resolves a stamp definition's display name the same way the Stamps tab does — see stampLabelFor. */
  labelLanguage: StampLabelLanguage;
  onEditPorts: (definitionId: string) => void;
  /** Opens the label layout editor for the selected stamp's definition (label-feature.md §7). */
  onEditLabels: (stampId: string) => void;
  /** Electrical Circuits branch (electrical-circuits-model.md §9) — takes precedence over the stamp/segment/fitting branches below when set, since a Circuit/Panel selection is app-level state, not a canvas selection (see useSketchScene's selectedCircuitId/selectedPanelId). */
  circuits: Circuit[];
  panels: Panel[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  selectedCircuitId: string | null;
  selectedPanelId: string | null;
  setSelectedCircuitId: (id: string | null) => void;
  setSelectedPanelId: (id: string | null) => void;
  /** Every placed stamp — the circuit Properties terminal list resolves ids to labels through it. */
  allStamps: StampInfo[];
  /** The Show Circuits toggle — see SketchScene.setShowCircuitLines. */
  showCircuitLines: boolean;
  onToggleCircuitLines: () => void;
}

export function PropertiesPanel({
  sceneRef,
  selection,
  selectedSegment,
  selectedSegments,
  selectedFitting,
  networkTypes,
  customPropertyDefs,
  customStampDefinitions,
  labelLanguage,
  onEditPorts,
  onEditLabels,
  circuits,
  panels,
  panelSections,
  circuitTypes,
  selectedCircuitId,
  selectedPanelId,
  setSelectedCircuitId,
  setSelectedPanelId,
  allStamps,
  showCircuitLines,
  onToggleCircuitLines,
}: PropertiesPanelProps) {
  if (selectedCircuitId) {
    const circuit = circuits.find((c) => c.id === selectedCircuitId);
    if (circuit) {
      const panel = circuit.panelId ? panels.find((p) => p.id === circuit.panelId) : undefined;
      return (
        <CircuitProperties
          sceneRef={sceneRef}
          circuit={circuit}
          panel={panel}
          panels={panels}
          panelSections={panelSections}
          circuitTypes={circuitTypes}
          customPropertyDefinitions={customPropertyDefs.circuit}
          allStamps={allStamps}
          customStampDefinitions={customStampDefinitions}
          showCircuitLines={showCircuitLines}
          onToggleCircuitLines={onToggleCircuitLines}
          onDeleted={() => setSelectedCircuitId(null)}
        />
      );
    }
  }
  if (selectedPanelId) {
    const panel = panels.find((p) => p.id === selectedPanelId);
    if (panel) {
      return (
        <PanelProperties
          sceneRef={sceneRef}
          panel={panel}
          circuits={circuits}
          panelSections={panelSections}
          circuitTypes={circuitTypes}
          showCircuitLines={showCircuitLines}
          onToggleCircuitLines={onToggleCircuitLines}
          onReverted={() => setSelectedPanelId(null)}
        />
      );
    }
  }

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
          </div>
        </div>
        <div className="mep-section">
          <div className="mep-field-row">
            <label>Length</label>
            <input
              type="text"
              value={selectedSegment.lengthMm !== null ? `${selectedSegment.lengthMm.toFixed(2)} mm` : `${Math.round(selectedSegment.lengthPt)} pt`}
              disabled
            />
          </div>
          <div className="mep-field-row">
            <label>Solved capacity</label>
            <input type="text" value={formatSolvedCapacity(selectedSegment.solvedCapacity)} disabled />
          </div>
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
          <div className="mep-field-row">
            <label>Solved capacity</label>
            <input type="text" value={formatSolvedCapacity(selectedFitting.solvedCapacity)} disabled />
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
    const solvedCapacity = commonValue(selectedSegments, (s) => s.solvedCapacity);

    return (
      <div>
        <div className="mep-elem-row">
          <div style={{ flex: 1 }}>
            <b>{selectedSegments.length} segments selected</b>
          </div>
        </div>
        <div className="mep-section">
          <div className="mep-field-row">
            <label>Solved capacity{solvedCapacity === undefined ? ` (${VARIES})` : ''}</label>
            <input type="text" value={solvedCapacity === undefined ? VARIES : formatSolvedCapacity(solvedCapacity)} disabled />
          </div>
          <div className="mep-field-row">
            <label>Network Type{networkTypeId === undefined ? ` (${VARIES})` : ''}</label>
            <select
              value={networkTypeId ?? ''}
              onChange={(e) =>
                sceneRef.current?.setNetworkTypeForSegmentsNetworks(
                  selectedSegments.map((s) => s.id),
                  e.target.value,
                )
              }
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
          <p className="mep-hint">
            Changing the network type retags every segment connected to any of the selected segments, across every run
            touched. The other fields here apply only to the segments you selected.
          </p>
        </div>
      </div>
    );
  }
  if (selection.length === 0) {
    return <div className="mep-empty-panel">Select an element to see its properties.</div>;
  }
  const propertyContext = buildStampPropertyContext({
    customStampDefinitions,
    terminalCapacities: Object.fromEntries(allStamps.map((s) => [s.id, s.capacity])),
    circuits,
    panels,
    circuitTypes,
    customPropertyDefs,
    labelLanguage,
  });
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
    const selectedTerminals = selection.filter((s) => s.category === 'terminal');

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
        <TerminalCircuitSection sceneRef={sceneRef} terminals={selectedTerminals} circuits={circuits} panels={panels} setSelectedCircuitId={setSelectedCircuitId} propertyContext={propertyContext} />
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
  const backingPanel = stamp.category === 'equipment' ? panels.find((p) => p.equipmentStampId === stamp.id) : undefined;

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
        {definition && (
          <button type="button" onClick={() => onEditLabels(stamp.id)}>
            Edit labels…
          </button>
        )}
        {stamp.category === 'equipment' && backingPanel && (
          <button type="button" onClick={() => setSelectedPanelId(backingPanel.id)}>
            Manage panel…
          </button>
        )}
        {stamp.category === 'equipment' && !backingPanel && (
          <button
            type="button"
            onClick={() => {
              const label = definition ? stampLabelFor(definition, labelLanguage) : 'Panel';
              const id = sceneRef.current?.convertStampToPanel(stamp.id, label);
              if (id) setSelectedPanelId(id);
            }}
          >
            Convert to panel
          </button>
        )}
      </div>
      <div className="mep-section">
        {backingPanel && (
          <div className="mep-field-row">
            <label>Panel name</label>
            <input type="text" value={backingPanel.name} disabled />
          </div>
        )}
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
            value={stamp.capacity}
            onChange={(e) => sceneRef.current?.setTerminalCapacity(stamp.id, Number(e.target.value) || 0)}
          />
        </div>
      </div>
      {stamp.category === 'terminal' && (
        <TerminalCircuitSection sceneRef={sceneRef} terminals={[stamp]} circuits={circuits} panels={panels} setSelectedCircuitId={setSelectedCircuitId} propertyContext={propertyContext} />
      )}
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
