// B3-T12d UI review: bounding boxes of the row cells, vertical centres, fonts, stray empty blocks, Summaries shot.
// Setup copied from b3-t12d-check.mjs. Observation only.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
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

// Cell boxes per row: x edges and vertical centre of each cell, plus the row box.
async function cellGeometry() {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="level-sheets"] [data-testid="page-row"]')];
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), cy: Math.round((b.top + b.bottom) / 2) }; };
    return rows.map((row) => ({
      file: row.querySelector('.mep-srow-file')?.textContent ?? '',
      row: r(row),
      name: r(row.querySelector('.mep-srow-name')),
      status: r(row.querySelector('.mep-srow-status')),
      open: r(row.querySelector('.mep-srow-cell--open button')),
      fix: r(row.querySelector('.mep-srow-cell--fix button')),
      move: r(row.querySelector('.mep-srow-cell--move select')),
      remove: r(row.querySelector('.mep-srow-cell--remove button')),
      fonts: {
        select: row.querySelector('select') ? getComputedStyle(row.querySelector('select')).fontFamily : '',
        name: row.querySelector('.mep-srow-file') ? getComputedStyle(row.querySelector('.mep-srow-file')).fontFamily : '',
      },
    }));
  });
}
function summarise(label, rows) {
  const cols = ['name', 'status', 'open', 'fix', 'move', 'remove'];
  const out = {};
  for (const c of cols) {
    const xs = rows.map((x) => x[c]).filter(Boolean);
    out[c] = xs.length ? { n: xs.length, leftMin: Math.min(...xs.map((x) => x.l)), leftMax: Math.max(...xs.map((x) => x.l)), rightMin: Math.min(...xs.map((x) => x.r)), rightMax: Math.max(...xs.map((x) => x.r)) } : null;
  }
  const rowsH = rows.map((x) => x.row.b - x.row.t);
  console.log(`INFO ${label} row heights min=${Math.min(...rowsH)} max=${Math.max(...rowsH)} n=${rows.length}`);
  console.log(`INFO ${label} columns ${JSON.stringify(out)}`);
  // Vertical centre spread inside each row: name vs buttons.
  const spread = rows.map((x) => {
    const cys = ['name', 'status', 'move', 'remove'].map((c) => x[c]?.cy).filter((v) => v !== undefined);
    return cys.length ? Math.max(...cys) - Math.min(...cys) : 0;
  });
  console.log(`INFO ${label} vertical centre spread across name/status/move/remove per row: max=${Math.max(...spread)} values=${JSON.stringify(spread)}`);
  return out;
}

// Setup: same as the passing check.
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

// State 1: level with the 80+ character name, 1600 x 900.
await selectLevel('Level 1');
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(1200);
const lvl = await cellGeometry();
await summarise('level 1600', lvl);
const longRow = lvl.find((x) => x.file.length >= 80);
console.log('INFO long row cells ' + JSON.stringify(longRow));
const shortRow = lvl.find((x) => x.file === 'a.pdf');
console.log('INFO short row cells ' + JSON.stringify(shortRow));
check(!!longRow && !!shortRow, 'both rows found');
const fontInfo = lvl[0].fonts;
console.log('INFO fonts ' + JSON.stringify(fontInfo));
const titleFont = await dlg.locator('[data-testid="selection-summary"] h4').evaluate((e) => getComputedStyle(e).fontFamily);
const sectHead = await dlg.locator('[data-testid="level-sheets"] .mep-bsec-head, [data-testid="level-sheets"] h4').first().evaluate((e) => getComputedStyle(e).fontFamily + ' / ' + getComputedStyle(e).fontSize);
console.log('INFO title font ' + titleFont + ' | sheets head font ' + sheetHead(sectHead));
function sheetHead(x) { return x; }

// Summaries section: scroll to it, shot.
const summ = dlg.locator('[data-testid="summaries"], [data-testid="summary-section"]').first();
const summCount = await summ.count();
console.log('INFO summaries testid count ' + summCount);
if (summCount === 0) {
  const byTitle = dlg.locator('.mep-bsec', { has: page.locator('h4', { hasText: /^Summaries$/ }) }).first();
  await byTitle.scrollIntoViewIfNeeded();
  await shot('b3-t12d-ui-review-summaries');
} else {
  await summ.scrollIntoViewIfNeeded();
  await shot('b3-t12d-ui-review-summaries');
}
// Stray empty blocks: list sections after open-documents, and empty bsec elements.
const stray = await page.evaluate(() => {
  const panel = document.querySelector('.mep-buildings-panel');
  if (!panel) return 'no panel';
  return [...panel.querySelectorAll(':scope > *')].map((el) => ({ tag: el.tagName, cls: el.className, testid: el.getAttribute('data-testid'), h: Math.round(el.getBoundingClientRect().height), text: (el.textContent ?? '').trim().slice(0, 40) }));
});
console.log('INFO panel children ' + JSON.stringify(stray));

// State 2: building view.
await selectBuilding('Tower');
const bld = await cellGeometry();
await summarise('building 1600', bld);
const hdrs = await dlg.locator('.mep-sgroup-head').evaluateAll((els) => els.map((e) => ({ text: e.textContent, h: Math.round(e.getBoundingClientRect().height), l: Math.round(e.getBoundingClientRect().left) })));
console.log('INFO group headers ' + JSON.stringify(hdrs));
await shot('b3-t12d-ui-review-building');

// State 3: 760 x 640, level view.
await page.setViewportSize({ width: 760, height: 640 });
await idle(600);
await selectLevel('Level 1');
const nar = await cellGeometry();
await summarise('level 760', nar);
const wrapped = nar.filter((x) => x.row && x.name && x.status && x.name.t !== x.status.t).length;
console.log('INFO rows whose name and status start at different tops at 760: ' + wrapped + ' of ' + nar.length);
const sample = nar.find((x) => x.file === 'a.pdf');
console.log('INFO 760 a.pdf row ' + JSON.stringify(sample));
await dlg.locator('[data-testid="open-documents"]').scrollIntoViewIfNeeded();
await shot('b3-t12d-ui-review-760-bottom');
const stray760 = await page.evaluate(() => {
  const ev = document.querySelector('[data-testid="open-documents"]');
  const out = [];
  let el = ev?.nextElementSibling;
  while (el) { const b = el.getBoundingClientRect(); out.push({ cls: el.className, h: Math.round(b.height), w: Math.round(b.width), text: (el.textContent ?? '').trim().slice(0, 20) }); el = el.nextElementSibling; }
  return out;
});
console.log('INFO siblings after Add files at 760 ' + JSON.stringify(stray760));

// Console errors are checked by lib.mjs at finish().
await t.finish();
