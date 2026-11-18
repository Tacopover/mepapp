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

const putAs = (name, src) =>
  page.evaluate(
    async ([data, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + src).toString('base64'), name],
  );
const mk = (n, long) => Array.from({ length: n }, (_, i) => (long ? `plan-${String(i).padStart(2, '0')}-` + 'x'.repeat(70) : `plan-${i + 1}`) + '.pdf');
const bigJson = (id, names) => buildingJson(id, names.map((f, i) => ({ id: 's' + i, levelId: 'l1', projectUuid: null, pageIndex: 0, displayName: f, location: { fileName: f, sizeBytes: sizeOf(A) } })));
const clicks = { n: 0 };
const rec = async (loc, what) => { clicks.n++; console.log('CLICK', clicks.n, what); await loc.click({ timeout: 4000 }); };
const box = async (loc) => loc.boundingBox();
const nine = mk(9, false), thirty = mk(30, true);
await putAs(A, A);
await setTrees({ Plans: { files: [...nine, ...thirty, ...mk(30,false)].map((name) => ({ name, src: A })), dirs: {} } });

const load = async (id, w) => { await page.setViewportSize({ width: w, height: 900 }); await restart(); await page.evaluate((j) => window.__mepBuilding.load(j), bigJson(id, nine)); await idle(600); await menu('Manage Buildings…'); await dlg.waitFor({ state: 'visible', timeout: 8000 }); await idle(900); };
await scenario('cancel', async () => {
  await load('c1', 1100);
  await page.evaluate(() => { window.__dirCancel = true; });
  await openMenu(); await item('pdf-folder-pick').click();
  await page.waitForTimeout(600);
  console.log('cancel: hint', await hint(), '| notice', await notice(), '| menu', await reconnectMenu().count(), '| enabled', await reconnectBtn().isEnabled(), '| focus on btn', await focused(reconnectBtn()));
  await shot('b6-t07-j-cancel');
  await page.evaluate(() => { window.__dirCancel = false; });
  await openMenu(); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await idle(300);
  console.log('after 2x Esc dialog count', await dlg.count());
});
await scenario('ff', async () => {
  await page.evaluate(() => localStorage.setItem('__noHandles', '1'));
  await load('f1', 760);
  console.log('ff hint:', await hint(), '| title:', await reconnectBtn().getAttribute('title'), '| aria:', await reconnectBtn().getAttribute('aria-label'));
  await shot('b6-t07-j-ff-760');
  const ch = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
  await reconnectBtn().focus(); await page.keyboard.press('Enter');
  const fc = await ch; console.log('ff chooser', !!fc, 'multiple', fc && fc.isMultiple());
  if (fc) await fc.setFiles(nine.map((n) => FIX + A));
  console.log('ff notice', await waitNotice(() => true, 5000), 'band', await band().count());
  await shot('b6-t07-j-ff-done');
  await page.evaluate(() => localStorage.removeItem('__noHandles'));
});
await scenario('tip', async () => {
  await load('t1', 1100);
  console.log('title', await reconnectBtn().getAttribute('title'), '| aria', await reconnectBtn().getAttribute('aria-label'), '| expanded', await reconnectBtn().getAttribute('aria-expanded'), '| haspopup', await reconnectBtn().getAttribute('aria-haspopup'));
});
console.log('errors', errors);
t.finish();
