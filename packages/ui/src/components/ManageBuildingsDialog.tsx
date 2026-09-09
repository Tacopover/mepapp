import { useState } from 'react';
import { Dialog } from './Dialog.js';
import { assignDocumentToLevel, newBuilding, newLevel, type Building } from '../buildings.js';

export interface ManageBuildingsDialogProps {
  buildings: Building[];
  onChange: (next: Building[]) => void;
  /** The currently open document's file name, for "Assign current document" — null when nothing is open. */
  currentDocumentFileName: string | null;
  onClose: () => void;
}

type Selected = { kind: 'building'; buildingId: string } | { kind: 'level'; buildingId: string; levelId: string } | null;

/**
 * Building/Level registry (ui-atlas-layout-mapping.md §4's "Manage
 * Buildings…" row) — Menu → Manage Buildings. Commits every change
 * immediately, same as the old app's non-modal management window (no
 * Save/Cancel step) — Close is the only action.
 */
export function ManageBuildingsDialog({ buildings, onChange, currentDocumentFileName, onClose }: ManageBuildingsDialogProps) {
  const [selected, setSelected] = useState<Selected>(null);

  const selectedBuilding = selected ? buildings.find((b) => b.id === selected.buildingId) ?? null : null;
  const selectedLevel = selected?.kind === 'level' ? selectedBuilding?.levels.find((l) => l.id === selected.levelId) ?? null : null;

  function handleAddBuilding() {
    const building = newBuilding('New Building');
    onChange([...buildings, building]);
    setSelected({ kind: 'building', buildingId: building.id });
  }

  function handleRenameBuilding(buildingId: string, name: string) {
    onChange(buildings.map((b) => (b.id === buildingId ? { ...b, name } : b)));
  }

  function handleDeleteBuilding(buildingId: string) {
    onChange(buildings.filter((b) => b.id !== buildingId));
    setSelected(null);
  }

  function handleAddLevel(buildingId: string) {
    const level = newLevel('New Level');
    onChange(buildings.map((b) => (b.id === buildingId ? { ...b, levels: [...b.levels, level] } : b)));
    setSelected({ kind: 'level', buildingId, levelId: level.id });
  }

  function handleRenameLevel(buildingId: string, levelId: string, name: string) {
    onChange(
      buildings.map((b) =>
        b.id === buildingId ? { ...b, levels: b.levels.map((l) => (l.id === levelId ? { ...l, name } : l)) } : b,
      ),
    );
  }

  function handleDeleteLevel(buildingId: string, levelId: string) {
    onChange(buildings.map((b) => (b.id === buildingId ? { ...b, levels: b.levels.filter((l) => l.id !== levelId) } : b)));
    setSelected({ kind: 'building', buildingId });
  }

  function handleAssignCurrentDocument(levelId: string) {
    if (!currentDocumentFileName) return;
    onChange(assignDocumentToLevel(buildings, levelId, currentDocumentFileName));
  }

  function handleUnassign(buildingId: string, levelId: string) {
    onChange(
      buildings.map((b) =>
        b.id === buildingId ? { ...b, levels: b.levels.map((l) => (l.id === levelId ? { ...l, documentFileName: null } : l)) } : b,
      ),
    );
  }

  return (
    <Dialog title="Manage Buildings" onClose={onClose} actions={<button onClick={onClose}>Close</button>}>
      <div className="mep-buildings-layout">
        <div className="mep-buildings-tree">
          {buildings.map((building) => (
            <div key={building.id}>
              <div
                className={`mep-elem-row selectable${selected?.kind === 'building' && selected.buildingId === building.id ? ' active' : ''}`}
                onClick={() => setSelected({ kind: 'building', buildingId: building.id })}
              >
                <b>{building.name}</b>
              </div>
              {building.levels.map((level) => (
                <div
                  key={level.id}
                  className={`mep-elem-row selectable mep-level-row${
                    selected?.kind === 'level' && selected.levelId === level.id ? ' active' : ''
                  }`}
                  onClick={() => setSelected({ kind: 'level', buildingId: building.id, levelId: level.id })}
                >
                  <span>{level.name}</span>
                </div>
              ))}
            </div>
          ))}
          <button type="button" onClick={handleAddBuilding}>
            + Building
          </button>
        </div>

        <div className="mep-buildings-detail">
          {!selected && <p className="mep-empty-panel">Select a building or level, or add a new building.</p>}

          {selectedBuilding && selected?.kind === 'building' && (
            <div className="mep-section">
              <h4>Building</h4>
              <div className="mep-field-row">
                <label>Name</label>
                <input value={selectedBuilding.name} onChange={(e) => handleRenameBuilding(selectedBuilding.id, e.target.value)} />
              </div>
              <button type="button" onClick={() => handleAddLevel(selectedBuilding.id)}>
                + Add Level
              </button>
              <button type="button" onClick={() => handleDeleteBuilding(selectedBuilding.id)}>
                Delete Building
              </button>
            </div>
          )}

          {selectedBuilding && selectedLevel && selected?.kind === 'level' && (
            <div className="mep-section">
              <h4>Level</h4>
              <div className="mep-field-row">
                <label>Name</label>
                <input
                  value={selectedLevel.name}
                  onChange={(e) => handleRenameLevel(selectedBuilding.id, selectedLevel.id, e.target.value)}
                />
              </div>
              <p className="mep-hint">
                {selectedLevel.documentFileName
                  ? `Assigned document: ${selectedLevel.documentFileName}`
                  : 'No document assigned to this level.'}
              </p>
              {selectedLevel.documentFileName ? (
                <button type="button" onClick={() => handleUnassign(selectedBuilding.id, selectedLevel.id)}>
                  Unassign
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!currentDocumentFileName}
                  onClick={() => handleAssignCurrentDocument(selectedLevel.id)}
                  title={currentDocumentFileName ?? 'No document open'}
                >
                  Assign current document
                </button>
              )}
              <button type="button" onClick={() => handleDeleteLevel(selectedBuilding.id, selectedLevel.id)}>
                Delete Level
              </button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
