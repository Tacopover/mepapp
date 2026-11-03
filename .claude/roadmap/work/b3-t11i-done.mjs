import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11i', part: 'B3', state: 'done', commit: '51a887a', summary: 'Export quantities with no building open shows a Building select over the recent list, Open building and Manage Buildings; Level and Building scopes then work. The status-bar sheet chip is a button that opens the dialog at its level. The "Saved" header text clears on a tab change. Status text after Read summaries now is short and fixed. Core text says "Read summaries now". Plain words: PDF missing, no access to the PDF, not saved yet. Core 2179 tests, UI 651 tests, build 9/9, new check 28/28, and I ran all 21 dialog browser checks after the last change: 583 passed, 0 failed. Not run: Tauri paths, the real Open building file picker, keyboard walk, screen reader, dark theme. Open: the status bar is crowded at 1600 px (the chip shows "Tower / Level 1..."); the dialog result text still says "Rebuilt N of M"; the Export dialog width changes with the scope.' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11i done. Next: B3-T11j.' });
const shots = [
  ['S-B3-T11i-1', 'Export quantities with no building open: pick a recent building', '6215db3806d270f5765ab302466430ce'],
  ['S-B3-T11i-2', 'Status bar chip at 1600 px with the sheet path', 'c06b23af5044885231e8d3cbe79e4421'],
  ['S-B3-T11i-3', 'Status bar at 560 px', 'e584e2bd01c90de87e5bf808df01a405'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11i', caption, assetId, url: '/_blob/' + assetId });
}
