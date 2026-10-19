// R6 T17 check: scene.planRoute and scene.setRoutePreview (scene API; the dialog does not exist yet).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t17-check.mjs
import { open, setupRooms, buildRoutingProject, buildRoutedSample, baseline, sameAsBaseline, screenOf } from './r6-lib.mjs';
import { colorPixelsIn } from './r4-lib.mjs';

const t = await open();
const { page, check, shot, finish, idle } = t;

// The color of supply-air in r6-lib is #2196f3.
const isSupply = (r, g, b) => b > 200 && g > 120 && g < 180 && r < 80;

const planOf = (stampIds) =>
  page.evaluate((stampIds) => {
    const s = window.__mepSketchScene;
    const from = performance.now();
    const view = s.planRoute({
      startStampId: 'ahu',
      startPortId: 'out',
      networkTypeId: 'supply-air',
      scope: { kind: 'stamps', stampIds: new Set(stampIds) },
      includeOutsideRooms: true,
      portsPerStamp: 'one',
    });
    const ms = performance.now() - from;
    return { view: JSON.parse(JSON.stringify(view)), ms };
  }, stampIds);

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });

  // 1. A first run on a project with no segments.
  const b = await buildRoutingProject(t, { targets: 3 });
  const base = await baseline(page);
  const seqBefore = await page.evaluate(() => ({ s: window.__mepSketchScene.doc.nextSegmentSeq, f: window.__mepSketchScene.doc.nextFittingSeq }));
  const first = await planOf(b.terminalIds);
  const v = first.view;
  console.log(`first run: status ${v.status}, segments ${v.plan.stats.segments}, fittings ${v.plan.stats.fittings}, ports ${v.plan.stats.ports}, ports left ${v.plan.stats.portsLeft}, length ${Math.round(v.plan.stats.lengthMm)} mm, warnings ${v.plan.warnings.map((w) => w.code).join(',')}`);
  check(v.status === 'ok', 'planRoute on the project returns status ok', v.status);
  check(v.plan.segments.length > 0 && v.plan.fittings.length > 0, 'the plan holds segments and fittings', `${v.plan.segments.length}/${v.plan.fittings.length}`);
  check(v.portsAfterRemoval === 3, 'portsAfterRemoval is 3 for a first run', String(v.portsAfterRemoval));
  check(v.plan.removeSegmentIds.length === 0 && v.plan.removeFittingIds.length === 0, 'a first run removes nothing');
  check(v.plan.segments.every((s) => s.routedBy === 'route'), 'every planned segment carries the mark');
  check(v.networkTypeName === 'Supply Air' && v.hasLimits === false, 'networkTypeName and hasLimits', `${v.networkTypeName} ${v.hasLimits}`);
  check(v.plan.segments[0].id === `segment-${seqBefore.s}` && v.plan.fittings[0].id === `fitting-${seqBefore.f}`, 'planned ids start at the document counters', `${v.plan.segments[0].id} ${v.plan.fittings[0].id}`);
  check(await sameAsBaseline(page, base), 'planRoute changes no export, undo state or dirty flag');
  const seqAfter = await page.evaluate(() => ({ s: window.__mepSketchScene.doc.nextSegmentSeq, f: window.__mepSketchScene.doc.nextFittingSeq }));
  check(seqAfter.s === seqBefore.s && seqAfter.f === seqBefore.f, 'the id counters are unchanged', JSON.stringify(seqAfter));

  const times = [first.ms];
  for (let i = 0; i < 2; i++) times.push((await planOf(b.terminalIds)).ms);
  console.log(`planRoute time on the first floor (3 runs): ${times.map((x) => Math.round(x)).join(' ms, ')} ms`);
  const second = await planOf(b.terminalIds);
  check(JSON.stringify(second.view.plan) === JSON.stringify(v.plan), 'planRoute twice gives equal plans');

  // 2. The preview overlay.
  const longest = v.plan.segments
    .map((s) => ({ g: s.geometry, len: Math.hypot(s.geometry[1].x - s.geometry[0].x, s.geometry[1].y - s.geometry[0].y) }))
    .sort((a, c) => c.len - a.len)[0];
  const mid = { x: (longest.g[0].x + longest.g[1].x) / 2, y: (longest.g[0].y + longest.g[1].y) / 2 };
  await page.evaluate((m) => {
    const s = window.__mepSketchScene;
    const r = s.app.canvas.getBoundingClientRect();
    s.world.position.set(r.width / 2 - m.x * s.world.scale.x, r.height / 2 - m.y * s.world.scale.y);
  }, mid);
  await idle(400);
  const at = await screenOf(page, mid);
  const inView = await page.evaluate((a) => a.x > 0 && a.y > 0 && a.x < window.innerWidth && a.y < window.innerHeight, at);
  console.log(`longest planned leg midpoint on screen: ${Math.round(at.x)},${Math.round(at.y)} (in view ${inView})`);
  const noPreview = await colorPixelsIn(page, at, isSupply);
  await page.evaluate((plan) => window.__mepSketchScene.setRoutePreview(plan), v.plan);
  await idle(400);
  const withPreview = await colorPixelsIn(page, at, isSupply);
  console.log(`supply-air colored pixels near the point: without preview ${noPreview}, with preview ${withPreview}`);
  check(withPreview > noPreview + 5, 'the preview draws pixels in the network type color', `${noPreview} -> ${withPreview}`);
  check(await sameAsBaseline(page, base), 'setRoutePreview changes no export, undo state or dirty flag');
  await shot('T17-preview-overlay');
  await page.evaluate(() => window.__mepSketchScene.setRoutePreview(null));
  await idle(400);
  const cleared = await colorPixelsIn(page, at, isSupply);
  check(cleared <= noPreview + 2, 'setRoutePreview(null) clears the preview', `${cleared}`);
  await page.evaluate((plan) => window.__mepSketchScene.setRoutePreview(plan), v.plan);
  await idle(300);
  await page.evaluate(() => window.__mepSketchScene.emitter.emit('pageChanged', 0));
  await idle(400);
  const afterPage = await colorPixelsIn(page, at, isSupply);
  check(afterPage <= noPreview + 2, 'a page change clears the preview', `${afterPage}`);

  // 3. A re-run: the old marked run is removed and its ports are targets again.
  const r = await buildRoutedSample(t);
  const rebase = await baseline(page);
  const rerun = await page.evaluate(
    (r) => {
      const s = window.__mepSketchScene;
      const view = s.planRoute({
        startStampId: r.equipmentId,
        startPortId: 'out',
        networkTypeId: 'supply-air',
        scope: { kind: 'stamps', stampIds: new Set(r.terminalIds) },
        includeOutsideRooms: true,
        portsPerStamp: 'one',
      });
      return JSON.parse(JSON.stringify(view));
    },
    r,
  );
  console.log(`re-run: status ${rerun.status}, portsAfterRemoval ${rerun.portsAfterRemoval}, removes ${rerun.plan.removeSegmentIds.length} segments and ${rerun.plan.removeFittingIds.length} fittings, plans ${rerun.plan.stats.segments} segments`);
  check(rerun.portsAfterRemoval === 2, 'the re-run keeps its 2 target ports', String(rerun.portsAfterRemoval));
  check(JSON.stringify(rerun.plan.removeSegmentIds) === JSON.stringify(['r-s1', 'r-s2', 'r-s3', 'r-s4']), 'the re-run removes the 4 marked segments', JSON.stringify(rerun.plan.removeSegmentIds));
  check(JSON.stringify(rerun.plan.removeFittingIds) === JSON.stringify(['r-f1', 'r-f2']), 'the re-run removes the 2 marked fittings', JSON.stringify(rerun.plan.removeFittingIds));
  check(rerun.plan.warnings.some((w) => w.code === 'removes-routed'), 'the plan has the removes-routed line');
  check(await sameAsBaseline(page, rebase), 'the re-run plan changes nothing');
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
