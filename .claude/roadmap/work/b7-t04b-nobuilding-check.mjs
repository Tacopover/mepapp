// B7-T04b: no building, a building with no risers, a building whose sheets are not the open document, and a riser on another document:
// setRiserFlowInputs is never called, and the capacity numbers do not change. Dev server with the dev building hook (no seed flag).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf, placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { TYPE } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
const t = await open();
const { page, check, idle, menu, until, statusText } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await t.openPdf(W + '00_arch_ground_floor.pdf', 'solo.pdf');
await placeOneStamp(t);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.evaluate(
  ([H, type]) => {
    const scene = window.__mepSketchScene;
    const p = scene.exportProject();
    const base = JSON.parse(JSON.stringify(p.stamps[0]));
    delete base.routingTargets;
    delete base.autoPlaced;
    const s = base.transform.scale?.x ?? 1;
    const sy = base.transform.scale?.y ?? 1;
    const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
    const rf = { x: 300, y: H - 300 };
    const at = { x: 500, y: H - 300 };
    base.id = 't0';
    base.category = 'terminal';
    base.ports = [inPort];
    base.transform = { ...base.transform, position: { x: at.x - (0 - 0.5) * base.nativeWidth * s, y: at.y - (0.5 - 0.5) * base.nativeHeight * sy } };
    p.stamps = [base];
    p.fittings = [{ id: 'rf', pageIndex: 0, position: rf, kind: 'junction' }];
    p.segments = [{ id: 's1', pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'rf' }, endpointB: { kind: 'port', elementId: 't0', portId: 'in' }, geometry: [rf, at] }];
    p.portGroups = [];
    p.terminalCapacities = { t0: 150 };
    p.networkTypes = [type];
    scene.loadProjectFromJson(p);
  },
  [H, TYPE],
);
await idle(1200);
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save');
await idle(800);
const uuid = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  window.__calls = [];
  const original = s.setRiserFlowInputs.bind(s);
  s.setRiserFlowInputs = (inputs) => {
    window.__calls.push(JSON.parse(JSON.stringify(inputs)));
    return original(inputs);
  };
});
const calls = () => page.evaluate(() => window.__calls.length);
const solved = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
async function clickPoint(p) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
async function editCapacity(from, to) {
  await clickPoint(await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't0').transform.position));
  const index = await page.evaluate((from) => [...document.querySelectorAll('.mep-field-row input[type="number"]')].findIndex((i) => i.value === String(from)), from);
  if (index < 0) return false;
  const input = page.locator('.mep-field-row input[type="number"]').nth(index);
  await input.fill(String(to));
  await input.press('Tab');
  await idle(900);
  return true;
}
await page.locator('button.mep-rail-btn[title="Select"]').click();
const noRiserBlock = async () => (await page.locator('[data-testid="props-riser-section"]').count()) === 0;
const probe = async (label, from, to) => {
  const ok = await editCapacity(from, to);
  check(ok, `${label}: edited the capacity with the real input`);
  await clickPoint({ x: 300, y: H - 300 });
  check((await solved()) === String(to), `${label}: the fitting shows ${to}`, String(await solved()));
  check(await noRiserBlock(), `${label}: no riser block`);
  await clickPoint({ x: 400, y: H - 300 });
  check((await page.locator('[data-testid="props-segment-riser-hint"]').count()) === 0, `${label}: no segment hint`);
  check((await calls()) === 0, `${label}: setRiserFlowInputs was never called`, String(await calls()));
};

await probe('no building', 150, 200);

const level = (id, name, mm) => ({ id, name, elevationMm: mm });
const sheet = (id, levelId, projectUuid) => ({ id, levelId, projectUuid, pageIndex: 0, displayName: id, location: { fileName: 'solo.pdf', path: 'solo.pdf' } });
const baseFile = { schemaVersion: 1, id: 'b-nr', name: 'No risers', levels: [level('l0', 'Level 0', 0), level('l1', 'Level 1', 3000)], risers: [] };
const riserOn = (sheetIds) => ({
  id: 'r1', name: 'R1', networkTypeId: TYPE.id, networkType: TYPE, anchorMm: { xMm: 100, yMm: 100 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0,
  members: sheetIds.map((id, i) => ({ levelId: `l${i}`, sheetId: id, pageIndex: 0, fittingId: 'rf' })),
  pending: [],
});
async function load(file) {
  await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(file));
  await idle(1200);
}

await load({ ...baseFile, sheets: [sheet('s0', 'l0', uuid)] });
await probe('building with no risers', 200, 250);
await load({ ...baseFile, sheets: [sheet('s0', 'l0', 'other-uuid-1'), sheet('s1', 'l1', 'other-uuid-2')], risers: [riserOn(['s0', 's1'])] });
await probe('riser on other documents, open document not in the building', 250, 300);
await load({ ...baseFile, sheets: [sheet('s0', 'l0', uuid), sheet('s1', 'l1', 'other-uuid-2')], risers: [] });
await probe('sheets in the building, no riser at all', 300, 350);
// B7-T09c-2a: a source-less network with 2 or more open ends shows "at most" and the hint (no building, no riser input is sent).
// A network with an equipment is unchanged: plain numbers, no hint.
async function loadTee(withEquipment) {
  await page.evaluate(
    ([H, type, withEquipment]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      const base = JSON.parse(JSON.stringify(p.stamps[0]));
      const sx = base.transform.scale?.x ?? 1;
      const sy = base.transform.scale?.y ?? 1;
      const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
      const T = { x: 400, y: H - 400 };
      const oa = { x: 200, y: H - 400 };
      const ob = { x: 400, y: H - 200 };
      const at = { x: 600, y: H - 400 };
      const mk = (id, category, point) => {
        const s = JSON.parse(JSON.stringify(base));
        s.id = id;
        s.category = category;
        s.ports = [inPort];
        s.transform = { ...s.transform, position: { x: point.x - (0 - 0.5) * base.nativeWidth * sx, y: point.y - (0.5 - 0.5) * base.nativeHeight * sy } };
        return s;
      };
      const seg = (id, a, b, from, to) => ({ id, pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
      const fit = (id) => ({ kind: 'fitting', fittingId: id });
      const port = (id) => ({ kind: 'port', elementId: id, portId: 'in' });
      p.stamps = [mk('t9', 'terminal', at), ...(withEquipment ? [mk('src9', 'equipment', oa)] : [])];
      p.fittings = [{ id: 'T9', pageIndex: 0, position: T, kind: 'tee' }, { id: 'ob9', pageIndex: 0, position: ob, kind: 'junction' }, ...(withEquipment ? [] : [{ id: 'oa9', pageIndex: 0, position: oa, kind: 'junction' }])];
      p.segments = [
        seg('a9', withEquipment ? port('src9') : fit('oa9'), fit('T9'), oa, T),
        seg('b9', fit('T9'), fit('ob9'), T, ob),
        seg('c9', fit('T9'), port('t9'), T, at),
      ];
      p.portGroups = [];
      p.terminalCapacities = { t9: 100 };
      p.networkTypes = [type];
      scene.loadProjectFromJson(p);
    },
    [H, TYPE, withEquipment],
  );
  await idle(1200);
}
const atMostHints = () => page.locator('[data-testid="props-at-most-hint"]').count();
await loadTee(false);
await clickPoint({ x: 360, y: H - 400 });
check((await solved()) === 'at most 100', 'no building, no source, two open ends: the segment shows "at most 100"', String(await solved()));
check((await atMostHints()) === 1, 'no building, no source, two open ends: the hint shows');
await clickPoint({ x: 400, y: H - 300 });
check((await solved()) === 'at most 100', 'no building, no source: the second open-end segment shows "at most 100"', String(await solved()));
await loadTee(true);
await clickPoint({ x: 360, y: H - 400 });
check((await solved()) === '100', 'equipment at one open end: the segment of the equipment shows plain 100', String(await solved()));
check((await atMostHints()) === 0, 'equipment: no hint');
await clickPoint({ x: 400, y: H - 300 });
check((await solved()) === '0', 'equipment: the dead open end shows plain 0', String(await solved()));
check((await atMostHints()) === 0, 'equipment: no hint on the dead open end');
check((await calls()) === 0, 'setRiserFlowInputs was never called', String(await calls()));
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
