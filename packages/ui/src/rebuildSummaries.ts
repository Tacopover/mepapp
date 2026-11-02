import { buildSheetSummary, loadProject, type BuildingFile, type BuildingSheet, type ProjectDocument } from '@mepapp/core';
import type { PdfEngine } from '@mepapp/pdf-engine';
import type { BuildingStore } from '@mepapp/platform';
import { displayedPageInfos } from './buildingContext.js';

const PROJECT_FILE_NAME = 'mepapp-project.json';

export interface RebuildFailure {
  sheet: BuildingSheet;
  reason: string;
}

export interface RebuildResult {
  ok: number;
  failed: RebuildFailure[];
  /** Documents whose summary was written but whose first sheet has projectUuid null: the sheet is not linked to the summary. */
  notLinked: BuildingSheet[];
  total: number;       // number of documents
  cancelled: boolean;  // the signal aborted before all documents ran
}

/** One sheet per document: the first sheet of each group. That sheet reads the file. */
function firstSheetPerDocument(sheets: readonly BuildingSheet[]): BuildingSheet[] {
  const firsts = new Map<string, BuildingSheet>();
  for (const sheet of sheets) {
    const key = sheet.projectUuid !== null ? `id:${sheet.projectUuid}` : `file:${sheet.location.path ?? sheet.location.fileName}`;
    if (!firsts.has(key)) firsts.set(key, sheet);
  }
  return [...firsts.values()];
}

/** Returns the reason the document failed. When the summary was written, notLinked tells if its first sheet has no projectUuid. */
async function rebuildDocument(
  first: BuildingSheet,
  args: Pick<Parameters<typeof rebuildSummaries>[0], 'engine' | 'read' | 'whyUnreadable' | 'stampNames' | 'store'>,
  now: () => Date,
): Promise<{ reason?: string; notLinked?: boolean }> {
  const file = await args.read(first);
  if (file === undefined) return { reason: args.whyUnreadable ? await args.whyUnreadable(first) : 'the PDF could not be read' };

  const handle = await args.engine.openDocument(new Uint8Array(await file.arrayBuffer()));
  try {
    const bytes = await handle.getEmbeddedFile(PROJECT_FILE_NAME);
    if (bytes === null) return { reason: 'never saved in MepApp' };
    const project: ProjectDocument = loadProject(JSON.parse(new TextDecoder().decode(bytes)));
    if (project.projectUuid === undefined) return { reason: 'the document has no id yet. Save it again in MepApp' };
    if (first.projectUuid !== null && first.projectUuid !== project.projectUuid) return { reason: 'the file holds another document id' };
    const pageInfos = displayedPageInfos(handle);
    const summary = buildSheetSummary({
      project,
      savedAt: now().toISOString(),
      sourceSizeBytes: file.size,
      sourceModifiedMs: file.lastModified,
      pageInfos,
      ...args.stampNames(project),
    });
    await args.store.writeSummary(project.projectUuid, JSON.stringify(summary));
    return { notLinked: first.projectUuid === null };
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
  onProgress: (done: number, total: number, name: string) => void;
  signal: AbortSignal;
  now?: () => Date;
}): Promise<RebuildResult> {
  const documents = firstSheetPerDocument(args.building.sheets);
  const total = documents.length;
  const now = args.now ?? (() => new Date());
  const result: RebuildResult = { ok: 0, failed: [], notLinked: [], total, cancelled: false };
  let done = 0;
  for (const first of documents) {
    if (args.signal.aborted) {
      result.cancelled = true;
      return result;
    }
    args.onProgress(done, total, first.location.fileName);
    let outcome: { reason?: string; notLinked?: boolean };
    try {
      outcome = await rebuildDocument(first, args, now);
    } catch (err) {
      outcome = { reason: (err as Error).message };
    }
    if (outcome.reason === undefined) {
      result.ok += 1;
      if (outcome.notLinked) result.notLinked.push(first);
    } else {
      result.failed.push({ sheet: first, reason: outcome.reason });
    }
    done += 1;
  }
  args.onProgress(total, total, '');
  return result;
}
