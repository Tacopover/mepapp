// B6-T06: a PDF changed in another viewer (new size, same name). Real clicks on the real dialog. The browser store is the real IndexedDB store
// (mepapp.webLike: no devPlatform); the building is loaded with the dev hook window.__mepBuilding.load only. The pickers and the permissions are fake:
//   - the file picker returns fake file handles over OPFS files (window.__nextFiles = names); a changed file = the same bytes with a few bytes appended;
//   - the folder picker returns a fake directory handle over a tree in localStorage (__trees); the files of the tree are OPFS files (src) with an own name;
//   - fake file and folder handles are saved in IndexedDB as { __fakeHandle } / { __fakeDir, path } and given back as the same fake;
//   - queryPermission and requestPermission read localStorage, so a page reload keeps them.
// A reload is the restart: the tab memory (SheetFileCache) is empty, IndexedDB stays.
// Playwright cannot show a real viewer that saves a file, a real permission prompt, or a file lock of another program.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';
const PLAN = 'plan.pdf'; // the bytes of A under another name
const SRC = { [A]: A, [B]: B, [C]: C, [PLAN]: A };
const sizeOf = (f) => readFileSync(FIX + SRC[f]).length;
const EDIT = '\n% edited\n';

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
// OPFS file `name` = the bytes of the fixture `src` plus `extra` (a changed file when extra is not empty)
const putFile = (name, src, extra = '') =>
  page.evaluate(
    async ([data, n, more]) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const tail = new TextEncoder().encode(more);
      const all = new Uint8Array(bytes.length + tail.length);
      all.set(bytes, 0);
      all.set(tail, bytes.length);
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(all);
      await w.close();
    },
    [readFileSync(FIX + src).toString('base64'), name, extra],
  );
const putPdf = (name, extra = '') => putFile(name, SRC[name], extra);
const setTrees = (trees) => page.evaluate((v) => localStorage.setItem('__trees', JSON.stringify(v)), trees);
const files = (...names) => names.map((name) => ({ name }));
const nextFiles = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
const nextFolder = (name) => page.evaluate((n) => { window.__nextFolder = n; }, name);
const pickCalls = () => page.evaluate(() => window.__pickCalls);
const docCount = () => page.evaluate(() => window.__mepSketchScene.getDocuments().length);
const docCountIs = async (n) => { for (let i = 0; i < 40; i++) { if ((await docCount()) === n) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
const buildingFile = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const sizesInBuilding = async () => (await buildingFile()).sheets.map((s) => s.location.sizeBytes);
async function restart({ fperm = 'prompt', perm = 'prompt' } = {}) {
  await page.evaluate(
    (v) => {
      localStorage.setItem('__fperm', v[0]);
      localStorage.setItem('__fans', 'granted');
      localStorage.setItem('__perm', v[1]);
      localStorage.setItem('__reqAnswer', 'granted');
      localStorage.setItem('__reqCalls', '0');
      localStorage.setItem('__freqCalls', '0');
    },
    [fperm, perm],
  );
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
}

const sheet = (id, levelId, f, pageIndex = 0, displayName = `${f} ${pageIndex + 1}`) => ({ id, levelId, projectUuid: null, pageIndex, displayName, location: { fileName: f, sizeBytes: sizeOf(f) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const buildingJson = (id, sheets) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const planJson = (id) => buildingJson(id, [sheet('s1', 'l1', PLAN, 0, `${PLAN} L1`), sheet('s2', 'l2', PLAN, 0, `${PLAN} L2`)]);
const threeJson = (id) => buildingJson(id, [sheet('s1', 'l1', A), sheet('s2', 'l1', B), sheet('s3', 'l1', C)]);
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
  await dlg.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await idle(400);
}
const openBtn = (label) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${label}"]`);
const chooseBtn = (label) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Choose file for ${label}"]`);
const rowsSaying = (re) => dlg.locator('[data-testid="open-sheet"]', { hasText: re });
const reconnectBtn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
const allowBtn = () => dlg.locator('[data-testid="allow-pdf-folder"]');
const promptEl = () => dlg.locator('[data-testid="changed-confirm"]');
const yesBtn = () => dlg.locator('[data-testid="changed-confirm-yes"]');
const cancelBtn = () => dlg.locator('[data-testid="changed-confirm-cancel"]');
async function promptText(ms = 6000) {
  for (let i = 0; i < ms / 250 && (await promptEl().count()) === 0; i++) await page.waitForTimeout(250);
  return (await promptEl().count()) === 0 ? null : (await promptEl().first().innerText()).trim();
}
async function promptGone(ms = 4000) {
  for (let i = 0; i < ms / 250 && (await promptEl().count()) !== 0; i++) await page.waitForTimeout(250);
  return (await promptEl().count()) === 0;
}
const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 2000 }).catch(() => null)) ?? null)?.trim() ?? null;
async function waitNotice(test, ms = 20000) {
  let text = null;
  for (let i = 0; i < ms / 300 && !(text !== null && test(text)); i++) {
    text = await notice();
    await page.waitForTimeout(300);
  }
  return text;
}
async function scenario(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(false, `${name} ended with a script error`, String(e).split('\n')[0]);
  }
  await closeDialog();
}

// ---------- S1: row, picker path: prompt, Cancel, prompt again, Use new file ----------
await scenario('S1', async () => {
  await restart();
  await putPdf(PLAN, EDIT);
  const changedSize = sizeOf(PLAN) + EDIT.length;
  await openBuilding(planJson('b1'));
  await nextFiles([PLAN]);
  const docs0 = await docCount();
  await chooseBtn(PLAN).first().click();
  const p1 = await promptText();
  check(p1 === 'plan.pdf changed. Use the new file for 2 sheets?', 'S1 prompt text', String(p1));
  await shot('b6-t06-s1-prompt');
  check((await docCount()) === docs0, 'S1 the sheet did not open yet');
  check((await sizesInBuilding()).every((s) => s === sizeOf(PLAN)), 'S1 the building file still has the old size');
  await cancelBtn().click({ timeout: 3000 });
  check(await promptGone(), 'S1 Cancel removes the prompt');
  check((await docCount()) === docs0, 'S1 after Cancel the sheet is not open');
  check((await sizesInBuilding()).every((s) => s === sizeOf(PLAN)), 'S1 after Cancel the building file is unchanged');
  check((await rowsSaying(/^Choose file…$/).count()) === 2, 'S1 after Cancel the rows still say Choose file…');
  await chooseBtn(PLAN).first().click();
  const p2 = await promptText();
  check(p2 === 'plan.pdf changed. Use the new file for 2 sheets?', 'S1 second prompt text', String(p2));
  await yesBtn().click({ timeout: 3000 });
  const n = await waitNotice((x) => x.includes('Using the new'));
  check((n ?? '').includes('Using the new plan.pdf for 2 sheets.'), 'S1 notice after Use new file', String(n));
  check((n ?? '').startsWith('Opened '), 'S1 the sheet opens (notice starts with Opened)', String(n));
  check((await rowsSaying(/^Open(ed)?$/).count()) === 2, 'S1 both rows say Open or Opened', JSON.stringify(await dlg.locator('[data-testid="open-sheet"]').allInnerTexts()));
  check((await sizesInBuilding()).every((s) => s === changedSize), 'S1 both sheets have the new size in the building file', JSON.stringify(await sizesInBuilding()));
});

// ---------- S2: stored handle: the prompt shows, no picker; after a restart the row opens with no prompt ----------
await scenario('S2', async () => {
  await restart();
  await putPdf(PLAN);
  await openBuilding(planJson('b2'));
  await nextFiles([PLAN]);
  await chooseBtn(PLAN).first().click();
  await waitNotice((x) => x.startsWith('Opened '));
  await closeDialog();
  await restart({ perm: 'granted' });
  await putPdf(PLAN, EDIT);
  await openBuilding(planJson('b2'));
  const docs0 = await docCount();
  await openBtn(PLAN).first().click({ timeout: 5000 });
  const p = await promptText();
  check(p === 'plan.pdf changed. Use the new file for 2 sheets?', 'S2 the prompt shows for the stored handle', String(p));
  check((await pickCalls()) === 0, 'S2 no file picker call before the prompt', String(await pickCalls()));
  await yesBtn().click({ timeout: 3000 });
  check(((await waitNotice((x) => x.startsWith('Opened '))) ?? '').startsWith('Opened '), 'S2 the sheet opens after Use new file', String(await notice()));
  check((await docCount()) >= Math.max(1, docs0), 'S2 one document is open');
  check((await pickCalls()) === 0, 'S2 no file picker call after Use new file', String(await pickCalls()));
  const json = JSON.stringify(await buildingFile());
  await closeDialog();
  await restart({ perm: 'granted' });
  await openBuilding(json);
  check((await rowsSaying(/^Open$/).count()) === 2, 'S2 after the restart the rows say Open');
  await openBtn(PLAN).first().click({ timeout: 5000 });
  check(((await waitNotice((x) => x.startsWith('Opened '))) ?? '').startsWith('Opened '), 'S2 after the restart the sheet opens', String(await notice()));
  check((await promptEl().count()) === 0, 'S2 after the restart no prompt');
  check((await pickCalls()) === 0, 'S2 after the restart no picker call');
});

// ---------- S3: Reconnect with files: one prompt for 2 changed PDFs; Use, then (second run) Cancel ----------
await scenario('S3', async () => {
  await restart();
  await putPdf(A, EDIT);
  await putPdf(B, EDIT);
  await putPdf(C);
  await openBuilding(threeJson('b3'));
  await nextFiles([A, B, C]);
  await reconnectBtn().click({ timeout: 5000 });
  const p = await promptText();
  check(/^2 PDFs changed: .*Use the new files for 2 sheets\?$/s.test(p ?? ''), 'S3 prompt text', String(p));
  check((p ?? '').includes(A) && (p ?? '').includes(B), 'S3 the prompt names the 2 changed PDFs', String(p));
  await shot('b6-t06-s3-prompt');
  check((await yesBtn().innerText({ timeout: 2000 }).catch(() => '')).trim() === 'Use new files', 'S3 the button says Use new files');
  await yesBtn().click({ timeout: 3000 });
  const n = await waitNotice((x) => x.includes('Using the new files'));
  check((n ?? '').includes('Using the new files for 2 PDFs (2 sheets).'), 'S3 notice after Use new files', String(n));
  check((await rowsSaying(/^Open$/).count()) === 3, 'S3 all rows say Open');
  // second run: Cancel
  await closeDialog();
  await restart();
  await openBuilding(threeJson('b3'));
  await nextFiles([A, B, C]);
  await reconnectBtn().click({ timeout: 5000 });
  const p2 = await promptText();
  check((p2 ?? '').startsWith('2 PDFs changed: '), 'S3 run 2: the prompt shows', String(p2));
  await cancelBtn().click({ timeout: 3000 });
  const n2 = await waitNotice((x) => x.includes('changed and were not used'));
  check((n2 ?? '').includes('2 PDFs changed and were not used:'), 'S3 run 2: notice after Cancel', String(n2));
  check((await sizesInBuilding()).join() === [sizeOf(A), sizeOf(B), sizeOf(C)].join(), 'S3 run 2: the building file is unchanged', JSON.stringify(await sizesInBuilding()));
});

// ---------- S4: folder scan: the prompt names only the changed PDFs ----------
await scenario('S4', async () => {
  await restart();
  await putPdf(A, EDIT);
  await putPdf(B, EDIT);
  await putPdf(C);
  await putFile('orig_a.pdf', A);
  await setTrees({ Plans: { files: [...files(A, B, C), { name: 'copy_of_a.pdf', src: 'orig_a.pdf' }], dirs: {} } });
  await openBuilding(threeJson('b4'));
  await nextFolder('Plans');
  await allowBtn().click({ timeout: 5000 });
  const p = await promptText();
  check((p ?? '').startsWith('2 PDFs changed: ') && (p ?? '').includes(A) && (p ?? '').includes(B), 'S4 the prompt names the changed PDFs', String(p));
  check(!(p ?? '').includes(C) && !(p ?? '').includes('copy_of_a.pdf'), 'S4 the prompt does not name the unchanged PDF or the old copy', String(p));
  await shot('b6-t06-s4-prompt');
  await yesBtn().click({ timeout: 3000 });
  const n = await waitNotice((x) => x.includes('Using the new files'));
  check((n ?? '').includes('Using the new files'), 'S4 notice after Use new files', String(n));
  check((await sizesInBuilding()).join() === [sizeOf(A) + EDIT.length, sizeOf(B) + EDIT.length, sizeOf(C)].join(), 'S4 the changed sheets have the new size', JSON.stringify(await sizesInBuilding()));
});

// ---------- S5: two changed candidates in the folder: no prompt ----------
await scenario('S5', async () => {
  await restart();
  await putFile('a_v1.pdf', A, '\n% v1\n');
  await putFile('a_v2.pdf', A, '\n% version two\n');
  await setTrees({ Plans: { files: [], dirs: { d1: { files: [{ name: A, src: 'a_v1.pdf' }] }, d2: { files: [{ name: A, src: 'a_v2.pdf' }] } } } });
  await openBuilding(buildingJson('b5', [sheet('s1', 'l1', A)]));
  await nextFolder('Plans');
  await allowBtn().click({ timeout: 5000 });
  const n = await waitNotice((x) => x.includes('two different files') || x.startsWith('Found') || x.startsWith('No '), 15000);
  check((n ?? '').includes('has two different files with another size'), 'S5 notice for two changed candidates', String(n));
  check((await promptEl().count()) === 0, 'S5 no prompt');
});

// ---------- S6: the new file has fewer pages ----------
await scenario('S6', async () => {
  await restart();
  await putPdf(C, EDIT);
  await openBuilding(buildingJson('b6', [sheet('s1', 'l1', C, 0), sheet('s2', 'l1', C, 3)]));
  await nextFiles([C]);
  const docs0 = await docCount();
  await chooseBtn(`${C} page 1`).first().click({ timeout: 5000 });
  const p = await promptText();
  check((p ?? '').includes('The new file has 1 page. The sheet for page 4 cannot open.'), 'S6 prompt names the lost page', String(p));
  await shot('b6-t06-s6-prompt');
  await yesBtn().click({ timeout: 3000 });
  check(((await waitNotice((x) => x.startsWith('Opened '))) ?? '').startsWith('Opened '), 'S6 the sheet of page 1 opens', String(await notice()));
  check((await docCount()) >= Math.max(1, docs0), 'S6 one document is open');
  check((await buildingFile()).sheets.length === 2, 'S6 the sheet of page 4 stays in the building');
  check((await dlg.locator('[data-testid="open-sheet"]').count()) === 2, 'S6 both rows stay in the list');
});

// ---------- S7: after Cancel the next Choose file… opens the picker even when a stored handle exists ----------
await scenario('S7', async () => {
  await restart();
  await putPdf(PLAN);
  await openBuilding(planJson('b7'));
  await nextFiles([PLAN]);
  await chooseBtn(PLAN).first().click();
  await waitNotice((x) => x.startsWith('Opened '));
  await closeDialog();
  await restart({ perm: 'granted' });
  await putPdf(PLAN, EDIT);
  await openBuilding(planJson('b7'));
  await nextFiles([PLAN]);
  await openBtn(PLAN).first().click({ timeout: 5000 });
  const p = await promptText();
  check((p ?? '').startsWith('plan.pdf changed.'), 'S7 the prompt shows for the stored handle', String(p));
  await cancelBtn().click({ timeout: 3000 });
  await promptGone();
  const before = await pickCalls();
  await chooseBtn(PLAN).first().click({ timeout: 5000 });
  await idle(1500);
  check((await pickCalls()) === before + 1, 'S7 the second click calls the file picker', `${before} -> ${await pickCalls()}`);
});

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
