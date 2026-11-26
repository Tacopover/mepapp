// B8-T05 journey check, written from the goals G1 to G9 (not from the assertions of b8-t05-check.mjs).
// Usage: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t05-journey.mjs <width> [height]
// Setup (3 PDFs, level drawings, building file) uses the scene API and the dev hook. User actions use real DOM clicks.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/r3-lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks, applyLevel, screenOf, focusRings, LEVELS, W } from './b8-t05-lib.mjs';

const width = Number(process.argv[2] ?? 1600);
const height = Number(process.argv[3] ?? (width === 1600 ? 1000 : 900));
const tag = `w${width}`;
const t = await open({ width, height, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot, menu, until, statusText } = t;
await t.start();

let steps = 0;
const stepLog = {};
const goal = (g) => { steps = 0; stepLog[g] = 0; return g; };
let current = '';
const step = (what) => { steps++; stepLog[current] = steps; console.log(`  step ${steps} (${current}): ${what}`); };
const begin = (g) => { current = goal(g); console.log(`\n=== ${g} at ${width}px`); };
const guard = async (name, fn) => {
  try { await fn(); } catch (e) {
    check(false, `${name}: script error`, String(e).split('\n')[0]);
    await shot(`B8-T05-journey-${tag}-error-${name}`).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
};
const exp = async (what, expected, ms = 4000) => {
  const r = await waitMarks(page, expected, ms);
  check(r.ok, `${current}: ${what}`, JSON.stringify(r.got));
  return r;
};
/** Screenshot of the area around the two rings (rf at y 300, rf2 at y 520). */
async function ringShot(name) {
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  const a = await screenOf(page, { x: 300, y: H - 300 });
  const b = await screenOf(page, { x: 300, y: H - 520 });
  const cx = a.x, cy = (a.y + b.y) / 2;
  const x = Math.max(48, cx - (width < 900 ? 150 : 200)), y = Math.max(0, cy - 190);
  const w = Math.min(400, (width < 900 ? 325 : width) - x), h = Math.min(380, height - y);
  const path = `/tmp/mepapp-shots/B8-T05-journey-${tag}-${name}-ring.png`;
  await page.screenshot({ path, clip: { x, y, width: w, height: h } });
  console.log(`SHOT ${path}`);
  await shot(`B8-T05-journey-${tag}-${name}`);
}
const cfg = { withReturn: true, sources1: [], sources2: [], extra: [] };

// ------------------------------------------------------------ G9 first: plain app, no building
await guard('G9', async () => {
  begin('G9');
  await t.openPdf(W + '01_arch_first_floor.pdf', 'plain.pdf');
  await placeOneStamp(t, width < 900 ? { x: 200, y: 500 } : undefined);
  const n = await page.evaluate(() => window.__mepSketchScene.getRiserMarks().size);
  const stamps = await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.length);
  check(n === 0, 'G9: no ring and no arrow without a building', String(n));
  check(stamps === 1, 'G9: a stamp still places', String(stamps));
  await shot(`B8-T05-journey-${tag}-g9-plain-app`);
});

const { uuids, anchors } = await setup(t, cfg);

// ------------------------------------------------------------ G1: make a riser, no arrows (empty building, then full without a source)
await guard('G1', async () => {
  begin('G1');
  await loadBuilding(t, buildingJson(uuids, anchors, { risers: false }));
  await switchTo(t, 'l0.pdf');
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  const at = await screenOf(page, { x: 300, y: H - 300 });
  step('right-click the fitting');
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
  await shot(`B8-T05-journey-${tag}-g1-menu`);
  const item = page.getByRole('button', { name: /Make riser/ }).first();
  check((await item.count()) > 0, 'G1: right-click menu has "Make riser"');
  step('click "Make riser"');
  await item.click();
  await idle(1200);
  const m = await marksOf(page);
  check(Object.keys(m).length === 1 && Object.values(m)[0].arrows === null, 'G1: one ring, no arrows', JSON.stringify(m));
  await ringShot('g1-new-riser');
  await switchTo(t, 'l1.pdf');
  const m1 = await marksOf(page);
  check(Object.values(m1).every((v) => v.arrows === null), 'G1: level 1 (free anchor ring) has no arrows', JSON.stringify(m1));
  await ringShot('g1-new-riser-l1');
  // full building, no source anywhere
  await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
  for (const [i, l] of LEVELS.entries()) {
    await switchTo(t, l.name);
    await exp(`full building with no source, level ${i}: no arrows`, { rf: 'none', rf2: 'none' });
  }
  const m2 = await marksOf(page);
  check(Object.keys(m2).length === 2, 'G1: the two rings show', JSON.stringify(Object.keys(m2)));
  await ringShot('g1-full-nosource');
});

// ------------------------------------------------------------ G2: add a source on level 0: arrows without save or reload
await guard('G2', async () => {
  begin('G2');
  await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: false }));
  cfg.sources1 = [0];
  await applyLevel(t, 0, cfg);
  await exp('level 0: lowest ring goes up (2)', { rf: '2' });
  await ringShot('g2-l0');
  await switchTo(t, 'l1.pdf');
  await exp('level 1: middle ring comes up and goes up (1)', { rf: '1' });
  await ringShot('g2-l1');
  await switchTo(t, 'l2.pdf');
  await exp('level 2: top ring comes up (3)', { rf: '3' });
  await ringShot('g2-l2');
  const docState = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => `${d.fileName}`));
  console.log('INFO open documents', JSON.stringify(docState));
});

// ------------------------------------------------------------ G3: remove the source (select, Delete). Three times in a row.
async function deleteStamp(id) {
  const pos = await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === id)?.transform.position ?? null, id);
  if (pos === null) return false;
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const at = await screenOf(page, pos);
  step('click the source stamp');
  await page.mouse.click(at.x, at.y);
  await idle(400);
  step('press Delete');
  await page.keyboard.press('Delete');
  await idle(600);
  return !(await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.some((s) => s.id === id), id));
}
await guard('G3', async () => {
  begin('G3');
  for (let k = 1; k <= 3; k++) {
    await switchTo(t, 'l0.pdf');
    if (k > 1) {
      cfg.sources1 = [0];
      await applyLevel(t, 0, cfg);
      await exp(`round ${k}: source back, level 0 goes up (2)`, { rf: '2' });
    }
    const gone = await deleteStamp('src');
    check(gone, `G3 round ${k}: the source is deleted`);
    await exp(`round ${k}: level 0, all arrows gone, ring stays`, { rf: 'none' });
    const m = await marksOf(page);
    check(m.rf !== undefined, `G3 round ${k}: the ring stays on level 0`);
    if (k === 1) await ringShot('g3-deleted-l0');
    await switchTo(t, 'l1.pdf');
    await exp(`round ${k}: level 1, no arrows`, { rf: 'none' });
    check((await marksOf(page)).rf !== undefined, `G3 round ${k}: the ring stays on level 1`);
    if (k === 1) await ringShot('g3-deleted-l1');
    await switchTo(t, 'l2.pdf');
    await exp(`round ${k}: level 2, no arrows`, { rf: 'none' });
  }
  // undo of the delete (wrong order / extra): Undo button on l0
  await switchTo(t, 'l0.pdf');
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(900);
  const r = await waitMarks(page, { rf: '2' }, 4000);
  console.log('INFO after Undo of the Delete, level 0 shows pictogram', r.got.rf, '(source stamp is back: expected 2)');
  check(r.ok, 'G3: Undo of the Delete brings the arrows back', JSON.stringify(r.got));
});

// ------------------------------------------------------------ G4: two sources: no arrows; one source: arrows return
await guard('G4', async () => {
  begin('G4');
  cfg.sources1 = [0, 2];
  await applyLevel(t, 0, cfg);
  await applyLevel(t, 2, cfg);
  await switchTo(t, 'l1.pdf');
  await exp('two sources: no arrows on level 1', { rf: 'none' });
  await ringShot('g4-two-sources-l1');
  await switchTo(t, 'l0.pdf');
  await exp('two sources: no arrows on level 0', { rf: 'none' });
  cfg.sources1 = [0];
  await applyLevel(t, 2, cfg);
  await switchTo(t, 'l1.pdf');
  await exp('one source again: level 1 shows 1', { rf: '1' });
  await ringShot('g4-one-source-again-l1');
  await switchTo(t, 'l0.pdf');
  await exp('one source again: level 0 shows 2', { rf: '2' });
});

// ------------------------------------------------------------ G5: supply riser and return riser together
await guard('G5', async () => {
  begin('G5');
  cfg.sources1 = [0];
  cfg.sources2 = [0];
  await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
  await applyLevel(t, 0, cfg);
  await exp('level 0: supply goes up (2), return comes down (5)', { rf: '2', rf2: '5' });
  await ringShot('g5-l0');
  await switchTo(t, 'l1.pdf');
  const r = await exp('level 1: supply 1, return 4', { rf: '1', rf2: '4' });
  console.log('INFO level 1 colors', JSON.stringify({ rf: [r.last.rf?.color, r.last.rf?.pattern], rf2: [r.last.rf2?.color, r.last.rf2?.pattern] }));
  check(r.last.rf?.color === '#2196f3' && r.last.rf2?.color === '#e53935', 'G5: arrows have the type colors (blue supply, red return)');
  check(r.last.rf?.pattern === 'solid' && r.last.rf2?.pattern === 'dashed', 'G5: arrows have the type patterns (solid, dashed)');
  await ringShot('g5-l1');
  await switchTo(t, 'l2.pdf');
  await exp('level 2: supply 3, return 6', { rf: '3', rf2: '6' });
  await ringShot('g5-l2');
});

// ------------------------------------------------------------ G7: change Flow direction in the editor, 4 times in a row
await guard('G7', async () => {
  begin('G7');
  await switchTo(t, 'l0.pdf');
  await exp('start', { rf: '2', rf2: '5' });
  const M = '.mep-modal';
  async function openEditor(name) {
    step('click the MEP tab');
    await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
    step('click Network Types');
    await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
    step('click HVAC');
    await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
    await idle(400);
    step(`click the pencil of ${name}`);
    await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
    await page.locator(M).waitFor({ timeout: 20000 });
    await idle(300);
  }
  const flips = [['Return (toward source)', '5'], ['Supply (away from source)', '2'], ['Return (toward source)', '5'], ['Supply (away from source)', '2']];
  for (const [k, [label, pict]] of flips.entries()) {
    await openEditor('Supply Air');
    if (k === 0) await shot(`B8-T05-journey-${tag}-g7-editor`);
    const sel = page.locator(M).locator('.mep-field-row', { hasText: /^\s*Flow direction/i }).locator('select');
    const opts = await sel.locator('option').allInnerTexts();
    if (k === 0) console.log('INFO Flow direction options', JSON.stringify(opts));
    step('choose Flow direction');
    const want = opts.find((o) => o.toLowerCase().startsWith(label.slice(0, 6).toLowerCase())) ?? label;
    await sel.selectOption({ label: want });
    await page.evaluate((pict) => {
      const PICT = { 2: ['none', 'up'], 5: ['none', 'down'] };
      window.__tClick = null; window.__tSeen = null;
      document.addEventListener('click', (e) => { if (e.target.closest?.('.mep-modal button')?.textContent.trim() === 'Save') window.__tClick = performance.now(); }, { capture: true, once: true });
      const iv = setInterval(() => {
        const m = window.__mepSketchScene.getRiserMarks().get('rf');
        if (window.__tClick !== null && m?.arrows && m.arrows.below === PICT[pict][0] && m.arrows.above === PICT[pict][1]) { window.__tSeen = performance.now(); clearInterval(iv); }
      }, 10);
      setTimeout(() => clearInterval(iv), 6000);
    }, pict);
    step('click Save');
    await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
    const r = await waitMarks(page, { rf: pict, rf2: '5' }, 3000);
    const ms = Math.round(await page.evaluate(() => (window.__tSeen ?? 99999) - (window.__tClick ?? 0)));
    check(r.ok && ms < 1000, `G7 flip ${k + 1} (${want}): R1 on level 0 shows ${pict} within 1 s of the Save click`, `${ms} ms ${JSON.stringify(r.got)}`);
    console.log(`INFO flip ${k + 1} took ${ms} ms from the Save click to the scene (page timer)`);
    await idle(500);
    if (k === 0) await ringShot('g7-flip1-l0');
  }
  // the effect on another drawing (accepted D-B-130, described for the user)
  await switchTo(t, 'l1.pdf');
  await page.waitForTimeout(600);
  const r1 = await marksOf(page);
  console.log('INFO after flips, level 1 shows R1 pictogram', JSON.stringify(r1.rf?.arrows));
});

// ------------------------------------------------------------ G8: page change does not flash
await guard('G8', async () => {
  begin('G8');
  async function sampled(name) {
    await page.evaluate(() => {
      window.__samples = [];
      window.__iv = setInterval(() => {
        const list = [...window.__mepSketchScene.getRiserMarks().values()];
        window.__samples.push(list.map((m) => (m.arrows ? 1 : 0)).join('') + '/' + list.length);
      }, 6);
    });
    step(`switch to ${name} in the header switcher`);
    await switchTo(t, name);
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => { clearInterval(window.__iv); return window.__samples; });
    const distinct = [...new Set(s)];
    const flash = s.filter((x) => x.includes('0'));
    check(s.length > 3 && flash.length === 0, `G8: switch to ${name}: no sample without arrows (${s.length} samples)`, JSON.stringify(distinct));
    console.log('INFO samples', name, JSON.stringify(distinct));
  }
  for (const n of ['l1.pdf', 'l2.pdf', 'l0.pdf', 'l2.pdf', 'l1.pdf']) await sampled(n);
});

// ------------------------------------------------------------ G6: a level that is not open
await guard('G6', async () => {
  begin('G6');
  cfg.sources1 = [1];
  cfg.sources2 = [1];
  for (const i of [0, 2, 1]) await applyLevel(t, i, cfg);
  for (const i of [0, 1, 2]) {
    await switchTo(t, LEVELS[i].name);
    await menu('Save');
    await until(async () => /Saved |Failed/.test(await statusText()), 'save');
    await idle(600);
  }
  await page.evaluate(async () => {
    const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
    await window.__mepBuilding.rebuildSummaries(read);
  });
  await idle(800);
  await switchTo(t, 'l1.pdf');
  await exp('source on level 1 (open): level 1 shows 7 and 8', { rf: '7', rf2: '8' });
  await ringShot('g6-open-l1');
  await switchTo(t, 'l0.pdf');
  step('open the document switcher');
  await page.locator('.mep-doc-switcher-btn').click();
  step('click the close button of l1.pdf');
  await page.locator('.mep-doc-switcher-dropdown .mep-doc-close[title="Close l1.pdf"]').click();
  await idle(1500);
  await page.keyboard.press('Escape');
  const docs = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
  check(!docs.includes('l1.pdf'), 'G6: l1.pdf is closed', JSON.stringify(docs));
  await exp('level 1 closed: level 0 shows supply 5, return 2', { rf: '5', rf2: '2' });
  await ringShot('g6-closed-l0');
  await switchTo(t, 'l2.pdf');
  await exp('level 1 closed: level 2 shows supply 3, return 6', { rf: '3', rf2: '6' });
  await ringShot('g6-closed-l2');
});

console.log('\nSTEPS', JSON.stringify(stepLog));
await t.finish();
