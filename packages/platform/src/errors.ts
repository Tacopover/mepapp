export class StoreConflictError extends Error {
  readonly key: string;
  readonly expectedRevision: string | undefined;
  readonly actualRevision: string | undefined;

  constructor(key: string, expectedRevision: string | undefined, actualRevision: string | undefined) {
    super(`Store conflict on "${key}": expected revision ${expectedRevision}, found ${actualRevision}`);
    this.name = 'StoreConflictError';
    this.key = key;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}
