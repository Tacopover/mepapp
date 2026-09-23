// Circuit/Panel/PanelSection/CircuitType domain model — pure data, no
// rendering, no I/O. Ports electrical-circuits-model.md (§5-§7): a Circuit
// and a Panel have no presence on the PDF canvas, same as the old app
// (Circuit.ContainsPoint always returns false — never drawn).

import type { CustomPropertyValues } from './custom-properties.js';

export interface Circuit {
  id: string;
  /** e.g. "A" in "A1" — Circuit.CircuitPrefix in the old app. undefined = inherits the panel's circuitDefaults.prefix, or '' if unassigned/no default (templates plan §7 round 4, resolved 2026-09-23). See getEffectivePrefix. */
  prefix?: string;
  /** Unique within its scope (its panel, or the unassigned pool) — isSpare does not affect scope. See getNextCircuitNumber. */
  number: number;
  /** undefined = unassigned pool, same scope as null in the old app. */
  panelId?: string;
  sectionId?: string;
  terminalIds: string[];
  isSpare: boolean;
  /** Auto-populated from the first terminal's name, same rule as the old app's CircuitService.AddTerminalToCircuit. */
  customName?: string;
  /** undefined = inherits the panel's circuitDefaults.circuitTypeId, if any. See getEffectiveCircuitTypeId. */
  circuitTypeId?: string;
  /** undefined = inherits the panel's circuitDefaults.phase, if any. See getEffectivePhase. */
  phase?: 'L1' | 'L2' | 'L3' | 'L1L2' | 'L2L3' | 'L1L3' | 'L1L2L3';
  /** undefined = inherits the panel's circuitDefaults.device, if any (a whole-object override, not per-subfield). See getEffectiveDevice. */
  device?: {
    kind: 'breaker' | 'other';
    curve?: string;
    ratingA?: number;
    rcdMilliamps?: number;
  };
  cable?: {
    /** undefined = inherits the panel's circuitDefaults.cable.type, if any. */
    type?: string;
    /** undefined = inherits the panel's circuitDefaults.cable.coreCount, if any. */
    coreCount?: number;
    /** undefined = inherits the panel's circuitDefaults.cable.crossSectionMm2, if any. */
    crossSectionMm2?: number;
    /** Never inherited — always a per-circuit typed measurement (templates plan §1, §7 round 4): two circuits off the same panel practically always run different physical lengths. */
    lengthM?: number;
  };
  /** undefined = inherits the panel's circuitDefaults.diversityPercent, or 100 if unassigned/no default. Replaces the old app's unpersisted LoadFactor (plan §4). See getEffectiveDiversityPercent. */
  diversityPercent?: number;
  /** Arbitrary user-added annotations (plan §12 open question 7, resolved: reuse custom-properties.ts scoped to circuits rather than a dedicated field set). Definition/reserved-name scoping for circuits is Phase C/D's job — see custom-properties.ts. */
  properties?: CustomPropertyValues;
}

/**
 * Panel-level fallback values for the circuit fields listed here — a
 * circuit that leaves one of these fields undefined inherits it from its
 * panel's `circuitDefaults` instead (templates plan §7, decided in Phase 0
 * mockup round 4, 2026-09-23). `cable.lengthM` is deliberately excluded —
 * see Circuit.cable.lengthM's doc comment.
 */
export interface PanelCircuitDefaults {
  prefix?: string;
  circuitTypeId?: string;
  phase?: Circuit['phase'];
  device?: Circuit['device'];
  cable?: { type?: string; coreCount?: number; crossSectionMm2?: number };
  diversityPercent?: number;
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
  /** Fallback values a member circuit inherits for any field it leaves unset (templates plan §7 round 4). */
  circuitDefaults?: PanelCircuitDefaults;
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

// --- Panel-default resolvers (templates plan §7 round 4) ---------------
// A circuit stores an override only for a field it actually sets; an unset
// field reads from its panel's circuitDefaults. `panel` is optional so a
// caller can resolve an unassigned circuit without a null check of its own.

export function getEffectivePrefix(circuit: Circuit, panel?: Panel): string {
  return circuit.prefix ?? panel?.circuitDefaults?.prefix ?? '';
}

export function getEffectiveCircuitTypeId(circuit: Circuit, panel?: Panel): string | undefined {
  return circuit.circuitTypeId ?? panel?.circuitDefaults?.circuitTypeId;
}

export function getEffectivePhase(circuit: Circuit, panel?: Panel): Circuit['phase'] {
  return circuit.phase ?? panel?.circuitDefaults?.phase;
}

/** Whole-object override, not per-subfield — a circuit that sets its own `device` does not also blend in the panel default's individual fields. */
export function getEffectiveDevice(circuit: Circuit, panel?: Panel): Circuit['device'] {
  return circuit.device ?? panel?.circuitDefaults?.device;
}

export function getEffectiveDiversityPercent(circuit: Circuit, panel?: Panel): number {
  return circuit.diversityPercent ?? panel?.circuitDefaults?.diversityPercent ?? 100;
}

/** Unlike getEffectiveDevice, cable fields are resolved individually — `type`/`coreCount`/`crossSectionMm2` each inherit on their own, and `lengthM` never inherits (see Circuit.cable.lengthM's doc comment). */
export function getEffectiveCable(circuit: Circuit, panel?: Panel): Circuit['cable'] {
  const defaults = panel?.circuitDefaults?.cable;
  const type = circuit.cable?.type ?? defaults?.type;
  const coreCount = circuit.cable?.coreCount ?? defaults?.coreCount;
  const crossSectionMm2 = circuit.cable?.crossSectionMm2 ?? defaults?.crossSectionMm2;
  const lengthM = circuit.cable?.lengthM;
  if (type === undefined && coreCount === undefined && crossSectionMm2 === undefined && lengthM === undefined) {
    return undefined;
  }
  return { type, coreCount, crossSectionMm2, lengthM };
}
