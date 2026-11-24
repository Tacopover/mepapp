// Source on level 0: read the whole pane including what is below "Set by hand"; then wrong-order and empty-selection actions.
import { begin, EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const specs = EXAMPLE5.map((s, i) => ({ ...s, equipment: i === 0 }));
const j = await begin(specs);
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check } = j;
await openRisersTab();
const lines = await dlgLines();
const a = lines.indexOf('Capacity');
console.log('FULLPANE', JSON.stringify(lines.slice(a, lines.indexOf('Close'))));
await page.evaluate(() => { const b = [...document.querySelectorAll('.mep-modal button')].find((x) => /More details/.test(x.textContent)); b.scrollIntoView({ block: 'end' }); });
await idle(300);
await snap('j7-source-scrolled');
// Set by hand then pick "From the flow solve" option (empty selection)
await dlg.getByRole('button', { name: 'Set by hand' }).click();
await idle(600);
const combo = dlg.getByLabel('Source level');
console.log('OPTIONS', JSON.stringify(await combo.locator('option').allInnerTexts()));
console.log('SELECTED', await combo.inputValue());
await combo.selectOption({ index: 0 });
await idle(800);
console.log('AFTER-SELECT-SOLVE-OPTION', JSON.stringify((await dlgLines()).slice(a, a + 8)));
await snap('j7-source-handset-first-option');
await closeDialog();
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
