import { describe, expect, it } from 'vitest';
import { classifyCapacityElements, resolveAutoPlaceCapacity } from './index.js';

describe('classifyCapacityElements', () => {
  it('counts an element with only the type as convertible', () => {
    expect(classifyCapacityElements('air', [{ id: 'a', typeIds: ['air'] }])).toEqual({ convertible: ['a'], mixed: [] });
  });

  it('counts an element with the type and another type as mixed', () => {
    expect(classifyCapacityElements('air', [{ id: 'a', typeIds: ['air', 'water'] }])).toEqual({ convertible: [], mixed: ['a'] });
  });

  it('skips an element without the type', () => {
    expect(classifyCapacityElements('air', [{ id: 'a', typeIds: ['water'] }, { id: 'b', typeIds: [] }])).toEqual({ convertible: [], mixed: [] });
  });

  it('counts a repeated type id once', () => {
    expect(classifyCapacityElements('air', [{ id: 'a', typeIds: ['air', 'air'] }]).convertible).toEqual(['a']);
  });

  it('treats a routed stamp and an unrouted stamp the same way', () => {
    // Segment types and routing target types are merged by the caller.
    const result = classifyCapacityElements('air', [
      { id: 'routed', typeIds: ['air'] },
      { id: 'unrouted', typeIds: ['air'] },
      { id: 'unroutedMixed', typeIds: ['air', 'return'] },
    ]);
    expect(result).toEqual({ convertible: ['routed', 'unrouted'], mixed: ['unroutedMixed'] });
  });
});

describe('resolveAutoPlaceCapacity', () => {
  it('converts to the unit of one target', () => {
    const result = resolveAutoPlaceCapacity(36, 'm³/h', ['dm³/s']);
    expect(result.unit).toBe('dm³/s');
    expect(result.value).toBeCloseTo(10, 6);
    expect(result.note).toBeUndefined();
  });

  it('converts when several targets agree', () => {
    const result = resolveAutoPlaceCapacity(36, 'm³/h', ['dm³/s', 'dm³/s']);
    expect(result.unit).toBe('dm³/s');
    expect(result.note).toBeUndefined();
  });

  it('ignores a target without a unit when the other targets agree', () => {
    const result = resolveAutoPlaceCapacity(36, 'm³/h', [undefined, 'dm³/s']);
    expect(result.unit).toBe('dm³/s');
    expect(result.note).toBeUndefined();
  });

  it('keeps the rule unit and notes it when no target has a unit', () => {
    expect(resolveAutoPlaceCapacity(36, 'm³/h', [undefined, undefined])).toEqual({ value: 36, unit: 'm³/h', note: 'noTargetUnit' });
  });

  it('keeps the rule unit and notes it when the target units differ', () => {
    expect(resolveAutoPlaceCapacity(36, 'm³/h', ['dm³/s', 'l/min'])).toEqual({ value: 36, unit: 'm³/h', note: 'targetUnitsDiffer' });
  });

  it('keeps the rule unit and notes it when the target unit is of another kind', () => {
    expect(resolveAutoPlaceCapacity(36, 'm³/h', ['kW'])).toEqual({ value: 36, unit: 'm³/h', note: 'unitKindDiffers' });
  });

  it('has no note for a stamp with no routing targets', () => {
    expect(resolveAutoPlaceCapacity(36, 'm³/h', [])).toEqual({ value: 36, unit: 'm³/h' });
  });

  it('keeps the value when the rule has no flow unit', () => {
    expect(resolveAutoPlaceCapacity(36, undefined, ['dm³/s'])).toEqual({ value: 36, unit: undefined });
    expect(resolveAutoPlaceCapacity(36, 'kg', ['dm³/s'])).toEqual({ value: 36, unit: undefined });
  });
});
