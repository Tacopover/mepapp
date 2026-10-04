import { SAVED_STAMPS_SOURCE_ID } from '@mepapp/core';
import type { LibrarySourceRecord, LibraryStampRecord } from '@mepapp/platform';
import { Dialog } from './Dialog.js';
import { DISCIPLINE_LABEL } from './ElementEditorDialog.js';

export interface LibraryFoldersDialogProps {
  /** False in a browser with no directory picker — the dialog then only explains this. */
  available: boolean;
  sources: LibrarySourceRecord[];
  records: LibraryStampRecord[];
  /** The id of the source that is syncing right now, if any — its buttons stay disabled. */
  busySourceId: string | null;
  /** Runs inside the click, so it can ask for folder permission. */
  onSync: (source: LibrarySourceRecord) => void;
  /** App.tsx asks for confirmation before it removes the source. */
  onRemove: (source: LibrarySourceRecord) => void;
  /** Opens the folder picker for a new source of this category. */
  onAddFolder: (category: LibrarySourceRecord['category']) => void;
  /** Clears the hidden flag on every stamp of the source. */
  onShowHidden: (source: LibrarySourceRecord) => void;
  showBuiltIn: boolean;
  onChangeShowBuiltIn: (value: boolean) => void;
  onClose: () => void;
}

/** Lists the user's stamp folders and offers Sync, Remove and Add (Stamps tab → Library folders…). */
export function LibraryFoldersDialog({ available, sources, records, busySourceId, onSync, onRemove, onAddFolder, onShowHidden, showBuiltIn, onChangeShowBuiltIn, onClose }: LibraryFoldersDialogProps) {
  return (
    <Dialog title="Library folders" className="mep-modal--wide" onClose={onClose} actions={<button onClick={onClose}>Close</button>}>
      <label className="mep-hint">
        <input type="checkbox" checked={showBuiltIn} onChange={(e) => onChangeShowBuiltIn(e.target.checked)} /> Show the built-in MepApp stamps
      </label>
      {!available ? (
        <p className="mep-hint">Custom stamp folders need Chrome or Edge. They are not available in this browser.</p>
      ) : (
        <>
          <p className="mep-hint">
            MepApp copies the files from your folders into browser storage. Press Sync to pick up changes in a folder. A renamed file becomes a new stamp. A JPEG file
            has no transparency. Port edits are kept only in this browser.
          </p>
          {sources.length === 0 && <p className="mep-empty-panel">No folders yet.</p>}
          {sources.map((source) => {
            const own = records.filter((record) => record.sourceId === source.id);
            const missing = own.filter((record) => record.missingFromFolder).length;
            const hidden = own.filter((record) => record.hidden).length;
            const saved = source.id === SAVED_STAMPS_SOURCE_ID;
            const busy = busySourceId === source.id;
            return (
              <div key={source.id} className="mep-library-source">
                <div className="mep-library-source-info">
                  <b>{saved ? 'Saved stamps (no folder)' : source.name}</b>
                  <span className="mep-hint">
                    {source.category === 'equipment' ? 'Equipment' : 'Terminals'} · {DISCIPLINE_LABEL[source.discipline]} · {own.length} stamp
                    {own.length === 1 ? '' : 's'}
                    {missing > 0 ? ` · ${missing} missing from the folder` : ''}
                    {hidden > 0 ? ` · ${hidden} hidden` : ''}
                    {saved ? '' : ` · Last sync: ${source.lastSyncedAt ? new Date(source.lastSyncedAt).toLocaleString() : 'never'}`}
                  </span>
                </div>
                {hidden > 0 && (
                  <button type="button" disabled={busy} onClick={() => onShowHidden(source)}>
                    Show hidden stamps
                  </button>
                )}
                {!saved && (
                <button
                  type="button"
                  disabled={!source.dirHandle || busy}
                  title={source.dirHandle ? 'Read the folder again' : 'This folder has no saved handle'}
                  onClick={() => onSync(source)}
                >
                  {busy ? 'Syncing…' : 'Sync'}
                </button>
                )}
                <button type="button" disabled={busy} onClick={() => onRemove(source)}>
                  Remove
                </button>
              </div>
            );
          })}
          <div className="mep-library-add">
            <button type="button" onClick={() => onAddFolder('terminal')}>
              Add terminals folder…
            </button>
            <button type="button" onClick={() => onAddFolder('equipment')}>
              Add equipment folder…
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
