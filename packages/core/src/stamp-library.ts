// The stamp palette's catalog: what a Terminal/Equipment/Fitting symbol *is*
// before it is placed (compare PlacedStamp in stamp.ts, which is one placed
// instance). No rendering, no I/O — `iconRef` is an asset key the render/UI
// layer resolves to actual art; core stays rendering-free.
//
// Only disciplines with real fixture art (fixtures/stamps, per that
// directory's README) get an entry — no fabricated placeholder stamps.

import type { PortSpec } from './geometry.js';
import type { Discipline } from './network.js';
import type { SymbolShape } from './symbol-shapes.js';
import { GENERATED_STAMP_LIBRARY } from './stamp-library.generated.js';

export type StampCategory = 'terminal' | 'equipment' | 'fitting';

export interface StampDefinition {
  id: string;
  label: string;
  /** Dutch translation of `label`, for the Stamps tab's language toggle — only set on fixture-generated entries with a name-mapping.csv translation (scripts/generate-stamp-library.mjs). Never set on a 'custom' definition: a user-authored stamp's label stays fixed regardless of the toggle. */
  labelNl?: string;
  discipline: Discipline;
  category: StampCategory;
  /** Nominal size in world units (1 unit = 1 PDF point) for palette layout — actual placed size is recomputed from the loaded art's real pixel dimensions, same 300 DPI convention as scene.ts's STAMP_SOURCE_DPI. */
  nativeWidth: number;
  nativeHeight: number;
  ports: PortSpec[];
  /** For a 'library' definition, a fixture-relative asset key (apps/web resolves it under /stamps/). For a 'custom' definition (Element Editor dialog, ports-custom-element-editor-spec.md §5.2), a self-contained `data:` URL — the project embeds the art directly rather than pointing at a shared filesystem path, so it stays fetchable/renderable through the exact same resolver call sites with no source-aware branching beyond "is this already a data: URL". */
  iconRef: string;
  /** 'library' = one of the fixture-backed STAMP_LIBRARY entries below (read-only in the Element Editor dialog). 'custom' = authored via the Element Editor dialog and stored on the project document's customStampDefinitions. */
  source: 'library' | 'custom';
  /** Groups of this definition's own port ids that should collapse into one connectivity node once placed (e.g. a unit's supply + return) — authored in the Element Editor dialog's link mode, converted into real instance-level PortGroup entries at placement time (see SketchScene.placeStamp). Only meaningful for 'custom' definitions; library entries never set it. */
  definitionPortGroups?: string[][];
  /** Editable vector source for this definition's artwork. For a 'custom' definition, authored via the Element Editor dialog's Shapes mode (ports-custom-element-editor-spec.md §5.3) — reopening the dialog re-populates the drawing canvas from this list. For a 'library' definition, parsed directly from the fixture's own .svg (scripts/generate-stamp-library.mjs) — the SVG is the single source of truth for library art, so these match exactly. `iconRef` still holds a rasterized form (the fixture SVG itself for 'library', a `data:` PNG produced from `shapes` at save time for 'custom'), so every render/placement call site keeps treating artwork as "an image" and needs no vector-aware branch. Undefined only for a raster-imported custom definition with no shapes at all (an 'image'-kind shape still counts). */
  shapes?: SymbolShape[];
}

// The 4 original hand-typed entries (fire-hose-reel, ventilation-grille-rh-supply,
// luminaire-rectangular, switch) are all now generated below under the same
// ids, from the same fixture art plus authored port data (see
// generate-stamp-library.mjs) — asserted by that script's own
// "expectedId" check at generation time.
export const STAMP_LIBRARY: StampDefinition[] = [...GENERATED_STAMP_LIBRARY];

/** The project's custom definitions come first: one with a library id is an edited library stamp (an override) and replaces that library entry for every stamp placed from it. */
export function getStampDefinition(id: string, customDefinitions: StampDefinition[] = []): StampDefinition | undefined {
  return customDefinitions.find((def) => def.id === id) ?? STAMP_LIBRARY.find((def) => def.id === id);
}

/** True when `id` is a STAMP_LIBRARY entry — a custom definition with such an id is an override of it. */
export function isLibraryStampId(id: string): boolean {
  return STAMP_LIBRARY.some((def) => def.id === id);
}

export function stampDefinitionsForDiscipline(discipline: Discipline | null, customDefinitions: StampDefinition[] = []): StampDefinition[] {
  const all = [...STAMP_LIBRARY, ...customDefinitions];
  return discipline === null ? all : all.filter((def) => def.discipline === discipline);
}
