import { describe, expect, it } from 'vitest';
import { emptyBuilding, type BuildingFile, type BuildingSheet } from '@mepapp/core';
import { matchingMintedIds, mintedAdoptions } from './adoptSheetId.js';

const sheetOf = (id: string, projectUuid: string | null, options: { path?: string; fileName?: string; sizeBytes?: number; minted?: boolean } = {}): BuildingSheet => ({
  id,
  levelId: 'L1',
  projectUuid,
  ...(options.minted === true ? { idMinted: true as const } : {}),
  pageIndex: 0,
  displayName: `Sheet ${id}`,
  location: { fileName: options.fileName ?? 'a.pdf', path: options.path, sizeBytes: options.sizeBytes ?? 1000 },
});

const buildingOf = (sheets: BuildingSheet[]): BuildingFile => ({ ...emptyBuilding('b1', 'Block'), sheets });

describe('matchingMintedIds', () => {
  it('gives the distinct minted ids of the sheets matched by path, in sheet order', () => {
    const file = buildingOf([
      sheetOf('s1', 'mint-b', { path: 'C:/a.pdf', minted: true, sizeBytes: 1 }),
      sheetOf('s2', 'mint-a', { path: 'C:/a.pdf', minted: true, sizeBytes: 1 }),
      sheetOf('s3', 'mint-b', { path: 'C:/a.pdf', minted: true, sizeBytes: 1 }),
    ]);
    expect(matchingMintedIds(file, { path: 'C:/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 })).toEqual(['mint-b', 'mint-a']);
  });

  it('leaves out sheets that are not minted', () => {
    const file = buildingOf([sheetOf('s1', 'real-1', { path: 'C:/a.pdf' }), sheetOf('s2', null, { path: 'C:/a.pdf' })]);
    expect(matchingMintedIds(file, { path: 'C:/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 })).toEqual([]);
  });

  it('does not count a weak match when the document and the sheet both have a path', () => {
    const file = buildingOf([sheetOf('s1', 'mint-1', { path: 'D:/elsewhere/a.pdf', minted: true })]);
    expect(matchingMintedIds(file, { path: 'C:/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 })).toEqual([]);
  });

  it('matches by file name and size when the document has no path', () => {
    const file = buildingOf([sheetOf('s1', 'mint-1', { path: 'D:/elsewhere/a.pdf', minted: true })]);
    expect(matchingMintedIds(file, { fileName: 'a.pdf', sizeBytes: 1000 })).toEqual(['mint-1']);
  });

  it('matches by file name and size when the sheet has no path', () => {
    const file = buildingOf([sheetOf('s1', 'mint-1', { minted: true })]);
    expect(matchingMintedIds(file, { path: 'C:/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 })).toEqual(['mint-1']);
  });

  it('gives an empty list for an empty file', () => {
    expect(matchingMintedIds(buildingOf([]), { path: 'C:/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 })).toEqual([]);
  });
});

describe('mintedAdoptions', () => {
  const file = buildingOf([sheetOf('s1', 'mint-1', { path: 'C:/a.pdf', minted: true })]);
  const doc = { id: 'd1', fileName: 'a.pdf', sizeBytes: 1000, projectUuid: null, projectUuidInFile: false };

  it('gives the minted id to an open document that does not hold its id in the file', () => {
    expect(mintedAdoptions(file, [doc], new Map([['d1', { path: 'C:/a.pdf' }]]))).toEqual([{ documentId: 'd1', projectUuid: 'mint-1' }]);
  });

  it('skips a document that holds its id in the file', () => {
    expect(mintedAdoptions(file, [{ ...doc, projectUuidInFile: true }], new Map([['d1', { path: 'C:/a.pdf' }]]))).toEqual([]);
  });

  it('skips a document with no size', () => {
    expect(mintedAdoptions(file, [{ ...doc, sizeBytes: null }], new Map([['d1', { path: 'C:/a.pdf' }]]))).toEqual([]);
  });

  it('skips a document that already has the first minted id', () => {
    expect(mintedAdoptions(file, [{ ...doc, projectUuid: 'mint-1' }], new Map([['d1', { path: 'C:/a.pdf' }]]))).toEqual([]);
  });

  it('gives the new id when the document has another id', () => {
    expect(mintedAdoptions(file, [{ ...doc, projectUuid: 'other' }], new Map([['d1', { path: 'C:/a.pdf' }]]))).toEqual([
      { documentId: 'd1', projectUuid: 'mint-1' },
    ]);
  });

  it('skips a document with no matching minted sheet', () => {
    expect(mintedAdoptions(file, [{ ...doc, fileName: 'b.pdf' }], new Map([['d1', { path: 'C:/b.pdf' }]]))).toEqual([]);
  });
});
