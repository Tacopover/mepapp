// B6-T01: "Reconnect PDFs..." band in the Sheets section of the Building dialog. Real clicks. The picker (showOpenFilePicker) is stubbed:
// it returns fake file handles built from real fixture PDFs. Setup uses the dev hook window.__mepBuilding.load only.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const A = '00_arch_ground_floor.pdf';
const B = '01_arch_first_floor.pdf';
const C = 'arch_simple_A4.pdf';
const D = '00_arch_ground_floor_edit.pdf';
const E = '00_arch_ground_floor_w_rooms.pdf';
const X1 = 'Example_2.pdf';
const X2 = 'Example_3.pdf';
const all = [A, B, C, D, E, X1, X2];
const sizeOf = (f) => readFileSync(FIX + f).length;

const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
await t.start();
await page.evaluate(
  (list) => {
    window.__blobs = {};
    for (const [name, b64] of list) window.__blobs[name] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.__pickCalls = 0;
    window.showOpenFilePicker = async () => {
      window.__pickCalls += 1;
      const p = window.__pick;
      if (p === 'cancel') throw new DOMException('cancelled', 'AbortError');
      return p.map((s) => ({ kind: 'file', name: s.name ?? s.f, getFile: async () => new File([window.__blobs[s.f]], s.name ?? s.f, { lastModified: s.m ?? 1000 }) }));
    };
  },
  all.map((f) => [f, readFileSync(FIX + f).toString('base64')]),
);

const dlg = page.locator('.mep-modal');
const sheet = (id, levelId, f, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${f} ${pageIndex + 1}`, location: { fileName: f, sizeBytes: sizeOf(f) } });
const buildingJson = (id, sheets, levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }]) =>
  JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const fullSheets = () => [sheet('s1', 'l1', A, 0), sheet('s2', 'l1', A, 1), sheet('s3', 'l1', B), sheet('s4', 'l2', C), sheet('s5', 'l2', D), sheet('s6', 'l2', E)];

async function openBuilding(json) {
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(800);
}
async function closeDialog() {
  await dlg.getByRole('button', { name: 'Close', exact: true }).click();
  await idle(400);
}
const node = (kind, text) => (text === undefined ? dlg.locator(`[role="treeitem"][data-kind="${kind}"]`).first() : dlg.locator(`[role="treeitem"][data-kind="${kind}"]`, { hasText: text }).first());
const band = () => dlg.locator('[data-testid="reconnect-band"]');
const hint = async () => ((await band().count()) === 0 ? null : (await dlg.locator('[data-testid="reconnect-hint"]').innerText()).trim());
const btn = () => dlg.locator('[data-testid="reconnect-pdfs"]');
const notice = async () => ((await dlg.locator('[data-testid="sheets-notice"]').count()) === 0 ? null : (await dlg.locator('[data-testid="sheets-notice"]').innerText()).trim());
const noticeIsError = async () => ((await dlg.locator('[data-testid="sheets-notice"].mep-buildings-status--error').count()) === 1);
const chooseCount = () => dlg.locator('[data-testid="open-sheet"]', { hasText: /^Choose file…$/ }).count();
const openCount = () => dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).count();
const pick = (list) => page.evaluate((l) => { window.__pick = l; }, list);
const reconnect = async (list) => {
  await pick(list);
  await btn().click();
  await idle(700);
};

// ---------- S1: building b1, 6 sheets on 2 levels, 5 PDFs (A has 2 pages) ----------
await openBuilding(buildingJson('b1', fullSheets()));
await node('building').click();
await idle(500);
check((await hint()) === '5 PDFs need a file before they open. Choose them all in one step.', 'building node: band hint counts 5 PDFs', String(await hint()));
check((await chooseCount()) === 6, 'six rows say Choose file…', String(await chooseCount()));
check((await btn().innerText()).trim() === 'Reconnect PDFs…', 'button label');
check((await btn().getAttribute('aria-label')) === 'Reconnect PDFs', 'button aria-label');
check((await btn().getAttribute('title')) === 'Choose the PDF files of this building. The app finds the sheets by file name and size. No sheet is added or changed.', 'tooltip names the building', String(await btn().getAttribute('title')));
await shot('b6-t01-01-building-band');
{
  await page.setViewportSize({ width: 760, height: 900 });
  await idle(500);
  const b = await btn().boundingBox();
  const h = await dlg.locator('[data-testid="reconnect-hint"]').boundingBox();
  check(b !== null && h !== null && b.y >= h.y + h.height - 1, 'narrow: the button is under the hint', JSON.stringify({ b, h }));
  await shot('b6-t01-02-narrow');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(500);
}

// cancel: no message, nothing changes, button still works
await pick('cancel');
await btn().click();
await idle(700);
check((await notice()) === null, 'cancel: no message', String(await notice()));
check((await hint()) === '5 PDFs need a file before they open. Choose them all in one step.', 'cancel: band unchanged');
check(!(await btn().isDisabled()), 'cancel: button is not disabled');

// level scope: Level 2 has C, D, E
await node('level', 'Level 2').click();
await idle(500);
check((await hint()) === '3 PDFs need a file before they open. Choose them all in one step.', 'level node: band counts only the PDFs of the level', String(await hint()));
check((await btn().getAttribute('title')) === 'Choose the PDF files of this level. The app finds the sheets by file name and size. No sheet is added or changed.', 'tooltip names the level');
await reconnect([{ f: C }, { f: X1 }, { f: A }]);
{
  const text = await notice();
  const want = `Found 1 of 3 PDFs. Missing: ${D}, ${E}. 1 file is for another level. 1 file was not used.`;
  check(text === want, 'level partial notice (found, missing, other level, not used)', `${text} | want ${want}`);
  check(!(await noticeIsError()), 'partial notice is not an error');
  check((await hint()) === '2 PDFs need a file before they open. Choose them all in one step.', 'band shows the new count', String(await hint()));
  check((await openCount()) === 1 && (await chooseCount()) === 2, 'level rows: 1 Open, 2 Choose file…', `${await openCount()} / ${await chooseCount()}`);
}
await shot('b6-t01-03-level-partial');

// zero found (error style)
await reconnect([{ f: X2 }]);
{
  const text = await notice();
  const want = `Found 0 of 2 PDFs. The file you chose does not have the same name and size as a PDF of the sheets here. Missing: ${D}, ${E}. 1 file was not used.`;
  check(text === want, 'zero found notice', `${text} | want ${want}`);
  check(await noticeIsError(), 'zero found notice has the error style');
  check((await hint()) === '2 PDFs need a file before they open. Choose them all in one step.', 'zero found: band unchanged');
}
await shot('b6-t01-04-zero-found');

// building node: the pick of the level is shared. A (picked before, level 1) already counts as found.
await node('building').click();
await idle(500);
check((await hint()) === '3 PDFs need a file before they open. Choose them all in one step.', 'building node after the level pick: 3 PDFs left (A and C found)', String(await hint()));
await reconnect([{ f: B }, { f: D }, { f: E }, { f: X1 }, { f: X2 }]);
{
  const text = await notice();
  const want = 'Found all 3 PDFs. 2 files were not used.';
  check(text === want, 'building: all found, extras not used', `${text} | want ${want}`);
  check(!(await noticeIsError()), 'all found notice is not an error');
  check((await band().count()) === 0, 'all found: the band is gone');
  check((await openCount()) === 6 && (await chooseCount()) === 0, 'all rows say Open', `${await openCount()} / ${await chooseCount()}`);
}
await shot('b6-t01-05-all-found');
// repeat: open 3 sheets one after the other; the dialog stays open and the band stays gone
for (let i = 0; i < 3; i++) {
  await dlg.locator('[data-testid="open-sheet"]', { hasText: /^Open$/ }).first().click();
  await idle(1500);
  check((await dlg.count()) === 1 && (await band().count()) === 0, `open ${i + 1}: dialog open, no band`);
}
check(((await notice()) ?? '').startsWith('Opened '), 'the notice after Open says Opened', String(await notice()));
await closeDialog();

// ---------- S2: ambiguous (two files, one name and size, different time stamps) ----------
await openBuilding(buildingJson('b2', fullSheets()));
await node('building').click();
await idle(500);
await reconnect([{ f: B, m: 1 }, { f: B, m: 2 }]);
{
  const text = await notice();
  const want = `Found 0 of 5 PDFs. Missing: ${A}, ${B}, ${C} and 2 more. For ${B} you chose two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.`;
  check(text === want, 'ambiguous notice', `${text} | want ${want}`);
  check(await noticeIsError(), 'ambiguous with zero found has the error style');
  check((await hint()) === '5 PDFs need a file before they open. Choose them all in one step.', 'ambiguous: band unchanged');
  check((await dlg.locator('[data-testid="open-sheet"][aria-label^="Choose file for 01_arch_first_floor"]').count()) === 1, 'ambiguous: the row of the PDF still says Choose file…');
}
await shot('b6-t01-06-ambiguous');
await closeDialog();

// ---------- S3: one PDF ----------
await openBuilding(buildingJson('b3', [sheet('s1', 'l1', A, 0), sheet('s2', 'l1', A, 1)]));
await node('building').click();
await idle(500);
check((await hint()) === '1 PDF needs a file before it opens. Choose it again.', 'one PDF: singular hint', String(await hint()));
await reconnect([{ f: A }]);
check((await notice()) === 'Found the PDF.', 'one PDF: found text', String(await notice()));
check((await band().count()) === 0 && (await chooseCount()) === 0, 'one PDF: band gone, no row says Choose file…');
await closeDialog();

// ---------- S4: no sheets, no band ----------
await openBuilding(buildingJson('b4', []));
await node('building').click();
await idle(500);
check((await band().count()) === 0, 'no sheets: no band');
await closeDialog();

// ---------- S5: sheet with no stored size does not count ----------
await openBuilding(buildingJson('b5', [{ id: 's1', levelId: 'l1', projectUuid: null, pageIndex: 0, displayName: 'old', location: { fileName: A } }]));
await node('building').click();
await idle(500);
check((await band().count()) === 0, 'sheet without a size: no band');
await closeDialog();

await t.finish();
