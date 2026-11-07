// B3-T11f: open documents list and one-step Add to level. Real clicks and real selects. 3 documents (one multi-page, one unsaved), no file picker call.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const section = () => dlg.locator('[data-testid="open-documents"]');
const docRow = (name) => section().locator('[data-testid="open-doc-row"]').filter({ has: page.locator('b', { hasText: new RegExp(`^${name.replace('.', '\\.')}$`) }) });
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const uuid = () => page.evaluate(() => window.__mepSketchScene.getProjectUuid());
const levelItem = (name) => dlg.locator('[role="treeitem"][data-kind="level"]', { hasText: name });
const pane = () => page.locator('.mep-buildings-panel');

async function saveActive(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
}

// Three documents: g.pdf (saved, has an id), f.pdf (not saved, no id, no path), m.pdf (multi-page, saved, active).
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'g.pdf');
await saveActive('g');
const UG = await uuid();
await t.openPdf(FIX + '01_arch_first_floor.pdf', 'f.pdf');
await t.openPdf(FIX + 'Sample Project_multi_page.pdf', 'm.pdf');
await saveActive('m');
const UM = await uuid();
const mPages = await page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.fileName === 'm.pdf').pageCount);
check(mPages > 1, 'm.pdf has several pages', String(mPages));
check(UG !== UM, 'g.pdf and m.pdf have different ids', JSON.stringify({ UG, UM }));

// An empty building with no level.
const empty = { schemaVersion: 1, id: 'b-t11f', name: 'Tower', levels: [], sheets: [], risers: [] };
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(empty));
await idle(400);
await page.evaluate(() => {
  window.__pickCalls = 0;
  for (const k of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) {
    const orig = window[k];
    window[k] = (...a) => { window.__pickCalls += 1; return orig?.apply(window, a); };
  }
});

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(700);

check((await section().count()) === 1, 'the section "Open in the viewer" exists');
check(/Add a level first/.test((await section().textContent()) ?? ''), 'no level: the section says "Add a level first"');
await shot('B3-T11f-no-level');
await section().locator('[data-testid="open-doc-add-level"]').click();
await idle(600);
check((await stored()).levels.length === 1, 'the Add level button added one level', JSON.stringify((await stored()).levels));
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(600);
check((await stored()).levels.length === 2, 'a second level exists');
const levels = (await stored()).levels;
const L1 = levels[0];
const L2 = levels[1];
await levelItem(L1.name).click();
await idle(400);

// The rows.
check((await section().locator('[data-testid="open-doc-row"]').count()) === 3, 'three document rows');
check((await docRow('m.pdf').locator('[data-testid="open-doc-active"]').count()) === 1, 'm.pdf has the Active marker');
check((await section().locator('[data-testid="open-doc-active"]').count()) === 1, 'only one Active marker');
check(new RegExp(`${mPages} pages: 0 placed`).test((await docRow('m.pdf').locator('[data-testid="open-doc-placed"]').textContent()) ?? ''), 'm.pdf shows "N pages: 0 placed"', (await docRow('m.pdf').locator('[data-testid="open-doc-placed"]').textContent()) ?? '');
check(/Save it to link it/.test((await docRow('f.pdf').textContent()) ?? ''), 'f.pdf (no id) says "Save it to link it"');
check((await docRow('g.pdf').locator('[data-testid="open-doc-note"]').count()) === 0, 'g.pdf (has an id) has no "Save it" note');
check((await docRow('f.pdf').locator('[data-testid="open-doc-add"]').textContent())?.trim() === `Add to ${L1.name}`, 'primary button says "Add to <level>"', (await docRow('f.pdf').locator('[data-testid="open-doc-add"]').textContent()) ?? '');
check((await docRow('m.pdf').locator('[data-testid="open-doc-add"]').textContent())?.trim() === 'Add all pages', 'multi-page button says "Add all pages"');
check((await docRow('m.pdf').locator('[data-testid="open-doc-page-chip"]').count()) === mPages, 'm.pdf shows one chip for each page');
check(/Add all open documents to /.test((await section().locator('[data-testid="open-doc-add-all-docs"]').textContent()) ?? ''), 'the header button says "Add all open documents to <level>"');

// Reach and clip checks: the primary buttons sit inside the visible pane with no scroll.
async function insideVisiblePane(locator, what) {
  const p = await pane().boundingBox();
  const b = await locator.boundingBox();
  const ok = b !== null && p !== null && b.y >= p.y - 1 && b.y + b.height <= p.y + p.height + 1 && b.x >= p.x - 1 && b.x + b.width <= p.x + p.width + 1;
  check(ok, `${what} sits inside the visible pane`, JSON.stringify({ p, b }));
}
await pane().evaluate((el) => { el.scrollTop = 0; });
await idle(200);
for (const n of ['g.pdf', 'f.pdf', 'm.pdf']) await insideVisiblePane(docRow(n).locator('[data-testid="open-doc-add"]'), `${n} primary button`);
await insideVisiblePane(section().locator('[data-testid="open-doc-add-all-docs"]'), 'the Add all open documents button');
await shot('B3-T11f-rows');

// Double click on a document without id and path: one sheet only.
await docRow('f.pdf').locator('[data-testid="open-doc-add"]').dblclick();
await idle(700);
let s = await stored();
check(s.sheets.length === 1, 'double click on f.pdf adds one sheet only', String(s.sheets.length));
check(typeof s.sheets[0].projectUuid === 'string' && s.sheets[0].idMinted === true && s.sheets[0].location.path === undefined && s.sheets[0].location.fileName === 'f.pdf', 'f.pdf sheet: runtime id minted, no path, file name f.pdf', JSON.stringify(s.sheets[0]));
check(s.sheets[0].levelId === L1.id, 'f.pdf sheet is on the selected level');
check((await docRow('f.pdf').locator('[data-testid="open-doc-placed"]').textContent())?.trim() === `Placed on ${L1.name}`, 'f.pdf now shows "Placed on <level>"');
check(await docRow('f.pdf').locator('[data-testid="open-doc-add"]').isDisabled(), 'f.pdf primary button is disabled when it is on the level');
check(/Added 1 sheet to /.test((await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? ''), 'a notice says "Added 1 sheet"');

// One page of the multi-page document.
await docRow('m.pdf').locator('[data-testid="open-doc-page-chip"]').nth(1).click();
await idle(600);
s = await stored();
const m2 = s.sheets.find((x) => x.projectUuid === UM);
check(s.sheets.length === 2 && m2?.pageIndex === 1 && m2.displayName === 'm.pdf p2', 'chip p2 added one sheet with pageIndex 1 and name "m.pdf p2"', JSON.stringify(s.sheets));
check(new RegExp(`${mPages} pages: 1 placed`).test((await docRow('m.pdf').locator('[data-testid="open-doc-placed"]').textContent()) ?? ''), 'm.pdf shows "N pages: 1 placed"');

// Add all open documents.
await section().locator('[data-testid="open-doc-add-all-docs"]').click();
await idle(800);
s = await stored();
const expected = 1 + mPages; // f + all pages of m + g
check(s.sheets.length === expected + 1 - 1 + 0 || s.sheets.length === mPages + 2, 'Add all: g.pdf and the rest of m.pdf added', `${s.sheets.length} sheets, expected ${mPages + 2}`);
check(s.sheets.length === mPages + 2, 'total sheets = pages of m + g + f', String(s.sheets.length));
const g = s.sheets.find((x) => x.location.fileName === 'g.pdf');
check(g?.projectUuid === UG && g.pageIndex === 0, 'g.pdf sheet holds the id of the document', JSON.stringify(g));
const ms = s.sheets.filter((x) => x.projectUuid === UM);
check(ms.length === mPages && new Set(ms.map((x) => x.pageIndex)).size === mPages, 'every page of m.pdf is one sheet with the document id');
check(s.sheets.every((x) => x.levelId === L1.id), 'all sheets are on the selected level');
check(await section().locator('[data-testid="open-doc-add-all-docs"]').isDisabled(), 'Add all open documents is disabled when nothing is left');
check((await page.evaluate(() => window.__pickCalls)) === 0, 'no file picker call', String(await page.evaluate(() => window.__pickCalls)));
await shot('B3-T11f-added');

// Already a sheet on another level: the button is "Move to <level>".
await levelItem(L2.name).click();
await idle(500);
check((await docRow('g.pdf').locator('[data-testid="open-doc-add"]').textContent())?.trim() === `Move to ${L2.name}`, 'g.pdf on another level: "Move to <level>"', (await docRow('g.pdf').locator('[data-testid="open-doc-add"]').textContent()) ?? '');
check(/Level|First|Ground/.test((await docRow('g.pdf').locator('[data-testid="open-doc-placed"]').textContent()) ?? ''), 'g.pdf shows the level where it is placed');
await docRow('g.pdf').locator('[data-testid="open-doc-add"]').click();
await idle(700);
s = await stored();
check(s.sheets.find((x) => x.location.fileName === 'g.pdf').levelId === L2.id, 'Move to changed the level of g.pdf');
check(s.sheets.length === mPages + 2, 'Move to added no sheet');
// A chip of the multi-page document moves one page.
await docRow('m.pdf').locator('[data-testid="open-doc-page-chip"]').nth(2).click();
await idle(700);
s = await stored();
check(s.sheets.find((x) => x.projectUuid === UM && x.pageIndex === 2).levelId === L2.id, 'a chip moved page 3 of m.pdf');
// The level select for another level.
await docRow('f.pdf').locator('[data-testid="open-doc-level"]').selectOption({ label: L1.name });
await idle(700);
check(s.sheets.length === (await stored()).sheets.length, 'the level select moves, it does not add');
await shot('B3-T11f-level2');

// Dirty note: a change after the Save.
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
await idle(500);
check(/Unsaved changes\. The summary updates when you save\./.test((await dlg.textContent()) ?? ''), 'a dirty document shows the unsaved note');

// 760x640.
await page.setViewportSize({ width: 760, height: 640 });
await idle(600);
const picker = dlg.locator('select[aria-label="Building or level"]');
const l1Value = await picker.locator('option').evaluateAll((opts, n) => opts.find((o) => o.textContent.trim().startsWith(n))?.value ?? '', L1.name);
await picker.selectOption(l1Value);
await idle(500);
const widths = await pane().evaluate((el) => [el.scrollWidth, el.clientWidth]);
check(widths[0] <= widths[1] + 1, 'narrow: the pane has no horizontal scroll', JSON.stringify(widths));
await section().scrollIntoViewIfNeeded();
await idle(300);
await insideVisiblePane(docRow('m.pdf').locator('[data-testid="open-doc-add"]'), 'narrow: m.pdf primary button');
await shot('B3-T11f-narrow');

await t.finish();
