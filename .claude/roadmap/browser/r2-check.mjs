// R2 part check (T11): the Route network dialog on a real drawing, through real DOM inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r2-check.mjs
// The scene API is used for setup and for reading state only. Clicks stay inside .mep-modal while the dialog is open.
import { open, D } from './lib.mjs';

const FIXTURES = '/root/MepApp/fixtures/pdfs/';
const MAIN_PDF = FIXTURES + '01_arch_first_floor.pdf';
const ALL_PDFS = [
  '00_arch_ground_floor.pdf',
  '00_arch_ground_floor_edit.pdf',
  '01_arch_first_floor.pdf',
  'Example_1.pdf',
  'Example_2.pdf',
  'Example_3.pdf',
  'Test_doc.pdf',
  'arch_simple_A4.pdf',
  'plattegrond begane grond 10A.pdf',
];
const R = '.mep-modal--route';
let anyFail = false;
const done = async (t) => {
  await t.finish();
  if (process.exitCode) anyFail = true;
};

// ---------- Run 1: English, 1600 x 1000 ----------
let t = await open();
let { page, check, idle, nav } = t;
const step = (n) => page.locator(`${nav} .mep-autoplace-substeps .mep-guide-step[data-step="${n}"]`);
const rail = (title) => page.locator(`button.mep-rail-btn[title="${title}"]`).first();
const project = () => page.evaluate(() => JSON.stringify(window.__mepSketchScene.exportProject()));
const dirty = () => page.evaluate(() => JSON.stringify(window.__mepSketchScene.getDocuments().map((d) => d.isDirty)));
const canUndo = () => page.evaluate(() => window.__mepSketchScene.getDrawingSummary().canUndo);
const lsKeys = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
const markers = () => page.evaluate(() => window.__mepSketchScene.routeMarkers.map((m) => ({ kind: m.kind, x: m.world.x, y: m.world.y })));
const screenOf = (p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);
const openRoute = async () => {
  await t.openRoute();
  await page.locator(R).waitFor({ timeout: 20000 });
  await idle(500);
};
const escapeRoute = async () => {
  await page.keyboard.press('Escape');
  await idle(400);
};
const closeButtonRoute = async () => {
  await page.locator(R).getByRole('button', { name: 'Close', exact: true }).last().click();
  await idle(400);
};
const summary = async () => await page.locator(`${R} [data-testid=route-summary] p`).allInnerTexts();
const total = async () => {
  const m = /^(\d+) open/.exec((await summary())[0] ?? '');
  return m ? Number(m[1]) : -1;
};
const roomCounts = () =>
  page.locator(`${R} [data-testid=route-rooms] .mep-route-room`).evaluateAll((els) =>
    els.map((e) => ({ id: e.querySelector('input').dataset.roomId, checked: e.querySelector('input').checked, count: Number(e.querySelector('.mep-route-room-count').textContent) })),
  );
const roomBox = (id) => page.locator(`${R} [data-testid=route-room][data-room-id="${id}"]`);
const noOverflow = () => page.evaluate((sel) => { const el = document.querySelector(sel); return el.scrollWidth <= el.clientWidth; }, R);
const headCells = () =>
  page.locator(`${R} [data-testid=route-rooms-head] span`).evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent, scroll: e.scrollWidth, client: e.clientWidth })),
  );
// Number of magenta-like pixels (ROUTE_MARKER_COLOR 0xe6007e, maybe dimmed by the backdrop) in a clip of the page.
const magentaIn = async (q) => {
  const buf = await page.screenshot({ clip: { x: Math.max(0, q.x - 20), y: Math.max(0, q.y - 20), width: 40, height: 40 } });
  return await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > gg + 40 && b > gg + 25) n++;
    }
    return n;
  }, buf.toString('base64'));
};
const expectedCount = (typeId, aId, onlyIds) =>
  page.evaluate(([typeId, aId, onlyIds]) => {
    let n = 0;
    for (const s of window.__mepSketchScene.listStamps()) {
      if (s.id === aId || s.category === 'equipment') continue;
      if (onlyIds && !onlyIds.includes(s.id)) continue;
      const ids = s.ports.length ? s.ports.map((p) => p.id) : ['__center__'];
      if (ids.some((id) => s.routingTargets?.[id] === typeId && !s.portSegmentTypes?.[id])) n += 1;
    }
    return n;
  }, [typeId, aId, onlyIds ?? null]);

const placeRule = async (ruleId, first) => {
  await t.openAutoPlace();
  if (first) await t.detect();
  await page.locator(`${nav} button[data-item="types"]`).click();
  await idle();
  if (first) {
    await page.locator(`${D} [role=tab]`, { hasText: 'Room type library' }).click();
    await idle();
    await page.locator(`${D} [data-testid=rt-fill-all]`).click();
    await idle();
  }
  await page.locator(`${nav} button[data-rule="${ruleId}"]`).click();
  await idle(600);
  await step(1).click();
  await idle(600);
  await page.locator(`${D} [data-testid=pg-stamp] button`, { hasText: /^Choose…$/ }).click();
  const picker = page.getByRole('dialog', { name: 'Stamp for the rule' });
  await picker.locator('[aria-label="Discipline"] >> text=All').click();
  await picker.locator('input[aria-label="Search stamps"]').click();
  await page.keyboard.type('flow arrow supply');
  await idle(400);
  await picker.locator('.mep-stamp-tile').first().click();
  await idle(1000);
  await step(6).click();
  await idle(2500);
  await page.locator('#pg-place').click();
  await page.locator(`${D} [data-testid=pg-placed]`).waitFor({ timeout: 180000 });
  await page.keyboard.press('Escape');
  await idle(800);
};

// Step 1: open the PDF, detect rooms, run the two example rules.
await t.start();
await t.openPdf(MAIN_PDF);
await placeRule('example-supply-air', true);
let exhaustPlaced = true;
try {
  await placeRule('example-toilet-exhaust', false);
} catch (e) {
  exhaustPlaced = false;
  console.log('NOTE the toilet exhaust rule did not place: ' + String(e).slice(0, 200));
  await page.keyboard.press('Escape');
  await idle(500);
}
const allTargets = await page.evaluate(() =>
  window.__mepSketchScene.exportProject().stamps.filter((s) => s.autoPlaced && s.routingTargets).map((s) => ({ id: s.id, position: s.transform.position, targets: Object.values(s.routingTargets) })),
);
check(allTargets.length >= 4, 'Auto-place placed stamps with routing targets', String(allTargets.length));
check(allTargets.some((s) => s.targets.includes('supply-air')), 'some placed stamps wait for Supply Air');
check(!exhaustPlaced || allTargets.some((s) => s.targets.includes('exhaust-air')), 'some placed stamps wait for Exhaust Air (toilet rule)');

// The start stamp: one visible supply-air stamp becomes an air handling unit (equipment, no routing target).
const vis = [];
for (const s of allTargets) {
  const q = await screenOf(s.position);
  const onCanvas = await page.evaluate((q) => document.elementFromPoint(q.x, q.y) === window.__mepSketchScene.app.canvas, q);
  if (onCanvas && s.targets.includes('supply-air')) vis.push({ s, q, d: Math.hypot(q.x - 600, q.y - 500) });
}
vis.sort((a, b) => a.d - b.d);
check(vis.length >= 4, 'at least 4 visible supply-air stamps', String(vis.length));
const aId = vis[0].s.id;
const grilles = vis.slice(1);
const baseProject = await page.evaluate((a) => {
  const p = window.__mepSketchScene.exportProject();
  for (const s of p.stamps) {
    if (s.id === a) {
      s.category = 'equipment';
      s.ports = [
        { id: 'out', name: 'Supply out', fractionX: 0.5, fractionY: 0.1 },
        { id: 'in', name: 'Return in', fractionX: 0.5, fractionY: 0.9 },
      ];
      delete s.routingTargets;
      delete s.autoPlaced;
    }
  }
  return p;
}, aId);
const projectJson = JSON.stringify(baseProject);
await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), projectJson);
await idle(1500);

// Real canvas selection: the unit, then Shift+click three grilles.
await rail('Select').click();
await page.mouse.click(110, 150);
await idle(300);
const qa = await screenOf(vis[0].s.position);
await page.mouse.click(qa.x, qa.y);
await idle(400);
const picked = [];
for (const g of grilles) {
  if (picked.length === 3) break;
  const q = await screenOf(g.s.position);
  if ([qa, ...picked.map((p) => p.q)].some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 30)) continue;
  await page.keyboard.down('Shift');
  await page.mouse.click(q.x, q.y);
  await page.keyboard.up('Shift');
  await idle(300);
  picked.push({ id: g.s.id, q });
}
const sel = await page.evaluate(() => window.__mepSketchScene.getSelection().map((s) => s.id));
check(picked.length >= 2 && sel.length === picked.length + 1 && sel.includes(aId) && picked.every((p) => sel.includes(p.id)), 'the unit and the grilles are selected on the canvas', JSON.stringify(sel));

// Step 2: the baseline.
const base = { project: await project(), keys: await lsKeys(), canUndo: await canUndo(), dirty: await dirty() };
check((await markers()).length === 0, 'no markers before the dialog opens');

// Step 3: open the dialog and check the first state.
await openRoute();
check((await page.locator(`${R} [data-testid=route-body]`).count()) === 1, 'the dialog shows the body (one page)');
check((await page.locator(`${R} [data-testid=route-start]`).inputValue()) === aId, 'the start stamp is the selected unit');
const type0 = await page.locator(`${R} [data-testid=route-type]`).inputValue();
check(type0 === 'supply-air', 'the type select starts with supply-air', type0);
check(await page.locator(`${R} [data-testid=route-port]`).isEnabled(), 'the start port select is enabled');
const typeOptions = await page.locator(`${R} [data-testid=route-type] option`).evaluateAll((els) => els.map((e) => ({ value: e.value, text: e.textContent })));
console.log('TYPE OPTIONS ' + JSON.stringify(typeOptions));
check(typeOptions.every((o) => / \(\d+ open ports?\)$/.test(o.text)), 'every type option ends with the open ports count', JSON.stringify(typeOptions));
const selectOrder = await page.locator(`${R} [data-testid=route-body] select`).evaluateAll((els) => els.map((e) => e.dataset.testid).filter((id) => id !== 'route-area-add'));
check(JSON.stringify(selectOrder) === JSON.stringify(['route-start', 'route-type', 'route-port']), 'the selects are in the order start, type, port', JSON.stringify(selectOrder));
const dialogX = (await page.locator(R).boundingBox())?.x ?? 0;
check(dialogX > 800, 'the dialog sits at the right of the window', String(dialogX));
const backdropBg = await page.evaluate(() => {
  const b = document.querySelector('.mep-modal-backdrop');
  return b ? getComputedStyle(b).backgroundColor : 'missing';
});
check(backdropBg === 'rgba(0, 0, 0, 0)' || backdropBg === 'transparent', 'the backdrop is transparent', backdropBg);
const exp0 = await expectedCount(type0, aId);
let lines = await summary();
const n0 = await total();
check(n0 === exp0 && n0 > 0, 'the summary count equals the independent count from listStamps', `${n0} vs ${exp0}: ${lines[0]}`);
check(/^\d+ open ports? of Supply Air in \d+ checked rooms?\.$/.test(lines[0] ?? ''), 'first summary line has the checked rooms wording', lines[0]);
const rows0 = await roomCounts();
const outside0 = Number(/:\s*(\d+) port/.exec(await page.locator(`${R} .mep-route-check`, { has: page.locator('[data-testid=route-outside]') }).innerText())?.[1] ?? -1);
check(rows0.length > 0 && rows0.every((r) => r.checked), 'all rooms are checked at first', String(rows0.length));
check(rows0.reduce((s, r) => s + r.count, 0) + outside0 === n0, 'room counts plus the outside count equal the total', `${rows0.reduce((s, r) => s + r.count, 0)} + ${outside0} vs ${n0}`);
const headTexts = (await headCells()).map((c) => c.text);
check(headTexts.includes('Open ports') && headTexts.includes('Room') && headTexts.includes('Type'), 'the room header shows Room, Type and Open ports', JSON.stringify(headTexts));
const m0 = await markers();
check(m0.filter((x) => x.kind === 'start').length === 1 && m0.filter((x) => x.kind === 'target').length === n0, 'markers: one start and one per counted port', `${m0.length}`);
await t.shot('T11-dialog-rooms');

// Markers on the plan: a centre probe (under the area the old centred dialog covered) and an edge probe (beside the dialog).
const modalBox = await page.locator(R).boundingBox();
const targetScreens = [];
for (const m of m0.filter((x) => x.kind === 'target')) targetScreens.push(await screenOf({ x: m.x, y: m.y }));
const centreProbe = targetScreens.find((q) => q.x >= 590 && q.x <= 1010 && q.y >= 140 && q.y <= 930) ?? null;
const edgeProbe = targetScreens.find((q) => q.x >= modalBox.x - 150 && q.x <= modalBox.x - 25 && q.y >= 90 && q.y <= 930) ?? null;
check(!!centreProbe, 'a target marker lies in the plan centre for the pixel check');
const probe = centreProbe;
const centreMagenta = centreProbe ? await magentaIn(centreProbe) : 0;
if (centreProbe) check(centreMagenta > 0, 'magenta marker pixels show in the plan centre that the dialog used to cover', String(centreMagenta));
check(!!edgeProbe, 'a target marker lies near the dialog edge for the pixel check');
if (edgeProbe) check((await magentaIn(edgeProbe)) > 0, 'magenta marker pixels show near the dialog edge', String(await magentaIn(edgeProbe)));
await t.shot('T11-markers-on-plan');

// Step 4: real clicks. Uncheck a room.
const target = rows0.find((r) => r.count > 0);
check(!!target, 'a room with open ports exists');
await roomBox(target.id).click();
await idle(300);
const n1 = await total();
check(n1 === n0 - target.count, 'unchecking a room lowers the count by its room count', `${n0} - ${target.count} vs ${n1}`);
check((await markers()).filter((x) => x.kind === 'target').length === n1, 'the target markers follow the summary');
check((await summary()).some((l) => /left out by the scope/.test(l)), 'a "left out" line shows');
const rows1 = await roomCounts();
check(rows1.find((r) => r.id === target.id).count === target.count && !rows1.find((r) => r.id === target.id).checked, 'the unchecked room keeps its count in the list');
await t.shot('T11-dialog-rooms-unchecked');
await page.locator(`${R} [data-testid=route-rooms-none]`).click();
await idle(300);
check((await total()) === outside0, 'None with outside on gives the ports outside rooms', `${await total()} vs ${outside0}`);
await page.locator(`${R} [data-testid=route-outside]`).click();
await idle(300);
check((await total()) === 0, 'None with outside off gives 0');
await page.locator(`${R} [data-testid=route-outside]`).click();
await page.locator(`${R} [data-testid=route-rooms-all]`).click();
await idle(300);
check((await total()) === n0, 'All and outside on give the first number again');

// Type change with a real select.
const otherType = typeOptions.find((o) => o.value !== type0);
if (otherType) {
  await page.locator(`${R} [data-testid=route-type]`).selectOption(otherType.value);
  await idle(400);
  const expOther = await expectedCount(otherType.value, aId);
  check((await total()) === expOther, 'after the type change the summary equals the independent count', `${await total()} vs ${expOther}: ${(await summary())[0]}`);
  await page.locator(`${R} [data-testid=route-type]`).selectOption(type0);
  await idle(400);
  check((await total()) === n0, 'back to the first type gives the first number');
} else {
  console.log('NOTE only one network type has open ports: the type change was not tested');
}

// Scope: selected stamps.
await page.locator(`${R} [data-testid=route-scope-stamps]`).click();
await idle(300);
const expSel = await expectedCount(type0, aId, picked.map((p) => p.id));
lines = await summary();
check((await total()) === expSel && expSel > 0, 'selected stamps scope: the count equals the independent count', `${await total()} vs ${expSel}: ${lines[0]}`);
check(/ on \d+ selected stamps?\.$/.test(lines[0] ?? ''), 'selected stamps scope: the stamps wording', lines[0]);
check((await page.locator(`${R} [data-testid=route-rooms]`).count()) === 0, 'selected stamps scope: no room list');
const stampsNotes = await page.locator(`${R} [data-testid=route-stamps-note]`).allInnerTexts();
check(stampsNotes.length === 1 && /start stamp/.test(stampsNotes[0] ?? ''), 'selected stamps scope: the note says the start stamp is not counted', JSON.stringify(stampsNotes));
await t.shot('T11-dialog-selection');
await page.locator(`${R} [data-testid=route-scope-rooms]`).click();
await idle(300);
check((await total()) === n0, 'back to the rooms scope gives the first number');

// Step 5 and 6: close with Escape, then with the Close button. Compare with the baseline each time.
const same = async (what) => {
  check((await project()) === base.project, `${what}: the project JSON is equal`);
  check((await lsKeys()) === base.keys, `${what}: the localStorage keys are equal`, `${base.keys} vs ${await lsKeys()}`);
  check((await canUndo()) === base.canUndo, `${what}: canUndo is equal`);
  check((await dirty()) === base.dirty, `${what}: isDirty is equal`, `${base.dirty} vs ${await dirty()}`);
};
await escapeRoute();
check((await page.locator(R).count()) === 0, 'Escape closes the dialog');
check((await markers()).length === 0, 'Escape clears the markers');
if (probe) check((await magentaIn(probe)) === 0, 'no magenta pixels remain after Escape');
await same('after Escape');
await openRoute();
check((await markers()).length > 0, 'the markers are back when the dialog opens again');
await closeButtonRoute();
check((await page.locator(R).count()) === 0, 'the Close button closes the dialog');
check((await markers()).length === 0, 'the Close button clears the markers');
await same('after the Close button');

// 400 px English.
await page.setViewportSize({ width: 400, height: 900 });
await idle(500);
await openRoute();
check(await noOverflow(), 'English 400 px: no horizontal overflow');
check((await headCells()).every((c) => c.scroll <= c.client), 'English 400 px: the room header is not cut', JSON.stringify(await headCells()));
await t.shot('T11-narrow-400');
await escapeRoute();
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(500);

// Selected stamps scope with no selection: the radio is disabled, dimmed, and the hint stays.
await page.mouse.click(110, 150);
await idle(300);
await openRoute();
const stampsRadio = page.locator(`${R} [data-testid=route-scope-stamps]`);
if ((await stampsRadio.count()) === 0) {
  check(false, 'no selection: the selected stamps radio is present');
} else {
  check(await stampsRadio.isDisabled(), 'no selection: the selected stamps radio is disabled');
}
const disabledLabels = page.locator(`${R} .mep-route-radio--disabled`);
check((await disabledLabels.count()) === 1, 'no selection: the disabled radio label has the disabled class');
const labelOpacity = (await disabledLabels.count()) === 1 ? await disabledLabels.evaluate((e) => getComputedStyle(e).opacity) : 'missing';
check(Number(labelOpacity) < 1, 'no selection: the disabled radio label is dimmed', labelOpacity);
const stampsHint = page.locator(`${R} [data-testid=route-stamps-hint]`);
check((await stampsHint.isVisible()) && (await stampsHint.innerText()).trim() !== '', 'no selection: the selected stamps hint is visible');
await escapeRoute();

// Extra (a): equipment, but no routing targets.
const noTargets = JSON.parse(projectJson);
for (const s of noTargets.stamps) delete s.routingTargets;
await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(noTargets));
await idle(1500);
await openRoute();
check((await page.locator(`${R} [data-testid=route-no-ports]`).count()) === 1, 'no open port: the line shows');
check(await page.locator(`${R} [data-testid=route-port]`).isDisabled(), 'no open port: the Start port select is disabled');
check(await page.locator(`${R} [data-testid=route-type]`).isDisabled(), 'no open port: the Network type select is disabled');
const noPortPlaceholder = await page.locator(`${R} [data-testid=route-port] option`).allInnerTexts();
const noTypePlaceholder = await page.locator(`${R} [data-testid=route-type] option`).allInnerTexts();
check(noPortPlaceholder.length === 1 && noPortPlaceholder[0] === 'None available', 'no open port: the Start port select shows the placeholder', JSON.stringify(noPortPlaceholder));
check(noTypePlaceholder.length === 1 && noTypePlaceholder[0] === 'None available', 'no open port: the Network type select shows the placeholder', JSON.stringify(noTypePlaceholder));
check((await page.locator(`${R} [data-testid=route-scope]`).count()) === 0, 'no open port: no scope part');
await t.shot('T11-no-open-port');
await escapeRoute();
await done(t);
await t.browser.close();

// ---------- Run 2: Dutch at 400 px (a new browser; the first one is closed) ----------
t = await open({ width: 400, height: 900, seed: { 'mepapp.settings.labelLanguage.v1': 'nl' } });
({ page, check, idle, nav } = t);
await t.start();
await t.openPdf(MAIN_PDF);
await idle(500);
await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), projectJson);
await idle(1500);
await page.evaluate((a) => {
  // Setup only: select the unit so that the dialog presets it.
  const s = window.__mepSketchScene;
  const stamp = s.listStamps().find((x) => x.id === a);
  if (stamp && s.selectStamps) s.selectStamps([a]);
}, aId);
await idle(300);
await openRoute();
const nlText = await page.locator(R).innerText();
const nlLines = await summary();
check(/^\d+ open aansluitingen? voor toevoerlucht in \d+ aangevinkte ruimtes?\.$/.test(nlLines[0] ?? ''), 'Dutch first summary line', nlLines[0]);
check(/Bereik/.test(nlText) && /Ruimtes/.test(nlText) && /Aansluitingen buiten ruimtes meenemen/.test(nlText) && /Startstempel/.test(nlText), 'Dutch labels show');
const nlTypeOptions = await page.locator(`${R} [data-testid=route-type] option`).allInnerTexts();
check(nlTypeOptions.length > 0 && nlTypeOptions.every((o) => /\(\d+ open\)$/.test(o)),'Dutch type options end with the open aansluitingen count', JSON.stringify(nlTypeOptions));
check(await noOverflow(), 'Dutch 400 px: no horizontal overflow');
const nlHead = await headCells();
console.log('NL HEAD ' + JSON.stringify(nlHead));
const nlOpenIdx = nlHead.findIndex((c) => c.text === 'Open');
check(nlOpenIdx >= 0, 'Dutch 400 px: the room header shows "Open"', JSON.stringify(nlHead.map((c) => c.text)));
const nlOpenTitle = nlOpenIdx >= 0 ? await page.locator(`${R} [data-testid=route-rooms-head] span`).nth(nlOpenIdx).getAttribute('title') : null;
check(nlOpenTitle === 'Open aansluitingen', 'Dutch 400 px: the header "Open" has the title "Open aansluitingen"', String(nlOpenTitle));
check(nlOpenIdx >= 0 && nlHead[nlOpenIdx].scroll <= nlHead[nlOpenIdx].client, 'Dutch 400 px: the header "Open" is not cut', JSON.stringify(nlHead[nlOpenIdx]));
check(nlHead.every((c) => !/…$|\.\.\.$/.test(c.text)), 'Dutch 400 px: no room header text ends with an ellipsis', JSON.stringify(nlHead.map((c) => c.text)));
check(nlHead.every((c) => c.scroll <= c.client), 'Dutch 400 px: no room header cell is cut', JSON.stringify(nlHead));
await t.shot('T11-narrow-400-nl');
await escapeRoute();
await done(t);
await t.browser.close();

// ---------- Step 8: the page count of each fixture PDF (one browser at a time) ----------
const counts = [];
for (const name of ALL_PDFS) {
  const tp = await open({ width: 1600, height: 1000 });
  try {
    await tp.start();
    await tp.openPdf(FIXTURES + name);
    const n = await tp.page.evaluate(() => window.__mepSketchScene.getPageCount());
    counts.push({ name, n });
    console.log(`PAGES ${name}: ${n}`);
    if (n > 1 && counts.filter((c) => c.n > 1).length === 1) {
      t = tp;
      ({ page, check, idle } = tp);
      await tp.openRoute();
      await page.locator(R).waitFor({ timeout: 20000 });
      const text = await page.locator(`${R} [data-testid=route-refusal]`).innerText();
      check(text.includes(String(n)), `real multi-page PDF ${name}: the dialog shows the refusal`, text);
      await tp.shot('T11-refusal');
      await page.keyboard.press('Escape');
      await done(tp);
    }
  } finally {
    await tp.browser.close();
  }
}
const multi = counts.filter((c) => c.n > 1);
if (multi.length === 0) {
  console.log('NEEDS_CONTEXT step 8: no real multi-page PDF in the fixtures (' + counts.map((c) => `${c.name}=${c.n}`).join(', ') + ')');
} else {
  console.log('Step 8: multi-page PDFs: ' + multi.map((c) => `${c.name}=${c.n}`).join(', '));
}
process.exitCode = anyFail ? 1 : 0;
