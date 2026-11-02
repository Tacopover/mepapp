import { execFileSync } from 'node:child_process';

const add = (e) => console.log(execFileSync('node', ['.claude/roadmap/ledger.mjs', '--stream', 'buildings', 'add', JSON.stringify(e)], { cwd: '/root/MepApp/.claude/worktrees/buildings-model' }).toString().trim().slice(0, 70));

const shots = [
  ['S-B3-T11c-1', 'Dialog at 1600x1000: tree with two buildings, the open one expanded', 'e99f690f44df1fb4bda13c34edd2dc21'],
  ['S-B3-T11c-2', 'Dialog at 760x640: a select replaces the tree', '4358ba1fdeead4e400d92b970358546d'],
  ['S-B3-T11c-3', 'No building open, Building menu open', 'c62964b295d8a8a46239b1b9b1bd7c9e'],
];
for (const [id, caption, assetId] of shots) {
  add({ type: 'shot', id, part: 'B3', task: 'B3-T11c', caption, assetId, url: '/_blob/' + assetId });
}
