import { describe, expect, it } from 'vitest';
import type { NetworkType } from './network.js';
import { SUGGESTED_AIR_SIZING, SUGGESTED_FLOW_UNIT, SUGGESTED_WATER_SIZING, findNetworkSizing, parseNetworkSizing, parseSizingSettings, withNetworkSizing } from './sizing-settings.js';

describe('suggested sizing settings', () => {
  it('parse to themselves as new objects', () => {
    for (const suggested of [SUGGESTED_AIR_SIZING, SUGGESTED_WATER_SIZING]) {
      const parsed = parseSizingSettings(suggested);
      expect(parsed).toEqual(suggested);
      expect(parsed).not.toBe(suggested);
    }
  });

  it('gives the suggested flow units', () => {
    expect(SUGGESTED_FLOW_UNIT.air).toBe('dm³/s');
    expect(SUGGESTED_FLOW_UNIT.water).toBe('kW');
  });
});

describe('parseSizingSettings', () => {
  const water = { method: 'water', maxVelocityMs: 1, maxPressureDropPaPerM: 200 };
  const air = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'round', series: 'standard' };

  it('rejects a missing or unknown method', () => {
    expect(parseSizingSettings({ ...water, method: undefined })).toBeUndefined();
    expect(parseSizingSettings({ ...water, method: 'gas' })).toBeUndefined();
  });

  it('rejects a velocity or pressure drop that is not a positive finite number', () => {
    for (const bad of [0, -1, NaN, '8']) {
      expect(parseSizingSettings({ ...water, maxVelocityMs: bad })).toBeUndefined();
      expect(parseSizingSettings({ ...water, maxPressureDropPaPerM: bad })).toBeUndefined();
      expect(parseSizingSettings({ ...air, maxVelocityMs: bad })).toBeUndefined();
      expect(parseSizingSettings({ ...air, maxPressureDropPaPerM: bad })).toBeUndefined();
    }
  });

  it('checks maxAspectRatio when present and accepts it when absent', () => {
    expect(parseSizingSettings({ ...air, maxAspectRatio: 0.5 })).toBeUndefined();
    const parsed = parseSizingSettings(air);
    expect(parsed).toEqual(air);
    expect(parsed && 'maxAspectRatio' in parsed).toBe(false);
  });

  it('checks deltaTK when present and accepts it when absent', () => {
    expect(parseSizingSettings({ ...water, deltaTK: 0 })).toBeUndefined();
    const parsed = parseSizingSettings(water);
    expect(parsed).toEqual(water);
    expect(parsed && 'deltaTK' in parsed).toBe(false);
  });

  it('rejects a bad shape or series', () => {
    expect(parseSizingSettings({ ...air, shape: 'oval' })).toBeUndefined();
    expect(parseSizingSettings({ ...air, series: 'metric' })).toBeUndefined();
  });

  it('rejects null, arrays and strings', () => {
    expect(parseSizingSettings(null)).toBeUndefined();
    expect(parseSizingSettings([water])).toBeUndefined();
    expect(parseSizingSettings('water')).toBeUndefined();
  });

  it('drops unknown keys', () => {
    const parsed = parseSizingSettings({ ...water, extra: 1 });
    expect(parsed).toEqual(water);
    expect(parsed && 'extra' in parsed).toBe(false);
  });

  it('does not copy __proto__ or pollute Object.prototype', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":1},"method":"water","maxVelocityMs":1,"maxPressureDropPaPerM":200}');
    const parsed = parseSizingSettings(raw);
    expect(parsed).toEqual(water);
    expect(parsed && Object.prototype.hasOwnProperty.call(parsed, 'polluted')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('NetworkType sizing fields', () => {
  const base: NetworkType = {
    id: 'supply',
    name: 'Supply air',
    discipline: 'ventilation',
    units: 'dm³/s',
    defaultCapacity: 0,
    color: '#2196f3',
    lineWidthPt: 1,
    linePattern: 'solid',
  };

  it('accepts a NetworkType with both sizing fields and one with neither', () => {
    const sized: NetworkType = { ...base, flowUnit: 'dm³/s', sizing: SUGGESTED_AIR_SIZING };
    const plain: NetworkType = base;
    expect(sized.sizing).toEqual(SUGGESTED_AIR_SIZING);
    expect(plain.flowUnit).toBeUndefined();
  });
});

describe('network sizing entries', () => {
  const entry = { startStampId: 'ahu', startPortId: 'out', settings: SUGGESTED_AIR_SIZING };

  it('finds the limits of a pair and nothing for another pair', () => {
    expect(findNetworkSizing([entry], 'ahu', 'out')).toEqual(SUGGESTED_AIR_SIZING);
    expect(findNetworkSizing([entry], 'ahu', 'in')).toBeUndefined();
    expect(findNetworkSizing([entry], 'ahu2', 'out')).toBeUndefined();
  });

  it('adds, replaces and removes an entry without changing the input', () => {
    const empty: never[] = [];
    const one = withNetworkSizing(empty, 'ahu', 'out', SUGGESTED_AIR_SIZING);
    expect(empty).toEqual([]);
    expect(one).toHaveLength(1);
    expect(one[0]!.settings).toEqual(SUGGESTED_AIR_SIZING);
    expect(one[0]!.settings).not.toBe(SUGGESTED_AIR_SIZING);
    const replaced = withNetworkSizing(one, 'ahu', 'out', SUGGESTED_WATER_SIZING);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]!.settings).toEqual(SUGGESTED_WATER_SIZING);
    expect(one[0]!.settings).toEqual(SUGGESTED_AIR_SIZING);
    expect(withNetworkSizing(one, 'ahu', 'out', undefined)).toEqual([]);
    expect(one).toHaveLength(1);
  });

  it('parses good entries, drops a bad entry whole and keeps the last of a pair', () => {
    const bad = { startStampId: 5, startPortId: '', settings: { method: 'air' } };
    const later = { startStampId: 'ahu', startPortId: 'out', settings: SUGGESTED_WATER_SIZING };
    const other = { startStampId: 'fcu', startPortId: 'in', settings: SUGGESTED_WATER_SIZING };
    expect(parseNetworkSizing([bad, entry, other])).toEqual([entry, other]);
    expect(parseNetworkSizing([entry, later])).toEqual([later]);
    const parsed = parseNetworkSizing([entry]);
    expect(parsed[0]!.settings).not.toBe(SUGGESTED_AIR_SIZING);
  });

  it('gives an empty list for a value that is not an array', () => {
    for (const raw of ['x', null, {}, undefined, 3]) expect(parseNetworkSizing(raw)).toEqual([]);
  });

  it('does not pollute the prototype through __proto__', () => {
    const raw = JSON.parse('[{"startStampId":"__proto__","startPortId":"polluted","settings":{"method":"water","maxVelocityMs":1,"maxPressureDropPaPerM":2,"__proto__":{"polluted":true}}}]');
    const parsed = parseNetworkSizing(raw);
    expect(parsed).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((parsed[0]!.settings as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
});
