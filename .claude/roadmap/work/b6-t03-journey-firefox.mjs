// B6-T03 journey tester: Firefox/Safari-like mode. The handle store cannot write (put hook as the T01 check). Must behave as T01.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';
const FIX = '/root/MepApp/fixtures/pdfs/';
const real = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf'];
const sizeOf = (f) => readFileSync(FIX + f).length;
const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
await t.context.addInitScript(() => {
  window.showOpenFilePicker = async () => (window.__nextFiles ?? []).map((name) => ({ kind: 'file', name, getFile: async () => (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile() }));
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'pdfHandles') throw new DOMException('no handle store (simulates Firefox)', 'DataError');
    return origPut.call(this, value, key);
  };
});
await t.start();
const dlg = page.locator('.mep-modal');
for (const f of real) await page.evaluate(async ([d, n]) => { const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable(); await w.write(Uint8Array.from(atob(d), (c) => c.charCodeAt(0))); await w.close(); }, [readFileSync(FIX + f).toString('base64'), f]);
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }];
const json = JSON.stringify({ schemaVersion: 1, id: 'ff', name: 'Tower ff', levels, sheets: real.map((f, i) => ({ id: `s${i}`, levelId: 'l1', projectUuid: null, pageIndex: 0, displayName: `${f} 1`, location: { fileName: f, sizeBytes: sizeOf(f) } })), risers: [] });
async function openB() {
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible' });
  await idle(900);
  await dlg.getByRole('treeitem', { name: /Tower/ }).first().click();
  await idle(500);
}
const texts = async () => ({ rows: await dlg.locator('[data-testid="open-sheet"]').allInnerTexts(), band: (await dlg.getByRole('button', { name: 'Reconnect PDFs' }).count()) === 1 ? await dlg.locator('[data-testid="reconnect-hint"]').innerText() : null, buttons: await dlg.getByRole('button').evaluateAll((e) => e.map((x) => x.getAttribute('aria-label') ?? x.textContent)) });
await openB();
console.log('FF start', JSON.stringify(await texts()));
await page.evaluate((l) => { window.__nextFiles = l; }, real);
await dlg.getByRole('button', { name: 'Reconnect PDFs' }).click();
await idle(1500);
console.log('FF after reconnect', JSON.stringify(await texts()), '| notice:', await dlg.locator('[data-testid="sheets-notice"]').first().innerText().catch(() => null));
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(400);
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await openB();
const after = await texts();
console.log('FF after restart', JSON.stringify(after));
check(after.rows.every((r) => /^Choose file/.test(r.trim())) && after.band !== null, 'FF after restart: rows say Choose file and the band shows (as T01)');
check(!/saved|browser/i.test(after.band ?? ''), 'FF band text has no word about saved files', String(after.band));
await shot('b6-t03-journey-firefox-after-restart');
await t.finish();
