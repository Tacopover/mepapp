// B6-T01 no-flag check: the production store (mepapp.realStore only, no dev stub, no __mepBuilding use; no devPlatform or webLike flag).
// A building is made and filled through the UI. After a page reload the cache is empty: the band shows, the pick reconnects, the rows open.
// The picker and the permission are faked with OPFS handles (same method as t19-chrome-check.mjs).
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
  window.showOpenFilePicker = async () => {
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
    if (this.name === 'handles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
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
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}

await openDialog();
await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Office 6');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
check((await dlg.locator('[data-testid="reconnect-band"]').count()) === 0, 'new building: no band');
await dlg.locator('[role="treeitem"]', { hasText: 'Add level' }).first().click();
await idle(500);
for (const f of [A, B, C]) await putPdf(f);
await next([A, B, C]);
await dlg.getByRole('button', { name: /Add PDF/ }).first().click();
for (let i = 0; i < 60 && (await dlg.locator('[data-testid="page-row"]').count()) < 3; i++) await page.waitForTimeout(500);
await idle(1000);
const rows = await dlg.locator('[data-testid="page-row"]').count();
check(rows >= 3, 'three PDFs were added', String(rows));
check((await dlg.locator('[data-testid="reconnect-band"]').count()) === 0, 'after Add PDFs: no band (the files are known in this tab)');
await shot('b6-t01-noflag-01-after-add');
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(500);

// restart: the file cache is empty
await page.evaluate(() => { localStorage.setItem('__perm', 'prompt'); });
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
await openDialog();
await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 6' }).click();
await page.waitForTimeout(800);
await dlg.getByTestId('allow-access').click();
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
await idle(800);
await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
await idle(600);
const hint = dlg.locator('[data-testid="reconnect-hint"]');
const hintText = (await hint.count()) === 1 ? (await hint.innerText()).trim() : 'no band';
check(hintText === '3 PDFs need a file before they open. Choose them all in one step.', 'after restart: the band counts 3 PDFs', hintText);
await shot('b6-t01-noflag-02-after-restart');
await page.evaluate(() => { window.__pickCancel = true; });
await dlg.locator('[data-testid="reconnect-pdfs"]').click();
await idle(600);
check((await dlg.locator('[data-testid="sheets-notice"]').count()) === 0, 'cancel: no message');
await page.evaluate(() => { window.__pickCancel = false; });
await next([A, B, C]);
await dlg.locator('[data-testid="reconnect-pdfs"]').click();
await idle(1000);
const notice = (await dlg.locator('[data-testid="sheets-notice"]').innerText()).trim();
check(notice === 'Found all 3 PDFs.', 'notice after the pick', notice);
check((await dlg.locator('[data-testid="reconnect-band"]').count()) === 0, 'band is gone');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Choose file…$/ }).count()) === 0, 'no row says Choose file…');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) >= 3, 'rows say Open');
await shot('b6-t01-noflag-03-reconnected');
await dlg.getByRole('button', { name: 'Close', exact: true }).click();
await idle(400);
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
