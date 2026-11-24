// J1 other way (B7-T09c-3): an air handling unit exists on Level 0. The numbers settle. What does the link row show?
import { begin, EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-journey-lib.mjs';
const specs = EXAMPLE5.map((s, i) => (i === 0 ? { ...s, equipment: true } : s));
const j = await begin(specs);
const { page, dlg, snap, openRisersTab, dlgLines, idle, check } = j;
await openRisersTab();
for (const w of [1100, 760]) {
  await page.setViewportSize({ width: w, height: 900 });
  await idle(700);
  const lines = await dlgLines();
  const a = lines.indexOf('Capacity');
  console.log('UNIT', w, JSON.stringify(lines.slice(a, a + 14)));
  const btns = await dlg.getByRole('button').allInnerTexts();
  console.log('UNIT BTNS', w, JSON.stringify(btns));
  await snap(`j1u-${w}`);
  check(!lines.some((l) => /at most/.test(l)), `unit ${w}: no at most`, JSON.stringify(lines.slice(a, a + 14)));
}
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
