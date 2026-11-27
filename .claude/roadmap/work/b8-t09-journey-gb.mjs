// G3: no source, then source by hand, then back to the flow solve. Widths 1600 and 760 (and 1100 text only).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, applyLevel } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const OUT = '/tmp/claude-0/-root-MepApp/cd485b76-cb23-414a-9318-be68a3af5d12/scratchpad/b8-t09/journey/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, idle } = t;
await t.start();
const cfg = { withReturn: true, sources1: [], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const base = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
await loadBuilding(t, JSON.stringify(base));
for (const i of [0, 2, 1]) await applyLevel(t, i, cfg);
await page.keyboard.press('Escape');
await idle(500);
const dlg = page.locator('.mep-modal');
const card = dlg.locator('.mep-modal-body, .mep-ri, [class*="riser-info"]');
const txtAll = async () => (await dlg.innerText()).replace(/\n+/g, ' / ');
const slice = async (from, n = 200) => { const s = await txtAll(); const i = s.indexOf(from); return i < 0 ? `NO "${from}"` : s.slice(i, i + n); };
const arrows = () => dlg.locator('.mep-rd-arrow').count();
const lanes = async () => (await dlg.getByRole('radio').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-checked') === 'true' ? '*' : ''}${e.getAttribute('aria-label')}`)));

for (const w of [1600, 760, 1100]) {
  await page.setViewportSize({ width: w, height: 1000 });
  await idle(500);
  const tag = `B-${w}`;
  let clicks = 0;
  await page.locator('button.mep-menu-btn').click(); clicks++;
  await page.locator('button.mep-menu-item', { hasText: /Manage Buildings/ }).click(); clicks++;
  await dlg.waitFor({ state: 'visible' });
  await idle(600);
  await dlg.getByRole('tab', { name: /^Risers/ }).click(); clicks++;
  await idle(900);
  console.log(`[${tag}] arrows=${await arrows()} lanes=${JSON.stringify(await lanes())}`);
  console.log(`[${tag}] card text: ${await slice('Capacity', 400)}`);
  await page.screenshot({ path: `${OUT}${tag}-nosource.png` });
  await dlg.getByRole('radio', { name: /R1/ }).click(); clicks++;
  await idle(300);
  console.log(`[${tag}] R1 card: ${await slice('Capacity', 400)}`);
  // is the box visible without scroll?
  const flowHead = dlg.getByText('Flow direction', { exact: true });
  console.log(`[${tag}] Flow direction heading visible in viewport: ${await flowHead.isVisible()} box=${JSON.stringify(await flowHead.boundingBox())}`);
  await page.screenshot({ path: `${OUT}${tag}-nosource-R1.png` });
  // Click "Set by hand"
  await dlg.getByText('Set by hand', { exact: true }).first().click(); clicks++;
  await idle(500);
  await page.screenshot({ path: `${OUT}${tag}-sethand-1.png` });
  console.log(`[${tag}] after Set by hand: ${await slice('Capacity', 500)}`);
  const selects = await dlg.locator('select').evaluateAll((els) => els.map((e) => ({ label: e.getAttribute('aria-label') ?? e.id ?? '', opts: [...e.options].map((o) => o.text), val: e.value })));
  console.log(`[${tag}] selects: ${JSON.stringify(selects)}`);
  // Source level by label
  const srcSel = dlg.getByRole('combobox', { name: /Source level/ });
  console.log(`[${tag}] source select count by label: ${await srcSel.count()}`);
  await srcSel.selectOption({ label: 'Level 1' }); clicks++;
  await idle(1000);
  console.log(`[${tag}] arrows after source L1: ${await arrows()}`);
  console.log(`[${tag}] card: ${await slice('Capacity', 600)}`);
  await page.screenshot({ path: `${OUT}${tag}-sethand-2.png` });
  console.log(`[${tag}] G3 clicks (menu counted as 2): ${clicks}`);
  // change source to Level 0 and Level 2
  for (const L of ['Level 0', 'Level 2', 'Level 1']) {
    await srcSel.selectOption({ label: L });
    await idle(800);
    const dirs = await dlg.locator('.mep-rd-arrow').evaluateAll((els) => els.map((e) => e.getAttribute('data-direction') ?? e.className.baseVal ?? ''));
    console.log(`[${tag}] source ${L}: arrows=${dirs.join(',')} | ${(await slice('Flow direction', 120))}`);
  }
  // Direction select (wrong order, use it while source set)
  const dirSel = dlg.getByRole('combobox', { name: /^Direction/ });
  console.log(`[${tag}] direction select count: ${await dirSel.count()}`);
  if (await dirSel.count()) {
    await dirSel.selectOption({ label: 'Up' });
    await idle(700);
    console.log(`[${tag}] after Direction Up: arrows=${await arrows()} | ${await slice('Flow direction', 220)}`);
    await page.screenshot({ path: `${OUT}${tag}-direction-up.png` });
  }
  // back to flow solve
  const solve = dlg.getByText(/Use the flow solve/i).first();
  console.log(`[${tag}] use solve visible=${await solve.isVisible()}`);
  await solve.click();
  await idle(900);
  console.log(`[${tag}] after Use flow solve: arrows=${await arrows()} | ${await slice('Capacity', 500)}`);
  await page.screenshot({ path: `${OUT}${tag}-solve-back.png` });
  // repeat 3 times
  for (let k = 1; k <= 3; k++) {
    await dlg.getByText('Set by hand', { exact: true }).first().click();
    await idle(400);
    await dlg.getByRole('combobox', { name: /Source level/ }).selectOption({ label: 'Level 0' });
    await idle(700);
    const a1 = await arrows();
    await dlg.getByText(/Use the flow solve/i).first().click();
    await idle(700);
    console.log(`[${tag}] repeat ${k}: arrows with source=${a1}, after solve=${await arrows()}`);
  }
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(400);
}
await t.finish();
