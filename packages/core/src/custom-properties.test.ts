import { describe, expect, it } from 'vitest';
import { isReservedCircuitPropertyName, isReservedPropertyName } from './custom-properties.js';

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
