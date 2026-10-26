// R3 part check (T12): networks that a port group keeps apart, the cascade, the flow solve and the check block of the
// Route network dialog, through real DOM inputs. Also proves that the R2 summary count is not broken.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r3-check.mjs
// The scene API is used for setup and for reading state only. Clicks stay inside .mep-modal while the dialog is open.
import { join } from 'node:path';
import { open, buildMixedGroupProject, screenOf, networkCountText, segmentTypes } from './r3-lib.mjs';
import { SP } from './lib.mjs';

const R = '.mep-modal--route';
const FIXTURES = '/root/MepApp/fixtures/pdfs/';
const MAIN_PDF = FIXTURES + '01_arch_first_floor.pdf';
let anyFail = false;

/**
 * The mixed unit plus: a grille at the end of each network, a port x with two supply segments, two terminals that
 * wait for routing (spare-s: supply-air, spare-r: return-air), and a second unit with no segment.
 */
const EXTEND = `
  const a = p.stamps[0];
  const sx = a.transform.scale?.x ?? 1;
  const sy = a.transform.scale?.y ?? 1;
  const pos = a.transform.position;
  const add = (o, dx, dy) => ({ x: o.x + dx, y: o.y + dy });
  const fp = (id) => p.fittings.find((f) => f.id === id).position;
  const one = [{ id: 'p', name: 'P', fractionX: 0.5, fractionY: 0.5 }];
  const mk = (id, category, position, extra) => ({ ...JSON.parse(JSON.stringify(a)), id, category, ports: one, transform: { ...a.transform, position }, ...extra });
  p.stamps.push(
    mk('grille-1', 'terminal', fp('fitting-2'), {}),
    mk('grille-2', 'terminal', fp('fitting-4'), {}),
    mk('spare-s', 'terminal', add(pos, 0, 400), { routingTargets: { p: 'supply-air' } }),
    mk('spare-r', 'terminal', add(pos, 150, 400), { routingTargets: { p: 'return-air' } }),
    mk('unit2', 'equipment', add(pos, 400, 300), {}),
  );
  const s2 = p.segments.find((s) => s.id === 'segment-2');
  const s4 = p.segments.find((s) => s.id === 'segment-4');
  s2.endpointB = { kind: 'port', elementId: 'grille-1', portId: 'p' };
  s4.endpointB = { kind: 'port', elementId: 'grille-2', portId: 'p' };
  p.fittings = p.fittings.filter((f) => f.id !== 'fitting-2' && f.id !== 'fitting-4');
  a.ports.push({ id: 'x', name: 'Spare x', fractionX: 0, fractionY: 0.5 });
  const xPos = { x: pos.x - 0.5 * a.nativeWidth * sx, y: pos.y };
  const f5 = add(xPos, -120, -80);
  const f6 = add(xPos, -120, 80);
  p.fittings.push({ id: 'fitting-5', pageIndex: 0, position: f5, kind: 'junction' }, { id: 'fitting-6', pageIndex: 0, position: f6, kind: 'junction' });
  const xport = { kind: 'port', elementId: a.id, portId: 'x' };
  const xseg = (id, to, point) => ({ id, pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 10, endpointA: xport, endpointB: { kind: 'fitting', fittingId: to }, geometry: [xPos, point] });
  p.segments.push(xseg('segment-5', 'fitting-5', f5), xseg('segment-6', 'fitting-6', f6));
`;

async function reload(page, idle, src) {
  const raw = await page.evaluate((src) => {
    const p = window.__mepSketchScene.exportProject();
    // eslint-disable-next-line no-new-func
    new Function('p', src)(p);
    return JSON.stringify(p);
  }, src);
  await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), raw);
  await idle(1500);
}

async function setupFull(t) {
  const b = await buildMixedGroupProject(t, 'mixed');
  await reload(t.page, t.idle, EXTEND);
  await t.page.locator('button.mep-rail-btn[title="Select"]').first().click();
  return b;
}

function helpers(t) {
  const { page, idle } = t;
  const select = (id) => page.evaluate((id) => window.__mepSketchScene.selectStampById(id), id);
  const project = () => page.evaluate(() => JSON.stringify(window.__mepSketchScene.exportProject()));
  const dirty = () => page.evaluate(() => JSON.stringify(window.__mepSketchScene.getDocuments().map((d) => d.isDirty)));
  const canUndo = () => page.evaluate(() => window.__mepSketchScene.getDrawingSummary().canUndo);
  const lsKeys = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
  const openRoute = async () => {
    await t.openRoute();
    await page.locator(R).waitFor({ timeout: 20000 });
    await idle(500);
  };
  const escapeRoute = async () => {
    await page.keyboard.press('Escape');
    await idle(400);
  };
  const choose = async (type, portId) => {
    if (type) await page.locator(`${R} [data-testid=route-type]`).selectOption(type);
    await idle(300);
    if (portId) await page.locator(`${R} [data-testid=route-port]`).selectOption(portId);
    await idle(400);
  };
  const line = (code) => page.locator(`${R} [data-testid=route-check-${code}]`);
  const sev = async (code) => ((await line(code).count()) > 0 ? await line(code).first().getAttribute('data-severity') : null);
  const text = async (code) => ((await line(code).count()) > 0 ? await line(code).first().innerText() : '');
  const count = (severity) => page.locator(`${R} [data-testid=route-checks] [data-severity=${severity}]`).count();
  const noOverflow = () => page.evaluate((sel) => { const el = document.querySelector(sel); return el.scrollWidth <= el.clientWidth; }, R);
  const summary = () => page.locator(`${R} [data-testid=route-summary] p`).allInnerTexts();
  const total = async () => {
    const m = /^(\d+) open/.exec((await summary())[0] ?? '');
    return m ? Number(m[1]) : -1;
  };
  const expectedCount = (typeId, aId) =>
    page.evaluate(([typeId, aId]) => {
      let n = 0;
      for (const s of window.__mepSketchScene.listStamps()) {
        if (s.id === aId || s.category === 'equipment') continue;
        const ids = s.ports.length ? s.ports.map((p) => p.id) : ['__center__'];
        if (ids.some((id) => s.routingTargets?.[id] === typeId && !s.portSegmentTypes?.[id])) n += 1;
      }
      return n;
    }, [typeId, aId]);
  return { select, project, dirty, canUndo, lsKeys, openRoute, escapeRoute, choose, line, sev, text, count, noOverflow, summary, total, expectedCount };
}

// ---------- Run 1: English, 1600 x 1000 ----------
let t = await open();
let { page, check, idle } = t;
let h = helpers(t);
const rail = (title) => page.locator(`button.mep-rail-btn[title="${title}"]`).first();
const typeSelect = () => page.locator('.mep-field-row', { hasText: 'Network Type' }).locator('select').first();
const flowCount = () => page.evaluate(() => (window.__mepSketchScene.getFlowResult() ?? []).length);
const linked = (name) => page.locator('label.mep-checkbox-row', { hasText: name }).locator('input[type=checkbox]');
const tab = async (name) => {
  await page.locator('button, [role=tab], div', { hasText: new RegExp(`^${name}$`) }).first().click();
  await idle(400);
};
const deselect = async () => {
  await page.mouse.click(110, 150);
  await idle(300);
};
const clickAt = async (point, shift = false) => {
  const q = await screenOf(page, point);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(q.x, q.y);
  if (shift) await page.keyboard.up('Shift');
  await idle(400);
};
const clickSeg = async (point, shift = false) => {
  if (!shift) await deselect();
  await clickAt(point, shift);
};

await t.start();
await t.openPdf(MAIN_PDF);

// Step 1 and 2: the old-file case. A group of one type: 1 network. The mixed group file: 2 networks, also after a reload.
let b = await buildMixedGroupProject(t, 'group');
await rail('Select').click();
check((await networkCountText(page)) === '1 network', 'step 2: a group of one type gives 1 network', await networkCountText(page));
b = await buildMixedGroupProject(t, 'mixed');
await rail('Select').click();
check((await networkCountText(page)) === '2 networks', 'step 2: the mixed group file gives 2 networks', await networkCountText(page));
const exported = await page.evaluate(() => window.__mepSketchScene.exportProject());
check(exported.schemaVersion === 21, 'step 2: the schema version of exportProject is 21', String(exported.schemaVersion));
check(Array.isArray(exported.portGroups) && exported.portGroups.length === 1, 'step 2: the export keeps the port group', JSON.stringify(exported.portGroups));
await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(exported));
await idle(1500);
check((await networkCountText(page)) === '2 networks', 'step 2: a reload of the same JSON gives 2 networks', await networkCountText(page));
await t.shot('T12-two-networks');
const bar = page.locator('.mep-status-counts, .mep-status').first();
const barPath = join(SP, 'T12-statusbar.png');
await bar.screenshot({ path: barPath });
console.log(`SHOT ${barPath}`);

// Step 3: the cascade over the group, through the real Properties select.
b = await buildMixedGroupProject(t, 'group');
await rail('Select').click();
await deselect();
await h.select(b.aId);
await idle(400);
check((await networkCountText(page)) === '1 network', 'step 3: group setup gives 1 network', await networkCountText(page));
await tab('Properties');
await linked('Return in').waitFor({ timeout: 10000 });
await linked('Return in').click();
await idle(400);
check((await networkCountText(page)) === '2 networks' && (await flowCount()) === 2, 'step 3: unchecking a group port gives 2 networks and 2 flow results', `${await networkCountText(page)} ${await flowCount()}`);
await linked('Return in').click();
await idle(400);
check((await networkCountText(page)) === '1 network' && (await flowCount()) === 1, 'step 3: checking the port again gives 1 network and 1 flow result', `${await networkCountText(page)} ${await flowCount()}`);
b = await buildMixedGroupProject(t, 'mixed');
await rail('Select').click();
await clickSeg(b.clickPoints['segment-2']);
check((await typeSelect().count()) > 0, 'step 3: Properties shows the Network Type select');
await typeSelect().selectOption({ label: 'Heating Water' });
await idle(600);
let types = await segmentTypes(page);
check(b.supplySegmentIds.every((id) => types[id] === 'heating-water') && b.returnSegmentIds.every((id) => types[id] === 'return-air'), 'step 3: the whole supply run changes, the return run stays', JSON.stringify(types));
check((await networkCountText(page)) === '2 networks', 'step 3: still 2 networks', await networkCountText(page));
await clickSeg(b.clickPoints['segment-4']);
await typeSelect().selectOption({ label: 'Heating Water' });
await idle(600);
types = await segmentTypes(page);
check(Object.values(types).every((x) => x === 'heating-water') && (await networkCountText(page)) === '1 network', 'step 3: both runs in one type join into 1 network', `${await networkCountText(page)} ${JSON.stringify(types)}`);
await rail('Undo').click();
await idle(500);
await rail('Undo').click();
await idle(500);
types = await segmentTypes(page);
check(b.supplySegmentIds.every((id) => types[id] === 'supply-air') && b.returnSegmentIds.every((id) => types[id] === 'return-air') && (await networkCountText(page)) === '2 networks', 'step 3: two Undo give the first state back', `${await networkCountText(page)} ${JSON.stringify(types)}`);

// Step 5: the flow root. Capacities through the Properties input, then the Solve flow button.
b = await setupFull(t);
check((await networkCountText(page)) === '3 networks', 'step 5: the full setup gives 3 networks (supply, return, port x run)', await networkCountText(page));
const setCapacity = async (stampId, value) => {
  await tab('Properties');
  await h.select(stampId);
  await idle(500);
  const input = page.locator('.mep-field-row', { hasText: 'Capacity' }).locator('input[type=number]').first();
  await input.waitFor({ timeout: 10000 });
  await input.fill(String(value));
  await input.press('Enter');
  await idle(500);
};
await setCapacity('grille-1', 120);
await setCapacity('grille-2', 80);
const live = await page.evaluate(() => window.__mepSketchScene.getFlowResult().map((f) => ({ supply: 'segment-2' in f.segmentCapacity, ret: 'segment-4' in f.segmentCapacity, total: f.totalCapacity, resolved: f.resolved })));
check(live.length === 3 && live.find((f) => f.supply)?.total === 120 && live.find((f) => f.ret)?.total === 80, 'step 5: each network total equals the capacity of its own grille (120, 80)', JSON.stringify(live));
await tab('Networks');
await page.locator('button.mep-icon-btn', { hasText: 'Solve flow' }).click();
await idle(600);
const solved = await page.evaluate(() => window.__mepSketchScene.getFlowResult().map((f) => ({ total: f.totalCapacity, resolved: f.resolved })));
check(solved.length === 3 && solved.every((f) => f.resolved), 'step 5: Solve flow gives three results, each resolved', JSON.stringify(solved));
const flowLine = await page.locator('.mep-flow-result').first().innerText().catch(() => '');
check(/200 total capacity across 3 networks/.test(flowLine), 'step 5: the Networks panel says 200 total capacity across 3 networks', flowLine);

// Step 4 setup: grille-1 becomes a second equipment stamp (fan coil unit) for the second-equipment check.
await reload(page, idle, `p.stamps.find((s) => s.id === 'grille-1').category = 'equipment';`);
await rail('Select').click();
await h.select(b.aId);
await idle(300);
await tab('Properties');

// Step 6 baseline: taken after the last setup change, before the dialog opens.
const base = { project: await h.project(), keys: await h.lsKeys(), canUndo: await h.canUndo(), dirty: await h.dirty() };

// Step 4: the dialog, English. Checks of T10 steps 1 to 5, and the R2 summary count.
await h.openRoute();
check((await page.locator(`${R} [data-testid=route-body]`).count()) === 1, 'step 4: the dialog shows the body');
await h.choose('supply-air', 'out');
check((await h.sev('group-other-type')) === 'info', 'step 4.1: group-other-type shows as info', String(await h.sev('group-other-type')));
const t1 = await h.text('group-other-type');
check(/Return in/.test(t1) && /Return Air/.test(t1), 'step 4.1: the line names "Return in" and Return Air', t1);
check((await h.count('error')) === 0 && (await h.count('warning')) === 0, 'step 4.1: no error line and no warning line');
const exp = await h.expectedCount('supply-air', b.aId);
const n = await h.total();
check(n === exp && n > 0, 'step 4: the R2 summary count equals the independent count (R2 is not broken)', `${n} vs ${exp}: ${(await h.summary())[0]}`);
await h.choose('return-air', 'in');
check((await h.sev('group-other-type')) === 'info', 'step 4.2: group-other-type shows as info for the return port', String(await h.sev('group-other-type')));
const t2 = await h.text('group-other-type');
check(/Supply out/.test(t2) && /Supply Air/.test(t2), 'step 4.2: the line names "Supply out" and Supply Air', t2);
const expR = await h.expectedCount('return-air', b.aId);
const nR = await h.total();
check(nR === expR && nR > 0, 'step 4.2: the R2 summary count for Return Air equals the independent count', `${nR} vs ${expR}`);
await h.choose('supply-air', 'x');
check((await h.sev('port-segments')) === 'warning', 'step 4.3: port-segments shows as warning', String(await h.sev('port-segments')));
check(/2 segments/.test(await h.text('port-segments')), 'step 4.3: the text holds "2 segments"', await h.text('port-segments'));
check((await h.count('error')) === 0, 'step 4.3: no error line');
await t.shot('T12-dialog-checks');
await h.choose('return-air', 'out');
check((await h.sev('port-foreign-type')) === 'error', 'step 4.4: port-foreign-type shows as error', String(await h.sev('port-foreign-type')));
check(/Supply Air/.test(await h.text('port-foreign-type')), 'step 4.4: the line names Supply Air', await h.text('port-foreign-type'));
const order = await page.locator(`${R} [data-testid=route-checks] [data-severity]`).evaluateAll((els) => els.map((e) => e.dataset.severity));
const rank = { error: 0, warning: 1, info: 2 };
check(order.every((s, i) => i === 0 || rank[order[i - 1]] <= rank[s]), 'step 4.4: the lines are in the order error, warning, info', JSON.stringify(order));
await h.choose('supply-air', 'out');
const fcuLabel = await page.locator(`${R} [data-testid=route-start] option[value="grille-1"]`).innerText();
check((await h.sev('second-equipment')) === 'info' && (await h.text('second-equipment')).includes(fcuLabel), 'step 4.5: second-equipment shows as info and names the second equipment stamp', `${fcuLabel} | ${await h.text('second-equipment')}`);

// Step 6: close with Escape, then with the Close button. Compare with the baseline each time.
const same = async (what) => {
  check((await h.project()) === base.project, `step 6 ${what}: the project JSON is equal`);
  check((await h.lsKeys()) === base.keys, `step 6 ${what}: the localStorage keys are equal`, `${base.keys} vs ${await h.lsKeys()}`);
  check((await h.canUndo()) === base.canUndo, `step 6 ${what}: canUndo is equal`);
  check((await h.dirty()) === base.dirty, `step 6 ${what}: isDirty is equal`, `${base.dirty} vs ${await h.dirty()}`);
};
await h.escapeRoute();
check((await page.locator(R).count()) === 0, 'step 6: Escape closes the dialog');
await same('after Escape');
await h.openRoute();
await h.choose('supply-air', 'x');
await page.locator(R).getByRole('button', { name: 'Close', exact: true }).last().click();
await idle(400);
check((await page.locator(R).count()) === 0, 'step 6: the Close button closes the dialog');
await same('after the Close button');

// Step 8: a second PDF as a smoke test.
await t.openPdf(FIXTURES + 'Example_1.pdf', 'second.pdf');
await h.openRoute();
const body = await page.locator(`${R} [data-testid=route-body]`).count();
const refusal = await page.locator(`${R} [data-testid=route-refusal]`).count();
check(body + refusal === 1, 'step 8: Example_1.pdf: the dialog shows its body (or the refusal)', `body ${body} refusal ${refusal}`);
await h.escapeRoute();

// Step 9: no page errors (finish).
await t.finish();
if (process.exitCode) anyFail = true;
await t.browser.close();

// ---------- Run 2 (step 7): Dutch at 400 px, a new browser ----------
t = await open({ width: 1600, height: 1000, seed: { 'mepapp.settings.labelLanguage.v1': 'nl' } });
({ page, check, idle } = t);
h = helpers(t);
await t.start();
await t.openPdf(MAIN_PDF);
const b2 = await setupFull(t);
await page.setViewportSize({ width: 400, height: 900 });
await idle(500);
await h.select(b2.aId);
await idle(300);
await h.openRoute();
await h.choose('supply-air', 'out');
const nl1 = await h.text('group-other-type');
check((await h.sev('group-other-type')) === 'info' && /Return Air/.test(nl1), 'step 7: Dutch setting: the group line is English with "Return Air"', nl1);
check(await h.noOverflow(), 'step 7: Dutch 400 px: no horizontal overflow with the info line');
await h.choose('supply-air', 'x');
const nl2 = await h.text('port-segments');
check((await h.sev('port-segments')) === 'warning' && /2 segments/.test(nl2), 'step 7: Dutch setting: the port-segments line holds "2 segments"', nl2);
check(await h.noOverflow(), 'step 7: Dutch 400 px: no overflow with the warning');
await h.choose('return-air', 'out');
check((await h.sev('port-foreign-type')) === 'error', 'step 7: Dutch: port-foreign-type shows as error');
check(await h.noOverflow(), 'step 7: Dutch 400 px: no overflow with the error');
await h.choose('supply-air', 'out');
await t.shot('T12-dialog-checks-nl-narrow');
await h.escapeRoute();
await t.finish();
if (process.exitCode) anyFail = true;
await t.browser.close();
process.exitCode = anyFail ? 1 : 0;
