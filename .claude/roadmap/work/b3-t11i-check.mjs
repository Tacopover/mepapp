// B3-T11i: Export scope with no building open, header sheet label (button, ellipsis, title), "Saved" text clears on a tab change. Real clicks.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { makeTwoDocuments, buildingOf, loadBuildingWithSummaries, recordSuggestedNames, dialog, openScopeDialog } from './b2-lib.mjs';
import { readXlsx } from './xlsx-read.mjs';

const t = await open({ seed: { 'mepapp.buildings.v2': JSON.stringify([{ id: 'b-b2', name: 'Tower', location: 'dev' }]) } });
const { page, check, shot, idle, until, statusText, menu } = t;
await t.start();
await recordSuggestedNames(t);

const { ground, first } = await makeTwoDocuments(t);
await loadBuildingWithSummaries(t, buildingOf(ground, first));
await idle(500);

const dlg = page.locator('.mep-modal');
const label = page.locator('[data-testid="current-sheet"]');

// 1. Label at 1600 px: a button, full text, no ellipsis.
check((await label.count()) === 1, 'the header label shows with a building open');
const tag = await label.evaluate((el) => el.tagName);
check(tag === 'BUTTON', 'the label is a button', tag);
const full = ((await label.textContent()) ?? '').trim();
const m1600 = await label.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
check(m1600.cw >= 100, 'at 1600 px the label shows at least 100 px (the status bar is full; the title holds the rest)', JSON.stringify(m1600));
check((await label.getAttribute('title')) === full, 'the title holds the full text', full);
await shot('B3-T11i-label-1600');

// 2. Click on the label opens the dialog at the shown level (the active document is First on Level 1).
await label.click();
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(900);
const heading = ((await dlg.locator('h4').first().textContent().catch(() => '')) ?? '').trim();
check(/Level 1/.test(heading), 'the label click opens the dialog at the shown level', heading);
await shot('B3-T11i-label-opens-dialog');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });

// 6. Narrow header: ellipsis and full title.
await page.setViewportSize({ width: 560, height: 900 });
await idle(500);
const narrow = await label.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { sw: el.scrollWidth, cw: el.clientWidth, ellipsis: cs.textOverflow, title: el.getAttribute('title'), text: el.textContent };
});
check(narrow.cw < narrow.sw, 'at 560 px the label is cut', JSON.stringify(narrow));
check(narrow.ellipsis === 'ellipsis', 'text-overflow is ellipsis', narrow.ellipsis);
check(narrow.title === narrow.text && narrow.title.length > 0, 'the title holds the full text when cut', JSON.stringify(narrow));
await shot('B3-T11i-label-560');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);

// 7. "Saved" text clears when the active tab changes.
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save');
check(/^Saved /.test(await statusText()), 'the Saved text shows after Save', await statusText());
await shot('B3-T11i-saved');
await page.locator('.mep-doc-switcher-btn').click();
await idle(300);
const rows = page.locator('.mep-doc-switcher-dropdown .mep-elem-row');
const n = await rows.count();
let idx = -1;
for (let i = 0; i < n; i++) if (/ground/.test((await rows.nth(i).innerText()) ?? '')) idx = i;
check(idx >= 0, 'the dropdown lists ground.pdf', String(n));
await rows.nth(idx).click();
await idle(800);
const after = await statusText();
check(!/^Saved /.test(after), 'the Saved text is gone after a tab change', after);
await shot('B3-T11i-saved-cleared');

// 3. A reload closes the building. The dev store keeps the building and its summaries, and the building stays closed.
const saved = await page.evaluate(async () => {
  const store = window.__mepBuilding.store;
  const summaries = {};
  for (const uuid of await store.listSummaries()) summaries[uuid] = await store.readSummary(uuid);
  return { json: (await store.read()).json, summaries };
});
await page.reload();
await page.locator('button.mep-onboarding-start').click({ timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await page.evaluate((s) => window.__mepBuilding.store.load(s.json, s.summaries), saved);
await recordSuggestedNames(t);
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(500);
check(/No building is open/.test((await dlg.textContent()) ?? ''), 'the building is closed after a reload');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });
await page.evaluate(() => { window.__nextFile = 'ground.pdf'; });
await menu('Open…');
await until(async () => /Loaded|Could not open/.test(await statusText()), 'open the stamped ground.pdf');
await idle(1000);

// 4. Export with no building: pick the recent building in the dialog, then Level, then Export.
await openScopeDialog(t);
const radios = dlg.locator('input[type=radio]');
check((await radios.nth(2).isDisabled()) && (await radios.nth(3).isDisabled()), 'Level and Building are disabled with no building');
const pick = dlg.locator('select[aria-label="Building"]');
check((await pick.count()) === 1, 'a Building select shows');
const opts = (await pick.locator('option').allInnerTexts()).map((s) => s.trim());
check(opts.includes('Tower'), 'the Building select lists the recent building', JSON.stringify(opts));
check((await dlg.locator('button', { hasText: /^Open building…$/ }).count()) === 1, 'the Open building… button shows');
check((await dlg.locator('button', { hasText: /^Manage Buildings…$/ }).count()) === 1, 'the Manage Buildings… link shows');
await shot('B3-T11i-scope-nobuilding');
await pick.selectOption({ label: 'Tower' });
await until(async () => await radios.nth(2).isEnabled(), 'Level enables after the building opens', 15000);
check((await radios.nth(3).isEnabled()), 'Building scope enables too');
const openFirst = ((await dlg.locator('select[aria-label="Building"] option').first().textContent()) ?? '').trim();
check((await dlg.locator('select[aria-label="Building"]').count()) === 1 && openFirst === 'Tower', 'the Building select stays once a building is open, the open building first', openFirst);
await radios.nth(2).check();
await dlg.locator('select[aria-label="Level"]').selectOption({ label: 'Level 0' });
await shot('B3-T11i-scope-level');
const before = await page.evaluate(() => (window.__suggested ?? []).length);
await dlg.locator('button', { hasText: /^Export$/ }).click();
await until(async () => (await page.evaluate(() => (window.__suggested ?? []).length)) > before, 'export level', 60000);
await idle(2000);
const b64 = await page.evaluate(async () => {
  const f = await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile();
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
const names = await page.evaluate(() => window.__suggested ?? []);
const xlsx = readXlsx(Buffer.from(b64, 'base64'));
const seg = xlsx.sheets.Segments ?? [];
check(names[names.length - 1] === 'Tower-Level 0-quantities.xlsx', 'the file name is Tower-Level 0-quantities.xlsx', String(names[names.length - 1]));
check(seg.length === 2 && seg[1][1] === 'Level 0', 'the xlsx has the Level 0 row only', JSON.stringify(seg));

await t.finish();
