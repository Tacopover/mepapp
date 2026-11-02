// B3-T02: Manage Buildings dialog: new building, recent list after reload, open from the dev hook. Real clicks and typing.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(300);
}

await openDialog();
check(/Manage Buildings/.test(await dlg.textContent()), 'dialog opens');
check((await dlg.locator('button', { hasText: /^New building$/ }).count()) === 1, 'New building button');
await shot('B3-T02-empty');

// Backdrop click must not close the dialog.
await page.locator('.mep-modal-backdrop').click({ position: { x: 5, y: 5 } });
await idle(300);
check((await dlg.count()) === 1, 'backdrop click keeps the dialog open');

// New building: type the name into the real input, press Enter (opens the save picker, OPFS stub).
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.waitFor({ state: 'visible', timeout: 4000 });
await nameInput.fill('Office block');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Office block' }).waitFor({ timeout: 8000 }).catch(() => {});
const text1 = await dlg.textContent();
check(/Office block/.test(text1), 'dialog shows the building name', text1.slice(0, 200));
check(/0 levels, 0 sheets/.test(text1), 'empty level list shown', text1.slice(0, 300));
check(/export\.json/.test(text1), 'file location shown', text1.slice(0, 300));
await shot('B3-T02-new');

// The file was written through the save picker.
const written = await page.evaluate(async () => {
  const f = await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile();
  return JSON.parse(await f.text());
});
check(written.name === 'Office block' && Array.isArray(written.levels), 'building file written', JSON.stringify(written).slice(0, 120));

// Close, reload: the recent list shows the building.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(300);
check((await dlg.count()) === 0, 'Close closes the dialog');
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await openDialog();
const text2 = await dlg.textContent();
check(/Recent buildings/.test(text2) && /Office block/.test(text2), 'recent list shows the building after a reload', text2.slice(0, 300));
await shot('B3-T02-recent');

// Open from recent: the dev store is empty after a reload, so the user sees a clear message.
await dlg.locator('button', { hasText: /^Open$/ }).first().click();
await idle(400);
const text3 = await dlg.textContent();
check(/was not found/.test(text3), 'recent entry with no file gives a message', text3.slice(0, 300));
await shot('B3-T02-notfound');
await dlg.locator('button', { hasText: /^Dismiss$/ }).click();
check(!/was not found/.test(await dlg.textContent()), 'Dismiss clears the message');

// Open building: the picker stub returns drawing.pdf unless __nextFile is set; point it to the building file.
await page.evaluate(() => { window.__nextFile = 'export.json'; });
await dlg.locator('button', { hasText: /^Open building…$/ }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Office block' }).waitFor({ timeout: 8000 }).catch(() => {});
check(/0 levels, 0 sheets/.test(await dlg.textContent()), 'Open building loads the file');

// Remove from recent.
await dlg.locator('button', { hasText: /^Remove from list$/ }).first().click();
await idle(300);
check(!/Recent buildings/.test(await dlg.textContent()), 'Remove empties the recent list');

// Dev hook still loads a building (used by the B2 checks).
await page.evaluate(async () => {
  await window.__mepBuilding.load(JSON.stringify({ schemaVersion: 1, id: 'b-hook', name: 'Hook tower', levels: [{ id: 'l0', name: 'Ground', elevationMm: 0 }], sheets: [], risers: [] }));
});
await idle(300);
const text4 = await dlg.textContent();
check(/Hook tower/.test(text4) && /1 levels?, 0 sheets/.test(text4), 'dev hook load shows in the dialog', text4.slice(0, 300));

await t.finish();
