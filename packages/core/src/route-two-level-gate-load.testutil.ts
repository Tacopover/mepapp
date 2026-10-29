// Test helper of gate G-P2 (P2-T12): loads the manual case and the other drawings. Excluded from the build, see tsconfig.json.
import { firstFloorDrawing, localDrawing } from './route-scenario.testutil.js';
import { loadManualCase, loadOtherCases, type GateInput } from './route-two-level-gate.testutil.js';

export function buildGate(): GateInput | null {
  const m = loadManualCase();
  if (m === null) return null;
  const { cases, skipped } = loadOtherCases((name, file) => (file === null ? firstFloorDrawing() : localDrawing(file, name)));
  return {
    m,
    others: cases,
    skipped,
    handLongestPathMm: m.hand.shape.longestPathFromStartMm,
    handLongestSource: 'computed from the hand route in the test: results.json has no value',
  };
}
