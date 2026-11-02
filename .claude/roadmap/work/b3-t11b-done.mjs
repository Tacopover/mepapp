import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11b', part: 'B3', state: 'done', commit: 'ccdbea0', summary: 'MepApp writes the sheet summary when a PDF opens (id must be in the file; copy question = no write; drifted = no write), links sheets with no id, Rebuild links too. UI 578 tests, build 9/9, new check 19/19, old checks b3-t08 19/19, b3-t06 25/25, b3-check 22/22. Not run: Tauri paths; a path match only has unit tests on web.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11b done. Next: B3-T11c.' });
