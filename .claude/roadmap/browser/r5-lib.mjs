// Shared setup of the R5 browser checks (auto-routing-r5.md, T10a). Imports lib.mjs of the same folder.
// The scene API is used for setup and for reading state only. Each control is driven through the real DOM in the checks.
import { open as openPage, D } from './lib.mjs';
import { placeOneStamp } from './r3-lib.mjs';

export { D };
export const open = openPage;

const TYPES = {
  'supply-air': { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' },
  'return-air': { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' },
  'heating-water': { id: 'heating-water', name: 'Heating Water', discipline: 'heatingAndCooling', units: 'GPM', defaultCapacity: 20, color: '#f44336', lineWidthPt: 2, linePattern: 'solid' },
};

/** Screen position of a page point (needs window.__mepSketchScene). */
export const screenOf = (page, p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);

/**
 * Builds a sizing test tree and reloads it with loadProjectFromJson. Needs an open PDF.
 * type 'air': equipment stamp `ahu` (port out), one main segment, two branch fittings, four terminal stamps (port in),
 *   all segments supply-air; the type has no flowUnit and no sizing.
 * type 'water': the same tree with heating-water (discipline heatingAndCooling).
 * type 'mixed': the main segment and the first branch are supply-air; the second branch is return-air.
 * Returns { equipmentId, startPortId, terminalIds, segmentIds, mainSegmentId, clickPoints } where clickPoints maps a
 * segment id to a page point on it.
 */
export async function buildSizingProject(t, { type = 'air', capacities = [100, 150, 50, 100], sizing = null, sizingMethod = null } = {}) {
  const { page, idle } = t;
  const stampCount = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.length);
  if (stampCount === 0) await placeOneStamp(t);
  const built = await page.evaluate(
    ([type, capacities, types, sizing, sizingMethod]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      const a = p.stamps[0];
      if (!a) return null;
      const scaleOf = (s) => [s.transform.scale?.x ?? 1, s.transform.scale?.y ?? 1];
      const portAt = (s, port) => {
        const [sx, sy] = scaleOf(s);
        return { x: s.transform.position.x + port.fractionX * s.nativeWidth * sx, y: s.transform.position.y + port.fractionY * s.nativeHeight * sy };
      };
      const placeAt = (s, port, at) => {
        const [sx, sy] = scaleOf(s);
        return { x: at.x - port.fractionX * s.nativeWidth * sx, y: at.y - port.fractionY * s.nativeHeight * sy };
      };
      const add = (o, dx, dy) => ({ x: o.x + dx, y: o.y + dy });
      const mainType = type === 'water' ? 'heating-water' : 'supply-air';
      const branchTypes = [mainType, type === 'mixed' ? 'return-air' : mainType];
      const outPort = { id: 'out', name: 'Supply out', fractionX: 1, fractionY: 0.5 };
      const inPort = { id: 'in', name: 'Return in', fractionX: 0, fractionY: 0.5 };
      a.category = 'equipment';
      a.ports = [outPort];
      delete a.routingTargets;
      delete a.autoPlaced;
      const term = (id, at) => {
        const s = JSON.parse(JSON.stringify(a));
        s.id = id;
        s.category = 'terminal';
        s.ports = [inPort];
        s.transform = { ...s.transform, position: placeAt(a, inPort, at) };
        return s;
      };
      const out = portAt(a, outPort);
      const f1 = add(out, 100, 0);
      const b1 = add(f1, 120, -80);
      const b2 = add(f1, 120, 80);
      const t1 = add(b1, 120, -40);
      const t2 = add(b1, 120, 40);
      const t3 = add(b2, 120, -40);
      const t4 = add(b2, 120, 40);
      const terms = [term('term-1', t1), term('term-2', t2), term('term-3', t3), term('term-4', t4)];
      const fit = (id, position) => ({ id, pageIndex: 0, position, kind: 'junction' });
      const seg = (id, networkTypeId, from, to, geometry) => ({ id, pageIndex: 0, networkTypeId, shape: 'round', diameter: 200, endpointA: from, endpointB: to, geometry });
      const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
      const f = (fittingId) => ({ kind: 'fitting', fittingId });
      const [bt1, bt2] = branchTypes;
      p.fittings = [fit('fitting-1', f1), fit('fitting-2', b1), fit('fitting-3', b2)];
      p.segments = [
        seg('segment-1', mainType, port(a.id, 'out'), f('fitting-1'), [out, f1]),
        seg('segment-2', bt1, f('fitting-1'), f('fitting-2'), [f1, b1]),
        seg('segment-3', bt2, f('fitting-1'), f('fitting-3'), [f1, b2]),
        seg('segment-4', bt1, f('fitting-2'), port('term-1', 'in'), [b1, t1]),
        seg('segment-5', bt1, f('fitting-2'), port('term-2', 'in'), [b1, t2]),
        seg('segment-6', bt2, f('fitting-3'), port('term-3', 'in'), [b2, t3]),
        seg('segment-7', bt2, f('fitting-3'), port('term-4', 'in'), [b2, t4]),
      ];
      p.portGroups = [];
      p.stamps = [a, ...terms];
      p.terminalCapacities = Object.fromEntries(terms.map((s, i) => [s.id, capacities[i]]));
      p.networkTypes = [...new Set(branchTypes.concat(mainType))].map((id) => (sizingMethod ? { ...types[id], sizingMethod } : types[id]));
      p.networkSizing = sizing ? [{ startStampId: a.id, startPortId: 'out', settings: sizing }] : [];
      p.schemaVersion = 20;
      const clickPoints = {};
      for (const s of p.segments) {
        const g = s.geometry;
        clickPoints[s.id] = { x: (g[0].x + g[g.length - 1].x) / 2, y: (g[0].y + g[g.length - 1].y) / 2 };
      }
      return { project: p, equipmentId: a.id, terminalIds: terms.map((s) => s.id), segmentIds: p.segments.map((s) => s.id), mainSegmentId: 'segment-1', clickPoints };
    },
    [type, capacities, TYPES, sizing, sizingMethod],
  );
  if (!built) throw new Error('buildSizingProject: no stamp was placed');
  await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(built.project));
  await idle(1500);
  return {
    equipmentId: built.equipmentId,
    startPortId: 'out',
    terminalIds: built.terminalIds,
    segmentIds: built.segmentIds,
    mainSegmentId: built.mainSegmentId,
    clickPoints: built.clickPoints,
  };
}

/** The size fields of each segment, from exportProject. */
export const segmentSizes = (page) =>
  page.evaluate(() => Object.fromEntries(window.__mepSketchScene.exportProject().segments.map((s) => [s.id, { shape: s.shape, diameter: s.diameter, width: s.width, height: s.height }])));

/** The state that the sizing must not change: project JSON, can-undo and the dirty flag of the active document. */
export const baseline = (page) =>
  page.evaluate(() => {
    const s = window.__mepSketchScene;
    const id = s.getActiveDocumentId();
    return { project: JSON.stringify(s.exportProject()), canUndo: s.getDrawingSummary().canUndo, isDirty: s.getDocuments().find((d) => d.id === id).isDirty };
  });

export async function sameAsBaseline(page, b) {
  const now = await baseline(page);
  return now.project === b.project && now.canUndo === b.canUndo && now.isDirty === b.isDirty;
}
