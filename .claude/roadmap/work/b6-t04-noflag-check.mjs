// B6-T04 no-flag check: the production web platform (mepapp.realStore only; no devPlatform, no webLike, no __mepBuilding use).
// The real PdfHandleStore keeps the file handles and the folder handle in IndexedDB. A page reload is the restart.
// The folder is a real OPFS directory "Plans". The headless browser crashes on getFile of a file handle read back from IndexedDB,
// so (as b6-t03-noflag-check.mjs) handles are saved as { __fakeHandle: name } / { __fakeDir: name } and read back as a proxy over the OPFS entry.
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
  const dirP = () => navigator.storage.getDirectory();
  const bump = (k) => localStorage.setItem(k, String(Number(localStorage.getItem(k) ?? '0') + 1));
  window.showSaveFilePicker = async (o) => await (await dirP()).getFileHandle(o?.suggestedName ?? 'x.json', { create: true });
  window.__pickCalls = 0;
  window.__dirPicks = [];
  const fileGranted = () => localStorage.getItem('__perm') !== 'prompt';
  const proxy = (name) => ({
    kind: 'file',
    name,
    getFile: async () => (await (await dirP()).getFileHandle(name)).getFile(),
    queryPermission: async () => (fileGranted() ? 'granted' : 'prompt'),
    requestPermission: async () => {
      bump('__reqCalls');
      localStorage.setItem('__perm', 'granted');
      return 'granted';
    },
  });
  const proxyDir = (name) => ({
    kind: 'directory',
    name,
    queryPermission: async () => (localStorage.getItem('__fperm') === 'prompt' ? 'prompt' : 'granted'),
    requestPermission: async () => {
      bump('__freqCalls');
      localStorage.setItem('__fperm', 'granted');
      return 'granted';
    },
    values: async function* () {
      const dir = await (await dirP()).getDirectoryHandle(name);
      for await (const entry of dir.values()) yield entry;
    },
  });
  window.showOpenFilePicker = async () => {
    window.__pickCalls += 1;
    const dir = await dirP();
    return await Promise.all((window.__nextFiles ?? []).map((n) => dir.getFileHandle(n)));
  };
  window.showDirectoryPicker = async (options) => {
    window.__dirPicks.push(options);
    return proxyDir(window.__nextFolder);
  };
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'handles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeBuilding: value.name }, key);
    if (this.name === 'pdfHandles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
    if (this.name === 'pdfFolders' && value && value.kind === 'directory') return origPut.call(this, { __fakeDir: value.name }, key);
    return origPut.call(this, value, key);
  };
  const resultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
  Object.defineProperty(IDBRequest.prototype, 'result', {
    get() {
      const value = resultGet.call(this);
      if (value && value.__fakeBuilding) return { kind: 'file', name: value.__fakeBuilding, getFile: async () => (await (await dirP()).getFileHandle(value.__fakeBuilding)).getFile(), createWritable: async () => (await (await dirP()).getFileHandle(value.__fakeBuilding)).createWritable(), queryPermission: async () => 'granted', requestPermission: async () => 'granted' };
      if (value && value.__fakeHandle) return proxy(value.__fakeHandle);
      if (value && value.__fakeDir) return proxyDir(value.__fakeDir);
      return value;
    },
  });
});
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');
const dlg = page.locator('.mep-modal');
const putPdf = (name, folder) =>
  page.evaluate(
    async ([b64, n, sub]) => {
      let dir = await navigator.storage.getDirectory();
      if (sub) dir = await dir.getDirectoryHandle(sub, { create: true });
      const w = await (await dir.getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + name).toString('base64'), name, folder ?? null],
  );
const next = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
const num = (k) => page.evaluate((key) => Number(localStorage.getItem(key) ?? '0'), k);
const storeCount = (name) =>
  page.evaluate(
    (storeName) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('mepapp-buildings');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction(storeName).objectStore(storeName).count();
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
          q.onerror = () => reject(q.error);
        };
      }),
    name,
  );
const band = () => dlg.locator('[data-testid="reconnect-band"]');
const allowBtn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
const menuItem = (id) => dlg.locator(`[data-testid="${id}"]`);
const itemLabel = async (id) => (await menuItem(id).locator('strong').innerText()).trim();
const hint = async () => ((await band().count()) === 0 ? null : (await dlg.locator('[data-testid="reconnect-hint"]').innerText()).trim());
const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 2000 }).catch(() => null)) ?? null)?.trim() ?? null;
async function waitNotice(test, ms = 20000) {
  let text = null;
  for (let i = 0; i < ms / 300 && !(text !== null && test(text)); i++) {
    text = await notice();
    await page.waitForTimeout(300);
  }
  return text;
}
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
async function restart() {
  await page.evaluate(() => {
    localStorage.setItem('__perm', 'prompt');
    localStorage.setItem('__fperm', 'prompt');
    localStorage.setItem('__reqCalls', '0');
    localStorage.setItem('__freqCalls', '0');
  });
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
  await openDialog();
  await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 6' }).click();
  await page.waitForTimeout(800);
  await dlg.getByTestId('allow-access').click({ timeout: 3000 }).catch(() => {});
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(1000);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(600);
}
const closeDialog = async () => {
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(500);
};

await openDialog();
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Office 6');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await dlg.locator('[role="treeitem"]', { hasText: 'Add level' }).first().click();
await idle(500);
for (const f of [A, B, C]) {
  await putPdf(f);
  await putPdf(f, 'Plans');
}
await next([A, B, C]);
await dlg.getByRole('button', { name: /Add PDF/ }).first().click();
for (let i = 0; i < 60 && (await dlg.locator('[data-testid="page-row"]').count()) < 3; i++) await page.waitForTimeout(500);
await idle(1000);
check((await storeCount('pdfHandles')) === 3, 'Add PDFs stored 3 handles', String(await storeCount('pdfHandles')));
check((await storeCount('pdfFolders')) === 0, 'no folder is stored yet');
await closeDialog();

// restart 1: saved PDFs, no folder: the band offers the folder
await restart();
await idle(3000);
check((await hint()) === '3 PDFs are saved in this browser. Click Reconnect PDFs… to open them all.', 'restart 1: band hint (T-B)', String(await hint()));
check((await dlg.locator('[data-testid="reconnect-band"] button').allInnerTexts()).join('|') === 'Reconnect PDFs…', 'restart 1: one button');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) >= 3, 'restart 1: the rows say Open');
await shot('b6-t04-noflag-01-saved-no-folder');
await page.evaluate(() => { window.__nextFolder = 'Plans'; });
await allowBtn().click();
await menuItem('pdf-folder-pick').click();
check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 3 PDFs in Plans.', 'pick: notice', String(await notice()));
check((await storeCount('pdfFolders')) === 1, 'pick: the folder handle is stored in IndexedDB', String(await storeCount('pdfFolders')));
check((await page.evaluate(() => window.__dirPicks.length)) === 1 && (await page.evaluate(() => window.__dirPicks[0].id)) === 'mepapp-building-pdfs', 'pick: picker id is mepapp-building-pdfs');
for (let i = 0; i < 30 && (await band().count()) !== 0; i++) await page.waitForTimeout(250);
check((await band().count()) === 0, 'pick: the band is gone');
await closeDialog();

// restart 2: one click on the band asks the folder once; then a sheet opens with no picker
await restart();
check((await hint()) === '3 PDFs are saved in this browser. Click Reconnect PDFs… and use the folder Plans to open them.', 'restart 2: band hint (T-C)', String(await hint()));
await allowBtn().click();
check((await itemLabel('pdf-folder-use')) === 'Use the folder Plans', 'restart 2: the first menu item names the folder', await itemLabel('pdf-folder-use'));
await shot('b6-t04-noflag-02-folder-saved');
await menuItem('pdf-folder-use').click();
check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 3 PDFs in Plans.', 'restart 2: notice', String(await notice()));
check((await num('__freqCalls')) === 1, 'restart 2: the folder was asked once', String(await num('__freqCalls')));
check((await num('__reqCalls')) === 0, 'restart 2: no single file was asked');
await dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${C}"]`).first().click();
const opened = await waitNotice((x) => x.startsWith('Opened '));
check((opened ?? '').startsWith('Opened '), 'restart 2: the sheet opens', String(opened));
check((await page.evaluate(() => window.__pickCalls)) === 0, 'restart 2: no file picker opened', String(await page.evaluate(() => window.__pickCalls)));
await closeDialog();

// restart 3: the folder is deleted
await page.evaluate(() => navigator.storage.getDirectory().then((d) => d.removeEntry('Plans', { recursive: true })));
await restart();
await allowBtn().click();
await menuItem('pdf-folder-use').click();
check((await waitNotice((x) => x.startsWith('The folder'))) === 'The folder Plans is not there any more. Click Reconnect PDFs… and choose the folder again.', 'restart 3: folder gone notice', String(await notice()));
check((await storeCount('pdfFolders')) === 0, 'restart 3: the folder handle is deleted');
await allowBtn().click();
check((await itemLabel('pdf-folder-pick')) === 'Choose a folder…', 'restart 3: the menu offers the folder picker again', await itemLabel('pdf-folder-pick'));
await allowBtn().click();
await shot('b6-t04-noflag-03-folder-gone');
await closeDialog();
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
