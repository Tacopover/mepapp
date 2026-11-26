// B8-T04 check: the riser arrows at a ring (render only). The UI does not give arrows yet (T05), so the setup uses the scene API:
// loadProjectFromJson (fittings and segments), setRiserMarks, setRiserAnchors. Reading uses pixels of real screenshots and the scene read API.
// The zoom steps use the real mouse wheel. There is no input control in this task.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t04-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check, idle, shot } = t;
await t.start();
await t.openPdf();

const TYPES = [
  { id: 'nt-solid', name: 'Solid red', color: '#e53935', linePattern: 'solid' },
  { id: 'nt-dashed', name: 'Dashed green', color: '#2e7d32', linePattern: 'dashed' },
  { id: 'nt-dotted', name: 'Dotted blue', color: '#1565c0', linePattern: 'dotted' },
  { id: 'nt-dashdot', name: 'Dash dot orange', color: '#ef6c00', linePattern: 'dashDot' },
  { id: 'nt-longdash', name: 'Long dash teal', color: '#00838f', linePattern: 'longDash' },
  { id: 'nt-dashdotdot', name: 'Dash dot dot brown', color: '#6d4c41', linePattern: 'dashDotDot' },
].map((x) => ({ ...x, discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, lineWidthPt: 2 }));
const PICT = [
  { below: 'up', above: 'up' }, { below: 'none', above: 'up' }, { below: 'up', above: 'none' }, { below: 'down', above: 'down' },
  { below: 'none', above: 'down' }, { below: 'down', above: 'none' }, { below: 'down', above: 'up' }, { below: 'up', above: 'down' },
];
const U = { x: 0.5, y: -Math.sqrt(3) / 2 };
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Marked fittings, with type colors and a pair. `rings`: { id, x, y, pair, type, label }. */
async function setup({ rings, anchors }) {
  await page.evaluate(
    async ([types, rings, anchors]) => {
      const scene = window.__mepSketchScene;
      const p = scene.exportProject();
      p.stamps = [];
      p.terminalCapacities = {};
      p.portGroups = [];
      p.networkTypes = types;
      p.fittings = rings.map((r) => ({ id: r.id, pageIndex: 0, position: { x: r.x, y: r.y }, kind: 'junction' }));
      p.segments = [];
      types.forEach((ty, i) => {
        const y = 40 + i * 12;
        p.fittings.push({ id: `sa${i}`, pageIndex: 0, position: { x: 10, y }, kind: 'junction' }, { id: `sb${i}`, pageIndex: 0, position: { x: 60, y }, kind: 'junction' });
        p.segments.push({ id: `seg${i}`, pageIndex: 0, networkTypeId: ty.id, shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: `sa${i}` }, endpointB: { kind: 'fitting', fittingId: `sb${i}` }, geometry: [{ x: 10, y }, { x: 60, y }] });
      });
      await scene.loadProjectFromJson(p);
    },
    [TYPES, rings, anchors],
  );
  await idle(700);
}

/** marks: array of { id, x, y, pair, type, color?: bool, undecided }, anchors: array of { id, x, y, pair, type, label } */
async function setMarks(rings, anchors, { withColor = true } = {}) {
  await page.evaluate(
    ([types, rings, anchors, withColor]) => {
      const scene = window.__mepSketchScene;
      const tOf = (id) => types.find((x) => x.id === id);
      const marks = new Map(rings.map((r) => [r.id, { riserId: `r-${r.id}`, name: r.id, networkTypeId: r.type, anchorPt: { x: r.x, y: r.y }, ...(r.undecided ? { undecided: true } : {}), ...(r.pair ? { arrows: r.pair } : {}), ...(withColor && r.pair ? { arrowColor: tOf(r.type).color, arrowPattern: tOf(r.type).linePattern } : {}) }]));
      scene.setRiserMarks(marks);
      scene.setRiserAnchors(anchors.map((a) => ({ riserId: a.id, label: a.label ?? `Riser ${a.id}`, networkTypeId: a.type, networkTypeName: tOf(a.type).name, anchorPt: { x: a.x, y: a.y }, ...(a.pair ? { arrows: a.pair } : {}), ...(withColor && a.pair ? { arrowColor: tOf(a.type).color, arrowPattern: tOf(a.type).linePattern } : {}) })));
    },
    [TYPES, rings, anchors, withColor],
  );
  await idle(300);
}

/** Setup of the view: zoom z with world point (wx, wy) at the screen point (sx, sy) of the canvas. */
async function view(z, wx, wy, sx, sy) {
  await page.evaluate(([z, wx, wy, sx, sy]) => {
    const s = window.__mepSketchScene;
    s.world.scale.set(z);
    s.world.x = sx - wx * z;
    s.world.y = sy - wy * z;
    s.zoomBy(1);
  }, [z, wx, wy, sx, sy]);
  await idle(300);
}
const screenOf = (p) => page.evaluate((p) => {
  const s = window.__mepSketchScene;
  const g = s.world.toGlobal(p);
  const r = s.app.canvas.getBoundingClientRect();
  return { x: r.left + g.x, y: r.top + g.y };
}, p);
const zoomOf = () => page.evaluate(() => window.__mepSketchScene.getZoom());
const canvasBox = () => page.evaluate(() => { const r = window.__mepSketchScene.app.canvas.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });

/** One screenshot decoded in the page; pixel(points) reads the colors. */
async function grab() {
  const buf = await page.screenshot();
  await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    window.__grab = ctx;
  }, buf.toString('base64'));
}
/** The pixel color near (x, y) that is closest to the hex color (a 5 x 5 area, the line is 2 px wide). Returns the distance (0 = exact). */
const distTo = (pts, hex, r = 2) => page.evaluate(([pts, rgb, r]) => pts.map((p) => {
  let best = 999;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const d = window.__grab.getImageData(Math.round(p.x) + dx, Math.round(p.y) + dy, 1, 1).data;
    best = Math.min(best, Math.hypot(d[0] - rgb[0], d[1] - rgb[1], d[2] - rgb[2]));
  }
  return best;
}), [pts, hexRgb(hex), r]);
const COLOR_TOL = 70;

async function clipShot(name, clip) {
  const path = `${process.env.MEPAPP_SHOTS ?? '/tmp/mepapp-shots'}/${name}.png`;
  await page.screenshot({ path, clip });
  console.log(`SHOT ${path}`);
}

// ---------------------------------------------------------------- 1. eight pictograms, free anchors and marked fittings, three colors and patterns
const rings = PICT.map((pair, i) => ({ id: `f${i + 1}`, x: 130 + i * 130, y: 160, pair, type: TYPES[i % 3].id }));
const anchors = PICT.map((pair, i) => ({ id: `a${i + 1}`, x: 130 + i * 130, y: 420, pair, type: TYPES[i % 3].id, label: `Riser ${i + 1}` }));
await setup({ rings, anchors });
await setMarks(rings, anchors);
const box = await canvasBox();
await view(1, 585, 290, box.width / 2, box.height / 2);
check(Math.abs((await zoomOf()) - 1) < 1e-6, 'zoom is 1 for step 1', String(await zoomOf()));
const baseline = {};
{
  await grab();
  // For each pictogram, sample the middle of each arrow shaft: center +/- u * (R + 25), R = 6 + 3 for a marked ring and 6 + 8 for an anchor, at zoom 1.
  let bad = [];
  for (const [kind, list, R] of [['ring', rings, 9], ['anchor', anchors, 14]]) {
    for (const r of list) {
      const typ = TYPES.find((x) => x.id === r.type);
      const mid = (s) => ({ x: r.x + s * U.x * (R + 25), y: r.y + s * U.y * (R + 25) });
      const pts = [mid(1), mid(-1)];
      const screen = await Promise.all(pts.map(screenOf));
      const dist = await distTo(screen, typ.color);
      // A dashed or dotted shaft can have a gap at this exact point: use the sample at 4 shifted points along the axis and accept one hit.
      const near = [];
      for (const [i, side] of [[0, 'above'], [1, 'below']]) {
        let hit = false;
        for (const shift of [0, 2, 4, 6, 8, 10]) {
          const sgn = i === 0 ? 1 : -1;
          const s = await screenOf({ x: r.x + sgn * U.x * (R + 25 + shift), y: r.y + sgn * U.y * (R + 25 + shift) });
          const [d] = await distTo([s], typ.color);
          if (d < COLOR_TOL) hit = true;
        }
        near.push(hit);
        const wantArrow = r.pair[side] !== 'none';
        if (hit !== wantArrow) bad.push(`${kind} ${r.id} ${side}: arrow ${hit} want ${wantArrow}`);
      }
    }
  }
  check(bad.length === 0, 'step 1: every arrow side of the 8 pictograms (marked and free) shows the type color in the middle of its shaft, and a side with none shows nothing', bad.join(' | '));
  await shot('B8-T04-pictograms');
  const c = await canvasBox();
  await clipShot('B8-T04-pictograms-marked', { x: c.x, y: c.y + 190, width: c.width, height: 250 });
  await clipShot('B8-T04-pictograms-free', { x: c.x, y: c.y + 450, width: c.width, height: 250 });
}

// ---------------------------------------------------------------- 2. no arrows: the same drawing as before
{
  const clip = async () => { const c = await canvasBox(); return page.screenshot({ clip: { x: c.x, y: c.y, width: c.width, height: c.height } }); };
  const plainRings = rings.map((r) => ({ ...r, pair: undefined }));
  const plainAnchors = anchors.map((r) => ({ ...r, pair: undefined }));
  await setMarks(plainRings, plainAnchors);
  const a = await clip();
  await setMarks(rings.map((r) => ({ ...r, pair: { below: 'none', above: 'none' } })), anchors.map((r) => ({ ...r, pair: { below: 'none', above: 'none' } })));
  const b = await clip();
  await setMarks(rings, anchors, { withColor: false });
  const cNoColor = await clip();
  await setMarks(rings, anchors);
  const d = await clip();
  check(a.equals(b), 'step 2: a pair (none, none) draws the same pixels as no pair');
  check(a.equals(cNoColor), 'step 2: a pair with no color draws the same pixels as no pair');
  check(!a.equals(d), 'step 2: a pair with a color draws different pixels');
  await grab();
  const s = await screenOf({ x: rings[0].x, y: rings[0].y });
  const ringPurple = await distTo([{ x: s.x + 9, y: s.y }], '#7c4dff');
  check(ringPurple[0] < 80, 'step 2: the ring is still drawn in purple at radius 9 (marked ring, zoom 1)', String(ringPurple[0]));
}

// ---------------------------------------------------------------- 3. the size scales with the zoom (zoom 1 and 4 and 0.25 with the real mouse wheel)
{
  const one = [{ id: 'f1', x: 400, y: 400, pair: PICT[0], type: 'nt-solid' }];
  await setup({ rings: one, anchors: [] });
  await setMarks(one, []);
  const typ = TYPES[0];
  const probe = async (z, label) => {
    const R = 6 + 3 / z;
    const at = (d) => ({ x: 400 + U.x * d, y: 400 + U.y * d });
    await grab();
    const inside = await distTo([await screenOf(at(R + 20))], typ.color);
    const beyond = await distTo([await screenOf(at(R + 64 + 4))], typ.color);
    const beyondBelow = await distTo([await screenOf({ x: 400 - U.x * (R + 64 + 4), y: 400 - U.y * (R + 64 + 4) })], typ.color);
    const nearEnd = await distTo([await screenOf(at(R + 64 - 3))], typ.color);
    check(inside[0] < COLOR_TOL, `step 3: zoom ${label}: the shaft is at ring edge + 20 pt (${(z * (R + 20)).toFixed(0)} px from the center)`, String(inside[0]));
    check(nearEnd[0] < COLOR_TOL, `step 3: zoom ${label}: the head is at ring edge + 61 pt`, String(nearEnd[0]));
    check(beyond[0] > COLOR_TOL && beyondBelow[0] > COLOR_TOL, `step 3: zoom ${label}: nothing is beyond the far end (ring edge + 68 pt)`, `${beyond[0]} ${beyondBelow[0]}`);
  };
  await view(1, 400, 400, box.width / 2, box.height / 2);
  await probe(1, '1');
  await shot('B8-T04-zoom-1');
  // the real wheel: 15 steps of 1.1 at the ring
  const c = await canvasBox();
  const center = await screenOf({ x: 400, y: 400 });
  await page.mouse.move(center.x, center.y);
  for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, -100); await idle(40); }
  await idle(300);
  const z4 = await zoomOf();
  check(z4 > 3.5 && z4 < 4.6, 'step 3: 15 wheel steps give a zoom of about 4', String(z4));
  await grab();
  {
    const R = 6 + 3 / z4;
    const at = (d) => ({ x: 400 + U.x * d, y: 400 + U.y * d });
    const inside = await distTo([await screenOf(at(R + 20))], typ.color);
    const beyond = await distTo([await screenOf(at(R + 64 + 4))], typ.color);
    check(inside[0] < COLOR_TOL, 'step 3: after the wheel zoom the shaft is still at ring edge + 20 pt', String(inside[0]));
    check(beyond[0] > COLOR_TOL, 'step 3: after the wheel zoom nothing is beyond the far end', String(beyond[0]));
  }
  await shot('B8-T04-zoom-4');
  for (let i = 0; i < 15; i++) { await page.mouse.wheel(0, 100); await idle(40); }
  await idle(200);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 100); await idle(40); }
  await idle(300);
  const zLow = await zoomOf();
  check(zLow > 0.2 && zLow < 0.3, 'step 3: the wheel zoom out gives about 0.25', String(zLow));
  await shot('B8-T04-zoom-025');
  await view(32, 400, 400, c.width / 2, c.height / 2);
  check(Math.abs((await zoomOf()) - 32) < 1e-6, 'step 3: the highest zoom is 32');
  await shot('B8-T04-zoom-32');
  await view(0.05, 400, 400, c.width / 2, c.height / 2);
  await shot('B8-T04-zoom-005');
}

// ---------------------------------------------------------------- 4. the line pattern of the type: solid, dashed, dotted, dashDot, longDash, dashDotDot
{
  const rs = TYPES.map((ty, i) => ({ id: `p${i}`, x: 120 + i * 170, y: 300, pair: { below: 'none', above: 'up' }, type: ty.id }));
  await setup({ rings: rs, anchors: [] });
  await setMarks(rs, []);
  await view(1, 545, 300, box.width / 2, box.height / 2);
  await grab();
  const stats = [];
  for (const [i, r] of rs.entries()) {
    const typ = TYPES[i];
    const R = 9;
    let on = 0;
    let n = 0;
    for (let d = R + 2; d <= R + 64 - 16; d += 1) {
      const s = await screenOf({ x: r.x + U.x * d, y: r.y + U.y * d });
      const [dist] = await distTo([s], typ.color, 1);
      n += 1;
      if (dist < COLOR_TOL) on += 1;
    }
    stats.push({ pattern: typ.linePattern, on, n });
  }
  console.log(JSON.stringify(stats));
  const solid = stats[0];
  check(solid.on / solid.n > 0.97, 'step 4: the solid shaft is fully colored', JSON.stringify(solid));
  for (const s of stats.slice(1)) check(s.on / s.n > 0.15 && s.on / s.n < 0.9, `step 4: the ${s.pattern} shaft has gaps (colored share between 15 and 90 percent)`, JSON.stringify(s));
  await shot('B8-T04-patterns');
  const c = await canvasBox();
  await clipShot('B8-T04-patterns-crop', { x: c.x, y: c.y + 330, width: c.width, height: 200 });
}

// ---------------------------------------------------------------- 5. two rings 20 pt apart (side by side, one above the other, on the arrow line)
{
  const rs = [
    { id: 'q1', x: 200, y: 300, pair: PICT[0], type: 'nt-solid' }, { id: 'q2', x: 220, y: 300, pair: PICT[3], type: 'nt-dotted' },
    { id: 'q3', x: 450, y: 300, pair: PICT[0], type: 'nt-solid' }, { id: 'q4', x: 450, y: 320, pair: PICT[3], type: 'nt-dashed' },
    { id: 'q5', x: 700, y: 330, pair: PICT[6], type: 'nt-solid' }, { id: 'q6', x: 700 + 20 * U.x, y: 330 + 20 * U.y, pair: PICT[7], type: 'nt-dotted' },
  ];
  await setup({ rings: rs, anchors: [] });
  await setMarks(rs, []);
  await view(1, 450, 300, box.width / 2, box.height / 2);
  await shot('B8-T04-two-rings');
  const c = await canvasBox();
  await clipShot('B8-T04-two-rings-crop', { x: c.x + 60, y: c.y + 330, width: c.width - 120, height: 330 });
  await view(0.5, 450, 300, box.width / 2, box.height / 2);
  await clipShot('B8-T04-two-rings-zoom-05', { x: c.x + 60, y: c.y + 380, width: c.width - 120, height: 200 });
}

// ---------------------------------------------------------------- 6. the ring label next to an arrow (free anchor, long label), at three zooms
{
  const as = [
    { id: 'l1', x: 200, y: 300, pair: PICT[0], type: 'nt-solid', label: 'Supply air riser 1' },
    { id: 'l2', x: 500, y: 300, pair: PICT[6], type: 'nt-dashed', label: 'Supply air riser with a very long name 22' },
    { id: 'l3', x: 800, y: 300, pair: PICT[3], type: 'nt-dotted', label: 'R3' },
  ];
  await setup({ rings: [], anchors: as });
  await setMarks([], as);
  for (const z of [1, 0.5, 2]) {
    await view(z, 500, 300, box.width / 2, box.height / 2);
    await shot(`B8-T04-labels-zoom-${String(z).replace('.', '')}`);
  }
  await view(1, 500, 300, box.width / 2, box.height / 2);
  const c = await canvasBox();
  await clipShot('B8-T04-labels-crop', { x: c.x, y: c.y + 330, width: c.width, height: 280 });
}

// ---------------------------------------------------------------- 7. a selected anchor (real click) and an undecided mark keep their own ring look; the arrow keeps the type color
{
  const as = [{ id: 's1', x: 200, y: 300, pair: PICT[0], type: 'nt-solid' }, { id: 's2', x: 450, y: 300, pair: PICT[6], type: 'nt-dashed' }];
  const ms = [{ id: 'm1', x: 700, y: 300, pair: PICT[6], type: 'nt-dotted', undecided: true }];
  await setup({ rings: ms, anchors: as });
  await setMarks(ms, as);
  await view(1, 450, 300, box.width / 2, box.height / 2);
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
  const ring = await screenOf({ x: 200, y: 300 });
  await page.mouse.click(ring.x + 14, ring.y);
  await idle(400);
  check((await page.evaluate(() => window.__mepSketchScene.getSelectedRiserAnchorId?.() ?? null)) === 's1', 'step 7: a click on the ring of anchor s1 selects it');
  await grab();
  const mid = (cx, cy, s) => ({ x: cx + s * U.x * 45, y: cy + s * U.y * 45 });
  const dRed = await distTo([await screenOf(mid(200, 300, 1))], TYPES[0].color);
  check(dRed[0] < COLOR_TOL, 'step 7: the arrow of the selected anchor keeps the type color', String(dRed[0]));
  const m1 = await screenOf({ x: 700, y: 300 });
  const amber = await distTo([{ x: m1.x + 9, y: m1.y }], '#e69500');
  check(amber[0] < 80, 'step 7: the undecided ring is still amber', String(amber[0]));
  let bestBlue = 999;
  for (let d = 25; d <= 65; d += 1) {
    const [v] = await distTo([await screenOf({ x: 700 + U.x * d, y: 300 + U.y * d })], TYPES[2].color, 1);
    bestBlue = Math.min(bestBlue, v);
  }
  check(bestBlue < COLOR_TOL, 'step 7: the arrow of the amber ring has the type color (blue, dotted: some dot on the shaft)', String(bestBlue));
  await shot('B8-T04-states');
  const c = await canvasBox();
  await clipShot('B8-T04-states-crop', { x: c.x, y: c.y + 330, width: c.width, height: 280 });
}


await t.finish();
