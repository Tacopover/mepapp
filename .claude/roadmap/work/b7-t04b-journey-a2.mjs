// B7-T04b journey A2: numbers of each step, timeline after Undo and after a document switch (in-page recorder).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await setup(t);
const snap = async (name) => {
  const path = `${SHOTS}journey-${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const STATE = () => {
  const body = document.querySelector('.mep-dock-body');
  if (!body) return 'no-dock';
  const head = body.querySelector('.mep-panel-title, h3, .mep-props-title')?.textContent ?? body.innerText.split('\n')[0];
  const row = (re) => [...body.querySelectorAll('.mep-field-row')].find((r) => re.test(r.querySelector('label')?.textContent ?? ''));
  const solved = row(/solved capacity/i)?.querySelector('input')?.value ?? '-';
  const main = body.querySelector('[data-testid="props-riser-main"]')?.textContent ?? '-';
  const total = body.querySelector('[data-testid="props-riser-total"]')?.textContent ?? '-';
  const h4 = body.querySelector('[data-testid="props-riser-section"] h4')?.textContent ?? '-';
  return `[${head.trim().slice(0, 24)}] solved=${solved} main=${main} total=${total} h4=${h4}`;
};
const state = () => page.evaluate(STATE);
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p, wait = 500) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(wait);
}
const clickFitting = async (w) => clickPoint({ x: 300, y: (await pageH()) - 300 }, w);
const clickDuct = async (w) => clickPoint({ x: 375, y: (await pageH()) - 300 }, w);
async function clickStamp(id) {
  const p = await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === id).transform.position, id);
  await clickPoint(p);
}
async function openSwitcher(name) {
  await page.locator('.mep-doc-switcher-btn').click();
  await idle(200);
  return page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first();
}
async function switchTo(name, wait = 1000) {
  (await openSwitcher(name)).click();
  await idle(wait);
}
async function startRecorder() {
  await page.evaluate((src) => {
    const fn = eval(`(${src})`);
    window.__rec = [];
    window.__recOn = true;
    const t0 = performance.now();
    window.__recT0 = t0;
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
  const rec = await page.evaluate(() => {
    window.__recOn = false;
    return window.__rec;
  });
  console.log(`TIMELINE ${label}:`);
  for (const r of rec) console.log(`  ${String(r.t).padStart(5)} ms  ${r.s}`);
  return rec;
}

await switchTo('l1.pdf');
// J1
await clickDuct();
console.log('J1 step1 duct   :', await state());
await clickFitting();
console.log('J1 step2 fitting:', await state());
console.log('J1 fitting title attr main/total:', await page.locator('[data-testid="props-riser-main"]').getAttribute('title'), '|', await page.locator('[data-testid="props-riser-total"]').getAttribute('title'));
console.log('J1 section h4 computed font:', await page.locator('[data-testid="props-riser-section"] h4').evaluate((e) => { const c = getComputedStyle(e); return `${c.fontSize} ${c.fontFamily} ${c.fontWeight} ${c.color} ${c.textTransform}`; }));
console.log('J1 Fitting header font:', await page.locator('.mep-dock-body').evaluate((b) => { const e = b.firstElementChild; const c = getComputedStyle(e.querySelector('*') ?? e); return `${c.fontSize} ${c.fontFamily}`; }));

// Undo flicker: edit t0 300 -> 400, select fitting, Undo
await clickStamp('t0');
{
  const row = page.locator('.mep-dock-body .mep-field-row', { hasText: /capacity/i }).first();
  const input = row.locator('input').first();
  await input.fill('400');
  await input.press('Enter');
  await idle(1200);
}
await clickFitting(1200);
console.log('after edit 400 fitting:', await state());
const undo = page.locator('.mep-rail-btn[title="Undo"]');
console.log('undo enabled:', await undo.isEnabled());
await startRecorder();
await undo.click();
await idle(1500);
await stopRecorder('Undo with fitting selected');
console.log('after undo:', await state());
await snap('J2-4-after-undo');

// Switch flicker: fitting selected on l1, switch to l0 and back, recorder running
await startRecorder();
await switchTo('l0.pdf', 1500);
await switchTo('l1.pdf', 1500);
await stopRecorder('fitting selected on l1: l0 then l1');

// quick click after switch: clear selection first
await clickPoint({ x: 500, y: (await pageH()) - 600 }, 300); // empty spot
console.log('after empty click:', await state());
await switchTo('l0.pdf', 1200);
await startRecorder();
{
  const item = await openSwitcher('l1.pdf');
  await item.click();
  const Hn = await pageH();
  // set view without the 150 ms wait: use the same helper but time it
  const at = await screenOf(page, { x: 300, y: Hn - 300 });
  await page.mouse.click(at.x, at.y);
  await idle(1500);
}
await stopRecorder('switch to l1 then fitting click at once');
console.log('end state:', await state());
await snap('J3-5-quick-click-end');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
