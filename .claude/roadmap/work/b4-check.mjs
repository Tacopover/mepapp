// B4-T10: part check of the risers flow on the two fixtures with real input.
// Make riser (right-click), blocked other type, attach by drawing into the ring, drag sync, undo sync, conflict dialog,
// live type change, pending move and retag on a closed level, delete level refused, Risers tab, export Building.
// Setup (documents, scale, building file) uses the scene API and the dev hook only.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b4/.claude/roadmap/browser/lib.mjs';
import { exportScope } from '/root/MepApp/.claude/worktrees/buildings-b4/.claude/roadmap/work/b2-lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b4/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();
await page.evaluate(() => { window.__toastLog = []; new MutationObserver(() => { for (const e of document.querySelectorAll('.mep-toast')) { const x = e.innerText; if (x && !window.__toastLog.includes(x)) window.__toastLog.push(x); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); });

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
const fittings = () => page.evaluate(() => window.__mepSketchScene.exportProject().fittings.map((f) => ({ id: f.id, x: f.position.x, y: f.position.y })));
const segTypes = () => page.evaluate(() => window.__mepSketchScene.exportProject().segments.map((x) => x.networkTypeId));
const buildingFile = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const rightClick = async (p) => {
  const at = await screenOf(p);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
};
const menuBox = page.locator('.mep-draw-from-menu');
const toasts = () => page.evaluate(() => window.__toastLog ?? []);
const toastText = async () => (await toasts()).join(' | ');
const anchors = () => page.evaluate(() => window.__mepSketchScene.getRiserAnchors().map((a) => ({ id: a.riserId, x: a.anchorPt.x, y: a.anchorPt.y })));
const dlg = page.locator('.mep-modal');
const docs = () => page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => ({ id: d.id, name: d.fileName, dirty: d.isDirty })));
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
const ppmm = () => page.evaluate(() => window.__mepSketchScene.getCalibration().pageUnitsPerRealUnit);
async function switchTo(name) {
  await page.locator('.mep-doc-switcher-btn').click();
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
  await idle(1200);
}
async function expectedPt() {
  const a = (await buildingFile()).risers[0].anchorMm;
  const k = await ppmm();
  const h = await pageH();
  return { x: a.xMm * k, y: h - a.yMm * k, anchor: a };
}
const near = (a, b, tol = 0.5) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
async function riserFitting() {
  const exp = await expectedPt();
  const fs = await fittings();
  fs.sort((p, q) => Math.hypot(p.x - exp.x, p.y - exp.y) - Math.hypot(q.x - exp.x, q.y - exp.y));
  return fs[0];
}
async function dragRiser(dx, dy) {
  const f = await riserFitting();
  const from = await screenOf(f);
  await page.mouse.click(from.x, from.y);
  await idle(400);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 8 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await idle(1500);
}
async function closeDoc(name) {
  const d = (await docs()).find((x) => x.name === name);
  await page.evaluate((id) => window.__mepSketchScene.closeDocument(id), d.id);
  await idle(800);
}
async function reopen(name) {
  await page.evaluate((n) => { window.__nextFile = n; }, name);
  await menu('Open…');
  await until(async () => /Loaded|Could not open/.test(await statusText()), 'open ' + name);
  await idle(1800);
}
async function changeTypeOfRun(label) {
  const fs = await fittings();
  const at = await screenOf({ x: (fs[0].x + fs[1].x) / 2, y: (fs[0].y + fs[1].y) / 2 });
  await page.mouse.click(at.x, at.y);
  await idle(500);
  const sel = page.locator('select').filter({ has: page.locator('option', { hasText: label }) }).first();
  if ((await sel.count()) === 0) return false;
  const optLabel = (await sel.locator('option', { hasText: label }).first().innerText()).trim();
  await sel.selectOption({ label: optLabel });
  await idle(1000);
  return true;
}
const decideLater = async () => {
  const b = dlg.locator('button', { hasText: /^Decide later$/ });
  if ((await b.count()) > 0) { await b.first().click(); await idle(400); }
};

// --- setup: the two fixtures, different scales ---
const uuid = {};
for (const [key, file, name, y, scale] of [['ground', '00_arch_ground_floor.pdf', 'ground.pdf', 400, 0.01], ['first', '01_arch_first_floor.pdf', 'first.pdf', 600, 0.01]]) {
  await t.openPdf(W + file, name);
  await setType('Supply air', 'supply-air', '#1f77b4');
  await drawSeg({ x: 300, y }, { x: 500, y });
  await page.evaluate((s) => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: s }), scale);
  uuid[key] = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
  await save(key);
}
const building = {
  schemaVersion: 1, id: 'b-t10', name: 'Tower',
  levels: [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 3000 }],
  sheets: [
    { id: 's1', levelId: 'l0', projectUuid: uuid.ground, pageIndex: 0, displayName: 'Ground', location: { fileName: 'ground.pdf', path: 'ground.pdf' } },
    { id: 's2', levelId: 'l1', projectUuid: uuid.first, pageIndex: 0, displayName: 'First', location: { fileName: 'first.pdf', path: 'first.pdf' } },
  ],
  risers: [],
};
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
await page.evaluate(async () => {
  const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
  await window.__mepBuilding.rebuildSummaries(read);
});
await idle(800);

// --- 1. Make riser on level 0 ---
await switchTo('ground.pdf');
const F0 = { x: 300, y: 400 };
await rightClick(F0);
await shot('B4-T10-01-menu');
await menuBox.locator('button', { hasText: /^Make riser$/ }).click();
await idle(700);
{
  const tx = await toastText();
  check(/Supply air riser 1 made on Level 0\./i.test(tx), 'toast after Make riser', tx);
  const file = await buildingFile();
  check(file.risers.length === 1 && file.risers[0].members.length === 1, 'building file holds one riser with one part', JSON.stringify(file.risers.map((r) => r.name)));
  await shot('B4-T10-02-made');
}

// --- 2. Level 1: other type is blocked, the right type attaches ---
await switchTo('first.pdf');
const ring = await anchors();
check(ring.length === 1, 'level 1 shows the free ring', JSON.stringify(ring));
await shot('B4-T10-03-ring');
{
  await setType('Extract air', 'extract-air', '#d6811a');
  const segsBefore = (await segTypes()).length;
  const fitsBefore = (await fittings()).length;
  await tool('Segment');
  const s = await screenOf({ x: ring[0].x - 150, y: ring[0].y });
  await page.mouse.click(s.x, s.y);
  await idle(400);
  const e = await screenOf({ x: ring[0].x, y: ring[0].y });
  await page.mouse.move(e.x, e.y);
  await idle(600);
  await shot('B4-T10-04-blocked');
  await page.mouse.click(e.x, e.y);
  await idle(700);
  await page.keyboard.press('Escape');
  await tool('Select');
  const file = await buildingFile();
  check(file.risers[0].members.length === 1, 'a segment of another type does not join the riser', JSON.stringify(file.risers[0].members.length));
  const segsAfter = (await segTypes()).length;
  console.log('BLOCKED segs', segsBefore, '->', segsAfter, 'fittings', fitsBefore, '->', (await fittings()).length);
  if (segsAfter > segsBefore) {
    await page.locator('.mep-rail-btn[title="Undo"]').click();
    await idle(700);
    check((await segTypes()).length === segsBefore, 'undo removed the stray extract segment');
  }
}
{
  await setType('Supply air', 'supply-air', '#1f77b4');
  await tool('Segment');
  for (const p of [{ x: ring[0].x, y: ring[0].y + 150 }, { x: ring[0].x, y: ring[0].y }]) {
    const at = await screenOf(p);
    await page.mouse.click(at.x, at.y);
    await idle(400);
  }
  await until(async () => ((await buildingFile()).risers[0]?.members.length ?? 0) === 2, 'attach in the building file');
  await page.keyboard.press('Escape');
  await tool('Select');
  await idle(500);
  const tx = await toastText();
  check(/riser 1 attached on Level 1\./i.test(tx), 'toast after drawing into the ring', tx);
  check((await anchors()).length === 0, 'the ring is gone after the attach');
  await shot('B4-T10-05-attached');
}
await save('first with riser');
await switchTo('ground.pdf');
await save('ground with riser');

// --- 3. Drag on level 0: level 1 follows ---
const anchor0 = (await buildingFile()).risers[0].anchorMm;
{
  await dragRiser(80, -80);
  const a = (await buildingFile()).risers[0].anchorMm;
  check(a.xMm > anchor0.xMm && a.yMm > anchor0.yMm, 'dragged up and right: anchor grows (mm, y up)', JSON.stringify({ anchor0, a }));
  check(/moved to match the building\./.test(await toastText()), 'toast after the sync', await toastText());
  check((await dlg.count()) === 0, 'no dialog after the synced drag');
  await shot('B4-T10-06-dragged');
  const exp = await expectedPt();
  check((await fittings()).some((f) => near(f, exp, 1)), 'level 0 fitting is at the anchor');
  await switchTo('first.pdf');
  const exp1 = await expectedPt();
  check((await fittings()).some((f) => near(f, exp1, 1)), 'level 1 fitting moved to the same real position (other scale)', JSON.stringify(exp1));
  check((await docs()).find((x) => x.name === 'first.pdf')?.dirty === true, 'level 1 is unsaved after the sync');
  await shot('B4-T10-07-followed');
}

// --- 4. Undo on level 0 syncs level 1 ---
await switchTo('ground.pdf');
{
  const before = (await buildingFile()).risers[0].anchorMm;
  await page.locator('.mep-rail-btn[title="Undo"]').click();
  await idle(1500);
  const a = (await buildingFile()).risers[0].anchorMm;
  check(Math.abs(a.xMm - anchor0.xMm) < 0.05 && Math.abs(a.yMm - anchor0.yMm) < 0.05 && a.xMm !== before.xMm, 'undo puts the anchor back', JSON.stringify({ anchor0, before, a }));
  await switchTo('first.pdf');
  const exp1 = await expectedPt();
  check((await fittings()).some((f) => near(f, exp1, 1)), 'level 1 followed the undo');
  await shot('B4-T10-08-undo-synced');
}

// --- 5. Conflict dialog: a new scale on level 1 ---
{
  await page.evaluate(() => window.__mepSketchScene.applyCalibration({ pageUnitsPerRealUnit: 0.012 }));
  let seen = false;
  try { await dlg.waitFor({ state: 'visible', timeout: 5000 }); seen = true; } catch {}
  check(seen, 'conflict dialog opens after a new scale');
  if (seen) {
    const text = await dlg.innerText();
    check(/is not at the building position/.test(text) && /Snap back/.test(text) && /Move the riser here/.test(text) && /Decide later/.test(text), 'dialog has the title and three choices', text.slice(0, 200));
    await shot('B4-T10-09-conflict');
    await page.keyboard.press('Escape');
    await idle(500);
    check((await dlg.count()) === 0 && /not at the building position\.$/.test((await toasts()).slice(-1)[0] ?? ''), 'Decide later closes the dialog and leaves a notice', (await toasts()).slice(-1)[0] ?? '');
    await switchTo('ground.pdf');
    await switchTo('first.pdf');
    let again = false;
    try { await dlg.waitFor({ state: 'visible', timeout: 4000 }); again = true; } catch {}
    check(again, 'the dialog shows again when the sheet opens again');
    await dlg.locator('button', { hasText: /^Snap back$/ }).click();
    await idle(1200);
    const exp = await expectedPt();
    check((await dlg.count()) === 0 && (await fittings()).some((f) => near(f, exp, 1)), 'Snap back puts the fitting at the building position');
    await shot('B4-T10-10-snapped');
  }
}
await save('first after snap');

// --- 6. Type change on a run: both levels open, all levels retag at once (D-B-13) ---
await switchTo('ground.pdf');
{
  const ok = await changeTypeOfRun(/Exhaust Air/i);
  check(ok, 'the type select offers Exhaust Air');
  const file = await buildingFile();
  console.log('RETAG riser', file.risers[0].name, file.risers[0].networkTypeId, 'TOASTS', await toastText());
  check(/exhaust/i.test(file.risers[0].networkTypeId), 'the riser has the new type in the building file', file.risers[0].networkTypeId);
  check((await segTypes()).every((x) => /exhaust/i.test(x)), 'level 0 run has the new type', JSON.stringify(await segTypes()));
  await shot('B4-T10-11-retag-open');
  await switchTo('first.pdf');
  { const ty = await segTypes(); check(ty.includes('exhaust-air') && ty.includes('supply-air'), 'level 1: the riser run was retagged, the unconnected segment keeps its type', JSON.stringify(ty)); }
  await save('first after retag');
  await switchTo('ground.pdf');
  await save('ground after retag');
}

// --- 7. Closed level: pending move and pending retag, applied when it opens ---
await closeDoc('first.pdf');
{
  await dragRiser(-60, 40);
  let file = await buildingFile();
  check(file.risers[0].pending.some((o) => o.kind === 'move'), 'closed level keeps a pending move', JSON.stringify(file.risers[0].pending));
  const ok = await changeTypeOfRun(/Supply air/i);
  check(ok, 'the type select offers Supply air');
  file = await buildingFile();
  check(file.risers[0].pending.some((o) => o.kind === 'retag'), 'closed level keeps a pending retag', JSON.stringify(file.risers[0].pending));
  await shot('B4-T10-12-pending');
}
await reopen('first.pdf');
{
  const file = await buildingFile();
  check(file.risers[0].pending.length === 0, 'pending ops leave the building file', JSON.stringify(file.risers[0].pending));
  const exp = await expectedPt();
  check((await fittings()).some((f) => near(f, exp, 1)), 'level 1 fitting is at the building position after open');
  check((await segTypes()).every((x) => x === 'supply-air'), 'level 1 run got the pending type', JSON.stringify(await segTypes()));
  console.log('PENDING TOASTS', await toastText());
  await decideLater();
  await shot('B4-T10-13-pending-applied');
}
await save('first after pending');
await switchTo('ground.pdf');
await save('ground after pending');

// --- 8. Delete a level that holds a riser part: refused ---
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
{
  const levels = dlg.locator('[role="treeitem"][data-kind="level"]');
  const n = await levels.count();
  await dlg.locator('[role="treeitem"][data-kind="level"]', { hasText: 'Level 1' }).click();
  await idle(400);
  const reason = await dlg.locator('[data-testid="delete-reason"]').innerText();
  check(/^This level has 1 sheet\. Move or remove it to delete the level\.$/.test(reason), 'the delete reason is shown', reason);
  await dlg.locator('[data-testid="level-row"] button', { hasText: /^Delete$/ }).click({ force: true });
  await idle(500);
  check((await levels.count()) === n && n === 2, 'the level stays after the click on Delete', String(await levels.count()));
  check((await buildingFile()).levels.length === 2, 'the building file keeps both levels');
  await shot('B4-T10-14-delete-level-refused');
}

// --- 9. Risers tab ---
const tab = dlg.getByRole('tab', { name: /^Risers/ });
check((await tab.count()) === 1, 'the Risers tab exists');
await tab.click();
await idle(600);
const lanes = dlg.locator('svg [role="radio"]');
check((await lanes.count()) === 1, 'one lane for the riser', String(await lanes.count()));
await shot('B4-T10-15-risers-tab');
const typeId = (await buildingFile()).risers[0].networkTypeId;
await dlg.locator(`[data-testid="riser-filter-${typeId}"]`).click();
await idle(400);
check((await lanes.count()) === 0, 'unchecking the type hides the riser');
await shot('B4-T10-16-filter');
await dlg.locator(`[data-testid="riser-filter-${typeId}"]`).click();
await idle(400);
check((await lanes.count()) === 1, 'checking the type shows the riser again');
const info = dlg.locator('[data-testid="riser-info"]');
await lanes.first().locator('text').first().click();
await idle(400);
const rows = dlg.locator('[data-testid="riser-row"]');
check(/riser 1/.test(await info.innerText()) && (await rows.count()) === 2, 'info shows the label and two level rows', (await info.innerText()).slice(0, 80));
await shot('B4-T10-17-info');
// Go to the open sheet
await rows.filter({ hasText: 'Level 1' }).first().locator('[data-testid="riser-goto"]').click();
await idle(1500);
{
  const active = await page.evaluate(() => { const s = window.__mepSketchScene; return s.getDocuments().find((d) => d.id === s.getActiveDocumentId())?.fileName; });
  check(active === 'first.pdf', 'Go to switches to the sheet of that level', String(active));
  check((await dlg.count()) === 1, 'the dialog stays open after Go to');
}

// --- 10. Export Building (before Detach) ---
await page.keyboard.press('Escape');
await idle(500);
{
  await page.evaluate(() => { const orig = window.showSaveFilePicker; window.__suggested = []; window.showSaveFilePicker = async (o) => { window.__suggested.push(o?.suggestedName); return orig(o); }; });
  const file = await buildingFile();
  const riser = file.risers[0];
  const all = await exportScope(t, 'building');
  console.log('BUILDING SHEETS', JSON.stringify(all.xlsx.sheetNames), all.suggested);
  const rs = all.xlsx.sheets.Risers ?? [];
  console.log('RISERS', JSON.stringify(rs));
  check(all.xlsx.sheetNames.includes('Risers') && rs.length === 2, 'Building export has a Risers sheet with one span row', String(rs.length));
  const head = rs[0] ?? [];
  const lenCol = head.indexOf('Floor-to-floor length (m)');
  check(lenCol >= 0 && Number(rs[1]?.[lenCol]) === 3, 'span length is 3 m', JSON.stringify(rs[1]));
  check(rs[1]?.[head.indexOf('Riser')] === riser.name, 'span row names the riser', JSON.stringify(rs[1]));
  check(head.includes('Flow set by'), 'Risers sheet has Flow set by', JSON.stringify(head));
  const bn = all.xlsx.sheets['Building networks'] ?? [];
  console.log('BUILDING NETWORKS', JSON.stringify(bn));
  check(all.xlsx.sheetNames.includes('Building networks') && bn.length >= 2, 'Building networks sheet has a row');
  const fit = all.xlsx.sheets.Fittings ?? [];
  const fh = fit[0] ?? [];
  const riserCol = fh.indexOf('Riser');
  check(riserCol >= 0, 'Fittings has a Riser column', JSON.stringify(fh));
  check(fit.slice(1).filter((r) => r[riserCol] === riser.name).length === 2, 'two fitting rows carry the riser label', JSON.stringify(fit.slice(1).map((r) => r[riserCol])));
  const warns = (all.xlsx.sheets.Warnings ?? []).flat();
  console.log('WARNINGS', JSON.stringify(warns));
  check(warns.includes('Flow is not summed across levels.'), 'flow warning on Warnings');
  await page.evaluate((txt) => {
    const d = document.createElement('pre');
    d.id = 'mep-check-overlay';
    d.style.cssText = 'position:fixed;left:40px;top:60px;right:40px;z-index:99999;background:#fff;color:#000;padding:16px;font:13px monospace;border:2px solid #333;white-space:pre-wrap';
    d.textContent = txt;
    document.body.append(d);
  }, `Risers sheet\n${rs.map((r) => r.join(' | ')).join('\n')}\n\nBuilding networks\n${bn.map((r) => r.join(' | ')).join('\n')}\n\nWarnings\n${warns.join('\n')}`);
  await idle(300);
  await shot('B4-T10-18-export');
  await page.evaluate(() => document.getElementById('mep-check-overlay')?.remove());
}

// --- 11. Detach and Delete riser in the tab ---
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
await dlg.getByRole('tab', { name: /^Risers/ }).click();
await idle(500);
await lanes.first().locator('text').first().click();
await idle(400);
await rows.filter({ hasText: 'Level 1' }).first().locator('[data-testid="riser-detach"]').click();
await idle(800);
{
  const file = await buildingFile();
  check(file.risers[0].members.length === 1, 'Detach removes the part of Level 1', String(file.risers[0].members.length));
  check(/detached from Level 1\./.test(await dlg.locator('[data-testid="sheets-notice"]').innerText()), 'notice names the level');
  await shot('B4-T10-19-detached');
}
await dlg.locator('[data-testid="riser-delete"]').click();
await idle(400);
{
  const q = page.locator('.mep-modal', { hasText: /^Delete .*riser 1\?|Delete .* riser 1\?/ });
  check((await q.count()) >= 1, 'Delete riser asks first');
  await shot('B4-T10-20-delete-ask');
  await page.locator('.mep-modal button', { hasText: /^Delete riser$/ }).last().click();
  await idle(800);
  check((await buildingFile()).risers.length === 0, 'the confirmed delete removes the riser');
  await shot('B4-T10-21-deleted');
}
await t.finish();
