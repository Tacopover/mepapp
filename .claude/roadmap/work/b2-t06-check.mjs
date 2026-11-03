// B2-T06: Rebuild summaries over the two tracked fixtures. Real Open and Save through the menu; the rebuild starts through the dev hook (no button before B3-T08).
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const GROUND = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/00_arch_ground_floor.pdf';
const FIRST = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/01_arch_first_floor.pdf';
const t = await open();
const { page, check, menu, until, statusText, shot } = t;
await t.start();

async function saveActive(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await t.idle(800);
  check(/^Saved /.test(await statusText()), `${label} saved`, await statusText());
}

await t.openPdf(GROUND, 'ground.pdf');
const u0 = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
await saveActive('ground');
await t.openPdf(FIRST, 'first.pdf');
const u1 = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
await saveActive('first');
check(u0 && u1 && u0 !== u1, 'two documents with two different ids', `${u0} / ${u1}`);

const GONE = '22222222-2222-4222-8222-222222222222';
const building = {
  schemaVersion: 1, id: 'b-t06', name: 'Tower',
  levels: [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 3000 }],
  sheets: [
    { id: 's1', levelId: 'l0', projectUuid: u0, pageIndex: 0, displayName: 'Ground', location: { fileName: 'ground.pdf' } },
    { id: 's2', levelId: 'l1', projectUuid: u1, pageIndex: 0, displayName: 'First', location: { fileName: 'first.pdf' } },
  ],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
check((await page.evaluate(() => window.__mepBuilding.store.listSummaries())).length === 0, 'no summaries before the rebuild');
check(await page.evaluate(() => typeof window.__mepBuilding.rebuildSummaries === 'function'), 'rebuild hook registered');

// Start the rebuild and watch the status line.
const seen = new Set();
const run = page.evaluate(async () => {
  const read = async (sheet) => {
    try {
      return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile();
    } catch {
      return undefined;
    }
  };
  const r = await window.__mepBuilding.rebuildSummaries(read);
  return { ok: r.ok, failed: r.failed.map((f) => ({ id: f.sheet.id, reason: f.reason })) };
});
let done = false;
run.then(() => { done = true; });
while (!done) {
  seen.add(await statusText());
  await page.waitForTimeout(40);
}
const result = await run;
await t.idle(300);
seen.add(await statusText());
console.log('status values seen:', JSON.stringify([...seen]));
check(result.ok === 2 && result.failed.length === 0, 'rebuild ok for 2 documents', JSON.stringify(result));
check(/Read 2 of 2 summaries\./.test(await statusText()), 'status reaches 2 of 2', await statusText());
await shot('B2-T06-rebuilt');

const sums = await page.evaluate(async ([a, b]) => {
  const s = window.__mepBuilding.store;
  const get = async (u) => { const r = await s.readSummary(u); return r === undefined ? null : JSON.parse(r); };
  return { list: await s.listSummaries(), a: await get(a), b: await get(b) };
}, [u0, u1]);
check(sums.list.length === 2, 'two summaries in the store', JSON.stringify(sums.list));
check(sums.a?.projectUuid === u0 && sums.b?.projectUuid === u1, 'summaries carry the right ids');
check(sums.a?.pages?.['0']?.widthPt > 0 && sums.b?.pages?.['0']?.heightPt > 0, 'summaries hold the displayed page sizes');
check(sums.a?.sourceSizeBytes > 0 && sums.b?.sourceSizeBytes > 0, 'summaries hold the file sizes');

// A sheet whose PDF cannot be read is a failure; the others still count.
const withGone = { ...building, sheets: [...building.sheets, { id: 's3', levelId: 'l1', projectUuid: GONE, pageIndex: 0, displayName: 'Gone', location: { fileName: 'gone.pdf' } }] };
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(withGone));
const res2 = await page.evaluate(async () => {
  const read = async (sheet) => {
    try {
      return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile();
    } catch {
      return undefined;
    }
  };
  const r = await window.__mepBuilding.rebuildSummaries(read);
  return { ok: r.ok, failed: r.failed.map((f) => ({ id: f.sheet.id, reason: f.reason })) };
});
check(res2.ok === 2 && res2.failed.length === 1 && res2.failed[0].id === 's3', 'missing PDF is one failure, others done', JSON.stringify(res2));
const st = await statusText();
check(/Read 2 of 3 summaries\. 1 failed\. See Manage Buildings\./.test(st), 'status names the failed sheet', st);
await shot('B2-T06-one-failed');

await t.finish();
