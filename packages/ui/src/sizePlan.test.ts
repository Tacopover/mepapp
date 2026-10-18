import { describe, expect, it } from 'vitest';
import type { SizedSegment, SizeNetworkResult, SizePick, SizingProblemCode } from '@mepapp/core';
import { sizeLabel, sizeProblemLines, sizeResultLines, sizeText, type SizeTextKey } from './components/sizePlan.js';

const PLAIN_KEYS: SizeTextKey[] = [
  'title', 'startStamp', 'startPort', 'networkType', 'noEquipment', 'noSegments', 'size', 'close', 'editType',
  'capacityUnitNote', 'totalFlow', 'sizedCount', 'sizedCountOne', 'sizeCount', 'sizeCountOne', 'riserNote', 'twoFlowsNote',
  'draftNote', 'disciplineNotSized', 'velocityNote', 'fluidAir', 'fluidWater', 'pipeNote', 'returnNote',
  'unsizedKeep', 'unsizedKeepOne', 'newSize', 'newSizeOne', 'confirmQuestion', 'confirmYes', 'confirmNo', 'unitReadNote',
  'convertQuestion', 'convertQuestionOne', 'convertYes', 'convertNo', 'unitKindWarning', 'sizesSourceHint', 'deltaTHint',
  'suggest', 'flowSection', 'flowUnit', 'flowUnitNotSet', 'sizingMethod', 'methodNone', 'methodAir', 'methodWater',
  'maxVelocity', 'maxDrop', 'airShape', 'shapeRound', 'shapeRect', 'maxAspect', 'airSeries', 'seriesStandard', 'seriesFree',
  'deltaT', 'valueNotPositive', 'editorTitle',
];

const PROBLEM_CODES: SizingProblemCode[] = [
  'no-start', 'no-segment-at-port', 'discipline-not-sized', 'method-discipline', 'no-flow-unit', 'no-sizing',
  'unit-kind', 'no-delta-t', 'no-flow', 'unit-unknown', 'not-resolved', 'zero-flow', 'too-large', 'mixed-type', 'start-two-ports',
];
const COUNTED_CODES: SizingProblemCode[] = ['unit-unknown', 'not-resolved', 'zero-flow', 'too-large', 'mixed-type'];
const HINTED_CODES: SizingProblemCode[] = ['method-discipline', 'no-flow-unit', 'no-sizing', 'unit-kind', 'no-delta-t', 'no-flow'];

const PROBLEM_KEYS: SizeTextKey[] = [
  ...PROBLEM_CODES.map((code) => `problem_${code}` as SizeTextKey),
  ...COUNTED_CODES.map((code) => `problem_${code}_one` as SizeTextKey),
  ...HINTED_CODES.map((code) => `hint_${code}` as SizeTextKey),
];
const ALL_KEYS: SizeTextKey[] = [...PLAIN_KEYS, ...PROBLEM_KEYS];

const SAMPLE_PARAMS = {
  unit: 'dm³/s', flow: '400 dm³/s', n: 12, count: 3, size: 'Ø 400', name: 'Supply air', old: 'm³/h', new: 'kW',
};
const SKIPPED_LENGTH_KEYS: SizeTextKey[] = ['disciplineNotSized', 'problem_discipline-not-sized'];

const pick = (patch: Partial<SizePick> & Pick<SizePick, 'shape'>): SizePick => ({
  velocityMs: 3, pressureDropPaPerM: 1, governedBy: 'velocity', ...patch,
});
const round = (diameterMm: number): SizePick => pick({ shape: 'round', diameterMm });
const rect = (widthMm: number, heightMm: number): SizePick => pick({ shape: 'rectangular', widthMm, heightMm });
const sized = (segmentId: string, p: SizePick): SizedSegment => ({ ...p, segmentId, flowM3s: 0.1 });
const result = (patch: Partial<SizeNetworkResult>): SizeNetworkResult => ({
  status: 'ok', problems: [], sizes: [], unsized: [], totalFlowM3s: null, segmentCount: 0, ...patch,
});

describe('sizeText', () => {
  it('has a non-empty text for every key', () => {
    for (const key of ALL_KEYS) expect(sizeText(key).length).toBeGreaterThan(0);
  });

  it('keeps every text within 140 characters with sample params, except the discipline texts', () => {
    for (const key of ALL_KEYS) {
      if (SKIPPED_LENGTH_KEYS.includes(key)) continue;
      expect(sizeText(key, SAMPLE_PARAMS).length, key).toBeLessThanOrEqual(140);
    }
  });

  it('writes no CFM, door or crossing word', () => {
    for (const key of ALL_KEYS) {
      const text = sizeText(key, SAMPLE_PARAMS);
      expect(text, key).not.toMatch(/CFM/);
      expect(text.toLowerCase(), key).not.toMatch(/door|crossing/);
    }
  });

  it('writes no Dutch word', () => {
    for (const key of ALL_KEYS) {
      const text = sizeText(key, SAMPLE_PARAMS).toLowerCase();
      expect(text, key).not.toMatch(/\b(gang|ruimte|netwerk)/);
    }
  });

  it('replaces the params', () => {
    expect(sizeText('totalFlow', { flow: '400 dm³/s' })).toBe('Total flow: 400 dm³/s');
    expect(sizeText('sizeCount', { size: 'Ø 400', count: 2 })).toBe('Ø 400: 2 segments');
  });

  it('keeps an unknown param in place', () => {
    expect(sizeText('totalFlow', { other: 1 })).toBe('Total flow: {flow}');
    expect(sizeText('totalFlow')).toBe('Total flow: {flow}');
  });
});

describe('sizeProblemLines', () => {
  it('has a line for each problem code', () => {
    for (const code of PROBLEM_CODES) {
      const [line] = sizeProblemLines([{ code, severity: 'error', ids: ['a', 'b'] }]);
      expect(line!.code).toBe(code);
      expect(line!.text.length, code).toBeGreaterThan(0);
    }
  });

  it('has a non-empty hint for the codes that have one', () => {
    for (const code of HINTED_CODES) {
      const [line] = sizeProblemLines([{ code, severity: 'error' }]);
      expect(line!.hint.length, code).toBeGreaterThan(0);
    }
  });

  it('gives an empty hint for a code without one', () => {
    const [line] = sizeProblemLines([{ code: 'no-start', severity: 'error' }]);
    expect(line!.hint).toBe('');
  });

  it('gives the return pipe note as the hint of start-two-ports', () => {
    const [line] = sizeProblemLines([{ code: 'start-two-ports', severity: 'warning', ids: ['p1', 'p2'] }]);
    expect(line!.hint).toBe(sizeText('returnNote'));
    expect(line!.text).toBe('The start stamp has segments on 2 ports of this network. A return pipe may be counted twice.');
  });

  it('copies the severity and keeps the order of the problems', () => {
    const lines = sizeProblemLines([
      { code: 'no-flow', severity: 'error' },
      { code: 'zero-flow', severity: 'warning', ids: ['s1'] },
    ]);
    expect(lines.map((line) => line.code)).toEqual(['no-flow', 'zero-flow']);
    expect(lines[0]!.severity).toBe('error');
    expect(lines[1]!.severity).toBe('warning');
  });

  it('uses the singular text for one segment and the plural text for two', () => {
    const [one] = sizeProblemLines([{ code: 'not-resolved', severity: 'warning', ids: ['s1'] }]);
    const [two] = sizeProblemLines([{ code: 'not-resolved', severity: 'warning', ids: ['s1', 's2'] }]);
    expect(one!.text).toBe('1 segment has an unresolved flow and gets no size.');
    expect(two!.text).toBe('2 segments have an unresolved flow and get no size.');
  });

  it('uses the element count for unit-unknown', () => {
    const [line] = sizeProblemLines([{ code: 'unit-unknown', severity: 'warning', ids: ['e1', 'e2'] }]);
    expect(line!.text).toBe('2 elements have a capacity that cannot be read in the flow unit.');
  });

  it('gives the discipline text for discipline-not-sized', () => {
    const [line] = sizeProblemLines([{ code: 'discipline-not-sized', severity: 'error' }]);
    expect(line!.text).toBe(sizeText('disciplineNotSized'));
  });
});

describe('sizeLabel', () => {
  it('gives the diameter for a round air pick', () => {
    expect(sizeLabel(round(400))).toBe('Ø 400');
  });

  it('gives width times height for a rectangular pick', () => {
    expect(sizeLabel(rect(800, 400))).toBe('800 × 400');
  });

  it('gives the DN for a round water pick', () => {
    expect(sizeLabel(round(20), 'water')).toBe('DN 20');
  });
});

describe('sizeResultLines', () => {
  it('gives the total, the count and one size line for one size', () => {
    const lines = sizeResultLines(result({ totalFlowM3s: 0.1, sizes: [sized('s1', round(400))] }), '400 dm³/s');
    expect(lines).toEqual(['Total flow: 400 dm³/s', '1 segment sized.', 'Ø 400: 1 segment']);
  });

  it('lists three sizes from the largest by area, with the plural and the singular', () => {
    const lines = sizeResultLines(result({
      sizes: [
        sized('s1', round(200)),
        sized('s2', round(400)),
        sized('s3', rect(800, 400)),
        sized('s4', round(400)),
      ],
    }), '');
    expect(lines).toEqual(['4 segments sized.', '800 × 400: 1 segment', 'Ø 400: 2 segments', 'Ø 200: 1 segment']);
  });

  it('gives the DN size label for a water result', () => {
    expect(sizeResultLines(result({ sizes: [sized('s1', round(20))] }), '', 'water')).toEqual(['1 segment sized.', 'DN 20: 1 segment']);
  });

  it('gives only the sized count for zero sizes when the total is unknown', () => {
    expect(sizeResultLines(result({}), '')).toEqual(['0 segments sized.']);
  });

  it('gives the total and the zero count for zero sizes when the total is known', () => {
    expect(sizeResultLines(result({ totalFlowM3s: 0 }), '0 dm³/s')).toEqual(['Total flow: 0 dm³/s', '0 segments sized.']);
  });

  it('gives the singular sized count for one segment and the plural for two', () => {
    expect(sizeResultLines(result({ sizes: [sized('s1', round(200))] }), '')[0]).toBe('1 segment sized.');
    expect(sizeResultLines(result({ sizes: [sized('s1', round(200)), sized('s2', round(200))] }), '')[0]).toBe('2 segments sized.');
  });

  it('adds up the counts of the size lines to the number of sizes', () => {
    const sizes = [sized('s1', round(200)), sized('s2', round(400)), sized('s3', round(400)), sized('s4', rect(800, 400))];
    const lines = sizeResultLines(result({ sizes }), '');
    const total = lines
      .map((line) => /: (\d+) segments?$/.exec(line))
      .reduce((sum, match) => sum + (match ? Number(match[1]) : 0), 0);
    expect(total).toBe(sizes.length);
  });
});
