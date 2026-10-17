import { describe, expect, it } from 'vitest';
import { convertFlow, FLOW_UNITS, flowUnitOf, isFlowUnitId, toBaseFlow, type FlowUnitId } from './index.js';

describe('FLOW_UNITS', () => {
  it('lists every id once', () => {
    const ids = FLOW_UNITS.map((unit) => unit.id);
    expect(ids).toEqual(['dm³/s', 'l/s', 'm³/s', 'm³/h', 'cfm', 'l/min', 'US gpm', 'W', 'kW']);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isFlowUnitId', () => {
  it('accepts every id', () => {
    for (const unit of FLOW_UNITS) expect(isFlowUnitId(unit.id)).toBe(true);
  });

  it('rejects other values', () => {
    for (const value of ['kg', '', null, 42, 'toString', '__proto__']) expect(isFlowUnitId(value)).toBe(false);
  });
});

describe('convertFlow', () => {
  it('converts cfm to dm³/s', () => {
    expect(convertFlow(1, 'cfm', 'dm³/s')).toBeCloseTo(0.47195, 4);
  });

  it('converts m³/h to l/s', () => {
    expect(convertFlow(1, 'm³/h', 'l/s')).toBeCloseTo(0.27778, 5);
  });

  it('converts dm³/s to l/s exactly', () => {
    expect(convertFlow(1, 'dm³/s', 'l/s')).toBe(1);
  });

  it('converts US gpm to l/min', () => {
    expect(convertFlow(1, 'US gpm', 'l/min')).toBeCloseTo(3.7854, 4);
  });

  it('converts kW to W', () => {
    expect(convertFlow(1, 'kW', 'W')).toBe(1000);
  });

  it('returns null across kinds', () => {
    expect(convertFlow(1, 'W', 'dm³/s')).toBeNull();
  });

  it('returns the start value after a round trip', () => {
    const start = 123.456;
    const there = convertFlow(start, 'cfm', 'US gpm') as number;
    const back = convertFlow(there, 'US gpm', 'cfm') as number;
    expect(Math.abs(back - start) / start).toBeLessThan(1e-12);
  });
});

describe('toBaseFlow', () => {
  it('gives m³/s for a volume unit', () => {
    expect(toBaseFlow(3.6, 'm³/h')).toBeCloseTo(0.001, 10);
  });
});

describe('flowUnitOf', () => {
  it('returns the unit with the id', () => {
    const id: FlowUnitId = 'kW';
    expect(flowUnitOf(id)).toEqual({ id: 'kW', kind: 'power', base: 1000 });
  });
});
