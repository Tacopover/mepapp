import type { Discipline, FlowUnitId, NetworkType, SizingSettings } from '@mepapp/core';
import { flowUnitOf, SUGGESTED_AIR_SIZING, SUGGESTED_FLOW_UNIT, SUGGESTED_WATER_SIZING } from '@mepapp/core';

export type SizingMethodChoice = 'none' | 'air' | 'water';

export interface SizingDraft {
  flowUnit: FlowUnitId | '';
  method: SizingMethodChoice;
  air: { maxVelocity: string; maxDrop: string; shape: 'round' | 'rectangular'; aspect: string; series: 'standard' | 'free' };
  water: { maxVelocity: string; maxDrop: string; deltaT: string };
}

export interface DraftErrors {
  airMaxVelocity: boolean;
  airMaxDrop: boolean;
  airAspect: boolean;
  waterMaxVelocity: boolean;
  waterMaxDrop: boolean;
  waterDeltaT: boolean;
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

export function draftFromType(type: Pick<NetworkType, 'flowUnit' | 'sizing'>): SizingDraft {
  const { sizing } = type;
  const draft: SizingDraft = {
    flowUnit: type.flowUnit ?? '',
    method: 'none',
    air: { maxVelocity: '', maxDrop: '', shape: 'round', aspect: '', series: 'standard' },
    water: { maxVelocity: '', maxDrop: '', deltaT: '' },
  };
  if (sizing?.method === 'air') {
    draft.method = 'air';
    draft.air = {
      maxVelocity: String(sizing.maxVelocityMs),
      maxDrop: String(sizing.maxPressureDropPaPerM),
      shape: sizing.shape,
      aspect: sizing.maxAspectRatio === undefined ? '' : String(sizing.maxAspectRatio),
      series: sizing.series,
    };
  } else if (sizing?.method === 'water') {
    draft.method = 'water';
    draft.water = {
      maxVelocity: String(sizing.maxVelocityMs),
      maxDrop: String(sizing.maxPressureDropPaPerM),
      deltaT: sizing.deltaTK === undefined ? '' : String(sizing.deltaTK),
    };
  }
  return draft;
}

export function applySuggested(draft: SizingDraft, method: 'air' | 'water'): SizingDraft {
  if (method === 'air') {
    return {
      ...draft,
      flowUnit: SUGGESTED_FLOW_UNIT.air,
      air: {
        maxVelocity: String(SUGGESTED_AIR_SIZING.maxVelocityMs),
        maxDrop: String(SUGGESTED_AIR_SIZING.maxPressureDropPaPerM),
        shape: SUGGESTED_AIR_SIZING.shape,
        aspect: String(SUGGESTED_AIR_SIZING.maxAspectRatio ?? ''),
        series: SUGGESTED_AIR_SIZING.series,
      },
    };
  }
  return {
    ...draft,
    flowUnit: SUGGESTED_FLOW_UNIT.water,
    water: {
      maxVelocity: String(SUGGESTED_WATER_SIZING.maxVelocityMs),
      maxDrop: String(SUGGESTED_WATER_SIZING.maxPressureDropPaPerM),
      deltaT: '',
    },
  };
}

export function coerceMethod(draft: SizingDraft, discipline: Discipline): SizingDraft {
  return methodsForDiscipline(discipline).includes(draft.method) ? draft : { ...draft, method: 'none' };
}

export function draftErrors(draft: SizingDraft): DraftErrors {
  const { method, air, water } = draft;
  return {
    airMaxVelocity: method === 'air' && !isPositive(air.maxVelocity),
    airMaxDrop: method === 'air' && !isPositive(air.maxDrop),
    airAspect: method === 'air' && air.shape === 'rectangular' && air.aspect.trim() !== '' && !isAspect(air.aspect),
    waterMaxVelocity: method === 'water' && !isPositive(water.maxVelocity),
    waterMaxDrop: method === 'water' && !isPositive(water.maxDrop),
    waterDeltaT: method === 'water' && water.deltaT.trim() !== '' && !isPositive(water.deltaT),
  };
}

export const draftHasErrors = (errors: DraftErrors): boolean => Object.values(errors).some(Boolean);

export type ConvertPanel = 'none' | 'question' | 'kindWarning';

export function convertPanelOf(oldUnit: FlowUnitId | undefined, newUnit: FlowUnitId | '', convertible: number): ConvertPanel {
  if (oldUnit === undefined || newUnit === '' || oldUnit === newUnit || convertible === 0) return 'none';
  return flowUnitOf(oldUnit).kind !== flowUnitOf(newUnit).kind ? 'kindWarning' : 'question';
}

export function draftToPatch(draft: SizingDraft): { flowUnit: FlowUnitId | undefined; sizing: SizingSettings | undefined } {
  const flowUnit = draft.flowUnit === '' ? undefined : draft.flowUnit;
  if (draft.method === 'air') {
    const { air } = draft;
    return {
      flowUnit,
      sizing: {
        method: 'air',
        maxVelocityMs: parseNumber(air.maxVelocity),
        maxPressureDropPaPerM: parseNumber(air.maxDrop),
        shape: air.shape,
        series: air.series,
        ...(air.shape === 'rectangular' && isAspect(air.aspect) ? { maxAspectRatio: parseNumber(air.aspect) } : {}),
      },
    };
  }
  if (draft.method === 'water') {
    const { water } = draft;
    return {
      flowUnit,
      sizing: {
        method: 'water',
        maxVelocityMs: parseNumber(water.maxVelocity),
        maxPressureDropPaPerM: parseNumber(water.maxDrop),
        ...(water.deltaT.trim() !== '' ? { deltaTK: parseNumber(water.deltaT) } : {}),
      },
    };
  }
  return { flowUnit, sizing: undefined };
}
