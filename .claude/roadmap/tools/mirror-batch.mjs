// Writes the ledger events that the dashboard does not have yet to a JSON batch file for ArtifactData (action batch).
// The director passes the "writes" array of the file to ArtifactData, then runs: node .claude/roadmap/ledger.mjs mirrored <last seq>
//
// Usage (from the repository root):
//   node .claude/roadmap/tools/mirror-batch.mjs <out.json> [ledger name]
// The ledger name is "" for ledger.jsonl (default) or a stream name such as "buildings" for ledger-buildings.jsonl (its mirror file is mirrored-buildings.json).
// The file holds { "lastSeq": <number>, "count": <number>, "writes": [ ... ] }. It holds at most 50 events. Run it again after the mirror step for the next 50.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, stream = ''] = process.argv.slice(2);
if (!out) {
  console.error('usage: mirror-batch.mjs <out.json> [ledger name]');
  process.exit(2);
}
const ledger = join(dir, stream ? `ledger-${stream}.jsonl` : 'ledger.jsonl');
const mirror = join(dir, stream ? `mirrored-${stream}.json` : 'mirrored.json');
if (!existsSync(ledger)) {
  console.error(`no ledger file: ${ledger}`);
  process.exit(2);
}
const seen = existsSync(mirror) ? JSON.parse(readFileSync(mirror, 'utf8')).seq : 0;
const pending = readFileSync(ledger, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .filter((e) => e.seq > seen)
  .slice(0, 50);
const writes = pending.map((e) => ({ op: 'set', collection: 'events', doc_id: `e${String(e.seq).padStart(6, '0')}`, data: e }));
const lastSeq = pending.at(-1)?.seq ?? seen;
writeFileSync(resolve(out), JSON.stringify({ lastSeq, count: writes.length, writes }) + '\n');
console.log(`wrote ${writes.length} events to ${out}; last seq ${lastSeq}; mirrored up to ${seen}`);
