import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, applyLevel } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';
import { findClipped } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/layout-measure.mjs';

const SHOTS = '/tmp/claude-0/-root-MepApp/cd485b76-cb23-414a-9318-be68a3af5d12/scratchpad/b8-t09/review/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const dlg = page.locator('.mep-modal');
const snap = async (name, locator) => {
  const path = `${SHOTS}B8-T09-rv-${name}.png`;
  await (locator ?? page).screenshot({ path });
  console.log(`SHOT ${path}`);
};
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const baseJson = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
for (const i of [0, 2, 1]) await applyLevel(t, i, cfg);

async function openRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
}

async function measure(tag) {
  const m = await page.evaluate(() => {
    const out = { heads: [], legend: null, boxes: [] };
    const dots = [...document.querySelectorAll('.mep-rd-dot-ring')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom, sw: parseFloat(getComputedStyle(e).strokeWidth) };
    });
    const lines = [...document.querySelectorAll('.mep-rd-level-line')].map((e) => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; });
    for (const h of document.querySelectorAll('[data-testid="riser-span-arrow"]')) {
      const r = h.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const same = dots.filter((d) => Math.abs(d.x - cx) < 3);
      let gapAbove = Infinity;
      let gapBelow = Infinity;
      for (const d of same) {
        if (d.bottom <= r.top + 0.5) gapAbove = Math.min(gapAbove, r.top - (d.bottom + d.sw / 2));
        if (d.top >= r.bottom - 0.5) gapBelow = Math.min(gapBelow, d.top - d.sw / 2 - r.bottom);
      }
      const cy = r.y + r.height / 2;
      const nearestLine = Math.min(...lines.map((y) => Math.abs(y - cy)));
      const cs = getComputedStyle(h);
      out.heads.push({ lane: h.closest('[data-riser-id]')?.getAttribute('data-riser-id'), dir: h.getAttribute('data-direction'), w: +r.width.toFixed(1), h: +r.height.toFixed(1), gapAbove: +gapAbove.toFixed(1), gapBelow: +gapBelow.toFixed(1), nearestLine: +nearestLine.toFixed(1), fill: cs.fill, stroke: cs.stroke, sw: cs.strokeWidth, cls: h.getAttribute('class') });
    }
    const lg = document.querySelector('.mep-rd-legend')?.getBoundingClientRect();
    const sc = document.querySelector('.mep-rd-scroll')?.getBoundingClientRect();
    out.legend = lg && sc ? { lx: Math.round(lg.x), ly: Math.round(lg.y), lw: Math.round(lg.width), lh: Math.round(lg.height), sx: Math.round(sc.x), sy: Math.round(sc.y), sw: Math.round(sc.width), sh: Math.round(sc.height) } : null;
    for (const el of document.querySelectorAll('[data-testid="riser-flow-text"], [data-testid="riser-flow-note"]')) {
      out.boxes.push({ id: el.getAttribute('data-testid'), text: el.textContent, sw: el.scrollWidth, cw: el.clientWidth, h: Math.round(el.getBoundingClientRect().height), fs: getComputedStyle(el).fontSize, wrap: getComputedStyle(el).whiteSpace + '/' + getComputedStyle(el).overflowWrap });
    }
    const lab = [...document.querySelectorAll('.mep-rd-lane-label')].map((e) => ({ t: e.textContent, w: Math.round(e.getBoundingClientRect().width) }));
    out.labels = lab;
    return out;
  });
  console.log(tag, JSON.stringify(m));
  return m;
}

// ---- normal data
await loadBuilding(t, JSON.stringify(baseJson));
await openRisers();
await dlg.locator('[data-riser-id="r1"] .mep-rd-lane-label').click();
await idle(400);
for (const [w, h] of [[1600, 1000], [1100, 800], [760, 640]]) {
  await page.setViewportSize({ width: w, height: h });
  await idle(500);
  const m = await measure(`NORMAL ${w}`);
  const clipped = await findClipped(page, '.mep-modal');
  console.log(`NORMAL ${w} clipped`, JSON.stringify(clipped));
  check(m.heads.length === 4, `normal ${w}: 4 heads`, String(m.heads.length));
  await snap(`normal-${w}`, dlg);
}
await page.setViewportSize({ width: 1600, height: 1000 });
await page.keyboard.press('Escape');
await idle(500);

// ---- stress: names of 80 characters, source in the middle, many lanes
{
  const j = JSON.parse(JSON.stringify(baseJson));
  const long = (s) => (s + ' ' + 'x'.repeat(80)).slice(0, 80);
  j.levels.forEach((l) => { l.name = long(l.name); });
  j.risers.forEach((r) => { r.name = long(r.name); });
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const c = JSON.parse(JSON.stringify(j.risers[0]));
    c.id = `r${n}`;
    c.name = long(`Riser ${n}`);
    c.anchorMm = { xMm: c.anchorMm.xMm + n * 100, yMm: c.anchorMm.yMm };
    c.members = c.members.map((m) => ({ ...m, fittingId: `x${n}` }));
    j.risers.push(c);
  }
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
await dlg.locator('[data-riser-id="r2"] .mep-rd-lane-label').click();
await idle(400);
for (const [w, h] of [[1600, 1000], [1100, 800], [760, 640]]) {
  await page.setViewportSize({ width: w, height: h });
  await idle(500);
  await measure(`STRESS ${w}`);
  console.log(`STRESS ${w} aria r2`, await dlg.locator('[data-riser-id="r2"]').getAttribute('aria-label'));
  console.log(`STRESS ${w} clipped`, JSON.stringify(await findClipped(page, '.mep-modal')));
  await snap(`stress-${w}`, dlg);
}
await page.setViewportSize({ width: 1600, height: 1000 });
await page.keyboard.press('Escape');
await idle(500);

// ---- states: equal elevations, one member
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.levels.forEach((l) => { l.elevationMm = 0; });
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
await dlg.locator('[data-riser-id="r1"] .mep-rd-lane-label').click();
await idle(400);
{
  const m = await measure('EQUAL');
  console.log('EQUAL aria', await dlg.locator('[data-riser-id="r1"]').getAttribute('aria-label'));
  await snap('equal', dlg);
}
await page.keyboard.press('Escape');
await idle(500);
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.risers[0].members = j.risers[0].members.slice(0, 1);
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
await dlg.locator('[data-riser-id="r1"] .mep-rd-lane-label').click();
await idle(400);
{
  await measure('ONE');
  await snap('one', dlg);
}
await page.keyboard.press('Escape');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
