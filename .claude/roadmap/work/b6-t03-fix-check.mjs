// B6-T03 journey tester. Goals: restart + open 3 sheets, denied, moved/replaced, Risers Go to. Widths 1600, 1100, 760. Small and full state.
// Fake handles: proxies over OPFS files saved in IndexedDB as { __fakeHandle: name } (as b6-t03-check.mjs).
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const real = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf', '00_arch_ground_floor_edit.pdf', '00_arch_ground_floor_w_rooms.pdf', 'Example_2.pdf', 'Example_3.pdf'];
const sizeOf = (f) => readFileSync(FIX + f).length;
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : [1600, 1100, 760];

const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
const log = (...a) => console.log('LOG', ...a);
await t.context.addInitScript(() => {
  const dirP = () => navigator.storage.getDirectory();
  const ls = (k, d) => localStorage.getItem(k) ?? d;
  const proxy = (name) => ({
    kind: 'file',
    name,
    getFile: async () => (await (await dirP()).getFileHandle(name)).getFile(),
    queryPermission: async () => ls('__perm', 'granted'),
    requestPermission: async () => {
      localStorage.setItem('__reqCalls', String(Number(ls('__reqCalls', '0')) + 1));
      const answer = ls('__reqAnswer', 'granted');
      if (answer === 'granted') localStorage.setItem('__perm', 'granted');
      return answer;
    },
  });
  window.__pickCalls = 0;
  window.showOpenFilePicker = async () => {
    window.__pickCalls += 1;
    if (window.__pickCancel) throw new DOMException('cancelled', 'AbortError');
    return (window.__nextFiles ?? []).map(proxy);
  };
  const origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (this.name === 'pdfHandles' && value && typeof value.getFile === 'function') return origPut.call(this, { __fakeHandle: value.name }, key);
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
const removePdf = (name) => page.evaluate((n) => navigator.storage.getDirectory().then((d) => d.removeEntry(n)), name);
const growPdf = (name) =>
  page.evaluate(async (n) => {
    const h = await (await navigator.storage.getDirectory()).getFileHandle(n);
    const old = new Uint8Array(await (await h.getFile()).arrayBuffer());
    const w = await h.createWritable();
    await w.write(new Uint8Array([...old, 0x0a]));
    await w.close();
  }, name);
const next = (list) => page.evaluate((l) => { window.__nextFiles = l; }, list);
const cancelPick = (on) => page.evaluate((v) => { window.__pickCancel = v; }, on);
const pickCalls = () => page.evaluate(() => window.__pickCalls);
const reqCalls = () => page.evaluate(() => Number(localStorage.getItem('__reqCalls') ?? '0'));
async function restart(perm, answer = 'granted') {
  await page.evaluate(([p, a]) => { localStorage.setItem('__perm', p); localStorage.setItem('__reqAnswer', a); localStorage.setItem('__reqCalls', '0'); }, [perm, answer]);
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
}
const LONG = (i, src) => `Project-Tower-Mechanical-Plumbing-Layout-Level-${String(i).padStart(2, '0')}-${src.replace('.pdf', '')}`.padEnd(76, 'x') + '.pdf';
const sheet = (id, levelId, name, src, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${name} ${pageIndex + 1}`, location: { fileName: name, sizeBytes: sizeOf(src) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }, { id: 'l3', name: 'Level 3', elevationMm: 6000 }];
const netType = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color: '#1f77b4', lineWidthPt: 1, linePattern: 'solid' };
const member = (levelId, sheetId) => ({ levelId, sheetId, pageIndex: 0, fittingId: 'f1' });
const riser = (a, b) => ({ id: 'r1', name: 'Supply Air riser 1', networkTypeId: netType.id, networkType: netType, anchorMm: { xMm: 3000, yMm: 4000 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0, members: [member('l1', a), member('l2', b)], pending: [] });
const bjson = (id, sheets, risers = []) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers });
const smallFiles = real.slice(0, 3);
const smallSheets = () => smallFiles.map((f, i) => sheet(`s${i}`, 'l1', f, f));
const fullFiles = [];
for (let i = 0; i < 10; i++) fullFiles.push({ name: LONG(i, real[i % 7]), src: real[i % 7] });
const fullSheets = () => {
  const s = [];
  for (let i = 0; i < 30; i++) {
    const f = fullFiles[i % 10];
    s.push(sheet(`s${i}`, levels[i % 3].id, f.name, f.src, Math.floor(i / 10)));
  }
  return s;
};
let bid = 0;
const bandHint = async () => {
  const b = dlg.getByRole('button', { name: 'Reconnect PDFs' });
  if ((await b.count()) === 0) return null;
  const t2 = await dlg.locator('[data-testid="reconnect-hint"]').innerText().catch(() => '?');
  return t2.trim();
};
async function openBuilding(json) {
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(900);
  await dlg.getByRole("treeitem", { name: /Tower/ }).first().click({ timeout: 6000 }).catch(async () => { await shot("b6-t03-journey-no-treeitem-" + page.viewportSize().width); console.log("LOG no treeitem Tower; dialog text:", (await dlg.innerText()).slice(0, 600).replace(/\n/g, " / ")); });
  await idle(500);
}
const closeDialog = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };
const rowBtns = () => dlg.getByRole('button', { name: /^(Open|Choose file for) \S/ });
const counts = async () => {
  const texts = await dlg.locator('[data-testid="open-sheet"]').allInnerTexts();
  return { open: texts.filter((x) => /^Open$/.test(x.trim())).length, choose: texts.filter((x) => /^Choose file/.test(x.trim())).length, other: texts.filter((x) => !/^(Open|Choose file…)$/.test(x.trim())).map((x) => x.trim()) };
};
const noticeLoc = () => dlg.locator('[data-testid="sheets-notice"]').first();
const notice = async () => ((await noticeLoc().innerText({ timeout: 3000 }).catch(() => null)) ?? null)?.trim() ?? null;
async function noticeVisible() {
  // The notice box must lie inside the viewport and inside each scrolling parent.
  return page.evaluate(() => {
    const el = document.querySelector('.mep-modal [data-testid="sheets-notice"]');
    if (!el) return 'none';
    let r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return 'zero-size';
    let top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow !== 'visible' || cs.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); left = Math.max(left, pr.left); right = Math.min(right, pr.right);
      }
    }
    const vis = Math.max(0, bottom - top) * Math.max(0, right - left);
    return `visibleFraction=${(vis / (r.width * r.height)).toFixed(2)} rect=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)} vp=${innerWidth}x${innerHeight}`;
  });
}
const waitNotice = async (re, ms = 20000) => { await page.waitForTimeout(5000); return await notice(); };
const waitNoticeOld = async (re, ms = 20000) => {
  const end = Date.now() + ms;
  let n = null;
  while (Date.now() < end) { n = await notice(); if (n && re.test(n)) return n; await page.waitForTimeout(300); }
  return n;
};
const clickRow = (name, kind) => (kind === undefined ? dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${name}"], [data-testid="open-sheet"][aria-label^="Choose file for ${name}"]`).first() : dlg.locator(`[data-testid="open-sheet"][aria-label^="${kind === "Open" ? "Open " : "Choose file for "}${name}"]`).first());
async function reconnectAll(files) {
  await next(files);
  const b = dlg.getByRole("button", { name: "Reconnect PDFs" });
  if ((await b.count()) === 1) { await b.click(); await idle(1200); }
}

// ---------- B6-T03 journey fixes: F1 notice after a successful pick, F2 a changed file picked ----------
const noticeIsError = async () => (await dlg.locator('[data-testid="sheets-notice"].mep-buildings-status--error').count()) === 1;
const waitAnyNotice = async () => { for (let i = 0; i < 40 && (await notice()) === null; i++) await page.waitForTimeout(500); return await notice(); };
await page.setViewportSize({ width: 1100, height: 900 });
for (const f of real) await putPdf(f);
const tj = bjson('fx1', smallSheets());
await openBuilding(tj);
await reconnectAll(smallFiles);
await closeDialog();

// F1: denied, then the user picks the right file
await restart('prompt', 'denied');
await openBuilding(tj);
await cancelPick(false);
await next([smallFiles[0]]);
await clickRow(smallFiles[0]).click();
const n1 = await waitAnyNotice();
log('F1 notice:', n1, '| error style', await noticeIsError());
check(n1 !== null && n1.startsWith('Opened ') && !/Could not|Access was not allowed|Choose the file again/.test(n1), 'F1 success notice replaces the failure text', String(n1));
check(!(await noticeIsError()), 'F1 success notice is in normal style');
await closeDialog();

// F1b: denied, the user cancels the picker: the failure text stays, in error style
await restart('prompt', 'denied');
await openBuilding(tj);
await cancelPick(true);
await clickRow(smallFiles[1]).click();
await idle(1500);
const n1b = await notice();
check(n1b === `Could not open ${smallFiles[1]}. Access was not allowed. Choose the file again.`, 'F1b cancelled picker keeps the failure text', String(n1b));
check(await noticeIsError(), 'F1b failure text keeps the error style');
await cancelPick(false);
await closeDialog();

// F2: the file changed, the user picks the changed file
await restart('granted');
await growPdf(smallFiles[2]);
await openBuilding(tj);
await next([smallFiles[2]]);
await clickRow(smallFiles[2]).click();
const n2 = await waitAnyNotice();
log('F2 notice:', n2, '| error style', await noticeIsError());
check(n2 !== null && n2.startsWith('Opened ') && /Relink/.test(n2) && !/Choose the file again|not the same file any more/.test(n2), 'F2 the notice says once what happened', String(n2));
check(!(await noticeIsError()), 'F2 notice is in normal style');
await closeDialog();
await putPdf(smallFiles[2]);
await t.finish();
