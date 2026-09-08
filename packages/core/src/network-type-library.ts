// The Network Types picker's catalog (Stamps dock tab, "Network Types"
// section) — mirrors stamp-library.ts's STAMP_LIBRARY pattern, but for the
// NetworkType a drawn segment gets tagged with rather than a placed element.
// Picking one from this library sets it "active"; SketchScene then carries
// that id onto every segment drawn until a different one is picked (see
// SketchScene.setActiveNetworkType).

import type { NetworkType } from './network.js';

export const NETWORK_TYPE_LIBRARY: NetworkType[] = [
  { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400 },
  { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400 },
  { id: 'exhaust-air', name: 'Exhaust Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 200 },
  { id: 'chilled-water', name: 'Chilled Water', discipline: 'heatingAndCooling', units: 'GPM', defaultCapacity: 20 },
  { id: 'heating-water', name: 'Heating Water', discipline: 'heatingAndCooling', units: 'GPM', defaultCapacity: 20 },
  { id: 'domestic-cold-water', name: 'Domestic Cold Water', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10 },
  { id: 'domestic-hot-water', name: 'Domestic Hot Water', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10 },
  { id: 'sanitary-waste', name: 'Sanitary Waste', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10 },
  { id: 'conduit', name: 'Conduit', discipline: 'electricalPathways', units: '', defaultCapacity: 0 },
  { id: 'cable-tray', name: 'Cable Tray', discipline: 'electricalPathways', units: '', defaultCapacity: 0 },
  { id: 'branch-circuit', name: 'Branch Circuit', discipline: 'electricalCircuits', units: 'A', defaultCapacity: 20 },
  { id: 'feeder', name: 'Feeder', discipline: 'electricalCircuits', units: 'A', defaultCapacity: 100 },
  { id: 'wet-standpipe', name: 'Wet Standpipe', discipline: 'fireProtection', units: 'GPM', defaultCapacity: 500 },
  { id: 'dry-standpipe', name: 'Dry Standpipe', discipline: 'fireProtection', units: 'GPM', defaultCapacity: 0 },
];

export function getNetworkTypeFromLibrary(id: string): NetworkType | undefined {
  return NETWORK_TYPE_LIBRARY.find((t) => t.id === id);
}
