import { useEffect, useRef, useState } from 'react';
import {
  deleteLevel,
  levelWarnings,
  renameBuilding,
  renameLevel,
  setLevelElevation,
  type BuildingFile,
  type BuildingLevel,
} from '@mepapp/core';
import { countLabel, deleteBlockedText, restoreLevel, sheetCount } from '../buildingLevels.js';
import { buildingKey, levelKey } from '../buildingTree.js';
import { BuildingNameEditor } from './BuildingNameEditor.js';
import { BuildingSection } from './BuildingSection.js';

/** How long the Undo line stays after a level is deleted, in ms. */
const UNDO_MS = 8000;

export interface BuildingLevelsPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  selectedLevelId: string | null;
  /** Level whose name field takes the focus and selects its text (a level just added). */
  focusNameLevelId: string | null;
  onNameFocused: () => void;
  /** Ask the dialog to select a node (key from levelKey/buildingKey) and move DOM focus to the tree. */
  onSelectKey: (key: string) => void;
  /** The warning lines of the building (shown when no level is selected). */
  buildingWarningLines: readonly string[];
  /** True when a sheet of the selected level has a missing PDF or no access. */
  levelHasWarning: boolean;
}

/**
 * The first section of the right pane. A selected level shows Name and Elevation (the basic information of a level).
 * Without a selected level it shows the building. Every change goes through update, which writes the building file.
 */
export function BuildingLevelsPane({
  file,
  update,
  selectedLevelId,
  focusNameLevelId,
  onNameFocused,
  onSelectKey,
  buildingWarningLines,
  levelHasWarning,
}: BuildingLevelsPaneProps) {
  const [undo, setUndo] = useState<{ level: BuildingLevel; index: number } | null>(null);
  const selectedIndex = file.levels.findIndex((level) => level.id === selectedLevelId);
  const selectedLevel = selectedIndex >= 0 ? file.levels[selectedIndex]! : null;
  const deleteBlocked = selectedLevel !== null ? deleteBlockedText(file, selectedLevel.id) : null;

  useEffect(() => {
    if (undo === null) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  function deleteAt(level: BuildingLevel, index: number) {
    if (deleteBlockedText(file, level.id) !== null) return;
    const next = file.levels[index + 1] ?? file.levels[index - 1];
    void update((f) => {
      const result = deleteLevel(f, level.id);
      return result.ok ? result.file : f;
    });
    setUndo({ level, index });
    onSelectKey(next !== undefined ? levelKey(next.id) : buildingKey(file.id));
  }

  function undoDelete() {
    if (undo === null) return;
    const { level, index } = undo;
    void update((f) => restoreLevel(f, level, index));
    setUndo(null);
    onSelectKey(levelKey(level.id));
  }

  const extras = (
    <>
      {undo !== null && (
        <p role="status" data-testid="level-undo" className="mep-hint mep-level-undo">
          {`Deleted level "${undo.level.name}". `}
          <button type="button" onClick={undoDelete}>
            Undo
          </button>
        </p>
      )}
      {levelWarnings(file).map((warning) => (
        <p key={warning} className="mep-hint mep-buildings-message">
          {warning}
        </p>
      ))}
    </>
  );

  if (selectedLevel === null) {
    return (
      <BuildingSection
        testId="selection-summary"
        kind="Building"
        title={file.name}
        aside={`${countLabel(file.levels.length, 'level')}, ${countLabel(file.sheets.length, 'sheet')}`}
      >
        <div className="mep-level-field">
          <span>Name</span>
          <BuildingNameEditor
            testId="building-name-pane"
            name={file.name}
            onRename={(name) => void update((f) => renameBuilding(f, name))}
          />
        </div>
        {file.levels.length === 0 && <p className="mep-hint">No levels yet. Use + Add level.</p>}
        {buildingWarningLines.length > 0 ? (
          buildingWarningLines.map((line) => (
            <p key={line} className="mep-hint mep-buildings-message">
              {line}
            </p>
          ))
        ) : (
          <p className="mep-hint">No warnings.</p>
        )}
        {extras}
      </BuildingSection>
    );
  }

  return (
    <BuildingSection
      testId="selection-summary"
      kind="Level"
      title={selectedLevel.name}
      aside={countLabel(sheetCount(file, selectedLevel.id), 'sheet')}
    >
      <div key={selectedLevel.id} className="mep-level-detail" data-testid="level-row">
        <div className="mep-level-fields">
          <label className="mep-level-field mep-level-field--name">
            <span>Name</span>
            <LevelNameInput
              name={selectedLevel.name}
              onRename={(name) => void update((f) => renameLevel(f, selectedLevel.id, name))}
              focusRequested={focusNameLevelId === selectedLevel.id}
              onFocused={onNameFocused}
            />
          </label>
          <label className="mep-level-field mep-level-field--elevation">
            <span>Elevation</span>
            <span className="mep-level-elevation">
              <LevelElevationInput
                value={selectedLevel.elevationMm}
                onCommit={(value) => void update((f) => setLevelElevation(f, selectedLevel.id, value))}
              />
              <span>mm</span>
            </span>
          </label>
          <div className="mep-level-delete">
            <button
              type="button"
              aria-disabled={deleteBlocked !== null}
              aria-describedby={deleteBlocked !== null ? 'mep-level-delete-reason' : undefined}
              title={deleteBlocked ?? 'Delete level'}
              onClick={() => deleteAt(selectedLevel, selectedIndex)}
            >
              Delete
            </button>
          </div>
        </div>
        {deleteBlocked !== null && (
          <p id="mep-level-delete-reason" className="mep-hint" data-testid="delete-reason">
            {deleteBlocked}
          </p>
        )}
      </div>
      {levelHasWarning && <p className="mep-hint mep-buildings-message">A sheet of this level has a missing PDF or no access.</p>}
      {extras}
    </BuildingSection>
  );
}

interface LevelNameInputProps {
  name: string;
  onRename: (name: string) => void;
  /** True when the field takes the focus and selects its text. */
  focusRequested: boolean;
  onFocused: () => void;
}

/** Keeps the typed text in a draft until blur or Enter. Escape drops the draft; a blank draft keeps the saved name. */
function LevelNameInput({ name, onRename, focusRequested, onFocused }: LevelNameInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!focusRequested) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    onFocused();
  }, [focusRequested]);

  function commit() {
    if (draft === null) return;
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed !== '' && trimmed !== name) onRename(trimmed);
  }

  return (
    <input
      ref={inputRef}
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
