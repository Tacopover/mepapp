// Room table for the Excel export: one row per room, fixed columns first, then one
// column per custom room property. Pure data, no file format: the UI writes the .xlsx.

import type { Calibration } from '../calibration.js';
import { coerceDefaultValue, type CustomPropertyDefinition } from '../custom-properties.js';
import { roomAreaM2, type Room } from './room.js';

export type RoomExportCell = string | number | boolean | null;

export interface RoomExportTable {
  headers: string[];
  /** Index of the first custom property column in `headers`. */
  customColumnStart: number;
  rows: RoomExportCell[][];
}

const FIXED_HEADERS = ['Page', 'Number', 'Name', 'Room type', 'Area (m²)', 'Area in drawing (m²)', 'Needs review', 'Source', 'Details'];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Builds the export table for `rooms` (all pages). Rows are sorted by page, then by room number
 * (natural order: 1.2 before 1.10), then by name; rooms without a number come last on their page.
 * The area is empty when the room's page has no calibration: `calibration` is one value for every
 * page, or a function that gives the calibration of a page. A room without a value for a custom
 * property gets the default of its definition, like the Properties panel shows. `roomTypeName`
 * gives the name of a room type id; without it, or for an unknown id, the column shows the id.
 */
export function buildRoomExportTable(
  rooms: readonly Room[],
  calibration: Calibration | null | ((pageIndex: number) => Calibration | null),
  customDefinitions: readonly CustomPropertyDefinition[],
  roomTypeName: (roomTypeId: string) => string | null = () => null,
): RoomExportTable {
  const calibrationOf = typeof calibration === 'function' ? calibration : () => calibration;
  const sorted = [...rooms].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    if ((a.number === null) !== (b.number === null)) return a.number === null ? 1 : -1;
    return collator.compare(a.number ?? '', b.number ?? '') || collator.compare(a.name ?? '', b.name ?? '');
  });
  const rows = sorted.map((room): RoomExportCell[] => {
    const pageCalibration = calibrationOf(room.pageIndex);
    return [
      room.pageIndex + 1,
      room.number,
      room.name,
      room.roomTypeId ? (roomTypeName(room.roomTypeId) ?? room.roomTypeId) : null,
      pageCalibration ? Math.round(roomAreaM2(room, pageCalibration) * 100) / 100 : null,
      room.labelAreaM2 ?? null,
      room.open,
      room.source,
      room.details && room.details.length > 0 ? room.details.join('; ') : null,
      ...customDefinitions.map((def) => room.properties?.[def.name] ?? coerceDefaultValue(def)),
    ];
  });
  return { headers: [...FIXED_HEADERS, ...customDefinitions.map((d) => d.name)], customColumnStart: FIXED_HEADERS.length, rows };
}
