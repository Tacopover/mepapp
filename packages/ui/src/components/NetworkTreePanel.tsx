import { useEffect, useState, type RefObject } from 'react';
import type { SketchScene, NetworkSummary, StampInfo } from '@mepapp/render';
import { getStampDefinition, type Discipline } from '@mepapp/core';
import { IconChevRight, IconChevDown, IconTerminal, IconEquipment } from '../icons.js';

export interface NetworkTreePanelProps {
  sceneRef: RefObject<SketchScene | null>;
  networkSummaries: NetworkSummary[];
  allStamps: StampInfo[];
  selection: StampInfo[];
  onRenameNetworkType: (id: string, name: string) => void;
}

// Same six values as core's Discipline union (network.ts) — order and labels
// match the old app's panel (networks-panel-spec.md §2) and this repo's
// six-value discipline model, not the four-way DisciplineGroup the palette
// filter uses (see disciplineGroups.ts's note on why those stay separate).
const DISCIPLINE_ORDER: Discipline[] = [
  'ventilation',
  'plumbing',
  'heatingAndCooling',
  'electricalPathways',
  'electricalCircuits',
  'fireProtection',
];

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  ventilation: 'Ventilation',
  plumbing: 'Plumbing',
  heatingAndCooling: 'Heating/Cooling',
  electricalPathways: 'Electrical Pathways',
  electricalCircuits: 'Electrical Circuits',
  fireProtection: 'Fire Protection',
};

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

/**
 * Networks dock tab's tree — Discipline (all 6, always shown) → Network
 * (renamable) → Element (Terminal/Equipment), spec'd in
 * networks-panel-spec.md. A plain recursive-ish component (two nesting
 * levels rendered directly, no generic recursion needed since the shape is
 * fixed depth-3 and no tree library — see spec's D3.
 */
export function NetworkTreePanel({ sceneRef, networkSummaries, allStamps, selection, onRenameNetworkType }: NetworkTreePanelProps) {
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  const [expandedNetworks, setExpandedNetworks] = useState<Set<string>>(new Set());
  const [editingNetworkTypeId, setEditingNetworkTypeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
