# Prompt: a deleted library stamp stays in the saved PDF

Status: OPEN (written 2026-10-05). Copy the text between the two lines into a new session. Start the session from branch `worktree-code-review-highs` (or from `master` after that branch is merged), because the fix depends on the full-rewrite Save from code review M34 (`1847645`).

---

When I place a stamp from my own stamp library folder (a user-library stamp, `source: 'user'`), save, delete the stamp and save again, the PDF does not go back to its size before the stamp. Please read the code, write a plan in `.claude/plans/library-stamp-copy.md`, check the plan with me, and then implement it in a worktree. Push the branch so I can test on Windows. Do not merge to `master`.

What was measured on 2026-10-05 (branch `worktree-code-review-highs`, `fixtures/pdfs/arch_simple_A4.pdf`, the real Menu > Save path, a real 44 KB PNG as the stamp file):

| Step | File size |
|---|---|
| Original PDF | 2,687 B |
| Save with no change (the project data is added once) | 3,331 B |
| Place the library stamp, save | 131,113 B |
| Delete the stamp, save | 88,615 B (85 KB too big) |
| Save again, also after close and reopen | 88,615 B (no growth) |

With a built-in stamp, the same steps go back to 3,340 B. The 9 extra bytes are an empty `/Annots []` array that MuPDF leaves on the page. That is harmless; leave it.

Cause, found in the investigation:

1. At the first placement, the scene copies the library stamp's definition into the document: `adoptStampDefinition` in `packages/render/src/scene.ts` (around line 715) calls `addCustomStampDefinition`. The copy carries the stamp file as a `data:` URL, so the project still has the art and ports when the library folder is gone.
2. `deleteSelection` (around line 4075) removes the placed stamp, but the copy stays in `doc.customStampDefinitions`. The undo stack needs it to bring the stamp back.
3. `serializeDocument` (around line 3123) writes every entry of `doc.customStampDefinitions` into the embedded `mepapp-project.json`. A copy that no placed stamp uses still goes into the file.
4. `buildUserStampDefinition` (`packages/core/src/user-stamp.ts`, around line 181) puts the same `data:` URL in `iconRef` and in the image shape's `dataUrl`, so each copy holds the file two times as base64. Deflate cannot share the two copies when the base64 is longer than its 32 KB window, so a 44 KB PNG costs about 85 KB in the file.

Requirements:

1. After the last placed stamp of a library stamp is deleted, Save writes a file without that stamp's copy. The size goes back to within 100 B of the size before the placement.
2. Undo after a Save in the same session still brings the stamp back with its art and ports. The next Save writes the copy again.
3. Save never drops custom elements made in the Element Editor (`source: 'custom'`) or edited built-in stamps (`source: 'library'`, which keep the library id). The user made those in this document and they show in the palette.
4. Optional, ask me first: store the stamp file only one time in each copy. For example, write the existing marker `USER_STAMP_FILE_REF` (`packages/core/src/user-stamp.ts`) in place of a shape `dataUrl` that is equal to `iconRef`, and restore it on load. This changes the project format, so it needs a schema version and a migration. An older MepApp refuses a file with a newer schema version.

Questions the plan must answer:

- Where to drop the unused copies: when Save serializes the document (my default, because the copy in memory keeps undo working), or when the last stamp is deleted.
- What else keeps a copy in use: placed stamps (`definitionId`), and maybe `stampLabelLayouts` (keyed by definition id), the clipboard, paste into another document, schematics or panels. Find every reader of `customStampDefinitions` and decide for each.
- What happens to the label layout of a copy that is dropped.
- What the Stamps panel shows after a reopen when the copy was dropped and the library folder no longer has that stamp.

Verification:

- Add unit tests for the serialization rule, including the undo case and the `custom` and `library` sources that must stay.
- Run the browser check from the appendix of `.claude/plans/library-stamp-copy-prompt.md` on the old build and on the fixed build. It must print FAIL on the old build (about 85,000 B left) and PASS on the fixed build.
- Then check through the real DOM that the Stamps panel still works with library stamps, and that a reopened file shows its placed library stamps with the right art.

Project rules: work in a worktree; `master` is live; run `pnpm install` and `pnpm build` at the repo root first; Vite reads the workspace packages from `dist/`, so build again after each change before a browser check; respond in Simplified Technical English.

---

## Appendix: browser check of the file size

How to run: start the dev server (`apps/web`, `npx vite --port <port> --host 127.0.0.1 --strictPort`), save this script outside the repo, and run `REPO=<worktree path> BASE=http://127.0.0.1:<port>/ node library-copy-check.mjs`. It uses Playwright from the repo's `node_modules`. The test PNG is a real stamp from the old app (`/root/MepSketcher/MEPSketcher2/resources/Circuits/Generator.png`); set `PNG=` to use another file.

Facts the script depends on:

- `showOpenFilePicker` returns a file handle from OPFS (the browser's private file system), so Menu > Save writes a real file through `createWritable`.
- `page.waitForFunction` does not await an async test function (a Promise counts as true), so the script polls from Node until the status shows "Saved" and the file's `lastModified` changes.
- The folder picker ("Load custom terminals…" then "Add folder") closes the headless page. The script therefore arms the stamp the way `pickStampDefinition` does, with the definition that `buildUserStampDefinition` makes for a stamp with no edits.

```js
// File size of a PDF through the real Menu > Open / Menu > Save path, with a user-library stamp placed and deleted.
// Usage: REPO=<worktree> BASE=http://127.0.0.1:<port>/ node library-copy-check.mjs
// The file handles come from OPFS (the browser's private file system), so Save writes a real file.
import { readFileSync } from 'node:fs';

const REPO = process.env.REPO ?? process.cwd();
const BASE = process.env.BASE ?? 'http://127.0.0.1:5173/';
const PDF = process.env.PDF ?? `${REPO}/fixtures/pdfs/arch_simple_A4.pdf`;
const PNG = process.env.PNG ?? '/root/MepSketcher/MEPSketcher2/resources/Circuits/Generator.png';
const { chromium } = await import(`${REPO}/node_modules/playwright/index.mjs`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(() => {
  window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle('drawing.pdf')];
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(BASE);
await page.locator('button.mep-onboarding-start').click();
await page.waitForFunction(() => window.__mepSketchScene !== undefined);
await page.evaluate(async (b64) => {
  const w = await (await (await navigator.storage.getDirectory()).getFileHandle('drawing.pdf', { create: true })).createWritable();
  await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  await w.close();
}, readFileSync(PDF).toString('base64'));

const statusText = () => page.evaluate(() => document.querySelector('.mep-header-status')?.textContent ?? '');
const fileInfo = () =>
  page.evaluate(async () => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle('drawing.pdf')).getFile();
    return { size: file.size, lastModified: file.lastModified };
  });
async function menu(item) {
  await page.locator('button.mep-menu-btn').click();
  await page.locator('button.mep-menu-item', { hasText: new RegExp(`^\\s*${item}\\s*$`) }).click();
}
// page.waitForFunction does not await an async predicate (a Promise is truthy), so poll from Node.
async function until(test, what) {
  const deadline = Date.now() + 60000;
  while (!(await test())) {
    if (Date.now() > deadline) throw new Error(`${what}: timed out; status "${await statusText()}"`);
    await page.waitForTimeout(100);
  }
}
const rows = [];
const record = async (step) => {
  const { size } = await fileInfo();
  rows.push({ step, size, delta: rows.length ? size - rows.at(-1).size : '' });
};
async function save(step) {
  const before = (await fileInfo()).lastModified;
  await menu('Save');
  await until(async () => /Saved/.test(await statusText()) && (await fileInfo()).lastModified !== before, step);
  await record(step);
}

await record('original');
await menu('Open…');
await until(async () => /Loaded|Could not open/.test(await statusText()), 'open');
await save('save1');
await save('save2');

// The folder picker ("Load custom terminals…") closes the headless page, so arm the stamp as pickStampDefinition does
// for a user stamp, with the definition buildUserStampDefinition makes for a stamp with no edits.
await page.evaluate(async (b64) => {
  const scene = window.__mepSketchScene;
  const dataUrl = `data:image/png;base64,${b64}`;
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const long = 40; // USER_RASTER_DEFAULT_LONG_SIDE_PT
  const [w, h] = bitmap.width >= bitmap.height ? [long, Math.round(((long * bitmap.height) / bitmap.width) * 100) / 100] : [Math.round(((long * bitmap.width) / bitmap.height) * 100) / 100, long];
  const definition = {
    id: 'user-test-stamp', label: 'Test stamp', discipline: 'other', category: 'terminal', nativeWidth: w, nativeHeight: h, ports: [],
    iconRef: dataUrl, source: 'user',
    shapes: [{ id: 'user-test-stamp-image', kind: 'image', dataUrl, x: 0, y: 0, width: 1, height: 1, style: { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null } }],
  };
  scene.setStampTexture(bitmap, definition.id, undefined, definition);
  scene.setTool('place-terminal');
}, readFileSync(PNG).toString('base64'));
const at = await page.evaluate(() => {
  const rect = window.__mepSketchScene.app.canvas.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
await page.mouse.click(at.x, at.y);
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
if ((await page.evaluate(() => window.__mepSketchScene.listStamps().length)) !== 1) throw new Error('the stamp was not placed');
await save('stamp');

await page.evaluate(() => {
  const scene = window.__mepSketchScene;
  scene.setTool('select');
  scene.selectStampById(scene.listStamps()[0].id);
});
await page.locator('body').press('Delete');
await page.waitForTimeout(300);
if ((await page.evaluate(() => window.__mepSketchScene.listStamps().length)) !== 0) throw new Error('the stamp was not deleted');
await save('deleted');
await save('deleted-again');

console.table(rows);
const grown = rows.find((r) => r.step === 'deleted').size - rows.find((r) => r.step === 'save2').size;
console.log(`${grown <= 100 ? 'PASS' : 'FAIL'}  after the delete the file is ${grown} B bigger than before the stamp (limit 100 B)`);
console.log('page errors:', errors.slice(0, 3));
await browser.close();
```
