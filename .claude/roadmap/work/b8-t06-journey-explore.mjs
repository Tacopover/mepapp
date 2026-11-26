// B8-T06 journey tester: first look at the screen (1600 px, empty state).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, focusRings, screenOf } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const width = Number(process.argv[2] ?? 1600);
const t = await open({ width, height: 900, seed: { 'mepapp.realStore': '1' } });
const { page, idle, shot } = t;
await t.start();
const { uuids, anchors } = await setup(t, { withReturn: true, sources1: [0], sources2: [], extra: [] });
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await switchTo(t, 'l1.pdf');
await shot(`B8-T06-journey-explore-${width}-level1`);
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
const at = await screenOf(page, { x: 300, y: H - 300 });
console.log('ring at', JSON.stringify(at));
await page.mouse.click(at.x, at.y, { button: 'right' });
await idle(500);
await shot(`B8-T06-journey-explore-${width}-menu`);
console.log('MENU:', JSON.stringify(await page.locator('.mep-draw-from-menu').allInnerTexts()));
await page.keyboard.press('Escape');
await page.mouse.click(at.x, at.y);
await idle(500);
await shot(`B8-T06-journey-explore-${width}-selected`);
console.log('DOCK TABS:', JSON.stringify(await page.locator('.mep-dock-tab-label').allInnerTexts()));
await t.finish();
