// T07: getConnectivity() returns the same ids as exportProject() and returns copies.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t07-check.mjs
import { open, buildMixedGroupProject } from './r3-lib.mjs';

const t = await open();
const { page, check } = t;

await t.start();
await t.openPdf();
await buildMixedGroupProject(t, 'mixed');

const read = () =>
  page.evaluate(() => {
    const s = window.__mepSketchScene;
    const p = s.exportProject();
    const c = s.getConnectivity();
    return {
      expSeg: p.segments.map((x) => x.id).sort(),
      expFit: p.fittings.map((x) => x.id).sort(),
      expGroups: JSON.stringify(p.portGroups),
      conSeg: c.segments.map((x) => x.id).sort(),
      conFit: c.fittings.map((x) => x.id).sort(),
      conGroups: JSON.stringify(c.portGroups),
    };
  });

const r = await read();
check(r.conSeg.length === 4 && JSON.stringify(r.conSeg) === JSON.stringify(r.expSeg), 'segment ids equal exportProject', JSON.stringify(r.conSeg));
check(r.conFit.length === 4 && JSON.stringify(r.conFit) === JSON.stringify(r.expFit), 'fitting ids equal exportProject', JSON.stringify(r.conFit));
check(r.conGroups === r.expGroups && r.conGroups.includes('"out"'), 'port group equals exportProject', r.conGroups);

const mutated = await page.evaluate(() => {
  const s = window.__mepSketchScene;
  const c = s.getConnectivity();
  c.segments.push({ id: 'bogus' });
  c.fittings.length = 0;
  c.portGroups[0].portIds.push('bogus');
  c.portGroups.push({ elementId: 'x', portIds: [] });
  const d = s.getConnectivity();
  return { seg: d.segments.length, fit: d.fittings.length, groups: JSON.stringify(d.portGroups) };
});
check(mutated.seg === 4 && mutated.fit === 4, 'push/clear on the result does not change the arrays', JSON.stringify(mutated));
check(mutated.groups === r.expGroups, 'change of a group copy does not change the document', mutated.groups);
const r2 = await read();
check(JSON.stringify(r2) === JSON.stringify(r), 'exportProject is unchanged after the mutation');

await t.finish();
