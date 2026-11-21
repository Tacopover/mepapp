// B7-T04b journey A (journey-tester): all known, width 1600. J1, J2 (3 edits in a row), J3, flicker sampling.
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
const dock = async () => (await page.locator('.mep-dock-body').innerText()).replace(/\n+/g, ' | ');
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
async function switchTo(name, wait = 1000) {
  await page.locator('.mep-doc-switcher-btn').click();
  await idle(200);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
  await idle(wait);
}
const tabs = () => page.locator('.mep-dock-tab-label').allInnerTexts();

await switchTo('l1.pdf');
console.log('DOCK TABS', JSON.stringify(await tabs()));
console.log('ACTIVE TAB', await page.locator('.mep-dock-tab.on').innerText());
console.log('STATE0 (nothing selected):', await dock());
await snap('J1-0-open-l1');

// J1 step 1: click duct
await clickDuct();
console.log('J1 DUCT:', await dock());
await snap('J1-1-duct');
// J1 step 2: click fitting
await clickFitting();
console.log('J1 FITTING:', await dock());
await snap('J1-2-fitting');
// header total
await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(300);
console.log('NETWORKS TAB:', await dock());
await snap('J1-3-networks-tab');
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(200);

// J2: change capacity of t0 (300) 3 times in a row
async function setCap(to) {
  const inputs = page.locator('.mep-dock-body input[type="number"]');
  const n = await inputs.count();
  const vals = await inputs.evaluateAll((els) => els.map((e) => e.value));
  console.log('  number inputs', JSON.stringify(vals));
  // find the capacity row by label
  const row = page.locator('.mep-dock-body .mep-field-row', { hasText: /capacity/i }).first();
  const input = row.locator('input').first();
  await input.fill(String(to));
  await input.press('Enter');
}
for (const [i, v] of [400, 500, 600].entries()) {
  await clickStamp('t0');
  if (i === 0) {
    console.log('J2 TERMINAL t0:', await dock());
    await snap('J2-1-terminal');
  }
  await setCap(v);
  await idle(1200);
  if (i === 0) await snap('J2-2-after-edit-terminal-selected');
  await clickFitting();
  console.log(`J2 edit ${i + 1} -> ${v}: FITTING`, await dock());
  if (i === 0) await snap('J2-3-fitting-after-edit');
}
await clickDuct();
console.log('J2 DUCT after 3 edits:', await dock());
await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(300);
console.log('NETWORKS TAB after edits:', await dock());
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(200);

// J3: switch to l0 and back to l1
await switchTo('l0.pdf');
console.log('J3 l0 after switch:', await dock());
await snap('J3-1-level0');
await clickFitting();
console.log('J3 l0 FITTING:', await dock());
await snap('J3-1b-level0-fitting');
await switchTo('l1.pdf');
console.log('J3 l1 after switch back (nothing selected):', await dock());
await snap('J3-2-level1-back');
await clickFitting();
console.log('J3 l1 FITTING:', await dock());
await snap('J3-3-level1-fitting');

// first 0.3 s after a switch: click the fitting at once, then sample
await switchTo('l0.pdf');
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
const H = await pageH().catch(() => null);
// Sample the dock for 1.5 s while the canvas is clicked after 80 ms
const samples = [];
const start = Date.now();
let clicked = false;
for (let i = 0; i < 60; i++) {
  const now = Date.now() - start;
  if (!clicked && now > 80) {
    clicked = true;
    const Hn = await pageH();
    const at = await screenOf(page, { x: 300, y: Hn - 300 });
    await page.mouse.click(at.x, at.y);
  }
  const text = await page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const solvedRow = [...body.querySelectorAll('.mep-field-row')].find((r) => /solved capacity/i.test(r.querySelector('label')?.textContent ?? ''));
    return `${solvedRow?.querySelector('input')?.value ?? '-'} / total ${body.querySelector('[data-testid="props-riser-total"]')?.textContent ?? '-'} / h4 ${body.querySelector('h4')?.textContent ?? '-'}`;
  });
  samples.push(`${now}ms ${text}`);
  await new Promise((r) => setTimeout(r, 25));
}
const compact = samples.filter((s, i) => i === 0 || s.replace(/^\d+ms /, '') !== samples[i - 1].replace(/^\d+ms /, ''));
console.log('SWITCH+QUICK CLICK samples (changes only):\n' + compact.join('\n'));
await idle(500);
await snap('J3-4-after-quick-click');

// Flicker test: fitting selected, click Undo, sample 1.5 s
await clickFitting();
console.log('before undo:', await dock());
const undo = page.locator('.mep-rail-btn[title="Undo"]');
console.log('undo count', await undo.count());
const s2 = [];
const st2 = Date.now();
await undo.click();
for (let i = 0; i < 60; i++) {
  const text = await page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const solvedRow = [...body.querySelectorAll('.mep-field-row')].find((r) => /solved capacity/i.test(r.querySelector('label')?.textContent ?? ''));
    return `${solvedRow?.querySelector('input')?.value ?? '-'} / total ${body.querySelector('[data-testid="props-riser-total"]')?.textContent ?? '-'} / h4 ${body.querySelector('h4')?.textContent ?? '-'}`;
  });
  s2.push(`${Date.now() - st2}ms ${text}`);
  await new Promise((r) => setTimeout(r, 25));
}
const c2 = s2.filter((s, i) => i === 0 || s.replace(/^\d+ms /, '') !== s2[i - 1].replace(/^\d+ms /, ''));
console.log('UNDO samples (changes only):\n' + c2.join('\n'));
await snap('J2-4-after-undo');
console.log('after undo dock:', await dock());

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
