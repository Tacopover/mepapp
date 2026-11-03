import { addLevel, emptyBuilding, type BuildingFile } from '@mepapp/core';
import { describe, expect, it } from 'vitest';
import {
  ADD_LEVEL_KEY,
  buildingKey,
  buildingWarnings,
  buildTreeNodes,
  currentSheetLevelId,
  initialSelection,
  levelKey,
  moveFocus,
  NOT_PLACED_KEY,
  warningLines,
  type TreeInput,
} from './buildingTree.js';

function withLevels(elevations: number[], id = 'b1', name = 'Tower'): BuildingFile {
  return elevations.reduce((file, elevation, index) => addLevel(file, `L${index}`, elevation, `level-${index}`), emptyBuilding(id, name));
}

function withSheets(file: BuildingFile, levelIds: string[]): BuildingFile {
  return {
    ...file,
    sheets: levelIds.map((levelId, index) => ({
      id: `sheet-${index}`,
      levelId,
      projectUuid: `uuid-${index}`,
      pageIndex: 0,
      displayName: `Sheet ${index}`,
      location: { fileName: `plan${index}.pdf` },
    })),
  };
}

const recent = [
  { id: 'b1', name: 'Tower', location: 'C:/tower.json' },
  { id: 'b2', name: 'Zeta', location: 'C:/zeta.json' },
];

function input(overrides: Partial<TreeInput> = {}): TreeInput {
  return { recent, open: null, sheetStatus: {}, notPlacedCount: 0, collapsed: new Set(), ...overrides };
}

describe('buildTreeNodes', () => {
  it('lists the recent buildings when no building is open', () => {
    const nodes = buildTreeNodes(input());
    expect(nodes.map((n) => n.key)).toEqual(['b:b1', 'b:b2']);
    expect(nodes.every((n) => n.kind === 'building' && !n.isOpen && !n.expandable)).toBe(true);
    expect(nodes[0]!.entry).toEqual(recent[0]);
  });

  it('expands the open building with its levels and sheet counts', () => {
    const file = withSheets(withLevels([0, 3000]), ['level-0', 'level-0', 'level-1']);
    const nodes = buildTreeNodes(input({ open: { file, location: 'C:/tower.json' } }));
    expect(nodes.map((n) => n.key)).toEqual(['b:b1', 'l:level-0', 'l:level-1', ADD_LEVEL_KEY, 'b:b2']);
    expect(nodes[0]).toMatchObject({ isOpen: true, expandable: true, expanded: true });
    expect(nodes[1]).toMatchObject({ kind: 'level', depth: 2, parentKey: 'b:b1', label: 'L0', detail: '2 sheets' });
    expect(nodes[2]!.detail).toBe('1 sheet');
  });

  it('adds the add-level node after the levels of the open building', () => {
    const file = withLevels([0, 3000]);
    const nodes = buildTreeNodes(input({ open: { file, location: 'x' } }));
    const add = nodes.find((n) => n.key === ADD_LEVEL_KEY);
    expect(add).toMatchObject({
      kind: 'add-level',
      depth: 2,
      parentKey: 'b:b1',
      label: '+ Add level',
      detail: null,
      isOpen: false,
      expandable: false,
      expanded: false,
      warning: false,
      entry: null,
    });
    expect(nodes.indexOf(add!)).toBe(3);
  });

  it('places the add-level node before the Not placed node', () => {
    const file = withLevels([0]);
    const nodes = buildTreeNodes(input({ open: { file, location: 'x' }, notPlacedCount: 2 }));
    expect(nodes.map((n) => n.key)).toEqual(['b:b1', 'l:level-0', ADD_LEVEL_KEY, 'p:not-placed', 'b:b2']);
  });

  it('omits the add-level node when the building is collapsed or not open', () => {
    const file = withLevels([0]);
    const collapsed = buildTreeNodes(input({ open: { file, location: 'x' }, collapsed: new Set(['b:b1']) }));
    expect(collapsed.some((n) => n.key === ADD_LEVEL_KEY)).toBe(false);
    const closed = buildTreeNodes(input());
    expect(closed.some((n) => n.key === ADD_LEVEL_KEY)).toBe(false);
  });

  it('takes the name of the open file for the open building', () => {
    const file = withLevels([0], 'b1', 'Renamed');
    const nodes = buildTreeNodes(input({ open: { file, location: 'x' } }));
    expect(nodes[0]!.label).toBe('Renamed');
  });

  it('adds the open building when the recent list does not hold it', () => {
    const file = withLevels([0], 'b9', 'Dev');
    const nodes = buildTreeNodes(input({ open: { file, location: 'dev' } }));
    expect(nodes.map((n) => n.key)).toEqual(['b:b9', 'l:level-0', ADD_LEVEL_KEY, 'b:b1', 'b:b2']);
    expect(nodes[0]!.entry).toEqual({ id: 'b9', name: 'Dev', location: 'dev' });
  });

  it('hides the children of a collapsed open building', () => {
    const file = withLevels([0, 3000]);
    const nodes = buildTreeNodes(input({ open: { file, location: 'x' }, collapsed: new Set(['b:b1']) }));
    expect(nodes.map((n) => n.key)).toEqual(['b:b1', 'b:b2']);
    expect(nodes[0]).toMatchObject({ expandable: true, expanded: false });
  });

  it('sets a warning dot only for a level with a missing or no-access sheet', () => {
    const file = withSheets(withLevels([0, 3000, 6000]), ['level-0', 'level-1', 'level-2']);
    const nodes = buildTreeNodes(
      input({ open: { file, location: 'x' }, sheetStatus: { 'sheet-0': 'pdf-missing', 'sheet-1': 'no-access', 'sheet-2': 'no-summary' } }),
    );
    const dots = nodes.filter((n) => n.kind === 'level').map((n) => n.warning);
    expect(dots).toEqual([true, true, false]);
  });

  it('shows the Not placed node only when pages wait', () => {
    const file = withLevels([0]);
    const none = buildTreeNodes(input({ open: { file, location: 'x' } }));
    expect(none.some((n) => n.key === NOT_PLACED_KEY)).toBe(false);
    const some = buildTreeNodes(input({ open: { file, location: 'x' }, notPlacedCount: 3 }));
    const node = some.find((n) => n.key === NOT_PLACED_KEY);
    expect(node).toMatchObject({ kind: 'not-placed', parentKey: 'b:b1', detail: '3' });
    expect(some.indexOf(node!)).toBe(3);
  });

  it('orders the buildings alphabetically, ignoring case, and does not change the recent list', () => {
    const list = [
      { id: 'z', name: 'Zeta', location: 'z.json' },
      { id: 'a', name: 'alpha', location: 'a.json' },
      { id: 'm', name: 'Mid', location: 'm.json' },
    ];
    const nodes = buildTreeNodes(input({ recent: list }));
    expect(nodes.map((n) => n.key)).toEqual(['b:a', 'b:m', 'b:z']);
    expect(list.map((entry) => entry.id)).toEqual(['z', 'a', 'm']);
  });

  it('keeps the alphabetical place of the open building', () => {
    const list = [
      { id: 'z', name: 'Zeta', location: 'z.json' },
      { id: 'a', name: 'alpha', location: 'a.json' },
      { id: 'm', name: 'Mid', location: 'm.json' },
    ];
    const closed = buildTreeNodes(input({ recent: list }));
    const opened = buildTreeNodes(input({ recent: list, open: { file: withLevels([0], 'z', 'Zeta'), location: 'z.json' } }));
    expect(closed.map((n) => n.key)).toEqual(['b:a', 'b:m', 'b:z']);
    expect(opened.filter((n) => n.kind === 'building').map((n) => n.key)).toEqual(['b:a', 'b:m', 'b:z']);
  });
});

describe('initialSelection', () => {
  const file = withLevels([0, 3000]);
  it('selects the level of the active sheet', () => {
    expect(initialSelection(file, 'level-1')).toBe(levelKey('level-1'));
  });
  it('selects the first level when there is no active sheet or its level is unknown', () => {
    expect(initialSelection(file, null)).toBe(levelKey('level-0'));
    expect(initialSelection(file, 'gone')).toBe(levelKey('level-0'));
  });
  it('selects the building when it has no level', () => {
    expect(initialSelection(withLevels([]), null)).toBe(buildingKey('b1'));
  });
});

describe('currentSheetLevelId', () => {
  const file = withSheets(withLevels([0, 3000]), ['level-0', 'level-1']);
  it('finds the level of the sheet that matches the document and page', () => {
    expect(currentSheetLevelId(file, 'uuid-1', 0)).toBe('level-1');
  });
  it('returns null with no building, no id, no match or a wrong page', () => {
    expect(currentSheetLevelId(null, 'uuid-1', 0)).toBeNull();
    expect(currentSheetLevelId(file, null, 0)).toBeNull();
    expect(currentSheetLevelId(file, 'other', 0)).toBeNull();
    expect(currentSheetLevelId(file, 'uuid-1', 4)).toBeNull();
  });
});

describe('buildingWarnings', () => {
  it('counts level messages and sheets with a missing PDF or no access', () => {
    const file = withSheets(withLevels([0, 0, 3000]), ['level-0', 'level-1', 'level-2']);
    const warnings = buildingWarnings(file, { 'sheet-0': 'pdf-missing', 'sheet-1': 'no-access', 'sheet-2': 'ok' });
    expect(warnings).toMatchObject({ missingSheets: 1, noAccessSheets: 1, total: 3 });
    expect(warnings.levelMessages).toHaveLength(1);
    expect(warningLines(warnings)).toHaveLength(3);
  });
  it('has no problem for a clean building', () => {
    const warnings = buildingWarnings(withLevels([0, 3000]), {});
    expect(warnings.total).toBe(0);
    expect(warningLines(warnings)).toEqual([]);
  });
});

describe('moveFocus', () => {
  const file = withLevels([0, 3000]);
  const nodes = buildTreeNodes(input({ open: { file, location: 'x' } }));
  // keys: b:b1, l:level-0, l:level-1, a:add-level, b:b2

  it('moves down and up and stops at the ends', () => {
    expect(moveFocus(nodes, 'b:b1', 'ArrowDown')).toEqual({ focusKey: 'l:level-0', toggle: null });
    expect(moveFocus(nodes, 'l:level-1', 'ArrowUp')).toEqual({ focusKey: 'l:level-0', toggle: null });
    expect(moveFocus(nodes, 'b:b1', 'ArrowUp')).toBeNull();
    expect(moveFocus(nodes, 'b:b2', 'ArrowDown')).toBeNull();
  });

  it('goes to the first and the last node with Home and End', () => {
    expect(moveFocus(nodes, 'l:level-1', 'Home')).toEqual({ focusKey: 'b:b1', toggle: null });
    expect(moveFocus(nodes, 'b:b1', 'End')).toEqual({ focusKey: 'b:b2', toggle: null });
    expect(moveFocus(nodes, 'b:b1', 'Home')).toBeNull();
  });

  it('collapses an expanded building with Left and goes to the parent from a level', () => {
    expect(moveFocus(nodes, 'b:b1', 'ArrowLeft')).toEqual({ focusKey: 'b:b1', toggle: { key: 'b:b1', expand: false } });
    expect(moveFocus(nodes, 'l:level-1', 'ArrowLeft')).toEqual({ focusKey: 'b:b1', toggle: null });
    expect(moveFocus(nodes, 'b:b2', 'ArrowLeft')).toBeNull();
  });

  it('expands a collapsed building with Right, then goes to its first child', () => {
    const collapsed = buildTreeNodes(input({ open: { file, location: 'x' }, collapsed: new Set(['b:b1']) }));
    expect(moveFocus(collapsed, 'b:b1', 'ArrowRight')).toEqual({ focusKey: 'b:b1', toggle: { key: 'b:b1', expand: true } });
    expect(moveFocus(nodes, 'b:b1', 'ArrowRight')).toEqual({ focusKey: 'l:level-0', toggle: null });
    expect(moveFocus(nodes, 'l:level-0', 'ArrowRight')).toBeNull();
    expect(moveFocus(nodes, 'b:b2', 'ArrowRight')).toBeNull();
  });

  it('ignores other keys and unknown focus keys', () => {
    expect(moveFocus(nodes, 'b:b1', 'a')).toBeNull();
    expect(moveFocus(nodes, 'nope', 'ArrowDown')).toBeNull();
    expect(moveFocus([], 'b:b1', 'ArrowDown')).toBeNull();
  });
});
