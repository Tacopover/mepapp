// B1-T19: Chrome-like web (File System Access API faked with OPFS handles). Real clicks and typing.
// Flow: create a building through the dialog, add two PDFs to a level, reload (permission back to "prompt"), Allow access, building returns.
import { open } from '/root/MepApp/.claude/worktrees/buildings-t19/.claude/roadmap/browser/lib.mjs';

const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
page.on('crash', () => console.log('PAGE CRASH'));
page.on('close', () => console.log('PAGE CLOSED'));

await t.context.addInitScript(() => {
  window.showSaveFilePicker = async (o) => await (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName ?? 'x.json', { create: true });
  window.showOpenFilePicker = async () => {
    window.__picks = (window.__picks ?? 0) + 1;
    const dir = await navigator.storage.getDirectory();
    const names = window.__nextFiles ?? [window.__nextFile ?? 'drawing.pdf'];
    return await Promise.all(names.map((n) => dir.getFileHandle(n)));
  };
  let granted = localStorage.getItem('__perm') !== 'prompt';
  const proto = FileSystemHandle.prototype;
  proto.queryPermission = async () => (granted ? 'granted' : 'prompt');
  proto.requestPermission = async () => {
    if (localStorage.getItem('__deny') === '1') return 'denied';
    granted = true;
    return 'granted';
  };
  // Headless Chromium dies when it reads an OPFS handle back from IndexedDB. Store only the name, and give the app a proxy handle on read.
  const proxy = (name) => {
    const real = async () => (await navigator.storage.getDirectory()).getFileHandle(name);
    return {
      kind: 'file',
      name,
      getFile: async () => (await real()).getFile(),
      createWritable: async () => (await real()).createWritable(),
      queryPermission: async () => (granted ? 'granted' : 'prompt'),
      requestPermission: async () => {
        if (localStorage.getItem('__deny') === '1') return 'denied';
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
const dlg = page.locator('.mep-modal');
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
async function putPdf(name, file) {
  const { readFileSync } = await import('node:fs');
  await page.evaluate(
    async ([b64, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync('/root/MepApp/fixtures/pdfs/' + file).toString('base64'), name],
  );
}

await openDialog();
check(!(await dlg.getByText('Use the desktop app').count()), 'no "Use the desktop app" text');
check((await dlg.getByTestId('browser-storage-alert').count()) === 0, 'no browser-storage alert in Chrome');
await shot('B1-T19-chrome-empty');

await dlg.getByRole('button', { name: 'New building' }).first().click();
await dlg.locator('input[aria-label="Building name"]').fill('Office 12');
check((await dlg.getByRole('button', { name: 'Create…' }).count()) === 1, 'Create button has the picker ellipsis');
await dlg.locator('input[aria-label="Building name"]').press('Enter');
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
check(await dlg.locator('.mep-buildings-location').innerText().then((s) => s.includes('Office 12.building.json')), 'location line shows the file name');
const saved = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('Office 12.building.json')).getFile()).text());
check(JSON.parse(saved).name === 'Office 12', 'the building file in the picked folder holds the building');
await shot('B1-T19-chrome-created');

await dlg.locator('[role="treeitem"]', { hasText: 'Add level' }).first().click();
await idle(500);
await putPdf('a.pdf', '00_arch_ground_floor.pdf');
await putPdf('b.pdf', '01_arch_first_floor.pdf');
await page.evaluate(() => { window.__nextFiles = ['a.pdf', 'b.pdf']; });
const addPdf = dlg.getByRole('button', { name: /Add PDF/ }).first();
check((await addPdf.count()) > 0, 'Add PDF button exists');
await addPdf.click();
await idle(1500);
const rows = dlg.locator('[data-testid="page-row"]');
const rowCount = await rows.count();
check(rowCount >= 2, 'two PDFs are on the level', String(rowCount));
await shot('B1-T19-chrome-two-pdfs');
if (rowCount > 0) {
  const btn = rows.first().locator('[data-testid="open-sheet"]');
  check(/^\s*Open\s*$/.test(await btn.innerText()), 'row button says Open after Add PDFs (the file is in this tab)');
  const picksBefore = await page.evaluate(() => window.__picks);
  await btn.click();
  await idle(1500);
  check((await page.evaluate(() => window.__picks)) === picksBefore, 'Open used no file picker');
  for (let i = 0; i < 40 && !(await page.evaluate(() => window.__mepSketchScene.getDocuments().some((d) => d.fileName === 'a.pdf'))); i++) await page.waitForTimeout(500);
  console.log('DOCS', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName))), 'STATUS', await page.evaluate(() => document.querySelector('.mep-header-status')?.textContent ?? ''), 'NOTICE', await dlg.locator('.mep-buildings-status').allInnerTexts());
  check(await page.evaluate(() => window.__mepSketchScene.getDocuments().some((d) => d.fileName === 'a.pdf')), 'Open put a.pdf in the viewer');
  const chips = await rows.locator('[data-testid="sheet-status"]').allInnerTexts();
  check(!chips.some((c) => /Missing|No access/i.test(c)), 'no Missing or No access chip on the web', chips.join('|'));
}
await dlg.getByRole('button', { name: 'Close' }).click();

await page.evaluate(() => { localStorage.setItem('__perm', 'prompt'); });
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await openDialog();
const row = dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 12' });
check((await row.count()) === 1, 'the building is in the list after the reload');
await row.click();
await page.waitForTimeout(800);
const card = dlg.getByTestId('access-card');
check((await card.count()) === 1, 'Allow access card shows');
check((await card.innerText()).includes('Your browser asks again'), 'card text');
check((await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Needs your access' }).count()) === 1, 'tree row says Needs your access');
check((await dlg.getByRole('button', { name: 'New building' }).count()) >= 1, 'New building stays usable next to the card');
await shot('B1-T19-chrome-allow-card');

await page.evaluate(() => localStorage.setItem('__deny', '1'));
await dlg.getByTestId('allow-access').click();
await page.waitForTimeout(800);
check((await dlg.getByTestId('access-denied').count()) === 1, 'denied text shows and the card stays');
await shot('B1-T19-chrome-denied');
await page.evaluate(() => localStorage.removeItem('__deny'));
await dlg.getByTestId('allow-access').click();
await dlg.getByText('Levels and sheets').first().waitFor({ timeout: 8000 });
check((await dlg.locator('[data-testid="page-row"]').count()) >= 2, 'the sheets are back after Allow access');
check(/Choose file/.test(await dlg.locator('[data-testid="page-row"] [data-testid="open-sheet"]').first().innerText()), 'after a reload the row says Choose file…');
await shot('B1-T19-chrome-back');

// File moved: remove it, reload with prompt, click the building.
await dlg.getByRole('button', { name: 'Close' }).click();
await page.evaluate(async () => { await (await navigator.storage.getDirectory()).removeEntry('Office 12.building.json'); });
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await openDialog();
await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Office 12' }).click();
await page.waitForTimeout(800);
const txt = await dlg.innerText();
check(/was not found\. Use Open building/.test(txt) || (await dlg.getByTestId('access-card').count()) === 1, 'moved file: not-found text or access card', txt.slice(0, 200));
if (await dlg.getByTestId('access-card').count()) {
  await dlg.getByTestId('allow-access').click();
  await page.waitForTimeout(800);
  check(/was not found\. Use Open building/.test(await dlg.innerText()), 'moved file after Allow access: not-found text');
}
await shot('B1-T19-chrome-moved');

await t.finish();
