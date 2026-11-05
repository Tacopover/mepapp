// Runs browser check scripts one after another, prints the result line of each, and exits with a non-zero code if any check fails.
// A check fails when its exit code is not 0, or when it prints no result line, or when the result line has a failure count above 0.
//
// Usage (from the repository root):
//   node .claude/roadmap/browser/run-checks.mjs <list.json> [--only <name>[,<name>...]]
// <list.json> holds { "dir": "<folder of the checks>", "names": ["a-check", "b-check"] } (names without .mjs).
// Use --only for the checks that a task changes. Run the full list once for each part.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const listPath = args[0];
if (!listPath) {
  console.error('usage: run-checks.mjs <list.json> [--only a,b]');
  process.exit(2);
}
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? (args[onlyAt + 1] ?? '').split(',').filter(Boolean) : null;
const list = JSON.parse(readFileSync(resolve(listPath), 'utf8'));
const names = only ? list.names.filter((n) => only.includes(n)) : list.names;
if (only) {
  const missing = only.filter((n) => !list.names.includes(n));
  if (missing.length) {
    console.error(`not in the list: ${missing.join(', ')}`);
    process.exit(2);
  }
}

let problems = 0;
for (const n of names) {
  const started = Date.now();
  const r = spawnSync('node', [join(here, 'with-server.mjs'), join(resolve(list.dir), n + '.mjs')], { encoding: 'utf8', timeout: 600000 });
  const lines = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').filter((l) => /passed|failed|Error/.test(l));
  const last = lines.at(-1);
  const failedCount = Number(/(\d+) fail/.exec(last ?? '')?.[1] ?? NaN);
  const bad = r.status !== 0 || last === undefined || !(failedCount === 0);
  if (bad) problems++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${n} (${Math.round((Date.now() - started) / 1000)} s): ${last ?? 'NO RESULT'}${r.status !== 0 ? ` [exit ${r.status}]` : ''}`);
}
console.log(`checks run: ${names.length}, with problems: ${problems}`);
process.exit(problems ? 1 : 0);
