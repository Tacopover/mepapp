// B7-T04b: does an Undo of a deleted terminal bring the numbers back? Reads state through the scene (read only).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
await setup(t);
const solved = () =>
  page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const row = [...body.querySelectorAll('.mep-field-row')].find((r) => /solved capacity/i.test(r.querySelector('label')?.textContent ?? ''));
    return `${body.innerText.split('\n')[0]} solved=${row?.querySelector('input')?.value ?? '-'} total=${body.querySelector('[data-testid="props-riser-total"]')?.textContent ?? '-'}`;
  });
const counts = () => page.evaluate(() => { const p = window.__mepSketchScene.exportProject(); return `stamps=${p.stamps.length} segs=${p.segments.length}`; });
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p, wait = 500) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(wait);
}
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
console.log('start', await counts());
const p1 = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't1').transform.position);
await clickPoint(p1);
await page.keyboard.press('Delete');
await idle(1500);
console.log('after delete', await counts());
await clickPoint({ x: 300, y: (await pageH()) - 300 }, 1500);
console.log('fitting', await solved());
await page.locator('.mep-rail-btn[title="Undo"]').click();
for (const ms of [100, 300, 1000, 3000]) {
  await idle(ms);
  console.log(`undo +${ms}`, await counts(), await solved());
}
await page.screenshot({ path: '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/journey-undo-end.png' });
await page.locator('.mep-rail-btn[title="Undo"]').click().catch(() => {});
await idle(1500);
console.log('second undo', await counts(), await solved());
await clickPoint({ x: 300, y: (await pageH()) - 300 }, 1500);
console.log('re-click fitting', await solved());
check(true, 'done');
await t.finish();
