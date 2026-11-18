// B6-T07 no-flag check: the production web platform (mepapp.realStore only; no devPlatform, no webLike, no __mepBuilding use).
// The building is made in the real dialog; a real PDF is added with the fake file picker over OPFS files.
// After the restart the saved file handles are cleared, so the row needs a file and the band shows.
// The band must have ONE button, "Reconnect PDFs…", and its menu must have 2 items (no folder stored). The text "Allow access" must not show.
// Playwright cannot show the real browser permission question or a real menu near the edge of the window.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const C = 'arch_simple_A4.pdf';

const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, shot, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('crash', () => console.log('PAGE CRASHED'));
await t.context.addInitScript(() => {
  const dirP = () => navigator.storage.getDirectory();
  window.showSaveFilePicker = async (o) => await (await dirP()).getFileHandle(o?.suggestedName ?? 'x.json', { create: true });
  window.__pickCalls = 0;
  window.showOpenFilePicker = async () => {
    window.__pickCalls += 1;
    const dir = await dirP();
    return await Promise.all((window.__nextFiles ?? []).map((n) => dir.getFileHandle(n)));
  };
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'handles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeBuilding: value.name }, key);
    if (this.name === 'pdfHandles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
    return origPut.call(this, value, key);
  };
  const resultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
  Object.defineProperty(IDBRequest.prototype, 'result', {
    get() {
      const value = resultGet.call(this);
      if (value && value.__fakeBuilding) return { kind: 'file', name: value.__fakeBuilding, getFile: async () => (await (await dirP()).getFileHandle(value.__fakeBuilding)).getFile(), createWritable: async () => (await (await dirP()).getFileHandle(value.__fakeBuilding)).createWritable(), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
      if (value && value.__fakeHandle) return { kind: 'file', name: value.__fakeHandle, getFile: async () => (await (await dirP()).getFileHandle(value.__fakeHandle)).getFile(), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
      return value;
    },
  });
});
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');
const dlg = page.locator('.mep-modal');
const putPdf = (name) =>
  page.evaluate(
    async ([b64, n]) => {
      const dir = await navigator.storage.getDirectory();
      const w = await (await dir.getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + C).toString('base64'), name],
  );
const clearHandles = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('mepapp-buildings');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('pdfHandles', 'readwrite');
          tx.objectStore('pdfHandles').clear();
          tx.oncomplete = () => { db.close(); resolve(true); };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
const lines = async (loc) => (await loc.innerText({ timeout: 2000 })).split('\n').map((s) => s.trim()).filter(Boolean);

try {
  await openDialog();
  await dlg.getByRole('button', { name: 'New building' }).first().click();
  await dlg.locator('input[aria-label="Building name"]').fill('Office 7');
  await dlg.locator('input[aria-label="Building name"]').press('Enter');
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await dlg.locator('[role="treeitem"]', { hasText: 'Add level' }).first().click();
  await idle(500);
  await putPdf(C);
  await page.evaluate((n) => { window.__nextFiles = [n]; }, C);
  await dlg.getByRole('button', { name: /Add PDF/ }).first().click();
  for (let i = 0; i < 60 && (await dlg.locator('[data-testid="page-row"]').count()) < 1; i++) await page.waitForTimeout(500);
  await idle(1000);
  check((await dlg.locator('[data-testid="page-row"]').count()) >= 1, 'the PDF is added to the building');
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(500);

  // restart: the tab has no file and the browser keeps no handle
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
  await clearHandles();
  await openDialog();
  await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 7' }).click();
  await page.waitForTimeout(800);
  await dlg.getByTestId('allow-access').click({ timeout: 3000 }).catch(() => {});
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(1000);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(800);

  check((await dlg.locator('[data-testid="allow-pdf-folder"]').count()) === 0, 'the default build has no allow-pdf-folder button');
  check(!(await dlg.innerText()).includes('Allow access'), 'the text "Allow access" is nowhere in the dialog');
  check((await dlg.locator('[data-testid="reconnect-band"] button').count()) === 1, 'the band has one button', String(await dlg.locator('[data-testid="reconnect-band"] button').count()));
  check(
    (await dlg.locator('[data-testid="reconnect-hint"]').innerText({ timeout: 3000 }).catch(() => '')).trim() === '1 PDF needs a file before it opens. Click Reconnect PDFs… to choose the folder or the file.',
    'the band hint (one PDF)',
  );
  await dlg.locator('[data-testid="reconnect-pdfs"]').click({ timeout: 3000 });
  const menuEl = dlg.locator('[data-testid="reconnect-menu"]');
  await menuEl.waitFor({ state: 'visible', timeout: 3000 });
  check((await menuEl.locator('[role="menuitem"]').count()) === 2, 'the menu has 2 items', String(await menuEl.locator('[role="menuitem"]').count()));
  check((await lines(dlg.locator('[data-testid="pdf-folder-pick"]')))[0] === 'Choose a folder…', 'item 1 says Choose a folder…');
  check((await lines(dlg.locator('[data-testid="pdf-files-pick"]')))[0] === 'Choose files…', 'item 2 says Choose files…');
  await shot('b6-t07-noflag-menu');
} catch (e) {
  check(false, 'script error', String(e).split('\n')[0]);
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
