import { spawnSync } from 'node:child_process';

const dir = '.claude/roadmap/work/';
const names = process.argv.slice(2);
for (const n of names) {
  const r = spawnSync('node', ['.claude/roadmap/browser/with-server.mjs', dir + n + '.mjs'], { encoding: 'utf8', timeout: 600000 });
  const lines = (r.stdout + r.stderr).trim().split('\n').filter((l) => /passed|failed|Error|FAIL/.test(l));
  console.log(n + ': ' + lines.slice(-4).join(' | '));
}
