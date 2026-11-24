// UI review B7-T09c-3: small viewport 760x640, scroll side effects, three risers (J4), reading state, undo of hand-set.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c3-review/';
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);
const log = (...a) => console.log('INFO', ...a);
const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const q = (id) => page.locator(`[data-testid="${id}"]`);
const dlg = page.locator('.mep-modal');
async function openRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await q('riser-capacity').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  await until(async () => (await dlg.innerText()).indexOf('Reading the saved summaries') < 0, 'summaries read', 8000).catch(() => {});
  await idle(400);
}
const probe = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="riser-set-by-hand"]');
    const modal = document.querySelector('.mep-modal');
    const mr = modal.getBoundingClientRect();
    const sc = [...modal.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2).map((e) => `${e.className.toString().slice(0, 30)} top=${Math.round(e.scrollTop)}`);
    let clip = window.innerHeight;
    let b = null;
    if (el) { b = el.getBoundingClientRect(); for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(n).overflowY)) clip = Math.min(clip, n.getBoundingClientRect().bottom); }
    return { winY: window.scrollY, docY: document.scrollingElement.scrollTop, modalTop: Math.round(mr.top), modalBottom: Math.round(mr.bottom), vh: window.innerHeight, link: b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), clip: Math.round(clip), vis: b.bottom <= clip + 1 && b.top >= 0 } : null, sc };
  });

// 760 x 640 and 1100 x 640
for (const [w, h] of [[760, 640], [1100, 640], [1600, 700]]) {
  await page.setViewportSize({ width: w, height: h });
  await idle(300);
  if ((await dlg.count()) === 0) await openRisers();
  await idle(500);
  const p = await probe();
  log(`SMALL ${w}x${h}`, JSON.stringify(p));
  check(p.winY === 0 && p.docY === 0, `SMALL ${w}x${h}: page does not scroll`, JSON.stringify(p));
  check(p.link === null || p.link.vis, `SMALL ${w}x${h}: Set by hand visible on open (scrolled into view when the riser needs attention)`, JSON.stringify(p.link));
  await snap(`small-${w}x${h}`);
  await page.keyboard.press('Escape');
  await idle(400);
}

// Re-open at 760x640: does it scroll again after the user scrolled up?
await page.setViewportSize({ width: 760, height: 640 });
await idle(300);
await openRisers();
await page.evaluate(() => { for (const e of document.querySelectorAll('.mep-modal *')) if (/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2) e.scrollTop = 0; });
await idle(300);
log('scrolled up by user', JSON.stringify(await probe()));
// Click Set by hand at 760x640: focus and visibility
await page.evaluate(() => { const e = document.querySelector('[data-testid="riser-set-by-hand"]'); e.scrollIntoView({ block: 'center' }); });
await idle(200);
await q('riser-set-by-hand').click();
await idle(600);
{
  const fid = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  const s = await page.evaluate(() => { const el = document.querySelector('[data-testid="riser-source-select"]'); const b = el.getBoundingClientRect(); let clip = window.innerHeight; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(n).overflowY)) clip = Math.min(clip, n.getBoundingClientRect().bottom); return { top: Math.round(b.top), bottom: Math.round(b.bottom), clip: Math.round(clip) }; });
  log('SBH click at 760x640', fid, JSON.stringify(s));
  check(fid === 'riser-source-select' && s.bottom <= s.clip + 1, 'SMALL 760x640: Source level focused and visible after Set by hand', JSON.stringify(s));
  await snap('small-760x640-after-click');
}
const act0 = await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + ':' + (a.getAttribute('data-testid') || '') : null; });
await page.keyboard.press('Escape');
await idle(500);
const left = await dlg.count();
log('ESCAPE with focus on', act0, 'dialogs left', left);
check(left === 0, 'Escape closes the dialog while the focus is in Source level', String(left));
if (left > 0) { await page.keyboard.press('Escape'); await idle(500); log('second Escape, dialogs left', await dlg.count()); }

// J4: three risers; the link row at the same place in each card
{
  const b3 = JSON.parse(JSON.stringify(building));
  for (const [id, name] of [['r2', 'R2'], ['r3', 'R3']]) {
    const r = JSON.parse(JSON.stringify(b3.risers[0]));
    r.id = id;
    r.name = name;
    b3.risers.push(r);
  }
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(b3), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(800);
}
await idle(500);
await snap('debug-before-j4');
log('MODALS', await page.locator('.mep-modal-backdrop').count(), (await page.locator('.mep-modal').allInnerTexts()).join('|').slice(0, 300));
await page.setViewportSize({ width: 1100, height: 900 });
await idle(300);
await openRisers();
{
  const lanes = await page.locator('[data-riser-id]').count();
  log('lanes', lanes);
  const tops = [];
  for (let i = 0; i < lanes; i += 1) {
    await page.locator('[data-riser-id]').nth(i).click({ force: true });
    await idle(700);
    const r = await page.evaluate(() => {
      const info = document.querySelector('[data-testid="riser-info"]');
      const el = document.querySelector('[data-testid="riser-set-by-hand"]');
      const title = info?.querySelector('h4')?.textContent;
      if (!info || !el) return null;
      return { title, rel: Math.round(el.getBoundingClientRect().top - info.getBoundingClientRect().top), n: document.querySelectorAll('[data-testid="riser-set-by-hand"]').length };
    });
    log('J4', JSON.stringify(r));
    tops.push(r);
  }
  check(tops.length > 0 && tops.every((x) => x && x.n === 1 && x.rel === tops[0].rel), 'J4: link row at the same place relative to the card in each riser', JSON.stringify(tops));
  await snap('j4-last');
}
// Hand-open on R2 does not carry to R3 (selects reset)
{
  await page.locator('[data-riser-id]').nth(0).click({ force: true });
  await idle(500);
  await q('riser-set-by-hand').click();
  await idle(500);
  await page.locator('[data-riser-id]').nth(1).click({ force: true });
  await idle(700);
  const n = await q('riser-source-select').count();
  const s = await q('riser-set-by-hand').count();
  log('after switching riser: selects', n, 'set-by-hand', s);
  check(n === 0 && s === 1, 'handOpen resets when the user selects another riser', JSON.stringify({ n, s }));
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
