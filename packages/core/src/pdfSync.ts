// Reconciling the domain model (segments/fittings/placed stamps) against a
// PDF's own annotation objects across save/open/external-edit cycles.
// Deliberately engine-agnostic — no dependency on @mepapp/pdf-engine or
// mupdf. @mepapp/render is responsible for turning Segment/Fitting/PlacedStamp
// records and PdfDocumentHandle.listAnnotations() results into the generic
// shapes below; this module only does the (pure, testable) matching.
//
// Correlation key: a domain object's own id doubles as its PDF annotation's
// /NM field, the same pattern MEPSketcher used via pdftron's UniqueID
// (ProjectDataMapper.cs:180 "Id = element.ID, // IMPORTANT: Matches line
// annot UniqueID"; looked up again on load at ProjectDataMapper.cs:881 via
// FindLineAnnotationByUniqueId). Reconciliation therefore reduces to: for
// each domain id, is there an annotation with the same id, and if so does its
// geometry still match? See decisions log 2026-09-06.

export interface SyncedGeometry {
  id: string;
  // A small plain-JSON snapshot of "the geometry that would show up in the
  // PDF" — position/size/rotation, whatever is comparable between a domain
  // object and its annotation counterpart. Compared with ===, key by key; the
  // caller decides what belongs in it and at what precision (e.g. rounding to
  // avoid float round-trip noise producing false-positive drift).
  geometry: Record<string, number>;
}

export interface ReconciliationReport {
  // Domain id present with an annotation whose geometry still matches.
  matchedIds: string[];
  // Domain id present with an annotation whose geometry differs — most
  // likely edited by a different PDF viewer since the last MepApp save.
  drifted: Array<{ id: string; domainGeometry: Record<string, number>; annotationGeometry: Record<string, number> }>;
  // Domain id with no matching annotation at all — most likely deleted by a
  // different PDF viewer (or never written). The domain object is never
  // removed by this function; the caller decides what to do. MepApp's
  // confirmed policy (2026-09-06): flag it and let the user choose, the same
  // shape as MEPSketcher's own user-gated AnnotationRebuildResult flow,
  // deliberately not auto-silent in either direction.
  missingIds: string[];
  // Annotation ids present in the PDF with no matching domain object at all —
  // either foreign (added by another tool) or one MepApp never claimed. Left
  // untouched; never claimed or deleted by this module.
  foreignIds: string[];
}

function geometryEquals(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

/** Compares the domain model's current geometry against what's actually observed in the PDF right now (i.e. on open). Pure — no I/O. */
export function reconcilePdfSync(domain: SyncedGeometry[], observed: SyncedGeometry[]): ReconciliationReport {
  const observedById = new Map(observed.map((entry) => [entry.id, entry]));
  const domainIds = new Set(domain.map((entry) => entry.id));

  const matchedIds: string[] = [];
  const drifted: ReconciliationReport['drifted'] = [];
  const missingIds: string[] = [];

  for (const entry of domain) {
    const found = observedById.get(entry.id);
    if (!found) {
      missingIds.push(entry.id);
    } else if (geometryEquals(entry.geometry, found.geometry)) {
      matchedIds.push(entry.id);
    } else {
      drifted.push({ id: entry.id, domainGeometry: entry.geometry, annotationGeometry: found.geometry });
    }
  }

  const foreignIds = observed.filter((entry) => !domainIds.has(entry.id)).map((entry) => entry.id);

  return { matchedIds, drifted, missingIds, foreignIds };
}

export interface SyncPlan {
  toCreate: string[]; // domain ids with no existing annotation yet
  toUpdate: string[]; // domain ids whose existing annotation's geometry differs from the domain's current geometry
  toDelete: string[]; // annotation ids MepApp previously wrote whose domain object has since been deleted
}

/**
 * Plans what addAnnotation/deleteAnnotation calls a save needs to make.
 * `previouslySyncedIds` is the set of domain ids that had a MepApp-written
 * annotation as of the last open or save — the caller (the render layer)
 * seeds this from the open-time ReconciliationReport (matchedIds + drifted
 * ids) and evolves it as segments/fittings/stamps are created or deleted
 * during the session. Never plans deleting an id outside that set, so a
 * foreign annotation is never touched even if its id happens to collide.
 */
export function planPdfSync(domain: SyncedGeometry[], observed: SyncedGeometry[], previouslySyncedIds: ReadonlySet<string>): SyncPlan {
  const observedById = new Map(observed.map((entry) => [entry.id, entry]));
  const domainIds = new Set(domain.map((entry) => entry.id));

  const toCreate: string[] = [];
  const toUpdate: string[] = [];
  for (const entry of domain) {
    const found = observedById.get(entry.id);
    if (!found) {
      toCreate.push(entry.id);
    } else if (!geometryEquals(entry.geometry, found.geometry)) {
      toUpdate.push(entry.id);
    }
  }

  const toDelete = [...previouslySyncedIds].filter((id) => !domainIds.has(id));

  return { toCreate, toUpdate, toDelete };
}
