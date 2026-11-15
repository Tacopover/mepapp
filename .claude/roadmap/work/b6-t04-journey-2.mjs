// B6-T04 journey tester, goals 3 (7 of 9), 4 (denied, folder gone), 5 (ambiguous) and the audits (busy, back-to-back Open, Firefox-like).
import { setup, widths } from './b6-t04-journey-lib.mjs';
const h = await setup();
const { page, dlg, shot, idle, log } = h;
const P = (i) => h.nine[i].name; // 0..8
const f = (...idx) => idx.map((i) => ({ name: P(i), src: h.nine[i].src }));

for (const w of widths) {
  const H = w === 760 ? 700 : 900;
  await page.setViewportSize({ width: w, height: H });
  const tag = `b6-t04-journey-2-${w}`;
  log('=========== width', w, 'x', H);
  for (const r of new Set([...h.nine.map((x) => x.src), ...h.tenFiles.map((x) => x.src)])) await h.putPdf(r);
  for (const x of h.nine) await h.putPdf(x.name, x.src);
  await h.putPdf('notes.txt', h.nine[0].src);
  await h.putPdf('photo.jpg', h.nine[0].src);
  await h.cancelPick(false); await h.dirCancel(false);
  await page.evaluate(() => localStorage.setItem('__slowMs', '0'));

  // ---------- G3: folder has 7 of 9 PDFs, subfolders, other files ----------
  // plan 7 (L3-8) is absent; plan 8 (L3-9) exists with the same name but another size (other bytes)
  const odd = { name: P(8), src: '00_arch_ground_floor_w_rooms.pdf' };
  await h.setTrees({
    Plans: {
      files: [...f(0, 1, 2, 3), { name: 'notes.txt', src: 'notes.txt' }, { name: 'photo.jpg', src: 'photo.jpg' }, odd],
      dirs: { Scans: { files: f(4), dirs: { Old: { files: f(5, 6) } } }, Misc: { files: [{ name: 'readme.txt', src: 'notes.txt' }], dirs: {} } },
    },
  });
  // note: 7 = plans 0..6 found; missing: plan 7 (absent), plan 8 (other size)
  const g3 = h.bjson(`g3${w}`, h.nineSheets());
  await h.restart();
  await h.openBuilding(g3);
  await h.nextFolder('Plans');
  let clicks = 1; // Allow button
  await h.allowBtn().click();
  const n3 = await h.waitNotice((x) => x.startsWith('Found'));
  log('G3 notice:', JSON.stringify(n3), '| vis', await h.noticeVis(), '| error?', await h.noticeIsError());
  await h.dumpBand('G3 after pick');
  await shot(`${tag}-g3-partial`);
  // fix: the user clicks Reconnect PDFs… and picks the 2 files
  await h.next([P(7), P(8)]);
  await h.reconnectBtn().click(); clicks++;
  await idle(1200);
  log('G3 after Reconnect (2 files):', JSON.stringify(await h.notice()), '| vis', await h.noticeVis());
  await h.dumpBand('G3 after reconnect');
  await shot(`${tag}-g3-fixed`);
  log('G3 clicks to fix (Allow + Reconnect):', clicks);
  await h.closeDialog();
  // after restart: folder Plans stored, 2 singles stored
  await h.restart();
  await h.openBuilding(g3);
  await h.dumpBand('G3 restart');
  await shot(`${tag}-g3-restart`);
  await h.allowBtn().click();
  log('G3 restart band click notice:', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), '| band', await h.hint(), '| rows', JSON.stringify(await h.counts()));
  await h.closeDialog();

  // G3 variant: user fixes with Choose file… on a row (per row)
  const g3b = h.bjson(`g3b${w}`, h.nineSheets());
  await h.restart();
  await h.openBuilding(g3b);
  await h.nextFolder('Plans');
  await h.allowBtn().click();
  await h.waitNotice((x) => x.startsWith('Found'));
  await h.next([P(7)]);
  await h.bySheetBtn(P(7)).click();
  await idle(1500);
  log('G3b Choose file… on one row:', JSON.stringify(await h.notice()), '| band', await h.hint(), '| rows', JSON.stringify(await h.counts()));
  await h.closeDialog();

  // ---------- G4a: denied ----------
  const g4 = h.bjson(`g4${w}`, h.nineSheets());
  await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } });
  await h.restart();
  await h.openBuilding(g4);
  await h.nextFolder('Plans');
  await h.allowBtn().click();
  await h.waitNotice((x) => x.startsWith('Found'));
  await h.closeDialog();
  await h.restart({ fans: 'denied' });
  await h.openBuilding(g4);
  await h.dumpBand('G4a start (T-C)');
  for (let i = 0; i < 3; i++) {
    await h.allowBtn().click();
    await idle(900);
    log(`G4a denied click #${i + 1}:`, JSON.stringify(await h.notice()), '| vis', await h.noticeVis(), '| err', await h.noticeIsError(), '| folder q', await h.freqCalls(), '| band', await h.hint());
    if (i === 0) await shot(`${tag}-g4a-denied`);
  }
  // row Open while denied; picker cancelled
  await h.cancelPick(true);
  await h.bySheetBtn(P(2)).click();
  await idle(1500);
  log('G4a row Open after denial (picker cancelled):', JSON.stringify(await h.notice()), '| picks', await h.pickCalls(), '| rows', JSON.stringify(await h.counts()));
  await h.cancelPick(false);
  // recover 1: the user allows now (the site setting changed): click the band button again
  await h.setPerm({ __fans: 'granted' });
  await h.allowBtn().click();
  log('G4a recover after allow:', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), '| band', await h.hint());
  await h.closeDialog();
  // recover 2: denied for good, the user chooses the files with Reconnect
  await h.restart({ fans: 'denied' });
  await h.openBuilding(g4);
  await h.next(h.nine.map((x) => x.name));
  await h.reconnectBtn().click();
  await idle(1500);
  log('G4a recover via Reconnect:', JSON.stringify(await h.notice()), '| band', await h.hint(), '| rows', JSON.stringify(await h.counts()));
  await h.closeDialog();

  // ---------- G4b: folder moved or deleted ----------
  const g4b = h.bjson(`g4b${w}`, h.nineSheets());
  await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } });
  await h.restart();
  await h.openBuilding(g4b);
  await h.nextFolder('Plans');
  await h.allowBtn().click();
  await h.waitNotice((x) => x.startsWith('Found'));
  await h.closeDialog();
  await h.setTrees({ PlansMoved: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } }); // the folder moved: old path is gone
  await h.restart();
  await h.openBuilding(g4b);
  await h.dumpBand('G4b restart, folder moved');
  await h.allowBtn().click();
  log('G4b band click:', JSON.stringify(await h.waitNotice((x) => x.startsWith('The folder'))), '| vis', await h.noticeVis(), '| err', await h.noticeIsError());
  await h.dumpBand('G4b after');
  await shot(`${tag}-g4b-gone`);
  // a row Open in this state
  await h.cancelPick(true);
  await h.bySheetBtn(P(0)).click();
  await idle(1200);
  log('G4b row Open after folder gone (picker cancelled):', JSON.stringify(await h.notice()), '| picks', await h.pickCalls());
  await h.cancelPick(false);
  await h.nextFolder('PlansMoved');
  await h.allowBtn().click();
  log('G4b pick the moved folder:', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'))), '| band', await h.hint());
  await h.closeDialog();

  // ---------- G5: two files with one name and size in two subfolders ----------
  const g5 = h.bjson(`g5${w}`, h.nineSheets());
  await h.setTrees({
    Plans: {
      files: f(0, 1, 2, 3, 4, 5, 6, 7),
      dirs: { A: { files: [{ ...f(8)[0], time: 1000000 }] }, B: { files: [{ ...f(8)[0], time: 2000000 }] } },
    },
  });
  await h.restart();
  await h.openBuilding(g5);
  await h.nextFolder('Plans');
  await h.allowBtn().click();
  log('G5 notice:', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found') || x.startsWith('For '))), '| vis', await h.noticeVis(), '| err', await h.noticeIsError());
  await h.dumpBand('G5 after');
  await shot(`${tag}-g5-ambiguous`);
  await h.next([P(8)]);
  await h.bySheetBtn(P(8)).click();
  await idle(1500);
  log('G5 Choose file on the row:', JSON.stringify(await h.notice()), '| rows', JSON.stringify(await h.counts()), '| band', await h.hint());
  await h.closeDialog();

  // ---------- Busy state (slow folder) ----------
  await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } });
  await page.evaluate(() => localStorage.setItem('__slowMs', '700'));
  const gb = h.bjson(`gb${w}`, h.nineSheets());
  await h.restart();
  await h.openBuilding(gb);
  await h.nextFolder('Plans');
  await h.allowBtn().click();
  await page.waitForTimeout(900);
  await h.dumpBand('BUSY');
  log('BUSY buttons disabled:', JSON.stringify(await dlg.locator('[data-testid="reconnect-band"] button').evaluateAll((els) => els.map((e) => e.disabled))), '| allow aria-busy', await h.allowBtn().getAttribute('aria-busy').catch(() => 'n/a'));
  await shot(`${tag}-busy`);
  // wrong order: click a row Open while busy; click Reconnect while busy
  await h.reconnectBtn().click({ force: true, timeout: 2000 }).catch((e) => log('BUSY reconnect click blocked:', String(e).slice(0, 60)));
  await h.bySheetBtn(P(0)).click().catch((e) => log('BUSY row click failed', String(e).slice(0, 60)));
  log('BUSY after clicks: notice', JSON.stringify(await h.notice()), '| picks', await h.pickCalls());
  log('BUSY done:', JSON.stringify(await h.waitNotice((x) => x.startsWith('Found'), 40000)), '| band', await h.hint());
  await h.closeDialog();
  await page.evaluate(() => localStorage.setItem('__slowMs', '0'));
}

// ---------- back-to-back Open (race): 1600 only ----------
await page.setViewportSize({ width: 1600, height: 900 });
log('=========== race');
await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } });
const rj = h.bjson('race', h.nineSheets());
await h.restart();
await h.openBuilding(rj);
await h.nextFolder('Plans');
await h.allowBtn().click();
await h.waitNotice((x) => x.startsWith('Found'));
await h.closeDialog();
async function trace(label, ms) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 100 }).catch(() => null);
    const v = n === null ? null : n.trim();
    if (seen.length === 0 || seen[seen.length - 1][1] !== v) seen.push([Date.now() - t0, v]);
    await page.waitForTimeout(100);
  }
  log(label, JSON.stringify(seen));
}
for (const [label, gap, fperm] of [['R1 after restart folder prompt, 2nd click at +0ms', 0, 'prompt'], ['R2 folder prompt, 2nd click at +400ms', 400, 'prompt'], ['R3 granted, 2nd click at +0ms', 0, 'granted'], ['R4 granted, 2nd click at +1500ms', 1500, 'granted']]) {
  await h.restart({ fperm, perm: fperm });
  await h.openBuilding(rj);
  await h.bySheetBtn(P(0)).click();
  if (gap > 0) await page.waitForTimeout(gap);
  await h.bySheetBtn(P(1)).click();
  await trace(label, 7000);
  log(label, 'rows', JSON.stringify(await h.counts()), '| band', await h.hint());
  await h.closeDialog();
}
// three clicks on the same row in a row
await h.restart({ fperm: 'granted', perm: 'granted' });
await h.openBuilding(rj);
for (let i = 0; i < 3; i++) await h.bySheetBtn(P(3)).click();
await trace('R5 same row 3 times', 6000);
await h.closeDialog();

// ---------- Firefox-like: store unavailable ----------
await page.evaluate(() => localStorage.setItem('__noHandles', '1'));
await h.restart();
const fj = h.bjson('ff', h.nineSheets());
await h.openBuilding(fj);
await h.dumpBand('FF first start');
await shot('b6-t04-journey-2-ff-first');
await h.next(h.nine.map((x) => x.name));
await h.reconnectBtn().click();
await idle(1200);
log('FF after Reconnect:', JSON.stringify(await h.notice()), '| band', await h.hint());
await h.closeDialog();
await h.restart();
await h.openBuilding(fj);
await h.dumpBand('FF restart');
await shot('b6-t04-journey-2-ff-restart');
await h.closeDialog();
await page.evaluate(() => localStorage.removeItem('__noHandles'));

// ---------- empty: building with no sheets ----------
await h.restart();
await h.openBuilding(h.bjson('empty', []));
await h.dumpBand('EMPTY building');
await shot('b6-t04-journey-2-empty');
await h.closeDialog();
await h.finish();
