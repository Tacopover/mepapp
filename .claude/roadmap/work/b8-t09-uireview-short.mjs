import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, applyLevel } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const SHOTS = '/tmp/claude-0/-root-MepApp/cd485b76-cb23-414a-9318-be68a3af5d12/scratchpad/b8-t09/review/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const dlg = page.locator('.mep-modal');
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
async function gaps(tag) {
  const m = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('.mep-rd-dot-ring')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top, bottom: r.bottom, sw: parseFloat(getComputedStyle(e).strokeWidth) }; });
    return [...document.querySelectorAll('[data-testid="riser-span-arrow"]')].map((h) => {
      const r = h.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      let a = Infinity, b = Infinity;
      for (const d of dots.filter((d) => Math.abs(d.x - cx) < 3)) {
        if (d.bottom <= r.top + 0.5) a = Math.min(a, r.top - (d.bottom + d.sw / 2));
        if (d.top >= r.bottom - 0.5) b = Math.min(b, d.top - d.sw / 2 - r.bottom);
        if (d.bottom > r.top + 0.5 && d.top < r.bottom - 0.5) { a = -99; b = -99; }
      }
      return { lane: h.closest('[data-riser-id]')?.getAttribute('data-riser-id'), dir: h.getAttribute('data-direction'), y: +(r.y + r.height / 2).toFixed(1), gapAbove: +a.toFixed(1), gapBelow: +b.toFixed(1), outlineGap: +(Math.min(a, b) - 2).toFixed(1) };
    });
  });
  console.log(tag, JSON.stringify(m));
}
async function zoomShot(name) {
  await page.addStyleTag({ content: '.mep-rd svg{zoom:3}' });
  await idle(400);
  await page.locator('.mep-rd-scroll').screenshot({ path: `${SHOTS}B8-T09-rv-${name}.png` });
  console.log(`SHOT ${SHOTS}B8-T09-rv-${name}.png`);
}

// short: second level 100 mm above first -> 48 px span; with R2 dotted
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.levels = [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 100 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
  j.risers[1].networkType = { ...j.risers[1].networkType, linePattern: 'dotted' };
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
await dlg.locator('[data-riser-id="r1"] .mep-rd-lane-label').click();
await idle(400);
await gaps('SHORT');
await zoomShot('short-zoom');
await page.keyboard.press('Escape');
await idle(400);

// elevations 0, 1, 2 mm gap tiny and negative order
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.levels = [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 1 }, { id: 'l2', name: 'Level 2', elevationMm: 30000 }];
  j.risers[1].networkType = { ...j.risers[1].networkType, linePattern: 'dashDotDot' };
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
await gaps('TINY');
await zoomShot('tiny-zoom');
await page.keyboard.press('Escape');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
