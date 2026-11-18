// B6-T07: one "Reconnect PDFs…" button with a menu (Chrome and Edge) or the file picker at once (Firefox and Safari). Real clicks and keys on the real dialog.
// The browser store is the real IndexedDB store (mepapp.webLike: no devPlatform); the building is loaded with the dev hook window.__mepBuilding.load only.
// The pickers and the permissions are fake (same harness as b6-t06-check.mjs):
//   - the file picker returns fake file handles over OPFS files (window.__nextFiles = names);
//   - the folder picker returns a fake directory handle over a tree in localStorage (__trees); a delay can be set (window.__dirDelay);
//   - fake handles are saved in IndexedDB as { __fakeHandle } / { __fakeDir, path } and given back as the same fake;
//   - queryPermission and requestPermission read localStorage, so a page reload keeps them.
// A reload is the restart: the tab memory (SheetFileCache) is empty, IndexedDB stays.
// Firefox and Safari: the fake removes window.showOpenFilePicker (localStorage __noHandles); the app then uses an input of type file, and Playwright answers its file chooser.
// What the fake hides: the real browser permission question ("View files in {Folder}?"), a real menu near the edge of the window or of the screen, and the real Safari and Firefox.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';
const sizeOf = (f) => readFileSync(FIX + f).length;

const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.context.addInitScript(() => {
  const dirP = () => navigator.storage.getDirectory();
  const ls = (k, d) => localStorage.getItem(k) ?? d;
  const bump = (k) => localStorage.setItem(k, String(Number(ls(k, '0')) + 1));
  const perms = (permKey, ansKey, callsKey) => ({
    queryPermission: async () => ls(permKey, 'granted'),
    requestPermission: async () => {
      bump(callsKey);
      const answer = ls(ansKey, 'granted');
      if (answer === 'granted') localStorage.setItem(permKey, 'granted');
      return answer;
    },
  });
  const filePerms = () => perms('__perm', '__reqAnswer', '__reqCalls');
  const proxy = (name) => ({
    kind: 'file',
    name,
    getFile: async () => (await (await dirP()).getFileHandle(name)).getFile(),
    ...filePerms(),
  });
  const entryOf = (f) => ({
    kind: 'file',
    name: f.name,
    getFile: async () => {
      const base = await (await (await dirP()).getFileHandle(f.src ?? f.name)).getFile();
      return new File([base], f.name, { lastModified: f.time ?? base.lastModified });
    },
    ...filePerms(),
  });
  const nodeAt = (root, path) => {
    let node = JSON.parse(localStorage.getItem('__trees') ?? '{}')[root];
    if (!node) throw new DOMException('The folder is gone', 'NotFoundError');
    for (const part of path) {
      node = node.dirs?.[part];
      if (!node) throw new DOMException('The folder is gone', 'NotFoundError');
    }
    return node;
  };
  const mkDir = (root, path) => ({
    kind: 'directory',
    name: path.length === 0 ? root : path[path.length - 1],
    __root: root,
    __path: path,
    ...perms('__fperm', '__fans', '__freqCalls'),
    values: async function* () {
      if (window.__dirDelay) await new Promise((r) => setTimeout(r, window.__dirDelay));
      const node = nodeAt(root, path);
      for (const f of node.files ?? []) yield entryOf(f);
      for (const d of Object.keys(node.dirs ?? {})) yield mkDir(root, [...path, d]);
    },
  });
  window.__pickCalls = 0;
  window.__dirPicks = [];
  window.showOpenFilePicker = async () => {
    window.__pickCalls += 1;
    if (window.__pickCancel) throw new DOMException('cancelled', 'AbortError');
    return (window.__nextFiles ?? []).map(proxy);
  };
  window.showDirectoryPicker = async (options) => {
    window.__dirPicks.push(options);
    if (window.__dirCancel) throw new DOMException('cancelled', 'AbortError');
    return mkDir(window.__nextFolder, []);
  };
  if (localStorage.getItem('__noHandles') === '1') delete window.showOpenFilePicker;
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'pdfHandles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
    if (this.name === 'pdfFolders' && value && value.kind === 'directory') return origPut.call(this, { __fakeDir: value.__root, path: value.__path }, key);
    return origPut.call(this, value, key);
  };
  const resultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
  Object.defineProperty(IDBRequest.prototype, 'result', {
    get() {
      const value = resultGet.call(this);
      if (value && value.__fakeHandle) return proxy(value.__fakeHandle);
      if (value && value.__fakeDir) return mkDir(value.__fakeDir, value.path);
      return value;
    },
  });
});
await t.start();

const dlg = page.locator('.mep-modal');
const putPdf = (name) =>
  page.evaluate(
    async ([data, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + name).toString('base64'), name],
  );
const setTrees = (trees) => page.evaluate((v) => localStorage.setItem('__trees', JSON.stringify(v)), trees);
const files = (...names) => names.map((name) => ({ name }));
const nextFiles = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
const nextFolder = (name) => page.evaluate((n) => { window.__nextFolder = n; }, name);
const pickCalls = () => page.evaluate(() => window.__pickCalls);
const num = (k) => page.evaluate((key) => Number(localStorage.getItem(key) ?? '0'), k);
async function restart({ fperm = 'prompt', fans = 'granted', perm = 'prompt' } = {}) {
  await page.evaluate(
    (v) => {
      localStorage.setItem('__fperm', v[0]);
      localStorage.setItem('__fans', v[1]);
      localStorage.setItem('__perm', v[2]);
      localStorage.setItem('__reqAnswer', 'granted');
      localStorage.setItem('__reqCalls', '0');
      localStorage.setItem('__freqCalls', '0');
    },
    [fperm, fans, perm],
  );
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
}

const sheet = (id, levelId, f, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${f} ${pageIndex + 1}`, location: { fileName: f, sizeBytes: sizeOf(f) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const buildingJson = (id, sheets) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const threeJson = (id) => buildingJson(id, [sheet('s1', 'l1', A), sheet('s2', 'l1', B), sheet('s3', 'l1', C)]);
const oneJson = (id) => buildingJson(id, [sheet('s1', 'l1', A)]);
async function openBuilding(json) {
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(900);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(700);
}
async function closeDialog() {
  await page.keyboard.press('Escape').catch(() => {});
  await dlg.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 2000 }).catch(() => {});
  await idle(400);
}
const band = () => dlg.locator('[data-testid="reconnect-band"]');
const reconnectBtn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
const allowBtn = () => dlg.locator('[data-testid="allow-pdf-folder"]');
const reconnectMenu = () => dlg.locator('[data-testid="reconnect-menu"]');
const item = (id) => dlg.locator(`[data-testid="${id}"]`);
const hint = async () => ((await band().count()) === 0 ? null : (await dlg.locator('[data-testid="reconnect-hint"]').innerText()).trim());
const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 2000 }).catch(() => null)) ?? null)?.trim() ?? null;
const noticeIsError = async () => (await dlg.locator('[data-testid="sheets-notice"].mep-buildings-status--error').count()) === 1;
async function waitNotice(test, ms = 20000) {
  let text = null;
  for (let i = 0; i < ms / 300 && !(text !== null && test(text)); i++) {
    text = await notice();
    await page.waitForTimeout(300);
  }
  return text;
}
async function waitBandGone(ms = 8000) {
  for (let i = 0; i < ms / 250 && (await band().count()) !== 0; i++) await page.waitForTimeout(250);
  return (await band().count()) === 0;
}
const rowsSaying = (re) => dlg.locator('[data-testid="open-sheet"]', { hasText: re });
// the lines of a menu item: [label, help]
const lines = async (loc) => (await loc.innerText({ timeout: 2000 })).split('\n').map((s) => s.trim()).filter(Boolean);
const focused = (loc) => loc.evaluate((el) => el === document.activeElement).catch(() => false);
async function openMenu() {
  await reconnectBtn().click({ timeout: 3000 });
  await reconnectMenu().waitFor({ state: 'visible', timeout: 3000 });
}
async function scenario(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(false, `${name} ended with a script error`, String(e).split('\n')[0]);
  }
  await closeDialog();
}
// store the folder Plans for a building (first pick through the menu)
async function storeFolder(id) {
  await restart();
  await openBuilding(threeJson(id));
  await nextFolder('Plans');
  await openMenu();
  await item('pdf-folder-pick').click({ timeout: 3000 });
  await waitNotice((x) => x.startsWith('Found'));
  await closeDialog();
}

for (const f of [A, B, C]) await putPdf(f);
const ALL = { Plans: { files: files(A, B, C), dirs: {} } };
await setTrees(ALL);

// ---------- M1: no folder, 3 PDFs need a file: one button, a menu with 2 items, pick a folder ----------
await scenario('M1', async () => {
  await restart();
  await openBuilding(threeJson('m1'));
  check((await allowBtn().count()) === 0, 'M1 the button allow-pdf-folder does not exist');
  check(!(await dlg.innerText()).includes('Allow access'), 'M1 the text "Allow access" is nowhere in the dialog');
  check((await dlg.locator('[data-testid="reconnect-band"] button').count()) === 1, 'M1 the band has one button', String(await dlg.locator('[data-testid="reconnect-band"] button').count()));
  check(
    (await hint()) === '3 PDFs need a file before they open. Click Reconnect PDFs… to choose the folder or the files.',
    'M1 band hint',
    String(await hint()),
  );
  await shot('b6-t07-m1-band');
  await openMenu();
  check((await reconnectMenu().getAttribute('role')) === 'menu', 'M1 the menu has role menu');
  check((await reconnectMenu().locator('[role="menuitem"]').count()) === 2, 'M1 the menu has 2 items', String(await reconnectMenu().locator('[role="menuitem"]').count()));
  const l1 = await lines(item('pdf-folder-pick'));
  const l2 = await lines(item('pdf-files-pick'));
  check(l1[0] === 'Choose a folder…', 'M1 item 1 label', l1.join(' / '));
  check(l1[1] === 'The app finds the PDFs of this building in the folder and the folders inside it.', 'M1 item 1 help line', l1.join(' / '));
  check(l2[0] === 'Choose files…', 'M1 item 2 label', l2.join(' / '));
  check(l2[1] === 'Pick the PDF files yourself. Press Ctrl+A in the picker to pick all.', 'M1 item 2 help line', l2.join(' / '));
  check(await focused(item('pdf-folder-pick')), 'M1 focus is on item 1');
  await shot('b6-t07-m1-menu');
  await nextFolder('Plans');
  await item('pdf-folder-pick').click({ timeout: 3000 });
  check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 3 PDFs in Plans.', 'M1 notice after the folder pick', String(await notice()));
  check((await reconnectMenu().count()) === 0, 'M1 the menu is closed');
  check((await rowsSaying(/^Open$/).count()) === 3, 'M1 the rows say Open');
  check(await waitBandGone(), 'M1 the band is gone');
});

// ---------- M2: Choose files… ----------
await scenario('M2', async () => {
  await restart();
  await openBuilding(threeJson('m2'));
  await nextFiles([A, B, C]);
  await openMenu();
  await item('pdf-files-pick').click({ timeout: 3000 });
  check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 3 PDFs.', 'M2 notice after Choose files…', String(await notice()));
  check((await pickCalls()) === 1, 'M2 the file picker was called once', String(await pickCalls()));
  check((await reconnectMenu().count()) === 0, 'M2 the menu is closed');
  check((await rowsSaying(/^Open$/).count()) === 3, 'M2 the rows say Open');
});

// ---------- M3: keyboard ----------
await scenario('M3', async () => {
  await restart();
  await openBuilding(threeJson('m3'));
  await nextFiles([A, B, C]);
  await reconnectBtn().focus({ timeout: 3000 });
  await page.keyboard.press('Enter');
  await reconnectMenu().waitFor({ state: 'visible', timeout: 3000 });
  check(await focused(item('pdf-folder-pick')), 'M3 Enter opens the menu and focus is on item 1');
  await page.keyboard.press('ArrowDown');
  check(await focused(item('pdf-files-pick')), 'M3 ArrowDown moves to item 2');
  await page.keyboard.press('ArrowDown');
  check(await focused(item('pdf-folder-pick')), 'M3 ArrowDown again wraps to item 1');
  await page.keyboard.press('ArrowUp');
  check(await focused(item('pdf-files-pick')), 'M3 ArrowUp wraps to item 2');
  await page.keyboard.press('Escape');
  await idle(300);
  check((await reconnectMenu().count()) === 0, 'M3 Esc closes the menu');
  check(await focused(reconnectBtn()), 'M3 after Esc focus is on the button');
  check((await dlg.count()) === 1 && (await dlg.isVisible()), 'M3 after Esc the Manage Buildings dialog is still open');
  await page.keyboard.press('Enter');
  await reconnectMenu().waitFor({ state: 'visible', timeout: 3000 });
  await page.keyboard.press('Tab');
  await idle(300);
  check((await reconnectMenu().count()) === 0, 'M3 Tab closes the menu');
  await reconnectBtn().focus({ timeout: 3000 });
  await page.keyboard.press('Enter');
  await reconnectMenu().waitFor({ state: 'visible', timeout: 3000 });
  await dlg.locator('.mep-modal-title, .mep-modal-header').first().click({ timeout: 3000 });
  await idle(300);
  check((await reconnectMenu().count()) === 0, 'M3 a click outside the menu (on the dialog title) closes it');
  check((await dlg.count()) === 1, 'M3 the dialog is still open after the outside click');
  await reconnectBtn().focus({ timeout: 3000 });
  await page.keyboard.press('Enter');
  await reconnectMenu().waitFor({ state: 'visible', timeout: 3000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 3 PDFs.', 'M3 Enter on Choose files… runs it', String(await notice()));
  check((await pickCalls()) === 1, 'M3 Enter on Choose files… opens the file picker', String(await pickCalls()));
});

// ---------- M4: stored folder after a restart ----------
await scenario('M4', async () => {
  await storeFolder('m4');
  await restart({ fperm: 'prompt', perm: 'prompt' });
  await openBuilding(threeJson('m4'));
  check(
    (await hint()) === '3 PDFs are saved in this browser. Click Reconnect PDFs… and use the folder Plans to open them.',
    'M4 band hint',
    String(await hint()),
  );
  check((await allowBtn().count()) === 0, 'M4 no allow-pdf-folder button');
  await openMenu();
  check((await reconnectMenu().locator('[role="menuitem"]').count()) === 3, 'M4 the menu has 3 items', String(await reconnectMenu().locator('[role="menuitem"]').count()));
  const l1 = await lines(item('pdf-folder-use'));
  check(l1[0] === 'Use the folder Plans', 'M4 item 1 label', l1.join(' / '));
  check(l1[1] === 'The browser asks you once to allow access.', 'M4 item 1 help line', l1.join(' / '));
  const l2 = await lines(item('pdf-folder-pick'));
  check(l2[0] === 'Choose another folder…', 'M4 item 2 label', l2.join(' / '));
  check(l2[1] === 'The app uses it instead of Plans.', 'M4 item 2 help line', l2.join(' / '));
  const l3 = await lines(item('pdf-files-pick'));
  check(l3[0] === 'Choose files…', 'M4 item 3 label', l3.join(' / '));
  check(await focused(item('pdf-folder-use')), 'M4 focus is on item 1');
  await shot('b6-t07-m4-menu');
  await item('pdf-folder-use').click({ timeout: 3000 });
  check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 3 PDFs in Plans.', 'M4 notice after Use the folder', String(await notice()));
  check((await num('__freqCalls')) === 1, 'M4 the permission request was called once', String(await num('__freqCalls')));
  check((await rowsSaying(/^Open$/).count()) === 3, 'M4 the rows say Open');
});

// ---------- M5: folder granted, 2 of 3 PDFs are not in it ----------
await scenario('M5', async () => {
  await setTrees({ Plans: { files: files(A), dirs: {} } });
  await restart();
  await openBuilding(threeJson('m5'));
  await nextFolder('Plans');
  await openMenu();
  await item('pdf-folder-pick').click({ timeout: 3000 });
  await waitNotice((x) => x.startsWith('Found'));
  check(
    (await hint()) === '2 PDFs are not in the folder Plans. Click Reconnect PDFs… to choose the files or another folder.',
    'M5 band hint',
    String(await hint()),
  );
  await openMenu();
  check((await reconnectMenu().locator('[role="menuitem"]').count()) === 3, 'M5 the menu has 3 items', String(await reconnectMenu().locator('[role="menuitem"]').count()));
  const l1 = await lines(item('pdf-folder-use'));
  check(l1[0] === 'Look in Plans again', 'M5 item 1 label', l1.join(' / '));
  await setTrees(ALL);
});

// ---------- M6: busy while the scan runs ----------
// The delay is in the fake directory (window.__dirDelay). If the poll is flaky on a slow machine, raise the delay.
await scenario('M6', async () => {
  await setTrees(ALL);
  await restart();
  await openBuilding(threeJson('m6'));
  await nextFolder('Plans');
  await page.evaluate(() => { window.__dirDelay = 2500; });
  await openMenu();
  await item('pdf-folder-pick').click({ timeout: 3000 });
  let busyHint = null;
  for (let i = 0; i < 25 && busyHint === null; i++) {
    const h = await hint();
    if (h !== null && h.startsWith('Looking for PDFs')) busyHint = h;
    else await page.waitForTimeout(100);
  }
  check(busyHint === 'Looking for PDFs in Plans…', 'M6 the hint says Looking for PDFs in Plans…', String(busyHint));
  check(await reconnectBtn().isDisabled().catch(() => false), 'M6 the button is disabled while the scan runs');
  await shot('b6-t07-m6-busy');
  await waitNotice((x) => x.startsWith('Found'));
  await page.evaluate(() => { window.__dirDelay = 0; });
});

// ---------- M7: Firefox and Safari: no menu, the file picker at once ----------
await scenario('M7', async () => {
  await page.evaluate(() => localStorage.setItem('__noHandles', '1'));
  await restart();
  await openBuilding(oneJson('m7'));
  check((await hint()) === '1 PDF needs a file before it opens. Choose it again.', 'M7 band hint', String(await hint()));
  check((await allowBtn().count()) === 0, 'M7 no allow-pdf-folder button');
  const chooser = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
  await reconnectBtn().click({ timeout: 3000 });
  const fc = await chooser;
  check(fc !== null, 'M7 the file picker opens at once');
  check((await reconnectMenu().count()) === 0, 'M7 no reconnect-menu exists');
  const text = (await band().count()) === 0 ? '' : await band().innerText();
  check(!text.includes('Allow access') && !/folder/i.test(text), 'M7 the band has no "Allow access" and no folder word', text);
  if (fc !== null) await fc.setFiles(FIX + A);
  await page.evaluate(() => localStorage.removeItem('__noHandles'));
});

// ---------- M8: layout at 3 widths ----------
await scenario('M8', async () => {
  await restart();
  await openBuilding(threeJson('m8'));
  for (const w of [1600, 1100, 760]) {
    await page.setViewportSize({ width: w, height: 900 });
    await idle(500);
    const bandBefore = await band().boundingBox();
    await openMenu();
    await idle(300);
    const menuBox = await reconnectMenu().boundingBox();
    const modalBox = await dlg.boundingBox();
    const bandAfter = await band().boundingBox();
    const inside = menuBox !== null && modalBox !== null && menuBox.x >= modalBox.x - 0.5 && menuBox.y >= modalBox.y - 0.5 && menuBox.x + menuBox.width <= modalBox.x + modalBox.width + 0.5 && menuBox.y + menuBox.height <= modalBox.y + modalBox.height + 0.5;
    check(inside, `M8 at ${w} px the menu is inside the dialog`, JSON.stringify([menuBox, modalBox]));
    check(bandBefore !== null && bandAfter !== null && Math.abs(bandBefore.height - bandAfter.height) < 1, `M8 at ${w} px the band keeps its height when the menu opens`, JSON.stringify([bandBefore?.height, bandAfter?.height]));
    await shot(`b6-t07-menu-${w}`);
    await page.keyboard.press('Escape');
    await idle(300);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
});

// ---------- M9: changed notices ----------
await scenario('M9a', async () => {
  await setTrees(ALL);
  await storeFolder('m9a');
  await restart({ fperm: 'prompt', fans: 'denied' });
  await openBuilding(threeJson('m9a'));
  await openMenu();
  await item('pdf-folder-use').click({ timeout: 3000 });
  check(
    (await waitNotice((x) => x.startsWith('Access'))) === 'Access was not allowed. Click Reconnect PDFs… and choose the files, or change the site setting in the browser.',
    'M9 denied notice',
    String(await notice()),
  );
  check(await noticeIsError(), 'M9 denied notice has the error style');
});
await scenario('M9b', async () => {
  await setTrees(ALL);
  await storeFolder('m9b');
  await setTrees({});
  await restart({ fperm: 'prompt' });
  await openBuilding(threeJson('m9b'));
  await openMenu();
  await item('pdf-folder-use').click({ timeout: 3000 });
  check(
    (await waitNotice((x) => x.startsWith('The folder'))) === 'The folder Plans is not there any more. Click Reconnect PDFs… and choose the folder again.',
    'M9 folder gone notice',
    String(await notice()),
  );
  check(await noticeIsError(), 'M9 folder gone notice has the error style');
});

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
