// Shared setup of the R4 browser checks (auto-routing-r4.md, T14b). Imports lib.mjs of the same folder.
// The scene API is used for setup and for reading state only. Each control is driven through the real DOM where a DOM input exists.
import { open as openPage, D } from './lib.mjs';

export { D };
export const open = openPage;

/**
 * Opens the PDF, runs Detect rooms at the given scale, closes the Auto-place dialog with Escape and reads the rooms.
 * When `shaft` is true the smallest room that is not a corridor gets the room type 'shaft'.
 * Returns { rooms, corridorIds, shaftId }.
 */
export async function setupRooms(t, { pdf, scale = '50', shaft = false }) {
  const { page, idle } = t;
  await t.start();
  await t.openPdf(pdf);
  await t.openAutoPlace();
  await t.detect(scale);
  await page.keyboard.press('Escape');
  await idle(600);
  const shaftId = await page.evaluate((withShaft) => {
    const s = window.__mepSketchScene;
    if (!withShaft) return null;
    const area = (r) => {
      const o = r.polygon.outer;
      let a = 0;
      for (let i = 0; i < o.length; i++) {
        const p = o[i];
        const q = o[(i + 1) % o.length];
        a += p.x * q.y - q.x * p.y;
      }
      return Math.abs(a) / 2;
    };
    const candidates = s.listRooms().filter((r) => r.roomTypeId !== 'corridor').sort((x, y) => area(x) - area(y));
    if (candidates.length === 0) return null;
    s.setRoomType([candidates[0].id], 'shaft');
    return candidates[0].id;
  }, shaft);
  await idle(600);
  const rooms = await page.evaluate(() => window.__mepSketchScene.listRooms());
  return { rooms, corridorIds: rooms.filter((r) => r.roomTypeId === 'corridor').map((r) => r.id), shaftId };
}

/** Screen position of a page point (needs window.__mepSketchScene). */
export const screenOf = (page, p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);

/** The pixels of a 40 by 40 screen clip centered on `q`, as a flat array [r, g, b, a, ...]. */
export async function clipPixels(page, q) {
  const vp = page.viewportSize();
  const x = Math.max(0, Math.min(vp.width - 40, Math.round(q.x - 20)));
  const y = Math.max(0, Math.min(vp.height - 40, Math.round(q.y - 20)));
  const png = await page.screenshot({ clip: { x, y, width: 40, height: 40 } });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data);
  }, png.toString('base64'));
}

/** Counts the pixels of the 40 by 40 clip around `q` for which `predicate(r, g, b)` is true. */
export async function colorPixelsIn(page, q, predicate) {
  const px = await clipPixels(page, q);
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (predicate(px[i], px[i + 1], px[i + 2])) n++;
  return n;
}

/** Predicates for the overlay colors (P-R4-08): purple center line 0x6a1b9a, teal fill 0x00897b at alpha 0.18. */
export const isPurple = (r, g, b) => b - g > 60 && r - g > 30;
export const isTeal = (r, g, b) => b - r > 15 && g - r > 15 && Math.abs(b - g) < 12;

/** The route area view of the active document: { area, warnings } (plain data). */
export const routeAreaView = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.getRouteArea())));

/** The state that the overlay must not change: project JSON, can-undo and the dirty flag of the active document. */
export const baseline = (page) =>
  page.evaluate(() => {
    const s = window.__mepSketchScene;
    const id = s.getActiveDocumentId();
    return { project: JSON.stringify(s.exportProject()), canUndo: s.getDrawingSummary().canUndo, isDirty: s.getDocuments().find((d) => d.id === id).isDirty };
  });

export async function sameAsBaseline(page, b) {
  const now = await baseline(page);
  return now.project === b.project && now.canUndo === b.canUndo && now.isDirty === b.isDirty;
}
