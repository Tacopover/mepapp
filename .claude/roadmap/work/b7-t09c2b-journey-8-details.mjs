// At-most state: open "More details" at 3 widths; measure the capacity box; hint text still readable.
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const j = await begin();
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check, overflow } = j;
await openRisersTab();
await dlg.getByRole('button', { name: 'More details' }).click();
await idle(700);
console.log('BUTTONS', JSON.stringify(await dlg.getByRole('button').allInnerTexts()));
const heights = { 1600: 1000, 1100: 900, 760: 900 };
for (const w of [1600, 1100, 760]) {
  await page.setViewportSize({ width: w, height: heights[w] });
  await idle(700);
  await overflow(`details ${w}`);
  await snap(`j8-details-${w}`);
}
await closeDialog();
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
