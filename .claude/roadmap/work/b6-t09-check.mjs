// B6-T09: a failed save of a PDF is loud. Real click on the real Save menu item; the stand-in file handle throws NoModificationAllowedError.
// What the stand-in hides: a real file lock of another program (Windows sharing violation), the real message text of Chrome, Firefox, Safari, Tauri.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b6/.claude/roadmap/browser/lib.mjs';

const W = '/root/MepApp/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const LOCKED = 'Could not save a.pdf. Another program may have the file open. Close it there and save again. Your changes are still in MepApp.';
const toastTexts = () => page.locator('.mep-toast-error').allInnerTexts();
const setLock = (on) => page.evaluate((v) => { window.__lock = v; }, on);
await page.evaluate(() => {
  const orig = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = function (...args) {
    if (window.__lock) return Promise.reject(new DOMException('The file is locked by another program.', 'NoModificationAllowedError'));
    return orig.apply(this, args);
  };
});
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push(d.message());
  await d.dismiss();
});

const screenOf = (p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);
async function drawSeg(from, to) {
  await page.locator('button.mep-rail-btn[title="Segment"]').click();
  await idle(300);
  for (const p of [from, to]) {
    const at = await screenOf(p);
    await page.mouse.click(at.x, at.y);
    await idle(500);
  }
  await page.keyboard.press('Escape');
  await idle(300);
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(300);
}
async function pressSave() {
  await page.evaluate(() => { window.__statusSeen = false; });
  await menu('Save');
  await until(async () => /^(Saved |Failed)/.test(await statusText()), 'save');
  await idle(500);
}

await t.openPdf(W + '00_arch_ground_floor.pdf', 'a.pdf');
await page.evaluate(() =>
  window.__mepSketchScene.setActiveNetworkType({ id: 'supply-air', name: 'Supply Air', discipline: 'ventilation', units: 'CFM', defaultCapacity: 100, color: '#1f77b4', lineWidthPt: 1, linePattern: 'solid' }),
);
await drawSeg({ x: 300, y: 400 }, { x: 500, y: 400 });
check((await page.locator('.mep-doc-dirty-dot').count()) > 0, 'the drawing is dirty before the save');

// ---- failed save ----
await setLock(true);
await pressSave();
let texts = await toastTexts();
check(texts.length === 1 && texts[0].trim() === LOCKED, 'one error toast with the locked-file text', JSON.stringify(texts));
check((await statusText()) === 'Failed to save.', 'the status line says "Failed to save."', await statusText());
await shot('b6-t09-failed-save');
await page.waitForTimeout(8000);
texts = await toastTexts();
check(texts.length === 1 && texts[0].trim() === LOCKED, 'the toast is still there after 8 s', JSON.stringify(texts));
check((await page.locator('.mep-doc-dirty-dot').count()) > 0, 'the unsaved marker stays');

// ---- a second failed save replaces the toast ----
await pressSave();
texts = await toastTexts();
check(texts.length === 1, 'a second failed save leaves one toast', JSON.stringify(texts));

// ---- the close dialog still warns ----
await setLock(false);
await t.openPdf(W + '01_arch_first_floor.pdf', 'b.pdf');
await page.locator('.mep-doc-switcher-btn').click();
await page.locator('.mep-doc-switcher-dropdown .mep-doc-close[title="Close a.pdf"]').click();
await idle(600);
check(dialogs.length === 1 && /unsaved changes/.test(dialogs[0]), 'closing the document asks about unsaved changes', JSON.stringify(dialogs));
await idle(400);
check((await page.locator('.mep-toast-error').count()) === 1, 'the toast still shows after the open of another PDF');

// ---- save works again ----
if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'a.pdf' }).first().click();
await idle(1200);
await pressSave();
check((await statusText()) === 'Saved a.pdf.', 'the status line says "Saved a.pdf."', await statusText());
check((await page.locator('.mep-toast-error').count()) === 0, 'the error toast is gone after a good save');
check((await page.locator('.mep-doc-dirty-dot').count()) === 0, 'the unsaved marker is gone');
await shot('b6-t09-saved-again');

await t.finish();
