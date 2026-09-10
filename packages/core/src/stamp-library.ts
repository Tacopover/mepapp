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

export type StampCategory = 'terminal' | 'equipment' | 'fitting';

export interface StampDefinition {
  id: string;
  label: string;
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
  /** Editable vector source for a 'custom' definition authored via the Element Editor dialog's Shapes mode (ports-custom-element-editor-spec.md §5.3) — reopening the dialog re-populates the drawing canvas from this list. `iconRef` still holds the rasterized `data:` URL produced from these shapes at save time, so every render/placement call site keeps treating artwork as "an image" and needs no vector-aware branch. Undefined for a raster-imported or library definition. */
  shapes?: SymbolShape[];
}

export const STAMP_LIBRARY: StampDefinition[] = [
  {
    id: 'ventilation-grille-rh-supply',
    label: 'Supply Grille',
    discipline: 'ventilation',
    category: 'terminal',
    nativeWidth: 60,
    nativeHeight: 60,
    ports: [{ id: 'supply', name: 'Supply', fractionX: 0.5, fractionY: 1 }],
    iconRef: 'D3_Ventilation_grille_rh_supply.svg',
    source: 'library',
  },
  {
    id: 'fire-hose-reel',
    label: 'Fire Hose Reel',
    discipline: 'fireProtection',
    category: 'equipment',
    nativeWidth: 48,
    nativeHeight: 48,
    ports: [],
    iconRef: 'D4_Fire_hose_reel.png',
    source: 'library',
  },
  {
    id: 'luminaire-rectangular',
    label: 'Luminaire',
    discipline: 'electricalCircuits',
    category: 'terminal',
    nativeWidth: 60,
    // Matches D5_Luminaire_rectangular.svg's own aspect ratio (viewBox 676x190,
    // ≈3.558:1) — previously 30 (2:1), which didn't match the art and caused
    // rasterizeSvg's now-fixed non-uniform stretch to squash the circle glyph.
    nativeHeight: 16.87,
    ports: [{ id: 'feed', name: 'Feed', fractionX: 0, fractionY: 0.5 }],
    iconRef: 'D5_Luminaire_rectangular.svg',
    source: 'library',
  },
  {
    id: 'switch',
    label: 'Switch',
    discipline: 'electricalCircuits',
    category: 'terminal',
    nativeWidth: 24,
    nativeHeight: 24,
    ports: [{ id: 'feed', name: 'Feed', fractionX: 0.5, fractionY: 1 }],
    iconRef: 'D5_Switch.png',
    source: 'library',
  },
];

export function getStampDefinition(id: string, customDefinitions: StampDefinition[] = []): StampDefinition | undefined {
  return STAMP_LIBRARY.find((def) => def.id === id) ?? customDefinitions.find((def) => def.id === id);
}

export function stampDefinitionsForDiscipline(discipline: Discipline | null, customDefinitions: StampDefinition[] = []): StampDefinition[] {
  const all = [...STAMP_LIBRARY, ...customDefinitions];
  return discipline === null ? all : all.filter((def) => def.discipline === discipline);
}
