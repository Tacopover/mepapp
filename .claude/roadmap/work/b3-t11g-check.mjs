// B3-T11g: add from disk and not-placed pages. Real clicks and real selects. Picker stub (OPFS), one file at a time.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const pane = () => dlg.locator('[data-testid="sheets-pane"]');
const groups = () => pane().locator('[data-testid="pdf-group"]');
const notPlacedNode = () => dlg.locator('[role="treeitem"]', { hasText: 'Not placed' });
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

// The action row sits in the open documents section.
const section = dlg.locator('[data-testid="open-documents"]');
check((await section.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 1, 'Add PDFs… is in the open documents section');
check((await dlg.locator('[data-testid="level-sheets"] button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'no Add PDFs… in the sheets block');
check((await notPlacedNode().count()) === 0, 'no Not placed node before an add');
check((await pane().count()) === 0, 'no Not placed pane before an add');

// Add two files.
await addPdf('ground.pdf', '00_arch_ground_floor.pdf');
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf');
check((await notPlacedNode().count()) === 1, 'Not placed node exists');
const badge = ((await notPlacedNode().textContent()) ?? '').replace(/\s+/g, ' ');
check(/4/.test(badge), 'the node shows 4 pages', badge);
check((await notPlacedNode().getAttribute('aria-selected')) === 'true', 'the Not placed node is selected after an add');
check(/These pages are not saved in the building\. Place them or they go when you close this dialog\./.test((await pane().textContent()) ?? ''), 'the pane shows the warning line');
check((await groups().count()) === 2, 'two waiting PDFs', String(await groups().count()));
check(/Added multi\.pdf/.test((await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? ''), 'status line says Added multi.pdf');
check((await dlg.locator('[data-testid="sheets-notice"] button').count()) === 0, 'no Dismiss button in the status line');
check((await stored()).sheets.length === 0, 'nothing is stored yet');
await shot('B3-T11g-not-placed');

// The status line fades: the text goes away after some seconds.
await t.until(async () => (await dlg.locator('[data-testid="sheets-notice"]').count()) === 0, 'status line fades', 10000).catch(() => {});
check((await dlg.locator('[data-testid="sheets-notice"]').count()) === 0, 'the status line is gone after a few seconds');

// Assign all pages of the 3-page PDF with one action.
const multi = groups().filter({ hasText: 'multi.pdf' });
check((await multi.locator('[data-testid="page-row"]').count()) === 3, 'multi.pdf shows 3 page rows');
await multi.locator('select[data-testid="assign-all"]').selectOption({ label: 'Level 1' });
await idle(700);
let s = await stored();
const lvl = (id) => s.levels.find((l) => l.id === id)?.name;
const multiSheets = s.sheets.filter((x) => x.location.fileName === 'multi.pdf').sort((a, b) => a.pageIndex - b.pageIndex);
check(multiSheets.length === 3 && multiSheets.every((x) => lvl(x.levelId) === 'Level 1'), 'three sheets on Level 1 from one action', JSON.stringify(multiSheets.map((x) => [x.pageIndex, lvl(x.levelId)])));
check(multiSheets.map((x) => x.pageIndex).join() === '0,1,2', 'page indexes 0,1,2');
check((await groups().count()) === 1, 'one waiting PDF is left', String(await groups().count()));
check(/1/.test(((await notPlacedNode().textContent()) ?? '')), 'the badge shows 1 page');

// Close asks. Keep working keeps the dialog.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(300);
check((await dlg.locator('[data-testid="close-ask"]').count()) === 1, 'Close with a page waiting shows the ask');
check(/1 page is not placed\. Close anyway\?/.test((await dlg.locator('[data-testid="close-ask"]').textContent()) ?? ''), 'the ask text names the count', (await dlg.locator('[data-testid="close-ask"]').textContent()) ?? '');
await shot('B3-T11g-close-ask');
await dlg.locator('[data-testid="keep-working"]').click();
await idle(300);
check((await dlg.count()) === 1 && (await dlg.locator('[data-testid="close-ask"]').count()) === 0, 'Keep working keeps the dialog and hides the ask');
check((await groups().count()) === 1, 'the waiting PDF is still there');

// Escape asks too.
await page.keyboard.press('Escape');
await idle(300);
check((await dlg.count()) === 1 && (await dlg.locator('[data-testid="close-ask"]').count()) === 1, 'Escape shows the ask and keeps the dialog');
// Close anyway closes.
await dlg.locator('[data-testid="close-anyway"]').click();
await idle(500);
check((await page.locator('.mep-modal').count()) === 0, 'Close anyway closes the dialog');

// After a reopen the waiting page is gone and Close needs no ask.
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(500);
check((await notPlacedNode().count()) === 0, 'after a reopen no Not placed node');
s = await stored();
check(s.sheets.length === 3, 'three sheets stay stored', String(s.sheets.length));

// Wording: placed pages say Move to..., a level select of an unplaced open document says Add to another level...
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(400);
check((await page.locator('.mep-modal').count()) === 0, 'Close with nothing waiting closes at once');

// Backdrop is not a close gesture (unchanged), but 760x640 view of the pane and the ask.
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(400);
await items('building').first().click();
await idle(300);
await addPdf('first.pdf', '01_arch_first_floor.pdf');
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
await shot('B3-T11g-narrow');
await page.keyboard.press('Escape');
await idle(400);
await shot('B3-T11g-narrow-ask');
const askBox = await dlg.locator('[data-testid="close-ask"]').boundingBox();
const dlgBox = await dlg.boundingBox();
check(askBox !== null && dlgBox !== null && askBox.y + askBox.height <= dlgBox.y + dlgBox.height + 1 && askBox.x + askBox.width <= dlgBox.x + dlgBox.width + 1, 'the ask fits inside the dialog at 760x640', JSON.stringify({ askBox, dlgBox }));
await dlg.locator('[data-testid="keep-working"]').click();
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
await shot('B3-T11g-wide');

await t.finish();
