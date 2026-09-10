// The Network Types picker's catalog (Stamps dock tab, "Network Types"
// section) — mirrors stamp-library.ts's STAMP_LIBRARY pattern, but for the
// NetworkType a drawn segment gets tagged with rather than a placed element.
// Picking one from this library sets it "active"; SketchScene then carries
// that id onto every segment drawn until a different one is picked (see
// SketchScene.setActiveNetworkType).

import type { NetworkType } from './network.js';

export const NETWORK_TYPE_LIBRARY: NetworkType[] = [
  { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' },
  { id: 'exhaust-air', name: 'Exhaust Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 200, color: '#78909c', lineWidthPt: 2, linePattern: 'dotted' },
  { id: 'chilled-water', name: 'Chilled Water', discipline: 'heatingAndCooling', units: 'GPM', defaultCapacity: 20, color: '#00bcd4', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'heating-water', name: 'Heating Water', discipline: 'heatingAndCooling', units: 'GPM', defaultCapacity: 20, color: '#f44336', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'domestic-cold-water', name: 'Domestic Cold Water', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10, color: '#2962ff', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'domestic-hot-water', name: 'Domestic Hot Water', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10, color: '#ff6f00', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'sanitary-waste', name: 'Sanitary Waste', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10, color: '#6d4c41', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'conduit', name: 'Conduit', discipline: 'electricalPathways', units: '', defaultCapacity: 0, color: '#757575', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'cable-tray', name: 'Cable Tray', discipline: 'electricalPathways', units: '', defaultCapacity: 0, color: '#9e9e9e', lineWidthPt: 2, linePattern: 'dashed' },
  { id: 'branch-circuit', name: 'Branch Circuit', discipline: 'electricalCircuits', units: 'A', defaultCapacity: 20, color: '#fdd835', lineWidthPt: 2, linePattern: 'solid' },
  { id: 'feeder', name: 'Feeder', discipline: 'electricalCircuits', units: 'A', defaultCapacity: 100, color: '#fbc02d', lineWidthPt: 3, linePattern: 'solid' },
  { id: 'wet-standpipe', name: 'Wet Standpipe', discipline: 'fireProtection', units: 'GPM', defaultCapacity: 500, color: '#d32f2f', lineWidthPt: 3, linePattern: 'solid' },
  { id: 'dry-standpipe', name: 'Dry Standpipe', discipline: 'fireProtection', units: 'GPM', defaultCapacity: 0, color: '#e57373', lineWidthPt: 3, linePattern: 'dashed' },
];

export function getNetworkTypeFromLibrary(id: string): NetworkType | undefined {
  return NETWORK_TYPE_LIBRARY.find((t) => t.id === id);
}
