// B8-T06 journey tester: G6 on a pure dashed ring (level 2 has a calibrated PDF and no drawing at all). Args: <width>.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/r3-lib.mjs';
import { buildLevelProject, LEVELS, W, buildingJson, loadBuilding, switchTo, screenOf, focusRings } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const width = Number(process.argv[2] ?? 1100);
const t = await open({ width, height: width < 900 ? 800 : 900, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot, menu, until, statusText } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [], extra: [] };
const uuids = [];
const anchors = {};
for (const [i, level] of LEVELS.entries()) {
  await t.openPdf(W + level.pdf, level.name);
  if (i < 3) {
    await placeOneStamp(t, width < 900 ? { x: 200, y: 500 } : undefined);
    const p = await buildLevelProject(page, i, cfg);
    await page.evaluate((p) => window.__mepSketchScene.loadProjectFromJson(p), p);
    await idle(1200);
  }
  await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
  if (i === 0) {
    anchors.r1 = { xMm: 30000, yMm: 30000 };
    anchors.r2 = { xMm: 30000, yMm: 52000 };
  }
  uuids.push(await page.evaluate(() => window.__mepSketchScene.getProjectUuid()));
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${level.name}`);
  await idle(800);
}
const file = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
file.risers[0].members = file.risers[0].members.filter((m) => m.levelId !== 'l2'); file.risers[0].anchorMm = { xMm: 30000, yMm: 40000 };
await loadBuilding(t, JSON.stringify(file));
await switchTo(t, 'l2.pdf');
await shot(`B8-T06-journey-dashed-before-${width}`);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
const at = await screenOf(page, { x: 300, y: H - 400 });
console.log('ring screen position', JSON.stringify(at), 'anchors:', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getRiserAnchors())), 'calib', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getCalibration())), 'page', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize())));
await page.mouse.click(at.x, at.y, { button: 'right' });
await idle(500);
console.log('menu on the pure dashed ring:', JSON.stringify(await page.locator('.mep-draw-from-menu').allInnerTexts()));
await shot(`B8-T06-journey-dashed-menu-${width}`);
await page.keyboard.press('Escape');
await page.mouse.click(at.x, at.y);
await idle(500);
console.log('after a left click: dock tab', JSON.stringify(await page.locator('.mep-dock-tab.on').allInnerTexts()));
await shot(`B8-T06-journey-dashed-click-${width}`);
await t.finish();
