import { buildSheetSummary, loadProject, parseBuildingFile, riserFittingIdsForSheets, type BuildingFile, type BuildingSheet, type ProjectDocument } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { BuildingStore } from '@mepapp/platform';
import { displayedPageInfos, linkSheetsWithRetry } from './buildingContext.js';

const PROJECT_FILE_NAME = 'mepapp-project.json';

export interface RebuildFailure {
  sheet: BuildingSheet;
  reason: string;
}

export interface RebuildResult {
  ok: number;
  failed: RebuildFailure[];
  /** Sheets that were unlinked and are now linked to the id of their document. */
  linked: number;
  total: number;       // number of documents that run
  skipped: number;     // number of documents that skip() left out
  cancelled: boolean;  // the signal aborted before all documents ran
}

/** The key of the file of an unlinked sheet: its path, or its file name when it has no path. */
function fileKey(sheet: BuildingSheet): string {
  return `file:${sheet.location.path ?? sheet.location.fileName}`;
}

/** One sheet per document: the first sheet of each group. That sheet reads the file. */
function firstSheetPerDocument(sheets: readonly BuildingSheet[]): BuildingSheet[] {
  const firsts = new Map<string, BuildingSheet>();
  for (const sheet of sheets) {
    const key = sheet.projectUuid !== null ? `id:${sheet.projectUuid}` : fileKey(sheet);
    if (!firsts.has(key)) firsts.set(key, sheet);
  }
  return [...firsts.values()];
}

/** True when sheet is the same file as first. A file without a path is matched by its size too. */
function isSameFile(first: BuildingSheet, sheet: BuildingSheet): boolean {
  return fileKey(sheet) === fileKey(first) && (first.location.path !== undefined || sheet.location.sizeBytes === first.location.sizeBytes);
}

/** Links the unlinked sheets of the file of first to projectUuid. Reads the building file fresh from the store. Returns the number linked. */
async function linkDocumentSheets(store: BuildingStore, first: BuildingSheet, projectUuid: string): Promise<number> {
  const stored = await store.read();
  if (stored === undefined) return 0;
  const file: BuildingFile = parseBuildingFile(JSON.parse(stored.json));
  const sheetIds = file.sheets.filter((sheet) => sheet.projectUuid === null && isSameFile(first, sheet)).map((sheet) => sheet.id);
  if (sheetIds.length === 0) return 0;
  return linkSheetsWithRetry(store, file, stored.revision, projectUuid, sheetIds);
}

/** Returns the reason the document failed. When the summary was written, linked counts the sheets linked to it. */
async function rebuildDocument(
  first: BuildingSheet,
  args: Pick<Parameters<typeof rebuildSummaries>[0], 'building' | 'engine' | 'read' | 'whyUnreadable' | 'stampNames' | 'store'>,
  now: () => Date,
): Promise<{ reason?: string; linked?: number }> {
  const file = await args.read(first);
  if (file === undefined) return { reason: args.whyUnreadable ? await args.whyUnreadable(first) : 'the PDF could not be read' };

  const handle = await args.engine.openDocument(new Uint8Array(await file.arrayBuffer()));
  try {
    const bytes = await handle.getEmbeddedFile(PROJECT_FILE_NAME);
    if (bytes === null) return { reason: 'not saved yet' };
    const project: ProjectDocument = loadProject(JSON.parse(new TextDecoder().decode(bytes)));
    if (project.projectUuid === undefined) return { reason: 'the document has no id yet. Save it again in MepApp' };
    if (first.projectUuid !== null && first.projectUuid !== project.projectUuid) return { reason: 'the file holds another document id' };
    const pageInfos = displayedPageInfos(handle);
    const documentSheetIds = args.building.sheets
      .filter((sheet) => sheet.projectUuid === project.projectUuid || (first.projectUuid === null && sheet.projectUuid === null && isSameFile(first, sheet)))
      .map((sheet) => sheet.id);
    const summary = buildSheetSummary({
      project,
      savedAt: now().toISOString(),
      sourceSizeBytes: file.size,
      sourceModifiedMs: file.lastModified,
      pageInfos,
      riserFittingIds: riserFittingIdsForSheets(args.building, documentSheetIds),
      ...args.stampNames(project),
    });
    await args.store.writeSummary(project.projectUuid, JSON.stringify(summary));
    if (first.projectUuid !== null) return { linked: 0 };
    return { linked: await linkDocumentSheets(args.store, first, project.projectUuid) };
  } finally {
    handle.close();
  }
}

/** Rebuilds the sheet summary of every document of a building. One document at a time. */
export async function rebuildSummaries(args: {
  building: BuildingFile;
  engine: PdfEngine;
  read: (sheet: BuildingSheet) => Promise<File | undefined>;
  /** Why read() gave undefined, for the failure text. Default: 'the PDF could not be read'. */
  whyUnreadable?: (sheet: BuildingSheet) => Promise<string>;
  /** Name lookups for one project (its own custom stamps plus the library). */
  stampNames: (project: ProjectDocument) => { stampTypeName: (id: string) => string | null; stampImageName: (id: string) => string | null };
  store: BuildingStore;
  /** True for a document that is not read. The test uses its first sheet. Default: every document is read. */
  skip?: (sheet: BuildingSheet) => boolean;
  onProgress: (done: number, total: number, name: string) => void;
  signal: AbortSignal;
  now?: () => Date;
}): Promise<RebuildResult> {
  const allDocuments = firstSheetPerDocument(args.building.sheets);
  const documents = allDocuments.filter((first) => args.skip?.(first) !== true);
  const total = documents.length;
  const now = args.now ?? (() => new Date());
  const result: RebuildResult = { ok: 0, failed: [], linked: 0, total, skipped: allDocuments.length - total, cancelled: false };
  let done = 0;
  for (const first of documents) {
    if (args.signal.aborted) {
      result.cancelled = true;
      return result;
    }
    args.onProgress(done, total, first.location.fileName);
    let outcome: { reason?: string; linked?: number };
    try {
      outcome = await rebuildDocument(first, args, now);
    } catch (err) {
      outcome = { reason: (err as Error).message };
    }
    if (outcome.reason === undefined) {
      result.ok += 1;
      result.linked += outcome.linked ?? 0;
    } else {
      result.failed.push({ sheet: first, reason: outcome.reason });
    }
    done += 1;
  }
  args.onProgress(total, total, '');
  return result;
}
