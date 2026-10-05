import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clusterTextRuns, detectRoomAt, manualRoom, matchRoomLabels, parseRoomLabel, readRoomLabels, roomAreaWarning, roomFromFill, withRoomLabels, type TextItem } from './index.js';

const FS = 8;
// A centred block of lines, 13 pt apart, like the labels of the fixtures.
function block(cx: number, top: number, lines: string[], fs = FS): TextItem[] {
  return lines.map((text, i) => ({ text, x: cx - text.length * 2, y: top + i * 13, width: text.length * 4, height: fs * 1.09, fontSizePt: fs }));
}
const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
// 1 pt = 25 mm: pageUnitsPerRealUnit 0.04 pt/mm. A 200 pt square is 5 m x 5 m = 25 m2.
const CAL = { pageUnitsPerRealUnit: 0.04 };

describe('clusterTextRuns', () => {
  it('groups centred lines of one font size into one block and keeps two labels apart', () => {
    const items = [...block(100, 100, ['0.17', 'Brainstorm', '8pers.', '19 m²']), ...block(300, 100, ['0.18', 'Overleg', '12 m²'])];
    const blocks = clusterTextRuns(items);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.length).sort()).toEqual([3, 4]);
  });

  it('keeps a block apart from text of another font size and from far-away lines', () => {
    const items = [...block(100, 100, ['0.17', 'Brainstorm', '19 m²']), ...block(100, 140, ['W01b'], 6), ...block(100, 400, ['Note'])];
    expect(clusterTextRuns(items)).toHaveLength(3);
  });

  it('ignores empty text and text below the minimum font size', () => {
    const items = [...block(100, 100, ['  ']), ...block(100, 200, ['tiny'], 3)];
    expect(clusterTextRuns(items)).toEqual([]);
  });
});

describe('parseRoomLabel', () => {
  const parse = (lines: string[]) => parseRoomLabel(block(100, 100, lines));

  it('reads number, name, persons and area of an architect label', () => {
    expect(parse(['0.17', 'Brainstorm', '8pers.', '19 m²'])).toMatchObject({ number: '0.17', name: 'Brainstorm', persons: 8, areaM2: 19, details: [], code: null });
  });

  it('reads a decimal comma and area with persons on one line', () => {
    expect(parse(['1.15', 'Ontmoetingsruimte', '31,50 m²'])!.areaM2).toBe(31.5);
    expect(parse(['Ec-226', '(Ec.02.02.01)', 'Vlakke vloerzaal 75p', 'Onderwijsruimten', '281 m²  160 pers.'])).toMatchObject({
      number: 'Ec.02.02.01',
      code: 'Ec-226',
      name: 'Vlakke vloerzaal 75p',
      details: ['Onderwijsruimten'],
      areaM2: 281,
      persons: 160,
    });
  });

  it('takes a letter suffix and a lone code as the number', () => {
    expect(parse(['1.01A', 'Verkeersruimte', '35 m²'])!.number).toBe('1.01A');
    expect(parse(['Fd-232T', 'Trappenhuis', '25 m²'])).toMatchObject({ number: 'Fd-232T', code: null });
  });

  it('accepts a label with an area only', () => {
    expect(parse(['10 m²'])).toMatchObject({ number: null, name: null, areaM2: 10 });
  });

  it('rejects blocks that are not room labels: a lone number (dimension), notes, tags', () => {
    expect(parse(['0.9'])).toBeNull();
    expect(parse(['W01b'])).toBeNull();
    expect(parse(['indeling uitgifte/keuken/opslag', 'nader vast te stellen'])).toBeNull();
  });

  it('reads thousands separators in the area', () => {
    expect(parse(['Hal', '1.234,56 m²'])!.areaM2).toBe(1234.56);
    expect(parse(['Hal', '1,234.56 m²'])!.areaM2).toBe(1234.56);
    expect(parse(['Hal', '1.234.567 m²'])!.areaM2).toBe(1234567);
    expect(parse(['Hal', '1.234 m²'])!.areaM2).toBe(1.234);
    expect(parse(['Hal', '12,5 m²'])!.areaM2).toBe(12.5);
  });

  it('does not read a number followed by digits as an area', () => {
    expect(parse(['Kelder', '2 m²0.5'])).toBeNull();
  });
});

describe('labels found from the area line', () => {
  // Layout of plattegrond begane grond 10A.pdf: number and name 11 pt, area line 8 pt, all centred.
  const stack = (cx: number, top: number, lines: [string, number][]): TextItem[] => lines.map(([text, fs], i) => ({ text, x: cx - text.length * 2, y: top + i * 13, width: text.length * 4, height: fs * 1.09, fontSizePt: fs }));

  it('reads a label whose area line has a smaller font than the number and name lines', () => {
    const labels = readRoomLabels(stack(100, 100, [['10A.00.030', 11], ['NSA ruimte 1', 11], ['53.7 m²', 8]]));
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ number: '10A.00.030', name: 'NSA ruimte 1', areaM2: 53.7 });
  });

  it('accepts letters with dots or hyphens as a room number, but not a plain name', () => {
    const num = (n: string) => readRoomLabels(stack(100, 100, [[n, 11], ['Kantoor', 11], ['12 m²', 8]]))[0]?.number;
    expect(num('10A.00.030')).toBe('10A.00.030');
    expect(num('B-2.14')).toBe('B-2.14');
    expect(num('gassen-ruimte')).toBeNull();
  });

  it('keeps a name that looks like a number when a strict number is present', () => {
    const label = readRoomLabels(stack(100, 100, [['0.6-1', 8], ['Lift-1', 8], ['3 m²', 8]]))[0]!;
    expect(label).toMatchObject({ number: '0.6-1', name: 'Lift-1' });
  });

  it('ignores a dimension value above the label and a drawn-twice area line', () => {
    const items = [...stack(100, 100, [['4400', 6], ['10A.00.001', 11], ['entree', 11], ['22.0 m²', 8]]), ...stack(100, 139, [['22.0 m²', 8]])];
    const labels = readRoomLabels(items);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ number: '10A.00.001', name: 'entree', areaM2: 22 });
  });

  it('does not take the lines of the label above, and keeps two stacked labels apart', () => {
    const items = [...stack(100, 100, [['1.01', 11], ['Kantoor', 11], ['20 m²', 8]]), ...stack(100, 148, [['1.02', 11], ['Archief', 11], ['9 m²', 8]])];
    const labels = readRoomLabels(items);
    expect(labels.map((l) => [l.number, l.name, l.areaM2])).toEqual([
      ['1.01', 'Kantoor', 20],
      ['1.02', 'Archief', 9],
    ]);
  });

  it('only a strict number makes a label without an area line', () => {
    expect(readRoomLabels(stack(100, 100, [['10A.00.030', 11], ['Kantoor', 11], ['Noord', 11]]))).toEqual([]);
    expect(readRoomLabels(stack(100, 100, [['1.05', 11], ['Kantoor', 11], ['Noord', 11]]))).toHaveLength(1);
  });
});

describe('matchRoomLabels and withRoomLabels', () => {
  const rooms = [manualRoom(0, square(0, 0, 200)), manualRoom(0, square(300, 0, 200))];

  it('assigns each label to the room that contains it and copies name, number, area', () => {
    const labels = readRoomLabels([...block(100, 90, ['0.17', 'Brainstorm', '25 m²']), ...block(400, 90, ['0.18', 'Overleg', '25 m²'])]);
    const named = withRoomLabels(rooms, labels, CAL);
    expect(named[0]).toMatchObject({ number: '0.17', name: 'Brainstorm', labelAreaM2: 25, locked: true });
    expect(named[1]).toMatchObject({ number: '0.18', name: 'Overleg' });
    expect(rooms[0]!.name).toBeNull(); // the input is not changed
  });

  it('leaves a room without a label unnamed and ignores a label outside every room', () => {
    const labels = readRoomLabels(block(100, 90, ['0.17', 'Brainstorm', '25 m²']).concat(block(900, 90, ['9.9', 'Far', '5 m²'])));
    const named = withRoomLabels(rooms, labels, CAL);
    expect(named[0]!.name).toBe('Brainstorm');
    expect(named[1]!.name).toBeNull();
    expect(matchRoomLabels(rooms, labels, CAL)).toHaveLength(1);
  });

  it('prefers the label whose area fits the polygon, then a number, and lists the others', () => {
    const labels = readRoomLabels([...block(60, 60, ['Store', '2 m²']), ...block(140, 140, ['0.20', 'Hall', '25 m²'])]);
    const [m] = matchRoomLabels(rooms, labels, CAL);
    expect(m!.label.name).toBe('Hall');
    expect(m!.others.map((l) => l.name)).toEqual(['Store']);
    expect(withRoomLabels(rooms, labels, CAL)[0]!.otherLabels).toEqual(['Store']);
  });

  it('assigns a label whose anchor lies on a wall to the room that holds most of it', () => {
    // Anchor exactly on the shared boundary x = 200: the block is 40 pt wide, 25 pt inside room 0.
    const item: TextItem = { text: '5 m²', x: 175, y: 90, width: 40, height: 9, fontSizePt: 8 };
    const two = [manualRoom(0, square(0, 0, 200)), manualRoom(0, square(200, 0, 200))];
    const labels = readRoomLabels([item]);
    expect(matchRoomLabels(two, labels, CAL)).toHaveLength(1);
  });

  it('works without a calibration (no area check when choosing)', () => {
    const labels = readRoomLabels(block(100, 90, ['0.17', 'Brainstorm', '25 m²']));
    expect(withRoomLabels(rooms, labels, null)[0]!.name).toBe('Brainstorm');
  });

  it('warns when the computed area differs from the label area by more than 15 %', () => {
    const room = { ...manualRoom(0, square(0, 0, 200)), labelAreaM2: 25 };
    expect(roomAreaWarning(room, CAL)).toBeNull();
    expect(roomAreaWarning({ ...room, labelAreaM2: 20 }, CAL)!.deviation).toBeCloseTo(0.25, 9);
    expect(roomAreaWarning({ ...room, labelAreaM2: undefined }, CAL)).toBeNull();
    expect(roomAreaWarning({ ...room, labelAreaM2: 22 }, CAL, 0.2)).toBeNull();
  });
});

describe('real text of 00_arch_ground_floor', () => {
  const DIR = fileURLToPath(new URL('../../fixtures/rooms/', import.meta.url));
  const runs: TextItem[] = JSON.parse(readFileSync(`${DIR}ground_floor_text.json`, 'utf8'));
  const index = JSON.parse(readFileSync(`${DIR}index.json`, 'utf8')) as { scale: number; rooms: { name: string; id: string; seed: { x: number; y: number }; bounds: [number, number, number, number]; segmentCount: number }[] };
  const mmPerPt = (25.4 / 72) * index.scale;
  const cal = { pageUnitsPerRealUnit: 1 / mmPerPt };

  it('finds the room labels of the page, with number and area on nearly all', () => {
    const labels = readRoomLabels(runs);
    expect(labels.length).toBeGreaterThanOrEqual(40);
    expect(labels.filter((l) => l.number !== null).length).toBeGreaterThanOrEqual(labels.length - 2);
    const brainstorm = labels.find((l) => l.number === '0.17')!;
    expect(brainstorm).toMatchObject({ name: 'Brainstorm', persons: 8, areaM2: 19 });
  });

  it.each([
    ['ground_floor_2', '0.17', 'Brainstorm', 19],
    ['ground_floor_3', '0.38', 'Werkplek', 26],
    ['ground_floor_x1', '0.26', 'Repro', 3],
  ])('names the detected room of %s', (fixture, number, name, area) => {
    const f = index.rooms.find((r) => r.name === fixture)!;
    const buf = readFileSync(`${DIR}${fixture}.f32`);
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const input = { segments: Float64Array.from(f32), segmentCount: f.segmentCount, bounds: f.bounds };
    const fill = detectRoomAt(input, f.seed, mmPerPt, { minCompMm: 3578 });
    const [room] = withRoomLabels([roomFromFill(fill, 0, 'click')], readRoomLabels(runs), cal);
    expect(room).toMatchObject({ number, name, labelAreaM2: area, source: 'click', locked: false });
  });
});
