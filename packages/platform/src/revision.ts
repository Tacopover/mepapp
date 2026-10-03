import { StoreConflictError } from './errors.js';

export function checkRevision(
  key: string,
  expectedRevision: string | undefined,
  actualRevision: string | undefined,
): void {
  if (expectedRevision === undefined) return;
  if (expectedRevision !== actualRevision) {
    throw new StoreConflictError(key, expectedRevision, actualRevision);
  }
}
