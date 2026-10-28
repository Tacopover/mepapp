import { describe, expect, it } from 'vitest';
import { manualScenario } from './route-scenario.testutil.js';

const loaded = manualScenario();

describe('manual route fixture (local, git-ignored)', () => {
  it.skipIf(loaded === null)('loads the stamps, the strokes and the start of the hand route', () => {
    const { scenario, manual } = loaded!;
    expect(scenario.stamps).toHaveLength(59);
    expect(manual.main).toHaveLength(6);
    expect(manual.room).toHaveLength(55);
    expect(scenario.startStampId).toBe('stamp-59');
    expect(scenario.startRoom).toBeDefined();
  });

  it.skipIf(loaded === null)('finds 58 target ports, each in a room, that serve 22 rooms', () => {
    const { scenario } = loaded!;
    expect(scenario.targetPorts).toHaveLength(58);
    expect(scenario.targetPorts.every((port) => port.roomId !== null)).toBe(true);
    expect(scenario.servedRooms).toHaveLength(22);
  });
});
