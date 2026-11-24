// UI review B7-T09c-3: states of the Capacity card at 1600 / 1100 / 760 px (height 900). Real clicks and keys for the controls.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';
import { findClipped } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/layout-measure.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c3-review/';
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);
const dlg = page.locator('.mep-modal');
const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const log = (...a) => console.log('INFO', ...a);
const q = (id) => page.locator(`[data-testid="${id}"]`);

async function openRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await q('riser-capacity').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  await until(async () => (await dlg.innerText()).indexOf('Reading the saved summaries') < 0, 'summaries read', 8000).catch(() => {});
  await idle(300);
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}
async function view(width, height = 900) {
  await page.setViewportSize({ width, height });
  await idle(500);
}
/** Visible state of each testid inside the modal scroll area. */
const state = () =>
  page.evaluate(() => {
    const ids = ['riser-capacity-actions', 'riser-read-summaries', 'riser-set-by-hand', 'riser-use-solve', 'riser-more-details', 'riser-source-select', 'riser-flow-select', 'riser-capacity-list', 'riser-not-design-flow'];
    const out = {};
    for (const id of ids) {
      const els = document.querySelectorAll(`[data-testid="${id}"]`);
      if (els.length === 0) { out[id] = null; continue; }
      const el = els[0];
      const box = el.getBoundingClientRect();
      let clipTop = 0, clipBottom = window.innerHeight;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(n).overflowY)) {
          const r = n.getBoundingClientRect();
          clipTop = Math.max(clipTop, r.top); clipBottom = Math.min(clipBottom, r.bottom);
        }
      }
      out[id] = { n: els.length, top: Math.round(box.top), bottom: Math.round(box.bottom), w: Math.round(box.width), h: Math.round(box.height), vis: box.top >= clipTop - 1 && box.bottom <= clipBottom + 1, clipBottom: Math.round(clipBottom) };
    }
    const scrollers = [...document.querySelectorAll('.mep-modal *')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2).map((e) => `${e.className.toString().slice(0, 40)} top=${Math.round(e.scrollTop)} sh=${e.scrollHeight} ch=${e.clientHeight}`);
    const lines = (document.querySelector('[data-testid="riser-capacity"]')?.innerText ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    return { ...out, scrollers, lines };
  });
const rowsText = () => page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const actionsText = () => q('riser-capacity-actions').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('button')].map((b) => b.textContent.trim())));

async function tabOrder(label, n = 8) {
  // focus the heading Capacity (tabIndex -1) and press Tab
  await page.evaluate(() => document.querySelector('.mep-rp-capacity h5')?.focus());
  const seq = [];
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press('Tab');
    seq.push(await page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('data-testid') || a.getAttribute('aria-label') || `${a.tagName}:${(a.textContent || '').trim().slice(0, 20)}`) : null; }));
  }
  log(`TAB ${label}`, JSON.stringify(seq));
  return seq;
}

// ---- S1: solved, lists hidden, no gap (Example 5) ----
for (const w of [1600, 1100, 760]) {
  await view(w);
  if (w === 1600) await openRisers();
  const s = await state();
  log(`S1 ${w}`, JSON.stringify({ actions: await actionsText(), sbh: s['riser-set-by-hand'], row: s['riser-capacity-actions'], rs: s['riser-read-summaries'], more: s['riser-more-details'], tag: s['riser-not-design-flow'], scrollers: s.scrollers }));
  check(s['riser-set-by-hand']?.n === 1 && s['riser-set-by-hand'].vis, `S1 ${w}: Set by hand visible, one control`, JSON.stringify(s['riser-set-by-hand']));
  check(s['riser-read-summaries'] === null, `S1 ${w}: no Read summaries now`);
  check(JSON.stringify(await actionsText()) === JSON.stringify([['Set by hand']]), `S1 ${w}: row shows only Set by hand`, JSON.stringify(await actionsText()));
  await snap(`s1-solved-${w}`);
  const m = await findClipped(page, '.mep-modal').catch((e) => ({ err: String(e) }));
  log(`MEASURE S1 ${w}`, JSON.stringify(m).slice(0, 400));
}
log('S1 lines', JSON.stringify((await state()).lines));
await view(1100);
const tab1 = await tabOrder('S1 1100');
check(tab1[0] === 'riser-set-by-hand', 'S1 tab: first stop after heading is Set by hand', JSON.stringify(tab1));

// ---- S2: Set by hand by keyboard ----
await view(1100);
await page.evaluate(() => document.querySelector('[data-testid="riser-set-by-hand"]').focus());
await page.keyboard.press('Enter');
await idle(500);
{
  const fid = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  const s = await state();
  check(fid === 'riser-source-select', 'S2: Enter on Set by hand moves focus to Source level', String(fid));
  check(s['riser-source-select']?.vis, 'S2: Source level visible', JSON.stringify(s['riser-source-select']));
  check(s['riser-capacity-actions'] === null, 'S2: no empty link row once lists show', JSON.stringify(s['riser-capacity-actions']));
  check(s['riser-set-by-hand'] === null, 'S2: no Set by hand once lists show');
  log('S2 mid', JSON.stringify({ scrollers: s.scrollers, src: s['riser-source-select'], flow: s['riser-flow-select'], solve: s['riser-use-solve'] }));
  await snap('s2-lists-shown-1100');
  const seq = await tabOrder('S2 from heading', 8);
  log('S2 rows still at most', JSON.stringify(await rowsText()));
}
for (const w of [1600, 760]) {
  await view(w);
  const s = await state();
  log(`S2 ${w}`, JSON.stringify({ src: s['riser-source-select'], flow: s['riser-flow-select'], solve: s['riser-use-solve'], scrollers: s.scrollers }));
  await snap(`s2-lists-shown-${w}`);
}
await view(1100);
// pick Level 0 in the real select
await q('riser-source-select').selectOption({ label: 'Level 0' });
await idle(900);
{
  const rows = await rowsText();
  log('S2 hand-set rows', JSON.stringify(rows));
  const s = await state();
  const lines = s.lines;
  log('S2 hand-set lines', JSON.stringify(lines));
  check(rows.every((r) => !/at most/.test(r)), 'S2: rows lose at most after Level 0', JSON.stringify(rows));
  check(s['riser-capacity-actions'] === null, 'S2 hand-set: no link row');
  await snap('s2-handset-1100');
}
for (const w of [1600, 760]) { await view(w); await snap(`s2-handset-${w}`); }
await view(1100);
// reload: close and reopen the dialog; hand-set stays
await closeDialog();
await openRisers();
{
  const s = await state();
  check(s['riser-source-select']?.n === 1, 'S2: after reopen the lists show for a hand-set riser', JSON.stringify(s['riser-source-select']));
  const val = await q('riser-source-select').evaluate((e) => e.selectedOptions[0]?.textContent);
  check(val === 'Level 0', 'S2: Source level reads Level 0 after reopen', String(val));
}
// back to solve
await q('riser-use-solve').click();
await idle(900);
{
  const s = await state();
  log('S2 after use solve', JSON.stringify({ actions: await actionsText(), sbh: s['riser-set-by-hand'], rows: await rowsText() }));
  check(s['riser-set-by-hand']?.n === 1, 'S2: back to solve, Set by hand returns once');
}
for (const w of [1600, 760]) {
  await view(w);
  await q('riser-set-by-hand').click();
  await idle(600);
  const fid = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  const s = await state();
  check(fid === 'riser-source-select' && s['riser-source-select']?.vis, `S2b ${w}: real click on Set by hand: Source level has focus and is visible`, JSON.stringify({ fid, src: s['riser-source-select'], scrollers: s.scrollers }));
  await snap(`s2b-click-${w}`);
  await q('riser-use-solve').click();
  await idle(700);
}
await view(1100);

// ---- S3: old summary gap ----
await closeDialog();
await view(1600, 1000);
{
  log('modal count', await page.locator('.mep-modal').count());
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(300);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().locator('b').click();
  await idle(1200);
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(300);
  page.once('dialog', (d) => d.accept());
  await page.locator('.mep-doc-switcher-dropdown .mep-doc-close[title="Close l2.pdf"]').click();
  await idle(900);
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) > 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(300);
  const old = JSON.parse(summaries[2]);
  for (const e of old.riserNetworks) delete e.openEnds;
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: JSON.stringify(old) }]);
  await idle(700);
}
for (const w of [1600, 1100, 760]) {
  await view(w);
  if (w === 1600) await openRisers();
  const s = await state();
  log(`S3 ${w}`, JSON.stringify({ actions: await actionsText(), row: s['riser-capacity-actions'], rs: s['riser-read-summaries'], sbh: s['riser-set-by-hand'], scrollers: s.scrollers }));
  check(JSON.stringify(await actionsText()) === JSON.stringify([['Read summaries now', 'Set by hand']]), `S3 ${w}: order Read summaries now, Set by hand`, JSON.stringify(await actionsText()));
  check(s['riser-capacity-actions']?.vis, `S3 ${w}: link row visible`, JSON.stringify(s['riser-capacity-actions']));
  await snap(`s3-old-${w}`);
}
await view(1100);
log('S3 lines', JSON.stringify((await state()).lines));
{
  const seq = await tabOrder('S3 1100', 8);
  check(seq[6] === 'riser-read-summaries' && seq[7] === 'riser-set-by-hand', 'S3 tab order: Read summaries, Set by hand', JSON.stringify(seq));
}
// lists shown + gap
await q('riser-set-by-hand').click();
await idle(500);
{
  const s = await state();
  log('S3 lists shown + gap', JSON.stringify({ actions: await actionsText(), row: s['riser-capacity-actions'], src: s['riser-source-select'], scrollers: s.scrollers }));
  check(JSON.stringify(await actionsText()) === JSON.stringify([['Read summaries now']]), 'S3: lists shown with gap: row has Read summaries now only', JSON.stringify(await actionsText()));
  await snap('s3-lists-gap-1100');
  const fid = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  log('S3 focus after Set by hand', String(fid));
}
// Read link through keyboard
await page.evaluate(() => document.querySelector('[data-testid="riser-read-summaries"]').focus());
await page.keyboard.press('Space');
await idle(150);
await snap('s3-reading-1100');
await until(async () => (await q('riser-read-summaries').count()) === 0, 'link run ends', 30000).catch(() => log('link run did not end'));
await idle(900);
{
  const fid = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}:${a.getAttribute('data-testid') || (a.textContent || '').trim().slice(0, 20)}` : null; });
  const s = await state();
  log('S3 after read: focus', fid, JSON.stringify({ actions: await actionsText(), lines: s.lines.slice(0, 4) }));
  await snap('s3-after-read-1100');
}
await closeDialog();

await idle(500);
log('docs', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName))), 'switcher', await page.locator('.mep-doc-switcher-btn').count(), 'modal', await page.locator('.mep-modal').count());
await snap('debug-s4-start');
// ---- S4: K=1: only Level 0 has an open end (Level 1 and Level 2 summaries get openEnds 0); close l1, l2 ----
for (const name of ['l1.pdf']) {
  await page.locator('.mep-doc-switcher-btn').click();
  await idle(200);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l0.pdf' }).first().locator('b').click();
  await idle(1200);
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(200);
  page.once('dialog', (d) => d.accept());
  const btn = page.locator(`.mep-doc-switcher-dropdown .mep-doc-close[title="Close ${name}"]`);
  if ((await btn.count()) > 0) await btn.click();
  await idle(900);
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) > 0 && (await page.locator('.mep-doc-switcher-btn').count()) > 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(300);
}
{
  const zero = (s) => { const o = JSON.parse(s); for (const e of o.riserNetworks) e.openEnds = 0; return JSON.stringify(o); };
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[1]]: zero(summaries[1]), [uuids[2]]: zero(summaries[2]) }]);
  await idle(700);
}
for (const w of [1600, 1100, 760]) {
  await view(w);
  if (w === 1600) await openRisers();
  const s = await state();
  log(`S4 ${w}`, JSON.stringify({ actions: await actionsText(), row: s['riser-capacity-actions'], lines: s.lines, rows: await rowsText() }));
  await snap(`s4-k1-${w}`);
}
await closeDialog();

// ---- S5: one member riser ----
{
  const one = JSON.parse(JSON.stringify(building));
  one.risers[0].members = [one.risers[0].members[0]];
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(one), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(700);
}
for (const w of [1600, 1100, 760]) {
  await view(w);
  if (w === 1600) await openRisers();
  const s = await state();
  log(`S5 ${w}`, JSON.stringify({ actions: await actionsText(), row: s['riser-capacity-actions'], sbh: s['riser-set-by-hand'], lines: s.lines, scrollers: s.scrollers }));
  await snap(`s5-one-${w}`);
}
await closeDialog();

// ---- S6: stress, 30 levels with 80 character names, 80 character riser name ----
{
  const big = JSON.parse(JSON.stringify(building));
  const long = (i) => `Level ${i} ` + 'W'.repeat(72);
  big.levels = Array.from({ length: 30 }, (_, i) => ({ id: `L${i}`, name: long(i), elevationMm: i * 3000 }));
  big.sheets = big.levels.map((l, i) => ({ id: `S${i}`, levelId: l.id, projectUuid: uuids[i % 3], pageIndex: 0, displayName: `Sheet ${i}`, location: { fileName: ['l0.pdf', 'l1.pdf', 'l2.pdf'][i % 3], path: ['l0.pdf', 'l1.pdf', 'l2.pdf'][i % 3] } }));
  big.risers[0].name = 'R' + 'x'.repeat(79);
  big.risers[0].members = big.levels.map((l, i) => ({ levelId: l.id, sheetId: `S${i}`, pageIndex: 0, fittingId: 'rf' }));
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(big), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(900);
}
for (const w of [1600, 1100, 760]) {
  await view(w);
  if (w === 1600) await openRisers();
  const s = await state();
  const over = await page.evaluate(() => {
    const root = document.querySelector('.mep-rp-info');
    const res = [];
    if (!root) return res;
    for (const e of root.querySelectorAll('*')) if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.children.length === 0) res.push(`${e.tagName}.${e.className} ${e.scrollWidth}>${e.clientWidth}`);
    return res.slice(0, 6);
  });
  log(`S6 ${w}`, JSON.stringify({ actions: await actionsText(), sbh: s['riser-set-by-hand'], row: s['riser-capacity-actions'], scrollers: s.scrollers, over, nrows: (await rowsText()).length }));
  await snap(`s6-stress-${w}`);
}
await closeDialog();

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
