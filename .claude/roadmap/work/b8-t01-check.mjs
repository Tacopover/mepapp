// B8-T01 check: the Flow direction select of the Network Type Editor. Real web store (mepapp.realStore only, no dev stub, no flag).
// Real DOM: swatch click, select change, Save and Cancel clicks, Duplicate click. The scene API only reads state (and loads the saved JSON back).
// Run: node .claude/roadmap/browser/with-server.mjs <this file>
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';

const M = '.mep-modal';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');
await t.openPdf();

const typeOf = (id) => page.evaluate((id) => window.__mepSketchScene.exportProject().networkTypes.find((x) => x.id === id) ?? null, id);
const allTypes = () => page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes);
const sel = () => page.locator(`${M} [data-testid=nt-flow-sense]`);
const save = () => page.locator(M).getByRole('button', { name: /^Save$/ }).first();

async function openEditor(name, group = 'HVAC') {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: group }).first().click();
  await idle(400);
  await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
  await page.locator(M).waitFor({ timeout: 20000 });
  await idle(300);
}

// 1. A library type that the drawing never used shows the library value (Return Air: return).
await openEditor('Return Air');
check((await sel().count()) === 1, 'step 1: the select nt-flow-sense exists');
check((await sel().inputValue()) === 'return', 'step 1: Return Air shows return', await sel().inputValue());
const opts = await sel().locator('option').allInnerTexts();
check(JSON.stringify(opts) === JSON.stringify(['Supply', 'Return']), 'step 1: the two option texts', JSON.stringify(opts));
const label = await page.locator(`${M} .mep-field-row`, { has: page.locator('[data-testid=nt-flow-sense]') }).locator('label').textContent();
check((label ?? '').trim() === 'Flow direction', 'step 1: the label reads Flow direction', label);
const infoCount = await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip`).count();
check(infoCount === 1, 'step 1: the i mark exists');
await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip`).hover();
await idle(300);
const tip = await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip-text`).innerText().catch(() => '');
check(/For the other direction of the same system, use Duplicate and change the copy\./.test(tip) && /Supply goes away from the source\. Return goes toward it\./.test(tip), 'step 1: the hint text shows on hover', tip);
const tipBox = await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip-text`).boundingBox();
const dlgBox2 = await page.locator(`${M} .mep-modal-body`).boundingBox();
check(tipBox !== null && dlgBox2 !== null && tipBox.x >= dlgBox2.x && tipBox.x + tipBox.width <= dlgBox2.x + dlgBox2.width, 'step 1: the hint card is inside the dialog body (not cut)', JSON.stringify({ tipBox, dlgBox2 }));
const selBox = await sel().boundingBox();
const infoBox = await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip`).boundingBox();
check(selBox !== null && infoBox !== null && infoBox.x - (selBox.x + selBox.width) < 20, 'step 1: the i mark sits next to the select', JSON.stringify({ selBox, infoBox }));
const dlgBox = await page.locator(M).boundingBox();
check(dlgBox !== null && dlgBox.width < 400, 'step 1: the dialog is narrower than 400 px', JSON.stringify(dlgBox));
await shot('B8-T01-editor-return');

// 2. Change to Supply, Save, read back, reopen.
await sel().selectOption('supply');
await save().click();
await idle(400);
check((await page.locator(M).count()) === 0, 'step 2: the dialog closed on Save');
check((await typeOf('return-air'))?.flowSense === 'supply', 'step 2: the document stores supply for return-air', JSON.stringify(await typeOf('return-air')));
await openEditor('Return Air');
check((await sel().inputValue()) === 'supply', 'step 2: a reopen shows Supply');
await shot('B8-T01-editor-supply');

// 3. Cancel after a change saves nothing.
await sel().selectOption('return');
await page.locator(M).getByRole('button', { name: /^Cancel$/ }).click();
await idle(300);
check((await typeOf('return-air'))?.flowSense === 'supply', 'step 3: Cancel keeps supply');
await openEditor('Return Air');
check((await sel().inputValue()) === 'supply', 'step 3: a reopen after Cancel shows Supply');
await page.keyboard.press('Escape');
await idle(300);

// 4. Never-used library types: Exhaust Air shows return; Save with no change stores it.
await openEditor('Exhaust Air');
check((await sel().inputValue()) === 'return', 'step 4: Exhaust Air shows return');
await save().click();
await idle(400);
check((await typeOf('exhaust-air'))?.flowSense === 'return', 'step 4: Save with no change stores return', JSON.stringify(await typeOf('exhaust-air')));

// 5. Duplicate of a type that the drawing never used (Chilled Water): a copy exists, the dialog shows the copy, then Return and Save.
check((await typeOf('chilled-water')) === null, 'step 5: Chilled Water is not adopted before');
await openEditor('Chilled Water');
check((await sel().inputValue()) === 'supply', 'step 5: Chilled Water shows supply');
await page.locator(M).getByRole('button', { name: /^Duplicate$/ }).click();
await idle(500);
const title = await page.locator(`${M} .mep-modal-title, ${M} h2, ${M} header`).first().innerText().catch(() => '');
check(/Chilled Water_copy/.test(title), 'step 5: the dialog now shows the copy', title);
check((await sel().inputValue()) === 'supply', 'step 5: the copy shows supply');
await page.locator(`${M} input[type=text]`).first().fill('Chilled Water return');
await sel().selectOption('return');
await save().click();
await idle(400);
const types = await allTypes();
const copy = types.find((x) => x.name === 'Chilled Water return');
check(copy !== undefined && copy.flowSense === 'return' && copy.id !== 'chilled-water', 'step 5: the copy is stored with return and a new id', JSON.stringify(copy));
check(types.find((x) => x.id === 'chilled-water')?.flowSense === 'supply', 'step 5: the source keeps supply', JSON.stringify(types.find((x) => x.id === 'chilled-water')));
await shot('B8-T01-networks-after-duplicate');

// 6. Duplicate of Exhaust Air keeps return in the copy without a change.
await openEditor('Exhaust Air');
await page.locator(M).getByRole('button', { name: /^Duplicate$/ }).click();
await idle(500);
check((await sel().inputValue()) === 'return', 'step 6: the copy of Exhaust Air shows return');
await page.keyboard.press('Escape');
await idle(300);
const exCopy = (await allTypes()).find((x) => x.name === 'Exhaust Air_copy');
check(exCopy?.flowSense === 'return', 'step 6: the stored copy of Exhaust Air has return', JSON.stringify(exCopy));

// 7. Project round trip through the real JSON: the file holds version 24 and the values; a load shows them again.
const json = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.exportProject())));
check(json.schemaVersion === 24, 'step 7: the exported project has schema 24', String(json.schemaVersion));
await page.evaluate(async (j) => { await window.__mepSketchScene.loadProjectFromJson(j); }, json);
await idle(800);
check((await typeOf('return-air'))?.flowSense === 'supply', 'step 7: after a load return-air keeps supply');
check((await allTypes()).find((x) => x.name === 'Chilled Water return')?.flowSense === 'return', 'step 7: after a load the Chilled Water copy keeps return');
await openEditor('Return Air');
check((await sel().inputValue()) === 'supply', 'step 7: the editor after a load shows Supply');
await page.keyboard.press('Escape');
await idle(300);

// 8. A file saved before this change (version 23, no flowSense): the library values show.
const old = JSON.parse(JSON.stringify(json));
old.schemaVersion = 23;
old.networkTypes = old.networkTypes.map(({ flowSense, ...rest }) => rest);
await page.evaluate(async (j) => { await window.__mepSketchScene.loadProjectFromJson(j); }, old);
await idle(800);
check((await typeOf('return-air'))?.flowSense === 'return', 'step 8: an old file gets the library value return for return-air', JSON.stringify(await typeOf('return-air')));
await openEditor('Return Air');
check((await sel().inputValue()) === 'return', 'step 8: the editor shows Return for an old file');
await page.keyboard.press('Escape');
await idle(300);

// 9. A narrow window: the dialog still works.
await page.setViewportSize({ width: 760, height: 900 });
await openEditor('Supply Air');
const box = await page.locator(M).boundingBox();
check(box !== null && box.x >= 0 && box.x + box.width <= 760, 'step 9: the dialog fits in 760 px', JSON.stringify(box));
await shot('B8-T01-editor-760');
await page.keyboard.press('Escape');
await idle(300);

await t.finish();
