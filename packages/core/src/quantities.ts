// Quantity takeoff tables for the Excel export: flat rows per element kind (segments, terminals,
// equipment, fittings), no aggregation, so the user pivots in Excel. Pure data, no file format:
// the UI writes the .xlsx. Mirrors the takeoff of the old app (MepSketcherTools Takeoff).

import type { Calibration } from './calibration.js';
import { getCircuitLabel, type Circuit, type Panel } from './circuit.js';
import { isReservedPropertyName, type CustomPropertyValues } from './custom-properties.js';
import { computeNetworks, type Fitting, type NetworkType, type PortGroup, type Segment } from './network.js';
import type { PlacedStamp } from './stamp.js';
import { polylineLength } from './route-graph.js';

export type QuantityCell = string | number | boolean | null;

export interface QuantityTable {
  name: string;
  headers: string[];
  rows: QuantityCell[][];
}

export interface QuantityInput {
  segments: readonly Segment[];
  fittings: readonly Fitting[];
  portGroups: readonly PortGroup[];
  stamps: readonly PlacedStamp[];
  networkTypes: readonly NetworkType[];
  circuits: readonly Circuit[];
  panels: readonly Panel[];
  /** Capacity per terminal/equipment stamp id. A stamp without an entry has capacity 0. */
  capacities: Readonly<Record<string, number>>;
  /** The calibration of a 0-based page, or null when the page is not calibrated. */
  calibrationOf: (pageIndex: number) => Calibration | null;
  /** The display name of a stamp definition id, or null when unknown. */
  stampTypeName: (definitionId: string) => string | null;
  /** The file name of the art of a stamp definition id, or null when it has none (an embedded image has no file name). */
  stampImageName: (definitionId: string) => string | null;
}

export interface QuantityResult {
  tables: QuantityTable[];
  /** Problems the user must see: an export that leaves out lengths silently is worse than none. */
  warnings: string[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** X and Y of a point in page units (PDF points), as two cells; blank when there is no point. */
const pointCells = (point: { x: number; y: number } | undefined): QuantityCell[] => (point ? [round2(point.x), round2(point.y)] : [null, null]);

const collator =new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Adds one column per custom property name found on `items`, in order of first appearance. A name that equals a fixed header gets " (custom)" appended, so it cannot hide a real column. */
function withCustomColumns<T>(
  name: string,
  fixedHeaders: string[],
  items: readonly T[],
  fixedRow: (item: T) => QuantityCell[],
  customOf: (item: T) => CustomPropertyValues | undefined,
): QuantityTable {
  const taken = new Set(fixedHeaders.map((h) => h.toLowerCase()));
  const customColumns: string[] = [];
  const columnOf = new Map<string, string>();
  for (const item of items) {
    for (const key of Object.keys(customOf(item) ?? {})) {
      if (columnOf.has(key)) continue;
      const column = taken.has(key.toLowerCase()) || isReservedPropertyName(key) ? `${key} (custom)` : key;
      columnOf.set(key, column);
      customColumns.push(key);
    }
  }
  const headers = [...fixedHeaders, ...customColumns.map((key) => columnOf.get(key)!)];
  const rows = items.map((item) => {
    const values = customOf(item) ?? {};
    return [...fixedRow(item), ...customColumns.map((key) => (key in values ? values[key]! : null))];
  });
  return { name, headers, rows };
}

/** Builds the takeoff tables of one document. A table without rows is left out. */
export function buildQuantityTables(input: QuantityInput): QuantityResult {
  const warnings: string[] = [];
  const typeOf = new Map(input.networkTypes.map((t) => [t.id, t]));
  const typeName = (id: string) => typeOf.get(id)?.name ?? id;

  // "Network" = the connected run a segment belongs to, numbered per network type in a stable order.
  const networks = computeNetworks({ segments: [...input.segments], fittings: [...input.fittings], portGroups: [...input.portGroups] });
  const networkLabel = new Map<string, string>();
  const perType = new Map<string, number>();
  for (const network of networks) {
    const n = (perType.get(network.networkTypeId) ?? 0) + 1;
    perType.set(network.networkTypeId, n);
    const label = `${typeName(network.networkTypeId)} ${n}`;
    for (const id of network.segmentIds) networkLabel.set(id, label);
  }

  const unscaledPages = new Set<number>();
  const segments = [...input.segments].sort((a, b) => a.pageIndex - b.pageIndex || collator.compare(a.id, b.id));
  const segmentTable: QuantityTable = {
    name: 'Segments',
    headers: ['Page', 'Id', 'Network', 'Network type', 'Shape', 'Diameter (mm)', 'Width (mm)', 'Height (mm)', 'Material', 'Length (m)', 'Routed', 'Start X (pt)', 'Start Y (pt)', 'End X (pt)', 'End Y (pt)'],
    rows: segments.map((segment) => {
      const calibration = input.calibrationOf(segment.pageIndex);
      // Blank, never 0 or raw page units: both read as real numbers in Excel and corrupt a takeoff.
      if (!calibration) unscaledPages.add(segment.pageIndex);
      const lengthM = calibration ? round2(polylineLength([...segment.geometry]) / calibration.pageUnitsPerRealUnit / 1000) : null;
      return [
        segment.pageIndex + 1,
        segment.id,
        networkLabel.get(segment.id) ?? null,
        typeName(segment.networkTypeId),
        segment.shape === 'round' ? 'Round' : 'Rectangular',
        segment.diameter ?? null,
        segment.width ?? null,
        segment.height ?? null,
        segment.material ?? null,
        lengthM,
        segment.routedBy ? 'TRUE' : 'FALSE',
        ...pointCells(segment.geometry[0]),
        ...pointCells(segment.geometry[segment.geometry.length - 1]),
      ];
    }),
  };
  for (const pageIndex of [...unscaledPages].sort((a, b) => a - b)) {
    warnings.push(`Page ${pageIndex + 1} has no scale set, so segment lengths on it were left blank. Set its scale and export again.`);
  }

  const circuitOf = new Map<string, string>();
  for (const circuit of input.circuits) {
    for (const id of circuit.terminalIds) circuitOf.set(id, getCircuitLabel(circuit, input.panels.find((p) => p.id === circuit.panelId)));
  }

  const stampTable = (name: string, category: PlacedStamp['category']): QuantityTable => {
    const stamps = input.stamps.filter((s) => s.category === category);
    const fixed = [
      'Id',
      'Type',
      'Capacity',
      ...(category === 'terminal' ? ['Circuit'] : []),
      'X (pt)',
      'Y (pt)',
      'Rotation (°)',
      'Scale',
      'Image',
    ];
    return withCustomColumns(
      name,
      fixed,
      stamps,
      (stamp) => [
        stamp.id,
        (stamp.definitionId ? input.stampTypeName(stamp.definitionId) ?? stamp.definitionId : null),
        input.capacities[stamp.id] ?? 0,
        ...(category === 'terminal' ? [circuitOf.get(stamp.id) ?? null] : []),
        ...pointCells(stamp.transform.position),
        round2(stamp.transform.rotationDegrees),
        round2(stamp.transform.scale.x),
        (stamp.definitionId ? input.stampImageName(stamp.definitionId) : null),
      ],
      (stamp) => stamp.properties,
    );
  };

  const fittings = [...input.fittings].sort((a, b) => a.pageIndex - b.pageIndex || collator.compare(a.id, b.id));
  const fittingTable: QuantityTable = {
    name: 'Fittings',
    headers: ['Page', 'Id', 'Kind', 'Routed', 'X (pt)', 'Y (pt)'],
    rows: fittings.map((f) => [f.pageIndex + 1, f.id, f.kind, f.routedBy ? 'TRUE' : 'FALSE', ...pointCells(f.position)]),
  };

  const tables = [segmentTable, stampTable('Terminals', 'terminal'), stampTable('Equipment', 'equipment'), fittingTable].filter((t) => t.rows.length > 0);
  return { tables, warnings };
}
