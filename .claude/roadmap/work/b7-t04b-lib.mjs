// B7-T04b: screen position of a page point after the view was moved so that the point is in the middle of the canvas.
// The view move is setup only (the checks click the real canvas afterwards).
import { screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

export { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

export async function screenOfCentered(page, p) {
  await page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const r = s.app.canvas.getBoundingClientRect();
    s.world.scale.set(1);
    s.world.x = r.width / 2 - p.x;
    s.world.y = r.height / 2 - p.y;
  }, p);
  await new Promise((resolve) => setTimeout(resolve, 150));
  return screenOf(page, p);
}
