// B8-T09 no-flag check: the production store (mepapp.realStore only; no devPlatform, no webLike).
// A building is made through the real UI (Manage Buildings, New building). It has no riser: the Risers tab shows the old hint and no diagram, no legend, no arrowhead, no box.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t09-noflag-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';

const M = '.mep-modal';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');
await t.openPdf();

await menu('Manage Buildings…');
const dlg = page.locator(M);
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Plain');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await idle(800);
await dlg.getByRole('tab', { name: /^Risers/ }).click();
await idle(900);
check((await dlg.locator('[data-testid="risers-pane"]').count()) === 1, 'the Risers tab opens');
check((await dlg.getByText('No riser yet.').count()) === 1, 'the old hint "No riser yet." shows');
check((await dlg.locator('.mep-rd').count()) === 0, 'no diagram, no legend');
check((await dlg.locator('[data-testid="riser-span-arrow"]').count()) === 0, 'no arrowhead');
check((await dlg.locator('[data-testid="riser-flow-box"]').count()) === 0, 'no box "Flow direction"');
await page.screenshot({ path: `${SHOTS}B8-T09-noflag-empty.png` });
console.log(`SHOT ${SHOTS}B8-T09-noflag-empty.png`);
await page.keyboard.press('Escape');
await idle(500);
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
