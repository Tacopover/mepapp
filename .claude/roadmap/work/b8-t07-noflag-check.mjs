// B8-T07 no-flag check: the production store (mepapp.realStore only; no devPlatform, no webLike). No building is open.
// Two networks with the same shape and the same source: Supply Air and Return Air. After Solve flow and a click on a segment,
// the arrowhead of the supply network points away from the source and the arrowhead of the return network points toward it.
// The real type editor (Flow direction, Save) flips the arrowhead at once.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t07-noflag-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/r3-lib.mjs';
import { screenOf } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
check((await page.evaluate(() => localStorage.getItem('mepapp.webLike'))) === null, 'webLike flag is not set');
await t.openPdf();
await placeOneStamp(t);

await page.evaluate(() => {
  const scene = window.__mepSketchScene;
  const H = scene.getDisplayedPageSize().heightPt;
  const p = scene.exportProject();
  const base = JSON.parse(JSON.stringify(p.stamps[0]));
  delete base.routingTargets;
  delete base.autoPlaced;
  const sx = base.transform.scale?.x ?? 1;
  const sy = base.transform.scale?.y ?? 1;
  const placeAt = (port, at) => ({ x: at.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * base.nativeHeight * sy });
  const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
  const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
  const fit = (id) => ({ kind: 'fitting', fittingId: id });
  const prt = (elementId, portId) => ({ kind: 'port', elementId, portId });
  const seg = (id, typeId, a, b, from, to) => ({ id, pageIndex: 0, networkTypeId: typeId, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
  const types = [
    { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid' },
    { id: 'return-air', name: 'Return Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#e53935', lineWidthPt: 2, linePattern: 'dashed' },
  ];
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
  types.forEach((ty, k) => {
    const y = H - 300 - 150 * k;
    const f = { x: 300, y };
    const j = { x: 450, y };
    const tm = { x: 600, y };
    const up = { x: 450, y: y - 70 };
    fittings.push({ id: `f${k}`, pageIndex: 0, position: f, kind: 'junction' }, { id: `j${k}`, pageIndex: 0, position: j, kind: 'tee' });
    segments.push(seg(`a${k}`, ty.id, fit(`f${k}`), fit(`j${k}`), f, j));
    stamp(`t${k}`, 'terminal', [inPort], inPort, tm);
    caps[`t${k}`] = 100;
    segments.push(seg(`b${k}`, ty.id, fit(`j${k}`), prt(`t${k}`, 'in'), j, tm));
    stamp(`s${k}`, 'equipment', [outPort], outPort, up);
    segments.push(seg(`c${k}`, ty.id, fit(`j${k}`), prt(`s${k}`, 'out'), j, up));
  });
  p.stamps = stamps;
  p.segments = segments;
  p.fittings = fittings;
  p.portGroups = [];
  p.terminalCapacities = caps;
  p.networkTypes = types;
  scene.loadProjectFromJson(p);
  const r = scene.app.canvas.getBoundingClientRect();
  const w = { x: 450, y: H - 375 };
  scene.world.scale.set(1);
  scene.world.x = r.width / 2 - w.x;
  scene.world.y = r.height / 2 - w.y;
  scene.zoomBy(1);
});
await idle(1200);

const midOf = (id) =>
  page.evaluate((id) => {
    const s = window.__mepSketchScene.exportProject().segments.find((x) => x.id === id);
    const a = s.geometry[0];
    const b = s.geometry[s.geometry.length - 1];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }, id);
async function clickSegment(id) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const at = await screenOf(page, await midOf(id));
  await page.mouse.click(at.x, at.y);
  await idle(400);
}
const side = (id) =>
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

await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(300);
await page.locator('button.mep-icon-btn', { hasText: /Solve flow/ }).click();
await idle(400);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(300);

await clickSegment('a0');
check((await side('a0')) === 'west', 'Supply Air: the arrowhead on the segment next to the junction points away from the source (west)', await side('a0'));
await shot('B8-T07-noflag-supply');
await clickSegment('a1');
check((await side('a1')) === 'east', 'Return Air: the arrowhead points toward the source (east)', await side('a1'));
await shot('B8-T07-noflag-return');

// the real editor flips it at once (Return Air -> Supply)
await clickSegment('a1');
await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
await idle(400);
await page.locator('.mep-networktype-tile', { hasText: /^\s*Return Air/ }).first().locator('button[title="Edit"]').click();
await page.locator(M).waitFor({ timeout: 20000 });
await page.locator(`${M} [data-testid=nt-flow-sense]`).selectOption('supply');
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(500);
check((await side('a1')) === 'west', 'after Flow direction = Supply in the editor: the Return Air arrowhead flips at once (west)', await side('a1'));
await shot('B8-T07-noflag-after-flip');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
