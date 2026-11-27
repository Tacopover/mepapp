// G5: empty state. Full state: 30 risers with 80-character names, levels with 80-character names. Three widths.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, applyLevel } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const OUT = '/tmp/claude-0/-root-MepApp/cd485b76-cb23-414a-9318-be68a3af5d12/scratchpad/b8-t09/journey/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, idle } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const base = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
for (const i of [0, 2, 1]) await applyLevel(t, i, cfg);
await page.keyboard.press('Escape');
await idle(500);
const dlg = page.locator('.mep-modal');
const txt = async () => (await dlg.innerText()).replace(/\n+/g, ' / ');
async function openRisers(tabName = /^Risers/) {
  await page.locator('button.mep-menu-btn').click();
  await page.locator('button.mep-menu-item', { hasText: /Manage Buildings/ }).click();
  await dlg.waitFor({ state: 'visible' });
  await idle(700);
  const tab = dlg.getByRole('tab', { name: tabName });
  console.log('  tab count', await tab.count(), 'tabs:', (await dlg.getByRole('tab').allInnerTexts()).join('|'));
  await tab.click();
  await idle(900);
}
const closeIt = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };

// ---- empty
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true, risers: false }));
for (const w of [1600, 1100, 760]) {
  await page.setViewportSize({ width: w, height: 1000 });
  await idle(500);
  console.log(`[empty ${w}]`);
  await openRisers();
  console.log('  text:', (await txt()).slice(0, 900));
  console.log('  radios:', await dlg.getByRole('radio').count(), 'legend:', await dlg.locator('.mep-rd-legend').count(), 'arrows:', await dlg.locator('.mep-rd-arrow').count());
  await page.screenshot({ path: `${OUT}C-empty-${w}.png` });
  await closeIt();
}
// ---- one level riser
{
  const j = JSON.parse(JSON.stringify(base));
  j.risers = [{ ...j.risers[0], members: [j.risers[0].members[0]] }];
  await loadBuilding(t, JSON.stringify(j));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(500);
  console.log('[one-level 1600]');
  await openRisers();
  console.log('  text:', (await txt()).slice(0, 1200));
  await page.screenshot({ path: `${OUT}C-onelevel-1600.png` });
  await closeIt();
}
// ---- full
{
  const long = (s) => (s + ' ' + 'x'.repeat(80)).slice(0, 80);
  const j = JSON.parse(JSON.stringify(base));
  j.levels = j.levels.map((l, i) => ({ ...l, name: long(`Level ${i} long name`) }));
  const r1 = j.risers[0];
  const r2 = j.risers[1];
  r1.name = long('Supply riser one');
  r2.name = long('Return riser two');
  const all = [r1, r2];
  for (let n = 3; n <= 30; n++) {
    const c = JSON.parse(JSON.stringify(n % 2 ? r1 : r2));
    c.id = `r${n}`;
    c.name = long(`Riser ${n}`);
    if (n % 5 === 0) c.networkType = { ...c.networkType, linePattern: 'dotted' };
    all.push(c);
  }
  j.risers = all;
  await loadBuilding(t, JSON.stringify(j));
  for (const w of [1600, 1100, 760]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await idle(500);
    console.log(`[full ${w}]`);
    await openRisers();
    const lanes = await dlg.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    console.log('  lanes', lanes.length, 'first:', lanes[0], '| last:', lanes[lanes.length - 1]);
    console.log('  arrows:', await dlg.locator('.mep-rd-arrow').count());
    await page.screenshot({ path: `${OUT}C-full-${w}-open.png` });
    const sc = dlg.locator('.mep-rd-scroll');
    const st = async (l) => console.log(`  ${l}: scroll=${await sc.evaluate((e) => [e.scrollLeft, e.scrollWidth, e.clientWidth])} legend=${JSON.stringify(await dlg.locator('.mep-rd-legend').boundingBox())} sel=${(await dlg.getByRole('radio').evaluateAll((els) => els.map((e, i) => (e.getAttribute('aria-checked') === 'true' ? i : -1)).filter((i) => i >= 0)))} box=${(await txt()).match(/Flow direction \/ [^/]*\/?[^/]*/)?.[0]?.slice(0, 80)}`);
    await st('open');
    for (const n of [4, 14, 24]) {
      await dlg.getByRole('radio').nth(n).scrollIntoViewIfNeeded();
      await dlg.getByRole('radio').nth(n).click({ force: true });
      await idle(300);
      await st(`click lane ${n}`);
    }
    await page.screenshot({ path: `${OUT}C-full-${w}-clicked.png` });
    await dlg.getByRole('radio').nth(24).focus();
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'Home', 'End']) { await page.keyboard.press(key); await idle(300); await st(`key ${key}`); }
    await page.screenshot({ path: `${OUT}C-full-${w}-keys.png` });
    await closeIt();
  }
}
await t.finish();
