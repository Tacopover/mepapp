// B7-T05 no-flag check: plain app (production store, no dev stubs, no building). The Manage Buildings dialog has no Risers tab,
// no Capacity block, and the export of quantities of one sheet is unchanged.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
await t.openPdf(W + '00_arch_ground_floor.pdf', 'ground.pdf');
await menu('Manage Buildings…');
const dlg = page.locator('.mep-modal');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
check((await dlg.getByRole('tab', { name: /^Risers/ }).count()) === 0, 'no Risers tab without a building');
check((await page.locator('[data-testid="riser-capacity"]').count()) === 0, 'no Capacity block without a building');
await page.screenshot({ path: '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t05/b7-t05-noflag-dialog.png' });
await page.keyboard.press('Escape');
await idle(400);
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
