// B7-T04b journey A3: timeline after Undo of a delete (fitting stays selected) and after document switches (in-page recorder).
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
  const head = body.innerText.split('\n')[0];
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
  await (await openSwitcher(name)).click();
  await idle(wait);
}
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
  const rec = await page.evaluate(() => {
    window.__recOn = false;
    return window.__rec;
  });
  console.log(`TIMELINE ${label}:`);
  for (const r of rec) console.log(`  ${String(r.t).padStart(5)} ms  ${r.s}`);
  return rec;
}

await switchTo('l1.pdf');
// delete terminal t1 (200) with the Delete key, select the fitting, Undo
await clickStamp('t1');
console.log('t1 selected:', await state());
await page.keyboard.press('Delete');
await idle(1500);
await clickFitting(1200);
console.log('after delete of t1, fitting:', await state());
const undo = page.locator('.mep-rail-btn[title="Undo"]');
console.log('undo enabled:', await undo.isEnabled());
await startRecorder();
await undo.click();
await idle(1500);
await stopRecorder('Undo of a delete, fitting selected');
console.log('after undo:', await state());
await snap('J2-4-after-undo');

// Switch flicker: fitting selected on l1, switch to l0 and back
await startRecorder();
await switchTo('l0.pdf', 1500);
await switchTo('l1.pdf', 1500);
await stopRecorder('fitting selected on l1: l0 then l1');

// quick click after switch
await switchTo('l0.pdf', 1200);
await page.keyboard.press('Escape');
await idle(300);
await switchTo('l1.pdf', 1200);
await page.keyboard.press('Escape');
await idle(300);
console.log('l1 after Escape:', await state());
await switchTo('l0.pdf', 1200);
await startRecorder();
{
  const item = await openSwitcher('l1.pdf');
  await item.click();
  const Hn = await pageH();
  const at = await screenOf(page, { x: 300, y: Hn - 300 });
  await page.mouse.click(at.x, at.y);
  await idle(1500);
}
await stopRecorder('switch to l1 then fitting click at once');
console.log('end state:', await state());
await snap('J3-5-quick-click-end');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
