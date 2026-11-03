// B3-T05: go to sheet. Real clicks on the Open buttons of the Sheets pane.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
async function putFile(name, file) {
  await page.evaluate(
    async ([b64, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
      window.__nextFile = n;
    },
    [readFileSync(FIX + file).toString('base64'), name],
  );
}
await putFile('ground.pdf', '00_arch_ground_floor.pdf');
await putFile('multi.pdf', 'Sample Project_multi_page.pdf');
await putFile('first.pdf', '01_arch_first_floor.pdf');

await page.evaluate(async () => {
  await window.__mepBuilding.load(
    JSON.stringify({
      schemaVersion: 1,
      id: 'b-open',
      name: 'Office block',
      levels: [
        { id: 'l0', name: 'Ground floor', elevationMm: 0 },
        { id: 'l1', name: 'Level 1', elevationMm: 3000 },
      ],
      sheets: [
        { id: 's1', levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: 'ground.pdf', location: { fileName: 'ground.pdf', path: 'ground.pdf' } },
        { id: 's2', levelId: 'l1', projectUuid: null, pageIndex: 1, displayName: 'multi.pdf p2', location: { fileName: 'multi.pdf', path: 'multi.pdf' } },
        { id: 's3', levelId: 'l1', projectUuid: null, pageIndex: 0, displayName: 'first.pdf', location: { fileName: 'first.pdf' } },
        { id: 's4', levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: 'gone.pdf', location: { fileName: 'gone.pdf', path: 'gone.pdf' } },
      ],
      risers: [],
    }),
  );
});
await idle(400);

const docCount = () => page.evaluate(() => window.__mepSketchScene.getDocuments().length);
const groupOf = (n) => dlg.locator('[data-testid="pdf-group"]').filter({ hasText: n });
const pageChip = () => page.locator('.mep-page-chip').textContent();
const showLevel = async (name) => {
  await dlg.locator('[role="treeitem"][data-kind="level"]', { hasText: name }).click();
  await idle(300);
};
const showBuilding = async () => {
  await dlg.locator('[role="treeitem"][data-kind="building"]').click();
  await idle(300);
};

async function openDialog() {
  if ((await dlg.count()) > 0) return;
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(300);
}

await openDialog();
await showBuilding();
const buttons = await dlg.locator('[data-testid="open-sheet"]').allInnerTexts();
check(buttons.filter((b) => /^Open$/.test(b.trim())).length === 3, 'three sheets with a path have "Open"', JSON.stringify(buttons));
check(buttons.filter((b) => /Choose file…/.test(b)).length === 1, 'the sheet with no path has "Choose file…"');
await shot('B3-T05-dialog');

// Open page 2 of multi.pdf.
await showLevel('Level 1');
await groupOf('multi.pdf').locator('[data-testid="open-sheet"]').click();
await t.until(async () => (await docCount()) >= 1, 'open multi', 60000);
await idle(1200);
check((await dlg.count()) === 1, 'the dialog stays open after a successful open');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });
let chip = await pageChip();
check(/Page\s*2\s*of\s*3/.test(chip), 'status bar shows page 2 of 3', chip);
const docs = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
check(docs.includes('multi.pdf'), 'document multi.pdf is open', JSON.stringify(docs));
await idle(2500);
await shot('B3-T05-open');

// Second click on the same sheet: no second tab.
const before = await docCount();
await openDialog();
await showLevel('Level 1');
await groupOf('multi.pdf').locator('[data-testid="open-sheet"]').click();
await idle(1500);
check((await docCount()) === before, 'a second open does not add a tab', `${before} -> ${await docCount()}`);
check(/Page\s*2\s*of\s*3/.test(await pageChip()), 'still page 2 of 3');

// Another sheet: ground.pdf (1 page, no page chip).
await openDialog();
await showLevel('Ground floor');
await groupOf('ground.pdf').locator('[data-testid="open-sheet"]').click();
await t.until(async () => (await docCount()) === before + 1, 'ground opens', 60000).catch(() => {});
await idle(1000);
const docs2 = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
check(docs2.includes('ground.pdf') && docs2.length === before + 1, 'ground.pdf opens in its own tab', JSON.stringify(docs2));
check((await page.evaluate(() => window.__mepSketchScene.getPageIndex())) === 0, 'ground.pdf shows page 0');

// Back to multi.pdf with page 1 moved: opening the sheet again goes to page 2 although the tab shows another page.
await page.evaluate(() => 0);
await openDialog();
await showLevel('Level 1');
await groupOf('multi.pdf').locator('[data-testid="open-sheet"]').click();
await idle(1500);
check(/Page\s*2\s*of\s*3/.test(await pageChip()), 'switching back to the multi.pdf tab shows page 2');

// Missing file: the status says so and the dialog stays open.
await openDialog();
await showLevel('Ground floor');
check(await groupOf('gone.pdf').locator('[data-testid="open-sheet"]').isDisabled(), 'Open is disabled for a missing PDF (since B3-T06)');
await idle(800);
check((await dlg.count()) === 1, 'dialog stays open when the file is missing');
await shot('B3-T05-missing');

// Pick the file again (no path): the stub picker gives first.pdf.
const docs3 = await docCount();
await showLevel('Level 1');
await groupOf('first.pdf').locator('[data-testid="open-sheet"]').click();
await t.until(async () => (await docCount()) === docs3 + 1, 'pick again', 30000).catch(() => {});
check((await docCount()) === docs3 + 1, 'pick again opens first.pdf in a new tab', `${docs3} -> ${await docCount()}`);
check((await dlg.count()) === 1, 'dialog stays open after the pick');

await t.finish();
