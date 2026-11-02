// Records the user answers to D-B-27 and D-B-30 (2026-11-02, dashboard) and starts T11a.
import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'decision', id: 'D-B-27', status: 'answered', answer: 'A', by: 'user', reason: 'User answer 2026-11-02 on the dashboard.' });
add({ type: 'decision', id: 'D-B-30', status: 'answered', answer: 'A', by: 'user', reason: 'User answer 2026-11-02 on the dashboard.' });
add({ type: 'run', id: 'run', status: 'running', branch: 'worktree-buildings-model', note: 'B3-T11 implementation started after the user agreed to the plan and answered D-B-27 A and D-B-30 A.' });
add({ type: 'task', id: 'B3-T11', part: 'B3', state: 'implementing', summary: 'Plan agreed. Tasks T11a to T11j run one after another.' });
add({ type: 'task', id: 'B3-T11a', part: 'B3', state: 'briefed', role: 'task-lead' });
add({ type: 'now', id: 'now', role: 'task-lead', task: 'B3-T11a', note: 'Open documents view model', since: new Date().toISOString() });
