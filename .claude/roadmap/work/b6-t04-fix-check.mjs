// B6-T04 fix check for the journey findings F1 (second Open while the first PDF loads), F3 (blank notice), F4 (denied text), F7 (count text).
// Real clicks on the real rows and buttons. Same fakes as the journey lib (fake pickers and fake handles over OPFS).
import { setup } from './b6-t04-journey-lib.mjs';
const h = await setup();
const { page, dlg, idle, log, check } = h;
const P = (i) => h.nine[i].name;
const f = (...idx) => idx.map((i) => ({ name: P(i), src: h.nine[i].src }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setViewportSize({ width: 1600, height: 900 });
for (const r of new Set(h.nine.map((x) => x.src))) await h.putPdf(r);
for (const x of h.nine) await h.putPdf(x.name, x.src);
await h.cancelPick(false);
await h.dirCancel(false);
await page.evaluate(() => localStorage.setItem('__slowMs', '0'));
const docCount = () => page.evaluate(() => window.__mepSketchScene.getDocuments().length);
async function trace(ms, stop) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await dlg.locator('[data-testid="sheets-notice"]').first().innerText({ timeout: 1500 }).catch(() => null);
    const v = n === null ? null : n.trim();
    if (seen.length === 0 || seen[seen.length - 1][1] !== v) seen.push([Date.now() - t0, v]);
    if (stop && v !== null && stop(v)) break;
    await page.waitForTimeout(100);
  }
  return seen;
}

// ---------- F1: two Open clicks back to back ----------
await h.setTrees({ Plans: { files: f(0, 1, 2, 3, 4, 5, 6, 7, 8), dirs: {} } });
const rj = h.bjson('race', h.nineSheets());
await h.restart();
await h.openBuilding(rj);
await h.nextFolder('Plans');
await h.allowClick();
await h.waitNotice((x) => x.startsWith('Found'));
await h.closeDialog();
await h.restart({ fperm: 'prompt', perm: 'prompt' });
await h.openBuilding(rj);
await page.evaluate(() => { window.__texts = []; setInterval(() => { const el = document.querySelector('[data-testid="sheets-notice"]'); const v = el ? el.textContent : null; if (v !== null && !window.__texts.includes(v)) window.__texts.push(v); }, 20); });
await h.bySheetBtn(P(0)).click();
await h.bySheetBtn(P(1)).click();
await page.waitForFunction(() => window.__mepSketchScene.getDocuments().length >= 2, null, { timeout: 180000, polling: 500 });
await page.waitForFunction((n) => window.__texts.some((x) => x.startsWith('Opened ' + n)), P(1), { timeout: 180000, polling: 500 });
const seen = (await page.evaluate(() => window.__texts)).map((x) => [0, x]);
log('F1 notices', JSON.stringify(seen));
log('F1 documents', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName))));
const texts = seen.map((s) => s[1]).filter((x) => x !== null);
check(!texts.some((x) => x.includes('See the header')), 'F1 no notice says "See the header"', JSON.stringify(texts));
check(!texts.some((x) => x.startsWith('Could not open')), 'F1 no error notice for the second Open', JSON.stringify(texts));
check(JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName))) === JSON.stringify([P(0), P(1)]), 'F1 both sheets are open');
check(texts.some((x) => x.startsWith(`Opened ${P(1)}`)), 'F1 the second sheet gets its Opened notice', JSON.stringify(texts));
await h.closeDialog();

// ---------- F3 and F4: folder denied, the user picks all 9 files with Reconnect PDFs… ----------
const g4 = h.bjson('g4', h.nineSheets());
await h.restart();
await h.openBuilding(g4);
await h.nextFolder('Plans');
await h.allowClick();
await h.waitNotice((x) => x.startsWith('Found'));
await h.closeDialog();
await h.restart({ fans: 'denied', perm: 'denied', ans: 'denied' });
await h.openBuilding(g4);
await h.allowClick();
await idle(800);
const denied = await h.notice();
log('F4 denied notice:', JSON.stringify(denied));
check(denied === 'Access was not allowed. Click Reconnect PDFs… and choose the files, or change the site setting in the browser.', 'F4 denied text points to what works', String(denied));
check(!(denied ?? '').includes('Click Allow access'), 'F4 the text does not say Click Allow access');
await h.next(h.nine.map((x) => x.name));
await h.filesClick();
const seen3 = await trace(3000);
log('F3 notices after Reconnect', JSON.stringify(seen3));
check(seen3.some((s) => s[1] === 'Found all 9 PDFs.'), 'F3 the notice says Found all 9 PDFs.', JSON.stringify(seen3));
check(seen3.length > 0 && seen3[seen3.length - 1][1] === 'Found all 9 PDFs.', 'F3 the notice is still there after 3 s', JSON.stringify(seen3));
await h.closeDialog();

// F3 b: a row Open after a restart, the notice never goes blank for 4 s
await h.restart({ fperm: 'granted', perm: 'granted' });
await h.openBuilding(g4);
await h.bySheetBtn(P(0)).click();
const seen3b = [...(await trace(120000, (x) => x.startsWith('Opened'))), ...(await trace(3000))];
log('F3b notices after a row Open', JSON.stringify(seen3b));
const opened = seen3b.findIndex((s) => (s[1] ?? '').startsWith('Opened'));
check(opened >= 0 && seen3b.slice(opened).every((s) => s[1] !== null && s[1] !== ''), 'F3b the Opened notice stays (no blank gap) for 4 s', JSON.stringify(seen3b));
await h.closeDialog();

// ---------- F7: 3 sheets are open, then the folder search counts the whole building ----------
const g7 = h.bjson('g7', h.nineSheets());
await h.restart();
await h.openBuilding(g7);
await h.next([h.nine[0], h.nine[1], h.nine[2]].map((x) => x.name));
await h.filesClick();
await h.waitNotice((x) => x.startsWith('Found'));
for (let i = 0; i < 3; i++) await h.bySheetBtn(P(i)).click();
await idle(2500);
await h.nextFolder('Plans');
await h.allowClick();
const n7 = await h.waitNotice((x) => x.includes('in Plans'));
log('F7 notice', JSON.stringify(n7));
check(n7 === 'Found all 9 PDFs in Plans.', 'F7 the count is the 9 PDFs of the building', String(n7));
await h.closeDialog();
check(errors.length === 0, 'no page errors', errors.join(' | '));
await h.finish();
