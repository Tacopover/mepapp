// B1-T21: the dev hook window.__mepBuilding loads a building and reads it back.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check } = t;
await t.start();

const has = await page.evaluate(() => typeof window.__mepBuilding?.load === 'function');
check(has, 'hook exists in dev');
const json = JSON.stringify({ schemaVersion: 1, id: 'b1', name: 'Tower', levels: [], sheets: [], risers: [] });
const before = await page.evaluate(async () => (await window.__mepBuilding.read()) ?? null);
check(before === null, 'empty before load', JSON.stringify(before));
const out = await page.evaluate(async ([j]) => {
  window.__mepBuilding.load(j, { u1: 'sum1' });
  const r = await window.__mepBuilding.read();
  return { json: r.json, rev: r.revision, sum: await window.__mepBuilding.store.readSummary('u1'), list: await window.__mepBuilding.store.listSummaries() };
}, [json]);
check(out.json === json, 'read back equals loaded json');
check(out.sum === 'sum1' && out.list.join() === 'u1', 'summary read back', JSON.stringify(out));
const w = await page.evaluate(async () => {
  const s = window.__mepBuilding.store;
  const r0 = await s.read();
  const r1 = await s.write('{"x":1}', r0.revision);
  return { r0: r0.revision, r1: r1.revision };
});
check(w.r0 !== w.r1, 'write returns new revision', JSON.stringify(w));
await t.finish();
