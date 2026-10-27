// U1-T14: pan and zoom the PDF while the Route dialog is open (real mouse events).
import { open } from './lib.mjs';

const t = await open();
const { page, check, start, openPdf, openRoute, idle, shot, finish } = t;
await start();
await openPdf();
await idle(800);
const view = () => page.evaluate(() => { const s = window.__mepSketchScene; return { x: s.world.x, y: s.world.y, zoom: s.getZoom() }; });
const sel = () => page.evaluate(() => window.__mepSketchScene.getSelection().length);

await shot('u1-t14-before-dialog');
await openRoute();
await idle(800);
const R = '.mep-modal--route';
check(await page.locator(R).count() === 1, 'Route dialog is open');
const textBefore = await page.locator(R).innerText();
await shot('u1-t14-before-dialog-open');

const box = await page.locator('canvas').first().boundingBox();
const dlg = await page.locator(R).boundingBox();
const cx = Math.min(box.x + 300, dlg.x - 100);
const cy = box.y + box.height / 2;
const v0 = await view();

await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -400);
await idle(500);
const v1 = await view();
check(v1.zoom > v0.zoom, 'wheel zoom in changes zoom with dialog open', `${v0.zoom} -> ${v1.zoom}`);
await page.mouse.wheel(0, 200);
await idle(500);
const v1b = await view();
check(v1b.zoom < v1.zoom, 'wheel zoom out changes zoom', `${v1.zoom} -> ${v1b.zoom}`);

await page.mouse.move(cx, cy);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(cx + 80, cy + 50, { steps: 8 });
await page.mouse.up({ button: 'middle' });
await idle(400);
const v2 = await view();
check(Math.abs(v2.x - v1b.x) > 40 && Math.abs(v2.y - v1b.y) > 20, 'middle-mouse drag pans', `${v1b.x},${v1b.y} -> ${v2.x},${v2.y}`);

await page.mouse.move(cx, cy);
await page.mouse.down({ button: 'right' });
await page.mouse.move(cx - 60, cy - 30, { steps: 8 });
await page.mouse.up({ button: 'right' });
await idle(400);
const v3 = await view();
check(Math.abs(v3.x - v2.x) > 30, 'right-button drag pans', `${v2.x} -> ${v3.x}`);

await page.evaluate(() => window.__mepSketchScene.setTool('pan'));
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 50, cy + 40, { steps: 8 });
await page.mouse.up();
await idle(400);
const v4 = await view();
check(Math.abs(v4.x - v3.x) > 20, 'Pan tool left drag pans', `${v3.x} -> ${v4.x}`);

check(await page.locator(R).count() === 1, 'dialog still open after pan and zoom');
const textAfter = await page.locator(R).innerText();
check(textAfter === textBefore, 'dialog text unchanged', textAfter.slice(0, 80));
check(await sel() === 0, 'no selection change');
await shot('u1-t14-after-pan-zoom');

// Dialog itself still works: Close button.
await page.locator(`${R} .mep-modal-actions button`).click();
await idle(300);
check(await page.locator(R).count() === 0, 'Close button closes the dialog');
await finish();
