// B6-T08: row texts that match the real state (web app). Real clicks on the real dialog; exact text of the row line (sheet-hint) and of the button.
// Harness of b6-t06-check.mjs: the browser store is the real IndexedDB store (mepapp.webLike), the building is loaded with window.__mepBuilding.load only.
// The pickers and the permissions are fake:
//   - the file picker returns fake file handles over OPFS files (window.__nextFiles = names); a changed file = the same bytes with a few bytes appended;
//   - the folder picker returns a fake directory handle over a tree in localStorage (__trees);
//   - fake handles are saved in IndexedDB as { __fakeHandle } / { __fakeDir, path } and given back as the same fake.
// A reload is the restart: the tab memory (SheetFileCache) is empty, IndexedDB stays.
// What the fake hides: desktop rows (readPath exists, rows keep the old lines), real not-stamped PDFs (here every sheet has projectUuid null, so the
// status is not-stamped and the PDF has no MepApp id), the real browser permission question, a real viewer that saves a file.
// R6 (changed AND page missing: only the page-missing line) is not run: the state needs a changed file after a missing-page open, and the changed offer
// clears when the user chooses the new file. The unit test of sheetRowLine covers the order.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';
const sizeOf = (f) => readFileSync(FIX + f).length;
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
const putPdf = (name, extra = '') =>
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
    [readFileSync(FIX + name).toString('base64'), name, extra],
  );
const nextFiles = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
async function restart() {
  await page.evaluate(() => {
    localStorage.setItem('__fperm', 'prompt');
    localStorage.setItem('__fans', 'granted');
    localStorage.setItem('__perm', 'prompt');
    localStorage.setItem('__reqAnswer', 'granted');
    localStorage.setItem('__reqCalls', '0');
    localStorage.setItem('__freqCalls', '0');
  });
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
}

const sheet = (id, levelId, f, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${f} ${pageIndex + 1}`, location: { fileName: f, sizeBytes: sizeOf(f) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const buildingJson = (id, sheets) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const fourJson = (id) => buildingJson(id, [sheet('s1', 'l1', A), sheet('s2', 'l1', B), sheet('s3', 'l1', C, 0), sheet('s4', 'l1', C, 3)]);
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
const row = (f, n = 1) => dlg.locator(`[data-testid="page-row"][title^="${f} - Page ${n}"]`);
const btn = (r) => r.locator('[data-testid="open-sheet"]');
const text = async (loc) => ((await loc.first().innerText({ timeout: 2000 }).catch(() => null)) ?? '').trim();
const lineOf = async (r) => ((await r.locator('[data-testid="sheet-hint"]').count()) === 0 ? null : await text(r.locator('[data-testid="sheet-hint"]')));
const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 2000 }).catch(() => null)) ?? null)?.trim() ?? null;
async function waitNotice(test, ms = 20000) {
  let s = null;
  for (let i = 0; i < ms / 300 && !(s !== null && test(s)); i++) {
    s = await notice();
    await page.waitForTimeout(300);
  }
  return s;
}
const reconnectBtn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
// the one Reconnect button: with a menu, item pdf-files-pick
async function reconnectWithFiles() {
  await reconnectBtn().click({ timeout: 5000 });
  await dlg.locator('[data-testid="pdf-files-pick"]').click({ timeout: 3000 });
}
const promptEl = () => dlg.locator('[data-testid="changed-confirm"]');
async function scenario(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(false, `${name} ended with a script error`, String(e).split('\n')[0]);
  }
  await closeDialog();
}

const NEEDS = 'The browser needs this PDF file again. Click Choose file…';
const NOT_STAMPED = 'This sheet finds its PDF by file name and size. Save the PDF once in MepApp to link it for good.';
const CHANGED = 'The PDF changed after it was added. Click Choose file… and use the new file.';
const MISSING = 'Page 4 is not in the file. Remove this sheet, or choose another file.';

for (const f of [A, B, C]) await putPdf(f);

// ---------- R1: needs the file ----------
await scenario('R1', async () => {
  await restart();
  await openBuilding(fourJson('r1'));
  const r = row(A);
  check((await text(btn(r))) === 'Choose file…', 'R1 the button says Choose file…', await text(btn(r)));
  check((await lineOf(r)) === NEEDS, 'R1 the row line', String(await lineOf(r)));
  check((await btn(r).first().getAttribute('title')) === 'This browser cannot open the PDF by itself. Choose the file again.', 'R1 the button tooltip', String(await btn(r).first().getAttribute('title')));
});

// ---------- R2: can open, not-stamped ----------
await scenario('R2', async () => {
  await restart();
  await openBuilding(fourJson('r2'));
  await nextFiles([A, B, C]);
  await reconnectWithFiles();
  await waitNotice((x) => x.startsWith('Found'));
  const r = row(A);
  check((await text(btn(r))) === 'Open', 'R2 the button says Open', await text(btn(r)));
  check((await r.locator('[data-testid="sheet-status"]').first().getAttribute('data-status')) === 'not-stamped', 'R2 the sheet status is not-stamped', String(await r.locator('[data-testid="sheet-status"]').first().getAttribute('data-status')));
  check((await lineOf(r)) === NOT_STAMPED, 'R2 the not-stamped row line', String(await lineOf(r)));
  check(!(await dlg.innerText()).includes('MepApp cannot link this PDF to the sheet yet'), 'R2 the old not-stamped text is nowhere in the dialog');
});

// ---------- R3: opened ----------
await scenario('R3', async () => {
  await restart();
  await openBuilding(fourJson('r3'));
  await nextFiles([A, B, C]);
  await reconnectWithFiles();
  await waitNotice((x) => x.startsWith('Found'));
  await btn(row(B)).first().click({ timeout: 5000 });
  await waitNotice((x) => x.startsWith('Opened '));
  const r = row(B);
  check((await text(btn(r))) === 'Opened', 'R3 the button says Opened', await text(btn(r)));
  check(await btn(r).first().isDisabled(), 'R3 the button is disabled');
  check((await r.locator('[data-testid="sheet-hint"]').count()) === 0, 'R3 the row has no sheet-hint', String(await lineOf(r)));
});

// ---------- R4: changed ----------
await scenario('R4', async () => {
  await restart();
  await putPdf(A, EDIT);
  await openBuilding(fourJson('r4'));
  await nextFiles([A]);
  await btn(row(A)).first().click({ timeout: 5000 });
  for (let i = 0; i < 24 && (await promptEl().count()) === 0; i++) await page.waitForTimeout(250);
  await dlg.locator('[data-testid="changed-confirm-cancel"]').click({ timeout: 3000 });
  await idle(500);
  const r = row(A);
  check((await lineOf(r)) === CHANGED, 'R4 the changed row line', String(await lineOf(r)));
  check((await text(btn(r))) === 'Choose file…', 'R4 the button says Choose file…', await text(btn(r)));
  check((await btn(r).first().getAttribute('title')) === 'The PDF changed. Choose the new file to use it.', 'R4 the button tooltip', String(await btn(r).first().getAttribute('title')));
  await putPdf(A);
});

// ---------- R5: the page is not in the file ----------
await scenario('R5', async () => {
  await restart();
  await openBuilding(fourJson('r5'));
  await nextFiles([A, B, C]);
  await reconnectWithFiles();
  await waitNotice((x) => x.startsWith('Found'));
  await btn(row(C, 4)).first().click({ timeout: 5000 });
  const n = await waitNotice((x) => x.startsWith('Could not open'));
  check(n === 'Could not open arch_simple_A4.pdf page 4. The file has 1 page.', 'R5 the notice', String(n));
  const r = row(C, 4);
  check((await lineOf(r)) === MISSING, 'R5 the page-missing row line', String(await lineOf(r)));
  check((await text(btn(r))) === 'Open', 'R5 the button still says Open', await text(btn(r)));
  await dlg.getByRole('button', { name: `Remove ${C} page 4`, exact: true }).click({ timeout: 3000 });
  await idle(800);
  check((await row(C, 4).count()) === 0, 'R5 after Remove the row is gone', String(await row(C, 4).count()));
});

// ---------- screenshots: all states in one dialog (A needs a file, B opened, C page 4 missing) ----------
await scenario('SHOTS', async () => {
  await restart();
  await openBuilding(fourJson('shots'));
  await nextFiles([B, C]);
  await reconnectWithFiles();
  await waitNotice((x) => x.startsWith('Found'));
  await btn(row(B)).first().click({ timeout: 5000 });
  await waitNotice((x) => x.startsWith('Opened '));
  await btn(row(C, 4)).first().click({ timeout: 5000 });
  await waitNotice((x) => x.startsWith('Could not open'));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(500);
  await shot('b6-t08-rows');
  await page.setViewportSize({ width: 760, height: 1000 });
  await idle(500);
  await shot('b6-t08-rows-760');
  await page.setViewportSize({ width: 1600, height: 1000 });
});

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
