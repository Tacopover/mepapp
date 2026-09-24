import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import type { SketchScene, NetworkSummary, StampInfo } from '@mepapp/render';
import { getEffectivePrefix, getStampDefinition, type Circuit, type CircuitType, type Discipline, type Panel, type PanelSection } from '@mepapp/core';
import type { NetworkTreeState } from '../useNetworkTreeState.js';
import { IconChevRight, IconChevDown, IconTerminal, IconEquipment } from '../icons.js';

export interface NetworkTreePanelProps {
  sceneRef: RefObject<SketchScene | null>;
  networkSummaries: NetworkSummary[];
  allStamps: StampInfo[];
  selection: StampInfo[];
  onRenameNetworkType: (id: string, name: string) => void;
  /** Electrical Circuits branch (electrical-circuits-model.md §9) — a sibling section under the Electrical discipline row, alongside the existing Network list above. Circuit/Panel/PanelSection have no canvas presence, so their "selection" is app-level state (see useSketchScene's selectedCircuitId/selectedPanelId), not a stamp selection. */
  circuits: Circuit[];
  panels: Panel[];
  panelSections: PanelSection[];
  circuitTypes: CircuitType[];
  selectedCircuitId: string | null;
  selectedPanelId: string | null;
  onSelectCircuit: (id: string) => void;
  onSelectPanel: (id: string) => void;
  onCreateCircuit: (panelId?: string) => void;
  /** Open rows and bulk-edit state, kept by the caller so they survive the dock unmounting this tree — see useNetworkTreeState. */
  treeState: NetworkTreeState;
  /** Deletes a circuit and clears the tree selection if it was that circuit — see App.tsx. */
  onDeleteCircuit: (id: string) => void;
  /** The Show Circuits toggle — see SketchScene.setShowCircuitLines. */
  showCircuitLines: boolean;
  onToggleCircuitLines: () => void;
}

// Same six values as core's Discipline union (network.ts) — order and labels
// match the old app's panel (networks-panel-spec.md §2) and this repo's
// six-value discipline model, not the five-way DisciplineGroup the palette
// filter uses (see disciplineGroups.ts's note on why those stay separate).
const DISCIPLINE_ORDER: Discipline[] = [
  'ventilation',
  'plumbing',
  'heatingAndCooling',
  'electrical',
  'fireProtection',
  'other',
];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  ventilation: 'Ventilation',
  plumbing: 'Plumbing',
  heatingAndCooling: 'Heating/Cooling',
  electrical: 'Electrical',
  fireProtection: 'Fire Protection',
  other: 'Other',
};

interface TreeMenuItem {
  label: string;
  onSelect: () => void;
}

/** Right-click menu of a tree node — the same look and dismissal as CanvasContextMenu (any outside pointerdown, or Escape), placed at the pointer with fixed positioning because the tree scrolls. */
function TreeContextMenu({ x, y, items, onDismiss }: { x: number; y: number; items: TreeMenuItem[]; onDismiss: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);
  return (
    <div ref={rootRef} className="mep-draw-from-menu mep-tree-menu" role="menu" style={{ left: x, top: y }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="mep-draw-from-menu-btn"
          onClick={() => {
            item.onSelect();
            onDismiss();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function elementLabel(stamp: StampInfo): string {
  const definitionLabel = stamp.definitionId ? getStampDefinition(stamp.definitionId)?.label : undefined;
  return definitionLabel ?? (stamp.category === 'equipment' ? 'Equipment' : 'Terminal');
}

function disciplineKey(discipline: Discipline): string {
  return `discipline:${discipline}`;
}

function networkKey(networkId: string): string {
  return `network:${networkId}`;
}

function panelKey(panelId: string): string {
  return `panel:${panelId}`;
}

/** "A1", "12" — the circuit's effective prefix+number. Defers to circuit.ts's getEffectivePrefix for the inherit-or-fallback rule rather than reimplementing it, so this can't drift from the canonical resolver (electrical-circuits-model.md Phase C addendum). */
function circuitLabel(circuit: Circuit, panel: Panel | undefined): string {
  return `${getEffectivePrefix(circuit, panel)}${circuit.number}`;
}

/** Circuits in number order, so a circuit restored by Undo returns to its place instead of the end of the list. */
function byNumber(circuits: Circuit[]): Circuit[] {
  return [...circuits].sort((a, b) => a.number - b.number);
}

function circuitDescription(circuit: Circuit): string {
  if (circuit.isSpare) return 'spare';
  if (circuit.customName) return circuit.customName;
  return `${circuit.terminalIds.length} terminal${circuit.terminalIds.length === 1 ? '' : 's'}`;
}

/**
 * Networks dock tab's tree — Discipline (all 6, always shown) → Network
 * (renamable) → Element (Terminal/Equipment), spec'd in
 * networks-panel-spec.md. A plain recursive-ish component (two nesting
 * levels rendered directly, no generic recursion needed since the shape is
 * fixed depth-3 and no tree library — see spec's D3.
 */
export function NetworkTreePanel({
  sceneRef,
  networkSummaries,
  allStamps,
  selection,
  onRenameNetworkType,
  circuits,
  panels,
  panelSections,
  circuitTypes,
  selectedCircuitId,
  selectedPanelId,
  onSelectCircuit,
  onSelectPanel,
  onCreateCircuit,
  treeState,
  onDeleteCircuit,
  showCircuitLines,
  onToggleCircuitLines,
}: NetworkTreePanelProps) {
  const { disciplines: expandedDisciplines, setDisciplines: setExpandedDisciplines, networks: expandedNetworks, setNetworks: setExpandedNetworks, panels: expandedPanels, setPanels: setExpandedPanels } = treeState;
  const { circuits: expandedCircuits, setCircuits: setExpandedCircuits, bulkMode, setBulkMode, checkedCircuits, setCheckedCircuits } = treeState;
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkTypeId, setBulkTypeId] = useState('');
  const [editingNetworkTypeId, setEditingNetworkTypeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; items: TreeMenuItem[] } | null>(null);
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const circuitTypeById = new Map(circuitTypes.map((t) => [t.id, t]));

  function toggleExpandedPanel(key: string) {
    setExpandedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpandedCircuit(id: string) {
    setExpandedCircuits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleChecked(ids: string[], checked: boolean) {
    setCheckedCircuits((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleBulkMode() {
    if (bulkMode) setCheckedCircuits(new Set());
    setBulkMode(!bulkMode);
  }

  const checkedIds = circuits.filter((c) => checkedCircuits.has(c.id)).map((c) => c.id);

  function applyBulkEdit() {
    const done = sceneRef.current?.applyCircuitBulkEdit(checkedIds, {
      prefix: bulkPrefix !== '' ? bulkPrefix : undefined,
      circuitTypeId: bulkTypeId !== '' ? bulkTypeId : undefined,
    });
    if (done) {
      setBulkPrefix('');
      setBulkTypeId('');
    }
  }

  /** A checkbox that checks or unchecks a whole group of circuits (a panel, or the unassigned pool); shows the mixed state when only some are checked. */
  function renderGroupCheckbox(label: string, ids: string[]) {
    if (!bulkMode || ids.length === 0) return null;
    const checkedCount = ids.filter((id) => checkedCircuits.has(id)).length;
    return (
      <input
        type="checkbox"
        className="mep-net-tree-check"
        aria-label={`Check all circuits of ${label}`}
        checked={checkedCount === ids.length}
        ref={(el) => {
          if (el) el.indeterminate = checkedCount > 0 && checkedCount < ids.length;
        }}
        onChange={(e) => toggleChecked(ids, e.target.checked)}
      />
    );
  }

  function openMenu(event: MouseEvent, items: TreeMenuItem[]) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items });
  }

  function circuitMenuItems(circuit: Circuit): TreeMenuItem[] {
    const items: TreeMenuItem[] = [];
    if (!circuit.isSpare) {
      items.push({
        label: 'Add terminals',
        onSelect: () => {
          onSelectCircuit(circuit.id);
          sceneRef.current?.beginAddTerminalsToCircuit(circuit.id);
        },
      });
      items.push({
        label: 'Assign panel',
        onSelect: () => {
          onSelectCircuit(circuit.id);
          sceneRef.current?.beginAssignPanelToCircuit(circuit.id);
        },
      });
      if (circuit.panelId) items.push({ label: 'Remove from panel', onSelect: () => sceneRef.current?.removeCircuitFromPanel(circuit.id) });
    }
    items.push({ label: 'Insert spare above', onSelect: () => sceneRef.current?.insertSpareAt({ circuitId: circuit.id }) });
    items.push({ label: 'Delete circuit', onSelect: () => onDeleteCircuit(circuit.id) });
    return items;
  }

  function renderCircuitRow(circuit: Circuit) {
    const panel = circuit.panelId ? panelById.get(circuit.panelId) : undefined;
    const type = circuit.circuitTypeId ? circuitTypeById.get(circuit.circuitTypeId) : undefined;
    const expanded = expandedCircuits.has(circuit.id);
    const members = circuit.terminalIds.map((id) => stampById.get(id)).filter((t): t is StampInfo => t !== undefined);
    return (
      <div key={circuit.id} className="mep-net-tree-network">
        <div className="mep-net-tree-circuit-line" onContextMenu={(e) => openMenu(e, circuitMenuItems(circuit))}>
          {bulkMode && (
            <input
              type="checkbox"
              className="mep-net-tree-check mep-net-tree-check-circuit"
              aria-label={`Check circuit ${circuitLabel(circuit, panel)}`}
              checked={checkedCircuits.has(circuit.id)}
              onChange={(e) => toggleChecked([circuit.id], e.target.checked)}
            />
          )}
          <button
            type="button"
            className="mep-net-tree-toggle mep-net-tree-circuit-toggle"
            aria-label={expanded && members.length > 0 ? 'Hide terminals' : 'Show terminals'}
            disabled={members.length === 0}
            onClick={() => toggleExpandedCircuit(circuit.id)}
          >
            {members.length === 0 ? null : expanded ? <IconChevDown size={12} /> : <IconChevRight size={12} />}
          </button>
          <button
            type="button"
            className={`mep-net-tree-row mep-net-tree-row-element mep-net-tree-row-circuit${selectedCircuitId === circuit.id ? ' on' : ''}${circuit.isSpare ? ' mep-net-tree-row-spare' : ''}`}
            onClick={() => onSelectCircuit(circuit.id)}
          >
            <span className="mep-net-tree-label">
              {circuitLabel(circuit, panel)} <span className="mep-net-tree-count">({circuitDescription(circuit)}{type ? `, ${type.abbreviation}` : ''})</span>
            </span>
          </button>
        </div>
        {expanded &&
          members.map((terminal) => (
            <button
              key={terminal.id}
              type="button"
              className={`mep-net-tree-row mep-net-tree-row-element mep-net-tree-row-circuit-terminal${selectedIds.has(terminal.id) ? ' on' : ''}`}
              onClick={() => sceneRef.current?.selectStampById(terminal.id)}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Select on canvas', onSelect: () => sceneRef.current?.selectStampById(terminal.id) },
                  { label: 'Remove from circuit', onSelect: () => sceneRef.current?.removeTerminalFromCircuit(circuit.id, terminal.id) },
                ])
              }
            >
              <IconTerminal size={12} />
              <span className="mep-net-tree-label">{elementLabel(terminal)}</span>
            </button>
          ))}
      </div>
    );
  }

  const stampById = new Map(allStamps.map((s) => [s.id, s]));
  const selectedIds = new Set(selection.map((s) => s.id));

  // Canvas → tree sync: when the selection changes to include a stamp that
  // lives in this tree, expand every ancestor (its discipline + network) so
  // the highlighted row is actually visible, without collapsing anything the
  // user had already opened by hand.
  useEffect(() => {
    if (selection.length === 0) return;
    const selectedStampIds = new Set(selection.map((s) => s.id));
    const disciplinesToExpand = new Set<string>();
    const networksToExpand = new Set<string>();
    for (const network of networkSummaries) {
      if (network.elementIds.some((id) => selectedStampIds.has(id))) {
        disciplinesToExpand.add(disciplineKey(network.discipline));
        networksToExpand.add(networkKey(network.id));
      }
    }
    if (disciplinesToExpand.size === 0) return;
    setExpandedDisciplines((prev) => new Set([...prev, ...disciplinesToExpand]));
    setExpandedNetworks((prev) => new Set([...prev, ...networksToExpand]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Tree selection → members: a circuit picked in the tree, or a terminal picked on the canvas, opens its
  // circuit so the member rows are in view. Nothing the user collapsed by hand stays closed against a
  // new selection, and nothing is collapsed here.
  useEffect(() => {
    const toOpen = new Set<string>();
    if (selectedCircuitId) toOpen.add(selectedCircuitId);
    for (const circuit of circuits) if (circuit.terminalIds.some((id) => selectedIds.has(id))) toOpen.add(circuit.id);
    if (toOpen.size === 0) return;
    setExpandedCircuits((prev) => (Array.from(toOpen).every((id) => prev.has(id)) ? prev : new Set([...prev, ...toOpen])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCircuitId, selection]);

  function toggleDiscipline(key: string) {
    setExpandedDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleNetwork(key: string) {
    setExpandedNetworks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEditing(network: NetworkSummary) {
    setEditingNetworkTypeId(network.networkTypeId);
    setEditValue(network.networkTypeName);
  }

  function commitEditing() {
    if (editingNetworkTypeId && editValue.trim()) onRenameNetworkType(editingNetworkTypeId, editValue.trim());
    setEditingNetworkTypeId(null);
  }

  return (
    <div className="mep-net-tree">
      {DISCIPLINE_ORDER.map((discipline) => {
        const dKey = disciplineKey(discipline);
        const networks = networkSummaries.filter((n) => n.discipline === discipline);
        const dExpanded = expandedDisciplines.has(dKey);
        return (
          <div key={discipline} className="mep-net-tree-discipline">
            <button type="button" className="mep-net-tree-row mep-net-tree-row-discipline" onClick={() => toggleDiscipline(dKey)}>
              {dExpanded ? <IconChevDown size={12} /> : <IconChevRight size={12} />}
              <span className="mep-net-tree-label">{DISCIPLINE_LABEL[discipline]}</span>
            </button>
            {dExpanded && (
              <div className="mep-net-tree-children">
                {networks.length === 0 && <div className="mep-net-tree-empty">No networks yet.</div>}
                {networks.map((network) => {
                  const nKey = networkKey(network.id);
                  const nExpanded = expandedNetworks.has(nKey);
                  const isEditing = editingNetworkTypeId === network.networkTypeId;
                  const elements = network.elementIds.map((id) => stampById.get(id)).filter((s): s is StampInfo => s !== undefined);
                  return (
                    <div key={network.id} className="mep-net-tree-network">
                      <div className="mep-net-tree-row mep-net-tree-row-network">
                        <button type="button" className="mep-net-tree-toggle" onClick={() => toggleNetwork(nKey)}>
                          {nExpanded ? <IconChevDown size={12} /> : <IconChevRight size={12} />}
                        </button>
                        {isEditing ? (
                          <input
                            autoFocus
                            className="mep-net-tree-rename-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEditing}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditing();
                              if (e.key === 'Escape') setEditingNetworkTypeId(null);
                            }}
                          />
                        ) : (
                          <span className="mep-net-tree-label" onDoubleClick={() => startEditing(network)}>
                            {network.networkTypeName} <span className="mep-net-tree-count">({elements.length} elements)</span>
                          </span>
                        )}
                      </div>
                      {nExpanded && (
                        <div className="mep-net-tree-children">
                          {elements.length === 0 && <div className="mep-net-tree-empty">No elements.</div>}
                          {elements.map((stamp) => (
                            <button
                              key={stamp.id}
                              type="button"
                              className={`mep-net-tree-row mep-net-tree-row-element${selectedIds.has(stamp.id) ? ' on' : ''}`}
                              onClick={() => sceneRef.current?.selectStampById(stamp.id)}
                            >
                              {stamp.category === 'equipment' ? <IconEquipment size={12} /> : <IconTerminal size={12} />}
                              <span className="mep-net-tree-label">{elementLabel(stamp)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {discipline === 'electrical' && (
                  <div className="mep-net-tree-network">
                    <div className="mep-net-tree-row mep-net-tree-row-network">
                      <span className="mep-net-tree-label">
                        Circuits{' '}
                        <button type="button" className="mep-net-tree-add" onClick={() => onCreateCircuit()} title="New unassigned circuit">
                          +
                        </button>
                        <button
                          type="button"
                          className={`mep-net-tree-add mep-net-tree-lines${showCircuitLines ? ' on' : ''}`}
                          aria-pressed={showCircuitLines}
                          onClick={onToggleCircuitLines}
                          title="Show connection lines from the selected terminal, circuit or panel"
                        >
                          Lines
                        </button>
                        <button
                          type="button"
                          className={`mep-net-tree-add mep-net-tree-lines${bulkMode ? ' on' : ''}`}
                          aria-pressed={bulkMode}
                          onClick={toggleBulkMode}
                          title="Check circuits to set their prefix and type together"
                        >
                          Edit
                        </button>
                      </span>
                    </div>
                    {bulkMode && (
                      <div className="mep-net-tree-bulk">
                        <span className="mep-net-tree-count">{checkedIds.length} checked</span>
                        <input type="text" placeholder="Prefix" aria-label="Prefix for checked circuits" value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} />
                        <select aria-label="Circuit type for checked circuits" value={bulkTypeId} onChange={(e) => setBulkTypeId(e.target.value)}>
                          <option value="">Keep type</option>
                          {circuitTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" disabled={checkedIds.length === 0 || (bulkPrefix === '' && bulkTypeId === '')} onClick={applyBulkEdit}>
                          Apply
                        </button>
                        <span className="mep-net-tree-count">An empty field keeps the current value.</span>
                      </div>
                    )}
                    <div className="mep-net-tree-children">
                      {panels.length === 0 && circuits.length === 0 && <div className="mep-net-tree-empty">No panels or circuits yet.</div>}
                      {panels.map((panel) => {
                        const pKey = panelKey(panel.id);
                        const pExpanded = expandedPanels.has(pKey);
                        const panelCircuits = circuits.filter((c) => c.panelId === panel.id);
                        const sections = panelSections.filter((s) => s.panelId === panel.id).sort((a, b) => a.order - b.order);
                        const unsectioned = panelCircuits.filter((c) => !c.sectionId);
                        return (
                          <div key={panel.id} className="mep-net-tree-network">
                            <div
                              className="mep-net-tree-row mep-net-tree-row-network mep-net-tree-row-panel"
                              onContextMenu={(e) =>
                                openMenu(e, [
                                  { label: 'Add circuit', onSelect: () => onCreateCircuit(panel.id) },
                                  { label: 'Add spare', onSelect: () => sceneRef.current?.insertSpareAt({ panelId: panel.id }) },
                                  { label: 'Manage panel', onSelect: () => onSelectPanel(panel.id) },
                                  { label: 'Select equipment on canvas', onSelect: () => sceneRef.current?.selectStampById(panel.equipmentStampId) },
                                ])
                              }
                            >
                              {renderGroupCheckbox(panel.name, panelCircuits.map((c) => c.id))}
                              <button type="button" className="mep-net-tree-toggle" onClick={() => toggleExpandedPanel(pKey)}>
                                {pExpanded ? <IconChevDown size={12} /> : <IconChevRight size={12} />}
                              </button>
                              <span
                                className={`mep-net-tree-label${selectedPanelId === panel.id ? ' on' : ''}`}
                                onClick={() => onSelectPanel(panel.id)}
                              >
                                <IconEquipment size={12} /> {panel.name} <span className="mep-net-tree-count">({panelCircuits.length})</span>
                              </span>
                            </div>
                            {pExpanded && (
                              <div className="mep-net-tree-children">
                                {sections.map((section) => (
                                  <div key={section.id} className="mep-net-tree-network">
                                    <div className="mep-net-tree-row mep-net-tree-row-network mep-net-tree-row-section">
                                      <span className="mep-net-tree-label">{section.name}</span>
                                    </div>
                                    <div className="mep-net-tree-children">
                                      {byNumber(panelCircuits.filter((c) => c.sectionId === section.id)).map((c) => renderCircuitRow(c))}
                                    </div>
                                  </div>
                                ))}
                                {unsectioned.length === 0 && sections.length > 0 ? null : byNumber(unsectioned).map((c) => renderCircuitRow(c))}
                                <button type="button" className="mep-net-tree-add" onClick={() => onCreateCircuit(panel.id)} title="Add circuit to this panel">
                                  + Add circuit
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {circuits.some((c) => !c.panelId) && (
                        <div className="mep-net-tree-network">
                          <div
                            className="mep-net-tree-row mep-net-tree-row-network"
                            onContextMenu={(e) => openMenu(e, [{ label: 'New circuit', onSelect: () => onCreateCircuit() }])}
                          >
                            {renderGroupCheckbox('Unassigned', circuits.filter((c) => !c.panelId).map((c) => c.id))}
                            <span className="mep-net-tree-label">Unassigned</span>
                          </div>
                          <div className="mep-net-tree-children">{byNumber(circuits.filter((c) => !c.panelId)).map((c) => renderCircuitRow(c))}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {menu && <TreeContextMenu x={menu.x} y={menu.y} items={menu.items} onDismiss={() => setMenu(null)} />}
    </div>
  );
}
