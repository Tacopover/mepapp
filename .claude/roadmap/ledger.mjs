// The ledger of the routing road map: an append-only file of events, one JSON object on each line.
// The director adds an event after each state change, commits the file, and copies the new events to the dashboard.
//
// Commands (run from the repository root):
//   node .claude/roadmap/ledger.mjs add '<json>'   append one event; the fields type and id are required
//   node .claude/roadmap/ledger.mjs show           print the current state (the last event of each type and id wins)
//   node .claude/roadmap/ledger.mjs pending        print the events that the dashboard does not have yet
//   node .claude/roadmap/ledger.mjs batch          print the ArtifactData "writes" array for the pending events (at most 50)
//   node .claude/roadmap/ledger.mjs mirrored <seq> record that the dashboard has all events up to <seq>
//
// Event types: run, part, task, now, decision, finding, shot, log. See protocol.md section "The ledger".
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(dir, 'ledger.jsonl');
const MIRROR = join(dir, 'mirrored.json');

const events = () =>
  existsSync(LEDGER)
    ? readFileSync(LEDGER, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const mirroredSeq = () => (existsSync(MIRROR) ? JSON.parse(readFileSync(MIRROR, 'utf8')).seq : 0);
const docId = (e) => `e${String(e.seq).padStart(6, '0')}`;

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'add') {
  const e = JSON.parse(arg);
  if (!e.type || !e.id) throw new Error('an event needs "type" and "id"');
  const all = events();
  const full = { seq: (all.at(-1)?.seq ?? 0) + 1, at: new Date().toISOString(), ...e };
  appendFileSync(LEDGER, JSON.stringify(full) + '\n');
  console.log(JSON.stringify(full));
} else if (cmd === 'show') {
  const state = new Map();
  for (const e of events()) state.set(`${e.type}:${e.id}`, { ...(state.get(`${e.type}:${e.id}`) ?? {}), ...e });
  for (const [k, v] of state) if (v.type !== 'log') console.log(k, JSON.stringify(v));
  console.log(`events: ${events().length}, mirrored up to: ${mirroredSeq()}`);
} else if (cmd === 'pending') {
  for (const e of events().filter((x) => x.seq > mirroredSeq())) console.log(JSON.stringify(e));
} else if (cmd === 'batch') {
  const pending = events().filter((x) => x.seq > mirroredSeq()).slice(0, 50);
  console.log(JSON.stringify(pending.map((e) => ({ op: 'set', collection: 'events', doc_id: docId(e), data: e }))));
  if (pending.length) console.error(`last seq in this batch: ${pending.at(-1).seq}`);
} else if (cmd === 'mirrored') {
  writeFileSync(MIRROR, JSON.stringify({ seq: Number(arg) }) + '\n');
} else {
  console.error('commands: add <json> | show | pending | batch | mirrored <seq>');
  process.exit(2);
}
