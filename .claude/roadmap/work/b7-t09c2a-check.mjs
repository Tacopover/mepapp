// B7-T09c-2a: Properties shows "at most" (no building, one PDF).
// Setup (the project JSON) uses the scene API only. Every read is the real Properties DOM. Every edit of a capacity is typed into the real Capacity input.
// Example 1 (plan buildings-b7-t09-open-ends.md): a T fitting, two open ends (oa, ob), one terminal t0 of 100, no source.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2a/';
const TYPE = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };
const DRAIN = { id: 'sanitary-waste', name: 'Sanitary Waste', discipline: 'plumbing', units: 'GPM', defaultCapacity: 10, color: '#6d4c41', lineWidthPt: 2, linePattern: 'solid' };
const HINT_A_AIR = 'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place source equipment to set the source.';
const HINT_L_AIR = 'This network has a loop and no source. The numbers use one start point. Place source equipment to set the source.';
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

/**
 * Setup: loads a project. `spec` has nodes as plain data:
 *   fittings: [{ id, x, y, kind }], stamps: [{ id, category, port: 'in'|'out', x, y, capacity }], segments: [{ id, a, b }] where a and b are 'f:<id>' or 's:<id>'.
 * The coordinates are offsets from the centre point C.
 */
async function load(spec, type = TYPE) {
  await page.evaluate(
    ([H, type, spec]) => {
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
      const C = { x: 400, y: H - 400 };
      const at = (o) => ({ x: C.x + o.x, y: C.y + o.y });
      const inPort = { id: 'in', name: 'In', fractionX: 0, fractionY: 0.5 };
      const outPort = { id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 };
      const placeAt = (port, point) => ({ x: point.x - (port.fractionX - 0.5) * base.nativeWidth * sx, y: point.y - (port.fractionY - 0.5) * base.nativeHeight * sy });
      const stamps = spec.stamps.map((st) => {
        const s = JSON.parse(JSON.stringify(base));
        const port = st.port === 'in' ? inPort : outPort;
        s.id = st.id;
        s.category = st.category;
        s.ports = [port];
        s.transform = { ...s.transform, position: placeAt(port, at(st)) };
        return s;
      });
      const fittings = spec.fittings.map((f) => ({ id: f.id, pageIndex: 0, position: at(f), kind: f.kind ?? 'junction' }));
      const pointOf = (ref) => {
        const [kind, id] = ref.split(':');
        return kind === 'f' ? at(spec.fittings.find((f) => f.id === id)) : at(spec.stamps.find((s) => s.id === id));
      };
      const endpoint = (ref) => {
        const [kind, id] = ref.split(':');
        if (kind === 'f') return { kind: 'fitting', fittingId: id };
        const st = spec.stamps.find((s) => s.id === id);
        return { kind: 'port', elementId: id, portId: st.port };
      };
      const segments = spec.segments.map((s) => ({
        id: s.id, pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200,
        endpointA: endpoint(s.a), endpointB: endpoint(s.b), geometry: [pointOf(s.a), pointOf(s.b)],
      }));
      p.stamps = stamps;
      p.segments = segments;
      p.fittings = fittings;
      p.portGroups = [];
      p.terminalCapacities = Object.fromEntries(spec.stamps.filter((s) => s.capacity !== undefined).map((s) => [s.id, s.capacity]));
      p.networkTypes = [type];
      scene.loadProjectFromJson(p);
    },
    [H, type, spec],
  );
  await idle(900);
}

/** Example 1. equipmentAt: 'oa' | 'ob' | null puts an equipment (no capacity) at that open end. */
const example1 = (capacity = 100, equipmentAt = null) => ({
  fittings: [
    { id: 'T', x: 0, y: 0, kind: 'tee' },
    ...(equipmentAt === 'oa' ? [] : [{ id: 'oa', x: -200, y: 0 }]),
    ...(equipmentAt === 'ob' ? [] : [{ id: 'ob', x: 0, y: 200 }]),
  ],
  stamps: [
    { id: 't0', category: 'terminal', port: 'in', x: 200, y: 0, capacity },
    ...(equipmentAt ? [{ id: 'src', category: 'equipment', port: 'out', x: equipmentAt === 'oa' ? -200 : 0, y: equipmentAt === 'oa' ? 0 : 200 }] : []),
  ],
  segments: [
    { id: 's1', a: equipmentAt === 'oa' ? 'f:T' : 'f:oa', b: equipmentAt === 'oa' ? 's:src' : 'f:T' },
    { id: 's2', a: 'f:T', b: equipmentAt === 'ob' ? 's:src' : 'f:ob' },
    { id: 's3', a: 'f:T', b: 's:t0' },
  ],
});

const posOf = (spec, ref) => {
  const [kind, id] = ref.split(':');
  return kind === 'f' ? spec.fittings.find((f) => f.id === id) : spec.stamps.find((s) => s.id === id);
};
async function pageCentre() {
  return page.evaluate((H) => ({ x: 400, y: H - 400 }), H);
}
async function clickOffset(o) {
  const c = await pageCentre();
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const at = await screenOf(page, { x: c.x + o.x, y: c.y + o.y });
  await page.mouse.click(at.x, at.y);
  await idle(450);
}
/** Click the middle of a segment (the offsets of the ends come from the spec). */
async function selectSegment(spec, id, f = 0.5) {
  const s = spec.segments.find((x) => x.id === id);
  const a = posOf(spec, s.a);
  const b = posOf(spec, s.b);
  await clickOffset({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
}
async function selectFitting(spec, id) {
  const f = posOf(spec, `f:${id}`);
  await clickOffset({ x: f.x, y: f.y });
}
const solvedField = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
const hintTexts = () => page.locator('[data-testid="props-at-most-hint"]').allInnerTexts();
const riserHintTexts = () => page.locator('[data-testid="props-segment-riser-hint"]').allInnerTexts();
const capacityInput = () => page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Capacity/ }) }).locator('input[type="number"]').first();
async function typeCapacity(value) {
  const input = capacityInput();
  await input.fill(String(value));
  await input.press('Enter');
  await idle(600);
}
async function solveFlowClick() {
  await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
  await idle(300);
  await page.locator('button.mep-icon-btn', { hasText: /Solve flow/ }).click();
  await idle(400);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(300);
}

// --- 1. Example 1: the three segments, the Properties field and the hint ---
let spec = example1();
await load(spec);
await solveFlowClick();
await selectSegment(spec, 's1');
check((await solvedField()) === 'at most 100', 'ex1 s1: the field reads "at most 100"', String(await solvedField()));
{
  const h = await hintTexts();
  check(h.length === 1 && h[0] === HINT_A_AIR, 'ex1 s1: Hint A shows once, with source equipment', JSON.stringify(h));
}
await snap('b7-t09c2a-ex1-segment');
await selectSegment(spec, 's2');
check((await solvedField()) === 'at most 100', 'ex1 s2: the field reads "at most 100"', String(await solvedField()));
check((await hintTexts()).length === 1, 'ex1 s2: Hint A shows');
await selectSegment(spec, 's3');
check((await solvedField()) === 'at most 100', 'ex1 s3 (main): the field reads "at most 100"', String(await solvedField()));
check((await hintTexts()).length === 1, 'ex1 s3: Hint A shows');

// --- 2. a fitting: the open end ob ---
await selectFitting(spec, 'ob');
check((await solvedField()) === 'at most 100', 'ex1 fitting ob: the field reads "at most 100"', String(await solvedField()));
check((await hintTexts()).length === 1 && (await hintTexts())[0] === HINT_A_AIR, 'ex1 fitting ob: Hint A shows', JSON.stringify(await hintTexts()));
check((await page.locator('[data-testid="props-riser-section"]').count()) === 0, 'ex1 fitting ob: no riser block');
await snap('b7-t09c2a-ex1-fitting');
await selectFitting(spec, 'T');
check((await solvedField()) === 'at most 100', 'ex1 fitting T: the field reads "at most 100"', String(await solvedField()));

// --- 3. several segments: all highest ---
{
  await selectSegment(spec, 's1');
  await page.keyboard.down('Shift');
  const b = posOf(spec, 'f:T');
  const c = await pageCentre();
  const at = await screenOf(page, { x: c.x + b.x, y: c.y + (posOf(spec, 'f:ob').y + b.y) / 2 });
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await idle(450);
  const count = await page.locator('b', { hasText: /2 segments selected/ }).count();
  check(count === 1, 'multi: two segments are selected', String(count));
  check((await solvedField()) === 'at most 100', 'multi: the field reads "at most 100"', String(await solvedField()));
  await snap('b7-t09c2a-ex1-multi');
}

// --- 4. type 250 in the real Capacity input of the terminal ---
await clickOffset({ x: 200, y: 0 });
await typeCapacity(250);
await selectSegment(spec, 's1');
check((await solvedField()) === 'at most 250', 'type 250: s1 reads "at most 250"', String(await solvedField()));
await selectSegment(spec, 's2');
check((await solvedField()) === 'at most 250', 'type 250: s2 reads "at most 250"', String(await solvedField()));

// --- 4b. width: a long value fits the input (the class mep-field-wide) ---
await clickOffset({ x: 200, y: 0 });
await typeCapacity(12345.67);
await selectSegment(spec, 's1');
{
  const m = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    const input = row.querySelector('input');
    return { value: input.value, scroll: input.scrollWidth, client: input.clientWidth, cls: input.className, title: input.title };
  });
  check(m.value === 'at most 12345.67' && m.scroll <= m.client && m.cls.includes('mep-field-wide') && m.title === m.value, 'width: "at most 12345.67" fits, has the wide class and a title', JSON.stringify(m));
  await snap('b7-t09c2a-ex1-wide');
}

// --- 5. settle: an equipment at oa (the end of s1) ---
spec = example1(250, 'oa');
await load(spec);
await solveFlowClick();
await selectSegment(spec, 's2');
check((await solvedField()) === '0', 'equipment: the dead open end s2 shows plain 0', String(await solvedField()));
check((await hintTexts()).length === 0, 'equipment: s2 has no hint');
await selectSegment(spec, 's1');
check((await solvedField()) === '250', 'equipment: s1 shows plain 250', String(await solvedField()));
check((await hintTexts()).length === 0, 'equipment: s1 has no hint');
await snap('b7-t09c2a-ex1b-settled');

// --- 6. K = 1 (a second terminal at ob): plain, no hint ---
spec = {
  fittings: [{ id: 'T', x: 0, y: 0, kind: 'tee' }, { id: 'oa', x: -200, y: 0 }],
  stamps: [{ id: 't0', category: 'terminal', port: 'in', x: 200, y: 0, capacity: 100 }, { id: 't1', category: 'terminal', port: 'in', x: 0, y: 200, capacity: 50 }],
  segments: [{ id: 's1', a: 'f:oa', b: 'f:T' }, { id: 's2', a: 'f:T', b: 's:t1' }, { id: 's3', a: 'f:T', b: 's:t0' }],
};
await load(spec);
await solveFlowClick();
await selectSegment(spec, 's1');
check((await solvedField()) === '150', 'K=1: s1 shows plain 150', String(await solvedField()));
check((await hintTexts()).length === 0, 'K=1: no hint');
await selectSegment(spec, 's2');
check((await solvedField()) === '50', 'K=1: s2 shows plain 50', String(await solvedField()));

// --- 7. a loop with no source: a plain number and Hint L ---
spec = {
  fittings: [{ id: 'f1', x: -100, y: 0, kind: 'tee' }, { id: 'f2', x: 100, y: 0 }, { id: 'f3', x: 0, y: 150 }],
  stamps: [{ id: 't0', category: 'terminal', port: 'in', x: -300, y: 0, capacity: 100 }],
  segments: [
    { id: 'r1', a: 'f:f1', b: 'f:f2' },
    { id: 'r2', a: 'f:f2', b: 'f:f3' },
    { id: 'r3', a: 'f:f3', b: 'f:f1' },
    { id: 'r0', a: 'f:f1', b: 's:t0' },
  ],
};
await load(spec);
await solveFlowClick();
await selectSegment(spec, 'r0', 0.25);
{
  const field = await solvedField();
  check(/^\d+(\.\d+)?$/.test(field ?? ''), 'loop: r0 shows a plain number (no "at most")', String(field));
  const h = await hintTexts();
  check(h.length === 1 && h[0] === HINT_L_AIR, 'loop: Hint L shows', JSON.stringify(h));
  await snap('b7-t09c2a-loop');
}

// --- 8. a drain: the rule applies, the source word is the same for a drain ---
spec = example1();
await load(spec, DRAIN);
await solveFlowClick();
await selectSegment(spec, 's1');
check((await solvedField()) === 'at most 100', 'drain: the field reads "at most 100"', String(await solvedField()));
{
  const h = await hintTexts();
  check(h.length === 1 && /Place source equipment to set the source\.$/.test(h[0]), 'drain: the hint says source equipment', JSON.stringify(h));
}

// --- 9. a fan coil unit (equipment with capacity above 0) at the end of a segment ---
// A cross F1 has p1 -> O1, p2 -> O2, q1 -> terminal (100), q2 -> fan coil unit (equipment, capacity 50).
spec = {
  fittings: [{ id: 'F1', x: 0, y: 0, kind: 'cross' }, { id: 'O1', x: -200, y: 0 }, { id: 'O2', x: 0, y: -200 }],
  stamps: [
    { id: 't0', category: 'terminal', port: 'in', x: 200, y: 0, capacity: 100 },
    { id: 'fcu', category: 'equipment', port: 'in', x: 0, y: 200, capacity: 50 },
  ],
  segments: [
    { id: 'p1', a: 'f:O1', b: 'f:F1' },
    { id: 'p2', a: 'f:F1', b: 'f:O2' },
    { id: 'q1', a: 'f:F1', b: 's:t0' },
    { id: 'q2', a: 'f:F1', b: 's:fcu' },
  ],
};
await load(spec);
await solveFlowClick();
const fcu = {};
for (const id of ['p1', 'p2', 'q1', 'q2']) {
  await selectSegment(spec, id);
  fcu[id] = await solvedField();
}
console.log('FCU values', JSON.stringify(fcu));
check(fcu.p1 === 'at most 150' && fcu.p2 === 'at most 150', 'fcu: the open-end segments read "at most 150" (the fan coil unit is demand, not a source)', JSON.stringify(fcu));
check(fcu.q1 === 'at most 100' && fcu.q2 === 'at most 50', 'fcu: q1 reads "at most 100" and the fan coil unit segment q2 reads "at most 50"', JSON.stringify(fcu));
check((await hintTexts()).length === 1, 'fcu: Hint A shows (no source)');
await snap('b7-t09c2a-fcu');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
