// T21: the scene stores, reads, writes, saves and loads the per-network sizing limits (auto-routing-r5.md section 12.5).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t21-check.mjs
// The scene API is used for setup and for reading state. Delete, undo, copy and paste go through the real page.
import { open, buildSizingProject } from './r5-lib.mjs';

const t = await open();
const { page, check, idle } = t;
const S = (fn, arg) => page.evaluate(fn, arg);

const AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' };

await t.start();
await t.openPdf();
const b = await buildSizingProject(t, { type: 'air', sizingMethod: 'air', sizing: AIR });
const ahu = b.equipmentId;
await S(() => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: 'dm³/s' }));
const entries = () => S(() => window.__mepSketchScene.exportProject().networkSizing);
const plan = (id, port = 'out') => S(([id, port]) => JSON.parse(JSON.stringify(window.__mepSketchScene.planNetworkSizes(id, port))), [id, port]);

// 1: load holds the entry and the plan is ok.
const got = await S((id) => window.__mepSketchScene.getNetworkSizing(id, 'out'), ahu);
check(Object.keys(AIR).every((k) => got?.[k] === AIR[k]) && Object.keys(got ?? {}).length === Object.keys(AIR).length, '1: getNetworkSizing returns the loaded limits', JSON.stringify(got));
const p1 = await plan(ahu);
check(p1.result.status === 'ok' && p1.sizingMethod === 'air' && p1.sizing?.maxVelocityMs === 5, '1: the plan is ok and carries method and limits', JSON.stringify({ status: p1.result.status, m: p1.sizingMethod }));

// 2: set writes, marks dirty, is not an undo step.
const r2 = await S(([id, air]) => {
  const s = window.__mepSketchScene;
  s.setNetworkSizing(id, 'out', undefined);
  const docId = s.getActiveDocumentId();
  s.doc.isDirty = false;
  const undoBefore = s.getDrawingSummary().canUndo;
  const ok = s.setNetworkSizing(id, 'out', { ...air, maxVelocityMs: 4 });
  return {
    ok,
    entries: s.exportProject().networkSizing,
    dirty: s.getDocuments().find((d) => d.id === docId).isDirty,
    undoBefore,
    undoAfter: s.getDrawingSummary().canUndo,
  };
}, [ahu, AIR]);
check(r2.ok && r2.entries.length === 1 && r2.entries[0].startStampId === ahu && r2.entries[0].settings.maxVelocityMs === 4, '2: setNetworkSizing writes one entry', JSON.stringify(r2.entries));
check(r2.dirty === true, '2: the document is dirty', String(r2.dirty));
check(r2.undoBefore === r2.undoAfter, '2: canUndo is unchanged by the call', JSON.stringify([r2.undoBefore, r2.undoAfter]));

// 3: the stored copy does not change when the caller changes its object.
const r3 = await S(([id, air]) => {
  const s = window.__mepSketchScene;
  const mine = { ...air };
  s.setNetworkSizing(id, 'out', mine);
  mine.maxVelocityMs = 99;
  const read = s.getNetworkSizing(id, 'out');
  read.maxVelocityMs = 98;
  return { stored: s.getNetworkSizing(id, 'out').maxVelocityMs };
}, [ahu, AIR]);
check(r3.stored === 5, '3: caller edits change neither the stored copy nor a returned copy', String(r3.stored));

// 5: an invalid settings value writes nothing.
const before5 = JSON.stringify(await entries());
const r5 = await S((id) => window.__mepSketchScene.setNetworkSizing(id, 'out', { method: 'air' }), ahu);
check(r5 === false && JSON.stringify(await entries()) === before5, '5: invalid settings return false and change nothing', String(r5));

// 4: undefined removes the entry.
await S((id) => window.__mepSketchScene.setNetworkSizing(id, 'out', undefined), ahu);
check((await entries()).length === 0, '4: undefined empties the list');
const p4 = await plan(ahu);
check(p4.result.problems[0]?.code === 'no-sizing', '4: the plan gives no-sizing without an entry', JSON.stringify(p4.result.problems[0]));

// 6: two start pairs hold different limits; the plans give different sizes.
await S(() => {
  const s = window.__mepSketchScene;
  const p = s.exportProject();
  const a = p.stamps.find((x) => x.category === 'equipment');
  const term = p.stamps.find((x) => x.id === 'term-1');
  const out = a.ports[0];
  const at = (st, port, dx, dy) => ({
    x: st.transform.position.x + port.fractionX * st.nativeWidth * (st.transform.scale?.x ?? 1) + dx,
    y: st.transform.position.y + port.fractionY * st.nativeHeight * (st.transform.scale?.y ?? 1) + dy,
  });
  const ahu2 = { ...JSON.parse(JSON.stringify(a)), id: 'ahu2', transform: { ...a.transform, position: { x: a.transform.position.x, y: a.transform.position.y + 600 } } };
  const term5 = { ...JSON.parse(JSON.stringify(term)), id: 'term-5', transform: { ...term.transform, position: { x: term.transform.position.x, y: term.transform.position.y + 600 } } };
  const from = at(ahu2, out, 0, 0);
  const to = at(term5, term5.ports[0], 0, 0);
  p.stamps.push(ahu2, term5);
  p.terminalCapacities['term-5'] = 100;
  p.segments.push({ id: 'segment-9', pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 200, endpointA: { kind: 'port', elementId: 'ahu2', portId: 'out' }, endpointB: { kind: 'port', elementId: 'term-5', portId: 'in' }, geometry: [from, to] });
  s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
});
await idle(1500);
await S(([id, air]) => {
  const s = window.__mepSketchScene;
  s.setNetworkSizing('ahu2', 'out', air);
  s.setNetworkSizing(id, 'out', { ...air, maxVelocityMs: 3 });
}, [ahu, AIR]);
const e6 = await entries();
check(e6.length === 2, '6: two pairs hold two entries', String(e6.length));
const pA = await plan('ahu2');
const d1 = pA.result.sizes[0]?.diameterMm;
check(pA.result.status === 'ok' && d1 === 200, '6: ahu2 (0.1 m3/s, 5 m/s, 1 Pa/m) gives diameter 200', JSON.stringify(pA.result.sizes[0]));
await S(() => window.__mepSketchScene.setNetworkSizing('ahu2', 'out', { method: 'air', maxVelocityMs: 3, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' }));
const pB = await plan('ahu2');
check(pB.result.sizes[0]?.diameterMm === 250 && pB.result.sizes[0]?.governedBy === 'velocity', '6: the same flow with 3 m/s gives 250, velocity', JSON.stringify(pB.result.sizes[0]));
const keep = await S((id) => window.__mepSketchScene.getNetworkSizing(id, 'out').maxVelocityMs, ahu);
check(keep === 3, '6: the other pair keeps its own limits', String(keep));
await S(() => window.__mepSketchScene.setNetworkSizing('ahu2', 'out', undefined));

// 7: delete the start stamp (real keys); the export drops the entry; undo brings it back.
await S((id) => window.__mepSketchScene.selectStampById(id), ahu);
await idle(300);
await page.locator('body').press('Delete');
await idle(600);
const gone = (await entries()).filter((e) => e.startStampId === ahu).length;
check(gone === 0, '7: no entry for the deleted stamp in the export', String(gone));
await page.locator('.mep-rail-btn[title="Undo"]').first().click();
await idle(800);
const back = (await entries()).filter((e) => e.startStampId === ahu).length;
check(back === 1, '7: undo of the delete brings the entry back', String(back));

// 8: copy and paste of the start stamp gives a pasted stamp with no entry.
await S((id) => window.__mepSketchScene.selectStampById(id), ahu);
await idle(300);
await page.locator('body').press('Control+c');
await idle(300);
await page.locator('body').press('Control+v');
await idle(1200);
const stamps8 = await S(() => window.__mepSketchScene.exportProject().stamps.map((s) => s.id));
const e8 = await entries();
check(stamps8.length > 0 && e8.every((e) => e.startStampId === ahu), '8: entries belong only to the original stamp after paste', JSON.stringify(e8.map((e) => e.startStampId)));

// 9: save and load keep the limits.
const exported = await S(() => JSON.stringify(window.__mepSketchScene.exportProject()));
await S((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), exported);
await idle(1500);
const reloaded = await S((id) => window.__mepSketchScene.getNetworkSizing(id, 'out'), ahu);
check(reloaded?.maxVelocityMs === 3, '9: the limits survive export and load', JSON.stringify(reloaded));

// 10: a library type that is not adopted gives no-method and writes nothing.
const snap10 = JSON.stringify(await entries());
const p10 = await S((id) => {
  const s = window.__mepSketchScene;
  const p = s.exportProject();
  p.networkTypes = [];
  s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
  return JSON.parse(JSON.stringify(s.planNetworkSizes(id, 'out')));
}, ahu);
check(p10.result.problems[0]?.code === 'no-method', '10: an unadopted type gives no-method', JSON.stringify(p10.result.problems[0]));
check(JSON.stringify(await entries()) === snap10, '10: the plan wrote nothing');

// 11: a v19 file with sizing on the type loads as 20.
const r11 = await S((id) => {
  const s = window.__mepSketchScene;
  const p = s.exportProject();
  p.schemaVersion = 19;
  delete p.networkSizing;
  p.networkTypes = [{ id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'dm³/s', sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', series: 'standard' } }];
  s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
  const type = s.getNetworkTypes().find((x) => x.id === 'supply-air');
  return { type: JSON.parse(JSON.stringify(type)), version: s.exportProject().schemaVersion, code: s.planNetworkSizes(id, 'out').result.problems[0]?.code };
}, ahu);
check(r11.type.sizingMethod === 'air' && !('sizing' in r11.type) && r11.type.flowUnit === 'dm³/s', '11: the type keeps the method and has no sizing', JSON.stringify(r11.type));
check(r11.version === 20 && r11.code === 'no-sizing', '11: schema 20 and the plan gives no-sizing', JSON.stringify(r11));

await t.finish();
