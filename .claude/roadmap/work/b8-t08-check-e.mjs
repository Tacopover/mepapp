// B8-T08 (fifth run): Tab order inside the network type editor, and the Escape behavior of the i mark.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t08-check-e.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';

const M = '.mep-modal';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle } = t;
await t.start();
await t.openPdf();
await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
await page.locator('.mep-discipline-btn', { hasText: /^HVAC$/ }).first().click();
await idle(300);
await page.locator('.mep-networktype-tile', { hasText: /^\s*Supply Air\s*/ }).first().locator('button[title="Edit"]').click();
await page.locator(M).waitFor({ timeout: 20000 });
await idle(300);
await page.locator(`${M} input[type=text]`).first().focus();
const seq = [];
const describe = () => page.evaluate(() => {
  const e = document.activeElement;
  if (!e) return 'none';
  const label = e.closest('.mep-field-row')?.querySelector('label')?.textContent?.trim();
  return `${e.tagName.toLowerCase()}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : ''}${label ? ` (${label})` : ''}${e.tagName === 'BUTTON' ? ` "${e.textContent.trim().slice(0, 20)}"` : ''}`;
});
seq.push(await describe());
for (let i = 0; i < 16; i++) {
  await page.keyboard.press('Tab');
  seq.push(await describe());
}
console.log('TAB ORDER', JSON.stringify(seq, null, 1));
check(true, 'tab order printed');
await t.finish();
