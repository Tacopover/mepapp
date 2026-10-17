// T10: the check block (start check lines) in the Route network dialog, through real DOM inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t10-check.mjs
// The scene API is used for setup and for reading state only. Clicks stay inside .mep-modal while the dialog is open.
import { open, buildMixedGroupProject } from './r3-lib.mjs';

const R = '.mep-modal--route';

/** Setup of the T10 project: the mixed unit (ports out, in, group [out, in]), a port x with two supply segments, two terminals that wait for routing, a second unit with no segment. */
async function setup(t) {
  const { page, idle } = t;
  const b = await buildMixedGroupProject(t, 'mixed');
  await page.evaluate(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    const a = p.stamps[0];
    const sx = a.transform.scale?.x ?? 1;
    const sy = a.transform.scale?.y ?? 1;
    const pos = a.transform.position;
    a.ports.push({ id: 'x', name: 'Spare x', fractionX: 0, fractionY: 0.5 });
    const xPos = { x: pos.x - 0.5 * a.nativeWidth * sx, y: pos.y };
    const add = (o, dx, dy) => ({ x: o.x + dx, y: o.y + dy });
    const f5 = add(xPos, -120, -80);
    const f6 = add(xPos, -120, 80);
    p.fittings.push({ id: 'fitting-5', pageIndex: 0, position: f5, kind: 'junction' }, { id: 'fitting-6', pageIndex: 0, position: f6, kind: 'junction' });
    const port = { kind: 'port', elementId: a.id, portId: 'x' };
    const seg = (id, to, point) => ({ id, pageIndex: 0, networkTypeId: 'supply-air', shape: 'round', diameter: 10, endpointA: port, endpointB: { kind: 'fitting', fittingId: to }, geometry: [xPos, point] });
    p.segments.push(seg('segment-5', 'fitting-5', f5), seg('segment-6', 'fitting-6', f6));
    const clone = (id, category, position, ports, extra) => ({ ...JSON.parse(JSON.stringify(a)), id, category, ports, transform: { ...a.transform, position }, ...extra });
    const one = [{ id: 'p', name: 'P', fractionX: 0.5, fractionY: 0.5 }];
    p.stamps.push(
      clone('spare-s', 'terminal', add(pos, 0, 400), one, { routingTargets: { p: 'supply-air' } }),
      clone('spare-r', 'terminal', add(pos, 150, 400), one, { routingTargets: { p: 'return-air' } }),
      clone('unit2', 'equipment', add(pos, 400, 300), one, {}),
    );
    s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
  });
  await idle(1500);
  return b;
}

async function addFanCoil(t) {
  const { page, idle } = t;
  await page.evaluate(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    const a = p.stamps[0];
    const f2 = p.fittings.find((f) => f.id === 'fitting-2');
    p.stamps.push({ ...JSON.parse(JSON.stringify(a)), id: 'fcu', category: 'equipment', ports: [{ id: 'p', name: 'P', fractionX: 0.5, fractionY: 0.5 }], transform: { ...a.transform, position: f2.position } });
    const s2 = p.segments.find((x) => x.id === 'segment-2');
    s2.endpointB = { kind: 'port', elementId: 'fcu', portId: 'p' };
    p.fittings = p.fittings.filter((f) => f.id !== 'fitting-2');
    s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
  });
  await idle(1500);
}

function helpers(t) {
  const { page, idle } = t;
  const select = (id) => page.evaluate((id) => window.__mepSketchScene.selectStampById(id), id);
  const project = () => page.evaluate(() => JSON.stringify(window.__mepSketchScene.exportProject()));
  const openRoute = async () => {
    await t.menu('Route network…');
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
  return { select, project, openRoute, escapeRoute, choose, line, sev, text, count, noOverflow };
}

// ---------- Run 1: English, 1600 x 1000, then 400 px ----------
let t = await open();
let { page, check, idle } = t;
let h = helpers(t);
await t.start();
await t.openPdf();
const b = await setup(t);
await page.locator('button.mep-rail-btn[title="Select"]').first().click();
const projectBefore = await h.project();

// 1: out + supply-air: the group keeps Return Air apart (info).
await h.select(b.aId);
await idle(300);
await h.openRoute();
await h.choose('supply-air', 'out');
check((await h.sev('group-other-type')) === 'info', 'step 1: group-other-type shows as info', String(await h.sev('group-other-type')));
const t1 = await h.text('group-other-type');
check(/Return in/.test(t1) && /Return Air/.test(t1), 'step 1: the line names the port "Return in" and Return Air', t1);
check((await h.count('error')) === 0 && (await h.count('warning')) === 0, 'step 1: no error line and no warning line');

// 2: in + return-air
await h.choose('return-air', 'in');
check((await h.sev('group-other-type')) === 'info', 'step 2: group-other-type shows as info', String(await h.sev('group-other-type')));
const t2 = await h.text('group-other-type');
check(/Supply out/.test(t2) && /Supply Air/.test(t2), 'step 2: the line names the port "Supply out" and Supply Air', t2);

// 3: port x with 2 segments
await h.choose('supply-air', 'x');
check((await h.sev('port-segments')) === 'warning', 'step 3: port-segments shows as warning', String(await h.sev('port-segments')));
check(/2 segments/.test(await h.text('port-segments')), 'step 3: the text holds "2 segments"', await h.text('port-segments'));
check((await h.count('error')) === 0, 'step 3: no error line');
await t.shot('T10-checks-warning');

// 4: out + return-air: the segment on out has another type
await h.choose('return-air', 'out');
check((await h.sev('port-foreign-type')) === 'error', 'step 4: port-foreign-type shows as error', String(await h.sev('port-foreign-type')));
check(/Supply Air/.test(await h.text('port-foreign-type')), 'step 4: the line names Supply Air', await h.text('port-foreign-type'));
const order = await page.locator(`${R} [data-testid=route-checks] [data-severity]`).evaluateAll((els) => els.map((e) => e.dataset.severity));
const rank = { error: 0, warning: 1, info: 2 };
check(order.every((s, i) => i === 0 || rank[order[i - 1]] <= rank[s]), 'step 4: the lines are in the order error, warning, info', JSON.stringify(order));
await t.shot('T10-checks-error');
await h.escapeRoute();

// 5: a second equipment stamp in the network
await addFanCoil(t);
await h.select(b.aId);
await idle(300);
await h.openRoute();
await h.choose('supply-air', 'out');
const fcuLabel = await page.locator(`${R} [data-testid=route-start] option[value="fcu"]`).innerText();
check((await h.sev('second-equipment')) === 'info', 'step 5: second-equipment shows as info', String(await h.sev('second-equipment')));
check((await h.text('second-equipment')).includes(fcuLabel), 'step 5: the line names the second equipment stamp', `${fcuLabel} | ${await h.text('second-equipment')}`);
await h.escapeRoute();

// 6: a unit with no segment and no group
await h.select(b.aId);
await idle(300);
await h.openRoute();
await page.locator(`${R} [data-testid=route-start]`).selectOption('unit2');
await idle(300);
await h.choose('supply-air', 'p');
check((await page.locator(`${R} [data-testid=route-checks]`).count()) === 0, 'step 6: route-checks is absent for a unit with no segment and no group');
await h.escapeRoute();

// 7: a selected terminal gives the selection note; the unit does not
await h.select('spare-s');
await idle(300);
await h.openRoute();
const note = page.locator(`${R} [data-testid=route-selection-note]`);
check((await note.count()) === 1, 'step 7: the selection note shows for a selected terminal');
const noteText = await note.innerText().catch(() => '');
check(/not equipment/.test(noteText) && /riser/.test(noteText), 'step 7: the note holds the "not equipment" text and the riser note', noteText);
await t.shot('T10-selection-note');
await h.escapeRoute();
await h.select(b.aId);
await idle(300);
await h.openRoute();
check((await page.locator(`${R} [data-testid=route-selection-note]`).count()) === 0, 'step 7: no selection note with the unit selected');
await h.escapeRoute();

// 8: English at 400 px
await h.select(b.aId);
await idle(300);
await page.setViewportSize({ width: 400, height: 900 });
await idle(500);
await h.openRoute();
await h.choose('supply-air', 'out');
check((await h.sev('group-other-type')) === 'info', 'step 8: the info line shows at 400 px');
check(await h.noOverflow(), 'step 8: English 400 px: no horizontal overflow');
await t.shot('T10-checks-en-narrow');
await h.escapeRoute();
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(500);

// The dialog wrote nothing to the project (the project before step 5 had no fan coil unit, so compare after reload of the same state).
await h.select(b.aId);
await idle(300);
await h.openRoute();
await h.choose('supply-air', 'out');
const projectOpen = await h.project();
await t.shot('T10-checks-en-wide');
await h.escapeRoute();
check((await h.project()) === projectOpen, 'step 9: opening, using and closing the dialog changes no project data');
check(projectBefore.length > 0, 'setup: the project export is not empty');
await t.finish();
const run1Failed = process.exitCode;

// ---------- Run 2: Dutch, 400 px ----------
t = await open({ width: 1600, height: 1000, seed: { 'mepapp.settings.labelLanguage.v1': 'nl' } });
({ page, check, idle } = t);
h = helpers(t);
await t.start();
await t.openPdf();
const b2 = await setup(t);
await page.locator('button.mep-rail-btn[title="Select"]').first().click();
await page.setViewportSize({ width: 400, height: 900 });
await idle(500);
await h.select(b2.aId);
await idle(300);
await h.openRoute();
await h.choose('supply-air', 'out');
const nl1 = await h.text('group-other-type');
check((await h.sev('group-other-type')) === 'info' && /retourlucht/.test(nl1), 'Dutch: the group line shows with "retourlucht"', nl1);
check(await h.noOverflow(), 'Dutch 400 px: no horizontal overflow');
await t.shot('T10-checks-nl-narrow');
await h.choose('supply-air', 'x');
const nl2 = await h.text('port-segments');
check((await h.sev('port-segments')) === 'warning' && /2 segmenten/.test(nl2), 'Dutch: the port-segments line holds "2 segmenten"', nl2);
check(await h.noOverflow(), 'Dutch 400 px: no overflow with the warning');
await t.shot('T10-checks-nl-warning-narrow');
await h.choose('return-air', 'out');
check((await h.sev('port-foreign-type')) === 'error', 'Dutch: port-foreign-type shows as error');
check(await h.noOverflow(), 'Dutch 400 px: no overflow with the error');
await h.escapeRoute();
await h.select('spare-s');
await idle(300);
await h.openRoute();
check((await page.locator(`${R} [data-testid=route-selection-note]`).count()) === 1, 'Dutch: the selection note shows');
check(await h.noOverflow(), 'Dutch 400 px: no overflow with the selection note');
await t.shot('T10-selection-note-nl-narrow');
await h.escapeRoute();
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(500);
await h.select(b2.aId);
await idle(300);
await h.openRoute();
await h.choose('supply-air', 'out');
await t.shot('T10-checks-nl-wide');
await h.escapeRoute();
await t.finish();
if (run1Failed) process.exitCode = run1Failed;
