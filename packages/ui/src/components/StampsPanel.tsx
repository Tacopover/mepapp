import type { RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { STAMP_LIBRARY, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from '../disciplineGroups.js';

export interface StampsPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  disciplineGroup: DisciplineGroup | null;
  activeDefinitionId: string | null;
  onPick: (definition: StampDefinition) => void;
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

export function StampsPanel({ sceneRef, disciplineGroup, activeDefinitionId, onPick, resolveIconUrl }: StampsPanelProps) {
  const definitions =
    disciplineGroup === null ? STAMP_LIBRARY : STAMP_LIBRARY.filter((def) => disciplineGroupOf(def.discipline) === disciplineGroup);

  async function handlePick(definition: StampDefinition) {
    const bitmap = await loadBitmap(resolveIconUrl(definition.iconRef));
    sceneRef.current?.setStampTexture(bitmap, definition.id);
    sceneRef.current?.setTool('place-stamp');
    onPick(definition);
  }

  if (definitions.length === 0) {
    return <div className="mep-empty-panel">No stamp art available yet for this discipline.</div>;
  }

  return (
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
    </div>
  );
}
