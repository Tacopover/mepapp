// Packs whole rooms of terminals onto circuits. Pure data, no rendering, no I/O.
// Next-fit: one open circuit at a time, nearest room first. A room that alone
// exceeds a limit is split into pieces, and its last piece is closed.

export interface PackUnit {
  roomId: string;
  terminalIds: string[];
  loads: number[];
  distance: number;
}

export interface PackLimits {
  maxTerminals: number | null;
  maxLoad: number | null;
  diversityPercent: number;
}

export interface PackedCircuit {
  terminalIds: string[];
  roomIds: string[];
  reason: 'pack' | 'room-split';
}

function sumLoads(loads: readonly number[]): number {
  return loads.reduce((sum, load) => sum + load, 0);
}

function fits(count: number, rawLoad: number, limits: PackLimits): boolean {
  if (limits.maxTerminals !== null && count > limits.maxTerminals) return false;
  if (limits.maxLoad !== null && (rawLoad * limits.diversityPercent) / 100 > limits.maxLoad) return false;
  return true;
}

function compareUnits(a: PackUnit, b: PackUnit): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  if (a.roomId < b.roomId) return -1;
  if (a.roomId > b.roomId) return 1;
  return 0;
}

export function packRooms(
  units: readonly PackUnit[],
  limits: PackLimits,
  options: { spanRooms: boolean },
): PackedCircuit[] {
  const sorted = [...units].sort(compareUnits);
  const circuits: PackedCircuit[] = [];
  let open: PackedCircuit | null = null;
  let openLoad = 0;

  for (const unit of sorted) {
    if (unit.terminalIds.length === 0) continue;
    const unitLoad = sumLoads(unit.loads);

    if (fits(unit.terminalIds.length, unitLoad, limits)) {
      if (
        options.spanRooms &&
        open !== null &&
        fits(open.terminalIds.length + unit.terminalIds.length, openLoad + unitLoad, limits)
      ) {
        open.terminalIds.push(...unit.terminalIds);
        open.roomIds.push(unit.roomId);
        openLoad += unitLoad;
        continue;
      }
      if (open !== null) circuits.push(open);
      open = { terminalIds: [...unit.terminalIds], roomIds: [unit.roomId], reason: 'pack' };
      openLoad = unitLoad;
      continue;
    }

    if (open !== null) circuits.push(open);
    open = null;
    openLoad = 0;

    let piece: PackedCircuit | null = null;
    let pieceLoad = 0;
    for (let index = 0; index < unit.terminalIds.length; index++) {
      const load = unit.loads[index];
      if (piece !== null && !fits(piece.terminalIds.length + 1, pieceLoad + load, limits)) {
        circuits.push(piece);
        piece = null;
      }
      if (piece === null) {
        piece = { terminalIds: [], roomIds: [unit.roomId], reason: 'room-split' };
        pieceLoad = 0;
      }
      piece.terminalIds.push(unit.terminalIds[index]);
      pieceLoad += load;
    }
    if (piece !== null) circuits.push(piece);
  }

  if (open !== null) circuits.push(open);
  return circuits;
}
