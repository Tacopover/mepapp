// B3-T12d: layout of the right pane of the Building dialog. Bounding boxes, real DOM.
// Web stand-in: the dev store holds ONE building file. The test building is made in the UI, then edited as JSON and put back with store.load.
import { open } from '../browser/lib.mjs';
import { readFileSync } from 'node:fs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const readStore = () => page.evaluate(async () => (await window.__mepBuilding.read()).json);
const loadStore = (json) => page.evaluate((j) => window.__mepBuilding.store.load(j), json);
const putFile = (name, file) => page.evaluate(async ([b64, n]) => {
  const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
  await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  await w.close();
}, [readFileSync(FIX + file).toString('base64'), name]);
const box = (loc) => loc.first().boundingBox();
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
}
async function buildingMenu(item) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: item }).click();
  await idle(300);
}
async function selectLevel(name) {
  const sel = dlg.locator('select[aria-label="Building or level"]');
  if ((await sel.count()) > 0) {
    const opts = await sel.locator('option').allInnerTexts();
    await sel.selectOption({ index: opts.findIndex((x) => x.includes(name)) });
  } else {
    await items('level').filter({ hasText: name }).click();
  }
  await idle(500);
}
async function selectBuilding(name) {
  const sel = dlg.locator('select[aria-label="Building or level"]');
  if ((await sel.count()) > 0) {
    const opts = await sel.locator('option').allInnerTexts();
    await sel.selectOption({ index: opts.findIndex((x) => x.startsWith(name)) });
  } else {
    await items('building').filter({ hasText: name }).click();
  }
  await idle(500);
}

/** Right edges and left edges of the cells of every sheet row, from the DOM. */
async function rowGeometry() {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="level-sheets"] [data-testid="page-row"]')];
    return rows.map((row) => {
      const rr = row.getBoundingClientRect();
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const remove = rect(row.querySelector('.mep-srow-cell--remove button'));
      const move = rect(row.querySelector('.mep-srow-cell--move select'));
      const open = rect(row.querySelector('.mep-srow-cell--open button'));
      const status = rect(row.querySelector('.mep-srow-status'));
      const name = rect(row.querySelector('.mep-srow-name'));
      const file = row.querySelector('.mep-srow-file');
      return {
        text: file?.textContent ?? '',
        rowRight: rr.right, rowLeft: rr.left, rowH: rr.height,
        removeRight: remove?.right, removeLeft: remove?.left,
        moveRight: move?.right, moveLeft: move?.left,
        openLeft: open?.left, openRight: open?.right,
        statusLeft: status?.left,
        nameRight: name?.right, nameLeft: name?.left,
        scrollOver: row.scrollWidth > row.clientWidth + 1,
        fileCut: file ? file.scrollWidth > file.clientWidth + 1 : false,
        title: row.getAttribute('title') ?? '',
      };
    });
  });
}
function sameCol(rows, key, label) {
  const values = rows.map((r) => r[key]).filter((v) => v !== undefined);
  const spread = Math.max(...values) - Math.min(...values);
  check(values.length === rows.length && spread <= 1.5, label, `n=${values.length}/${rows.length} spread=${spread.toFixed(2)}`);
}
async function overflow() {
  return page.evaluate(() => {
    const out = [];
    for (const sel of ['.mep-buildings-panel', '.mep-buildings-layout', '.mep-modal-body', '.mep-modal']) {
      const el = document.querySelector(sel);
      if (el && el.scrollWidth > el.clientWidth + 1) out.push(`${sel} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out;
  });
}
async function closeVisible() {
  const b = await page.locator('.mep-modal .mep-modal-actions button', { hasText: /^Close$/ }).boundingBox();
  const vp = page.viewportSize();
  return b !== null && b.y >= 0 && b.y + b.height <= vp.height && b.x >= 0 && b.x + b.width <= vp.width;
}

// Setup: two open documents, then a building with two levels typed in the UI.
await page.setViewportSize({ width: 1600, height: 900 });
await putFile('temp.pdf', '01_arch_first_floor.pdf');
await openDialog();
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameIn = dlg.locator('input[aria-label="Building name"]');
await nameIn.fill('Tower');
await nameIn.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
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

// Edit the JSON: 30 sheets on Level 1 (long and short names, some files missing), 6 on Ground floor. Then put it back through a switch.
const tower = JSON.parse(await readStore());
const g = tower.levels.find((l) => l.name === 'Ground floor');
const l1 = tower.levels.find((l) => l.name === 'Level 1');
const LONG = 'Mechanical-ventilation-layout-main-distribution-floor-plan-revision-C-final-issue-2026-11-04'.slice(0, 84) + '.pdf';
const sheet = (id, levelId, fileName, path, page) => ({ id, levelId, projectUuid: null, pageIndex: page, displayName: fileName, location: { fileName, path } });
tower.sheets = [];
for (let i = 0; i < 30; i++) {
  const name = i === 0 ? 'a.pdf' : i === 1 ? LONG : i % 3 === 0 ? 'temp.pdf' : `plan-${i}.pdf`;
  tower.sheets.push(sheet(`sx-l1-${i}`, l1.id, name, i % 3 === 0 && i > 1 ? 'temp.pdf' : name, i));
}
for (let i = 0; i < 6; i++) tower.sheets.push(sheet(`sx-g-${i}`, g.id, i === 0 ? LONG : `ground-${i}.pdf`, i % 2 === 0 ? 'temp.pdf' : `ground-${i}.pdf`, i));
check(LONG.length >= 80, 'the long name has 80 or more characters', String(LONG.length));
const towerJson = JSON.stringify(tower);
await buildingMenu('New building…');
const n2 = dlg.locator('input[aria-label="Building name"]');
await n2.fill('Annex');
await n2.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(500);
await loadStore(towerJson);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(1500);

// 1600 x 900, a level with 30 sheets.
await selectLevel('Level 1');
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(1200);
const panel = dlg.locator('.mep-buildings-panel');
const sections = await panel.locator('> .mep-bsec').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
check(sections[0] === 'selection-summary', 'the first section of the level pane is the Level section', JSON.stringify(sections));
check(sections.indexOf('level-sheets') > 0 && sections[sections.length - 1] === 'open-documents', 'order: Level, Sheets, ..., Add files last', JSON.stringify(sections));
const levelSec = await box(dlg.locator('[data-testid="selection-summary"]'));
const sheetsSec = await box(dlg.locator('[data-testid="level-sheets"]'));
const nameBox = await box(dlg.locator('input[aria-label="Level name"]'));
const elevBox = await box(dlg.locator('input[aria-label="Elevation (mm)"]'));
check(nameBox.y + nameBox.height <= sheetsSec.y && elevBox.y + elevBox.height <= sheetsSec.y, 'Name and Elevation sit above the Sheets section');
check(nameBox.y >= levelSec.y && elevBox.y + elevBox.height <= levelSec.y + levelSec.height, 'Name and Elevation sit inside the Level section');
check(near(nameBox.y, elevBox.y, 3) && elevBox.x > nameBox.x + nameBox.width, 'Name and Elevation are side by side', JSON.stringify({ nameBox, elevBox }));
check((await dlg.locator('[data-testid="selection-summary"] h4').textContent()) === 'Level 1', 'the title bar shows the level name');

const rows = await rowGeometry();
check(rows.length === 30, 'the level shows 30 sheet rows', String(rows.length));
check(rows.some((r) => r.text === 'a.pdf') && rows.some((r) => r.text.length >= 80), 'a short and an 80-character name are both shown');
sameCol(rows, 'removeRight', 'Remove buttons share one right edge in all rows');
sameCol(rows, 'moveRight', 'Move to selects share one right edge');
sameCol(rows, 'moveLeft', 'Move to selects share one left edge');
sameCol(rows, 'openLeft', 'Open buttons share one left edge');
sameCol(rows, 'statusLeft', 'status cells share one left edge');
sameCol(rows, 'nameRight', 'the name cells share one right edge');
check(rows.every((r) => r.nameRight <= r.statusLeft), 'a name never runs into the status column');
check(rows.some((r) => r.fileCut) && rows.filter((r) => r.text.length >= 80).every((r) => r.title.includes(r.text)), 'a long name is cut with an ellipsis and the row title has the full name');
check(rows.every((r) => !r.scrollOver), 'no row has inner overflow');
const statuses = await dlg.locator('[data-testid="sheet-status"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-status')))]);
console.log('INFO statuses: ' + JSON.stringify(statuses));
const fixLefts = await dlg.locator('[data-testid="level-sheets"] .mep-srow-cell--fix button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
check(fixLefts.length > 0 && new Set(fixLefts).size === 1, 'Relink buttons (Missing rows) line up in one column', JSON.stringify(fixLefts.slice(0, 5)));
const missingRow = dlg.locator('[data-testid="page-row"]').filter({ has: page.locator('[data-status="pdf-missing"]') }).first();
if ((await missingRow.count()) > 0) {
  const tone = await missingRow.locator('[data-testid="sheet-status"]').evaluate((e) => getComputedStyle(e).color);
  const okRow = dlg.locator('[data-testid="page-row"]').filter({ has: page.locator('[data-status="ok"]') }).first();
  const okTone = (await okRow.count()) > 0 ? await okRow.locator('[data-testid="sheet-status"]').evaluate((e) => getComputedStyle(e).color) : '';
  check(tone !== okTone, 'a Missing status has the warning colour', `${tone} vs ${okTone}`);
}

const addSec = await box(dlg.locator('[data-testid="open-documents"]'));
check(addSec.y >= sheetsSec.y + (await box(dlg.locator('[data-testid="level-sheets"]'))).height - 1, 'the Add files strip is below the Sheets section');
const sheetsFull = await box(dlg.locator('[data-testid="level-sheets"]'));
check(addSec.height < sheetsFull.height / 2, 'the Add files strip is less than half as high as the Sheets section', `${addSec.height} vs ${sheetsFull.height}`);
const addTitle = await dlg.locator('[data-testid="open-documents"] h4').textContent();
check(addTitle === 'Add files', 'the strip title is Add files', addTitle);
check((await dlg.locator('[data-testid="open-documents"] [data-testid="add-actions"] button', { hasText: /^Add PDFs…$/ }).count()) === 1, 'Add PDFs… is in the strip');
check((await dlg.locator('[data-testid="open-docs-toggle"]').count()) === 1 && (await dlg.locator('[data-testid="open-doc-row"]').count()) === 0, 'the open documents strip lists no Untitled document (no PDF is open)');
const quietSize = await dlg.locator('[data-testid="open-documents"] [data-testid="add-actions"] button').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
const mainSize = await dlg.locator('[data-testid="level-sheets"] .mep-srow button').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
check(quietSize <= mainSize, 'the strip buttons are not larger than the main buttons', `${quietSize} vs ${mainSize}`);

// Sections differ from the page.
const look = await page.evaluate(() => {
  const sec = document.querySelector('.mep-buildings-panel > .mep-bsec');
  const head = sec.querySelector('.mep-bsec-head');
  const modal = document.querySelector('.mep-modal');
  const cs = getComputedStyle(sec);
  return { border: cs.borderTopWidth + ' ' + cs.borderTopColor, headBg: getComputedStyle(head).backgroundColor, modalBg: getComputedStyle(modal).backgroundColor };
});
check(parseFloat(look.border) > 0 && look.headBg !== look.modalBg, 'a section has a border and its title bar differs from the page background', JSON.stringify(look));
const gaps = await panel.locator('> .mep-bsec').evaluateAll((els) => els.slice(1).map((el, i) => Math.round(el.getBoundingClientRect().top - els[i].getBoundingClientRect().bottom)));
check(gaps.length > 0 && new Set(gaps.slice(0, -1).concat(gaps.slice(-1))).size <= 2 && gaps.every((x) => x >= 6), 'the gaps between sections are consistent', JSON.stringify(gaps));
check(await closeVisible(), 'Close stays visible at 1600 x 900');
await shot('b3-t12d-1');

// Hover and focus state of a row.
const row3 = dlg.locator('[data-testid="level-sheets"] [data-testid="page-row"]').nth(2);
await row3.scrollIntoViewIfNeeded();
const bgBefore = await row3.evaluate((e) => getComputedStyle(e).backgroundColor);
await row3.hover();
await idle(200);
const bgHover = await row3.evaluate((e) => getComputedStyle(e).backgroundColor);
check(bgBefore !== bgHover, 'a hovered row changes its background', `${bgBefore} -> ${bgHover}`);
await row3.locator('select').focus();
await page.keyboard.press('Tab');
const ring = await row3.evaluate((e) => getComputedStyle(e).outlineStyle + ' ' + getComputedStyle(e).outlineWidth);
check(/solid/.test(ring) && !/ 0px/.test(ring), 'a row with the focus shows a ring', ring);
const focusRing = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, style: cs.outlineStyle, width: cs.outlineWidth }; });
check(focusRing.style === 'solid', 'the focused button shows its own ring', JSON.stringify(focusRing));

// Typing in Name and Elevation still works.
const lvlName = dlg.locator('input[aria-label="Level name"]');
await lvlName.fill('Level one');
await lvlName.press('Enter');
await idle(500);
check((await dlg.locator('[data-testid="selection-summary"] h4').textContent()) === 'Level one', 'typing a new level name updates the title bar');
await lvlName.fill('Level 1');
await lvlName.press('Enter');
await idle(400);

// Building selected.
await selectBuilding('Tower');
const bSections = await panel.locator('> .mep-bsec').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
check(bSections[0] === 'selection-summary' && bSections.includes('level-sheets') && bSections[bSections.length - 1] === 'open-documents', 'building: Building section first, Sheets, Add files last', JSON.stringify(bSections));
check((await dlg.locator('[data-testid="selection-summary"] .mep-bsec-kind').textContent()) === 'Building', 'the first section says Building');
const groupsB = await dlg.locator('[data-testid="level-group"]').evaluateAll((els) => els.map((el) => el.querySelector('.mep-sgroup-head b')?.textContent));
check(JSON.stringify(groupsB) === JSON.stringify(['Ground floor', 'Level 1']), 'building: sheets are grouped by level with a header row', JSON.stringify(groupsB));
const rowsB = await rowGeometry();
check(rowsB.length === 36, 'building: 36 sheet rows', String(rowsB.length));
sameCol(rowsB, 'removeRight', 'building: Remove buttons share one right edge');
sameCol(rowsB, 'moveRight', 'building: Move to selects share one right edge');
const headBoxes = await dlg.locator('.mep-sgroup-head').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
check(headBoxes.length === 2 && headBoxes.every((h) => h > 16), 'building: each level header row is visible', JSON.stringify(headBoxes));
const addB = await box(dlg.locator('[data-testid="open-documents"]'));
const sheetsB = await box(dlg.locator('[data-testid="level-sheets"]'));
check(addB.y >= sheetsB.y + sheetsB.height - 1 && addB.height < sheetsB.height / 2, 'building: the Add files strip is below and small', `${addB.height} vs ${sheetsB.height}`);
await shot('b3-t12d-2');

// 1100 x 700: long names.
await page.setViewportSize({ width: 1100, height: 700 });
await idle(600);
await selectLevel('Ground floor');
await dlg.locator('[data-testid="level-sheets"]').scrollIntoViewIfNeeded();
const rowsM = await rowGeometry();
sameCol(rowsM, 'removeRight', '1100: Remove buttons share one right edge');
sameCol(rowsM, 'moveRight', '1100: Move to selects share one right edge');
check((await overflow()).length === 0, '1100: no horizontal overflow', JSON.stringify(await overflow()));
check(await closeVisible(), 'Close stays visible at 1100 x 700');
await shot('b3-t12d-4');

// 760 x 640: the select replaces the tree.
await page.setViewportSize({ width: 760, height: 640 });
await idle(600);
await selectLevel('Level 1');
const rowsN = await rowGeometry();
check(rowsN.length === 30, '760: 30 rows', String(rowsN.length));
sameCol(rowsN, 'removeRight', '760: Remove buttons share one right edge');
sameCol(rowsN, 'moveRight', '760: Move to selects share one right edge');
check(rowsN.every((r) => r.removeRight <= r.rowRight + 0.5 && r.removeLeft >= r.rowLeft - 0.5), '760: every Remove button is inside its row');
check((await overflow()).length === 0, '760: no horizontal overflow in the pane', JSON.stringify(await overflow()));
check(await closeVisible(), 'Close stays visible at 760 x 640');
const nameN = await box(dlg.locator('input[aria-label="Level name"]'));
const elevN = await box(dlg.locator('input[aria-label="Elevation (mm)"]'));
check(near(nameN.y, elevN.y, 3), '760: Name and Elevation stay side by side', JSON.stringify({ nameN, elevN }));
await shot('b3-t12d-3');
await dlg.locator('[data-testid="open-documents"]').scrollIntoViewIfNeeded();
await shot('b3-t12d-3b');

// Keyboard: Tab from the Name field reaches the Add PDFs button and never drops to body.
await page.setViewportSize({ width: 1600, height: 900 });
await idle(600);
await selectLevel('Level 1');
await dlg.locator('input[aria-label="Level name"]').focus();
let reached = false;
let dropped = false;
for (let i = 0; i < 160 && !reached; i++) {
  await page.keyboard.press('Tab');
  const a = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: (document.activeElement?.textContent ?? '').trim(), inDialog: !!document.activeElement?.closest('.mep-modal') }));
  if (a.tag === 'BODY') dropped = true;
  if (a.text === 'Add PDFs…') reached = true;
}
check(reached && !dropped, 'Tab walks from Name through the sheet rows to Add PDFs… and never drops to body');

await t.finish();
