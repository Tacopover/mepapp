// T11 check: SketchScene.applyNetworkSizes (one undo step, mm values, Properties panel).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/THIS.mjs
import { open, buildSizingProject, segmentSizes, baseline, screenOf } from './r5-lib.mjs';

const PDF = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const SUGGESTED_AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' };

const t = await open();
const { page, check, idle, shot } = t;
await t.start();
await t.openPdf(PDF);

const built = await buildSizingProject(t, { type: 'air', capacities: [100, 150, 50, 0], sizingMethod: 'air', sizing: SUGGESTED_AIR });
await page.evaluate(() => {
  const sc = window.__mepSketchScene;
  sc.updateNetworkType('supply-air', { flowUnit: 'dm³/s' });
});
const plan = await page.evaluate(([e, p]) => window.__mepSketchScene.planNetworkSizes(e, p), [built.equipmentId, built.startPortId]);
check(plan.result.status === 'ok', 'plan is ok', JSON.stringify(plan.result.problems));
console.log('sizes', JSON.stringify(plan.result.sizes.map((s) => [s.segmentId, s.diameterMm])), 'unsized', JSON.stringify(plan.result.unsized));
check(plan.result.unsized.length === 1 && plan.result.unsized[0].reason === 'zero-flow', 'segment of the zero-capacity terminal is unsized (zero-flow)', JSON.stringify(plan.result.unsized));
const unsizedId = plan.result.unsized[0]?.segmentId;

const before = await segmentSizes(page);
const b0 = await baseline(page);
await page.evaluate((sizes) => window.__mepSketchScene.applyNetworkSizes(sizes), plan.result.sizes);
await idle(500);
const after = await segmentSizes(page);
const mm = (id) => plan.result.sizes.find((s) => s.segmentId === id)?.diameterMm;
check(plan.result.sizes.every((s) => after[s.segmentId].shape === 'round' && after[s.segmentId].diameter === mm(s.segmentId)), 'sized segments hold the planned diameters (mm)');
check(plan.result.sizes.every((s) => after[s.segmentId].width === undefined && after[s.segmentId].height === undefined), 'round segments have no width or height');
check(unsizedId && JSON.stringify(after[unsizedId]) === JSON.stringify(before[unsizedId]), 'zero-flow segment keeps its old size', JSON.stringify(after[unsizedId]));
const st = await page.evaluate(() => {
  const s = window.__mepSketchScene;
  const id = s.getActiveDocumentId();
  return { canUndo: s.getDrawingSummary().canUndo, isDirty: s.getDocuments().find((d) => d.id === id).isDirty, types: s.exportProject().networkTypes.map((n) => n.id) };
});
check(st.canUndo && st.isDirty, 'canUndo and isDirty after apply', JSON.stringify(st));
check(st.types.includes('supply-air'), 'type stays adopted', JSON.stringify(st.types));

// Properties panel: real click on the main segment
const pos = await screenOf(page, built.clickPoints[built.mainSegmentId]);
await page.mouse.click(pos.x, pos.y);
await idle(500);
const inputs = await page.evaluate(() => [...document.querySelectorAll('.mep-field-row')].map((r) => ({ text: r.querySelector('label')?.innerText.trim() ?? '', value: r.querySelector('input')?.value })));
const diaRow = inputs.find((i) => /^Diameter/i.test(i.text));
console.log('PANEL', JSON.stringify(diaRow));
check(diaRow && Number(diaRow.value) === mm(built.mainSegmentId), 'Properties Diameter equals the stored main size', JSON.stringify(diaRow));
console.log('Diameter label:', diaRow?.text);
await shot('T11-properties-size');

// undo restores exactly
await page.click('.mep-rail-btn[title="Undo"]');
await idle(500);
const undone = await segmentSizes(page);
check(JSON.stringify(undone) === JSON.stringify(before), 'one Undo click restores all segments exactly');

// a segment of another network is untouched, and no network is created: apply a bogus size for an unknown id
const b1 = await baseline(page);
await page.evaluate(() => window.__mepSketchScene.applyNetworkSizes([{ segmentId: 'nope', shape: 'round', diameterMm: 999, velocityMs: 1, pressureDropPaPerM: 1, governedBy: 'minimum', flowM3s: 1 }]));
check(b1.project === (await baseline(page)).project && b1.canUndo === (await baseline(page)).canUndo, 'unknown id is skipped (project and canUndo unchanged)');
const after2 = await segmentSizes(page);
check(JSON.stringify(after2) === JSON.stringify(before), 'unknown segment id changes nothing');

// rectangular write removes diameter
await page.evaluate((id) => window.__mepSketchScene.applyNetworkSizes([{ segmentId: id, shape: 'rectangular', widthMm: 400, heightMm: 200, velocityMs: 1, pressureDropPaPerM: 1, governedBy: 'minimum', flowM3s: 1 }]), built.mainSegmentId);
const rect = (await segmentSizes(page))[built.mainSegmentId];
check(rect.shape === 'rectangular' && rect.width === 400 && rect.height === 200 && rect.diameter === undefined, 'rectangular write sets width/height and removes diameter', JSON.stringify(rect));

t.finish();
