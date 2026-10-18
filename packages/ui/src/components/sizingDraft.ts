import type { Discipline, FlowUnitId, NetworkType, SizingSettings } from '@mepapp/core';
import { flowUnitOf, SUGGESTED_AIR_SIZING, SUGGESTED_WATER_SIZING } from '@mepapp/core';

export type SizingMethodChoice = 'none' | 'air' | 'water';

export interface SizingDraft {
  flowUnit: FlowUnitId | '';
  method: SizingMethodChoice;
}

const parseNumber = (text: string): number => (text.trim() === '' ? NaN : Number(text));

const isPositive = (text: string): boolean => {
  const value = parseNumber(text);
  return Number.isFinite(value) && value > 0;
};

const isAspect = (text: string): boolean => {
  const value = parseNumber(text);
  return Number.isFinite(value) && value >= 1;
};

export const methodsForDiscipline = (discipline: Discipline): SizingMethodChoice[] => {
  if (discipline === 'ventilation') return ['none', 'air'];
  if (discipline === 'heatingAndCooling') return ['none', 'water'];
  return ['none'];
};

export function draftFromType(type: Pick<NetworkType, 'flowUnit' | 'sizingMethod'>): SizingDraft {
  return { flowUnit: type.flowUnit ?? '', method: type.sizingMethod ?? 'none' };
}

export function coerceMethod(draft: SizingDraft, discipline: Discipline): SizingDraft {
  return methodsForDiscipline(discipline).includes(draft.method) ? draft : { ...draft, method: 'none' };
}

export type ConvertPanel = 'none' | 'question' | 'kindWarning';

export function convertPanelOf(oldUnit: FlowUnitId | undefined, newUnit: FlowUnitId | '', convertible: number): ConvertPanel {
  if (oldUnit === undefined || newUnit === '' || oldUnit === newUnit || convertible === 0) return 'none';
  return flowUnitOf(oldUnit).kind !== flowUnitOf(newUnit).kind ? 'kindWarning' : 'question';
}

export function draftToPatch(draft: SizingDraft): { flowUnit: FlowUnitId | undefined; sizingMethod: 'air' | 'water' | undefined } {
  return {
    flowUnit: draft.flowUnit === '' ? undefined : draft.flowUnit,
    sizingMethod: draft.method === 'none' ? undefined : draft.method,
  };
}

export interface LimitsDraft {
  air: { maxVelocity: string; maxDrop: string; shape: 'round' | 'rectangular'; aspect: string; series: 'standard' | 'free' };
  water: { maxVelocity: string; maxDrop: string; deltaT: string };
}

export interface LimitsErrors {
  airMaxVelocity: boolean;
  airMaxDrop: boolean;
  airAspect: boolean;
  waterMaxVelocity: boolean;
  waterMaxDrop: boolean;
  waterDeltaT: boolean;
}

export const emptyLimitsDraft = (): LimitsDraft => ({
  air: { maxVelocity: '', maxDrop: '', shape: 'round', aspect: '', series: 'standard' },
  water: { maxVelocity: '', maxDrop: '', deltaT: '' },
});

export function limitsDraftFromSettings(settings: SizingSettings | null | undefined): LimitsDraft {
  const draft = emptyLimitsDraft();
  if (settings?.method === 'air') {
    draft.air = {
      maxVelocity: String(settings.maxVelocityMs),
      maxDrop: String(settings.maxPressureDropPaPerM),
      shape: settings.shape,
      aspect: settings.maxAspectRatio === undefined ? '' : String(settings.maxAspectRatio),
      series: settings.series,
    };
  } else if (settings?.method === 'water') {
    draft.water = {
      maxVelocity: String(settings.maxVelocityMs),
      maxDrop: String(settings.maxPressureDropPaPerM),
      deltaT: settings.deltaTK === undefined ? '' : String(settings.deltaTK),
    };
  }
  return draft;
}

export function suggestedLimitsDraft(method: 'air' | 'water'): LimitsDraft {
  const draft = emptyLimitsDraft();
  if (method === 'air') {
    draft.air = {
      maxVelocity: String(SUGGESTED_AIR_SIZING.maxVelocityMs),
      maxDrop: String(SUGGESTED_AIR_SIZING.maxPressureDropPaPerM),
      shape: SUGGESTED_AIR_SIZING.shape,
      aspect: String(SUGGESTED_AIR_SIZING.maxAspectRatio ?? ''),
      series: SUGGESTED_AIR_SIZING.series,
    };
  } else {
    draft.water = {
      maxVelocity: String(SUGGESTED_WATER_SIZING.maxVelocityMs),
      maxDrop: String(SUGGESTED_WATER_SIZING.maxPressureDropPaPerM),
      deltaT: '',
    };
  }
  return draft;
}

export function limitsErrors(draft: LimitsDraft, method: 'air' | 'water'): LimitsErrors {
  const { air, water } = draft;
  return {
    airMaxVelocity: method === 'air' && !isPositive(air.maxVelocity),
    airMaxDrop: method === 'air' && !isPositive(air.maxDrop),
    airAspect: method === 'air' && air.shape === 'rectangular' && air.aspect.trim() !== '' && !isAspect(air.aspect),
    waterMaxVelocity: method === 'water' && !isPositive(water.maxVelocity),
    waterMaxDrop: method === 'water' && !isPositive(water.maxDrop),
    waterDeltaT: method === 'water' && water.deltaT.trim() !== '' && !isPositive(water.deltaT),
  };
}

export function limitsToSettings(draft: LimitsDraft, method: 'air' | 'water'): SizingSettings | null {
  if (Object.values(limitsErrors(draft, method)).some(Boolean)) return null;
  if (method === 'air') {
    const { air } = draft;
    return {
      method: 'air',
      maxVelocityMs: parseNumber(air.maxVelocity),
      maxPressureDropPaPerM: parseNumber(air.maxDrop),
      shape: air.shape,
      series: air.series,
      ...(air.shape === 'rectangular' && isAspect(air.aspect) ? { maxAspectRatio: parseNumber(air.aspect) } : {}),
    };
  }
  const { water } = draft;
  return {
    method: 'water',
    maxVelocityMs: parseNumber(water.maxVelocity),
    maxPressureDropPaPerM: parseNumber(water.maxDrop),
    ...(water.deltaT.trim() !== '' ? { deltaTK: parseNumber(water.deltaT) } : {}),
  };
}
