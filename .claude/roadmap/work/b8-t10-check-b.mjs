// B8-T10, second run: steps B3.1 to B3.5 and B5.5 of part B of .claude/plans/buildings-b8-test.md (Source level by hand with no source, with two sources, the rings on the canvas, the view after "Set by hand").
// Setup and helpers as b8-t10-check.mjs (scene API and dev hook for the levels; real DOM for the Risers tab).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t10-check-b.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, waitMarks, applyLevel } from './b8-t05-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();

const dlg = page.locator('.mep-modal');
const snap = async (name) => {
  const path = `${SHOTS}B8-T10-${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const baseJson = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
async function applyAll(c) {
  for (const i of [0, 2, 1]) {
    try {
      await applyLevel(t, i, c);
    } catch (e) {
      console.log(`retry applyLevel ${i}: ${String(e).slice(0, 120)}`);
      await page.keyboard.press('Escape');
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
const heads = async () => {
  const list = await dlg.locator('[data-testid="riser-span-arrow"]').evaluateAll((els) =>
    els.map((e) => ({ lane: e.closest('[data-riser-id]')?.getAttribute('data-riser-id'), dir: e.getAttribute('data-direction'), y: e.getBoundingClientRect().y })),
  );
  return list.sort((a, b) => (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : a.y - b.y));
};
const dirsOf = (list, lane) => list.filter((h) => h.lane === lane).map((h) => h.dir);
const boxText = async () => (await dlg.locator('[data-testid="riser-flow-text"]').innerText()).trim();
const notes = async () => (await dlg.locator('[data-testid="riser-flow-note"]').allInnerTexts()).map((x) => x.trim());
async function pickLane(id) {
  await dlg.locator(`[data-riser-id="${id}"] .mep-rd-lane-label`).click();
  await idle(400);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const seen = (loc) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + Math.min(r.height / 2, 10);
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return !!top && (el === top || el.contains(top));
  });

await loadBuilding(t, JSON.stringify(baseJson));

// B3.1: both supply units deleted, Source level = Level 1 by hand
cfg.sources1 = [];
cfg.sources2 = [0];
await applyAll(cfg);
await openRisers();
await pickLane('r1');
await dlg.locator('[data-testid="riser-set-by-hand"]').first().click();
await idle(500);
{
  const opts = await dlg.locator('[data-testid="riser-source-select"] option').allInnerTexts();
  console.log('SOURCE OPTIONS', JSON.stringify(opts));
  check(same(opts, ['From the flow solve', 'Level 2', 'Level 1', 'Level 0']), 'B3.1 options of Source level', JSON.stringify(opts));
  const hint = await dlg.locator('[data-testid="riser-capacity-hint"]').allInnerTexts();
  console.log('CAPACITY HINTS after Set by hand', JSON.stringify(hint));
  const dirVal = await dlg.locator('[data-testid="riser-flow-select"]').inputValue();
  const dirOpts = await dlg.locator('[data-testid="riser-flow-select"] option').allInnerTexts();
  console.log('DIRECTION value and options with no source', dirVal, JSON.stringify(dirOpts));
  const useLink = await dlg.locator('[data-testid="riser-use-solve"]').count();
  check(useLink === 1, 'B3.1 the link "Use the flow solve" shows', String(useLink));
  await dlg.locator('[data-testid="riser-source-select"]').selectOption({ label: 'Level 1' });
  await idle(1200);
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'down']), 'B3.1 heads at once: top up, bottom down', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'Away from Level 1 · Set by hand', 'B3.1 line 1', await boxText());
}
await closeDialog();
// B3.2: the rings follow the source level set by hand
for (const [name, exp] of [['l0.pdf', { rf: '5' }], ['l1.pdf', { rf: '7' }], ['l2.pdf', { rf: '3' }]]) {
  await switchTo(t, name);
  const r = await waitMarks(page, exp, 4000);
  check(r.ok, `B3.2 canvas ${name}: the supply ring follows the source level set by hand ${JSON.stringify(exp)}`, JSON.stringify(r.got));
}

// B3.3: two sources, the source level set by hand wins
cfg.sources1 = [0, 2];
await applyAll(cfg);
await openRisers();
await pickLane('r1');
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'down']), 'B3.3 two sources and Source level = Level 1: the heads stay (top up, bottom down)', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'Away from Level 1 · Set by hand', 'B3.3 line 1 with the source level by hand', await boxText());
  await dlg.locator('[data-testid="riser-source-select"]').selectOption({ label: 'From the flow solve' });
  await idle(1000);
  const h2 = await heads();
  check(same(dirsOf(h2, 'r1'), []), 'B3.3 From the flow solve: no head with two sources', JSON.stringify(dirsOf(h2, 'r1')));
  check((await boxText()) === 'No arrows yet: more than one source level.', 'B3.3 line 1: more than one source level', await boxText());
  const listsAfter = await dlg.locator('[data-testid="riser-source-select"]').count();
  check(listsAfter === 0, 'B3.3 the two lists close after From the flow solve (Set by hand shows again)', String(listsAfter));
  if (listsAfter === 0) {
    await dlg.locator('[data-testid="riser-set-by-hand"]').first().click();
    await idle(500);
  }
  await dlg.locator('[data-testid="riser-source-select"]').selectOption({ label: 'Level 0' });
  await idle(1000);
  const h3 = await heads();
  check(same(dirsOf(h3, 'r1'), ['up', 'up']), 'B3.3 Level 0: two heads up', JSON.stringify(dirsOf(h3, 'r1')));
  check((await boxText()) === 'Away from Level 0 · Set by hand', 'B3.3 line 1 Level 0 by hand', await boxText());
  // B3.4: Direction (done in b8-t10-check.mjs); here only the note for Up
  await dlg.locator('[data-testid="riser-flow-select"]').selectOption({ label: 'Up' });
  await idle(800);
  check(same(await notes(), ['Direction set by hand: Up. The arrows do not use it.']), 'B3.4 the note for Up', JSON.stringify(await notes()));
  // B3.5: Use the flow solve
  await dlg.locator('[data-testid="riser-use-solve"]').click();
  await idle(900);
  check((await dlg.locator('[data-testid="riser-source-select"]').count()) === 0, 'B3.5 the two lists are gone after Use the flow solve');
  check((await boxText()) === 'No arrows yet: more than one source level.' && same(await notes(), []), 'B3.5 line 1 and no note', await boxText());
  check(same(dirsOf(await heads(), 'r1'), []), 'B3.5 no head', '');
}
await closeDialog();
cfg.sources1 = [0];
await applyAll(cfg);
await openRisers();
await pickLane('r1');
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'up']), 'B3.5 one unit again: the heads come back', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'Away from Level 0 · from the flow solve', 'B3.5 line 1 from the flow solve', await boxText());
}
await closeDialog();

// B5.5: the view after "Set by hand" in a 1600 x 900 window and in a 1366 x 768 window
for (const [w, hgt] of [[1600, 900], [1366, 768]]) {
  await page.setViewportSize({ width: w, height: hgt });
  await idle(500);
  await openRisers();
  await pickLane('r1');
  const before = { diagram: await seen(dlg.locator('.mep-rd')), box: await seen(dlg.locator('[data-testid="riser-flow-box"]')), diagramTop: (await dlg.locator('.mep-rd').boundingBox()).y };
  await dlg.locator('[data-testid="riser-set-by-hand"]').first().click();
  await idle(800);
  const after = { diagram: await seen(dlg.locator('.mep-rd')), box: await seen(dlg.locator('[data-testid="riser-flow-box"]')), sourceList: await seen(dlg.locator('[data-testid="riser-source-select"]')), diagramTop: (await dlg.locator('.mep-rd').boundingBox()).y };
  console.log(`SET BY HAND ${w}x${hgt}`, JSON.stringify({ before, after }));
  await snap(`b5-set-by-hand-${w}x${hgt}`);
  await dlg.locator('[data-testid="riser-use-solve"]').click();
  await idle(600);
  await closeDialog();
}
await page.setViewportSize({ width: 1600, height: 900 });

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
