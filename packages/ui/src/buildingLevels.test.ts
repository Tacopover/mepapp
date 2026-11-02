import { addLevel, emptyBuilding, type BuildingFile } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import { countLabel, deleteBlockedReason, nextLevelElevation, sheetCount } from './buildingLevels.js';

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

describe('deleteBlockedReason', () => {
  it('returns null for a level with no sheet', () => {
    expect(deleteBlockedReason(withLevels([0]), 'level-0')).toBeNull();
  });

  it('returns null for an unknown level id', () => {
    expect(deleteBlockedReason(withLevels([0]), 'unknown')).toBeNull();
  });

  it('names one sheet in the singular', () => {
    const file = withSheets(withLevels([0]), ['level-0']);
    expect(deleteBlockedReason(file, 'level-0')).toBe('This level has 1 sheet. Move or remove the sheet first.');
  });

  it('names several sheets in the plural', () => {
    const file = withSheets(withLevels([0]), ['level-0', 'level-0', 'level-0']);
    expect(deleteBlockedReason(file, 'level-0')).toBe('This level has 3 sheets. Move or remove the sheets first.');
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
