// B4-T09: Risers tab as a building diagram. Real clicks and typing in the dialog.
// Setup (documents, building file) uses the scene API and the dev hook only.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b4/.claude/roadmap/browser/lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b4/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const screenOf = (p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);
const tool = async (title) => {
  await page.locator(`button.mep-rail-btn[title="${title}"]`).click();
  await idle(300);
};
async function drawSeg(from, to) {
  await tool('Segment');
  for (const p of [from, to]) {
    const at = await screenOf(p);
    await page.mouse.click(at.x, at.y);
    await idle(500);
  }
  await page.keyboard.press('Escape');
  await idle(300);
  await tool('Select');
}
const setType = (name, id, color) =>
  page.evaluate(([name, id, color]) => window.__mepSketchScene.setActiveNetworkType({ id, name, discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color, lineWidthPt: 1, linePattern: 'solid' }), [name, id, color]);
async function save(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
}
const buildingFile = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const loadBuilding = (b) => page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(b));
const dlg = page.locator('.mep-modal');
async function switchTo(name) {
  await page.locator('.mep-doc-switcher-btn').click();
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
  await idle(1200);
}

// --- setup: two real documents, one riser made by the real right-click ---
const uuid = {};
for (const [key, file, name, y] of [['ground', '00_arch_ground_floor.pdf', 'ground.pdf', 400], ['first', '01_arch_first_floor.pdf', 'first.pdf', 600]]) {
  await t.openPdf(W + file, name);
  await setType('Supply Air', 'supply-air', '#1f77b4');
  await drawSeg({ x: 300, y }, { x: 500, y });
  await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
  uuid[key] = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
  await save(key);
}
const netType = (id, name, color, linePattern) => ({ id, name, discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color, lineWidthPt: 1, linePattern });
const supply = netType('supply-air', 'Supply Air', '#1f77b4', 'solid');
const extract = netType('extract-air', 'Extract air', '#d6811a', 'dashed');
const drain = netType('drainage', 'Drainage', '#6b4a2b', 'dotted');
const sheet = (id, levelId, key, name, uuidv) => ({ id, levelId, projectUuid: uuidv ?? null, pageIndex: 0, displayName: name, location: { fileName: `${key}.pdf`, ...(uuidv ? { path: `${key}.pdf` } : {}) } });
const riser = (id, name, type, x, members, extra = {}) => ({ id, name, networkTypeId: type.id, networkType: type, anchorMm: { xMm: x, yMm: 4000 }, flow: 'unknown', topEnd: 'member', bottomEnd: 'member', endAllowanceMm: 0, members, pending: [], ...extra });
const mem = (levelId, sheetId, fittingId) => ({ levelId, sheetId, pageIndex: 0, fittingId });
const building = {
  schemaVersion: 1, id: 'b-t09', name: 'Tower',
  levels: [
    { id: 'l0', name: 'Basement', elevationMm: -3000 }, { id: 'l1', name: 'Ground floor', elevationMm: 0 },
    { id: 'l2', name: 'Level 1', elevationMm: 3000 }, { id: 'l3', name: 'Level 2', elevationMm: 6000 },
  ],
  sheets: [
    sheet('s0', 'l0', 'basement', 'Basement', null), sheet('s1', 'l1', 'ground', 'Ground', uuid.ground),
    sheet('s2', 'l2', 'first', 'First', uuid.first), sheet('s3', 'l3', 'roof', 'Roof', null),
  ],
  risers: [
    riser('r1', 'Supply Air riser 1', supply, 3000, [mem('l0', 's0', 'f1'), mem('l1', 's1', 'f1'), mem('l3', 's3', 'f1')], { pending: [{ seq: 1, sheetId: 's0', kind: 'move', toMm: { xMm: 3000, yMm: 4000 } }] }),
    riser('r2', 'Supply Air riser 2', supply, 4000, [mem('l1', 's1', 'f9'), mem('l2', 's2', 'f9'), mem('l3', 's3', 'f9')]),
    riser('r3', 'Extract air riser 1', extract, 5000, [mem('l0', 's0', 'f3'), mem('l1', 's1', 'f3'), mem('l2', 's2', 'f3'), mem('l3', 's3', 'f3')]),
    riser('r4', 'Drainage riser 1', drain, 6000, [mem('l0', 's0', 'f4'), mem('l1', 's1', 'f4'), mem('l2', 's2', 'f4')]),
  ],
};
await loadBuilding(building);
await switchTo('ground.pdf');
// r1 anchor is far from any fitting of the open sheet: the ground part of r1 is not at its position when the sheet has a mark.
// The real fitting is marked through the right-click, so make r5 for the ground fitting, then move its anchor in the file.
{
  const at = await screenOf({ x: 300, y: 400 });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
  await page.locator('.mep-draw-from-menu button', { hasText: /^Make riser$/ }).click();
  await idle(900);
  let f = await buildingFile();
  const made = f.risers.find((r) => !['r1', 'r2', 'r3', 'r4'].includes(r.id));
  globalThis.madeName = made?.name;
  check(made !== undefined, 'Make riser made a riser', JSON.stringify(f.risers.map((r) => r.name)));
  made.anchorMm = { xMm: made.anchorMm.xMm + 400, yMm: made.anchorMm.yMm };
  await loadBuilding(f);
  await idle(1200);
  await page.locator(".mep-modal button", { hasText: "Decide later" }).click({ timeout: 8000 });
  await idle(500);
}

// --- the tab ---
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
}
await openDialog();
const tab = dlg.getByRole('tab', { name: /^Risers/ });
check((await tab.count()) === 1, 'the Risers tab exists');
check(/Risers \(5\)/.test(await tab.innerText()), 'tab shows the count', await tab.innerText());
await tab.click();
await idle(600);
const lanes = dlg.locator('svg [role="radio"]');
check((await lanes.count()) === 5, 'five lanes', String(await lanes.count()));
check((await dlg.locator('[data-testid="risers-pane"]').count()) === 1, 'pane is shown');
await shot('B4-T09-tab');

const geometry = () =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll('.mep-rd-level-line')].map((l) => Number(l.getAttribute('y1') ?? l.getAttribute('y')));
    const lanes = [...document.querySelectorAll('svg [role="radio"]')].map((g) => {
      const line = g.querySelector('line');
      return { id: g.getAttribute('data-riser-id'), label: g.getAttribute('aria-label'), x: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')), y2: Number(line.getAttribute('y2')), dash: line.getAttribute('stroke-dasharray'), stroke: line.getAttribute('stroke') };
    });
    return { lines, lanes };
  });
{
  const g = await geometry();
  console.log('GEOMETRY', JSON.stringify(g));
  const s = g.lanes.filter((l) => /^Supply Air riser/.test(l.label ?? ''));
  check(s.length === 3, 'three Supply Air lanes', JSON.stringify(s.map((x) => x.label)));
  check(s[1].x - s[0].x === 84 && s[2].x - s[1].x === 84, 'same-type lanes sit side by side, 84 px apart', JSON.stringify(s.map((x) => x.x)));
  check(g.lanes.every((l) => g.lines.every((ly) => Math.abs(l.y1 - ly) > 4 && Math.abs(l.y2 - ly) > 4)), 'no riser line starts or stops on a level line', JSON.stringify(g));
  const ex = g.lanes.find((l) => /Extract/.test(l.label ?? ''));
  const dr = g.lanes.find((l) => /Drainage/.test(l.label ?? ''));
  check(ex.dash && dr.dash && ex.dash !== dr.dash && !s[0].dash, 'line patterns differ by type', JSON.stringify({ ex: ex.dash, dr: dr.dash, s: s[0].dash }));
}

// filter
const filterOf = (id) => dlg.locator(`[data-testid="riser-filter-${id}"]`);
await filterOf('extract-air').click();
await idle(400);
check((await lanes.count()) === 4, 'unchecking Extract air hides its riser', String(await lanes.count()));
await shot('B4-T09-filter');
await filterOf('extract-air').click();
await idle(400);
check((await lanes.count()) === 5, 'checking Extract air shows it again');

// select, info
const info = dlg.locator('[data-testid="riser-info"]');
await dlg.locator('svg [role="radio"][aria-label^="Supply Air riser 1"] text').first().click();
await idle(300);
check(/Supply Air riser 1/.test(await info.innerText()), 'a click selects the riser and the info shows its label', (await info.innerText()).slice(0, 80));
{
  const title = async () => (await info.locator('h4').innerText()).trim();
  const was = await title();
  await page.keyboard.press('ArrowRight');
  await idle(300);
  const now = await title();
  check(now !== was, 'ArrowRight selects the next riser', `${was} -> ${now}`);
  await page.keyboard.press('Enter');
  await idle(300);
  check(await page.evaluate(() => document.activeElement?.tagName === 'H4'), 'Enter moves the focus to the info title');
  await dlg.locator('svg [role="radio"][aria-label^="Supply Air riser 1"] text').first().click();
  await idle(300);
}
const rows = dlg.locator('[data-testid="riser-row"]');
check((await rows.count()) === 3, 'three level rows for riser 1', String(await rows.count()));
check(/Waiting/.test(await rows.nth(2).innerText()), 'pending part shows Waiting', await rows.allInnerTexts().then((x) => x.join(' / ')));
await shot('B4-T09-info');
// not at position: the made riser (riser 3)
await dlg.locator(`svg [role="radio"][aria-label^="${globalThis.madeName}"] text`).first().click();
await idle(400);
const r3rows = await rows.allInnerTexts();
check(r3rows.some((x) => /Not at position/.test(x)), 'live conflict shows Not at position', r3rows.join(' / '));
await shot('B4-T09-status');
// flow box
check((await dlg.locator('[data-testid="riser-flow-box"]').count()) === 1, 'flow box is shown');

{
  await dlg.locator('svg [role="radio"][aria-label^="Extract air riser 1"] text').first().click();
  await idle(200);
  const box = await dlg.locator(`svg [role="radio"][aria-label^="${globalThis.madeName}"] .mep-rd-hit`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await idle(300);
  check((await info.locator('h4').innerText()).includes(globalThis.madeName), 'a click in the middle of a one-level lane selects it', await info.locator('h4').innerText());
}

// Go to: riser 2 has a part on the open sheet first.pdf
await dlg.locator('svg [role="radio"][aria-label^="Supply Air riser 2"] text').first().click();
await idle(300);
await rows.filter({ hasText: 'Level 1' }).first().locator('[data-testid="riser-goto"]').click();
await idle(1500);
{
  const active = await page.evaluate(() => { const s = window.__mepSketchScene; return s.getDocuments().find((d) => d.id === s.getActiveDocumentId())?.fileName; });
  check(active === 'first.pdf', 'Go to switches to the open document', String(active));
  check((await dlg.count()) === 1, 'the dialog stays open after Go to');
  check((await page.evaluate(() => window.__mepSketchScene.getDocuments().length)) === 2, 'no second tab for the same file');
}

// Detach on riser 3 (extract)
await dlg.locator('svg [role="radio"][aria-label^="Extract air riser 1"] text').first().click();
await idle(300);
const before = (await buildingFile()).risers.find((r) => r.id === 'r3').members.length;
await rows.filter({ hasText: 'Level 1' }).first().locator('[data-testid="riser-detach"]').click();
await idle(800);
const after = (await buildingFile()).risers.find((r) => r.id === 'r3').members.length;
check(after === before - 1, 'Detach removes one part', `${before} -> ${after}`);
check(/Extract air riser 1 detached from Level 1\./.test(await dlg.locator('[data-testid="sheets-notice"]').innerText()), 'notice names the riser and level');

// Set by hand
await dlg.locator('[data-testid="riser-set-by-hand"]').click();
await dlg.locator('[data-testid="riser-flow-select"]').selectOption({ label: 'Down' });
await idle(700);
check((await buildingFile()).risers.find((r) => r.id === 'r3').flow === 'down', 'Set by hand writes the direction');
await dlg.locator('[data-testid="riser-use-solve"]').click();
await idle(700);
check((await buildingFile()).risers.find((r) => r.id === 'r3').flow === 'unknown', 'Use the flow solve clears it');

// More details: end allowance by typing
await dlg.locator('[data-testid="riser-more-details"]').click();
await dlg.locator('[data-testid="riser-top-end"]').selectOption({ label: 'Open' });
await idle(500);
const allowance = dlg.locator('[data-testid="riser-end-allowance"]');
await allowance.fill('300');
await allowance.press('Enter');
await idle(700);
check((await buildingFile()).risers.find((r) => r.id === 'r3').endAllowanceMm === 300, 'end allowance typed and saved');
await allowance.fill('-5');
await allowance.press('Tab');
await idle(400);
check((await dlg.getByText('Enter a number of 0 or more.').count()) === 1, 'an invalid number shows a message');
check((await buildingFile()).risers.find((r) => r.id === 'r3').endAllowanceMm === 300, 'an invalid number writes nothing');
await allowance.fill('300');
await allowance.press('Enter');
await idle(400);
await shot('B4-T09-details');

// Delete with confirmation
await dlg.locator('svg [role="radio"][aria-label^="Drainage riser 1"] text').first().click();
await idle(300);
await dlg.locator('[data-testid="riser-delete"]').click();
await idle(400);
const q = page.locator('.mep-modal', { hasText: 'Delete Drainage riser 1?' });
check((await q.count()) >= 1, 'delete asks first');
await shot('B4-T09-delete');
await page.keyboard.press('Escape');
await idle(400);
check((await buildingFile()).risers.some((r) => r.id === 'r4'), 'Escape keeps the riser');
check((await dlg.count()) === 1, 'Escape closed only the question');
await dlg.locator('[data-testid="riser-delete"]').click();
await idle(400);
await page.locator('.mep-modal button', { hasText: /^Delete riser$/ }).last().click();
await idle(800);
check(!(await buildingFile()).risers.some((r) => r.id === 'r4'), 'confirmed delete removes the riser');

// widths
for (const [w, h] of [[1100, 800], [760, 640]]) {
  await page.setViewportSize({ width: w, height: h });
  await idle(600);
  await shot(`B4-T09-w${w}`);
}
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
await page.keyboard.press('Escape');
await idle(400);

// ring labels on the drawing: first.pdf has no part of Supply Air riser 1
const ringLabels = await page.evaluate(() => window.__mepSketchScene.getVisibleRiserAnchors().map((a) => a.label));
check(ringLabels.length > 0, 'a ring shows on the other level', JSON.stringify(ringLabels));
await idle(600);
await shot('B4-T09-ring-label');
await t.finish();
