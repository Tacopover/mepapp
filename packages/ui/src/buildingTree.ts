import { levelWarnings, type BuildingFile } from '@mepapp/core';
import { countLabel, sheetCount } from './buildingLevels.js';
import { statusTone, type SheetStatus } from './buildingStatus.js';
import type { RecentBuilding } from './recentBuildings.js';

/** The key of the "Not placed" node. Keys of the other nodes: "b:<building id>" and "l:<level id>". */
export const NOT_PLACED_KEY = 'p:not-placed';

/** The key of the "+ Add level" node of the open building. The dialog never selects it. */
export const ADD_LEVEL_KEY = 'a:add-level';

export type TreeNodeKind = 'building' | 'level' | 'add-level' | 'not-placed';

export interface TreeNode {
  key: string;
  kind: TreeNodeKind;
  /** 1 for a building, 2 for its children. */
  depth: 1 | 2;
  parentKey: string | null;
  label: string;
  /** Second line of a building (its location) or the sheet count text of a level. Null when there is nothing to show. */
  detail: string | null;
  /** Building node: this is the open building. */
  isOpen: boolean;
  /** Building node: the node has children (only the open building has). */
  expandable: boolean;
  expanded: boolean;
  /** Level node: a sheet of the level has a missing PDF or no access to it. */
  warning: boolean;
  /** Building node: the recent entry (the controller opens it). Null for the other kinds. */
  entry: RecentBuilding | null;
}

export interface TreeInput {
  recent: RecentBuilding[];
  /** The open building, or null. Its entry is added to the list when the recent list does not hold it. */
  open: { file: BuildingFile; location: string } | null;
  sheetStatus: Record<string, SheetStatus>;
  /** Pages that wait for a level (dialog state). The node shows only when above 0. */
  notPlacedCount: number;
  /** Keys ("b:<id>") of open buildings that the user collapsed. */
  collapsed: ReadonlySet<string>;
}

export const buildingKey = (id: string): string => `b:${id}`;
export const levelKey = (id: string): string => `l:${id}`;

/** True when a sheet of the level has a missing PDF or no access (tone "bad"). */
export function levelHasWarning(file: BuildingFile, levelId: string, sheetStatus: Record<string, SheetStatus>): boolean {
  return file.sheets.some((sheet) => {
    if (sheet.levelId !== levelId) return false;
    const status = sheetStatus[sheet.id];
    return status !== undefined && statusTone(status) === 'bad';
  });
}

/** The visible nodes in display order: every building, and under the open building its levels, the add-level node and the Not placed node. */
export function buildTreeNodes(input: TreeInput): TreeNode[] {
  const { recent, open, sheetStatus, notPlacedCount, collapsed } = input;
  const listed =
    open !== null && !recent.some((entry) => entry.id === open.file.id)
      ? [{ id: open.file.id, name: open.file.name, location: open.location }, ...recent]
      : recent;
  const labelOf = (entry: RecentBuilding): string => (open !== null && open.file.id === entry.id ? open.file.name : entry.name);
  const entries = [...listed].sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: 'base' }));
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const key = buildingKey(entry.id);
    const isOpen = open !== null && open.file.id === entry.id;
    const expanded = isOpen && !collapsed.has(key);
    nodes.push({
      key,
      kind: 'building',
      depth: 1,
      parentKey: null,
      label: isOpen ? open.file.name : entry.name,
      detail: entry.location,
      isOpen,
      expandable: isOpen,
      expanded,
      warning: false,
      entry,
    });
    if (!isOpen || !expanded) continue;
    for (const level of open.file.levels) {
      nodes.push({
        key: levelKey(level.id),
        kind: 'level',
        depth: 2,
        parentKey: key,
        label: level.name,
        detail: countLabel(sheetCount(open.file, level.id), 'sheet'),
        isOpen: false,
        expandable: false,
        expanded: false,
        warning: levelHasWarning(open.file, level.id, sheetStatus),
        entry: null,
      });
    }
    nodes.push({
      key: ADD_LEVEL_KEY,
      kind: 'add-level',
      depth: 2,
      parentKey: key,
      label: '+ Add level',
      detail: null,
      isOpen: false,
      expandable: false,
      expanded: false,
      warning: false,
      entry: null,
    });
    if (notPlacedCount > 0) {
      nodes.push({
        key: NOT_PLACED_KEY,
        kind: 'not-placed',
        depth: 2,
        parentKey: key,
        label: 'Not placed',
        detail: String(notPlacedCount),
        isOpen: false,
        expandable: false,
        expanded: false,
        warning: false,
        entry: null,
      });
    }
  }
  return nodes;
}

/** The level of the sheet that matches the active document and page, or null. Same match as currentSheetLabel. */
export function currentSheetLevelId(building: BuildingFile | null, projectUuid: string | null, pageIndex: number): string | null {
  if (building === null || projectUuid === null) return null;
  const sheet = building.sheets.find((s) => s.projectUuid === projectUuid && s.pageIndex === pageIndex);
  if (sheet === undefined) return null;
  return building.levels.some((level) => level.id === sheet.levelId) ? sheet.levelId : null;
}

/** The node to select when a building shows: the level of the active sheet, else the first level, else the building. */
export function initialSelection(file: BuildingFile, activeSheetLevelId: string | null): string {
  if (activeSheetLevelId !== null && file.levels.some((level) => level.id === activeSheetLevelId)) return levelKey(activeSheetLevelId);
  const first = file.levels[0];
  return first !== undefined ? levelKey(first.id) : buildingKey(file.id);
}

export interface BuildingWarnings {
  /** Messages of levelWarnings (two levels with one elevation). */
  levelMessages: string[];
  /** Sheets whose PDF is missing. */
  missingSheets: number;
  /** Sheets whose PDF cannot be read because the app has no access. */
  noAccessSheets: number;
  /** All problems added up: one for each level message and one for each sheet with a missing PDF or no access. */
  total: number;
}

export function buildingWarnings(file: BuildingFile, sheetStatus: Record<string, SheetStatus>): BuildingWarnings {
  const levelMessages = levelWarnings(file);
  let missingSheets = 0;
  let noAccessSheets = 0;
  for (const sheet of file.sheets) {
    const status = sheetStatus[sheet.id];
    if (status === 'pdf-missing') missingSheets += 1;
    else if (status === 'no-access') noAccessSheets += 1;
  }
  return { levelMessages, missingSheets, noAccessSheets, total: levelMessages.length + missingSheets + noAccessSheets };
}

/** The sentence parts for a warnings list or tooltip, one for each kind of problem. Empty when there is none. */
export function warningLines(warnings: BuildingWarnings): string[] {
  const lines = [...warnings.levelMessages];
  if (warnings.missingSheets > 0) lines.push(`${countLabel(warnings.missingSheets, 'sheet')} with a missing PDF.`);
  if (warnings.noAccessSheets > 0) lines.push(`${countLabel(warnings.noAccessSheets, 'sheet')} with no access to the PDF.`);
  return lines;
}

export interface FocusMove {
  /** The key to focus (and to scroll to). */
  focusKey: string;
  /** Set when the key expands or collapses a building. */
  toggle: { key: string; expand: boolean } | null;
}

/** What a navigation key does in the tree. Null when the key does nothing at this node (or is not a navigation key). Pure. */
export function moveFocus(nodes: TreeNode[], focusKey: string, key: string): FocusMove | null {
  const index = nodes.findIndex((node) => node.key === focusKey);
  if (index < 0 || nodes.length === 0) return null;
  const node = nodes[index]!;
  switch (key) {
    case 'ArrowDown':
      return index < nodes.length - 1 ? { focusKey: nodes[index + 1]!.key, toggle: null } : null;
    case 'ArrowUp':
      return index > 0 ? { focusKey: nodes[index - 1]!.key, toggle: null } : null;
    case 'Home':
      return index > 0 ? { focusKey: nodes[0]!.key, toggle: null } : null;
    case 'End':
      return index < nodes.length - 1 ? { focusKey: nodes[nodes.length - 1]!.key, toggle: null } : null;
    case 'ArrowRight': {
      if (!node.expandable) return null;
      if (!node.expanded) return { focusKey: node.key, toggle: { key: node.key, expand: true } };
      const child = nodes[index + 1];
      return child !== undefined && child.parentKey === node.key ? { focusKey: child.key, toggle: null } : null;
    }
    case 'ArrowLeft': {
      if (node.expandable && node.expanded) return { focusKey: node.key, toggle: { key: node.key, expand: false } };
      return node.parentKey !== null ? { focusKey: node.parentKey, toggle: null } : null;
    }
    default:
      return null;
  }
}
