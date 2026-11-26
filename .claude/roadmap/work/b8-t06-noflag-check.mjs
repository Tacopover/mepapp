// B8-T06 no-flag check: the production store (mepapp.realStore only; no devPlatform, no webLike). No building is open, then an empty building is made through the real UI.
// A right-click on a fitting shows no "Riser arrows" block and no picker. The Properties panel of a fitting shows no Arrows row. No page error.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t06-noflag-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { screenOf } from './b8-t05-lib.mjs';

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
  const type = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' };
  p.stamps = [];
  p.terminalCapacities = {};
  p.portGroups = [];
  p.networkTypes = [type];
  p.fittings = [{ id: 'a', pageIndex: 0, position: { x: 300, y: H - 300 }, kind: 'junction' }, { id: 'b', pageIndex: 0, position: { x: 600, y: H - 300 }, kind: 'junction' }];
  p.segments = [{ id: 's', pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: 'a' }, endpointB: { kind: 'fitting', fittingId: 'b' }, geometry: [{ x: 300, y: H - 300 }, { x: 600, y: H - 300 }] }];
  await scene.loadProjectFromJson(p);
});
await idle(1200);

async function probe(label) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  await page.evaluate((H) => {
    const s = window.__mepSketchScene;
    const r = s.app.canvas.getBoundingClientRect();
    s.world.scale.set(1);
    s.world.x = r.width / 2 - 450;
    s.world.y = r.height / 2 - (H - 300);
    s.zoomBy(1);
  }, H);
  await page.waitForTimeout(300);
  const at = await screenOf(page, { x: 300, y: H - 300 });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(500);
  const menuLoc = page.locator('.mep-draw-from-menu');
  check((await menuLoc.count()) === 1, `${label}: the right-click menu opens on the fitting`);
  check((await menuLoc.locator('.mep-draw-from-menu-heading').count()) === 0 && (await menuLoc.locator('[data-testid="riser-arrow-picker"]').count()) === 0, `${label}: the menu has no "Riser arrows" block and no picker`);
  await shot(`B8-T06-noflag-menu-${label}`);
  await page.keyboard.press('Escape');
  await idle(300);
  await page.mouse.click(at.x, at.y);
  await idle(500);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(400);
  check((await page.locator('[data-testid="props-riser-arrows"]').count()) === 0 && (await page.locator('[data-testid="riser-arrow-picker"]').count()) === 0, `${label}: the Properties panel of the fitting has no Arrows row and no picker`);
  await shot(`B8-T06-noflag-props-${label}`);
}
await probe('no-building');

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
await probe('empty-building');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
