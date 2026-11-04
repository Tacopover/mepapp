import { useState } from 'react';
import type { ExportScope } from '../quantitiesScope.js';
import { Dialog } from './Dialog.js';

export interface QuantitiesScopeDialogProps {
  /** Undefined when no building is open: Level and Building are disabled with the hint "Open a building first". */
  building?: { id: string; name: string; levels: { id: string; name: string }[] };
  /** The building choices, the open building first. Shown as the Building select when there is at least one. */
  buildings?: { id: string; name: string }[];
  busy?: boolean;
  /** Error text from the building controller (shown under the select). */
  message?: string | null;
  onSelectBuilding?: (id: string) => void;
  onOpenFile?: () => void;
  onManage?: () => void;
  onExport: (scope: ExportScope) => void;
  onCancel: () => void;
}

type ScopeKind = ExportScope['kind'];

export function effectiveLevelId(levels: { id: string }[], levelId: string): string {
  return levels.some((level) => level.id === levelId) ? levelId : (levels[0]?.id ?? '');
}

/** A building with no levels cannot give a Level or Building takeoff, so those kinds fall back to Document. */
export function effectiveKind(kind: ScopeKind, buildingDisabled: boolean): ScopeKind {
  return buildingDisabled && (kind === 'level' || kind === 'building') ? 'document' : kind;
}

export function QuantitiesScopeDialog({ building, buildings, busy, message, onSelectBuilding, onOpenFile, onManage, onExport, onCancel }: QuantitiesScopeDialogProps) {
  const [kind, setKind] = useState<ScopeKind>('document');
  const [levelId, setLevelId] = useState<string>('');

  const levels = building?.levels ?? [];
  const buildingDisabled = building === undefined || levels.length === 0;
  const hint = building === undefined ? 'Open a building first' : levels.length === 0 ? 'The building has no levels yet' : undefined;
  const selectedLevelId = effectiveLevelId(levels, levelId);
  const shownKind = effectiveKind(kind, buildingDisabled);

  const submit = () => {
    if (shownKind === 'level') onExport({ kind: 'level', levelId: selectedLevelId });
    else onExport({ kind: shownKind });
  };

  return (
    <Dialog
      title="Export quantities"
      className="mep-modal--scope"
      closeOnBackdropClick={false}
      onClose={onCancel}
      actions={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit} disabled={busy}>Export</button>
        </>
      }
    >
      <label className="mep-checkbox-row">
        <input type="radio" name="quantities-scope" checked={shownKind === 'sheet'} onChange={() => setKind('sheet')} /> This sheet (the current page only)
      </label>
      <label className="mep-checkbox-row">
        <input type="radio" name="quantities-scope" checked={shownKind === 'document'} onChange={() => setKind('document')} /> This document (all pages)
      </label>
      {buildings && buildings.length > 0 && (
        <div className="mep-scope-level-row">
          <span className="mep-checkbox-row">Read from</span>
          <select aria-label="Building" value={building?.id ?? ''} disabled={busy} onChange={(e) => onSelectBuilding?.(e.target.value)}>
            {building === undefined && (
              <option value="" disabled>
                Choose a building…
              </option>
            )}
            {buildings.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mep-scope-level-row">
        <label className="mep-checkbox-row">
          <input
            type="radio"
            name="quantities-scope"
            checked={shownKind === 'level'}
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
          checked={shownKind === 'building'}
          disabled={buildingDisabled}
          onChange={() => setKind('building')}
        /> Building
      </label>
      {hint && <p className="mep-hint">{hint}</p>}
      {building === undefined && (
        <div className="mep-scope-open-row">
          <button type="button" disabled={busy} onClick={() => onOpenFile?.()}>
            Open building…
          </button>
          <button type="button" className="mep-link-btn" onClick={() => onManage?.()}>
            Manage Buildings…
          </button>
        </div>
      )}
      {message && <p className="mep-hint">{message}</p>}
      <p className="mep-calibration-hint">The Excel file gets one table for each kind of element.</p>
    </Dialog>
  );
}
