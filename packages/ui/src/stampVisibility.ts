import { STAMP_LIBRARY, type StampDefinition } from '@mepapp/core';
import { disciplineGroupOf, type DisciplineGroup } from './disciplineGroups.js';
import type { StampLabelLanguage } from './components/LanguageToggle.js';
import type { StampCategoryFilter } from './components/CategorySwitcher.js';

/** definition.labelNl when NL is active and a translation exists (fixture-generated entries only) — a custom stamp's fixed label always shows as-is regardless of the toggle. */
export function stampLabelFor(definition: StampDefinition, language: StampLabelLanguage): string {
  return language === 'nl' && definition.labelNl ? definition.labelNl : definition.label;
}

/** The same library+custom+user, discipline/category/search-filtered, label-sorted list the grid below renders — shared so the left rail's Stamp button can auto-pick "the first stamp shown here" without duplicating this logic (see App.tsx's handlePickDefaultStamp). */
export function getVisibleStampDefinitions(
  customStampDefinitions: StampDefinition[],
  disciplineGroup: DisciplineGroup | null,
  categoryFilter: StampCategoryFilter,
  labelLanguage: StampLabelLanguage,
  searchQuery = '',
  userDefinitions: StampDefinition[] = [],
  options: { showBuiltIn?: boolean; libraryRecordIds?: ReadonlySet<string> } = {},
): StampDefinition[] {
  const { showBuiltIn = true, libraryRecordIds } = options;
  // A project copy of a user-library stamp (source 'user') is skipped while the library has that id (shown, or hidden by the user): one tile per id.
  const userIds = new Set(userDefinitions.map((u) => u.id));
  const projectDefinitions = customStampDefinitions.filter(
    (c) => !(c.source === 'user' && (userIds.has(c.id) || libraryRecordIds?.has(c.id) === true)),
  );
  // A custom definition with a library id is an edited library stamp (an override): it takes that tile's place.
  const shadowedLibraryIds = new Set(projectDefinitions.map((c) => c.id));
  const builtInDefinitions = showBuiltIn ? STAMP_LIBRARY.filter((lib) => !shadowedLibraryIds.has(lib.id)) : [];
  const allDefinitions = [...builtInDefinitions, ...projectDefinitions, ...userDefinitions];
  const trimmedQuery = searchQuery.trim().toLowerCase();
  return allDefinitions
    .filter((def) => disciplineGroup === null || disciplineGroupOf(def.discipline) === disciplineGroup)
    .filter((def) => def.category === categoryFilter)
    .filter((def) => trimmedQuery === '' || stampLabelFor(def, labelLanguage).toLowerCase().includes(trimmedQuery))
    .sort((a, b) => stampLabelFor(a, labelLanguage).localeCompare(stampLabelFor(b, labelLanguage)));
}
