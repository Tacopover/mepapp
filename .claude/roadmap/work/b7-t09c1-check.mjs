// B7-T09c-1: the scene read model, the call and the overlay.
// Example 1 (plan buildings-b7-t09-open-ends.md): a T fitting, two open ends, one terminal of 100, no source.
// Setup (the project JSON, the riser marks, the spy on the solve) uses the scene API only. Reading uses the real DOM (the Properties panel field) and the overlay layer of the scene.
// The Solve flow button and the segment selection are real clicks.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c1/';
const TYPE = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await t.openPdf();
await placeOneStamp(t);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};

/** Setup: loads the Example 1 project. withEquipment: the open end `ob` becomes an equipment stamp (a source). */
async function build(withEquipment) {
  await page.evaluate(
    ([H, type, withEquipment]) => {
      const scene = window.__mepSketchScene;
      if (!window.__base) {
        const base = JSON.parse(JSON.stringify(scene.exportProject().stamps[0]));
        delete base.routingTargets;
        delete base.autoPlaced;
        window.__base = base;
      }
      const base = window.__base;
      const p = scene.exportProject();
      const sx = base.transform.scale?.x ?? 1;
      const sy = base.transform.scale?.y ?? 1;
      const placeAt = (port, at) => ({ x: at.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: at.y - (port.fractionY - 0.5) * base.nativeHeight * sy });
      const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
      const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
      const T = { x: 400, y: H - 400 };
      const oa = { x: T.x - 200, y: T.y };
      const ob = { x: T.x, y: T.y - 200 };
      const tAt = { x: T.x + 200, y: T.y };
      const fit = (id) => ({ kind: 'fitting', fittingId: id });
      const port = (elementId, portId) => ({ kind: 'port', elementId, portId });
      const seg = (id, a, b, from, to) => ({ id, pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200, endpointA: a, endpointB: b, geometry: [from, to] });
      const stamp = (id, category, ports, port, at) => {
        const s = JSON.parse(JSON.stringify(base));
        s.id = id;
        s.category = category;
        s.ports = ports;
        s.transform = { ...s.transform, position: placeAt(port, at) };
        return s;
      };
      const stamps = [stamp('t0', 'terminal', [inPort], inPort, tAt)];
      const fittings = [
        { id: 'T', pageIndex: 0, position: T, kind: 'tee' },
        { id: 'oa', pageIndex: 0, position: oa, kind: 'junction' },
      ];
      const segments = [seg('s1', fit('oa'), fit('T'), oa, T), seg('s3', fit('T'), port('t0', 'in'), T, tAt)];
      if (withEquipment) {
        stamps.push(stamp('src', 'equipment', [outPort], outPort, ob));
        segments.push(seg('s2', fit('T'), port('src', 'out'), T, ob));
      } else {
        fittings.push({ id: 'ob', pageIndex: 0, position: ob, kind: 'junction' });
        segments.push(seg('s2', fit('T'), fit('ob'), T, ob));
      }
      p.stamps = stamps;
      p.segments = segments;
      p.fittings = fittings;
      p.portGroups = [];
      p.terminalCapacities = { t0: 100 };
      p.networkTypes = [type];
      scene.loadProjectFromJson(p);
    },
    [H, TYPE, withEquipment],
  );
  await idle(900);
}
const midOf = (id) => page.evaluate((id) => {
  const s = window.__mepSketchScene.exportProject().segments.find((x) => x.id === id);
  const a = s.geometry[0];
  const b = s.geometry[s.geometry.length - 1];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}, id);
async function selectSegment(id) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const at = await screenOf(page, await midOf(id));
  await page.mouse.click(at.x, at.y);
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
const solvedField = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
/** The overlay layer: the label texts and the count of arrowhead graphics. */
const overlay = () =>
  page.evaluate(() => {
    const layer = window.__mepSketchScene.doc.flowLabelLayer;
    const texts = layer.children.filter((c) => 'text' in c).map((c) => c.text).sort();
    const graphics = layer.children.filter((c) => !('text' in c)).length;
    return { texts, graphics };
  });
const result = () => page.evaluate(() => {
  const r = window.__mepSketchScene.getFlowResult()?.[0];
  return r ? { seg: r.segmentCapacity, dir: r.segmentDirection, noSource: r.noSource ?? null, resolved: r.resolved } : null;
});
const info = (id) => page.evaluate((id) => {
  const scene = window.__mepSketchScene;
  return { seg: scene.getSelectedSegmentInfo(), fit: scene.getSelectedFittingInfo?.() ?? null };
}, id);
const solveCount = () => page.evaluate(() => window.__solves);

// spy on the solve
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  window.__solves = 0;
  const original = s.recomputeFlow.bind(s);
  s.recomputeFlow = () => {
    window.__solves += 1;
    return original();
  };
});

// --- 1. Example 1: T, two open ends, terminal 100, no source ---
await build(false);
await solveFlowClick();
await selectSegment('s1');
{
  const r = await result();
  check(r && r.resolved && r.noSource === 'highest', 'ex1: the result is resolved and says noSource highest', JSON.stringify(r));
  check(r && r.seg.s1 === 100 && r.seg.s2 === 100 && r.seg.s3 === 100, 'ex1: all three segments show 100', JSON.stringify(r?.seg));
  check(r && Object.values(r.dir).every((d) => d === null), 'ex1: every direction is null', JSON.stringify(r?.dir));
  const o = await overlay();
  check(JSON.stringify(o.texts) === JSON.stringify(['100', '100', '100']), 'ex1: the overlay shows the number 100 on the three segments', JSON.stringify(o));
  check(o.graphics === 0, 'ex1: the overlay has no arrowhead', JSON.stringify(o));
  check((await solvedField()) === 'at most 100', 'ex1: the Properties field of the selected open-end segment shows at most 100', String(await solvedField()));
  const i = await info('s1');
  check(i.seg && i.seg.solvedCapacity === 100 && i.seg.solvedNoSource === 'highest', 'ex1: SegmentInfo has solvedCapacity 100 and solvedNoSource highest', JSON.stringify(i.seg));
  await snap('b7-t09c1-1-example1-no-arrowhead');
}
await selectSegment('s2');
check(JSON.stringify((await overlay()).texts) === JSON.stringify(['100', '100', '100']) && (await solvedField()) === 'at most 100', 'ex1: the second open-end segment shows at most 100 too', String(await solvedField()));

// --- 2. a fitting reads solvedNoSource too (real click on the T fitting) ---
{
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const at = await screenOf(page, { x: 400, y: H - 400 });
  await page.mouse.click(at.x, at.y);
  await idle(400);
  const fit = await page.evaluate(() => window.__mepSketchScene.getSelectedFittingInfo());
  check(fit && fit.id === 'T' && fit.solvedCapacity === 100 && fit.solvedNoSource === 'highest', 'fitting: FittingInfo of T has solvedCapacity 100 and solvedNoSource highest', JSON.stringify(fit));
  check((await solvedField()) === 'at most 100', 'fitting: the Properties field of the fitting shows at most 100', String(await solvedField()));
}

// --- 3. riser marks: a marked fitting is never an open end (D-B-102); the keys decide when the solve runs ---
await selectSegment('s2');
await solveFlowClick();
await selectSegment('s2');
{
  const before = await solveCount();
  await page.evaluate(() => window.__mepSketchScene.setRiserMarks(new Map([['oa', { riserId: 'r1', name: 'R1', networkTypeId: 'supply-air', anchorPt: { x: 200, y: 200 } }]])));
  await idle(200);
  const r = await result();
  check((await solveCount()) === before + 1, 'marks: a new key runs one solve', `solves ${before} -> ${await solveCount()}`);
  check(r && r.noSource === null && r.seg.s1 === 0 && r.seg.s2 === 100 && r.seg.s3 === 100, 'marks: with oa marked K is 1 (ob is the only source): plain numbers, the dead end oa shows 0, no noSource', JSON.stringify(r));
  const o = await overlay();
  check(o.graphics === 0 && o.texts.length === 3, 'marks: the overlay still has no arrowhead (null direction)', JSON.stringify(o));
  const mid = await solveCount();
  await page.evaluate(() => window.__mepSketchScene.setRiserMarks(new Map([['oa', { riserId: 'r1', name: 'R1 renamed', networkTypeId: 'supply-air', anchorPt: { x: 210, y: 210 } }]])));
  await idle(200);
  check((await solveCount()) === mid, 'marks: the same keys run no solve', `solves ${mid} -> ${await solveCount()}`);
  await page.evaluate(() => window.__mepSketchScene.setRiserMarks(new Map()));
  await idle(200);
  const back = await result();
  check((await solveCount()) === mid + 1 && back && back.noSource === 'highest', 'marks: removing the key runs one solve and K is 2 again', `solves ${await solveCount()} ${JSON.stringify(back)}`);
}

// --- 4. an equipment at one open end: the old rule and the old arrow ---
await build(true);
await solveFlowClick();
await selectSegment('s1');
{
  const r = await result();
  check(r && r.noSource === null && r.resolved, 'equipment: the result has no noSource', JSON.stringify(r));
  check(r && r.seg.s1 === 0 && r.seg.s2 === 100 && r.seg.s3 === 100, 'equipment: the dead open end shows 0, the others 100 (the old rule)', JSON.stringify(r?.seg));
  check(r && Object.values(r.dir).every((d) => d === 'AtoB' || d === 'BtoA'), 'equipment: every direction is set', JSON.stringify(r?.dir));
  const o = await overlay();
  check(o.graphics === 1 && o.texts.length === 3, 'equipment: the arrowhead graphics returns and the three numbers show', JSON.stringify(o));
  const i = await info('s1');
  check(i.seg && i.seg.solvedNoSource === undefined && !('solvedNoSource' in i.seg), 'equipment: SegmentInfo has no solvedNoSource key', JSON.stringify(i.seg));
  await snap('b7-t09c1-2-equipment-arrow');
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
