import type { QuantityTable } from '@mepapp/core';

const MIN_WIDTH = 10;
const MAX_WIDTH = 50;

/** Writes the quantity tables as an .xlsx file in memory: one sheet per table, bold header row kept in view. The library loads on first use. */
export async function quantityTablesToXlsx(tables: readonly QuantityTable[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const text = (value: string | number | boolean | null) => (value === null ? '' : String(value));
  const sheets = tables.map((table) => ({
    sheet: table.name,
    stickyRowsCount: 1,
    columns: table.headers.map((header, col) => ({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, header.length + 2, ...table.rows.map((row) => text(row[col] ?? null).length + 2))) })),
    data: [
      table.headers.map((header) => ({ value: header, fontWeight: 'bold' as const })),
      ...table.rows.map((row) => row.map((value) => (value === null ? null : { value }))),
    ],
  }));
  return writeXlsxFile(sheets).toBlob();
}
