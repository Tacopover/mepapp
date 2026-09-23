import type { RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { getEffectiveDiversityPercent, getEffectivePrefix, type Circuit, type CircuitType, type Panel, type PanelSection } from '@mepapp/core';
import { IconTrash } from '../icons.js';

const PHASES: NonNullable<Circuit['phase']>[] = ['L1', 'L2', 'L3', 'L1L2', 'L2L3', 'L1L3', 'L1L2L3'];

/** "A1", "12" — a circuit's effective prefix+number. Defers to circuit.ts's getEffectivePrefix for the inherit-or-fallback rule (same reasoning as NetworkTreePanel.tsx's own copy of this helper) rather than reimplementing it, so this can't drift from the canonical resolver. */
function circuitLabel(circuit: Circuit, panel: Panel | undefined): string {
  return `${getEffectivePrefix(circuit, panel)}${circuit.number}`;
}

export interface CircuitPropertiesProps {
  sceneRef: RefObject<SketchScene | null>;
  circuit: Circuit;
  panel: Panel | undefined;
  panels: Panel[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  onDeleted: () => void;
}

/**
 * The Electrical Circuits tree's properties view for one selected circuit
 * (electrical-circuits-model.md §9). `prefix`/`circuitTypeId`/`phase`/
 * `device`/`cable.type`/`cable.coreCount`/`cable.crossSectionMm2`/
 * `diversityPercent` are all defaultable at the panel level (Phase C
 * addendum) — each renders as either inherited (dashed/italic, panel
 * default shown as placeholder) or overridden (solid, with a ↺ reset
 * link), matching the Phase 0 mockup's round-4 decision.
 */
export function CircuitProperties({ sceneRef, circuit, panel, panels, panelSections, circuitTypes, onDeleted }: CircuitPropertiesProps) {
  const defaults = panel?.circuitDefaults;
  const sections = panel ? panelSections.filter((s) => s.panelId === panel.id) : [];

  function handleDelete() {
    sceneRef.current?.deleteCircuit(circuit.id);
    onDeleted();
  }

  return (
    <div>
      <div className="mep-elem-row">
        <div style={{ flex: 1 }}>
          <b>Circuit {circuitLabel(circuit, panel)}</b>
          {circuit.isSpare && <span> · spare</span>}
        </div>
        <button type="button" onClick={handleDelete} title="Delete circuit">
          <IconTrash size={13} />
        </button>
      </div>

      <div className="mep-section">
        <div className="mep-field-row">
          <label>Panel</label>
          <select
            value={circuit.panelId ?? ''}
            onChange={(e) => {
              const nextPanelId = e.target.value;
              if (nextPanelId) sceneRef.current?.assignCircuitToPanel(circuit.id, nextPanelId);
              else sceneRef.current?.removeCircuitFromPanel(circuit.id);
            }}
          >
            <option value="">Unassigned</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {panel && sections.length > 0 && (
          <div className="mep-field-row">
            <label>Section</label>
            <select
              value={circuit.sectionId ?? ''}
              onChange={(e) => sceneRef.current?.setCircuitSection(circuit.id, e.target.value || undefined)}
            >
              <option value="">None</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="mep-field-row">
          <label>Custom name</label>
          <input
            type="text"
            value={circuit.customName ?? ''}
            onChange={(e) => sceneRef.current?.setCircuitCustomName(circuit.id, e.target.value || undefined)}
          />
        </div>
        <InheritableTextField
          label="Prefix"
          value={circuit.prefix}
          defaultValue={defaults?.prefix}
          onChange={(v) => sceneRef.current?.setCircuitPrefix(circuit.id, v)}
        />
        <InheritableSelectField
          label="Circuit type"
          value={circuit.circuitTypeId}
          defaultValue={defaults?.circuitTypeId}
          options={circuitTypes.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => sceneRef.current?.setCircuitType(circuit.id, v)}
        />
        <InheritableSelectField
          label="Phase"
          value={circuit.phase}
          defaultValue={defaults?.phase}
          options={PHASES.map((p) => ({ value: p, label: p }))}
          onChange={(v) => sceneRef.current?.setCircuitPhase(circuit.id, v as Circuit['phase'])}
        />
        <InheritableNumberField
          label="Diversity %"
          value={circuit.diversityPercent}
          defaultValue={getEffectiveDiversityPercent(circuit, panel)}
          onChange={(v) => sceneRef.current?.setCircuitDiversity(circuit.id, v)}
        />
      </div>

      <div className="mep-section">
        <h4>Device</h4>
        <div className="mep-field-row">
          <label>{circuit.device === undefined && defaults?.device ? 'Kind (panel default)' : 'Kind'}</label>
          <select
            value={circuit.device?.kind ?? ''}
            onChange={(e) => {
              const kind = e.target.value as NonNullable<Circuit['device']>['kind'] | '';
              sceneRef.current?.setCircuitDevice(circuit.id, kind ? { kind, ...circuit.device } : undefined);
            }}
          >
            <option value="">{defaults?.device ? `Inherited (${defaults.device.kind})` : 'None'}</option>
            <option value="breaker">Breaker</option>
            <option value="other">Other</option>
          </select>
          {circuit.device !== undefined && (
            <button type="button" className="mep-inherit-reset" title="Reset to panel default" onClick={() => sceneRef.current?.setCircuitDevice(circuit.id, undefined)}>
              ↺
            </button>
          )}
        </div>
        {circuit.device && (
          <>
            <div className="mep-field-row">
              <label>Curve</label>
              <input
                type="text"
                value={circuit.device.curve ?? ''}
                onChange={(e) => sceneRef.current?.setCircuitDevice(circuit.id, { ...circuit.device!, curve: e.target.value || undefined })}
              />
            </div>
            <div className="mep-field-row">
              <label>Rating (A)</label>
              <input
                type="number"
                value={circuit.device.ratingA ?? ''}
                onChange={(e) => sceneRef.current?.setCircuitDevice(circuit.id, { ...circuit.device!, ratingA: Number(e.target.value) || undefined })}
              />
            </div>
            <div className="mep-field-row">
              <label>RCD (mA)</label>
              <input
                type="number"
                value={circuit.device.rcdMilliamps ?? ''}
                onChange={(e) => sceneRef.current?.setCircuitDevice(circuit.id, { ...circuit.device!, rcdMilliamps: Number(e.target.value) || undefined })}
              />
            </div>
          </>
        )}
      </div>

      <div className="mep-section">
        <h4>Cable</h4>
        <InheritableTextField
          label="Type"
          value={circuit.cable?.type}
          defaultValue={defaults?.cable?.type}
          onChange={(v) => sceneRef.current?.setCircuitCable(circuit.id, { ...circuit.cable, type: v })}
        />
        <InheritableNumberField
          label="Core count"
          value={circuit.cable?.coreCount}
          defaultValue={defaults?.cable?.coreCount}
          onChange={(v) => sceneRef.current?.setCircuitCable(circuit.id, { ...circuit.cable, coreCount: v })}
        />
        <InheritableNumberField
          label="Cross-section (mm²)"
          value={circuit.cable?.crossSectionMm2}
          defaultValue={defaults?.cable?.crossSectionMm2}
          onChange={(v) => sceneRef.current?.setCircuitCable(circuit.id, { ...circuit.cable, crossSectionMm2: v })}
        />
        <div className="mep-field-row">
          <label>Length (m)</label>
          <input
            type="number"
            value={circuit.cable?.lengthM ?? ''}
            onChange={(e) => sceneRef.current?.setCircuitCable(circuit.id, { ...circuit.cable, lengthM: Number(e.target.value) || undefined })}
          />
        </div>
        <p className="mep-hint">Length is always typed per circuit — it's never a panel default, since two circuits off the same panel practically always run different physical lengths.</p>
      </div>

      <div className="mep-section">
        <h4>Terminals ({circuit.terminalIds.length})</h4>
        {circuit.terminalIds.length === 0 && <p className="mep-hint">No terminals assigned.</p>}
        {circuit.terminalIds.map((id) => (
          <div className="mep-field-row" key={id}>
            <label>{id}</label>
            <button type="button" onClick={() => sceneRef.current?.removeTerminalFromCircuit(circuit.id, id)}>
              Remove
            </button>
          </div>
        ))}
        <p className="mep-hint">Select a Terminal stamp on the canvas, then use its Properties panel to assign it to this circuit.</p>
      </div>
    </div>
  );
}

export interface PanelPropertiesProps {
  sceneRef: RefObject<SketchScene | null>;
  panel: Panel;
  circuits: Circuit[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  onReverted: () => void;
}

/** The Electrical Circuits tree's properties view for one selected panel (electrical-circuits-model.md §9), including its circuitDefaults (Phase C addendum) — edited inline here rather than in a separate dialog, same as mainDevice/feederCable below. */
export function PanelProperties({ sceneRef, panel, circuits, panelSections, circuitTypes, onReverted }: PanelPropertiesProps) {
  const memberCircuits = circuits.filter((c) => c.panelId === panel.id);
  const sections = panelSections.filter((s) => s.panelId === panel.id).sort((a, b) => a.order - b.order);
  const defaults = panel.circuitDefaults ?? {};

  function setDefaults(patch: Partial<NonNullable<Panel['circuitDefaults']>>) {
    sceneRef.current?.setPanelCircuitDefaults(panel.id, { ...defaults, ...patch });
  }

  function handleRevert() {
    sceneRef.current?.revertPanelToEquipment(panel.id);
    onReverted();
  }

  return (
    <div>
      <div className="mep-elem-row">
        <div style={{ flex: 1 }}>
          <b>Panel · {panel.name}</b>
          <span>{memberCircuits.length} circuits</span>
        </div>
        <button type="button" onClick={handleRevert} title="Revert to a plain Equipment stamp">
          Revert to equipment
        </button>
      </div>

      <div className="mep-section">
        <div className="mep-field-row">
          <label>Name</label>
          <input type="text" value={panel.name} onChange={(e) => sceneRef.current?.setPanelName(panel.id, e.target.value)} />
        </div>
        <div className="mep-field-row">
          <label>Sort direction</label>
          <select
            value={panel.sortDirection}
            onChange={(e) => sceneRef.current?.setPanelSortDirection(panel.id, e.target.value as Panel['sortDirection'])}
          >
            <option value="ascending">Ascending</option>
            <option value="descending">Descending</option>
          </select>
        </div>
        <div className="mep-field-row">
          <label>Main device</label>
          <input
            type="text"
            placeholder="e.g. Q1A/160A"
            value={panel.mainDevice?.label ?? ''}
            onChange={(e) => sceneRef.current?.setPanelMainDevice(panel.id, e.target.value ? { ...panel.mainDevice, label: e.target.value } : undefined)}
          />
        </div>
        <div className="mep-field-row">
          <label>Feeder cable type</label>
          <input
            type="text"
            value={panel.feederCable?.type ?? ''}
            onChange={(e) => sceneRef.current?.setPanelFeederCable(panel.id, { ...panel.feederCable, type: e.target.value || undefined })}
          />
        </div>
      </div>

      <div className="mep-section">
        <h4>Sections</h4>
        {sections.map((s) => (
          <div className="mep-field-row" key={s.id}>
            <input type="text" value={s.name} onChange={(e) => sceneRef.current?.renamePanelSection(s.id, e.target.value)} />
            <button type="button" onClick={() => sceneRef.current?.deletePanelSection(s.id)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => sceneRef.current?.createPanelSection(panel.id, `Section ${sections.length + 1}`)}>
          + Add section
        </button>
      </div>

      <div className="mep-section">
        <h4>Circuit defaults</h4>
        <p className="mep-hint">A member circuit that leaves one of these fields unset inherits it from here.</p>
        <div className="mep-field-row">
          <label>Prefix</label>
          <input type="text" value={defaults.prefix ?? ''} onChange={(e) => setDefaults({ prefix: e.target.value || undefined })} />
        </div>
        <div className="mep-field-row">
          <label>Circuit type</label>
          <select value={defaults.circuitTypeId ?? ''} onChange={(e) => setDefaults({ circuitTypeId: e.target.value || undefined })}>
            <option value="">None</option>
            {circuitTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mep-field-row">
          <label>Phase</label>
          <select value={defaults.phase ?? ''} onChange={(e) => setDefaults({ phase: (e.target.value || undefined) as NonNullable<Panel['circuitDefaults']>['phase'] })}>
            <option value="">None</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="mep-field-row">
          <label>Diversity %</label>
          <input
            type="number"
            value={defaults.diversityPercent ?? ''}
            onChange={(e) => setDefaults({ diversityPercent: Number(e.target.value) || undefined })}
          />
        </div>
        <div className="mep-field-row">
          <label>Cable type</label>
          <input
            type="text"
            value={defaults.cable?.type ?? ''}
            onChange={(e) => setDefaults({ cable: { ...defaults.cable, type: e.target.value || undefined } })}
          />
        </div>
        <div className="mep-field-row">
          <label>Cable core count</label>
          <input
            type="number"
            value={defaults.cable?.coreCount ?? ''}
            onChange={(e) => setDefaults({ cable: { ...defaults.cable, coreCount: Number(e.target.value) || undefined } })}
          />
        </div>
        <div className="mep-field-row">
          <label>Cable cross-section (mm²)</label>
          <input
            type="number"
            value={defaults.cable?.crossSectionMm2 ?? ''}
            onChange={(e) => setDefaults({ cable: { ...defaults.cable, crossSectionMm2: Number(e.target.value) || undefined } })}
          />
        </div>
      </div>
    </div>
  );
}

function InheritableTextField({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: string | undefined;
  defaultValue: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const isInherited = value === undefined;
  return (
    <div className="mep-field-row">
      <label>{label}{isInherited && defaultValue !== undefined ? ' (panel default)' : ''}</label>
      <input
        type="text"
        className={isInherited ? 'mep-field-inherited' : ''}
        value={value ?? ''}
        placeholder={isInherited ? defaultValue : undefined}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {!isInherited && (
        <button type="button" className="mep-inherit-reset" title="Reset to panel default" onClick={() => onChange(undefined)}>
          ↺
        </button>
      )}
    </div>
  );
}

function InheritableNumberField({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number | undefined;
  defaultValue: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  const isInherited = value === undefined;
  return (
    <div className="mep-field-row">
      <label>{label}{isInherited && defaultValue !== undefined ? ' (panel default)' : ''}</label>
      <input
        type="number"
        className={isInherited ? 'mep-field-inherited' : ''}
        value={value ?? ''}
        placeholder={isInherited && defaultValue !== undefined ? String(defaultValue) : undefined}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      />
      {!isInherited && (
        <button type="button" className="mep-inherit-reset" title="Reset to panel default" onClick={() => onChange(undefined)}>
          ↺
        </button>
      )}
    </div>
  );
}

function InheritableSelectField({
  label,
  value,
  defaultValue,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  defaultValue: string | undefined;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  const isInherited = value === undefined;
  const defaultLabel = defaultValue ? options.find((o) => o.value === defaultValue)?.label ?? defaultValue : undefined;
  return (
    <div className="mep-field-row">
      <label>{label}{isInherited && defaultLabel ? ' (panel default)' : ''}</label>
      <select className={isInherited ? 'mep-field-inherited' : ''} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{defaultLabel ? `Inherited (${defaultLabel})` : 'None'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {!isInherited && (
        <button type="button" className="mep-inherit-reset" title="Reset to panel default" onClick={() => onChange(undefined)}>
          ↺
        </button>
      )}
    </div>
  );
}
