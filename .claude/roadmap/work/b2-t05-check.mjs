// B2-T05: Save writes the sheet summary into the open building store (real Menu > Save).
import { open, PDF } from '../browser/lib.mjs';

const GROUND = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/00_arch_ground_floor.pdf';
const t = await open();
const { page, check, menu, until, statusText, shot } = t;
await t.start();
await t.openPdf(GROUND, 'ground.pdf');

const uuid = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
check(typeof uuid === 'string' && uuid.length > 10, 'open document has a project id', String(uuid));

// Setup: a building with two sheets. Sheet 1 matches the open document by id; sheet 2 is another document.
const building = {
  schemaVersion: 1, id: 'b-t05', name: 'Tower',
  levels: [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 3000 }],
  sheets: [
    { id: 's1', levelId: 'l0', projectUuid: uuid, pageIndex: 0, displayName: 'Ground', location: { fileName: 'ground.pdf' } },
    { id: 's2', levelId: 'l1', projectUuid: '11111111-1111-4111-8111-111111111111', pageIndex: 0, displayName: 'First', location: { fileName: 'first.pdf' } },
  ],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
const before = await page.evaluate(() => window.__mepBuilding.store.listSummaries());
check(before.length === 0, 'no summaries before Save', JSON.stringify(before));

await menu('Save');
await until(async () => /Saved /.test(await statusText()), 'save');
await t.idle(800);
const status1 = await statusText();
console.log('status after Save:', status1);
check(/^Saved ground\.pdf\./.test(status1), 'status line says Saved', status1);

const sizeInOpfs = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('ground.pdf')).getFile()).size);
const sum = await page.evaluate(async (u) => {
  const raw = await window.__mepBuilding.store.readSummary(u);
  return raw === undefined ? null : JSON.parse(raw);
}, uuid);
check(sum !== null, 'summary written for the document id');
check(sum?.projectUuid === uuid, 'summary projectUuid matches', String(sum?.projectUuid));
check(sum?.sourceSizeBytes === sizeInOpfs && sizeInOpfs > 0, 'sourceSizeBytes equals saved file size', `${sum?.sourceSizeBytes} vs ${sizeInOpfs}`);
check(typeof sum?.sourceModifiedMs === 'number' && Math.abs(Date.now() - sum.sourceModifiedMs) < 120000, 'sourceModifiedMs is recent', String(sum?.sourceModifiedMs));
check(!!sum?.pages?.['0'] && sum.pages['0'].widthPt > 0 && sum.pages['0'].heightPt > 0, 'page 0 has a displayed size', JSON.stringify(sum?.pages));
const list = await page.evaluate(() => window.__mepBuilding.store.listSummaries());
check(list.length === 1 && list[0] === uuid, 'only this document has a summary', JSON.stringify(list));
await shot('B2-T05-saved');

// A failing summary write must not undo the Save and must show a status line.
await page.evaluate(() => { window.__mepBuilding.store.writeSummary = async () => { throw new Error('disk full'); }; });
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save 2');
await t.idle(800);
const status2 = await statusText();
console.log('status after failing summary:', status2);
check(/Saved ground\.pdf, but the building summary was not written: disk full/.test(status2), 'status line shows the summary failure', status2);
const sizeAfter = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('ground.pdf')).getFile()).size);
check(sizeAfter > 0, 'PDF still written', String(sizeAfter));
const dirty = await page.evaluate(() => window.__mepSketchScene.listDocuments?.().some((d) => d.isDirty) ?? false);
check(dirty === false, 'document not dirty after the Save');
await shot('B2-T05-summary-failed');

await t.finish();
