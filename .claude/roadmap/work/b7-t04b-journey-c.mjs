// B7-T04b journey C: audits (invalid selections, titles, dead controls) and the way to Manage Buildings > Risers from the hint.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);
const snap = async (name) => {
  const path = `${SHOTS}journey-${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const dock = async () => {
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(200);
  return (await page.locator('.mep-dock-body').innerText()).replace(/\n+/g, ' | ').slice(0, 300);
};
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p, wait = 500, shift = false) {
  const at = await screenOf(page, p);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  if (shift) await page.keyboard.up('Shift');
  await idle(wait);
}
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
await page.locator('button.mep-rail-btn[title="Select"]').click();
const H = await pageH();

// invalid / other selections
await clickPoint({ x: 450, y: H - 300 });
console.log('junction j (not a riser fitting):', await dock());
await snap('C-junction-j');
await page.keyboard.press('Escape');
await clickPoint({ x: 300, y: H - 300 });
await clickPoint({ x: 450, y: H - 300 }, 500, true);
console.log('rf + j (two fittings):', await dock());
await snap('C-two-fittings');
await page.keyboard.press('Escape');
await clickPoint({ x: 300, y: H - 300 });
await clickPoint({ x: 375, y: H - 300 }, 500, true);
console.log('rf + duct s1:', await dock());
await page.keyboard.press('Escape');
console.log('status after Escape:', await page.locator('.mep-statusbar, footer, .mep-status-bar').first().innerText().catch(() => 'n/a'));
await clickPoint({ x: 600, y: H - 700 }, 300);
await clickPoint({ x: 300, y: H - 300 });
console.log('rf alone again:', await dock());

// titles and controls in the riser section
console.log('TITLES in dock body:', JSON.stringify(await page.locator('.mep-dock-body [title]').evaluateAll((els) => els.map((e) => `${e.tagName}:${e.getAttribute('title')}`))));
console.log('controls in riser section:', JSON.stringify(await page.locator('[data-testid="props-riser-section"] button, [data-testid="props-riser-section"] a, [data-testid="props-riser-section"] input, [data-testid="props-riser-section"] select').count()));
console.log('Solved capacity row html:', await page.locator('.mep-dock-body .mep-field-row', { hasText: /solved capacity/i }).first().evaluate((e) => e.outerHTML));
console.log('riser row html:', await page.locator('[data-testid="props-riser-total"]').evaluate((e) => e.parentElement.outerHTML));
// click on the riser values: any effect?
await page.locator('[data-testid="props-riser-total"]').click();
await idle(300);
await page.locator('[data-testid="props-riser-section"] h4').click();
await idle(300);
console.log('after clicking the values:', await dock());
console.log('modal open after click?', await page.locator('.mep-modal').count());

// follow the hint: at least state
await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1] }]);
await idle(1200);
await clickPoint({ x: 300, y: H - 300 });
console.log('at least:', await dock());
// where is Manage Buildings? open the Menu and read it
await page.locator('button', { hasText: /^\s*Menu\s*$/ }).first().click();
await idle(300);
console.log('MENU items:', JSON.stringify((await page.locator('.mep-menu-dropdown').first().innerText()).split('\n').filter(Boolean)));
await snap('C-menu');
const item = page.locator('.mep-menu-dropdown button, .mep-menu-dropdown [role="menuitem"]', { hasText: /Building/ }).first();
console.log('building menu item text:', await item.innerText().catch(() => 'none'));
await item.click().catch(() => {});
await idle(800);
console.log('after menu click, modal count', await page.locator('.mep-modal').count());
await snap('C-after-building-menu');
const modalText = (await page.locator('.mep-modal').first().innerText().catch(() => '')).replace(/\n+/g, ' | ');
console.log('MODAL:', modalText.slice(0, 600));
const risersTab = page.locator('.mep-modal').getByText(/^Risers \(\d+\)$/).first();
console.log('risers tab count', await risersTab.count());
await risersTab.click().catch(() => {});
await idle(800);
await snap('C-risers-tab');
console.log('RISERS TAB:', (await page.locator('.mep-modal').first().innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 3000));
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
