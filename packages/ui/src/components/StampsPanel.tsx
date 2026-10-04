import { useEffect, useState, type MouseEvent, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { isLibraryStampId, NETWORK_TYPE_LIBRARY, type NetworkType, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from '../disciplineGroups.js';
import { DisciplineSwitcher } from './DisciplineSwitcher.js';
import { LanguageToggle, type StampLabelLanguage } from './LanguageToggle.js';
import { CategorySwitcher, type StampCategoryFilter } from './CategorySwitcher.js';
import { IconFolder, IconPencil, IconPlus, IconTrash, IconUndo } from '../icons.js';
import { loadDefinitionBitmap } from '../stampBitmap.js';
import { getStampAppearanceDefault } from '../stampAppearanceDefaults.js';
import { getVisibleStampDefinitions, stampLabelFor } from '../stampVisibility.js';

export { getVisibleStampDefinitions, stampLabelFor };

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
  /** The stamps from the user's library folders (source: 'user'), with `blob:` iconRefs — merged into the grid; a project copy with the same id is hidden (see getVisibleStampDefinitions). */
  userStampDefinitions: StampDefinition[];
  /** Ids of user stamps whose file is no longer in its folder — their tile gets a warning marker; the stamp still works from the stored copy. */
  missingUserStampIds: ReadonlySet<string>;
  /** False in a browser with no directory picker (Firefox, Safari) — hides the "Load custom …" tile; the "Library folders…" dialog then explains why. */
  userLibraryAvailable: boolean;
  /** Starts loading a folder of stamp art for the shown category — App.tsx's handleLoadUserFolder opens the folder picker inside this click. */
  onLoadUserFolder: (category: StampCategoryFilter) => void;
  /** Opens the "Library folders" dialog (list, sync and remove the user's stamp folders). */
  onOpenLibraryFolders: () => void;
  /** Reads a user stamp back from the library store with a `data:` URL, for placing — see useUserStampLibrary's materialize. */
  materializeUserStamp: (id: string) => Promise<StampDefinition | undefined>;
  /** False hides the built-in MepApp stamps (the setting in the user library dialogs). */
  showBuiltIn: boolean;
  /** Ids of every library record, hidden ones included — the grid skips project copies with these ids. */
  libraryRecordIds: ReadonlySet<string>;
  /** Ids of user stamps in the "Saved stamps" source: their delete button removes them for good instead of hiding them. */
  savedUserStampIds: ReadonlySet<string>;
  /** Opens the Element Editor for a user-library stamp — see App.tsx's handleEditUserStamp. */
  onEditUserStamp: (definitionId: string) => void;
  /** Hides a folder stamp or deletes a saved stamp (App.tsx decides by the record's source). */
  onDeleteUserStamp: (definition: StampDefinition) => void;
  /** Hides, deletes or reverts all the given selectable stamps after one confirmation — see App.tsx's handleBulkDelete. Resolves true when the action ran, so the panel ends its selection mode; false when the user cancelled. */
  onBulkDelete: (definitions: StampDefinition[]) => Promise<boolean>;
}

/** Which delete button a tile shows: 'user' a stamp from the user library, 'orphan' a project copy of a user stamp whose record is gone, 'custom' a project stamp (delete, or revert for an edited built-in). Null for a built-in stamp, which has no delete button and cannot be selected. */
function deleteKindOf(definition: StampDefinition, userStampIds: ReadonlySet<string>): 'user' | 'orphan' | 'custom' | null {
  if (definition.source === 'user') return userStampIds.has(definition.id) ? 'user' : 'orphan';
  if (definition.source === 'custom') return 'custom';
  return null;
}

const bitmapCache = new Map<string, Promise<ImageBitmap>>();

/** Matches @mepapp/render document.ts's DEFAULT_NETWORK_TYPE.id — an internal fallback for old/corrupt data, never a pickable tile. */
const UNASSIGNED_NETWORK_TYPE_ID = 'default';

/** A custom definition's iconRef is already a self-contained `data:` (or, for user-library stamps, `blob:`) URL — resolve library entries through resolveIconUrl, but use a custom one verbatim. */
function iconUrlFor(definition: StampDefinition, resolveIconUrl: (iconRef: string) => string): string {
  return definition.iconRef.startsWith('data:') || definition.iconRef.startsWith('blob:') ? definition.iconRef : resolveIconUrl(definition.iconRef);
}

function loadBitmap(url: string, definition: StampDefinition): Promise<ImageBitmap> {
  let cached = bitmapCache.get(url);
  if (!cached) {
    // Keyed by the resolved icon URL, not definition.id — an edited (overridden) library stamp
    // keeps its library id but gets a fresh iconRef data: URL on every save (see
    // ElementEditorDialog's buildDefinition), so this key still busts the cache correctly even
    // though loadDefinitionBitmap below renders from `shapes`, not from this URL, whenever shapes exist.
    cached = loadDefinitionBitmap(definition, () => fetch(url).then((res) => res.blob()));
    bitmapCache.set(url, cached);
  }
  return cached;
}

/** Loads the definition's art, arms the scene's placement tool, and reports the pick (a user-library stamp is materialized first, so placing it copies it into the project) — shared between the grid's own tile click and the left rail's Stamp-button auto-pick fallback. */
export async function pickStampDefinition(
  sceneRef: RefObject<SketchScene | null>,
  definition: StampDefinition,
  resolveIconUrl: (iconRef: string) => string,
  onPick: (definition: StampDefinition) => void,
  materialize?: (id: string) => Promise<StampDefinition | undefined>,
): Promise<void> {
  let adopt: StampDefinition | undefined;
  if (definition.source === 'user' && materialize) {
    // The project copy needs the ports and a data: URL, so a stamp that cannot be materialized is not armed (it would place with no ports).
    adopt = await materialize(definition.id);
    if (!adopt) {
      console.warn(`[mepapp] could not read the library stamp "${definition.id}"; it is not armed.`);
      return;
    }
  }
  const bitmap = await loadBitmap(iconUrlFor(definition, resolveIconUrl), definition);
  sceneRef.current?.setStampTexture(bitmap, definition.id, getStampAppearanceDefault(definition.id), adopt);
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
  userStampDefinitions,
  missingUserStampIds,
  userLibraryAvailable,
  onLoadUserFolder,
  onOpenLibraryFolders,
  materializeUserStamp,
  showBuiltIn,
  libraryRecordIds,
  savedUserStampIds,
  onEditUserStamp,
  onDeleteUserStamp,
  onBulkDelete,
}: StampsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Sorted by displayed label rather than left in library-then-custom-append-order, so a newly
  // created/duplicated custom element lands in its correct alphabetical spot immediately instead
  // of always trailing at the bottom of the grid.
  const definitions = getVisibleStampDefinitions(customStampDefinitions, disciplineGroup, categoryFilter, labelLanguage, searchQuery, userStampDefinitions, {
    showBuiltIn,
    libraryRecordIds,
  });
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

  const userStampIds = new Set(userStampDefinitions.map((u) => u.id));
  const [subTab, setSubTab] = useState<'stamps' | 'networkTypes'>('stamps');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelectable = (definition: StampDefinition) => deleteKindOf(definition, userStampIds) !== null;
  const visibleSelected = definitions.filter((d) => selectedIds.has(d.id) && isSelectable(d));

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    if (!selectionMode) return;
    // Capture phase on window, so this Escape only ends the selection and does not reach the scene's window-level Escape handler (which would also drop the armed stamp tool).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      exitSelection();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [selectionMode]);

  function handleTileClick(event: MouseEvent, definition: StampDefinition) {
    const selectable = isSelectable(definition);
    if ((event.ctrlKey || event.metaKey) && selectable) {
      if (selectionMode) {
        toggleSelected(definition.id);
        return;
      }
      const initial = new Set([definition.id]);
      const active = definitions.find((d) => d.id === activeDefinitionId);
      if (active && isSelectable(active)) initial.add(active.id);
      setSelectedIds(initial);
      setSelectionMode(true);
      return;
    }
    if (selectionMode) {
      if (selectable) toggleSelected(definition.id);
      return;
    }
    void handlePick(definition);
  }

  async function handleDeleteSelected() {
    if (await onBulkDelete(visibleSelected)) exitSelection();
  }

  async function handlePick(definition: StampDefinition) {
    await pickStampDefinition(sceneRef, definition, resolveIconUrl, onPick, materializeUserStamp);
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
          onClick={() => {
            exitSelection();
            setSubTab('networkTypes');
          }}
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
            <button type="button" className="mep-toggle-btn" title="Load user library" aria-label="Load user library" onClick={onOpenLibraryFolders}>
              <IconFolder size={14} />
            </button>
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
          {selectionMode && (
            <div className="mep-stamp-select-bar">
              <span>{visibleSelected.length} selected</span>
              <button type="button" className="mep-toggle-btn" disabled={visibleSelected.length === 0} onClick={() => void handleDeleteSelected()}>
                Delete
              </button>
              <button type="button" className="mep-toggle-btn" onClick={exitSelection}>
                Cancel
              </button>
            </div>
          )}
          <div className="mep-stamp-grid">
            {definitions.map((definition) => {
              const kind = deleteKindOf(definition, userStampIds);
              const selectable = kind !== null;
              const checked = selectedIds.has(definition.id);
              const label = stampLabelFor(definition, labelLanguage);
              return (
              <div key={definition.id} className="mep-stamp-tile-wrap">
                <button
                  type="button"
                  className={`mep-stamp-tile${activeDefinitionId === definition.id ? ' active' : ''}${selectionMode && selectable && checked ? ' selected' : ''}${selectionMode && !selectable ? ' mep-stamp-tile--dimmed' : ''}`}
                  onClick={(e) => handleTileClick(e, definition)}
                >
                  <img src={iconUrlFor(definition, resolveIconUrl)} alt="" />
                  {label}
                </button>
                {selectionMode && selectable && (
                  <input
                    type="checkbox"
                    className="mep-stamp-tile-check"
                    checked={checked}
                    aria-label={`Select ${label}`}
                    onChange={() => toggleSelected(definition.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {kind === 'user' && (
                  <span className="mep-stamp-tile-badge" title="From your library folder">
                    user
                    {missingUserStampIds.has(definition.id) && (
                      <span className="mep-stamp-tile-warning" title="The file is no longer in the folder. The stamp still works.">
                        {' '}
                        !
                      </span>
                    )}
                  </span>
                )}
                {!selectionMode && kind === 'user' && (
                  <>
                    <button
                      type="button"
                      className="mep-stamp-tile-duplicate"
                      title="Edit stamp…"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditUserStamp(definition.id);
                      }}
                    >
                      <IconPencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="mep-stamp-tile-delete"
                      title={savedUserStampIds.has(definition.id) ? 'Delete stamp…' : 'Hide stamp…'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteUserStamp(definition);
                      }}
                    >
                      <IconTrash size={12} />
                    </button>
                  </>
                )}
                {!selectionMode && kind === 'orphan' && (
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
                )}
                {!selectionMode && definition.source === 'library' && (
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
                {!selectionMode && kind === 'custom' && (
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
                      title={isLibraryStampId(definition.id) ? 'Revert to library…' : 'Delete stamp…'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustomStampDefinition(definition);
                      }}
                    >
                      {isLibraryStampId(definition.id) ? <IconUndo size={12} /> : <IconTrash size={12} />}
                    </button>
                  </>
                )}
              </div>
              );
            })}
            <button type="button" className="mep-stamp-tile" onClick={onCreateCustomElement}>
              <IconPencil size={20} />
              Create custom element…
            </button>
            {userLibraryAvailable && (
              <button type="button" className="mep-stamp-tile" onClick={() => onLoadUserFolder(categoryFilter)}>
                <IconPlus size={20} />
                {categoryFilter === 'equipment' ? 'Load custom equipment…' : 'Load custom terminals…'}
              </button>
            )}
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
