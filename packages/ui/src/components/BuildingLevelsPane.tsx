import { useState } from 'react';
import {
  addLevel,
  deleteLevel,
  levelWarnings,
  moveLevel,
  renameLevel,
  setLevelElevation,
  sortLevelsByElevation,
  type BuildingFile,
} from '@mepapp/core';
import { countLabel, deleteBlockedReason, nextLevelElevation, sheetCount } from '../buildingLevels.js';

export interface BuildingLevelsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  selectedLevelId?: string | null;
}

/**
 * Edits the levels of the open building. Every change goes through update, which writes the building file.
 */
export function BuildingLevelsPane({ file, update, selectedLevelId }: BuildingLevelsPaneProps) {
  const isSorted = file.levels.every((level, index) => index === 0 || file.levels[index - 1]!.elevationMm <= level.elevationMm);

  return (
    <div className="mep-section">
      <h4>Levels</h4>
      {file.levels.length === 0 && <p className="mep-hint">No levels yet. Add a level to start.</p>}
      {file.levels.length > 0 && (
        <div className="mep-level-edit-row mep-level-edit-head" aria-hidden="true">
          <span>Name</span>
          <span>Elevation</span>
          <span />
          <span>Sheets</span>
          <span />
        </div>
      )}
      {file.levels.map((level, index) => {
        const blocked = deleteBlockedReason(file, level.id);
        const sheets = sheetCount(file, level.id);
        return (
          <div
            key={level.id}
            className={`mep-elem-row mep-level-edit-row${level.id === selectedLevelId ? ' mep-level-edit-row--selected' : ''}`}
            aria-current={level.id === selectedLevelId ? 'true' : undefined}
            data-testid="level-row"
          >
            <LevelNameInput name={level.name} onRename={(name) => void update((f) => renameLevel(f, level.id, name))} />
            <LevelElevationInput
              value={level.elevationMm}
              onCommit={(value) => void update((f) => setLevelElevation(f, level.id, value))}
            />
            <span>mm</span>
            <span>{countLabel(sheets, 'sheet') + (blocked !== null ? ', cannot delete' : '')}</span>
            <button
              type="button"
              aria-label="Move level up"
              title="Move level up"
              disabled={index === 0}
              onClick={() => void update((f) => moveLevel(f, level.id, index - 1))}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move level down"
              title="Move level down"
              disabled={index === file.levels.length - 1}
              onClick={() => void update((f) => moveLevel(f, level.id, index + 1))}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={blocked !== null}
              title={blocked ?? 'Delete level'}
              onClick={() =>
                void update((f) => {
                  const result = deleteLevel(f, level.id);
                  return result.ok ? result.file : f;
                })
              }
            >
              Delete
            </button>
          </div>
        );
      })}
      <div className="mep-buildings-actions">
        <button type="button" onClick={() => void update((f) => addLevel(f, '', nextLevelElevation(f)))}>
          Add level
        </button>
        <button
          type="button"
          disabled={isSorted}
          onClick={() => void update((f) => sortLevelsByElevation(f))}
        >
          Sort by elevation
        </button>
      </div>
      {levelWarnings(file).map((warning) => (
        <p key={warning} className="mep-hint mep-buildings-message">
          {warning}
        </p>
      ))}
    </div>
  );
}

interface LevelNameInputProps {
  name: string;
  onRename: (name: string) => void;
}

/** Keeps the typed text in a draft until blur or Enter. Escape drops the draft; a blank draft keeps the saved name. */
function LevelNameInput({ name, onRename }: LevelNameInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed !== '' && trimmed !== name) onRename(trimmed);
  }

  return (
    <input
      aria-label="Level name"
      value={draft ?? name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

interface LevelElevationInputProps {
  value: number;
  onCommit: (value: number) => void;
}

/** Keeps the typed text in a draft until blur or Enter. Escape drops the draft; a draft that is not a finite number keeps the saved elevation. */
function LevelElevationInput({ value, onCommit }: LevelElevationInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
  }

  return (
    <input
      type="number"
      aria-label="Elevation (mm)"
      value={draft ?? String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') {
          event.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
