import { useState } from 'react';
import { Dialog } from './Dialog.js';
import type { UseBuilding } from '../useBuilding.js';

export interface ManageBuildingsDialogProps {
  building: UseBuilding & { available: boolean };
  onClose: () => void;
}

/**
 * Manage Buildings: creates, opens and closes the one open building file.
 * The building file is stored by the platform (a file picker on desktop).
 */
export function ManageBuildingsDialog({ building, onClose }: ManageBuildingsDialogProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  function handleCreate() {
    if (building.busy) return;
    void building.create(name);
    setCreating(false);
    setName('');
  }

  return (
    <Dialog title="Manage Buildings" onClose={onClose} closeOnBackdropClick={false} actions={<button onClick={onClose}>Close</button>}>
      {!building.available && <p>Building files are not available in this version of the app. Use the desktop app.</p>}

      {building.available && building.message && (
        <p className="mep-hint mep-buildings-message" role="alert">
          {building.message} <button type="button" onClick={() => building.dismissMessage()}>Dismiss</button>
        </p>
      )}

      {building.available && building.building && (
        <div className="mep-section">
          <h4>Open building</h4>
          <p className="mep-buildings-open-name">{building.building.file.name}</p>
          <p className="mep-hint">{building.building.ref.location}</p>
          <p>
            {building.building.file.levels.length} levels, {building.building.file.sheets.length} sheets
          </p>
          <button type="button" onClick={() => building.close()}>
            Close building
          </button>
        </div>
      )}

      {building.available && !building.building && (
        <p className="mep-hint">No building is open. Create a building or open a building file.</p>
      )}

      {building.available && (
        <div className="mep-section">
          <h4>Open or create</h4>
          {creating && (
            <div className="mep-field-row">
              <input
                placeholder="Building name (default: New building)"
                aria-label="Building name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreate();
                }}
              />
              <button type="button" disabled={building.busy} onClick={handleCreate}>
                Create…
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setName('');
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="mep-buildings-actions">
            {!creating && (
              <button type="button" disabled={building.busy} onClick={() => setCreating(true)}>
                New building
              </button>
            )}
            <button type="button" disabled={building.busy} onClick={() => void building.open()}>
              Open building…
            </button>
          </div>
        </div>
      )}

      {building.available && building.recent.length > 0 && (
        <div className="mep-section">
          <h4>Recent buildings</h4>
          {building.recent.map((entry) => (
            <div key={entry.id} className="mep-elem-row mep-buildings-recent">
              <div>
                <b>{entry.name}</b>
                <p className="mep-hint">{entry.location}</p>
              </div>
              <button type="button" onClick={() => void building.openRecent(entry)}>
                Open
              </button>
              <button type="button" title="Remove from the list" onClick={() => building.forgetRecent(entry.id)}>
                Remove from list
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
