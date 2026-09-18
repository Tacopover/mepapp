import { useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { NETWORK_TYPE_LIBRARY, STAMP_LIBRARY, type NetworkType, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from '../disciplineGroups.js';
import { DisciplineSwitcher } from './DisciplineSwitcher.js';
import { LanguageToggle, type StampLabelLanguage } from './LanguageToggle.js';
import { CategorySwitcher, type StampCategoryFilter } from './CategorySwitcher.js';
import { IconPencil, IconTrash } from '../icons.js';
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
  categoryFilter: StampCategoryFilter;
  onChangeCategoryFilter: (value: StampCategoryFilter) => void;
  /** The active document's user-authored elements (Element Editor dialog) — shown in the grid alongside STAMP_LIBRARY. */
  customStampDefinitions: StampDefinition[];
  onCreateCustomElement: () => void;
  /** Opens the Element Editor pre-filled from a library stamp (source: 'library') so the user can save it as their own editable custom stamp — see App.tsx's handleDuplicateStampDefinition. Only offered for a library definition; an already-custom one gets onEditCustomStampDefinition below instead. */
  onDuplicateStampDefinition: (definition: StampDefinition) => void;
  /** Opens the Element Editor in true edit-in-place mode for an already-custom definition — same target shape as "Edit ports…" from a placed instance's Properties panel (see App.tsx's elementEditorTarget), just reachable straight from the Stamps tab instead of requiring a placed instance first. */
  onEditCustomStampDefinition: (definitionId: string) => void;
  /** Removes a custom definition from the active document's palette — see App.tsx's handleDeleteCustomStampDefinition for the confirmation prompt. Never offered for a library definition; those are read-only and not stored per-document. */
  onDeleteCustomStampDefinition: (definition: StampDefinition) => void;
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

/** The same library+custom, discipline/category/search-filtered, label-sorted list the grid below renders — shared so the left rail's Stamp button can auto-pick "the first stamp shown here" without duplicating this logic (see App.tsx's handlePickDefaultStamp). */
export function getVisibleStampDefinitions(
  customStampDefinitions: StampDefinition[],
  disciplineGroup: DisciplineGroup | null,
  categoryFilter: StampCategoryFilter,
  labelLanguage: StampLabelLanguage,
  searchQuery = '',
): StampDefinition[] {
  const shadowedLibraryIds = new Set(
    STAMP_LIBRARY.filter((lib) =>
      customStampDefinitions.some((c) => {
        const label = c.label.trim().toLowerCase();
        return label === lib.label.toLowerCase() || (!!lib.labelNl && label === lib.labelNl.toLowerCase());
      }),
    ).map((lib) => lib.id),
  );
  const allDefinitions = [...STAMP_LIBRARY.filter((lib) => !shadowedLibraryIds.has(lib.id)), ...customStampDefinitions];
  const trimmedQuery = searchQuery.trim().toLowerCase();
  return allDefinitions
    .filter((def) => disciplineGroup === null || disciplineGroupOf(def.discipline) === disciplineGroup)
    .filter((def) => def.category === categoryFilter)
    .filter((def) => trimmedQuery === '' || stampLabelFor(def, labelLanguage).toLowerCase().includes(trimmedQuery))
    .sort((a, b) => stampLabelFor(a, labelLanguage).localeCompare(stampLabelFor(b, labelLanguage)));
}

/** Loads the definition's art, arms the scene's placement tool, and reports the pick — shared between the grid's own tile click and the left rail's Stamp-button auto-pick fallback. */
export async function pickStampDefinition(
  sceneRef: RefObject<SketchScene | null>,
  definition: StampDefinition,
  resolveIconUrl: (iconRef: string) => string,
  onPick: (definition: StampDefinition) => void,
): Promise<void> {
  const bitmap = await loadBitmap(iconUrlFor(definition, resolveIconUrl), definition);
  sceneRef.current?.setStampTexture(bitmap, definition.id, getStampAppearanceDefault(definition.id));
  sceneRef.current?.setTool(definition.category === 'equipment' ? 'place-equipment' : 'place-terminal');
  onPick(definition);
}

export function StampsPanel({
  sceneRef,
  disciplineGroup,
  onChangeDisciplineGroup,
  labelLanguage,
  onChangeLabelLanguage,
  activeDefinitionId,
  onPick,
  categoryFilter,
  onChangeCategoryFilter,
  customStampDefinitions,
  onCreateCustomElement,
  onDuplicateStampDefinition,
  onEditCustomStampDefinition,
  onDeleteCustomStampDefinition,
  resolveIconUrl,
  networkTypes,
  activeNetworkTypeId,
  onPickNetworkType,
  onEditNetworkType,
}: StampsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Sorted by displayed label rather than left in library-then-custom-append-order, so a newly
  // created/duplicated custom element lands in its correct alphabetical spot immediately instead
  // of always trailing at the bottom of the grid.
  const definitions = getVisibleStampDefinitions(customStampDefinitions, disciplineGroup, categoryFilter, labelLanguage, searchQuery);
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
    await pickStampDefinition(sceneRef, definition, resolveIconUrl, onPick);
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
            <CategorySwitcher value={categoryFilter} onChange={onChangeCategoryFilter} />
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
            <div className="mep-empty-panel">{searchQuery.trim() === '' ? 'No stamp art available yet for this discipline.' : `No stamps match "${searchQuery.trim()}".`}</div>
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
                {definition.source === 'custom' && (
                  <>
                    <button
                      type="button"
                      className="mep-stamp-tile-duplicate"
                      title="Edit stamp…"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCustomStampDefinition(definition.id);
                      }}
                    >
                      <IconPencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="mep-stamp-tile-delete"
                      title="Delete stamp…"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustomStampDefinition(definition);
                      }}
                    >
                      <IconTrash size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
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
