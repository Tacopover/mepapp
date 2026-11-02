// Runs every dialog browser check one after another and prints the pass line of each.
import { spawnSync } from 'node:child_process';

const dir = '.claude/roadmap/work/';
const names = ['b3-check', 'b3-t02-check', 'b3-t03-check', 'b3-t04-check', 'b3-t05-check', 'b3-t06-check', 'b3-t07-check', 'b3-t08-check', 'b3-t09-check', 'b3-t11b-check', 'b3-t11c-check', 'b3-t11d-check', 'b3-t11e-check', 'b3-t11f-check', 'b3-t11g-check', 'b3-t11h-check', 'b2-t05-check', 'b2-t06-check', 'b2-t07-check', 'b2-t08-check'];
let failed = 0;
for (const n of names) {
  const r = spawnSync('node', ['.claude/roadmap/browser/with-server.mjs', dir + n + '.mjs'], { encoding: 'utf8', timeout: 600000 });
  const lines = (r.stdout + r.stderr).trim().split('\n').filter((l) => /passed|failed|Error/.test(l));
  const last = lines[lines.length - 1] || 'NO RESULT (exit ' + r.status + ')';
  if (!/ 0 failed/.test(last) && !/, 0 fail/.test(last)) failed++;
  console.log(n + ': ' + last);
}
console.log('checks with problems: ' + failed);
