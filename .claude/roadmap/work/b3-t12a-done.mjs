import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T12a', part: 'B3', state: 'done', commit: '66a436c', summary: 'Levels sort by elevation (then name), Move up/down and Sort by elevation removed, buildings in the tree sorted alphabetically and fixed. Browser check b3-t12a-check 16/16, UI tests 652, core 2175, pnpm build --force 9/9. Not verified: Export level select order has no test; Windows. Old checks b3-t03 and b3-t11d use the removed buttons: T12e must update them.' });
add({ type: 'now', id: 'now', role: '', task: 'B3-T12b', note: 'Windows feedback round (plan buildings-b3-feedback.md): T12a done, T12b running.' });
