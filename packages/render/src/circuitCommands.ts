// Circuit/Panel/PanelSection command factories — Phase C of
// electrical-circuits-model.md §6. Follows drawingCommands.ts's pattern:
// each factory takes plain data (already-minted ids, already-known domain
// objects, or the current Circuit[]/Panel[] list when a computation needs
// to see siblings) and returns a Command<DrawingState>, or null on the two
// invalid preconditions the plan calls out (§6, following segmentTool.ts's
// validation pattern). No id generation here — that's the caller's job
// (SketchDocument.nextCircuitSeq et al.), matching how createStampCommand
// takes an already-built PlacedStamp rather than minting its own id.

import {
  getNextCircuitNumber,
  planTerminalAssignment,
  renumberCircuitWithSwap,
  shiftCircuitNumbersUpFrom,
  type Circuit,
  type CircuitScope,
  type Command,
  type Panel,
  type PanelAccessory,
  type PanelSection,
} from '@mepapp/core';
import type { DrawingState } from './document.js';

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

/** `prefix` and `diversityPercent` are left unset unless the caller passes an explicit override, so a new circuit inherits its panel's circuitDefaults (templates plan §7 round 4) rather than pinning the old app's `''`/100 literals in. */
export function createCircuitCommand(
  circuits: Circuit[],
  id: string,
  options: { panelId?: string; prefix?: string } = {},
): Command<DrawingState> {
  const number = getNextCircuitNumber(circuits, { panelId: options.panelId });
  const circuit: Circuit = {
    id,
    prefix: options.prefix,
    number,
    panelId: options.panelId,
    terminalIds: [],
    isSpare: false,
  };
  return {
    description: `Create circuit ${id}`,
    execute: (s) => ({ ...s, circuits: { ...s.circuits, [id]: circuit } }),
    undo: (s) => ({ ...s, circuits: withoutKey(s.circuits, id) }),
  };
}

/** No dangling-reference cleanup needed here (unlike the old app's DeleteCircuitCommand) — MepApp's Circuit holds terminalIds itself rather than a PlacedStamp holding a circuitId back-reference, so deleting the Circuit record is the whole operation. */
export function deleteCircuitCommand(circuit: Circuit): Command<DrawingState> {
  return {
    description: `Delete circuit ${circuit.id}`,
    execute: (s) => ({ ...s, circuits: withoutKey(s.circuits, circuit.id) }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, [circuit.id]: circuit } }),
  };
}

/**
 * Returns null if the target circuit is a spare, or terminalId already
 * belongs to a different circuit — terminal-to-circuit membership is
 * exclusive (plan §7). `terminalName`, when given, becomes the circuit's
 * `customName` only if this is the circuit's first terminal, matching the
 * old app's auto-populate-from-first-terminal rule (CircuitService
 * .AddTerminalToCircuit) — resolving what a terminal's "name" actually is
 * (stamp label vs. a custom property) is left to the caller, not this
 * command.
 */
export function addTerminalToCircuitCommand(
  circuits: Circuit[],
  circuitId: string,
  terminalId: string,
  terminalName?: string,
): Command<DrawingState> | null {
  const target = circuits.find((c) => c.id === circuitId);
  if (!target || target.isSpare) return null;
  if (circuits.some((c) => c.terminalIds.includes(terminalId))) return null;

  const isFirstTerminal = target.terminalIds.length === 0;
  const previousCustomName = target.customName;
  return {
    description: `Add terminal ${terminalId} to circuit ${circuitId}`,
    execute: (s) => {
      const circuit = s.circuits[circuitId];
      const updated: Circuit = {
        ...circuit,
        terminalIds: [...circuit.terminalIds, terminalId],
        customName: isFirstTerminal && terminalName !== undefined ? terminalName : circuit.customName,
      };
      return { ...s, circuits: { ...s.circuits, [circuitId]: updated } };
    },
    undo: (s) => {
      const circuit = s.circuits[circuitId];
      const updated: Circuit = {
        ...circuit,
        terminalIds: circuit.terminalIds.filter((id) => id !== terminalId),
        customName: isFirstTerminal ? previousCustomName : circuit.customName,
      };
      return { ...s, circuits: { ...s.circuits, [circuitId]: updated } };
    },
  };
}

export function removeTerminalFromCircuitCommand(circuit: Circuit, terminalId: string): Command<DrawingState> {
  return {
    description: `Remove terminal ${terminalId} from circuit ${circuit.id}`,
    execute: (s) => ({
      ...s,
      circuits: {
        ...s.circuits,
        [circuit.id]: { ...s.circuits[circuit.id], terminalIds: s.circuits[circuit.id].terminalIds.filter((id) => id !== terminalId) },
      },
    }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, [circuit.id]: circuit } }),
  };
}

/**
 * Adds a terminal to a circuit, first taking it out of whichever circuit
 * holds it now — one undo step either way (plan Phase E, decision 1: unlike
 * addTerminalToCircuitCommand, which rejects a terminal that is already in a
 * circuit, this moves it). Returns null on planTerminalAssignment's
 * rejected/already-member cases. Neither circuit's customName is touched:
 * the caller does not auto-name a circuit from its first terminal here, so
 * there is no stale name to clean up on the circuit being left.
 */
export function assignTerminalToCircuitCommand(circuits: Circuit[], circuitId: string, terminalId: string): Command<DrawingState> | null {
  const plan = planTerminalAssignment(circuits, terminalId, circuitId);
  if (plan.kind === 'rejected' || plan.kind === 'already-member') return null;

  const target = circuits.find((c) => c.id === circuitId)!;
  const source = plan.kind === 'move' ? circuits.find((c) => c.id === plan.fromCircuitId)! : undefined;
  return {
    description: source ? `Move terminal ${terminalId} from circuit ${source.id} to ${circuitId}` : `Add terminal ${terminalId} to circuit ${circuitId}`,
    execute: (s) => {
      const next = { ...s.circuits };
      if (source) next[source.id] = { ...s.circuits[source.id], terminalIds: s.circuits[source.id].terminalIds.filter((id) => id !== terminalId) };
      next[circuitId] = { ...s.circuits[circuitId], terminalIds: [...s.circuits[circuitId].terminalIds, terminalId] };
      return { ...s, circuits: next };
    },
    undo: (s) => {
      const next = { ...s.circuits, [circuitId]: target };
      if (source) next[source.id] = source;
      return { ...s, circuits: next };
    },
  };
}

/** Renumbers into the target panel's scope (gap-fill), same as the old app's AssignPanelToCircuitCommand. */
export function assignCircuitToPanelCommand(circuits: Circuit[], circuitId: string, panelId: string): Command<DrawingState> {
  const before = circuits.find((c) => c.id === circuitId)!;
  const number = getNextCircuitNumber(
    circuits.filter((c) => c.id !== circuitId),
    { panelId },
  );
  const after: Circuit = { ...before, panelId, number };
  return {
    description: `Assign circuit ${circuitId} to panel ${panelId}`,
    execute: (s) => ({ ...s, circuits: { ...s.circuits, [circuitId]: after } }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, [circuitId]: before } }),
  };
}

/** Plan §12 open question 4, resolved 2026-09-23: a spare is deleted outright, matching the old app — a non-spare circuit returns to the unassigned pool with a gap-filled number. */
export function removeCircuitFromPanelCommand(circuits: Circuit[], circuitId: string): Command<DrawingState> {
  const before = circuits.find((c) => c.id === circuitId)!;
  if (before.isSpare) {
    return deleteCircuitCommand(before);
  }
  const number = getNextCircuitNumber(
    circuits.filter((c) => c.id !== circuitId && c.panelId === undefined),
    {},
  );
  const after: Circuit = { ...before, panelId: undefined, sectionId: undefined, number };
  return {
    description: `Remove circuit ${circuitId} from its panel`,
    execute: (s) => ({ ...s, circuits: { ...s.circuits, [circuitId]: after } }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, [circuitId]: before } }),
  };
}

/** Shifts every circuit in scope at/after targetNumber up by one, then inserts a real, numbered spare Circuit into the freed slot — a different operation from createCircuitCommand, which never shifts (plan §3). */
export function insertSpareCircuitCommand(
  circuits: Circuit[],
  id: string,
  scope: CircuitScope,
  targetNumber: number,
  prefix = '',
): Command<DrawingState> {
  const before = byId(circuits);
  const shifted = shiftCircuitNumbersUpFrom(circuits, scope, targetNumber);
  const spare: Circuit = { id, prefix, number: targetNumber, panelId: scope.panelId, terminalIds: [], isSpare: true, diversityPercent: 100 };
  const after = { ...byId(shifted), [id]: spare };
  return {
    description: `Insert spare circuit at ${targetNumber}`,
    execute: (s) => ({ ...s, circuits: { ...s.circuits, ...after } }),
    undo: (s) => ({ ...s, circuits: withoutKey({ ...s.circuits, ...before }, id) }),
  };
}

/** Swaps with whatever circuit already occupies targetNumber in the moving circuit's own panel scope, rather than shifting a range (plan §3). */
export function renumberCircuitCommand(circuits: Circuit[], circuitId: string, targetNumber: number): Command<DrawingState> {
  const before = byId(circuits);
  const after = byId(renumberCircuitWithSwap(circuits, circuitId, targetNumber));
  return {
    description: `Renumber circuit ${circuitId} to ${targetNumber}`,
    execute: (s) => ({ ...s, circuits: { ...s.circuits, ...after } }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, ...before } }),
  };
}

function withCircuitField<K extends keyof Circuit>(circuit: Circuit, field: K, value: Circuit[K], description: string): Command<DrawingState> {
  const previous = circuit[field];
  return {
    description,
    execute: (s) => ({ ...s, circuits: { ...s.circuits, [circuit.id]: { ...s.circuits[circuit.id], [field]: value } } }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, [circuit.id]: { ...s.circuits[circuit.id], [field]: previous } } }),
  };
}

/** `prefix: undefined` clears the circuit's own override so it goes back to inheriting its panel's circuitDefaults.prefix (templates plan §7 round 4). */
export function setCircuitPrefixCommand(circuit: Circuit, prefix: string | undefined): Command<DrawingState> {
  return withCircuitField(circuit, 'prefix', prefix, `Set circuit ${circuit.id} prefix`);
}

/** CompositeCommand over setCircuitPrefixCommand, one undo step for the whole bulk edit — matches the old app's BulkChangeCircuitPrefixCommand / the Networks tree's checkbox multi-select. */
export function setCircuitPrefixBulkCommand(circuits: Circuit[], prefix: string): Command<DrawingState> {
  const before = byId(circuits);
  return {
    description: `Set prefix for ${circuits.length} circuit(s)`,
    execute: (s) => ({
      ...s,
      circuits: { ...s.circuits, ...Object.fromEntries(circuits.map((c) => [c.id, { ...s.circuits[c.id], prefix }])) },
    }),
    undo: (s) => ({ ...s, circuits: { ...s.circuits, ...before } }),
  };
}

export function setCircuitCustomNameCommand(circuit: Circuit, customName: string | undefined): Command<DrawingState> {
  return withCircuitField(circuit, 'customName', customName, `Rename circuit ${circuit.id}`);
}

export function setCircuitTypeCommand(circuit: Circuit, circuitTypeId: string | undefined): Command<DrawingState> {
  return withCircuitField(circuit, 'circuitTypeId', circuitTypeId, `Set circuit ${circuit.id} type`);
}

export function setCircuitDeviceCommand(circuit: Circuit, device: Circuit['device']): Command<DrawingState> {
  return withCircuitField(circuit, 'device', device, `Set circuit ${circuit.id} device`);
}

export function setCircuitCableCommand(circuit: Circuit, cable: Circuit['cable']): Command<DrawingState> {
  return withCircuitField(circuit, 'cable', cable, `Set circuit ${circuit.id} cable`);
}

/** `diversityPercent: undefined` clears the circuit's own override so it goes back to inheriting its panel's circuitDefaults.diversityPercent (templates plan §7 round 4). */
export function setCircuitDiversityCommand(circuit: Circuit, diversityPercent: number | undefined): Command<DrawingState> {
  return withCircuitField(circuit, 'diversityPercent', diversityPercent, `Set circuit ${circuit.id} diversity`);
}

export function setCircuitPhaseCommand(circuit: Circuit, phase: Circuit['phase']): Command<DrawingState> {
  return withCircuitField(circuit, 'phase', phase, `Set circuit ${circuit.id} phase`);
}

export function setCircuitSectionCommand(circuit: Circuit, sectionId: string | undefined): Command<DrawingState> {
  return withCircuitField(circuit, 'sectionId', sectionId, `Set circuit ${circuit.id} section`);
}

/**
 * Returns null if `equipmentStampId` already backs a Panel — one PlacedStamp
 * may back at most one Panel (plan §7). No object replacement, unlike the
 * old app's Panel : Equipment subtype: the stamp itself never changes (§5).
 */
export function createPanelCommand(panels: Panel[], id: string, equipmentStampId: string, name: string): Command<DrawingState> | null {
  if (panels.some((p) => p.equipmentStampId === equipmentStampId)) return null;
  const panel: Panel = { id, equipmentStampId, name, sortDirection: 'ascending', accessories: [], sectionIds: [] };
  return {
    description: `Convert stamp ${equipmentStampId} to panel`,
    execute: (s) => ({ ...s, panels: { ...s.panels, [id]: panel } }),
    undo: (s) => ({ ...s, panels: withoutKey(s.panels, id) }),
  };
}

/**
 * Returns every circuit currently assigned to `panelId` to the unassigned
 * pool (gap-filling a fresh number for each) and drops the panel's own
 * PanelSection records, clearing sectionId off any circuit that referenced
 * one — a section can't outlive its panel. Shared by deletePanelCommand and
 * by SketchScene.deleteSelection's cleanup when the panel's underlying
 * equipment stamp is deleted directly (plan §6's "composite delete-cleanup"
 * note) — not a Command itself, just the pure state transform both need.
 */
export function detachPanelCircuits(state: DrawingState, panelId: string): DrawingState {
  let circuits = state.circuits;
  for (const circuit of Object.values(state.circuits)) {
    if (circuit.panelId !== panelId) continue;
    const number = getNextCircuitNumber(
      Object.values(circuits).filter((c) => c.panelId === undefined),
      {},
    );
    circuits = { ...circuits, [circuit.id]: { ...circuit, panelId: undefined, sectionId: undefined, number } };
  }
  const panelSections = Object.fromEntries(Object.entries(state.panelSections).filter(([, section]) => section.panelId !== panelId));
  return { ...state, circuits, panelSections };
}

/** Detaches all circuits first (returns them to the unassigned pool), same as the old app's RevertToEquipmentCommand. Unlike removeCircuitFromPanelCommand, this returns every circuit including spares — reverting the whole panel is a different operation from removing one circuit from it (plan §12 open question 4's resolution is scoped to the latter only). */
export function deletePanelCommand(state: DrawingState, panelId: string): Command<DrawingState> {
  const before = { circuits: state.circuits, panels: state.panels, panelSections: state.panelSections };
  const panel = state.panels[panelId];
  const detached = detachPanelCircuits(state, panelId);
  const after = { circuits: detached.circuits, panels: withoutKey(detached.panels, panelId), panelSections: detached.panelSections };
  return {
    description: `Delete panel ${panelId}`,
    execute: (s) => ({ ...s, ...after }),
    undo: (s) => ({ ...s, ...before, panels: { ...s.panels, ...before.panels, [panelId]: panel } }),
  };
}

function withPanelField<K extends keyof Panel>(panel: Panel, field: K, value: Panel[K], description: string): Command<DrawingState> {
  const previous = panel[field];
  return {
    description,
    execute: (s) => ({ ...s, panels: { ...s.panels, [panel.id]: { ...s.panels[panel.id], [field]: value } } }),
    undo: (s) => ({ ...s, panels: { ...s.panels, [panel.id]: { ...s.panels[panel.id], [field]: previous } } }),
  };
}

export function setPanelNameCommand(panel: Panel, name: string): Command<DrawingState> {
  return withPanelField(panel, 'name', name, `Rename panel ${panel.id}`);
}

export function setPanelSortDirectionCommand(panel: Panel, sortDirection: Panel['sortDirection']): Command<DrawingState> {
  return withPanelField(panel, 'sortDirection', sortDirection, `Set panel ${panel.id} sort direction`);
}

export function setPanelMainDeviceCommand(panel: Panel, mainDevice: Panel['mainDevice']): Command<DrawingState> {
  return withPanelField(panel, 'mainDevice', mainDevice, `Set panel ${panel.id} main device`);
}

export function setPanelFeederCableCommand(panel: Panel, feederCable: Panel['feederCable']): Command<DrawingState> {
  return withPanelField(panel, 'feederCable', feederCable, `Set panel ${panel.id} feeder cable`);
}

/** Whole-object replacement, same as setPanelMainDeviceCommand/setPanelFeederCableCommand — the caller builds the full PanelCircuitDefaults it wants (templates plan §7 round 4). */
export function setPanelCircuitDefaultsCommand(panel: Panel, circuitDefaults: Panel['circuitDefaults']): Command<DrawingState> {
  return withPanelField(panel, 'circuitDefaults', circuitDefaults, `Set panel ${panel.id} circuit defaults`);
}

export function addPanelAccessoryCommand(panel: Panel, accessory: PanelAccessory): Command<DrawingState> {
  return {
    description: `Add accessory ${accessory.id} to panel ${panel.id}`,
    execute: (s) => ({
      ...s,
      panels: { ...s.panels, [panel.id]: { ...s.panels[panel.id], accessories: [...s.panels[panel.id].accessories, accessory] } },
    }),
    undo: (s) => ({
      ...s,
      panels: { ...s.panels, [panel.id]: { ...s.panels[panel.id], accessories: s.panels[panel.id].accessories.filter((a) => a.id !== accessory.id) } },
    }),
  };
}

export function removePanelAccessoryCommand(panel: Panel, accessoryId: string): Command<DrawingState> {
  const removed = panel.accessories.find((a) => a.id === accessoryId);
  return {
    description: `Remove accessory ${accessoryId} from panel ${panel.id}`,
    execute: (s) => ({
      ...s,
      panels: { ...s.panels, [panel.id]: { ...s.panels[panel.id], accessories: s.panels[panel.id].accessories.filter((a) => a.id !== accessoryId) } },
    }),
    undo: (s) =>
      removed
        ? { ...s, panels: { ...s.panels, [panel.id]: { ...s.panels[panel.id], accessories: [...s.panels[panel.id].accessories, removed] } } }
        : s,
  };
}

export function createPanelSectionCommand(id: string, panelId: string, name: string, order: number): Command<DrawingState> {
  const section: PanelSection = { id, panelId, name, order };
  return {
    description: `Create panel section ${id}`,
    execute: (s) => ({ ...s, panelSections: { ...s.panelSections, [id]: section } }),
    undo: (s) => ({ ...s, panelSections: withoutKey(s.panelSections, id) }),
  };
}

export function renamePanelSectionCommand(section: PanelSection, name: string): Command<DrawingState> {
  return {
    description: `Rename panel section ${section.id}`,
    execute: (s) => ({ ...s, panelSections: { ...s.panelSections, [section.id]: { ...s.panelSections[section.id], name } } }),
    undo: (s) => ({ ...s, panelSections: { ...s.panelSections, [section.id]: section } }),
  };
}

/** Also clears sectionId off any circuit that referenced it — a section can't outlive itself as a dangling reference, same reasoning as detachPanelCircuits. */
export function deletePanelSectionCommand(state: DrawingState, sectionId: string): Command<DrawingState> {
  const section = state.panelSections[sectionId];
  const affectedCircuits = Object.values(state.circuits).filter((c) => c.sectionId === sectionId);
  return {
    description: `Delete panel section ${sectionId}`,
    execute: (s) => ({
      ...s,
      panelSections: withoutKey(s.panelSections, sectionId),
      circuits: {
        ...s.circuits,
        ...Object.fromEntries(affectedCircuits.map((c) => [c.id, { ...s.circuits[c.id], sectionId: undefined }])),
      },
    }),
    undo: (s) => ({
      ...s,
      panelSections: { ...s.panelSections, [sectionId]: section },
      circuits: { ...s.circuits, ...Object.fromEntries(affectedCircuits.map((c) => [c.id, c])) },
    }),
  };
}
