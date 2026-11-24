// Journey (4): K = 1. Only level 1 has an open end, no equipment.
import { runScenario } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-scn.mjs';
import { EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const specs = EXAMPLE5.map((s, i) => ({ ...s, openEnd: i === 1 }));
await runScenario({
  tag: 'j4k1',
  specs,
  expect: { main: 'Main level: none yet (no source level)', mustNot: /at most|No source level yet|Place an air|Numbers show/, propsMain: 'none yet (no source level)', propsNoHint: true },
});
