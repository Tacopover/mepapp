// B8-T09: the Risers tab diagram shows the direction of each span. Three levels from real PDFs, riser R1 (supply air, solid) and R2 (return air, dashed).
// Setup (documents, scale, project JSON per level, building file) uses the scene API and the dev hook only.
// Real DOM: Manage Buildings, tab Risers, click on a lane and on an arrowhead, Set by hand, the Source level and Direction lists.
// Reading: the SVG of the diagram (arrowheads, titles, colors), the aria-label of a lane, the box "Flow direction", the legend, scene.getRiserMarks() (the rings on the canvas).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t09-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, waitMarks, applyLevel } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');

const dlg = page.locator('.mep-modal');
const snap = async (name, locator) => {
  const path = `${SHOTS}B8-T09-${name}.png`;
  await (locator ?? page).screenshot({ path });
  console.log(`SHOT ${path}`);
};
const cfg = { withReturn: true, sources1: [], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const baseJson = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));

async function applyAll(c) {
  for (const i of [0, 2, 1]) {
    try {
      await applyLevel(t, i, c);
    } catch (e) {
      console.log(`retry applyLevel ${i}: ${String(e).slice(0, 120)}`);
      await page.keyboard.press("Escape");
      await idle(1500);
      await applyLevel(t, i, c);
    }
  }
}
async function openRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}
/** The arrowheads of the diagram: { lane, dir, title, fill, y, x, w, h }, top to bottom for each lane. */
const heads = async () => {
  const list = await dlg.locator('[data-testid="riser-span-arrow"]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        lane: e.closest('[data-riser-id]')?.getAttribute('data-riser-id'),
        dir: e.getAttribute('data-direction'),
        title: e.querySelector('title')?.textContent ?? null,
        fill: e.style.fill,
        hidden: e.getAttribute('aria-hidden'),
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        w: r.width,
        h: r.height,
      };
    }),
  );
  return list.sort((a, b) => (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : a.y - b.y));
};
const dirsOf = (list, lane) => list.filter((h) => h.lane === lane).map((h) => h.dir);
const boxText = async () => (await dlg.locator('[data-testid="riser-flow-text"]').innerText()).trim();
const notes = async () => (await dlg.locator('[data-testid="riser-flow-note"]').allInnerTexts()).map((x) => x.trim());
const laneAria = (id) => dlg.locator(`[data-riser-id="${id}"]`).getAttribute('aria-label');
async function pickLane(id) {
  await dlg.locator(`[data-riser-id="${id}"] .mep-rd-lane-label`).click();
  await idle(400);
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- S0: no source anywhere: no arrow, the reason in the box
await loadBuilding(t, JSON.stringify(baseJson));
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(h.length === 0, 'S0 no source: no arrowhead in the diagram', String(h.length));
  await pickLane('r1');
  check((await boxText()) === 'No arrows yet: no source level.', 'S0 box text says why there is no arrow', await boxText());
  check(!(await laneAria('r1')).includes('flow '), 'S0 lane label has no flow tail', await laneAria('r1'));
  check((await dlg.locator('.mep-rd-legend').innerText()).includes('flow direction'), 'S0 the legend has the row "flow direction"');
  await snap('nosource', dlg);
}
await closeDialog();

// ---------------------------------------------------------------- S1: source on level 0, supply and return side by side
cfg.sources1 = [0];
cfg.sources2 = [0];
await applyAll(cfg);
{
  for (const [name, exp] of [['l0.pdf', { rf: '2', rf2: '5' }], ['l1.pdf', { rf: '1', rf2: '4' }], ['l2.pdf', { rf: '3', rf2: '6' }]]) {
    await switchTo(t, name);
    const r = await waitMarks(page, exp, 4000);
    check(r.ok, `S1 canvas ${name}: the rings show the arrows that the diagram must agree with`, JSON.stringify(r.got));
  }
}
await openRisers();
{
  const h = await heads();
  check(h.length === 4, 'S1 four arrowheads (two spans of each of two risers)', String(h.length));
  check(sameJson(dirsOf(h, 'r1'), ['up', 'up']), 'S1 supply lane R1: both heads point up (flow goes away from level 0), as the rings 2, 1, 3', JSON.stringify(dirsOf(h, 'r1')));
  check(sameJson(dirsOf(h, 'r2'), ['down', 'down']), 'S1 return lane R2: both heads point down (flow goes toward level 0), as the rings 5, 4, 6', JSON.stringify(dirsOf(h, 'r2')));
  check(h.filter((x) => x.lane === 'r1').every((x) => x.fill.replace(/\s/g, '') === 'rgb(33,150,243)'), 'S1 R1 heads have the lane color (#2196f3)', JSON.stringify(h.filter((x) => x.lane === 'r1').map((x) => x.fill)));
  check(h.filter((x) => x.lane === 'r2').every((x) => x.fill.replace(/\s/g, '') === 'rgb(229,57,53)'), 'S1 R2 heads have the lane color (#e53935)', JSON.stringify(h.filter((x) => x.lane === 'r2').map((x) => x.fill)));
  check(h.every((x) => x.hidden === 'true' && x.w > 8 && x.h > 8), 'S1 each head is aria-hidden and has a size of at least 8 px', JSON.stringify(h.map((x) => [x.w, x.h])));
  const titles = h.map((x) => x.title).sort();
  check(
    sameJson(titles, ['Flow goes down: Level 1 to Level 0', 'Flow goes down: Level 2 to Level 1', 'Flow goes up: Level 0 to Level 1', 'Flow goes up: Level 1 to Level 2']),
    'S1 each head has a title in flow order',
    JSON.stringify(titles),
  );
  // the arrow follows the lane: the head centre is in the x of its lane and between the dots
  const laneX = await dlg.locator('[data-riser-id="r1"] line').evaluate((e) => e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2);
  check(h.filter((x) => x.lane === 'r1').every((x) => Math.abs(x.x - laneX) < 2), 'S1 the heads sit on the lane line', JSON.stringify([laneX, h.filter((x) => x.lane === 'r1').map((x) => x.x)]));
  check((await laneAria('r1')).endsWith(', flow away from Level 0'), 'S1 supply lane label ends with ", flow away from Level 0"', await laneAria('r1'));
  check((await laneAria('r2')).endsWith(', flow toward Level 0'), 'S1 return lane label ends with ", flow toward Level 0"', await laneAria('r2'));
  await pickLane('r1');
  check((await boxText()) === 'Away from Level 0 · from the flow solve', 'S1 supply box text', await boxText());
  check(sameJson(await notes(), []), 'S1 no grey note', JSON.stringify(await notes()));
  await snap('supply', dlg);
  // a real click on a head selects its lane
  const target = h.find((x) => x.lane === 'r2');
  await page.mouse.click(target.x, target.y);
  await idle(400);
  check((await dlg.locator('[data-riser-id="r2"]').getAttribute('aria-checked')) === 'true', 'S1 a click on a head of R2 selects lane R2');
  check((await boxText()) === 'Toward Level 0 · from the flow solve', 'S1 return box text', await boxText());
  await snap('return', dlg);
  await snap('return-diagram', page.locator('.mep-rd'));
  // keyboard: the arrow keys still move the selection
  await dlg.locator('[data-riser-id="r2"]').focus();
  await page.keyboard.press('ArrowLeft');
  await idle(300);
  check((await dlg.locator('[data-riser-id="r1"]').getAttribute('aria-checked')) === 'true', 'S1 the arrow key still selects the neighbour lane');
}
await closeDialog();

// ---------------------------------------------------------------- S2: source in the middle (level 1)
cfg.sources1 = [1];
cfg.sources2 = [1];
await applyAll(cfg);
{
  for (const [name, exp] of [['l0.pdf', { rf: '5', rf2: '2' }], ['l1.pdf', { rf: '7', rf2: '8' }], ['l2.pdf', { rf: '3', rf2: '6' }]]) {
    await switchTo(t, name);
    const r = await waitMarks(page, exp, 4000);
    check(r.ok, `S2 canvas ${name}: the rings of the source in the middle`, JSON.stringify(r.got));
  }
}
await openRisers();
{
  const h = await heads();
  check(sameJson(dirsOf(h, 'r1'), ['up', 'down']), 'S2 supply, source on level 1: top span up, bottom span down (rings 3, 7, 5)', JSON.stringify(dirsOf(h, 'r1')));
  check(sameJson(dirsOf(h, 'r2'), ['down', 'up']), 'S2 return, source on level 1: top span down, bottom span up (rings 6, 8, 2)', JSON.stringify(dirsOf(h, 'r2')));
  await pickLane('r1');
  check((await boxText()) === 'Away from Level 1 · from the flow solve', 'S2 box names the middle level', await boxText());
  await snap('middle', dlg);
}
await closeDialog();

// ---------------------------------------------------------------- S3: source on the top level, supply goes down
cfg.sources1 = [2];
cfg.sources2 = [2];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(sameJson(dirsOf(h, 'r1'), ['down', 'down']) && sameJson(dirsOf(h, 'r2'), ['up', 'up']), 'S3 source on level 2: supply down, return up', JSON.stringify(h.map((x) => [x.lane, x.dir])));
}
await closeDialog();

// ---------------------------------------------------------------- S4: two sources for R1: no arrow, the reason is in the box
cfg.sources1 = [0, 2];
cfg.sources2 = [0];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(sameJson(dirsOf(h, 'r1'), []), 'S4 two sources: no head on R1', JSON.stringify(dirsOf(h, 'r1')));
  check(sameJson(dirsOf(h, 'r2'), ['down', 'down']), 'S4 R2 has its own group and keeps its heads', JSON.stringify(dirsOf(h, 'r2')));
  await pickLane('r1');
  check((await boxText()) === 'No arrows yet: more than one source level.', 'S4 box text', await boxText());
}
await closeDialog();

// ---------------------------------------------------------------- S5: no source, then a source level and a direction by hand (real lists)
cfg.sources1 = [];
cfg.sources2 = [];
await applyAll(cfg);
await openRisers();
{
  await pickLane('r1');
  await dlg.locator('[data-testid="riser-set-by-hand"]').first().click();
  await idle(500);
  await dlg.locator('[data-testid="riser-source-select"]').selectOption({ label: 'Level 1' });
  await idle(1200);
  let h = await heads();
  check(sameJson(dirsOf(h, 'r1'), ['up', 'down']), 'S5 source level 1 set by hand: heads appear at once (top up, bottom down)', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'Away from Level 1 · Set by hand', 'S5 box says Set by hand', await boxText());
  check(sameJson(dirsOf(h, 'r2'), []), 'S5 R2 has no source: no head', JSON.stringify(dirsOf(h, 'r2')));
  await dlg.locator('[data-testid="riser-flow-select"]').selectOption('down');
  await idle(900);
  h = await heads();
  check(sameJson(dirsOf(h, 'r1'), ['up', 'down']), 'S5 Direction = Down changes no head', JSON.stringify(dirsOf(h, 'r1')));
  check(sameJson(await notes(), ['Direction set by hand: Down. The arrows do not use it.']), 'S5 the grey note explains the Direction list', JSON.stringify(await notes()));
  await snap('handset', dlg);
  await dlg.locator('[data-testid="riser-use-solve"]').click();
  await idle(900);
  h = await heads();
  check(sameJson(dirsOf(h, 'r1'), []), 'S5 "Use the flow solve" takes the heads away again', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'No arrows yet: no source level.', 'S5 box after Use the flow solve', await boxText());
}
await closeDialog();

// ---------------------------------------------------------------- S6: a hand-set ring pair changes the ring only; the diagram shows the flow solve
cfg.sources1 = [0];
cfg.sources2 = [0];
await applyAll(cfg);
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.risers[0].members.find((m) => m.levelId === 'l1').arrows = { below: 'none', above: 'none' };
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
{
  const h = await heads();
  check(sameJson(dirsOf(h, 'r1'), ['up', 'up']), 'S6 hand-set ring pair on level 1: the diagram keeps the flow solve (up, up)', JSON.stringify(dirsOf(h, 'r1')));
  await pickLane('r1');
  check(sameJson(await notes(), ['Some rings use arrows set by hand. The diagram shows the flow solve.']), 'S6 the grey note names the hand-set ring', JSON.stringify(await notes()));
}
await closeDialog();

// ---------------------------------------------------------------- S7: line patterns, a short span, dark colors, narrow layout
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.risers[1].networkType = { ...j.risers[1].networkType, linePattern: 'dotted' };
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
{
  const h = await heads();
  check(h.length === 4, 'S7 dotted lane: the heads show on a solid lane and on a dotted lane', String(h.length));
  await snap('patterns', page.locator('.mep-rd'));
}
await closeDialog();
{
  const j = JSON.parse(JSON.stringify(baseJson));
  j.levels = [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 100 }, { id: 'l2', name: 'Level 2', elevationMm: 3000 }];
  await loadBuilding(t, JSON.stringify(j));
}
await openRisers();
{
  const h = await heads();
  check(h.length === 4, 'S7 short span (48 px): the heads still show', String(h.length));
  const dots = await dlg.locator('[data-riser-id="r1"] .mep-rd-dot-ring').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
  const r1 = h.filter((x) => x.lane === 'r1');
  const clear = r1.every((x) => dots.every((d) => x.y + x.h / 2 <= d.top + 0.5 || x.y - x.h / 2 >= d.bottom - 0.5 || false));
  check(clear, 'S7 no head touches a dot ring (short span)', JSON.stringify({ r1: r1.map((x) => [x.y, x.h]), dots }));
  await pickLane('r1');
  await snap('short', page.locator('.mep-rd'));
}
await closeDialog();
{
  // ten lanes at a narrow width (R3 to R10 share the fittings of R1: they have no direction, only R2 has heads)
  const j = JSON.parse(JSON.stringify(baseJson));
  for (const n of [3, 4, 5, 6, 7, 8, 9, 10]) {
    const copy = JSON.parse(JSON.stringify(j.risers[0]));
    copy.id = `r${n}`;
    copy.name = `R${n}`;
    j.risers.push(copy);
  }
  await loadBuilding(t, JSON.stringify(j));
}
await page.setViewportSize({ width: 760, height: 900 });
await idle(500);
await openRisers();
{
  const h = await heads();
  check(h.length === 2, 'S7 narrow 760 px, ten lanes: the heads of R2 show', String(h.length));
  const sc = await dlg.locator('.mep-rd-scroll').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
  check(sc.sw > sc.cw, 'S7 narrow: the diagram scrolls inside its own box (the heads scroll with the lanes)', JSON.stringify(sc));
  const lg = await dlg.locator('.mep-rd-legend').boundingBox();
  const df = await dlg.locator('.mep-rd-scroll').boundingBox();
  check(lg.y >= df.y + df.height - 1, 'S7 narrow: the legend is under the diagram', JSON.stringify({ lg, df }));
  await snap('narrow', dlg);
  // dark colors: the app has no dark theme, so the variables are set by hand for this picture only
  await page.addStyleTag({ content: ':root{--surface:#1e2327;--surface-2:#2a3036;--ink:#e8edf0;--muted:#a9b6bd;--line:#3a444b;--accent-soft:#2c4252;}' });
  await idle(300);
  await snap('dark-simulated', dlg);
}
await page.setViewportSize({ width: 1600, height: 900 });
await closeDialog();

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
