// T17: unit labels in the Properties panel. Run:
// node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t17-check.mjs
import { open, buildSizingProject, screenOf } from './r5-lib.mjs';

const t = await open();
const { page, check, idle, shot } = t;
const labels = () => page.evaluate(() => [...document.querySelectorAll('.mep-field-row label')].map((l) => (l.textContent ?? '').trim()));

await t.start();
await t.openPdf();
const b = await buildSizingProject(t, { type: 'air' });
await page.evaluate(() => window.__mepSketchScene.updateNetworkType('supply-air', { flowUnit: 'dm³/s' }));

// A segment, selected with a real click.
const pos = await screenOf(page, b.clickPoints[b.mainSegmentId]);
await page.mouse.click(pos.x, pos.y);
await idle(600);
const segLabels = await labels();
check(segLabels.includes('Diameter (mm)') && !segLabels.some((l) => /\(pt\)/.test(l) && /Diameter|Width|Height/.test(l)), 'a segment shows "Diameter (mm)"', JSON.stringify(segLabels));
await shot('T17-properties-units-segment');

// A terminal connected to a Supply Air segment whose type has flowUnit dm3/s.
await page.evaluate((id) => window.__mepSketchScene.selectStampById(id), b.terminalIds[0]);
await idle(600);
let l2 = await labels();
check(l2.includes('Capacity (dm³/s)'), 'a connected terminal shows "Capacity (dm³/s)"', JSON.stringify(l2));
await shot('T17-properties-units');

// A stamp with no segment.
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  const p = s.exportProject();
  const term = p.stamps.find((x) => x.id === 'term-1');
  p.stamps.push({ ...JSON.parse(JSON.stringify(term)), id: 'lone', transform: { ...term.transform, position: { x: term.transform.position.x, y: term.transform.position.y + 500 } } });
  s.loadProjectFromJson(JSON.parse(JSON.stringify(p)));
});
await idle(1500);
await page.evaluate(() => window.__mepSketchScene.selectStampById('lone'));
await idle(600);
l2 = await labels();
check(l2.includes('Capacity') && !l2.some((l) => /^Capacity \(/.test(l)), 'a stamp with no segment shows "Capacity"', JSON.stringify(l2));

await t.finish();
