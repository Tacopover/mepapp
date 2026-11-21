// B7-T04b journey B: states (known, at least, no source, two sources, long names, no unit, drain) at 1600 and 760 (dock 420 and 280).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const t = await open();
const { page, check, idle } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);
const snap = async (name) => {
  const path = `${SHOTS}journey-${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p, wait = 500) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(wait);
}
const clickFitting = async () => clickPoint({ x: 300, y: (await pageH()) - 300 });
const clickDuct = async () => clickPoint({ x: 375, y: (await pageH()) - 300 });
async function loadBuilding(file, stored) {
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(file), stored]);
  await idle(1200);
}
const read = () =>
  page.evaluate(() => {
    const body = document.querySelector('.mep-dock-body');
    const sec = body.querySelector('[data-testid="props-riser-section"]');
    const row = [...body.querySelectorAll('.mep-field-row')].find((r) => /solved capacity/i.test(r.querySelector('label')?.textContent ?? ''));
    const cut = [];
    if (sec) for (const el of sec.querySelectorAll('*')) if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') cut.push(el.className || el.tagName);
    const dock = document.querySelector('.mep-dock');
    return {
      solved: row?.querySelector('input')?.value ?? null,
      section: sec ? sec.innerText.replace(/\n+/g, ' | ') : null,
      secWidth: sec ? Math.round(sec.getBoundingClientRect().width) : null,
      secScrollW: sec ? sec.scrollWidth : null,
      bodyScrollW: body.scrollWidth,
      bodyClientW: body.clientWidth,
      dockW: Math.round(dock.getBoundingClientRect().width),
      cut,
    };
  });
async function setDock(width) {
  const h = page.locator('.mep-resize-handle');
  const box = await h.boundingBox();
  const cur = (await page.locator('.mep-dock').boundingBox()).width;
  const dx = cur - width;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await idle(400);
}

const two = JSON.parse(JSON.stringify(building));
const longNames = JSON.parse(JSON.stringify(building));
longNames.levels.forEach((l, i) => (l.name = `Level ${i} - ${'Main technical floor with plant rooms and very long name '.repeat(2)}`.slice(0, 80)));
longNames.risers[0].name = 'R1 ' + 'Ventilation supply riser for the north wing '.repeat(2).slice(0, 77);
const noUnit = JSON.parse(JSON.stringify(building));
delete noUnit.risers[0].networkType.flowUnit;
const drain = JSON.parse(JSON.stringify(building));
drain.risers[0].networkType.discipline = 'plumbing';
drain.risers[0].networkType.name = 'Sanitary Waste';
const all = { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] };
const noSource = JSON.parse(summaries[0]);
noSource.riserNetworks[0].hasSource = false;
noSource.savedAt = new Date(Date.now() + 5000).toISOString();
const twoSrc = JSON.parse(summaries[2]);
twoSrc.riserNetworks[0].hasSource = true;
twoSrc.savedAt = new Date(Date.now() + 8000).toISOString();

const STATES = [
  ['known', building, all],
  ['atleast', building, { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1] }],
  ['nosource', building, { ...all, [uuids[0]]: JSON.stringify(noSource) }],
  ['twosources', building, { ...all, [uuids[2]]: JSON.stringify(twoSrc) }],
  ['longnames', longNames, all],
  ['nounit', noUnit, all],
  ['drain', drain, all],
];

await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: 'l1.pdf' }).first().click();
await idle(1500);
await page.locator('button.mep-rail-btn[title="Select"]').click();

async function runAll(tag) {
  for (const [name, b, stored] of STATES) {
    await loadBuilding(b, stored);
    await clickFitting();
    const r = await read();
    console.log(`${tag} ${name}: solved=${r.solved} dock=${r.dockW} sec=${r.secWidth}/${r.secScrollW} body=${r.bodyClientW}/${r.bodyScrollW} cut=${JSON.stringify(r.cut)}\n    ${r.section}`);
    await snap(`B-${name}-${tag}`);
  }
}
await runAll('1600-d420');
await page.setViewportSize({ width: 760, height: 900 });
await idle(600);
await runAll('760-d420');
await setDock(280);
console.log('dock now', (await page.locator('.mep-dock').boundingBox()).width);
await runAll('760-d280');
// the duct at the narrow width
await loadBuilding(building, all);
await clickDuct();
console.log('duct 760-d280', JSON.stringify(await read()));
await snap('B-duct-760-d280');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
