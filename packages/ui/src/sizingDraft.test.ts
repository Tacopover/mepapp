import { describe, expect, it } from 'vitest';
import type { Discipline, SizingSettings } from '@mepapp/core';
import { SUGGESTED_AIR_SIZING, SUGGESTED_WATER_SIZING } from '@mepapp/core';
import {
  coerceMethod, convertPanelOf, draftFromType, draftToPatch, emptyLimitsDraft, limitsDraftFromSettings,
  limitsErrors, limitsToSettings, methodsForDiscipline, suggestedLimitsDraft, type LimitsDraft, type SizingDraft,
} from './components/sizingDraft.js';

const airDraft = (): SizingDraft => ({ flowUnit: '', method: 'air' });

const waterDraft = (): SizingDraft => ({ flowUnit: '', method: 'water' });

const airLimits = (patch: Partial<LimitsDraft['air']> = {}): LimitsDraft => ({
  ...emptyLimitsDraft(),
  air: { maxVelocity: '5', maxDrop: '1', shape: 'round', aspect: '', series: 'standard', ...patch },
});

const waterLimits = (patch: Partial<LimitsDraft['water']> = {}): LimitsDraft => ({
  ...emptyLimitsDraft(),
  water: { maxVelocity: '1', maxDrop: '200', deltaT: '', ...patch },
});

describe('methodsForDiscipline', () => {
  it('offers air for ventilation, water for heating and cooling, and nothing else', () => {
    const expected: Record<Discipline, string[]> = {
      heatingAndCooling: ['none', 'water'],
      ventilation: ['none', 'air'],
      plumbing: ['none'],
      fireProtection: ['none'],
      electrical: ['none'],
      other: ['none'],
    };
    for (const discipline of Object.keys(expected) as Discipline[]) {
      expect(methodsForDiscipline(discipline)).toEqual(expected[discipline]);
    }
  });
});

describe('draftFromType', () => {
  it('starts empty for a type without a flow unit or a method', () => {
    expect(draftFromType({})).toEqual({ flowUnit: '', method: 'none' });
  });

  it('reads an air type', () => {
    expect(draftFromType({ flowUnit: 'dm³/s', sizingMethod: 'air' })).toEqual({ flowUnit: 'dm³/s', method: 'air' });
  });

  it('reads a water type', () => {
    expect(draftFromType({ flowUnit: 'kW', sizingMethod: 'water' })).toEqual({ flowUnit: 'kW', method: 'water' });
  });
});

describe('coerceMethod', () => {
  it('sets air to none on plumbing', () => {
    expect(coerceMethod(airDraft(), 'plumbing').method).toBe('none');
  });

  it('keeps air on ventilation', () => {
    expect(coerceMethod(airDraft(), 'ventilation')).toEqual(airDraft());
  });

  it('sets water to none on ventilation', () => {
    expect(coerceMethod(waterDraft(), 'ventilation').method).toBe('none');
  });

  it('sets a stored air method to none on plumbing', () => {
    const draft = draftFromType({ sizingMethod: 'air' });
    expect(coerceMethod(draft, 'plumbing').method).toBe('none');
  });
});

describe('limitsErrors', () => {
  it.each(['0', '-3', '', 'abc', 'NaN'])('flags the velocity %j', (value) => {
    expect(limitsErrors(airLimits({ maxVelocity: value }), 'air').airMaxVelocity).toBe(true);
  });

  it('accepts the velocity 1e3', () => {
    expect(limitsErrors(airLimits({ maxVelocity: '1e3' }), 'air').airMaxVelocity).toBe(false);
  });

  it('flags an aspect of 0.5 on a rectangular draft', () => {
    expect(limitsErrors(airLimits({ shape: 'rectangular', aspect: '0.5' }), 'air').airAspect).toBe(true);
  });

  it('accepts an empty aspect on a round draft', () => {
    expect(limitsErrors(airLimits({ shape: 'round', aspect: '' }), 'air').airAspect).toBe(false);
  });

  it('accepts an empty aspect on a rectangular draft', () => {
    expect(limitsErrors(airLimits({ shape: 'rectangular', aspect: '' }), 'air').airAspect).toBe(false);
  });

  it('accepts an empty deltaT', () => {
    expect(limitsErrors(waterLimits({ deltaT: '' }), 'water').waterDeltaT).toBe(false);
  });

  it('flags a deltaT of 0 and of -1', () => {
    expect(limitsErrors(waterLimits({ deltaT: '0' }), 'water').waterDeltaT).toBe(true);
    expect(limitsErrors(waterLimits({ deltaT: '-1' }), 'water').waterDeltaT).toBe(true);
  });

  it('reports no error for the fields of the unchosen method', () => {
    const errors = limitsErrors(airLimits({ maxVelocity: '', maxDrop: '', shape: 'rectangular', aspect: '' }), 'water');
    expect(errors.airMaxVelocity).toBe(false);
    expect(errors.airMaxDrop).toBe(false);
    expect(errors.airAspect).toBe(false);
    expect(errors.waterMaxVelocity).toBe(true);
  });
});

describe('suggestedLimitsDraft', () => {
  it('fills the air fields with the suggested values and leaves the water fields empty', () => {
    const draft = suggestedLimitsDraft('air');
    expect(draft.air).toEqual({ maxVelocity: '5', maxDrop: '1', shape: 'round', aspect: '4', series: 'standard' });
    expect(draft.water).toEqual(emptyLimitsDraft().water);
  });

  it('fills the water fields, leaves deltaT empty and leaves the air fields empty', () => {
    const draft = suggestedLimitsDraft('water');
    expect(draft.water).toEqual({ maxVelocity: '1', maxDrop: '200', deltaT: '' });
    expect(draft.air).toEqual(emptyLimitsDraft().air);
  });
});

describe('draftToPatch', () => {
  it('gives the flow unit and the method air', () => {
    expect(draftToPatch({ flowUnit: 'dm³/s', method: 'air' })).toEqual({ flowUnit: 'dm³/s', sizingMethod: 'air' });
  });

  it('gives the flow unit and the method water', () => {
    expect(draftToPatch({ flowUnit: 'kW', method: 'water' })).toEqual({ flowUnit: 'kW', sizingMethod: 'water' });
  });

  it.each([
    ['air', { flowUnit: 'dm³/s', sizingMethod: 'air' }],
    ['water', { flowUnit: 'kW', sizingMethod: 'water' }],
    ['empty', {}],
  ] as const)('round trips %s', (_name, type) => {
    const patch = draftToPatch(draftFromType(type));
    expect(patch.flowUnit).toBe((type as { flowUnit?: string }).flowUnit);
    expect(patch.sizingMethod).toBe((type as { sizingMethod?: string }).sizingMethod);
  });

  it('gives an undefined flow unit for unit ""', () => {
    expect(draftToPatch(airDraft()).flowUnit).toBeUndefined();
  });

  it('keeps the sizingMethod key with an undefined value for method none', () => {
    const patch = draftToPatch({ flowUnit: 'kW', method: 'none' });
    expect('sizingMethod' in patch).toBe(true);
    expect(patch.sizingMethod).toBeUndefined();
  });
});


describe('limits draft', () => {
  const air = (patch: Partial<LimitsDraft['air']> = {}): LimitsDraft => ({ ...emptyLimitsDraft(), air: { ...suggestedLimitsDraft('air').air, ...patch } });
  const water = (patch: Partial<LimitsDraft['water']> = {}): LimitsDraft => ({ ...emptyLimitsDraft(), water: { ...suggestedLimitsDraft('water').water, ...patch } });

  it('starts empty', () => {
    const empty = emptyLimitsDraft();
    expect(empty.air).toEqual({ maxVelocity: '', maxDrop: '', shape: 'round', aspect: '', series: 'standard' });
    expect(empty.water).toEqual({ maxVelocity: '', maxDrop: '', deltaT: '' });
    expect(limitsDraftFromSettings(undefined)).toEqual(empty);
    expect(limitsDraftFromSettings(null)).toEqual(empty);
  });

  it('turns the suggested air draft into the suggested air values (a round shape drops the aspect)', () => {
    const { maxAspectRatio: _aspect, ...expected } = SUGGESTED_AIR_SIZING;
    expect(limitsToSettings(suggestedLimitsDraft('air'), 'air')).toEqual(expected);
    expect(limitsToSettings(air({ shape: 'rectangular' }), 'air')).toEqual({ ...SUGGESTED_AIR_SIZING, shape: 'rectangular' });
  });

  it('turns the suggested water draft into the suggested water values, with an empty delta T', () => {
    expect(suggestedLimitsDraft('water').water.deltaT).toBe('');
    expect(limitsToSettings(suggestedLimitsDraft('water'), 'water')).toEqual(SUGGESTED_WATER_SIZING);
  });

  it('gives null for an empty, zero, negative or non-numeric required field', () => {
    for (const text of ['', '0', '-1', 'abc']) {
      expect(limitsToSettings(air({ maxVelocity: text }), 'air'), text).toBeNull();
      expect(limitsToSettings(air({ maxDrop: text }), 'air'), text).toBeNull();
      expect(limitsToSettings(water({ maxVelocity: text }), 'water'), text).toBeNull();
      expect(limitsToSettings(water({ maxDrop: text }), 'water'), text).toBeNull();
    }
    expect(limitsToSettings(emptyLimitsDraft(), 'air')).toBeNull();
    expect(limitsToSettings(emptyLimitsDraft(), 'water')).toBeNull();
  });

  it('gives null for a rectangular aspect below 1', () => {
    expect(limitsToSettings(air({ shape: 'rectangular', aspect: '0.5' }), 'air')).toBeNull();
    expect(limitsErrors(air({ shape: 'rectangular', aspect: '0.5' }), 'air').airAspect).toBe(true);
  });

  it('writes deltaTK only when the delta T is filled', () => {
    expect(limitsToSettings(water(), 'water')).not.toHaveProperty('deltaTK');
    expect(limitsToSettings(water({ deltaT: '10' }), 'water')).toMatchObject({ deltaTK: 10 });
    expect(limitsToSettings(water({ deltaT: '0' }), 'water')).toBeNull();
  });

  it('reports an error for each empty required field', () => {
    const errors = limitsErrors(emptyLimitsDraft(), 'air');
    expect(errors).toEqual({ airMaxVelocity: true, airMaxDrop: true, airAspect: false, waterMaxVelocity: false, waterMaxDrop: false, waterDeltaT: false });
    expect(limitsErrors(emptyLimitsDraft(), 'water')).toMatchObject({ waterMaxVelocity: true, waterMaxDrop: true, airMaxVelocity: false });
  });

  it('round trips settings to a draft and back', () => {
    const rectAir: SizingSettings = { method: 'air', maxVelocityMs: 6, maxPressureDropPaPerM: 0.8, shape: 'rectangular', maxAspectRatio: 3, series: 'free' };
    const waterDelta: SizingSettings = { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200, deltaTK: 10 };
    expect(limitsToSettings(limitsDraftFromSettings(rectAir), 'air')).toEqual(rectAir);
    expect(limitsToSettings(limitsDraftFromSettings(SUGGESTED_WATER_SIZING), 'water')).toEqual(SUGGESTED_WATER_SIZING);
    expect(limitsToSettings(limitsDraftFromSettings(waterDelta), 'water')).toEqual(waterDelta);
  });

  it('gives null only for the first of the drafts typed one character at a time', () => {
    const typed = ['', '7', '70'].map((text) => limitsToSettings(air({ maxVelocity: text }), 'air'));
    expect(typed[0]).toBeNull();
    expect(typed[1]).toMatchObject({ maxVelocityMs: 7 });
    expect(typed[2]).toMatchObject({ maxVelocityMs: 70 });
  });
});

describe('convertPanelOf', () => {
  it('shows no panel when nothing needs converting', () => {
    expect(convertPanelOf(undefined, 'm³/h', 2)).toBe('none');
    expect(convertPanelOf('m³/h', '', 2)).toBe('none');
    expect(convertPanelOf('m³/h', 'm³/h', 2)).toBe('none');
    expect(convertPanelOf('m³/h', 'dm³/s', 0)).toBe('none');
  });

  it('asks a question for the same kind and warns for a different kind', () => {
    expect(convertPanelOf('m³/h', 'dm³/s', 2)).toBe('question');
    expect(convertPanelOf('m³/h', 'kW', 2)).toBe('kindWarning');
    expect(convertPanelOf('kW', 'W', 1)).toBe('question');
  });
});
