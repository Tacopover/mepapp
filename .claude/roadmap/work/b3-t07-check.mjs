// B3-T07: the current sheet in the status bar. Real clicks on the tab and the page buttons.
import { open } from '../browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const uuid = () => page.evaluate(() => window.__mepSketchScene.getProjectUuid());
const label = async () => {
  const chip = page.locator('[data-testid="current-sheet"]');
  return (await chip.count()) === 0 ? null : ((await chip.textContent()) ?? '').trim();
};
const headerLabel = async () => {
  const chip = page.locator('[data-testid="current-sheet-header"]');
  return (await chip.count()) === 0 ? null : ((await chip.textContent()) ?? '').trim();
};

async function openAndSave(file, name) {
  await t.openPdf(FIX + file, name);
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${name}`);
  await idle(800);
  check(/^Saved /.test(await statusText()), `${name} saved`, await statusText());
  return uuid();
}
const U1 = await openAndSave('00_arch_ground_floor.pdf', 'ground.pdf');
const U2 = await openAndSave('Sample Project_multi_page.pdf', 'multi.pdf');
check(U1 && U2 && U1 !== U2, 'two saved documents have two ids', `${U1} ${U2}`);

const building = {
  schemaVersion: 1,
  id: 'b-t07',
  name: 'Office block',
  levels: [
    { id: 'l0', name: 'Ground floor', elevationMm: 0 },
    { id: 'l1', name: 'Level 1', elevationMm: 3000 },
  ],
  sheets: [
    { id: 's1', levelId: 'l0', projectUuid: U1, pageIndex: 0, displayName: 'ground.pdf', location: { fileName: 'ground.pdf', path: 'ground.pdf' } },
    { id: 's2', levelId: 'l1', projectUuid: U2, pageIndex: 1, displayName: 'multi.pdf p2', location: { fileName: 'multi.pdf', path: 'multi.pdf' } },
  ],
  risers: [],
};
check((await label()) === null, 'no building open: no sheet label');
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await idle(600);

// multi.pdf is the active tab and shows page 1: not a sheet of the building.
check((await label()) === null, 'multi.pdf page 1 is not a sheet: no label', await label());

// Real click on the next-page button.
await page.locator('.mep-page-chip button[title="Next page"]').click();
await idle(1500);
let l = await label();
check(l === 'Office block / Level 1 / multi.pdf p2', 'page 2 of multi.pdf: label shows building, level and sheet', String(l));
check((await headerLabel()) === l, 'page 2 of multi.pdf: header shows the same sheet label', String(await headerLabel()));
await shot('B3-T07-header');
const chipBox = await page.locator('.mep-page-chip').boundingBox();
check(chipBox !== null && chipBox.height < 32, 'the Page chip is one line', JSON.stringify(chipBox));
const labelBox = await page.locator('[data-testid="current-sheet"]').boundingBox();
check(labelBox !== null && labelBox.height < 32, 'the sheet chip is one line', JSON.stringify(labelBox));
await shot('B3-T07-label');

// Page 3: no label.
await page.locator('.mep-page-chip button[title="Next page"]').click();
await idle(1500);
check((await label()) === null, 'page 3 is not a sheet: no label', await label());
check((await page.locator('[data-testid="current-sheet-header"]').count()) === 0, 'page 3 is not a sheet: no header label');

// Switch the tab by a real click on the document in the Drawings panel or the header switcher.
const docs = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
check(docs.includes('ground.pdf') && docs.includes('multi.pdf'), 'two documents are open', JSON.stringify(docs));
await page.locator('.mep-doc-switcher-btn').click();
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'ground.pdf' }).click();
await idle(1500);
l = await label();
check(l === 'Office block / Ground floor / ground.pdf', 'the ground.pdf tab: label changes', String(l));
check((await headerLabel()) === l, 'the ground.pdf tab: header shows the same sheet label', String(await headerLabel()));
await shot('B3-T07-label-ground');

await t.finish();
