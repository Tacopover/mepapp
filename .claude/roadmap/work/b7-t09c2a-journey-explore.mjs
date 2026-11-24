// Debug: why the Search input is missing after the view change.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2a-journey/';
const t = await open({ width: 1600, height: 1000 });
const { page, check, idle } = t;
await t.start();
await t.openPdf();
console.log('before', await page.evaluate(() => document.querySelector('.mep-dock').innerText.split('\n').slice(0, 12).join('|')));
await page.evaluate(() => { const s = window.__mepSketchScene; const r = s.app.canvas.getBoundingClientRect(); s.world.scale.set(1); s.world.x = 600 - r.left - 680; s.world.y = 480 - r.top - 670; });
await idle(300);
await page.locator('button.mep-rail-btn[title="Stamp"]').first().click();
await idle(300);
console.log('after Stamp', await page.evaluate(() => document.querySelector('.mep-dock').innerText.split('\n').slice(0, 12).join('|')));
await page.screenshot({ path: `${SHOTS}explore-12-debug.png` });
check(true, 'x');
await t.finish();
