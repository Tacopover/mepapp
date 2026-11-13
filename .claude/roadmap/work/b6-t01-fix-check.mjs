// B6-T01 journey fixes: F1 opened sheets do not count in the band; F2 the notice is visible at 760 px; band gap 8 px.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const real = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf', '00_arch_ground_floor_edit.pdf'];
const sizeOf = (f) => readFileSync(FIX + f).length;
const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
await t.start();
await page.evaluate(
  (list) => {
    window.__blobs = {};
    for (const [name, b64] of list) window.__blobs[name] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.showOpenFilePicker = async () =>
      window.__pick.map((s) => ({ kind: 'file', name: s.name, getFile: async () => new File([window.__blobs[s.src]], s.name, { lastModified: 1000 }) }));
  },
  real.map((f) => [f, readFileSync(FIX + f).toString('base64')]),
);
const dlg = page.locator('.mep-modal');
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const sheet = (id, levelId, f) => ({ id, levelId, projectUuid: null, pageIndex: 0, displayName: f, location: { fileName: f, sizeBytes: sizeOf(f) } });
const sheets = [sheet('s1', 'l1', real[0]), sheet('s2', 'l1', real[1]), sheet('s3', 'l2', real[2]), sheet('s4', 'l2', real[3])];
const bj = (id) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const load = async (id) => { await page.evaluate((j) => window.__mepBuilding.load(j), bj(id)); await idle(600); };
const openDlg = async () => { await menu('Manage Buildings…'); await dlg.waitFor({ state: 'visible', timeout: 8000 }); await idle(800); };
const close = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };
const hint = async () => ((await dlg.locator('[data-testid="reconnect-hint"]').count()) === 0 ? null : (await dlg.locator('[data-testid="reconnect-hint"]').innerText()).trim());
const chooseCount = () => dlg.locator('[data-testid="open-sheet"]', { hasText: /^Choose file…$/ }).count();
const all = real.map((f) => ({ src: f, name: f }));
const recon = async () => { await page.evaluate((x) => { window.__pick = x; }, all); await dlg.getByRole('button', { name: 'Reconnect PDFs' }).click(); await idle(800); };

// F1
await load('e1');
await openDlg();
await dlg.getByRole('treeitem').first().click();
await idle(400);
await recon();
await dlg.locator('button:text-is("Open")').first().click();
await idle(2500);
await close();
await load('e2');
await load('e1');
await openDlg();
await dlg.getByRole('treeitem').first().click();
await idle(600);
const choose = await chooseCount();
const h = await hint();
const want = choose === 0 ? null : choose === 1 ? '1 PDF needs a file before it opens. Choose it again.' : `${choose} PDFs need a file before they open. Choose them all in one step.`;
check(choose === 3 && h === want, 'F1: band count equals the rows that say Choose file… (opened sheet excluded)', `choose=${choose} hint=${h}`);
await close();

// F2 and band gap
for (const height of [900, 700]) {
  await page.setViewportSize({ width: 760, height });
  await load('n' + height);
  await openDlg();
  const combo = dlg.getByRole('combobox').first();
  await combo.selectOption({ index: 2 });
  await idle(500);
  await recon();
  const note = dlg.locator('[data-testid="sheets-notice"]');
  await note.waitFor({ state: 'attached', timeout: 3000 });
  const nb = await note.boundingBox();
  const db = await dlg.boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  const docScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  console.log('760x' + height, 'notice', JSON.stringify(nb), 'dialog', JSON.stringify(db));
  check(
    nb !== null && db !== null && nb.y >= db.y && nb.y + nb.height <= db.y + db.height + 0.5 && nb.y + nb.height <= vh && docScroll <= 0,
    `F2: notice visible inside dialog at 760x${height}`,
  );
  await shot(`b6-t01-fix-760x${height}-notice`);
  await close();
}
await page.setViewportSize({ width: 1600, height: 900 });
await load('g1');
await openDlg();
await dlg.getByRole('treeitem').first().click();
await idle(500);
const gap = await page.evaluate(() => {
  const band = document.querySelector('[data-testid="reconnect-band"]');
  const rows = document.querySelector('.mep-srows');
  if (!band || !rows) return null;
  return rows.getBoundingClientRect().top - band.getBoundingClientRect().bottom;
});
console.log('band gap to rows', gap);
check(gap !== null && Math.abs(gap - 8) <= 0.5, 'band gap to the rows is 8 px', String(gap));
await t.finish();
