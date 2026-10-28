import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';
import { roomContainsPoint } from './rooms/room.js';
import type { RouteEntry } from './route-area.js';
import { MAX_ENTRY_CANDIDATES, roomEntryCandidates } from './route-room-entry.js';

const rect = (w: number, h: number): Pick<Room, 'id' | 'polygon'> => ({
  id: 'r1',
  polygon: { outer: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], holes: [] },
});

const entry = (point: Vec2): RouteEntry => ({
  id: 'e1', roomId: 'r1', areaRoomId: 'a1', nodeId: 'n1', point, runMm: 1000, gapMm: 0, primary: true, shaft: false,
});

const never = (): boolean => false;
const always = (): boolean => true;

describe('roomEntryCandidates', () => {
  it('gives only wall points on the corridor side, with the port line point', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [],
      corridorAt: (p) => p.x < 0, portsMm: [{ x: 1000, y: 1500 }],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      expect(c.pointMm.x).toBe(0);
      expect(c.outward).toEqual({ x: -1, y: 0 });
    }
    expect(out).toContainEqual({ pointMm: { x: 0, y: 1500 }, outward: { x: -1, y: 0 }, source: 'port-line' });
  });

  it('gives a port line point on each wall when the corridor is on all four sides', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [],
      corridorAt: (p) => p.x < 0 || p.x > 4000 || p.y < 0 || p.y > 3000, portsMm: [{ x: 1000, y: 1500 }],
    });
    const lines = out.filter((c) => c.source === 'port-line');
    expect(lines).toHaveLength(4);
    expect(lines).toContainEqual({ pointMm: { x: 0, y: 1500 }, outward: { x: -1, y: 0 }, source: 'port-line' });
    expect(lines).toContainEqual({ pointMm: { x: 4000, y: 1500 }, outward: { x: 1, y: 0 }, source: 'port-line' });
    expect(lines).toContainEqual({ pointMm: { x: 1000, y: 0 }, outward: { x: 0, y: -1 }, source: 'port-line' });
    expect(lines).toContainEqual({ pointMm: { x: 1000, y: 3000 }, outward: { x: 0, y: 1 }, source: 'port-line' });
  });

  it('returns only the real entry when the room has one', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [entry({ x: 0, y: 1500 })],
      corridorAt: always, portsMm: [{ x: 1000, y: 1500 }],
    });
    expect(out).toEqual([{ pointMm: { x: 0, y: 1500 }, outward: { x: -1, y: 0 }, source: 'area-entry' }]);
  });

  it('gives nothing when no probe point is in a corridor', () => {
    expect(roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [], corridorAt: never, portsMm: [{ x: 1000, y: 1500 }],
    })).toEqual([]);
  });

  it('gives candidates on an L-shaped room that lie outside the room with a corridor probe', () => {
    const room: Pick<Room, 'id' | 'polygon'> = {
      id: 'r1',
      polygon: { outer: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 1500 }, { x: 2000, y: 1500 }, { x: 2000, y: 3000 }, { x: 0, y: 3000 }], holes: [] },
    };
    const corridorAt = (p: Vec2): boolean => p.x > 2500 || p.y < 1000;
    const out = roomEntryCandidates({ room, mmPerPt: 1, areaEntries: [], corridorAt, portsMm: [{ x: 500, y: 500 }] });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      const beyond = { x: c.pointMm.x + c.outward.x, y: c.pointMm.y + c.outward.y };
      expect(roomContainsPoint(room, beyond)).toBe(false);
      expect(corridorAt({ x: c.pointMm.x + c.outward.x * 300, y: c.pointMm.y + c.outward.y * 300 })).toBe(true);
    }
  });

  it('gives the same list for the same input and for ports in another order', () => {
    const ports = [{ x: 1000, y: 1500 }, { x: 3000, y: 700 }, { x: 2200, y: 2600 }];
    const args = { room: rect(4000, 3000), mmPerPt: 1, areaEntries: [], corridorAt: (p: Vec2) => p.x < 0 || p.y > 3000 || p.x > 4000 };
    const first = roomEntryCandidates({ ...args, portsMm: ports });
    expect(roomEntryCandidates({ ...args, portsMm: ports })).toEqual(first);
    expect(roomEntryCandidates({ ...args, portsMm: [...ports].reverse() })).toEqual(first);
  });

  it('caps a long wall with many ports and keeps all port line points', () => {
    const room = rect(50000, 3000);
    const ports = Array.from({ length: 20 }, (_, i) => ({ x: 1000 + 2400 * i, y: 130 + 131 * i }));
    const corridorAt = (p: Vec2): boolean => p.x < 0 || p.y < 0 || p.x > 50000 || p.y > 3000;
    const out = roomEntryCandidates({ room, mmPerPt: 1, areaEntries: [], corridorAt, portsMm: ports, stepMm: 500 });
    expect(out).toHaveLength(MAX_ENTRY_CANDIDATES);
    expect(out.filter((c) => c.source === 'port-line')).toHaveLength(80);
  });

  it('gives axis outward vectors for a slanted room', () => {
    const room: Pick<Room, 'id' | 'polygon'> = {
      id: 'r1',
      polygon: { outer: [{ x: 0, y: 0 }, { x: 4000, y: 1000 }, { x: 3000, y: 4000 }, { x: -1000, y: 3000 }], holes: [] },
    };
    const out = roomEntryCandidates({ room, mmPerPt: 1, areaEntries: [], corridorAt: always, portsMm: [{ x: 1500, y: 1500 }] });
    expect(out.length).toBeGreaterThan(0);
    const axes = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const c of out) expect(axes).toContainEqual(c.outward);
  });

  it('converts pt to mm with mmPerPt 2', () => {
    const room = rect(2000, 1500);
    const out = roomEntryCandidates({
      room, mmPerPt: 2, areaEntries: [], corridorAt: (p) => p.x < 0, portsMm: [{ x: 1000, y: 1500 }],
    });
    expect(out.filter((c) => c.source === 'ring')).toHaveLength(6);
    expect(out).toContainEqual({ pointMm: { x: 0, y: 1500 }, outward: { x: -1, y: 0 }, source: 'port-line' });
  });

  it('gives candidates only on the wall that faces a corridor', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [], corridorAt: (p) => p.y < 0, portsMm: [{ x: 1000, y: 1500 }],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      expect(c.pointMm.y).toBe(0);
      expect(c.outward).toEqual({ x: 0, y: -1 });
    }
  });

  it('gives one candidate when a ring point and a port line point are equal', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [], corridorAt: (p) => p.x < 0, portsMm: [{ x: 1000, y: 250 }],
    });
    const same = out.filter((c) => c.pointMm.x === 0 && c.pointMm.y === 250);
    expect(same).toEqual([{ pointMm: { x: 0, y: 250 }, outward: { x: -1, y: 0 }, source: 'ring' }]);
  });

  it('returns all real entries when there are two or more', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [entry({ x: 0, y: 1500 }), entry({ x: 4000, y: 700 })],
      corridorAt: always, portsMm: [{ x: 1000, y: 1500 }],
    });
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.source === 'area-entry')).toBe(true);
    expect(out).toContainEqual({ pointMm: { x: 0, y: 1500 }, outward: { x: -1, y: 0 }, source: 'area-entry' });
    expect(out).toContainEqual({ pointMm: { x: 4000, y: 700 }, outward: { x: 1, y: 0 }, source: 'area-entry' });
  });

  it('gives no port line point from an edge parallel to the line', () => {
    const out = roomEntryCandidates({
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [], corridorAt: (p) => p.y < 0, portsMm: [{ x: 1000, y: 0 }],
    });
    expect(out.filter((c) => c.source === 'port-line')).toEqual([{ pointMm: { x: 1000, y: 0 }, outward: { x: 0, y: -1 }, source: 'port-line' }]);
  });

  it('gives equal lists for sub-mm ports in two orders', () => {
    const args = {
      room: rect(4000, 3000), mmPerPt: 1, areaEntries: [], corridorAt: always,
    };
    const ports = [{ x: 1000.2, y: 1500.3 }, { x: 1000.1, y: 1500.1 }];
    expect(roomEntryCandidates({ ...args, portsMm: ports })).toEqual(roomEntryCandidates({ ...args, portsMm: [...ports].reverse() }));
  });
});
