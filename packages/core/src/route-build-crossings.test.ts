import { describe, expect, it } from 'vitest';
import { buildScenario, firstFloorDrawing, makeIdFactories, runScenario } from './route-scenario.testutil.js';

describe('planRoute wall crossings split', () => {
  it('splits the first floor wall crossings into room and corridor parts that sum to the total', () => {
    const s = buildScenario(firstFloorDrawing(), 'A', 0);
    if (s === null) throw new Error('no path room in first floor');
    const { stats } = runScenario(s, makeIdFactories()).plan;
    expect(stats.wallCrossings).toBe(26);
    expect(stats.wallCrossingsRoom + stats.wallCrossingsCorridor).toBe(stats.wallCrossings);
  });
});
