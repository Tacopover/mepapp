import { describe, expect, it } from 'vitest';
import { ensureProjectUuid, isProjectUuid, makeProjectUuid, readProjectUuidFromJson, wantsNewProjectUuid } from './project-uuid.js';

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

describe('ensureProjectUuid', () => {
  it('keeps an existing id and does not call random()', () => {
    let calls = 0;
    expect(
      ensureProjectUuid(GOOD, () => {
        calls++;
        return GOOD;
      }),
    ).toBe(GOOD);
    expect(calls).toBe(0);
  });
  it('mints an id with random() when the id is null', () => {
    let calls = 0;
    expect(
      ensureProjectUuid(null, () => {
        calls++;
        return GOOD;
      }),
    ).toBe(GOOD);
    expect(calls).toBe(1);
  });
});

describe('wantsNewProjectUuid', () => {
  it('is true only for Save As on a document that has a file target', () => {
    expect(wantsNewProjectUuid(true, true)).toBe(true);
    expect(wantsNewProjectUuid(true, false)).toBe(false);
    expect(wantsNewProjectUuid(false, true)).toBe(false);
    expect(wantsNewProjectUuid(false, false)).toBe(false);
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
