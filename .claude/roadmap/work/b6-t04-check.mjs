// B6-T04: one folder permission for the PDFs of a building. Real clicks. The browser store is the real IndexedDB store (mepapp.webLike: no devPlatform);
// the building is loaded with the dev hook window.__mepBuilding.load only. The pickers and the permissions are fake:
//   - the folder picker returns a fake directory handle over a tree in localStorage (__trees); the files of the tree are OPFS files (src) with an own name and time stamp;
//   - fake file and folder handles are saved in IndexedDB as { __fakeHandle } / { __fakeDir, path } and given back as the same fake;
//   - queryPermission and requestPermission read localStorage (files: __perm, __reqAnswer, __reqCalls; folder: __fperm, __fans, __freqCalls), so a page reload keeps them.
// A reload is the restart: the tab memory (SheetFileCache) is empty, IndexedDB stays.
// Playwright cannot show a real permission prompt, "Allow on every visit", or a restart with a real profile.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';
const D = 'plan_d.pdf'; // the bytes of A under another name
const SRC = { [A]: A, [B]: B, [C]: C, [D]: A };
const sizeOf = (f) => readFileSync(FIX + SRC[f]).length;

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
    [readFileSync(FIX + SRC[name]).toString('base64'), name],
  );
const setTrees = (trees) => page.evaluate((v) => localStorage.setItem('__trees', JSON.stringify(v)), trees);
const files = (...names) => names.map((name) => ({ name }));
const nextFolder = (name) => page.evaluate((n) => { window.__nextFolder = n; }, name);
const dirCancel = (on) => page.evaluate((v) => { window.__dirCancel = v; }, on);
const cancelPick = (on) => page.evaluate((v) => { window.__pickCancel = v; }, on);
const pickCalls = () => page.evaluate(() => window.__pickCalls);
const dirPicks = () => page.evaluate(() => window.__dirPicks);
const num = (k) => page.evaluate((key) => Number(localStorage.getItem(key) ?? '0'), k);
const reqCalls = () => num('__reqCalls');
const freqCalls = () => num('__freqCalls');
const idbKeys = (storeName) =>
  page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('mepapp-buildings');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction(name).objectStore(name).getAllKeys();
          q.onsuccess = () => {
            const keys = q.result.map((k) => (Array.isArray(k) ? k.join('|') : String(k)));
            db.close();
            resolve(keys.sort());
          };
          q.onerror = () => reject(q.error);
        };
      }),
    storeName,
  );
async function restart({ fperm = 'prompt', fans = 'granted', perm = 'prompt', ans = 'granted' } = {}) {
  await page.evaluate(
    (v) => {
      localStorage.setItem('__fperm', v[0]);
      localStorage.setItem('__fans', v[1]);
      localStorage.setItem('__perm', v[2]);
      localStorage.setItem('__reqAnswer', v[3]);
      localStorage.setItem('__reqCalls', '0');
      localStorage.setItem('__freqCalls', '0');
    },
    [fperm, fans, perm, ans],
  );
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
}

const sheet = (id, levelId, f, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${f} ${pageIndex + 1}`, location: { fileName: f, sizeBytes: sizeOf(f) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const buildingJson = (id, sheets) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const four = (id) => buildingJson(id, [sheet('s1', 'l1', A), sheet('s2', 'l1', B), sheet('s3', 'l1', C), sheet('s4', 'l1', D)]);
async function openBuilding(json, select = true) {
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(900);
  if (select) await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(700);
}
async function closeDialog() {
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(400);
}
const openBtn = (f) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${f}"]`);
const chooseBtn = (f) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Choose file for ${f}"]`);
const band = () => dlg.locator('[data-testid="reconnect-band"]');
const allowBtn = () => dlg.locator('[data-testid="allow-pdf-folder"]');
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

for (const f of [A, B, C, D]) await putPdf(f);
const ALL = { Plans: { files: files(A, B, C, D), dirs: {} } };
await setTrees(ALL);

// ---------- S1: first pick stores the folder; the app finds all four PDFs ----------
await openBuilding(four('b1'));
check((await band().count()) === 1, 'S1 the band shows (4 PDFs need a file)');
check((await allowBtn().count()) === 1, 'S1 the button "Allow access to the PDF folder…" shows in a browser that keeps handles');
check((await allowBtn().innerText()).trim() === 'Allow access to the PDF folder…', 'S1 the label has the ellipsis (a picker opens)');
check((await allowBtn().getAttribute('aria-label')) === 'Allow access to the PDF folder', 'S1 aria-label of the button');
check((await allowBtn().getAttribute('title')) === 'Choose the folder with the PDFs of this building. The app finds the sheets in it by file name and size. The app only reads the files.', 'S1 tooltip of the button');
check((await hint()) === '4 PDFs need a file before they open. Choose the files, or allow access to the PDF folder once.', 'S1 band hint (T-A)', String(await hint()));
check((await dlg.locator('[data-testid="reconnect-band"] button').allInnerTexts()).join('|') === 'Allow access to the PDF folder…|Reconnect PDFs…', 'S1 order of the buttons: Allow first, Reconnect second');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Choose file…$/ }).count()) === 4, 'S1 four rows say Choose file…');
check((await idbKeys('pdfFolders')).length === 0, 'S1 no folder is stored before the pick');
await shot('b6-t04-01-band-first-start');
await nextFolder('Plans');
await allowBtn().click();
check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 4 PDFs in Plans.', 'S1 notice after the pick', String(await notice()));
check(!(await noticeIsError()), 'S1 notice is not an error');
check((await dirPicks()).length === 1, 'S1 the folder picker opened once');
check(JSON.stringify((await dirPicks())[0]) === JSON.stringify({ id: 'mepapp-building-pdfs', mode: 'read' }), 'S1 picker id is mepapp-building-pdfs and mode read (not the stamp library id)', JSON.stringify((await dirPicks())[0]));
check(await waitBandGone(), 'S1 the band is gone');
check(JSON.stringify(await idbKeys('pdfFolders')) === JSON.stringify(['b1']), 'S1 the folder of building b1 is stored', (await idbKeys('pdfFolders')).join(','));
check((await idbKeys('pdfHandles')).length === 4, 'S1 the single handles of the found files are stored too', String((await idbKeys('pdfHandles')).length));
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) === 4, 'S1 four rows say Open');
check((await pickCalls()) === 0, 'S1 no file picker opened');
await closeDialog();

// ---------- S2: restart; one click on the band asks the folder once; then all rows open ----------
await restart();
await openBuilding(four('b1'));
check((await hint()) === '4 PDFs are saved in this browser. Allow access to the folder Plans once to open them.', 'S2 band hint (T-C)', String(await hint()));
check((await allowBtn().innerText()).trim() === 'Allow access to the PDF folder', 'S2 label has no ellipsis (no picker)');
check((await allowBtn().getAttribute('title')) === 'The app opens the PDFs of this building from the folder Plans. The browser asks you once. The app only reads the files.', 'S2 tooltip names the folder');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) === 4, 'S2 the rows say Open at once');
check((await freqCalls()) === 0 && (await reqCalls()) === 0, 'S2 no question before a click');
await shot('b6-t04-02-after-restart');
await allowBtn().click();
check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 4 PDFs in Plans.', 'S2 notice after the click', String(await notice()));
check((await freqCalls()) === 1, 'S2 one folder question', String(await freqCalls()));
check((await dirPicks()).length === 0, 'S2 no folder picker opened (the stored folder is used)');
check(await waitBandGone(), 'S2 the band is gone');
await openBtn(A).first().click();
check(((await waitNotice((x) => x.startsWith('Opened '))) ?? '').startsWith(`Opened ${A} 1`), 'S2 first sheet opens', String(await notice()));
await idle(2500);
await openBtn(B).first().click();
await idle(1500);
check(((await waitNotice((x) => x.includes(B))) ?? '').startsWith('Opened '), 'S2 second sheet opens', String(await notice()));
check((await freqCalls()) === 1 && (await reqCalls()) === 0, 'S2 no more questions: folder 1, files 0', `${await freqCalls()}/${await reqCalls()}`);
check((await pickCalls()) === 0, 'S2 no file picker opened');
check((await dlg.count()) === 1, 'S2 the dialog stays open');
await closeDialog();

// ---------- S3: restart; a click on a row asks the folder once, not the file ----------
await restart();
await openBuilding(four('b1'));
await openBtn(C).first().click();
const s3 = await waitNotice((x) => x.startsWith('Opened '));
check((s3 ?? '').startsWith(`Opened ${C} 1 in the viewer.`) && (s3 ?? '').includes('Found all 4 PDFs in Plans.'), 'S3 the sheet opens and the notice has the folder result', String(s3));
check((await freqCalls()) === 1 && (await reqCalls()) === 0, 'S3 the folder is asked once; the single file is not asked', `${await freqCalls()}/${await reqCalls()}`);
check(await waitBandGone(), 'S3 the band is gone');
await openBtn(A).first().click();
await idle(1500);
check((await freqCalls()) === 1, 'S3 the next row asks nothing', String(await freqCalls()));
await closeDialog();

// ---------- S4: some files are not in the folder (depth 3 yes, depth 4 no); a new building ----------
await setTrees({
  Plans: {
    files: files(A, B),
    dirs: { x: { dirs: { y: { dirs: { z: { files: files(C) } } } } }, d1: { dirs: { d2: { dirs: { d3: { dirs: { d4: { files: files(D) } } } } } } } },
  },
});
await restart();
await openBuilding(four('b3'));
check((await hint()) === '4 PDFs need a file before they open. Choose the files, or allow access to the PDF folder once.', 'S4 new building: T-A');
await nextFolder('Plans');
await allowBtn().click();
const s4 = await waitNotice((x) => x.startsWith('Found'));
check(s4 === `Found 3 of 4 PDFs in Plans. Missing: ${D}.`, 'S4 a file 3 levels deep is found, a file 4 levels deep is missing', String(s4));
check(!(await noticeIsError()), 'S4 partial notice is not an error');
check((await hint()) === '1 PDF is not in the folder Plans. Choose the file, or allow access to another folder.', 'S4 band hint (T-E)', String(await hint()));
check((await allowBtn().innerText()).trim() === 'Allow access to the PDF folder…', 'S4 T-E label has the ellipsis (picks another folder)');
check((await allowBtn().getAttribute('title')) === 'Choose another folder. The app uses it instead of Plans.', 'S4 T-E tooltip');
check((await chooseBtn(D).count()) === 1 && (await openBtn(C).count()) === 1 && (await openBtn(A).count()) === 1, 'S4 found rows say Open, the missing row says Choose file…');
await shot('b6-t04-03-partial');
await closeDialog();
await restart();
await openBuilding(four('b3'));
check((await hint()) === '3 PDFs are saved in this browser. Allow access to the folder Plans once to open them. 1 PDF needs a file before it opens.', 'S4 restart: T-C with the sentence for the missing PDF', String(await hint()));
await closeDialog();

// ---------- S5: the user blocks the question ----------
await setTrees(ALL);
await restart({ fans: 'denied', ans: 'granted' });
await openBuilding(four('b1'));
await allowBtn().click();
check((await waitNotice((x) => x.startsWith('Access'))) === 'Access was not allowed. Click Allow access to try again, or choose the files.', 'S5 denied notice', String(await notice()));
check(await noticeIsError(), 'S5 denied notice has the error style');
check((await band().count()) === 1, 'S5 the band stays');
check((await idbKeys('pdfHandles')).filter((k) => k.startsWith('b1|')).length === 4, 'S5 the saved handles are kept');
check((await idbKeys('pdfFolders')).includes('b1'), 'S5 the folder is kept');
await page.setViewportSize({ width: 760, height: 900 });
await idle(500);
{
  const boxOf = (loc) => loc.boundingBox();
  const modal = await boxOf(dlg);
  const n = await boxOf(dlg.locator('[data-testid="sheets-notice"]').first());
  const a = await boxOf(allowBtn());
  const r = await boxOf(dlg.locator('[data-testid="reconnect-pdfs"]'));
  const inside = (b) => b !== null && b.x >= 0 && b.x + b.width <= 760 && b.y >= 0 && b.y + b.height <= 900;
  check(inside(n), 'S5 at 760 px the notice is inside the window', JSON.stringify(n));
  check(inside(a) && inside(r) && a.x + a.width <= (modal?.x ?? 0) + (modal?.width ?? 0), 'S5 at 760 px the two buttons are inside the dialog', JSON.stringify([a, r]));
  check(r.y >= a.y && Math.abs(a.x - (await boxOf(dlg.locator('[data-testid="reconnect-hint"]'))).x) < 2, 'S5 at 760 px the buttons are left aligned under the hint', JSON.stringify([a.x, r.y]));
}
await shot('b6-t04-04-denied-760');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
// a click on a row after the denial: no second question; the file picker is the fallback
await cancelPick(true);
await openBtn(B).first().click();
const s5 = await waitNotice((x) => x.startsWith('Access'));
check(s5 === 'Access was not allowed. Click Allow access to try again, or choose the files.' && (await noticeIsError()), 'S5 row Open after a denial tells the denial', String(s5));
check((await reqCalls()) === 0 && (await pickCalls()) === 1, 'S5 no second question; the file picker opened once', String(await reqCalls()) + '/' + String(await pickCalls()));
await cancelPick(false);
await closeDialog();

// ---------- S6: the folder is gone ----------
await setTrees({});
await restart();
await openBuilding(four('b1'));
await allowBtn().click();
check((await waitNotice((x) => x.startsWith('The folder'))) === 'The folder Plans is not there any more. Allow access to the PDF folder again.', 'S6 folder gone notice', String(await notice()));
check(await noticeIsError(), 'S6 folder gone notice has the error style');
check(!(await idbKeys('pdfFolders')).includes('b1'), 'S6 the folder handle is deleted');
check((await hint()) === '4 PDFs are saved in this browser. Allow access to their folder once to open them all.', 'S6 band hint (T-B)', String(await hint()));
check((await allowBtn().innerText()).trim() === 'Allow access to the PDF folder…', 'S6 the label has the ellipsis again');
// the user picks a folder again
await setTrees(ALL);
await nextFolder('Plans');
await allowBtn().click();
check((await waitNotice((x) => x.startsWith('Found'))) === 'Found all 4 PDFs in Plans.', 'S6 a new pick replaces the folder', String(await notice()));
check((await idbKeys('pdfFolders')).includes('b1'), 'S6 the new folder is stored');
await closeDialog();

// ---------- S7: the folder is readable after the restart (Allow on every visit): no band, no question ----------
await restart({ fperm: 'granted', perm: 'granted' });
await openBuilding(four('b1'));
await idle(1200);
check((await band().count()) === 0, 'S7 granted folder: no band');
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) === 4, 'S7 rows say Open');
await openBtn(D).first().click();
check(((await waitNotice((x) => x.startsWith('Opened '))) ?? '').startsWith(`Opened ${D} 1`), 'S7 the sheet opens');
check((await freqCalls()) === 0 && (await reqCalls()) === 0 && (await pickCalls()) === 0, 'S7 no question and no picker');
await closeDialog();

// ---------- S8: saved files only (no folder): T-B, and the pick of a cancel does nothing ----------
await page.evaluate(() => indexedDB.deleteDatabase('mepapp-buildings-none')).catch(() => {});
await restart();
await openBuilding(four('b7'), true);
check((await hint()) === '4 PDFs need a file before they open. Choose the files, or allow access to the PDF folder once.', 'S8 building with nothing saved: T-A');
await dirCancel(true);
await allowBtn().click();
await idle(800);
check((await notice()) === null, 'S8 cancel in the folder picker: no message');
check((await idbKeys('pdfFolders')).includes('b1') && !(await idbKeys('pdfFolders')).includes('b7'), 'S8 cancel stores no folder');
await dirCancel(false);
await closeDialog();

// ---------- S9: a browser that cannot keep handles shows the T01 screen ----------
await page.evaluate(() => localStorage.setItem('__noHandles', '1'));
await restart();
await openBuilding(four('b8'));
check((await band().count()) === 1, 'S9 the T01 band shows');
check((await allowBtn().count()) === 0, 'S9 no folder button without handle support');
check((await hint()) === '4 PDFs need a file before they open. Choose them all in one step.', 'S9 T01 hint', String(await hint()));
check((await dlg.locator('[data-testid="reconnect-band"] button').allInnerTexts()).join('|') === 'Reconnect PDFs…', 'S9 only the Reconnect button');
await shot('b6-t04-05-no-handles');
await closeDialog();
await page.evaluate(() => localStorage.removeItem('__noHandles'));

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
