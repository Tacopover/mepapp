// R6 T19 check: undo, adoption and networks of scene.applyRoute (scene API).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t19-check.mjs
import { open, setupRooms, buildRoutingProject, baseline, exportRun, reachFromStart, screenOf } from './r6-lib.mjs';
import { colorPixelsIn } from './r4-lib.mjs';

const t = await open();
const { page, check, shot, finish, idle } = t;

const isSupply = (r, g, b) => b > 200 && g > 120 && g < 180 && r < 80;

const req = (ids) => ({ startStampId: 'ahu', startPortId: 'out', networkTypeId: 'supply-air', stampIds: ids });
const plan = (ids) =>
  page.evaluate((r) => {
    const s = window.__mepSketchScene;
    return JSON.parse(JSON.stringify(s.planRoute({ startStampId: r.startStampId, startPortId: r.startPortId, networkTypeId: r.networkTypeId, scope: { kind: 'stamps', stampIds: new Set(r.stampIds) }, includeOutsideRooms: true, portsPerStamp: 'one' })));
  }, req(ids));
const planApply = (ids) =>
  page.evaluate((r) => {
    const s = window.__mepSketchScene;
    const view = s.planRoute({ startStampId: r.startStampId, startPortId: r.startPortId, networkTypeId: r.networkTypeId, scope: { kind: 'stamps', stampIds: new Set(r.stampIds) }, includeOutsideRooms: true, portsPerStamp: 'one' });
    const done = s.applyRoute(view.plan, { size: false });
    return { view: JSON.parse(JSON.stringify(view)), done };
  }, req(ids));

/** Connected components of the segments (union-find over fittings and ports), as sorted id lists. */
const components = (page) =>
  page.evaluate(() => {
    const segs = window.__mepSketchScene.exportProject().segments;
    const key = (e) => (e.kind === 'port' ? `port:${e.elementId}:${e.portId}` : `fitting:${e.fittingId}`);
    const parent = new Map();
    const find = (x) => {
      if (!parent.has(x)) parent.set(x, x);
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)));
        x = parent.get(x);
      }
      return x;
    };
    for (const s of segs) parent.set(find(key(s.endpointA)), find(key(s.endpointB)));
    const groups = new Map();
    for (const s of segs) {
      const r = find(key(s.endpointA));
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(s.id);
    }
    return [...groups.values()].map((g) => g.sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  });

const portPoint = (stampId) =>
  page.evaluate((id) => {
    const st = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === id);
    const p = st.ports[0];
    const sx = st.transform.scale?.x ?? 1;
    const sy = st.transform.scale?.y ?? 1;
    return { x: st.transform.position.x + (p.fractionX - 0.5) * st.nativeWidth * sx, y: st.transform.position.y + (p.fractionY - 0.5) * st.nativeHeight * sy };
  }, stampId);

/** Reloads the project with extra hand-drawn items. */
const addItems = (extra) =>
  page.evaluate((extra) => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.fittings = [...p.fittings, ...extra.fittings];
    p.segments = [...p.segments, ...extra.segments];
    s.loadProjectFromJson(p);
  }, extra);

const longestMid = (pl) => {
  const best = pl.segments.map((s) => ({ s, len: Math.hypot(s.geometry[1].x - s.geometry[0].x, s.geometry[1].y - s.geometry[0].y) })).sort((a, c) => c.len - a.len)[0].s;
  return { x: (best.geometry[0].x + best.geometry[1].x) / 2, y: (best.geometry[0].y + best.geometry[1].y) / 2 };
};

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  const b = await buildRoutingProject(t, { targets: 3 });
  const base = await baseline(page);

  // 1. Rule 4: the type is not adopted before the run.
  await page.evaluate(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.networkTypes = [];
    s.loadProjectFromJson(p);
  });
  await idle(1200);
  const before = await page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes.map((n) => n.id));
  check(!before.includes('supply-air'), 'rule 4: supply-air is not adopted before the run (the loader adds only default)', JSON.stringify(before));
  const first = await plan(b.terminalIds);
  const mid = longestMid(first.plan);
  const r1 = await planApply(b.terminalIds);
  check(r1.done !== null, 'rule 4: applyRoute wrote the run');
  const adopted = await page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes.map((n) => n.id));
  check(adopted.includes('supply-air'), 'rule 4: networkTypes holds supply-air after the run', JSON.stringify(adopted));
  await page.evaluate((m) => {
    const s = window.__mepSketchScene;
    const r = s.app.canvas.getBoundingClientRect();
    s.world.position.set(r.width / 2 - m.x * s.world.scale.x, r.height / 2 - m.y * s.world.scale.y);
  }, mid);
  await idle(500);
  const at = await screenOf(page, mid);
  const px = await colorPixelsIn(page, at, isSupply);
  console.log(`library-colored pixels on the new line: ${px}`);
  check(px > 5, 'rule 4: the line draws in the library color, not the default look', String(px));
  await shot('T19-adopted-color');

  // 2. Rule 1 and 2: a foreign network that crosses the route in 2D stays its own network.
  await page.evaluate(({ b, mid }) => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.segments = [];
    p.fittings = [];
    p.networkTypes = [{ id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' }];
    s.loadProjectFromJson(p);
  }, { b, mid });
  await idle(1200);
  await addItems({
    fittings: [
      { id: 'x-f1', pageIndex: 0, position: { x: mid.x, y: mid.y - 20 }, kind: 'junction' },
      { id: 'x-f2', pageIndex: 0, position: { x: mid.x, y: mid.y + 20 }, kind: 'junction' },
    ],
    segments: [{ id: 'x-s1', pageIndex: 0, networkTypeId: 'return-air', shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'x-f1' }, endpointB: { kind: 'fitting', fittingId: 'x-f2' }, geometry: [{ x: mid.x, y: mid.y - 20 }, { x: mid.x, y: mid.y + 20 }] }],
  });
  await idle(1200);
  const r2 = await planApply(b.terminalIds);
  console.log(`foreign case: status ${r2.view.status}, warnings ${r2.view.plan.warnings.map((w) => w.code).join(',')}`);
  check(r2.done !== null, 'rule 1/2: the run is written beside a foreign network');
  const comps = await components(page);
  const foreignComp = comps.find((c) => c.includes('x-s1'));
  check(foreignComp && foreignComp.length === 1, 'rule 1/2: the old network keeps the same segment ids', JSON.stringify(foreignComp));
  const newComps = comps.filter((c) => !c.includes('x-s1'));
  check(newComps.length === 1 && newComps[0].length === r2.done.segments, 'rule 1/2: the new run is one network', `${newComps.length} components`);

  // 3. A foreign segment on the start port: refused, nothing written.
  const out = await portPoint('ahu');
  await page.evaluate(({ b }) => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.segments = [];
    p.fittings = [];
    s.loadProjectFromJson(p);
  }, { b });
  await idle(1200);
  await addItems({
    fittings: [{ id: 'y-f1', pageIndex: 0, position: { x: out.x + 100, y: out.y }, kind: 'junction' }],
    segments: [{ id: 'y-s1', pageIndex: 0, networkTypeId: 'return-air', shape: 'round', diameter: 200, endpointA: { kind: 'port', elementId: 'ahu', portId: 'out' }, endpointB: { kind: 'fitting', fittingId: 'y-f1' }, geometry: [out, { x: out.x + 100, y: out.y }] }],
  });
  await idle(1200);
  const baseF = await baseline(page);
  const r3 = await planApply(b.terminalIds);
  const codes = r3.view.plan.warnings.flatMap((w) => [w.code, ...(w.ids ?? [])]);
  console.log(`foreign start: status ${r3.view.status}, ${codes.join(',')}`);
  check(r3.view.status === 'refused' && codes.includes('port-foreign-type'), 'a foreign segment on the start port gives refused with port-foreign-type');
  check(r3.done === null && (await baseline(page)).project === baseF.project, 'applyRoute writes nothing for the refused plan');

  // 4. A hand-drawn stub of the same type: it stays, the route starts at its far end.
  await page.evaluate(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.segments = [];
    p.fittings = [];
    s.loadProjectFromJson(p);
  });
  await idle(1200);
  await addItems({
    fittings: [{ id: 'z-f1', pageIndex: 0, position: { x: out.x + 100, y: out.y }, kind: 'junction' }],
    segments: [{ id: 'z-s1', pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 200, endpointA: { kind: 'port', elementId: 'ahu', portId: 'out' }, endpointB: { kind: 'fitting', fittingId: 'z-f1' }, geometry: [out, { x: out.x + 100, y: out.y }] }],
  });
  await idle(1200);
  const r4 = await planApply(b.terminalIds);
  console.log(`stub: status ${r4.view.status}, warnings ${r4.view.plan.warnings.map((w) => w.code).join(',')}`);
  const run4 = await exportRun(page);
  const stub = run4.segments.find((s) => s.id === 'z-s1');
  check(r4.done !== null && stub && !stub.routedBy && stub.diameter === 200, 'stub: the hand-drawn segment stays unmarked with its size');
  check(run4.segments.some((s) => s.id !== 'z-s1' && [s.endpointA, s.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === 'z-f1')), 'stub: a new segment starts at the far end of the stub');
  const reach = await reachFromStart(page, 'ahu', 'out');
  check(JSON.stringify(reach) === JSON.stringify(b.terminalIds.map((id) => `port:${id}:in`).sort()), 'stub: the walk from the start reaches every target port', JSON.stringify(reach));

  // 5. planRoute twice gives equal plans.
  const p1 = await plan(b.terminalIds);
  const p2 = await plan(b.terminalIds);
  check(JSON.stringify(p1) === JSON.stringify(p2), 'planRoute twice gives equal plans');
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
