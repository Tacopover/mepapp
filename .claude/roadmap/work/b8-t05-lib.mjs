// Helpers for the B8-T05 checks: three levels from real PDFs, riser R1 (supply-air) and optional riser R2 (return-air),
// and a way to change what each level draws. Setup uses the scene API and the dev hook (__mepBuilding) only.
// Reading uses scene.getRiserMarks() (the arrows that reach the scene) and the pixels of real screenshots.
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/r3-lib.mjs';

export const W = '/root/MepApp/.claude/worktrees/buildings-b8/fixtures/pdfs/';
export const SUPPLY = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };
export const RETURN = { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#e53935', lineWidthPt: 2, linePattern: 'dashed', flowUnit: 'm³/h' };
export const LEVELS = [
  { pdf: '00_arch_ground_floor.pdf', name: 'l0.pdf', terminals: [100] },
  { pdf: '01_arch_first_floor.pdf', name: 'l1.pdf', terminals: [300, 200] },
  { pdf: 'arch_simple_A4.pdf', name: 'l2.pdf', terminals: [150] },
];

/** The project JSON of level `i`. cfg: { sources1: [level index], sources2: [level index], withReturn: bool, extra: [level index] }. Riser fitting rf at (300, H-300), rf2 at (300, H-520). */
export function buildLevelProject(page, i, cfg) {
  return page.evaluate(
    ([i, cfg, level, supply, ret]) => {
      const scene = window.__mepSketchScene;
      const H = scene.getDisplayedPageSize().heightPt;
      const p = scene.exportProject();
      if (!window.__base) window.__base = JSON.parse(JSON.stringify(p.stamps[0]));
      const base = JSON.parse(JSON.stringify(window.__base));
      delete base.routingTargets;
      delete base.autoPlaced;
      const scaleOf = (s) => [s.transform.scale?.x ?? 1, s.transform.scale?.y ?? 1];
      const placeAt = (port, at) => {
        const [sx, sy] = scaleOf(base);
        return { x: at.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * base.nativeHeight * sy };
      };
      const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
      const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
      const stamps = [];
      const segments = [];
      const fittings = [];
      const caps = {};
      const fit = (id) => ({ kind: 'fitting', fittingId: id });
      const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
      const seg = (id, type, a, b, from, to) => ({ id, pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
      const stamp = (id, category, ports, prt, at) => {
        const s = JSON.parse(JSON.stringify(base));
        s.id = id;
        s.category = category;
        s.ports = ports;
        s.transform = { ...s.transform, position: placeAt(prt, at) };
        stamps.push(s);
      };
      const network = (tag, type, y, sources) => {
        const rf = { x: 300, y: H - y };
        const j = { x: rf.x + 150, y: rf.y };
        fittings.push({ id: `rf${tag}`, pageIndex: 0, position: rf, kind: 'junction' }, { id: `j${tag}`, pageIndex: 0, position: j, kind: 'junction' });
        segments.push(seg(`s1${tag}`, type, fit(`rf${tag}`), fit(`j${tag}`), rf, j));
        level.terminals.forEach((c, k) => {
          const at = { x: j.x + 150, y: j.y + (k - (level.terminals.length - 1) / 2) * 120 };
          stamp(`t${tag}${k}`, 'terminal', [inPort], inPort, at);
          caps[`t${tag}${k}`] = c;
          segments.push(seg(`s${k + 2}${tag}`, type, fit(`j${tag}`), port(`t${tag}${k}`, 'in'), j, at));
        });
        if ((cfg.extra ?? []).includes(i)) {
          const at = { x: j.x + 150, y: j.y + 240 };
          stamp(`tx${tag}`, 'terminal', [inPort], inPort, at);
          caps[`tx${tag}`] = 50;
          segments.push(seg(`sx${tag}`, type, fit(`j${tag}`), port(`tx${tag}`, 'in'), j, at));
        }
        if (sources.includes(i)) {
          const at = { x: j.x, y: j.y - 100 };
          stamp(`src${tag}`, 'equipment', [outPort], outPort, at);
          segments.push(seg(`s9${tag}`, type, fit(`j${tag}`), port(`src${tag}`, 'out'), j, at));
        }
      };
      network('', supply, 300, cfg.sources1 ?? []);
      if (cfg.withReturn) network('2', ret, 520, cfg.sources2 ?? []);
      p.stamps = stamps;
      p.segments = segments;
      p.fittings = fittings;
      p.portGroups = [];
      p.terminalCapacities = caps;
      p.networkTypes = cfg.withReturn ? [supply, ret] : [supply];
      return p;
    },
    [i, cfg, LEVELS[i], SUPPLY, RETURN],
  );
}

/** Opens the three PDFs, draws each level, sets the scale, saves each. Returns { uuids, anchors }. */
export async function setup(t, cfg) {
  const { page, check, idle, menu, until, statusText } = t;
  async function save(label) {
    await menu('Save');
    await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
    await idle(800);
  }
  const uuids = [];
  const anchors = {};
  for (const [i, level] of LEVELS.entries()) {
    await t.openPdf(W + level.pdf, level.name);
    await placeOneStamp(t, page.viewportSize().width < 900 ? { x: 200, y: 500 } : undefined);
    const p = await buildLevelProject(page, i, cfg);
    await page.evaluate((p) => window.__mepSketchScene.loadProjectFromJson(p), p);
    await idle(1200);
    await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
    if (i === 0) {
      const ppmm = await page.evaluate(() => window.__mepSketchScene.getCalibration().pageUnitsPerRealUnit);
      anchors.r1 = { xMm: Math.round((300 / ppmm) * 100) / 100, yMm: Math.round((300 / ppmm) * 100) / 100 };
      anchors.r2 = { xMm: Math.round((300 / ppmm) * 100) / 100, yMm: Math.round((520 / ppmm) * 100) / 100 };
    }
    uuids.push(await page.evaluate(() => window.__mepSketchScene.getProjectUuid()));
    await save(level.name);
  }
  check(uuids.every((u) => u) && new Set(uuids).size === 3, 'three documents with three ids', JSON.stringify(uuids));
  return { uuids, anchors };
}

/** The building JSON. withReturn adds the riser R2 (return-air). members: fitting ids rf and rf2. */
export function buildingJson(uuids, anchors, { withReturn = false, risers = true } = {}) {
  const member = (i, fittingId) => ({ levelId: `l${i}`, sheetId: `s${i}`, pageIndex: 0, fittingId });
  const riser = (id, name, type, anchor, fittingId) => ({
    id, name, networkTypeId: type.id, networkType: type, anchorMm: anchor, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0,
    members: [0, 1, 2].map((i) => member(i, fittingId)), pending: [],
  });
  return JSON.stringify({
    schemaVersion: 1,
    id: 'b-b8t05',
    name: 'Tower',
    levels: [0, 1, 2].map((i) => ({ id: `l${i}`, name: `Level ${i}`, elevationMm: i * 3000 })),
    sheets: [0, 1, 2].map((i) => ({ id: `s${i}`, levelId: `l${i}`, projectUuid: uuids[i], pageIndex: 0, displayName: `Sheet ${i}`, location: { fileName: LEVELS[i].name, path: LEVELS[i].name } })),
    risers: risers ? [riser('r1', 'R1', SUPPLY, anchors.r1, 'rf'), ...(withReturn ? [riser('r2', 'R2', RETURN, anchors.r2, 'rf2')] : [])] : [],
  });
}

export async function loadBuilding(t, json) {
  const { page, idle } = t;
  await page.evaluate((j) => window.__mepBuilding.load(j), json);
  await idle(600);
  await page.evaluate(async () => {
    const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
    await window.__mepBuilding.rebuildSummaries(read);
  });
  await idle(800);
}

/** Puts the riser rings in the middle of the canvas at zoom 1 (view setup only). */
export async function focusRings(page) {
  await page.evaluate(() => {
    const s = window.__mepSketchScene;
    const H = s.getDisplayedPageSize().heightPt;
    const r = s.app.canvas.getBoundingClientRect();
    const z = 1;
    const w = { x: 420, y: H - 420 };
    s.world.scale.set(z);
    s.world.x = (window.innerWidth < 900 ? 200 - r.left : r.width / 2) - w.x * z;
    s.world.y = r.height / 2 - w.y * z;
    s.zoomBy(1);
  });
  await page.waitForTimeout(300);
}

/** Real switch of the shown document through the header switcher. */
export async function switchTo(t, name) {
  const { page, idle } = t;
  const title = (await page.locator('.mep-doc-switcher .mep-title').innerText()).trim();
  if (title !== name) {
    if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
    await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
    await idle(1000);
  }
  await focusRings(page);
}

/** The arrows that reach the scene: { fittingId: { name, arrows, color, pattern } } for the marks of the shown page. */
export function marksOf(page) {
  return page.evaluate(() => {
    const out = {};
    for (const [id, m] of window.__mepSketchScene.getRiserMarks()) out[id] = { name: m.name, arrows: m.arrows ?? null, color: m.arrowColor ?? null, pattern: m.arrowPattern ?? null };
    return out;
  });
}
export const PICT = {
  1: { below: 'up', above: 'up' }, 2: { below: 'none', above: 'up' }, 3: { below: 'up', above: 'none' }, 4: { below: 'down', above: 'down' },
  5: { below: 'none', above: 'down' }, 6: { below: 'down', above: 'none' }, 7: { below: 'down', above: 'up' }, 8: { below: 'up', above: 'down' },
};
/** '1' to '8', or 'none' for no arrows. */
export const pictOf = (a) => {
  if (!a) return 'none';
  return Object.entries(PICT).find(([, v]) => v.below === a.below && v.above === a.above)?.[0] ?? '?';
};
/** Polls until the pictograms of the marks match `expected` ({ fittingId: '1'..'8' | 'none' }), up to ms. */
export async function waitMarks(page, expected, ms = 4000) {
  const end = Date.now() + ms;
  let last = {};
  let got = {};
  while (Date.now() < end) {
    last = await marksOf(page);
    got = Object.fromEntries(Object.keys(expected).map((k) => [k, pictOf(last[k]?.arrows)]));
    if (Object.entries(expected).every(([k, v]) => got[k] === v)) return { ok: true, last, got };
    await page.waitForTimeout(150);
  }
  return { ok: false, last, got };
}
export const screenOf = (page, p) => page.evaluate((p) => {
  const s = window.__mepSketchScene;
  const g = s.world.toGlobal(p);
  const r = s.app.canvas.getBoundingClientRect();
  return { x: r.left + g.x, y: r.top + g.y };
}, p);

/** Changes what level `i` draws (shown through the real switcher, then loaded with the scene API: setup only). */
export async function applyLevel(t, i, cfg) {
  const { page, idle } = t;
  await switchTo(t, LEVELS[i].name);
  const p = await buildLevelProject(page, i, cfg);
  await page.evaluate((p) => window.__mepSketchScene.loadProjectFromJson(p), p);
  await idle(800);
  await focusRings(page);
}
