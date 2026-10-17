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
