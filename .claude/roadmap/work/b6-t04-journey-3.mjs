// B6-T04 journey tester follow-ups: G5 Choose file on the ambiguous row; G4a Reconnect after a denied folder; notice timing of Open; 760 notices.
import { setup } from './b6-t04-journey-lib.mjs';
const h = await setup();
const { page, dlg, shot, idle, log } = h;
const P = (i) => h.nine[i].name;
const f = (...idx) => idx.map((i) => ({ name: P(i), src: h.nine[i].src }));
await page.setViewportSize({ width: 760, height: 700 });
for (const r of new Set(h.nine.map((x) => x.src))) await h.putPdf(r);
for (const x of h.nine) await h.putPdf(x.name, x.src);
async function poll(label, ms) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 100 }).catch(() => null);
    const v = n === null ? null : n.trim().slice(0, 110);
    if (seen.length === 0 || seen[seen.length - 1][1] !== v) seen.push([Date.now() - t0, v]);
    await page.waitForTimeout(100);
  }
  log(label, JSON.stringify(seen));
}
// G5
await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7), dirs: { A: { files: [{ ...f(8)[0], time: 1000000 }] }, B: { files: [{ ...f(8)[0], time: 2000000 }] } } } });
const g5 = h.bjson('g5x', h.nineSheets());
await h.restart();
await h.openBuilding(g5);
await h.nextFolder('Plans');
await h.allowBtn().click();
await h.waitNotice((x) => x.startsWith('Found'));
await shot('b6-t04-journey-3-g5-notice-760');
log('G5 notice vis 760x700:', await h.noticeVis());
await h.next([P(8)]);
await h.bySheetBtn(P(8)).scrollIntoViewIfNeeded().catch(() => {});
log('G5 row button:', await h.bySheetBtn(P(8)).innerText());
await h.bySheetBtn(P(8)).click();
await poll('G5 Choose file notices', 8000);
log('G5 after: rows', JSON.stringify(await h.counts()), '| band', await h.hint(), '| picks', await h.pickCalls());
await shot('b6-t04-journey-3-g5-after-choose');
await h.closeDialog();

// G4a: folder denied, user clicks Reconnect and picks the files
await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } });
const g4 = h.bjson('g4x', h.nineSheets());
await h.restart();
await h.openBuilding(g4);
await h.nextFolder('Plans');
await h.allowBtn().click();
await h.waitNotice((x) => x.startsWith('Found'));
await h.closeDialog();
await h.restart({ fans: 'denied', perm: 'denied', ans: 'denied' });
await h.openBuilding(g4);
await h.dumpBand('G4c everything denied, start');
await h.allowBtn().click();
await idle(800);
log('G4c denied folder:', JSON.stringify(await h.notice()), 'vis', await h.noticeVis());
await h.next(h.nine.map((x) => x.name));
await h.reconnectBtn().click();
await poll('G4c Reconnect notices', 4000);
await h.dumpBand('G4c after Reconnect');
await shot('b6-t04-journey-3-g4c-after-reconnect');
// the single files are denied: row Open
await h.cancelPick(true);
await h.bySheetBtn(P(1)).click();
await poll('G4c row Open (files denied, picker cancelled)', 4000);
await shot('b6-t04-journey-3-g4c-row-denied');
await h.cancelPick(false);
await h.closeDialog();

// Open timing: single Open after restart, granted
await h.restart({ fperm: 'granted', perm: 'granted' });
await h.openBuilding(g4);
await h.bySheetBtn(P(0)).click();
await poll('T1 one Open click', 6000);
await h.closeDialog();

// Reconnect with the file picker returning the wrong files (other names)
await h.restart();
await h.openBuilding(h.bjson('g6x', h.nineSheets()));
await h.next(['notes.txt']);
await h.putPdf('notes.txt', h.nine[0].src);
await h.reconnectBtn().click();
await poll('W1 Reconnect with a non-sheet file', 4000);
await shot('b6-t04-journey-3-w1-wrong-file');
await h.closeDialog();
await h.finish();
