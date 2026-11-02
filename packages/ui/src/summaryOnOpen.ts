import type { OpenedDocumentOutcome } from './documentIdentity.js';

/** Whether a summary may be written for a document that just opened. */
export function shouldWriteSummaryOnOpen(args: {
  projectUuidInFile: boolean;   // false: the id is a random in-memory id
  loadMismatch: boolean;        // loadFromPdf reported drifted or missingIds
  outcome: OpenedDocumentOutcome | null;  // null: the identity check failed
  afterSameFile?: boolean;      // the user picked "It is the same file"
}): boolean {
  if (!args.projectUuidInFile || args.loadMismatch || args.outcome === null) return false;
  if (args.outcome.kind === 'ask') return args.afterSameFile === true;
  return true;
}
