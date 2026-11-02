import { duplicateVerdict, findSheets, type BuildingFile, type SheetLocation } from '@mepapp/core';
import type { PathState } from '@mepapp/platform';

export interface OpenedDocumentInfo {
  projectUuid: string | null;
  path?: string;
  fileName: string;
  sizeBytes: number;
  modifiedMs: number;
}

export type OpenedDocumentOutcome =
  | { kind: 'none' }
  | { kind: 'moved'; projectUuid: string; location: SheetLocation; sheetName: string }
  | { kind: 'ask'; verdict: 'copy' | 'unclear'; projectUuid: string; location: SheetLocation; storedName: string; storedPath?: string };

/** Looks only at sheets matched by id (strength 'id'); none -> { kind: 'none' }. Uses the first matched sheet (all sheets of one document share the location). location = the location of the OPEN document: { fileName, path (only when defined), sizeBytes }.
 *  storedPath = sheet.location.path. Stored state = statPath(storedPath) when storedPath is defined and statPath exists, else 'ok'; a throw from statPath = 'no-access'.
 *  Web rule: when doc.path is undefined and the stored sheet has the same fileName and (location.sizeBytes undefined or equal to doc.sizeBytes) the verdict is 'none' (the same file opened again).
 *  Otherwise verdict = duplicateVerdict({ openPath: doc.path, storedPath, storedState, sameSizeAndTime: stat.sizeBytes === doc.sizeBytes && stat.modifiedMs === doc.modifiedMs }).
 *  'none' -> none; 'moved' -> { kind: 'moved', ... sheetName: sheet.displayName }; 'copy' | 'unclear' -> ask with storedName = sheet.location.fileName. */
export async function checkOpenedDocument(args: {
  building: BuildingFile;
  doc: OpenedDocumentInfo;
  statPath?: (path: string) => Promise<{ state: PathState; sizeBytes?: number; modifiedMs?: number }>;
}): Promise<OpenedDocumentOutcome> {
  const { building, doc, statPath } = args;
  const matches = findSheets(building, doc).filter((match) => match.strength === 'id');
  if (matches.length === 0) return { kind: 'none' };

  const sheet = matches[0].sheet;
  const projectUuid = sheet.projectUuid;
  if (projectUuid === null) return { kind: 'none' };

  const location: SheetLocation = {
    fileName: doc.fileName,
    ...(doc.path !== undefined ? { path: doc.path } : {}),
    sizeBytes: doc.sizeBytes,
  };
  const storedPath = sheet.location.path;

  if (doc.path === undefined && sheet.location.fileName === doc.fileName && (sheet.location.sizeBytes === undefined || sheet.location.sizeBytes === doc.sizeBytes)) {
    return { kind: 'none' };
  }

  let storedState: PathState = 'ok';
  let sameSizeAndTime = false;
  if (storedPath !== undefined && statPath) {
    try {
      const stat = await statPath(storedPath);
      storedState = stat.state;
      sameSizeAndTime = stat.sizeBytes === doc.sizeBytes && stat.modifiedMs === doc.modifiedMs;
    } catch {
      storedState = 'no-access';
    }
  }

  const verdict = duplicateVerdict({ openPath: doc.path, storedPath, storedState, sameSizeAndTime });
  if (verdict === 'none') return { kind: 'none' };
  if (verdict === 'moved') return { kind: 'moved', projectUuid, location, sheetName: sheet.displayName };
  return {
    kind: 'ask',
    verdict,
    projectUuid,
    location,
    storedName: sheet.location.fileName,
    ...(storedPath !== undefined ? { storedPath } : {}),
  };
}
