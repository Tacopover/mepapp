import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { planBranches, type BranchInput, type BranchRoomInput, type RoomBranch } from './route-branch.js';
import { spineScore } from './route-exact.js';
import { BEND_PENALTY_MM, roomSpine } from './route-hanan.js';
import { DEFAULT_LAYOUT_OPTIONS } from './route-layout.js';

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

function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pathLength(path: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  return total;
}

function bendCost(branch: readonly Vec2[]): number {
  let cost = 0;
  for (let i = 1; i < branch.length - 1; i++) {
    const a = branch[i - 1]!;
    const b = branch[i]!;
    const c = branch[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 === 0 || l2 === 0) continue;
    const cos = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (l1 * l2);
    const angle = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    if (angle >= 67.5) cost += BEND_PENALTY_MM;
    else if (angle >= 22.5) cost += BEND_PENALTY_MM / 2;
  }
  return cost;
}

function scoreOf(room: RoomBranch): number {
  const spineLength = room.spine.reduce((sum, path) => sum + pathLength(path), 0);
  return (
    pathLength(room.branch) +
    bendCost(room.branch) +
    spineScore(room.spine, spineLength, {
      root: room.branch[room.branch.length - 1]!,
      entryDir: room.entryDir,
      crossesExisting: () => 0,
    })
  );
}

function bendCount(path: readonly Vec2[]): number {
  let count = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const d1x = path[i]!.x - path[i - 1]!.x;
    const d1y = path[i]!.y - path[i - 1]!.y;
    const d2x = path[i + 1]!.x - path[i]!.x;
    const d2y = path[i + 1]!.y - path[i]!.y;
    const cross = d1x * d2y - d1y * d2x;
    const dot = d1x * d2x + d1y * d2y;
    if (Math.abs(cross) > 1e-6 || dot < 0) count++;
  }
  return count;
}

function totalBends(room: RoomBranch): number {
  if (room.spine.length === 0) return bendCount(room.branch);
  return room.spine.reduce((sum, path) => sum + bendCount([...room.branch, ...path.slice(1)]), 0);
}

const horizontalTrunk = [{ id: 'e1', path: [v(0, 0), v(20000, 0)] }];
const lTrunk = [
  { id: 'h', path: [v(0, 0), v(10000, 0)] },
  { id: 'v', path: [v(10600, 0), v(10600, 10000)] },
];

describe('planBranches with exactSpine', () => {
  it('gives the same result with the option absent, empty and the defaults', () => {
    const rooms = [
      rectRoom('A', v(7000, 2400), [{ id: 'p1', point: v(7000, 4000) }], 0, 2400, 14000, 6000),
      rectRoom('B', v(7200, -2400), [{ id: 'p2', point: v(7200, -4000) }], 0, -6000, 14000, -2400),
    ];
    const plain = planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms });
    expect(planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms, options: {} })).toEqual(plain);
    expect(
      planBranches({ trunk: horizontalTrunk, rootPointMm: v(0, 0), rooms, options: DEFAULT_LAYOUT_OPTIONS }),
    ).toEqual(plain);
  });

  it('keeps the branch, tap and entry direction without the corridor test', () => {
    const room = rectRoom('A', v(9900, 300), [{ id: 'p1', point: v(9900, 1000) }], 0, -500, 12000, 1200);
    const off = planBranches({ trunk: lTrunk, rootPointMm: v(0, 0), rooms: [room] }).rooms[0]!;
    const on = planBranches({
      trunk: lTrunk,
      rootPointMm: v(0, 0),
      rooms: [room],
      options: { exactSpine: { maxPorts: 6 } },
    }).rooms[0]!;
    expect(on.branch).toEqual(off.branch);
    expect(on.tapMm).toEqual(off.tapMm);
    expect(on.tapEdgeId).toEqual(off.tapEdgeId);
    expect(on.entryDir).toEqual(off.entryDir);
  });

  it('takes the straight branch of the other leg when the corridor allows it', () => {
    const room = rectRoom('A', v(9900, 300), [{ id: 'p1', point: v(9900, 1000) }], 0, -500, 12000, 1200);
    const off = planBranches({ trunk: lTrunk, rootPointMm: v(0, 0), rooms: [room] }).rooms[0]!;
    const on = planBranches({
      trunk: lTrunk,
      rootPointMm: v(0, 0),
      rooms: [room],
      insideCorridor: () => true,
      options: { exactSpine: { maxPorts: 6 } },
    }).rooms[0]!;
    expect(off.tapEdgeId).toBe('h');
    expect(on.tapEdgeId).toBe('v');
    expect(on.branch.length).toBe(2);
    expect(totalBends(on)).toBeLessThan(totalBends(off));
  });

  it('keeps the nearest leg when the corridor excludes the straight branch', () => {
    const room = rectRoom('A', v(9900, 300), [{ id: 'p1', point: v(9900, 1000) }], 0, -500, 12000, 1200);
    const off = planBranches({ trunk: lTrunk, rootPointMm: v(0, 0), rooms: [room] }).rooms[0]!;
    const on = planBranches({
      trunk: lTrunk,
      rootPointMm: v(0, 0),
      rooms: [room],
      insideCorridor: (p) => !(p.x > 10000 && p.x < 10500 && p.y > 150 && p.y < 450),
      options: { exactSpine: { maxPorts: 6 } },
    }).rooms[0]!;
    expect(on.tapEdgeId).toBe(off.tapEdgeId);
    expect(on.tapMm).toEqual(off.tapMm);
    expect(on.branch).toEqual(off.branch);
    expect(on.entryDir).toEqual(off.entryDir);
  });

  it('uses the heuristic spine for a room with more ports than maxPorts', () => {
    const ports = [
      { id: 'g1', point: v(1000, 1000) },
      { id: 'g2', point: v(3000, 1000) },
    ];
    const room = rectRoom('A', v(2000, 0), ports, 0, 0, 4000, 4000);
    const a = planBranches({
      trunk: [{ id: 't', path: [v(0, -2000), v(20000, -2000)] }],
      rootPointMm: v(0, 0),
      rooms: [room],
      options: { exactSpine: { maxPorts: 1 } },
    }).rooms[0]!;
    const expected = roomSpine({
      root: v(2000, 0),
      entryDir: a.entryDir,
      ports,
      inside: room.inside,
      crossesExisting: () => 0,
    });
    expect(a.spine).toEqual(expected.paths);
    expect(a.offGraphPortIds).toEqual(expected.unreachedPortIds);
  });

  it('is deterministic and never scores worse than the off result for 50 seeded layouts', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rand = lcg(seed);
      const x1 = 3000 + Math.round(rand() * 9000);
      const y1 = (rand() < 0.5 ? -1 : 1) * (2000 + Math.round(rand() * 6000));
      const trunk = [{ id: 't', path: [v(0, 0), v(x1, 0), v(x1, y1)] }];
      const entry = v(Math.round(rand() * (x1 + 4000)) - 2000, Math.round(rand() * 12000) - 6000);
      const portCount = 1 + Math.floor(rand() * 3);
      const ports = Array.from({ length: portCount }, (_, i) => ({
        id: `p${i}`,
        point: v(Math.round(entry.x + (rand() - 0.5) * 4000), Math.round(entry.y + (rand() - 0.5) * 4000)),
      }));
      const room: BranchRoomInput = { roomId: 'R', entryPointMm: entry, ports, inside: () => true };
      const bx = Math.round(rand() * 14000) - 2000;
      const by = Math.round(rand() * 12000) - 6000;
      const bw = Math.round(rand() * 4000);
      const bh = Math.round(rand() * 4000);
      const corridor = rand() < 0.5 ? () => true : (p: Vec2) => !(p.x > bx && p.x < bx + bw && p.y > by && p.y < by + bh);
      const off = planBranches({ trunk, rootPointMm: v(0, 0), rooms: [room] });
      const input: BranchInput = {
        trunk,
        rootPointMm: v(0, 0),
        rooms: [room],
        insideCorridor: corridor,
        options: { exactSpine: { maxPorts: 6 } },
      };
      const on = planBranches(input);
      expect(planBranches(input)).toEqual(on);
      expect(scoreOf(on.rooms[0]!)).toBeLessThanOrEqual(scoreOf(off.rooms[0]!) + 1e-6);
    }
  });

  it('keeps 300 mm between two taps on one leg', () => {
    const a = rectRoom('A', v(7000, 2400), [{ id: 'p1', point: v(7000, 4000) }], 0, 2400, 14000, 6000);
    const b = rectRoom('B', v(7200, -2400), [{ id: 'p2', point: v(7200, -4000) }], 0, -6000, 14000, -2400);
    const { rooms } = planBranches({
      trunk: horizontalTrunk,
      rootPointMm: v(0, 0),
      rooms: [b, a],
      insideCorridor: () => true,
      options: { exactSpine: { maxPorts: 6 } },
    });
    expect(rooms.map((r) => r.tapEdgeId)).toEqual(['e1', 'e1']);
    expect(Math.abs(rooms[1]!.tapMm.x - rooms[0]!.tapMm.x)).toBeGreaterThanOrEqual(300);
  });
});
