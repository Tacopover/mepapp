// B7-T04b journey A4: edit a capacity, then click the riser fitting at once. Does the user ever read a stale number?
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
await setup(t);
const STATE = () => {
  const body = document.querySelector('.mep-dock-body');
  if (!body) return 'no-dock';
  const head = body.innerText.split('\n')[0];
  const row = (re) => [...body.querySelectorAll('.mep-field-row')].find((r) => re.test(r.querySelector('label')?.textContent ?? ''));
  const solved = row(/solved capacity/i)?.querySelector('input')?.value ?? '-';
  const total = body.querySelector('[data-testid="props-riser-total"]')?.textContent ?? '-';
  return `[${head.trim().slice(0, 24)}] solved=${solved} total=${total}`;
};
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function startRecorder() {
  await page.evaluate((src) => {
    const fn = eval(`(${src})`);
    window.__rec = [];
    window.__recOn = true;
    const t0 = performance.now();
    const loop = () => {
      if (!window.__recOn) return;
      const s = fn();
      const last = window.__rec[window.__rec.length - 1];
      if (!last || last.s !== s) window.__rec.push({ t: Math.round(performance.now() - t0), s });
      requestAnimationFrame(loop);
    };
    loop();
  }, STATE.toString());
}
async function stopRecorder(label) {
  const rec = await page.evaluate(() => { window.__recOn = false; return window.__rec; });
  console.log(`TIMELINE ${label}:`);
  for (const r of rec) console.log(`  ${String(r.t).padStart(5)} ms  ${r.s}`);
}
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
const H = await pageH();
const pos = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't0').transform.position);
const atT0 = await screenOf(page, pos);
const atFit = await screenOf(page, { x: 300, y: H - 300 });
// the view is now centred on the fitting; the terminal may be off screen at this scale: compute both by moving the view per click
await page.mouse.click((await screenOf(page, pos)).x, (await screenOf(page, pos)).y);
await idle(500);
const input = page.locator('.mep-dock-body .mep-field-row', { hasText: /capacity/i }).first().locator('input').first();
await input.fill('400');
await startRecorder();
await input.press('Enter');
// click the fitting at once
const at = await screenOf(page, { x: 300, y: H - 300 });
await page.mouse.click(at.x, at.y);
await idle(2000);
await stopRecorder('edit 300 -> 400 then click fitting at once');
check(true, 'done');
await t.finish();
