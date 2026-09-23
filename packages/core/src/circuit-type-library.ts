// The Circuit Types picker's catalog — mirrors network-type-library.ts's
// NETWORK_TYPE_LIBRARY pattern, but for the CircuitType a Circuit is tagged
// with. The old app's CircuitType shipped no built-in seed (types were
// created per-project through its editor UI only, CircuitTypeService.cs) —
// this seed is new. Per electrical-circuits-model.md §5, circuitTypeId also
// drives schematic template group-variant selection, a use the old
// CircuitType never had.

import type { CircuitType } from './circuit.js';

export const CIRCUIT_TYPE_LIBRARY: CircuitType[] = [
  { id: 'lighting', name: 'Lighting', abbreviation: 'LGT', description: 'General and task lighting circuits.', units: 'W', defaultCapacity: 200 },
  { id: 'sockets', name: 'Socket Outlets', abbreviation: 'SCK', description: 'General-purpose wall socket circuits.', units: 'W', defaultCapacity: 2500 },
  { id: 'kitchen-appliance', name: 'Kitchen Appliance', abbreviation: 'KIT', description: 'Fixed kitchen appliances such as an oven, hob, or dishwasher.', units: 'W', defaultCapacity: 3500 },
  { id: 'water-heater', name: 'Water Heater', abbreviation: 'WTR', description: 'Boiler or water heater circuits.', units: 'W', defaultCapacity: 3000 },
  { id: 'hvac', name: 'HVAC Unit', abbreviation: 'HVC', description: 'Heat pump, air conditioning, or ventilation unit circuits.', units: 'W', defaultCapacity: 3500 },
  { id: 'ev-charger', name: 'EV Charger', abbreviation: 'EVC', description: 'Electric vehicle charging point circuits.', units: 'W', defaultCapacity: 7400 },
  { id: 'fire-alarm', name: 'Fire Alarm', abbreviation: 'FA', description: 'Fire detection and alarm system circuits.', units: 'W', defaultCapacity: 100 },
  { id: 'emergency-lighting', name: 'Emergency Lighting', abbreviation: 'EML', description: 'Emergency and escape-route lighting circuits.', units: 'W', defaultCapacity: 50 },
];

export function getCircuitTypeFromLibrary(id: string): CircuitType | undefined {
  return CIRCUIT_TYPE_LIBRARY.find((t) => t.id === id);
}
