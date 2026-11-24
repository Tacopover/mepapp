// UI review B7-T09c-3: electrical tag in the Risers card and in Properties, long names, contrast of the links.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup, EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c3-review/';
const POWER = { id: 'power', name: 'Power', discipline: 'electrical', units: 'kW', defaultCapacity: 1, color: '#e53935', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'kW' };
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t, EXAMPLE5, POWER);
const log = (...a) => console.log('INFO', ...a);
const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const q = (id) => page.locator(`[data-testid="${id}"]`);
const dlg = page.locator('.mep-modal');
const TAG = 'Connected load, not a design load';

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
async function view(width, height = 900) {
  await page.setViewportSize({ width, height });
  await idle(500);
}
const tagMeasure = () =>
  page.evaluate(() => {
    const tag = document.querySelector('[data-testid="riser-not-design-flow"]');
    const head = document.querySelector('.mep-rp-capacity-head');
    const h5 = head?.querySelector('h5');
    if (!tag) return null;
    const a = tag.getBoundingClientRect(), b = h5.getBoundingClientRect();
    return { sameLine: Math.abs(a.top - b.top) < 6, tagLines: Math.round(a.height / 14), tagW: Math.round(a.width), headW: Math.round(head.getBoundingClientRect().width), over: tag.scrollWidth > tag.clientWidth, text: tag.textContent };
  });
const linkStyle = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="riser-set-by-hand"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    let bg = null;
    for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; } }
    const l1 = lum(cs.color), l2 = lum(bg);
    const r = el.getBoundingClientRect();
    return { color: cs.color, bg, ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100, fontPx: cs.fontSize, w: Math.round(r.width), h: Math.round(r.height), underline: cs.textDecorationLine };
  });

// Level 1 active, Properties block of the riser fitting
await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().locator('b').click();
await idle(1200);
if ((await page.locator('.mep-doc-switcher-dropdown').count()) > 0) await page.locator('.mep-doc-switcher-btn').click().catch(() => {});
await idle(300);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.locator('button.mep-rail-btn[title="Select"]').click();
await idle(100);
{
  const at = await screenOf(page, { x: 300, y: H - 300 });
  await page.mouse.click(at.x, at.y);
  await idle(800);
}
for (const w of [1600, 1100, 760]) {
  await view(w);
  const txt = await q('props-riser-tag').count() > 0 ? (await q('props-riser-tag').innerText()).trim() : null;
  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="props-riser-tag"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), over: el.scrollWidth > el.clientWidth, top: Math.round(r.top) };
  });
  log(`PROPS ${w}`, txt, JSON.stringify(m));
  check(txt === TAG, `Properties ${w}: tag text`, String(txt));
  check(m !== null && !m.over && m.h <= 30, `Properties ${w}: tag fits`, JSON.stringify(m));
  await snap(`e-props-${w}`);
}
// the other lines of the Properties riser block
log('PROPS block text', await page.evaluate(() => (document.querySelector('[data-testid="props-riser-tag"]')?.parentElement?.innerText ?? '').slice(0, 500)));

await view(1600, 1000);
await openRisers();
for (const w of [1600, 1100, 760]) {
  await view(w);
  const m = await tagMeasure();
  log(`CARD ${w}`, JSON.stringify(m));
  check(m && m.sameLine && !m.over, `Risers ${w}: tag on the heading line, no overflow`, JSON.stringify(m));
  log(`LINK ${w}`, JSON.stringify(await linkStyle()));
  await snap(`e-risers-${w}`);
}

// long names: 80 characters for the riser, level and network type name
await page.keyboard.press('Escape');
await idle(500);
{
  const big = JSON.parse(JSON.stringify(building));
  const long = (p) => p + ' ' + 'W'.repeat(76 - p.length);
  big.levels.forEach((l, i) => (l.name = long(`Level ${i}`)));
  big.risers[0].name = long('R1');
  big.risers[0].networkType = { ...big.risers[0].networkType, name: long('Power') };
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(big), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(900);
}
await view(1600, 1000);
await openRisers();
for (const w of [1600, 1100, 760]) {
  await view(w);
  const m = await tagMeasure();
  const s = await page.evaluate(() => {
    const out = {};
    for (const id of ['riser-set-by-hand', 'riser-capacity-actions']) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) { out[id] = null; continue; }
      const b = el.getBoundingClientRect();
      let cb = window.innerHeight;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(n).overflowY)) cb = Math.min(cb, n.getBoundingClientRect().bottom);
      out[id] = { top: Math.round(b.top), bottom: Math.round(b.bottom), clipBottom: Math.round(cb), vis: b.bottom <= cb + 1 };
    }
    const rows = [...document.querySelectorAll('[data-testid="riser-capacity-row"]')].map((r) => Math.round(r.getBoundingClientRect().height));
    const over = [...document.querySelectorAll('.mep-rp-info *')].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => `${e.tagName}.${e.className} ${e.scrollWidth}>${e.clientWidth}`).slice(0, 5);
    return { ...out, rows, over };
  });
  log(`LONG ${w}`, JSON.stringify({ tag: m, ...s }));
  await snap(`e-long-${w}`);
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
