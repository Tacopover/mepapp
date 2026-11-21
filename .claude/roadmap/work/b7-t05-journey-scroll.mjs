// B7-T05: scrolled views of the Capacity block, and the scroll cue of the pane.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { setup, SHOTS } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';
import { WIDTHS, kit } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-lib.mjs';

const t = await open();
const { page, idle } = t;
await t.start();
const { uuids, summaries, building } = await setup(t);
const k = kit(t);
const log = (...a) => console.log('LOG', ...a);
const clone = (o) => JSON.parse(JSON.stringify(o));

const scrollToCap = async () => {
  await k.dlg.getByText('Capacity', { exact: true }).first().scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const d = document.querySelector('.mep-modal');
    const cap = [...d.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Capacity');
    cap?.scrollIntoView({ block: 'start' });
  });
  await idle(300);
};

// scroll cue: what does the pane show before any scroll?
await page.setViewportSize({ width: 1600, height: 1000 });
await k.loadState(building, [summaries[0], null, summaries[2]], uuids);
await k.openRisers();
const cue = await page.evaluate(() => {
  const d = document.querySelector('.mep-modal');
  const p = d.querySelector('.mep-buildings-panel');
  const cs = getComputedStyle(p);
  const sty = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } }).filter((x) => /scrollbar|mep-buildings-panel/.test(x)).slice(0, 12);
  return { overflowY: cs.overflowY, scrollbarWidth: cs.scrollbarWidth, bg: cs.background.slice(0, 200), rules: sty };
});
log('CUE', JSON.stringify(cue));
await page.screenshot({ path: `${SHOTS}journey-S-cue-clip.png`, clip: { x: 560, y: 700, width: 780, height: 130 } });
console.log('SHOT journey-S-cue-clip.png');
await k.close();

for (const { w, h } of WIDTHS) {
  await page.setViewportSize({ width: w, height: h });
  await k.loadState(building, [summaries[0], null, summaries[2]], uuids);
  await k.openRisers();
  await scrollToCap();
  await k.snap(`S-atleast-scrolled-${w}`);
  await k.close();
}
{
  const b = clone(building);
  b.risers[0].name = 'Supply air riser for the north wing and the stairs';
  const words = ['Mechanical plant room level with a very long name for test one', 'Technical level above the parking garage and loading dock area', 'Roof level with the cooling towers and the air handling units'];
  b.levels.forEach((l, i) => { l.name = words[i].slice(0, 60); });
  for (const { w, h } of [WIDTHS[0], WIDTHS[2]]) {
    await page.setViewportSize({ width: w, height: h });
    await k.loadState(b, [summaries[0], null, summaries[2]], uuids);
    await k.openRisers();
    await scrollToCap();
    await k.snap(`S-long-scrolled-${w}`);
    await k.close();
  }
}
{
  const b = clone(building);
  b.risers[0].networkTypeId = 'power-230';
  const nt = { ...b.risers[0].networkType, id: 'power-230', name: 'Power 230 V', discipline: 'electrical' };
  delete nt.flowUnit;
  b.risers[0].networkType = nt;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await k.loadState(b, summaries, uuids);
  await k.openRisers();
  await scrollToCap();
  await k.snap('S-elec-scrolled-1600');
  await k.close();
  await page.setViewportSize({ width: 760, height: 900 });
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  await k.loadState(building, [JSON.stringify(noSource), summaries[1], summaries[2]], uuids);
  await k.openRisers();
  await scrollToCap();
  await k.snap('S-unknown-scrolled-760');
  await k.close();
}
await t.finish();
