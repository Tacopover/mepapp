// R6 T18 check: scene.applyRoute through the scene API (the dialog does not exist yet). Undo and Redo use the real rail buttons.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r6-t18-check.mjs
import { open, setupRooms, buildRoutingProject, buildRoutedSample, baseline, exportRun, legAngles, reachFromStart, markedIds } from './r6-lib.mjs';

const t = await open();
const { page, check, finish, idle } = t;

const AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' };
const clickRail = async (title) => {
  await page.locator(`.mep-rail-btn[title="${title}"]`).click();
  await idle(500);
};
const request = (ids) => ({ startStampId: 'ahu', startPortId: 'out', networkTypeId: 'supply-air', scope: { kind: 'stamps', stampIds: new Set(ids) }, includeOutsideRooms: true, portsPerStamp: 'one' });
const planAndApply = (ids, size) =>
  page.evaluate(
    ([ids, size, req]) => {
      const s = window.__mepSketchScene;
      const view = s.planRoute({ ...req, scope: { kind: 'stamps', stampIds: new Set(ids) } });
      const done = s.applyRoute(view.plan, { size });
      return { view: JSON.parse(JSON.stringify(view)), done };
    },
    [ids, size, request(ids)],
  );
const projectJson = async () => (await baseline(page)).project;

try {
  await setupRooms(t, { pdf: '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', scale: '50' });

  // 1. A first run without sizes.
  const b = await buildRoutingProject(t, { targets: 3 });
  const base = await baseline(page);
  const { view, done } = await planAndApply(b.terminalIds, false);
  const stats = view.plan.stats;
  console.log(`applied: ${JSON.stringify(done)}; plan ${stats.segments} segments, ${stats.fittings} fittings`);
  check(done && done.segments === stats.segments && done.fittings === stats.fittings, 'applyRoute returns the planned counts', JSON.stringify(done));
  const run = await exportRun(page);
  check(run.segments.length === stats.segments && run.fittings.length === stats.fittings, 'the export has the planned counts', `${run.segments.length}/${run.fittings.length}`);
  const marks = await markedIds(page);
  check(marks.segments.length === run.segments.length && marks.fittings.length === run.fittings.length, 'every new item has the mark');
  const reach = await reachFromStart(page, 'ahu', 'out');
  check(JSON.stringify(reach) === JSON.stringify(b.terminalIds.map((id) => `port:${id}:in`).sort()), 'the walk from the start port reaches every target port', JSON.stringify(reach));
  const legs = await legAngles(page);
  const free = legs.filter((l) => l.cls === 'free').length;
  check(free === stats.freeLegs, 'free legs equal the plan count (axis or diagonal otherwise)', `${free} vs ${stats.freeLegs}`);
  const types = await page.evaluate(() => window.__mepSketchScene.exportProject().segments.map((s) => s.networkTypeId));
  check(types.every((x) => x === 'supply-air'), 'all new segments have the network type');
  const after = await projectJson();
  const dirtyAfter = (await baseline(page)).isDirty;
  check(dirtyAfter === true, 'the document is dirty after the run');
  await clickRail('Undo');
  check((await projectJson()) === base.project, 'Undo restores the export exactly');
  await clickRail('Redo');
  check((await projectJson()) === after, 'Redo gives the same export');
  const seq = await page.evaluate(() => window.__mepSketchScene.doc.nextSegmentSeq);
  console.log(`nextSegmentSeq after the run ${seq}`);
  check(run.segments.every((s) => Number(s.id.split('-').pop()) < seq), 'the id counter is past the new ids');

  // 2. A re-run: the old run goes, the new run has new ids, the selection holds no removed id.
  const firstIds = run.segments.map((s) => s.id).sort();
  await page.evaluate((id) => window.__mepSketchScene.doc.selectedIds.add(id), firstIds[0]);
  const rerun = await planAndApply(b.terminalIds, false);
  console.log(`re-run: removed ${rerun.done?.removedSegments} segments, ${rerun.done?.removedFittings} fittings, wrote ${rerun.done?.segments}`);
  check(rerun.done && rerun.done.removedSegments === firstIds.length, 'the re-run removes the old segments', JSON.stringify(rerun.done));
  const run2 = await exportRun(page);
  check(run2.segments.length === firstIds.length && run2.segments.every((s) => !firstIds.includes(s.id)), 'the re-run writes the same count with new ids');
  const selected = await page.evaluate(() => [...window.__mepSketchScene.doc.selectedIds]);
  check(selected.every((id) => !firstIds.includes(id)), 'the selection holds no removed id', JSON.stringify(selected));
  await clickRail('Undo');
  check(JSON.stringify((await exportRun(page)).segments.map((s) => s.id).sort()) === JSON.stringify(firstIds), 'Undo of the re-run brings back the first run');

  // 3. Sizes: a type with a flow unit and the saved limits.
  await page.evaluate(
    ([AIR]) => {
      const s = window.__mepSketchScene;
      const p = s.exportProject();
      p.networkTypes = p.networkTypes.map((n) => ({ ...n, flowUnit: 'dm³/s', sizingMethod: 'air' }));
      p.segments = [];
      p.fittings = [];
      p.networkSizing = [{ startStampId: 'ahu', startPortId: 'out', settings: AIR }];
      s.loadProjectFromJson(p);
    },
    [AIR],
  );
  await idle(1500);
  const baseS = await baseline(page);
  const sized = await planAndApply(b.terminalIds, true);
  console.log(`sized: ${sized.view.plan.sizes.length} sizes in the plan; warnings ${sized.view.plan.warnings.map((w) => w.code).join(',')}`);
  check(sized.view.hasLimits && sized.view.plan.sizes.length === sized.view.plan.stats.segments, 'with limits the plan holds a size for each new segment', `${sized.view.plan.sizes.length}`);
  const sizedRun = await exportRun(page);
  const diameters = [...new Set(sizedRun.segments.map((s) => s.diameter))].sort((a, c) => a - c);
  console.log(`diameters after sizing: ${diameters.join(', ')}`);
  check(sizedRun.segments.every((s) => sized.view.plan.sizes.some((z) => z.segmentId === s.id && z.diameterMm === s.diameter)), 'the export holds the planned sizes');
  const sizedJson = await projectJson();
  await clickRail('Undo');
  check((await projectJson()) === baseS.project, 'Undo removes the segments and the sizes in one step');
  await clickRail('Redo');
  check((await projectJson()) === sizedJson, 'Redo gives the sized run back');

  // 4. Refusal: an empty plan and an id collision write nothing.
  const refusals = await page.evaluate(() => {
    const s = window.__mepSketchScene;
    const before = JSON.stringify(s.exportProject());
    const empty = s.applyRoute({ segments: [], fittings: [], removeSegmentIds: [], removeFittingIds: [], warnings: [], stats: {}, sizes: [] }, { size: false });
    const existing = s.exportProject().segments[0];
    const clash = s.applyRoute({ segments: [existing], fittings: [], removeSegmentIds: [], removeFittingIds: [], warnings: [], stats: {}, sizes: [] }, { size: false });
    return { empty, clash, same: JSON.stringify(s.exportProject()) === before };
  });
  check(refusals.empty === null && refusals.clash === null && refusals.same, 'an empty plan and an id collision return null and write nothing', JSON.stringify(refusals));
} catch (e) {
  check(false, 'check ran to the end', String(e && e.stack ? e.stack : e));
}
await finish();
