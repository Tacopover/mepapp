// Shared setup of the R6 browser checks (auto-routing-r6.md, T14). Imports lib.mjs of the same folder.
// The scene API is used for setup and for reading state only. Each control is driven through the real DOM in the checks.
import { D, open } from './lib.mjs';
import { setupRooms, screenOf, baseline, sameAsBaseline } from './r4-lib.mjs';
import { placeOneStamp } from './r3-lib.mjs';
import { roomLabelPoint } from '/root/MepApp/.claude/worktrees/agent-framework/packages/core/dist/index.js';

export { D, open, setupRooms, screenOf, baseline, sameAsBaseline };

const TYPES = {
  'supply-air': { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' },
  'return-air': { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' },
  'heating-water': { id: 'heating-water', name: 'Heating Water', discipline: 'heatingAndCooling', units: 'GPM', defaultCapacity: 20, color: '#f44336', lineWidthPt: 2, linePattern: 'solid' },
};

const ringArea = (o) => {
  let a = 0;
  for (let i = 0; i < o.length; i++) {
    const p = o[i];
    const q = o[(i + 1) % o.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

/**
 * Builds a routing project and reloads it with loadProjectFromJson. Needs an open PDF with rooms detected (setupRooms, scale '50').
 * The largest corridor gets an equipment stamp (port out). The `targets` largest rooms that are no corridor and no shaft
 * get a terminal stamp (port in, routingTargets.in = type) at the label point. No segments, no fittings.
 * Returns { equipmentId, startPortId, terminalIds, roomIds, corridorId, type }.
 */
export async function buildRoutingProject(t, { type = 'supply-air', targets = 3, capacities = [] } = {}) {
  const { page, idle } = t;
  const stampCount = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.length);
  if (stampCount === 0) await placeOneStamp(t);
  const rooms = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.listRooms())));
  const sorted = rooms
    .map((r) => ({ id: r.id, roomTypeId: r.roomTypeId, area: ringArea(r.polygon.outer), at: roomLabelPoint(r) }))
    .sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const corridor = sorted.find((r) => r.roomTypeId === 'corridor');
  if (!corridor) throw new Error('buildRoutingProject: no corridor room');
  const served = sorted.filter((r) => r.roomTypeId !== 'corridor' && r.roomTypeId !== 'shaft').slice(0, targets);
  if (served.length < targets) throw new Error(`buildRoutingProject: only ${served.length} rooms for ${targets} targets`);
  const built = await page.evaluate(
    ([type, capacities, types, corridorAt, servedAt]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      const a = p.stamps[0];
      if (!a) return null;
      const scaleOf = (s) => [s.transform.scale?.x ?? 1, s.transform.scale?.y ?? 1];
      const placeAt = (s, port, at) => {
        const [sx, sy] = scaleOf(s);
        return { x: at.x - (port.fractionX - 0.5) * s.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * s.nativeHeight * sy };
      };
      const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
      const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
      const base = JSON.parse(JSON.stringify(a));
      delete base.routingTargets;
      delete base.autoPlaced;
      const equipment = { ...JSON.parse(JSON.stringify(base)), id: 'ahu', category: 'equipment', ports: [outPort] };
      equipment.transform = { ...equipment.transform, position: placeAt(base, outPort, corridorAt) };
      const terms = servedAt.map((at, i) => {
        const s = JSON.parse(JSON.stringify(base));
        s.id = `term-${i + 1}`;
        s.category = 'terminal';
        s.ports = [inPort];
        s.routingTargets = { in: type };
        s.transform = { ...s.transform, position: placeAt(base, inPort, at) };
        return s;
      });
      p.stamps = [equipment, ...terms];
      p.segments = [];
      p.fittings = [];
      p.portGroups = [];
      p.terminalCapacities = Object.fromEntries(terms.map((s, i) => [s.id, capacities[i] ?? 100]));
      p.networkTypes = [types[type]];
      p.schemaVersion = 21;
      return { project: p, equipmentId: equipment.id, terminalIds: terms.map((s) => s.id) };
    },
    [type, capacities, TYPES, corridor.at, served.map((r) => r.at)],
  );
  if (!built) throw new Error('buildRoutingProject: no stamp was placed');
  await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(built.project));
  await idle(1500);
  return { equipmentId: built.equipmentId, startPortId: 'out', terminalIds: built.terminalIds, roomIds: served.map((r) => r.id), corridorId: corridor.id, type };
}

/**
 * A small hand-written routed run on top of buildRoutingProject(t, { targets: 2 }).
 * out -> r-s1 -> r-f1 -> r-s2 -> r-f2 -> r-s3 -> terminal 1 (in); r-f1 -> r-s4 -> terminal 2 (in). All carry routedBy 'route'.
 * Returns { equipmentId, terminalIds, segmentIds, fittingIds, points, type } where points maps an id to a page point
 * (fitting positions and segment midpoints).
 */
export async function buildRoutedSample(t) {
  const { page, idle } = t;
  const base = await buildRoutingProject(t, { targets: 2 });
  const built = await page.evaluate(
    ([base]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      const eq = p.stamps.find((s) => s.id === base.equipmentId);
      const terms = base.terminalIds.map((id) => p.stamps.find((s) => s.id === id));
      const portAt = (s, port) => {
        const sx = s.transform.scale?.x ?? 1;
        const sy = s.transform.scale?.y ?? 1;
        return { x: s.transform.position.x + (port.fractionX - 0.5) * s.nativeWidth * sx, y: s.transform.position.y + (port.fractionY - 0.5) * s.nativeHeight * sy };
      };
      const add = (o, dx, dy) => ({ x: o.x + dx, y: o.y + dy });
      const out = portAt(eq, eq.ports[0]);
      const t1 = portAt(terms[0], terms[0].ports[0]);
      const t2 = portAt(terms[1], terms[1].ports[0]);
      const f1 = add(out, 150, 0);
      const f2 = add(f1, 150, -150);
      const fit = (id, position) => ({ id, pageIndex: 0, position, kind: 'junction', routedBy: 'route' });
      const seg = (id, from, to, geometry) => ({ id, pageIndex: 0, networkTypeId: base.type, shape: 'round', diameter: 200, endpointA: from, endpointB: to, geometry, routedBy: 'route' });
      const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
      const f = (fittingId) => ({ kind: 'fitting', fittingId });
      p.fittings = [fit('r-f1', f1), fit('r-f2', f2)];
      p.segments = [
        seg('r-s1', port(eq.id, 'out'), f('r-f1'), [out, f1]),
        seg('r-s2', f('r-f1'), f('r-f2'), [f1, f2]),
        seg('r-s3', f('r-f2'), port(terms[0].id, 'in'), [f2, t1]),
        seg('r-s4', f('r-f1'), port(terms[1].id, 'in'), [f1, t2]),
      ];
      const points = { 'r-f1': f1, 'r-f2': f2 };
      for (const s of p.segments) {
        const g = s.geometry;
        points[s.id] = { x: (g[0].x + g[g.length - 1].x) / 2, y: (g[0].y + g[g.length - 1].y) / 2 };
      }
      return { project: p, points, segmentIds: p.segments.map((s) => s.id), fittingIds: p.fittings.map((x) => x.id) };
    },
    [base],
  );
  await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(built.project));
  await idle(1500);
  return { equipmentId: base.equipmentId, terminalIds: base.terminalIds, segmentIds: built.segmentIds, fittingIds: built.fittingIds, points: built.points, type: base.type };
}

/** The segments and fittings of exportProject (plain arrays). */
export const exportRun = (page) =>
  page.evaluate(() => {
    const p = window.__mepSketchScene.exportProject();
    return JSON.parse(JSON.stringify({ segments: p.segments, fittings: p.fittings }));
  });

/** Each leg of each segment: { id, dx, dy, len, cls } with cls 'axis', 'diagonal' or 'free'. Computed in the page. */
export const legAngles = (page) =>
  page.evaluate(() => {
    const out = [];
    for (const s of window.__mepSketchScene.exportProject().segments) {
      const g = s.geometry ?? [];
      if (g.length < 2) continue;
      for (let i = 0; i + 1 < g.length; i++) {
        const dx = g[i + 1].x - g[i].x;
        const dy = g[i + 1].y - g[i].y;
        const len = Math.hypot(dx, dy);
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        const cls = Math.min(ax, ay) <= 1e-6 * len ? 'axis' : Math.abs(ax - ay) <= 1e-6 * len ? 'diagonal' : 'free';
        out.push({ id: s.id, dx, dy, len, cls });
      }
    }
    return out;
  });

/** The sorted stamp port keys (`port:<stamp>:<port>`) reachable from the start port through segments. */
export const reachFromStart = (page, stampId, portId) =>
  page.evaluate(
    ([stampId, portId]) => {
      const segments = window.__mepSketchScene.exportProject().segments;
      const key = (e) => (e.kind === 'port' ? `port:${e.elementId}:${e.portId}` : `fitting:${e.fittingId}`);
      const adj = new Map();
      const link = (a, b) => {
        if (!adj.has(a)) adj.set(a, []);
        adj.get(a).push(b);
      };
      for (const s of segments) {
        const a = key(s.endpointA);
        const b = key(s.endpointB);
        link(a, b);
        link(b, a);
      }
      const start = `port:${stampId}:${portId}`;
      const seen = new Set([start]);
      const queue = [start];
      const found = [];
      while (queue.length) {
        const n = queue.shift();
        for (const m of adj.get(n) ?? []) {
          if (seen.has(m)) continue;
          seen.add(m);
          if (m.startsWith('port:')) {
            found.push(m);
            continue;
          }
          queue.push(m);
        }
      }
      return found.sort();
    },
    [stampId, portId],
  );

/** The ids of the segments and fittings that carry routedBy, both sorted. */
export const markedIds = (page) =>
  page.evaluate(() => {
    const p = window.__mepSketchScene.exportProject();
    return {
      segments: p.segments.filter((s) => s.routedBy).map((s) => s.id).sort(),
      fittings: p.fittings.filter((f) => f.routedBy).map((f) => f.id).sort(),
    };
  });
