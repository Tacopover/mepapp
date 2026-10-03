import { describe, expectTypeOf, it } from 'vitest';
import type { UserStampEdits, UserStampScanRecordLike, UserStampSourceLike } from '@mepapp/core';
import type { LibrarySourceRecord, LibraryStampEdits, LibraryStampRecord } from './library-store.js';

describe('LibraryStore records vs the core user-stamp shapes', () => {
  it('are structurally assignable', () => {
    expectTypeOf<LibraryStampRecord>().toMatchTypeOf<UserStampScanRecordLike>();
    expectTypeOf<LibrarySourceRecord>().toMatchTypeOf<UserStampSourceLike>();
    expectTypeOf<LibraryStampEdits>().toMatchTypeOf<UserStampEdits>();
    const asStamp: UserStampScanRecordLike = {} as LibraryStampRecord;
    const asSource: UserStampSourceLike = {} as LibrarySourceRecord;
    const asEdits: UserStampEdits = {} as LibraryStampEdits;
    void [asStamp, asSource, asEdits];
  });
});
