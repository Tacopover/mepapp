import { useState } from 'react';
import type { ExportScope } from '../quantitiesScope.js';
import { Dialog } from './Dialog.js';

export interface QuantitiesScopeDialogProps {
  /** Undefined when no building is open: Level and Building are disabled with the hint "Open a building first". */
  building?: { name: string; levels: { id: string; name: string }[] };
  onExport: (scope: ExportScope) => void;
  onCancel: () => void;
}

type ScopeKind = ExportScope['kind'];

export function QuantitiesScopeDialog({ building, onExport, onCancel }: QuantitiesScopeDialogProps) {
  const [kind, setKind] = useState<ScopeKind>('document');
  const [levelId, setLevelId] = useState<string>(building?.levels[0]?.id ?? '');

  const levels = building?.levels ?? [];
  const buildingDisabled = building === undefined || levels.length === 0;
  const hint = building === undefined ? 'Open a building first' : levels.length === 0 ? 'The building has no levels yet' : undefined;

  const submit = () => {
    if (kind === 'level') onExport({ kind: 'level', levelId });
    else onExport({ kind });
  };

  return (
    <Dialog
      title="Export quantities"
      closeOnBackdropClick={false}
      onClose={onCancel}
      actions={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit}>Export</button>
        </>
      }
    >
      <label className="mep-checkbox-row">
        <input type="radio" name="quantities-scope" checked={kind === 'sheet'} onChange={() => setKind('sheet')} /> This sheet (the current page only)
      </label>
      <label className="mep-checkbox-row">
        <input type="radio" name="quantities-scope" checked={kind === 'document'} onChange={() => setKind('document')} /> This document (all pages)
      </label>
      <div className="mep-scope-level-row">
        <label className="mep-checkbox-row">
          <input
            type="radio"
            name="quantities-scope"
            checked={kind === 'level'}
            disabled={buildingDisabled}
            onChange={() => setKind('level')}
          /> Level
        </label>
        {!buildingDisabled && (
          <select aria-label="Level" value={levelId} disabled={kind !== 'level'} onChange={(e) => setLevelId(e.target.value)}>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className="mep-checkbox-row">
        <input
          type="radio"
          name="quantities-scope"
          checked={kind === 'building'}
          disabled={buildingDisabled}
          onChange={() => setKind('building')}
        /> Building
      </label>
      {hint && <p className="mep-hint">{hint}</p>}
      <p className="mep-calibration-hint">The Excel file gets one table for each kind of element.</p>
    </Dialog>
  );
}
