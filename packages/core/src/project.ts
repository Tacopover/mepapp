// The project save format: what gets written to disk, and how an older save
// file is brought up to date on load. Exercises schema.ts's migration
// framework for real — this module owns the one migration the project has
// needed so far (material became a segment field partway through
// development; see decisions log 2026-09-06).

import type { Annotation } from './annotation.js';
import type { Fitting, NetworkType, PortGroup, Segment } from './network.js';
import type { PlacedStamp } from './stamp.js';
import { getStampDefinition, type StampDefinition } from './stamp-library.js';
import { migrateToLatest, validateDocument, type JsonRecord, type MigrationStep, type ValidationIssue } from './schema.js';

export const CURRENT_SCHEMA_VERSION = 7;

export interface ProjectDocument {
  schemaVersion: number;
  networkTypes: NetworkType[];
  segments: Segment[];
  fittings: Fitting[];
  stamps: PlacedStamp[];
  portGroups: PortGroup[];
  annotations: Annotation[];
  /** User-authored elements (Element Editor dialog, ports-custom-element-editor-spec.md §5.2) — embedded in the project document itself rather than a shared app-wide library, so the definitions travel with the file. Kept separate from the fixture-backed STAMP_LIBRARY; stamp-library.ts's lookups accept this list as an optional second argument. */
  customStampDefinitions: StampDefinition[];
}

const migrationSteps: MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    // Version 0 predates the `material` field on segments — default it rather
    // than leaving it undefined, so every loaded document has a consistent shape.
    migrate: (data) => ({
      ...data,
      schemaVersion: 1,
      segments: Array.isArray(data.segments)
        ? data.segments.map((segment) =>
            segment && typeof segment === 'object' && !('material' in segment)
              ? { ...(segment as JsonRecord), material: null }
              : segment,
          )
        : data.segments,
    }),
  },
  {
    fromVersion: 1,
    toVersion: 2,
    // Version 1 predates PlacedStamp.category (the Terminal/Equipment tool
    // split) — backfill it from the stamp library when the save recorded a
    // definitionId, else default to 'terminal' (an ad hoc uploaded PNG, whose
    // original placement tool this version doesn't know).
    migrate: (data) => ({
      ...data,
      schemaVersion: 2,
      stamps: Array.isArray(data.stamps)
        ? data.stamps.map((stamp) => {
            if (!stamp || typeof stamp !== 'object' || 'category' in stamp) return stamp;
            const record = stamp as JsonRecord;
            const definitionId = typeof record.definitionId === 'string' ? record.definitionId : undefined;
            const category = (definitionId && getStampDefinition(definitionId)?.category) || 'terminal';
            return { ...record, category };
          })
        : data.stamps,
    }),
  },
  {
    fromVersion: 2,
    toVersion: 3,
    // Version 2 predates PortGroup (linking two ports on one element into a
    // single connectivity node, e.g. an AHU's supply + return) — no save
    // before this could have any, so default to an empty array rather than
    // trying to infer linkage that was never recorded.
    migrate: (data) => ({
      ...data,
      schemaVersion: 3,
      portGroups: Array.isArray(data.portGroups) ? data.portGroups : [],
    }),
  },
  {
    fromVersion: 3,
    toVersion: 4,
    // Version 3 predates user-drawn annotations (freehand/line/rectangle/
    // circle/textbox) — no save before this could have any, so default to an
    // empty array rather than trying to infer markup that was never recorded.
    migrate: (data) => ({
      ...data,
      schemaVersion: 4,
      annotations: Array.isArray(data.annotations) ? data.annotations : [],
    }),
  },
  {
    fromVersion: 4,
    toVersion: 5,
    // Version 4 predates the Element Editor dialog's user-authored elements
    // (ports-custom-element-editor-spec.md §5.2) — no save before this could
    // have any, so default to an empty array rather than trying to infer
    // definitions that were never recorded.
    migrate: (data) => ({
      ...data,
      schemaVersion: 5,
      customStampDefinitions: Array.isArray(data.customStampDefinitions) ? data.customStampDefinitions : [],
    }),
  },
  {
    fromVersion: 5,
    toVersion: 6,
    // Version 5 predates PlacedStamp.color (per-instance tint) — it's
    // optional and every reader already treats "absent" as "no tint", the
    // same way definitionId? never needed a migration step, so this step
    // only advances the version number.
    migrate: (data) => ({
      ...data,
      schemaVersion: 6,
    }),
  },
  {
    fromVersion: 6,
    toVersion: 7,
    // Version 6 predates merging the 'electricalPathways'/'electricalCircuits'
    // disciplines into one 'electrical' discipline — remap any saved
    // NetworkType or customStampDefinitions entry that still carries either
    // old value, everything else is left untouched.
    migrate: (data) => {
      const remapDiscipline = (record: JsonRecord): JsonRecord =>
        record.discipline === 'electricalPathways' || record.discipline === 'electricalCircuits'
          ? { ...record, discipline: 'electrical' }
          : record;
      return {
        ...data,
        schemaVersion: 7,
        networkTypes: Array.isArray(data.networkTypes)
          ? data.networkTypes.map((t) => (t && typeof t === 'object' ? remapDiscipline(t as JsonRecord) : t))
          : data.networkTypes,
        customStampDefinitions: Array.isArray(data.customStampDefinitions)
          ? data.customStampDefinitions.map((d) => (d && typeof d === 'object' ? remapDiscipline(d as JsonRecord) : d))
          : data.customStampDefinitions,
      };
    },
  },
];

function requireArray(data: JsonRecord, field: string): ValidationIssue[] {
  return Array.isArray(data[field]) ? [] : [{ path: field, message: `expected an array` }];
}

const validators = [
  (data: JsonRecord) => requireArray(data, 'networkTypes'),
  (data: JsonRecord) => requireArray(data, 'segments'),
  (data: JsonRecord) => requireArray(data, 'fittings'),
  (data: JsonRecord) => requireArray(data, 'stamps'),
  (data: JsonRecord) => requireArray(data, 'portGroups'),
  (data: JsonRecord) => requireArray(data, 'annotations'),
  (data: JsonRecord) => requireArray(data, 'customStampDefinitions'),
];

export function serializeProject(doc: Omit<ProjectDocument, 'schemaVersion'>): JsonRecord {
  return { ...doc, schemaVersion: CURRENT_SCHEMA_VERSION };
}

export class ProjectLoadError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[],
  ) {
    super(message);
  }
}

/** Migrates raw JSON (any prior schema version) to the current shape and validates it. Throws ProjectLoadError if the result is malformed. */
export function loadProject(raw: JsonRecord): ProjectDocument {
  const migrated = migrateToLatest(raw, { steps: migrationSteps, latestVersion: CURRENT_SCHEMA_VERSION });
  const issues = validateDocument(migrated, validators);
  if (issues.length > 0) {
    throw new ProjectLoadError('project document failed validation after migration', issues);
  }
  return migrated as unknown as ProjectDocument;
}
