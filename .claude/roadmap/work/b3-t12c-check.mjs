// B3-T12c: no Close building; Export dialog Building select; Save question for an unsaved drawing; status tooltip. Real clicks and typing.
// Web stand-in: the dev store holds ONE building file. Before a switch of building the target JSON goes into the store (store.load).
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { GROUND, drawSegmentWithTool, recordSuggestedNames, openScopeDialog } from './b2-lib.mjs';
import { readXlsx } from './xlsx-read.mjs';

const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();
await recordSuggestedNames(t);

const dlg = page.locator('.mep-modal');
const readStore = () => page.evaluate(async () => (await window.__mepBuilding.read()).json);
const loadStore = (json) => page.evaluate((j) => window.__mepBuilding.store.load(j), json);
const suggestedCount = () => page.evaluate(() => (window.__suggested ?? []).length);
const activeDoc = () => page.evaluate(() => {
  const s = window.__mepSketchScene;
  const d = s.getDocuments().find((x) => x.id === s.getActiveDocumentId());
  return { name: d?.fileName ?? '', inFile: d?.projectUuidInFile ?? null, uuid: s.getProjectUuid() };
});

async function openManage() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
}
async function buildingMenuItems() {
  await dlg.locator('button.mep-menu-btn').click();
  await idle(200);
  return dlg.locator('[role="menuitem"]').allInnerTexts();
}
async function newBuilding(name, levelName, elevation) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: 'New building…' }).click();
  const nameIn = dlg.locator('input[aria-label="Building name"]');
  await nameIn.fill(name);
  await nameIn.press('Enter');
  await dlg.locator('.mep-buildings-open-name', { hasText: name }).waitFor({ timeout: 8000 });
  await idle(500);
  await dlg.locator('[data-testid="tree-add-level"]').click();
  await idle(400);
  await page.keyboard.type(levelName);
  await page.keyboard.press('Enter');
  await idle(400);
  if (elevation !== undefined) {
    const elev = dlg.locator('input[aria-label="Elevation (mm)"]');
    await elev.fill(String(elevation));
    await elev.press('Enter');
    await idle(400);
  }
}

// Step 1: one drawing, not saved. It has a segment and a scale.
await t.openPdf(GROUND, 'ground.pdf');
await drawSegmentWithTool(t, { x: 300, y: 300 }, { x: 500, y: 300 });
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
let d = await activeDoc();
check(d.inFile === false, 'the new drawing is not saved yet (the file does not hold its id)', JSON.stringify(d));

// Step 2: two buildings. Tower has two levels, Annex has one.
await openManage();
await newBuilding('Tower', 'Ground floor');
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
await page.keyboard.type('Level 1');
await page.keyboard.press('Enter');
await idle(300);
const elev = dlg.locator('input[aria-label="Elevation (mm)"]');
await elev.fill('3000');
await elev.press('Enter');
await idle(500);
const tower = JSON.parse(await readStore());
// The Ground floor sheet carries the id that the open (unsaved) drawing has in memory, as the bulk add of open documents writes it.
tower.sheets = [{ id: 's-ground', levelId: tower.levels[0].id, projectUuid: d.uuid, pageIndex: 0, displayName: 'Ground', location: { fileName: 'ground.pdf', path: 'ground.pdf' } }];
const towerJson = JSON.stringify(tower);
await loadStore(towerJson);
await newBuilding('Annex', 'Basement');
const annexLevels = JSON.parse(await readStore()).levels.map((l) => l.name);
check(annexLevels.join() === 'Basement', 'Annex has one level', annexLevels.join());

// Step 3: no Close building anywhere.
const menuItems = await buildingMenuItems();
console.log('INFO Building menu: ' + JSON.stringify(menuItems));
check(!menuItems.some((x) => /Close building/i.test(x)), 'the Building menu has no Close building', JSON.stringify(menuItems));
await shot('b3-t12c-0-menu');
await page.keyboard.press('Escape');
await idle(200);
check(!/Close building/i.test((await dlg.textContent()) ?? ''), 'the dialog text has no Close building');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });

// Step 4: the Export dialog has a Building select; Annex (the open building) first.
await openScopeDialog(t);
const buildingSel = dlg.locator('select[aria-label="Building"]');
check((await buildingSel.count()) === 1, 'the Export dialog shows a Building select');
let opts = await buildingSel.locator('option').allInnerTexts();
check(opts[0] === 'Annex' && opts.includes('Tower'), 'the open building is first, the recent one follows', JSON.stringify(opts));
const levelSel = dlg.locator('select[aria-label="Level"]');
let levelOpts = await levelSel.locator('option').allInnerTexts();
check(levelOpts.join() === 'Basement', 'Level select shows the levels of Annex', JSON.stringify(levelOpts));
await loadStore(towerJson);
await buildingSel.selectOption({ label: 'Tower' });
await until(async () => (await dlg.locator('select[aria-label="Level"] option').allInnerTexts()).join() === 'Ground floor,Level 1', 'levels of Tower', 8000);
levelOpts = await dlg.locator('select[aria-label="Level"] option').allInnerTexts();
check(levelOpts.join() === 'Ground floor,Level 1', 'after the change the Level select shows the levels of Tower (sorted by elevation)', JSON.stringify(levelOpts));
opts = await buildingSel.locator('option').allInnerTexts();
check(opts[0] === 'Tower', 'Tower is now first (open)', JSON.stringify(opts));
await shot('b3-t12c-1');
await dlg.locator('input[type=radio]').nth(2).check();
await levelSel.selectOption({ label: 'Ground floor' });
await idle(200);

// Step 5: Level export of the unsaved drawing: the question comes first. Cancel does nothing.
const before = await suggestedCount();
const statusBefore = await statusText();
await dlg.locator('button', { hasText: /^Export$/ }).click();
await idle(600);
const ask = page.locator('.mep-modal[aria-label="Save before export"]');
check((await ask.count()) === 1, 'the Save question shows for an unsaved drawing', String(await ask.count()));
const askText = (await ask.textContent()) ?? '';
check(/Save the drawing first so the export can be made\?/.test(askText), 'the question text', askText);
check(!/no file yet/i.test(askText), 'the drawing has a file, so no Save As hint', askText);
await shot('b3-t12c-2');
await ask.locator('button', { hasText: /^Cancel$/ }).click();
await idle(800);
check((await page.locator('.mep-modal').count()) === 0, 'Cancel closes the question');
check((await suggestedCount()) === before, 'Cancel starts no export');
check((await statusText()) === statusBefore, 'Cancel shows no error and no new status', `${statusBefore} -> ${await statusText()}`);
d = await activeDoc();
check(d.inFile === false, 'Cancel did not save');

// Document scope does not need a save.
await openScopeDialog(t);
await dlg.locator('input[type=radio]').nth(1).check();
await dlg.locator('button', { hasText: /^Export$/ }).click();
await until(async () => (await suggestedCount()) > before, 'document export', 30000);
await idle(1200);
check((await page.locator('.mep-modal').count()) === 0, 'Document scope exports with no question');
d = await activeDoc();
check(d.inFile === false, 'Document export did not save');

// Level export again: Save, then the export runs.
const before2 = await suggestedCount();
await openScopeDialog(t);
await dlg.locator('input[type=radio]').nth(2).check();
await dlg.locator('select[aria-label="Level"]').selectOption({ label: 'Ground floor' });
await dlg.locator('button', { hasText: /^Export$/ }).click();
await idle(600);
await ask.locator('button', { hasText: /^Save$/ }).click();
await until(async () => (await suggestedCount()) > before2, 'level export after Save', 60000);
await idle(1500);
d = await activeDoc();
check(d.inFile === true, 'Save wrote the drawing (the file holds its id)', JSON.stringify(d));
const b64 = await page.evaluate(async () => {
  const f = await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile();
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
const xlsx = readXlsx(Buffer.from(b64, 'base64'));
check((xlsx.sheets.Segments ?? []).length >= 1, 'the Level export holds the segment of the drawing', JSON.stringify(xlsx.sheets.Segments));
console.log('INFO status after export: ' + (await statusText()));

// Step 6: the status at the top right has the full text in its title, and is cut with an ellipsis.
await openScopeDialog(t);
await dlg.locator('input[type=radio]').nth(2).check();
await dlg.locator('select[aria-label="Level"]').selectOption({ label: 'Level 1' });
await dlg.locator('button', { hasText: /^Export$/ }).click();
await until(async () => /no segments|warning/i.test(await statusText()), 'long status', 20000);
await idle(300);
const st = await page.evaluate(() => {
  const el = document.querySelector('.mep-header-status');
  return { text: el?.textContent ?? '', title: el?.getAttribute('title') ?? '', tab: el?.getAttribute('tabindex'), cut: el ? el.scrollWidth > el.clientWidth : null, overflow: el ? getComputedStyle(el).textOverflow : '' };
});
console.log('INFO status: ' + JSON.stringify(st));
check(st.text.length > 0 && st.title === st.text, 'the status title holds the full text', JSON.stringify(st));
check(st.tab === '0', 'the status can take the keyboard focus', String(st.tab));
check(st.overflow === 'ellipsis', 'long text is cut with an ellipsis', st.overflow);
console.log('INFO status is cut now: ' + st.cut);
await page.locator('.mep-header-status').hover();
await idle(1200);
await shot('b3-t12c-3');

await t.finish();
