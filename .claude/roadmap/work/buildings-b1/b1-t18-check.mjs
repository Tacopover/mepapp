// B1-T18: the old Manage Buildings dialog still opens and works by real clicks.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check, menu, shot } = t;
await t.start();
await menu('Manage Buildings…');
const dlg = page.locator('.mep-modal', { hasText: 'Manage Buildings' });
await dlg.waitFor({ timeout: 20000 });
check(await dlg.isVisible(), 'dialog opens');
await shot('B1-T18-dialog');
await dlg.locator('button', { hasText: '+ Building' }).click();
const input = dlg.locator('.mep-buildings-detail input').first();
await input.waitFor({ timeout: 10000 });
await input.fill('Tower A');
await input.press('Tab');
await page.waitForTimeout(400);
const tree = await dlg.locator('.mep-buildings-tree').innerText();
check(tree.includes('Tower A'), 'building renamed in tree', tree);
const addLevel = dlg.locator('button', { hasText: /\+ Add Level/ }).first();
check((await addLevel.count()) > 0, 'add level button exists');
await addLevel.click();
await page.waitForTimeout(300);
const tree2 = await dlg.locator('.mep-buildings-tree').innerText();
check(tree2.includes('New Level'), 'level added', tree2);
await shot('B1-T18-added');
const stored = await page.evaluate(() => localStorage.getItem('mepapp.buildings.v1'));
check(!!stored && stored.includes('Tower A'), 'v1 key saved', String(stored).slice(0, 100));
await t.finish();
