// UI review B7-T05 part 3: the takeoff Risers table (Building scope export) in 4 states.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { exportScope, recordSuggestedNames } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b2-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-ui-review-setup.mjs';

const t = await open();
const { page, check } = t;
await t.start();
const { baseBuilding, building, summaries, loadState } = await setup(t);
await recordSuggestedNames(t);

async function run(tag, b, sums) {
  await loadState(b, sums);
  const all = await exportScope(t, 'building');
  const sheets = all.xlsx.sheets;
  console.log(`== ${tag}: sheets`, JSON.stringify(Object.keys(sheets)), 'suggested', all.suggested, 'status', all.status);
  const table = sheets.Risers ?? [];
  console.log(`   HEAD`, JSON.stringify(table[0]));
  for (const r of table.slice(1)) console.log(`   ROW `, JSON.stringify(r));
  console.log(`   WARNINGS`, JSON.stringify((sheets.Warnings ?? []).map((r) => r[0])));
  return all;
}

const full = await run('full', building, summaries);
{
  const head = full.xlsx.sheets.Risers[0];
  const i = head.indexOf('Capacity');
  check(i >= 0 && head.length - i === 3, 'the 3 capacity columns are the last 3', JSON.stringify(head));
}
const atLeast = await run('atleast', building, [summaries[0], null, summaries[2]]);
const noSource = JSON.parse(summaries[0]);
noSource.riserNetworks[0].hasSource = false;
await run('unknown', building, [JSON.stringify(noSource), summaries[1], summaries[2]]);
const noUnit = baseBuilding();
noUnit.risers[0].networkType = { ...noUnit.risers[0].networkType };
delete noUnit.risers[0].networkType.flowUnit;
await run('nounit', noUnit, summaries);
const elec = baseBuilding();
elec.risers[0].networkType = { ...elec.risers[0].networkType, discipline: 'electrical' };
await run('notdesign', elec, summaries);
await t.finish();
