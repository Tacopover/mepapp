// Stress: level names of 80 characters (one with no space), the at-most state, 3 widths. Then the source scenario tail (what is under "Set by hand").
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const j = await begin();
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check, overflow, built } = j;
const names = ['L0' + 'abcdefghij'.repeat(8).slice(0, 78), 'Level one of the tower with a very long descriptive name for the stress test run 1', 'Level two of the tower with a very long descriptive name for the stress test run 2'];
const b = JSON.parse(JSON.stringify(built.building));
b.levels.forEach((l, i) => { l.name = names[i]; });
b.risers[0].name = 'R1 ' + 'riser-with-a-long-name-'.repeat(3);
console.log('NAMELEN', names.map((n) => n.length));
await page.evaluate((s) => window.__mepBuilding.load(s), JSON.stringify(b));
await idle(800);
await openRisersTab();
const heights = { 1600: 1000, 1100: 900, 760: 900 };
for (const w of [1600, 1100, 760]) {
  await page.setViewportSize({ width: w, height: heights[w] });
  await idle(700);
  const lines = await dlgLines();
  const a = lines.findIndex((l) => l === 'Capacity');
  console.log(`CAPLONG ${w}`, JSON.stringify(lines.slice(a, a + 10)));
  await snap(`j6-stress-${w}`);
  await overflow(`stress ${w}`);
  // each row must be fully visible: the row elements
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="riser-capacity-row"]')].map((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, h: e.getBoundingClientRect().height, t: e.textContent.slice(0, 40) })));
  console.log(`ROWS ${w}`, JSON.stringify(rows));
  const main = await page.evaluate(() => { const e = document.querySelector('[data-testid="riser-capacity-main"]'); return e ? { sw: e.scrollWidth, cw: e.clientWidth, h: Math.round(e.getBoundingClientRect().height) } : null; });
  console.log(`MAIN ${w}`, JSON.stringify(main));
}
await closeDialog();
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
