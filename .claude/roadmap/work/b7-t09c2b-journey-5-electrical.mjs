// Journey (5b): an electrical riser with no source level.
import { runScenario } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-scn.mjs';
import { EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const type = { id: 'power-main', name: 'Power', discipline: 'electrical', units: 'kW', defaultCapacity: 1, color: '#e53935', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'kW' };
await runScenario({
  tag: 'j5elec',
  specs: EXAMPLE5,
  type,
  widths: [1600, 760],
  expect: { main: 'Main level: not known yet (no source level)' },
});
