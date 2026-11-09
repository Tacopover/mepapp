// B3-T06: sheet status, relink, and the copy/move dialog. Real clicks. Native Tauri paths (moved verdict, grant access) cannot run here.
import { readFileSync } from 'node:fs';
import { open } from '../browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const groupOf = (n) => dlg.locator('[data-testid="pdf-group"]').filter({ hasText: n });
const statusOf = async (n) => (await groupOf(n).locator('[data-testid="sheet-status"]').first().getAttribute('data-status')) ?? '';
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const uuid = () => page.evaluate(() => window.__mepSketchScene.getProjectUuid());

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
async function copyOpfs(from, to) {
  await page.evaluate(async ([a, b]) => {
    const root = await navigator.storage.getDirectory();
    const bytes = new Uint8Array(await (await (await root.getFileHandle(a)).getFile()).arrayBuffer());
    const w = await (await root.getFileHandle(b, { create: true })).createWritable();
    await w.write(bytes);
    await w.close();
    window.__nextFile = b;
  }, [from, to]);
}
const sizeOf = (n) => page.evaluate(async (name) => (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).size, n);

// A saved document gives a real project id.
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'orig.pdf');
const U = await uuid();
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save');
await idle(800);
check(/^Saved /.test(await statusText()), 'orig.pdf saved', await statusText());
const size = await sizeOf('orig.pdf');
const V = '33333333-3333-4333-8333-333333333333';
await putFile('first.pdf', '01_arch_first_floor.pdf');

const summary = (bytes) => JSON.stringify({ version: 1, projectUuid: U, savedAt: '2026-11-02T10:00:00.000Z', sourceSizeBytes: bytes, sourceModifiedMs: 1, pages: {}, tables: [], warnings: [] });
const building = {
  schemaVersion: 1, id: 'b-t06', name: 'Tower',
  levels: [{ id: 'l0', name: 'Ground floor', elevationMm: 0 }],
  sheets: [
    { id: 's1', levelId: 'l0', projectUuid: U, pageIndex: 0, displayName: 'orig.pdf', location: { fileName: 'orig.pdf', path: 'orig.pdf' } },
    { id: 's2', levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: 'gone.pdf', location: { fileName: 'gone.pdf', path: 'gone.pdf' } },
    { id: 's3', levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: 'nopath.pdf', location: { fileName: 'nopath.pdf' } },
    { id: 's4', levelId: 'l0', projectUuid: V, pageIndex: 1, displayName: 'gone2.pdf', location: { fileName: 'gone2.pdf', path: 'gone2.pdf' } },
    { id: 's5', levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: 'gone3.pdf', location: { fileName: 'gone3.pdf', path: 'gone3.pdf' } },
  ],
  risers: [],
};
await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [U]: summary(size) }]);
await idle(400);

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
await openDialog();

check((await statusOf('orig.pdf')) === 'ok', 'orig.pdf: file found, summary current -> ok', await statusOf('orig.pdf'));
check((await statusOf('gone.pdf')) === 'pdf-missing', 'gone.pdf: PDF missing', await statusOf('gone.pdf'));
check((await statusOf('nopath.pdf')) === 'not-stamped', 'nopath.pdf: not stamped', await statusOf('nopath.pdf'));
check(/Missing/.test(await groupOf('gone.pdf').textContent()), 'the row says "Missing"');
await shot('B3-T06-missing');

// An old summary: another size in the stored summary.
await page.evaluate(([u, j]) => window.__mepBuilding.store.writeSummary(u, j), [U, summary(size + 1)]);
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(600);
check((await statusOf('orig.pdf')) === 'old-summary', 'orig.pdf: old summary after the size changed', await statusOf('orig.pdf'));
await page.evaluate(([u]) => window.__mepBuilding.store.writeSummary(u, JSON.stringify({ version: 1, projectUuid: u, savedAt: 'x', sourceSizeBytes: 0, sourceModifiedMs: 1, pages: {}, tables: [], warnings: [] })), [U]);
await page.evaluate(([u]) => window.__mepBuilding.store.writeSummary(u, '{"bad"'), [U]);
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(600);
check((await statusOf('orig.pdf')) === 'no-summary', 'orig.pdf: no summary when the stored one cannot be read', await statusOf('orig.pdf'));

// Relink gone.pdf to first.pdf (no embedded id: the sheet keeps its null id).
await groupOf('gone.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1200);
let s = await stored();
check(s.sheets.find((x) => x.id === 's2')?.location.fileName === 'first.pdf', 'relink changes the file name of the sheet', JSON.stringify(s.sheets.find((x) => x.id === 's2')?.location));
check((await groupOf('first.pdf').count()) === 1 && (await groupOf('gone.pdf').count()) === 0, 'the group now shows first.pdf');

// A relink that would give two sheets the same document id and page is refused (gone3.pdf page 1 + id U, orig.pdf page 1 already has U).
await copyOpfs('orig.pdf', 'orig-dup.pdf');
await groupOf('gone3.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1200);
check(/Could not relink/.test((await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? ''), 'a relink that duplicates a sheet is refused');
check((await stored()).sheets.find((x) => x.id === 's5').location.fileName === 'gone3.pdf', 'the refused relink changed nothing');

// Relink with another document id asks first. gone2.pdf holds id V; orig.pdf holds id U.
await copyOpfs('orig.pdf', 'orig-again.pdf');
await groupOf('gone2.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1200);
check((await groupOf('gone2.pdf').locator('[data-testid="relink-confirm"]').count()) === 1, 'another id: the pane asks before it relinks');
check((await stored()).sheets.find((x) => x.id === 's4').location.fileName === 'gone2.pdf', 'nothing changed before the answer');
await shot('B3-T06-relink-confirm');
await groupOf('gone2.pdf').locator('button', { hasText: /^Cancel$/ }).click();
await idle(300);
check((await stored()).sheets.find((x) => x.id === 's4').location.fileName === 'gone2.pdf', 'Cancel keeps the old location');
await copyOpfs('orig.pdf', 'orig-again.pdf');
await groupOf('gone2.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1200);
await groupOf('gone2.pdf').locator('button', { hasText: /^Relink to this file$/ }).click();
await idle(600);
s = await stored();
const s4 = s.sheets.find((x) => x.id === 's4');
check(s4.location.fileName === 'orig-again.pdf' && s4.projectUuid === U, 'Relink anyway sets the new location and id', JSON.stringify(s4));

// Close the dialog. Open a copy of the saved file: the copy dialog shows.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(300);
async function openCopy(name) {
  await copyOpfs('orig.pdf', name);
  await menu('Open…');
  await dlg.locator('[data-testid="dup-copy"]').waitFor({ state: 'visible', timeout: 60000 });
  await idle(400);
}
const docsBefore = await page.evaluate(() => window.__mepSketchScene.getDocuments().length);
await openCopy('copy1.pdf');
check(/looks like a copy/i.test(await dlg.textContent()), 'the copy dialog shows');
check(/orig\.pdf|orig-again\.pdf/.test(await dlg.textContent()), 'the copy dialog names the stored sheet');
await shot('B3-T06-copy');
const uBefore = await uuid();
await dlg.locator('[data-testid="dup-copy"]').click();
await idle(500);
const uAfter = await uuid();
check(uBefore === U && uAfter && uAfter !== U, 'Use as a copy gives the open document a new id', `${uBefore} -> ${uAfter}`);
check((await page.evaluate(() => window.__mepSketchScene.getDocuments().length)) === docsBefore + 1, 'the copy stays open as its own document');
const sheetsAfterCopy = (await stored()).sheets.map((x) => x.location.fileName).join(',');

// The same file under another name: update the location.
await openCopy('copy2.pdf');
await dlg.locator('[data-testid="dup-same"]').click();
await idle(600);
s = await stored();
check(s.sheets.filter((x) => x.projectUuid === U).every((x) => x.location.fileName === 'copy2.pdf'), 'It is the same file: every sheet of the id gets the new file name', JSON.stringify(s.sheets.map((x) => x.location.fileName)));
check((await uuid()) === U, 'the document keeps its id');

// Cancel changes nothing.
await openCopy('copy3.pdf');
const before = JSON.stringify((await stored()).sheets);
await dlg.locator('[data-testid="dup-cancel"]').click();
await idle(400);
check(JSON.stringify((await stored()).sheets) === before, 'Cancel changes no sheet');
check((await uuid()) === U, 'Cancel keeps the id of the open document');
check(sheetsAfterCopy.length > 0, 'sheets exist');
await shot('B3-T06-after');

await t.finish();
