import { describe, expect, it } from 'vitest';
import { distance, type Vec2 } from './geometry.js';
import type { RouteArea, RouteAreaRoom, RouteEdge, RouteEntry, RouteLink, RouteNode, RouteNodeKind } from './route-area.js';
import { nearestOnEdges, splitEdgeAt, type GraphData } from './route-graph.js';
import { isLayoutPath } from './route-layout.js';
import { buildTrunk, type TrunkInput, type TrunkResult } from './route-trunk.js';

const MM_PER_PT = 10;

type TestRoom = TrunkInput['rooms'][number];

function pt(p: Vec2): Vec2 {
  return { x: p.x / MM_PER_PT, y: p.y / MM_PER_PT };
}

function room(id: string, outerMm: Vec2[]): TestRoom {
  return { id, polygon: { outer: outerMm.map(pt), holes: [] } };
}

function rect(id: string, x0: number, y0: number, x1: number, y1: number): TestRoom {
  return room(id, [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]);
}

function pathNode(roomId: string, k: number, xMm: number, yMm: number, kind: RouteNodeKind = 'end'): RouteNode {
  return { id: `rn-${roomId}-${k}`, point: pt({ x: xMm, y: yMm }), kind, roomId };
}

function pathEdge(roomId: string, k: number, fromId: string, toId: string, pointsMm: Vec2[]): RouteEdge {
  const points = pointsMm.map(pt);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  return { id: `re-${roomId}-${k}`, from: fromId, to: toId, kind: 'center', points, lengthMm: length * MM_PER_PT, roomId };
}

/** Copy of connectTo of route-area.ts. */
function connect(graph: GraphData, areaRoomId: string, wallNode: RouteNode, tapNodeId: string, connectorId: string): void {
  if (!graph.nodes.includes(wallNode)) graph.nodes.push(wallNode);
  const near = nearestOnEdges(graph, wallNode.point, (e) => e.kind === 'center' && e.roomId === areaRoomId);
  const targetId =
    near === null
      ? graph.nodes.find((n) => n.roomId === areaRoomId && n.kind !== 'wall' && n.kind !== 'tap')!.id
      : splitEdgeAt(graph, near.edgeId, near.segment, near.point, tapNodeId);
  const target = graph.nodes.find((n) => n.id === targetId)!;
  graph.edges.push({
    id: connectorId,
    from: wallNode.id,
    to: target.id,
    kind: 'connector',
    points: [{ ...wallNode.point }, { ...target.point }],
    lengthMm: distance(wallNode.point, target.point) * MM_PER_PT,
    roomId: null,
  });
}

function addEntry(graph: GraphData, servedRoomId: string, areaRoomId: string, wallMm: Vec2, runMm = 1000, primary = true): RouteEntry {
  const entryId = `ry-${servedRoomId}-${areaRoomId}`;
  const wallNode: RouteNode = { id: `rw-${servedRoomId}-${areaRoomId}`, point: pt(wallMm), kind: 'wall', roomId: servedRoomId };
  connect(graph, areaRoomId, wallNode, `rt-${entryId}-0`, `rc-${entryId}-0`);
  return {
    id: entryId,
    roomId: servedRoomId,
    areaRoomId,
    nodeId: wallNode.id,
    point: pt(wallMm),
    runMm,
    gapMm: 0,
    primary,
    shaft: false,
  };
}

function addLink(graph: GraphData, a: string, b: string, wallMm: Vec2): RouteLink {
  const linkId = `rk-${a}-${b}`;
  const wallNode: RouteNode = { id: `rl-${a}-${b}`, point: pt(wallMm), kind: 'wall', roomId: a };
  connect(graph, a, wallNode, `rt-${linkId}-0`, `rc-${linkId}-0`);
  connect(graph, b, wallNode, `rt-${linkId}-1`, `rc-${linkId}-1`);
  return { id: linkId, roomIds: [a, b], nodeId: wallNode.id, point: pt(wallMm), runMm: 1000, gapMm: 0, shaft: false };
}

function areaRoom(roomId: string, kind: 'path' | 'shaft' = 'path'): RouteAreaRoom {
  return { roomId, kind, typeId: kind === 'shaft' ? 'shaft' : 'corridor', open: false, name: null };
}

function makeArea(rooms: RouteAreaRoom[], graph: GraphData, entries: RouteEntry[], links: RouteLink[] = []): RouteArea {
  return { status: 'ok', rooms, nodes: graph.nodes, edges: graph.edges, entries, links, unreached: [], parts: 1 };
}

function straightCorridor(): { graph: GraphData; rooms: TestRoom[] } {
  const graph: GraphData = {
    nodes: [pathNode('c1', 0, 0, 0), pathNode('c1', 1, 20000, 0)],
    edges: [pathEdge('c1', 0, 'rn-c1-0', 'rn-c1-1', [{ x: 0, y: 0 }, { x: 20000, y: 0 }])],
  };
  return { graph, rooms: [rect('c1', 0, -1000, 20000, 1000)] };
}

function pathLength(result: TrunkResult): number {
  let total = 0;
  for (const edge of result.edges) {
    for (let i = 1; i < edge.path.length; i++) total += distance(edge.path[i - 1]!, edge.path[i]!);
  }
  return total;
}

function threeRoomScene(): TrunkInput {
  const { graph, rooms } = straightCorridor();
  const entries = [
    addEntry(graph, 'r1', 'c1', { x: 5000, y: -1000 }),
    addEntry(graph, 'r2', 'c1', { x: 12000, y: 1000 }),
    addEntry(graph, 'r3', 'c1', { x: 18000, y: -1000 }),
  ];
  return {
    area: makeArea([areaRoom('c1')], graph, entries),
    rooms,
    mmPerPt: MM_PER_PT,
    startPointMm: { x: 0, y: -100 },
    servedRoomIds: ['r1', 'r2', 'r3'],
  };
}

describe('buildTrunk', () => {
  it('builds a straight trunk along a corridor to three rooms', () => {
    const result = buildTrunk(threeRoomScene());
    expect(result.rootNodeId).toBe('rn-c1-0');
    expect(result.rootPointMm).toEqual({ x: 0, y: 0 });
    expect(result.startDistanceMm).toBeCloseTo(100);
    expect(result.edges.map((e) => [e.fromNodeId, e.toNodeId])).toEqual([
      ['rn-c1-0', 'rt-ry-r1-c1-0'],
      ['rt-ry-r1-c1-0', 'rt-ry-r2-c1-0'],
      ['rt-ry-r2-c1-0', 'rt-ry-r3-c1-0'],
    ]);
    expect(result.edges.map((e) => e.id)).toEqual([
      're-c1-0',
      're-c1-0~rt-ry-r1-c1-0',
      're-c1-0~rt-ry-r1-c1-0~rt-ry-r2-c1-0',
    ]);
    expect(result.edges.map((e) => e.path)).toEqual([
      [{ x: 0, y: 0 }, { x: 5000, y: 0 }],
      [{ x: 5000, y: 0 }, { x: 12000, y: 0 }],
      [{ x: 12000, y: 0 }, { x: 18000, y: 0 }],
    ]);
    expect(result.edges.every((e) => !e.free && e.kind === 'center')).toBe(true);
    expect(result.edges.some((e) => e.id.startsWith('rc-ry-'))).toBe(false);
    expect(result.served.map((s) => [s.roomId, s.tapNodeId, s.entryPointMm])).toEqual([
      ['r1', 'rt-ry-r1-c1-0', { x: 5000, y: -1000 }],
      ['r2', 'rt-ry-r2-c1-0', { x: 12000, y: 1000 }],
      ['r3', 'rt-ry-r3-c1-0', { x: 18000, y: -1000 }],
    ]);
    expect(result.offGraphRoomIds).toEqual([]);
    expect(result.freeEdges).toEqual([]);
  });

  it('passes the split node of a room that is not served', () => {
    const input = threeRoomScene();
    const result = buildTrunk({ ...input, servedRoomIds: ['r1', 'r3'] });
    expect(result.edges[result.edges.length - 1]!.toNodeId).toBe('rt-ry-r3-c1-0');
    expect(pathLength(result)).toBeCloseTo(18000);
    expect(result.served.map((s) => s.roomId)).toEqual(['r1', 'r3']);
  });

  it('splits the nearest edge for a root in the middle', () => {
    const input = threeRoomScene();
    const result = buildTrunk({ ...input, startPointMm: { x: 8000, y: -100 }, servedRoomIds: ['r1', 'r3'] });
    expect(result.rootNodeId).toBe('rt-root');
    expect(result.rootPointMm).toEqual({ x: 8000, y: 0 });
    expect(result.edges.map((e) => e.id)).toEqual([
      're-c1-0~rt-ry-r1-c1-0',
      're-c1-0~rt-ry-r1-c1-0~rt-root',
      're-c1-0~rt-ry-r1-c1-0~rt-ry-r2-c1-0',
    ]);
    expect(result.edges[0]!.path).toEqual([{ x: 8000, y: 0 }, { x: 5000, y: 0 }]);
    expect(result.edges[1]!.path).toEqual([{ x: 8000, y: 0 }, { x: 12000, y: 0 }]);
    expect(result.edges[2]!.path).toEqual([{ x: 12000, y: 0 }, { x: 18000, y: 0 }]);
    for (const edge of result.edges) {
      expect(edge.path[0]).toEqual(result.nodePointsMm[edge.fromNodeId]);
      expect(edge.path[edge.path.length - 1]).toEqual(result.nodePointsMm[edge.toNodeId]);
    }
  });

  describe('links between corridors', () => {
    function linkScene(c2Start: number, wallX: number): TrunkInput {
      const graph: GraphData = {
        nodes: [
          pathNode('c1', 0, 0, 0),
          pathNode('c1', 1, 10000, 0),
          pathNode('c2', 0, c2Start, 0),
          pathNode('c2', 1, 20000, 0),
        ],
        edges: [
          pathEdge('c1', 0, 'rn-c1-0', 'rn-c1-1', [{ x: 0, y: 0 }, { x: 10000, y: 0 }]),
          pathEdge('c2', 0, 'rn-c2-0', 'rn-c2-1', [{ x: c2Start, y: 0 }, { x: 20000, y: 0 }]),
        ],
      };
      const link = addLink(graph, 'c1', 'c2', { x: wallX, y: 0 });
      const entry = addEntry(graph, 'r1', 'c2', { x: 19000, y: 1000 });
      return {
        area: makeArea([areaRoom('c1'), areaRoom('c2')], graph, [entry], [link]),
        rooms: [rect('c1', 0, -1000, 10000, 1000), rect('c2', c2Start, -1000, 20000, 1000)],
        mmPerPt: MM_PER_PT,
        startPointMm: { x: 0, y: 0 },
        servedRoomIds: ['r1'],
      };
    }

    it('passes the link connectors and leaves the entry connector out', () => {
      const result = buildTrunk(linkScene(10400, 10200));
      expect(result.edges.map((e) => [e.id, e.kind])).toEqual([
        ['re-c1-0', 'center'],
        ['rc-rk-c1-c2-0', 'link'],
        ['rc-rk-c1-c2-1', 'link'],
        ['re-c2-0', 'center'],
      ]);
      expect(result.edges.some((e) => e.id.startsWith('rc-ry-'))).toBe(false);
      expect(result.edges.every((e) => !e.free)).toBe(true);
      expect(result.edges.every((e) => isLayoutPath(e.path))).toBe(true);
      expect(result.freeEdges).toEqual([]);
      expect(result.served.map((s) => s.roomId)).toEqual(['r1']);
    });

    it('marks the connectors of a wide gap as free', () => {
      const result = buildTrunk(linkScene(12400, 11200));
      const ids = result.edges.filter((e) => e.free).map((e) => e.id);
      expect(ids).toEqual(['rc-rk-c1-c2-0', 'rc-rk-c1-c2-1']);
      expect(result.freeEdges.map((f) => f.edgeId)).toEqual(ids);
      expect(result.freeEdges[0]!.pointMm).toEqual({ x: 10000, y: 0 });
    });
  });

  it('serves a room through its next entry when the first is in another graph part', () => {
    const { graph, rooms } = straightCorridor();
    graph.nodes.push(pathNode('c3', 0, 0, 50000), pathNode('c3', 1, 10000, 50000));
    graph.edges.push(pathEdge('c3', 0, 'rn-c3-0', 'rn-c3-1', [{ x: 0, y: 50000 }, { x: 10000, y: 50000 }]));
    rooms.push(rect('c3', 0, 49000, 10000, 51000));
    const entries = [
      addEntry(graph, 'r9', 'c3', { x: 5000, y: 49000 }),
      addEntry(graph, 'r8', 'c3', { x: 3000, y: 49000 }, 5000, true),
      addEntry(graph, 'r8', 'c1', { x: 3000, y: 1000 }, 2000, false),
    ];
    const result = buildTrunk({
      area: makeArea([areaRoom('c1'), areaRoom('c3')], graph, entries),
      rooms,
      mmPerPt: MM_PER_PT,
      startPointMm: { x: 0, y: 0 },
      servedRoomIds: ['r9', 'r8', 'r7'],
    });
    expect(result.served.map((s) => [s.roomId, s.entryId])).toEqual([['r8', 'ry-r8-c1']]);
    expect(result.offGraphRoomIds).toEqual(['r7', 'r9']);
  });

  it('roots at a shaft node', () => {
    const graph: GraphData = { nodes: [pathNode('s', 0, 0, 0, 'shaft')], edges: [] };
    const entry = addEntry(graph, 'r1', 's', { x: 500, y: 0 });
    const result = buildTrunk({
      area: makeArea([areaRoom('s', 'shaft')], graph, [entry]),
      rooms: [rect('s', -300, -300, 300, 300)],
      mmPerPt: MM_PER_PT,
      startPointMm: { x: 200, y: 100 },
      servedRoomIds: ['r1'],
    });
    expect(result.rootNodeId).toBe('rn-s-0');
    expect(result.edges).toEqual([]);
    expect(result.served.map((s) => [s.roomId, s.tapNodeId])).toEqual([['r1', 'rn-s-0']]);
  });

  describe('tilted corridor', () => {
    function tiltedScene(roomShape: TestRoom): TrunkInput {
      const graph: GraphData = {
        nodes: [pathNode('c1', 0, 0, 0), pathNode('c1', 1, 10000, 600)],
        edges: [pathEdge('c1', 0, 'rn-c1-0', 'rn-c1-1', [{ x: 0, y: 0 }, { x: 10000, y: 600 }])],
      };
      const entry = addEntry(graph, 'r1', 'c1', { x: 10000, y: 1000 });
      return {
        area: makeArea([areaRoom('c1')], graph, [entry]),
        rooms: [roomShape],
        mmPerPt: MM_PER_PT,
        startPointMm: { x: 0, y: 0 },
        servedRoomIds: ['r1'],
      };
    }

    it('straightens a tilted edge into a Z path', () => {
      const result = buildTrunk(tiltedScene(rect('c1', 0, -1000, 10000, 1600)));
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]!.path).toEqual([
        { x: 0, y: 0 },
        { x: 4700, y: 0 },
        { x: 5300, y: 600 },
        { x: 10000, y: 600 },
      ]);
      expect(result.edges[0]!.free).toBe(false);
    });

    it('keeps the original polyline and reports the edge as free in a thin room', () => {
      const thin = room('c1', [
        { x: 0, y: -50 },
        { x: 10000, y: 550 },
        { x: 10000, y: 650 },
        { x: 0, y: 50 },
      ]);
      const result = buildTrunk(tiltedScene(thin));
      expect(result.edges[0]!.free).toBe(true);
      expect(result.edges[0]!.path).toEqual([{ x: 0, y: 0 }, { x: 10000, y: 600 }]);
      expect(result.freeEdges).toEqual([{ edgeId: 're-c1-0', pointMm: { x: 0, y: 0 } }]);
    });
  });

  it('accepts a drift of the last vertex and starts the next edge there', () => {
    const graph: GraphData = {
      nodes: [pathNode('c1', 0, 0, 0), pathNode('c1', 1, 5000, 100, 'bend'), pathNode('c1', 2, 12000, 100)],
      edges: [
        pathEdge('c1', 0, 'rn-c1-0', 'rn-c1-1', [{ x: 0, y: 0 }, { x: 5000, y: 100 }]),
        pathEdge('c1', 1, 'rn-c1-1', 'rn-c1-2', [{ x: 5000, y: 100 }, { x: 12000, y: 100 }]),
      ],
    };
    const entry = addEntry(graph, 'r1', 'c1', { x: 12000, y: 1000 });
    const result = buildTrunk({
      area: makeArea([areaRoom('c1')], graph, [entry]),
      rooms: [rect('c1', -500, -1000, 13000, 1000)],
      mmPerPt: MM_PER_PT,
      startPointMm: { x: 0, y: 0 },
      servedRoomIds: ['r1'],
    });
    expect(result.edges.map((e) => e.toNodeId)).toEqual(['rn-c1-1', 'rn-c1-2']);
    expect(result.nodePointsMm['rn-c1-1']).toEqual({ x: 5000, y: 0 });
    expect(result.edges[1]!.path[0]).toEqual({ x: 5000, y: 0 });
    expect(result.nodePointsMm['rn-c1-2']).toEqual({ x: 12000, y: 0 });
    for (const [id, p] of Object.entries(result.nodePointsMm)) {
      const graphNode = graph.nodes.find((n) => n.id === id)!;
      expect(distance(p, { x: graphNode.point.x * MM_PER_PT, y: graphNode.point.y * MM_PER_PT })).toBeLessThan(150);
    }
    expect(result.edges.every((e) => isLayoutPath(e.path))).toBe(true);
  });

  it('does not change the input and gives the same result twice', () => {
    const input = threeRoomScene();
    const clone = structuredClone(input.area);
    const first = buildTrunk(input);
    const second = buildTrunk(input);
    expect(input.area).toEqual(clone);
    expect(second).toEqual(first);
  });

  it('does not change the input when the root splits an edge', () => {
    const input = { ...threeRoomScene(), startPointMm: { x: 8000, y: -100 } };
    const clone = structuredClone(input.area);
    const result = buildTrunk(input);
    expect(result.rootNodeId).toBe('rt-root');
    expect(input.area).toEqual(clone);
  });

  it('gives no root for an empty area', () => {
    const area: RouteArea = { status: 'no-rooms', rooms: [], nodes: [], edges: [], entries: [], links: [], unreached: [], parts: 0 };
    const result = buildTrunk({ area, rooms: [], mmPerPt: MM_PER_PT, startPointMm: { x: 0, y: 0 }, servedRoomIds: ['b', 'a', 'b'] });
    expect(result.rootNodeId).toBeNull();
    expect(result.rootPointMm).toBeNull();
    expect(result.startDistanceMm).toBeNull();
    expect(result.edges).toEqual([]);
    expect(result.nodePointsMm).toEqual({});
    expect(result.served).toEqual([]);
    expect(result.offGraphRoomIds).toEqual(['a', 'b']);
  });
});
