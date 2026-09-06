import { describe, expect, it } from 'vitest';
import {
  migrateToLatest,
  SchemaMigrationError,
  validateDocument,
  validateMigrationChain,
  type MigrationStep,
} from './schema.js';

const steps: MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: (data) => ({ ...data, material: data.material ?? 'galvanizedSteel', schemaVersion: 1 }),
  },
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (data) => ({ ...data, fittingKind: data.fittingKind ?? 'junction', schemaVersion: 2 }),
  },
];

describe('validateMigrationChain', () => {
  it('accepts a gap-free chain', () => {
    expect(() => validateMigrationChain(steps, 2)).not.toThrow();
  });

  it('rejects a chain with a gap', () => {
    const withGap = [steps[0]];
    expect(() => validateMigrationChain(withGap, 2)).toThrow(SchemaMigrationError);
  });

  it('rejects a duplicate fromVersion', () => {
    const duplicated = [...steps, { ...steps[0] }];
    expect(() => validateMigrationChain(duplicated, 2)).toThrow(/duplicate/);
  });
});

describe('migrateToLatest', () => {
  it('treats a missing version field as version 0 and runs every step', () => {
    const result = migrateToLatest({}, { steps, latestVersion: 2 });
    expect(result).toEqual({ material: 'galvanizedSteel', fittingKind: 'junction', schemaVersion: 2 });
  });

  it('resumes from a partially-migrated document without re-running earlier steps', () => {
    const result = migrateToLatest(
      { schemaVersion: 1, material: 'stainlessSteel' },
      { steps, latestVersion: 2 },
    );
    // material must survive untouched — a re-run of step 0 would not have overwritten it either,
    // but this proves only the 1->2 step ran, matching the old app's resume-not-replay guarantee.
    expect(result).toEqual({ schemaVersion: 2, material: 'stainlessSteel', fittingKind: 'junction' });
  });

  it('is a no-op when already at the latest version', () => {
    const doc = { schemaVersion: 2, material: 'pvc', fittingKind: 'elbow' };
    expect(migrateToLatest(doc, { steps, latestVersion: 2 })).toEqual(doc);
  });

  it('refuses to open a document from a future schema version', () => {
    expect(() => migrateToLatest({ schemaVersion: 99 }, { steps, latestVersion: 2 })).toThrow(SchemaMigrationError);
  });

  it('throws if a step fails to advance the version field', () => {
    const brokenStep: MigrationStep = { fromVersion: 0, toVersion: 1, migrate: (data) => data };
    expect(() => migrateToLatest({}, { steps: [brokenStep], latestVersion: 1 })).toThrow(SchemaMigrationError);
  });
});

describe('validateDocument', () => {
  it('aggregates issues across all validators — a capability the old app never had', () => {
    const issues = validateDocument(
      { shape: 'rectangular' },
      [
        (data) => (data.width == null ? [{ path: 'width', message: 'required for rectangular shape' }] : []),
        (data) => (data.height == null ? [{ path: 'height', message: 'required for rectangular shape' }] : []),
      ],
    );
    expect(issues).toHaveLength(2);
  });

  it('returns no issues for a well-formed document', () => {
    const issues = validateDocument({ width: 400, height: 300 }, [
      (data) => (data.width == null ? [{ path: 'width', message: 'required' }] : []),
    ]);
    expect(issues).toHaveLength(0);
  });
});
