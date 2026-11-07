// T19 follow-up F1: an OPEN pdf added to a level with the one-step Add must get a summary in the store.
// argv[2] = 'active' | 'inactive'. Reads the store (IndexedDB summaries) and the building file, not only the chip.
import { open } from '/root/MepApp/.claude/worktrees/buildings-t19/.claude/roadmap/browser/lib.mjs';

const scenario = process.argv[2] ?? 'active';
const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
await t.context.addInitScript(() => {
  window.showSaveFilePicker = async (o) => await (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName ?? 'x.json', { create: true });
  window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle(window.__nextFile ?? 'drawing.pdf')];
});
await t.start();
const dlg = page.locator('.mep-modal');
const tag = `B1-T19-f1-${scenario}`;

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Office 12');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await dlg.locator('[role="treeitem"]', { hasText: 'Add level' }).first().click();
await idle(500);
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(400);

await t.openPdf('/root/MepApp/fixtures/pdfs/00_arch_ground_floor.pdf', 'a.pdf');
if (scenario === 'inactive') {
  await t.openPdf('/root/MepApp/fixtures/pdfs/01_arch_first_floor.pdf', 'b.pdf');
  for (let i = 0; i < 80 && (await page.evaluate(() => window.__mepSketchScene.getDocuments().length)) < 2; i++) await page.waitForTimeout(250);
  await idle(1500);
}
const docs = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => ({ id: d.id, f: d.fileName, uuid: d.projectUuid })));
const docA = docs.find((d) => d.f === 'a.pdf');

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(800);
if ((await dlg.getByRole('button', { name: 'Add to Level 1' }).count()) === 0) {
  await dlg.getByRole('button', { name: /Open in the viewer/ }).click();
  await idle(500);
}
await dlg.getByRole('button', { name: 'Add to Level 1' }).first().click();
await idle(6000);
console.log("STATUS", await page.evaluate(() => document.querySelector(".mep-header-status")?.textContent ?? ""));

const readStore = () =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('mepapp-buildings');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const keys = await new Promise((res) => {
      const q = db.transaction('summaries').objectStore('summaries').getAllKeys();
      q.onsuccess = () => res(q.result);
    });
    db.close();
    const text = await (await (await (await navigator.storage.getDirectory()).getFileHandle('Office 12.building.json')).getFile()).text();
    return { keys, sheets: JSON.parse(text).sheets };
  });
const chip = () => dlg.locator('[data-testid="page-row"] [data-testid="sheet-status"]').first().innerText();

console.log("EXPORT", await page.evaluate(() => JSON.stringify({ p: window.__mepSketchScene.exportProject().projectUuid, d: window.__mepSketchScene.getDocuments().map((x) => [x.fileName, x.projectUuid, x.projectUuidInFile, x.sizeBytes, x.hasPdf]) })));
let store = await readStore();
console.log('STORE after add', JSON.stringify(store));
check(store.sheets.length >= 1, 'a sheet was added');
check(store.sheets[0].projectUuid === docA.uuid, 'the sheet takes the document runtime id', `${store.sheets[0].projectUuid} vs ${docA.uuid}`);
if (scenario === 'inactive') {
  await shot(`${tag}-before-activation`);
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate((id) => window.__mepSketchScene.activateDocument(id), docA.id);
  await idle(2500);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(800);
  store = await readStore();
  console.log('STORE after activation', JSON.stringify(store));
}
check(store.keys.some((k) => String(k).endsWith(`:${docA.uuid}`)), 'the store holds a summary of the document', JSON.stringify(store.keys));
const chipText = (await chip()).trim();
console.log('CHIP', chipText);
check(chipText === 'OK', 'the chip says OK', chipText);
await shot(`${tag}-after`);
await t.finish();
