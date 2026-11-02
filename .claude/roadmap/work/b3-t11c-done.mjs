import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11c', part: 'B3', state: 'done', commit: '0ac88fe', summary: 'New Manage Buildings shell: fixed size 1100x760, tree of buildings and levels, Building menu, one Close button, select instead of tree below 900 px, level of the active sheet selected on open. UI 597 tests, build 9/9, new browser check 66/66. Old checks b3-02/05/check/09/03/04 pass after the fixes; b3-t06/07/08/t11b and b2 checks passed only before the last CSS and key fixes (task lead report). Not run: Tauri paths, real building switch (web store holds one file).' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11c done. Next: B3-T11d.' });
