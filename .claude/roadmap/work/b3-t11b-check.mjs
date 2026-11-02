// B3-T11b: summary on open. Two saved PDFs, a building with NO summaries, each PDF opened through Menu > Open.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { makeTwoDocuments, buildingOf, recordSuggestedNames, exportScope } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/work/b2-lib.mjs';

const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();
await recordSuggestedNames(t);

const ids = await makeTwoDocuments(t);

const building = buildingOf(ids.ground, ids.first);
building.sheets.push({ id: 's3', levelId: 'l1', projectUuid: null, pageIndex: 0, displayName: 'Plain', location: { fileName: 'plain.pdf', path: 'plain.pdf' } });
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await idle(400);
const summaries = () => page.evaluate(async () => (await window.__mepBuilding.store.listSummaries()).sort());
check((await summaries()).length === 0, 'start: the building has no summaries', JSON.stringify(await summaries()));

// Close both tabs (setup through the scene API; the documents are saved and clean).
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  for (const d of s.getDocuments()) s.closeDocument(d.id);
});
await idle(500);

const dlg = page.locator('.mep-modal');
const groupOf = (n) => dlg.locator('[data-testid="pdf-group"]').filter({ hasText: n });
const summaryOf = async (n) => ((await groupOf(n).locator('[data-testid="sheet-summary"]').first().textContent().catch(() => '')) ?? '').trim();
async function showDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(800);
}
async function closeDialog() {
  await dlg.locator('button', { hasText: /^Close$/ }).last().click();
  await dlg.waitFor({ state: 'hidden', timeout: 8000 });
  await idle(300);
}
async function openSaved(name) {
  await page.evaluate((n) => { window.__nextFile = n; }, name);
  await menu('Open…');
  await until(async () => /Loaded|Could not open|Switched/.test(await statusText()), `open ${name}`);
  await idle(1500);
}

await showDialog();
const gt = (await groupOf('ground.pdf').textContent()) ?? '';
const ft = (await groupOf('first.pdf').textContent()) ?? '';
check(/No summary/.test(gt) && (await summaryOf('ground.pdf')) === '', 'before: ground.pdf says "No summary" and has no summary text', gt);
check(/No summary/.test(ft) && (await summaryOf('first.pdf')) === '', 'before: first.pdf says "No summary" and has no summary text', ft);
await shot('B3-T11b-before');
await closeDialog();

await openSaved('ground.pdf');
await until(async () => (await summaries()).length >= 1, 'summary of ground.pdf', 20000);
check((await summaries()).join() === ids.ground, 'after opening ground.pdf: one summary, under its own id', JSON.stringify(await summaries()));
await openSaved('first.pdf');
await until(async () => (await summaries()).length >= 2, 'summary of first.pdf', 20000);
check((await summaries()).sort().join() === [ids.ground, ids.first].sort().join(), 'after opening first.pdf: two summaries', JSON.stringify(await summaries()));
const dirty = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.isDirty ?? d.dirty ?? false));
check(dirty.every((x) => !x), 'opening did not make any document dirty', JSON.stringify(dirty));

await showDialog();
const g = await summaryOf('ground.pdf');
const f = await summaryOf('first.pdf');
check(/^Summary saved \d{4}-\d{2}-\d{2}/.test(g), 'after: ground.pdf row says "Summary saved <date>" with no Rebuild', g);
check(/^Summary saved \d{4}-\d{2}-\d{2}/.test(f), 'after: first.pdf row says "Summary saved <date>" with no Rebuild', f);
await shot('B3-T11b-after');
await closeDialog();

// Opening again (close the tab, then open again): the summary is fresh, no new write.
const savedAt = await page.evaluate(async (u) => JSON.parse(await window.__mepBuilding.store.readSummary(u)).savedAt, ids.ground);
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  const doc = s.getDocuments().find((d) => d.fileName === 'ground.pdf');
  if (doc) s.closeDocument(doc.id);
});
await idle(500);
await page.waitForTimeout(1100);
await openSaved('ground.pdf');
const savedAt2 = await page.evaluate(async (u) => JSON.parse(await window.__mepBuilding.store.readSummary(u)).savedAt, ids.ground);
check(savedAt === savedAt2, 'opening an unchanged PDF again does not rewrite its summary', `${savedAt} ${savedAt2}`);

// A PDF with no embedded id (a random id in memory) writes nothing and links nothing.
await page.evaluate(
  async ([b64, n]) => {
    const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    await w.close();
  },
  [readFileSync('/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/arch_simple_A4.pdf').toString('base64'), 'plain.pdf'],
);
await openSaved('plain.pdf');
await idle(1500);
check((await summaries()).length === 2, 'a PDF with no id writes no summary', JSON.stringify(await summaries()));
const sheets = await page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json).sheets.map((x) => x.projectUuid));
check(sheets[2] === null, 'a PDF with no id links no sheet', JSON.stringify(sheets));

// Level export works without Rebuild.
const level0 = await exportScope(t, 'level', 'Level 0');
const seg = level0.xlsx.sheets.Segments ?? [];
check(seg.length === 2, 'Level 0 export has one segment row', JSON.stringify(seg));
check(!level0.xlsx.sheetNames.includes('Warnings'), 'Level 0 export has no warnings', JSON.stringify(level0.xlsx.sheetNames));
await shot('B3-T11b-export');

await t.finish();
