import type { FlowUnitId } from './flow-units.js';

export type SizeSeries = 'standard' | 'free';

export interface AirSizing {
  method: 'air';
  maxVelocityMs: number;
  maxPressureDropPaPerM: number;
  shape: 'round' | 'rectangular';
  /** Rectangular only: width ÷ height, at most this. At least 1. */
  maxAspectRatio?: number;
  series: SizeSeries;
}

export interface WaterSizing {
  method: 'water';
  maxVelocityMs: number;
  maxPressureDropPaPerM: number;
  /** K. Needed when the flow unit is a power. */
  deltaTK?: number;
}

export type SizingSettings = AirSizing | WaterSizing;

export const SUGGESTED_AIR_SIZING: AirSizing = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1.0, shape: 'round', maxAspectRatio: 4, series: 'standard' };
export const SUGGESTED_WATER_SIZING: WaterSizing = { method: 'water', maxVelocityMs: 1.0, maxPressureDropPaPerM: 200 };
export const SUGGESTED_FLOW_UNIT: Record<'air' | 'water', FlowUnitId> = { air: 'dm³/s', water: 'kW' };

export type SizingMethod = 'air' | 'water';

/** The limits of one network, keyed by its start stamp and start port (auto-routing-r5.md §12.2). */
export interface NetworkSizingEntry {
  startStampId: string;
  startPortId: string;
  /** settings.method must equal the sizingMethod of the network type. */
  settings: SizingSettings;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isPositiveNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The settings without a bad value, or undefined. */
export function parseSizingSettings(raw: unknown): SizingSettings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { method, maxVelocityMs, maxPressureDropPaPerM, shape, maxAspectRatio, deltaTK, series } = raw as Record<string, unknown>;
  if (!isPositiveNumber(maxVelocityMs) || !isPositiveNumber(maxPressureDropPaPerM)) return undefined;
  if (method === 'water') {
    if (deltaTK !== undefined && !isPositiveNumber(deltaTK)) return undefined;
    const water: WaterSizing = { method, maxVelocityMs, maxPressureDropPaPerM };
    if (deltaTK !== undefined) water.deltaTK = deltaTK;
    return water;
  }
  if (method !== 'air') return undefined;
  if (shape !== 'round' && shape !== 'rectangular') return undefined;
  if (series !== 'standard' && series !== 'free') return undefined;
  if (maxAspectRatio !== undefined && !(typeof maxAspectRatio === 'number' && Number.isFinite(maxAspectRatio) && maxAspectRatio >= 1)) return undefined;
  const air: AirSizing = { method, maxVelocityMs, maxPressureDropPaPerM, shape, series };
  if (maxAspectRatio !== undefined) air.maxAspectRatio = maxAspectRatio;
  return air;
}

/** The entries that parse. A bad entry is dropped whole. The last entry for a pair wins. */
export function parseNetworkSizing(raw: unknown): NetworkSizingEntry[] {
  if (!Array.isArray(raw)) return [];
  let entries: NetworkSizingEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { startStampId, startPortId, settings } = item as Record<string, unknown>;
    if (!isNonEmptyString(startStampId) || !isNonEmptyString(startPortId)) continue;
    const clean = parseSizingSettings(settings);
    if (clean) entries = withNetworkSizing(entries, startStampId, startPortId, clean);
  }
  return entries;
}

export function findNetworkSizing(entries: readonly NetworkSizingEntry[], startStampId: string, startPortId: string): SizingSettings | undefined {
  return entries.find((entry) => entry.startStampId === startStampId && entry.startPortId === startPortId)?.settings;
}

/** A new array. `settings` undefined removes the entry. At most one entry for each pair. */
export function withNetworkSizing(entries: readonly NetworkSizingEntry[], startStampId: string, startPortId: string, settings: SizingSettings | undefined): NetworkSizingEntry[] {
  const kept = entries.filter((entry) => !(entry.startStampId === startStampId && entry.startPortId === startPortId));
  if (!settings) return kept;
  return [...kept, { startStampId, startPortId, settings: { ...settings } }];
}
