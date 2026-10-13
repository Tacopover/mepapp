import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildUserStampDefinition, usesUserStampFile, type StampDefinition } from '@mepapp/core';
import type { LibrarySourceRecord, LibraryStampRecord, LibraryStore } from '@mepapp/platform';
import { materializeUserStamp } from './userStampLibrary.js';

export interface UserStampLibrary {
  available: boolean;
  sources: LibrarySourceRecord[];
  records: LibraryStampRecord[];
  /** Panel definitions; iconRef and the image shape hold a `blob:` URL, so never put these in a project document. */
  definitions: StampDefinition[];
  /** Ids of every record, hidden ones included: the panel skips project copies with these ids. */
  allRecordIds: ReadonlySet<string>;
  reload(): Promise<void>;
  /** The definition with a `data:` URL, for placing or embedding. */
  materialize(stampId: string): Promise<StampDefinition | undefined>;
}

export function useUserStampLibrary(store: LibraryStore | undefined, foldersSupported: boolean): UserStampLibrary {
  const available = store !== undefined && foldersSupported;
  const [sources, setSources] = useState<LibrarySourceRecord[]>([]);
  const [records, setRecords] = useState<LibraryStampRecord[]>([]);
  const [definitions, setDefinitions] = useState<StampDefinition[]>([]);
  const allRecordIds = useMemo<ReadonlySet<string>>(() => new Set(records.map((record) => record.id)), [records]);
  const urlsRef = useRef<string[]>([]);
  const sequenceRef = useRef(0);
  const unmountedRef = useRef(false);

  const reload = useCallback(async () => {
    if (!store || !available) return;
    const sequence = ++sequenceRef.current;
    const nextSources = await store.listSources();
    const nextRecords = await store.listStamps();
    const sourcesById = new Map(nextSources.map((source) => [source.id, source]));
    const urls: string[] = [];
    const nextDefinitions: StampDefinition[] = [];
    for (const record of nextRecords) {
      const source = sourcesById.get(record.sourceId);
      if (!source || record.hidden) continue;
      const blob = await store.getStampBlob(record.id);
      if (!blob) {
        if (!usesUserStampFile(record.edits)) nextDefinitions.push(buildUserStampDefinition(record, source, undefined));
        continue;
      }
      const url = URL.createObjectURL(blob);
      urls.push(url);
      nextDefinitions.push(buildUserStampDefinition(record, source, url));
    }
    if (unmountedRef.current || sequence !== sequenceRef.current) {
      urls.forEach((url) => URL.revokeObjectURL(url));
      return;
    }
    const previous = urlsRef.current;
    urlsRef.current = urls;
    setSources(nextSources);
    setRecords(nextRecords);
    setDefinitions(nextDefinitions);
    previous.forEach((url) => URL.revokeObjectURL(url));
  }, [store, available]);

  useEffect(() => {
    unmountedRef.current = false;
    void reload().catch((err) => console.warn('[mepapp] loading the user stamp library failed:', err));
    return () => {
      unmountedRef.current = true;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [reload]);

  const materialize = useCallback(
    (stampId: string) => (store ? materializeUserStamp(store, stampId) : Promise.resolve(undefined)),
    [store],
  );

  return { available, sources, records, definitions, allRecordIds, reload, materialize };
}
