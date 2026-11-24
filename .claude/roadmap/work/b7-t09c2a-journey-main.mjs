// B7-T09c-2a journey check written from the goals G1 to G6 (first-time user). Real clicks and typing.
// The scene API is used to read state, to move the view, and (full state only) to add 30 extra networks.
// Config: b7-t09c2a-journey-cfg.json = [{ width, full }]. Each entry runs on a fresh browser.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/';
const SHOTS = `${W}shots/b7-t09c2a-journey/`;
const CFG = JSON.parse(readFileSync(`${W}b7-t09c2a-journey-cfg.json`, 'utf8'));
const LONG80 = 'Supply Air Main Trunk Duct Of The East Wing Of The Building Level Three North 0042';
const HINT_A_VENT = 'No source yet. Each number shows the largest flow for any source position. Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0. Place an air handling unit or a fan to set the source.';
const HINT_L_VENT = 'This network has a loop and no source. The numbers use one start point. Place an air handling unit or a fan to set the source.';
let anyFail = false;

async function run({ width, full }) {
  const tag = `w${width}-${full ? 'full' : 'empty'}`;
  console.log(`\n===== RUN ${tag} =====`);
  const t = await open({ width, height: 1000 });
  const { page, check, idle } = t;
  const steps = {};
  let goal = 'setup';
  const step = (what) => { steps[goal] = (steps[goal] ?? 0) + 1; console.log(`STEP ${goal} #${steps[goal]} ${what}`); };
  const note = (sev, what) => console.log(`NOTE[${sev}] ${tag} ${goal}: ${what}`);
  const snap = async (name) => { const path = `${SHOTS}${tag}-${name}.png`; await page.screenshot({ path }); console.log(`SHOT ${path}`); };
  const narrow = width < 900;
  const rail = async (title) => { const l = page.locator(`button.mep-rail-btn[title="${title}"]`).first(); if (narrow) await l.dispatchEvent('click'); else await l.click(); await idle(250); };
  const screenOf = (p) => page.evaluate((p) => { const s = window.__mepSketchScene; const g = s.world.toGlobal(p); const r = s.app.canvas.getBoundingClientRect(); return { x: r.left + g.x, y: r.top + g.y }; }, p);
  const clickAt = async (p, wait = 300) => { const s = await screenOf(p); await page.mouse.click(s.x, s.y); await idle(wait); };
  const tab = async (name) => { await page.locator('.mep-dock-tab-label', { hasText: new RegExp(`^${name}$`, 'i') }).click(); await idle(300); };

  await t.start();
  await t.openPdf();
  // visible canvas area: the dock covers the canvas at a narrow window
  const dockRect = await page.evaluate(() => { const r = document.querySelector('.mep-dock').getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height }; });
  console.log('DOCK', JSON.stringify(dockRect));
  const visRight = Math.min(dockRect.x, width) - 15;
  const k = Math.min(1, (visRight - 60) / 960, 880 / 760);
  await page.evaluate(([k, xc, yc]) => {
    const s = window.__mepSketchScene;
    const r = s.app.canvas.getBoundingClientRect();
    s.world.scale.set(k);
    s.world.x = xc - r.left - k * 600;
    s.world.y = yc - r.top - k * 670;
  }, [k, (48 + visRight) / 2, 480]);
  await idle(300);
  console.log('view scale', k);

  const Tm = { x: 900, y: 400 }, Tj = { x: 650, y: 400 }, O1 = { x: 400, y: 400 }, O2 = { x: 650, y: 600 };
  const Tr = { x: 900, y: 800 }, R1 = { x: 650, y: 800 }, R2 = { x: 450, y: 800 }, R3 = { x: 450, y: 950 }, R4 = { x: 650, y: 950 };
  const proj = () => page.evaluate(() => { const p = window.__mepSketchScene.exportProject(); return { segs: p.segments.map((s) => s.id), fits: p.fittings.map((f) => `${f.id}:${f.kind}`), stamps: p.stamps.map((s) => `${s.id}:${s.category}:${s.name ?? ''}`), caps: p.terminalCapacities ?? {} }; });

  await tab('Properties'); await snap('E0-props-empty-drawing'); { const e0 = await page.evaluate(() => document.querySelector('.mep-dock').innerText); console.log('E0 empty drawing Properties text:', JSON.stringify(e0.split('\n').slice(4))); } await tab('MEP');
  // ---------- setup: two terminals, the T-duct and the ring, with real tools ----------
  goal = 'setup';
  await rail('Stamp');
  for (const at of [Tm, Tr]) {
    if (at === Tr) { await rail("Stamp"); await tab("MEP"); await page.locator(".mep-dock button", { hasText: /^\s*Stamps\s*$/ }).first().click(); await idle(200); }
    await page.locator('.mep-dock input[placeholder^="Search"]').fill('Round Supply');
    await idle(250);
    await page.locator('.mep-stamp-tile').first().click();
    await idle(1000);
    await clickAt(at, 800);
    await page.keyboard.press('Escape');
    await idle(200);
  }
  await rail('Segment');
  await page.locator('.mep-dock button', { hasText: /^\s*Network Types\s*$/ }).first().click();
  await idle(300);
  await page.locator('.mep-dock .mep-nt-card, .mep-dock button, .mep-dock div', { hasText: /^Supply AirCFM$|^Supply Air\s*CFM$/ }).first().click().catch(async () => { await page.locator('.mep-dock').locator('text=Supply Air').first().click(); });
  await idle(300);
  await clickAt(Tm); await clickAt(Tj); await clickAt(O1); await page.keyboard.press('Escape'); await idle(200);
  await clickAt(Tj); await clickAt(O2); await page.keyboard.press('Escape'); await idle(200);
  await clickAt(Tr); await clickAt(R1); await clickAt(R2); await clickAt(R3); await clickAt(R4); await clickAt(R1); await page.keyboard.press('Escape'); await idle(300);
  const ids0 = await proj();
  console.log('PROJECT', JSON.stringify(ids0));
  check(ids0.segs.length === 8, `${tag} setup: 8 segments drawn (3 duct + 5 ring) got ${ids0.segs.length}`, JSON.stringify(ids0));
  // find the segment ids by geometry
  const idOf = (a, b) => page.evaluate(([a, b]) => {
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 40;
    const p = window.__mepSketchScene.exportProject();
    const H = window.__mepSketchScene.getDisplayedPageSize().heightPt;
    const s = p.segments.find((s) => {
      const g = s.geometry; const f = g[0]; const l = g[g.length - 1];
      return (near(f, a) && near(l, b)) || (near(f, b) && near(l, a));
    });
    return s?.id ?? null;
  }, [a, b]);
  // the page coords above are the scene (world) coords the click used
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // ids by drawing order
  const s_main = ids0.segs[0], s_s1 = ids0.segs[1], s_s2 = ids0.segs[2];
  const ringIds = ids0.segs.slice(3);
  console.log('IDS main/s1/s2/ring', s_main, s_s1, s_s2, ringIds.join(','));
  const segPt = { [s_main]: mid(Tm, Tj), [s_s1]: mid(Tj, O1), [s_s2]: mid(Tj, O2) };
  // ring segments: first (Tr->R1) then R1-R2, R2-R3, R3-R4, R4-R1
  const ringPts = [mid(Tr, R1), mid(R1, R2), mid(R2, R3), mid(R3, R4), mid(R4, R1)];
  ringIds.forEach((id, i) => { segPt[id] = ringPts[i]; });

  if (full) {
    // 30 extra isolated networks (rows in the Networks list), types with 80-character names
    await page.evaluate(([LONG80]) => {
      const sc = window.__mepSketchScene;
      const p = sc.exportProject();
      const supply = p.networkTypes.find((n) => n.id === 'supply-air');
      const ret = { id: 'return-air', name: LONG80.replace('Supply Air', 'Return Air'), discipline: 'ventilation', units: 'CFM', defaultCapacity: 400, color: '#4fc3f7', lineWidthPt: 2, linePattern: 'dashed', flowUnit: 'm³/h' };
      if (supply) supply.name = LONG80;
      if (!p.networkTypes.find((n) => n.id === 'return-air')) p.networkTypes.push(ret); else p.networkTypes.find((n) => n.id === 'return-air').name = ret.name;
      for (let i = 0; i < 30; i++) {
        const x = 1100 + (i % 6) * 190, y = 300 + Math.floor(i / 6) * 160;
        const a = { x, y }, b = { x: x + 140, y };
        p.fittings.push({ id: `xa${i}`, pageIndex: 0, position: a, kind: 'junction' }, { id: `xb${i}`, pageIndex: 0, position: b, kind: 'junction' });
        p.segments.push({ id: `x${i}`, pageIndex: 0, networkTypeId: i % 2 ? 'return-air' : 'supply-air', shape: 'round', diameter: 200, endpointA: { kind: 'fitting', fittingId: `xa${i}` }, endpointB: { kind: 'fitting', fittingId: `xb${i}` }, geometry: [a, b] });
      }
      sc.loadProjectFromJson(p);
    }, [LONG80]);
    await idle(1200);
    console.log('FULL state loaded', JSON.stringify((await proj()).segs.length));
  }

  // ---------- panels ----------
  const panel = () => page.evaluate(() => {
    const dock = document.querySelector('.mep-dock');
    const dr = dock.getBoundingClientRect();
    const rows = [...dock.querySelectorAll('.mep-field-row')].map((r) => {
      const l = r.querySelector('label')?.textContent.trim();
      const i = r.querySelector('input,select,textarea');
      return { l, v: i ? i.value : r.textContent.trim(), top: Math.round(r.getBoundingClientRect().top), cut: i ? i.scrollWidth > i.clientWidth : false, w: i ? Math.round(i.clientWidth) : 0 };
    });
    const hints = [...dock.querySelectorAll('.mep-hint')].map((h) => { const r = h.getBoundingClientRect(); return { t: h.textContent.trim(), h: Math.round(r.height), out: r.right > dr.right + 1 || r.left < dr.left - 1 }; });
    const solved = rows.find((r) => /^solved capacity/i.test(r.l ?? ''));
    return { head: dock.innerText.split('\n').slice(4, 8).join(' / '), rows, hints, solved: solved?.v ?? null, solvedLabel: solved?.l ?? null, solvedCut: solved?.cut ?? null, text: dock.innerText, scrollOver: dock.scrollHeight > dock.clientHeight + 1 };
  });
  const showProps = async () => {
    const txt = await page.evaluate(() => document.querySelector('.mep-dock').innerText);
    if (!/Solved capacity|Select an element|Length|Capacity|X \(pt\)/i.test(txt)) { note('medium', 'after a click on the canvas the dock did not show the Properties tab; the user must open it'); await tab('Properties'); }
  };
  const select = async (id, label = id) => {
    await rail('Select');
    await clickAt(segPt[id], 400);
    await showProps();
    const p = await panel();
    console.log(`PANEL ${label}: head="${p.head}" solved="${p.solvedLabel}=${p.solved}" cut=${p.solvedCut} hints=${p.hints.length} ${JSON.stringify(p.hints.map((h) => h.t.slice(0, 50)))}`);
    return p;
  };
  const selectFitting = async (pt, label) => {
    await rail('Select');
    await clickAt(pt, 400);
    await showProps();
    const p = await panel();
    console.log(`PANEL ${label}: head="${p.head}" solved="${p.solvedLabel}=${p.solved}" cut=${p.solvedCut} hints=${p.hints.length} ${JSON.stringify(p.hints.map((h) => h.t.slice(0, 50)))}`);
    return p;
  };
  const selectTerminal = async (at, label) => {
    await rail('Select');
    await clickAt({ x: at.x + 28, y: at.y + 24 }, 400);
    await showProps();
    const p = await panel();
    console.log(`PANEL ${label}: head="${p.head}" rows=${JSON.stringify(p.rows.map((r) => `${r.l}=${r.v}`))}`);
    return p;
  };
  const setCapacity = async (v) => {
    const inp = page.locator('.mep-dock .mep-field-row', { has: page.locator('label', { hasText: /^\s*Capacity/i }) }).locator('input').first();
    await inp.click({ clickCount: 3 });
    await page.keyboard.type(String(v));
    await page.keyboard.press('Enter');
    await idle(500);
  };
  const solveFlow = async () => {
    await tab('Networks');
    await page.locator('button.mep-icon-btn', { hasText: /Solve flow/ }).click();
    await idle(500);
    await tab('Properties');
  };

  // ===== G0: Properties tab with nothing selected, empty drawing is covered by the explore run; here: nothing selected =====
  goal = 'G0-empty-selection';
  await tab('Properties'); step('open the Properties tab');
  await snap('G0-1-props-after-drawing-stamp-still-selected');
  await rail('Select');
  await clickAt({ x: 1000, y: 560 }, 300); step('click empty canvas');
  await snap('G0-2-props-nothing-selected');
  const g0 = await panel();
  console.log('G0 text:', JSON.stringify(g0.text.split('\n').slice(-3)));
  check(/Select an element/.test(g0.text), `${tag} G0: Properties with nothing selected shows the old text`, g0.text.slice(-120));

  // ===== G1: T-duct, no source: does the screen tell the flow in each open end? =====
  goal = 'G1';
  // first look BEFORE any capacity is typed and before Solve flow
  let p = await select(s_s1, 's1'); step('click segment s1 (Select tool)');
  console.log('G1 before capacity and solve:', p.solved, '| hints', p.hints.length);
  await snap('G1-1-s1-before-capacity');
  // terminal capacity default
  p = await selectTerminal(Tm, 'terminal Tm'); step('click terminal Tm');
  const capRow = p.rows.find((r) => /^capacity/i.test(r.l ?? ''));
  console.log('G1 terminal capacity default:', capRow ? capRow.v : 'NO Capacity ROW', '| all rows', JSON.stringify(p.rows.map((r) => r.l)));
  await snap('G1-2-terminal-props');
  await setCapacity(100); step('type 100 in Capacity + Enter');
  p = await select(s_s1, 's1'); step('click segment s1 again');
  console.log('G1 after capacity 100, before Solve flow: solved =', p.solved);
  await snap('G1-3-s1-after-capacity-before-solve');
  if (p.solved === 'Not solved' || p.solved === null || p.solved === '') {
    note('high', 'after drawing the duct and typing the capacity the field still shows "' + p.solved + '"; the user must find Networks > Solve flow first (no hint says so)');
    await solveFlow(); step('open Networks tab, click Solve flow, back to Properties');
    p = await select(s_s1, 's1'); step('click segment s1 again');
  }
  await snap('G1-4-s1-at-most');
  console.log('G1 final s1:', p.solved, JSON.stringify(p.hints));
  check(p.solved === 'at most 100', `${tag} G1: s1 field is "at most 100"`, String(p.solved));
  check(p.hints.some((h) => h.t === HINT_A_VENT), `${tag} G1: Hint A text for ventilation`, JSON.stringify(p.hints.map((h) => h.t)));
  check(p.hints.every((h) => !h.out), `${tag} G1: hint stays inside the dock`, JSON.stringify(p.hints.map((h) => h.out)));
  check(!p.solvedCut, `${tag} G1: "at most 100" is not cut in the input`, `cut=${p.solvedCut}`);
  console.log('G1 hint heights', JSON.stringify(p.hints.map((h) => h.h)), 'dockScroll', p.scrollOver);

  // read the other open end, the main segment and a fitting (3 repeats)
  const tops = [];
  for (let round = 1; round <= 3; round++) {
    for (const [id, name] of [[s_s1, 's1'], [s_s2, 's2'], [s_main, 'main']]) {
      p = await select(id, `${name} r${round}`);
      tops.push(`${p.rows.find((r) => /^solved/i.test(r.l))?.top}/${p.rows.find((r) => /^network type/i.test(r.l ?? ''))?.top}`);
      check(p.solved === 'at most 100', `${tag} G1 round ${round}: ${name} reads "at most 100"`, String(p.solved));
    }
    p = await selectFitting(O2, `fitting O2 r${round}`);
    check(p.solved === 'at most 100' && p.hints.length >= 1, `${tag} G1 round ${round}: fitting O2 reads "at most 100" with a hint`, `${p.solved} hints=${p.hints.length}`);
    await snap(`G1-5-fitting-O2-round${round}`);
  }
  console.log('G1 row tops (solved/networktype) per read:', tops.join(' | '));
  check(new Set(tops).size <= 2, `${tag} G1: panel row positions stay put over reads`, tops.join(' | '));
  p = await selectFitting(Tj, 'fitting T');
  await snap('G1-6-fitting-T');

  // ===== G3a: change the terminal capacity with no source =====
  goal = 'G3a';
  await selectTerminal(Tm, 'terminal Tm'); step('click terminal');
  await setCapacity(250); step('type 250 + Enter');
  p = await select(s_s1, 's1'); step('click s1');
  console.log('G3a s1 after 250 (no Solve flow clicked):', p.solved);
  if (p.solved !== 'at most 250') {
    note('high', `after the capacity change the number is "${p.solved}" until the user clicks Solve flow again`);
    await solveFlow(); step('Networks > Solve flow > Properties');
    p = await select(s_s1, 's1'); step('click s1');
  }
  await snap('G3a-s1-250');
  check(p.solved === 'at most 250', `${tag} G3a: s1 follows to "at most 250"`, String(p.solved));
  p = await select(s_s2, 's2');
  check(p.solved === 'at most 250', `${tag} G3a: s2 follows to "at most 250"`, String(p.solved));
  p = await select(s_main, 'main');
  check(p.solved === 'at most 250', `${tag} G3a: main follows to "at most 250"`, String(p.solved));

  // ===== G4: several segments =====
  goal = 'G4';
  await select(s_s1, 's1'); step('click s1');
  await page.keyboard.down('Shift');
  { const s = await screenOf(segPt[s_s2]); await page.mouse.click(s.x, s.y); }
  await page.keyboard.up('Shift'); await idle(400); step('Shift-click s2');
  p = await panel();
  console.log('G4 multi: head=', p.head, '| solved', p.solvedLabel, '=', p.solved, '| hints', JSON.stringify(p.hints.map((h) => h.t.slice(0, 60))));
  await snap('G4-1-two-segments');
  check(/2 segments selected/i.test(p.text), `${tag} G4: panel says "2 segments selected"`, p.head);
  check(p.solved === 'at most 250' && p.hints.some((h) => h.t === HINT_A_VENT), `${tag} G4: at most 250 plus one Hint A`, `${p.solved} ${p.hints.length}`);
  check(p.hints.filter((h) => /No source yet/.test(h.t)).length === 1, `${tag} G4: exactly one Hint A`, String(p.hints.length));
  // mixed: duct segment + loop segment
  { const s = await screenOf(segPt[ringIds[1]]); await page.keyboard.down('Shift'); await page.mouse.click(s.x, s.y); await page.keyboard.up('Shift'); await idle(400); step('Shift-click a ring segment (mixed)'); }
  p = await panel();
  console.log('G4 mixed (duct + ring): head=', p.head, '| solved', p.solvedLabel, '=', p.solved, '| hints', p.hints.length);
  await snap('G4-2-mixed-selection');
  // all segments at once
  await rail('Select');
  // click empty canvas to clear
  await clickAt({ x: 1000, y: 560 }, 300);
  step('click empty canvas (clear selection)');
  await showProps();
  p = await panel();
  console.log('G4 cleared:', JSON.stringify(p.text.split('\n').slice(-2)));
  check(/Select an element/.test(p.text), `${tag} G4: empty canvas click clears the selection`, p.text.slice(-80));

  // ===== G5: loop, no source =====
  goal = 'G5';
  // the ring terminal needs a capacity first
  await selectTerminal(Tr, 'terminal Tr'); step('click ring terminal');
  await setCapacity(60); step('type 60 + Enter'); console.log('G5 caps after typing', JSON.stringify((await proj()).caps), JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getFlowResult()?.map((r) => ({ seg: r.segmentCapacity, ns: r.noSource ?? null, res: r.resolved })))));
  p = await select(ringIds[1], 'ring seg 2'); step('click a ring segment');
  console.log('G5 ring seg after capacity (no Solve flow):', p.solved, p.hints.length);
  if (p.solved === 'Not solved' && p.hints.length === 0) {
    note('medium', 'ring segment shows "Not solved" with no hint before Solve flow is run');
    await solveFlow(); step('Solve flow');
    p = await select(ringIds[1], 'ring seg 2'); step('click a ring segment');
  }
  await snap('G5-1-ring-seg');
  const ringReads = [];
  for (const id of ringIds) { p = await select(id, `ring ${id}`); ringReads.push(`${id}:${p.solved}:${p.hints.length ? p.hints[0].t.slice(0, 20) : 'nohint'}`); }
  console.log('G5 ring reads', ringReads.join(' | '));
  await snap('G5-2-ring-last');
  p = await select(ringIds[1], 'ring seg 2');
  check(p.hints.some((h) => h.t === HINT_L_VENT), `${tag} G5: Hint L text for ventilation`, JSON.stringify(p.hints.map((h) => h.t)));
  check(p.solved !== null && !/at most/.test(p.solved ?? ''), `${tag} G5: loop number has no "at most"`, String(p.solved));

  // ===== G2: place an air handling unit at one open end =====
  goal = 'G2';
  const portPt = (stampId, pick) => page.evaluate(([id, pick, O]) => {
    const p = window.__mepSketchScene.exportProject();
    const s = p.stamps.find((x) => x.id === id);
    const sx = s.transform.scale?.x ?? 1, sy = s.transform.scale?.y ?? 1;
    const pts = s.ports.map((q) => ({ name: q.name, x: s.transform.position.x + (q.fractionX - 0.5) * s.nativeWidth * sx, y: s.transform.position.y + (q.fractionY - 0.5) * s.nativeHeight * sy }));
    pts.sort((a, b) => Math.hypot(a.x - O.x, a.y - O.y) - Math.hypot(b.x - O.x, b.y - O.y));
    return { all: pts.map((q) => `${q.name}@${Math.round(q.x)},${Math.round(q.y)}`), nearest: pts[0], pos: s.transform.position };
  }, [stampId, pick, pick]);
  const equipOf = (re) => page.evaluate((re) => { const p = window.__mepSketchScene.exportProject(); const s = [...p.stamps].reverse().find((x) => x.category === 'equipment'); return s ? s.id : null; }, re);
  const joinedOf = (id) => page.evaluate((id) => { const p = window.__mepSketchScene.exportProject(); return p.segments.filter((s) => (s.endpointA.kind === 'port' && s.endpointA.elementId === id) || (s.endpointB.kind === 'port' && s.endpointB.elementId === id)).map((s) => s.id); }, id);
  await tab('MEP'); step('open the MEP tab');
  await page.locator('.mep-dock button', { hasText: /^\s*Stamps\s*$/ }).first().click();
  await idle(200);
  await rail('Stamp'); step('Stamp tool');
  await page.locator('.mep-dock button', { hasText: /^\s*Terminal\s*$/ }).first().click(); step('Terminal/Equipment chip');
  await idle(300);
  await page.locator('.mep-dock input[placeholder^="Search"]').fill('Air Handling'); step('type Air Handling in Search');
  await idle(300);
  await page.locator('.mep-stamp-tile', { hasText: 'Air Handling Unit' }).first().click(); step('pick D3 Air Handling Unit tile');
  await idle(1000);
  await snap('G2-1-ahu-picked');
  // naive try: click the canvas at the open end
  await clickAt(O1, 900); step('click the canvas at open end O1');
  await page.keyboard.press('Escape');
  await idle(200);
  const ahu1 = await equipOf();
  let joined = await joinedOf(ahu1);
  console.log('AHU naive: id', ahu1, 'joined segments', JSON.stringify(joined));
  await snap('G2-2-ahu-placed-on-open-end');
  p = await select(s_s1, 's1'); step('click s1');
  console.log('G2 naive: s1 =', p.solved, 'hints', p.hints.length, '| status', await t.statusText());
  await snap('G2-3-s1-after-naive-ahu');
  if (joined.length === 0) {
    note('high', `the air handling unit was placed with its centre on open end O1 but no segment joined a port; s1 still reads "${p.solved}" with Hint A, and no message says the unit is not connected`);
  }
  check(joined.length > 0 || p.solved === 'at most 250', `${tag} G2 naive: state is consistent (unjoined unit keeps "at most")`, String(p.solved));
  // undo the naive placement
  await rail('Undo'); step('Undo the naive placement');
  await idle(300);
  const afterUndo = await proj();
  console.log('after Undo stamps', JSON.stringify(afterUndo.stamps));
  // proper way: place the unit left of O1, draw a segment from O1 to a port of the unit
  await tab('MEP');
  await rail('Stamp'); step('Stamp tool');
  await page.locator('.mep-dock input[placeholder^="Search"]').fill('Air Handling'); step('type Air Handling in Search');
  await idle(300);
  await page.locator('.mep-stamp-tile', { hasText: 'Air Handling Unit' }).first().click(); step('pick the tile');
  await idle(1000);
  await clickAt({ x: 240, y: 400 }, 900); step('click the canvas left of O1');
  await page.keyboard.press('Escape'); await idle(200);
  const ahu = await equipOf();
  const pp = await portPt(ahu, O1);
  console.log('AHU ports', JSON.stringify(pp.all), 'nearest to O1', JSON.stringify(pp.nearest));
  await snap('G2-4-ahu-left-of-O1');
  await rail('Segment'); step('Segment tool');
  await clickAt(O1, 300); step('click open end O1');
  await clickAt(pp.nearest, 300); step('click the unit port');
  await page.keyboard.press('Escape'); await idle(300);
  joined = await joinedOf(ahu);
  console.log('AHU proper: joined segments', JSON.stringify(joined));
  check(joined.length === 1, `${tag} G2: a segment joins the unit port`, JSON.stringify(joined));
  await snap('G2-5-ahu-joined');
  p = await select(s_s1, 's1'); step('click s1');
  const r1 = p.solved; const h1 = p.hints.length;
  await snap('G2-6-s1-with-source');
  p = await select(s_s2, 's2'); step('click s2');
  const r2 = p.solved;
  console.log('G2 with source: s1', r1, 'hints', h1, '| s2', r2, 'hints', p.hints.length, JSON.stringify(p.hints.map((h) => h.t.slice(0, 60))));
  await snap('G2-7-s2-with-source');
  p = await select(s_main, 'main'); step('click main');
  console.log('G2 with source: main', p.solved, 'hints', p.hints.length);
  check(!p.hints.some((h) => /No source yet/.test(h.t)), `${tag} G2: no Hint A once the source is joined`, JSON.stringify(p.hints.map((h) => h.t.slice(0, 40))));
  check(!/at most/.test(p.solved ?? ''), `${tag} G2: no "at most" once the source is joined`, String(p.solved));
  const newSeg = joined[0];
  segPt[newSeg] = mid(O1, pp.nearest);
  p = await select(newSeg, 'new segment O1-AHU');
  console.log('G2 new segment O1-AHU:', p.solved, 'hints', p.hints.length);

  // ===== G3b: capacity change with a source =====
  goal = 'G3b';
  await selectTerminal(Tm, 'terminal Tm'); step('click terminal');
  await setCapacity(120); step('type 120 + Enter');
  p = await select(s_s2, 's2'); step('click s2');
  console.log('G3b s2 after 120:', p.solved);
  p = await select(s_main, 'main'); step('click main');
  console.log('G3b main after 120:', p.solved, 'hints', p.hints.length);
  await snap('G3b-main');
  check(p.solved === '120', `${tag} G3b: main follows to 120`, String(p.solved));
  p = await select(s_s1, 's1');
  console.log('G3b s1:', p.solved, 'hints', p.hints.length);
  p = await select(s_s2, 's2');
  check(p.solved === '120', `${tag} G3b: s2 follows to 120`, String(p.solved));

  // ===== G6: fan coil unit at the end of a branch =====
  goal = 'G6';
  await tab('MEP');
  await rail('Stamp'); step('Stamp tool');
  await page.locator('.mep-dock input[placeholder^="Search"]').fill('Fan Coil'); step('type Fan Coil in Search');
  await idle(300);
  await page.locator('.mep-stamp-tile', { hasText: 'Fan Coil Unit' }).first().click(); step('pick D3 Fan Coil Unit tile');
  await idle(1000);
  await clickAt({ x: 900, y: 600 }, 900); step('click the canvas right of open end O2');
  await page.keyboard.press('Escape'); await idle(200);
  const fcuId = await equipOf();
  const fp = await portPt(fcuId, O2);
  console.log('FCU ports', JSON.stringify(fp.all), 'nearest', JSON.stringify(fp.nearest));
  await snap('G6-1-fcu-placed-right-of-O2');
  await rail('Select');
  await clickAt({ x: 900, y: 600 }, 500); step('click the fan coil unit');
  await showProps();
  p = await panel();
  console.log('G6 FCU props rows:', JSON.stringify(p.rows.map((r) => `${r.l}=${r.v}`)));
  await snap('G6-2-fcu-props');
  await setCapacity(80); step('type 80 in Capacity of the unit + Enter');
  p = await panel();
  console.log('G6 FCU capacity now:', JSON.stringify(p.rows.filter((r) => /^capacity/i.test(r.l ?? ''))));
  await snap('G6-3-fcu-capacity-80');
  await rail('Segment'); step('Segment tool');
  await clickAt(O2, 300); step('click open end O2');
  await clickAt(fp.nearest, 300); step('click the unit port');
  await page.keyboard.press('Escape'); await idle(300);
  const fj = await joinedOf(fcuId);
  console.log('FCU joined segments', JSON.stringify(fj));
  check(fj.length === 1, `${tag} G6: a segment joins the fan coil unit`, JSON.stringify(fj));
  await snap('G6-4-fcu-joined');
  const readAll = async (label) => {
    const out = [];
    for (const [id, nm] of [[s_main, 'main'], [s_s1, 's1'], [s_s2, 's2']]) { const q = await select(id, `${nm} ${label}`); out.push(`${nm}=${q.solved}/${q.hints.length}h`); }
    console.log('G6 reads', label, out.join(' '));
  };
  await readAll('with AHU on s1 and FCU(80) on s2');
  segPt[fj[0]] = mid(O2, fp.nearest);
  p = await select(fj[0], 'segment O2-FCU'); step('click the new segment');
  console.log('G6 segment O2-FCU:', p.solved, 'hints', JSON.stringify(p.hints.map((h) => h.t.slice(0, 70))));
  await snap('G6-5-segment-to-fcu');
  p = await select(s_s2, 's2'); step('click s2');
  await snap('G6-6-s2');
  console.log('G6 s2 text:', JSON.stringify(p.text.split('\n').slice(0, 14)));
  // the fan coil unit itself again, with a capacity
  await rail('Select');
  await clickAt({ x: 900, y: 600 }, 500);
  await showProps();
  p = await panel();
  console.log('G6 FCU props after join: hints', JSON.stringify(p.hints.map((h) => h.t.slice(0, 80))));
  await snap('G6-7-fcu-props-after-join');
  await tab('Networks');
  await snap('G6-8-networks-tab');
  console.log('G6 networks text:', JSON.stringify((await page.evaluate(() => document.querySelector('.mep-dock').innerText)).split('\n').slice(4, 12)));

  console.log('STEPS', tag, JSON.stringify(steps));
  check(true, `${tag} run complete`);
  await t.finish();
  if (process.exitCode) anyFail = true;
}

for (const c of CFG) await run(c);
process.exitCode = anyFail ? 1 : 0;
