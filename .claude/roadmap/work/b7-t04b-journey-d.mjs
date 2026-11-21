// B7-T04b journey D: known state, what does the Manage Buildings > Risers tab say about 650 / 750? (step count from the fitting)
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
await setup(t);
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
const at = await screenOf(page, { x: 300, y: H - 300 });
await page.mouse.click(at.x, at.y);
await idle(500);
await page.locator('button', { hasText: /^\s*Menu\s*$/ }).first().click();
await idle(300);
await page.locator('.mep-menu-dropdown button', { hasText: /Manage Buildings/ }).first().click();
await idle(800);
await page.locator('.mep-modal').getByText(/^Risers \(\d+\)$/).first().click();
await idle(800);
console.log('RISERS TAB known:', (await page.locator('.mep-modal').first().innerText()).replace(/\n+/g, ' | '));
await page.screenshot({ path: '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/journey-D-risers-known.png' });
check(true, 'done');
await t.finish();
