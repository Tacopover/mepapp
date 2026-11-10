// B4-T09 no-flag check: plain app (production store, no dev stubs). Open a PDF, open Manage Buildings: no crash, no Risers tab without a building.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b4/.claude/roadmap/browser/lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b4/fixtures/pdfs/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, shot, idle, menu } = t;
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
await shot('B4-T09-noflag');
await page.keyboard.press('Escape');
await idle(400);
check((await page.locator('.mep-modal').count()) === 0, 'Escape closes the dialog');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
