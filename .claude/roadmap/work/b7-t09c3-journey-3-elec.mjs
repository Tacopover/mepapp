import { runJ3 } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-journey-3-lib.mjs';
const type = { id: 'power-main', name: 'Power', discipline: 'electrical', units: 'kW', defaultCapacity: 1, color: '#e53935', lineWidthPt: 2, linePattern: 'solid', flowUnit: 'kW' };
await runJ3('elec', type, 'Connected load, not a design load');
