import { describe, expect, it } from 'vitest';
import { isProjectUuid, makeProjectUuid, readProjectUuidFromJson } from './project-uuid.js';

const GOOD = '123e4567-e89b-42d3-a456-426614174000';

describe('isProjectUuid', () => {
  it('accepts lowercase UUID text', () => {
    expect(isProjectUuid(GOOD)).toBe(true);
  });
  it('rejects uppercase, wrong length and non-strings', () => {
    expect(isProjectUuid(GOOD.toUpperCase())).toBe(false);
    expect(isProjectUuid(GOOD.slice(1))).toBe(false);
    expect(isProjectUuid(`${GOOD}0`)).toBe(false);
    expect(isProjectUuid('')).toBe(false);
    expect(isProjectUuid(42)).toBe(false);
    expect(isProjectUuid(null)).toBe(false);
    expect(isProjectUuid(undefined)).toBe(false);
  });
});

describe('makeProjectUuid', () => {
  it('returns the value of random()', () => {
    expect(makeProjectUuid(() => GOOD)).toBe(GOOD);
  });
  it('throws when random() is not a UUID', () => {
    expect(() => makeProjectUuid(() => 'nope')).toThrow();
    expect(() => makeProjectUuid(() => GOOD.toUpperCase())).toThrow();
  });
});

describe('readProjectUuidFromJson', () => {
  it('reads the field', () => {
    expect(readProjectUuidFromJson(JSON.stringify({ schemaVersion: 22, projectUuid: GOOD }))).toBe(GOOD);
  });
  it('returns null for invalid JSON, missing field, bad field and non-objects', () => {
    expect(readProjectUuidFromJson('{not json')).toBeNull();
    expect(readProjectUuidFromJson('')).toBeNull();
    expect(readProjectUuidFromJson('{"schemaVersion":22}')).toBeNull();
    expect(readProjectUuidFromJson('{"projectUuid":"abc"}')).toBeNull();
    expect(readProjectUuidFromJson('{"projectUuid":5}')).toBeNull();
    expect(readProjectUuidFromJson('null')).toBeNull();
    expect(readProjectUuidFromJson('"text"')).toBeNull();
  });
});
