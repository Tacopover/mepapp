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
  const b = dlg.getByRole('button', { name: 'Reconnect PDFs' });
  if ((await b.count()) === 1) { await b.click(); await idle(1200); }
}

for (const w of only) {
  await page.setViewportSize({ width: w, height: 900 });
  const tag = `b6-t03-journey-${w}`;
  log('=========== width', w);
  for (const f of real) await putPdf(f);
  for (const f of fullFiles) await putPdf(f.name, f.src);
  await cancelPick(false);

  // ---------- G1 small, from empty: first start, add files, restart, open 3 sheets ----------
  bid++;
  const smallId = `sm${w}`;
  const smallJson = bjson(smallId, smallSheets());
  await openBuilding(smallJson);
  log(w, 'G1 first start counts', JSON.stringify(await counts()), 'band:', await bandHint());
  await shot(`${tag}-g1-first-start`);
  let clicks = 0;
  await reconnectAll(smallFiles); clicks++;
  log(w, 'G1 after reconnect notice:', await notice(), 'band:', await bandHint(), JSON.stringify(await counts()));
  await closeDialog();
  await restart('prompt', 'granted');
  await openBuilding(smallJson);
  log(w, 'G1 after restart: band', await bandHint(), JSON.stringify(await counts()), 'req', await reqCalls());
  await shot(`${tag}-g1-after-restart`);
  let n3 = 0;
  for (const f of smallFiles) {
    await clickRow(f).click(); n3++;
    const n = await waitNotice(/Opened |Could not|not the same/);
    log(w, 'G1 open', f, '->', n, '| visible:', await noticeVisible(), '| req', await reqCalls(), 'picks', await pickCalls());
    if (f === smallFiles[0]) await shot(`${tag}-g1-first-opened`);
  }
  await shot(`${tag}-g1-three-opened`);
  log(w, 'G1 clicks to open 3 sheets after restart:', n3, 'dialog still open:', await dlg.count(), 'counts', JSON.stringify(await counts()));
  await closeDialog();

  // ---------- G-full: restart, open 3 sheets in the full building ----------
  const fullId = `fu${w}`;
  const fullJson = bjson(fullId, fullSheets(), [riser('s0', 's1')]);
  await openBuilding(fullJson);
  log(w, 'FULL first start counts', JSON.stringify(await counts()), 'band:', await bandHint());
  await shot(`${tag}-full-first-start`);
  await reconnectAll(fullFiles.map((f) => f.name));
  log(w, 'FULL reconnect notice:', await notice(), '| band:', await bandHint(), JSON.stringify(await counts()));
  await shot(`${tag}-full-after-reconnect`);
  await closeDialog();
  await restart('prompt', 'granted');
  await openBuilding(fullJson);
  log(w, 'FULL after restart: band', await bandHint(), JSON.stringify(await counts()));
  await shot(`${tag}-full-after-restart`);
  for (const f of fullFiles.slice(0, 3)) {
    await clickRow(f.name).click();
    const n = await waitNotice(/Opened |Could not|not the same/);
    log(w, 'FULL open', f.name.slice(0, 30), '->', n, '| visible:', await noticeVisible(), '| req', await reqCalls());
  }
  await shot(`${tag}-full-three-opened`);
  // Go to from the Risers tab (open sheet s1 = fullFiles[1], already opened in this tab; test another after restart below)
  await closeDialog();

  // ---------- G4 Risers Go to after restart (nothing opened in this tab) ----------
  await restart('prompt', 'granted');
  await openBuilding(fullJson);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(700);
  await shot(`${tag}-risers-after-restart`);
  const go = dlg.getByRole('button', { name: /^Go to/ }).first();
  log(w, 'G4 Go to count', await dlg.getByRole('button', { name: /^Go to/ }).count(), 'labels', JSON.stringify(await dlg.getByRole('button', { name: /^Go to/ }).evaluateAll((els) => els.map((e) => e.textContent + '|' + e.getAttribute('aria-label')))));
  await go.click();
  const nGo = await waitNotice(/Opened |Could not|not the same/);
  log(w, 'G4 Go to ->', nGo, '| visible:', await noticeVisible(), '| req', await reqCalls());
  await shot(`${tag}-risers-goto`);
  // press Go to a second time (repeat) and the other member
  const goAll = dlg.getByRole('button', { name: /^Go to/ });
  const nGoBtns = await goAll.count();
  for (let i = 0; i < Math.min(nGoBtns, 3); i++) { await goAll.nth(i).click(); log(w, 'G4 Go to #', i, '->', await waitNotice(/Opened |Could not|not the same/, 8000)); }
  await closeDialog();

  // ---------- G2 denied (full building, new restart) ----------
  await restart('prompt', 'denied');
  await openBuilding(fullJson);
  log(w, 'G2 start: band', await bandHint(), JSON.stringify(await counts()));
  await cancelPick(true);
  const dn = fullFiles[3].name;
  for (let i = 0; i < 3; i++) {
    await clickRow(dn).click();
    await idle(1000);
    log(w, `G2 click #${i + 1} notice:`, await notice(), '| visible:', await noticeVisible(), '| req', await reqCalls(), 'picks', await pickCalls(), '| counts', JSON.stringify(await counts()), '| band', await bandHint());
    if (i === 0) await shot(`${tag}-g2-denied-1`);
  }
  await shot(`${tag}-g2-denied-3`);
  // other row in denied state
  await clickRow(fullFiles[4].name).click(); await idle(1000);
  log(w, 'G2 other row notice:', await notice(), '| req', await reqCalls(), 'picks', await pickCalls());
  // recover A: the user clicks the same row, picker returns the file this time (picker not left broken)
  await cancelPick(false);
  await next([dn]);
  await clickRow(dn).click();
  await idle(1500);
  log(w, 'G2 recover via picker after denial: notice', await waitNotice(/Opened |Could not|not the same/, 15000), '| picks', await pickCalls(), '| counts', JSON.stringify(await counts()));
  await shot(`${tag}-g2-recovered`);
  // recover B: allow now (permission granted), click Open on another row
  await page.evaluate(() => { localStorage.setItem('__perm', 'prompt'); localStorage.setItem('__reqAnswer', 'granted'); });
  await clickRow(fullFiles[5].name).click();
  log(w, 'G2 retry after allow: notice', await waitNotice(/Opened |Could not|not the same/, 15000));
  await closeDialog();

  // ---------- G3 moved or replaced (full building) ----------
  await restart('granted');
  const mv = fullFiles[6].name, ch = fullFiles[7].name;
  await removePdf(mv);
  await growPdf(ch);
  await openBuilding(fullJson);
  log(w, 'G3 start: band', await bandHint(), JSON.stringify(await counts()));
  await cancelPick(true);
  for (let i = 0; i < 2; i++) {
    await clickRow(mv).click(); await idle(1000);
    log(w, `G3 moved click #${i + 1}: notice`, await notice(), '| visible:', await noticeVisible(), '| picks', await pickCalls(), '| counts', JSON.stringify(await counts()), '| band', await bandHint());
    if (i === 0) await shot(`${tag}-g3-moved`);
  }
  await clickRow(ch).click(); await idle(1000);
  log(w, 'G3 changed click: notice', await notice(), '| counts', JSON.stringify(await counts()), '| band', await bandHint());
  await shot(`${tag}-g3-changed`);
  // recover: Choose file… on the moved row; the user gives the file back
  await putPdf(mv, fullFiles[6].src);
  await cancelPick(false);
  await next([mv]);
  await clickRow(mv, 'Choose file').click();
  log(w, 'G3 recover moved: notice', await waitNotice(/Opened |Could not|not the same/, 15000), '| counts', JSON.stringify(await counts()), '| band', await bandHint());
  await shot(`${tag}-g3-recovered`);
  // the grown file is a "new" file: user re-picks it
  await next([ch]);
  await clickRow(ch, 'Choose file').click();
  log(w, 'G3 recover changed: notice', await waitNotice(/Opened |Could not|not the same/, 15000), '| counts', JSON.stringify(await counts()), '| band', await bandHint());
  await shot(`${tag}-g3-recovered-2`);
  // restore: remove the grown copy so the next width has clean files
  await closeDialog();
  await putPdf(ch, fullFiles[7].src);
}
await t.finish();
