import { describe, expect, it } from 'vitest';
import { findCircuitCandidates, type CandidateScope, type FindCircuitCandidatesInput } from './circuit-candidates.js';
import type { Circuit } from './circuit.js';
import type { PlacedStamp } from './stamp.js';
import type { Room } from './rooms/room.js';

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

const room = (id: string, x: number, y: number, s: number): Room => ({
  id,
  pageIndex: 0,
  polygon: { outer: square(x, y, s), holes: [] },
  name: null,
  number: null,
  source: 'manual',
  locked: false,
  open: false,
});

const stamp = (id: string, category: PlacedStamp['category'], x: number, y: number, extra: Partial<PlacedStamp> = {}): PlacedStamp => ({
  id,
  category,
  transform: { position: { x, y }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
  pageIndex: 0,
  nativeWidth: 4,
  nativeHeight: 4,
  ports: [],
  ...extra,
});

const circuit = (id: string, terminalIds: string[]): Circuit => ({ id, number: 1, terminalIds, isSpare: false });

const rooms: Room[] = [room('big', 0, 0, 100), room('small', 40, 40, 20)];

function run(overrides: Partial<FindCircuitCandidatesInput>, stamps: PlacedStamp[]) {
  return findCircuitCandidates({
    stamps: Object.fromEntries(stamps.map((s) => [s.id, s])),
    circuits: [],
    rooms,
    pageIndex: 0,
    scope: { kind: 'rooms', roomIds: ['big', 'small'], includeOutside: true },
    terminalCapacities: {},
    panelStampIds: new Set(),
    ruleNeedOf: () => null,
    ...overrides,
  });
}

const inRooms = (roomIds: string[], includeOutside = false): CandidateScope => ({ kind: 'rooms', roomIds, includeOutside });

describe('findCircuitCandidates', () => {
  it('never returns a terminal that already sits on a circuit', () => {
    const result = run({ circuits: [circuit('c1', ['t1'])] }, [stamp('t1', 'terminal', 10, 10), stamp('t2', 'terminal', 12, 12)]);
    expect(result.candidates.map((c) => c.id)).toEqual(['t2']);
    expect(result.outsideScopeUnassigned).toBe(0);
  });

  it('places a terminal in two nested rooms in the smaller room', () => {
    const result = run({}, [stamp('t1', 'terminal', 50, 50)]);
    expect(result.candidates[0]?.roomId).toBe('small');
    const otherScope = run({ scope: inRooms(['big']) }, [stamp('t1', 'terminal', 50, 50)]);
    expect(otherScope.candidates).toEqual([]);
    expect(otherScope.outsideScopeUnassigned).toBe(1);
  });

  it('includes a terminal outside all rooms only when includeOutside is true', () => {
    const outside = stamp('t1', 'terminal', 500, 500);
    const included = run({ scope: inRooms(['big'], true) }, [outside]);
    expect(included.candidates.map((c) => c.id)).toEqual(['t1']);
    expect(included.candidates[0]?.roomId).toBeNull();
    const excluded = run({ scope: inRooms(['big'], false) }, [outside]);
    expect(excluded.candidates).toEqual([]);
    expect(excluded.outsideScopeUnassigned).toBe(1);
  });

  it('ignores the rooms for the stamps scope but still fills roomId', () => {
    const result = run({ scope: { kind: 'stamps', stampIds: ['t1'] } }, [stamp('t1', 'terminal', 50, 50), stamp('t2', 'terminal', 500, 500)]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ id: 't1', roomId: 'small' });
    expect(result.outsideScopeUnassigned).toBe(1);
  });

  it('counts equipment in scope and does not return it', () => {
    const result = run({}, [stamp('e1', 'equipment', 10, 10), stamp('t1', 'terminal', 12, 12)]);
    expect(result.candidates.map((c) => c.id)).toEqual(['t1']);
    expect(result.equipmentSkipped).toBe(1);
  });

  it('does not count equipment that backs a panel', () => {
    const result = run({ panelStampIds: new Set(['e1']) }, [stamp('e1', 'equipment', 10, 10)]);
    expect(result.equipmentSkipped).toBe(0);
  });

  it('treats a terminal in an unchecked room as out of scope', () => {
    const result = run({ scope: inRooms(['big']) }, [stamp('t1', 'terminal', 50, 50), stamp('t2', 'terminal', 10, 10)]);
    expect(result.candidates.map((c) => c.id)).toEqual(['t2']);
    expect(result.outsideScopeUnassigned).toBe(1);
  });

  it('adds up candidates and outside-scope terminals to all unassigned terminals', () => {
    const stamps = [
      stamp('t1', 'terminal', 10, 10),
      stamp('t2', 'terminal', 50, 50),
      stamp('t3', 'terminal', 500, 500),
      stamp('t4', 'terminal', 12, 12),
      stamp('t5', 'terminal', 13, 13),
    ];
    const result = run({ circuits: [circuit('c1', ['t4'])], scope: inRooms(['big'], false) }, stamps);
    expect(result.candidates.length + result.outsideScopeUnassigned).toBe(4);
    expect(result.candidates.map((c) => c.id)).toEqual(['t1', 't5']);
    expect(result.outsideScopeUnassigned).toBe(2);
  });

  it('fills capacity from terminalCapacities and uses null for a missing or non-finite value', () => {
    const result = run(
      { terminalCapacities: { t1: 3, t2: Number.NaN, t3: Number.POSITIVE_INFINITY } },
      [stamp('t1', 'terminal', 10, 10), stamp('t2', 'terminal', 11, 11), stamp('t3', 'terminal', 12, 12), stamp('t4', 'terminal', 13, 13)],
    );
    const byId = Object.fromEntries(result.candidates.map((c) => [c.id, c.capacity]));
    expect(byId).toEqual({ t1: 3, t2: null, t3: null, t4: null });
  });

  it('takes ruleNeedId from ruleNeedOf and definitionId from the stamp', () => {
    const result = run(
      { ruleNeedOf: (s) => (s.id === 't1' ? 'need-power' : null) },
      [stamp('t1', 'terminal', 10, 10, { definitionId: 'duplex' }), stamp('t2', 'terminal', 11, 11)],
    );
    const byId = Object.fromEntries(result.candidates.map((c) => [c.id, c]));
    expect(byId.t1).toMatchObject({ name: 'duplex', definitionId: 'duplex', ruleNeedId: 'need-power' });
    expect(byId.t2).toMatchObject({ name: 't2', definitionId: null, ruleNeedId: null });
  });
});
