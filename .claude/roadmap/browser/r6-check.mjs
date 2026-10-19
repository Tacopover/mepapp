// R6 part check (auto-routing-r6.md T26): route a network through the real dialog on the first floor and on the 10A drawing.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-check.mjs
// The regression checks r2 to r5 run as separate commands, one at a time (one Chromium page and one dev server on port 5462).
import { existsSync } from 'node:fs';
import { open, setupRooms, buildRoutingProject, legAngles, reachFromStart, markedIds, screenOf } from './r6-lib.mjs';
import { colorPixelsIn } from './r4-lib.mjs';
import { helpers, R } from './r6-ui-lib.mjs';
import { BASE } from './lib.mjs';
import { roomLabelPoint } from '/root/MepApp/.claude/worktrees/agent-framework/packages/core/dist/index.js';

const FIRST = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const TEN_A = '/root/MepApp/fixtures/pdfs/plattegrond begane grond 10A.pdf';
const isSupply = (r, g, b) => b > 200 && g > 120 && g < 180 && r < 80;
const withUnit = `p.networkTypes = p.networkTypes.map((n) => n.id === 'supply-air' ? { ...n, flowUnit: 'dm³/s', sizingMethod: 'air' } : n);`;

const t = await open();
const { page, check, shot, finish, idle, menu, until, statusText } = t;
const H = helpers(t);
const { tid } = H;

const projectNow = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.exportProject())));
const stateNow = () =>
  page.evaluate(() => {
    const s = window.__mepSketchScene;
    return { project: JSON.stringify(s.exportProject()), canUndo: s.getDrawingSummary().canUndo };
  });
const planStats = (type = 'supply-air') =>
  page.evaluate((type) => {
    const s = window.__mepSketchScene;
    const roomIds = s.listRooms().filter((r) => r.pageIndex === s.getPageIndex()).map((r) => r.id);
    const t0 = performance.now();
    const v = s.planRoute({ startStampId: 'ahu', startPortId: 'out', networkTypeId: type, scope: { kind: 'rooms', roomIds: new Set(roomIds) }, includeOutsideRooms: true, portsPerStamp: 'one' });
    const ms = performance.now() - t0;
    return JSON.parse(JSON.stringify({ status: v.status, stats: v.plan.stats, codes: v.plan.warnings.map((w) => w.code), segs: v.plan.segments.map((x) => x.geometry), ms }));
  }, type);
const openPortsCount = async () => Number((await page.locator('[data-testid="open-ports"] b').first().innerText()).trim());
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
    return [...groups.values()].map((g) => g.sort());
  });
const section = async (name, fn) => {
  console.log(`\n=== ${name} ===`);
  try {
    await fn();
  } catch (e) {
    check(false, `${name}: ran to the end`, String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    await page.keyboard.press('Escape').catch(() => {});
  }
};

let b;
let base;
let before;
let firstRun;

try {
  // 1. Setup with 6 served rooms and a capacity setup for the capacity line.
  await setupRooms(t, { pdf: FIRST, scale: '50' });
  b = await buildRoutingProject(t, { targets: 6 });
  await H.reload(`${withUnit} p.terminalCapacities.ahu = 300;`);
  base = await stateNow();
  console.log(`baseline: ${JSON.parse(base.project).segments.length} segments, canUndo ${base.canUndo}`);

  await section('2. the dialog with real controls', async () => {
    await H.openDialog();
    await tid('route-start').selectOption('ahu');
    await tid('route-type').selectOption('supply-air');
    await tid('route-port').selectOption('out');
    const pending = await tid('route-build-pending').waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);
    const sum = await H.summaryNumbers();
    console.log(`pending seen: ${pending}; summary: ${sum.text.replace(/\n/g, ' | ')}`);
    const plan = await planStats();
    check(plan.status === 'ok' && sum.segments === plan.stats.segments && sum.fittings === plan.stats.fittings && sum.ports === plan.stats.ports && sum.rooms === plan.stats.rooms, '2: the dialog numbers equal the scene plan', JSON.stringify({ sum, stats: plan.stats }));
    check(sum.ports === 6, '2: 6 ports are planned', String(sum.ports));
    check(await tid('route-place').isEnabled(), '2: route-place is enabled');
    await H.scrollTo('route-build-summary', 'start');
    await shot('T26-dialog');
    // The preview on the plan, at the longest planned segment.
    const longest = plan.segs.map((g) => ({ g, len: Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y) })).sort((x, y) => y.len - x.len)[0].g;
    const mid = { x: (longest[0].x + longest[1].x) / 2, y: (longest[0].y + longest[1].y) / 2 };
    await H.centerOn(mid, 450);
    const px = await colorPixelsIn(page, await screenOf(page, mid), isSupply);
    check(px > 5, '2: the preview draws in the type color', String(px));
    await H.scrollTo('route-build-summary', 'start');
    await shot('T26-preview');

    // 3. The numbers: lengths, counts and the capacity line.
    const cap = await H.lineOf('capacity-over');
    const capSum = await page.evaluate(() => Object.entries(window.__mepSketchScene.exportProject().terminalCapacities).filter(([id]) => id.startsWith('term-')).reduce((n, [, v]) => n + v, 0));
    console.log(`capacity line: ${JSON.stringify(cap)}; sum of terminal capacities ${capSum}`);
    check(cap && cap.text.includes(`${capSum} dm³/s`) && cap.text.includes('300 dm³/s'), '3: the capacity line holds the sum of the port capacities and the start capacity', JSON.stringify(cap));

    // Place.
    const openBefore = await openPortsCount();
    const segsBefore = (await projectNow()).segments.length;
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    const text = (await tid('route-build-result').innerText()).trim();
    const placed = text.match(/Placed (\d+) segments? and (\d+) fittings?/);
    await idle(900);
    before = await projectNow();
    firstRun = { segments: +placed[1], fittings: +placed[2] };
    check(before.segments.length - segsBefore === firstRun.segments && firstRun.segments === plan.stats.segments && firstRun.fittings === plan.stats.fittings, '2: the placed counts equal the plan and the export difference', `${text} vs ${JSON.stringify(plan.stats)}`);
    const cal = await page.evaluate(() => window.__mepSketchScene.getCalibration());
    const mmPerPt = 1 / cal.pageUnitsPerRealUnit;
    const lengthMm = before.segments.filter((s) => s.routedBy === 'route').reduce((n, s) => n + s.geometry.slice(1).reduce((m, p, i) => m + Math.hypot(p.x - s.geometry[i].x, p.y - s.geometry[i].y), 0), 0) * mmPerPt;
    console.log(`written length ${lengthMm.toFixed(2)} mm; plan lengthMm ${plan.stats.lengthMm.toFixed(2)}`);
    check(Math.abs(lengthMm - plan.stats.lengthMm) <= 1, '3: the sum of the written segment lengths equals stats.lengthMm within 1 mm', `${lengthMm} vs ${plan.stats.lengthMm}`);
    check((await openPortsCount()) < openBefore, '2: the open-port count goes down', `${openBefore} -> ${await openPortsCount()}`);
    // Independent proofs.
    const reach = await reachFromStart(page, 'ahu', 'out');
    check(reach.length === 6 && b.terminalIds.every((id) => reach.includes(`port:${id}:in`)), '2: the independent walk reaches every target port', JSON.stringify(reach));
    const legs = await legAngles(page);
    check(legs.length > 0 && legs.every((l) => l.cls !== 'free'), '2: every routed leg is axis or diagonal', `${legs.filter((l) => l.cls === 'free').length} free`);
    const marks = await markedIds(page);
    check(marks.segments.length === firstRun.segments && marks.fittings.length === firstRun.fittings, '2: every new item has the mark and no other item has it');
    const comps = await components();
    check(comps.length === 1 && comps[0].length === firstRun.segments, '2: the run is one network (independent union-find)', `${comps.length} components`);
    await H.scrollTo('route-build-result', 'center');
    await shot('T26-placed');
    // Undo restores the baseline.
    await H.closeDialog();
    await H.undo();
    const after = await stateNow();
    check(after.project === base.project && after.canUndo === base.canUndo, '2: Undo restores the export and canUndo', `canUndo ${after.canUndo}`);
    // Place again for the next steps.
    firstRun = await H.placeRun();
    before = await projectNow();
  });

  await section('4. re-run', async () => {
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const e1 = before.segments.filter((s) => s.routedBy === 'route').length;
    const rem = await H.removeNumbers();
    console.log(`remove line: ${rem?.text}`);
    check(rem && rem.segments === e1 && rem.fittings === before.fittings.filter((f) => f.routedBy === 'route').length, '4: the remove line equals the marked counts', JSON.stringify(rem));
    const after = await tid('route-build-ports-after').innerText();
    check(after.includes('6 ports'), '4: ports-after counts the 6 ports of the run', after);
    await H.scrollTo('route-build-remove', 'center');
    await shot('T26-rerun');
    await tid('route-place').click();
    await tid('route-build-result').waitFor({ state: 'visible', timeout: 8000 });
    await H.closeDialog();
    const now = await projectNow();
    check(now.segments.length === before.segments.length && now.fittings.length === before.fittings.length, '4: the counts are the same after the re-run');
    const old = new Set(before.segments.map((s) => s.id));
    check(now.segments.every((s) => !old.has(s.id)), '4: all ids are new');
    before = now;
  });

  await section('5. Save As, reload, Open', async () => {
    await menu('Save As…');
    await until(async () => /Saved as|Downloaded|Failed to save/.test(await statusText()), 'save', 60000);
    check(/Saved as/.test(await statusText()), '5: the PDF is saved', await statusText());
    await page.goto(BASE, { timeout: 180000 });
    await page.locator('button.mep-onboarding-start').click({ timeout: 4000 }).catch(() => {});
    await page.waitForFunction(() => window.__mepSketchScene !== undefined);
    await page.evaluate(() => { window.__nextFile = 'export.json'; });
    await menu('Open…');
    await until(async () => /Loaded|Could not open/.test(await statusText()), 'open saved', 120000);
    await idle(1500);
    const after = await projectNow();
    const pick = (p) => JSON.stringify({ stamps: p.stamps, segments: p.segments, fittings: p.fittings, portGroups: p.portGroups });
    check(pick(after) === pick(before), '5: stamps, segments and fittings equal the export before (marks included)');
    check(after.schemaVersion === 21, '5: schemaVersion is 21', String(after.schemaVersion));
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const rem = await H.removeNumbers();
    check(rem && rem.segments === before.segments.filter((s) => s.routedBy === 'route').length, '5: a re-run after the reopen offers the same removal count', JSON.stringify(rem));
    await H.closeDialog();
  });

  await section('6. a schema 20 file', async () => {
    const out = await page.evaluate((p) => {
      try {
        const old = JSON.parse(JSON.stringify(p));
        old.schemaVersion = 20;
        for (const s of old.segments) delete s.routedBy;
        for (const f of old.fittings) delete f.routedBy;
        // One terminal port is open again, so the dialog has a run to plan on the old, unmarked run.
        old.segments = old.segments.filter((s) => ![s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId === 'term-6'));
        window.__mepSketchScene.loadProjectFromJson(old);
        const now = window.__mepSketchScene.exportProject();
        return { ok: true, version: now.schemaVersion, marked: now.segments.filter((s) => s.routedBy).length };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, before);
    await idle(1500);
    check(out.ok && out.version === 21 && out.marked === 0, '6: the schema 20 file loads as schema 21', JSON.stringify(out));
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const codes = await H.lineCodes();
    console.log(`lines on the schema 20 file: ${JSON.stringify(codes)}`);
    check((await tid('route-build').count()) === 1 && codes.length > 0, '6: the dialog runs on it and shows a plan');
    check((await H.lineOf('removes-routed')) === null, '6: a run on it removes nothing');
    await H.closeDialog();
  });

  await section('7. 400 px wide', async () => {
    await buildRoutingProject(t, { targets: 6 });
    await page.setViewportSize({ width: 400, height: 900 });
    await idle(700);
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const fit = await page.evaluate((sel) => { const el = document.querySelector(sel); return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null; }, R);
    check(fit && fit.sw <= fit.cw, '7: at 400 px the dialog has no horizontal scroll', JSON.stringify(fit));
    await H.scrollTo('route-build-summary', 'start');
    await shot('T26-narrow');
    await H.closeDialog();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await idle(500);
    console.log('7: dark mode is not run: the app has no dark theme (no data-theme and no prefers-color-scheme rule), so T26-dark would equal a light picture');
  });

  await section('8. the 10A drawing', async () => {
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
    await buildRoutingProject(t, { targets: 3 });
    const shaft = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.listRooms().filter((r) => r.roomTypeId === 'shaft'))));
    const at = roomLabelPoint(shaft[0]);
    await H.reload(
      `const a = p.stamps.find((s) => s.id === 'ahu');
       const sx = a.transform.scale?.x ?? 1;
       a.transform = { ...a.transform, position: { x: arg.x - 0.5 * a.nativeWidth * sx, y: arg.y } };`,
      at,
    );
    const plan = await planStats();
    console.log(`10A plan: status ${plan.status}, ${plan.stats.segments} segments, ${plan.ms.toFixed(0)} ms`);
    check(plan.status === 'ok', '8: the 10A plan is ok', plan.status);
    check(plan.ms <= 500, '8: the time of planRoute is 500 ms or less', `${plan.ms.toFixed(0)} ms`);
    await H.openDialog();
    await H.selectInputs('supply-air');
    await H.waitPlan();
    const sum = await H.summaryNumbers();
    check(sum.segments === plan.stats.segments, '8: the dialog shows the plan', JSON.stringify(sum));
    const line = await H.lineOf('shaft-crossing');
    check(line && line.severity === 'warning', '8: shaft-crossing shows (the start is in a shaft)', JSON.stringify(await H.lineCodes()));
    await H.scrollTo('route-build-summary', 'start');
    await shot('T26-10A');
    await H.closeDialog();
  });
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
