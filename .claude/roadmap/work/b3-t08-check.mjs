// B3-T08: Rebuild summaries button, progress, cancel, result list, summary text of each row. Real clicks.
import { readFileSync } from 'node:fs';
import { open } from '../browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const groupOf = (n) => dlg.locator('[data-testid="pdf-group"]').filter({ hasText: n });
const summaryOf = async (n) => ((await groupOf(n).locator('[data-testid="sheet-summary"]').first().textContent()) ?? '').trim();
const uuid = () => page.evaluate(() => window.__mepSketchScene.getProjectUuid());

async function openAndSave(file, name) {
  await t.openPdf(FIX + file, name);
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${name}`);
  await idle(800);
  check(/^Saved /.test(await statusText()), `${name} saved`, await statusText());
  return uuid();
}
// ground.pdf gets the scale 1:100 before it is saved.
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'ground.pdf');
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 72 / 25.4 / 100 }));
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save ground');
await idle(800);
const U1 = await uuid();
const U2 = await openAndSave('01_arch_first_floor.pdf', 'first.pdf');
await page.evaluate(
  async ([b64, n]) => {
    const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
    await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    await w.close();
  },
  [readFileSync(FIX + 'arch_simple_A4.pdf').toString('base64'), 'plain.pdf'],
);
check(U1 && U2 && U1 !== U2, 'two saved documents have two ids');

const sheet = (id, name, uuidValue, path) => ({ id, levelId: 'l0', projectUuid: uuidValue, pageIndex: 0, displayName: name, location: { fileName: name, path: path ?? name } });
const building = {
  schemaVersion: 1, id: 'b-t08', name: 'Office block',
  levels: [{ id: 'l0', name: 'Ground floor', elevationMm: 0 }],
  sheets: [sheet('s1', 'ground.pdf', U1), sheet('s2', 'first.pdf', null), sheet('s3', 'plain.pdf', null), sheet('s4', 'gone.pdf', null)],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await idle(400);
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(800);

check((await groupOf('ground.pdf').locator('[data-testid="sheet-summary"]').count()) === 0, 'before: ground.pdf has no summary text');
check(/No summary/.test((await groupOf('ground.pdf').textContent()) ?? ''), 'before: ground.pdf status says "No summary"');
check((await groupOf('first.pdf').locator('[data-testid="sheet-summary"]').count()) === 0 && /No summary|Not saved yet/.test((await groupOf('first.pdf').locator('[data-testid="sheet-status"]').first().textContent()) ?? ''), 'before: first.pdf chip shows a no-summary state and no summary text');
const rebuild = dlg.locator('[data-testid="rebuild-summaries"]');
check((await rebuild.count()) === 1 && (await rebuild.isEnabled()), 'the Rebuild summaries button is enabled');
await shot('B3-T08-before');

// Cancel: click Rebuild and Cancel in the same task, before the first document is read.
await page.evaluate(() => {
  document.querySelector('[data-testid="rebuild-summaries"]').click();
  setTimeout(() => document.querySelector('[data-testid="rebuild-cancel"]')?.click(), 0);
});
await dlg.locator('[data-testid="rebuild-result"]').waitFor({ timeout: 20000 });
let result = (await dlg.locator('[data-testid="rebuild-result"]').textContent()) ?? '';
check(/Cancelled/.test(result), 'Cancel stops the run: the result says so', result);
const stored1 = await page.evaluate(async () => (await window.__mepBuilding.store.listSummaries()).length);
check(stored1 < 2, 'a cancelled run wrote fewer than 2 summaries', String(stored1));
await shot('B3-T08-cancelled');

// Full run, by a real click.
await rebuild.click();
await until(async () => !/Cancelled/.test((await dlg.locator('[data-testid="rebuild-result"]').textContent().catch(() => '')) ?? ''), 'run result', 60000);
await idle(800);
result = (await dlg.locator('[data-testid="rebuild-result"]').textContent()) ?? '';
check(/Read 2 of 4 summaries/.test(result), 'result: 2 of 4 rebuilt', result);
const failures = (await dlg.locator('[data-testid="rebuild-failures"]').textContent().catch(() => '')) ?? '';
check(/plain\.pdf/.test(failures) && /not saved yet/.test(failures), 'failure list names plain.pdf with its reason', failures);
check(/gone\.pdf/.test(failures) && /PDF missing/.test(failures), 'failure list names gone.pdf with its reason', failures);
check(/1 sheet linked/.test(result), 'result: 1 sheet linked', result);
check((await dlg.locator('[data-testid="rebuild-notlinked"]').count()) === 0, 'no "not linked" list in the result');
const li = await dlg.locator('[data-testid="rebuild-failures"] li').first().evaluate((el) => getComputedStyle(el).textOverflow + '|' + getComputedStyle(el).whiteSpace);
check(!/ellipsis/.test(li) && !/nowrap/.test(li), 'failure text is not cut', li);

const s1 = await summaryOf('ground.pdf');
check(/^Summary saved \d{4}-\d{2}-\d{2}, scale 1:100$/.test(s1), 'ground.pdf row: date and scale 1:100', s1);
const s2 = await summaryOf('first.pdf');
check(/^Summary saved \d{4}-\d{2}-\d{2}/.test(s2), 'first.pdf row: Summary saved <date>', s2);
const stored2 = await page.evaluate(async () => (await window.__mepBuilding.store.listSummaries()).length);
check(stored2 === 2, 'two summaries are in the store', String(stored2));
const sheetsAfter = await page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json).sheets.map((x) => x.projectUuid));
check(sheetsAfter[1] === U2, 'Rebuild linked the unstamped sheet first.pdf', JSON.stringify(sheetsAfter));
await shot('B3-T08-rebuild');

await t.finish();
