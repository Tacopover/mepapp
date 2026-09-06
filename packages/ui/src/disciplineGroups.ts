// UI-level grouping over @mepapp/core's real Discipline union. The Field
// Blueprint mockup's discipline switcher has four segments (HVAC / Plumbing
// / Electrical / Fire) matching the theme's four accent colors, but the
// domain model (network.ts) tracks six finer-grained disciplines — this maps
// one onto the other rather than inventing a second, weaker discipline type.
import type { Discipline } from '@mepapp/core';

export type DisciplineGroup = 'hvac' | 'plumbing' | 'electrical' | 'fire';

export const DISCIPLINE_GROUPS: DisciplineGroup[] = ['hvac', 'plumbing', 'electrical', 'fire'];

export const DISCIPLINE_GROUP_LABEL: Record<DisciplineGroup, string> = {
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  fire: 'Fire',
};

export function disciplineGroupOf(discipline: Discipline): DisciplineGroup {
  switch (discipline) {
    case 'heatingAndCooling':
    case 'ventilation':
      return 'hvac';
    case 'plumbing':
      return 'plumbing';
    case 'electricalPathways':
    case 'electricalCircuits':
      return 'electrical';
    case 'fireProtection':
      return 'fire';
  }
}
