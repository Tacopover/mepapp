import { describe, expect, it } from 'vitest';
import type { BuildingFile, BuildingSheet } from '@mepapp/core';
import {
  CHANGED_ROW_LINE,
  changedCancelText,
  changedManyUseText,
  changedPromptText,
  changedRowLine,
  changedUseNotice,
  isChangedFile,
  lostPageNumbers,
  sheetChoice,
  sheetGroupsOfName,
  sheetWithNewFile,
  splitChangedPicks,
  twoChangedText,
  type ChangedItem,
} from './changedFile.js';

const sheetOf = (fileName: string, sizeBytes: number | undefined, pageIndex = 0, path?: string): BuildingSheet =>
  ({
    id: `s-${path ?? ''}${fileName}-${pageIndex}`,
    levelId: 'L1',
    projectUuid: null,
    pageIndex,
    displayName: fileName,
    location: { fileName, sizeBytes, ...(path === undefined ? {} : { path }) },
  }) as BuildingSheet;

const fileOfSheets = (...sheets: BuildingSheet[]): BuildingFile => ({ sheets }) as unknown as BuildingFile;

const itemOf = (fileName: string, sheets: number, lostPages: number[] = [], pageCount: number | null = 1): ChangedItem => ({
  fileName,
  opened: { file: new File(['x'], fileName) },
  sheetIds: Array.from({ length: sheets }, (_, index) => `${fileName}-${index}`),
  projectUuid: null,
  pageCount,
  lostPages,
});

describe('isChangedFile', () => {
  const file = fileOfSheets(sheetOf('a.pdf', 3), sheetOf('b.pdf', undefined));

  it('is true for the name of a sheet with another size', () => {
    expect(isChangedFile(file, 'a.pdf', 9)).toBe(true);
  });

  it('is false when a sheet has the same name and size', () => {
    expect(isChangedFile(fileOfSheets(sheetOf('a.pdf', 3), sheetOf('a.pdf', 9, 1)), 'a.pdf', 9)).toBe(false);
    expect(isChangedFile(file, 'a.pdf', 3)).toBe(false);
  });

  it('is false for an unknown name', () => {
    expect(isChangedFile(file, 'c.pdf', 3)).toBe(false);
  });

  it('is false when the sheet has no size', () => {
    expect(isChangedFile(file, 'b.pdf', 9)).toBe(false);
  });
});

describe('sheetGroupsOfName', () => {
  it('groups the sheets of two PDFs with one name', () => {
    const file = fileOfSheets(
      sheetOf('a.pdf', 3, 0, 'one'),
      sheetOf('a.pdf', 3, 1, 'one'),
      sheetOf('a.pdf', 5, 0, 'two'),
      sheetOf('b.pdf', 4),
      sheetOf('a.pdf', undefined, 2, 'three'),
    );
    const groups = sheetGroupsOfName(file, 'a.pdf');
    expect(groups).toHaveLength(2);
    expect(groups[0]!.map((sheet) => sheet.pageIndex)).toEqual([0, 1]);
    expect(groups[1]!).toHaveLength(1);
  });

  it('gives one group for one PDF and none for an unknown name', () => {
    const file = fileOfSheets(sheetOf('a.pdf', 3, 0), sheetOf('a.pdf', 3, 1));
    expect(sheetGroupsOfName(file, 'a.pdf')).toHaveLength(1);
    expect(sheetGroupsOfName(file, 'x.pdf')).toEqual([]);
  });
});

describe('lostPageNumbers', () => {
  it('gives sorted unique 1-based page numbers beyond the page count', () => {
    const sheets = [sheetOf('a.pdf', 3, 4), sheetOf('a.pdf', 3, 0), sheetOf('a.pdf', 3, 2), sheetOf('a.pdf', 3, 2, 'x')];
    expect(lostPageNumbers(sheets, 2)).toEqual([3, 5]);
    expect(lostPageNumbers(sheets, 9)).toEqual([]);
  });
});

describe('texts', () => {
  it('asks for one sheet', () => {
    expect(changedPromptText([itemOf('a.pdf', 1)])).toBe('a.pdf changed. Use the new file for this sheet?');
  });

  it('asks for three sheets', () => {
    expect(changedPromptText([itemOf('a.pdf', 3)])).toBe('a.pdf changed. Use the new file for 3 sheets?');
  });

  it('names one lost page', () => {
    expect(changedPromptText([itemOf('a.pdf', 3, [3], 2)])).toBe(
      'a.pdf changed. Use the new file for 3 sheets? The new file has 2 pages. The sheet for page 3 cannot open.',
    );
  });

  it('names two lost pages and one page of the new file', () => {
    expect(changedPromptText([itemOf('a.pdf', 3, [2, 3], 1)])).toBe(
      'a.pdf changed. Use the new file for 3 sheets? The new file has 1 page. The sheets for pages 2, 3 cannot open.',
    );
  });

  it('asks for two PDFs', () => {
    expect(changedPromptText([itemOf('a.pdf', 2), itemOf('b.pdf', 1)])).toBe(
      '2 PDFs changed: a.pdf, b.pdf. Use the new files for 3 sheets?',
    );
  });

  it('asks for five PDFs with lost pages', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((name, index) => itemOf(`${name}.pdf`, 1, index < 2 ? [2] : [], 1));
    expect(changedPromptText(items)).toBe(
      '5 PDFs changed: a.pdf, b.pdf, c.pdf and 2 more. Use the new files for 5 sheets? 2 sheets are for pages that are not in the new files.',
    );
    expect(changedPromptText([itemOf('a.pdf', 1, [2]), itemOf('b.pdf', 1)])).toBe(
      '2 PDFs changed: a.pdf, b.pdf. Use the new files for 2 sheets? 1 sheet is for a page that is not in the new file.',
    );
  });

  it('gives the notice after a row yes', () => {
    expect(changedUseNotice(itemOf('a.pdf', 3))).toBe('Using the new a.pdf for 3 sheets.');
    expect(changedUseNotice(itemOf('a.pdf', 1))).toBe('Using the new a.pdf for 1 sheet.');
    expect(changedUseNotice(itemOf('plan-L1.pdf', 3, [3], 2))).toBe(
      'Using the new plan-L1.pdf for 3 sheets. The sheet for page 3 of plan-L1.pdf cannot open. Remove it, or choose another file.',
    );
  });

  it('gives the text after a many yes', () => {
    expect(changedManyUseText([itemOf('a.pdf', 2), itemOf('b.pdf', 1)])).toBe('Using the new files for 2 PDFs (3 sheets).');
    expect(changedManyUseText([itemOf('a.pdf', 2, [3], 2), itemOf('b.pdf', 1)])).toBe(
      'Using the new files for 2 PDFs (3 sheets). The sheet for page 3 of a.pdf cannot open. Remove it, or choose another file.',
    );
  });

  it('gives the text after a cancel', () => {
    expect(changedCancelText([itemOf('a.pdf', 1)])).toBe('a.pdf changed and was not used.');
    expect(changedCancelText([itemOf('A.pdf', 1), itemOf('B.pdf', 1), itemOf('C.pdf', 1)])).toBe(
      '3 PDFs changed and were not used: A.pdf, B.pdf, C.pdf.',
    );
    expect(changedCancelText(['a', 'b', 'c', 'd'].map((name) => itemOf(`${name}.pdf`, 1)))).toBe(
      '4 PDFs changed and were not used: a.pdf, b.pdf, c.pdf and 1 more.',
    );
  });

  it('gives the text for two changed files', () => {
    expect(twoChangedText(['a.pdf', 'b.pdf'], 'folder')).toBe(
      'For a.pdf, b.pdf the folder has two different files with another size. The app cannot tell which one to use. Use Choose file… on its row.',
    );
    expect(twoChangedText(['a.pdf'], 'picked')).toBe(
      'For a.pdf you chose two different files with another size. The app cannot tell which one to use. Use Choose file… on its row.',
    );
  });

  it('gives the row line', () => {
    expect(changedRowLine()).toBe(CHANGED_ROW_LINE);
    expect(CHANGED_ROW_LINE).toBe('The PDF changed after it was added. Click Choose file… and use the new file.');
  });
});

describe('splitChangedPicks', () => {
  const file = fileOfSheets(sheetOf('a.pdf', 3), sheetOf('b.pdf', 5));
  const pick = (name: string, size: number) => ({ file: { name, size } });

  it('keeps a changed file', () => {
    const picked = [pick('a.pdf', 4), pick('c.pdf', 9)];
    expect(splitChangedPicks(file, picked)).toEqual({ changed: [picked[0]], dropped: [] });
  });

  it('drops a changed file when the same pick holds the exact file', () => {
    const picked = [pick('a.pdf', 4), pick('a.pdf', 3), pick('b.pdf', 6)];
    expect(splitChangedPicks(file, picked)).toEqual({ changed: [picked[2]], dropped: [picked[0]] });
  });
});

describe('sheetChoice', () => {
  const first = sheetOf('a.pdf', 3, 0);
  const second = sheetOf('a.pdf', 3, 1);
  const file = fileOfSheets(first, second);

  it('takes the preferred sheet of the ids', () => {
    expect(sheetChoice(file, [first.id, second.id], second.id)).toBe(second);
  });

  it('falls back to the first sheet that is in the file', () => {
    expect(sheetChoice(file, ['gone', second.id], first.id)).toBe(second);
    expect(sheetChoice(file, [first.id, second.id], null)).toBe(first);
    expect(sheetChoice(file, ['gone'], null)).toBeUndefined();
  });
});

describe('sheetWithNewFile', () => {
  it('sets the new name and size and keeps the project id unless the item has one', () => {
    const sheet = { ...sheetOf('a.pdf', 3), projectUuid: 'old' };
    const item = { ...itemOf('a.pdf', 1), opened: { file: new File(['xxxx'], 'a.pdf') } } as ChangedItem;
    const kept = sheetWithNewFile(sheet, item);
    expect(kept.projectUuid).toBe('old');
    expect(kept.location).toMatchObject({ fileName: 'a.pdf', sizeBytes: 4 });
    expect(sheetWithNewFile(sheet, { ...item, projectUuid: 'new' }).projectUuid).toBe('new');
  });
});
