import { describe, expect, it } from 'vitest';
import type { Vec2 } from './geometry.js';
import { legClass } from './route-layout.js';
import { buildRouteItems, connectLoosePorts, PLACEHOLDER_DIAMETER_MM, type TopologyInput, type TopologyPort } from './route-topology.js';

const MM_PER_PT = 10;
const v = (x: number, y: number): Vec2 => ({ x, y });

function port(stampId: string, p: Vec2): TopologyPort {
  return { point: p, pagePoint: v(p.x / MM_PER_PT, p.y / MM_PER_PT), stampId, portId: 'out' };
}

function counters(): Pick<TopologyInput, 'newSegmentId' | 'newFittingId'> {
  let s = 0;
  let f = 0;
  return { newSegmentId: () => `S${++s}`, newFittingId: () => `F${++f}` };
}

function make(paths: Vec2[][], ports: TopologyPort[], startPoint: Vec2, extra: Partial<TopologyInput> = {}): TopologyInput {
  return { paths, ports, stubFitting: null, startPoint, networkTypeId: 'supply-air', discipline: 'ventilation', pageIndex: 0, mmPerPt: MM_PER_PT, ...counters(), ...extra };
}

function sumLengths(paths: readonly (readonly Vec2[])[]): number {
  let total = 0;
  for (const path of paths) for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  return total;
}

function endText(e: { kind: string; fittingId?: string; elementId?: string; portId?: string }): string {
  return e.kind === 'port' ? `port:${e.elementId}:${e.portId}` : e.fittingId!;
}

function room(trunkEndPort = false): TopologyInput {
  const E = v(2000, 0);
  const paths = [
    [v(0, -2000), v(10000, -2000)],
    [v(2000, -2000), E],
    [E, v(2000, 1000)],
    [v(2000, 1000), v(1000, 1000)],
    [v(2000, 1000), v(3000, 1000)],
    [v(2000, 1000), v(2000, 3000)],
    [v(2000, 3000), v(1000, 3000)],
    [v(2000, 3000), v(3000, 3000)],
  ];
  const ports = [port('ahu', v(0, -2000)), port('g1', v(1000, 1000)), port('g2', v(3000, 1000)), port('g3', v(1000, 3000)), port('g4', v(3000, 3000))];
  if (trunkEndPort) ports.push(port('end', v(10000, -2000)));
  return make(paths, ports, v(0, -2000));
}

describe('buildRouteItems', () => {
  it('prunes the trunk stub beyond the last tap', () => {
    const input = room();
    const result = buildRouteItems(input);
    // The trunk end (10000,-2000) is no terminal: its leg is deleted. T (2000,-2000) is then a bend of the start leg and the branch.
    expect(result.fittings.map((f) => [f.id, f.kind, f.position])).toEqual([
      ['F1', 'elbow', v(200, -200)],
      ['F2', 'cross', v(200, 100)],
      ['F3', 'tee', v(200, 300)],
    ]);
    // Start-T 2000, T-cross 3000, cross-tee 2000, 4 grille stubs of 1000: 7 segments, 11000 mm. The room part is 6 segments and 9000 mm.
    const lengths = result.segments.map((s) => Math.round(Math.hypot(s.geometry[1]!.x - s.geometry[0]!.x, s.geometry[1]!.y - s.geometry[0]!.y) * MM_PER_PT));
    expect(lengths).toEqual([3000, 2000, 1000, 1000, 1000, 1000, 2000]);
    expect(result.lengthMm).toBeCloseTo(11000, 6);
    expect(result.bends90).toBe(1);
  });

  it('deletes a dangling chain of two legs', () => {
    const paths = [[v(0, 0), v(5000, 0)], [v(5000, 0), v(5000, 3000)], [v(5000, 3000), v(8000, 3000)], [v(5000, 0), v(10000, 0)]];
    const result = buildRouteItems(make(paths, [port('a', v(0, 0)), port('b', v(10000, 0))], v(0, 0)));
    expect(result.fittings).toEqual([]);
    expect(result.segments).toHaveLength(1);
    expect(result.lengthMm).toBe(10000);
  });

  it('builds the 4-grille room on a trunk', () => {
    const input = room(true);
    const result = buildRouteItems(input);
    // Fittings: tee on the trunk at T, cross, tee in the room. The trunk end is a port.
    expect(result.fittings.map((f) => [f.id, f.kind, f.position])).toEqual([
      ['F1', 'tee', v(200, -200)],
      ['F2', 'cross', v(200, 100)],
      ['F3', 'tee', v(200, 300)],
    ]);
    // Lengths: start-T 2000, T-end 8000, T-cross 3000 (T-E and E-cross merge), 4 grille stubs 1000, cross-tee 2000.
    expect(result.segments.map((s) => [endText(s.endpointA), endText(s.endpointB)])).toEqual([
      ['F1', 'F2'],
      ['F1', 'port:end:out'],
      ['F2', 'F3'],
      ['F2', 'port:g1:out'],
      ['F2', 'port:g2:out'],
      ['F3', 'port:g3:out'],
      ['F3', 'port:g4:out'],
      ['port:ahu:out', 'F1'],
    ]);
    const lengths = result.segments.map((s) => Math.hypot(s.geometry[1]!.x - s.geometry[0]!.x, s.geometry[1]!.y - s.geometry[0]!.y) * MM_PER_PT);
    expect(lengths.map((l) => Math.round(l))).toEqual([3000, 8000, 2000, 1000, 1000, 1000, 1000, 2000]);
    expect(result.lengthMm).toBeCloseTo(19000, 6);
    expect(result.lengthMm).toBeCloseTo(sumLengths(input.paths) - 0, 6);
    expect(result.segments.every((s) => s.routedBy === 'route' && s.diameter === 200 && s.shape === 'round' && s.geometry.length === 2)).toBe(true);
    expect(result.fittings.every((f) => f.routedBy === 'route')).toBe(true);
    const portPoints = input.ports.map((p) => p.pagePoint);
    expect(result.fittings.some((f) => portPoints.some((p) => p.x === f.position.x && p.y === f.position.y))).toBe(false);
    expect(result.bends90 + result.bends45 + result.freeLegs).toBe(0);
  });

  it('merges two collinear legs with no fitting', () => {
    const input = make([[v(0, 0), v(5000, 0)], [v(5000, 0), v(10000, 0)]], [port('a', v(0, 0)), port('b', v(10000, 0))], v(0, 0));
    const result = buildRouteItems(input);
    expect(result.fittings).toEqual([]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.endpointA).toEqual({ kind: 'port', elementId: 'a', portId: 'out' });
    expect(result.segments[0]!.endpointB).toEqual({ kind: 'port', elementId: 'b', portId: 'out' });
    expect(result.lengthMm).toBe(10000);
  });

  it('gives a tee for 3 legs, a cross for 4 legs and an elbow for a bend', () => {
    const ends = [port('a', v(0, 0)), port('b', v(10000, 0)), port('c', v(5000, 3000))];
    const tee = buildRouteItems(make([[v(0, 0), v(5000, 0)], [v(5000, 0), v(5000, 3000)], [v(5000, 0), v(10000, 0)]], ends, v(0, 0)));
    expect(tee.fittings.map((f) => f.kind)).toEqual(['tee']);
    const cross = buildRouteItems(make([[v(0, 0), v(5000, 0)], [v(5000, 0), v(5000, 3000)], [v(5000, 0), v(10000, 0)], [v(5000, 0), v(5000, -3000)]], [...ends, port('d', v(5000, -3000))], v(0, 0)));
    expect(cross.fittings.map((f) => f.kind)).toEqual(['cross']);
    const elbow = buildRouteItems(make([[v(0, 0), v(4000, 0), v(4000, 3000)]], [port('a', v(0, 0)), port('b', v(4000, 3000))], v(0, 0)));
    expect(elbow.fittings.map((f) => [f.kind, f.position])).toEqual([['elbow', v(400, 0)]]);
    expect(elbow.segments).toHaveLength(2);
    expect(elbow.bends90).toBe(1);
  });

  it('gives the same ids for the same input and does not change the input', () => {
    const a = room();
    const b = room();
    const before = structuredClone({ paths: a.paths, ports: a.ports, startPoint: a.startPoint });
    const first = buildRouteItems(a);
    expect({ paths: a.paths, ports: a.ports, startPoint: a.startPoint }).toEqual(before);
    expect(buildRouteItems(b)).toEqual(first);
    const ids = [...first.segments.map((s) => s.id), ...first.fittings.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.segments.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });

  it('counts 45 and 90 degree bends', () => {
    const jog = buildRouteItems(make([[v(0, 0), v(4700, 0), v(5300, 600), v(10000, 600)]], [port('a', v(0, 0)), port('b', v(10000, 600))], v(0, 0)));
    expect(jog.segments).toHaveLength(3);
    expect(jog.fittings.map((f) => f.kind)).toEqual(['elbow', 'elbow']);
    expect(jog.bends45).toBe(2);
    expect(jog.bends90).toBe(0);
    expect(jog.lengthMm).toBeCloseTo(4700 + Math.hypot(600, 600) + 4700, 6);
    const square = buildRouteItems(make([[v(0, 0), v(1000, 0), v(1000, 1000)]], [port('a', v(0, 0)), port('b', v(1000, 1000))], v(0, 0)));
    expect(square.bends90).toBe(1);
    expect(square.bends45).toBe(0);
  });

  it('counts only the free legs', () => {
    expect(legClass(v(0, 0), v(1000, 300))).toBe('free');
    expect(legClass(v(1000, 300), v(2000, 1300))).toBe('diagonal');
    const result = buildRouteItems(make([[v(0, 0), v(1000, 300), v(2000, 1300)]], [port('a', v(0, 0)), port('b', v(2000, 1300))], v(0, 0)));
    expect(result.segments).toHaveLength(2);
    expect(result.freeLegs).toBe(1);
    expect(result.freePoints).toHaveLength(1);
    // The free leg is (0,0)-(1000,300) mm; its middle is (500,150) mm, which is (50,15) pt at 10 mm per pt.
    expect(result.freePoints[0]!.x).toBeCloseTo(50, 9);
    expect(result.freePoints[0]!.y).toBeCloseTo(15, 9);
  });

  it('starts at a stub fitting with no new fitting', () => {
    const stub = { point: v(3000, 0), pagePoint: v(300.5, 0), fittingId: 'G' };
    const result = buildRouteItems(make([[v(3000, 0), v(8000, 0)]], [port('b', v(8000, 0))], v(3000, 0), { stubFitting: stub }));
    expect(result.fittings).toEqual([]);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.endpointA).toEqual({ kind: 'fitting', fittingId: 'G' });
    expect(result.segments[0]!.geometry[0]).toEqual(v(300.5, 0));
    expect(result.segments[0]!.geometry[1]).toEqual(v(800, 0));
  });

  it('uses the placeholder diameter of the discipline', () => {
    const input = make([[v(0, 0), v(1000, 0)]], [port('a', v(0, 0)), port('b', v(1000, 0))], v(0, 0), { discipline: 'heatingAndCooling' });
    expect(buildRouteItems(input).segments[0]!.diameter).toBe(25);
    expect(PLACEHOLDER_DIAMETER_MM.ventilation).toBe(200);
  });
});

describe('connectLoosePorts', () => {
  const trunk = [[v(0, 0), v(10000, 0)]];

  it('joins an entry-less port with one vertical leg and a tee', () => {
    const p = v(4000, 3000);
    const result = connectLoosePorts({ paths: trunk, startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] });
    expect(result.paths).toEqual([[v(4000, 0), v(4000, 3000)]]);
    expect(result.connectedIds).toEqual(['p']);
    expect(result.left).toEqual([]);
    const items = buildRouteItems(make([...trunk, ...result.paths], [port('s', v(0, 0)), port('x', v(10000, 0)), port('p', p)], v(0, 0)));
    expect(items.fittings.map((f) => [f.kind, f.position])).toEqual([['tee', v(400, 0)]]);
    expect(items.segments).toHaveLength(3);
    expect(items.lengthMm).toBeCloseTo(10000 + 3000, 6);
  });

  it('clamps the tap 300 mm from the vertex of a leg', () => {
    const p = v(100, 3000);
    const result = connectLoosePorts({ paths: trunk, startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] });
    expect(result.paths).toEqual([[v(300, 0), v(300, 3000), v(100, 3000)]]);
  });

  it('keeps 300 mm from another vertex on the leg', () => {
    const p = v(4000, 3000);
    const paths = [[v(0, 0), v(4100, 0), v(10000, 0)]];
    const result = connectLoosePorts({ paths, startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] });
    expect(result.paths[0]![0]).toEqual(v(3800, 0));
  });

  it('never taps a target port point', () => {
    const t = v(10000, 200);
    const p = v(10100, 250);
    const paths = [[v(0, 0), v(10000, 0)], [v(10000, 0), t]];
    const result = connectLoosePorts({ paths, startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [t, p] });
    expect(result.paths[0]![0]).toEqual(v(10000, 0));
  });

  it('rejects a connection leg that runs over another target port and takes another layout or candidate', () => {
    const p = v(6000, 3000);
    const other = v(6000, 2000);
    const base = { paths: [[v(0, 0), v(10000, 0)], [v(10000, 0), v(10000, 2000)]], startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p, other], noTapPoints: [v(0, 0)] };
    const result = connectLoosePorts(base);
    expect(result.paths).toEqual([[v(10000, 1700), v(10000, 3000), v(6000, 3000)]]);
    expect(result.left).toEqual([]);
    const free = connectLoosePorts({ ...base, targetPoints: [p] });
    expect(free.paths).toEqual([[v(6000, 0), v(6000, 3000)]]);
    expect(connectLoosePorts({ ...base, targetPoints: [p, other, v(8000, 3000)] }).left).toEqual(['p']);
  });

  it('takes the second layout when the stub rejects the first, and leaves the port when it rejects both', () => {
    const p = v(2000, 1000);
    const paths = [[v(0, 0), v(500, 0)]];
    const base = { paths, startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] };
    const first = connectLoosePorts({ ...base, accepts: (path) => path[1]!.y !== 0 });
    expect(first.paths).toEqual([[v(500, 0), v(500, 1000), v(2000, 1000)]]);
    const none = connectLoosePorts({ ...base, accepts: () => false });
    expect(none.paths).toEqual([]);
    expect(none.connectedIds).toEqual([]);
    expect(none.left).toEqual(['p']);
    const all = connectLoosePorts(base);
    expect(all.paths).toEqual([[v(500, 0), v(2000, 0), v(2000, 1000)]]);
  });

  it('connects two ports one after the other and lets the second tap the first connection', () => {
    const a = v(2000, 3000);
    const b = v(2500, 6000);
    const result = connectLoosePorts({
      paths: trunk,
      startPoint: v(0, 0),
      loose: [{ id: 'b', point: b }, { id: 'a', point: a }],
      targetPoints: [a, b],
    });
    expect(result.connectedIds).toEqual(['a', 'b']);
    expect(result.paths[0]).toEqual([v(2000, 0), v(2000, 3000)]);
    expect(result.paths[1]).toEqual([v(2000, 2700), v(2500, 2700), v(2500, 6000)]);
  });

  it('never taps a no-tap point such as the start port', () => {
    const p = v(-300, 200);
    const base = { paths: [[v(0, 0), v(500, 0)]], startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] };
    expect(connectLoosePorts(base).paths[0]![0]).toEqual(v(0, 0));
    expect(connectLoosePorts({ ...base, noTapPoints: [v(0, 0)] }).paths[0]![0]).toEqual(v(500, 0));
  });

  it('leaves a port whose connection has no length', () => {
    const p = v(4000, 0);
    const result = connectLoosePorts({ paths: trunk, startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] });
    expect(result.paths).toEqual([]);
    expect(result.connectedIds).toEqual([]);
    expect(result.left).toEqual(['p']);
  });

  it('taps the start point when the route has no leg', () => {
    const p = v(1000, 500);
    const result = connectLoosePorts({ paths: [], startPoint: v(0, 0), loose: [{ id: 'p', point: p }], targetPoints: [p] });
    expect(result.paths).toEqual([[v(0, 0), v(1000, 0), v(1000, 500)]]);
  });
});
