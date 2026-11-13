// B6-T01 journey tester. Goals 1-3 by label (no test ids), at 3 widths, empty and full state.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const real = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf', '00_arch_ground_floor_edit.pdf', '00_arch_ground_floor_w_rooms.pdf', 'Example_2.pdf', 'Example_3.pdf'];
const sizeOf = (f) => readFileSync(FIX + f).length;

const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, check, shot, idle, menu } = t;
await t.start();
await page.evaluate(
  (list) => {
    window.__blobs = {};
    for (const [name, b64] of list) window.__blobs[name] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.showOpenFilePicker = async () => {
      const p = window.__pick;
      if (p === 'cancel') throw new DOMException('cancelled', 'AbortError');
      return p.map((s) => ({ kind: 'file', name: s.name, getFile: async () => new File([window.__blobs[s.src]], s.name, { lastModified: s.m ?? 1000 }) }));
    };
  },
  real.map((f) => [f, readFileSync(FIX + f).toString('base64')]),
);
const dlg = page.locator('.mep-modal');
const LONG = (i, src) => `Project-Tower-Mechanical-Plumbing-Layout-Level-${String(i).padStart(2, '0')}-${src.replace('.pdf', '')}`.padEnd(76, 'x') + '.pdf';
const sheet = (id, levelId, name, src, pageIndex = 0) => ({ id, levelId, projectUuid: null, pageIndex, displayName: `${name} ${pageIndex + 1}`, location: { fileName: name, sizeBytes: sizeOf(src) } });
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }, { id: 'l3', name: 'Level 3', elevationMm: 6000 }];
const bjson = (id, sheets) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
// full: 30 sheets, 10 distinct PDFs with 80-char names over 3 levels
const fullFiles = [];
for (let i = 0; i < 10; i++) fullFiles.push({ name: LONG(i, real[i % 7]), src: real[i % 7] });
const fullSheets = () => {
  const s = [];
  for (let i = 0; i < 30; i++) {
    const f = fullFiles[i % 10];
    s.push(sheet(`s${i}`, levels[i % 3].id, f.name, f.src, Math.floor(i / 10)));
  }
  return s;
};
const smallFiles = [real[0], real[1], real[2], real[3]];
const smallSheets = () => smallFiles.map((f, i) => sheet(`s${i}`, i < 2 ? 'l1' : 'l2', f, f, 0));

let bid = 0;
async function openBuilding(sheets) {
  bid++;
  await page.evaluate((j) => window.__mepBuilding.load(j), bjson(`j${bid}`, sheets));
  await idle(600);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(800);
}
const close = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };
const bandText = async () => {
  const b = dlg.getByRole('button', { name: 'Reconnect PDFs' });
  if ((await b.count()) === 0) return null;
  return 'band';
};
const bodyText = async () => (await dlg.innerText());
const chooseCount = () => dlg.getByRole('button', { name: /^Choose file/ }).count();
const openCount = () => dlg.getByRole('button', { name: /^Open/ }).count();
const noticeText = async () => {
  const t2 = await bodyText();
  const m = t2.match(/(Found[^\n]*|Could not[^\n]*)/);
  return m ? m[0] : null;
};
const pick = (l) => page.evaluate((x) => { window.__pick = x; }, l);
const reconnect = async (list) => { await pick(list); await dlg.getByRole('button', { name: 'Reconnect PDFs' }).click(); await idle(800); };
const sheetsRegion = async () => (await dlg.innerText()).split('\n').filter((l) => /need a file|needs a file/.test(l))[0] ?? null;

for (const w of [1600, 1100, 760]) {
  await page.setViewportSize({ width: w, height: 900 });
  const tag = `b6-t01-journey-${w}`;
  // ---- Goal 1 small: restart then reconnect all
  await openBuilding(smallSheets());
  await dlg.getByRole('treeitem', { name: /Tower/ }).first().click().catch(() => {});
  await idle(500);
  console.log(w, 'G1 small band:', await sheetsRegion(), '| choose rows', await chooseCount());
  await shot(`${tag}-g1-small-start`);
  await reconnect(smallFiles.map((f) => ({ src: f, name: f })));
  console.log(w, 'G1 small notice:', await noticeText(), '| band', await bandText(), '| open rows', await openCount());
  await shot(`${tag}-g1-small-done`);
  await close();

  // ---- Goal 2 full: partial pick
  await openBuilding(fullSheets());
  await dlg.getByRole('treeitem', { name: /Tower/ }).first().click().catch(() => {});
  await idle(500);
  console.log(w, 'G2 full band:', await sheetsRegion(), '| choose rows', await chooseCount());
  await shot(`${tag}-g2-full-start`);
  await reconnect([...fullFiles.slice(0, 7).map((f) => ({ src: f.src, name: f.name })), { src: real[5], name: 'unrelated-1.pdf' }, { src: real[6], name: 'unrelated-2.pdf' }]);
  console.log(w, 'G2 notice 1:', await noticeText(), '| band:', await sheetsRegion());
  await shot(`${tag}-g2-full-partial`);
  await reconnect(fullFiles.slice(7).map((f) => ({ src: f.src, name: f.name })));
  console.log(w, 'G2 notice 2:', await noticeText(), '| band', await bandText(), '| choose rows', await chooseCount());
  await shot(`${tag}-g2-full-done`);
  await close();

  // ---- Goal 3: level node
  await openBuilding(fullSheets());
  await dlg.getByRole('treeitem', { name: /Level 2/ }).first().click();
  await idle(500);
  console.log(w, 'G3 level band:', await sheetsRegion());
  await shot(`${tag}-g3-level-start`);
  await reconnect(fullFiles.map((f) => ({ src: f.src, name: f.name })));
  console.log(w, 'G3 level notice:', await noticeText(), '| band', await bandText());
  await shot(`${tag}-g3-level-done`);
  await dlg.getByRole('treeitem', { name: /Tower/ }).first().click();
  await idle(500);
  console.log(w, 'G3 building after: band', await bandText(), '| choose rows', await chooseCount());
  await shot(`${tag}-g3-building-after`);
  await close();
}
await t.finish();
