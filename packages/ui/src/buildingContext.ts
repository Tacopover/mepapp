import {
  buildSheetSummary,
  displayDimensions,
  findSheets,
  getStampDefinition,
  parseBuildingFile,
  parseSheetSummary,
  serializeBuildingFile,
  sortLevelsByElevation,
  withProjectUuid,
  type BuildingFile,
  type ProjectDocument,
  type StampDefinition,
} from '@mepapp/core';
import { StoreConflictError, type BuildingStore } from '@mepapp/platform';

export type SummaryAfterSaveResult =
  | { state: 'no-building' }
  | { state: 'no-match' }
  | { state: 'written'; projectUuid: string; patchedSheets: number }
  | { state: 'fresh'; projectUuid: string; patchedSheets: number };

/** Writes the sheet summary of a saved document into the building store. Links unlinked matched sheets to the document's projectUuid. With onlyIfStale, the summary is written only when the stored one is missing, unreadable or made from another file size or time. */
export async function summaryAfterSave(args: {
  store: BuildingStore;
  project: ProjectDocument;
  document: { fileName: string; path?: string; sizeBytes: number; modifiedMs: number };
  pageInfos: readonly { widthPt: number; heightPt: number; rotationDegrees: number }[];
  stampTypeName: (id: string) => string | null;
  stampImageName: (id: string) => string | null;
  now?: () => Date;
  onlyIfStale?: boolean;
}): Promise<SummaryAfterSaveResult> {
  const { store, project, document } = args;
  const stored = await store.read();
  if (stored === undefined) return { state: 'no-building' };
  const file = parseBuildingFile(JSON.parse(stored.json));
  const projectUuid = project.projectUuid;
  if (projectUuid === undefined) return { state: 'no-match' };

  const matches = findSheets(file, { projectUuid, path: document.path, fileName: document.fileName, sizeBytes: document.sizeBytes }).filter(
    (match) => match.strength !== 'weak',
  );
  if (matches.length === 0) return { state: 'no-match' };

  const stale = args.onlyIfStale ? await isSummaryStale(store, projectUuid, document) : true;
  if (stale) {
    const summary = buildSheetSummary({
      project,
      savedAt: (args.now ?? (() => new Date()))().toISOString(),
      sourceSizeBytes: document.sizeBytes,
      sourceModifiedMs: document.modifiedMs,
      pageInfos: args.pageInfos,
      stampTypeName: args.stampTypeName,
      stampImageName: args.stampImageName,
    });
    await store.writeSummary(projectUuid, JSON.stringify(summary));
  }

  const unlinkedSheetIds = matches.filter((match) => match.sheet.projectUuid === null).map((match) => match.sheet.id);
  const patchedSheets = unlinkedSheetIds.length > 0 ? await linkSheetsWithRetry(store, file, stored.revision, projectUuid, unlinkedSheetIds) : 0;
  return { state: stale ? 'written' : 'fresh', projectUuid, patchedSheets };
}

async function isSummaryStale(store: BuildingStore, projectUuid: string, document: { sizeBytes: number; modifiedMs: number }): Promise<boolean> {
  const text = await store.readSummary(projectUuid);
  if (text === undefined) return true;
  try {
    const summary = parseSheetSummary(JSON.parse(text));
    return summary.sourceSizeBytes !== document.sizeBytes || summary.sourceModifiedMs !== document.modifiedMs;
  } catch {
    return true;
  }
}

/** Links the sheets to projectUuid and writes the building file. On a StoreConflictError it re-reads the file and links once more. */
export async function linkSheetsWithRetry(store: BuildingStore, file: BuildingFile, revision: string, projectUuid: string, sheetIds: readonly string[]): Promise<number> {
  try {
    return await linkSheets(store, file, revision, projectUuid, sheetIds);
  } catch (err) {
    if (!(err instanceof StoreConflictError)) throw err;
    const current = await store.read();
    if (current === undefined) return 0;
    return linkSheets(store, parseBuildingFile(JSON.parse(current.json)), current.revision, projectUuid, sheetIds);
  }
}

async function linkSheets(store: BuildingStore, file: BuildingFile, revision: string, projectUuid: string, sheetIds: readonly string[]): Promise<number> {
  let next = file;
  let patched = 0;
  for (const sheetId of sheetIds) {
    const sheet = next.sheets.find((candidate) => candidate.id === sheetId);
    if (sheet === undefined || sheet.projectUuid !== null) continue;
    next = withProjectUuid(next, sheetId, projectUuid);
    patched += 1;
  }
  if (patched === 0) return 0;
  await store.write(serializeBuildingFile(next), revision);
  return patched;
}

/** Reads the building file from the store for an export. Levels come back sorted by elevation. Undefined when the store holds no building. */
export async function readBuildingForExport(store: BuildingStore): Promise<BuildingFile | undefined> {
  const stored = await store.read();
  return stored === undefined ? undefined : sortLevelsByElevation(parseBuildingFile(JSON.parse(stored.json)));
}

/** The two name lookups of the quantity tables, from a list of stamp definitions. Same rules as handleExportQuantities. */
export function stampNameLookups(definitions: readonly StampDefinition[]): { stampTypeName: (id: string) => string | null; stampImageName: (id: string) => string | null } {
  const list = [...definitions];
  return {
    stampTypeName: (id) => getStampDefinition(id, list)?.label ?? null,
    stampImageName: (id) => {
      const iconRef = getStampDefinition(id, list)?.iconRef;
      // A data: or blob: reference is embedded art, not a file name.
      return iconRef && !/^(data|blob):/.test(iconRef) ? (iconRef.split(/[\\/]/).pop() ?? null) : null;
    },
  };
}

/** The page sizes as displayed (after each page's own /Rotate). The engine returns the unrotated size. */
export function displayedPageInfos(handle: {
  getPageCount(): number;
  getPageInfo(index: number): { widthPt: number; heightPt: number; rotationDegrees: 0 | 90 | 180 | 270 };
}): { widthPt: number; heightPt: number; rotationDegrees: 0 | 90 | 180 | 270 }[] {
  return Array.from({ length: handle.getPageCount() }, (_, pageIndex) => {
    const info = handle.getPageInfo(pageIndex);
    return { ...displayDimensions({ widthPt: info.widthPt, heightPt: info.heightPt }, info.rotationDegrees), rotationDegrees: info.rotationDegrees };
  });
}
