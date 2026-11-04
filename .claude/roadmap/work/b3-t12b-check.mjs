// B3-T12b: Add PDFs / Add folder go to the selected level at once; the building node offers no add; Open keeps the dialog open.
// Empty profile, real clicks and typing. The web stand-in feeds files through OPFS (window.__nextFile) and a fake directory picker.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { readFileSync } from 'node:fs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const level = (name) => items('level').filter({ hasText: name });
const stored = async () => JSON.parse(await page.evaluate(async () => (await window.__mepBuilding.read()).json));
const putFile = (name, file, dir) => page.evaluate(async ([b64, n, d]) => {
  let root = await navigator.storage.getDirectory();
  if (d) root = await root.getDirectoryHandle(d, { create: true });
  const w = await (await root.getFileHandle(n, { create: true })).createWritable();
  await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  await w.close();
  if (!d) window.__nextFile = n;
}, [readFileSync(FIX + file).toString('base64'), name, dir ?? null]);
const nextFile = (n) => page.evaluate((x) => { window.__nextFile = x; }, n);
const docNames = () => page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
const notice = async () => ((await dlg.locator('[data-testid="add-result"]').textContent().catch(() => '')) ?? '');
const active = () => page.evaluate(() => ({ inDialog: !!document.activeElement?.closest('.mep-modal'), tag: document.activeElement?.tagName ?? '' }));

// Step 1: a building with two levels, typed.
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(700);
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameIn = dlg.locator('input[aria-label="Building name"]');
await nameIn.fill('Tower');
await nameIn.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
for (const n of ['Ground floor', 'Level 1']) {
  await dlg.locator('[data-testid="tree-add-level"]').click();
  await idle(400);
  await page.keyboard.type(n);
  await page.keyboard.press('Enter');
  await idle(400);
}
let s = await stored();
check(s.levels.length === 2, 'two levels typed', JSON.stringify(s.levels.map((l) => l.name)));

// Step 2: Add PDFs with Ground floor selected.
await level('Ground floor').click();
await idle(400);
await putFile('a1.pdf', 'arch_simple_A4.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.length >= 1, 'a1 placed', 15000);
await idle(600);
s = await stored();
check(s.sheets.length === 1 && s.sheets[0].levelId === s.levels[0].id, 'Add PDFs put the page on the selected level', JSON.stringify(s.sheets.map((x) => x.displayName)));
check((await items('not-placed').count()) === 0, 'no Not placed node in the tree');
check((await dlg.locator('[data-testid="sheets-pane"]').count()) === 0, 'no Not placed pane');
const n1 = await notice();
check(/Added 1 page to Ground floor/.test(n1), 'the notice says where the page went', n1);
await shot('b3-t12b-1');
const sameBefore = (await stored()).sheets.length;
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(1500);
check((await stored()).sheets.length === sameBefore, 'the same PDF again adds no second sheet');
check(!(await items('not-placed').count()), 'the same PDF again leaves no Not placed node');
const n1b = await notice();
check(/Nothing added\. 1 page is already on this level\./.test(n1b), 'the same PDF again says the page is already on the level', n1b);

// Step 3: Add folder with Level 1 selected.
await level('Level 1').click();
await idle(400);
const folderBtn = dlg.locator('button', { hasText: /^Add folder…$/ });
if ((await folderBtn.count()) > 0) {
  await putFile('f1.pdf', '00_arch_ground_floor.pdf', 'fold');
  await putFile('f2.pdf', '01_arch_first_floor.pdf', 'fold');
  await page.evaluate(async () => { window.showDirectoryPicker = async () => await (await navigator.storage.getDirectory()).getDirectoryHandle('fold'); });
  await folderBtn.click();
  await until(async () => (await stored()).sheets.length >= 3, 'folder placed', 20000);
  await idle(600);
  s = await stored();
  const onL1 = s.sheets.filter((x) => x.levelId === s.levels[1].id);
  check(onL1.length === 2, 'Add folder put both PDFs on Level 1', JSON.stringify(s.sheets.map((x) => [x.displayName, x.levelId === s.levels[1].id])));
  check((await items('not-placed').count()) === 0 && (await dlg.locator('[data-testid="sheets-pane"]').count()) === 0, 'no Not placed after Add folder');
  const n2 = (await dlg.locator('[data-testid="add-result"] span').textContent().catch(() => '')) ?? '';
  check(/^Added 2 pages from \S+ \(2 PDFs\) to Level 1\.$/.test(n2.trim()), 'the folder result names the level', n2);
  await shot('b3-t12b-2');
} else {
  console.log('INFO the web build offers no Add folder button');
}

// Step 4: Open on two sheets in a row keeps the dialog open.
const before = await docNames();
await level('Ground floor').click();
await idle(400);
await nextFile('a1.pdf');
await dlg.locator('[data-testid="page-row"]').filter({ hasText: 'a1.pdf' }).locator('[data-testid="open-sheet"]').click();
await until(async () => (await docNames()).includes('a1.pdf'), 'a1 opened', 30000);
await idle(800);
check((await dlg.count()) === 1 && (await dlg.isVisible()), 'the dialog stays open after the first Open');
// known open item: focus falls to body when the Open button turns into Opened
let a = await active();
console.log('INFO focus after Open:', JSON.stringify(a));
if ((await folderBtn.count()) > 0) {
  await level('Level 1').click();
  await idle(400);
  await putFile('f1.pdf', '00_arch_ground_floor.pdf');
  await dlg.locator('[data-testid="page-row"]').filter({ hasText: 'f1.pdf' }).locator('[data-testid="open-sheet"]').click();
  await until(async () => (await docNames()).includes('f1.pdf'), 'f1 opened', 30000);
  await idle(800);
  check((await dlg.count()) === 1 && (await dlg.isVisible()), 'the dialog stays open after the second Open');
  const names = await docNames();
  check(names.includes('a1.pdf') && names.includes('f1.pdf'), 'both documents are open', JSON.stringify(names));
}
check(!(await dlg.locator('[data-testid="close-anyway"]').count()), 'no ask appeared on Open');
await shot('b3-t12b-3');

// Step 5: the building node offers no add. Only a level takes PDFs.
await items('building').first().click();
await idle(400);
check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'no Add PDFs button with the building selected');
check((await dlg.locator('button', { hasText: /^Add folder…$/ }).count()) === 0, 'no Add folder button with the building selected');
const hint = (await dlg.locator('[data-testid="add-hint"]').textContent().catch(() => '')) ?? '';
check(/Select a level to add PDFs\./.test(hint), 'the hint asks for a level', hint);
check((await items('not-placed').count()) === 0, 'no Not placed node after the adds');
await shot('b3-t12b-4');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(600);
check((await dlg.locator('[data-testid="close-anyway"]').count()) === 0 && (await dlg.count()) === 0, 'Close does not ask when no page waits');

await t.finish();
