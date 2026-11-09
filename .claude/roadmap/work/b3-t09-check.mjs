// B3-T09: the old registry import line. Real clicks. The save picker is a stub that writes imp-<n>.json in OPFS.
import { open } from '../browser/lib.mjs';

const old = [
  { id: 'old-1', name: 'Old tower', levels: [{ id: 'ol-1', name: 'Ground', documentFileName: 'ground.pdf' }, { id: 'ol-2', name: 'Level 1', documentFileName: null }] },
  { id: 'old-2', name: 'Old annex', levels: [{ id: 'ol-3', name: 'Basement', documentFileName: null }] },
];
const t = await open({ seed: { 'mepapp.buildings.v1': JSON.stringify(old) } });
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(300);
}
async function importOld() {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[data-testid="import-old-button"]').click();
}
// Save picker: first call imp-1.json, second call cancelled, later calls imp-3.json ...
await page.evaluate(() => {
  window.__saves = 0;
  window.showSaveFilePicker = async () => {
    window.__saves += 1;
    if (window.__saves === 2) throw new DOMException('cancelled', 'AbortError');
    return await (await navigator.storage.getDirectory()).getFileHandle(`imp-${window.__saves}.json`, { create: true });
  };
});

await openDialog();
const line = dlg.locator('[data-testid="import-old"]');
check((await line.count()) === 1, 'the import section shows');
check(/2 old buildings can be imported/.test((await line.textContent()) ?? ''), 'the note says "2 old buildings can be imported"', (await line.textContent()) ?? '');
await shot('B3-T09-import');

// First run: building 1 saved, building 2 cancelled.
await importOld();
await dlg.locator('[data-testid="import-old-result"]').waitFor({ timeout: 8000 }).catch(() => {});
let result = (await dlg.locator('[data-testid="import-old-result"]').textContent().catch(() => '')) ?? '';
check(/Imported 1 of 2/.test(result) && /1 skipped/.test(result), 'result: 1 of 2 imported, 1 skipped', result);
const f1 = await page.evaluate(async () => JSON.parse(await (await (await (await navigator.storage.getDirectory()).getFileHandle('imp-1.json')).getFile()).text()));
check(f1.id === 'old-1' && f1.name === 'Old tower' && f1.levels.length === 2, 'file 1 holds the old levels', JSON.stringify(f1).slice(0, 160));
check(/Old tower/.test((await dlg.textContent()) ?? '') && (await dlg.locator('[role=treeitem][data-kind=building]', { hasText: 'Old tower' }).count()) === 1, 'the tree lists the imported building');
check(/1 old building can be imported/.test((await line.textContent()) ?? ''), 'one old building is still pending', (await line.textContent()) ?? '');
const oldKey = await page.evaluate(() => JSON.parse(localStorage.getItem('mepapp.buildings.v1')).length);
check(oldKey === 2, 'the old key is unchanged');
await shot('B3-T09-partial');

// Second run: the rest is saved.
await importOld();
await idle(800);
result = (await dlg.locator('[data-testid="import-old-result"]').textContent().catch(() => '')) ?? '';
check(/Imported 1 of 1/.test(result), 'second run: 1 of 1 imported', result);
await dlg.locator('button.mep-menu-btn').click();
check((await dlg.locator('[data-testid="import-old-button"]').count()) === 0, 'no pending buildings: the menu offers no import');
await dlg.locator('button.mep-menu-btn').click();

// After a reload nothing is offered again.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await openDialog();
check((await dlg.locator('[data-testid="import-old"]').count()) === 0, 'after a reload the import line is gone');
check((await page.evaluate(() => JSON.parse(localStorage.getItem('mepapp.buildings.v1')).length)) === 2, 'the old key still holds 2 buildings');
await shot('B3-T09-done');

await t.finish();
