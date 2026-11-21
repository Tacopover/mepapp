// B7-T04b: after Undo of a delete, what is the capacity of the restored terminal? (cause of 450 after undo)
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const t = await open();
const { page, check, idle } = t;
await t.start();
await setup(t);
const caps = () => page.evaluate(() => JSON.stringify(window.__mepSketchScene.exportProject().terminalCapacities));
async function clickPoint(p, wait = 500) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(wait);
}
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
console.log('caps start', await caps());
const p1 = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === 't1').transform.position);
await clickPoint(p1);
await page.keyboard.press('Delete');
await idle(1000);
console.log('caps after delete', await caps());
await page.locator('.mep-rail-btn[title="Undo"]').click();
await idle(1000);
console.log('caps after undo', await caps());
check(true, 'done');
await t.finish();
