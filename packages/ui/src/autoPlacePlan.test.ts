import { describe, expect, it } from 'vitest';
import type { PlacementRow, PlacementRule, StampDefinition } from '@mepapp/core';
import { groupsOf, keptWithOtherTarget, notesOf, type AutoPlaceArt } from './components/autoPlacePlan.js';

const definition = (ports: StampDefinition['ports']): StampDefinition => ({
  id: 'fcu',
  label: 'Fan coil unit',
  discipline: 'heatingAndCooling',
  category: 'equipment',
  nativeWidth: 40,
  nativeHeight: 20,
  ports,
  iconRef: 'data:image/png;base64,AAAA',
  source: 'library',
});
const fcuPorts = [
  { id: 'cw', name: 'Chilled water', fractionX: 0, fractionY: 0.5 },
  { id: 'hw', name: 'Heating water', fractionX: 1, fractionY: 0.5 },
];
const rule = (patch: Partial<PlacementRule> = {}): PlacementRule =>
  ({ id: 'r', name: 'R', discipline: 'heatingAndCooling', roomTypeIds: [], stampDefinitionId: 'fcu', countBy: 'perRoom', coverage: {}, layout: { strategy: 'center', wallOffsetM: 0, rotation: 'room' }, writeCapacity: false, ...patch }) as PlacementRule;
const row = (r: PlacementRule, stamps = 2, keep: string[] = []): PlacementRow =>
  ({
    rule: r,
    room: { id: 'room-1', pageIndex: 0, roomTypeId: 'office', polygon: { outer: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], holes: [] } },
    requirement: { perElement: null, warnings: [] },
    values: {},
    stamps: Array.from({ length: stamps }, (_, i) => ({ position: { x: i, y: 0 }, rotationDegrees: 0 })),
    existing: { keep, replace: [] },
    warnings: [],
  }) as unknown as PlacementRow;
const art = (ports: StampDefinition['ports']): Map<string, AutoPlaceArt> => new Map([['fcu', { definition: definition(ports), bitmap: {} as ImageBitmap }]]);

describe('the routing targets of auto-placement (auto-routing.md P3)', () => {
  it('groupsOf gives each planned stamp the routing targets of its rule, by port', () => {
    const [group] = groupsOf([row(rule({ portRoutingTargets: { cw: 'chilled-water', hw: 'heating-water' } }))], art(fcuPorts));
    expect(group!.stamps.map((s) => s.routingTargets)).toEqual([
      { cw: 'chilled-water', hw: 'heating-water' },
      { cw: 'chilled-water', hw: 'heating-water' },
    ]);
    expect(group!.stamps[0]!.routingTargets).not.toBe(group!.stamps[1]!.routingTargets);
  });

  it('groupsOf uses the center for a stamp without ports, and gives nothing for a rule without a routing target', () => {
    expect(groupsOf([row(rule({ routingTarget: 'supply-air' }), 1)], art([]))[0]!.stamps[0]!.routingTargets).toEqual({ __center__: 'supply-air' });
    expect(groupsOf([row(rule(), 1)], art([]))[0]!.stamps[0]).not.toHaveProperty('routingTargets');
  });

  it('groupsOf collects the network type copies of the rules once', () => {
    const copy = { id: 'nt-own', name: 'Supply Air 2', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#1565c0', lineWidthPt: 2, linePattern: 'solid' } as const;
    const r = rule({ routingTarget: 'nt-own', networkTypeCopies: [copy] });
    const [group] = groupsOf([row(r), { ...row(r), room: { ...row(r).room, id: 'room-2' } } as PlacementRow], art([]));
    expect(group!.networkTypeCopies).toEqual([copy]);
  });

  it('the notes count the moved stamps that keep another routing target', () => {
    const r = rule({ routingTarget: 'supply-air' });
    const stamps: Record<string, { ports: typeof fcuPorts | []; routingTargets?: Record<string, string> }> = {
      same: { ports: [], routingTargets: { __center__: 'supply-air' } },
      other: { ports: [], routingTargets: { __center__: 'return-air' } },
      none: { ports: [] },
    };
    const kept = row(r, 0, ['same', 'other', 'none']);
    expect(keptWithOtherTarget(kept, (id) => stamps[id])).toBe(2);
    expect(notesOf(kept, false, 2)).toBe('3 moved stamps kept (2 with another routing target)');
    expect(notesOf(row(r, 0, ['same']), false, keptWithOtherTarget(row(r, 0, ['same']), (id) => stamps[id]))).toBe('1 moved stamp kept');
  });
});
