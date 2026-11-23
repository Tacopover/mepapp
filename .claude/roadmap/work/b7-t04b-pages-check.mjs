// B7-T04b: a page change. One PDF with two pages = two levels of one building (same projectUuid). The inputs go with the page:
// page 0 has the source and the riser fitting rf, page 1 has the riser fitting rf2. The next page is a real click on the status bar button.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf, placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { TYPE } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const t = await open();
const { page, check, idle, menu, until, statusText } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await t.openPdf('/root/MepApp/fixtures/pdfs/Sample Project_multi_page.pdf', 'multi.pdf');
await placeOneStamp(t);
const pageCount = await page.evaluate(() => window.__mepSketchScene.getPageCount?.() ?? null);
console.log('PAGE COUNT', pageCount);
const H0 = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.locator('button[title="Next page"]').click();
await idle(1500);
const H1 = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
await page.locator('button[title="Previous page"]').click();
await idle(1500);
const built = await page.evaluate(
  ([H0, H1, type]) => {
    const scene = window.__mepSketchScene;
    const p = scene.exportProject();
    const base = JSON.parse(JSON.stringify(p.stamps[0]));
    delete base.routingTargets;
    delete base.autoPlaced;
    const sx = base.transform.scale?.x ?? 1;
    const sy = base.transform.scale?.y ?? 1;
    const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
    const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
    const placeAt = (port, at) => ({ x: at.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * base.nativeHeight * sy });
    const stamp = (id, category, port, at, pageIndex) => {
      const s = JSON.parse(JSON.stringify(base));
      s.id = id;
      s.category = category;
      s.pageIndex = pageIndex;
      s.ports = [port];
      s.transform = { ...s.transform, position: placeAt(port, at) };
      return s;
    };
    const fit = (id) => ({ kind: 'fitting', fittingId: id });
    const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
    const seg = (id, a, b, from, to, pageIndex) => ({ id, pageIndex, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
    const rf = { x: 300, y: H0 - 300 };
    const j = { x: 450, y: rf.y };
    const tA = { x: 600, y: rf.y + 60 };
    const eA = { x: 450, y: rf.y - 150 };
    const rf2 = { x: 300, y: H1 - 300 };
    const tB = { x: 500, y: rf2.y };
    p.stamps = [stamp('t0', 'terminal', inPort, tA, 0), stamp('src', 'equipment', outPort, eA, 0), stamp('t1', 'terminal', inPort, tB, 1)];
    p.fittings = [
      { id: 'rf', pageIndex: 0, position: rf, kind: 'junction' },
      { id: 'j', pageIndex: 0, position: j, kind: 'junction' },
      { id: 'rf2', pageIndex: 1, position: rf2, kind: 'junction' },
    ];
    p.segments = [
      seg('s1', fit('rf'), fit('j'), rf, j, 0),
      seg('s2', fit('j'), port('t0', 'in'), j, tA, 0),
      seg('s3', fit('j'), port('src', 'out'), j, eA, 0),
      seg('s4', fit('rf2'), port('t1', 'in'), rf2, tB, 1),
    ];
    p.portGroups = [];
    p.terminalCapacities = { t0: 150, t1: 250 };
    p.networkTypes = [type];
    scene.loadProjectFromJson(p);
  },
  [H0, H1, TYPE],
);
await idle(1200);
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save');
await idle(800);
const uuid = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
const loc = { fileName: 'multi.pdf', path: 'multi.pdf' };
const building = {
  schemaVersion: 1,
  id: 'b-pages',
  name: 'Pages',
  levels: [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 3000 }],
  sheets: [
    { id: 's0', levelId: 'l0', projectUuid: uuid, pageIndex: 0, displayName: 'Page 1', location: loc },
    { id: 's1', levelId: 'l1', projectUuid: uuid, pageIndex: 1, displayName: 'Page 2', location: loc },
  ],
  risers: [
    {
      id: 'r1', name: 'R1', networkTypeId: TYPE.id, networkType: TYPE, anchorMm: { xMm: 30000, yMm: 30000 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0,
      members: [{ levelId: 'l0', sheetId: 's0', pageIndex: 0, fittingId: 'rf' }, { levelId: 'l1', sheetId: 's1', pageIndex: 1, fittingId: 'rf2' }],
      pending: [],
    },
  ],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await page.evaluate(async () => {
  const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
  await window.__mepBuilding.rebuildSummaries(read);
});
await idle(1000);
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  window.__calls = [];
  const original = s.setRiserFlowInputs.bind(s);
  s.setRiserFlowInputs = (inputs) => {
    window.__calls.push(JSON.parse(JSON.stringify(inputs)));
    return original(inputs);
  };
});
const lastCall = async () => (await page.evaluate(() => window.__calls)).slice(-1)[0] ?? null;
const solved = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
const byId = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
async function clickFittingAt(id) {
  const pos = await page.evaluate((id) => window.__mepSketchScene.exportProject().fittings.find((f) => f.id === id).position, id);
  const at = await screenOf(page, pos);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
if ((await page.locator('.mep-modal').count()) > 0) {
  console.log('MODAL', (await page.locator('.mep-modal').first().innerText()).slice(0, 600));
  await page.screenshot({ path: '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/pages-modal.png' });
}
await page.locator('button.mep-rail-btn[title="Select"]').click();
// the page may have been reset by the load: go to page 0 first
const pageIndex = () => page.evaluate(() => window.__mepSketchScene.getPageIndex());
while ((await pageIndex()) > 0) {
  await page.locator('button[title="Previous page"]').click();
  await idle(900);
}
await idle(500);
await clickFittingAt('rf');
console.log('PAGE 0', await solved(), await byId('props-riser-main'), await byId('props-riser-total'), JSON.stringify(await lastCall()));
check((await solved()) === '250', 'page 0 (source): the exit fitting rf carries the 250 that go to page 1', String(await solved()));
check((await byId('props-riser-main')) === 'Level 0', 'page 0: Main level is Level 0', String(await byId('props-riser-main')));
check((await byId('props-riser-total')) === '400 m³/h (no concurrency factor)', 'page 0: total 400', String(await byId('props-riser-total')));
const callsBefore = (await page.evaluate(() => window.__calls)).length;
await page.locator('button[title="Next page"]').click();
await idle(1500);
check((await pageIndex()) === 1, 'moved to page 1');
check(JSON.stringify(await lastCall()) === JSON.stringify({ rf2: { role: 'entry', demandBeyond: 0 } }), 'page 1: the scene got { rf2: entry, 0 }', JSON.stringify(await lastCall()));
await clickFittingAt('rf2');
check((await solved()) === '250', 'page 1: rf2 shows 250 (terminals of the page only)', String(await solved()));
check((await byId('props-riser-main')) === 'Level 0', 'page 1: Main level Level 0', String(await byId('props-riser-main')));
check((await byId('props-riser-total')) === '400 m³/h (no concurrency factor)', 'page 1: total 400', String(await byId('props-riser-total')));
await page.locator('button[title="Previous page"]').click();
await idle(1500);
check(JSON.stringify(await lastCall()) === JSON.stringify({ rf: { role: 'exit', demandBeyond: 250 } }), 'back on page 0: the scene got { rf: exit, 250 } again', JSON.stringify(await lastCall()));
check((await page.evaluate(() => window.__calls)).length > callsBefore, 'a page change sends the inputs again');
await clickFittingAt('rf');
check((await solved()) === '250', 'back on page 0: rf shows 250 again', String(await solved()));
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
