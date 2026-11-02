import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11e', part: 'B3', state: 'done', commit: '6cddc6b', summary: 'Sheets of the selected level are first in the right pane, then compact level settings. Each row: file, page, one status chip (OK, Missing, No access, Not saved yet, No summary), Open or Choose file, Relink, Grant access, Move to, Remove. Footer "N of M sheets have a summary". One fix round after my look at the screenshot (sheets were clipped below the level fields). UI 632 tests, build 9/9, new check 40/40, all 16 old checks pass after the last change (task lead tester). Not run: Tauri paths, dark theme, screen reader, keyboard walk of the rows. Open: Building name create input may stay when the store is busy (not reproduced; T11h); a PDF with more than 20 sheets in one level is not collapsed.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11e done. Next: B3-T11f.' });
const shots = [
  ['S-B3-T11e-1', 'Ground floor with 3 sheets: rows and footer visible', 'ffdc2142eafe188b0a4fd22c25358273'],
  ['S-B3-T11e-2', 'Narrow 760x640 level with sheets', '422420df8b4b68964addb028a98a4182'],
  ['S-B3-T11e-3', 'A missing sheet with Relink', '02397198b4a83b9859796a72b106b861'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11e', caption, assetId, url: '/_blob/' + assetId });
}
