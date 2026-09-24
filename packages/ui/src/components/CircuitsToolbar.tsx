import type { ReactNode, RefObject } from 'react';
import { findCircuitForTerminal, getCircuitLabel, resolveCurrentCircuitId, type Circuit, type Panel } from '@mepapp/core';
import type { SketchScene, SketchTool, StampInfo } from '@mepapp/render';

export interface CircuitsToolbarProps {
  sceneRef: RefObject<SketchScene | null>;
  tool: SketchTool;
  circuits: Circuit[];
  panels: Panel[];
  /** The canvas's selected stamps. Terminals among them are what New circuit and Remove from circuit act on. */
  selection: StampInfo[];
  selectedCircuitId: string | null;
  /** The circuit a running Add-terminals or Assign-panel tool works on. */
  circuitToolTargetId: string | null;
  setSelectedCircuitId: (id: string | null) => void;
  showCircuitLines: boolean;
  onToggleCircuitLines: (show: boolean) => void;
}

/**
 * The floating toolbar of Circuits mode (electrical-circuits-model.md Phase E4) — the counterpart
 * of the old app's Circuits ribbon tab. Every button acts on the *current circuit*: the one a
 * running tool works on, else the one selected in the tree, else the one the selected terminals
 * share (core's resolveCurrentCircuitId). A button that cannot run is disabled, and its tooltip
 * says what to do first.
 */
export function CircuitsToolbar({
  sceneRef,
  tool,
  circuits,
  panels,
  selection,
  selectedCircuitId,
  circuitToolTargetId,
  setSelectedCircuitId,
  showCircuitLines,
  onToggleCircuitLines,
}: CircuitsToolbarProps) {
  const scene = sceneRef.current;
  const panelOf = (circuit: Circuit) => (circuit.panelId ? panels.find((p) => p.id === circuit.panelId) : undefined);
  const labelOf = (circuit: Circuit) => getCircuitLabel(circuit, panelOf(circuit));

  const toolRunning = tool === 'circuit-add-terminals' || tool === 'circuit-assign-panel';
  const currentId = resolveCurrentCircuitId(circuits, {
    toolTargetId: circuitToolTargetId,
    selectedCircuitId,
    selectedStampIds: selection.map((s) => s.id),
  });
  const current = currentId ? circuits.find((c) => c.id === currentId) : undefined;
  const terminals = selection.filter((s) => s.category === 'terminal');
  const removableTerminals = terminals.filter((t) => findCircuitForTerminal(circuits, t.id));

  const groups: Array<{ key: string; name: string; circuits: Circuit[] }> = [
    { key: 'unassigned', name: 'Unassigned', circuits: circuits.filter((c) => !c.panelId) },
    ...panels.map((panel) => ({ key: panel.id, name: panel.name, circuits: circuits.filter((c) => c.panelId === panel.id) })),
  ]
    .map((g) => ({ ...g, circuits: [...g.circuits].sort((a, b) => a.number - b.number) }))
    .filter((g) => g.circuits.length > 0);

  const newCircuit = () => {
    if (!scene) return;
    const id = terminals.length > 0 ? scene.createCircuitFromTerminals(terminals.map((t) => t.id)) : scene.createCircuit();
    if (id) setSelectedCircuitId(id);
  };

  const needCircuit = 'Select or create a circuit first';
  const canWork = !!current && !current.isSpare;

  let hint: ReactNode = null;
  if (tool === 'circuit-add-terminals' && current) {
    hint = (
      <>
        Adding terminals to <b>{labelOf(current)}</b> — click terminals on the canvas. Orange outline: the terminal moves out of its current circuit.
      </>
    );
  } else if (tool === 'circuit-assign-panel' && current) {
    hint = (
      <>
        Click the panel for <b>{labelOf(current)}</b>. Blue outline: this equipment becomes a panel.
      </>
    );
  } else if (!current) {
    hint = <>Press New circuit, or select terminals on the canvas first.</>;
  }

  return (
    <div className="mep-circuits-toolbar" role="toolbar" aria-label="Circuits">
      <div className="mep-circuits-toolbar-row">
        <div className="mep-circuits-group">
          <span className="mep-circuits-group-label">Circuit</span>
          <select
            className="mep-circuits-chip"
            aria-label="Current circuit"
            value={currentId ?? ''}
            disabled={toolRunning}
            onChange={(e) => setSelectedCircuitId(e.target.value || null)}
          >
            <option value="">No circuit</option>
            {groups.map((group) => (
              <optgroup key={group.key} label={group.name}>
                {group.circuits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labelOf(c)}
                    {c.isSpare ? ' (spare)' : ` (${c.terminalIds.length})`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            disabled={toolRunning}
            title={terminals.length > 0 ? `New circuit from the ${terminals.length} selected terminal${terminals.length === 1 ? '' : 's'}` : 'New empty circuit'}
            onClick={newCircuit}
          >
            New circuit
          </button>
          <button
            type="button"
            className={tool === 'circuit-add-terminals' ? 'on' : ''}
            disabled={!canWork}
            title={canWork ? 'Click terminals on the canvas to add them to this circuit' : current?.isSpare ? 'A spare circuit holds no terminals' : needCircuit}
            onClick={() => current && scene?.beginAddTerminalsToCircuit(current.id)}
          >
            Add terminals
          </button>
          <button
            type="button"
            disabled={toolRunning || removableTerminals.length === 0}
            title={removableTerminals.length > 0 ? 'Take the selected terminals out of their circuits' : 'Select a terminal that is in a circuit first'}
            onClick={() => scene?.removeTerminalsFromCircuits(removableTerminals.map((t) => t.id))}
          >
            Remove from circuit
          </button>
          <button
            type="button"
            disabled={toolRunning || !current}
            title={current ? 'Insert a spare before this circuit. This circuit and every later one in its panel move up by one.' : needCircuit}
            onClick={() => current && scene?.insertSpareAt({ circuitId: current.id })}
          >
            Add spare
          </button>
          <button
            type="button"
            disabled={toolRunning || !current}
            title={current ? 'Delete this circuit. Its terminals stay on the canvas. Undo restores it.' : needCircuit}
            onClick={() => {
              if (!current) return;
              scene?.deleteCircuit(current.id);
              setSelectedCircuitId(null);
            }}
          >
            Delete
          </button>
        </div>
        <div className="mep-circuits-group">
          <span className="mep-circuits-group-label">Panel</span>
          <button
            type="button"
            className={tool === 'circuit-assign-panel' ? 'on' : ''}
            disabled={!canWork}
            title={canWork ? 'Click a panel, or equipment to turn into a panel, for this circuit' : current?.isSpare ? 'A spare circuit is created inside its panel' : needCircuit}
            onClick={() => current && scene?.beginAssignPanelToCircuit(current.id)}
          >
            Assign panel
          </button>
          <button
            type="button"
            disabled={toolRunning || !current?.panelId || current.isSpare}
            title={current?.panelId && !current.isSpare ? 'Return this circuit to the unassigned pool' : 'Select a circuit that is on a panel first'}
            onClick={() => current && scene?.removeCircuitFromPanel(current.id)}
          >
            Remove from panel
          </button>
        </div>
        <div className="mep-circuits-group">
          <span className="mep-circuits-group-label">View</span>
          <button
            type="button"
            className={showCircuitLines ? 'on' : ''}
            aria-pressed={showCircuitLines}
            title="Show the dashed connection lines of the current circuit or panel"
            onClick={() => onToggleCircuitLines(!showCircuitLines)}
          >
            Lines
          </button>
        </div>
      </div>
      {(hint || toolRunning) && (
        <div className="mep-circuits-toolbar-hint">
          <span>{hint}</span>
          {toolRunning && (
            <button type="button" onClick={() => scene?.leaveCircuitTool()}>
              Done (Esc)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
