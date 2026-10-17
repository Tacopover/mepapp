// R4 part check (T20): the route area, the menu switch, the dialog section and the room type list, through real DOM inputs.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/r4-check.mjs
// The scene API is used for setup and for reading state only. Clicks stay inside .mep-modal. No backdrop click.
// Run 1: English, first floor, shaft made. Run 2: no Detect rooms. Run 3: seeded ["shaft"], no shaft made.
// Run 4: plattegrond begane grond 10A.pdf at 1:100. Run 5: seeded ["corridor"].
import { existsSync } from 'node:fs';
import { open, setupRooms, screenOf, colorPixelsIn, isPurple, isTeal, baseline, sameAsBaseline } from './r4-lib.mjs';

const FIXTURES = '/root/MepApp/fixtures/pdfs/';
const PDF1 = FIXTURES + '01_arch_first_floor.pdf';
const PDF10A = FIXTURES + 'plattegrond begane grond 10A.pdf';
const KEY = 'mepapp.routeRoomTypes.v1';
const R = '.mep-modal--route';
const FINDINGS = [];
const finding = (text) => {
  FINDINGS.push(text);
  console.log(`FINDING ${text}`);
};
let worst = 0;

/** Counts the pixels of a screen clip for which predicate(r, g, b) is true. */
async function countIn(page, clip, predicate) {
  const png = await page.screenshot({ clip });
  const px = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data);
  }, png.toString('base64'));
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (predicate(px[i], px[i + 1], px[i + 2])) n++;
  return n;
}
// The canvas part left of the dialog.
const CANVAS_CLIP = { x: 0, y: 60, width: 1000, height: 900 };
const overlayPixels = async (page) => (await countIn(page, CANVAS_CLIP, isPurple)) + (await countIn(page, CANVAS_CLIP, isTeal));
// The PDF has pixels of its own that match the colors. The overlay adds none when the count with the dialog open is not above the count with the show box unchecked.
async function addsNoOverlay(page) {
  const on = await overlayPixels(page);
  const box = page.locator('[data-testid="route-area-show"]');
  await box.uncheck();
  await page.waitForTimeout(600);
  const off = await overlayPixels(page);
  await box.check();
  await page.waitForTimeout(600);
  console.log('overlay pixels with the box checked ' + on + ', unchecked ' + off);
  return on <= off;
}

const helpers = (t) => {
  const { page, idle } = t;
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const view = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea())));
  const flag = () => page.evaluate(() => window.__mepSketchScene.isRouteAreaVisible());
  const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
  const chipIds = async () => (await tid('route-area-type').evaluateAll((els) => els.map((e) => e.getAttribute('data-type-id')))).sort();
  const firstInt = (s) => Number((s.match(/\d+/) ?? ['-1'])[0]);
  const menuItem = (re) => page.locator('button.mep-menu-item', { hasText: re });
  const openDialog = async () => {
    await page.locator('button.mep-menu-btn').click();
    await menuItem(/^\s*Route network…\s*$/).click();
    await page.locator(R).waitFor({ state: 'visible', timeout: 5000 });
    await idle(600);
  };
  const countOf = (types) =>
    page.evaluate((types) => {
      const s = window.__mepSketchScene;
      return s.listRooms().filter((r) => r.pageIndex === s.getPageIndex() && types.includes(r.roomTypeId)).length;
    }, types);
  const lineText = async (code) => ((await tid(`route-area-line-${code}`).count()) > 0 ? (await tid(`route-area-line-${code}`).first().innerText()).trim() : null);
  return { tid, view, flag, stored, chipIds, firstInt, menuItem, openDialog, countOf, lineText };
};

// ---------------------------------------------------------------- Run 1
{
  console.log('\n=== RUN 1: English, first floor, shaft made ===');
  const t = await open();
  const { page, check, idle } = t;
  const h = helpers(t);
  const { tid } = h;
  const { rooms, shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
  check(rooms.length > 0, 'setup: rooms found', String(rooms.length));
  check(shaftId !== null, 'setup: a shaft room exists', String(shaftId));
  const base = await baseline(page);
  const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());

  // Step 2: the model
  const tCall = Date.now();
  const v0 = await h.view();
  console.log(`first getRouteArea() on the first floor: ${Date.now() - tCall} ms (includes the round trip)`);
  const area = v0.area;
  const codes = v0.warnings.map((w) => w.code);
  check(area.status === 'ok', 'model: the route area status is ok', area.status);
  const expectedRooms = await h.countOf(['corridor', 'shaft']);
  check(area.rooms.length === expectedRooms, 'model: the room count equals the independent count from listRooms()', `${area.rooms.length} vs ${expectedRooms}`);
  const primary = area.entries.filter((e) => e.primary);
  check(primary.length >= 10, 'model: at least 10 primary entries', String(primary.length));
  const outside = await page.evaluate((nodes) => {
    const s = window.__mepSketchScene;
    const byId = new Map(s.listRooms().map((r) => [r.id, r]));
    const inRing = (ring, p) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    const near = (ring, p) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        if (Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)) < 1) return true;
      }
      return false;
    };
    const bad = [];
    for (const n of nodes) {
      if (!['end', 'junction', 'bend', 'tap'].includes(n.kind)) continue;
      const room = byId.get(n.roomId);
      const o = room?.polygon.outer;
      if (!o || !(inRing(o, n.point) || near(o, n.point))) bad.push(n.id);
    }
    return bad;
  }, area.nodes);
  check(outside.length === 0, 'model: every end, junction, bend and tap node lies inside its path room', `${outside.length} outside: ${outside.slice(0, 3).join(',')}`);
  check(codes.includes('wall-crossings'), 'model: the warnings hold wall-crossings', JSON.stringify(codes));
  check(codes[codes.length - 1] === 'draft-2d', 'model: draft-2d is the last warning', JSON.stringify(codes));
  if (codes.includes('shaft-crossing')) check(true, 'model: the warnings hold shaft-crossing');
  else console.log('NOTE the made shaft has no wall stretch (no shaft-crossing warning)');
  console.log('route-area room names:', JSON.stringify(area.rooms.map((r) => `${r.kind}:${r.name ?? '-'}`)));
  console.log(
    `counts: rooms ${area.rooms.length}, nodes ${area.nodes.length}, edges ${area.edges.length}, entries ${area.entries.length} (primary ${primary.length}), links ${area.links.length}, unreached ${area.unreached.length}, parts ${area.parts}, warnings ${JSON.stringify(codes)}`,
  );
  const stairRooms = area.rooms.filter((r) => /trap/i.test(r.name ?? ''));

  // A center node on the canvas, left of where the dialog will be.
  let q = null;
  for (const n of area.nodes.filter((x) => x.kind !== 'wall' && x.kind !== 'shaft')) {
    const s = await screenOf(page, n.point);
    if (s.x > 60 && s.x < 1000 && s.y > 80 && s.y < 920) { q = s; if (n.kind === 'junction') break; }
  }
  check(q !== null, 'setup: a center node is left of the dialog area', JSON.stringify(q));
  check(!(await h.flag()), 'the flag is false at first');
  check((await countIn(page, CANVAS_CLIP, isPurple)) === 0, 'no purple pixel before the switch');

  // Step 3: the menu switch with real clicks
  await page.locator('button.mep-menu-btn').click();
  await h.menuItem(/^\s*Show route area\s*$/).click();
  await idle(900);
  check(await h.flag(), 'menu switch: the flag is true after the click');
  const purpleOn = await colorPixelsIn(page, q, isPurple);
  check(purpleOn > 0, 'menu switch: purple pixels around a center node', String(purpleOn));
  const tealAll = await countIn(page, CANVAS_CLIP, isTeal);
  check(tealAll > 0, 'menu switch: teal route-area fill shows', String(tealAll));
  await t.shot('T20-area-first-floor');
  await page.locator('button.mep-menu-btn').click();
  await h.menuItem(/^\s*Hide route area\s*$/).click();
  await idle(700);
  check(!(await h.flag()) && (await countIn(page, CANVAS_CLIP, isPurple)) === 0, 'menu switch: the second click hides the overlay');

  // Step 4: the dialog
  await h.openDialog();
  check(await tid('route-area').isVisible(), 'dialog: the route-area section shows');
  check(await h.flag(), 'dialog: the flag is true while the dialog is open');
  check(await tid('route-area-show').isChecked(), 'dialog: the show check box is checked');
  const summary = (await tid('route-area-summary').innerText()).trim();
  check(h.firstInt(summary) === expectedRooms, 'dialog: the summary count equals the independent count', `"${summary}" vs ${expectedRooms}`);
  const draft = await h.lineText('draft-2d');
  check(draft !== null && draft.startsWith('Note') && (await tid('route-area-line-draft-2d').getAttribute('data-severity')) === 'info', 'dialog: the draft-2d line has the label Note', String(draft));
  const wall = await h.lineText('wall-crossings');
  check(wall !== null && wall.startsWith('Warning') && (await tid('route-area-line-wall-crossings').getAttribute('data-severity')) === 'warning', 'dialog: the wall-crossings line has the label Warning', String(wall));
  if (codes.includes('shaft-crossing')) {
    const sh = await h.lineText('shaft-crossing');
    check(sh !== null && sh.startsWith('Warning'), 'dialog: the shaft-crossing line shows with Warning', String(sh));
  }
  if (stairRooms.length > 0) {
    const st = await h.lineText('stair-name');
    check(st !== null && st.startsWith('Note'), 'dialog: the stair-name line shows with Note', String(st));
  } else {
    check((await h.lineText('stair-name')) === null, 'dialog: no stair-name line when no room name holds "trap"');
  }
  check(!/door/i.test(await tid('route-area-lines').innerText()), 'dialog: no line holds "door"');
  check((await tid('route-area-legend').locator('.mep-route-area-swatch').count()) === 4, 'dialog: the legend has four swatches');
  check(/equipment stamp/i.test(await page.locator(R).innerText()), 'dialog: the R2 text "Place an equipment stamp first" shows too');
  await tid('route-area-show').uncheck();
  await idle(500);
  check(!(await h.flag()) && (await countIn(page, CANVAS_CLIP, isPurple)) === 0, 'dialog: unchecking the show box hides the overlay');
  await tid('route-area-show').check();
  await idle(500);
  check((await h.flag()) && (await colorPixelsIn(page, q, isPurple)) > 0, 'dialog: checking the show box brings the overlay back');
  await tid('route-area').scrollIntoViewIfNeeded();
  await t.shot('T20-dialog-section');

  // The type list: add Office, remove Office
  check(JSON.stringify(await h.chipIds()) === '["corridor","shaft"]', 'types: the chips are Corridor and Shaft', JSON.stringify(await h.chipIds()));
  await tid('route-area-add').selectOption({ label: 'Office' });
  await idle(800);
  check(JSON.stringify(await h.chipIds()) === '["corridor","office","shaft"]', 'types: a chip Office appears', JSON.stringify(await h.chipIds()));
  check((await h.stored()) === '["corridor","shaft","office"]', 'types: localStorage holds the three ids', String(await h.stored()));
  const withOffice = await h.countOf(['corridor', 'shaft', 'office']);
  check(h.firstInt(await tid('route-area-summary').innerText()) === withOffice, 'types: the summary counts the office rooms too', await tid('route-area-summary').innerText());
  await tid('route-area-types-block').scrollIntoViewIfNeeded();
  await t.shot('T20-dialog-types');
  await page.locator('[data-testid="route-area-type"][data-type-id="office"] [data-testid="route-area-remove"]').click();
  await idle(700);
  check(JSON.stringify(await h.chipIds()) === '["corridor","shaft"]' && (await h.stored()) === '["corridor","shaft"]', 'types: the Office chip is gone and the list is back');
  check(h.firstInt(await tid('route-area-summary').innerText()) === expectedRooms, 'types: the count is back');

  // Step 6: empty case no-types (remove both chips)
  await page.locator('[data-testid="route-area-type"][data-type-id="corridor"] [data-testid="route-area-remove"]').click();
  await idle(500);
  await page.locator('[data-testid="route-area-type"][data-type-id="shaft"] [data-testid="route-area-remove"]').click();
  await idle(800);
  const noTypes = tid('route-area-line-no-types');
  check((await noTypes.count()) === 1 && (await noTypes.getAttribute('data-severity')) === 'warning' && (await noTypes.innerText()).startsWith('Warning'), 'no-types: the line shows with Warning');
  check((await h.view()).area.status === 'no-types', 'no-types: the model status is no-types');
  check(await addsNoOverlay(page), 'no-types: the overlay adds no pixel');
  await tid('route-area').scrollIntoViewIfNeeded();
  await t.shot('T20-empty');
  await tid('route-area-reset').click();
  await idle(800);
  check(JSON.stringify(await h.chipIds()) === '["corridor","shaft"]', 'no-types: reset brings Corridor and Shaft back');

  // English narrow run
  await page.setViewportSize({ width: 400, height: 900 });
  await idle(600);
  await tid('route-area').scrollIntoViewIfNeeded();
  const dims = await page.evaluate(() => {
    const m = document.querySelector('.mep-modal--route');
    return { scrollWidth: m.scrollWidth, clientWidth: m.clientWidth };
  });
  check(dims.scrollWidth <= dims.clientWidth, 'narrow 400 px: scrollWidth <= clientWidth of .mep-modal--route', JSON.stringify(dims));
  await tid('route-area-legend').scrollIntoViewIfNeeded();
  await t.shot('T20-dialog-narrow');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(500);

  // Step 5: close with Escape, then with the Close button
  const sameState = async (what) => {
    check(await sameAsBaseline(page, base), `${what}: project JSON, canUndo and isDirty equal the baseline`);
    const keys = await page.evaluate(() => Object.keys(localStorage).sort());
    const added = keys.filter((k) => !keysBefore.includes(k));
    const removed = keysBefore.filter((k) => !keys.includes(k));
    check(removed.length === 0 && added.every((k) => k === KEY), `${what}: localStorage keys equal except ${KEY}`, `added ${JSON.stringify(added)} removed ${JSON.stringify(removed)}`);
  };
  await page.keyboard.press('Escape');
  await idle(600);
  check((await page.locator(R).count()) === 0, 'close: Escape closes the dialog');
  check(!(await h.flag()), 'close: the flag is false again');
  check((await countIn(page, CANVAS_CLIP, isPurple)) === 0, 'close: the buffer has no purple again');
  await sameState('close with Escape');
  await h.openDialog();
  await page.locator(`${R} button`, { hasText: /^\s*Close\s*$/ }).last().click();
  await idle(600);
  check((await page.locator(R).count()) === 0, 'close: the Close button closes the dialog');
  check(!(await h.flag()), 'close: the flag is false after the Close button');
  await sameState('close with the Close button');
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

// ---------------------------------------------------------------- Run 2
{
  console.log('\n=== RUN 2: no Detect rooms run ===');
  const t = await open();
  const { page, check, idle } = t;
  const h = helpers(t);
  const { tid } = h;
  await t.start();
  await t.openPdf(PDF1);
  await t.openAutoPlace();
  await page.locator('.mep-modal--auto-place select.mep-scale-select').selectOption('50');
  await idle(500);
  await page.keyboard.press('Escape');
  await idle(600);
  const v = await h.view();
  console.log('run 2 status:', v.area.status, 'codes', JSON.stringify(v.warnings.map((w) => w.code)));
  check(v.area.status === 'no-rooms', 'no-rooms: the model status is no-rooms', v.area.status);
  await h.openDialog();
  const line = tid(`route-area-line-${v.area.status}`);
  check((await line.count()) === 1, `no-rooms: the line ${v.area.status} shows`);
  if (v.area.status === 'no-rooms') check((await line.getAttribute('data-severity')) === 'warning' && (await line.innerText()).startsWith('Warning'), 'no-rooms: the line has the label Warning');
  check(await addsNoOverlay(page), 'no-rooms: the overlay adds no pixel');
  check(h.firstInt(await tid('route-area-summary').innerText()) === 0, 'no-rooms: the summary counts 0 rooms', await tid('route-area-summary').innerText());
  await tid('route-area').scrollIntoViewIfNeeded();
  await t.shot('T20-empty-no-rooms');
  await page.keyboard.press('Escape');
  await idle(500);
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

// ---------------------------------------------------------------- Run 3
{
  console.log('\n=== RUN 3: seeded ["shaft"], no shaft made ===');
  const t = await open({ seed: { [KEY]: '["shaft"]' } });
  const { page, check } = t;
  const h = helpers(t);
  const { tid } = h;
  const { rooms, shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: false });
  check(rooms.length > 0 && shaftId === null, 'setup: rooms found and no shaft made', `${rooms.length} rooms, shaft ${shaftId}`);
  const v = await h.view();
  check(v.area.status === 'no-route-rooms', 'no-route-rooms: the model status', v.area.status);
  await h.openDialog();
  check(JSON.stringify(await h.chipIds()) === '["shaft"]', 'no-route-rooms: the chip list is the seeded ["shaft"]', JSON.stringify(await h.chipIds()));
  const line = tid('route-area-line-no-route-rooms');
  check((await line.count()) === 1 && (await line.getAttribute('data-severity')) === 'warning', 'no-route-rooms: the line shows as a warning');
  check(await addsNoOverlay(page), 'no-route-rooms: the overlay adds no pixel');
  await tid('route-area').scrollIntoViewIfNeeded();
  await t.shot('T20-empty-no-route-rooms');
  await page.keyboard.press('Escape');
  await t.idle(500);
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

// ---------------------------------------------------------------- Run 4
if (!existsSync(PDF10A)) {
  console.log(`\n=== RUN 4: SKIPPED, the file is missing: ${PDF10A} ===`);
  finding(`run 4 not run: ${PDF10A} is missing (git-ignored, lives in the main checkout only)`);
} else {
  console.log('\n=== RUN 4: plattegrond begane grond 10A.pdf at 1:100 ===');
  const t = await open();
  const { page, check, idle } = t;
  const h = helpers(t);
  const { rooms } = await setupRooms(t, { pdf: PDF10A, scale: '100', shaft: false });
  console.log(`10A rooms found: ${rooms.length}`);
  check(rooms.length > 0, '10A: rooms found', String(rooms.length));
  const types = {};
  for (const r of rooms) types[r.roomTypeId ?? '-'] = (types[r.roomTypeId ?? '-'] ?? 0) + 1;
  console.log('10A room types:', JSON.stringify(types));
  const timing = await page.evaluate(() => {
    const t0 = performance.now();
    const v = JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea()));
    return { ms: performance.now() - t0, view: v };
  });
  const area = timing.view.area;
  console.log(`TIME first getRouteArea() on 10A: ${Math.round(timing.ms)} ms`);
  console.log(
    `10A route area: status ${area.status}, rooms ${area.rooms.length} (path ${area.rooms.filter((r) => r.kind === 'path').length}, shaft ${area.rooms.filter((r) => r.kind === 'shaft').length}), nodes ${area.nodes.length}, entries ${area.entries.length}, links ${area.links.length}, unreached ${area.unreached.length}, parts ${area.parts}, warnings ${JSON.stringify(timing.view.warnings.map((w) => w.code))}`,
  );
  console.log('10A route-area room names:', JSON.stringify(area.rooms.map((r) => `${r.kind}:${r.name ?? '-'}`)));
  check(area.status === 'ok', '10A: the route area status is ok', area.status);
  check(timing.ms <= 5000, '10A: the first getRouteArea() call takes 5 s or less', `${Math.round(timing.ms)} ms`);
  if (timing.ms > 1000) finding(`10A: the first getRouteArea() call took ${Math.round(timing.ms)} ms (limit 1000 ms, P-R4-13). A task to move the call into the room worker is needed.`);
  const pathN = area.rooms.filter((r) => r.kind === 'path').length;
  const shaftN = area.rooms.filter((r) => r.kind === 'shaft').length;
  if (pathN < 1) finding(`10A: no path room found (expected at least 1; the probe found "gang"). Found ${area.rooms.length} route-area rooms.`);
  if (shaftN < 1) finding('10A: no shaft room found (expected at least 1; the probe found 3 "schacht").');
  if (pathN >= 1 && shaftN >= 1) console.log(`10A: path rooms ${pathN}, shaft rooms ${shaftN} (the probe expectation holds)`);
  await page.locator('button.mep-menu-btn').click();
  await h.menuItem(/^\s*Show route area\s*$/).click();
  await idle(1500);
  check(await h.flag(), '10A: the menu switch sets the flag');
  const px = (await countIn(page, { x: 0, y: 60, width: 1600, height: 900 }, isPurple)) + (await countIn(page, { x: 0, y: 60, width: 1600, height: 900 }, isTeal));
  console.log(`10A overlay pixels on the screen: ${px}`);
  await t.shot('T20-area-10A');
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

// ---------------------------------------------------------------- Run 5
{
  console.log('\n=== RUN 5: persistence, seeded ["corridor"] ===');
  const t = await open({ seed: { [KEY]: '["corridor"]' } });
  const { page, check } = t;
  const h = helpers(t);
  const { tid } = h;
  const { shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
  check(shaftId !== null, 'setup: a shaft room exists in the drawing', String(shaftId));
  check(JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getRouteAreaRoomTypes())) === '["corridor"]', 'persistence: the scene list is the seeded ["corridor"]');
  const v = await h.view();
  check(v.area.rooms.length > 0 && v.area.rooms.every((r) => r.kind === 'path' && r.typeId === 'corridor'), 'persistence: the route area holds no shaft room', JSON.stringify(v.area.rooms.map((r) => r.kind)));
  await h.openDialog();
  check(JSON.stringify(await h.chipIds()) === '["corridor"]', 'persistence: the dialog chips show Corridor only', JSON.stringify(await h.chipIds()));
  check(h.firstInt(await tid('route-area-summary').innerText()) === (await h.countOf(['corridor'])), 'persistence: the summary counts corridor rooms only', await tid('route-area-summary').innerText());
  await page.keyboard.press('Escape');
  await t.idle(500);
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

console.log(`\nFINDINGS: ${FINDINGS.length}`);
for (const f of FINDINGS) console.log('  * ' + f);
process.exitCode = worst;
