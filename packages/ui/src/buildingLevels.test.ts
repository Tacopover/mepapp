import { addLevel, deleteLevel, emptyBuilding, type BuildingFile } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import {
  countLabel,
  defaultLevelName,
  deleteBlockedText,
  nextLevelElevation,
  restoreLevel,
  sheetCount,
} from './buildingLevels.js';

function withLevels(elevations: number[]): BuildingFile {
  return elevations.reduce((file, elevation, index) => addLevel(file, `L${index}`, elevation, `level-${index}`), emptyBuilding('b1', 'Test'));
}

function withSheets(file: BuildingFile, levelIds: string[]): BuildingFile {
  return {
    ...file,
    sheets: levelIds.map((levelId, index) => ({
      id: `sheet-${index}`,
      levelId,
      projectUuid: null,
      pageIndex: index,
      displayName: `Sheet ${index}`,
      location: { fileName: 'plan.pdf' },
    })),
  };
}

describe('sheetCount', () => {
  it('counts only the sheets of the given level', () => {
    const file = withSheets(withLevels([0, 3000]), ['level-0', 'level-0', 'level-1']);
    expect(sheetCount(file, 'level-0')).toBe(2);
    expect(sheetCount(file, 'level-1')).toBe(1);
    expect(sheetCount(file, 'unknown')).toBe(0);
  });
});

describe('nextLevelElevation', () => {
  it('returns 0 for a file with no level', () => {
    expect(nextLevelElevation(emptyBuilding('b1', 'Test'))).toBe(0);
  });

  it('adds 3000 to the highest elevation', () => {
    expect(nextLevelElevation(withLevels([0, 3000, 6000]))).toBe(9000);
  });

  it('uses a negative highest elevation', () => {
    expect(nextLevelElevation(withLevels([-6000, -3000]))).toBe(0);
  });

  it('gives 3000 for levels at -3000 and 0', () => {
    expect(nextLevelElevation(withLevels([-3000, 0]))).toBe(3000);
  });
});

describe('countLabel', () => {
  it('uses the singular for 1', () => {
    expect(countLabel(1, 'level')).toBe('1 level');
  });

  it('adds s for other counts', () => {
    expect(countLabel(2, 'level')).toBe('2 levels');
    expect(countLabel(0, 'sheet')).toBe('0 sheets');
  });

  it('uses the given plural', () => {
    expect(countLabel(2, 'entry', 'entries')).toBe('2 entries');
  });
});

describe('defaultLevelName', () => {
  it('names the first level Level 1', () => {
    expect(defaultLevelName(emptyBuilding('b1', 'Test'))).toBe('Level 1');
  });

  it('names a new level after the existing count', () => {
    expect(defaultLevelName(withLevels([0, 3000]))).toBe('Level 3');
  });
});

describe('deleteBlockedText', () => {
  it('returns null for a level with no sheet', () => {
    expect(deleteBlockedText(withLevels([0]), 'level-0')).toBeNull();
  });

  it('names one sheet in the singular', () => {
    const file = withSheets(withLevels([0]), ['level-0']);
    expect(deleteBlockedText(file, 'level-0')).toBe('This level has 1 sheet. Move or remove it to delete the level.');
  });

  it('names several sheets in the plural', () => {
    const file = withSheets(withLevels([0]), ['level-0', 'level-0']);
    expect(deleteBlockedText(file, 'level-0')).toBe('This level has 2 sheets. Move or remove them to delete the level.');
  });
});

describe('restoreLevel', () => {
  const file = withLevels([0, 3000, 6000]);
  const middle = file.levels[1]!;
  const removed = deleteLevel(file, 'level-1');
  const withoutMiddle = removed.ok ? removed.file : file;

  it('puts a level back at its index', () => {
    expect(restoreLevel(withoutMiddle, middle, 1).levels.map((level) => level.id)).toEqual(['level-0', 'level-1', 'level-2']);
  });

  it('puts a level back at the start', () => {
    expect(restoreLevel(withoutMiddle, middle, 0).levels[0]!.id).toBe('level-1');
  });

  it('clamps an index beyond the end to the end', () => {
    expect(restoreLevel(withoutMiddle, middle, 99).levels.map((level) => level.id)).toEqual(['level-0', 'level-2', 'level-1']);
  });

  it('returns the file unchanged when a level with that id exists', () => {
    expect(restoreLevel(file, file.levels[0]!, 2)).toBe(file);
  });
});
