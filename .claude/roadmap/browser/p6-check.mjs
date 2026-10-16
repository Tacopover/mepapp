// P6 of auto-routing.md: a segment that starts at an open port takes the routing target of the port as its network
// type, the active network type (and its tile) follows, the next segments keep it, a segment that ends at a port does
// not change its type, and a port that has a segment already changes nothing.
import { open, D, SP } from './lib.mjs';

const t = await open();
const { page, check, idle, nav } = t;
const step = (n) => page.locator(`${nav} .mep-autoplace-substeps .mep-guide-step[data-step="${n}"]`);
const project = () => page.evaluate(() => window.__mepSketchScene.exportProject());
const active = () => page.evaluate(() => window.__mepSketchScene.getActiveNetworkTypeId());
const selection = () => page.evaluate(() => window.__mepSketchScene.getSelection().map((s) => s.id));
const rail = (title) => page.locator(`button.mep-rail-btn[title="${title}"]`).first();
const activeTile = async () => (await page.locator('.mep-networktype-tile.active .mep-networktype-name').allInnerTexts()).join('|');
const openCount = async () => Number(await page.locator('[data-testid=open-ports] label b').innerText());
const screenOf = (id) =>
  page.evaluate((id) => {
    const s = window.__mepSketchScene;
    const st = s.exportProject().stamps.find((x) => x.id === id);
    const g = s.world.toGlobal(st.transform.position);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, id);

await t.start();
await t.openPdf();
await t.openAutoPlace();
await t.detect();
await page.locator(`${nav} button[data-item="types"]`).click();
await idle();
await page.locator(`${D} [role=tab]`, { hasText: 'Room type library' }).click();
await idle();
await page.locator(`${D} [data-testid=rt-fill-all]`).click();
await idle();
await page.locator(`${nav} button[data-rule="example-supply-air"]`).click();
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
await page.locator(`${D} [data-testid=pg-placed]`).waitFor({ timeout: 120000 });
await page.keyboard.press('Escape');
await idle(800);

const placed = (await project()).stamps.filter((s) => s.autoPlaced);
const visible = [];
for (const s of placed) {
  const q = await screenOf(s.id);
  if (q.x > 150 && q.x < 1000 && q.y > 250 && q.y < 850) visible.push({ s, d: Math.hypot(q.x - 600, q.y - 500) });
}
visible.sort((m, n) => m.d - n.d);
const [a, b] = visible.map((v) => v.s.id);
const portOf = (id) => placed.find((s) => s.id === id).ports[0]?.id ?? '__center__';
const pa = await screenOf(a);
const pb = await screenOf(b);

// Stamp a waits for Return Air; stamp b for Supply Air (from the rule).
await rail('Select').click();
await page.mouse.click(110, 150);
await idle(300);
await page.mouse.click(pa.x, pa.y);
await idle(500);
check(JSON.stringify(await selection()) === JSON.stringify([a]), 'stamp a is selected');
await page.locator(`[id="routing-${portOf(a)}"]`).selectOption('return-air');
await idle(400);

// The user picks Supply Air as the type to draw.
await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
await idle(300);
await page.locator('.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
await idle(300);
await page.locator('.mep-networktype-tile .mep-networktype-pick', { hasText: /^Supply Air/ }).first().click();
await idle(300);
check((await active()) === 'supply-air' && (await activeTile()) === 'Supply Air', 'the user picked Supply Air: the tile shows it');

// ---------- A segment from the open port of stamp a ----------
await rail('Segment').click();
const before = await openCount();
await page.mouse.click(pa.x, pa.y);
await idle(300);
check((await active()) === 'return-air', 'a start at the open port of stamp a makes Return Air the active type', await active());
check((await activeTile()) === 'Return Air', 'the active tile follows to Return Air', await activeTile());
await page.mouse.click(pa.x, pa.y - 110);
await idle(400);
let segments = (await project()).segments;
const first = segments.find((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId === a));
check(first?.networkTypeId === 'return-air', 'the segment from the port has the type Return Air', first?.networkTypeId);
check((await openCount()) === before - 1, 'the port is no longer open');
await page.keyboard.press('Escape');
await idle(200);

// ---------- The next segment keeps the type ----------
await page.mouse.click(pa.x + 60, pa.y - 150);
await idle(200);
await page.mouse.click(pa.x + 160, pa.y - 150);
await idle(400);
await page.keyboard.press('Escape');
await idle(200);
segments = (await project()).segments;
check(segments.length === 2 && segments.every((s) => s.networkTypeId === 'return-air'), 'a next segment between two free points keeps Return Air', JSON.stringify(segments.map((s) => s.networkTypeId)));

// ---------- A segment that ends at a port does not change its type ----------
// Straight above stamp b, so the angle snap keeps the end on the stamp.
await page.mouse.click(pb.x, pb.y - 150);
await idle(200);
await page.mouse.click(pb.x, pb.y);
await idle(400);
await page.keyboard.press('Escape');
await idle(200);
const project3 = await project();
console.log(`a ${JSON.stringify(pa)} b ${JSON.stringify(pb)}; segments ${JSON.stringify(project3.segments.map((s) => [s.endpointA, s.endpointB, s.geometry]))}`);
const toB = project3.segments.find((s) => [s.endpointA, s.endpointB].some((e) => e.kind === 'port' && e.elementId === b));
check(toB?.networkTypeId === 'return-air' && project3.stamps.find((s) => s.id === b).routingTargets?.[portOf(b)] === 'supply-air', 'a segment that ends at stamp b keeps Return Air, and the routing target of b stays', JSON.stringify({ seg: toB?.networkTypeId, target: project3.stamps.find((s) => s.id === b).routingTargets }));
check((await active()) === 'return-air', 'the end at a port does not change the active type');

// ---------- A start at a port that has a segment changes nothing ----------
await page.locator('.mep-networktype-tile .mep-networktype-pick', { hasText: /^Supply Air/ }).first().click();
await idle(300);
await rail('Segment').click();
await page.mouse.click(pa.x, pa.y);
await idle(300);
check((await active()) === 'supply-air' && (await activeTile()) === 'Supply Air', 'a start at the port of stamp a, which has a segment now, keeps Supply Air', await active());
await page.keyboard.press('Escape');
await idle(200);
await page.screenshot({ path: `${SP}/p6-segments.png` });

// ---------- Undo ----------
await rail('Undo').click();
await idle(300);
await rail('Undo').click();
await idle(300);
await rail('Undo').click();
await idle(400);
check((await project()).segments.length === 0 && (await openCount()) === before, 'Undo removes the segments and the ports are open again');

// ---------- "Draw from" on the right-click menu ----------
await page.locator('.mep-networktype-tile .mep-networktype-pick', { hasText: /^Return Air/ }).first().click();
await idle(300);
await rail('Select').click();
await page.mouse.click(pb.x, pb.y, { button: 'right' });
await idle(300);
const drawFrom = page.locator('.mep-draw-from-menu-btn', { hasText: /^Draw from/ });
check((await drawFrom.count()) === 1, 'the right-click menu of stamp b offers "Draw from"', await page.locator('.mep-draw-from-menu').innerText().catch(() => 'no menu'));
await drawFrom.click();
await idle(300);
check((await active()) === 'supply-air' && (await activeTile()) === 'Supply Air', '"Draw from" the open port of stamp b makes Supply Air the active type', await active());
await page.keyboard.press('Escape');
await idle(200);

await t.finish();
