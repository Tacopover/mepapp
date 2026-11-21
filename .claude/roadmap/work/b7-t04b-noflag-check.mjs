// B7-T04b no-flag check: plain app (production store, no dev stubs, no building). A fitting shows the same Properties as before:
// no riser block, setRiserFlowInputs is never called, a capacity edit gives the level-only numbers.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf, placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
await t.openPdf(W + '00_arch_ground_floor.pdf', 'ground.pdf');
await placeOneStamp(t);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.evaluate(
  ([H]) => {
    const scene = window.__mepSketchScene;
    const p = scene.exportProject();
    const base = JSON.parse(JSON.stringify(p.stamps[0]));
    delete base.routingTargets;
    delete base.autoPlaced;
    const sx = base.transform.scale?.x ?? 1;
    const sy = base.transform.scale?.y ?? 1;
    const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
    const rf = { x: 300, y: H - 300 };
    const at = { x: 500, y: H - 300 };
    base.id = 't0';
    base.category = 'terminal';
    base.ports = [inPort];
    base.transform = { ...base.transform, position: { x: at.x + 0.5 * base.nativeWidth * sx, y: at.y } };
    p.stamps = [base];
    p.fittings = [{ id: 'rf', pageIndex: 0, position: rf, kind: 'junction' }];
    const type = p.networkTypes[0]?.id ?? 'supply-air';
    p.segments = [{ id: 's1', pageIndex: 0, networkTypeId: type, shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'rf' }, endpointB: { kind: 'port', elementId: 't0', portId: 'in' }, geometry: [rf, at] }];
    p.portGroups = [];
    p.terminalCapacities = { t0: 150 };
    scene.loadProjectFromJson(p);
  },
  [H],
);
await idle(1200);
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  window.__calls = [];
  const original = s.setRiserFlowInputs.bind(s);
  s.setRiserFlowInputs = (inputs) => {
    window.__calls.push(inputs);
    return original(inputs);
  };
});
const solved = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
await page.locator('button.mep-rail-btn[title="Select"]').click();
const stamp = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't0').transform.position);
let at = await screenOf(page, stamp);
await page.mouse.click(at.x, at.y);
await idle(500);
const index = await page.evaluate(() => [...document.querySelectorAll('.mep-field-row input[type="number"]')].findIndex((i) => i.value === '150'));
check(index >= 0, 'the terminal shows capacity 150');
const input = page.locator('.mep-field-row input[type="number"]').nth(index);
await input.fill('220');
await input.press('Tab');
await idle(1200);
at = await screenOf(page, { x: 300, y: H - 300 });
await page.mouse.click(at.x, at.y);
await idle(500);
check((await solved()) === '220', 'the fitting shows 220 (level-only number)', String(await solved()));
check((await page.locator('[data-testid="props-riser-section"]').count()) === 0, 'no riser block in Properties');
check((await page.evaluate(() => window.__calls.length)) === 0, 'setRiserFlowInputs was never called', String(await page.evaluate(() => window.__calls.length)));
await page.screenshot({ path: '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/b7-t04b-noflag-fitting.png' });
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
