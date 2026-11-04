// B3-T11j: part check of the Building dialog. Empty profile, real clicks and typing.
// Web stand-in: the dev store holds ONE building file. A switch between buildings first puts the target's JSON into the store (store.load), then clicks the tree item once.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { makeTwoDocuments, recordSuggestedNames, openScopeDialog, dialog } from './b2-lib.mjs';
import { readXlsx } from './xlsx-read.mjs';
import { readFileSync } from 'node:fs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();
await recordSuggestedNames(t);

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const level = (name) => items('level').filter({ hasText: name });
const readStore = () => page.evaluate(async () => (await window.__mepBuilding.read()).json);
const stored = async () => JSON.parse(await readStore());
const loadStore = (json) => page.evaluate((j) => window.__mepBuilding.store.load(j), json);
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName ?? '', role: a?.getAttribute('role') ?? '', label: a?.getAttribute('aria-label') ?? '', test: a?.getAttribute('data-testid') ?? '', text: (a?.textContent ?? '').trim().slice(0, 30), inDialog: !!a?.closest('.mep-modal') };
});
const section = () => dlg.locator('[data-testid="open-documents"]');
const docRow = (name) => section().locator('[data-testid="open-doc-row"]').filter({ has: page.locator('b', { hasText: new RegExp(`^${name.replace('.', '\\.')}$`) }) });
const rowOf = (n) => dlg.locator('[data-testid="level-sheets"] [data-testid="page-row"]').filter({ hasText: n });
const activeDocName = () => page.evaluate(() => {
  const s = window.__mepSketchScene;
  const id = s.getActiveDocumentId();
  return s.getDocuments().find((d) => d.id === id)?.fileName ?? '';
});
const putFile = (name, file) => page.evaluate(async ([b64, n]) => {
  const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
  await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  await w.close();
  window.__nextFile = n;
}, [readFileSync(FIX + file).toString('base64'), name]);
const nextFile = (n) => page.evaluate((x) => { window.__nextFile = x; }, n);

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
}
async function reloadPage() {
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined);
}
async function buildingMenu(item) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: item }).click();
  await idle(300);
}
async function clipped() {
  return page.evaluate(() => {
    const modal = document.querySelector('.mep-modal').getBoundingClientRect();
    const panel = document.querySelector('.mep-buildings-panel');
    const pr = panel?.getBoundingClientRect();
    const bad = [];
    for (const el of document.querySelectorAll('.mep-modal button, .mep-modal input, .mep-modal select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.closest('.mep-tree-item') && getComputedStyle(el).visibility === 'hidden') continue;
      const name = `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20)}`;
      if (r.left < modal.left - 1 || r.right > modal.right + 1) bad.push(`${name} x`);
      else if (panel && panel.contains(el)) { if (r.left < pr.left - 1 || r.right > pr.right + 1) bad.push(`${name} panel-x`); }
    }
    return bad;
  });
}
async function readExport(count) {
  await until(async () => (await page.evaluate(() => (window.__suggested ?? []).length)) > count, 'export', 60000);
  await idle(2000);
  const b64 = await page.evaluate(async () => {
    const f = await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile();
    const bytes = new Uint8Array(await f.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const names = await page.evaluate(() => window.__suggested ?? []);
  return { xlsx: readXlsx(Buffer.from(b64, 'base64')), name: names[names.length - 1] };
}

// Step 1: three open documents (ground.pdf and first.pdf with a segment, scale and Save; m.pdf multi-page, saved).
await shot('B3-T11j-01-start');
await makeTwoDocuments(t);
await t.openPdf(FIX + 'Sample Project_multi_page.pdf', 'm.pdf');
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save m');
await idle(800);
const mPages = await page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.fileName === 'm.pdf').pageCount);
check(mPages > 1, 'm.pdf has several pages', String(mPages));
await shot('B3-T11j-02-three-documents');

// Step 2: create Tower by typing; add two levels by typing.
await openDialog();
await shot('B3-T11j-03-dialog-empty');
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameIn = dlg.locator('input[aria-label="Building name"]');
await nameIn.fill('Tower');
await nameIn.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
let a = await active();
check(a.label === 'Level name', 'a new level puts the focus in its name field', JSON.stringify(a));
await page.keyboard.type('Ground floor');
await page.keyboard.press('Enter');
await idle(400);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
await page.keyboard.type('Level 1');
await page.keyboard.press('Enter');
await idle(300);
const elev = dlg.locator('input[aria-label="Elevation (mm)"]');
await elev.fill('3000');
await elev.press('Enter');
await idle(500);
let s = await stored();
check(JSON.stringify(s.levels.map((l) => l.name)) === JSON.stringify(['Ground floor', 'Level 1']), 'two levels typed', JSON.stringify(s.levels));
check(s.levels[1].elevationMm === 3000, 'elevation typed', JSON.stringify(s.levels[1]));
await shot('B3-T11j-04-tower-levels');
const towerJson0 = await readStore();

// Step 3: second building Annex by the Building menu; one level typed.
await buildingMenu('New building…');
const name2 = dlg.locator('input[aria-label="Building name"]');
await name2.fill('Annex');
await name2.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(500);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
await page.keyboard.type('Basement');
await page.keyboard.press('Enter');
await idle(400);
const annexJson = await readStore();
check((await items('building').count()) === 2, 'tree lists two buildings', String(await items('building').count()));
await shot('B3-T11j-05-two-buildings');

// Step 4: switch to Tower by one click (store stand-in), then back to Annex and to Tower again.
await loadStore(towerJson0);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
check((await items('level').count()) === 2, 'one click on Tower: two levels', String(await items('level').count()));
await loadStore(annexJson);
await items('building').filter({ hasText: 'Annex' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(500);
check((await items('level').count()) === 1, 'one click on Annex: one level', String(await items('level').count()));
await shot('B3-T11j-06-switched-annex');
await loadStore(towerJson0);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);

// Step 5: bulk add of the three open documents to Ground floor.
await level('Ground floor').click();
await idle(500);
await shot('B3-T11j-07-before-bulk');
await section().locator('[data-testid="open-doc-add-all-docs"]').click();
await idle(1200);
s = await stored();
check(s.sheets.length === 2 + mPages, 'the bulk button added every page of three documents', `${s.sheets.length} sheets, expected ${2 + mPages}`);
check(s.sheets.every((x) => x.levelId === s.levels[0].id), 'all sheets are on Ground floor');
await shot('B3-T11j-08-after-bulk');

// Move first.pdf to Level 1 with the row select.
await rowOf('first.pdf').locator('select').selectOption({ label: 'Level 1' });
await idle(700);
s = await stored();
check(s.sheets.find((x) => x.displayName === 'first.pdf' || x.location.fileName === 'first.pdf').levelId === s.levels[1].id, 'Move to put first.pdf on Level 1');
await shot('B3-T11j-09-moved');

// Step 5b: make each open document the active one, so its summary is written at once.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });
for (const file of ['ground.pdf', 'first.pdf', 'm.pdf']) {
  await page.locator('.mep-doc-switcher-btn').click();
  await idle(300);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: file }).first().click();
  await idle(800);
  check((await activeDocName()) === file, `${file} becomes the active document`, await activeDocName());
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${file}`);
  await idle(800);
  const id = (await stored()).sheets.find((x) => x.location.fileName === file)?.projectUuid;
  const ids = await page.evaluate(async () => await window.__mepBuilding.store.listSummaries());
  check(typeof id === 'string' && ids.includes(id), `the summary of ${file} is written without a Save`, JSON.stringify(ids));
}
await openDialog();

// Step 6: open each document from a sheet.
for (const [lv, file] of [['Ground floor', 'ground.pdf'], ['Ground floor', 'm.pdf'], ['Level 1', 'first.pdf']]) {
  await level(lv).click();
  await idle(400);
  const row = rowOf(file).first();
  const btn = row.locator('[data-testid="open-sheet"]');
  const label = ((await btn.textContent()) ?? '').trim();
  const disabled = await btn.isDisabled();
  const isOpen = await page.evaluate((n) => window.__mepSketchScene.getDocuments().some((d) => d.fileName === n), file);
  check(disabled === isOpen, `${file} Open button is disabled exactly while its PDF is open`, `disabled ${disabled}, open ${isOpen}`);
  if (disabled) {
    check(label === 'Opened', `${file} shows the disabled Opened button`, label);
    await shot(`B3-T11j-10-opened-${file.replace('.pdf', '')}`);
    continue;
  }
  await nextFile(file);
  await btn.click();
  await idle(1500);
  if ((await dlg.count()) > 0 && (await dlg.locator('[data-testid="close-anyway"]').count()) > 0) await dlg.locator('[data-testid="keep-working"]').click();
  const name = await activeDocName();
  check(name === file, `Open (${label}) on ${file} activates it`, `active: ${name}`);
  await shot(`B3-T11j-10-open-${file.replace('.pdf', '')}`);
  if ((await dlg.count()) === 0) await openDialog();
}

// Step 8: read summaries if needed, then close the dialog and export Level and Building.
const header = ((await dlg.locator('.mep-buildings-header').textContent()) ?? '');
console.log('INFO header: ' + header.slice(0, 200));
const readBtn = dlg.locator('[data-testid="rebuild-summaries"]');
if ((await readBtn.count()) > 0) {
  await shot('B3-T11j-13-summaries-needed');
  await readBtn.click();
  await until(async () => /^Read \d+ of \d+ summaries|^Failed to rebuild/.test(await statusText()), 'summaries read', 60000);
  await idle(500);
  const pane = (await dlg.locator('[data-testid="summaries-pane"]').innerText().catch(() => '')) ?? '';
  check(/no path is stored for this PDF/.test(pane), 'Read summaries reports the web limit: no path is stored for this PDF', pane.slice(0, 300));
}
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });

async function exportScope2(scope, levelName) {
  const count = await page.evaluate(() => (window.__suggested ?? []).length);
  await openScopeDialog(t);
  const w1 = (await dlg.boundingBox()).width;
  await dlg.locator('input[type=radio]').nth(scope === 'level' ? 2 : 3).check();
  if (levelName) await dlg.locator('select[aria-label="Level"]').selectOption({ label: levelName });
  await idle(200);
  const w2 = (await dlg.boundingBox()).width;
  check(Math.abs(w1 - w2) < 1, `Export dialog keeps its width for ${scope}`, `${w1} ${w2}`);
  await shot(`B3-T11j-14-export-${scope}`);
  await dlg.locator('button', { hasText: /^Export$/ }).click();
  return readExport(count);
}
const lvl = await exportScope2('level', 'Ground floor');
check(lvl.name === 'Tower-Ground floor-quantities.xlsx', 'Level export file name', lvl.name);
const segL = lvl.xlsx.sheets.Segments ?? [];
check(segL.length >= 2, 'Level export has Segments rows', JSON.stringify(segL));
const bld = await exportScope2('building');
check(/^Tower-.*quantities\.xlsx$/.test(bld.name), 'Building export file name', bld.name);
const segB = bld.xlsx.sheets.Segments ?? [];
check(segB.length >= 3, 'Building export has the segments of both levels', JSON.stringify(segB));

// Step 9: a reload closes the building, then reopen it from the tree.
await openDialog();
const towerAtClose = await readStore();
await reloadPage();
await openDialog();
check(/No building is open/.test((await dlg.textContent()) ?? ''), 'a reload closes the building');
await shot('B3-T11j-15-closed');
await loadStore(towerAtClose);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
check((await items('level').count()) === 2, 'reopen from the tree: two levels', String(await items('level').count()));
await shot('B3-T11j-16-reopened');

// Step 7: delete a PDF and relink. Add temp.pdf with Add PDFs…, assign to Level 1, delete the file, refresh, relink.
await putFile('temp.pdf', '01_arch_first_floor.pdf');
const cur = await stored();
cur.sheets.push({ id: 'sx-temp', levelId: cur.levels[1].id, projectUuid: null, pageIndex: 0, displayName: 'temp.pdf', location: { fileName: 'temp.pdf', path: 'temp.pdf' } });
await loadStore(JSON.stringify(cur));
await reloadPage();
await openDialog();
await loadStore(JSON.stringify(cur));
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(600);
await level('Level 1').click();
await idle(400);
await page.evaluate(async () => { await (await navigator.storage.getDirectory()).removeEntry('temp.pdf'); });
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(900);
const tempStatus = await rowOf('temp.pdf').locator('[data-testid="sheet-status"]').getAttribute('data-status');
await shot('B3-T11j-11-after-delete');
check(tempStatus === 'pdf-missing', 'a deleted PDF shows Missing', String(tempStatus));
await putFile('temp2.pdf', '01_arch_first_floor.pdf');
await rowOf('temp.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1200);
s = await stored();
check(s.sheets.some((x) => x.location.fileName === 'temp2.pdf'), 'Relink stored temp2.pdf');
await shot('B3-T11j-12-relinked');
await rowOf('temp2.pdf').first().locator('button', { hasText: /^Remove$/ }).click();
await idle(500);
s = await stored();
check(!s.sheets.some((x) => x.id === 'sx-temp'), 'Remove deletes the temp sheet');
await shot('B3-T11j-12b-after-relink-removed');

// Step 10: keyboard walk (wide).
await page.keyboard.press('Escape');
await idle(300);
check((await dlg.count()) === 0, 'Escape closes the dialog');
await openDialog();
a = await active();
check(a.role === 'treeitem', 'the dialog opens with the focus in the tree', JSON.stringify(a));
const path = [];
let outside = null;
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const x = await active();
  path.push(`${x.tag}:${x.label || x.test || x.text}`);
  if (!x.inDialog) {
    outside = x;
    break;
  }
}
console.log('INFO tab path: ' + JSON.stringify(path));
console.log('INFO tab outside: ' + JSON.stringify(outside));
check(path.some((p) => p === 'BUTTON:Close'), 'Tab reaches the Close button', JSON.stringify(path));
check(!path.some((p) => p.startsWith('BODY')), 'Tab never drops to body while inside the dialog', JSON.stringify(path));
await shot('B3-T11j-17-tab-walk');
await items('building').first().focus();
await page.keyboard.press('Shift+Tab');
a = await active();
check(a.inDialog && a.test === 'building-name-header-rename', 'Shift+Tab from the first tree item goes to the Rename building button', JSON.stringify(a));
await level('Ground floor').focus();
await page.keyboard.press('ArrowDown');
a = await active();
check(a.role === 'treeitem', 'ArrowDown moves between tree items', JSON.stringify(a));
await page.keyboard.press('Enter');
await idle(300);
check((await dlg.locator('[data-testid="selection-summary"] h4').textContent())?.length > 0, 'Enter selects a node');
// Add a PDF with the level selected: it is placed at once, so Close asks nothing.
await items('building').filter({ hasText: 'Tower' }).click();
await idle(300);
check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'the building node offers no Add PDFs button');
await level('Ground floor').click();
await idle(300);
await putFile('wait.pdf', 'arch_simple_A4.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.some((x) => x.location.fileName === 'wait.pdf'), 'wait.pdf added', 20000);
await idle(800);
a = await active();
check(a.tag !== 'BODY', 'focus is not on body after Add PDFs…', JSON.stringify(a));
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 8000 });
check((await dlg.count()) === 0, 'Close closes the dialog: no PDF is waiting');
await shot('B3-T11j-18-ask');
// Escape: the dialog stays closed.
await page.keyboard.press('Escape');
await idle(300);
check((await dlg.count()) === 0, 'Escape keeps the closed dialog closed');
a = await active();
console.log('INFO focus after the dialog closes: ' + JSON.stringify(a));

// Step 11: reopen the building, then the 760x640 run.
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'ground.pdf');
await openDialog();
await loadStore(towerJson0);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
await page.keyboard.press('Escape');
await idle(300);
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
await openDialog();
const sel = dlg.locator('select[aria-label="Building or level"]');
check((await sel.count()) === 1, 'narrow: a select replaces the tree');
const opts = await sel.locator('option').allInnerTexts();
await sel.selectOption({ index: opts.findIndex((x) => /Ground floor/.test(x)) });
await idle(500);
check((await clipped()).length === 0, 'narrow: no clipped control', JSON.stringify(await clipped()));
const box = await dlg.boundingBox();
check(box.width <= 760 && box.height <= 640, 'narrow: dialog fits the window', JSON.stringify(box));
await shot('B3-T11j-19-narrow-level');
await sel.selectOption({ index: 0 });
await idle(400);
await shot('B3-T11j-20-narrow-building');
await page.keyboard.press('Escape');
await idle(300);
await openScopeDialog(t);
const sb = await dlg.boundingBox();
check(sb.width <= 760, 'narrow: Export dialog fits', JSON.stringify(sb));
await shot('B3-T11j-21-narrow-export');
await page.keyboard.press('Escape');
await idle(300);
const dev = await page.evaluate(() => typeof window.__mepBuilding);
console.log('INFO dev hook type in dev server: ' + dev);

await t.finish();
