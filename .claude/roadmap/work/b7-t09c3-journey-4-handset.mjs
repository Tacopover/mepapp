// J1 extras (B7-T09c-3): keyboard use of Set by hand, close and reopen with a hand-set level, stale status text, wrong order.
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-journey-lib.mjs';
const j = await begin();
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check } = j;
await page.setViewportSize({ width: 1100, height: 900 });
await idle(500);
await openRisersTab();
const state = () =>
  page.evaluate(() => {
    const modal = document.querySelector('.mep-modal');
    const act = document.activeElement;
    const btns = [...modal.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Set by hand|Read summaries|Use the flow solve|More details/.test(t));
    const links = modal.querySelector('[data-testid="riser-capacity-actions"]');
    return { active: act ? `${act.tagName}:${act.getAttribute('aria-label') || act.getAttribute('data-testid') || act.textContent.trim().slice(0, 30)}` : null, btns, linksRow: !!links, linksRowH: links ? Math.round(links.getBoundingClientRect().height) : 0 };
  });
console.log('INITIAL', JSON.stringify(await state()));
// keyboard: focus the Set by hand link by Tab from the Risers tab button
const link = dlg.getByRole('button', { name: 'Set by hand' });
await link.focus();
await page.keyboard.press('Enter');
await idle(700);
const afterEnter = await state();
console.log('AFTER-ENTER', JSON.stringify(afterEnter));
check(/riser-source-select/.test(afterEnter.active), 'keyboard Enter on Set by hand: focus on Source level', afterEnter.active);
// pick by keyboard: the list has the focus; choose with selectOption (native) then check
await dlg.getByLabel('Source level').selectOption({ label: 'Level 1' });
await idle(900);
console.log('HANDSET', JSON.stringify(await state()), JSON.stringify((await dlgLines()).filter((l) => /Main level|at most|Connected|^Level \d to/.test(l))));
check((await state()).linksRowH === 0, 'hand-set: no empty link row');
await snap('j1x-handset-level1');
// close, reopen
await closeDialog();
await openRisersTab();
console.log('REOPEN', JSON.stringify(await state()), JSON.stringify((await dlgLines()).filter((l) => /Main level|at most|Source level|Use the flow/.test(l))));
await snap('j1x-reopen');
// empty selection / wrong order: choose "From the flow solve" in the list
const sel = dlg.getByLabel('Source level');
if ((await sel.count()) > 0) {
  await sel.selectOption({ label: 'From the flow solve' });
  await idle(900);
  console.log('BACK-VIA-LIST', JSON.stringify(await state()), JSON.stringify((await dlgLines()).filter((l) => /Main level|at most|R1 uses|Source level/.test(l))));
  await snap('j1x-back-via-list');
} else {
  console.log('NO SOURCE SELECT AFTER REOPEN');
  await snap('j1x-reopen-nosel');
}
// Set by hand, then do nothing, then Use the flow solve; message text
const l2 = dlg.getByRole('button', { name: 'Set by hand' });
if ((await l2.count()) > 0) {
  await l2.click();
  await idle(600);
  console.log('STATUS-AFTER-SBH', JSON.stringify((await dlgLines()).filter((l) => /uses|solve|hand/i.test(l))));
  await snap('j1x-sbh-again');
}
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
