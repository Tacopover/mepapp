// J2 (B7-T09c-3): old building. Summary of one level has no openEnds. Setup only: load the building with a stored summary that lacks openEnds.
import { begin } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-journey-lib.mjs';
const j = await begin();
const { page, dlg, snap, openRisersTab, closeDialog, dlgLines, idle, check, overflow, built } = j;
const capLines = async () => {
  const lines = await dlgLines();
  const a = lines.indexOf('Capacity');
  const b = lines.indexOf('Flow direction');
  return lines.slice(a, b < 0 ? undefined : b);
};
const summaries = {};
built.uuids.forEach((u, i) => {
  const s = JSON.parse(built.summaries[i]);
  console.log('RISERNETWORKS', i, JSON.stringify(s.riserNetworks).slice(0, 600));
  if (i === 1) for (const n of s.riserNetworks) delete n.openEnds;
  summaries[u] = JSON.stringify(s);
});
console.log('RN1-after', JSON.stringify(JSON.parse(summaries[built.uuids[1]]).riserNetworks).slice(0, 600));
// reload the page so no document is open, then load the building with the old summary
await page.reload();
await idle(1500);
await idle(500);
await page.evaluate(([b, s]) => window.__mepBuilding.load(b, s), [JSON.stringify(built.building), summaries]);
await idle(1000);
const H = { 1600: 900, 1100: 900, 760: 900 };
await openRisersTab();
for (const w of [1600, 1100, 760]) {
  await page.setViewportSize({ width: w, height: H[w] });
  await idle(700);
  const lines = await capLines();
  console.log('J2 CAP', w, JSON.stringify(lines));
  const pos = await page.evaluate(() => {
    const modal = document.querySelector('.mep-modal');
    const bs = [...modal.querySelectorAll('button')].filter((b) => /Read summaries now|Set by hand/.test(b.textContent));
    const mb = modal.querySelector('.mep-rp-capbox')?.getBoundingClientRect();
    return { capboxBottom: mb && Math.round(mb.bottom), buttons: bs.map((b) => ({ t: b.textContent.trim(), top: Math.round(b.getBoundingClientRect().top), left: Math.round(b.getBoundingClientRect().left) })) };
  });
  console.log('J2 POS', w, JSON.stringify(pos));
  await snap(`j2-${w}-old`);
  await overflow(`J2 ${w}`);
}
await page.setViewportSize({ width: 1100, height: 900 });
await idle(500);
const link = dlg.getByRole('button', { name: /Read summaries now/ });
console.log('LINK COUNT', await link.count());
if ((await link.count()) > 0) {
  await link.first().click();
  await idle(300);
  console.log('J2 DURING', JSON.stringify(await capLines()));
  await snap('j2-1100-reading');
  await idle(2500);
  const lines = await capLines();
  console.log('J2 AFTER', JSON.stringify(lines));
  check(!lines.some((l) => /no open-end data/.test(l)), 'J2: the note goes after the click', JSON.stringify(lines));
  console.log('STATUS', JSON.stringify((await dlgLines()).filter((l) => /Read|summar|failed|could not/i.test(l))));
  await snap('j2-1100-after-read');
}
check(j.errors.length === 0, 'no page errors', j.errors.join(' | '));
await j.t.finish();
