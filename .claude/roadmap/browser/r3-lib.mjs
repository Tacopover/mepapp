// Shared setup of the R3 browser checks (auto-routing-r3.md, T06b). Imports lib.mjs of the same folder.
// The scene API is used for setup and for reading state only. Each control is driven through the real DOM in the checks.
import { open as openPage, D } from './lib.mjs';

export { D };
export const open = openPage;

const TYPES = {
  'supply-air': { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' },
  'return-air': { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' },
};

/** Screen position of a page point (needs window.__mepSketchScene). */
export const screenOf = (page, p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);

/** The text of the status bar network count, for example "2 networks". */
export const networkCountText = (page) =>
  page.evaluate(() => {
    const m = /(\d+ networks?)/.exec((document.querySelector('.mep-status-counts, .mep-status')?.textContent ?? '').trim());
    return m ? m[1] : '';
  });

/** Places one stamp with real clicks (tile, then canvas). Returns after the stamp exists. Needs an open PDF. */
export async function placeOneStamp(t, at = { x: 650, y: 500 }) {
  const { page, idle } = t;
  await page.locator('button.mep-rail-btn[title="Stamp"]').first().click();
  await idle(400);
  await page.locator('.mep-stamp-tile').first().click();
  await idle(1000);
  await page.mouse.click(at.x, at.y);
  await idle(800);
  await page.keyboard.press('Escape');
  await page.locator('button.mep-rail-btn[title="Select"]').first().click();
  await idle(300);
}

/**
 * Builds the test project and reloads it with loadProjectFromJson. Needs an open PDF.
 * mode 'mixed': equipment stamp `ahu` with ports out and in and the group [out, in]; two supply-air segments from
 *   ahu.out (through a fitting); two return-air segments from ahu.in (through a fitting).
 * mode 'group': two supply-air segments, one on out, one on in, and the group [out, in]: one network.
 * Returns { aId, aPos, supplySegmentIds, returnSegmentIds, clickPoints } where clickPoints maps a segment id to a page point on it.
 */
export async function buildMixedGroupProject(t, mode = 'mixed') {
  const { page, idle } = t;
  await placeOneStamp(t);
  const built = await page.evaluate(
    ([mode, types]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      const a = p.stamps[0];
      if (!a) return null;
      a.category = 'equipment';
      a.ports = [
        { id: 'out', name: 'Supply out', fractionX: 1, fractionY: 0.3 },
        { id: 'in', name: 'Return in', fractionX: 1, fractionY: 0.7 },
      ];
      delete a.routingTargets;
      delete a.autoPlaced;
      const sx = a.transform.scale?.x ?? 1;
      const sy = a.transform.scale?.y ?? 1;
      const pos = a.transform.position;
      const out = { x: pos.x + 0.5 * a.nativeWidth * sx, y: pos.y - 0.2 * a.nativeHeight * sy };
      const inn = { x: pos.x + 0.5 * a.nativeWidth * sx, y: pos.y + 0.2 * a.nativeHeight * sy };
      const fit = (id, position) => ({ id, pageIndex: 0, position, kind: 'junction' });
      const seg = (id, type, from, to, geometry) => ({ id, pageIndex: 0, networkTypeId: type, shape: 'round', diameter: 10, endpointA: from, endpointB: to, geometry });
      const port = (portId) => ({ kind: 'port', elementId: a.id, portId });
      const f = (id) => ({ kind: 'fitting', fittingId: id });
      const add = (o, dx, dy) => ({ x: o.x + dx, y: o.y + dy });
      p.fittings = [];
      p.segments = [];
      p.portGroups = [{ elementId: a.id, portIds: ['out', 'in'] }];
      const points = {};
      if (mode === 'mixed') {
        const f1 = add(out, 100, -60);
        const f2 = add(f1, 140, 0);
        const f3 = add(inn, 100, 60);
        const f4 = add(f3, 140, 0);
        p.fittings.push(fit('fitting-1', f1), fit('fitting-2', f2), fit('fitting-3', f3), fit('fitting-4', f4));
        p.segments.push(
          seg('segment-1', 'supply-air', port('out'), f('fitting-1'), [out, f1]),
          seg('segment-2', 'supply-air', f('fitting-1'), f('fitting-2'), [f1, f2]),
          seg('segment-3', 'return-air', port('in'), f('fitting-3'), [inn, f3]),
          seg('segment-4', 'return-air', f('fitting-3'), f('fitting-4'), [f3, f4]),
        );
        points['segment-2'] = add(f1, 70, 0);
        points['segment-4'] = add(f3, 70, 0);
        p.networkTypes = [types['supply-air'], types['return-air']];
      } else {
        const f1 = add(out, 140, -60);
        const f3 = add(inn, 140, 60);
        p.fittings.push(fit('fitting-1', f1), fit('fitting-3', f3));
        p.segments.push(
          seg('segment-1', 'supply-air', port('out'), f('fitting-1'), [out, f1]),
          seg('segment-3', 'supply-air', port('in'), f('fitting-3'), [inn, f3]),
        );
        p.networkTypes = [types['supply-air']];
      }
      return { project: p, aId: a.id, aPos: pos, points };
    },
    [mode, TYPES],
  );
  if (!built) throw new Error('buildMixedGroupProject: no stamp was placed');
  await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(built.project));
  await idle(1500);
  return {
    aId: built.aId,
    aPos: built.aPos,
    supplySegmentIds: built.project.segments.filter((s) => s.networkTypeId === 'supply-air').map((s) => s.id),
    returnSegmentIds: built.project.segments.filter((s) => s.networkTypeId === 'return-air').map((s) => s.id),
    clickPoints: built.points,
  };
}

/** The network type id of each segment, from exportProject. */
export const segmentTypes = (page) =>
  page.evaluate(() => Object.fromEntries(window.__mepSketchScene.exportProject().segments.map((s) => [s.id, s.networkTypeId])));
