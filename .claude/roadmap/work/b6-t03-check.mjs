// B6-T03: open sheets from stored PDF handles. Real clicks. The browser store is the real IndexedDB store (mepapp.webLike: no devPlatform);
// the building is loaded with the dev hook window.__mepBuilding.load only. The picker and the permission are fake:
// the picker returns plain handle objects over OPFS files; they are saved in IndexedDB as { __fakeHandle: name } and given back as the same fake.
// queryPermission and requestPermission read localStorage (__perm, __reqAnswer, __reqCalls), so a page reload keeps them.
// A reload is the restart: the tab memory (SheetFileCache) is empty, IndexedDB stays.
// Playwright cannot show a real permission prompt, "Allow on every visit", or a restart with a real profile.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';
const sizeOf = (f) => readFileSync(FIX + f).length;

const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
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
const b64 = Object.fromEntries([A, B, C].map((f) => [f, readFileSync(FIX + f).toString('base64')]));
const putPdf = (name) =>
  page.evaluate(
    async ([data, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [b64[name], name],
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
const storedKeys = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('mepapp-buildings');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('pdfHandles').objectStore('pdfHandles').getAllKeys();
          q.onsuccess = () => {
            const keys = q.result.map((k) => k.join('|'));
            db.close();
            resolve(keys.sort());
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
async function restart(perm, answer = 'granted') {
  await page.evaluate(([p, a]) => { localStorage.setItem('__perm', p); localStorage.setItem('__reqAnswer', a); localStorage.setItem('__reqCalls', '0'); }, [perm, answer]);
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined, null, { timeout: 60000 });
}

const sheet = (id, levelId, f, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${f} ${pageIndex + 1}`, location: { fileName: f, sizeBytes: sizeOf(f) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const buildingJson = (id, sheets, risers = []) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers });
const b1 = () => buildingJson('b1', [sheet('s1', 'l1', A), sheet('s2', 'l1', B), sheet('s3', 'l1', C)]);
async function openBuilding(json) {
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(900);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await idle(500);
}
async function closeDialog() {
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(400);
}
const openBtn = (f) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Open ${f}"]`);
const chooseBtn = (f) => dlg.locator(`[data-testid="open-sheet"][aria-label^="Choose file for ${f}"]`);
const band = () => dlg.locator('[data-testid="reconnect-band"]');
const hint = async () => ((await band().count()) === 0 ? null : (await dlg.locator('[data-testid="reconnect-hint"]').innerText()).trim());
const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 4000 }).catch(() => null)) ?? null)?.trim() ?? null;
const noticeIsError = async () => (await dlg.locator('[data-testid="sheets-notice"].mep-buildings-status--error').count()) === 1;
const K = (id, f) => `${id}|${f}:${sizeOf(f)}`;

for (const f of [A, B, C]) await putPdf(f);

// ---------- S1: reconnect stores the handles; after a restart the rows say Open at once ----------
await openBuilding(b1());
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Choose file…$/ }).count()) === 3, 'S1 first start: three rows say Choose file…');
check((await storedKeys()).length === 0, 'S1 nothing is stored before a file is given');
await next([A, B, C]);
await dlg.locator('[data-testid="reconnect-pdfs"]').click();
await idle(900);
check((await notice()) === 'Found all 3 PDFs.', 'S1 reconnect notice', String(await notice()));
{
  const keys = await storedKeys();
  check(JSON.stringify(keys) === JSON.stringify([K('b1', A), K('b1', B), K('b1', C)].sort()), 'S1 the handles of the 3 PDFs are stored', keys.join(','));
}
await closeDialog();

await restart('prompt', 'granted');
await openBuilding(b1());
check((await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count()) === 3, 'S1 restart: the three rows say Open at once', String(await dlg.locator('[data-testid="open-sheet"]').allInnerTexts()));
check((await band().count()) === 0, 'S1 restart: no band (nothing to reconnect)');
check((await reqCalls()) === 0, 'S1 restart: no permission question before a click');
await shot('b6-t03-01-after-restart');
await openBtn(A).first().click();
await idle(1800);
for (let i = 0; i < 40 && (await notice()) === null; i++) await page.waitForTimeout(500);
check((await reqCalls()) === 1, 'S1 click Open: one permission question (the click is the gesture)', String(await reqCalls()));
check(((await notice()) ?? '').startsWith('Opened '), 'S1 granted: the sheet opens', String(await notice()));
check((await pickCalls()) === 0, 'S1 granted: the file picker did not open', String(await pickCalls()));
check((await dlg.count()) === 1, 'S1 the dialog stays open');
await openBtn(B).first().click();
let nb = null;
for (let i = 0; i < 30 && !(nb ?? '').includes(B); i++) { nb = await notice(); await page.waitForTimeout(300); }
check((await reqCalls()) === 1, 'S1 second Open: permission is granted now, no second question', String(await reqCalls()));
check((nb ?? '').startsWith('Opened '), 'S1 second sheet opens', String(nb));
await closeDialog();

// ---------- S2: denied keeps the handle ----------
await restart('prompt', 'denied');
await openBuilding(b1());
await cancelPick(true);
await openBtn(B).first().click();
await idle(1200);
check((await reqCalls()) === 1, 'S2 denied: the question ran once', String(await reqCalls()));
check((await notice()) === `Could not open ${B}. Access was not allowed. Choose the file again.`, 'S2 denied notice', String(await notice()));
check(await noticeIsError(), 'S2 denied notice has the error style');
check((await pickCalls()) === 1, 'S2 denied: the picker opened once for the sheet', String(await pickCalls()));
check((await storedKeys()).length === 3, 'S2 denied: the handle is kept', (await storedKeys()).join(','));
check((await openBtn(B).count()) === 1, 'S2 denied: the row still says Open');
await shot('b6-t03-02-denied');
await closeDialog();

// ---------- S3: moved file deletes the handle and the row says Choose file… ----------
await restart('granted');
await removePdf(C);
await openBuilding(b1());
check((await openBtn(C).count()) === 1, 'S3 the row of the missing file says Open before the click');
await cancelPick(true);
await openBtn(C).first().click();
await idle(1200);
check((await notice()) === `Could not open ${C}. Choose the file again.`, 'S3 moved notice', String(await notice()));
check(!(await noticeIsError()), 'S3 moved notice is not an error');
check((await pickCalls()) === 1, 'S3 the picker opened at once', String(await pickCalls()));
check(!(await storedKeys()).includes(K('b1', C)) && (await storedKeys()).length === 2, 'S3 the stale handle is deleted', (await storedKeys()).join(','));
check((await chooseBtn(C).count()) === 1, 'S3 the row falls back to Choose file…');
check((await hint()) === '1 PDF needs a file before it opens. Choose it again.', 'S3 the band shows 1 PDF', String(await hint()));
await shot('b6-t03-03-moved');
// the user picks the file again: a new handle replaces the old one
await putPdf(C);
await cancelPick(false);
await next([C]);
await chooseBtn(C).first().click();
await idle(1800);
for (let i = 0; i < 40 && (await notice()) === null; i++) await page.waitForTimeout(500);
check((await storedKeys()).includes(K('b1', C)), 'S3 after the pick the new handle is stored', (await storedKeys()).join(','));
check(((await notice()) ?? '').startsWith('Opened '), 'S3 the picked file opens', String(await notice()));
await idle(3000);
await closeDialog();

// ---------- S4: changed size deletes the handle (same session as S3: A was not opened in this tab) ----------
await growPdf(A);
await openBuilding(b1());
await cancelPick(true);
await openBtn(A).first().click();
await idle(1200);
check((await notice()) === `${A} is not the same file any more. Choose the file again.`, 'S4 changed notice', String(await notice()));
check(!(await storedKeys()).includes(K('b1', A)), 'S4 the stale handle is deleted', (await storedKeys()).join(','));
check((await chooseBtn(A).count()) === 1, 'S4 the row falls back to Choose file…');
await closeDialog();
await putPdf(A);

// ---------- S5: a removed sheet removes its handle (the key of a used PDF stays) ----------
await cancelPick(false);
await openBuilding(b1());
await next([A, B, C]);
if ((await band().count()) === 1) await dlg.locator('[data-testid="reconnect-pdfs"]').click();
await idle(900);
check((await storedKeys()).length === 3, 'S5 three handles before the removal', (await storedKeys()).join(','));
await dlg.locator(`button[aria-label^="Remove ${B} page 1"]`).click();
await idle(900);
{
  const keys = await storedKeys();
  check(!keys.includes(K('b1', B)) && keys.length === 2, 'S5 the handle of the removed sheet is deleted, the others stay', keys.join(','));
}
await closeDialog();

// ---------- S6: the Risers tab opens a sheet through the stored handle ----------
const member = (levelId, sheetId) => ({ levelId, sheetId, pageIndex: 0, fittingId: 'f1' });
const netType = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color: '#1f77b4', lineWidthPt: 1, linePattern: 'solid' };
const riser = { id: 'r1', name: 'Supply Air riser 1', networkTypeId: netType.id, networkType: netType, anchorMm: { xMm: 3000, yMm: 4000 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0, members: [member('l1', 's1'), member('l2', 's2')], pending: [] };
const b2 = () => buildingJson('b2', [sheet('s1', 'l1', A), sheet('s2', 'l2', B)], [riser]);
await openBuilding(b2());
await next([A, B]);
await dlg.locator('[data-testid="reconnect-pdfs"]').click();
await idle(900);
check((await storedKeys()).includes(K('b2', A)) && (await storedKeys()).includes(K('b2', B)), 'S6 handles of building b2 are stored', (await storedKeys()).join(','));
await closeDialog();
await restart('prompt', 'granted');
await openBuilding(b2());
await dlg.getByRole('tab', { name: /^Risers/ }).click();
await idle(700);
const go = dlg.locator('[data-testid="riser-goto"]').first();
check(((await go.innerText()) ?? '').trim() === 'Go to', 'S6 restart: the Risers row says Go to at once', (await go.innerText()).trim());
await shot('b6-t03-04-risers');
await go.click();
await idle(1800);
for (let i = 0; i < 40 && (await notice()) === null; i++) await page.waitForTimeout(500);
check((await reqCalls()) === 1, 'S6 Go to asks the permission once', String(await reqCalls()));
check(((await notice()) ?? '').startsWith('Opened '), 'S6 Go to opens the sheet', String(await notice()));
await closeDialog();

await t.finish();
