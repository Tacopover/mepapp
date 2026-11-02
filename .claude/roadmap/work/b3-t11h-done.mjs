import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11h', part: 'B3', state: 'done', commit: '9fae3a8', summary: 'The Summaries section is gone. The repair line "N sheets have no summary" with "Read summaries now" shows only when N is above 0, with progress, Cancel (stops between documents) and a result list with Relink and Open per failed sheet. One in-dialog ask before Close building, switching, Create, Open building and opening a sheet when pages wait. Files are checked again on window focus; Refresh is an icon button. Narrow layout: the body scrolls (about 395 px high at 760x640). A late PDF read no longer lands in a new building. The create row bug: Enter in the name input fired a click on the new-building button; fixed. UI 648 tests, build 9/9, new check 35/35, and I ran all 20 dialog browser checks myself after the last change: 555 passed, 0 failed. Not run: Tauri paths, real building switch on web (unit-tested text only), Cancel in a real multi-document run, keyboard walk, screen reader, dark theme.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11h done. Next: B3-T11i.' });
const shots = [
  ['S-B3-T11h-1', 'Repair line, result list with Relink and Open', '2659986716d44b564d9a4c8bfb905091'],
  ['S-B3-T11h-2', 'Narrow 760x640 with the repair line', '9e63cd4b15dc3c61bf7bdd233ee31299'],
  ['S-B3-T11h-3', 'Ask before Close building with pages waiting', '6598a10cfc36a49d20e63066837ccf2a'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11h', caption, assetId, url: '/_blob/' + assetId });
}
