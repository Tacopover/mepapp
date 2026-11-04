// Shared setup of the B2-T07 and B2-T08 browser checks: two real documents, one segment each, a scale, Save, then a building file.
import { readXlsx } from './xlsx-read.mjs';

export const GROUND = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/00_arch_ground_floor.pdf';
export const FIRST = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/01_arch_first_floor.pdf';

const screenOf = (page, p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);

export async function drawSegmentWithTool(t, from, to) {
  const { page, idle } = t;
  const tool = async (title) => {
    await page.locator(`button.mep-rail-btn[title="${title}"]`).click();
    await idle(300);
  };
  await tool('Segment');
  for (const p of [from, to]) {
    const at = await screenOf(page, p);
    await page.mouse.click(at.x, at.y);
    await idle(500);
  }
  await page.keyboard.press('Escape');
  await idle(300);
  await tool('Select');
}

async function saveActive(t, label) {
  const { check, menu, until, statusText, idle } = t;
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
  check(/^Saved /.test(await statusText()), `${label} saved`, await statusText());
}

/** Opens both tracked fixtures, draws one segment on each with the Segment tool, sets a 1:100 scale, saves each. */
export async function makeTwoDocuments(t) {
  const { page, check, idle } = t;
  const out = {};
  for (const [key, path, name] of [['ground', GROUND, 'ground.pdf'], ['first', FIRST, 'first.pdf']]) {
    await t.openPdf(path, name);
    await drawSegmentWithTool(t, { x: 300, y: 300 }, { x: 500, y: 300 });
    await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
    const segs = await page.evaluate(() => window.__mepSketchScene.exportProject().segments.length);
    check(segs === 1, `${key}: one segment drawn`, String(segs));
    out[key] = await page.evaluate(() => window.__mepSketchScene.getProjectUuid());
    await saveActive(t, key);
  }
  check(out.ground && out.first && out.ground !== out.first, 'two documents with two different ids', JSON.stringify(out));
  return out;
}

export const buildingOf = (u0, u1) => ({
  schemaVersion: 1, id: 'b-b2', name: 'Tower',
  levels: [{ id: 'l0', name: 'Level 0', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 3000 }],
  sheets: [
    { id: 's1', levelId: 'l0', projectUuid: u0, pageIndex: 0, displayName: 'Ground', location: { fileName: 'ground.pdf', path: 'ground.pdf' } },
    { id: 's2', levelId: 'l1', projectUuid: u1, pageIndex: 0, displayName: 'First', location: { fileName: 'first.pdf', path: 'first.pdf' } },
  ],
  risers: [],
});

/** Loads the building through the dev hook and rebuilds the summaries from the saved PDFs in OPFS. */
export async function loadBuildingWithSummaries(t, building) {
  const { page, check } = t;
  await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(building));
  const res = await page.evaluate(async () => {
    const read = async (sheet) => {
      try {
        return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile();
      } catch {
        return undefined;
      }
    };
    const r = await window.__mepBuilding.rebuildSummaries(read);
    return { ok: r.ok, failed: r.failed.length };
  });
  check(res.ok === 2 && res.failed === 0, 'summaries rebuilt for 2 documents', JSON.stringify(res));
}

/** Records the suggested file name of every Save dialog. */
export async function recordSuggestedNames(t) {
  await t.page.evaluate(() => {
    const orig = window.showSaveFilePicker;
    window.__suggested = [];
    window.showSaveFilePicker = async (o) => {
      window.__suggested.push(o?.suggestedName);
      return orig(o);
    };
  });
}

export const dialog = (t) => t.page.locator('.mep-modal');

export async function openScopeDialog(t) {
  await t.menu('Export quantities to Excel…');
  await dialog(t).waitFor({ state: 'visible', timeout: 8000 });
  await t.idle(300);
}

const RADIO = { sheet: 0, document: 1, level: 2, building: 3 };

/** Picks a scope with real clicks and presses Export. Returns the parsed xlsx and the suggested file name. */
export async function exportScope(t, scope, levelName) {
  const { page, until, statusText, idle } = t;
  const count = await page.evaluate(() => (window.__suggested ?? []).length);
  await openScopeDialog(t);
  await dialog(t).locator('input[type=radio]').nth(RADIO[scope]).check();
  if (scope === 'level' && levelName) await dialog(t).locator('select[aria-label="Level"]').selectOption({ label: levelName });
  await idle(200);
  await dialog(t).locator('button', { hasText: /^Export$/ }).click();
  await until(async () => (await page.evaluate(() => (window.__suggested ?? []).length)) > count, `export ${scope}`, 60000);
  await idle(1500);
  await idle(500);
  const status = await statusText();
  const b64 = await page.evaluate(async () => {
    const f = await (await (await navigator.storage.getDirectory()).getFileHandle('export.json')).getFile();
    const bytes = new Uint8Array(await f.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const names = await page.evaluate(() => window.__suggested ?? []);
  return { status, xlsx: readXlsx(Buffer.from(b64, 'base64')), suggested: names[names.length - 1] };
}
