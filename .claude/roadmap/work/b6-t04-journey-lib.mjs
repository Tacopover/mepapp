// Shared setup of the B6-T04 journey scripts (copied from b6-t04-check.mjs and b6-t03-journey-main.mjs).
// Fake pickers, fake handles over OPFS, fake permissions in localStorage. A page reload is the restart.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

export const FIX = '/root/MepApp/fixtures/pdfs/';
export const REAL = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf', '00_arch_ground_floor_edit.pdf', '00_arch_ground_floor_w_rooms.pdf', 'Example_2.pdf', 'Example_3.pdf'];
export const widths = process.argv[2] ? process.argv[2].split(',').map(Number) : [1600, 1100, 760];

export async function setup() {
  const t = await open({ seed: { 'mepapp.webLike': '1' } });
  const { page, idle, menu, shot } = t;
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
    const proxy = (name) => ({ kind: 'file', name, getFile: async () => (await (await dirP()).getFileHandle(name)).getFile(), ...filePerms() });
    const entryOf = (f) => ({
      kind: 'file',
      name: f.name,
      getFile: async () => {
        await new Promise((r) => setTimeout(r, Number(localStorage.getItem('__slowMs') ?? '0')));
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
  const b64 = {};
  const putPdf = (name, src = name) =>
    page.evaluate(
      async ([data, n]) => {
        const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
        await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
        await w.close();
      },
      [(b64[src] ??= readFileSync(FIX + src).toString('base64')), name],
    );
  const sizeOf = (src) => readFileSync(FIX + src).length;
  const setTrees = (trees) => page.evaluate((v) => localStorage.setItem('__trees', JSON.stringify(v)), trees);
  const nextFolder = (name) => page.evaluate((n) => { window.__nextFolder = n; }, name);
  const dirCancel = (on) => page.evaluate((v) => { window.__dirCancel = v; }, on);
  const cancelPick = (on) => page.evaluate((v) => { window.__pickCancel = v; }, on);
  const next = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
  const pickCalls = () => page.evaluate(() => window.__pickCalls);
  const dirPicks = () => page.evaluate(() => window.__dirPicks.length);
  const num = (k) => page.evaluate((key) => Number(localStorage.getItem(key) ?? '0'), k);
  const reqCalls = () => num('__reqCalls');
  const freqCalls = () => num('__freqCalls');
  const setPerm = (v) => page.evaluate((x) => { for (const [k, val] of Object.entries(x)) localStorage.setItem(k, val); }, v);
  async function restart({ fperm = 'prompt', fans = 'granted', perm = 'prompt', ans = 'granted' } = {}) {
    await page.evaluate(
      (v) => {
        localStorage.setItem('__fperm', v[0]); localStorage.setItem('__fans', v[1]); localStorage.setItem('__perm', v[2]); localStorage.setItem('__reqAnswer', v[3]);
        localStorage.setItem('__reqCalls', '0'); localStorage.setItem('__freqCalls', '0');
      },
      [fperm, fans, perm, ans],
    );
    await page.reload();
    await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
  }
  const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }, { id: 'l3', name: 'Level 3', elevationMm: 6000 }];
  const sheet = (id, levelId, name, src, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${name} ${pageIndex + 1}`, location: { fileName: name, sizeBytes: sizeOf(src) } });
  const netType = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color: '#1f77b4', lineWidthPt: 1, linePattern: 'solid' };
  const member = (levelId, sheetId) => ({ levelId, sheetId, pageIndex: 0, fittingId: 'f1' });
  const riser = (a, la, b, lb) => ({ id: 'r1', name: 'Supply Air riser 1', networkTypeId: netType.id, networkType: netType, anchorMm: { xMm: 3000, yMm: 4000 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0, members: [member(la, a), member(lb, b)], pending: [] });
  const bjson = (id, sheets, risers = []) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers });
  // small: 9 PDFs on 3 levels, own names, bytes of the real files
  const nine = Array.from({ length: 9 }, (_, i) => ({ name: `plan-L${Math.floor(i / 3) + 1}-${i + 1}.pdf`, src: REAL[i % 7] }));
  // distinct sizes are not needed: the match rule is name + size
  const nineSheets = () => nine.map((f, i) => sheet(`s${i}`, levels[Math.floor(i / 3)].id, f.name, f.src));
  const LONG = (i, src) => `Project-Tower-Mechanical-Plumbing-Layout-Level-${String(i).padStart(2, '0')}-${src.replace('.pdf', '')}`.padEnd(76, 'x') + '.pdf';
  const tenFiles = Array.from({ length: 10 }, (_, i) => ({ name: LONG(i, REAL[i % 7]), src: REAL[i % 7] }));
  const fullSheets = () => Array.from({ length: 30 }, (_, i) => { const f = tenFiles[i % 10]; return sheet(`s${i}`, levels[i % 3].id, f.name, f.src, Math.floor(i / 10)); });
  async function openBuilding(json, select = true) {
    await page.evaluate((j) => window.__mepBuilding.load(j), json);
    await idle(600);
    await menu('Manage Buildings…');
    await dlg.waitFor({ state: 'visible', timeout: 8000 });
    await idle(900);
    if (select) {
      if ((await dlg.locator('[role="treeitem"][data-kind="building"]').count()) > 0) await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
      else await dlg.locator('select').first().selectOption({ index: 0 });
    }
    await idle(700);
  }
  const closeDialog = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };
  const bySheetBtn = (name) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${name}"], [data-testid="open-sheet"][aria-label^="Choose file for ${name}"]`).first();
  const band = () => dlg.locator('[data-testid="reconnect-band"]');
  const allowBtn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
  const reconnectBtn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
  // The old Allow button: "Use the folder X" when the stored folder needs the permission, else "Choose a folder…" / "Choose another folder…".
  const allowClick = async () => {
    await allowBtn().click();
    const use = dlg.locator('[data-testid="pdf-folder-use"]');
    if ((await use.count()) === 1 && /^Use the folder /.test((await use.locator('strong').innerText()).trim())) await use.click();
    else await dlg.locator('[data-testid="pdf-folder-pick"]').click();
  };
  const filesClick = async () => {
    await reconnectBtn().click();
    await dlg.locator('[data-testid="pdf-files-pick"]').click();
  };
  const hint = async () => ((await band().count()) === 0 ? null : (await dlg.locator('[data-testid="reconnect-hint"]').innerText()).trim());
  const bandButtons = async () => ((await band().count()) === 0 ? [] : (await dlg.locator('[data-testid="reconnect-band"] button').allInnerTexts()).map((x) => x.trim()));
  const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 1500 }).catch(() => null)) ?? null)?.trim() ?? null;
  const noticeIsError = async () => (await dlg.locator('[data-testid="sheets-notice"].mep-buildings-status--error').count()) === 1;
  const counts = async () => {
    const texts = (await dlg.locator('[data-testid="open-sheet"]').allInnerTexts()).map((x) => x.trim());
    return { open: texts.filter((x) => x === 'Open').length, choose: texts.filter((x) => x.startsWith('Choose file')).length, other: [...new Set(texts.filter((x) => x !== 'Open' && !x.startsWith('Choose file')))] };
  };
  async function waitNotice(test, ms = 15000) {
    let text = null;
    for (let i = 0; i < ms / 300 && !(text !== null && test(text)); i++) { text = await notice(); await page.waitForTimeout(300); }
    return text;
  }
  // Is the element inside the viewport and inside every scrolling parent? Returns a fraction 0..1 or -1 when absent.
  const visibleFraction = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return -1;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return 0;
      let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflow !== 'visible' || cs.overflowY !== 'visible') { const pr = p.getBoundingClientRect(); top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); left = Math.max(left, pr.left); right = Math.min(right, pr.right); }
      }
      return Math.round((Math.max(0, bottom - top) * Math.max(0, right - left) / (r.width * r.height)) * 100) / 100;
    }, sel);
  const noticeVis = () => visibleFraction('.mep-modal [data-testid="sheets-notice"]');
  const bandVis = () => visibleFraction('.mep-modal [data-testid="reconnect-band"]');
  const idbKeys = (storeName) =>
    page.evaluate(
      (name) => new Promise((resolve, reject) => {
        const r = indexedDB.open('mepapp-buildings');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction(name).objectStore(name).getAllKeys();
          q.onsuccess = () => { const keys = q.result.map((k) => (Array.isArray(k) ? k.join('|') : String(k))); db.close(); resolve(keys.sort()); };
          q.onerror = () => reject(q.error);
        };
      }),
      storeName,
    );
  const log = (...a) => console.log('LOG', ...a);
  const dumpBand = async (label) => log(label, '| band:', JSON.stringify(await hint()), '| buttons:', JSON.stringify(await bandButtons()), '| rows:', JSON.stringify(await counts()), '| bandVis', await bandVis());
  return { ...t, dlg, putPdf, setTrees, nextFolder, dirCancel, cancelPick, next, pickCalls, dirPicks, reqCalls, freqCalls, setPerm, restart, levels, sheet, riser, bjson, nine, nineSheets, tenFiles, fullSheets, openBuilding, closeDialog, bySheetBtn, band, allowBtn, reconnectBtn, allowClick, filesClick, hint, bandButtons, notice, noticeIsError, counts, waitNotice, noticeVis, bandVis, idbKeys, log, dumpBand, sizeOf };
}
