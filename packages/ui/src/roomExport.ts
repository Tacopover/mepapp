import type { RoomExportTable } from '@mepapp/core';

const MIN_WIDTH = 10;
const MAX_WIDTH = 50;

/** Writes the room table as an .xlsx file in memory: bold header row kept in view, one sheet "Rooms". The library loads on first use. */
export async function roomTableToXlsx(table: RoomExportTable): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const text = (value: string | number | boolean | null) => (value === null ? '' : String(value));
  const widths = table.headers.map((header, col) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, header.length + 2, ...table.rows.map((row) => text(row[col] ?? null).length + 2))));
  const sheetData = [
    table.headers.map((header) => ({ value: header, fontWeight: 'bold' as const })),
    ...table.rows.map((row) => row.map((value) => (value === null ? null : { value }))),
  ];
  return writeXlsxFile(sheetData, { sheet: 'Rooms', stickyRowsCount: 1, columns: widths.map((width) => ({ width })) }).toBlob();
}
