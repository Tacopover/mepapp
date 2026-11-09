// T19 C2: the shared Dialog traps the keyboard focus. Tab and Shift+Tab 30 times stay inside the open dialog.
// The focus returns to the element that opened the dialog when that element is still on the page.
import { open } from '../browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();
await t.openPdf();

async function inside() {
  return page.evaluate(() => {
    const modal = document.querySelector('.mep-modal');
    return modal !== null && modal.contains(document.activeElement);
  });
}
async function cycle(label) {
  check(await inside(), `${label}: focus starts inside the dialog`);
  let outside = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (!(await inside())) outside += 1;
  }
  check(outside === 0, `${label}: 30 Tab presses stay inside the dialog`, `outside ${outside}`);
  outside = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Shift+Tab');
    if (!(await inside())) outside += 1;
  }
  check(outside === 0, `${label}: 30 Shift+Tab presses stay inside the dialog`, `outside ${outside}`);
}

// Dialog 1: Manage Buildings.
await menu('Manage Buildings…');
await page.locator('.mep-modal').waitFor({ state: 'visible', timeout: 8000 });
await idle(700);
await cycle('Manage Buildings');
await shot('T19-C2-manage-buildings');
await page.keyboard.press('Escape');
await idle(500);
check((await page.locator('.mep-modal').count()) === 0, 'Escape still closes Manage Buildings');

// Dialog 2: Auto-place.
await t.openAutoPlace();
await page.locator('.mep-modal').waitFor({ state: 'visible', timeout: 8000 });
await idle(500);
await cycle('Auto-place');
await shot('T19-C2-auto-place');
await page.keyboard.press('Escape');
await idle(500);
check((await page.locator('.mep-modal').count()) === 0, 'Escape still closes Auto-place');

// Focus return. The menu item that opens a dialog leaves the page, so use a button that stays: focus it, then click the menu item with a DOM click (it does not move the focus).
await page.evaluate(() => {
  const b = document.createElement('button');
  b.id = 'c2-opener';
  b.textContent = 'opener';
  b.style.cssText = 'position:fixed;left:0;bottom:0;z-index:1';
  document.body.appendChild(b);
});
await page.locator('button.mep-menu-btn').click();
await page.evaluate(() => {
  document.getElementById('c2-opener').focus();
  const item = [...document.querySelectorAll('button.mep-menu-item')].find((el) => /^\s*Manage Buildings…\s*$/.test(el.textContent ?? ''));
  item.click();
});
await page.locator('.mep-modal').waitFor({ state: 'visible', timeout: 8000 });
await idle(500);
check(await inside(), 'the dialog took the focus from the opener');
await page.keyboard.press('Escape');
await idle(500);
const back = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName ?? 'null');
check(back === 'c2-opener', 'after the dialog closes the focus is back on the opener', back);
await t.finish();
