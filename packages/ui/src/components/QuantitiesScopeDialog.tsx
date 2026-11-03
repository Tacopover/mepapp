import { useState } from 'react';
import type { ExportScope } from '../quantitiesScope.js';
import { Dialog } from './Dialog.js';

export interface QuantitiesScopeDialogProps {
  /** Undefined when no building is open: Level and Building are disabled with the hint "Open a building first". */
  building?: { name: string; levels: { id: string; name: string }[] };
  /** Recent buildings; shown as a select when no building is open. */
  recent?: { id: string; name: string }[];
  busy?: boolean;
  /** Error text from the building controller (shown under the select). */
  message?: string | null;
  onOpenRecent?: (id: string) => void;
  onOpenFile?: () => void;
  onManage?: () => void;
  onExport: (scope: ExportScope) => void;
  onCancel: () => void;
}

type ScopeKind = ExportScope['kind'];

export function effectiveLevelId(levels: { id: string }[], levelId: string): string {
  return levels.some((level) => level.id === levelId) ? levelId : (levels[0]?.id ?? '');
}

export function QuantitiesScopeDialog({ building, recent, busy, message, onOpenRecent, onOpenFile, onManage, onExport, onCancel }: QuantitiesScopeDialogProps) {
  const [kind, setKind] = useState<ScopeKind>('document');
  const [levelId, setLevelId] = useState<string>('');

  const levels = building?.levels ?? [];
  const buildingDisabled = building === undefined || levels.length === 0;
  const hint = building === undefined ? 'Open a building first' : levels.length === 0 ? 'The building has no levels yet' : undefined;
  const selectedLevelId = effectiveLevelId(levels, levelId);

  const submit = () => {
    if (kind === 'level') onExport({ kind: 'level', levelId: selectedLevelId });
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
          <select aria-label="Level" value={selectedLevelId} disabled={kind !== 'level'} onChange={(e) => setLevelId(e.target.value)}>
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
      {building === undefined && (
        <div className="mep-scope-open-row">
          {recent && recent.length > 0 && (
            <select aria-label="Building" value="" disabled={busy} onChange={(e) => onOpenRecent?.(e.target.value)}>
              <option value="" disabled>
                Choose a building…
              </option>
              {recent.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" disabled={busy} onClick={() => onOpenFile?.()}>
            Open building…
          </button>
          <button type="button" className="mep-link-btn" onClick={() => onManage?.()}>
            Manage Buildings…
          </button>
        </div>
      )}
      {building === undefined && message && <p className="mep-hint">{message}</p>}
      <p className="mep-calibration-hint">The Excel file gets one table for each kind of element.</p>
    </Dialog>
  );
}
