import { useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { NETWORK_TYPE_LIBRARY, STAMP_LIBRARY, type NetworkType, type StampCategory, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from '../disciplineGroups.js';
import { DisciplineSwitcher } from './DisciplineSwitcher.js';
import { IconFile, IconPencil } from '../icons.js';
import { loadStampBitmap } from '../stampBitmap.js';

export interface StampsPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  disciplineGroup: DisciplineGroup | null;
  onChangeDisciplineGroup: (value: DisciplineGroup | null) => void;
  activeDefinitionId: string | null;
  onPick: (definition: StampDefinition) => void;
  onCustomStampFile: (file: File, category: StampCategory) => void;
  /** The active document's user-authored elements (Element Editor dialog) — shown in the grid alongside STAMP_LIBRARY. */
  customStampDefinitions: StampDefinition[];
  onCreateCustomElement: () => void;
  /** Resolves a StampDefinition's iconRef to a fetchable URL — apps/web owns where stamp art actually lives. A custom definition's iconRef is already a self-contained `data:` URL (see stamp-library.ts's StampDefinition doc comment) and is used as-is, never passed through this. */
  resolveIconUrl: (iconRef: string) => string;
  /** The active document's own network types — only ones actually picked at least once get an entry here (see SketchScene.setActiveNetworkType). Everything else falls back to NETWORK_TYPE_LIBRARY's default name. */
  networkTypes: NetworkType[];
  activeNetworkTypeId: string | null;
  onPickNetworkType: (type: NetworkType) => void;
  onRenameNetworkType: (id: string, name: string) => void;
  /** Opens the Network Type Editor dialog (visuals: color/thickness/pattern) for an adopted type — see App.tsx's networkTypeEditorTarget. */
  onEditNetworkTypeVisuals: (type: NetworkType) => void;
}

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

/** A custom definition's iconRef is already a self-contained `data:` URL — resolve library entries through resolveIconUrl, but use a custom one verbatim. */
function iconUrlFor(definition: StampDefinition, resolveIconUrl: (iconRef: string) => string): string {
  return definition.iconRef.startsWith('data:') ? definition.iconRef : resolveIconUrl(definition.iconRef);
}

function loadBitmap(url: string, definition: StampDefinition): Promise<ImageBitmap> {
  let cached = bitmapCache.get(url);
  if (!cached) {
    cached = fetch(url)
      .then((res) => res.blob())
      .then((blob) => loadStampBitmap(blob, { widthPt: definition.nativeWidth, heightPt: definition.nativeHeight }));
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
  customStampDefinitions,
  onCreateCustomElement,
  resolveIconUrl,
  networkTypes,
  activeNetworkTypeId,
  onPickNetworkType,
  onRenameNetworkType,
  onEditNetworkTypeVisuals,
}: StampsPanelProps) {
  const allDefinitions = [...STAMP_LIBRARY, ...customStampDefinitions];
  const definitions =
    disciplineGroup === null ? allDefinitions : allDefinitions.filter((def) => disciplineGroupOf(def.discipline) === disciplineGroup);
  const networkTypeDefs =
    disciplineGroup === null ? NETWORK_TYPE_LIBRARY : NETWORK_TYPE_LIBRARY.filter((t) => disciplineGroupOf(t.discipline) === disciplineGroup);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [subTab, setSubTab] = useState<'stamps' | 'networkTypes'>('stamps');

  async function handlePick(definition: StampDefinition) {
    const bitmap = await loadBitmap(iconUrlFor(definition, resolveIconUrl), definition);
    sceneRef.current?.setStampTexture(bitmap, definition.id);
    sceneRef.current?.setTool(definition.category === 'equipment' ? 'place-equipment' : 'place-terminal');
    onPick(definition);
  }

  function startEditing(type: NetworkType) {
    setEditingId(type.id);
    setEditValue(type.name);
  }

  function commitEditing() {
    if (editingId && editValue.trim()) onRenameNetworkType(editingId, editValue.trim());
    setEditingId(null);
  }

  return (
    <div>
      <div className="mep-stamps-subtabs" role="tablist" aria-label="Stamps panel section">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'stamps'}
          className={`mep-stamps-subtab-btn${subTab === 'stamps' ? ' on' : ''}`}
          onClick={() => setSubTab('stamps')}
        >
          Stamps
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'networkTypes'}
          className={`mep-stamps-subtab-btn${subTab === 'networkTypes' ? ' on' : ''}`}
          onClick={() => setSubTab('networkTypes')}
        >
          Network Types
        </button>
      </div>
      <div className="mep-stamps-filter">
        <DisciplineSwitcher value={disciplineGroup} onChange={onChangeDisciplineGroup} />
      </div>

      {subTab === 'stamps' ? (
        <>
          {definitions.length === 0 && <div className="mep-empty-panel">No stamp art available yet for this discipline.</div>}
          <div className="mep-stamp-grid">
            {definitions.map((definition) => (
              <button
                key={definition.id}
                type="button"
                className={`mep-stamp-tile${activeDefinitionId === definition.id ? ' active' : ''}`}
                onClick={() => void handlePick(definition)}
              >
                <img src={iconUrlFor(definition, resolveIconUrl)} alt="" />
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
            <button type="button" className="mep-stamp-tile" onClick={onCreateCustomElement}>
              <IconPencil size={20} />
              Create custom element…
            </button>
          </div>
        </>
      ) : (
        <>
          {networkTypeDefs.length === 0 && <div className="mep-empty-panel">No network types for this discipline.</div>}
          <div className="mep-networktype-grid">
            {networkTypeDefs.map((libType) => {
              const live = networkTypes.find((t) => t.id === libType.id);
              const effective = live ?? libType;
              const isAdopted = live !== undefined;
              const isActive = activeNetworkTypeId === libType.id;
              const isEditing = editingId === libType.id;
              return (
                <div
                  key={libType.id}
                  className={`mep-networktype-tile mep-discipline-${disciplineGroupOf(libType.discipline)}${isActive ? ' active' : ''}`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      className="mep-networktype-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEditing}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEditing();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="mep-networktype-pick" onClick={() => onPickNetworkType(effective)}>
                      <span className="mep-networktype-name">{effective.name}</span>
                      {effective.units && <span className="mep-networktype-units">{effective.units}</span>}
                    </button>
                  )}
                  {isAdopted && !isEditing && (
                    <>
                      <button
                        type="button"
                        className="mep-networktype-visuals"
                        title="Edit visuals"
                        style={{ backgroundColor: effective.color }}
                        onClick={() => onEditNetworkTypeVisuals(effective)}
                      />
                      <button
                        type="button"
                        className="mep-networktype-edit"
                        title="Rename"
                        onClick={() => startEditing(effective)}
                      >
                        <IconPencil size={12} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
