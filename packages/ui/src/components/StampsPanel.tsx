import type { RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { STAMP_LIBRARY, type StampCategory, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from '../disciplineGroups.js';
import { DisciplineSwitcher } from './DisciplineSwitcher.js';
import { IconFile } from '../icons.js';

export interface StampsPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  disciplineGroup: DisciplineGroup | null;
  onChangeDisciplineGroup: (value: DisciplineGroup | null) => void;
  activeDefinitionId: string | null;
  onPick: (definition: StampDefinition) => void;
  onCustomStampFile: (file: File, category: StampCategory) => void;
  /** Resolves a StampDefinition's iconRef to a fetchable URL — apps/web owns where stamp art actually lives. */
  resolveIconUrl: (iconRef: string) => string;
}

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

function loadBitmap(url: string): Promise<ImageBitmap> {
  let cached = bitmapCache.get(url);
  if (!cached) {
    cached = fetch(url)
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob));
    bitmapCache.set(url, cached);
  }
  return cached;
}

export function StampsPanel({
  sceneRef,
  disciplineGroup,
  onChangeDisciplineGroup,
  activeDefinitionId,
  onPick,
  onCustomStampFile,
  resolveIconUrl,
}: StampsPanelProps) {
  const definitions =
    disciplineGroup === null ? STAMP_LIBRARY : STAMP_LIBRARY.filter((def) => disciplineGroupOf(def.discipline) === disciplineGroup);

  async function handlePick(definition: StampDefinition) {
    const bitmap = await loadBitmap(resolveIconUrl(definition.iconRef));
    sceneRef.current?.setStampTexture(bitmap, definition.id);
    sceneRef.current?.setTool(definition.category === 'equipment' ? 'place-equipment' : 'place-terminal');
    onPick(definition);
  }

  return (
    <div>
      <div className="mep-stamps-filter">
        <DisciplineSwitcher value={disciplineGroup} onChange={onChangeDisciplineGroup} />
      </div>
      {definitions.length === 0 && <div className="mep-empty-panel">No stamp art available yet for this discipline.</div>}
      <div className="mep-stamp-grid">
        {definitions.map((definition) => (
          <button
            key={definition.id}
            type="button"
            className={`mep-stamp-tile${activeDefinitionId === definition.id ? ' active' : ''}`}
            onClick={() => void handlePick(definition)}
          >
            <img src={resolveIconUrl(definition.iconRef)} alt="" />
            {definition.label}
          </button>
        ))}
        <label className="mep-stamp-tile mep-file-btn">
          <IconFile size={20} />
          Custom terminal…
          <input
            type="file"
            accept="image/png,image/svg+xml"
            onChange={(e) => e.target.files?.[0] && onCustomStampFile(e.target.files[0], 'terminal')}
          />
        </label>
        <label className="mep-stamp-tile mep-file-btn">
          <IconFile size={20} />
          Custom equipment…
          <input
            type="file"
            accept="image/png,image/svg+xml"
            onChange={(e) => e.target.files?.[0] && onCustomStampFile(e.target.files[0], 'equipment')}
          />
        </label>
      </div>
    </div>
  );
}
