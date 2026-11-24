// Setup for B7-T09c-2b: Example 5 of the open-ends plan. 3 levels from real PDFs, one riser, terminals 100 / 300+200 / 150, one open end on each level, NO equipment.
// Uses the scene API and the dev hook for setup only.
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/fixtures/pdfs/';
export const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2b/';
export const TYPE = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };

/** `levelSpecs`: [{ pdf, name, terminals: number[], openEnd: boolean, equipment?: boolean }] for the three levels. */
export const EXAMPLE5 = [
  { pdf: '00_arch_ground_floor.pdf', name: 'l0.pdf', terminals: [100], openEnd: true },
  { pdf: '01_arch_first_floor.pdf', name: 'l1.pdf', terminals: [300, 200], openEnd: true },
  { pdf: 'arch_simple_A4.pdf', name: 'l2.pdf', terminals: [150], openEnd: true },
];

export async function setup(t, levelSpecs = EXAMPLE5, type = TYPE) {
  const { page, check, idle, menu, until, statusText } = t;
  async function save(label) {
    await menu('Save');
    await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
    await idle(800);
  }
  const uuids = [];
  let anchor = null;
  for (const [i, level] of levelSpecs.entries()) {
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
        const fittings = [
          { id: 'rf', pageIndex: 0, position: rf, kind: 'junction' },
          { id: 'j', pageIndex: 0, position: j, kind: 'junction' },
        ];
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
        segments.push(seg('s1', fit('rf'), fit('j'), rf, j));
        terms.forEach((_, k) => {
          const at = { x: j.x + 150, y: j.y + (k - (terms.length - 1) / 2) * 120 };
          terminal(`t${k}`, at);
          segments.push(seg(`s${k + 2}`, fit('j'), port(`t${k}`, 'in'), j, at));
        });
        if (level.openEnd) {
          const o = { x: j.x, y: j.y - 150 };
          fittings.push({ id: 'o', pageIndex: 0, position: o, kind: 'junction' });
          segments.push(seg('s9', fit('j'), fit('o'), j, o));
        }
        if (level.equipment) {
          const at = { x: j.x, y: j.y + 150 };
          const eq = JSON.parse(JSON.stringify(base));
          eq.id = 'src';
          eq.category = 'equipment';
          eq.ports = [outPort];
          eq.transform = { ...eq.transform, position: placeAt(outPort, at) };
          stamps.push(eq);
          segments.push(seg('s8', fit('j'), port('src', 'out'), j, at));
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
      [level, H, type],
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
  check(uuids.every((u) => u) && new Set(uuids).size === levelSpecs.length, 'three documents with three ids', JSON.stringify(uuids));
  const building = {
    schemaVersion: 1,
    id: 'b-b7t09c2b',
    name: 'Tower',
    levels: [0, 1, 2].map((i) => ({ id: `l${i}`, name: `Level ${i}`, elevationMm: i * 3000 })),
    sheets: [0, 1, 2].map((i) => ({ id: `s${i}`, levelId: `l${i}`, projectUuid: uuids[i], pageIndex: 0, displayName: `Sheet ${i}`, location: { fileName: levelSpecs[i].name, path: levelSpecs[i].name } })),
    risers: [
      {
        id: 'r1', name: 'R1', networkTypeId: type.id, networkType: type, anchorMm: anchor, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0,
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
  const summaries = [];
  for (const i of [0, 1, 2]) {
    summaries.push(await page.evaluate(async (u) => (await window.__mepBuilding.store.readSummary(u)) ?? null, uuids[i]));
  }
  check(summaries.every((s) => s && Array.isArray(JSON.parse(s).riserNetworks)), 'three summaries with riserNetworks');
  return { uuids, summaries, building };
}
