import { describe, expect, it } from 'vitest';
import type { QuantityProvenance, QuantityTable } from './quantities.js';
import { mergeQuantityTables } from './quantities-merge.js';

const provenance = (building: string, level: string, sheet: string, document: string): QuantityProvenance => ({ building, level, sheet, document });

describe('mergeQuantityTables', () => {
  it('merges different custom columns with blank cells and the union header order', () => {
    const result = mergeQuantityTables([
      {
        provenance: provenance('B1', 'L1', 'S1', 'doc1'),
        tables: [{ name: 'Terminals', headers: ['Id', 'Type', 'Circuit'], rows: [['t1', 'Socket', 'C1']] }],
      },
      {
        provenance: provenance('B1', 'L2', 'S2', 'doc2'),
        tables: [{ name: 'Terminals', headers: ['Id', 'Type', 'Notes'], rows: [['t2', 'Lamp', 'ok']] }],
      },
    ]);
    expect(result).toEqual([
      {
        name: 'Terminals',
        headers: ['Building', 'Level', 'Sheet', 'Document', 'Id', 'Type', 'Circuit', 'Notes'],
        rows: [
          ['B1', 'L1', 'S1', 'doc1', 't1', 'Socket', 'C1', null],
          ['B1', 'L2', 'S2', 'doc2', 't2', 'Lamp', null, 'ok'],
        ],
      },
    ]);
  });

  it('keeps the same id from two documents as two rows with their own provenance', () => {
    const table: QuantityTable = { name: 'Segments', headers: ['Id', 'Length (m)'], rows: [['s1', 4.5]] };
    const result = mergeQuantityTables([
      { provenance: provenance('B1', 'L1', 'S1', 'doc1'), tables: [table] },
      { provenance: provenance('B1', 'L1', 'S1', 'doc2'), tables: [table] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.rows).toEqual([
      ['B1', 'L1', 'S1', 'doc1', 's1', 4.5],
      ['B1', 'L1', 'S1', 'doc2', 's1', 4.5],
    ]);
  });

  it('renames a custom header that equals a provenance header', () => {
    const result = mergeQuantityTables([
      { provenance: provenance('B1', 'L1', 'S1', 'doc1'), tables: [{ name: 'Equipment', headers: ['Id', 'Level'], rows: [['e1', 'high']] }] },
    ]);
    expect(result[0]!.headers).toEqual(['Building', 'Level', 'Sheet', 'Document', 'Id', 'Level (custom)']);
    expect(result[0]!.rows).toEqual([['B1', 'L1', 'S1', 'doc1', 'e1', 'high']]);
  });

  it('repeats the " (custom)" suffix while it clashes with another header of the table', () => {
    const result = mergeQuantityTables([
      { provenance: provenance('B1', 'L1', 'S1', 'doc1'), tables: [{ name: 'Equipment', headers: ['level', 'Level (custom)'], rows: [['a', 'b']] }] },
    ]);
    expect(result[0]!.headers.slice(4)).toEqual(['level (custom) (custom)', 'Level (custom)']);
  });

  it('orders the tables Segments, Terminals, Equipment, Fittings, then other names by first use', () => {
    const row = (name: string, headers: string[]): QuantityTable => ({ name, headers, rows: [['x']] });
    const result = mergeQuantityTables([
      {
        provenance: provenance('B1', 'L1', 'S1', 'doc1'),
        tables: [row('Fittings', ['Id']), row('Other', ['Id']), row('Equipment', ['Id']), row('Terminals', ['Id']), row('Segments', ['Id'])],
      },
    ]);
    expect(result.map((t) => t.name)).toEqual(['Segments', 'Terminals', 'Equipment', 'Fittings', 'Other']);
  });

  it('gives [] for empty input and for tables without rows', () => {
    expect(mergeQuantityTables([])).toEqual([]);
    expect(mergeQuantityTables([{ provenance: provenance('B1', 'L1', 'S1', 'doc1'), tables: [{ name: 'Segments', headers: ['Id'], rows: [] }] }])).toEqual([]);
  });
});
