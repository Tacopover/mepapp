// B8-T07: the arrowheads on segments follow the flow sense of the network type.
// Part 1: three levels from real PDFs, riser R1 (supply-air, supply) and R2 (return-air, return) with the same source (equipment on Level 0).
//   The arrowheads of the segments of both networks are read from the scene (the wing ends of the arrowhead graphics of the overlay layer) and from the rendered canvas pixels.
//   Supply: away from the source. Return: toward the source. The rings of the risers show their arrows next to them: the two agree.
//   The real type editor (select Flow direction, Save) flips the arrowheads at once, with the segment still selected.
// Part 2: networks whose type is not adopted (library value, else supply), a type of the document that overrides the library, and a network with no source (no arrowhead).
// Real DOM: Solve flow button, select tool and mouse clicks on segments, Shift-click, the type editor (swatch, select, Save).
// Setup (documents, project JSON, building file) uses the scene API and the dev hook only.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t07-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, waitMarks, screenOf, focusRings } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};

// ---------------------------------------------------------------- reading helpers
const midOf = (id) =>
  page.evaluate((id) => {
    const s = window.__mepSketchScene.exportProject().segments.find((x) => x.id === id);
    const a = s.geometry[0];
    const b = s.geometry[s.geometry.length - 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }, id);
async function clickSegment(id, { shift = false } = {}) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const at = await screenOf(page, await midOf(id));
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  if (shift) await page.keyboard.up('Shift');
  await idle(400);
}
async function solveFlowClick() {
  await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
  await idle(300);
  await page.locator('button.mep-icon-btn', { hasText: /Solve flow/ }).click();
  await idle(400);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(300);
}
/** The side of the arrowhead tip, read from the scene: the wings of the graphics lie on the side AWAY from the tip. 'none' when there is no graphics. */
const sceneSide = (id) =>
  page.evaluate((id) => {
    const scene = window.__mepSketchScene;
    const seg = scene.exportProject().segments.find((x) => x.id === id);
    const a = seg.geometry[0];
    const b = seg.geometry[seg.geometry.length - 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const g = scene.doc.flowLabelLayer.children.find((c) => !('text' in c));
    if (!g) return 'none';
    // The graphics holds the arrowheads of EVERY segment of the network. Read the wing ends of the arrowhead that starts at this midpoint.
    const wings = [];
    for (const ins of g.context.instructions) {
      const list = ins.data?.path?.instructions ?? [];
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].action === 'moveTo' && Math.hypot(list[i].data[0] - mid.x, list[i].data[1] - mid.y) < 0.01 && list[i + 1].action === 'lineTo') wings.push(list[i + 1].data[0]);
      }
    }
    if (wings.length === 0) return 'none';
    const avg = wings.reduce((s, x) => s + x, 0) / wings.length;
    return avg < mid.x ? 'east' : 'west';
  }, id);
/** The same read from the pixels of the rendered canvas: the flow layer color (0x00796b) near the midpoint. The wings lie on the side away from the tip. */
const pixelSide = async (id) => {
  const mid = await midOf(id);
  return page.evaluate((mid) => {
    const scene = window.__mepSketchScene;
    scene.app.renderer.render({ container: scene.app.stage });
    const c = scene.app.canvas;
    const g = scene.world.toGlobal(mid);
    const r = c.getBoundingClientRect();
    const k = c.width / r.width;
    const cx = Math.round(g.x * k);
    const cy = Math.round(g.y * k);
    const R = Math.round(24 * k);
    const Y = Math.round(7 * k);
    const off = document.createElement('canvas');
    off.width = c.width;
    off.height = c.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(c, 0, 0);
    const d = ctx.getImageData(cx - R, cy - Y, 2 * R, 2 * Y).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i]) < 45 && Math.abs(d[i + 1] - 121) < 45 && Math.abs(d[i + 2] - 107) < 45) {
        sum += ((i / 4) % (2 * R)) - R;
        n++;
      }
    }
    if (n < 3) return { side: 'none', n };
    return { side: sum / n < 0 ? 'east' : 'west', n, cx: Math.round((sum / n) * 10) / 10 };
  }, mid);
};
const sides = async (id, expected, what) => {
  const s = await sceneSide(id);
  const p = await pixelSide(id);
  check(s === expected, `${what}: scene read says the arrowhead points ${expected}`, `scene=${s}`);
  check(p.side === expected, `${what}: pixel read says the arrowhead points ${expected}`, JSON.stringify(p));
};
const viewAt = (z, x, yFromTop) =>
  page.evaluate(
    ([z, x, y]) => {
      const s = window.__mepSketchScene;
      const H = s.getDisplayedPageSize().heightPt;
      const r = s.app.canvas.getBoundingClientRect();
      s.world.scale.set(z);
      s.world.x = r.width / 2 - x * z;
      s.world.y = r.height / 2 - (H - y) * z;
      s.zoomBy(1);
    },
    [z, x, yFromTop],
  );

// ---------------------------------------------------------------- Part 1: supply and return, same source, with the riser rings
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await switchTo(t, 'l0.pdf');
{
  const r = await waitMarks(page, { rf: '2', rf2: '5' }, 4000);
  check(r.ok, 'level 0: the rings show pictogram 2 (supply goes up) and 5 (return comes down)', JSON.stringify(r.got));
}
await solveFlowClick();
// The source of both networks is above the junction j (x 450). Segment s1 runs from the riser fitting (x 300) to j. Segment s2 runs from j to the terminal (x 600).
await clickSegment('s1');
await sides('s1', 'west', 'supply-air s1 (riser fitting to junction): away from the source, toward the riser fitting');
await clickSegment('s2');
await sides('s2', 'east', 'supply-air s2 (junction to terminal): away from the source, toward the terminal');
await clickSegment('s12');
await sides('s12', 'east', 'return-air s12 (riser fitting to junction): toward the source');
await clickSegment('s22');
await sides('s22', 'west', 'return-air s22 (junction to terminal): toward the source');

// the two networks together, with the rings next to the arrowheads
await clickSegment('s1');
await clickSegment('s12', { shift: true });
await clickSegment('s2', { shift: true });
await clickSegment('s22', { shift: true });
{
  const n = await page.evaluate(() => [...window.__mepSketchScene.doc.selectedIds].length);
  check(n === 4, 'four segments are selected with Shift-click', String(n));
}
await snap('B8-T07-supply-and-return-with-rings');
await viewAt(2, 400, 410);
await idle(500);
await snap('B8-T07-supply-and-return-with-rings-zoom2');
await focusRings(page);

// ---------------------------------------------------------------- the type editor flips the arrowheads at once (real DOM)
const sel = () => page.locator(`${M} [data-testid=nt-flow-sense]`);
async function openEditor(name) {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
  await idle(400);
  await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
  await page.locator(M).waitFor({ timeout: 20000 });
  await idle(300);
}
async function flipTo(value) {
  await openEditor('Supply Air');
  await sel().selectOption(value);
  await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
  await idle(500);
}
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await clickSegment('s1');
await clickSegment('s12', { shift: true });
await sides('s1', 'west', 'before the flip: Supply Air s1 points away from the source');
await flipTo('return');
await sides('s1', 'east', 'after Flow direction = Return in the editor: s1 points toward the source, with no new click');
await sides('s12', 'east', 'after the flip: Return Air s12 is unchanged');
{
  const r = await waitMarks(page, { rf: '5', rf2: '5' }, 3000);
  check(r.ok, 'after the flip: the ring of R1 shows pictogram 5 (return), like R2', JSON.stringify(r.got));
}
await snap('B8-T07-after-flip-to-return');
await flipTo('supply');
await sides('s1', 'west', 'after Flow direction = Supply again: s1 points away from the source again');
{
  const r = await waitMarks(page, { rf: '2', rf2: '5' }, 3000);
  check(r.ok, 'after the second flip: the ring of R1 shows pictogram 2 again', JSON.stringify(r.got));
}
await snap('B8-T07-after-flip-back-to-supply');

// ---------------------------------------------------------------- Part 2: not adopted, document value over library value, no source
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
const nets = [
  { tag: 'A', typeId: 'return-air', source: true, expect: 'east', what: 'a type that is not adopted, library value return' },
  { tag: 'B', typeId: 'exotic-xyz', source: true, expect: 'west', what: 'a type that is not adopted and not in the library: supply' },
  { tag: 'C', typeId: 'chilled-water', source: true, expect: 'east', what: 'an adopted type with flowSense return over the library value supply' },
  { tag: 'D', typeId: 'exhaust-air', source: true, expect: 'west', what: 'an adopted type with flowSense supply over the library value return' },
  { tag: 'E', typeId: 'supply-air', source: false, expect: 'none', what: 'no source: no direction, no arrowhead' },
];
await page.evaluate(
  ([H, nets]) => {
    const scene = window.__mepSketchScene;
    const p = scene.exportProject();
    const base = JSON.parse(JSON.stringify(window.__base));
    delete base.routingTargets;
    delete base.autoPlaced;
    const sx = base.transform.scale?.x ?? 1;
    const sy = base.transform.scale?.y ?? 1;
    const placeAt = (port, at) => ({ x: at.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * base.nativeHeight * sy });
    const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
    const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
    const fit = (id) => ({ kind: 'fitting', fittingId: id });
    const prt = (elementId, portId) => ({ kind: 'port', elementId, portId });
    const stamps = [];
    const fittings = [];
    const segments = [];
    const caps = {};
    const stamp = (id, category, ports, port, at) => {
      const s = JSON.parse(JSON.stringify(base));
      s.id = id;
      s.category = category;
      s.ports = ports;
      s.transform = { ...s.transform, position: placeAt(port, at) };
      stamps.push(s);
    };
    const seg = (id, typeId, a, b, from, to) => ({ id, pageIndex: 0, networkTypeId: typeId, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
    nets.forEach((n, k) => {
      const y = H - 200 - 110 * k;
      const f = { x: 700, y };
      const j = { x: 850, y };
      const tm = { x: 1000, y };
      fittings.push({ id: `f${n.tag}`, pageIndex: 0, position: f, kind: 'junction' }, { id: `j${n.tag}`, pageIndex: 0, position: j, kind: 'tee' });
      segments.push(seg(`a${n.tag}`, n.typeId, fit(`f${n.tag}`), fit(`j${n.tag}`), f, j));
      stamp(`t${n.tag}`, 'terminal', [inPort], inPort, tm);
      caps[`t${n.tag}`] = 100;
      segments.push(seg(`b${n.tag}`, n.typeId, fit(`j${n.tag}`), prt(`t${n.tag}`, 'in'), j, tm));
      const up = { x: j.x, y: y - 70 };
      if (n.source) {
        stamp(`s${n.tag}`, 'equipment', [outPort], outPort, up);
        segments.push(seg(`c${n.tag}`, n.typeId, fit(`j${n.tag}`), prt(`s${n.tag}`, 'out'), j, up));
      } else {
        fittings.push({ id: `o${n.tag}`, pageIndex: 0, position: up, kind: 'junction' });
        segments.push(seg(`c${n.tag}`, n.typeId, fit(`j${n.tag}`), fit(`o${n.tag}`), j, up));
      }
    });
    const lib = (id, name, color, sense) => ({ id, name, discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color, lineWidthPt: 2, linePattern: 'solid', ...(sense ? { flowSense: sense } : {}) });
    p.stamps = stamps;
    p.segments = segments;
    p.fittings = fittings;
    p.portGroups = [];
    p.terminalCapacities = caps;
    // A and B are not adopted on purpose.
    p.networkTypes = [lib('chilled-water', 'Chilled Water', '#00bcd4', 'return'), lib('exhaust-air', 'Exhaust Air', '#78909c', 'supply'), lib('supply-air', 'Supply Air', '#2196f3', undefined)];
    scene.loadProjectFromJson(p);
  },
  [H, nets],
);
await idle(1200);
await viewAt(1, 900, 420);
await idle(400);
{
  const ids = await page.evaluate(() => window.__mepSketchScene.exportProject().networkTypes.map((x) => x.id));
  check(!ids.includes('return-air') && !ids.includes('exotic-xyz'), 'part 2 setup: return-air and exotic-xyz are not adopted by the document', JSON.stringify(ids));
}
await solveFlowClick();
for (const n of nets) {
  await clickSegment(`a${n.tag}`);
  if (n.expect === 'none') {
    const s = await sceneSide(`a${n.tag}`);
    const p = await pixelSide(`a${n.tag}`);
    check(s === 'none' && p.side === 'none', `${n.tag}: ${n.what}`, JSON.stringify({ s, p }));
  } else {
    await sides(`a${n.tag}`, n.expect, `${n.tag}: ${n.what}`);
  }
}
for (const n of nets) await clickSegment(`a${n.tag}`, { shift: n.tag !== 'A' });
await snap('B8-T07-types-not-adopted-and-overrides');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
