// T19 C3: "Read summaries now" skips a sheet that needs to be opened first (status not-opened) and says so in plain words.
import { readFileSync } from 'node:fs';
import { open } from '../browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();
const dlg = page.locator('.mep-modal');

for (const name of ['plain1.pdf', 'plain2.pdf']) {
  await page.evaluate(
    async ([b64, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
    },
    [readFileSync(FIX + 'arch_simple_A4.pdf').toString('base64'), name],
  );
}
const sheet = (id, name, uuid, extra = {}) => ({ id, levelId: 'l0', projectUuid: uuid, pageIndex: 0, displayName: name, location: { fileName: name, path: name }, ...extra });
const building = {
  schemaVersion: 1, id: 'b-c3', name: 'C3 block',
  levels: [{ id: 'l0', name: 'Ground floor', elevationMm: 0 }],
  sheets: [sheet('s1', 'plain1.pdf', 'u-minted', { idMinted: true }), sheet('s2', 'plain2.pdf', 'u-second')],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await idle(400);
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(1000);

const chips = await dlg.locator('[data-testid="sheet-status"]').allInnerTexts();
check(chips.some((c) => /Not opened yet/.test(c)) && chips.some((c) => /No summary/.test(c)), 'one sheet is Not opened yet and one has No summary', chips.join('|'));
const rebuild = dlg.locator('[data-testid="rebuild-summaries"]');
check((await rebuild.count()) === 1 && (await rebuild.isEnabled()), 'the Read summaries now button is enabled');
await rebuild.click();
await dlg.locator('[data-testid="rebuild-result"]').waitFor({ timeout: 30000 });
await idle(800);
const result = (await dlg.locator('[data-testid="rebuild-result"]').textContent()) ?? '';
const failures = (await dlg.locator('[data-testid="rebuild-failures"]').textContent().catch(() => '')) ?? '';
check(/Read 0 of 1 summaries/.test(result), 'result counts only the sheet that was tried', result);
check(/1 PDF needs to be opened first/.test(result), 'result says 1 PDF needs to be opened first', result);
check(!/plain1\.pdf/.test(failures), 'the not-opened sheet is not in the failure list', failures);
check(/plain2\.pdf/.test(failures), 'the readable sheet that could not be read is in the failure list', failures);
await shot('T19-C3-result');
await t.finish();
