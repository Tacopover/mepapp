// B3-T12c UI review 2: Building select read back from the real select (keyboard), with the web stand-in store holding the other building.
import { open } from '../browser/lib.mjs';
import { GROUND, drawSegmentWithTool, openScopeDialog } from './b2-lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');

async function openManage() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
}
async function newBuilding(name, levelName) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: 'New building…' }).click();
  const nameIn = dlg.locator('input[aria-label="Building name"]');
  await nameIn.fill(name);
  await nameIn.press('Enter');
  await dlg.locator('.mep-buildings-open-name', { hasText: name }).waitFor({ timeout: 8000 });
  await idle(500);
  await dlg.getByText('+ Add level', { exact: true }).click();
  await idle(400);
  await page.keyboard.type(levelName);
  await page.keyboard.press('Enter');
  await idle(400);
}

await t.openPdf(GROUND, 'ground.pdf');
await drawSegmentWithTool(t, { x: 300, y: 300 }, { x: 500, y: 300 });
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));

await openManage();
await newBuilding('Tower', 'Ground floor');
const towerJson = await page.evaluate(async () => (await window.__mepBuilding.read()).json);
await newBuilding('Annex', 'Basement');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });

await openScopeDialog(t);
const buildingSel = dlg.locator('select[aria-label="Building"]');
const levelSel = dlg.locator('select[aria-label="Level"]');
const selState = () => buildingSel.evaluate((el) => ({ label: el.selectedOptions[0]?.textContent ?? '', options: [...el.options].map((o) => o.textContent) }));
const levelState = () => levelSel.evaluate((el) => ({ label: el.selectedOptions[0]?.textContent ?? '', options: [...el.options].map((o) => o.textContent) }));

// The web stand-in reads one building file. Tower is loaded before the switch, as the T12c check does.
await page.evaluate((j) => window.__mepBuilding.store.load(j), towerJson);
await idle(500);
console.log('INFO start building ' + JSON.stringify(await selState()) + ' level ' + JSON.stringify(await levelState()));
await buildingSel.focus();
await page.keyboard.press('ArrowDown');
await idle(1000);
const k1 = await selState();
const l1 = await levelState();
console.log('INFO after ArrowDown building ' + JSON.stringify(k1) + ' level ' + JSON.stringify(l1));
const hint = await dlg.locator('.mep-hint').allInnerTexts();
console.log('INFO hints ' + JSON.stringify(hint));
check(k1.label === 'Tower' && l1.options.join() === 'Ground floor', 'ArrowDown on the Building select sets Tower and its levels', JSON.stringify([k1, l1]));
await shot('b3-t12c-ux2-keyboard');
await t.finish();
