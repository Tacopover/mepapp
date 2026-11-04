import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T12b', part: 'B3', state: 'done', commit: '85382da', summary: 'Add PDFs and Add folder place pages on the selected level (Not placed only with no level selected), Open keeps the dialog open, reopened documents match by path (duplicate tab after Save). b3-t12b-check 19/19, UI tests 662, pnpm build --force 9/9. Old checks adapted; b3-t03 and b3-t11d still red until T12e. Open: a changed file at the same path now switches to the stale tab; case-insensitive path match on all platforms; not verified on Windows.' });
add({ type: 'now', id: 'now', role: '', task: 'B3-T12c', note: 'Windows feedback round: T12a, T12b done, T12c running.' });
