// Which unassigned terminals the Make circuits step can put on a new circuit.
// Pure: no rendering, no I/O. Only stamps with category 'terminal' can join a circuit.

import { findCircuitForTerminal, type Circuit } from './circuit.js';
import type { Vec2 } from './geometry.js';
import type { PlacedStamp } from './stamp.js';
import { roomsAtPoint, type Room } from './rooms/room.js';

export interface CircuitCandidate {
  id: string;
  name: string;
  position: Vec2;
  roomId: string | null;
  capacity: number | null;
  definitionId: string | null;
  ruleNeedId: string | null;
}

export type CandidateScope = { kind: 'rooms'; roomIds: readonly string[]; includeOutside: boolean } | { kind: 'stamps'; stampIds: readonly string[] };

export interface FindCircuitCandidatesInput {
  stamps: Readonly<Record<string, PlacedStamp>>;
  circuits: readonly Circuit[];
  rooms: readonly Room[];
  pageIndex: number;
  scope: CandidateScope;
  terminalCapacities: Readonly<Record<string, number>>;
  /** Ids of the stamps that back a Panel (Panel.equipmentStampId). Such a stamp is not counted as skipped equipment. */
  panelStampIds: ReadonlySet<string>;
  ruleNeedOf: (stamp: PlacedStamp) => string | null;
}

export function findCircuitCandidates(input: FindCircuitCandidatesInput): {
  candidates: CircuitCandidate[];
  outsideScopeUnassigned: number;
  equipmentSkipped: number;
} {
  const circuits = input.circuits as Circuit[];
  const roomIds = input.scope.kind === 'rooms' ? new Set(input.scope.roomIds) : null;
  const stampIds = input.scope.kind === 'stamps' ? new Set(input.scope.stampIds) : null;
  const candidates: CircuitCandidate[] = [];
  let outsideScopeUnassigned = 0;
  let equipmentSkipped = 0;

  for (const stamp of Object.values(input.stamps)) {
    const roomId = roomsAtPoint(input.rooms, stamp.transform.position, input.pageIndex)[0]?.id ?? null;
    const inScope = stampIds
      ? stampIds.has(stamp.id)
      : roomId === null
        ? input.scope.kind === 'rooms' && input.scope.includeOutside
        : roomIds!.has(roomId);

    if (stamp.category === 'equipment') {
      if (inScope && !input.panelStampIds.has(stamp.id)) equipmentSkipped++;
      continue;
    }
    if (stamp.category !== 'terminal') continue;
    if (findCircuitForTerminal(circuits, stamp.id)) continue;

    if (!inScope) {
      outsideScopeUnassigned++;
      continue;
    }
    const capacity = input.terminalCapacities[stamp.id];
    candidates.push({
      id: stamp.id,
      name: stamp.definitionId ?? stamp.id,
      position: stamp.transform.position,
      roomId,
      capacity: typeof capacity === 'number' && Number.isFinite(capacity) ? capacity : null,
      definitionId: stamp.definitionId ?? null,
      ruleNeedId: input.ruleNeedOf(stamp),
    });
  }

  candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { candidates, outsideScopeUnassigned, equipmentSkipped };
}
