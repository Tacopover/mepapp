// Circuit/Panel/PanelSection/CircuitType domain model — pure data, no
// rendering, no I/O. Ports electrical-circuits-model.md (§5-§7): a Circuit
// and a Panel have no presence on the PDF canvas, same as the old app
// (Circuit.ContainsPoint always returns false — never drawn).

import type { CustomPropertyValues } from './custom-properties.js';
import type { Vec2 } from './geometry.js';

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

/** The circuit a terminal currently belongs to, if any — membership is exclusive (plan §7), so at most one. */
export function findCircuitForTerminal(circuits: Circuit[], terminalId: string): Circuit | undefined {
  return circuits.find((c) => c.terminalIds.includes(terminalId));
}

/** A circuit's display label — resolved prefix (own override, else its panel's default) followed by its number, e.g. "L1.3". */
export function getCircuitLabel(circuit: Circuit, panel?: Panel): string {
  return `${getEffectivePrefix(circuit, panel)}${circuit.number}`;
}

/**
 * What assigning a terminal to a circuit would do — the single rule set
 * behind the Add-to-Circuit tool and the terminal Properties picker (plan
 * Phase E, decision 1: a terminal already in another circuit is *moved*,
 * not rejected as the old app did). `move` carries the circuit it is
 * leaving so the caller can tell the user.
 */
export type TerminalAssignmentPlan =
  | { kind: 'add' }
  | { kind: 'move'; fromCircuitId: string }
  | { kind: 'already-member' }
  | { kind: 'rejected'; reason: 'target-not-found' | 'target-is-spare' };

export function planTerminalAssignment(circuits: Circuit[], terminalId: string, targetCircuitId: string): TerminalAssignmentPlan {
  const target = circuits.find((c) => c.id === targetCircuitId);
  if (!target) return { kind: 'rejected', reason: 'target-not-found' };
  if (target.isSpare) return { kind: 'rejected', reason: 'target-is-spare' };
  const current = findCircuitForTerminal(circuits, terminalId);
  if (!current) return { kind: 'add' };
  if (current.id === targetCircuitId) return { kind: 'already-member' };
  return { kind: 'move', fromCircuitId: current.id };
}

// --- Connection-line overlay (electrical-circuits-model.md Phase E3) ------
// Editing-view-only dashed lines from a circuit's terminals to its panel.
// Nothing here is persisted or exported to the PDF — a circuit still has no
// canvas presence of its own; this only says what the overlay should draw.

/** Distinct, dashed-line-friendly colors (0xRRGGBB), one per circuit, cycling — the old app's CircuitConnectionVisualizer palette idea. */
export const CIRCUIT_LINE_PALETTE: readonly number[] = [
  0x1e88e5, 0xe53935, 0x43a047, 0xfb8c00, 0x8e24aa, 0x00acc1, 0xd81b60, 0x7cb342, 0x6d4c41, 0x3949ab, 0x00897b, 0xf4511e,
];

/**
 * A circuit's line color, derived from the number in its id ("circuit-12" → 12) rather than its
 * position in any list, so it never changes when other circuits are added, renumbered or removed.
 * Ids without a trailing number fall back to a string hash.
 */
export function getCircuitLineColor(circuitId: string): number {
  const match = /(\d+)$/.exec(circuitId);
  let index = match ? Number(match[1]) : 0;
  if (!match) {
    for (let i = 0; i < circuitId.length; i++) index = (index * 31 + circuitId.charCodeAt(i)) >>> 0;
  }
  return CIRCUIT_LINE_PALETTE[index % CIRCUIT_LINE_PALETTE.length];
}

export interface CircuitConnectionLine {
  from: Vec2;
  to: Vec2;
}

/**
 * The lines to draw for one circuit: panel → each member terminal when the panel's position is
 * known, otherwise a star from the first terminal that has a position (a circuit with no panel yet
 * still shows what it groups). Terminals whose position `positionOf` cannot resolve (not on this
 * document) are skipped.
 */
export function getCircuitConnectionLines(
  circuit: Circuit,
  panelPosition: Vec2 | undefined,
  positionOf: (terminalId: string) => Vec2 | undefined,
): CircuitConnectionLine[] {
  const points = circuit.terminalIds.map(positionOf).filter((p): p is Vec2 => p !== undefined);
  if (panelPosition) return points.map((to) => ({ from: panelPosition, to }));
  if (points.length < 2) return [];
  const [hub, ...rest] = points;
  return rest.map((to) => ({ from: hub, to }));
}

/**
 * Which circuits the connection lines show right now, when the toggle is on: the circuit or panel
 * selected in the tree (`focus`), plus whatever the canvas selection implies — a selected terminal
 * shows its circuit, a selected equipment stamp that backs a panel shows all that panel's circuits.
 * Deduplicated, in circuit-list order.
 */
export function resolveCircuitLineTargets(
  circuits: Circuit[],
  panels: Panel[],
  input: { focusCircuitId?: string | null; focusPanelId?: string | null; selectedStampIds: Iterable<string> },
): Circuit[] {
  const wanted = new Set<string>();
  if (input.focusCircuitId) wanted.add(input.focusCircuitId);
  const panelIds = new Set<string>();
  if (input.focusPanelId) panelIds.add(input.focusPanelId);
  for (const stampId of input.selectedStampIds) {
    const owner = findCircuitForTerminal(circuits, stampId);
    if (owner) wanted.add(owner.id);
    const backed = panels.find((p) => p.equipmentStampId === stampId);
    if (backed) panelIds.add(backed.id);
  }
  return circuits.filter((c) => wanted.has(c.id) || (c.panelId !== undefined && panelIds.has(c.panelId)));
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
