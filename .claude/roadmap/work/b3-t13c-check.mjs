// B3-T13c: a PDF that MepApp never saved is added to a level, then opened. The sheet is linked and the summary is written without a Save.
// Web stand-in: files come from OPFS (no file paths), so the match is by file name and size. The path match of the desktop is not proven here.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { readFileSync } from 'node:fs';
import { readXlsx } from './xlsx-read.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const stored = async () => JSON.parse(await page.evaluate(async () => (await window.__mepBuilding.read()).json));
const summaryIds = () => page.evaluate(async () => await window.__mepBuilding.store.listSummaries());
const putFile = (name, file) => page.evaluate(async ([b64, n]) => {
  const root = await navigator.storage.getDirectory();
  const w = await (await root.getFileHandle(n, { create: true })).createWritable();
  await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  await w.close();
  window.__nextFile = n;
  window.__nextFiles = [n];
}, [readFileSync(FIX + file).toString('base64'), name]);
const docs = () => page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => ({ name: d.fileName, uuid: d.projectUuid, inFile: d.projectUuidInFile })));
const row = (n) => dlg.locator('[data-testid="page-row"]', { hasText: n }).first();
const chip = (n) => row(n).locator('[data-testid="sheet-status"]');
const chipStatus = async (n) => (await chip(n).getAttribute('data-status').catch(() => null)) ?? '';
const openDialog = async () => {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
};
const closeDialog = async () => {
  await dlg.locator('button', { hasText: /^Close$/ }).first().click();
  await dlg.waitFor({ state: 'hidden', timeout: 8000 });
  await idle(300);
};

await page.evaluate(() => {
  window.showOpenFilePicker = async (o) => {
    const root = await navigator.storage.getDirectory();
    const names = o?.multiple ? (window.__nextFiles ?? [window.__nextFile]) : [window.__nextFile ?? 'drawing.pdf'];
    return Promise.all(names.map((n) => root.getFileHandle(n)));
  };
});

await openDialog();
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameIn = dlg.locator('input[aria-label="Building name"]');
await nameIn.fill('Tower');
await nameIn.press('Enter');
await dlg.locator('[data-testid="building-name-header-text"]', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
await page.keyboard.type('Ground floor');
await page.keyboard.press('Enter');
await idle(500);
await items('level').filter({ hasText: 'Ground floor' }).click();
await idle(500);

// 1. Add a PDF that holds no id. The sheet gets a minted id at once.
await putFile('a1.pdf', 'arch_simple_A4.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.length >= 1, 'a1 added', 20000);
await idle(800);
let s = await stored();
const sa = s.sheets.find((x) => x.location.fileName === 'a1.pdf');
check(typeof sa?.projectUuid === 'string' && sa.idMinted === true, 'the added sheet has a minted id', JSON.stringify(sa));
await until(async () => (await chipStatus('a1.pdf')) !== '', 'a1 chip', 10000);
check((await chipStatus('a1.pdf')) === 'not-opened', 'before Open the chip says not-opened', await chipStatus('a1.pdf'));
check((((await chip('a1.pdf').textContent()) ?? '').trim()) === 'Not opened yet', 'the chip text is "Not opened yet"');
check(!/Save it in MepApp to link it/.test((await row('a1.pdf').textContent()) ?? '') && !/Not saved yet/.test((await dlg.textContent()) ?? ''), 'no "Not saved yet" text before Open');
check((await summaryIds()).length === 0, 'no summary before Open');
await shot('b3-t13c-1');

// 2. Open from the dialog (web: Choose file…). The document adopts the sheet id and the summary is written.
await row('a1.pdf').locator('[data-testid="open-sheet"]').click();
await until(async () => (await docs()).some((d) => d.name === 'a1.pdf'), 'a1 opened', 30000);
await until(async () => (await chipStatus('a1.pdf')) === 'ok', 'a1 chip OK after Open', 30000);
check((((await chip('a1.pdf').textContent()) ?? '').trim()) === 'OK', 'after Open the chip says OK');
check(!/Not saved yet|Save it in MepApp/.test((await dlg.textContent()) ?? ''), 'no "Save it to link it" text after Open');
const d1 = (await docs()).find((d) => d.name === 'a1.pdf');
s = await stored();
const sa2 = s.sheets.find((x) => x.location.fileName === 'a1.pdf');
check(d1.uuid === sa2.projectUuid && d1.inFile === false, 'the document adopted the sheet id (not yet in the file)', JSON.stringify({ d1, id: sa2.projectUuid }));
check((await summaryIds()).includes(sa2.projectUuid), 'the summary file has the sheet id', JSON.stringify(await summaryIds()));
check(sa2.projectUuid === sa.projectUuid && sa2.idMinted === true, 'the sheet keeps its minted id until a Save');
await row('a1.pdf').scrollIntoViewIfNeeded();
await shot('b3-t13c-2');

// 3. Menu > Open of a second added PDF (no dialog Open): same result.
await putFile('a2.pdf', '00_arch_ground_floor.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.some((x) => x.location.fileName === 'a2.pdf'), 'a2 added', 20000);
await idle(600);
const a2id = (await stored()).sheets.find((x) => x.location.fileName === 'a2.pdf').projectUuid;
check(typeof a2id === 'string' && a2id !== sa.projectUuid, 'a second PDF gets its own id');
const pages2 = (await stored()).sheets.filter((x) => x.location.fileName === 'a2.pdf');
check(pages2.every((x) => x.projectUuid === a2id), 'all pages of one PDF share one id', String(pages2.length));
await closeDialog();
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'a2.pdf');
await idle(1500);
await openDialog();
await until(async () => (await chipStatus('a2.pdf')) === 'ok', 'a2 chip OK after Menu > Open', 30000);
check((await chipStatus('a2.pdf')) === 'ok', 'Menu > Open: the a2 sheet shows OK');
check((await summaryIds()).includes(a2id), 'Menu > Open: the summary file has the a2 id');

// 4. The PDF was open before it was added: the document takes the id of its sheet.
await closeDialog();
await t.openPdf(FIX + '01_arch_first_floor.pdf', 'a3.pdf');
await idle(1500);
await openDialog();
await putFile('a3.pdf', '01_arch_first_floor.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await until(async () => (await stored()).sheets.some((x) => x.location.fileName === 'a3.pdf'), 'a3 added', 20000);
await idle(1500);
const a3id = (await stored()).sheets.find((x) => x.location.fileName === 'a3.pdf')?.projectUuid;
await until(async () => (await docs()).find((d) => d.name === 'a3.pdf')?.uuid === a3id, 'a3 document adopts the id', 15000);
check((await docs()).find((d) => d.name === 'a3.pdf')?.uuid === a3id, 'an already open document adopts the id of the new sheet');
await until(async () => (await chipStatus('a3.pdf')) === 'ok', 'a3 chip OK without a Save', 20000);
check((await chipStatus('a3.pdf')) === 'ok', 'an open PDF added to a level shows OK without a Save', await chipStatus('a3.pdf'));
check((await summaryIds()).includes(a3id), 'the summary file has the a3 id without a Save', JSON.stringify(await summaryIds()));

// 5. Export a Level: the rows of the opened PDFs, no "no id yet" warning.
await closeDialog();
await page.evaluate(() => {
  const orig = window.showSaveFilePicker;
  window.__suggested = [];
  window.showSaveFilePicker = async (o) => {
    window.__suggested.push(o?.suggestedName);
    return orig(o);
  };
});
await menu('Export quantities to Excel…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(400);
await dlg.locator('input[type=radio]').nth(2).check();
await dlg.locator('select[aria-label="Level"]').selectOption({ label: 'Ground floor' });
await dlg.locator('button', { hasText: /^Export$/ }).click();
await idle(1200);
const ask = page.locator('.mep-modal', { hasText: 'Save the drawing first' });
if ((await ask.count()) > 0) {
  check(true, 'the Save question shows for the open PDF whose id is not in the file yet');
  await ask.locator('button', { hasText: /^Save$/ }).click();
}
await until(async () => /xlsx|no segments|warning/i.test(await t.statusText()), 'level export status', 60000);
const exportStatus = await t.statusText();
check(!/no id yet/.test(exportStatus), 'the level export status has no "no id yet" warning', exportStatus.slice(0, 400));
check(!/no saved summary/.test(exportStatus), 'the level export status has no "no saved summary" warning', exportStatus.slice(0, 400));
console.log('export status:', exportStatus);
const sa3 = (await stored()).sheets.find((x) => x.location.fileName === 'a3.pdf');
check(sa3?.projectUuid === a3id && sa3?.idMinted !== true, 'after the Save the id is in the PDF: the sheet keeps its id and loses the minted flag', JSON.stringify(sa3));
await shot('b3-t13c-3');

await t.finish();
