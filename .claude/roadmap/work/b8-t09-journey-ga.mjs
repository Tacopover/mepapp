// G1, G2, G4, G6 (three widths; solid and dotted lane). Source on level 0, supply R1 and return R2.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, applyLevel, RETURN } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

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
const box = async (loc) => { const b = await loc.boundingBox(); return b ? [b.x, b.y, b.width, b.height].map(Math.round).join(',') : 'none'; };
const flowBox = async () => {
  const txt = (await dlg.innerText()).replace(/\n+/g, ' / ');
  const i = txt.indexOf('Flow direction /');
  return i < 0 ? 'NO BOX' : txt.slice(i, i + 140);
};
const lanes = async () => (await dlg.getByRole('radio').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-checked') === 'true' ? '*' : ''}${e.getAttribute('aria-label')}`)));

async function openRisers(w, tag) {
  let clicks = 0;
  await page.locator('button.mep-menu-btn').click(); clicks++;
  await page.locator('button.mep-menu-item', { hasText: /Manage Buildings/ }).click(); clicks++;
  await dlg.waitFor({ state: 'visible' });
  await idle(700);
  await dlg.getByRole('tab', { name: /^Risers/ }).click(); clicks++;
  await idle(1000);
  console.log(`[${tag}] w=${w} open clicks=${clicks}`);
}
async function closeIt() {
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(400);
}

for (const [variant, patch] of [['solid', null], ['dotted', 'dotted']]) {
  if (patch) {
    const j = JSON.parse(JSON.stringify(base));
    j.risers[1].networkType = { ...j.risers[1].networkType, linePattern: patch };
    await loadBuilding(t, JSON.stringify(j));
  }
  for (const w of [1600, 1100, 760]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await idle(500);
    const tag = `${variant}-${w}`;
    await openRisers(w, tag);
    console.log(`[${tag}] lanes at open:`, JSON.stringify(await lanes()));
    console.log(`[${tag}] box at open:`, await flowBox());
    await page.screenshot({ path: `${OUT}A-${tag}-open.png` });
    if (variant === 'dotted') {
      await dlg.locator('.mep-rd').screenshot({ path: `${OUT}A-${tag}-diagram.png` });
      await closeIt();
      continue;
    }
    // G1: click the supply lane
    const supply = dlg.getByRole('radio', { name: /R1/ });
    const ret = dlg.getByRole('radio', { name: /R2/ });
    await supply.click();
    await idle(400);
    console.log(`[${tag}] after click R1 box:`, await flowBox());
    await page.screenshot({ path: `${OUT}A-${tag}-supply.png` });
    await ret.click();
    await idle(400);
    console.log(`[${tag}] after click R2 box:`, await flowBox());
    await page.screenshot({ path: `${OUT}A-${tag}-return.png` });
    // G4: three lanes in a row by mouse, then keys; record layout
    const legend = dlg.locator('.mep-rd-legend');
    const diagram = dlg.locator('.mep-rd');
    const scroll = dlg.locator('.mep-rd-scroll');
    const snapState = async (label) => {
      const sc = await scroll.evaluate((e) => [e.scrollLeft, e.scrollTop]);
      const lg = (await legend.innerText()).replace(/\n+/g, '|');
      console.log(`[${tag}] ${label}: dlg=${await box(dlg)} diagram=${await box(diagram)} legend=${await box(legend)} scroll=${sc} legendText=${lg} box="${(await flowBox()).slice(0, 70)}" sel=${(await lanes()).filter((x) => x.startsWith('*'))}`);
    };
    await snapState('before');
    for (const [n, l] of [[1, supply], [2, ret], [3, supply]]) { await l.click(); await idle(250); await snapState(`mouse${n}`); }
    await supply.focus();
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowRight', 'End', 'Home']) {
      await page.keyboard.press(key);
      await idle(250);
      await snapState(`key ${key}`);
    }
    await page.screenshot({ path: `${OUT}A-${tag}-after-keys.png` });
    // wrong order: press Escape closes?
    await closeIt();
  }
}
await t.finish();
