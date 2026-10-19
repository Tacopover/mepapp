// R6 T22 check: the Route section of the Route dialog (preview, warnings, Place, size, errors), real DOM inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t22-check.mjs
import { open, setupRooms, buildRoutingProject, baseline, sameAsBaseline, exportRun, screenOf, legAngles, reachFromStart, markedIds } from './r6-lib.mjs';
import { colorPixelsIn } from './r4-lib.mjs';

const R = '.mep-modal--route';
const t = await open();
const { page, check, shot, finish, idle } = t;
const tid = (id) => page.locator(`${R} [data-testid="${id}"]`);
const isSupply = (r, g, b) => b > 200 && g > 120 && g < 180 && r < 80;
const SUGGESTED_AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1.0, shape: 'round', maxAspectRatio: 4, series: 'standard' };

const openDialog = async () => {
  await page.locator('button.mep-menu-btn').click();
  await page.locator('button.mep-menu-item', { hasText: /^\s*Route network…\s*$/ }).click();
  await page.locator(R).waitFor({ state: 'visible', timeout: 5000 });
  await idle(600);
};
const closeDialog = async () => {
  await page.locator(`${R} .mep-modal-actions button, ${R} button`, { hasText: /^Close$/ }).first().click();
  await idle(500);
};
const selectInputs = async (type, port = 'out') => {
  await tid('route-start').selectOption('ahu');
  await tid('route-type').selectOption(type);
  await tid('route-port').selectOption(port);
};
const summaryNumbers = async () => {
  await tid('route-build-summary').waitFor({ state: 'visible', timeout: 8000 });
  const text = await tid('route-build-summary').innerText();
  const m = text.match(/(\d+) segments?, (\d+) fittings?, (\d+) m\. (\d+) rooms?, (\d+) ports?\./);
  return m ? { segments: +m[1], fittings: +m[2], length: +m[3], rooms: +m[4], ports: +m[5], text } : { text };
};
const lineOf = async (code) => {
  const l = tid(`route-build-line-${code}`);
  return (await l.count()) > 0 ? { text: (await l.first().innerText()).trim(), severity: await l.first().getAttribute('data-severity') } : null;
};
const planThroughScene = (type, uncheckedRoomIds = []) =>
  page.evaluate(([type, unchecked]) => {
    const s = window.__mepSketchScene;
    const roomIds = s.listRooms().filter((r) => r.pageIndex === s.getPageIndex() && !unchecked.includes(r.id)).map((r) => r.id);
    const v = s.planRoute({ startStampId: 'ahu', startPortId: 'out', networkTypeId: type, scope: { kind: 'rooms', roomIds: new Set(roomIds) }, includeOutsideRooms: true, portsPerStamp: 'one' });
    return JSON.parse(JSON.stringify({ status: v.status, stats: v.plan.stats, codes: v.plan.warnings.map((w) => w.code), segs: v.plan.segments.map((x) => x.geometry), hasLimits: v.hasLimits }));
  }, [type, uncheckedRoomIds]);
const openPortsCount = async () => Number((await page.locator('[data-testid="open-ports"] b').first().innerText()).trim());
const sameProject = async (b) => (await baseline(page)).project === b.project;
const undo = async () => {
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(700);
};
const reload = async (mutate, arg) => {
  await page.evaluate(([fn, arg]) => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    new Function('p', 'arg', fn)(p, arg);
    s.loadProjectFromJson(p);
  }, [mutate, arg ?? null]);
  await idle(1500);
};
const centerOn = async (p, x = 450) => {
  await page.evaluate(([p, x]) => {
    const s = window.__mepSketchScene;
    s.world.position.set(x - p.x * s.world.scale.x, 500 - p.y * s.world.scale.y);
  }, [p, x]);
  await idle(500);
};
const scrollTo = async (id, block) => {
  await tid(id).first().evaluate((el, b) => el.scrollIntoView({ block: b }), block);
  await idle(300);
};
const scrollToSection = async () => {
  await tid('route-build').scrollIntoViewIfNeeded();
  await idle(300);
};

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  const b = await buildRoutingProject(t, { targets: 3 });
  const base = await baseline(page);

  // 1. Open the dialog, pick the inputs through the real selects, see pending and then the summary.
  await openDialog();
  await selectInputs('supply-air');
  const pending = await tid('route-build-pending').waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);
  console.log(`pending line seen right after the input change: ${pending}`);
  const sum1 = await summaryNumbers();
  console.log(`summary: ${sum1.text.replace(/\n/g, ' | ')}`);
  const plan1 = await planThroughScene('supply-air');
  check(plan1.status === 'ok', '1: scene plan is ok', plan1.status);
  check(sum1.segments === plan1.stats.segments && sum1.fittings === plan1.stats.fittings && sum1.ports === plan1.stats.ports && sum1.rooms === plan1.stats.rooms,
    '1: the dialog numbers equal planRoute through the scene API', JSON.stringify({ sum1, stats: plan1.stats }));
  check(Math.abs(sum1.length - Math.round(plan1.stats.lengthMm / 1000)) < 1, '1: the length in m equals the plan', String(sum1.length));
  check(await tid('route-place').isEnabled(), '2: route-place is enabled');
  check((await tid('route-build-size').count()) === 0, '6: with no limits the size box does not show');
  const noLimits = await lineOf('no-limits');
  check(noLimits && noLimits.severity === 'warning' && noLimits.text.includes('Segments are not sized. Sizes shown are placeholders.'), '6: no-limits line is a Warning with the plan text', JSON.stringify(noLimits));

  // 2. The preview on the plan.
  const longest = plan1.segs.map((g) => ({ g, len: Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y) })).sort((a, c) => c.len - a.len)[0].g;
  const mid = { x: (longest[0].x + longest[1].x) / 2, y: (longest[0].y + longest[1].y) / 2 };
  await centerOn(mid);
  const px = await colorPixelsIn(page, await screenOf(page, mid), isSupply);
  console.log(`type-colored pixels at the longest planned segment: ${px}`);
  check(px > 5, '2: the preview draws in the type color', String(px));
  await scrollTo('route-build-summary', 'start');
  await shot('T22-route-preview');

  // 3. Off-graph rooms are served with warnings; no off-graph switch exists.
  const off = await lineOf('room-off-graph');
  check(off && off.severity === 'warning', '3: room-off-graph line is a Warning', JSON.stringify(off));
  check(off && /rooms? (is|are) outside the route area/.test(off.text), '3: the off-graph line text', off?.text);
  check(off && off.text.includes('The route serves them anyway:') && /\d\.\d+ /.test(off.text), '3: the off-graph line says the rooms are served and names them with the room number', off?.text);
  check((await tid('route-build-offgraph').count()) === 0 && (await page.locator(`${R} [data-testid*="offgraph"]`).count()) === 0, '3: no off-graph control exists');
  await scrollTo('route-build-line-room-off-graph', 'center');
  await shot('T22-route-offgraph');

  // 4. Warnings: wall crossings with label and fire hint.
  const wall = tid('route-build-line-wall-crossings');
  const wallText = (await wall.count()) > 0 ? (await wall.first().innerText()).trim() : '';
  check((await wall.count()) > 0 && (await wall.first().getAttribute('data-severity')) === 'warning', '8: wall-crossings line is a Warning');
  check(wallText.startsWith('Warning'), '8: the label reads Warning', wallText);
  const hintText = await page.locator(`${R} [data-testid="route-build-lines"]`).innerText();
  check(hintText.includes('Corridor and shaft walls are often fire rated.'), '8: the fire hint shows');
  await scrollTo('route-place', 'end');
  await shot('T22-route-warnings');

  // 5. Clear one R2 room check box: the summary changes and that room leaves the plan.
  const roomBox = page.locator(`${R} [data-testid="route-room"][data-room-id="${b.roomIds[0]}"]`);
  await roomBox.uncheck();
  const pending2 = await tid('route-build-pending').waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);
  check(pending2, '1: the pending line shows after an input change');
  await idle(900);
  const sum2 = await summaryNumbers();
  const plan2 = await planThroughScene('supply-air', [b.roomIds[0]]);
  check(sum2.ports === plan1.stats.ports - 1 && sum2.ports === plan2.stats.ports, '3: unchecking a room removes its port from the plan', JSON.stringify({ sum2, p: plan2.stats.ports }));
  check(sum2.segments === plan2.stats.segments, '3: the segment count equals the scene plan without that room', `${sum2.segments} vs ${plan2.stats.segments}`);
  await roomBox.check();
  await idle(1200);
  const sum3 = await summaryNumbers();
  check(sum3.segments === plan1.stats.segments, '3: checking the room again restores the plan', `${sum3.segments}`);

  // 6. Place.
  const before = await page.evaluate(() => { const p = window.__mepSketchScene.exportProject(); return { s: p.segments.length, f: p.fittings.length }; });
  const openBefore = await openPortsCount();
  await tid('route-place').click();
  await tid('route-build-result').waitFor({ state: 'visible', timeout: 5000 });
  const resultText = (await tid('route-build-result').innerText()).trim();
  const after = await page.evaluate(() => { const p = window.__mepSketchScene.exportProject(); return { s: p.segments.length, f: p.fittings.length }; });
  console.log(`result line: ${resultText}`);
  check(resultText === `Placed ${after.s - before.s} segments and ${after.f - before.f} fittings.`, '4: the result line equals the export difference', `${resultText} vs ${after.s - before.s}/${after.f - before.f}`);
  check(after.s - before.s === plan1.stats.segments && after.f - before.f === plan1.stats.fittings, '4: the written counts equal the plan', JSON.stringify(after));
  await idle(900);
  const openAfter = await openPortsCount();
  check(openAfter < openBefore, '4: the open-port count in the status bar goes down', `${openBefore} -> ${openAfter}`);
  const marks = await markedIds(page);
  check(marks.segments.length === after.s - before.s && marks.fittings.length === after.f - before.f, 'every new item has the mark and no other item has it', JSON.stringify({ s: marks.segments.length, f: marks.fittings.length }));
  const legs = await legAngles(page);
  check(legs.length > 0 && legs.every((l) => l.cls !== 'free'), 'every routed leg is axis or diagonal (independent test)', `${legs.filter((l) => l.cls === 'free').length} free`);
  const reach = await reachFromStart(page, 'ahu', 'out');
  check(reach.length === 3 && b.terminalIds.every((id) => reach.includes(`port:${id}:in`)), 'independent walk from the start port reaches every target port', JSON.stringify(reach));

  // 7. After Place the section stays: a re-run notice and the ports-after line (11).
  await idle(1200);
  const stillThere = await tid('route-build').count();
  check(stillThere === 1, '11: the Route section stays after Place (no open port is left)');
  await tid('route-build-remove').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const removeText = (await tid('route-build-remove').count()) > 0 ? (await tid('route-build-remove').innerText()).trim() : '';
  console.log(`remove line: ${removeText}`);
  check(removeText.includes(`Place route first removes ${after.s - before.s} segments and ${after.f - before.f} fittings of the earlier run. Hand-drawn segments stay.`), '11: the remove line counts the placed run', removeText);
  const portsAfter = (await tid('route-build-ports-after').count()) > 0 ? (await tid('route-build-ports-after').innerText()).trim() : '';
  check(portsAfter === 'After the removal, 3 ports are open for this run.', '11: ports-after line', portsAfter);
  const sum4 = await summaryNumbers();
  check(sum4.ports === 3, '11: the re-run plan still holds all ports of the run', String(sum4.ports));
  await scrollToSection();
  await shot('T22-route-placed');
  await scrollTo('route-build-remove', 'center');
  await shot('T22-route-rerun-note');

  // 8. Undo.
  // The backdrop of the dialog covers the rail, so the dialog closes before Undo (a user does the same).
  await closeDialog();
  await undo();
  const same = await sameProject(base);
  check(same, '5: Undo restores the export', JSON.stringify(same));
  await openDialog();
  await selectInputs('supply-air');
  await summaryNumbers();

  // 9. 400 px width.
  await page.setViewportSize({ width: 400, height: 900 });
  await idle(700);
  const fit = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null; }, R);
  check(fit && fit.sw <= fit.cw, '9: at 400 px the dialog has no horizontal scroll', JSON.stringify(fit));
  await scrollToSection();
  await shot('T22-route-narrow');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(500);

  // The app has no dark theme (no data-theme and no prefers-color-scheme rule), so there is no dark state to check.

  // 11. rooms-skipped: a foreign segment runs through the port of terminal 1.
  await closeDialog();
  const portPoint = await page.evaluate((id) => {
    const st = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === id);
    const p = st.ports[0];
    const sx = st.transform.scale?.x ?? 1;
    const sy = st.transform.scale?.y ?? 1;
    return { x: st.transform.position.x + (p.fractionX - 0.5) * st.nativeWidth * sx, y: st.transform.position.y + (p.fractionY - 0.5) * st.nativeHeight * sy };
  }, b.terminalIds[0]);
  await reload(
    `p.fittings = [{ id: 'x-f1', pageIndex: 0, position: { x: arg.x - 30, y: arg.y }, kind: 'junction' }, { id: 'x-f2', pageIndex: 0, position: { x: arg.x + 30, y: arg.y }, kind: 'junction' }];
     p.segments = [{ id: 'x-s1', pageIndex: 0, networkTypeId: 'return-air', shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'x-f1' }, endpointB: { kind: 'fitting', fittingId: 'x-f2' }, geometry: [{ x: arg.x - 30, y: arg.y }, { x: arg.x + 30, y: arg.y }] }];
     p.networkTypes = [...p.networkTypes, { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' }];`,
    portPoint,
  );
  await openDialog();
  await selectInputs('supply-air');
  await idle(1200);
  const skipped = await lineOf('rooms-skipped');
  console.log(`rooms-skipped line: ${JSON.stringify(skipped)}; ports-left: ${JSON.stringify(await lineOf('ports-left'))}`);
  check(skipped && skipped.severity === 'info' && skipped.text.startsWith('Note'), '3: rooms-skipped shows as a Note', JSON.stringify(skipped));
  check(skipped && skipped.text.includes('would join another network: ') && /\d\.\d+ /.test(skipped.text), '3: rooms-skipped names the room with its number', skipped?.text);
  await scrollToSection();
  await shot('T22-route-skipped');
  await closeDialog();

  // 12. Errors: a foreign segment on the start port; a drawing with no scale.
  await buildRoutingProject(t, { targets: 3 });
  const outPoint = await page.evaluate(() => {
    const st = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === 'ahu');
    const p = st.ports[0];
    const sx = st.transform.scale?.x ?? 1;
    const sy = st.transform.scale?.y ?? 1;
    return { x: st.transform.position.x + (p.fractionX - 0.5) * st.nativeWidth * sx, y: st.transform.position.y + (p.fractionY - 0.5) * st.nativeHeight * sy };
  });
  await reload(
    `p.fittings = [{ id: 'x-f1', pageIndex: 0, position: { x: arg.x + 40, y: arg.y }, kind: 'junction' }];
     p.segments = [{ id: 'x-s1', pageIndex: 0, networkTypeId: 'return-air', shape: 'round', diameter: 200, endpointA: { kind: 'port', elementId: 'ahu', portId: 'out' }, endpointB: { kind: 'fitting', fittingId: 'x-f1' }, geometry: [arg, { x: arg.x + 40, y: arg.y }] }];
     p.networkTypes = [...p.networkTypes, { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed' }];`,
    outPoint,
  );
  await openDialog();
  await selectInputs('supply-air');
  await idle(1200);
  const startErr = await lineOf('start-error');
  check(startErr && startErr.severity === 'error', '7: a foreign segment on the start port shows start-error as an Error', JSON.stringify(startErr));
  check(!(await tid('route-place').isEnabled()), '7: route-place is disabled on an error');
  await scrollToSection();
  await shot('T22-route-errors');
  await closeDialog();

  // 13. Heating water: placeholder diameter 25.
  await buildRoutingProject(t, { type: 'heating-water', targets: 3 });
  const baseW = await baseline(page);
  await openDialog();
  await selectInputs('heating-water');
  await summaryNumbers();
  await tid('route-place').click();
  await tid('route-build-result').waitFor({ state: 'visible', timeout: 5000 });
  const runW = await exportRun(page);
  check(runW.segments.length > 0 && runW.segments.every((s) => s.diameter === 25), '6: a Heating Water run has diameter 25 on every new segment', JSON.stringify([...new Set(runW.segments.map((s) => s.diameter))]));
  await closeDialog();
  await undo();
  check(await sameProject(baseW), '6: Undo of the water run restores the export');

  // 14. Limits saved: the size box shows, sizes are written and Undo removes them.
  await buildRoutingProject(t, { type: 'supply-air', targets: 3 });
  await reload(`p.networkTypes = p.networkTypes.map((n) => n.id === 'supply-air' ? { ...n, flowUnit: 'dm³/s', sizingMethod: 'air' } : n);`);
  await page.evaluate((s) => window.__mepSketchScene.setNetworkSizing('ahu', 'out', s), SUGGESTED_AIR);
  await idle(800);
  const baseS = await baseline(page);
  await openDialog();
  await selectInputs('supply-air');
  await summaryNumbers();
  await tid('route-build-size').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const sizeBox = tid('route-build-size');
  check((await sizeBox.count()) === 1 && (await sizeBox.isChecked()), '6: with limits saved the size box shows and is on');
  check((await lineOf('no-limits')) === null, '6: no no-limits line when the plan can size');
  await scrollToSection();
  await shot('T22-route-size');
  await tid('route-place').click();
  await tid('route-build-result').waitFor({ state: 'visible', timeout: 5000 });
  const runS = await exportRun(page);
  const diameters = [...new Set(runS.segments.map((s) => s.diameter))].sort((x, y) => x - y);
  console.log(`sized diameters: ${JSON.stringify(diameters)}`);
  check(runS.segments.length > 0 && diameters.some((d) => d !== 200), '6: Place with the box on writes sizes (not all 200)', JSON.stringify(diameters));
  const segMid = await page.evaluate(() => { const s = window.__mepSketchScene.exportProject().segments.sort((a, c) => Math.hypot(c.geometry[1].x - c.geometry[0].x, c.geometry[1].y - c.geometry[0].y) - Math.hypot(a.geometry[1].x - a.geometry[0].x, a.geometry[1].y - a.geometry[0].y))[0]; return { id: s.id, x: (s.geometry[0].x + s.geometry[1].x) / 2, y: (s.geometry[0].y + s.geometry[1].y) / 2, d: s.diameter }; });
  await closeDialog();
  await centerOn(segMid, 800);
  const at = await screenOf(page, segMid);
  await page.mouse.click(at.x, at.y);
  await idle(700);
  const panel = await page.evaluate(() => ({ text: document.body.innerText, values: [...document.querySelectorAll('input')].map((i) => i.value) }));
  console.log(`panel heading has ${segMid.id}: ${panel.text.includes(segMid.id)}; an input holds ${segMid.d}: ${panel.values.includes(String(segMid.d))}`);
  check(panel.text.includes(segMid.id), '6: a real click selects a sized segment (the panel names it)');
  check(panel.values.includes(String(segMid.d)), '6: the Properties panel shows the size', String(segMid.d));
  await shot('T22-route-size-properties');
  await undo();
  check(await sameProject(baseS), '6: Undo removes the route and its sizes');

  // 15. Box off: placeholders stay.
  await openDialog();
  await selectInputs('supply-air');
  await summaryNumbers();
  await tid('route-build-size').uncheck();
  await tid('route-place').click();
  await tid('route-build-result').waitFor({ state: 'visible', timeout: 5000 });
  const runP = await exportRun(page);
  check(runP.segments.length > 0 && runP.segments.every((s) => s.diameter === 200), '6: with the box off every new segment keeps the placeholder 200', JSON.stringify([...new Set(runP.segments.map((s) => s.diameter))]));
  await closeDialog();

  // 16. A drawing with no scale (last: it removes the calibration).
  await buildRoutingProject(t, { type: 'supply-air', targets: 3 });
  await reload('p.calibrations = {};');
  await openDialog();
  await selectInputs('supply-air');
  await idle(1200);
  const noCal = await lineOf('no-calibration');
  check(noCal && noCal.severity === 'error', '7: a drawing with no scale shows no-calibration as an Error', JSON.stringify(noCal));
  check(!(await tid('route-place').isEnabled()), '7: route-place is disabled with no scale');
  await scrollToSection();
  await shot('T22-route-no-scale');
  await closeDialog();
} finally {
  await finish();
}
