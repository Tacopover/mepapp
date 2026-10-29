// Gate G-P2 assertions (P2-T12). They run only when the flag file .claude/roadmap/tools/p2/assert.flag exists (git-ignored).
// G10 (time) is asserted in P2-T14. G11 and G14 are printed only. The thresholds are the ones of the plan: do not move them.
import { describe, expect, it } from 'vitest';
import { buildGate } from './route-two-level-gate-load.testutil.js';
import { ASSERT_FLAG, evaluate, flagExists, type GateResult } from './route-two-level-gate.testutil.js';

const ASSERT = flagExists();
const TEST_TIMEOUT = 600000;
const IDS = ['G1', 'G2a', 'G2b', 'G3a', 'G3b', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G12', 'G13', 'G15'];

let results: GateResult[] | null = null;
function gate(): GateResult[] {
  if (results !== null) return results;
  const input = buildGate();
  if (input === null) throw new Error(`manual fixture missing while the flag file ${ASSERT_FLAG} exists: run extract-manual.mjs`);
  results = evaluate(input);
  return results;
}

describe.skipIf(!ASSERT)('gate G-P2 criteria (flag file present)', () => {
  for (const id of IDS) {
    it(`${id}`, () => {
      const r = gate().find((x) => x.id === id);
      expect(r, `criterion ${id} exists`).toBeDefined();
      expect(r!.pass, `${r!.id} ${r!.text}: measured ${r!.measured}, threshold ${r!.threshold}, rooms [${r!.rooms.join(', ')}]`).toBe(true);
    }, TEST_TIMEOUT);
  }
});
