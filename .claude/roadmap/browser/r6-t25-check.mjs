// R6 T25 check: extension of a stub, gravity, capacity, foreign network, water sides, no corridor, shaft (real dialog).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t25-check.mjs
import { existsSync } from 'node:fs';
import { open, setupRooms, buildRoutingProject, screenOf } from './r6-lib.mjs';
import { helpers, R } from './r6-ui-lib.mjs';
import { BASE } from './lib.mjs';
import { roomLabelPoint } from '/root/MepApp/.claude/worktrees/agent-framework/packages/core/dist/index.js';

const FIRST = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const TEN_A = '/root/MepApp/fixtures/pdfs/plattegrond begane grond 10A.pdf';
const SUGGESTED_AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1.0, shape: 'round', maxAspectRatio: 4, series: 'standard' };

const t = await open();
const { page, check, shot, finish, idle } = t;
const H = helpers(t);
const { tid } = H;

const section = async (name, fn) => {
  console.log(`\n=== ${name} ===`);
  try {
    await fn();
  } catch (e) {
    check(false, `${name}: ran to the end`, String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    await page.keyboard.press('Escape').catch(() => {});
  }
};
const withUnit = `p.networkTypes = p.networkTypes.map((n) => n.id === 'supply-air' ? { ...n, flowUnit: 'dm³/s', sizingMethod: 'air' } : n);`;
const components = () =>
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
const openRun = async (type = 'supply-air', roomsOff = [], port = 'out') => {
  await H.openDialog();
  await H.selectInputs(type, port);
  if (roomsOff.length) await H.setRooms(roomsOff, false);
  await H.waitPlan();
};

try {
  await setupRooms(t, { pdf: FIRST, scale: '50' });

  await section('1. extension of a hand-drawn stub with limits saved', async () => {
    const b = await buildRoutingProject(t, { targets: 4 });
    await H.reload(withUnit);
    await page.evaluate((s) => window.__mepSketchScene.setNetworkSizing('ahu', 'out', s), SUGGESTED_AIR);
    const out = await H.portPoint('ahu', 'out');
    await H.centerOn(out, 700, 500);
    await H.drawSegment(out, { x: out.x + 150, y: out.y });
    const e0 = await H.exp();
    const stub = e0.segs[0];
    await openRun('supply-air', b.roomIds.slice(3));
    const ext = await H.lineOf('extends-stub');
    const kept = await H.lineOf('hand-kept-size');
    console.log(`extends-stub: ${JSON.stringify(ext)}; hand-kept-size: ${JSON.stringify(kept)}`);
    check(ext && ext.severity === 'info', '1: extends-stub shows as a Note', JSON.stringify(ext));
    check(kept && kept.severity === 'info' && kept.text.includes('1 hand-drawn segment of this network keeps its size'), '1: hand-kept-size shows as a Note', JSON.stringify(kept));
    await H.scrollTo('route-build-line-extends-stub', 'center');
    await shot('T25-extends-stub');
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const e1 = await H.exp();
    const stub1 = e1.segs.find((s) => s.id === stub.id);
    check(stub1 && stub1.diameter === stub.diameter && stub1.routedBy === undefined, '1: the stub keeps its size and has no mark', JSON.stringify(stub1 && stub1.diameter));
    const diameters = [...new Set(e1.segs.filter((s) => s.routedBy === 'route').map((s) => s.diameter))];
    console.log(`routed diameters: ${JSON.stringify(diameters)}; stub ${stub.diameter}`);
    check(diameters.some((d) => d !== 200), '1: the routed segments are sized');
    check(e1.segs.some((s) => s.routedBy === 'route' && [s.endpointA, s.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === stub.endpointB.fittingId)), '1: the route starts at the far end of the stub');
    await openRun('supply-air', b.roomIds.slice(3));
    const rem = await H.removeNumbers();
    check(rem && rem.segments === e1.marked.segments.length && rem.fittings === e1.marked.fittings.length, '1: a re-run removes the routed part only', JSON.stringify(rem));
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const e2 = await H.exp();
    check(e2.segs.some((s) => s.id === stub.id && s.diameter === stub.diameter) && e2.segs.length === e1.segs.length, '1: the stub stays after the re-run and the run is not doubled');
  });

  await section('7. gravity: a Sanitary Waste run', async () => {
    const b = await buildRoutingProject(t, { targets: 3 });
    await H.reload(`for (const s of p.stamps) if (s.id.startsWith('term-')) s.routingTargets = { in: 'sanitary-waste' };`);
    await H.openDialog();
    const options = await tid('route-type').evaluate((el) => Array.from(el.options).map((o) => o.value));
    console.log(`type options with Sanitary Waste targets: ${JSON.stringify(options)}`);
    check(!options.includes('sanitary-waste'), '7: the dialog does not offer a gravity type (typeChoices leaves it out)', JSON.stringify(options));
    await shot('T25-gravity-not-offered');
    await H.closeDialog();
    const view = await page.evaluate((ids) => {
      const s = window.__mepSketchScene;
      const v = s.planRoute({ startStampId: 'ahu', startPortId: 'out', networkTypeId: 'sanitary-waste', scope: { kind: 'stamps', stampIds: new Set(ids) }, includeOutsideRooms: true, portsPerStamp: 'one' });
      return { status: v.status, codes: v.plan.warnings.map((w) => `${w.code}:${w.severity}`) };
    }, b.terminalIds);
    console.log(`scene plan for Sanitary Waste: ${JSON.stringify(view)}`);
    check(view.status === 'refused' && view.codes.includes('gravity-not-routed:error'), '7: the scene plan refuses with gravity-not-routed (Error)', JSON.stringify(view));
  });

  await section('3. capacity-over, 8. capacity-unit', async () => {
    await buildRoutingProject(t, { targets: 4 });
    await H.reload(`${withUnit} p.terminalCapacities.ahu = 300;`);
    await openRun();
    const over = await H.lineOf('capacity-over');
    console.log(`capacity-over: ${JSON.stringify(over)}`);
    check(over && over.severity === 'warning' && over.text.includes('400 dm³/s') && over.text.includes('300 dm³/s'), '3: capacity-over shows 400 and 300', JSON.stringify(over));
    await H.scrollTo('route-build-line-capacity-over', 'center');
    await shot('T25-capacity-over');
    await H.closeDialog();
    await H.reload('p.terminalCapacities.ahu = 500;');
    await openRun();
    check((await H.lineOf('capacity-over')) === null, '3: with start capacity 500 the line is gone');
    await H.closeDialog();
    await H.reload(`p.networkTypes = p.networkTypes.map((n) => { const { flowUnit, sizingMethod, ...rest } = n; return rest; }); p.terminalCapacities.ahu = 300;`);
    await openRun();
    const unit = await H.lineOf('capacity-unit');
    console.log(`capacity-unit: ${JSON.stringify(unit)}; capacity-over: ${JSON.stringify(await H.lineOf('capacity-over'))}`);
    check(unit && unit.severity === 'info' && (await H.lineOf('capacity-over')) === null, '8: a type with no flow unit gives the Note capacity-unit and no Warning', JSON.stringify(unit));
    await H.closeDialog();
  });

  await section('2. a foreign network in the corridor stays unchanged', async () => {
    const b = await buildRoutingProject(t, { targets: 3 });
    const plan = await page.evaluate((ids) => {
      const v = window.__mepSketchScene.planRoute({ startStampId: 'ahu', startPortId: 'out', networkTypeId: 'supply-air', scope: { kind: 'stamps', stampIds: new Set(ids) }, includeOutsideRooms: true, portsPerStamp: 'one' });
      return JSON.parse(JSON.stringify(v.plan.segments.map((s) => s.geometry)));
    }, b.terminalIds);
    const g = plan.map((p) => ({ p, len: Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) })).sort((x, y) => y.len - x.len)[0].p;
    const mid = { x: (g[0].x + g[1].x) / 2, y: (g[0].y + g[1].y) / 2 };
    await H.reload(
      `p.fittings = [{ id: 'x-f1', pageIndex: 0, position: { x: arg.x, y: arg.y - 20 }, kind: 'junction' }, { id: 'x-f2', pageIndex: 0, position: { x: arg.x, y: arg.y + 20 }, kind: 'junction' }];
       p.segments = [{ id: 'x-s1', pageIndex: 0, networkTypeId: 'return-air', shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'x-f1' }, endpointB: { kind: 'fitting', fittingId: 'x-f2' }, geometry: [{ x: arg.x, y: arg.y - 20 }, { x: arg.x, y: arg.y + 20 }] }];
       p.networkTypes = [...p.networkTypes, { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' }];`,
      mid,
    );
    await openRun();
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    const text = (await tid('route-build-result').innerText()).trim();
    await H.closeDialog();
    const comps = await components();
    const foreign = comps.find((c) => c.includes('x-s1'));
    check(foreign && foreign.length === 1, '2: the foreign network keeps the same segment ids', JSON.stringify(foreign));
    const placed = +text.match(/Placed (\d+)/)[1];
    const mine = comps.filter((c) => !c.includes('x-s1'));
    check(mine.length === 1 && mine[0].length === placed, '2: the new run is one network (independent union-find)', `${mine.length} components`);
  });

  await section('4. water: Flow and Return, radiators with two ports', async () => {
    const b = await buildRoutingProject(t, { type: 'heating-water', targets: 3 });
    await H.reload(
      `const boiler = p.stamps.find((s) => s.id === 'ahu');
       boiler.ports = [{ id: 'flow', name: 'Flow', fractionX: 1, fractionY: 0.3 }, { id: 'return', name: 'Return', fractionX: 1, fractionY: 0.7 }];
       const rotations = [0, 90, 180];
       p.stamps.filter((s) => s.id.startsWith('term-')).forEach((s, i) => {
         s.ports = [{ id: 'a', name: 'Port A', fractionX: 0, fractionY: 0.3 }, { id: 'b', name: 'Port B', fractionX: 0, fractionY: 0.7 }];
         s.routingTargets = { a: 'heating-water', b: 'heating-water' };
         s.transform = { ...s.transform, rotationDegrees: rotations[i % 3] };
       });`,
    );
    await openRun('heating-water', [], 'flow');
    const multi = await H.lineOf('multi-port-stamps');
    console.log(`multi-port-stamps: ${JSON.stringify(multi)}`);
    check(multi && multi.severity === 'info' && multi.text.includes('(port 1 of 2)') && multi.text.includes('Flow and return depend on the run order'), '4: the Note multi-port-stamps names the used port and says the sides depend on the run order', JSON.stringify(multi));
    await H.scrollTo('route-build-line-multi-port-stamps', 'center');
    await shot('T25-multi-port');
    await H.closeDialog();
    const r1 = await H.placeRun({ type: 'heating-water', port: 'flow' });
    const e1 = await H.exp();
    const endsOn = (e, id) => e.segs.filter((s) => [s.endpointA, s.endpointB].some((x) => x.kind === 'port' && x.elementId === id));
    const portsOf = (segs, id) => segs.flatMap((s) => [s.endpointA, s.endpointB]).filter((x) => x.kind === 'port' && x.elementId === id).map((x) => x.portId);
    const run1Ports = b.terminalIds.map((id) => portsOf(endsOn(e1, id), id));
    console.log(`run 1 ports per radiator: ${JSON.stringify(run1Ports)}`);
    check(run1Ports.every((p) => p.length === 1 && p[0] === 'a'), '4: run 1 from Flow connects port a of every radiator (stamp port order)', JSON.stringify(run1Ports));
    const r2 = await H.placeRun({ type: 'heating-water', port: 'return' });
    const e2 = await H.exp();
    const run2Ports = b.terminalIds.map((id) => portsOf(endsOn(e2, id), id).sort());
    console.log(`both runs, ports per radiator: ${JSON.stringify(run2Ports)}`);
    check(run2Ports.every((p) => p.length === 2 && p[0] === 'a' && p[1] === 'b'), '4: run 2 from Return takes port b of every radiator: one segment on each port', JSON.stringify(run2Ports));
    const comps = await components();
    check(comps.length === 2 && comps[0].length + comps[1].length === e2.segs.length, '4: the independent union-find shows two separate networks', `${comps.length} components`);
    check(r1.segments > 0 && r2.segments > 0, '4: both runs wrote segments', JSON.stringify([r1, r2]));
    await H.centerOn(await H.portPoint('ahu', 'flow'), 700, 500);
    await shot('T25-water-two-runs');
  });

  await section('6. a drawing with no corridor', async () => {
    await buildRoutingProject(t, { targets: 3 });
    await page.evaluate(() => {
      const s = window.__mepSketchScene;
      s.setRoomType(s.listRooms().map((r) => r.id), 'office');
    });
    await idle(1500);
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const line = await H.lineOf('area-empty');
    console.log(`area-empty: ${JSON.stringify(line)}`);
    check(line && line.severity === 'error', '6: a drawing with no corridor shows area-empty as an Error', JSON.stringify(line));
    check(!(await tid('route-place').isEnabled()), '6: route-place is disabled');
    await H.scrollTo('route-build-line-area-empty', 'center');
    await shot('T25-area-empty');
    await H.closeDialog();
  });

  await section('5. shaft-crossing on the 10A drawing (local file)', async () => {
    if (!existsSync(TEN_A)) {
      console.log('SKIP: the 10A PDF is not present');
      return;
    }
    await page.goto(BASE, { timeout: 180000 });
    await page.locator('button.mep-onboarding-start').click({ timeout: 4000 }).catch(() => {});
    await page.waitForFunction(() => window.__mepSketchScene !== undefined);
    await t.openPdf(TEN_A);
    await t.openAutoPlace();
    await t.detect('100');
    await page.keyboard.press('Escape');
    await idle(600);
    const b = await buildRoutingProject(t, { targets: 3 });
    const shaft = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.listRooms().filter((r) => r.roomTypeId === 'shaft'))));
    check(shaft.length > 0, '5: the 10A drawing has shaft rooms', String(shaft.length));
    const at = roomLabelPoint(shaft[0]);
    await H.reload(
      `const a = p.stamps.find((s) => s.id === 'ahu');
       const sx = a.transform.scale?.x ?? 1;
       const sy = a.transform.scale?.y ?? 1;
       a.transform = { ...a.transform, position: { x: arg.x - 0.5 * a.nativeWidth * sx, y: arg.y - 0 * sy } };`,
      at,
    );
    await openRun();
    const codes = await H.lineCodes();
    console.log(`10A lines: ${JSON.stringify(codes)}`);
    const line = await H.lineOf('shaft-crossing');
    check(line && line.severity === 'warning', '5: the shaft-crossing line shows as a Warning', JSON.stringify(codes));
    if (line) {
      const hint = await page.locator(`${R} [data-testid="route-build-lines"]`).innerText();
      check(hint.includes('Corridor and shaft walls are often fire rated.'), '5: the fire hint shows with it');
      await H.scrollTo('route-build-line-shaft-crossing', 'center');
    }
    await shot('T25-shaft-crossing');
    await H.closeDialog();
  });
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
