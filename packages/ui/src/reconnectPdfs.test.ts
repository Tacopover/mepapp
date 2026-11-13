import { describe, expect, it } from 'vitest';
import type { BuildingSheet } from '@mepapp/core';
import { SheetFileCache } from './sheetFileCache.js';
import {
  pdfsNeedingFile,
  reconnectHint,
  reconnectResult,
  reconnectTooltip,
  type PdfNeed,
  type ReconnectInput,
} from './reconnectPdfs.js';

const sheetOf = (fileName: string, sizeBytes?: number, pageIndex = 0): BuildingSheet => ({
  id: `s-${fileName}-${pageIndex}`,
  levelId: 'L1',
  projectUuid: null,
  pageIndex,
  displayName: fileName,
  location: { fileName, sizeBytes },
});

const needOf = (fileName: string, sizeBytes: number): PdfNeed => ({ fileName, sizeBytes, sheet: sheetOf(fileName, sizeBytes) });

const keysOf = (...files: { name: string; size: number }[]): Set<string> =>
  new Set(files.map((file) => SheetFileCache.key(file.name, file.size)));

const never = () => false;
const onlyNamed = (names: string[]) => (need: PdfNeed) => names.includes(need.fileName);

describe('pdfsNeedingFile', () => {
  it('lists one entry per distinct file name and size, in order of first appearance', () => {
    const sheets = [sheetOf('a.pdf', 3, 0), sheetOf('b.pdf', 4, 0), sheetOf('a.pdf', 5, 0), sheetOf('a.pdf', 3, 1)];
    const needed = pdfsNeedingFile(sheets, never);
    expect(needed.map((need) => `${need.fileName}:${need.sizeBytes}`)).toEqual(['a.pdf:3', 'b.pdf:4', 'a.pdf:5']);
  });

  it('gives one entry for a PDF with many pages', () => {
    const sheets = [0, 1, 2, 3, 4].map((page) => sheetOf('plan.pdf', 9, page));
    const needed = pdfsNeedingFile(sheets, never);
    expect(needed).toHaveLength(1);
    expect(needed[0]?.sheet).toBe(sheets[0]);
  });

  it('skips sheets with no size', () => {
    expect(pdfsNeedingFile([sheetOf('a.pdf')], never)).toEqual([]);
  });

  it('skips sheets that canOpen reports as openable', () => {
    const sheets = [sheetOf('a.pdf', 3), sheetOf('b.pdf', 4)];
    const needed = pdfsNeedingFile(sheets, (sheet) => sheet.location.fileName === 'a.pdf');
    expect(needed.map((need) => need.fileName)).toEqual(['b.pdf']);
  });
});

describe('pdfsNeedingFile with opened sheets', () => {
  it('skips sheets that are opened in the viewer', () => {
    const sheets = [sheetOf('a.pdf', 3), sheetOf('b.pdf', 4)];
    const needed = pdfsNeedingFile(sheets, never, new Set([sheets[0]!.id]));
    expect(needed.map((need) => need.fileName)).toEqual(['b.pdf']);
  });

  it('keeps a PDF that another, not opened sheet still needs', () => {
    const sheets = [sheetOf('a.pdf', 3, 0), sheetOf('a.pdf', 3, 1)];
    const needed = pdfsNeedingFile(sheets, never, new Set([sheets[0]!.id]));
    expect(needed).toHaveLength(1);
    expect(needed[0]?.sheet).toBe(sheets[1]);
  });
});

describe('reconnectHint and reconnectTooltip', () => {
  it('has the singular hint for one PDF', () => {
    expect(reconnectHint(1)).toBe('1 PDF needs a file before it opens. Choose it again.');
  });

  it('has the plural hint for many PDFs', () => {
    expect(reconnectHint(9)).toBe('9 PDFs need a file before they open. Choose them all in one step.');
  });

  it('names the level in the tooltip for a level node', () => {
    expect(reconnectTooltip(true)).toBe(
      'Choose the PDF files of this level. The app finds the sheets by file name and size. No sheet is added or changed.',
    );
  });

  it('names the building in the tooltip for the building node', () => {
    expect(reconnectTooltip(false)).toBe(
      'Choose the PDF files of this building. The app finds the sheets by file name and size. No sheet is added or changed.',
    );
  });
});

describe('reconnectResult', () => {
  it('reports one found PDF', () => {
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3)],
      picked: [{ name: 'a.pdf', size: 3 }],
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }),
      isFound: () => true,
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({ text: 'Found the PDF.', error: false });
  });

  it('reports all found PDFs', () => {
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3), needOf('b.pdf', 4)],
      picked: [{ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }],
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }),
      isFound: () => true,
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({ text: 'Found all 2 PDFs.', error: false });
  });

  it('adds the other level and not used parts after all found', () => {
    const picked = [
      { name: 'a.pdf', size: 3 },
      { name: 'b.pdf', size: 4 },
      { name: 'o1.pdf', size: 5 },
      { name: 'o2.pdf', size: 6 },
      { name: 'x1.pdf', size: 7 },
      { name: 'x2.pdf', size: 8 },
      { name: 'x3.pdf', size: 9 },
    ];
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3), needOf('b.pdf', 4)],
      picked,
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }, { name: 'o1.pdf', size: 5 }, { name: 'o2.pdf', size: 6 }),
      isFound: () => true,
      isAmbiguous: never,
      levelScope: true,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found all 2 PDFs. 2 files are for other levels. 3 files were not used.',
      error: false,
    });
  });

  it('lists the missing PDFs after a partial result', () => {
    const picked = [{ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }, { name: 'x1.pdf', size: 5 }, { name: 'x2.pdf', size: 6 }, { name: 'x3.pdf', size: 7 }];
    const needed = [needOf('a.pdf', 3), needOf('b.pdf', 4), needOf('c.pdf', 5), needOf('d.pdf', 6)];
    const input: ReconnectInput = {
      needed,
      picked,
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }, { name: 'c.pdf', size: 5 }, { name: 'd.pdf', size: 6 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'b.pdf', size: 4 }, { name: 'c.pdf', size: 5 }, { name: 'd.pdf', size: 6 }),
      isFound: onlyNamed(['a.pdf', 'b.pdf']),
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 2 of 4 PDFs. Missing: c.pdf, d.pdf. 3 files were not used.',
      error: false,
    });
  });

  it('shortens a missing list of more than three names', () => {
    const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
    const needed = names.map((name, index) => needOf(`${name}.pdf`, index + 3));
    const picked = names.slice(0, 4).map((name, index) => ({ name: `${name}.pdf`, size: index + 3 }));
    const input: ReconnectInput = {
      needed,
      picked,
      scopeKeys: keysOf(...needed.map((need) => ({ name: need.fileName, size: need.sizeBytes }))),
      buildingKeys: keysOf(...needed.map((need) => ({ name: need.fileName, size: need.sizeBytes }))),
      isFound: onlyNamed(['p1.pdf', 'p2.pdf', 'p3.pdf', 'p4.pdf']),
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 4 of 9 PDFs. Missing: p5.pdf, p6.pdf, p7.pdf and 2 more.',
      error: false,
    });
  });

  it('reports zero found with the none-of text for several picked files', () => {
    const needed = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].map((name, index) => needOf(`${name}.pdf`, index + 3));
    const picked = [
      { name: 'x1.pdf', size: 90 },
      { name: 'x2.pdf', size: 91 },
      { name: 'x3.pdf', size: 92 },
      { name: 'x4.pdf', size: 93 },
    ];
    const input: ReconnectInput = {
      needed,
      picked,
      scopeKeys: keysOf(...needed.map((need) => ({ name: need.fileName, size: need.sizeBytes }))),
      buildingKeys: keysOf(...needed.map((need) => ({ name: need.fileName, size: need.sizeBytes }))),
      isFound: never,
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 0 of 9 PDFs. None of the 4 files you chose has the same name and size as a PDF of the sheets here. Missing: p1.pdf, p2.pdf, p3.pdf and 6 more. 4 files were not used.',
      error: true,
    });
  });

  it('reports zero found with the singular none-of text for one picked file', () => {
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3)],
      picked: [{ name: 'x.pdf', size: 9 }],
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }),
      isFound: never,
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 0 of 1 PDF. The file you chose does not have the same name and size as a PDF of the sheets here. Missing: a.pdf. 1 file was not used.',
      error: true,
    });
  });

  it('names a PDF with two different files under one name and size', () => {
    const input: ReconnectInput = {
      needed: [needOf('c.pdf', 3), needOf('d.pdf', 4)],
      picked: [{ name: 'c.pdf', size: 3 }, { name: 'c.pdf', size: 3 }, { name: 'd.pdf', size: 4 }],
      scopeKeys: keysOf({ name: 'c.pdf', size: 3 }, { name: 'd.pdf', size: 4 }),
      buildingKeys: keysOf({ name: 'c.pdf', size: 3 }, { name: 'd.pdf', size: 4 }),
      isFound: onlyNamed(['d.pdf']),
      isAmbiguous: onlyNamed(['c.pdf']),
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 1 of 2 PDFs. Missing: c.pdf. For c.pdf you chose two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.',
      error: false,
    });
  });

  it('names two PDFs with two different files each', () => {
    const input: ReconnectInput = {
      needed: [needOf('c.pdf', 3), needOf('d.pdf', 4)],
      picked: [{ name: 'c.pdf', size: 3 }, { name: 'c.pdf', size: 3 }, { name: 'd.pdf', size: 4 }, { name: 'd.pdf', size: 4 }],
      scopeKeys: keysOf({ name: 'c.pdf', size: 3 }, { name: 'd.pdf', size: 4 }),
      buildingKeys: keysOf({ name: 'c.pdf', size: 3 }, { name: 'd.pdf', size: 4 }),
      isFound: never,
      isAmbiguous: () => true,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 0 of 2 PDFs. Missing: c.pdf, d.pdf. For c.pdf, d.pdf you chose two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.',
      error: true,
    });
  });

  it('reports zero found with the two-file text and no none-of text when files match only through ambiguity', () => {
    const input: ReconnectInput = {
      needed: [needOf('c.pdf', 3)],
      picked: [{ name: 'c.pdf', size: 3 }, { name: 'c.pdf', size: 3 }],
      scopeKeys: keysOf({ name: 'c.pdf', size: 3 }),
      buildingKeys: keysOf({ name: 'c.pdf', size: 3 }),
      isFound: never,
      isAmbiguous: () => true,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({
      text: 'Found 0 of 1 PDF. Missing: c.pdf. For c.pdf you chose two different files with the same name and size. The app cannot tell which one to use. Use Choose file… on its row.',
      error: true,
    });
  });

  it('reports one file for another level on a level node', () => {
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3)],
      picked: [{ name: 'a.pdf', size: 3 }, { name: 'o.pdf', size: 5 }],
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'o.pdf', size: 5 }),
      isFound: () => true,
      isAmbiguous: never,
      levelScope: true,
    };
    expect(reconnectResult(input)).toEqual({ text: 'Found the PDF. 1 file is for another level.', error: false });
  });

  it('reports one file that was not used', () => {
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3)],
      picked: [{ name: 'a.pdf', size: 3 }, { name: 'x.pdf', size: 9 }],
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }),
      isFound: () => true,
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({ text: 'Found the PDF. 1 file was not used.', error: false });
  });

  it('never names other levels on the building node', () => {
    const input: ReconnectInput = {
      needed: [needOf('a.pdf', 3)],
      picked: [{ name: 'a.pdf', size: 3 }, { name: 'o.pdf', size: 5 }],
      scopeKeys: keysOf({ name: 'a.pdf', size: 3 }),
      buildingKeys: keysOf({ name: 'a.pdf', size: 3 }, { name: 'o.pdf', size: 5 }),
      isFound: () => true,
      isAmbiguous: never,
      levelScope: false,
    };
    expect(reconnectResult(input)).toEqual({ text: 'Found the PDF.', error: false });
  });
});
