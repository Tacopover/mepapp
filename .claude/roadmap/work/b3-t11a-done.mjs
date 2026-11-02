import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11a', part: 'B3', state: 'done', commit: '095792e', summary: 'DocumentSummary has projectUuid, pageCount, sizeBytes and projectUuidInFile; openDocumentRows view; FileTarget.path; relinkSheet duplicate guard. Found: an opened PDF with no embedded id gets a random in-memory id, so the flag projectUuidInFile was added (T11b and T11f use it). Core 2179, ui 562 tests passed, build 9/9, browser check 15/15, old b3-t06 check 25/25. Not run: Tauri paths. No visible change.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11a done. Next: B3-T11b.' });
