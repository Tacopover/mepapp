// Circuit/Panel/PanelSection/CircuitType domain model — pure data, no
// rendering, no I/O. Ports electrical-circuits-model.md (§5-§7): a Circuit
// and a Panel have no presence on the PDF canvas, same as the old app
// (Circuit.ContainsPoint always returns false — never drawn).

import type { CustomPropertyValues } from './custom-properties.js';

export interface Circuit {
  id: string;
  /** e.g. "A" in "A1" — Circuit.CircuitPrefix in the old app. */
  prefix: string;
  /** Unique within its scope (its panel, or the unassigned pool) — isSpare does not affect scope. See getNextCircuitNumber. */
  number: number;
  /** undefined = unassigned pool, same scope as null in the old app. */
  panelId?: string;
  sectionId?: string;
  terminalIds: string[];
  isSpare: boolean;
  /** Auto-populated from the first terminal's name, same rule as the old app's CircuitService.AddTerminalToCircuit. */
  customName?: string;
  circuitTypeId?: string;
  phase?: 'L1' | 'L2' | 'L3' | 'L1L2' | 'L2L3' | 'L1L3' | 'L1L2L3';
  device?: {
    kind: 'breaker' | 'other';
    curve?: string;
    ratingA?: number;
    rcdMilliamps?: number;
  };
  cable?: {
    type?: string;
    coreCount?: number;
    crossSectionMm2?: number;
    lengthM?: number;
  };
  /** Default 100 — replaces the old app's unpersisted LoadFactor (plan §4). */
  diversityPercent: number;
  /** Arbitrary user-added annotations (plan §12 open question 7, resolved: reuse custom-properties.ts scoped to circuits rather than a dedicated field set). Definition/reserved-name scoping for circuits is Phase C/D's job — see custom-properties.ts. */
  properties?: CustomPropertyValues;
}

export interface PanelAccessory {
  id: string;
  /** "currentTransformer" | "meter" | "surgeProtector" | ... — open, not a closed enum yet (plan §12 open question 5). */
  kind: string;
  label?: string;
}

export interface Panel {
  id: string;
  /** The PlacedStamp (category: 'equipment') this panel overlays — that stamp is unchanged, a panel just references it (plan §5). */
  equipmentStampId: string;
  name: string;
  sortDirection: 'ascending' | 'descending';
  mainDevice?: { label: string; ratingA?: number };
  feederCable?: { type?: string; crossSectionMm2?: number; lengthM?: number };
  accessories: PanelAccessory[];
  sectionIds: string[];
}

export interface PanelSection {
  id: string;
  panelId: string;
  name: string;
  order: number;
}

export interface CircuitType {
  id: string;
  name: string;
  abbreviation: string;
  description: string;
  units: string;
  defaultCapacity: number;
}

/** A circuit's numbering scope: its panel, or the unassigned pool when panelId is undefined. */
export interface CircuitScope {
  panelId?: string;
}

function inScope(circuit: Circuit, scope: CircuitScope): boolean {
  return circuit.panelId === scope.panelId;
}

/**
 * Lowest unused positive integer in scope — gap-fill, not a running
 * counter. Ports the old app's GetNextCircuitNumberForScope: deleting a
 * circuit leaves a gap, and the next creation in that scope fills it.
 */
export function getNextCircuitNumber(circuits: Circuit[], scope: CircuitScope): number {
  const used = new Set(circuits.filter((c) => inScope(c, scope)).map((c) => c.number));
  let candidate = 1;
  while (used.has(candidate)) {
    candidate++;
  }
  return candidate;
}

/**
 * Shifts every circuit in scope numbered at or after `fromNumber` up by
 * one, freeing that slot for a spare being inserted there. A different
 * operation from getNextCircuitNumber, which never shifts and only fills a
 * gap — ports the old app's spare-insertion shift (plan §3).
 */
export function shiftCircuitNumbersUpFrom(circuits: Circuit[], scope: CircuitScope, fromNumber: number): Circuit[] {
  return circuits.map((c) => (inScope(c, scope) && c.number >= fromNumber ? { ...c, number: c.number + 1 } : c));
}

/**
 * Renumbers one circuit to `targetNumber` within its own current scope,
 * swapping with whatever circuit already occupies that slot (if any)
 * rather than shifting a whole range — ports the old app's RenumberCircuit.
 * Moving a circuit to a different panel is a separate operation
 * (assignCircuitToPanelCommand, plan §6), not this function's job.
 */
export function renumberCircuitWithSwap(circuits: Circuit[], circuitId: string, targetNumber: number): Circuit[] {
  const moving = circuits.find((c) => c.id === circuitId);
  if (!moving || moving.number === targetNumber) {
    return circuits;
  }
  const occupant = circuits.find((c) => c.id !== circuitId && c.panelId === moving.panelId && c.number === targetNumber);
  return circuits.map((c) => {
    if (c.id === circuitId) {
      return { ...c, number: targetNumber };
    }
    if (occupant && c.id === occupant.id) {
      return { ...c, number: moving.number };
    }
    return c;
  });
}

/**
 * A panel's member circuit ids, derived from Circuit.panelId rather than
 * stored on Panel — same tradeoff network.ts's doc comment calls out for
 * its own decision to derive network membership from topology instead of
 * stamping it on elements (plan §12 open question 1, resolved: derived).
 */
export function getPanelCircuitIds(panel: Panel, circuits: Circuit[]): string[] {
  return circuits.filter((c) => c.panelId === panel.id).map((c) => c.id);
}

/**
 * Sum of terminalCapacities over a circuit's member terminals — never
 * stored (plan §3). terminalCapacities mirrors flow.ts's FlowSolveInput
 * shape: user-entered capacity keyed by element id.
 */
export function computeCircuitCapacity(circuit: Circuit, terminalCapacities: Record<string, number>): number {
  return circuit.terminalIds.reduce((sum, id) => sum + (terminalCapacities[id] ?? 0), 0);
}

/** Sum of computeCircuitCapacity over every circuit assigned to a panel — cascades the per-circuit sum up to the panel total (plan §3). */
export function computePanelCapacity(panel: Panel, circuits: Circuit[], terminalCapacities: Record<string, number>): number {
  return circuits
    .filter((c) => c.panelId === panel.id)
    .reduce((sum, c) => sum + computeCircuitCapacity(c, terminalCapacities), 0);
}
