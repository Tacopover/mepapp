import { useState } from 'react';
import type { Discipline } from '@mepapp/core';
import type { LibraryCategory } from '@mepapp/platform';
import { Dialog } from './Dialog.js';
import { DISCIPLINE_LABEL, DISCIPLINE_OPTIONS } from './ElementEditorDialog.js';

export interface LibrarySourceDialogProps {
  /** The category the user chose with the load button — fixed, shown as text. */
  category: LibraryCategory;
  /** Starts as the folder's own name. */
  defaultName: string;
  defaultDiscipline: Discipline;
  /** True while the folder is being added and synced — the buttons stay disabled. */
  busy: boolean;
  showBuiltIn: boolean;
  onChangeShowBuiltIn: (value: boolean) => void;
  onSubmit: (name: string, discipline: Discipline) => void;
  onCancel: () => void;
}

/** Asks for the name and discipline of a stamp folder the user just picked. */
export function LibrarySourceDialog({ category, defaultName, defaultDiscipline, busy, showBuiltIn, onChangeShowBuiltIn, onSubmit, onCancel }: LibrarySourceDialogProps) {
  const [name, setName] = useState(defaultName);
  const [discipline, setDiscipline] = useState<Discipline>(defaultDiscipline);
  const valid = name.trim() !== '';

  const submit = () => {
    if (valid && !busy) onSubmit(name.trim(), discipline);
  };

  return (
    <Dialog
      title="Add stamp folder"
      className="mep-modal--calibration"
      onClose={onCancel}
      actions={
        <>
          <button onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button onClick={submit} disabled={!valid || busy}>
            {busy ? 'Loading…' : 'Add folder'}
          </button>
        </>
      }
    >
      <p className="mep-calibration-hint">
        The images in this folder become {category === 'equipment' ? 'equipment' : 'terminal'} stamps. MepApp copies the files into browser storage.
      </p>
      <div className="mep-field-row">
        <label>Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </div>
      <div className="mep-field-row">
        <label>Discipline</label>
        <select value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline)}>
          {DISCIPLINE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABEL[d]}
            </option>
          ))}
        </select>
      </div>
      <label className="mep-hint">
        <input type="checkbox" checked={showBuiltIn} onChange={(e) => onChangeShowBuiltIn(e.target.checked)} /> Show the built-in MepApp stamps
      </label>
    </Dialog>
  );
}
