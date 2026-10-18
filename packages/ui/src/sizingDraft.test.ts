import { describe, expect, it } from 'vitest';
import type { Discipline, NetworkType } from '@mepapp/core';
import {
  coerceMethod, draftErrors, draftFromType, draftHasErrors, draftToPatch, methodsForDiscipline, type SizingDraft,
} from './components/sizingDraft.js';

const airDraft = (patch: Partial<SizingDraft['air']> = {}): SizingDraft => ({
  flowUnit: '',
  method: 'air',
  air: { maxVelocity: '5', maxDrop: '1', shape: 'round', aspect: '', series: 'standard', ...patch },
  water: { maxVelocity: '', maxDrop: '', deltaT: '' },
});

const waterDraft = (patch: Partial<SizingDraft['water']> = {}): SizingDraft => ({
  flowUnit: '',
  method: 'water',
  air: { maxVelocity: '', maxDrop: '', shape: 'round', aspect: '', series: 'standard' },
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
  it('starts empty for a type without sizing', () => {
    expect(draftFromType({})).toEqual({
      flowUnit: '',
      method: 'none',
      air: { maxVelocity: '', maxDrop: '', shape: 'round', aspect: '', series: 'standard' },
      water: { maxVelocity: '', maxDrop: '', deltaT: '' },
    });
  });

  it('reads a round air type', () => {
    const draft = draftFromType({
      flowUnit: 'dm³/s',
      sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', series: 'standard' },
    });
    expect(draft.flowUnit).toBe('dm³/s');
    expect(draft.method).toBe('air');
    expect(draft.air).toEqual({ maxVelocity: '5', maxDrop: '1', shape: 'round', aspect: '', series: 'standard' });
  });

  it('reads a rectangular air type with aspect 3', () => {
    const draft = draftFromType({
      sizing: { method: 'air', maxVelocityMs: 6, maxPressureDropPaPerM: 0.8, shape: 'rectangular', maxAspectRatio: 3, series: 'free' },
    });
    expect(draft.air).toEqual({ maxVelocity: '6', maxDrop: '0.8', shape: 'rectangular', aspect: '3', series: 'free' });
  });

  it('reads a water type with deltaTK 10', () => {
    const draft = draftFromType({
      sizing: { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200, deltaTK: 10 },
    });
    expect(draft.method).toBe('water');
    expect(draft.water).toEqual({ maxVelocity: '1', maxDrop: '200', deltaT: '10' });
  });

  it('reads a water type without deltaTK', () => {
    const draft = draftFromType({ sizing: { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200 } });
    expect(draft.water.deltaT).toBe('');
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

  it('sets a stored air sizing to none on plumbing', () => {
    const draft = draftFromType({
      sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', series: 'standard' },
    });
    expect(coerceMethod(draft, 'plumbing').method).toBe('none');
  });
});

describe('draftErrors', () => {
  it.each(['0', '-3', '', 'abc', 'NaN'])('flags the velocity %j', (value) => {
    expect(draftErrors(airDraft({ maxVelocity: value })).airMaxVelocity).toBe(true);
  });

  it('accepts the velocity 1e3', () => {
    expect(draftErrors(airDraft({ maxVelocity: '1e3' })).airMaxVelocity).toBe(false);
  });

  it('flags an aspect of 0.5 on a rectangular draft', () => {
    expect(draftErrors(airDraft({ shape: 'rectangular', aspect: '0.5' })).airAspect).toBe(true);
  });

  it('accepts an empty aspect on a round draft', () => {
    expect(draftErrors(airDraft({ shape: 'round', aspect: '' })).airAspect).toBe(false);
  });

  it('accepts an empty aspect on a rectangular draft', () => {
    expect(draftErrors(airDraft({ shape: 'rectangular', aspect: '' })).airAspect).toBe(false);
  });

  it('accepts an empty deltaT', () => {
    expect(draftErrors(waterDraft({ deltaT: '' })).waterDeltaT).toBe(false);
  });

  it('flags a deltaT of 0 and of -1', () => {
    expect(draftErrors(waterDraft({ deltaT: '0' })).waterDeltaT).toBe(true);
    expect(draftErrors(waterDraft({ deltaT: '-1' })).waterDeltaT).toBe(true);
  });

  it('reports no error for the fields of the unchosen method', () => {
    const errors = draftErrors({ ...airDraft({ maxVelocity: '', maxDrop: '', shape: 'rectangular', aspect: '' }), method: 'water' });
    expect(errors.airMaxVelocity).toBe(false);
    expect(errors.airMaxDrop).toBe(false);
    expect(errors.airAspect).toBe(false);
    expect(errors.waterMaxVelocity).toBe(true);
    expect(draftHasErrors(errors)).toBe(true);
  });
});

describe('draftToPatch', () => {
  const roundAir: Pick<NetworkType, 'flowUnit' | 'sizing'> = {
    flowUnit: 'dm³/s',
    sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', series: 'standard' },
  };
  const rectAir: Pick<NetworkType, 'flowUnit' | 'sizing'> = {
    flowUnit: 'm³/h',
    sizing: { method: 'air', maxVelocityMs: 6, maxPressureDropPaPerM: 0.8, shape: 'rectangular', maxAspectRatio: 3, series: 'free' },
  };
  const waterNoDelta: Pick<NetworkType, 'flowUnit' | 'sizing'> = {
    flowUnit: 'kW',
    sizing: { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200 },
  };
  const waterDelta: Pick<NetworkType, 'flowUnit' | 'sizing'> = {
    flowUnit: 'kW',
    sizing: { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200, deltaTK: 10 },
  };
  const empty: Pick<NetworkType, 'flowUnit' | 'sizing'> = {};

  it.each([
    ['air round', roundAir],
    ['air rectangular', rectAir],
    ['water without deltaT', waterNoDelta],
    ['water with deltaT', waterDelta],
    ['empty', empty],
  ])('round trips %s', (_name, type) => {
    expect(draftToPatch(draftFromType(type))).toEqual({ flowUnit: type.flowUnit, sizing: type.sizing });
  });

  it('gives an undefined flow unit for unit ""', () => {
    expect(draftToPatch(airDraft()).flowUnit).toBeUndefined();
  });

  it('drops maxAspectRatio for a round shape', () => {
    const patch = draftToPatch(draftFromType({
      sizing: { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', maxAspectRatio: 3, series: 'standard' },
    }));
    expect(patch.sizing).toEqual({ method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', series: 'standard' });
    expect(patch.sizing).not.toHaveProperty('maxAspectRatio');
  });

  it('drops maxAspectRatio for a rectangular shape with an empty aspect', () => {
    const patch = draftToPatch(airDraft({ shape: 'rectangular', aspect: '' }));
    expect(patch.sizing).not.toHaveProperty('maxAspectRatio');
  });

  it('keeps the sizing key with an undefined value for method none', () => {
    const patch = draftToPatch({ ...airDraft(), method: 'none' });
    expect('sizing' in patch).toBe(true);
    expect(patch.sizing).toBeUndefined();
  });
});
