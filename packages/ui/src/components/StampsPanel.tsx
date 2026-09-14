import { useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { NETWORK_TYPE_LIBRARY, STAMP_LIBRARY, type NetworkType, type StampCategory, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from '../disciplineGroups.js';
import { DisciplineSwitcher } from './DisciplineSwitcher.js';
import { LanguageToggle, type StampLabelLanguage } from './LanguageToggle.js';
import { CategorySwitcher, type StampCategoryFilter } from './CategorySwitcher.js';
import { IconFile, IconPencil } from '../icons.js';
import { loadStampBitmap } from '../stampBitmap.js';
import { getStampAppearanceDefault } from '../stampAppearanceDefaults.js';

export interface StampsPanelProps {
  sceneRef: RefObject<SketchScene | null>;
  disciplineGroup: DisciplineGroup | null;
  onChangeDisciplineGroup: (value: DisciplineGroup | null) => void;
  labelLanguage: StampLabelLanguage;
  onChangeLabelLanguage: (value: StampLabelLanguage) => void;
  activeDefinitionId: string | null;
  onPick: (definition: StampDefinition) => void;
  onCustomStampFile: (file: File, category: StampCategory) => void;
  /** The active document's user-authored elements (Element Editor dialog) — shown in the grid alongside STAMP_LIBRARY. */
  customStampDefinitions: StampDefinition[];
  onCreateCustomElement: () => void;
  /** Opens the Element Editor pre-filled from a library stamp (source: 'library') so the user can save it as their own editable custom stamp — see App.tsx's handleDuplicateStampDefinition. Never offered for an already-custom definition; those get "Edit ports…" from a placed instance's Properties panel instead. */
  onDuplicateStampDefinition: (definition: StampDefinition) => void;
  /** Resolves a StampDefinition's iconRef to a fetchable URL — apps/web owns where stamp art actually lives. A custom definition's iconRef is already a self-contained `data:` URL (see stamp-library.ts's StampDefinition doc comment) and is used as-is, never passed through this. */
  resolveIconUrl: (iconRef: string) => string;
  /** The active document's own network types — only ones actually picked at least once get an entry here (see SketchScene.setActiveNetworkType). Everything else falls back to NETWORK_TYPE_LIBRARY's default name. */
  networkTypes: NetworkType[];
  activeNetworkTypeId: string | null;
  onPickNetworkType: (type: NetworkType) => void;
  /** Opens the Network Type Editor dialog (name, color/thickness/pattern) for an adopted type — see App.tsx's networkTypeEditorTarget. */
  onEditNetworkType: (type: NetworkType) => void;
}

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

/** Matches @mepapp/render document.ts's DEFAULT_NETWORK_TYPE.id — an internal fallback for old/corrupt data, never a pickable tile. */
const UNASSIGNED_NETWORK_TYPE_ID = 'default';

/** A custom definition's iconRef is already a self-contained `data:` URL — resolve library entries through resolveIconUrl, but use a custom one verbatim. */
function iconUrlFor(definition: StampDefinition, resolveIconUrl: (iconRef: string) => string): string {
  return definition.iconRef.startsWith('data:') ? definition.iconRef : resolveIconUrl(definition.iconRef);
}

/** definition.labelNl when NL is active and a translation exists (fixture-generated entries only) — a custom stamp's fixed label always shows as-is regardless of the toggle. */
export function stampLabelFor(definition: StampDefinition, language: StampLabelLanguage): string {
  return language === 'nl' && definition.labelNl ? definition.labelNl : definition.label;
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
  labelLanguage,
  onChangeLabelLanguage,
  activeDefinitionId,
  onPick,
  onCustomStampFile,
  customStampDefinitions,
  onCreateCustomElement,
  onDuplicateStampDefinition,
  resolveIconUrl,
  networkTypes,
  activeNetworkTypeId,
  onPickNetworkType,
  onEditNetworkType,
}: StampsPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<StampCategoryFilter>('terminal');
  const [searchQuery, setSearchQuery] = useState('');

  const allDefinitions = [...STAMP_LIBRARY, ...customStampDefinitions];
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const definitions = allDefinitions
    .filter((def) => disciplineGroup === null || disciplineGroupOf(def.discipline) === disciplineGroup)
    .filter((def) => def.category === categoryFilter)
    .filter((def) => trimmedQuery === '' || stampLabelFor(def, labelLanguage).toLowerCase().includes(trimmedQuery));
  const networkTypeDefs =
    disciplineGroup === null ? NETWORK_TYPE_LIBRARY : NETWORK_TYPE_LIBRARY.filter((t) => disciplineGroupOf(t.discipline) === disciplineGroup);
  // Duplicated network types (SketchScene.duplicateNetworkType) get a fresh id
  // that's never in the static library — without this they'd be adopted into
  // the document but have no tile to pick/edit them from.
  const customNetworkTypes = networkTypes.filter(
    (t) => t.id !== UNASSIGNED_NETWORK_TYPE_ID && !NETWORK_TYPE_LIBRARY.some((lib) => lib.id === t.id),
  );
  const visibleCustomNetworkTypes =
    disciplineGroup === null ? customNetworkTypes : customNetworkTypes.filter((t) => disciplineGroupOf(t.discipline) === disciplineGroup);

  const [subTab, setSubTab] = useState<'stamps' | 'networkTypes'>('stamps');

  async function handlePick(definition: StampDefinition) {
    const bitmap = await loadBitmap(iconUrlFor(definition, resolveIconUrl), definition);
    sceneRef.current?.setStampTexture(bitmap, definition.id, getStampAppearanceDefault(definition.id));
    sceneRef.current?.setTool(definition.category === 'equipment' ? 'place-equipment' : 'place-terminal');
    onPick(definition);
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
        {subTab === 'stamps' && (
          <div className="mep-stamps-filter-row2">
            <CategorySwitcher value={categoryFilter} onChange={setCategoryFilter} />
            <LanguageToggle value={labelLanguage} onChange={onChangeLabelLanguage} />
            <input
              type="search"
              className="mep-stamp-search"
              placeholder="Search…"
              aria-label="Search stamps"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {subTab === 'stamps' ? (
        <>
          {definitions.length === 0 && (
            <div className="mep-empty-panel">{trimmedQuery === '' ? 'No stamp art available yet for this discipline.' : `No stamps match "${searchQuery.trim()}".`}</div>
          )}
          <div className="mep-stamp-grid">
            {definitions.map((definition) => (
              <div key={definition.id} className="mep-stamp-tile-wrap">
                <button
                  type="button"
                  className={`mep-stamp-tile${activeDefinitionId === definition.id ? ' active' : ''}`}
                  onClick={() => void handlePick(definition)}
                >
                  <img src={iconUrlFor(definition, resolveIconUrl)} alt="" />
                  {stampLabelFor(definition, labelLanguage)}
                </button>
                {definition.source === 'library' && (
                  <button
                    type="button"
                    className="mep-stamp-tile-duplicate"
                    title="Edit stamp…"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateStampDefinition(definition);
                    }}
                  >
                    <IconPencil size={12} />
                  </button>
                )}
              </div>
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
          {networkTypeDefs.length === 0 && visibleCustomNetworkTypes.length === 0 && (
            <div className="mep-empty-panel">No network types for this discipline.</div>
          )}
          <div className="mep-networktype-grid">
            {[...networkTypeDefs, ...visibleCustomNetworkTypes].map((libType) => {
              const live = networkTypes.find((t) => t.id === libType.id);
              const effective = live ?? libType;
              const isActive = activeNetworkTypeId === libType.id;
              return (
                <div
                  key={libType.id}
                  className={`mep-networktype-tile mep-discipline-${disciplineGroupOf(libType.discipline)}${isActive ? ' active' : ''}`}
                >
                  <button type="button" className="mep-networktype-pick" onClick={() => onPickNetworkType(effective)}>
                    <span className="mep-networktype-name">{effective.name}</span>
                    {effective.units && <span className="mep-networktype-units">{effective.units}</span>}
                  </button>
                  <button
                    type="button"
                    className="mep-networktype-visuals"
                    title="Edit"
                    style={{ backgroundColor: effective.color }}
                    onClick={() => onEditNetworkType(effective)}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
