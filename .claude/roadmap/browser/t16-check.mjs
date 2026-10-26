// T16: the rail switch "Show route area" / "Hide route area", driven through real clicks on the rail flyout.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t16-check.mjs
import { open, setupRooms, screenOf, clipPixels, colorPixelsIn, isPurple, baseline, sameAsBaseline } from './r4-lib.mjs';

const FIXTURES = '/root/MepApp/fixtures/pdfs/';
const PDF1 = FIXTURES + '01_arch_first_floor.pdf';
let worst = 0;

// Part 1: with a PDF
{
  const t = await open();
  const { page, check, idle } = t;
  const { rooms, shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
  check(shaftId !== null && rooms.length > 0, 'setup: rooms and a shaft room exist');
  const base = await baseline(page);
  const view = await page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea())));
  const onCanvas = (p) =>
    page.evaluate((p) => {
      const s = window.__mepSketchScene;
      const g = s.world.toGlobal(p);
      const r = s.app.canvas.getBoundingClientRect();
      return g.x > 60 && g.y > 60 && g.x < r.width - 60 && g.y < r.height - 60;
    }, p);
  const visible = [];
  for (const n of view.area.nodes) if (n.kind !== 'wall' && n.kind !== 'shaft' && (await onCanvas(n.point))) visible.push(n);
  check(visible.length > 0, 'setup: a route node is on the canvas', String(visible.length));
  const node = visible.find((n) => n.kind === 'junction') ?? visible[0];
  const q = await screenOf(page, node.point);

  const routingBtn = page.locator('[data-testid="rail-routing"]');
  const showBtn = page.locator('[data-testid="rail-action-route-area"]');
  const routeBtn = page.locator('[data-testid="rail-action-route"]');
  check(!(await page.evaluate(() => window.__mepSketchScene.isRouteAreaVisible())), 'flag is false at first');
  const off = await clipPixels(page, q);
  const purpleOff = await colorPixelsIn(page, q, isPurple);
  check(purpleOff === 0, 'no purple pixel before the switch', String(purpleOff));

  await routingBtn.click();
  check((await showBtn.count()) === 1 && (await showBtn.getAttribute('aria-label')) === 'Show route area', 'the rail action reads "Show route area"');
  check(await showBtn.isEnabled(), 'the action is enabled with a PDF');
  const flyoutIds = [];
  for (const el of await page.locator('.mep-rail-flyout [data-testid^="rail-action-"]').all()) flyoutIds.push(await el.getAttribute('data-testid'));
  check(
    JSON.stringify(flyoutIds) === JSON.stringify(['rail-action-route', 'rail-action-size', 'rail-action-route-area']),
    'the flyout holds route, size and route-area in this order',
    JSON.stringify(flyoutIds),
  );
  check((await routeBtn.count()) === 1, 'Route action still there');
  await t.shot('T16-menu');
  await showBtn.click();
  await idle(600);
  check(await page.evaluate(() => window.__mepSketchScene.isRouteAreaVisible()), 'scene flag is true after the click');
  const purpleOn = await colorPixelsIn(page, q, isPurple);
  const on = await clipPixels(page, q);
  check(purpleOn > 0, 'purple pixels appear around a center node', String(purpleOn));
  check(JSON.stringify(on) !== JSON.stringify(off), 'the pixel buffer changed');
  await t.shot('T16-route-area-shown');
  await routingBtn.click();
  check((await showBtn.getAttribute('aria-label')) === 'Hide route area' && (await showBtn.getAttribute('aria-pressed')) === 'true', 'the rail action now reads "Hide route area" and is pressed');
  await showBtn.click();
  await idle(600);
  check(!(await page.evaluate(() => window.__mepSketchScene.isRouteAreaVisible())), 'scene flag is false after the second click');
  check(JSON.stringify(await clipPixels(page, q)) === JSON.stringify(off), 'the buffer is the first buffer again');
  check(await sameAsBaseline(page, base), 'project JSON, canUndo and isDirty are unchanged');
  // the scene API changes the flag: the rail label follows
  await page.evaluate(() => window.__mepSketchScene.setRouteAreaVisible(true));
  await idle(300);
  await routingBtn.click();
  check((await showBtn.getAttribute('aria-label')) === 'Hide route area', 'the rail label follows a scene flag change');
  await routingBtn.click();
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}

// Part 2: no PDF open
{
  const t = await open();
  const { page, check } = t;
  await t.start();
  const routingBtn = page.locator('[data-testid="rail-routing"]');
  const item = page.locator('[data-testid="rail-action-route-area"]');
  await routingBtn.click();
  check((await item.count()) === 1, 'no PDF: the action exists');
  check(await item.isDisabled(), 'no PDF: the action is disabled');
  await t.finish();
  worst = Math.max(worst, process.exitCode ?? 0);
}
process.exitCode = worst;
