// B7-T09c-2a review: width of the "at most" input, layout jump, contrast of the muted hint, at dock 420 and 280, viewport 1600/1100/760.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2a-review/';
const LONG80 = 'Supply Air Main Trunk Duct Of The East Wing Of The Building Level Three North 0042';
const TYPE = { id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#2196f3', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'm³/h' };
const t = await open({ width: 1600, height: 1000 });
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
      p.stamps = stamps;
      p.segments = spec.segments.map((s) => ({
        id: s.id, pageIndex: 0, networkTypeId: type.id, shape: 'round', diameter: 200,
        endpointA: endpoint(s.a), endpointB: endpoint(s.b), geometry: [pointOf(s.a), pointOf(s.b)],
      }));
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
const example1 = (capacity = 100) => ({
  fittings: [{ id: 'T', x: 0, y: 0, kind: 'tee' }, { id: 'oa', x: -200, y: 0 }, { id: 'ob', x: 0, y: 200 }],
  stamps: [{ id: 't0', category: 'terminal', port: 'in', x: 200, y: 0, capacity }],
  segments: [{ id: 's1', a: 'f:oa', b: 'f:T' }, { id: 's2', a: 'f:T', b: 'f:ob' }, { id: 's3', a: 'f:T', b: 's:t0' }],
});
const posOf = (spec, ref) => {
  const [kind, id] = ref.split(':');
  return kind === 'f' ? spec.fittings.find((f) => f.id === id) : spec.stamps.find((s) => s.id === id);
};
async function clickOffset(o) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const at = await screenOf(page, { x: 400 + o.x, y: H - 400 + o.y });
  await page.mouse.click(at.x, at.y);
  await idle(450);
}
async function selectSegment(spec, id) {
  const s = spec.segments.find((x) => x.id === id);
  const a = posOf(spec, s.a);
  const b = posOf(spec, s.b);
  await clickOffset({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}
async function typeCapacity(value) {
  const input = page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Capacity/ }) }).locator('input[type="number"]').first();
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
const measure = () =>
  page.evaluate(() => {
    const dock = document.querySelector('.mep-dock');
    const dr = dock.getBoundingClientRect();
    const rows = [...dock.querySelectorAll('.mep-field-row')];
    const row = rows.find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent.trim() ?? ''));
    const inp = row?.querySelector('input');
    const lab = row?.querySelector('label');
    const netRow = rows.find((r) => /^network type/i.test(r.querySelector('label')?.textContent.trim() ?? ''));
    const lenRow = rows.find((r) => /^length/i.test(r.querySelector('label')?.textContent.trim() ?? ''));
    const shapeRow = rows.find((r) => /^shape/i.test(r.querySelector('label')?.textContent.trim() ?? ''));
    const hint = dock.querySelector('[data-testid="props-at-most-hint"]');
    const rect = (e) => (e ? e.getBoundingClientRect() : null);
    const ir = rect(inp);
    const lr = rect(lab);
    const body = document.querySelector('.mep-dock-body');
    const overflowing = [...dock.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > dr.right + 1 && e.getBoundingClientRect().width > 0).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`).slice(0, 5);
    return {
      dockW: Math.round(dr.width),
      value: inp?.value,
      inputW: inp?.clientWidth,
      scrollW: inp?.scrollWidth,
      cut: inp ? inp.scrollWidth > inp.clientWidth : null,
      inputRight: ir ? Math.round(ir.right) : null,
      shapeSelRight: shapeRow ? Math.round(shapeRow.querySelector('select').getBoundingClientRect().right) : null,
      lenInputRight: lenRow ? Math.round(lenRow.querySelector('input').getBoundingClientRect().right) : null,
      labelH: lr ? Math.round(lr.height) : null,
      labelW: lr ? Math.round(lr.width) : null,
      rowH: row ? Math.round(rect(row).height) : null,
      hintH: hint ? Math.round(rect(hint).height) : 0,
      hintTop: hint ? Math.round(rect(hint).top) : null,
      lenTop: lenRow ? Math.round(rect(lenRow).top) : null,
      solvedTop: row ? Math.round(rect(row).top) : null,
      netTop: netRow ? Math.round(rect(netRow).top) : null,
      bodyHScroll: body ? body.scrollWidth > body.clientWidth + 1 : null,
      dockHScroll: dock.scrollWidth > dock.clientWidth + 1,
      overflowing,
    };
  });

// --- default dock: contrast of the muted hint and of the disabled value ---
let spec = example1();
await load(spec);
await solveFlowClick();
await selectSegment(spec, 's1');
const contrast = await page.evaluate(() => {
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1]; };
  const bgOf = (el) => { let e = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0.9) return c.slice(0, 3); e = e.parentElement; } return [255, 255, 255]; };
  const hint = document.querySelector('[data-testid="props-at-most-hint"]');
  const hc = parse(getComputedStyle(hint).color).slice(0, 3);
  const hb = bgOf(hint);
  const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label').textContent.trim()));
  const inp = row.querySelector('input');
  const ic = parse(getComputedStyle(inp).color).slice(0, 3);
  const op = parseFloat(getComputedStyle(inp).opacity);
  const ib = bgOf(row);
  const eff = ic.map((c, i) => c * op + ib[i] * (1 - op));
  return { hintColor: hc, hintBg: hb, hintRatio: +ratio(hc, hb).toFixed(2), hintFont: getComputedStyle(hint).fontSize, valueColor: ic, valueOpacity: op, valueEffective: eff.map(Math.round), valueRatio: +ratio(eff, ib).toFixed(2), valueFont: getComputedStyle(inp).fontSize };
});
console.log('CONTRAST', JSON.stringify(contrast));
console.log('DEFAULT 100', JSON.stringify(await measure()));
await snap('review-default-100');

// --- layout jump: with the hint and with the hint gone (equipment) ---
const withHint = await measure();
spec = { ...example1(), stamps: [...example1().stamps, { id: 'src', category: 'equipment', port: 'out', x: -200, y: 0 }], fittings: example1().fittings.filter((f) => f.id !== 'oa'), segments: [{ id: 's1', a: 's:src', b: 'f:T' }, { id: 's2', a: 'f:T', b: 'f:ob' }, { id: 's3', a: 'f:T', b: 's:t0' }] };
await load(spec);
await solveFlowClick();
await selectSegment(spec, 's2');
const noHint = await measure();
console.log('JUMP withHint netTop', withHint.netTop, 'noHint netTop', noHint.netTop, 'solvedTop', withHint.solvedTop, noHint.solvedTop);
check(withHint.solvedTop === noHint.solvedTop && withHint.lenTop === noHint.lenTop, 'rows above the hint do not move', JSON.stringify({ withHint, noHint }));

// --- values at dock 420 ---
spec = example1();
const values = ['100', '12345.67', '0.30000000000000004', '1234567.891'];
for (const v of values) {
  await load(spec);
  await solveFlowClick();
  await clickOffset({ x: 200, y: 0 });
  await typeCapacity(v);
  await selectSegment(spec, 's1');
  const m = await measure();
  console.log('DOCK420', v, JSON.stringify(m));
  check(!m.cut, `dock 420: "${m.value}" is not cut`, JSON.stringify(m));
  if (v === '0.30000000000000004') await snap('review-420-rawfloat');
}

// --- narrow dock: drag the handle ---
const handle = await page.evaluate(() => { const r = document.querySelector('.mep-resize-handle').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 300, handle.y, { steps: 12 });
await page.mouse.up();
await idle(400);
for (const v of values) {
  await load(spec);
  await solveFlowClick();
  await clickOffset({ x: 200, y: 0 });
  await typeCapacity(v);
  await selectSegment(spec, 's1');
  const m = await measure();
  console.log('DOCK280', v, JSON.stringify(m));
  check(m.dockW <= 285, `narrow dock is ${m.dockW}`, '');
  check(!m.cut, `dock 280: "${m.value}" is not cut`, JSON.stringify(m));
  check(m.labelH < 20, `dock 280: label of "${m.value}" is one line`, JSON.stringify(m));
  if (v === '12345.67') await snap('review-280-12345');
  if (v === '0.30000000000000004') await snap('review-280-rawfloat');
}

// --- viewport 1100 and 760 at the narrow dock, value 12345.67 ---
await load(spec);
await solveFlowClick();
await clickOffset({ x: 200, y: 0 });
await typeCapacity('12345.67');
await selectSegment(spec, 's1');
for (const [w, h] of [[1100, 800], [760, 640]]) {
  await page.setViewportSize({ width: w, height: h });
  await idle(400);
  const m = await measure();
  console.log(`VIEWPORT ${w} dock280`, JSON.stringify(m));
  check(!m.cut && m.labelH < 20, `viewport ${w}, dock 280: not cut, label one line`, JSON.stringify(m));
  await snap(`review-vp${w}-dock280`);
}
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(300);

// --- long network type name (80 characters) at dock 280 ---
await page.evaluate(([n]) => { const sc = window.__mepSketchScene; const p = sc.exportProject(); p.networkTypes.find((x) => x.id === 'supply-air').name = n; sc.loadProjectFromJson(p); }, [LONG80]);
await idle(900);
await solveFlowClick();
await selectSegment(spec, 's1');
{
  const m = await measure();
  console.log('LONGNAME dock280', JSON.stringify(m));
  await snap('review-280-longname');
}
// does the long name overflow on master too (a segment with no hint)?
await selectSegment({ ...spec }, 's3');
{
  const m = await measure();
  console.log('LONGNAME dock280 s3', JSON.stringify(m));
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
