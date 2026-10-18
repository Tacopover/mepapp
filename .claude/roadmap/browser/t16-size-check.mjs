// T15a, T15b, T16 browser check (revision 2: the limits are saved for each network): the Size dialog through the real menu, selects, clicks and inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t16-size-check.mjs
import { open, buildSizingProject, segmentSizes, baseline, sameAsBaseline, screenOf } from './r5-lib.mjs';

const PDF = '/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf';
const SUGGESTED_AIR = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' };
const DN = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];

const t = await open();
const { page, check, idle, shot } = t;
const ev = (fn, arg) => page.evaluate(fn, arg);
const Z = '.mep-modal--route';
const M = '.mep-modal';
const q = (id) => page.locator(`${Z} [data-testid=${id}]`);
const count = (id) => q(id).count();
const typeInto = async (id, value) => {
  await q(id).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value);
  await page.keyboard.press('Tab');
  await idle(500);
};
const entries = () => page.evaluate(() => window.__mepSketchScene.exportProject().networkSizing);
const text = (id) => q(id).innerText();
const scene = (fn, arg) => page.evaluate(fn, arg);

async function main() {
  await t.start();

  // 1: item disabled before a PDF is open
  await page.locator('button.mep-menu-btn').click();
  const disabledBefore = await page.locator('button.mep-menu-item', { hasText: /^\s*Size network…\s*$/ }).isDisabled();
  check(disabledBefore, 'step 1: menu item "Size network…" is disabled before a PDF is open');
  await page.keyboard.press('Escape');
  await page.locator('button.mep-menu-btn').click().catch(() => {});
  await page.keyboard.press('Escape');
  await t.openPdf(PDF);

  const openDialog = async () => {
    await t.menu('Size network…');
    await page.locator(Z).waitFor({ timeout: 20000 });
    await idle(500);
  };
  const closeDialog = async () => {
    await q('size-close').click();
    await idle(300);
  };
  const updateType = (id, patch) => scene(([id, patch]) => window.__mepSketchScene.updateNetworkType(id, patch), [id, patch]);
  const exportTypes = () => scene(() => window.__mepSketchScene.exportProject().networkTypes.filter((x) => x.id !== 'default'));
  const f = (id) => page.locator(`${M} [data-testid=${id}]`);
  const saveBtn = () => page.locator(`${M} button`, { hasText: /^Save$/ }).first();

  // ---- air case, type has no sizing ----
  const built = await buildSizingProject(t, { type: 'air', capacities: [100, 150, 50, 100] });
  await page.locator('button.mep-menu-btn').click();
  check(!(await page.locator('button.mep-menu-item', { hasText: /^\s*Size network…\s*$/ }).isDisabled()), 'step 2: menu item is enabled after the PDF opens');
  await shot('T16-menu');
  await page.keyboard.press('Escape');
  await idle(300);
  if ((await page.locator('button.mep-menu-item').count()) > 0) {
    await page.locator('button.mep-menu-btn').click();
    await idle(300);
  }

  const base0 = await baseline(page);
  await openDialog();
  const startOpts = await q('size-start').locator('option').allInnerTexts();
  const portOpts = await q('size-port').locator('option').allInnerTexts();
  check(startOpts.length === 1, 'step 2: start select lists the one equipment stamp', JSON.stringify(startOpts));
  check(portOpts.length === 1 && /Supply out/.test(portOpts[0]), 'step 2: port select lists the out port', JSON.stringify(portOpts));
  check(/Supply Air/.test(await text('size-type')), 'step 2: size-type reads Supply Air', await text('size-type'));
  check(await count('size-line-no-method') === 1, 'step 3: no-method line shows when the type has no method');
  check((await q('size-line-no-method').getAttribute('data-severity')) === 'error' && /Error/.test(await text('size-line-no-method')), 'step 3: the line has severity error and the label Error');
  check(await q('size-apply').isDisabled(), 'step 3: size-apply is disabled');
  const bodyText = await page.locator(Z).innerText();
  check(!/door|crossing/i.test(bodyText) && !/\b(netwerk|maat|toevoer|afvoer|lucht)\b/i.test(bodyText), 'step 3: no door or crossing word and no Dutch word');
  check(await count('size-edit-type') === 1, 'step 3: size-edit-type shows');
  check(await count('size-riser-note') === 1 && await count('size-draft-note') === 1, 'notes: riser note and draft note show');
  await shot('T16-size-dialog-error');

  // 4: the editor on top, then the dialog behind updates
  await q('size-edit-type').click();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).waitFor({ timeout: 20000 });
  await idle(400);
  check(await page.locator(M).count() === 2, 'step 4: the editor opens on top of the Size dialog', String(await page.locator(M).count()));
  await f('nt-flow-unit').selectOption('dm³/s');
  await f('nt-sizing-method').selectOption({ label: 'Air' });
  await idle(300);
  check(await f('nt-suggest').count() === 0 && await f('nt-air-max-velocity').count() === 0, 'step 4: the editor has no suggest button and no limit field');
  await shot('T16-editor-slim');
  await saveBtn().click();
  await idle(800);
  check(await page.locator(M).count() === 1, 'step 4: Save closes the editor only');
  check(await count('size-line-no-flow-unit') === 0 && await count('size-line-no-method') === 0, 'step 4: the flow unit and method lines go after Save (networkTypesChanged)');
  check(await count('size-line-no-sizing') === 1, 'step 4: the no-sizing line shows');
  check(await count('size-edit-type') === 0, 'step 4: size-edit-type is not shown for no-sizing');
  check(await count('size-limits') === 1 && await q('size-air-max-velocity').inputValue() === '', 'step 4: the limits section shows with empty fields');
  await shot('T16-size-limits-empty');
  await q('size-limits-suggest').click();
  await idle(500);
  check(await q('size-air-max-velocity').inputValue() === '5' && await q('size-air-max-drop').inputValue() === '1', 'step 4: Use suggested values fills 5 and 1');
  check(await count('size-line-no-sizing') === 0, 'step 4: the no-sizing line goes');
  const e4 = await entries();
  check(e4.length === 1 && e4[0].startStampId === built.equipmentId && e4[0].startPortId === 'out' && e4[0].settings.maxVelocityMs === 5 && e4[0].settings.maxPressureDropPaPerM === 1, 'step 4: the export holds one entry with the suggested limits', JSON.stringify(e4));
  check(/Capacities are read as dm³\/s\./.test(await text('size-unit')), 'step 4: size-unit reads "Capacities are read as dm³/s."', await text('size-unit'));

  // 5: result
  const sum = await scene(() => Object.values(window.__mepSketchScene.exportProject().terminalCapacities).reduce((a, b) => a + b, 0));
  const resultText = await text('size-result');
  console.log('RESULT', resultText.replace(/\n+/g, ' | '));
  check(sum === 400 && new RegExp(`Total flow: ${sum} dm³/s`).test(resultText), 'step 5: total flow equals the independent sum', resultText);
  const segCount = await scene(() => window.__mepSketchScene.exportProject().segments.length);
  check(new RegExp(`${segCount} segments sized\\.`).test(resultText), 'step 5: sized count equals the segment count', resultText);
  check(await count('size-velocity-note') === 1 && /Air at 20 °C\./.test(await text('size-fluid')), 'step 16: velocity note and the air fluid line show');
  check(await count('size-return-note') === 0 && await count('size-pipe-note') === 0, 'step 16: no water notes for the air type');
  check(!(await q('size-apply').isDisabled()), 'step 5: size-apply is enabled');
  await shot('T16-size-dialog-ok');
  await shot('T16-size-result');
  await shot('T16-size-limits');

  // 20: persistence
  await closeDialog();
  const exported20 = await scene(() => JSON.stringify(window.__mepSketchScene.exportProject()));
  await scene((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), exported20);
  await idle(1500);
  await openDialog();
  check(await q('size-air-max-velocity').inputValue() === '5' && await q('size-air-max-drop').inputValue() === '1', 'step 20: the fields show 5 and 1 after export and load');

  // 6: apply, then undo
  const beforeApply = await baseline(page);
  const sizesBefore = await segmentSizes(page);
  await q('size-apply').click();
  await idle(600);
  const sizesAfter = await segmentSizes(page);
  const changed = built.segmentIds.filter((id) => sizesAfter[id].diameter !== sizesBefore[id].diameter).length;
  check(changed > 0 && built.segmentIds.every((id) => sizesAfter[id].shape === 'round' && sizesAfter[id].diameter > 0), 'step 6: the export holds sizes on all segments', `${changed} changed`);
  check(await count('size-applied') === 1 && new RegExp(`Sized ${segCount} segments\\.`).test(await text('size-applied')), 'step 6: the block shows "Sized n segments."', await count('size-applied') ? await text('size-applied') : 'none');
  check(await page.locator(Z).count() === 1, 'step 6: the dialog stays open after the apply');
  await shot('T16-size-applied');
  await page.keyboard.press('Escape');
  await idle(300);
  check(await page.locator(Z).count() === 0, 'step 6: Escape closes the dialog');
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(500);
  const afterUndo = await segmentSizes(page);
  check(JSON.stringify(afterUndo) === JSON.stringify(sizesBefore), 'step 6: Undo restores the sizes from before the apply (one step)');
  check((await baseline(page)).project === beforeApply.project, 'step 6: the project after Undo equals the project before the apply');
  // apply again (second press writes the same sizes) for step 7
  await openDialog();
  await q('size-apply').click();
  await idle(500);
  await q('size-apply').click();
  await idle(500);
  const sizesTwice = await segmentSizes(page);
  check(JSON.stringify(sizesTwice) === JSON.stringify(sizesAfter), 'a second press writes the same sizes with no error');
  await closeDialog();

  // 7: Properties panel
  const readDia = async (id) => {
    const pos = await screenOf(page, built.clickPoints[id]);
    await page.mouse.click(pos.x, pos.y);
    await idle(500);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.mep-field-row')].map((r) => ({ text: r.querySelector('label')?.innerText.trim() ?? '', value: r.querySelector('input')?.value })));
    return rows.find((r) => /^Diameter/i.test(r.text));
  };
  const mainDia = await readDia(built.mainSegmentId);
  const branchDia = await readDia('segment-4');
  check(mainDia && Number(mainDia.value) === sizesTwice[built.mainSegmentId].diameter, 'step 7: Properties shows the stored main size', JSON.stringify(mainDia));
  check(mainDia && branchDia && Number(mainDia.value) >= Number(branchDia.value), 'step 7: the main is not smaller than a branch', `${mainDia?.value} vs ${branchDia?.value}`);

  // 11, 12: narrow
  await openDialog();
  await page.setViewportSize({ width: 400, height: 800 });
  await idle(500);
  const fit = await page.evaluate(() => { const e = document.querySelector('.mep-modal--route'); return { sw: e.scrollWidth, cw: e.clientWidth }; });
  check(fit.sw <= fit.cw, 'step 11: at 400 px the dialog has no horizontal scroll', JSON.stringify(fit));
  await shot('T16-size-narrow');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(400);

  // 14: stale test, a new capacity typed in the Properties panel while the dialog is open
  const termPos = await scene((id) => {
    const s = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === id);
    const sx = s.transform.scale?.x ?? 1;
    const sy = s.transform.scale?.y ?? 1;
    return { x: s.transform.position.x + (s.nativeWidth * sx) / 2, y: s.transform.position.y + (s.nativeHeight * sy) / 2 };
  }, built.terminalIds[0]);
  const tp = await screenOf(page, termPos);
  void tp;
  await scene((id) => window.__mepSketchScene.selectStampById(id), built.terminalIds[0]);
  await idle(600);
  const capInput = page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Capacity/ }) }).locator('input').first();
  check(await capInput.count() === 1, 'step 14: Properties panel shows a Capacity input for the terminal');
  await capInput.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('300');
  await page.keyboard.press('Tab');
  await idle(900);
  const sum2 = await scene(() => Object.values(window.__mepSketchScene.exportProject().terminalCapacities).reduce((a, b) => a + b, 0));
  const total2 = await text('size-result');
  check(page.locator(Z) !== null && await page.locator(Z).count() === 1, 'step 14: the dialog stays open');
  check(new RegExp(`Total flow: ${sum2} dm³/s`).test(total2) && sum2 !== 400, 'step 14: the total flow follows the new capacity', `${sum2}; ${total2.replace(/\n+/g, ' | ')}`);

  // 15: unsized confirm
  await capInput.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await idle(900);
  const r15 = await text('size-result');
  console.log('R15', r15.replace(/\n+/g, ' | '));
  check(/1 segment is not sized and keeps its old size\./.test(r15), 'step 15: size-result shows the singular unsized text', r15);
  check(/segments get a new size\. A size that you typed by hand is overwritten\./.test(r15), 'step 15: size-result shows the new-size text');
  await q('size-apply').click();
  await idle(300);
  const sBefore = await segmentSizes(page);
  check(await count('size-confirm') === 1, 'step 15: size-confirm shows on the first press');
  check(JSON.stringify(await segmentSizes(page)) === JSON.stringify(sBefore) && JSON.stringify(await segmentSizes(page)) === JSON.stringify(sizesTwice), 'step 15: the export is unchanged while the confirm shows');
  await shot('T16-size-confirm');
  await q('size-confirm-no').click();
  await idle(300);
  check(await count('size-confirm') === 0 && JSON.stringify(await segmentSizes(page)) === JSON.stringify(sizesTwice), 'step 15: Cancel hides the panel and nothing is written');
  // make the sizes differ first: undo restores the 200 size
  await closeDialog();
  await page.locator(".mep-rail-btn[title=\"Undo\"]").click();
  await idle(300);
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(500);
  const sBeforeYes = await segmentSizes(page);
  await openDialog();
  await q('size-apply').click();
  await idle(300);
  await q('size-confirm-yes').click();
  await idle(600);
  const sYes = await segmentSizes(page);
  const unsizedSeg = built.segmentIds.find((id) => id === 'segment-4' || true);
  const diffs = built.segmentIds.filter((id) => JSON.stringify(sYes[id]) !== JSON.stringify(sBeforeYes[id]));
  check(diffs.length > 0, 'step 15: "Size anyway" changes the sized segments', `${diffs.length}`);
  const terminalSegment = await scene((tid) => window.__mepSketchScene.exportProject().segments.find((s) => s.endpointB.elementId === tid || s.endpointA.elementId === tid)?.id, built.terminalIds[0]);
  check(JSON.stringify(sYes[terminalSegment]) === JSON.stringify(sBeforeYes[terminalSegment]), 'step 15: the unsized segment keeps its old size', terminalSegment);
  void unsizedSeg;
  await closeDialog();

  // 10: no equipment
  await scene(() => { const p = window.__mepSketchScene.exportProject(); p.segments = []; p.fittings = []; window.__mepSketchScene.loadProjectFromJson(p); });
  await idle(1200);
  await openDialog();
  check(await count('size-no-equipment') === 1 && await count('size-start') === 0, 'step 10: no equipment shows the text and no select');
  await shot('T16-size-no-equipment');
  await closeDialog();

  // ---- no-flow-unit (sizing set, unit not set) ----
  await buildSizingProject(t, { type: 'air', sizingMethod: 'air', sizing: SUGGESTED_AIR });
  await openDialog();
  check(await count('size-line-no-flow-unit') === 1 && (await q('size-line-no-flow-unit').getAttribute('data-severity')) === 'error', 'no-flow-unit: line shows with severity error');
  check(await count('size-unit') === 0 && await q('size-apply').isDisabled(), 'no-flow-unit: no unit line and size-apply is disabled');
  await closeDialog();

  // ---- 19: stacked dialogs, one Escape ----
  await openDialog();
  await q('size-edit-type').click();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).waitFor();
  await idle(300);
  await page.keyboard.press('Escape');
  await idle(400);
  const left = await page.locator(M).count();
  console.log(`STACKED ESCAPE: dialogs left after one Escape = ${left}`);
  if (left > 0) await page.keyboard.press('Escape');
  await idle(300);

  // ---- 9: unadopted type ----
  const b9 = await buildSizingProject(t, { type: 'air' });
  void b9;
  await scene(() => { const p = window.__mepSketchScene.exportProject(); p.networkTypes = []; window.__mepSketchScene.loadProjectFromJson(p); });
  await idle(1200);
  check((await exportTypes()).length === 0, 'step 9: the project has no adopted types', JSON.stringify((await exportTypes()).map((x) => x.id)));
  await openDialog();
  check(await count('size-line-no-method') === 1 && await q('size-apply').isDisabled(), 'step 9: unadopted library type gives no-method and a disabled button');
  check((await exportTypes()).length === 0, 'step 9: opening the dialog adopts nothing');
  await q('size-edit-type').click();
  await page.locator(`${M} [data-testid=nt-flow-unit]`).waitFor();
  await idle(300);
  await f('nt-flow-unit').selectOption('dm³/s');
  await f('nt-sizing-method').selectOption({ label: 'Air' });
  await saveBtn().click();
  await idle(800);
  const adopted = (await exportTypes()).map((x) => x.id);
  check(adopted.includes('supply-air'), 'step 9: after Save the type is adopted', JSON.stringify(adopted));
  check(await count('size-line-no-sizing') === 1, 'step 9: after the editor saved Air, no-sizing shows');
  await q('size-limits-suggest').click();
  await idle(500);
  check(!(await q('size-apply').isDisabled()), 'step 9: apply works after the editor saved the type');
  await closeDialog();

  // ---- 18: mixed type ----
  const b18 = await buildSizingProject(t, { type: 'mixed', sizingMethod: 'air', sizing: SUGGESTED_AIR });
  await updateType('supply-air', { flowUnit: 'dm³/s' });
  const s18Before = await segmentSizes(page);
  await openDialog();
  check(await count('size-line-mixed-type') === 1 && (await q('size-line-mixed-type').getAttribute('data-severity')) === 'warning' && /Warning/.test(await text('size-line-mixed-type')), 'step 18: mixed-type line shows as Warning');
  await q('size-apply').click();
  await idle(300);
  if (await count('size-confirm') === 1) await q('size-confirm-yes').click();
  await idle(600);
  const s18After = await segmentSizes(page);
  check(JSON.stringify(s18After['segment-3']) === JSON.stringify(s18Before['segment-3']) && JSON.stringify(s18After['segment-7']) === JSON.stringify(s18Before['segment-7']), 'step 18: the Return Air segments keep their size');
  check(JSON.stringify(s18After['segment-1']) !== JSON.stringify(s18Before['segment-1']), 'step 18: a Supply Air segment is sized');
  void b18;
  await closeDialog();

  // ---- 8 and 16 water ----
  await buildSizingProject(t, { type: 'water', capacities: [5, 5, 5, 5], sizingMethod: 'water' });
  await updateType('heating-water', { flowUnit: 'kW' });
  await openDialog();
  check(await count('size-line-no-sizing') === 1, 'step 8: no-sizing shows before the limits are saved');
  await q('size-limits-suggest').click();
  await idle(500);
  check(await count('size-line-no-delta-t') === 1 && (await q('size-line-no-delta-t').getAttribute('data-severity')) === 'error', 'step 8: no-delta-t line shows as Error');
  check(await count('size-edit-type') === 0, 'step 8: size-edit-type is not shown for no-delta-t');
  check(await q('size-apply').isDisabled(), 'step 8: size-apply is disabled without delta T');
  await shot('T16-size-limits-water');
  await typeInto('size-water-delta-t', '10');
  check(await count('size-line-no-delta-t') === 0, 'step 8: the delta T line goes after the typed value');
  const e8 = await entries();
  check(e8.length === 1 && e8[0].settings.deltaTK === 10, 'step 8: the entry holds deltaTK 10', JSON.stringify(e8));
  const waterResult = await text('size-result');
  console.log('WATER', waterResult.replace(/\n+/g, ' | '));
  check(/DN \d+/.test(waterResult) && /Total flow: [\d.]+ l\/s/.test(waterResult), 'step 8: the result shows DN sizes and a total flow in l/s', waterResult);
  check(await count('size-return-note') === 1 && /Supply and return pipes must be separate networks\./.test(await text('size-return-note')) && await count('size-pipe-note') === 1 && /Water at 20 °C, no glycol\./.test(await text('size-fluid')), 'step 16: water notes show');
  check(await count('size-velocity-note') === 0, 'step 16: no velocity note for water');
  await shot('T16-size-water');
  await q('size-apply').click();
  await idle(600);
  const wsizes = await segmentSizes(page);
  check(Object.values(wsizes).every((s) => DN.includes(s.diameter)), 'step 8: every diameter is in the DN list', JSON.stringify(Object.values(wsizes).map((s) => s.diameter)));
  await closeDialog();

  // ---- 17 discipline ----
  const built17 = await buildSizingProject(t, { type: 'air' });
  await scene((equipmentId) => {
    const p = window.__mepSketchScene.exportProject();
    for (const s of p.segments) s.networkTypeId = 'domestic-cold-water';
    p.networkTypes = [{ id: 'domestic-cold-water', name: 'Domestic Cold Water', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10, color: '#2962ff', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'dm³/s', sizingMethod: 'air' }];
    p.networkSizing = [{ startStampId: equipmentId, startPortId: 'out', settings: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' } }];
    window.__mepSketchScene.loadProjectFromJson(p);
  }, built17.equipmentId);
  await idle(1200);
  const b17 = await baseline(page);
  await openDialog();
  const dtext = await text('size-line-discipline-not-sized').catch(() => '');
  check(dtext.includes('This network type has no sizing method. Sizing is for ventilation and heating/cooling water only. Plumbing, drains and fire protection are not sized by this command.'), 'step 17: the discipline text shows in full', dtext);
  check(await q('size-apply').isDisabled() && await count('size-edit-type') === 0, 'step 17: size-apply is disabled and size-edit-type is not shown');
  await shot('T16-size-discipline');
  await closeDialog();
  check(await sameAsBaseline(page, b17), 'step 17: the project is unchanged');

  // ---- 21: per network ----
  const b21 = await buildSizingProject(t, { type: 'air', capacities: [25, 25, 25, 25], sizingMethod: 'air', sizing: SUGGESTED_AIR });
  await updateType('supply-air', { flowUnit: 'dm³/s' });
  await scene(() => {
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
  check((await q('size-start').locator('option').count()) === 2, 'step 21: the start select lists two equipment stamps');
  await q('size-start').selectOption('ahu2');
  await idle(500);
  check(await q('size-air-max-velocity').inputValue() === '' && await count('size-line-no-sizing') === 1, 'step 21: the second start has empty fields and the no-sizing line');
  await q('size-limits-suggest').click();
  await idle(400);
  await typeInto('size-air-max-velocity', '3');
  const e21 = await entries();
  const second = e21.find((e) => e.startStampId === 'ahu2');
  const first = e21.find((e) => e.startStampId === b21.equipmentId);
  check(second?.settings.maxVelocityMs === 3 && first?.settings.maxVelocityMs === 5, 'step 21: the two entries differ (3 and 5)', JSON.stringify(e21));
  const sizeOf = (stamp, segment) => scene(([stamp, segment]) => window.__mepSketchScene.planNetworkSizes(stamp, 'out').result.sizes.find((x) => x.segmentId === segment)?.diameterMm, [stamp, segment]);
  const d1 = await sizeOf(b21.equipmentId, 'segment-1');
  const d2 = await sizeOf('ahu2', 'segment-9');
  check(d1 === 200 && d2 === 250, 'step 21: the same flow 0.1 m3/s gives 200 and 250', `${d1} / ${d2}`);
  await shot('T16-size-limits-second');
  await q('size-start').selectOption(b21.equipmentId);
  await idle(500);
  check(await q('size-air-max-velocity').inputValue() === '5', 'step 21: the first start still shows 5');

  // ---- 22: invalid input ----
  await q('size-start').selectOption('ahu2');
  await idle(400);
  await typeInto('size-air-max-velocity', '0');
  check(await count('size-error-air-max-velocity') === 1, 'step 22: an error line shows for 0');
  check((await entries()).find((e) => e.startStampId === 'ahu2')?.settings.maxVelocityMs === 3, 'step 22: the export keeps the last valid entry (3)');
  await shot('T16-size-limits-error');
  await typeInto('size-air-max-velocity', 'abc');
  check((await entries()).find((e) => e.startStampId === 'ahu2')?.settings.maxVelocityMs === 3, 'step 22: abc writes nothing');
  await q('size-limits-clear').click();
  await idle(500);
  check(!(await entries()).some((e) => e.startStampId === 'ahu2') && await count('size-line-no-sizing') === 1, 'step 22: Clear limits removes the entry and shows no-sizing');
  await closeDialog();

  // ---- 23: delete and undo ----
  const sp = await scene((id) => {
    const st = window.__mepSketchScene.exportProject().stamps.find((x) => x.id === id);
    return { x: st.transform.position.x + (st.nativeWidth * (st.transform.scale?.x ?? 1)) / 2, y: st.transform.position.y + (st.nativeHeight * (st.transform.scale?.y ?? 1)) / 2 };
  }, b21.equipmentId);
  const sPos = await screenOf(page, sp);
  await page.mouse.click(sPos.x, sPos.y);
  await idle(500);
  await page.locator('body').press('Delete');
  await idle(700);
  check(!(await entries()).some((e) => e.startStampId === b21.equipmentId), 'step 23: no entry for the deleted start stamp in the export');
  await openDialog();
  check((await q('size-start').locator('option').count()) <= 1, 'step 23: the dialog lists no deleted stamp');
  await closeDialog();
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(800);
  check((await entries()).some((e) => e.startStampId === b21.equipmentId), 'step 23: undo brings the stamp and its entry back');

  // ---- 24: a v19 file ----
  await scene(() => {
    const p = window.__mepSketchScene.exportProject();
    p.schemaVersion = 19;
    delete p.networkSizing;
    p.networkTypes = p.networkTypes.map((x) => ({ ...x, sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 4, series: 'standard' } }));
    for (const x of p.networkTypes) delete x.sizingMethod;
    window.__mepSketchScene.loadProjectFromJson(p);
  });
  await idle(1500);
  await openDialog();
  check(await count('size-line-no-sizing') === 1, 'step 24: a v19 file shows no-sizing (the limits are dropped)');
  await closeDialog();
  const p24 = await scene(() => window.__mepSketchScene.exportProject());
  const t24 = p24.networkTypes.find((x) => x.id === 'supply-air');
  check(p24.schemaVersion === 20 && t24 && t24.sizingMethod === 'air' && !('sizing' in t24), 'step 24: schema 20, the method is kept and the type has no sizing', JSON.stringify(t24));

  // ---- 25: method change ----
  await buildSizingProject(t, { type: 'air', sizingMethod: 'air', sizing: SUGGESTED_AIR });
  await updateType('supply-air', { flowUnit: 'kW', discipline: 'heatingAndCooling', sizingMethod: 'water' });
  await openDialog();
  check(await count('size-line-no-sizing') === 1 && await q('size-water-max-velocity').inputValue() === '', 'step 25: an entry of the other method is ignored (no-sizing, empty water fields)');
  check((await entries()).length === 1 && (await entries())[0].settings.method === 'air', 'step 25: the export still holds the air entry');
  await closeDialog();
  void base0;
}

try {
  await main();
} catch (e) {
  console.log('SCRIPT ERROR', e.stack ?? e);
  process.exitCode = 1;
}
await t.finish();
