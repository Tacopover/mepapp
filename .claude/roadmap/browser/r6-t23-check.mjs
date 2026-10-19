// R6 T23 check: re-run, hand edits and paste with the route mark (real DOM and real mouse).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t23-check.mjs
import { open, setupRooms, buildRoutingProject, screenOf, reachFromStart } from './r6-lib.mjs';
import { helpers, R } from './r6-ui-lib.mjs';

const t = await open();
const { page, check, shot, finish, idle } = t;
const H = helpers(t);
const { tid } = H;

const endKey = (e) => (e.kind === 'port' ? `p:${e.elementId}:${e.portId}` : `f:${e.fittingId}`);
/** An independent walk of the removal set (auto-routing-r6.md section 4.3 step 2), from the export. */
const walk = (e, stampId, portId) => {
  const attach = new Map();
  for (const s of e.segs) for (const end of [s.endpointA, s.endpointB]) {
    if (end.kind !== 'fitting') continue;
    if (!attach.has(end.fittingId)) attach.set(end.fittingId, []);
    attach.get(end.fittingId).push(s);
  }
  const isMarked = (s) => s.routedBy === 'route';
  const onPort = e.segs.filter((s) => endKey(s.endpointA) === `p:${stampId}:${portId}` || endKey(s.endpointB) === `p:${stampId}:${portId}`);
  const reached = new Set();
  const queue = [];
  const far = (s) => (endKey(s.endpointA) === `p:${stampId}:${portId}` ? s.endpointB : s.endpointA);
  if (onPort.length === 1 && isMarked(onPort[0])) {
    reached.add(onPort[0].id);
    if (far(onPort[0]).kind === 'fitting') queue.push(far(onPort[0]).fittingId);
  } else if (onPort.length === 1 && far(onPort[0]).kind === 'fitting') queue.push(far(onPort[0]).fittingId);
  const seen = new Set();
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const s of attach.get(f) ?? []) {
      if (!isMarked(s) || reached.has(s.id)) continue;
      reached.add(s.id);
      for (const end of [s.endpointA, s.endpointB]) if (end.kind === 'fitting') queue.push(end.fittingId);
    }
  }
  const fitIds = new Set();
  for (const s of e.segs) {
    if (!reached.has(s.id)) continue;
    for (const end of [s.endpointA, s.endpointB]) if (end.kind === 'fitting') fitIds.add(end.fittingId);
  }
  const markedFits = new Set(e.fits.filter((f) => f.routedBy === 'route').map((f) => f.id));
  const removable = [...fitIds].filter((id) => markedFits.has(id) && (attach.get(id) ?? []).every((s) => reached.has(s.id)));
  return { segments: reached.size, fittings: removable.length, segIds: [...reached], fitIds: removable };
};

const fresh = async (targets = 3) => {
  const b = await buildRoutingProject(t, { targets });
  return { ...b, off: [] };
};
const inCanvas = async (p) => {
  const at = await screenOf(page, p);
  const r = await page.evaluate(() => { const b = window.__mepSketchScene.app.canvas.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  return at.x > r.l + 20 && at.x < r.r - 20 && at.y > r.t + 20 && at.y < r.b - 20;
};
const section = async (name, fn) => {
  console.log(`\n=== ${name} ===`);
  try {
    await fn();
  } catch (e) {
    check(false, `${name}: ran to the end`, String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    await page.keyboard.press('Escape').catch(() => {});
  }
};
const dialogRerun = async (b, { type = 'supply-air', place = false } = {}) => {
  await H.openDialog();
  await H.selectInputs(type);
  if (b.off.length) await H.setRooms(b.off, false);
  await H.waitPlan();
  const rem = await H.removeNumbers();
  console.log(`lines: ${JSON.stringify(await H.lineCodes())}`);
  let result = null;
  if (place) {
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    result = (await tid('route-build-result').innerText()).trim();
    await H.closeDialog();
  }
  return { rem, result };
};
const keep = (e) => ({ n: e.segs.length, marked: e.marked.segments.length });

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });

  await section('1. re-run of a placed run', async () => {
    const b = await fresh();
    const r1 = await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    check(e1.marked.segments.length === r1.segments && e1.marked.fittings.length === r1.fittings, '1: run 1 marks exactly the placed items', JSON.stringify({ r1, m: [e1.marked.segments.length, e1.marked.fittings.length] }));
    await H.openDialog();
    const typeOptions = await tid('route-type').evaluate((el) => Array.from(el.options).map((o) => ({ value: o.value, text: o.text })));
    console.log(`type list after a full run, dialog reopened: ${JSON.stringify(typeOptions)}`);
    check(typeOptions.some((o) => o.value === 'supply-air' && o.text.includes('(0 open ports)')), '1: after a full run and a closed dialog the type list still offers the routed type with 0 open ports', JSON.stringify(typeOptions));
    check((await page.locator(`${R} [data-testid="route-no-ports"]`).count()) === 0, '1: the dialog does not say that no port waits for routing');
    await H.selectInputs('supply-air');
    await H.setRooms(b.off, false);
    const rem = await H.removeNumbers();
    console.log(`remove line: ${rem?.text}`);
    check(rem && rem.segments === e1.marked.segments.length && rem.fittings === e1.marked.fittings.length, '1: the remove line equals the marked counts in the export', JSON.stringify(rem));
    check(rem && rem.text.includes('Place route first removes'), '1: the remove line is worded as a note about the earlier run', rem?.text);
    const after = await tid('route-build-ports-after').innerText();
    check(after.includes('3 ports'), '1: ports-after counts the 3 ports of the run', after);
    await H.scrollTo('route-build-remove');
    await shot('T23-rerun-remove');
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const e2 = await H.exp();
    check(e2.segs.length === e1.segs.length && e2.fits.length === e1.fits.length, '1: the export counts are the same after the second Place', `${e2.segs.length}/${e2.fits.length} vs ${e1.segs.length}/${e1.fits.length}`);
    const old = new Set(e1.segs.map((s) => s.id));
    check(e2.segs.every((s) => !old.has(s.id)), '1: all segment ids are new');
    check(e2.marked.segments.length === e2.segs.length, '1: every segment of the new run is marked');
  });

  await section('0. hand-drawn stub at the start port', async () => {
    const b = await fresh();
    const out = await H.portPoint('ahu', 'out');
    await H.centerOn(out, 700, 500);
    await H.drawSegment(out, { x: out.x + 150, y: out.y });
    const e0 = await H.exp();
    check(e0.segs.length === 1 && e0.marked.segments.length === 0, '0: a real Segment tool draw makes one unmarked stub', JSON.stringify(e0.segs.map((s) => s.id)));
    const stub = e0.segs[0];
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.setRooms(b.off, false);
    const ext = await H.lineOf('extends-stub');
    check(ext && ext.severity === 'info', '0: the extends-stub Note shows', JSON.stringify(ext));
    check((await H.lineOf('removes-routed')) === null, '0: no removal line before the first run');
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    const res1 = (await tid('route-build-result').innerText()).trim();
    await H.closeDialog();
    const e1 = await H.exp();
    const n1 = +res1.match(/Placed (\d+)/)[1];
    check(e1.segs.length === 1 + n1 && e1.marked.segments.length === n1, '0: the stub stays and the run is added', `${e1.segs.length} segments, ${n1} placed`);
    const stub1 = e1.segs.find((s) => s.id === stub.id);
    check(stub1 && stub1.routedBy === undefined && stub1.diameter === stub.diameter, '0: the stub keeps its id, its size and no mark');
    const startsAtG = e1.segs.some((s) => s.routedBy === 'route' && [s.endpointA, s.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === stub.endpointB.fittingId));
    check(startsAtG, '0: the route starts at the far end G of the stub');
    const { rem } = await dialogRerun(b);
    console.log(`remove line (stub case): ${rem?.text}`);
    check(rem && rem.segments === n1 && rem.fittings === e1.marked.fittings.length, '0: the remove line counts the routed run only (not the stub)', JSON.stringify(rem));
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const e2 = await H.exp();
    check(e2.segs.length === e1.segs.length, '0: the run is not doubled (same segment count)', `${e2.segs.length} vs ${e1.segs.length}`);
    check(e2.segs.some((s) => s.id === stub.id) && e2.fits.some((f) => f.id === stub.endpointB.fittingId), '0: the stub and G are in the export after the second Place');
  });

  await section('2. a hand segment on a routed fitting', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const tees = e1.fits.filter((f) => e1.segs.filter((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'fitting' && e.fittingId === f.id)).length >= 3);
    const F = tees[0] ?? e1.fits[0];
    await H.centerOn(F.position, 800, 500);
    const around = [{ x: 0, y: -90 }, { x: 0, y: 90 }, { x: 90, y: 0 }, { x: -90, y: 0 }, { x: 70, y: 70 }, { x: -70, y: -70 }];
    const dist = (p, s) => {
      const a = s.geometry[0];
      const c = s.geometry[s.geometry.length - 1];
      const l2 = (c.x - a.x) ** 2 + (c.y - a.y) ** 2 || 1;
      const k = Math.max(0, Math.min(1, ((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / l2));
      return Math.hypot(p.x - (a.x + k * (c.x - a.x)), p.y - (a.y + k * (c.y - a.y)));
    };
    const free = around.map((d) => ({ x: F.position.x + d.x, y: F.position.y + d.y })).find((p) => e1.segs.every((s) => dist(p, s) > 30));
    await H.drawSegment(F.position, free);
    const e2 = await H.exp();
    const hand = e2.segs.filter((s) => s.routedBy === undefined);
    check(hand.length === 1 && [hand[0].endpointA, hand[0].endpointB].some((e) => e.kind === 'fitting' && e.fittingId === F.id), '2: the real Segment tool draws one unmarked segment from the routed fitting', JSON.stringify(hand.map((s) => s.id)));
    const want = walk(e2, 'ahu', 'out');
    const { rem } = await dialogRerun(b);
    console.log(`remove line (hand case): ${rem?.text}; independent walk ${JSON.stringify({ s: want.segments, f: want.fittings })}`);
    check(rem && rem.segments === want.segments && rem.fittings === want.fittings, '2: the remove line equals the independent walk', JSON.stringify(rem));
    check(rem && rem.fittings === e1.marked.fittings.length - 1, '2: the fitting under the hand segment is not counted', JSON.stringify(rem));
    await H.scrollTo('route-build-remove');
    await shot('T23-rerun-hand');
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const e3 = await H.exp();
    check(e3.segs.some((s) => s.id === hand[0].id) && e3.fits.some((f) => f.id === F.id), '2: the hand segment and its fitting are in the export after Place');
  });

  await section('3. a hand drag and 6b. a fitting between a marked and an unmarked segment', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const deg = (e, f) => e.segs.filter((s) => [s.endpointA, s.endpointB].some((x) => x.kind === 'fitting' && x.fittingId === f.id));
    await H.tool('Select');
    // A fitting next to a terminal port: the drag clears the end of the run and the rest of the run stays reachable.
    const leafFits = e1.fits.filter((f) => deg(e1, f).some((s) => [s.endpointA, s.endpointB].some((x) => x.kind === 'port' && x.elementId.startsWith('term-')))).sort((x, y) => deg(e1, x).length - deg(e1, y).length);
    let F = null;
    for (const f of leafFits) {
      await H.centerOn(f.position, 800, 500);
      if (await inCanvas({ x: f.position.x + 60, y: f.position.y + 50 })) { F = f; break; }
    }
    F = F ?? leafFits[0];
    await H.centerOn(F.position, 800, 500);
    const at = await screenOf(page, F.position);
    await H.drag(at, 60, 50);
    const e2 = await H.exp();
    const f2 = e2.fits.find((f) => f.id === F.id);
    check(Math.hypot(f2.position.x - F.position.x, f2.position.y - F.position.y) > 5, '3: the fitting moved with a real drag');
    const attached = new Set(deg(e1, F).map((s) => s.id));
    check(f2.routedBy === undefined && [...attached].every((id) => e2.segs.find((s) => s.id === id).routedBy === undefined), '3: the dragged fitting and its segments lost the mark');
    const want = walk(e2, 'ahu', 'out');
    const { rem } = await dialogRerun(b);
    console.log(`remove line (drag case): ${rem?.text}; independent walk ${JSON.stringify({ s: want.segments, f: want.fittings })}`);
    check(rem && rem.segments === want.segments && rem.fittings === want.fittings, '3: the remove line equals the independent walk and is lower than the run', JSON.stringify(rem));
    check(rem && rem.segments < e1.marked.segments.length, '3: the re-run count is lower than the run count', `${rem?.segments} vs ${e1.marked.segments.length}`);
    check(await tid('route-place').isEnabled(), '3: Place is enabled after a hand drag', JSON.stringify(await H.lineCodes()));
    if (!(await tid('route-place').isEnabled())) {
      await H.closeDialog();
      return;
    }
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const e3 = await H.exp();
    const kept = e3.fits.find((f) => f.id === F.id);
    check(kept && Math.abs(kept.position.x - f2.position.x) < 1e-6 && attached.size > 0 && [...attached].every((id) => e3.segs.some((s) => s.id === id)), '3: the dragged items stay after Place');
  });

  await section('3c. routed segments held by a hand-edited fitting', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const outP = await H.portPoint('ahu', 'out');
    const degOf = (f) => e1.segs.filter((s) => [s.endpointA, s.endpointB].some((x) => x.kind === 'fitting' && x.fittingId === f.id)).length;
    const dist = (f) => Math.hypot(f.position.x - outP.x, f.position.y - outP.y);
    const F = e1.fits.filter((f) => degOf(f) >= 3 && dist(f) > 60).sort((x, y) => dist(x) - dist(y))[0];
    await H.tool('Select');
    await H.centerOn(F.position, 800, 500);
    await H.drag(await screenOf(page, F.position), 60, 50);
    const e2 = await H.exp();
    const want = walk(e2, 'ahu', 'out');
    const held = e2.marked.segments.length;
    console.log(`marked segments left after the drag: ${held}; independent walk ${JSON.stringify({ s: want.segments, f: want.fittings })}`);
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const line = await H.lineOf('held-by-hand');
    const err = await H.lineOf('no-targets');
    console.log(`lines: ${JSON.stringify(await H.lineCodes())}; held-by-hand ${JSON.stringify(line)}`);
    check(line && line.severity === 'info' && line.text.includes(`${held - want.segments} routed segment`), '3c: the Note held-by-hand counts the routed segments that stay', JSON.stringify(line));
    check(err && err.severity === 'error', '3c: the no-targets Error shows with it');
    await H.scrollTo('route-build-line-held-by-hand', 'center');
    await shot('T23-held-by-hand');
    await H.closeDialog();
  });

  await section('4. a deleted routed segment', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const leaf = e1.segs.filter((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId.startsWith('term-'))).sort((x, y) => H.len(y) - H.len(x))[0];
    const mid = H.segmentMid(leaf);
    await H.tool('Select');
    await H.centerOn(mid, 800, 500);
    await H.click(mid);
    await page.keyboard.press('Delete');
    await idle(600);
    const e2 = await H.exp();
    check(e2.segs.length === e1.segs.length - 1 && !e2.segs.some((s) => s.id === leaf.id), '4: the Delete key removed the routed segment', `${e2.segs.length} vs ${e1.segs.length}`);
    const { rem } = await dialogRerun(b, { place: true });
    check(rem && rem.segments === e2.marked.segments.length, '4: the re-run removes the rest of the run', JSON.stringify(rem));
    const e3 = await H.exp();
    check(e3.segs.length === e1.segs.length && e3.marked.segments.length === e1.segs.length, '4: the run is rebuilt completely (same counts as run 1)', `${e3.segs.length} vs ${e1.segs.length}`);
    const reach = await reachFromStart(page, 'ahu', 'out');
    check(b.terminalIds.slice(0, 3).every((id) => reach.includes(`port:${id}:in`)), '4: the independent walk reaches every target port');
  });

  await section('5. copy and paste of a routed segment', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const seg = e1.segs.sort((x, y) => H.len(y) - H.len(x))[0];
    const mid = H.segmentMid(seg);
    await H.tool('Select');
    await H.centerOn(mid, 800, 500);
    await H.click(mid);
    await page.keyboard.press('Control+c');
    await idle(300);
    await page.keyboard.press('Control+v');
    await idle(700);
    const e2 = await H.exp();
    const added = e2.segs.filter((s) => !e1.segs.some((o) => o.id === s.id));
    check(added.length === 1, '5: the paste added one segment', String(added.length));
    check(added.length === 1 && added[0].routedBy === undefined, '5: the pasted segment has no mark');
    check(e2.marked.segments.length === e1.marked.segments.length, '5: the marked count did not change');
  });

  await section('6. insert and remove a fitting by the context menu', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const seg = e1.segs.sort((x, y) => H.len(y) - H.len(x))[0];
    const mid = H.segmentMid(seg);
    await H.tool('Select');
    await H.centerOn(mid, 800, 500);
    let at = await screenOf(page, mid);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await idle(400);
    await page.locator('button', { hasText: /Insert fitting here/ }).first().click();
    await idle(700);
    const e2 = await H.exp();
    const newFit = e2.fits.find((f) => !e1.fits.some((o) => o.id === f.id));
    check(newFit && newFit.routedBy === undefined, '6: Insert fitting makes an unmarked fitting', JSON.stringify(newFit));
    check(e2.segs.length === e1.segs.length + 1 && e2.marked.segments.length === e1.marked.segments.length + 1, '6: both pieces keep the mark');
    at = await screenOf(page, newFit.position);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await idle(400);
    await page.locator('button', { hasText: /Remove fitting/ }).first().click();
    await idle(700);
    const e3 = await H.exp();
    check(e3.segs.length === e1.segs.length && e3.marked.segments.length === e1.marked.segments.length, '6: removing it between two marked pieces gives a marked segment', `${e3.marked.segments.length} marked of ${e3.segs.length}`);
  });

  await section('6b. remove a fitting between a marked and an unmarked segment', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const degOf = (e, f) => e.segs.filter((s) => [s.endpointA, s.endpointB].some((x) => x.kind === 'fitting' && x.fittingId === f.id));
    const F = e1.fits.filter((f) => degOf(e1, f).length >= 3)[0];
    await H.tool('Select');
    await H.centerOn(F.position, 800, 500);
    await H.drag(await screenOf(page, F.position), 60, 50);
    const e2 = await H.exp();
    const outP = await H.portPoint('ahu', 'out');
    const g = e2.fits.find((f) => Math.hypot(f.position.x - outP.x, f.position.y - outP.y) > 60 && f.routedBy === 'route' && degOf(e2, f).length === 2 && degOf(e2, f).some((s) => s.routedBy === 'route') && degOf(e2, f).some((s) => s.routedBy === undefined));
    if (!g) {
      console.log('6b: no fitting with exactly one marked and one unmarked segment exists after the drag; step not covered');
      check(true, '6b: not covered (no such fitting in this layout)');
      return;
    }
    await H.centerOn(g.position, 800, 500);
    const at = await screenOf(page, g.position);
    await page.mouse.click(at.x, at.y);
    await idle(400);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await idle(400);
    console.log(`6b: context menu items ${JSON.stringify(await page.locator('.mep-context-menu button, [role="menu"] button').allInnerTexts())} ${JSON.stringify(await page.locator('.mep-draw-from-menu button').allInnerTexts())}; fitting ${g.id} at ${JSON.stringify(at)}`);
    await page.locator('button', { hasText: /Remove fitting/ }).first().click({ timeout: 4000 });
    await idle(700);
    const e3 = await H.exp();
    check(e3.segs.length === e2.segs.length - 1 && e3.marked.segments.length === e2.marked.segments.length - 1, '6b: the merged segment of a marked and an unmarked piece has no mark', `${e3.marked.segments.length} vs ${e2.marked.segments.length}`);
  });

  await section('7. change of the network type and a re-run with the new type', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const seg = e1.segs.sort((x, y) => H.len(y) - H.len(x))[0];
    await H.tool('Select');
    await H.centerOn(H.segmentMid(seg), 800, 500);
    await H.click(H.segmentMid(seg));
    const sel = page.locator('.mep-field-row:has(> label:text-is("Network Type")) select');
    await sel.first().waitFor({ timeout: 5000 });
    await sel.first().selectOption('return-air');
    await idle(700);
    const e2 = await H.exp();
    check(e2.segs.every((s) => s.networkTypeId === 'return-air') && e2.marked.segments.length === e1.marked.segments.length, '7: the whole run has the new type and keeps its marks');
    await H.reload(`for (const s of p.stamps) if (s.id.startsWith('term-')) s.routingTargets = { in: 'return-air' };`);
    const { rem } = await dialogRerun(b, { type: 'return-air', place: true });
    check(rem && rem.segments === e2.marked.segments.length, '7: the re-run with the new type counts the run', JSON.stringify(rem));
    const e3 = await H.exp();
    check(e3.segs.length === e1.segs.length && e3.segs.every((s) => s.networkTypeId === 'return-air'), '7: the run is replaced with the new type', `${e3.segs.length} vs ${e1.segs.length}`);
  });

  await section('8. move the start stamp', async () => {
    const b = await fresh();
    await H.placeRun({ roomsOff: b.off });
    const e1 = await H.exp();
    const ahu = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 'ahu').transform.position);
    await H.tool('Select');
    await H.centerOn(ahu, 800, 500);
    await H.drag(await screenOf(page, ahu), 30, 40);
    const moved = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 'ahu').transform.position);
    const e2 = await H.exp();
    check(Math.hypot(moved.x - ahu.x, moved.y - ahu.y) > 5, '8: the start stamp moved');
    check(e2.marked.segments.length === e1.marked.segments.length && e2.marked.fittings.length === e1.marked.fittings.length, '8: the marks stay after the stamp move');
  });

  await section('9. two runs, a shared terminal and a shared lane', async () => {
    const b = await fresh();
    await H.reload(
      `const term = p.stamps.find((s) => s.id === 'term-1');
       term.ports = [...term.ports, { id: 'in2', name: 'In 2', fractionX: 0, fractionY: 0.2 }];
       term.routingTargets = { in: 'supply-air', in2: 'supply-air' };
       p.portGroups = [{ elementId: 'term-1', portIds: ['in', 'in2'] }];`,
    );
    await H.addSecondEquipment(0, 0);
    const offA = [b.roomIds[2]];
    const offB = [b.roomIds[1]];
    await H.placeRun({ roomsOff: offA });
    const eA = await H.exp();
    await H.openDialog();
    await H.selectInputs('supply-air', 'out', 'ahu2');
    await H.setRooms(offB, false);
    console.log(`lines of run B: ${JSON.stringify(await H.lineCodes())}`);
    const lane = await H.lineOf('shares-lane');
    console.log(`shares-lane: ${JSON.stringify(lane)}`);
    check(lane && lane.severity === 'info' && (await page.locator(`${R} [data-testid="route-build-line-shares-lane"]`).count()) === 1, '10: the Note shares-lane shows once');
    check((await page.locator(`${R} [data-testid^="route-build-line-existing-overlap"]`).count()) <= 1, '10: no existing-overlap line for each leg');
    await H.scrollTo('route-build-line-shares-lane');
    await shot('T23-shared-lane');
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const eB = await H.exp();
    const idsA = eA.segs.map((s) => s.id);
    const idsB = eB.segs.filter((s) => !idsA.includes(s.id)).map((s) => s.id);
    const onIn2 = eB.segs.find((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId === 'term-1' && e.portId === 'in2'));
    const onIn = eB.segs.find((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId === 'term-1' && e.portId === 'in'));
    check(onIn && onIn2 && idsB.includes(onIn2.id) && idsA.includes(onIn.id), '9: term-1 has one segment of run A on in and one of run B on in2');
    const want = walk(eB, 'ahu', 'out');
    const { rem } = await dialogRerun({ off: offA }, { place: true });
    console.log(`remove line (run A): ${rem?.text}; independent walk ${JSON.stringify({ s: want.segments, f: want.fittings })}`);
    check(rem && rem.segments === want.segments && rem.segments === eA.segs.length, '9: the re-run of A counts only its own run', JSON.stringify(rem));
    const eC = await H.exp();
    check(idsB.every((id) => eC.segs.some((s) => s.id === id)), '9: every segment of run B is in the export after the re-run of A');
    const inAgain = eC.segs.find((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId === 'term-1' && e.portId === 'in'));
    check(inAgain && !idsA.includes(inAgain.id), '9: run A has a new segment on in, and the segment on in2 of run B stays');
  });
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
