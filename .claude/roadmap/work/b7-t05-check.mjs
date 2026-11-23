// B7-T05: part check of the capacity block of the Risers tab. 3 levels from real PDFs, one riser, terminals 100 / 300+200 / 150.
// Setup (documents, scale, project JSON, building file, summaries) uses the scene API and the dev hook only.
// Everything that the task changes is read from the real DOM of the dialog (rows, lines, hints, warnings) and driven by real clicks
// (menu, tab, link "Read summaries now").
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { exportScope, recordSuggestedNames } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b2-lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t05/';
const t = await open();
const { page, check, idle, menu, until, statusText } = t;
await t.start();

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const TYPE = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };

async function save(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
}

// --- setup: three levels ---
const LEVELS = [
  { pdf: '00_arch_ground_floor.pdf', name: 'l0.pdf', terminals: [100], source: true },
  { pdf: '01_arch_first_floor.pdf', name: 'l1.pdf', terminals: [300, 200], source: false },
  { pdf: 'arch_simple_A4.pdf', name: 'l2.pdf', terminals: [150], source: false },
];
const uuids = [];
let anchor = null;
for (const [i, level] of LEVELS.entries()) {
  await t.openPdf(W + level.pdf, level.name);
  await placeOneStamp(t);
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  const built = await page.evaluate(
    ([level, H, type]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      const a = p.stamps[0];
      const base = JSON.parse(JSON.stringify(a));
      delete base.routingTargets;
      delete base.autoPlaced;
      const scaleOf = (s) => [s.transform.scale?.x ?? 1, s.transform.scale?.y ?? 1];
      const placeAt = (port, at) => {
        const [sx, sy] = scaleOf(base);
        return { x: at.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * base.nativeHeight * sy };
      };
      const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
      const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
      const rf = { x: 300, y: H - 300 };
      const j = { x: rf.x + 150, y: rf.y };
      const stamps = [];
      const segments = [];
      const fittings = [{ id: 'rf', pageIndex: 0, position: rf, kind: 'junction' }];
      const fit = (id) => ({ kind: 'fitting', fittingId: id });
      const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
      const seg = (id, a, b, from, to) => ({ id, pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
      const terminal = (id, at) => {
        const s = JSON.parse(JSON.stringify(base));
        s.id = id;
        s.category = 'terminal';
        s.ports = [inPort];
        s.transform = { ...s.transform, position: placeAt(inPort, at) };
        stamps.push(s);
        return at;
      };
      const terms = level.terminals;
      if (level.chain === 'direct') {
        const at = { x: rf.x + 200, y: rf.y };
        terminal('t0', at);
        segments.push(seg('s1', fit('rf'), port('t0', 'in'), rf, at));
      } else {
        fittings.push({ id: 'j', pageIndex: 0, position: j, kind: 'junction' });
        segments.push(seg('s1', fit('rf'), fit('j'), rf, j));
        terms.forEach((_, k) => {
          const at = { x: j.x + 150, y: j.y + (k - (terms.length - 1) / 2) * 120 };
          terminal(`t${k}`, at);
          segments.push(seg(`s${k + 2}`, fit('j'), port(`t${k}`, 'in'), j, at));
        });
        if (level.source) {
          const at = { x: j.x, y: j.y - 150 };
          const eq = JSON.parse(JSON.stringify(base));
          eq.id = 'src';
          eq.category = 'equipment';
          eq.ports = [outPort];
          eq.transform = { ...eq.transform, position: placeAt(outPort, at) };
          stamps.push(eq);
          segments.push(seg('s9', fit('j'), port('src', 'out'), j, at));
        }
      }
      p.stamps = stamps;
      p.segments = segments;
      p.fittings = fittings;
      p.portGroups = [];
      p.terminalCapacities = Object.fromEntries(terms.map((c, k) => [`t${k}`, c]));
      p.networkTypes = [type];
      scene.loadProjectFromJson(p);
      return { rf };
    },
    [{ ...level, chain: i === 2 ? 'direct' : 'tree' }, H, TYPE],
  );
  await idle(1200);
  await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
  if (i === 0) {
    const ppmm = await page.evaluate(() => window.__mepSketchScene.getCalibration().pageUnitsPerRealUnit);
    anchor = { xMm: Math.round((built.rf.x / ppmm) * 100) / 100, yMm: Math.round(((H - built.rf.y) / ppmm) * 100) / 100 };
  }
  uuids.push(await page.evaluate(() => window.__mepSketchScene.getProjectUuid()));
  await save(level.name);
  const counts = await page.evaluate(() => {
    const p = window.__mepSketchScene.exportProject();
    return { stamps: p.stamps.length, segments: p.segments.length, caps: p.terminalCapacities };
  });
  check(counts.stamps >= 1 && counts.segments >= 1, `${level.name}: project loaded`, JSON.stringify(counts));
}
check(uuids.every((u) => u) && new Set(uuids).size === 3, 'three documents with three ids', JSON.stringify(uuids));

const building = {
  schemaVersion: 1,
  id: 'b-b7t05',
  name: 'Tower',
  levels: [0, 1, 2].map((i) => ({ id: `l${i}`, name: `Level ${i}`, elevationMm: i * 3000 })),
  sheets: [0, 1, 2].map((i) => ({ id: `s${i}`, levelId: `l${i}`, projectUuid: uuids[i], pageIndex: 0, displayName: `Sheet ${i}`, location: { fileName: LEVELS[i].name, path: LEVELS[i].name } })),
  risers: [
    {
      id: 'r1', name: 'R1', networkTypeId: TYPE.id, networkType: TYPE, anchorMm: anchor, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0,
      members: [0, 1, 2].map((i) => ({ levelId: `l${i}`, sheetId: `s${i}`, pageIndex: 0, fittingId: 'rf' })),
      pending: [],
    },
  ],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await page.evaluate(async () => {
  const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
  await window.__mepBuilding.rebuildSummaries(read);
});
await idle(800);
const summaryOf = (i) => page.evaluate(async (u) => (await window.__mepBuilding.store.readSummary(u)) ?? null, uuids[i]);
const summaries = [];
for (const i of [0, 1, 2]) {
  const raw = await summaryOf(i);
  summaries.push(raw);
  const parsed = raw ? JSON.parse(raw) : null;
  check(parsed !== null && Array.isArray(parsed.riserNetworks) && parsed.riserNetworks.length === 1, `level ${i}: the stored summary has riserNetworks`, parsed ? JSON.stringify(parsed.riserNetworks) : 'no summary');
}
const caps = summaries.map((s) => JSON.parse(s).riserNetworks[0].terminalCapacity);
check(JSON.stringify(caps) === '[100,500,150]', 'terminal capacities of the levels are 100, 500, 150', JSON.stringify(caps));
check(JSON.parse(summaries[0]).riserNetworks[0].hasSource === true && JSON.parse(summaries[1]).riserNetworks[0].hasSource === false, 'only level 0 has a source', '');

// --- dialog helpers ---
const dlg = page.locator('.mep-modal');
async function showRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await page.locator('[data-testid="riser-capacity"]').waitFor({ state: 'visible', timeout: 8000 });
  await until(async () => (await page.locator('[data-testid="riser-capacity"]').innerText()).indexOf('Reading the saved summaries') < 0, 'summaries read', 8000);
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}
const rowsText = () => page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const textOf = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
const hints = () => page.locator('[data-testid="riser-capacity-hint"]').allInnerTexts();
const warningsText = async () => ((await page.locator('[data-testid="riser-warnings"]').count()) > 0 ? await page.locator('[data-testid="riser-warnings"]').innerText() : '');

// --- state 1: numbers known (source on level 0) ---
await showRisers();
await snap('b7-t05-1-known-1600');
check((await textOf('riser-capacity-main')) === 'Main level: Level 0', 'main level line', String(await textOf('riser-capacity-main')));
check((await textOf('riser-capacity-total')) === 'Connected total: 750 m³/h (no concurrency factor)', 'connected total line', String(await textOf('riser-capacity-total')));
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: 650 m³/h', 'Level 1 to Level 2: 150 m³/h']), 'rows 650 and 150 (worked example, source on level 0)', JSON.stringify(rows));
  check((await hints()).length === 0, 'no hint when all numbers are known', JSON.stringify(await hints()));
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'no link "Read summaries now" when all summaries are there');
  check((await page.locator('[data-testid="riser-not-design-flow"]').count()) === 0, 'no "Not a design flow" tag for supply air');
  check(!/Flow is not summed across levels/.test(await dlg.innerText()), 'the false line is not in the dialog');
}
// the old B4 text is unchanged
check(/Flow direction/.test(await dlg.innerText()), 'the B4 "Flow direction" block is still there');
await page.setViewportSize({ width: 1100, height: 900 });
await idle(500);
await snap('b7-t05-1-known-1100');
await page.setViewportSize({ width: 760, height: 900 });
await idle(500);
await snap('b7-t05-1-known-760');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(300);
await closeDialog();

// --- state 1b: the open level (level 2, active document) counts once, with its live data ---
{
  const active = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
  check(active === uuids[2], 'the open document is level 2', `${active} vs ${uuids[2]}`);
  await page.evaluate(() => window.__mepSketchScene.setTerminalCapacity('t0', 250));
  await idle(600);
  await showRisers();
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: 750 m³/h', 'Level 1 to Level 2: 250 m³/h']), 'a capacity edit on the open level changes the rows (live data, counted once)', JSON.stringify(rows));
  check((await textOf('riser-capacity-total')) === 'Connected total: 850 m³/h (no concurrency factor)', 'total after the edit is 850 (not 1000)', String(await textOf('riser-capacity-total')));
  await snap('b7-t05-1b-live-edit');
  await closeDialog();
  await page.evaluate(() => window.__mepSketchScene.setTerminalCapacity('t0', 150));
  await idle(400);
}

// --- state 2: "at least" (level 1 has no saved summary) ---
// B7-T07: an open level counts live, so a missing summary of an open level is never read. Close level 0 and level 1 (scene API, setup only; the close by a real click is proven in b7-t07-check). Level 2 stays open and live.
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  for (const d of s.getDocuments()) if (d.fileName !== 'l2.pdf') s.closeDocument(d.id);
});
await idle(800);
await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[2]]: summaries[2] }]);
await idle(600);
await showRisers();
await snap('b7-t05-2-atleast-1600');
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: at least 150 m³/h', 'Level 1 to Level 2: 150 m³/h']), 'span behind the missing level reads "at least"; the leaf span is exact', JSON.stringify(rows));
  check((await textOf('riser-capacity-total')) === 'Connected total: at least 250 m³/h (no concurrency factor)', 'total reads "at least"', String(await textOf('riser-capacity-total')));
  const h = await hints();
  check(h.some((x) => /Some levels have no data/.test(x)), 'the incomplete hint shows', JSON.stringify(h));
  const w = await warningsText();
  check(/Level 1 has no saved summary\. Read the summaries\./.test(w), 'the warning list names level 1', w);
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 1, 'the link "Read summaries now" shows');
  await page.setViewportSize({ width: 760, height: 900 });
  await idle(500);
  await snap('b7-t05-2-atleast-760');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(300);
  // real click on the link
  await page.locator('[data-testid="riser-read-summaries"]').click();
  await until(async () => (await page.locator('[data-testid="riser-read-summaries"]').count()) === 0 || /Reading…/.test(await page.locator('[data-testid="riser-read-summaries"]').innerText().catch(() => '')) === false, 'link run ends', 30000);
  await idle(2500);
  console.log('AFTER LINK rows', JSON.stringify(await rowsText()), 'status', await statusText());
  console.log('AFTER LINK hints', JSON.stringify(await hints()));
  await snap('b7-t05-2-after-link');
}
await closeDialog();

// --- state 2b: a summary saved before riserNetworks existed ---
{
  const old = JSON.parse(summaries[1]);
  delete old.riserNetworks;
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[1]]: JSON.stringify(old), [uuids[2]]: summaries[2] }]);
  await idle(600);
  await showRisers();
  const w = await warningsText();
  check(/The summary of Level 1 has no riser data\. Read the summaries\./.test(w), 'the old-summary warning is visible in the pane', w);
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 1, 'the link shows for a summary with no riser data');
  await snap('b7-t05-2b-old-summary');
  await closeDialog();
}

// --- state 3: "not known yet" (no source level) ---
{
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: JSON.stringify(noSource), [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(600);
  await showRisers();
  await snap('b7-t05-3-unknown-1600');
  const rows = await rowsText();
  check(rows.length === 2 && rows.every((r) => /not known yet \(no source level\)$/.test(r)), 'rows read "not known yet (no source level)"', JSON.stringify(rows));
  check((await textOf('riser-capacity-main')) === 'Main level: not known yet', 'main level not known', String(await textOf('riser-capacity-main')));
  check((await textOf('riser-capacity-total')) === 'Connected total: 750 m³/h (no concurrency factor)', 'total still shows', String(await textOf('riser-capacity-total')));
  const h = await hints();
  check(h.some((x) => /Click Set by hand and choose a source level\./.test(x)), 'the hint points to Set by hand', JSON.stringify(h));
  check(/no source level/.test(await warningsText()), 'the warning list has the no-source warning', await warningsText());
  await page.setViewportSize({ width: 760, height: 900 });
  await idle(500);
  await snap('b7-t05-3-unknown-760');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(300);
  // real clicks: Set by hand, then choose the source level
  await page.locator('[data-testid="riser-set-by-hand"]').click();
  await idle(400);
  await page.locator('[data-testid="riser-source-select"]').selectOption({ label: 'Level 2' });
  await idle(1200);
  const rows2 = await rowsText();
  check(JSON.stringify(rows2) === JSON.stringify(['Level 0 to Level 1: 100 m³/h', 'Level 1 to Level 2: 600 m³/h']), 'a hand-set main level (Level 2) gives 100 and 600', JSON.stringify(rows2));
  check((await textOf('riser-capacity-main')) === 'Main level: Level 2', 'main level is Level 2', String(await textOf('riser-capacity-main')));
  await snap('b7-t05-3-hand-set');
  await closeDialog();
}

// --- takeoff: Building scope export shows the three columns and the warnings ---
// --- fold: in an attention state the hint and the link are in view at 1100 x 800, and the focus goes to the heading after the link ---
{
  const visibleInPanel = async (testId) => {
    const el = page.locator(`[data-testid="${testId}"]`).first();
    if ((await el.count()) === 0) return false;
    const box = await el.boundingBox();
    const panel = await page.locator('[data-testid="risers-panel"]').boundingBox();
    return box !== null && panel !== null && box.y >= panel.y - 1 && box.y + box.height <= panel.y + panel.height + 1;
  };
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[2]]: summaries[2] }]);
  await idle(600);
  await showRisers();
  await idle(600);
  await snap('b7-t05-fold-atleast-1100');
  check(await visibleInPanel('riser-read-summaries'), 'at 1100 x 800 the link "Read summaries now" is inside the visible pane without a manual scroll');
  check(await visibleInPanel('riser-capacity-total'), 'at 1100 x 800 the total line is inside the visible pane');
  await page.locator('[data-testid="riser-read-summaries"]').click();
  await until(async () => (await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'link run ends', 30000);
  await idle(800);
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
  check(focused.trim() === 'Capacity', 'after the link run the focus is on the Capacity heading', JSON.stringify(focused));
  await closeDialog();
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: JSON.stringify(noSource), [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(600);
  await showRisers();
  await idle(600);
  await snap('b7-t05-fold-unknown-1100');
  check(await visibleInPanel('riser-capacity-hint'), 'at 1100 x 800 the hint that names Set by hand is inside the visible pane (the link itself is one block lower: accepted)');
  await page.locator('[data-testid="riser-set-by-hand"]').click();
  await idle(400);
  check((await hints()).some((x) => /Choose a level in the list "Source level"\./.test(x)), 'with the selects open the hint says to choose in the list', JSON.stringify(await hints()));
  await closeDialog();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(300);
}
{
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] }]);
  await idle(600);
  await recordSuggestedNames(t);
  const all = await exportScope(t, 'building');
  const table = all.xlsx.sheets.Risers ?? [];
  const head = table[0] ?? [];
  console.log('RISERS HEAD', JSON.stringify(head));
  console.log('RISERS ROWS', JSON.stringify(table.slice(1)));
  check(JSON.stringify(head.slice(-3)) === JSON.stringify(['Capacity', 'Capacity unit', 'Capacity complete']), 'Risers table has the three new columns at the end', JSON.stringify(head));
  const col = (name) => head.indexOf(name);
  const cells = table.slice(1).map((r) => [r[col('Capacity')], r[col('Capacity unit')], r[col('Capacity complete')]]);
  check(JSON.stringify(cells) === JSON.stringify([['650', 'm³/h', 'Yes'], ['150', 'm³/h', 'Yes']]), 'Risers rows carry 650 and 150, unit, Yes', JSON.stringify(cells));
  check(table.slice(1).every((r) => r.length === head.length), 'every Risers row has the length of the header');
  const warn = (all.xlsx.sheets.Warnings ?? []).map((r) => r[0]);
  check(!warn.some((w) => /Flow is not summed/.test(w)), 'the false warning is not exported', JSON.stringify(warn));
  check(warn.some((w) => /plain sum of connected capacities/.test(w)), 'the new warning is exported', JSON.stringify(warn));
}
await t.finish();
