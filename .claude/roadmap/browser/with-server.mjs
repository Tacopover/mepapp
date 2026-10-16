// Starts the Vite dev server of apps/web, runs one browser check script against it, stops the server, and exits with the exit code of the check.
// Usage: node .claude/roadmap/browser/with-server.mjs <check.mjs> [args...]
// Environment: MEPAPP_REPO (worktree root), MEPAPP_PORT (default 5462), MEPAPP_SHOTS (screenshot folder), MEPAPP_PDF. See lib.mjs.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const repo = process.env.MEPAPP_REPO ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const port = process.env.MEPAPP_PORT ?? '5462';
const [check, ...args] = process.argv.slice(2);
if (!check) {
  console.error('usage: with-server.mjs <check.mjs> [args...]');
  process.exit(2);
}

const server = spawn('pnpm', ['--dir', `${repo}/apps/web`, 'exec', 'vite', '--port', port, '--strictPort', '--host', '127.0.0.1', '--force'], {
  cwd: repo,
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, CHOKIDAR_USEPOLLING: '1' },
});
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

const url = `http://127.0.0.1:${port}/`;
const deadline = Date.now() + 180000;
let ready = false;
while (Date.now() < deadline && !ready) {
  try {
    ready = (await fetch(url)).ok;
  } catch {}
  if (!ready) await new Promise((r) => setTimeout(r, 500));
}
if (!ready) {
  console.error(`dev server did not answer on ${url} within 180 s`);
  process.exit(3);
}
// The first load after a dependency change re-optimizes the deps. Load the page once so the check does not time out.
try {
  await fetch(url);
} catch {}

const run = spawn('node', [resolve(check), ...args], { cwd: repo, stdio: 'inherit', env: { ...process.env, MEPAPP_REPO: repo, MEPAPP_PORT: port } });
run.on('exit', (code) => {
  stop();
  process.exit(code ?? 1);
});
