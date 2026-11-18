// B6-T06 no-flag check: the production web platform (mepapp.realStore only; no devPlatform, no webLike, no __mepBuilding use).
// The building is made in the real dialog; a real PDF is added with the fake file picker over OPFS files.
// A changed file = the same bytes with a few bytes appended to the OPFS file; the fake picker returns it.
// Playwright cannot show a real viewer that saves a file, a real permission prompt, or a file lock of another program.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const C = 'arch_simple_A4.pdf';
const EDIT = '\n% edited\n';

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
const putPdf = (name, extra = '') =>
  page.evaluate(
    async ([b64, n, more]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const tail = new TextEncoder().encode(more);
      const all = new Uint8Array(bytes.length + tail.length);
      all.set(bytes, 0);
      all.set(tail, bytes.length);
      const dir = await navigator.storage.getDirectory();
      const w = await (await dir.getFileHandle(n, { create: true })).createWritable();
      await w.write(all);
      await w.close();
    },
    [readFileSync(FIX + C).toString('base64'), name, extra],
  );
const docCount = () => page.evaluate(() => window.__mepSketchScene.getDocuments().length);
const docCountIs = async (n) => { for (let i = 0; i < 40; i++) { if ((await docCount()) === n) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
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
const promptEl = () => dlg.locator('[data-testid="changed-confirm"]');
async function promptText(ms = 6000) {
  for (let i = 0; i < ms / 250 && (await promptEl().count()) === 0; i++) await page.waitForTimeout(250);
  return (await promptEl().count()) === 0 ? null : (await promptEl().first().innerText()).trim();
}

try {
  await openDialog();
  await dlg.getByRole('button', { name: 'New building' }).first().click();
  await dlg.locator('input[aria-label="Building name"]').fill('Office 6');
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

  // restart: the tab has no file; the PDF changed in the other viewer
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
  await putPdf(C, EDIT);
  await openDialog();
  await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 6' }).click();
  await page.waitForTimeout(800);
  await dlg.getByTestId('allow-access').click({ timeout: 3000 }).catch(() => {});
  await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
  await idle(1000);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(800);
  await page.evaluate((n) => { window.__nextFiles = [n]; }, C);
  const docs0 = await docCount();
  const row = dlg.locator('[data-testid="open-sheet"]').first();
  await row.click({ timeout: 5000 });
  const p = await promptText();
  check((p ?? '').startsWith(`${C} changed. Use the new file for `) && (p ?? '').endsWith('?'), 'the default build shows the changed file prompt', String(p));
  await shot('b6-t06-noflag-prompt');
  check((await docCount()) === docs0, 'the sheet did not open yet');
  await dlg.locator('[data-testid="changed-confirm-yes"]').click({ timeout: 3000 });
  const n = await waitNotice((x) => x.startsWith('Opened '));
  check((n ?? '').startsWith('Opened ') && (n ?? '').includes('Using the new'), 'the sheet opens after Use new file', String(n));
  check((await docCount()) >= Math.max(1, docs0), 'one document is open', 'docs0=' + docs0 + ' now=' + (await docCount()));
} catch (e) {
  check(false, 'script error', String(e).split('\n')[0]);
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
