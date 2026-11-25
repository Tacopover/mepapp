// B7-T12: setup shared by the explore script and the check. Builds a version 22 project file (old names) from real stamps.
import { writeFileSync } from 'node:fs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';
import { writePdfWithProject, readProjectText } from './b7-t12-pdf.mjs';

const REPO = '/root/MepApp/.claude/worktrees/buildings-b7';
const core = await import(`${REPO}/packages/core/dist/index.js`);
const SCRATCH = '/tmp/claude-0/-root-MepApp/cf5c37c1-d676-49ff-a984-22050b48ded8/scratchpad/b7-t12/';
export const OLD_PDF = `${SCRATCH}old-v22.pdf`;
export const NEW_SAVED_PDF = `${SCRATCH}new-saved.pdf`;

// The hand-computed numbers of the fixture (capacity x concurrency).
export const EXPECT = {
  c1: { terminals: [100, 200], own: 80, effective: 80, concurrent: 240 },
  c2: { terminals: [300], own: undefined, effective: 90, concurrent: 270 },
  panelDefault: 90,
  totalVa: 600,
  totalConcurrent: 510,
};

/** Places four stamps with real clicks (the first is the panel equipment, three are terminals) and returns the project as the app exports it. */
export async function placeStampsAndExport(t) {
  const spots = [{ x: 650, y: 450 }, { x: 800, y: 450 }, { x: 950, y: 450 }, { x: 1100, y: 450 }];
  for (const at of spots) await placeOneStamp(t, at);
  return t.page.evaluate(() => JSON.parse(JSON.stringify(window.__mepSketchScene.exportProject())));
}

/** The project of the fixture in the NEW form, from the exported project. */
export function fixtureProject(exported) {
  const p = structuredClone(exported);
  const [panelStamp, t1, t2, t3] = p.stamps;
  panelStamp.category = 'equipment';
  for (const s of [t1, t2, t3]) s.category = 'terminal';
  for (const s of p.stamps) {
    delete s.routingTargets;
    delete s.autoPlaced;
  }
  p.terminalCapacities = { [t1.id]: 100, [t2.id]: 200, [t3.id]: 300 };
  p.panels = [
    {
      id: 'panel-1',
      equipmentStampId: panelStamp.id,
      name: 'Panel A',
      sortDirection: 'ascending',
      accessories: [],
      sectionIds: [],
      circuitDefaults: { prefix: 'A', phase: 'L1', concurrencyPercent: EXPECT.panelDefault },
    },
  ];
  p.circuits = [
    { id: 'circuit-1', number: 1, panelId: 'panel-1', terminalIds: [t1.id, t2.id], isSpare: false, concurrencyPercent: EXPECT.c1.own },
    { id: 'circuit-2', number: 2, panelId: 'panel-1', terminalIds: [t3.id], isSpare: false },
  ];
  p.schematics = core.SCHEMATIC_TEMPLATE_LIBRARY.map((template, i) =>
    core.createSchematic({ id: `schematic-${i + 1}`, name: `Panel A ${template.id}`, panelId: 'panel-1', source: template, library: [] }),
  );
  return p;
}

/** The same project as a version 22 file text: the old names, nothing else changed. */
export function oldFormText(project) {
  return JSON.stringify({ ...project, schemaVersion: 22 })
    .replaceAll('concurrencyPercent', 'diversityPercent')
    .replaceAll('concurrentCapacity', 'diversifiedCapacity')
    .replaceAll('Concurrent VA', 'Diversified VA');
}

/** The bytes of a file in the page's OPFS. */
export async function readOpfs(page, name) {
  const b64 = await page.evaluate(async (n) => {
    const file = await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, name);
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Menu > Save through the real menu. Returns once the status says Saved. */
export async function saveDocument(t) {
  const { page, until, statusText, idle } = t;
  await page.locator('button.mep-menu-btn').click();
  await page.locator('button.mep-menu-item', { hasText: /^\s*Save\s*$/ }).click();
  await until(async () => /Saved |Failed/.test(await statusText()), 'save');
  await idle(800);
  return statusText();
}

/**
 * Loads the new-form fixture into the open document, saves it with the real Save, takes the saved PDF and puts the OLD form of the project
 * text into a copy (version 22, old names). Returns { savedText, oldText }.
 */
export async function makeOldFile(t, exported, name = 'drawing.pdf') {
  const { page, idle } = t;
  const fixture = fixtureProject(exported);
  await page.evaluate((raw) => window.__mepSketchScene.loadProjectFromJson(JSON.parse(raw)), JSON.stringify(fixture));
  await idle(1500);
  const status = await saveDocument(t);
  const bytes = await readOpfs(page, name);
  writeFileSync(NEW_SAVED_PDF, bytes);
  const savedText = readProjectText(bytes);
  const oldText = oldFormText(JSON.parse(savedText));
  writePdfWithProject(NEW_SAVED_PDF, OLD_PDF, oldText);
  return { savedText, oldText, status };
}
