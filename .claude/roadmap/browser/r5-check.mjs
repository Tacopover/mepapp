// R5 part check (auto-routing-r5.md T18 with section 12.5): the whole sizing flow through the real DOM.
// Run 1: first-floor PDF, 1600 x 1000 (schema 20, v18 and v19 files, hand-checked sizes, two networks, the editor, the Size dialog,
//   undo, Properties labels, round trip, then 400 px wide and dark mode on the same page).
// Run 2: the 10A PDF (a built network; timing of planNetworkSizes and applyNetworkSizes, also for 300 segments).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r5-check.mjs
// The scene API sets the drawing up and reads state. Controls are driven through real clicks, selects and typed input.
import { open, buildSizingProject, segmentSizes, baseline, sameAsBaseline, screenOf } from './r5-lib.mjs';

const PDF1 = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const PDF10A = '/root/MepApp/fixtures/pdfs/plattegrond begane grond 10A.pdf';
const AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' };
const WATER = { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200, deltaTK: 10 };
const DN = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];
let anyFail = false;

async function run1() {
  const t = await open();
  const { page, check, idle, shot } = t;
  const S = (fn, arg) => page.evaluate(fn, arg);
  const Z = '.mep-modal--route';
  const M = '.mep-modal';
  const q = (id) => page.locator(`${Z} [data-testid=${id}]`);
  const f = (id) => page.locator(`${M} [data-testid=${id}]`);
  const count = (id) => q(id).count();
  const text = (id) => q(id).innerText();
  const typeInto = async (id, value) => {
    await q(id).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(value);
    await page.keyboard.press('Tab');
    await idle(500);
  };
  const entries = () => S(() => window.__mepSketchScene.exportProject().networkSizing);
  const openDialog = async () => {
    await t.openSize();
    await page.locator(Z).waitFor({ timeout: 20000 });
    await idle(500);
  };
  const closeDialog = async () => {
    await q('size-close').click();
    await idle(300);
  };
  const updateType = (id, patch) => S(([id, patch]) => window.__mepSketchScene.updateNetworkType(id, patch), [id, patch]);
  const plan = (id) => S((id) => JSON.parse(JSON.stringify(window.__mepSketchScene.planNetworkSizes(id, 'out'))), id);
  const setLimits = (id, s) => S(([id, s]) => window.__mepSketchScene.setNetworkSizing(id, 'out', s), [id, s]);
  const sizeOf = (p, seg) => p.result.sizes.find((x) => x.segmentId === seg);
  const labels = () => S(() => [...document.querySelectorAll('.mep-field-row label')].map((l) => (l.textContent ?? '').trim()));
  const undo = async () => {
    await page.locator('.mep-rail-btn[title="Undo"]').click();
    await idle(500);
  };

  await t.start();
  await t.openPdf(PDF1);

  // 1: schema 20 and the load of old files
  const b0 = await buildSizingProject(t, { type: 'air', capacities: [100, 0, 0, 0], sizingMethod: 'air', sizing: AIR });
  await updateType('supply-air', { flowUnit: 'dm³/s' });
  const exp = await S(() => window.__mepSketchScene.exportProject());
  check(exp.schemaVersion === 21, 'step 1: exportProject has schemaVersion 21', String(exp.schemaVersion));
  check(Array.isArray(exp.networkSizing) && exp.networkSizing.length === 1, 'step 1: the export holds one networkSizing entry');
  const v19 = await S(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.schemaVersion = 19;
    delete p.networkSizing;
    p.networkTypes = p.networkTypes.map((x) => {
      const y = { ...x, sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' } };
      delete y.sizingMethod;
      return y;
    });
    s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
    const type = s.getNetworkTypes().find((x) => x.id === 'supply-air');
    return { type: JSON.parse(JSON.stringify(type)), out: s.exportProject() };
  });
  check(v19.out.schemaVersion === 21 && v19.type.sizingMethod === 'air' && !('sizing' in v19.type) && v19.type.flowUnit === 'dm³/s', 'step 2: a v19 file loads as 21; the type keeps the method and loses sizing', JSON.stringify(v19.type));
  check(Array.isArray(v19.out.networkSizing) && v19.out.networkSizing.length === 0, 'step 2: a v19 file gives an empty networkSizing');
  await idle(1200);
  await openDialog();
  check((await count('size-line-no-sizing')) === 1, 'step 2: the dialog of a v19 file shows no-sizing');
  await closeDialog();
  const v18 = await S(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    p.schemaVersion = 18;
    delete p.networkSizing;
    p.networkTypes = p.networkTypes.map((x) => {
      const y = { ...x };
      delete y.flowUnit;
      delete y.sizingMethod;
      delete y.sizing;
      return y;
    });
    s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
    return s.exportProject().schemaVersion;
  });
  await idle(1200);
  check(v18 === 21, 'step 3: a v18 file loads as schema 21', String(v18));
  await openDialog();
  const l18 = (await count('size-line-no-flow-unit')) + (await count('size-line-no-method'));
  check(l18 === 1 && (await q('size-apply').isDisabled()), 'step 3: the dialog of a v18 file shows a flow-unit or method line and the button is off');
  console.log('V18 LINE', (await count('size-line-no-flow-unit')) ? 'no-flow-unit' : 'no-method');
  await closeDialog();

  // 4: hand-checked values (0.1 m3/s on the main segment; section 12.6)
  const b = await buildSizingProject(t, { type: 'air', capacities: [100, 0, 0, 0], sizingMethod: 'air', sizing: AIR });
  await updateType('supply-air', { flowUnit: 'dm³/s' });
  const ahu = b.equipmentId;
  const p4 = await plan(ahu);
  const m4 = sizeOf(p4, 'segment-1');
  check(p4.result.status === 'ok' && m4.diameterMm === 200 && m4.governedBy === 'pressure', 'step 4: air 5 m/s, 1 Pa/m: 0.1 m3/s gives O200, pressure governs', JSON.stringify(m4));
  check(Math.abs(m4.velocityMs - 3.18) < 0.02 && Math.abs(m4.pressureDropPaPerM - 0.7) < 0.05, 'step 4: air O200 gives 3.18 m/s and 0.70 Pa/m', `${m4.velocityMs} / ${m4.pressureDropPaPerM}`);
  await setLimits(ahu, { ...AIR, maxVelocityMs: 3 });
  const m4b = sizeOf(await plan(ahu), 'segment-1');
  check(m4b.diameterMm === 250 && m4b.governedBy === 'velocity', 'step 4: air 3 m/s: O250, velocity governs', JSON.stringify(m4b));
  await setLimits(ahu, { ...AIR, maxPressureDropPaPerM: 0.5 });
  const m4c = sizeOf(await plan(ahu), 'segment-1');
  check(m4c.diameterMm === 250 && m4c.governedBy === 'pressure' && Math.abs(m4c.pressureDropPaPerM - 0.24) < 0.03, 'step 4: air 0.5 Pa/m: O250, pressure governs, about 0.24 Pa/m', JSON.stringify(m4c));

  // 5: two networks with different limits for the same flow, through the real dialog
  await setLimits(ahu, AIR);
  await S(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    const a = p.stamps.find((x) => x.category === 'equipment');
    const term = p.stamps.find((x) => x.id === 'term-1');
    const at = (st, port) => ({
      x: st.transform.position.x + port.fractionX * st.nativeWidth * (st.transform.scale?.x ?? 1),
      y: st.transform.position.y + port.fractionY * st.nativeHeight * (st.transform.scale?.y ?? 1),
    });
    const move = (st, id) => ({ ...JSON.parse(JSON.stringify(st)), id, transform: { ...st.transform, position: { x: st.transform.position.x, y: st.transform.position.y + 600 } } });
    const ahu2 = move(a, 'ahu2');
    const term5 = move(term, 'term-5');
    p.stamps.push(ahu2, term5);
    p.terminalCapacities['term-5'] = 100;
    p.segments.push({ id: 'segment-9', pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 200, endpointA: { kind: 'port', elementId: 'ahu2', portId: 'out' }, endpointB: { kind: 'port', elementId: 'term-5', portId: 'in' }, geometry: [at(ahu2, a.ports[0]), at(term5, term5.ports[0])] });
    s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
  });
  await idle(1500);
  await openDialog();
  check((await q('size-start').locator('option').count()) === 2, 'step 5: the start select lists two equipment stamps');
  await q('size-start').selectOption('ahu2');
  await idle(500);
  check((await q('size-air-max-velocity').inputValue()) === '' && (await count('size-line-no-sizing')) === 1, 'step 5: the second network has empty limits and no-sizing');
  await q('size-limits-suggest').click();
  await idle(400);
  await typeInto('size-air-max-velocity', '3');
  const e5 = await entries();
  check(e5.find((e) => e.startStampId === 'ahu2')?.settings.maxVelocityMs === 3 && e5.find((e) => e.startStampId === ahu)?.settings.maxVelocityMs === 5, 'step 5: the export holds 3 and 5 for the two networks', JSON.stringify(e5));
  const d1 = sizeOf(await plan(ahu), 'segment-1')?.diameterMm;
  const d2 = sizeOf(await plan('ahu2'), 'segment-9')?.diameterMm;
  check(d1 === 200 && d2 === 250, 'step 5: the same flow gives O200 and O250 in the two networks', `${d1} / ${d2}`);
  await shot('T18-size-limits');
  await closeDialog();
  await S(() => window.__mepSketchScene.setNetworkSizing('ahu2', 'out', undefined));

  // 6: the slim editor, opened from the Size dialog (air), real inputs
  const bAir = await buildSizingProject(t, { type: 'air', capacities: [100, 150, 50, 100] });
  void bAir;
  await openDialog();
  check((await count('size-line-no-method')) === 1 && (await q('size-line-no-method').getAttribute('data-severity')) === 'error' && /Error/.test(await text('size-line-no-method')), 'step 6: a type with no method shows no-method with the label Error');
  await q('size-edit-type').click();
  await f('nt-flow-unit').waitFor({ timeout: 20000 });
  await idle(400);
  await f('nt-flow-unit').selectOption('dm³/s');
  await f('nt-sizing-method').selectOption({ label: 'Air' });
  await idle(300);
  const airFields = await S(() => document.querySelectorAll('[data-testid^="nt-air-"], [data-testid^="nt-water-"], [data-testid="nt-suggest"]').length);
  check(airFields === 0, 'step 6: the editor holds no nt-air, no nt-water field and no suggest button', String(airFields));
  await shot('T18-editor-air');
  await page.locator(`${M} button`, { hasText: /^Save$/ }).first().click();
  await idle(800);
  check((await count('size-line-no-sizing')) === 1 && (await count('size-limits')) === 1, 'step 6: after Save the dialog shows no-sizing and the limits section');

  // 7: the Size dialog, air: suggested values, a typed velocity, the result, apply, undo
  await q('size-limits-suggest').click();
  await idle(500);
  check((await q('size-air-max-velocity').inputValue()) === '5' && (await q('size-air-max-drop').inputValue()) === '1', 'step 7: Use suggested values fills 5 and 1');
  await typeInto('size-air-max-velocity', '4');
  const e7 = await entries();
  check(e7.length === 1 && e7[0].settings.maxVelocityMs === 4, 'step 7: the typed velocity 4 is in the export', JSON.stringify(e7));
  await typeInto('size-air-max-velocity', '5');
  const sum = await S(() => Object.values(window.__mepSketchScene.exportProject().terminalCapacities).reduce((a, c) => a + c, 0));
  const resText = await text('size-result');
  check(sum === 400 && new RegExp(`Total flow: ${sum} dm³/s`).test(resText), 'step 7: the total flow equals the independent sum (400 dm3/s)', resText.replace(/\n+/g, ' | '));
  const pl7 = await plan(bAir.equipmentId);
  const velOk = pl7.result.sizes.every((s) => s.velocityMs <= 5 + 1e-9 && Math.abs(s.velocityMs - (s.flowM3s / (Math.PI * (s.diameterMm / 1000) ** 2 / 4))) < 1e-6);
  check(pl7.result.status === 'ok' && velOk, 'step 7: every size meets the velocity limit; velocity equals q / area', JSON.stringify(pl7.result.sizes.map((s) => [s.diameterMm, s.velocityMs])));
  check((await count('size-riser-note')) === 1 && (await count('size-draft-note')) === 1, 'step 7: the riser note and the draft note show');
  await shot('T18-size-dialog');
  const sizesBefore = await segmentSizes(page);
  const beforeApply = await baseline(page);
  await q('size-apply').click();
  await idle(600);
  const sizesAfter = await segmentSizes(page);
  const segIds = Object.keys(sizesAfter);
  check(segIds.every((id) => sizesAfter[id].shape === 'round' && sizesAfter[id].diameter > 0) && segIds.some((id) => sizesAfter[id].diameter !== sizesBefore[id].diameter), 'step 7: apply writes sizes on all segments');
  check((await count('size-applied')) === 1 && /Sized 7 segments\./.test(await text('size-applied')), 'step 7: the dialog shows "Sized 7 segments."');
  await shot('T18-size-result');
  await page.keyboard.press('Escape');
  await idle(300);
  await undo();
  check(JSON.stringify(await segmentSizes(page)) === JSON.stringify(sizesBefore) && (await baseline(page)).project === beforeApply.project, 'step 8: one Undo click restores the sizes and the project from before Size network');
  await page.locator('.mep-rail-btn[title="Redo"]').click().catch(() => {});
  await idle(400);

  // 9: Properties labels (mm, unit) with real clicks
  await openDialog();
  await q('size-apply').click();
  await idle(500);
  await closeDialog();
  const pos = await screenOf(page, bAir.clickPoints[bAir.mainSegmentId]);
  await page.mouse.click(pos.x, pos.y);
  await idle(600);
  const segLabels = await labels();
  check(segLabels.includes('Diameter (mm)') && !segLabels.some((l) => /\(pt\)/.test(l) && /Diameter|Width|Height/.test(l)), 'step 9: a segment shows "Diameter (mm)"', JSON.stringify(segLabels));
  const dia = await S(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^Diameter/.test((r.querySelector('label')?.textContent ?? '').trim()));
    return row?.querySelector('input')?.value;
  });
  const now = await segmentSizes(page);
  check(Number(dia) === now[bAir.mainSegmentId].diameter, 'step 9: Properties shows the stored main size', `${dia} vs ${now[bAir.mainSegmentId].diameter}`);
  await S((id) => window.__mepSketchScene.selectStampById(id), bAir.terminalIds[0]);
  await idle(600);
  check((await labels()).includes('Capacity (dm³/s)'), 'step 9: a connected terminal shows "Capacity (dm³/s)"');
  await shot('T18-properties-units');

  // 10: water, the slim editor, delta T typed in the dialog
  const bw = await buildSizingProject(t, { type: 'water', capacities: [10, 0, 0, 0] });
  await openDialog();
  await q('size-edit-type').click();
  await f('nt-flow-unit').waitFor({ timeout: 20000 });
  await idle(300);
  await f('nt-flow-unit').selectOption('kW');
  await f('nt-sizing-method').selectOption({ label: 'Water' });
  await idle(300);
  await shot('T18-editor-water');
  await page.locator(`${M} button`, { hasText: /^Save$/ }).first().click();
  await idle(800);
  await q('size-limits-suggest').click();
  await idle(500);
  check((await count('size-line-no-delta-t')) === 1 && (await q('size-apply').isDisabled()), 'step 10: water without delta T shows no-delta-t and the button is off');
  await typeInto('size-water-delta-t', '10');
  const e10 = await entries();
  check(e10.length === 1 && e10[0].settings.deltaTK === 10 && e10[0].settings.method === 'water', 'step 10: the entry holds deltaTK 10', JSON.stringify(e10));
  const w1 = sizeOf(await plan(bw.equipmentId), 'segment-1');
  check(w1.diameterMm === 25 && Math.abs(w1.pressureDropPaPerM - 154) < 8, 'step 10: water 10 kW, 10 K, suggested limits: DN 25 at about 154 Pa/m', JSON.stringify(w1));
  await setLimits(bw.equipmentId, { ...WATER, maxPressureDropPaPerM: 500 });
  const w2 = sizeOf(await plan(bw.equipmentId), 'segment-1');
  check(w2.diameterMm === 20 && Math.abs(w2.velocityMs - 0.76) < 0.03 && Math.abs(w2.pressureDropPaPerM - 462) < 15, 'step 10: water 500 Pa/m: DN 20, 0.76 m/s, about 462 Pa/m', JSON.stringify(w2));
  await setLimits(bw.equipmentId, { ...WATER, maxPressureDropPaPerM: 400 });
  const w3 = sizeOf(await plan(bw.equipmentId), 'segment-1');
  check(w3.diameterMm === 25, 'step 10: water 400 Pa/m: DN 25', JSON.stringify(w3));
  await setLimits(bw.equipmentId, { ...WATER, deltaTK: 20 });
  const w4 = sizeOf(await plan(bw.equipmentId), 'segment-1');
  check(w4.diameterMm <= 25 && Math.abs(w4.flowM3s - 1.194e-4) < 3e-6, 'step 10: delta T 20 K halves the flow and gives a DN of 25 or less', JSON.stringify(w4));
  await setLimits(bw.equipmentId, WATER);
  await idle(400);
  check(/DN \d+/.test(await text('size-result')) && /Total flow: [\d.]+ l\/s/.test(await text('size-result')), 'step 10: the water result shows DN sizes and l/s');
  await q('size-apply').click();
  await idle(600);
  check(Object.values(await segmentSizes(page)).every((s) => DN.includes(s.diameter)), 'step 10: every applied water diameter is a DN');
  await closeDialog();

  // 11: the unadopted type: no-method, nothing written, no error
  await buildSizingProject(t, { type: 'air' });
  await S(() => {
    const p = window.__mepSketchScene.exportProject();
    p.networkTypes = [];
    window.__mepSketchScene.loadProjectFromJson(p);
  });
  await idle(1200);
  const b11 = await baseline(page);
  await openDialog();
  check((await count('size-line-no-method')) === 1 && (await q('size-apply').isDisabled()), 'step 11: an unadopted library type gives no-method and the button is off');
  await closeDialog();
  check(await sameAsBaseline(page, b11), 'step 11: opening and closing the dialog changes nothing');

  // 12: the round trip, schema 20
  const bR = await buildSizingProject(t, { type: 'air', capacities: [100, 150, 50, 100], sizingMethod: 'air', sizing: AIR });
  await updateType('supply-air', { flowUnit: 'dm³/s' });
  await openDialog();
  await q('size-apply').click();
  await idle(600);
  await closeDialog();
  const before12 = await S(() => window.__mepSketchScene.exportProject());
  await S((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(before12));
  await idle(1500);
  const after12 = await S(() => window.__mepSketchScene.exportProject());
  const ty = (p) => p.networkTypes.find((x) => x.id === 'supply-air');
  check(after12.schemaVersion === 21 && before12.schemaVersion === 21, 'step 12: schemaVersion is 21 before and after');
  check(JSON.stringify(after12.segments.map((s) => [s.id, s.diameter])) === JSON.stringify(before12.segments.map((s) => [s.id, s.diameter])), 'step 12: the sizes are the same after save and load');
  check(ty(after12).flowUnit === 'dm³/s' && ty(after12).sizingMethod === 'air' && JSON.stringify(after12.networkSizing) === JSON.stringify(before12.networkSizing), 'step 12: flowUnit, sizingMethod and networkSizing are the same after save and load');
  void bR;

  // 13: 400 px wide and dark mode, same page
  await openDialog();
  await page.setViewportSize({ width: 400, height: 800 });
  await idle(500);
  const fit = await S(() => {
    const e = document.querySelector('.mep-modal--route');
    return { sw: e.scrollWidth, cw: e.clientWidth };
  });
  check(fit.sw <= fit.cw, 'step 13: at 400 px the dialog has no horizontal scroll', JSON.stringify(fit));
  await shot('T18-size-narrow');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await idle(500);
  const dark = await S(() => {
    const e = document.querySelector('.mep-modal--route');
    const cs = getComputedStyle(e);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  const lum = (c) => {
    const m = c.match(/[\d.]+/g).map(Number);
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  };
  check(Math.abs(lum(dark.bg) - lum(dark.fg)) > 100, 'step 13: dark mode: the dialog text and background differ in lightness', JSON.stringify(dark));
  await shot('T18-size-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await closeDialog();

  await t.finish();
  anyFail ||= process.exitCode === 1;
}

async function run2() {
  const t = await open();
  const { page, check, idle, shot } = t;
  const S = (fn, arg) => page.evaluate(fn, arg);
  await t.start();
  await t.openPdf(PDF10A);
  const b = await buildSizingProject(t, { type: 'air', capacities: [100, 150, 50, 100], sizingMethod: 'air', sizing: AIR });
  await S(() => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: 'dm³/s' }));
  const small = await S((ids) => {
    const s = window.__mepSketchScene;
    const t0 = performance.now();
    let plan;
    for (let i = 0; i < 20; i++) plan = s.planNetworkSizes(ids.e, 'out');
    const planMs = (performance.now() - t0) / 20;
    const sizes = plan.result.sizes;
    const t1 = performance.now();
    s.applyNetworkSizes(sizes);
    const applyMs = performance.now() - t1;
    return { status: plan.result.status, n: sizes.length, planMs, applyMs };
  }, { e: b.equipmentId });
  check(small.status === 'ok' && small.n === 7, 'step 14: on the 10A PDF the 7-segment network is sized', JSON.stringify(small));
  console.log(`TIMING 10A, 7 segments: planNetworkSizes ${small.planMs.toFixed(2)} ms (mean of 20), applyNetworkSizes ${small.applyMs.toFixed(2)} ms`);
  await shot('T18-10a-sized');

  // 300 segments: a trunk of 150 fittings, one terminal branch on each
  await S(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    const a = p.stamps.find((x) => x.category === 'equipment');
    const term = p.stamps.find((x) => x.id === 'term-1');
    const out = a.ports[0];
    const inp = term.ports[0];
    const start = { x: a.transform.position.x + out.fractionX * a.nativeWidth * (a.transform.scale?.x ?? 1), y: a.transform.position.y + out.fractionY * a.nativeHeight * (a.transform.scale?.y ?? 1) };
    const N = 150;
    const stamps = [a];
    const fittings = [];
    const segments = [];
    const caps = {};
    const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
    const fit = (id) => ({ kind: 'fitting', fittingId: id });
    let prev = port(a.id, 'out');
    let prevPt = start;
    for (let i = 1; i <= N; i++) {
      const pt = { x: start.x + i * 10, y: start.y };
      fittings.push({ id: `f${i}`, pageIndex: 0, position: pt, kind: 'junction' });
      segments.push({ id: `m${i}`, pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 200, endpointA: prev, endpointB: fit(`f${i}`), geometry: [prevPt, pt] });
      const tp = { x: pt.x, y: pt.y + 40 };
      const ts = { ...JSON.parse(JSON.stringify(term)), id: `t${i}`, transform: { ...term.transform, position: { x: tp.x - inp.fractionX * term.nativeWidth * (term.transform.scale?.x ?? 1), y: tp.y - inp.fractionY * term.nativeHeight * (term.transform.scale?.y ?? 1) } } };
      stamps.push(ts);
      caps[ts.id] = 10 + (i % 7);
      segments.push({ id: `b${i}`, pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 200, endpointA: fit(`f${i}`), endpointB: port(ts.id, 'in'), geometry: [pt, tp] });
      prev = fit(`f${i}`);
      prevPt = pt;
    }
    p.stamps = stamps;
    p.fittings = fittings;
    p.segments = segments;
    p.terminalCapacities = caps;
    s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
  });
  await idle(2500);
  const big = await S(() => {
    const s = window.__mepSketchScene;
    const a = s.exportProject().stamps.find((x) => x.category === 'equipment').id;
    const t0 = performance.now();
    let plan;
    for (let i = 0; i < 5; i++) plan = s.planNetworkSizes(a, 'out');
    const planMs = (performance.now() - t0) / 5;
    const t1 = performance.now();
    s.applyNetworkSizes(plan.result.sizes);
    const applyMs = performance.now() - t1;
    return { status: plan.result.status, n: plan.result.sizes.length, planMs, applyMs, problems: plan.result.problems };
  });
  check(big.status === 'ok' && big.n === 300, 'step 15: the 300-segment network on the 10A PDF is sized', JSON.stringify(big));
  console.log(`TIMING 10A, 300 segments: planNetworkSizes ${big.planMs.toFixed(2)} ms (mean of 5), applyNetworkSizes ${big.applyMs.toFixed(2)} ms`);
  await shot('T18-10a-300');
  await t.finish();
  anyFail ||= process.exitCode === 1;
}

try {
  await run1();
  await run2();
} catch (e) {
  console.log('SCRIPT ERROR', e.stack ?? e);
  anyFail = true;
}
process.exit(anyFail ? 1 : 0);
