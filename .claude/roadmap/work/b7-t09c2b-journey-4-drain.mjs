// Journey (5a): a drain riser with no source level.
import { runScenario } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-scn.mjs';
import { EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const type = { id: 'sanitary-waste', name: 'Drain', discipline: 'plumbing', units: 'L/s', defaultCapacity: 1, color: '#795548', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'l/s' };
await runScenario({
  tag: 'j5drain',
  specs: EXAMPLE5,
  type,
  widths: [1600, 760],
  expect: { main: 'Main level: not known yet (no source level)' },
});
