// R6 T03 check: a hand drag clears the route mark only on the moved fittings and the segments attached to them.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t03-check.mjs
import { open, setupRooms, buildRoutedSample, markedIds, exportRun, screenOf } from './r6-lib.mjs';

const t = await open();
const { page, check, shot, finish, idle } = t;

const undo = async () => {
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(500);
};
const drag = async (from, dx, dy) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await idle(600);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stampState = (id) =>
  page.evaluate((id) => {
    const s = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === id);
    return { position: s.transform.position, sx: s.transform.scale?.x ?? 1, sy: s.transform.scale?.y ?? 1, w: s.nativeWidth, h: s.nativeHeight };
  }, id);
const fittingPos = async (id) => (await exportRun(page)).fittings.find((f) => f.id === id).position;
const segs = async () => Object.fromEntries((await exportRun(page)).segments.map((s) => [s.id, s]));
const markNow = async () => JSON.stringify(await markedIds(page));
const inCanvas = (p, rect) => p.x > rect.left + 5 && p.x < rect.right - 5 && p.y > rect.top + 5 && p.y < rect.bottom - 5;

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });
  const r = await buildRoutedSample(t);
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(300);

  const rect = await page.evaluate(() => {
    const b = window.__mepSketchScene.app.canvas.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  });
  const allMarked = JSON.stringify({ segments: ['r-s1', 'r-s2', 'r-s3', 'r-s4'], fittings: ['r-f1', 'r-f2'] });
  check((await markNow()) === allMarked, 'baseline: 4 segments and 2 fittings marked', await markNow());

  // View: pan the content up with a real middle-button drag, then zoom out with real wheel steps (1/1.1 each).
  await page.mouse.move(600, 700);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(600, 100, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  await idle(300);
  await page.mouse.move(600, 240);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
  }
  await idle(400);

  // Screen points
  const eqS = await stampState(r.equipmentId);
  const t1S = await stampState(r.terminalIds[0]);
  const center = async (st) => screenOf(page, st.position); // transform.position is the stamp center (hit test: pointInRotatedRect)
  const pt = {
    f1: await screenOf(page, r.points['r-f1']),
    f2: await screenOf(page, r.points['r-f2']),
    s1: await screenOf(page, r.points['r-s1']),
    s4: await screenOf(page, r.points['r-s4']),
    ahu: await center(eqS),
    term1: await center(t1S),
  };
  console.log('canvas ' + JSON.stringify(rect));
  console.log('screen points ' + JSON.stringify(pt));
  for (const [k, v] of Object.entries(pt)) {
    const moved = { x: v.x + 40, y: v.y + 40 };
    check(inCanvas(v, rect) && inCanvas(moved, rect), `point ${k} (and its drag target) lies inside the canvas`, JSON.stringify(v));
  }

  // Step 1: drag fitting r-f2
  const f2Before = await fittingPos('r-f2');
  await drag(pt.f2, 40, 30);
  let m = await markedIds(page);
  let f2After = await fittingPos('r-f2');
  console.log(`step 1: f2 ${JSON.stringify(f2Before)} -> ${JSON.stringify(f2After)}; marks ${JSON.stringify(m)}`);
  check(Math.hypot(f2After.x - f2Before.x, f2After.y - f2Before.y) > 5, 'step 1: r-f2 moved', JSON.stringify(f2After));
  check(same(m, { segments: ['r-s1', 'r-s4'], fittings: ['r-f1'] }), 'step 1: only r-f2, r-s2, r-s3 lost the mark', JSON.stringify(m));
  await undo();
  check((await markNow()) === allMarked, 'step 1 undo: marks are back', await markNow());
  check(same(await fittingPos('r-f2'), f2Before), 'step 1 undo: r-f2 position is back', JSON.stringify(await fittingPos('r-f2')));

  // Step 3: drag segment r-s4 by its midpoint
  const before3 = await segs();
  await drag(pt.s4, 0, 40);
  m = await markedIds(page);
  const after3 = await segs();
  const f1Now = await fittingPos('r-f1');
  const f2Now = await fittingPos('r-f2');
  console.log(`step 3: f1 -> ${JSON.stringify(f1Now)}, f2 -> ${JSON.stringify(f2Now)}; marks ${JSON.stringify(m)}`);
  console.log('step 3: r-s4 geometry before ' + JSON.stringify(before3['r-s4'].geometry) + ' after ' + JSON.stringify(after3['r-s4'].geometry));
  const f1Moved = Math.hypot(f1Now.x - r.points['r-f1'].x, f1Now.y - r.points['r-f1'].y) > 5;
  const f2Moved = Math.hypot(f2Now.x - r.points['r-f2'].x, f2Now.y - r.points['r-f2'].y) > 5;
  check(f1Moved, 'step 3: r-f1 moved with the segment drag');
  // Rule: cleared = every fitting the drag moves + every segment with an end on such a fitting.
  const moved = new Set([f1Moved && 'r-f1', f2Moved && 'r-f2'].filter(Boolean));
  const ends = (s) => [s.endpointA, s.endpointB].filter((e) => e.kind === 'fitting').map((e) => e.fittingId);
  const wantSegs = Object.values(before3)
    .filter((s) => !ends(s).some((id) => moved.has(id)))
    .map((s) => s.id)
    .sort();
  const wantFits = ['r-f1', 'r-f2'].filter((id) => !moved.has(id));
  check(same(m, { segments: wantSegs, fittings: wantFits }), 'step 3: marks cleared on exactly the moved fittings and their segments', `want ${JSON.stringify({ segments: wantSegs, fittings: wantFits })} got ${JSON.stringify(m)}`);
  check(same(m, { segments: ['r-s3'], fittings: ['r-f2'] }), 'step 3: r-s3 and r-f2 keep the mark, the rest lost it', JSON.stringify(m));
  await undo();
  check((await markNow()) === allMarked, 'step 3 undo: marks are back', await markNow());

  // Step 4: drag the start stamp
  const eqBefore = (await stampState(r.equipmentId)).position;
  await drag(pt.ahu, 30, 40);
  const eqAfter = (await stampState(r.equipmentId)).position;
  check(Math.hypot(eqAfter.x - eqBefore.x, eqAfter.y - eqBefore.y) > 5, 'step 4: ahu moved', JSON.stringify(eqAfter));
  check((await markNow()) === allMarked, 'step 4: all marks stay after the ahu drag', await markNow());
  await undo();
  check((await markNow()) === allMarked, 'step 4 undo: marks are back', await markNow());
  check(same((await stampState(r.equipmentId)).position, eqBefore), 'step 4 undo: ahu position is back');

  // Step 5: drag the terminal stamp term-1
  const t1Before = (await stampState(r.terminalIds[0])).position;
  await drag(pt.term1, 30, 40);
  const t1After = (await stampState(r.terminalIds[0])).position;
  check(Math.hypot(t1After.x - t1Before.x, t1After.y - t1Before.y) > 5, 'step 5: term-1 moved', JSON.stringify(t1After));
  check((await markNow()) === allMarked, 'step 5: all marks stay after the term-1 drag', await markNow());
  await undo();
  check((await markNow()) === allMarked, 'step 5 undo: marks are back', await markNow());
  check(same((await stampState(r.terminalIds[0])).position, t1Before), 'step 5 undo: term-1 position is back');

  // Step 6: network type change in the real Properties panel
  await page.mouse.click(pt.s1.x, pt.s1.y);
  await idle(500);
  const sel = page.locator('.mep-field-row:has(> label:text-is("Network Type")) select');
  const selCount = await sel.count();
  console.log(`step 6: Network Type selects found ${selCount}`);
  if (selCount === 0) {
    check(false, 'step 6: Network Type select is visible after the click on r-s1');
  } else {
    const opts = await sel.first().evaluate((el) => Array.from(el.options).map((o) => ({ value: o.value, text: o.text })));
    const cur = await sel.first().inputValue();
    console.log(`step 6: current ${cur}, options ${JSON.stringify(opts)}`);
    const other = opts.find((o) => o.value !== cur);
    if (!other) {
      check(false, 'step 6: the select lists another network type (not proved otherwise)');
    } else {
      await sel.first().selectOption(other.value);
      await idle(600);
      const after = await segs();
      const types = Object.values(after).map((s) => s.networkTypeId);
      check(types.length === 4 && types.every((x) => x === other.value), 'step 6: all 4 segments have the new network type', JSON.stringify(types));
      check((await markNow()) === allMarked, 'step 6: all marks stay after the type change', await markNow());
    }
  }

  await shot('t03-after-drags');
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
