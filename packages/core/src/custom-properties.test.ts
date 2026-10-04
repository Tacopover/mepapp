import { describe, expect, it } from 'vitest';
import { coerceDefaultValue, isReservedCircuitPropertyName, isReservedPropertyName, parseDecimal } from './custom-properties.js';

describe('reserved property names', () => {
  it('reserves each scope\'s own built-in field labels, ignoring case and spaces around the name', () => {
    expect(isReservedPropertyName(' Capacity ')).toBe(true);
    expect(isReservedCircuitPropertyName(' Circuit Type ')).toBe(true);
    expect(isReservedCircuitPropertyName('Cross-section (mm²)')).toBe(true);
  });

  it('lets a name that is not a built-in field through', () => {
    expect(isReservedCircuitPropertyName('Room')).toBe(false);
    expect(isReservedPropertyName('Room')).toBe(false);
  });

  it('does not mix the two scopes', () => {
    expect(isReservedCircuitPropertyName('capacity')).toBe(false);
    expect(isReservedPropertyName('prefix')).toBe(false);
  });
});

describe('parseDecimal', () => {
  it('reads a decimal point or a Dutch decimal comma', () => {
    expect(parseDecimal('2.5')).toBe(2.5);
    expect(parseDecimal(' 2,5 ')).toBe(2.5);
    expect(parseDecimal('-0,75')).toBe(-0.75);
    expect(parseDecimal('12')).toBe(12);
  });

  it('gives null for empty, non-numeric or ambiguous text', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1.234,5')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });

  it('gives a numeric default typed with a comma its value, not 0', () => {
    expect(coerceDefaultValue({ name: 'Flow', kind: 'numeric', defaultValue: '1,5' })).toBe(1.5);
    expect(coerceDefaultValue({ name: 'Flow', kind: 'numeric', defaultValue: 'x' })).toBe(0);
  });
});
