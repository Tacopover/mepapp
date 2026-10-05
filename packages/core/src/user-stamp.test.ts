import { describe, expect, it } from 'vitest';
import type { PortSpec } from './geometry.js';
import type { SymbolShape } from './symbol-shapes.js';
import { getStampDefinition, STAMP_LIBRARY } from './stamp-library.js';
import {
  applyScannedFile,
  buildUserStampDefinition,
  diffFolderScan,
  humanizeFileName,
  parseSvgIntrinsicSize,
  rasterNativeSize,
  SAVED_STAMPS_SOURCE_ID,
  svgNativeSize,
  toUserStampEdits,
  USER_STAMP_FILE_REF,
  USER_STAMP_ID_PREFIX,
  usesUserStampFile,
  userStampId,
  userStampSlug,
  type ScannedLibraryFile,
  type UserStampEdits,
  type UserStampScanRecordLike,
} from './user-stamp.js';

describe('userStampSlug', () => {
  it('lower-cases and strips diacritics', () => {
    expect(userStampSlug('Ventilatie Rooster Éé.svg')).toBe('ventilatie-rooster-ee');
  });
  it('turns spaces and underscores into single dashes', () => {
    expect(userStampSlug('  My__Fan  Coil_.png')).toBe('my-fan-coil');
  });
  it('falls back to stamp when nothing is left', () => {
    expect(userStampSlug('___.svg')).toBe('stamp');
    expect(userStampSlug('')).toBe('stamp');
  });
});

describe('userStampId', () => {
  it('returns the base id when free', () => {
    expect(userStampId('s1', 'Fan.svg', new Set())).toBe('user-s1-fan');
  });
  it('adds the extension on a collision', () => {
    expect(userStampId('s1', 'fan.png', new Set(['user-s1-fan']))).toBe('user-s1-fan-png');
  });
  it('adds a counter on a double collision', () => {
    expect(userStampId('s1', 'fan.png', new Set(['user-s1-fan', 'user-s1-fan-png']))).toBe('user-s1-fan-png-2');
    expect(userStampId('s1', 'fan.png', new Set(['user-s1-fan', 'user-s1-fan-png', 'user-s1-fan-png-2']))).toBe('user-s1-fan-png-3');
  });
  it('counts on the base when the file has no extension', () => {
    expect(userStampId('s1', 'fan', new Set(['user-s1-fan']))).toBe('user-s1-fan-2');
  });
});

describe('user ids vs the built-in library', () => {
  it('no STAMP_LIBRARY id starts with the user prefix', () => {
    expect(STAMP_LIBRARY.filter((def) => def.id.startsWith(USER_STAMP_ID_PREFIX))).toEqual([]);
  });
  it('getStampDefinition finds a user definition in the custom list', () => {
    const def = buildUserStampDefinition(
      { id: 'user-s1-fan', fileName: 'fan.svg', nativeWidth: 10, nativeHeight: 10, edits: {} },
      { category: 'equipment', discipline: 'ventilation' },
      'blob:x',
    );
    expect(getStampDefinition('user-s1-fan', [def])).toBe(def);
  });
});

describe('humanizeFileName', () => {
  it('drops the extension and turns _ and - into spaces', () => {
    expect(humanizeFileName('Fan_coil-unit  2.svg')).toBe('Fan coil unit 2');
  });
  it('returns the file name when nothing is left', () => {
    expect(humanizeFileName('_.svg')).toBe('_.svg');
  });
});

describe('parseSvgIntrinsicSize', () => {
  it('reads viewBox and ignores its offset', () => {
    expect(parseSvgIntrinsicSize('<svg xmlns="x" viewBox="10 20 100 50"></svg>')).toEqual({ width: 100, height: 50 });
  });
  it('accepts commas and single quotes', () => {
    expect(parseSvgIntrinsicSize("<svg viewBox='0,0,30.5,20'>")).toEqual({ width: 30.5, height: 20 });
  });
  it('prefers viewBox over width/height', () => {
    expect(parseSvgIntrinsicSize('<svg width="5" height="5" viewBox="0 0 100 50">')).toEqual({ width: 100, height: 50 });
  });
  it('converts units on width/height', () => {
    const mm = parseSvgIntrinsicSize('<svg\n  width="25.4mm"\n  height="50.8mm">')!;
    expect(mm.width).toBeCloseTo(96);
    expect(mm.height).toBeCloseTo(192);
    const pt = parseSvgIntrinsicSize('<svg width="30pt" height="15pt">')!;
    expect(pt.width).toBeCloseTo(40);
    expect(pt.height).toBeCloseTo(20);
    expect(parseSvgIntrinsicSize('<svg width="12" height="8px">')).toEqual({ width: 12, height: 8 });
    expect(parseSvgIntrinsicSize('<svg width="1in" height="1pc">')).toEqual({ width: 96, height: 16 });
  });
  it('returns undefined for percentages, em, or no size', () => {
    expect(parseSvgIntrinsicSize('<svg width="100%" height="100%">')).toBeUndefined();
    expect(parseSvgIntrinsicSize('<svg width="2em" height="2em">')).toBeUndefined();
    expect(parseSvgIntrinsicSize('<svg xmlns="x"><rect/></svg>')).toBeUndefined();
    expect(parseSvgIntrinsicSize('<svg viewBox="0 0 0 10">')).toBeUndefined();
    expect(parseSvgIntrinsicSize('not svg')).toBeUndefined();
  });
  it('only looks at the root svg tag', () => {
    expect(parseSvgIntrinsicSize('<svg xmlns="x"><svg viewBox="0 0 9 9"></svg></svg>')).toBeUndefined();
    expect(parseSvgIntrinsicSize('<?xml version="1.0"?>\n<svg viewBox="0 0 4 2"><svg viewBox="0 0 9 9"></svg></svg>')).toEqual({ width: 4, height: 2 });
  });
});

describe('native sizes', () => {
  it('scales SVG units to points with 2 decimals', () => {
    expect(svgNativeSize({ width: 100, height: 50 })).toEqual({ nativeWidth: 18, nativeHeight: 9 });
    expect(svgNativeSize({ width: 33.3, height: 7 })).toEqual({ nativeWidth: 5.99, nativeHeight: 1.26 });
  });
  it('sizes a landscape raster by its width', () => {
    expect(rasterNativeSize(300, 100)).toEqual({ nativeWidth: 40, nativeHeight: 13.33 });
  });
  it('sizes a portrait raster by its height', () => {
    expect(rasterNativeSize(100, 300)).toEqual({ nativeWidth: 13.33, nativeHeight: 40 });
    expect(rasterNativeSize(50, 50)).toEqual({ nativeWidth: 40, nativeHeight: 40 });
  });
});

describe('buildUserStampDefinition', () => {
  const source = { category: 'terminal' as const, discipline: 'ventilation' as const };
  const record = { id: 'user-s1-fan', fileName: 'big_fan.svg', nativeWidth: 12, nativeHeight: 6, edits: {} };

  it('uses defaults from the record and source', () => {
    const def = buildUserStampDefinition(record, source, 'blob:abc');
    expect(def).toMatchObject({
      id: 'user-s1-fan',
      label: 'big fan',
      discipline: 'ventilation',
      category: 'terminal',
      nativeWidth: 12,
      nativeHeight: 6,
      ports: [],
      iconRef: 'blob:abc',
      source: 'user',
    });
    expect(def.labelNl).toBeUndefined();
    expect(def.shapes).toEqual([
      {
        id: 'user-s1-fan-image',
        kind: 'image',
        dataUrl: 'blob:abc',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        style: { stroke: '#1a1a1a', strokeWidth: 0.01, fill: null },
      },
    ]);
  });

  it('lets edits override and copies the ports array', () => {
    const ports = [{ id: 'p1', x: 0.5, y: 0 }] as unknown as PortSpec[];
    const def = buildUserStampDefinition(
      { ...record, edits: { label: 'Fan', discipline: 'plumbing', ports, nativeWidth: 20, nativeHeight: 10 } },
      source,
      'blob:abc',
    );
    expect(def).toMatchObject({ label: 'Fan', discipline: 'plumbing', nativeWidth: 20, nativeHeight: 10 });
    expect(def.ports).toEqual(ports);
    expect(def.ports).not.toBe(ports);
  });
});

describe('diffFolderScan', () => {
  const rec = (fileName: string, over: Partial<UserStampScanRecordLike> = {}): UserStampScanRecordLike => ({
    id: `user-s-${fileName}`,
    fileName,
    nativeWidth: 10,
    nativeHeight: 10,
    edits: {},
    fileSize: 100,
    fileModified: 1000,
    missingFromFolder: false,
    ...over,
  });
  const file = (fileName: string, fileSize = 100, fileModified = 1000): ScannedLibraryFile => ({ fileName, fileSize, fileModified });

  it('classifies added, updated, unchanged and missing', () => {
    const a = rec('a.svg');
    const b = rec('b.svg');
    const c = rec('c.svg');
    const d = rec('d.svg');
    const diff = diffFolderScan([a, b, c, d], [file('a.svg'), file('b.svg', 101), file('c.svg', 100, 2000), file('new.svg')]);
    expect(diff.unchanged).toEqual([a]);
    expect(diff.updated).toEqual([
      { record: b, file: file('b.svg', 101) },
      { record: c, file: file('c.svg', 100, 2000) },
    ]);
    expect(diff.added).toEqual([file('new.svg')]);
    expect(diff.missing).toEqual([d]);
  });

  it('treats a reappeared file as updated', () => {
    const gone = rec('a.svg', { missingFromFolder: true });
    const diff = diffFolderScan([gone], [file('a.svg')]);
    expect(diff.updated).toEqual([{ record: gone, file: file('a.svg') }]);
    expect(diff.unchanged).toEqual([]);
  });

  it('keeps already-missing records in missing', () => {
    const gone = rec('a.svg', { missingFromFolder: true });
    expect(diffFolderScan([gone], []).missing).toEqual([gone]);
  });

  it('reports a rename as one added and one missing', () => {
    const old = rec('old.svg');
    const diff = diffFolderScan([old], [file('new.svg')]);
    expect(diff.added).toEqual([file('new.svg')]);
    expect(diff.missing).toEqual([old]);
  });

  it('sorts added by file name', () => {
    const diff = diffFolderScan([], [file('c.svg'), file('a.svg'), file('B.svg')]);
    expect(diff.added.map((f) => f.fileName)).toEqual(['B.svg', 'a.svg', 'c.svg']);
  });
});

describe('applyScannedFile', () => {
  it('updates file fields, clears missing and keeps edits', () => {
    const ports = [{ id: 'p1', x: 0, y: 0 }] as unknown as PortSpec[];
    const record = {
      id: 'user-s-a',
      fileName: 'a.svg',
      nativeWidth: 10,
      nativeHeight: 10,
      edits: { ports, label: 'A' },
      fileSize: 1,
      fileModified: 2,
      missingFromFolder: true,
      extra: 'kept',
    };
    const next = applyScannedFile(record, { fileName: 'a.svg', fileSize: 5, fileModified: 6 }, { nativeWidth: 3, nativeHeight: 4 });
    expect(next).toEqual({ ...record, fileSize: 5, fileModified: 6, nativeWidth: 3, nativeHeight: 4, missingFromFolder: false });
    expect(next.edits.ports).toEqual(ports);
    expect(next).not.toBe(record);
    expect(record.missingFromFolder).toBe(true);
  });
});

describe('edited user stamps (shapes, marker, category)', () => {
  const source = { category: 'terminal' as const, discipline: 'ventilation' as const };
  const record = { id: 'user-s1-fan', fileName: 'big_fan.svg', nativeWidth: 12, nativeHeight: 6, edits: {} as UserStampEdits };
  const style = { stroke: '#000', strokeWidth: 1, fill: null };
  const line: SymbolShape = { id: 'l1', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, style };
  const markerImage: SymbolShape = { id: 'img', kind: 'image', dataUrl: USER_STAMP_FILE_REF, x: 0, y: 0, width: 1, height: 1, style };

  it('replaces the marker with the file URL and keeps other shapes', () => {
    const def = buildUserStampDefinition({ ...record, edits: { shapes: [markerImage, line], iconRef: 'data:image/png;base64,PREV' } }, source, 'blob:abc');
    expect(def.shapes).toEqual([{ ...markerImage, dataUrl: 'blob:abc' }, line]);
    expect(def.iconRef).toBe('data:image/png;base64,PREV');
  });

  it('drops the marker image when the file is missing and builds without a file', () => {
    const def = buildUserStampDefinition({ ...record, edits: { shapes: [markerImage, line] } }, source, undefined);
    expect(def.shapes).toEqual([line]);
    expect(def.iconRef).toBe('');
    expect(buildUserStampDefinition(record, source, undefined).shapes).toEqual([]);
  });

  it('applies the category override and port groups', () => {
    const def = buildUserStampDefinition({ ...record, edits: { category: 'equipment', definitionPortGroups: [['a', 'b']] } }, source, 'blob:abc');
    expect(def.category).toBe('equipment');
    expect(def.definitionPortGroups).toEqual([['a', 'b']]);
  });

  it('round-trips through toUserStampEdits with the marker', () => {
    const def = buildUserStampDefinition({ ...record, edits: { label: 'Fan', category: 'equipment', shapes: [markerImage, line], definitionPortGroups: [['a', 'b']] } }, source, 'data:image/svg+xml;base64,QQ==');
    const edits = toUserStampEdits(def, 'data:image/svg+xml;base64,QQ==');
    expect(edits.shapes).toEqual([markerImage, line]);
    expect(edits.category).toBe('equipment');
    expect(edits.label).toBe('Fan');
    expect(edits.definitionPortGroups).toEqual([['a', 'b']]);
    expect(usesUserStampFile(edits)).toBe(true);
  });

  it('keeps a foreign image shape and omits a fitting category', () => {
    const other: SymbolShape = { ...markerImage, dataUrl: 'data:image/png;base64,OTHER' };
    const def = { ...buildUserStampDefinition(record, source, 'blob:abc'), category: 'fitting' as const, shapes: [other] };
    const edits = toUserStampEdits(def, 'data:image/png;base64,FILE');
    expect(edits.shapes).toEqual([other]);
    expect(edits.category).toBeUndefined();
    expect(usesUserStampFile(edits)).toBe(false);
    expect(toUserStampEdits(def, undefined).shapes).toEqual([other]);
  });

  it('usesUserStampFile is true without shapes and false for shapes without the marker', () => {
    expect(usesUserStampFile({})).toBe(true);
    expect(usesUserStampFile({ shapes: [line] })).toBe(false);
    expect(usesUserStampFile({ shapes: [] })).toBe(false);
    expect(SAVED_STAMPS_SOURCE_ID).toBe('saved');
  });
});
