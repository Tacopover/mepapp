// Every value a placed stamp shows — its own fields, its custom properties,
// and the values of the circuit (and panel) it belongs to — behind one key
// per value. The Properties panel and canvas labels both read through here
// (label-feature.md §5). Circuit values are derived at read time, never
// copied onto the stamp: Circuit.terminalIds stays the only membership record.

import {
  getCircuitLabel,
  getEffectiveCable,
  getEffectiveCircuitTypeId,
  getEffectiveDevice,
  getEffectivePhase,
  getEffectivePrefix,
  type Circuit,
  type CircuitType,
  type Panel,
} from './circuit.js';
import { coerceDefaultValue, type GlobalPropertyDefs } from './custom-properties.js';
import type { PlacedStamp } from './stamp.js';
import { getStampDefinition, type StampCategory, type StampDefinition } from './stamp-library.js';

export type StampPropertyGroup = 'stamp' | 'custom' | 'circuit' | 'panel';

export interface StampPropertyKey {
  key: string;
  label: string;
  group: StampPropertyGroup;
}

export interface StampPropertyValue {
  /** null = the key does not apply to this stamp, or has no value. */
  value: string | null;
  /** True when the value comes from the circuit's panel defaults rather than the circuit itself. */
  inherited: boolean;
}

export interface StampPropertyContext {
  customStampDefinitions: StampDefinition[];
  terminalCapacities: Record<string, number>;
  circuitByTerminalId: Map<string, Circuit>;
  panelById: Map<string, Panel>;
  panelByStampId: Map<string, Panel>;
  circuitTypes: CircuitType[];
  customPropertyDefs: GlobalPropertyDefs;
  labelLanguage: 'en' | 'nl';
}

export interface StampPropertyContextInput {
  customStampDefinitions: StampDefinition[];
  terminalCapacities: Record<string, number>;
  circuits: Circuit[];
  panels: Panel[];
  circuitTypes: CircuitType[];
  customPropertyDefs: GlobalPropertyDefs;
  labelLanguage: 'en' | 'nl';
}

/** Builds the lookup maps once, so resolving every stamp on a page stays linear in stamps plus circuit members. */
export function buildStampPropertyContext(input: StampPropertyContextInput): StampPropertyContext {
  const circuitByTerminalId = new Map<string, Circuit>();
  for (const circuit of input.circuits) {
    for (const terminalId of circuit.terminalIds) circuitByTerminalId.set(terminalId, circuit);
  }
  return {
    customStampDefinitions: input.customStampDefinitions,
    terminalCapacities: input.terminalCapacities,
    circuitByTerminalId,
    panelById: new Map(input.panels.map((p) => [p.id, p])),
    panelByStampId: new Map(input.panels.map((p) => [p.equipmentStampId, p])),
    circuitTypes: input.circuitTypes,
    customPropertyDefs: input.customPropertyDefs,
    labelLanguage: input.labelLanguage,
  };
}

const STAMP_KEYS: StampPropertyKey[] = [
  { key: 'stamp:name', label: 'Name', group: 'stamp' },
  { key: 'stamp:capacity', label: 'Capacity', group: 'stamp' },
  { key: 'stamp:rotation', label: 'Rotation', group: 'stamp' },
];

const CIRCUIT_KEYS: StampPropertyKey[] = [
  { key: 'circuit:label', label: 'Circuit', group: 'circuit' },
  { key: 'circuit:number', label: 'Circuit number', group: 'circuit' },
  { key: 'circuit:prefix', label: 'Circuit prefix', group: 'circuit' },
  { key: 'circuit:name', label: 'Circuit name', group: 'circuit' },
  { key: 'circuit:panel', label: 'Panel', group: 'circuit' },
  { key: 'circuit:type', label: 'Circuit type', group: 'circuit' },
  { key: 'circuit:phase', label: 'Phase', group: 'circuit' },
  { key: 'circuit:device', label: 'Device', group: 'circuit' },
  { key: 'circuit:cable', label: 'Cable', group: 'circuit' },
];

/** Which group a key belongs to — the label filter hides labels by group. */
export function stampPropertyGroupOf(key: string): StampPropertyGroup {
  if (key.startsWith('custom:')) return 'custom';
  if (key.startsWith('circuit:')) return 'circuit';
  if (key.startsWith('panel:')) return 'panel';
  return 'stamp';
}

/** The keys a stamp of `category` can show, in display order. Circuit keys are terminal-only; panel keys are equipment-only. */
export function listStampPropertyKeys(ctx: StampPropertyContext, category: StampCategory): StampPropertyKey[] {
  if (category === 'fitting') {
    return STAMP_KEYS.filter((k) => k.key !== 'stamp:capacity');
  }
  const keys = [...STAMP_KEYS, ...ctx.customPropertyDefs[category].map((def) => ({ key: `custom:${def.name}`, label: def.name, group: 'custom' as const }))];
  if (category === 'terminal') {
    keys.push(...CIRCUIT_KEYS);
    keys.push(...ctx.customPropertyDefs.circuit.map((def) => ({ key: `circuit:custom:${def.name}`, label: def.name, group: 'circuit' as const })));
  } else {
    keys.push({ key: 'panel:name', label: 'Panel name', group: 'panel' });
  }
  return keys;
}

/** An integer shows with no decimals, anything else with one (the old app's fitting label rule). */
export function formatPropertyNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatValue(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return formatPropertyNumber(value);
  return value === '' ? null : value;
}

/** e.g. "B16", "B16 30 mA", "25 A" — a breaker without curve or rating shows "Breaker". */
export function formatCircuitDevice(device: Circuit['device']): string | null {
  if (!device) return null;
  const rating = device.ratingA !== undefined ? String(device.ratingA) : '';
  let text = device.kind === 'breaker' ? `${device.curve ?? ''}${rating}` : rating ? `${rating} A` : '';
  if (device.rcdMilliamps !== undefined) text = `${text} ${device.rcdMilliamps} mA`.trim();
  if (text) return text;
  return device.kind === 'breaker' ? 'Breaker' : 'Other';
}

/** e.g. "YMvK 3G2.5" — the cable length is not part of it. */
export function formatCircuitCable(cable: Circuit['cable']): string | null {
  if (!cable) return null;
  const size =
    cable.coreCount !== undefined && cable.crossSectionMm2 !== undefined
      ? `${cable.coreCount}G${cable.crossSectionMm2}`
      : cable.coreCount !== undefined
        ? `${cable.coreCount}G`
        : cable.crossSectionMm2 !== undefined
          ? `${cable.crossSectionMm2} mm²`
          : '';
  const text = [cable.type, size].filter((part) => part).join(' ');
  return text || null;
}

const NONE: StampPropertyValue = { value: null, inherited: false };

function own(value: string | null): StampPropertyValue {
  return { value, inherited: false };
}

export function resolveStampPropertyValue(ctx: StampPropertyContext, stamp: PlacedStamp, key: string): StampPropertyValue {
  if (key.startsWith('stamp:')) return own(resolveStampKey(ctx, stamp, key));
  if (key.startsWith('custom:')) {
    if (stamp.category === 'fitting') return NONE;
    const name = key.slice('custom:'.length);
    const def = ctx.customPropertyDefs[stamp.category].find((d) => d.name === name);
    if (!def) return NONE;
    return own(formatValue(stamp.properties?.[name] ?? coerceDefaultValue(def)));
  }
  if (key === 'panel:name') {
    return own(stamp.category === 'equipment' ? formatValue(ctx.panelByStampId.get(stamp.id)?.name) : null);
  }
  if (key.startsWith('circuit:')) {
    if (stamp.category !== 'terminal') return NONE;
    const circuit = ctx.circuitByTerminalId.get(stamp.id);
    if (!circuit) return NONE;
    const panel = circuit.panelId ? ctx.panelById.get(circuit.panelId) : undefined;
    return resolveCircuitKey(ctx, circuit, panel, key);
  }
  return NONE;
}

/** The display string for one key, or null when the stamp has no value for it. */
export function resolveStampProperty(ctx: StampPropertyContext, stamp: PlacedStamp, key: string): string | null {
  return resolveStampPropertyValue(ctx, stamp, key).value;
}

function resolveStampKey(ctx: StampPropertyContext, stamp: PlacedStamp, key: string): string | null {
  switch (key) {
    case 'stamp:name': {
      const def = stamp.definitionId ? getStampDefinition(stamp.definitionId, ctx.customStampDefinitions) : undefined;
      if (!def) return null;
      return ctx.labelLanguage === 'nl' && def.labelNl ? def.labelNl : def.label;
    }
    case 'stamp:capacity':
      return stamp.category === 'fitting' ? null : formatPropertyNumber(ctx.terminalCapacities[stamp.id] ?? 0);
    case 'stamp:rotation':
      return formatPropertyNumber(stamp.transform.rotationDegrees);
    default:
      return null;
  }
}

function resolveCircuitKey(ctx: StampPropertyContext, circuit: Circuit, panel: Panel | undefined, key: string): StampPropertyValue {
  const defaults = panel?.circuitDefaults;
  switch (key) {
    case 'circuit:label':
      return { value: getCircuitLabel(circuit, panel), inherited: circuit.prefix === undefined && !!defaults?.prefix };
    case 'circuit:number':
      return own(String(circuit.number));
    case 'circuit:prefix':
      return { value: formatValue(getEffectivePrefix(circuit, panel)), inherited: circuit.prefix === undefined && defaults?.prefix !== undefined };
    case 'circuit:name':
      return own(formatValue(circuit.customName));
    case 'circuit:panel':
      return own(formatValue(panel?.name));
    case 'circuit:type': {
      const typeId = getEffectiveCircuitTypeId(circuit, panel);
      const type = typeId ? ctx.circuitTypes.find((t) => t.id === typeId) : undefined;
      return { value: type ? formatValue(type.abbreviation) ?? formatValue(type.name) : null, inherited: circuit.circuitTypeId === undefined && defaults?.circuitTypeId !== undefined };
    }
    case 'circuit:phase':
      return { value: formatValue(getEffectivePhase(circuit, panel)), inherited: circuit.phase === undefined && defaults?.phase !== undefined };
    case 'circuit:device':
      return { value: formatCircuitDevice(getEffectiveDevice(circuit, panel)), inherited: circuit.device === undefined && defaults?.device !== undefined };
    case 'circuit:cable': {
      const inherited =
        (circuit.cable?.type === undefined && defaults?.cable?.type !== undefined) ||
        (circuit.cable?.coreCount === undefined && defaults?.cable?.coreCount !== undefined) ||
        (circuit.cable?.crossSectionMm2 === undefined && defaults?.cable?.crossSectionMm2 !== undefined);
      return { value: formatCircuitCable(getEffectiveCable(circuit, panel)), inherited };
    }
  }
  if (key.startsWith('circuit:custom:')) {
    const name = key.slice('circuit:custom:'.length);
    const def = ctx.customPropertyDefs.circuit.find((d) => d.name === name);
    if (!def) return NONE;
    return own(formatValue(circuit.properties?.[name] ?? coerceDefaultValue(def)));
  }
  return NONE;
}
