// B3-T13b: delete text, PDFs on levels only, Opened state, already-assigned text, two-file pick. Real DOM clicks and typing.
// Web stand-in: files come from OPFS; window.showOpenFilePicker is replaced to honour { multiple: true }. The real Windows picker is not tested.
import { open } from '../browser/lib.mjs';
import { readFileSync } from 'node:fs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const level = (name) => items('level').filter({ hasText: name });
const stored = async () => JSON.parse(await page.evaluate(async () => (await window.__mepBuilding.read()).json));
const putFile = (name, file) => page.evaluate(async ([b64, n]) => {
  const root = await navigator.storage.getDirectory();
  const w = await (await root.getFileHandle(n, { create: true })).createWritable();
  await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  await w.close();
}, [readFileSync(FIX + file).toString('base64'), name]);
const pickList = (names) => page.evaluate((n) => { window.__nextFiles = n; window.__nextFile = n[0]; }, names);
const docNames = () => page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
const result = async () => ((await dlg.locator('[data-testid="add-result"]').textContent().catch(() => '')) ?? '');
const onLevel = (s, name) => s.sheets.filter((x) => x.levelId === s.levels.find((l) => l.name === name).id).length;

await page.evaluate(() => {
  window.__pickOpts = [];
  window.showOpenFilePicker = async (o) => {
    window.__pickOpts.push(o ?? {});
    const root = await navigator.storage.getDirectory();
    const names = o?.multiple ? (window.__nextFiles ?? [window.__nextFile]) : [window.__nextFile ?? 'drawing.pdf'];
    return Promise.all(names.map((n) => root.getFileHandle(n)));
  };
});

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(700);
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameIn = dlg.locator('input[aria-label="Building name"]');
await nameIn.fill('Tower');
await nameIn.press('Enter');
await dlg.locator('[data-testid="building-name-header-text"]', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);

// No level yet: "Add a level first.", no add buttons.
check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'no Add PDFs button with no level');
check((((await dlg.locator('[data-testid="open-documents"]').textContent()) ?? '').includes('Add a level first.')), 'the strip says "Add a level first." with no level');

for (const n of ['Ground floor', 'Level 1']) {
  await dlg.locator('[data-testid="tree-add-level"]').click();
  await idle(400);
  await page.keyboard.type(n);
  await page.keyboard.press('Enter');
  await idle(400);
}

// Building node selected: no add buttons, hint, Refresh stays.
await items('building').first().click();
await idle(500);
const strip = dlg.locator('[data-testid="open-documents"]');
check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'building selected: no Add PDFs button');
check((await dlg.locator('button', { hasText: /^Add folder…$/ }).count()) === 0, 'building selected: no Add folder button');
check((await dlg.locator('[data-testid="open-doc-add"]').count()) === 0 && (await dlg.locator('[data-testid="open-doc-add-all-docs"]').count()) === 0, 'building selected: no per-document add buttons');
check((((await dlg.locator('[data-testid="add-hint"]').textContent().catch(() => '')) ?? '').trim()) === 'Select a level to add PDFs.', 'building selected: hint "Select a level to add PDFs."');
check((await dlg.locator('[data-testid="refresh-status"]').count()) === 1, 'building selected: Refresh stays');
await strip.scrollIntoViewIfNeeded();
await shot('b3-t13b-1');

// Two-PDF pick on Ground floor.
await putFile('a1.pdf', 'arch_simple_A4.pdf');
await putFile('a2.pdf', '00_arch_ground_floor.pdf');
await putFile('a3.pdf', '01_arch_first_floor.pdf');
await level('Ground floor').click();
await idle(500);
check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 1, 'level selected: Add PDFs shows');
await pickList(['a1.pdf', 'a2.pdf']);
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.length >= 2, 'two PDFs placed', 20000);
await idle(800);
let s = await stored();
const opts = await page.evaluate(() => window.__pickOpts);
check(opts.some((o) => o.multiple === true), 'the picker was called with multiple: true', JSON.stringify(opts.map((o) => o.multiple)));
const names = [...new Set(s.sheets.map((x) => x.location.fileName))].sort();
check(names.includes('a1.pdf') && names.includes('a2.pdf'), 'both picked PDFs are sheets', JSON.stringify(names));
check(s.sheets.every((x) => x.levelId === s.levels[0].id), 'both PDFs are on Ground floor');
const r1 = await result();
check(/^Added \d+ pages? \(2 PDFs\) to Ground floor\./.test(r1), 'the result names 2 PDFs and the level', r1);

// Already on another level.
const gCount = onLevel(s, 'Ground floor');
await level('Level 1').click();
await idle(500);
check((await dlg.locator('[data-testid="add-result"]').count()) === 0, 'the result goes away when another level is selected');
await pickList(['a1.pdf', 'a2.pdf', 'a3.pdf']);
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.length > gCount, 'a3 placed', 20000);
await idle(800);
const r2 = await result();
check(new RegExp(`${gCount} pages are already on Ground floor and were not moved\\.`).test(r2), 'the result names the other level and the count', r2);
check(/^Added \d+ pages? /.test(r2) && /to Level 1\./.test(r2), 'the result tells what was added to Level 1', r2);
s = await stored();
check(onLevel(s, 'Ground floor') === gCount, 'the pages on Ground floor did not move');
await dlg.locator('[data-testid="add-result"]').scrollIntoViewIfNeeded();
await shot('b3-t13b-3');

// Same PDFs on the same level.
await level('Ground floor').click();
await idle(500);
await pickList(['a1.pdf', 'a2.pdf']);
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => /already on this level/.test(await result()), 'same level text', 15000);
const r3 = await result();
check(/^Nothing added\./.test(r3) && new RegExp(`${gCount} pages are already on this level\\.`).test(r3), 'same level: "N pages are already on this level."', r3);
await dlg.locator('[data-testid="add-result-dismiss"]').click();
await idle(300);
check((await dlg.locator('[data-testid="add-result"]').count()) === 0, 'Dismiss removes the result');

// Opened state: open the sheet of a1.pdf with Choose file…, the button turns into a disabled "Opened".
const rowA1 = dlg.locator('[data-testid="page-row"]', { hasText: 'a1.pdf' }).first();
const rowA2 = dlg.locator('[data-testid="page-row"]', { hasText: 'a2.pdf' }).first();
await pickList(['a1.pdf']);
await rowA1.locator('[data-testid="open-sheet"]').click();
await until(async () => (await docNames()).includes('a1.pdf'), 'a1 opened', 30000);
await idle(1000);
const btn = rowA1.locator('[data-testid="open-sheet"]');
check((((await btn.textContent()) ?? '').trim()) === 'Opened', 'the button reads "Opened"', (await btn.textContent()) ?? '');
check(await btn.isDisabled(), 'the Opened button is disabled');
check((await btn.getAttribute('aria-label')) === 'Opened: a1.pdf', 'aria-label is "Opened: a1.pdf"', (await btn.getAttribute('aria-label')) ?? '');
check(await rowA2.locator('[data-testid="open-sheet"]').isEnabled(), 'the other PDF row keeps an enabled button');
await rowA1.scrollIntoViewIfNeeded();
await shot('b3-t13b-2');
// The dialog stays open and the state follows a close of the document.
const closed = await page.evaluate(() => {
  const scene = window.__mepSketchScene;
  const doc = scene.getDocuments().find((d) => d.fileName === 'a1.pdf');
  if (!doc) return false;
  scene.closeDocument(doc.id);
  return true;
});
check(closed, 'the a1.pdf document was closed through the scene');
await until(async () => (((await btn.textContent()) ?? '').trim()) !== 'Opened', 'button back', 10000);
check(await btn.isEnabled(), 'after the document closes the button is enabled again');

// Delete text.
await level('Level 1').click();
await idle(500);
s = await stored();
const nL1 = onLevel(s, 'Level 1');
const delText = ((await dlg.textContent()) ?? '');
check(delText.includes(`This level has ${nL1} sheet${nL1 === 1 ? '' : 's'}. Move or remove ${nL1 === 1 ? 'it' : 'them'} to delete the level.`), 'the delete text explains the block', String(nL1));
check(!delText.includes('Remove its'), 'the old "Remove its" text is gone');
await shot('b3-t13b-4');

await t.finish();
