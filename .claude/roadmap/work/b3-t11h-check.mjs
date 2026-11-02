// B3-T11h: repair action (Read summaries now), asks before dropping waiting pages, 760x640 layout, create row, stale read. Real clicks.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const uuid = () => page.evaluate(() => window.__mepSketchScene.getProjectUuid());
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const rebuild = () => dlg.locator('[data-testid="rebuild-summaries"]');
const ask = () => dlg.locator('[data-testid="close-ask"]');
const askText = async () => ((await ask().textContent().catch(() => '')) ?? '').trim();
async function buildingMenu(item) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: item }).click();
  await idle(300);
}
async function putFile(name, file) {
  await page.evaluate(
    async ([data, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + file).toString('base64'), name],
  );
}
async function nextFile(name) {
  await page.evaluate((n) => { window.__nextFile = n; }, name);
}
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(900);
}
async function closeDialog() {
  await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
  await dlg.waitFor({ state: 'hidden', timeout: 5000 });
}
async function openAndSave(file, name) {
  await t.openPdf(FIX + file, name);
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${name}`);
  await idle(800);
  return uuid();
}

// Two saved PDFs (files in OPFS) and one with no embedded id.
await openAndSave('00_arch_ground_floor.pdf', 'ground.pdf');
await openAndSave('01_arch_first_floor.pdf', 'first.pdf');
await putFile('plain.pdf', 'arch_simple_A4.pdf');
await putFile('multi.pdf', 'arch_simple_A4.pdf');

const sheet = (id, name, path) => ({ id, levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: name, location: { fileName: name, path: path ?? name } });
const buildingA = {
  schemaVersion: 1, id: 'b-t11h-a', name: 'Block A',
  levels: [{ id: 'l0', name: 'Ground floor', elevationMm: 0 }],
  sheets: [sheet('s1', 'ground.pdf'), sheet('s2', 'first.pdf')],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(buildingA));
await idle(400);
await openDialog();

// 1. N = 2: the line and the button show.
check((await rebuild().count()) === 1, 'N=2: the Read summaries now button shows');
check(/^Read summaries now$/.test(((await rebuild().textContent()) ?? '').trim()), 'the button text is "Read summaries now"');
check(/2 sheets have no summary/.test((await dlg.locator('[data-testid="summaries-missing"]').textContent()) ?? ''), 'the line says "2 sheets have no summary"');
check(/Reads each PDF of this building from disk and saves its summary\. MepApp does this when you open or save a PDF\./.test((await dlg.locator('[data-testid="summaries-pane"]').textContent()) ?? ''), 'the explain text shows');
check((await dlg.locator('h4', { hasText: /^Summaries$/ }).count()) === 0, 'no Summaries section title');
check((await dlg.locator('[data-testid="refresh-status"]').count()) === 1 && /Refresh/.test((await dlg.locator('[data-testid="refresh-status"]').getAttribute('aria-label')) ?? ''), 'a small Refresh icon button stays');
await shot('B3-T11h-n2');
await rebuild().click();
await dlg.locator('[data-testid="rebuild-result"]').waitFor({ timeout: 60000 });
await until(async () => (await rebuild().count()) === 0, 'button gone after the run', 20000);
check(/Rebuilt 2 of 2 summaries/.test((await dlg.locator('[data-testid="rebuild-result"]').textContent()) ?? ''), 'result: Rebuilt 2 of 2');
check((await dlg.locator('[data-testid="rebuild-result"] [data-testid="rebuild-failures"]').count()) === 0, 'no failure list');
await shot('B3-T11h-after-run');
await closeDialog();

// 2. Failures show the actions. gone.pdf has no file, plain.pdf has no id.
const buildingB = {
  schemaVersion: 1, id: 'b-t11h-b', name: 'Block B',
  levels: [{ id: 'l0', name: 'Ground floor', elevationMm: 0 }],
  sheets: [sheet('p1', 'plain.pdf'), sheet('p2', 'gone.pdf')],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(buildingB));
await idle(400);
await openDialog();
check((await rebuild().count()) === 1, 'building B: the button shows');
await rebuild().click();
await dlg.locator('[data-testid="rebuild-result"]').waitFor({ timeout: 60000 });
await idle(600);
const failures = dlg.locator('[data-testid="rebuild-failures"] li');
check((await failures.count()) === 2, 'two failure rows', String(await failures.count()));
check((await dlg.locator('[data-testid="repair-relink"]').count()) === 2, 'each failed sheet has Relink');
check((await dlg.locator('[data-testid="repair-open"]').count()) === 2, 'each failed sheet has Choose file…');
check(/^(Open|Choose file…)$/.test(((await dlg.locator('[data-testid="repair-open"]').first().textContent()) ?? '').trim()), 'the open action is Open or Choose file…');
check(await failures.filter({ hasText: 'gone.pdf' }).locator('[data-testid="repair-open"]').isDisabled(), 'Open is disabled for a missing file in the failure row');
await shot('B3-T11h-failures');
const statusBefore = await statusText();
check(/Rebuilt 0 of 2 summaries\. 2 failed:/.test(statusBefore) && statusBefore.length < 160, 'the status bar text is short', statusBefore);

// Relink gone.pdf to ground.pdf from the failure row.
await nextFile('ground.pdf');
const goneRow = failures.filter({ hasText: 'gone.pdf' });
await goneRow.locator('[data-testid="repair-relink"]').click();
await idle(1200);
const afterRelink = await stored();
check(afterRelink.sheets.find((s) => s.id === 'p2')?.location.fileName === 'ground.pdf', 'Relink in the failure row relinked the sheet', JSON.stringify(afterRelink.sheets.find((s) => s.id === 'p2')?.location));

// Window focus: delete plain.pdf, send a focus event, the status becomes Missing.
const plainStatus = () => dlg.locator('[data-testid="page-row"]', { hasText: 'plain.pdf' }).locator('[data-testid="sheet-status"]').getAttribute('data-status');
const before = await plainStatus();
await page.evaluate(async () => { await (await navigator.storage.getDirectory()).removeEntry('plain.pdf'); });
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await until(async () => (await plainStatus()) === 'pdf-missing', 'focus refresh marks plain.pdf missing', 8000);
check(before !== 'pdf-missing' && (await plainStatus()) === 'pdf-missing', 'a window focus checks the files again', `${before} -> ${await plainStatus()}`);

// 3. Asks. Add a PDF that waits.
await nextFile('multi.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(1200);
check((await dlg.locator('[role="treeitem"]', { hasText: 'Not placed' }).count()) === 1, 'a page waits (Not placed node)');
await buildingMenu('Close building');
check(/pages? (is|are) not placed\. Close the building anyway\?/.test(await askText()), 'Close building asks', await askText());
await shot('B3-T11h-ask-close-building');
await dlg.locator('[data-testid="keep-working"]').click();
await idle(200);
check((await ask().count()) === 0 && (await dlg.locator('.mep-buildings-open-name').count()) === 1, 'Keep working keeps the building');
// Open a sheet asks first.
await dlg.locator('[role="treeitem"][data-kind="level"]').first().click();
await idle(300);
await dlg.locator('[data-testid="page-row"]', { hasText: 'ground.pdf' }).locator('[data-testid="open-sheet"]').click();
await idle(300);
check(/Open the sheet anyway\?/.test(await askText()), 'opening a sheet asks', await askText());
check((await dlg.count()) === 1, 'the dialog stays open behind the ask');
await dlg.locator('[data-testid="keep-working"]').click();
await idle(200);
// Close building, answer yes.
await buildingMenu('Close building');
await dlg.locator('[data-testid="close-anyway"]').click();
await idle(600);
check(/No building is open/.test((await dlg.textContent()) ?? ''), 'Close building after the answer closes the building');

// 4. Create row: closes after create, after Cancel; never with a building open unless chosen.
const nameIn = () => dlg.locator('input[aria-label="Building name"]');
await dlg.locator('button', { hasText: /^New building$/ }).click();
check((await nameIn().count()) === 1, 'New building shows the name row');
await dlg.locator('button', { hasText: /^Cancel$/ }).click();
check((await nameIn().count()) === 0, 'Cancel closes the name row');
await dlg.locator('button', { hasText: /^New building$/ }).click();
await nameIn().fill('Tower');
await nameIn().press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(700);
check((await nameIn().count()) === 0, 'after Enter the name row is closed and a building is open');
await shot('B3-T11h-create-closed');
await buildingMenu('New building…');
check((await nameIn().count()) === 1, 'the menu item New building… shows the name row');
await dlg.locator('button', { hasText: /^Cancel$/ }).click();
check((await nameIn().count()) === 0, 'Cancel closes it again');
await buildingMenu('New building…');
await nameIn().fill('Annex');
await dlg.locator('button', { hasText: /^Create…$/ }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(700);
check((await nameIn().count()) === 0, 'after the Create button the name row is closed');

// 5. A slow PDF read that ends after the building changed does not land in the new building.
await putFile('slow.pdf', 'arch_simple_A4.pdf');
await nextFile('slow.pdf');
await page.evaluate(() => {
  const orig = window.showOpenFilePicker;
  window.showOpenFilePicker = async (...a) => { await new Promise((r) => setTimeout(r, 3000)); return orig(...a); };
});
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await buildingMenu('Close building');
await dlg.locator('button', { hasText: /^New building$/ }).click();
await nameIn().fill('Fresh');
await nameIn().press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Fresh' }).waitFor({ timeout: 8000 });
await idle(5000);
check((await dlg.locator('[role="treeitem"]', { hasText: 'Not placed' }).count()) === 0, 'the late read did not add a waiting page to the new building');
await closeDialog();

// 6. 760x640: the right pane is high enough and shows a scroll cue.
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify({ ...buildingA, id: 'b-t11h-c', name: 'Block C', sheets: [sheet('q1', 'ground.pdf'), sheet('q2', 'first.pdf'), sheet('q3', 'plain2.pdf'), sheet('q4', 'plain3.pdf')] }));
await idle(400);
await page.setViewportSize({ width: 760, height: 640 });
await idle(400);
await openDialog();
await dlg.locator('[role="treeitem"], select.mep-buildings-select').first().waitFor({ timeout: 5000 }).catch(() => {});
const geo = await page.evaluate(() => {
  const el = document.querySelector('.mep-buildings-layout');
  const panel = document.querySelector('.mep-buildings-panel');
  const detail = document.querySelector('.mep-buildings-detail');
  return {
    layoutH: el.clientHeight, layoutScroll: el.scrollHeight, layoutBg: getComputedStyle(el).backgroundImage.includes('gradient'),
    panelBg: getComputedStyle(panel).backgroundImage, detailH: detail.getBoundingClientRect().height,
  };
});
console.log('GEO', JSON.stringify(geo));
check(geo.layoutH >= 300, 'at 760x640 the body is at least 300 px high', String(geo.layoutH));
check(geo.layoutBg, 'the scrolling body has a scroll cue (gradient shadow)');
check(geo.layoutScroll > geo.layoutH, 'the content is cut and the body scrolls', `${geo.layoutScroll} > ${geo.layoutH}`);
await shot('B3-T11h-760x640');
await page.evaluate(() => { document.querySelector('.mep-buildings-layout').scrollTop = 9999; });
await idle(200);
await shot('B3-T11h-760x640-scrolled');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(300);
const wide = await page.evaluate(() => getComputedStyle(document.querySelector('.mep-buildings-panel')).backgroundImage.includes('gradient'));
check(wide, 'the wide panel has the scroll cue too');
await shot('B3-T11h-1600x1000');
await closeDialog();

await t.finish();
