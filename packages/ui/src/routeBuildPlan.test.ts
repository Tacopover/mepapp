import { describe, expect, it } from 'vitest';
import type { RoutePlanWarningCode, RouteStats } from '@mepapp/core';
import { buildText, routeBuildLines, routeBuildSeverityLabel, routeBuildSummary, TEXTS, type BuildTextKey } from './components/routeBuildPlan.js';

const SAMPLE_PARAMS: Record<string, string | number> = {
  n: 1234, count: 1234, length: 1234, segments: '1234 segments', fittings: '1234 fittings', rooms: 'Shaft A, Shaft B, Shaft C, Stair D, Stair E, Office F, Office G',
  ports: '1234 ports', b90: '1234 bends of 90 degrees', b45: '1234 bends of 45 degrees', total: 1234, cap: 1234, unit: 'dm³/s', times: '1234 times', room: 'Shaft A',
};
const DUTCH_WORDS = ['de ', 'het ', 'een ', 'niet ', 'kamer'];

const stats = (patch: Partial<RouteStats>): RouteStats => ({
  segments: 0, fittings: 0, lengthMm: 0, bends90: 0, bends45: 0, freeLegs: 0, rooms: 0, ports: 0, portsLeft: 0, wallCrossings: 0, existingCrossings: 0, removedSegments: 0, removedFittings: 0,
  ...patch,
});

const names = { room: (roomId: string) => `Shaft ${roomId}`, unit: 'dm³/s' };

const ALL_CODES: RoutePlanWarningCode[] = [
  'multi-page', 'no-calibration', 'area-empty', 'gravity-not-routed', 'start-error', 'foreign-start', 'no-targets', 'start-unreachable', 'internal-join',
  'free-angle', 'wall-crossings', 'shaft-crossing', 'room-off-graph', 'ports-left', 'existing-crossings', 'existing-overlap',
  'same-type-join', 'short-leg', 'capacity-over', 'capacity-unit', 'no-limits',
  'removes-routed', 'extends-stub', 'rooms-skipped', 'shares-lane', 'hand-kept-size', 'draft-2d',
];

describe('build texts', () => {
  it('keeps every text within 140 characters with sample params', () => {
    for (const key of Object.keys(TEXTS) as BuildTextKey[]) {
      expect(buildText(key, SAMPLE_PARAMS).length, key).toBeGreaterThan(0);
      expect(buildText(key, SAMPLE_PARAMS).length, key).toBeLessThanOrEqual(140);
    }
  });

  it('has no Dutch word and no door in any text', () => {
    for (const key of Object.keys(TEXTS) as BuildTextKey[]) {
      const text = buildText(key, SAMPLE_PARAMS).toLowerCase();
      for (const word of DUTCH_WORDS) expect(new RegExp(`\\b${word.trim()}\\b`).test(text), `${key}: ${word}`).toBe(false);
      expect(text).not.toMatch(/\bdoor/);
    }
  });
});

describe('routeBuildSummary', () => {
  it('gives the plural summary and bends lines', () => {
    expect(routeBuildSummary(stats({ segments: 86, fittings: 41, lengthMm: 212000, rooms: 9, ports: 34, bends90: 12, bends45: 5 }))).toEqual([
      '86 segments, 41 fittings, 212 m. 9 rooms, 34 ports.',
      '12 bends of 90 degrees and 5 bends of 45 degrees.',
    ]);
  });

  it('gives the singular forms for a count of 1', () => {
    expect(routeBuildSummary(stats({ segments: 1, fittings: 1, rooms: 1, ports: 1, bends90: 1, bends45: 1 }))).toEqual([
      '1 segment, 1 fitting, 0 m. 1 room, 1 port.',
      '1 bend of 90 degrees and 1 bend of 45 degrees.',
    ]);
  });
});

describe('routeBuildLines', () => {
  it('gives one line for each code, in the input order, with the input severity', () => {
    const warnings = ALL_CODES.map((code) => ({ code, severity: 'info' as const, count: 2, ids: ['a', 'b'], numbers: { total: 400, cap: 300, segments: 2, fittings: 1 } }));
    const lines = routeBuildLines({ warnings }, names);
    expect(lines.map((line) => line.code)).toEqual(ALL_CODES);
    for (const line of lines) {
      expect(line.severity).toBe('info');
      expect(line.text.length).toBeGreaterThan(0);
    }
  });

  it('sets a hint only for wall-crossings and shaft-crossing', () => {
    const warnings = ALL_CODES.map((code) => ({ code, severity: 'warning' as const, count: 2, ids: ['a'] }));
    const hinted = routeBuildLines({ warnings }, names).filter((line) => line.hint !== '').map((line) => line.code);
    expect(hinted).toEqual(['wall-crossings', 'shaft-crossing']);
  });

  it('uses the singular for ports-left with count 1 and the plural with count 2', () => {
    const [one] = routeBuildLines({ warnings: [{ code: 'ports-left', severity: 'warning', count: 1 }] }, names);
    const [two] = routeBuildLines({ warnings: [{ code: 'ports-left', severity: 'warning', count: 2 }] }, names);
    expect(one!.text).toBe('1 port could not be reached. It stays open.');
    expect(two!.text).toBe('2 ports could not be reached. They stay open.');
  });

  it('names the shaft and gives the time count for shaft-crossing', () => {
    const [one] = routeBuildLines({ warnings: [{ code: 'shaft-crossing', severity: 'warning', count: 1, ids: ['1'] }] }, names);
    const [two] = routeBuildLines({ warnings: [{ code: 'shaft-crossing', severity: 'warning', count: 2, ids: ['1', '2'] }] }, names);
    expect(one!.text).toBe('The route crosses the wall of the shaft Shaft 1 1 time.');
    expect(two!.text).toBe('The route crosses the wall of the shaft Shaft 1, Shaft 2 2 times.');
  });

  it('lists two room names and then the rest for room-off-graph', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7'];
    const [line] = routeBuildLines({ warnings: [{ code: 'room-off-graph', severity: 'warning', count: 7, ids }] }, names);
    expect(line!.text).toBe('7 rooms are outside the route area. Their branches cross more walls: Shaft 1, Shaft 2, and 5 more.');
  });

  it('cuts long room names to 20 characters and keeps the text within 140 characters', () => {
    const longNames = { room: (roomId: string) => `Long room name number ${roomId} extra text`, unit: '' };
    const [offGraph] = routeBuildLines({ warnings: [{ code: 'room-off-graph', severity: 'warning', count: 5, ids: ['1', '2', '3', '4', '5'] }] }, longNames);
    const [shaft] = routeBuildLines({ warnings: [{ code: 'shaft-crossing', severity: 'warning', count: 4, ids: ['1', '2', '3', '4'] }] }, longNames);
    expect(offGraph!.text).toContain('Long room name numb…, Long room name numb…, and 3 more.');
    for (const line of [offGraph!, shaft!]) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.text.length).toBeLessThanOrEqual(140);
    }
  });

  it('gives the capacity numbers with the unit for capacity-over', () => {
    const [line] = routeBuildLines({ warnings: [{ code: 'capacity-over', severity: 'warning', numbers: { total: 400, cap: 300 } }] }, names);
    expect(line!.text).toContain('400 dm³/s');
    expect(line!.text).toContain('300 dm³/s');
  });

  it('gives no unit text for capacity-unit', () => {
    const [line] = routeBuildLines({ warnings: [{ code: 'capacity-unit', severity: 'warning', numbers: { total: 400, cap: 300 } }] }, names);
    expect(line!.text).toBe('The ports total 400. The start has 300. The unit is not set, so the numbers are not compared.');
  });
});

describe('routeBuildSeverityLabel', () => {
  it('gives Error, Warning and Note', () => {
    expect(routeBuildSeverityLabel('error')).toBe('Error');
    expect(routeBuildSeverityLabel('warning')).toBe('Warning');
    expect(routeBuildSeverityLabel('info')).toBe('Note');
  });
});
