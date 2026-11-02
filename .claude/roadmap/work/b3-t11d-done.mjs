import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

add({ type: 'task', id: 'B3-T11d', part: 'B3', state: 'done', commit: '640c7c4', summary: 'Levels in the tree: "+ Add level" item (new level selected, name focused), one level detail (name, elevation, up/down, Delete), blocked Delete with reason, empty level deletes with 8 s Undo, Sort by elevation shows its reason, Alt+Up/Down moves a level. UI 612 tests, build 9/9, new check 51/51, all 15 old browser checks pass after the last change (task lead tester). Not run: Tauri paths, screen reader. Seen, not fixed: the "Building name" create input stays visible after a building is created (maybe a T11c leftover).' });
add({ type: 'now', id: 'now', role: '', task: '', note: 'B3-T11d done. Next: B3-T11e.' });
const shots = [
  ['S-B3-T11d-1', 'Level detail at 1600x1000', '196e7fe5f3a65c979c7d5321a49220e3'],
  ['S-B3-T11d-2', 'Undo line after deleting an empty level', '14f3773b8a22462b7c0f54268964d931'],
  ['S-B3-T11d-3', 'Delete blocked with its reason', 'ae14d24936ec89da71d0b909fe82f0ba'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11d', caption, assetId, url: '/_blob/' + assetId });
}
