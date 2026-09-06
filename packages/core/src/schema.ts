// Schema migration: versioned JSON with a resumable chain of migration
// steps, same overall shape as the old app (ProjectDataUpgrader.cs) but
// fixing two problems the investigation found in it. First, migration here
// is meant to always run inside the load boundary (see migrateToLatest,
// called from wherever a document is loaded) — the old app's LoadAsync never
// upgraded, leaving two separate call sites to each remember to do it by
// hand (ProjectDataMapper.cs:439-445, TakeoffCollector.cs:113-128, with
// diverging error handling between them). Second, steps here operate on
// loosely-typed JSON rather than fully-typed DTOs, so a future field
// deletion can't silently become unrecoverable the way the old app's V5→V6
// migration nearly was, having to recover Width/Height only because they
// happened to still be reachable through an untyped fallback dictionary
// (V5ToV6UpgradeStep.cs:33-55).

export type JsonRecord = Record<string, unknown>;

export class SchemaMigrationError extends Error {}

export interface MigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  /** Returns the migrated document. Must not assume any field's typed shape — read/write plain JSON only. */
  migrate(data: JsonRecord): JsonRecord;
}

/** Validates a step chain has exactly one step per version, 0..latestVersion-1, no gaps or duplicates — same check the old app runs on every ProjectDataUpgrader construction (ProjectDataUpgrader.cs:117-152). */
export function validateMigrationChain(steps: MigrationStep[], latestVersion: number): void {
  const byFromVersion = new Map<number, MigrationStep>();
  for (const step of steps) {
    if (byFromVersion.has(step.fromVersion)) {
      throw new SchemaMigrationError(`duplicate migration step for version ${step.fromVersion}`);
    }
    if (step.toVersion !== step.fromVersion + 1) {
      throw new SchemaMigrationError(
        `migration step ${step.fromVersion}->${step.toVersion} must advance by exactly one version`,
      );
    }
    byFromVersion.set(step.fromVersion, step);
  }
  for (let version = 0; version < latestVersion; version++) {
    if (!byFromVersion.has(version)) {
      throw new SchemaMigrationError(`missing migration step for version ${version}`);
    }
  }
}

export interface MigrateToLatestOptions {
  steps: MigrationStep[];
  latestVersion: number;
  /** Field name carrying the document's schema version. Missing/non-numeric is treated as version 0, same as the old app's int-default behavior when the field is absent from old JSON. */
  versionField?: string;
}

/**
 * Applies migration steps one at a time, resuming from whatever version is
 * present rather than replaying already-applied steps (proven load-bearing
 * by the old app's own regression test,
 * Upgrader_ResumesFromAPartiallyMigratedFile — SchemaMigrationTests.cs:459-484),
 * and refuses to open a document from a future schema version.
 */
export function migrateToLatest(data: JsonRecord, options: MigrateToLatestOptions): JsonRecord {
  const versionField = options.versionField ?? 'schemaVersion';
  validateMigrationChain(options.steps, options.latestVersion);

  let current: JsonRecord = { ...data };
  let version = typeof current[versionField] === 'number' ? (current[versionField] as number) : 0;

  if (version > options.latestVersion) {
    throw new SchemaMigrationError(
      `document is schema version ${version}, newer than the latest supported version ${options.latestVersion}`,
    );
  }

  while (version < options.latestVersion) {
    const step = options.steps.find((s) => s.fromVersion === version);
    if (!step) {
      throw new SchemaMigrationError(`no migration step registered for version ${version}`);
    }
    current = step.migrate(current);
    const nextVersion = typeof current[versionField] === 'number' ? (current[versionField] as number) : version;
    if (nextVersion !== step.toVersion) {
      throw new SchemaMigrationError(
        `migration step ${step.fromVersion}->${step.toVersion} did not set ${versionField} to ${step.toVersion}`,
      );
    }
    version = nextVersion;
  }

  return current;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type Validator = (data: JsonRecord) => ValidationIssue[];

/**
 * Runs post-migration shape validation. The old app had none at all — this
 * is a deliberate addition, not a port. An empty result means the document
 * is well-formed.
 */
export function validateDocument(data: JsonRecord, validators: Validator[]): ValidationIssue[] {
  return validators.flatMap((validate) => validate(data));
}
