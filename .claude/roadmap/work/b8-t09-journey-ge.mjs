// Extra: hide a type while its lane is selected, hide both, long-name overflow of the box, a click on a real arrowhead, a 1366x768 laptop.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, applyLevel } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const OUT = '/tmp/claude-0/-root-MepApp/cd485b76-cb23-414a-9318-be68a3af5d12/scratchpad/b8-t09/journey/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, idle } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const base = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
await loadBuilding(t, JSON.stringify(base));
for (const i of [0, 2, 1]) await applyLevel(t, i, cfg);
await page.keyboard.press('Escape');
await idle(500);
const dlg = page.locator('.mep-modal');
const txt = async () => (await dlg.innerText()).replace(/\n+/g, ' / ');
const flow = async () => { const s = await txt(); const i = s.indexOf('Flow direction /'); return i < 0 ? 'NO BOX' : s.slice(i, i + 110); };
async function openRisers() {
  await page.locator('button.mep-menu-btn').click();
  await page.locator('button.mep-menu-item', { hasText: /Manage Buildings/ }).click();
  await dlg.waitFor({ state: 'visible' });
  await idle(700);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
}
const closeIt = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };
const lanes = async () => (await dlg.getByRole('radio').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-checked') === 'true' ? '*' : ''}${e.getAttribute('aria-label')?.slice(0, 12)}`)));

// laptop 1366x768
await page.setViewportSize({ width: 1366, height: 768 });
await idle(500);
await openRisers();
await dlg.getByRole('radio', { name: /R1/ }).click();
await idle(300);
const fh = dlg.getByText('Flow direction', { exact: true });
const fb = await fh.boundingBox();
const body = await dlg.boundingBox();
console.log(`[1366x768] flow heading box=${JSON.stringify(fb)} dialog=${JSON.stringify(body)}`);
await page.screenshot({ path: `${OUT}E-1366x768-supply.png` });

// real click on an arrowhead
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
const head = dlg.locator('.mep-rd-arrow').first();
const hb = await head.boundingBox();
console.log('arrow box', JSON.stringify(hb), 'title:', await head.locator('title').textContent().catch(() => 'none'));
await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
await idle(300);
console.log('after click on head, lanes:', JSON.stringify(await lanes()), '|', await flow());

// hide a type while selected
const returnBox = dlg.getByRole('checkbox', { name: /Return Air/ });
await dlg.getByRole('radio', { name: /R2/ }).click();
await idle(300);
console.log('R2 selected:', JSON.stringify(await lanes()));
await returnBox.uncheck();
await idle(500);
console.log('Return hidden:', JSON.stringify(await lanes()), '|', await flow());
await page.screenshot({ path: `${OUT}E-hide-return.png` });
await dlg.getByRole('checkbox', { name: /Supply Air/ }).uncheck();
await idle(500);
console.log('Both hidden:', JSON.stringify(await lanes()), '| text:', (await txt()).slice(200, 700));
await page.screenshot({ path: `${OUT}E-hide-both.png` });
await dlg.getByRole('checkbox', { name: /Supply Air/ }).check();
await returnBox.check();
await idle(500);
console.log('Both back:', JSON.stringify(await lanes()), '|', await flow());
await closeIt();

// long names: does the flow box overflow?
{
  const long = (s) => (s + ' ' + 'x'.repeat(80)).slice(0, 80);
  const j = JSON.parse(JSON.stringify(base));
  j.levels = j.levels.map((l, i) => ({ ...l, name: long(`Level ${i} long name`) }));
  await loadBuilding(t, JSON.stringify(j));
  await openRisers();
  await dlg.getByRole('radio', { name: /R1/ }).click();
  await idle(300);
  const o = await dlg.locator('[data-testid="riser-flow-text"]').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, text: e.innerText.slice(0, 60) }));
  console.log('long names flow box overflow:', JSON.stringify(o));
  await page.screenshot({ path: `${OUT}E-long-names-box.png` });
  await closeIt();
}
await t.finish();
