// Journey (3): a source on level 0 only.
import { runScenario } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-scn.mjs';
import { EXAMPLE5 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-journey-lib.mjs';

const specs = EXAMPLE5.map((s, i) => ({ ...s, equipment: i === 0 }));
await runScenario({
  tag: 'j3src',
  specs,
  expect: { main: 'Main level: Level 0', mustNot: /at most|No source level yet|Place an air|none yet|not known yet/, propsMain: 'Level 0', propsNoHint: false },
});
