// B6-T01 journey tester, part 2: 760 px level goal, notice visibility, Opened edge case, wrong order, repeat x3.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/fixtures/pdfs/';
const real = ['00_arch_ground_floor.pdf', '01_arch_first_floor.pdf', 'arch_simple_A4.pdf', '00_arch_ground_floor_edit.pdf'];
const sizeOf = (f) => readFileSync(FIX + f).length;
const t = await open({ seed: { 'mepapp.webLike': '1' } });
const { page, shot, idle, menu } = t;
await t.start();
await page.evaluate(
  (list) => {
    window.__blobs = {};
    for (const [name, b64] of list) window.__blobs[name] = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.showOpenFilePicker = async () => {
      const p = window.__pick;
      if (p === 'cancel') throw new DOMException('cancelled', 'AbortError');
      return p.map((s) => ({ kind: 'file', name: s.name, getFile: async () => new File([window.__blobs[s.src]], s.name, { lastModified: 1000 }) }));
    };
  },
  real.map((f) => [f, readFileSync(FIX + f).toString('base64')]),
);
const dlg = page.locator('.mep-modal');
const levels = [{ id: 'l1', name: 'Level 1', elevationMm: 0 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
const sheet = (id, levelId, f, p = 0) => ({ id, levelId, projectUuid: null, pageIndex: p, displayName: `${f} ${p + 1}`, location: { fileName: f, sizeBytes: sizeOf(f) } });
const sheets = [sheet('s1', 'l1', real[0]), sheet('s2', 'l1', real[1]), sheet('s3', 'l2', real[2]), sheet('s4', 'l2', real[3])];
const bj = (id) => JSON.stringify({ schemaVersion: 1, id, name: `Tower ${id}`, levels, sheets, risers: [] });
const load = async (id) => { await page.evaluate((j) => window.__mepBuilding.load(j), bj(id)); await idle(600); };
const openDlg = async () => { await menu('Manage Buildings…'); await dlg.waitFor({ state: 'visible', timeout: 8000 }); await idle(800); };
const close = async () => { await dlg.getByRole('button', { name: 'Close', exact: true }).click(); await idle(400); };
const text = async () => await dlg.innerText();
const bandLine = async () => ((await text()).split('\n').find((l) => /need a file|needs a file/.test(l)) ?? null);
const noticeLine = async () => ((await text()).split('\n').find((l) => /^(Found|Could not|Opened)/.test(l)) ?? null);
const rowButtons = async () => (await dlg.getByRole('button').allInnerTexts()).filter((x) => /^(Open|Opened|Choose file)/.test(x.trim())).map((x) => x.trim());
const pick = (l) => page.evaluate((x) => { window.__pick = x; }, l);
const recon = async (l) => { await pick(l); await dlg.getByRole('button', { name: 'Reconnect PDFs' }).click(); await idle(800); };

// ---- 760: level goal via the select
await page.setViewportSize({ width: 760, height: 900 });
await load('a1');
await openDlg();
const combo = dlg.getByRole('combobox').first();
const opts = await combo.locator('option').allInnerTexts();
console.log('760 select options:', JSON.stringify(opts));
await combo.selectOption({ index: 2 });
await idle(500);
console.log('760 level2 band:', await bandLine());
await recon(real.map((f) => ({ src: f, name: f })));
console.log('760 level2 notice (text):', await noticeLine());
const nb = await dlg.getByText(/^Found/).first().boundingBox();
console.log('760 notice box:', JSON.stringify(nb));
await shot('b6-t01-journey-760-level-notice');
await dlg.locator('.mep-modal-body, [class*=body]').first().evaluate((e) => e.scrollTo(0, e.scrollHeight)).catch(() => {});
await idle(300);
await shot('b6-t01-journey-760-level-notice-scrolled');
await close();

// ---- Opened edge case
await page.setViewportSize({ width: 1600, height: 900 });
await load('e1');
await openDlg();
await dlg.getByRole('treeitem').first().click();
await idle(400);
await recon(real.map((f) => ({ src: f, name: f })));
console.log('E1 after reconnect rows:', JSON.stringify(await rowButtons()), 'band:', await bandLine());
await dlg.locator("button:text-is(\"Open\")").first().click();
await idle(2500);
console.log('E1 after Open: rows:', JSON.stringify(await rowButtons()), 'notice:', await noticeLine(), 'dialog:', await dlg.count());
await shot('b6-t01-journey-1600-edge-opened');
if ((await dlg.count()) === 1) await close();
// switch building (hook) and back
await load('e2');
await load('e1');
await idle(800);
await openDlg();
await dlg.getByRole('treeitem').first().click();
await idle(600);
console.log('E2 after building switch+back: band:', await bandLine(), '| rows:', JSON.stringify(await rowButtons()));
await shot('b6-t01-journey-1600-edge-after-switch');
const statusTxt = (await text()).split('\n').filter((l) => /Opened|Open in viewer|already/i.test(l));
console.log('E2 lines mentioning Opened:', JSON.stringify(statusTxt));

// ---- wrong order, empty selection, repeat 3x
await pick([]);
await dlg.getByRole('button', { name: 'Reconnect PDFs' }).click();
await idle(600);
console.log('W empty pick ([] files) notice:', await noticeLine(), '| band:', await bandLine());
await pick('cancel');
for (let i = 0; i < 3; i++) {
  await dlg.getByRole('button', { name: 'Reconnect PDFs' }).click();
  await idle(500);
}
console.log('W cancel x3 notice:', await noticeLine(), '| button count:', await dlg.getByRole('button', { name: 'Reconnect PDFs' }).count());
// reconnect with same files 3x (wrong: files already used)
await recon(real.map((f) => ({ src: f, name: f })));
console.log('R reconnect 1:', await noticeLine(), '| band:', await bandLine());
for (let i = 0; i < 3; i++) {
  await dlg.locator("button:text-is(\"Open\")").first().click().catch((e) => console.log('open fail', String(e).slice(0, 80)));
  await idle(1500);
  console.log('R open', i + 1, 'dialog', await dlg.count(), 'rows', JSON.stringify(await rowButtons()), 'notice', await noticeLine());
}
await shot('b6-t01-journey-1600-repeat');
await t.finish();
