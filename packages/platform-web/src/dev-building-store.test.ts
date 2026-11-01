import { describe, expect, it } from 'vitest';
import { createDevBuildingStore } from './dev-building-store.js';

describe('createDevBuildingStore', () => {
  it('starts empty until load is called', async () => {
    const store = createDevBuildingStore();
    expect(await store.read()).toBeUndefined();
  });

  it('holds the loaded building and summaries', async () => {
    const store = createDevBuildingStore();
    store.load('{"name":"A"}', { u1: 's' });
    expect(await store.read()).toEqual({ json: '{"name":"A"}', revision: '1' });
    expect(await store.readSummary('u1')).toBe('s');
    expect(await store.listSummaries()).toEqual(['u1']);
  });

  it('replaces the building and summaries on a second load', async () => {
    const store = createDevBuildingStore();
    store.load('{"name":"A"}', { u1: 's' });
    store.load('{"name":"B"}');
    expect(await store.read()).toEqual({ json: '{"name":"B"}', revision: '1' });
    expect(await store.readSummary('u1')).toBeUndefined();
    expect(await store.listSummaries()).toEqual([]);
  });

  it('writes a new revision after load and reads it back', async () => {
    const store = createDevBuildingStore();
    store.load('{"name":"A"}');
    const written = await store.write('{"name":"C"}', '1');
    expect(written.revision).not.toBe('1');
    expect(await store.read()).toEqual({ json: '{"name":"C"}', revision: written.revision });
  });
});
