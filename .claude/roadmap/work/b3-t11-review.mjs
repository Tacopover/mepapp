// B3-T11 review pass (no product code changes). Real clicks. Prints measurements and saves screenshots.
// Usage: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b3-t11-review.mjs
// The scenario name is read from the file MEPAPP_SCENARIO_FILE-less convention: edit SCENARIO below.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const SCENARIO = readFileSync('/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/work/b3-t11-scenario.txt', 'utf8').trim();
const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const opts = SCENARIO === 'dark' ? { dark: true } : SCENARIO === 'narrow' ? { width: 760, height: 640 } : {};
const t = await open(opts);
const { page, check, shot, idle, menu } = t;
await t.start();
const dlg = page.locator('.mep-modal');
const log = (...a) => console.log('NOTE', ...a);
const box = async () => dlg.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const body = el.querySelector('.mep-modal-body') ?? el;
  return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), scrollH: body.scrollHeight, clientH: body.clientHeight, text: el.innerText.length };
});
const b64 = (f) => readFileSync(FIX + f).toString('base64');
async function putFile(name, f) {
  await page.evaluate(async ([b, n]) => {
    const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    await w.close();
    window.__nextFile = n;
  }, [b64(f), name]);
}
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
}

// R0: two PDFs open in the viewer, no building. What does the dialog say about them?
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'ground.pdf');
await t.openPdf(FIX + '01_arch_first_floor.pdf', 'first.pdf');
await putFile('multi.pdf', 'Sample Project_multi_page.pdf');
await menu('Open…');
await idle(2000);
log('open documents tabs', await page.locator('.mep-doc-switcher, [data-testid="document-switcher"], .mep-header').first().innerText().catch(() => '?'));
await openDialog();
log('R0 empty dialog box', JSON.stringify(await box()));
log('R0 text:', (await dlg.innerText()).replace(/\n+/g, ' | '));
log('R0 mentions open docs:', /ground\.pdf|first\.pdf/.test(await dlg.innerText()));
log('R0 focused element after open:', await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
await shot(`T11-${SCENARIO}-0-empty`);
if (SCENARIO !== 'main') {
  // Still do the create + two levels + add PDFs flow so the dark and narrow screenshots show content.
}

// R1: new building.
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Office block');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Office block' }).waitFor({ timeout: 8000 });
await idle(400);
const empty = await box();
log('R1 building, no levels box', JSON.stringify(empty));
await shot(`T11-${SCENARIO}-1-created`);

// R2: first level. Does the width jump?
await dlg.locator('button', { hasText: /^Add level$/ }).click();
await idle(500);
const oneLevel = await box();
log('R2 one level box', JSON.stringify(oneLevel), 'width jump:', empty.w !== oneLevel.w);
await dlg.locator('button', { hasText: /^Add level$/ }).click();
await idle(400);
await dlg.locator('button', { hasText: /^Add level$/ }).click();
await idle(400);
const rows = dlg.locator('[data-testid="level-row"]');
for (const [i, n] of ['Ground floor', 'Level 1', 'Level 2'].entries()) {
  const input = rows.nth(i).locator('input[aria-label="Level name"]');
  await input.fill(n);
  await input.press('Enter');
  await idle(250);
}
log('R2 default level names', 'see screenshot');
await shot(`T11-${SCENARIO}-2-levels`);

// R3: add PDFs from disk (the viewer already has them open, but the dialog does not know).
await putFile('ground.pdf', '00_arch_ground_floor.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(900);
await putFile('first.pdf', '01_arch_first_floor.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(900);
await putFile('multi.pdf', 'Sample Project_multi_page.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(900);
log('R3 box with 3 PDFs unassigned', JSON.stringify(await box()));
await shot(`T11-${SCENARIO}-3-pdfs`);

// R4: assign each page by select. Count the clicks: one select change for each page.
const sel = (n, p) => dlg.locator(`select[aria-label="Level for ${n} page ${p}"]`);
await sel('ground.pdf', 1).selectOption({ label: 'Ground floor' });
await idle(250);
await sel('first.pdf', 1).selectOption({ label: 'Level 1' });
await idle(250);
await sel('multi.pdf', 1).selectOption({ label: 'Ground floor' });
await idle(250);
await sel('multi.pdf', 2).selectOption({ label: 'Level 1' });
await idle(250);
await sel('multi.pdf', 3).selectOption({ label: 'Level 2' });
await idle(400);
const full = await box();
log('R4 box with sheets', JSON.stringify(full));
log('R4 body overflows (needs scroll):', full.scrollH > full.clientH);
await shot(`T11-${SCENARIO}-4-assigned`);

// R5: keyboard. First Tab stops from the dialog start.
await dlg.locator('h3, .mep-modal-title').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
const stops = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  stops.push(await page.evaluate(() => { const e = document.activeElement; return (e?.getAttribute('aria-label') ?? e?.textContent ?? e?.tagName ?? '').trim().slice(0, 30); }));
}
log('R5 first 8 Tab stops:', JSON.stringify(stops));
log('R5 focus visible style', await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow.slice(0, 40)}`; }));

// R6: delete a level that has sheets, delete an empty level (no confirm).
const blocked = await rows.nth(2).locator('button', { hasText: /^Delete$/ }).isDisabled();
log('R6 delete disabled for level with sheets:', blocked);
await sel('multi.pdf', 3).selectOption({ label: 'Not assigned' });
await idle(300);
await rows.nth(2).locator('button', { hasText: /^Delete$/ }).click();
await idle(400);
log('R6 level count after one click on Delete:', await rows.count(), '(no confirm, no undo)');

// R7: rebuild result text on unstamped files.
await dlg.locator('[data-testid="rebuild-summaries"]').click();
await dlg.locator('[data-testid="rebuild-result"]').waitFor({ timeout: 60000 }).catch(() => log('R7 no rebuild result'));
await idle(500);
log('R7 rebuild result:', ((await dlg.locator('[data-testid="rebuild-result"]').innerText().catch(() => '')) || '').replace(/\n+/g, ' | '));
await shot(`T11-${SCENARIO}-7-rebuild`);

// R8: close the dialog, open Export quantities with the building open, then with the building closed.
await dlg.locator('button', { hasText: /^Close$/ }).last().click();
await idle(300);
await dlg.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
await openDialog();
await dlg.locator('button', { hasText: /^Close building$/ }).click();
await idle(300);
await shot(`T11-${SCENARIO}-8-closed-building`);
log('R8 text after Close building:', (await dlg.innerText()).replace(/\n+/g, ' | ').slice(0, 300));
await dlg.locator('button', { hasText: /^Close$/ }).last().click();
await idle(300);
await menu('Export quantities to Excel…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(300);
log('R8 export scope text:', (await dlg.innerText()).replace(/\n+/g, ' | '));
await shot(`T11-${SCENARIO}-9-export-scope`);
await t.finish();
