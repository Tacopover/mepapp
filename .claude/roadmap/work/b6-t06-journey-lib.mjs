// Journey harness for B6-T06 (journey-tester). Fake pickers and OPFS as in b6-t06-check.mjs.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

export const FIX = '/root/MepApp/fixtures/pdfs/';
export const BASE_FILES = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf'];
export const EDIT = '\n% edited\n';
const LONG = (i) => `Project Tower Residential Block ${'ABCDEFGHIJ'[i]} - structural and architectural floor plan revision 07 - final issue ${i}.pdf`;
export const NAMES9 = [...Array(9).keys()].map(LONG);
export const SRC9 = NAMES9.map((n, i) => [n, BASE_FILES[i % 3]]);
export const srcOf = Object.fromEntries([...SRC9, ['plan.pdf', BASE_FILES[0]], ['lost.pdf', BASE_FILES[2]]]);
export const sizeOf = (n) => readFileSync(FIX + srcOf[n]).length;

export async function setup() {
  const t = await open({ seed: { 'mepapp.webLike': '1' } });
  const { page } = t;
  await t.context.addInitScript(() => {
    const dirP = () => navigator.storage.getDirectory();
    const ls = (k, d) => localStorage.getItem(k) ?? d;
    const bump = (k) => localStorage.setItem(k, String(Number(ls(k, '0')) + 1));
    const perms = (permKey, ansKey, callsKey) => ({
      queryPermission: async () => ls(permKey, 'granted'),
      requestPermission: async () => { bump(callsKey); const a = ls(ansKey, 'granted'); if (a === 'granted') localStorage.setItem(permKey, 'granted'); return a; },
    });
    const filePerms = () => perms('__perm', '__reqAnswer', '__reqCalls');
    const proxy = (name) => ({ kind: 'file', name, getFile: async () => (await (await dirP()).getFileHandle(name)).getFile(), ...filePerms() });
    const entryOf = (f) => ({ kind: 'file', name: f.name, getFile: async () => { const base = await (await (await dirP()).getFileHandle(f.src ?? f.name)).getFile(); return new File([base], f.name, { lastModified: f.time ?? base.lastModified }); }, ...filePerms() });
    const nodeAt = (root, path) => { let node = JSON.parse(localStorage.getItem('__trees') ?? '{}')[root]; if (!node) throw new DOMException('gone', 'NotFoundError'); for (const p of path) { node = node.dirs?.[p]; if (!node) throw new DOMException('gone', 'NotFoundError'); } return node; };
    const mkDir = (root, path) => ({ kind: 'directory', name: path.length === 0 ? root : path[path.length - 1], __root: root, __path: path, ...perms('__fperm', '__fans', '__freqCalls'),
      values: async function* () { const node = nodeAt(root, path); for (const f of node.files ?? []) yield entryOf(f); for (const d of Object.keys(node.dirs ?? {})) yield mkDir(root, [...path, d]); } });
    window.__pickCalls = 0; window.__dirPicks = [];
    window.showOpenFilePicker = async () => { window.__pickCalls += 1; if (window.__pickCancel) throw new DOMException('c', 'AbortError'); return (window.__nextFiles ?? []).map(proxy); };
    window.showDirectoryPicker = async (o) => { window.__dirPicks.push(o); if (window.__dirCancel) throw new DOMException('c', 'AbortError'); return mkDir(window.__nextFolder, []); };
    const origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === 'pdfHandles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
      if (this.name === 'pdfFolders' && value && value.kind === 'directory') return origPut.call(this, { __fakeDir: value.__root, path: value.__path }, key);
      return origPut.call(this, value, key);
    };
    const resultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
    Object.defineProperty(IDBRequest.prototype, 'result', { get() { const v = resultGet.call(this); if (v && v.__fakeHandle) return proxy(v.__fakeHandle); if (v && v.__fakeDir) return mkDir(v.__fakeDir, v.path); return v; } });
  });
  await t.start();
  const dlg = page.locator('.mep-modal');
  const h = { t, page, dlg, check: t.check, idle: t.idle, menu: t.menu };
  h.shot = (n) => t.shot(n);
  h.putFile = (name, src, extra = '') => page.evaluate(async ([data, n, more]) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); const tail = new TextEncoder().encode(more);
    const all = new Uint8Array(bytes.length + tail.length); all.set(bytes, 0); all.set(tail, bytes.length);
    const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable(); await w.write(all); await w.close();
  }, [readFileSync(FIX + src).toString('base64'), name, extra]);
  h.putPdf = (name, extra = '') => h.putFile(name, srcOf[name], extra);
  h.setTrees = (v) => page.evaluate((x) => localStorage.setItem('__trees', JSON.stringify(x)), v);
  h.nextFiles = (l) => page.evaluate((x) => { window.__nextFiles = x; }, l);
  h.nextFolder = (n) => page.evaluate((x) => { window.__nextFolder = x; }, n);
  h.pickCalls = () => page.evaluate(() => window.__pickCalls);
  h.buildingFile = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
  h.restart = async ({ fperm = 'prompt', perm = 'prompt' } = {}) => {
    await page.evaluate((v) => { localStorage.setItem('__fperm', v[0]); localStorage.setItem('__fans', 'granted'); localStorage.setItem('__perm', v[1]); localStorage.setItem('__reqAnswer', 'granted'); localStorage.setItem('__reqCalls', '0'); localStorage.setItem('__freqCalls', '0'); }, [fperm, perm]);
    await page.reload();
    await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
  };
  const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
  h.sheet = (id, levelId, f, pageIndex = 0, displayName = `${f.slice(0, 20)} ${pageIndex + 1}`) => ({ id, levelId, projectUuid: null, pageIndex, displayName, location: { fileName: f, sizeBytes: sizeOf(f) } });
  h.buildingJson = (id, sheets) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
  h.openBuilding = async (json) => {
    await page.evaluate((j) => window.__mepBuilding.load(j), json); await h.idle(600);
    await h.menu('Manage Buildings…'); await dlg.waitFor({ state: 'visible', timeout: 8000 }); await h.idle(900);
    if ((await dlg.locator('[role="treeitem"][data-kind="building"]').count()) > 0) await dlg.locator('[role="treeitem"][data-kind="building"]').first().click(); await h.idle(700);
  };
  h.closeDialog = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 3000 }).catch(() => {}); await h.idle(400); };
  h.notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 1500 }).catch(() => null)) ?? null)?.trim() ?? null;
  h.waitNotice = async (test, ms = 15000) => { let x = null; for (let i = 0; i < ms / 300 && !(x !== null && test(x)); i++) { x = await h.notice(); await page.waitForTimeout(300); } return x; };
  h.rowButtons = () => dlg.locator('[data-testid="open-sheet"]').allInnerTexts();
  h.sheetsText = async () => (await dlg.locator('[data-testid="sheets-notice"], .mep-sheet-hint, [data-testid="sheet-hint"]').allInnerTexts());
  h.focusInfo = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName} ${e.getAttribute('data-testid') ?? ''} "${(e.textContent ?? '').trim().slice(0, 30)}"` : 'none'; });
  h.overflow = () => page.evaluate(() => { const m = document.querySelector('.mep-modal'); if (!m) return 'nomodal'; const r = m.getBoundingClientRect(); const bad = []; m.querySelectorAll('button,p,span').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1)) bad.push((e.textContent ?? '').trim().slice(0, 30)); }); return bad.length ? 'OVERFLOW: ' + bad.slice(0, 5).join(' | ') : 'ok'; });
  return h;
}
export const widths = [760];
