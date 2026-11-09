// B3-T11g: add PDFs on a level. The pages go on the level at once. Real clicks and real selects. Picker stub (OPFS), one file at a time.
import { readFileSync } from 'node:fs';
import { open } from '../browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const sheetsBlock = () => dlg.locator('[data-testid="level-sheets"]');
const groups = () => sheetsBlock().locator('[data-testid="pdf-group"]');
const notPlacedNode = () => dlg.locator('[role="treeitem"]', { hasText: 'Not placed' });
const addResult = async () => ((await dlg.locator('[data-testid="add-result"]').textContent().catch(() => '')) ?? '');
const b64 = (file) => readFileSync(FIX + file).toString('base64');

async function addPdf(name, file) {
  await page.evaluate(
    async ([data, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
      window.__nextFile = n;
    },
    [b64(file), name],
  );
  await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
  await idle(900);
}

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Tower');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });

// Two levels by typing.
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const add = dlg.locator('[data-testid="tree-add-level"]');
const row = dlg.locator('[data-testid="level-row"]');
await add.click();
await idle(300);
await add.click();
await idle(300);
await items('level').nth(0).click();
await idle(300);
const n0 = row.locator('input[aria-label="Level name"]');
await n0.fill('Ground floor');
await n0.press('Enter');
await idle(300);
await items('level').nth(1).click();
await idle(300);
const n1 = row.locator('input[aria-label="Level name"]');
await n1.fill('Level 1');
await n1.press('Tab');
await idle(300);
await items('building').first().click();
await idle(300);

// The building node offers no add. The add-hint says to select a level.
check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'building selected: no Add PDFs… button');
check(/Select a level to add PDFs\./.test((await dlg.locator('[data-testid="add-hint"]').textContent().catch(() => '')) ?? ''), 'building selected: the add-hint says to select a level');

// Level 1 selected: Add PDFs… is in the open documents section.
await items('level').nth(1).click();
await idle(300);
const section = dlg.locator('[data-testid="open-documents"]');
check((await section.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 1, 'level selected: Add PDFs… is in the open documents section');
check((await dlg.locator('[data-testid="level-sheets"] button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'no Add PDFs… in the sheets block');
check((await notPlacedNode().count()) === 0, 'no Not placed node before an add');
check((await dlg.locator('[data-testid="sheets-pane"]').count()) === 0, 'no Not placed pane before an add');

// Add two files. Each page is on Level 1 at once.
await addPdf('ground.pdf', '00_arch_ground_floor.pdf');
check((await notPlacedNode().count()) === 0, 'no Not placed node after an add: the page is on the level');
check(/^Added 1 page to Level 1\./.test(await addResult()), 'add result: Added 1 page to Level 1.', await addResult());
check((await stored()).sheets.length === 1, 'the sheet is stored at once', String((await stored()).sheets.length));
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf');
check(/^Added 3 pages to Level 1\./.test(await addResult()), 'add result: Added 3 pages to Level 1.', await addResult());
check((await groups().count()) === 2, 'Level 1 lists two PDFs', String(await groups().count()));
check((await stored()).sheets.length === 4, 'four sheets are stored', String((await stored()).sheets.length));
await shot('B3-T11g-added');

// The result stays until Dismiss.
await idle(7000);
check(/^Added 3 pages to Level 1\./.test(await addResult()), 'the add result stays after a few seconds');
await dlg.locator('[data-testid="add-result-dismiss"]').click();
await idle(300);
check((await dlg.locator('[data-testid="add-result"]').count()) === 0, 'Dismiss removes the add result');

// The 3-page PDF is on Level 1 from one add: 3 sheets, page indexes 0, 1, 2.
const multi = groups().filter({ hasText: 'multi.pdf' });
check((await multi.locator('[data-testid="page-row"]').count()) === 3, 'multi.pdf shows 3 page rows');
let s = await stored();
const lvl = (id) => s.levels.find((l) => l.id === id)?.name;
const multiSheets = s.sheets.filter((x) => x.location.fileName === 'multi.pdf').sort((a, b) => a.pageIndex - b.pageIndex);
check(multiSheets.length === 3 && multiSheets.every((x) => lvl(x.levelId) === 'Level 1'), 'three sheets on Level 1 from one add', JSON.stringify(multiSheets.map((x) => [x.pageIndex, lvl(x.levelId)])));
check(multiSheets.map((x) => x.pageIndex).join() === '0,1,2', 'page indexes 0,1,2');

// Close needs no ask: every page is on a level.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(500);
check((await page.locator('.mep-modal').count()) === 0, 'Close closes the dialog at once, no ask');

// After a reopen the sheets stay and no Not placed node shows.
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(500);
check((await notPlacedNode().count()) === 0, 'after a reopen no Not placed node');
s = await stored();
check(s.sheets.length === 4, 'four sheets stay stored', String(s.sheets.length));

// Narrow view: the add result fits inside the dialog at 760x640.
await items('level').filter({ hasText: 'Level 1' }).click();
await idle(300);
await addPdf('first.pdf', '01_arch_first_floor.pdf');
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
await dlg.locator('[data-testid="add-result"]').scrollIntoViewIfNeeded();
await idle(300);
await shot('B3-T11g-narrow');
const resultBox = await dlg.locator('[data-testid="add-result"]').boundingBox();
const dlgBox = await dlg.boundingBox();
check(resultBox !== null && dlgBox !== null && resultBox.y >= dlgBox.y - 1 && resultBox.y + resultBox.height <= dlgBox.y + dlgBox.height + 1 && resultBox.x >= dlgBox.x - 1 && resultBox.x + resultBox.width <= dlgBox.x + dlgBox.width + 1, 'the add result fits inside the dialog at 760x640', JSON.stringify({ resultBox, dlgBox }));
await shot('B3-T11g-narrow-result');
await dlg.locator('[data-testid="add-result-dismiss"]').click();
await idle(300);
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
await shot('B3-T11g-wide');

await t.finish();
