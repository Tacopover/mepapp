import { describe, expect, it } from 'vitest';
import { RAIL_ROWS } from './toolRegistry.js';

describe('routing row', () => {
  const ids = RAIL_ROWS.map((row) => row.id);
  const routing = RAIL_ROWS.find((row) => row.id === 'routing');

  it('sits directly after rooms and before circuits', () => {
    expect(ids.indexOf('routing')).toBe(ids.indexOf('rooms') + 1);
    expect(ids.indexOf('circuits')).toBe(ids.indexOf('routing') + 1);
  });

  it('is an action list', () => {
    expect(routing?.actionList).toBe(true);
  });

  it('has three members that call actions and no tool', () => {
    expect(routing?.members.every((m) => m.action !== undefined && m.tool === null)).toBe(true);
    expect(routing?.members.map((m) => m.action).sort()).toEqual(['route', 'route-area', 'size']);
  });
});

describe('RAIL_ROWS member ids', () => {
  it('are unique across all rows', () => {
    const memberIds = RAIL_ROWS.flatMap((row) => row.members.map((m) => m.id));
    expect(new Set(memberIds).size).toBe(memberIds.length);
  });
});
