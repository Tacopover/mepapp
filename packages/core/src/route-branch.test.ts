import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { planBranches, type BranchRoomInput } from './route-branch.js';

const v = (x: number, y: number): Vec2 => ({ x, y });

function rectRoom(
  roomId: string,
  entry: Vec2,
  ports: { id: string; point: Vec2 }[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): BranchRoomInput {
  return {
    roomId,
    entryPointMm: entry,
    ports,
    inside: (p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1,
  };
}

const horizontalTrunk = [{ id: 'e1', path: [v(0, 0), v(20000, 0)] }];

describe('planBranches', () => {
  it('gives an empty spine for a room with no port', () => {
    const room = rectRoom('A', v(7000, 2400), [], 0, 2400, 14000, 6000);
    const { rooms } = planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms: [room] });
    expect(rooms[0]!.spine).toEqual([]);
    expect(rooms[0]!.offGraphPortIds).toEqual([]);
    expect(rooms[0]!.branch).toEqual([v(7000, 0), v(7000, 2400)]);
  });

  it('builds a straight branch', () => {
    const room = rectRoom('A', v(7000, 2400), [{ id: 'p1', point: v(7000, 4000) }], 0, 2400, 14000, 6000);
    const { rooms } = planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms: [room] });
    const a = rooms[0]!;
    expect(a.tapMm).toEqual(v(7000, 0));
    expect(a.tapEdgeId).toBe('e1');
    expect(a.branch).toEqual([v(7000, 0), v(7000, 2400)]);
    expect(a.entryDir).toEqual(v(0, 1));
    expect(a.spine.length).toBe(1);
    expect(a.lengthMm).toBeCloseTo(2400 + 1600, 6);
    expect(a.offGraphPortIds).toEqual([]);
  });

  it('clamps the tap away from the end of the leg', () => {
    const room = rectRoom('A', v(100, 2400), [{ id: 'p1', point: v(100, 4000) }], 0, 2400, 14000, 6000);
    const a = planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms: [room] }).rooms[0]!;
    expect(a.tapMm).toEqual(v(300, 0));
    expect(a.branch).toEqual([v(300, 0), v(300, 1100), v(100, 1300), v(100, 2400)]);
    let len = 0;
    for (let i = 1; i < a.branch.length; i++) {
      len += Math.hypot(a.branch[i]!.x - a.branch[i - 1]!.x, a.branch[i]!.y - a.branch[i - 1]!.y);
    }
    expect(len).toBeCloseTo(2482.84, 2);
  });

  it('reaches four grilles with leaf ports', () => {
    const ports = [
      { id: 'g1', point: v(1000, 1000) },
      { id: 'g2', point: v(3000, 1000) },
      { id: 'g3', point: v(1000, 3000) },
      { id: 'g4', point: v(3000, 3000) },
    ];
    const room = rectRoom('A', v(2000, 0), ports, 0, 0, 4000, 4000);
    const a = planBranches({
      trunk: [{ id: 't', path: [v(0, -2000), v(20000, -2000)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.entryDir).toEqual(v(0, 1));
    expect(a.tapMm).toEqual(v(2000, -2000));
    expect(a.branch).toEqual([v(2000, -2000), v(2000, 0)]);
    expect(a.spine.length).toBe(6);
    expect(a.lengthMm).toBeCloseTo(2000 + 7000, 6);
    expect(a.offGraphPortIds).toEqual([]);
    for (const port of ports) {
      for (const path of a.spine) {
        path.forEach((pt, i) => {
          if (pt.x !== port.point.x || pt.y !== port.point.y) return;
          if (i > 0 && i < path.length - 1) throw new Error(`port ${port.id} is an inner point`);
          if (i === 0) throw new Error(`port ${port.id} starts a path`);
        });
      }
    }
  });

  it('spaces two taps and ignores the order of the rooms', () => {
    const a = rectRoom('A', v(7000, 2400), [{ id: 'p1', point: v(7000, 4000) }], 0, 2400, 14000, 6000);
    const b = rectRoom('B', v(7200, -2400), [{ id: 'p2', point: v(7200, -4000) }], 0, -6000, 14000, -2400);
    const first = planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms: [b, a] });
    const second = planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms: [a, b] });
    expect(first).toEqual(second);
    expect(first.rooms.map((r) => r.roomId)).toEqual(['A', 'B']);
    expect(first.rooms[0]!.tapMm).toEqual(v(7000, 0));
    const rb = first.rooms[1]!;
    expect(rb.tapMm).toEqual(v(7300, 0));
    expect(rb.branch).toEqual([v(7300, 0), v(7300, -1150), v(7200, -1250), v(7200, -2400)]);
    let len = 0;
    for (let i = 1; i < rb.branch.length; i++) {
      len += Math.hypot(rb.branch[i]!.x - rb.branch[i - 1]!.x, rb.branch[i]!.y - rb.branch[i - 1]!.y);
    }
    expect(len).toBeCloseTo(2441.42, 2);
  });

  it('uses the nearest axis leg when the nearest leg is diagonal', () => {
    const room = rectRoom('A', v(3000, 6000), [{ id: 'p1', point: v(3000, 7000) }], 0, 6000, 10000, 9000);
    const a = planBranches({
      trunk: [{ id: 'd1', path: [v(0, 0), v(4000, 4000), v(10000, 4000)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.tapEdgeId).toBe('d1');
    expect(a.tapMm).toEqual(v(4300, 4000));
    expect(a.branch).toEqual([v(4300, 4000), v(4300, 5000), v(3000, 5000), v(3000, 6000)]);
  });

  it('clamps at the end of a leg with a small jog', () => {
    const room = rectRoom('A', v(10000, -1000), [{ id: 'p1', point: v(10000, -3000) }], 0, -5000, 10000, -1000);
    const a = planBranches({
      trunk: [{ id: 'e1', path: [v(0, 0), v(10000, 0)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.tapMm).toEqual(v(9700, 0));
    expect(a.branch).toEqual([v(9700, 0), v(9700, -350), v(10000, -650), v(10000, -1000)]);
  });

  it('taps a short leg at the nearest vertex', () => {
    const room = rectRoom('A', v(250, 1500), [{ id: 'p1', point: v(250, 3000) }], 0, 1500, 500, 4000);
    const a = planBranches({
      trunk: [{ id: 'e1', path: [v(0, 0), v(500, 0)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.tapMm).toEqual(v(0, 0));
  });

  it('never runs the branch on the trunk line', () => {
    const room = rectRoom('A', v(9900, 100), [{ id: 'p1', point: v(9900, 1000) }], 0, 100, 12000, 5000);
    const a = planBranches({
      trunk: [{ id: 'e1', path: [v(0, 0), v(10000, 0)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.tapMm).toEqual(v(9700, 0));
    expect(a.branch).toEqual([v(9700, 0), v(9700, 100), v(9900, 100)]);
    expect(a.entryDir).toEqual(v(1, 0));
  });

  it('taps the root point when the trunk has no leg', () => {
    const room = rectRoom('A', v(0, 3000), [{ id: 'p1', point: v(0, 4000) }], -1000, 3000, 1000, 6000);
    const a = planBranches({ trunk: [], rootPointMm: v(0, 0), rooms: [room] }).rooms[0]!;
    expect(a.tapMm).toEqual(v(0, 0));
    expect(a.tapEdgeId).toBeNull();
    expect(a.branch).toEqual([v(0, 0), v(0, 3000)]);
  });

  it('serves one port with at most one bend', () => {
    const room = rectRoom('A', v(2000, 0), [{ id: 'p1', point: v(3000, 1000) }], 0, 0, 4000, 4000);
    const a = planBranches({
      trunk: [{ id: 't', path: [v(0, -2000), v(20000, -2000)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.entryDir).toEqual(v(0, 1));
    expect(a.spine.length).toBe(1);
    expect(a.spine[0]!.length).toBeLessThanOrEqual(3);
  });

  it('reports an unreached collinear port', () => {
    const room: BranchRoomInput = {
      roomId: 'A',
      entryPointMm: v(0, 0),
      ports: [
        { id: 'near', point: v(2000, 0) },
        { id: 'far', point: v(4000, 0) },
      ],
      inside: () => true,
    };
    const a = planBranches({
      trunk: [{ id: 't', path: [v(-5000, -3000), v(5000, -3000)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
    }).rooms[0]!;
    expect(a.offGraphPortIds).toEqual(['far']);
    expect(a.spine.some((path) => path[path.length - 1]!.x === 2000 && path[path.length - 1]!.y === 0)).toBe(true);
  });

  it('does not change the input and is deterministic', () => {
    const room = rectRoom('A', v(100, 2400), [{ id: 'p1', point: v(100, 4000) }], 0, 2400, 14000, 6000);
    const input = { trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms: [room] };
    const before = structuredClone({
      trunk: input.trunk,
      rootPointMm: input.rootPointMm,
      rooms: input.rooms.map((r) => ({ roomId: r.roomId, entryPointMm: r.entryPointMm, ports: r.ports })),
    });
    const first = planBranches(input);
    const second = planBranches(input);
    expect(first).toEqual(second);
    expect({
      trunk: input.trunk,
      rootPointMm: input.rootPointMm,
      rooms: input.rooms.map((r) => ({ roomId: r.roomId, entryPointMm: r.entryPointMm, ports: r.ports })),
    }).toEqual(before);
  });
});
