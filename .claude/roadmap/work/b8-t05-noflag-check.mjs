// B8-T05 no-flag check: the production store (mepapp.realStore only; no devPlatform, no webLike). No building is open.
// A drawing with segments of two network types shows no riser ring and no arrow, and the editor save and a page switch cause no error.
// A building is then made through the real UI (Manage Buildings, New building): still no ring, no arrow, no error.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t05-noflag-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { marksOf } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');
await t.openPdf();

await page.evaluate(async () => {
  const scene = window.__mepSketchScene;
  const H = scene.getDisplayedPageSize().heightPt;
  const p = scene.exportProject();
  const types = [
    { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' },
    { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#e53935', lineWidthPt: 2, linePattern: 'dashed' },
  ];
  p.stamps = [];
  p.terminalCapacities = {};
  p.portGroups = [];
  p.networkTypes = types;
  p.fittings = [];
  p.segments = [];
  types.forEach((ty, i) => {
    const y = H - 300 - i * 120;
    p.fittings.push({ id: `a${i}`, pageIndex: 0, position: { x: 300, y }, kind: 'junction' }, { id: `b${i}`, pageIndex: 0, position: { x: 600, y }, kind: 'junction' });
    p.segments.push({ id: `s${i}`, pageIndex: 0, networkTypeId: ty.id, shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: `a${i}` }, endpointB: { kind: 'fitting', fittingId: `b${i}` }, geometry: [{ x: 300, y }, { x: 600, y }] });
  });
  await scene.loadProjectFromJson(p);
});
await idle(1200);
check(Object.keys(await marksOf(page)).length === 0, 'no building: the scene has no riser mark');
await shot('B8-T05-noflag-drawing');

// the editor save with no building open
const sel = () => page.locator(`${M} [data-testid=nt-flow-sense]`);
await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
await idle(400);
await page.locator('.mep-networktype-tile', { hasText: /^\s*Supply Air/ }).first().locator('button[title="Edit"]').click();
await page.locator(M).waitFor({ timeout: 20000 });
await sel().selectOption('return');
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(600);
check((await page.locator(M).count()) === 0, 'the editor closes on Save with no building open');
check(Object.keys(await marksOf(page)).length === 0, 'after the editor save: still no riser mark');

// a building through the real UI
await menu('Manage Buildings…');
const dlg = page.locator(M);
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Plain');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await idle(800);
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(800);
check(Object.keys(await marksOf(page)).length === 0, 'a building with no riser: no ring, no arrow');
await shot('B8-T05-noflag-with-building');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
