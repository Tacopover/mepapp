// T10b check: SketchScene.planNetworkSizes (scene API for setup and reading; no UI, no screenshot).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/THIS.mjs
import { open, buildSizingProject, baseline, sameAsBaseline } from './r5-lib.mjs';

const PDF = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const SUGGESTED_AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' };

const t = await open();
const { page, check, idle } = t;
await t.start();
await t.openPdf(PDF);

const built = await buildSizingProject(t, { type: 'air', capacities: [100, 150, 50, 100] });
const plan = () => page.evaluate(([e, p]) => window.__mepSketchScene.planNetworkSizes(e, p), [built.equipmentId, built.startPortId]);

// no method on the type: refused with no-method
const b0 = await baseline(page);
const p0 = await plan();
check(p0.result.status === 'refused', 'untouched type: plan is refused', p0.result.status);
check(p0.result.problems.some((p) => p.code === 'no-method'), 'untouched type: problem no-method', JSON.stringify(p0.result.problems));
check(p0.networkTypeId === 'supply-air' && p0.networkTypeName === 'Supply Air', 'plan names the type of the start segment', `${p0.networkTypeId} ${p0.networkTypeName}`);
check(await sameAsBaseline(page, b0), 'refused plan changes nothing (project, canUndo, isDirty)');

// a method but no flowUnit: no-flow-unit
await page.evaluate(() => window.__mepSketchScene.updateNetworkType('supply-air', { sizingMethod: 'air' }));
const b1 = await baseline(page);
const p1 = await plan();
check(p1.result.status === 'refused' && p1.result.problems.some((p) => p.code === 'no-flow-unit'), 'method without flowUnit: no-flow-unit', JSON.stringify(p1.result.problems));
check(await sameAsBaseline(page, b1), 'no-flow-unit plan changes nothing');

// method and flowUnit but no saved limits: no-sizing
await page.evaluate(() => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: 'dm³/s' }));
const pNoLimits = await plan();
check(pNoLimits.result.problems.some((p) => p.code === 'no-sizing') && pNoLimits.sizing === null && pNoLimits.sizingMethod === 'air', 'no saved limits: no-sizing, sizing null, method air', JSON.stringify(pNoLimits.result.problems));

// method, flowUnit and limits: ok
await page.evaluate(([e, p, s]) => window.__mepSketchScene.setNetworkSizing(e, p, s), [built.equipmentId, built.startPortId, SUGGESTED_AIR]);
const b2 = await baseline(page);
const p2 = await plan();
check(p2.result.status === 'ok', 'method + flowUnit + limits: status ok', p2.result.status + ' ' + JSON.stringify(p2.result.problems));
check(p2.flowUnit === 'dm³/s', 'plan flowUnit is dm³/s', p2.flowUnit);
check(Math.abs((p2.result.totalFlowM3s ?? NaN) - 0.4) <= 1e-9, 'total flow is 0.4 m³/s', String(p2.result.totalFlowM3s));
check(p2.result.sizes.length === 7, 'sizes for all seven segments', String(p2.result.sizes.length));
const diam = (id) => p2.result.sizes.find((s) => s.segmentId === id)?.diameterMm ?? 0;
const mainD = diam(built.mainSegmentId);
check(built.segmentIds.every((id) => mainD >= diam(id)), 'main size is at least the size of any segment', `main ${mainD}`);
const exported = await page.evaluate(() => window.__mepSketchScene.exportProject());
check(exported.segments.length === p2.result.segmentCount, 'segmentCount equals the segments in exportProject', `${exported.segments.length} vs ${p2.result.segmentCount}`);
for (let i = 0; i < 3; i++) await plan();
check(await sameAsBaseline(page, b2), 'repeated plan calls change nothing (project, canUndo, isDirty)');

// a type the drawing has not adopted: library type, no sizing
const proj = await page.evaluate(() => {
  const p = window.__mepSketchScene.exportProject();
  p.networkTypes = [];
  return JSON.stringify(p);
});
await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), proj);
await idle(1500);
const b3 = await baseline(page);
const p3 = await plan();
check(p3.result.status === 'refused' && p3.result.problems.some((p) => p.code === 'no-method'), 'unadopted library type: no-method', JSON.stringify(p3.result.problems));
const types3 = await page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes);
check(!types3.some((x) => x.id === 'supply-air'), 'plan adopts nothing: supply-air not adopted (the loader adds only the default type)', JSON.stringify(types3.map((x) => x.id)));
check(await sameAsBaseline(page, b3), 'unadopted plan changes nothing');

// no segment at the port
const p4 = await page.evaluate((e) => window.__mepSketchScene.planNetworkSizes(e, 'nope'), built.equipmentId);
check(p4.result.status === 'refused' && p4.result.problems.some((p) => p.code === 'no-segment-at-port') && p4.networkTypeId === null, 'unknown port: no-segment-at-port, no type', JSON.stringify(p4));

t.finish();
