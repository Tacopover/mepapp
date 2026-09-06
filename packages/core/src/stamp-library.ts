// The stamp palette's catalog: what a Terminal/Equipment/Fitting symbol *is*
// before it is placed (compare PlacedStamp in stamp.ts, which is one placed
// instance). No rendering, no I/O — `iconRef` is an asset key the render/UI
// layer resolves to actual art; core stays rendering-free.
//
// Only disciplines with real fixture art (fixtures/stamps, per that
// directory's README) get an entry — no fabricated placeholder stamps.

import type { PortSpec } from './geometry.js';
import type { Discipline } from './network.js';

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
  iconRef: string;
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
  },
  {
    id: 'luminaire-rectangular',
    label: 'Luminaire',
    discipline: 'electricalCircuits',
    category: 'terminal',
    nativeWidth: 60,
    nativeHeight: 30,
    ports: [{ id: 'feed', name: 'Feed', fractionX: 0, fractionY: 0.5 }],
    iconRef: 'D5_Luminaire_rectangular.svg',
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
  },
];

export function getStampDefinition(id: string): StampDefinition | undefined {
  return STAMP_LIBRARY.find((def) => def.id === id);
}

export function stampDefinitionsForDiscipline(discipline: Discipline | null): StampDefinition[] {
  return discipline === null ? STAMP_LIBRARY : STAMP_LIBRARY.filter((def) => def.discipline === discipline);
}
