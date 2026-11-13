// B6-T03 no-flag check: the production web platform (mepapp.realStore only; no devPlatform, no webLike, no __mepBuilding use).
// The real PdfHandleStore keeps the handles of the added PDFs in IndexedDB (real OPFS file handles). A page reload is the restart.
// After the restart the rows say Open at once and the sheet opens through the stored handle; a deleted file gives the message and Choose file…
// The headless browser crashes on getFile of a handle read back from IndexedDB, so (as t19-chrome-check.mjs) the handles are saved as { __fakeHandle: name } and read back as a proxy over the OPFS file.
// Playwright cannot show a real permission prompt, "Allow on every visit", or a restart with a real profile.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';

const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, shot, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('crash', () => console.log('PAGE CRASHED'));
await t.context.addInitScript(() => {
  window.showSaveFilePicker = async (o) => await (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName ?? 'x.json', { create: true });
  window.__pickCalls = 0;
  window.showOpenFilePicker = async () => {
    window.__pickCalls += 1;
    if (window.__pickCancel) throw new DOMException('cancelled', 'AbortError');
    const dir = await navigator.storage.getDirectory();
    return await Promise.all((window.__nextFiles ?? []).map((n) => dir.getFileHandle(n)));
  };
  let granted = localStorage.getItem('__perm') !== 'prompt';
  const proto = FileSystemHandle.prototype;
  proto.queryPermission = async () => (granted ? 'granted' : 'prompt');
  proto.requestPermission = async () => {
    granted = true;
    return 'granted';
  };
  const proxy = (name) => {
    const real = async () => (await navigator.storage.getDirectory()).getFileHandle(name);
    return {
      kind: 'file',
      name,
      getFile: async () => (await real()).getFile(),
      createWritable: async () => (await real()).createWritable(),
      queryPermission: async () => (granted ? 'granted' : 'prompt'),
      requestPermission: async () => {
        granted = true;
        return 'granted';
      },
    };
  };
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if ((this.name === 'handles' || this.name === 'pdfHandles') && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
    return origPut.call(this, value, key);
  };
  const resultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
  Object.defineProperty(IDBRequest.prototype, 'result', {
    get() {
      const value = resultGet.call(this);
      return value && value.__fakeHandle ? proxy(value.__fakeHandle) : value;
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
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + name).toString('base64'), name],
  );
const next = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
const storedCount = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('mepapp-buildings');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('pdfHandles').objectStore('pdfHandles').count();
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
async function restart() {
  await page.evaluate(() => { localStorage.setItem('__perm', 'prompt'); });
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
  await openDialog();
  await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 6' }).click();
  await page.waitForTimeout(800);
  await dlg.getByTestId('allow-access').click();
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(1000);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(600);
}

await openDialog();
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Office 6');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await dlg.locator('[role="treeitem"]', { hasText: 'Add level' }).first().click();
await idle(500);
for (const f of [A, B, C]) await putPdf(f);
await next([A, B, C]);
check((await storedCount()) === 0, 'nothing is stored before a PDF is given');
await dlg.getByRole('button', { name: /Add PDF/ }).first().click();
for (let i = 0; i < 60 && (await dlg.locator('[data-testid="page-row"]').count()) < 3; i++) await page.waitForTimeout(500);
await idle(1000);
check((await dlg.locator('[data-testid="page-row"]').count()) >= 3, 'three PDFs were added');
check((await storedCount()) === 3, 'Add PDFs stored 3 handles in IndexedDB', String(await storedCount()));
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(500);

// restart 1: the rows say Open at once, the sheet opens through the stored handle
await restart();
check((await dlg.locator('[data-testid="reconnect-band"]').count()) === 0, 'after restart: no band');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Choose file…$/ }).count()) === 0, 'after restart: no row says Choose file…');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) >= 3, 'after restart: the rows say Open');
await shot('b6-t03-noflag-01-after-restart');
await dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${C}"]`).first().click();
await idle(2000);
const opened = ((await dlg.locator('[data-testid="sheets-notice"]').count()) === 1 ? await dlg.locator('[data-testid="sheets-notice"]').innerText() : '').trim();
check(opened.startsWith('Opened '), 'Open uses the stored handle: the sheet opens', opened);
check((await page.evaluate(() => window.__pickCalls)) === 0, 'the file picker did not open', String(await page.evaluate(() => window.__pickCalls)));
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(500);

// restart 2: a deleted file gives the message, deletes the handle, the row says Choose file…
await page.evaluate((n) => navigator.storage.getDirectory().then((d) => d.removeEntry(n)), B);
await restart();
await page.evaluate(() => { window.__pickCancel = true; });
await dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${B}"]`).first().click();
await idle(1200);
const moved = (await dlg.locator('[data-testid="sheets-notice"]').innerText()).trim();
check(moved === `Could not open ${B}. Choose the file again.`, 'deleted file: message', moved);
check((await page.evaluate(() => window.__pickCalls)) === 1, 'deleted file: the picker opened at once');
check((await storedCount()) === 2, 'deleted file: the stale handle is deleted', String(await storedCount()));
check((await dlg.locator(`[data-testid="open-sheet"][aria-label^="Choose file for ${B}"]`).count()) === 1, 'deleted file: the row says Choose file…');
await shot('b6-t03-noflag-02-moved');
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(400);
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
