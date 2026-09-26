import type { RefObject } from 'react';
import { findCircuitForTerminal, getCircuitLabel, listStampPropertyKeys, resolveStampPropertyValue, type Circuit, type Panel, type StampPropertyContext } from '@mepapp/core';
import type { SketchScene, StampInfo } from '@mepapp/render';

const NONE = '';
const NEW_CIRCUIT = '__new__';

export interface TerminalCircuitSectionProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The selected Terminal-category stamps only — the caller filters. One entry shows that terminal's circuit; several show bulk actions. */
  terminals: StampInfo[];
  circuits: Circuit[];
  panels: Panel[];
  setSelectedCircuitId: (id: string | null) => void;
  /** Resolves the read-only circuit values shown under the picker — see stamp-properties.ts. */
  propertyContext: StampPropertyContext;
}

/** The circuit's values as read-only rows of the terminal (label-feature.md §5.4). The circuit label itself is left out: the picker above already shows it. A value that differs across several terminals shows "Varies". */
function CircuitValueRows({ terminals, propertyContext }: { terminals: StampInfo[]; propertyContext: StampPropertyContext }) {
  if (!terminals.some((t) => propertyContext.circuitByTerminalId.has(t.id))) return null;
  const keys = listStampPropertyKeys(propertyContext, 'terminal').filter((k) => k.group === 'circuit' && k.key !== 'circuit:label');
  return (
    <>
      {keys.map(({ key, label }) => {
        const values = terminals.map((t) => resolveStampPropertyValue(propertyContext, t, key));
        const same = values.every((v) => v.value === values[0].value);
        const inherited = same && values.every((v) => v.inherited);
        return (
          <div className="mep-field-row" key={key}>
            <label>{label}{inherited ? ' (panel default)' : ''}</label>
            <input type="text" value={same ? values[0].value ?? '' : ''} placeholder={same ? undefined : 'Varies'} disabled />
          </div>
        );
      })}
    </>
  );
}

/**
 * The Circuit section of a selected terminal's (or several terminals') Properties panel — the
 * terminal-side counterpart to the circuit Properties panel's terminal list (electrical-circuits-model.md
 * Phase E2). Picking a circuit for a terminal that already belongs to another one moves it; the
 * scene raises the toast that says so (SketchScene.assignTerminalToCircuit).
 */
export function TerminalCircuitSection({ sceneRef, terminals, circuits, panels, setSelectedCircuitId, propertyContext }: TerminalCircuitSectionProps) {
  if (terminals.length === 0) return null;
  const panelOf = (circuit: Circuit) => (circuit.panelId ? panels.find((p) => p.id === circuit.panelId) : undefined);

  const assignable = circuits.filter((c) => !c.isSpare);
  const groups: Array<{ key: string; name: string; circuits: Circuit[] }> = [
    { key: 'unassigned', name: 'Unassigned', circuits: assignable.filter((c) => !c.panelId) },
    ...panels.map((panel) => ({ key: panel.id, name: panel.name, circuits: assignable.filter((c) => c.panelId === panel.id) })),
  ]
    .map((g) => ({ ...g, circuits: [...g.circuits].sort((a, b) => a.number - b.number) }))
    .filter((g) => g.circuits.length > 0);

  const options = (
    <>
      {groups.map((group) => (
        <optgroup key={group.key} label={group.name}>
          {group.circuits.map((c) => (
            <option key={c.id} value={c.id}>
              {getCircuitLabel(c, panelOf(c))} ({c.terminalIds.length})
            </option>
          ))}
        </optgroup>
      ))}
      <option value={NEW_CIRCUIT}>New circuit…</option>
    </>
  );

  const createFromTerminals = () => sceneRef.current?.createCircuitFromTerminals(terminals.map((t) => t.id));

  if (terminals.length > 1) {
    return (
      <div className="mep-section">
        <h4>Circuit</h4>
        <div className="mep-field-row">
          <label>Assign all to</label>
          <select
            value={NONE}
            onChange={(e) => {
              const value = e.target.value;
              if (value === NEW_CIRCUIT) {
                createFromTerminals();
              } else if (value !== NONE) {
                for (const terminal of terminals) sceneRef.current?.assignTerminalToCircuit(value, terminal.id);
              }
            }}
          >
            <option value={NONE}>Choose…</option>
            {options}
          </select>
        </div>
        <CircuitValueRows terminals={terminals} propertyContext={propertyContext} />
        <p className="mep-hint">{terminals.length} terminals selected. A terminal already in another circuit is moved.</p>
      </div>
    );
  }

  const terminal = terminals[0];
  const current = findCircuitForTerminal(circuits, terminal.id);
  return (
    <div className="mep-section">
      <h4>Circuit</h4>
      <div className="mep-field-row">
        <label>Circuit</label>
        <select
          value={current?.id ?? NONE}
          onChange={(e) => {
            const value = e.target.value;
            if (value === NEW_CIRCUIT) {
              createFromTerminals();
            } else if (value === NONE) {
              if (current) sceneRef.current?.removeTerminalFromCircuit(current.id, terminal.id);
            } else {
              sceneRef.current?.assignTerminalToCircuit(value, terminal.id);
            }
          }}
        >
          <option value={NONE}>None</option>
          {options}
        </select>
      </div>
      {current && (
        <div className="mep-field-row">
          <label>{getCircuitLabel(current, panelOf(current))}</label>
          <button type="button" onClick={() => setSelectedCircuitId(current.id)}>
            Show circuit
          </button>
        </div>
      )}
      <CircuitValueRows terminals={terminals} propertyContext={propertyContext} />
    </div>
  );
}
