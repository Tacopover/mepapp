// UI review B7-T05: layout measurement, states, stress, contrast, keyboard of the Capacity block. Setup copied from b7-t05-check.mjs.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';
import { findClipped, measureRows, rootBox, widths } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/layout-measure.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t05/';
const t = await open();
const { page, check, idle, menu, until, statusText } = t;
await t.start();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

const snap = async (name) => {
  const path = `${SHOTS}ui-${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const TYPE = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };

async function save(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
}

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
}
check(uuids.every((u) => u) && new Set(uuids).size === 3, 'three documents with three ids');

const baseBuilding = (over = {}) => ({
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
  ...over,
});
const building = baseBuilding();
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await page.evaluate(async () => {
  const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
  await window.__mepBuilding.rebuildSummaries(read);
});
await idle(800);
const summaryOf = (i) => page.evaluate(async (u) => (await window.__mepBuilding.store.readSummary(u)) ?? null, uuids[i]);
const summaries = [];
for (const i of [0, 1, 2]) summaries.push(await summaryOf(i));
check(summaries.every((s) => s !== null), 'three summaries stored');

const dlg = page.locator('.mep-modal');
const loadState = async (b, sums) => {
  const sm = {};
  sums.forEach((s, i) => { if (s !== null && s !== undefined) sm[uuids[i]] = s; });
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(b), sm]);
  await idle(600);
};
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

// Where is each line of the block relative to the clip box of its scrolling ancestors?
const blockVisibility = () =>
  page.evaluate(() => {
    const block = document.querySelector('[data-testid="riser-capacity"]');
    if (!block) return { error: 'no block' };
    const clips = [];
    for (let e = block.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll|hidden)/.test(cs.overflowY) && e !== document.body && e !== document.documentElement) clips.push(e);
    }
    let top = 0;
    let bottom = innerHeight;
    for (const c of clips) {
      const cr = c.getBoundingClientRect();
      top = Math.max(top, cr.top);
      bottom = Math.min(bottom, cr.bottom);
    }
    const sel = ['h5', '[data-testid="riser-not-design-flow"]', '[data-testid="riser-capacity-main"]', '[data-testid="riser-capacity-total"]', '.mep-rp-cap-row', '.mep-hint', '[data-testid="riser-read-summaries"]'];
    const lines = [...block.querySelectorAll(sel.join(','))].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim().slice(0, 30), full: r.top >= top - 1 && r.bottom <= bottom + 1, top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
    const hidden = lines.filter((l) => !l.full).map((l) => l.text);
    const scroller = clips.find((c) => c.scrollHeight > c.clientHeight + 1);
    return {
      clipBox: [Math.round(top), Math.round(bottom)],
      clipClasses: clips.map((c) => c.className || c.tagName).slice(0, 4),
      lines: lines.length,
      hiddenLines: hidden,
      scrollerClass: scroller ? scroller.className : null,
      scrollerOverflow: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
      blockHeight: Math.round(block.getBoundingClientRect().height),
    };
  });
const scrollToBottom = () =>
  page.evaluate(() => {
    const block = document.querySelector('[data-testid="riser-capacity"]');
    for (let e = block?.parentElement; e; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight;
    }
  });
const scrollToTop = () =>
  page.evaluate(() => {
    const block = document.querySelector('[data-testid="riser-capacity"]');
    for (let e = block?.parentElement; e; e = e.parentElement) {
      if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) e.scrollTop = 0;
    }
  });

const results = [];
async function measureState(tag) {
  for (const { w, h } of widths) {
    await page.setViewportSize({ width: w, height: h });
    await idle(500);
    await scrollToTop();
    const vis = await blockVisibility();
    const box = await rootBox(page);
    const clipped = await findClipped(page, '.mep-modal');
    const capClipped = clipped.filter((c) => /Capacity|Level|at least|not known|Connected|Main|Read|Reading|Some levels|concurrency/.test(c));
    const rowsM = await measureRows(page, '.mep-rp-cap-row', ':scope > *');
    const rowTexts = await page.locator('.mep-rp-cap-row').evaluateAll((els) => els.map((e) => ({ h: Math.round(e.getBoundingClientRect().height), v: e.querySelector('.mep-rp-cap-value')?.getBoundingClientRect().height | 0 })));
    const entry = { tag, w, h, box, vis, capClipped, allClipped: clipped.length, rowProblems: rowsM.problems, rowHeights: rowTexts.map((r) => r.h) };
    results.push(entry);
    console.log('M', JSON.stringify(entry));
    await snap(`${tag}-${w}`);
    if (vis.hiddenLines && vis.hiddenLines.length) {
      await scrollToBottom();
      await idle(200);
      await snap(`${tag}-${w}-scrolled`);
    }
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(300);
}

// --- state: known ---
await loadState(building, summaries);
await showRisers();
await measureState('known');
// stability: Risers tab dialog box vs levels tab
await closeDialog();

// --- state: at least ---
await loadState(building, [summaries[0], null, summaries[2]]);
await showRisers();
await measureState('atleast');
// feedback of the link
{
  const before = await rootBox(page);
  const link = page.locator('[data-testid="riser-read-summaries"]');
  const state = await link.evaluate(async (el) => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
    const a = { label: el.textContent, disabled: el.disabled };
    return a;
  });
  console.log('LINK right after click', JSON.stringify(state));
  const during = await rootBox(page);
  await snap('atleast-link-during');
  await until(async () => (await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'link gone', 30000).catch(() => {});
  await idle(1500);
  const after = await rootBox(page);
  const dtext = await dlg.innerText();
  console.log('BOX before/during/after', JSON.stringify([before, during, after]));
  console.log('DIALOG TEXT has notice?', JSON.stringify(dtext.match(/Read \d+ of \d+ summaries\.?/)), 'status bar:', await statusText());
  await snap('atleast-after-link');
  // after the rebuild the notice: where is it?
  const noticeEls = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Read \d+ of \d+ summaries/.test(e.textContent || '')).map((e) => ({ cls: e.className, inDialog: !!e.closest('.mep-modal'), tag: e.tagName, role: e.getAttribute('role'), live: e.getAttribute('aria-live') })));
  console.log('NOTICE ELEMENTS', JSON.stringify(noticeEls));
}
await closeDialog();

// --- state: old summary ---
{
  const old = JSON.parse(summaries[1]);
  delete old.riserNetworks;
  await loadState(building, [summaries[0], JSON.stringify(old), summaries[2]]);
  await showRisers();
  await measureState('oldsummary');
  await closeDialog();
}

// --- state: unknown (no source) ---
{
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  await loadState(building, [JSON.stringify(noSource), summaries[1], summaries[2]]);
  await showRisers();
  await measureState('unknown');
  await closeDialog();
}

// --- state: no unit ---
{
  const noUnit = baseBuilding();
  noUnit.risers[0].networkType = { ...TYPE, flowUnit: undefined };
  delete noUnit.risers[0].networkType.flowUnit;
  await loadState(noUnit, summaries);
  await showRisers();
  await measureState('nounit');
  await closeDialog();
}

// --- state: electrical / not a design flow ---
{
  const elec = baseBuilding();
  elec.risers[0].networkType = { ...TYPE, discipline: 'electrical' };
  await loadState(elec, summaries);
  await showRisers();
  await measureState('notdesign');
  // tag tooltip
  const tag = page.locator('[data-testid="riser-not-design-flow"]');
  console.log('TAG title', JSON.stringify(await tag.getAttribute('title')), 'cursor', await tag.evaluate((e) => getComputedStyle(e).cursor));
  await closeDialog();
}

// --- state: long names (80 chars) on levels ---
{
  const longB = baseBuilding();
  longB.levels = longB.levels.map((l, i) => ({ ...l, name: `Level ${i} ` + 'Mechanical plant room and long name '.repeat(3).slice(0, 70) }));
  longB.risers[0].name = 'R1 ' + 'x'.repeat(10);
  await loadState(longB, [summaries[0], null, summaries[2]]);
  await showRisers();
  await measureState('longnames');
  await closeDialog();
}

// --- state: 12 fake rows injected (span list scroll) ---
{
  await loadState(building, summaries);
  await showRisers();
  for (const { w, h } of widths) {
    await page.setViewportSize({ width: w, height: h });
    await idle(400);
    await page.evaluate(() => {
      const list = document.querySelector('[data-testid="riser-capacity-list"]');
      if (list.dataset.injected) {
        [...list.querySelectorAll('[data-fake]')].forEach((e) => e.remove());
      }
      const tpl = list.querySelector('.mep-rp-cap-row');
      for (let i = 0; i < 12; i++) {
        const c = tpl.cloneNode(true);
        c.setAttribute('data-fake', '1');
        c.removeAttribute('data-testid');
        c.querySelector('.mep-rp-cap-levels').textContent = `Level ${i + 3} to Level ${i + 4}`;
        c.querySelector('.mep-rp-cap-value').textContent = `${(i + 1) * 123.45} m³/h`;
        list.appendChild(c);
      }
      list.dataset.injected = '1';
    });
    await idle(200);
    const info = await page.evaluate(() => {
      const list = document.querySelector('[data-testid="riser-capacity-list"]');
      const r = list.getBoundingClientRect();
      const main = document.querySelector('[data-testid="riser-capacity-main"]').getBoundingClientRect();
      const cs = getComputedStyle(list);
      return { listHeight: Math.round(r.height), scrollHeight: list.scrollHeight, overflowY: cs.overflowY, tabIndex: list.tabIndex, mainTop: Math.round(main.top) };
    });
    // scroll the list and check header stays
    await page.evaluate(() => { document.querySelector('[data-testid="riser-capacity-list"]').scrollTop = 9999; });
    const afterScroll = await page.evaluate(() => Math.round(document.querySelector('[data-testid="riser-capacity-main"]').getBoundingClientRect().top));
    const vis = await blockVisibility();
    console.log('STRESS12', w, JSON.stringify({ ...info, mainTopAfterListScroll: afterScroll, vis }));
    await snap(`stress12-${w}`);
    await page.evaluate(() => { document.querySelector('[data-testid="riser-capacity-list"]').scrollTop = 0; });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(300);
  await closeDialog();
}

console.log('CONSOLE ERRORS', JSON.stringify(consoleErrors));
console.log('STATE JSON', JSON.stringify({ uuids, anchor }));
await t.finish();
