// Merges the quantity tables of several sheets into one table per name. Pure data, no file format:
// the UI writes the .xlsx. Each row keeps its provenance (building, level, sheet, document) in front.

import type { QuantityCell, QuantityProvenance, QuantityTable } from './quantities.js';

export const PROVENANCE_HEADERS = ['Building', 'Level', 'Sheet', 'Document'] as const;

const NAME_ORDER = ['Segments', 'Terminals', 'Equipment', 'Fittings'];

interface Contribution {
  provenance: QuantityProvenance;
  headers: string[];
  rows: QuantityCell[][];
}

/** Renames the headers of one table that equal a provenance header. The name gets " (custom)" until it is unique in the table. */
function renameClashing(headers: readonly string[]): string[] {
  const provenance = new Set(PROVENANCE_HEADERS.map((h) => h.toLowerCase()));
  const taken = new Set([...PROVENANCE_HEADERS, ...headers].map((h) => h.toLowerCase()));
  return headers.map((header) => {
    if (!provenance.has(header.toLowerCase())) return header;
    let renamed = `${header} (custom)`;
    while (taken.has(renamed.toLowerCase())) renamed += ' (custom)';
    taken.add(renamed.toLowerCase());
    return renamed;
  });
}

const rankOf = (name: string): number => {
  const index = NAME_ORDER.indexOf(name);
  return index < 0 ? NAME_ORDER.length : index;
};

/** Merges the tables of several parts. A table without rows is left out, and a name without rows gives no table. */
export function mergeQuantityTables(parts: readonly { provenance: QuantityProvenance; tables: readonly QuantityTable[] }[]): QuantityTable[] {
  const contributions = new Map<string, Contribution[]>();
  for (const part of parts) {
    for (const table of part.tables) {
      if (table.rows.length === 0) continue;
      const list = contributions.get(table.name) ?? [];
      list.push({ provenance: part.provenance, headers: renameClashing(table.headers), rows: table.rows });
      contributions.set(table.name, list);
    }
  }
  const names = [...contributions.keys()].sort((a, b) => rankOf(a) - rankOf(b));
  return names.map((name) => {
    const list = contributions.get(name)!;
    const others = [...new Set(list.flatMap((c) => c.headers))];
    const column = new Map(others.map((header, index) => [header, index]));
    const rows = list.flatMap((c) =>
      c.rows.map((row) => {
        const cells: QuantityCell[] = others.map(() => null);
        c.headers.forEach((header, index) => {
          cells[column.get(header)!] = row[index] ?? null;
        });
        return [c.provenance.building, c.provenance.level, c.provenance.sheet, c.provenance.document, ...cells];
      }),
    );
    return { name, headers: [...PROVENANCE_HEADERS, ...others], rows };
  });
}
