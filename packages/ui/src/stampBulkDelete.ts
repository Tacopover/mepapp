import type { StampDefinition } from '@mepapp/core';

export interface StampDeleteContext {
  /** Ids of the stamps that come from the user library (folders and saved). */
  userStampIds: ReadonlySet<string>;
  /** Ids of user stamps in the "Saved stamps" source. */
  savedUserStampIds: ReadonlySet<string>;
  isLibraryStampId(id: string): boolean;
}

export interface StampDeleteGroups {
  /** User stamps from a folder: hidden, the file stays. */
  hide: StampDefinition[];
  /** User stamps from the "Saved stamps" source: deleted for good. */
  deleteSaved: StampDefinition[];
  /** Custom project stamps and orphan copies of user stamps: deleted from the project. */
  deleteCustom: StampDefinition[];
  /** Edited built-in stamps: go back to the library version. */
  revert: StampDefinition[];
}

export interface StampDeleteCounts {
  /** Placed elements that use a stamp in the deleteCustom group. */
  placed: number;
  /** Segment connections that a revert removes. */
  lostConnections: number;
}

/** Sorts stamps by the action their single-tile delete button runs. A stamp that no tile can delete is left out. */
export function classifyStampsForDelete(definitions: readonly StampDefinition[], ctx: StampDeleteContext): StampDeleteGroups {
  const groups: StampDeleteGroups = { hide: [], deleteSaved: [], deleteCustom: [], revert: [] };
  for (const definition of definitions) {
    if (definition.source === 'user' && ctx.userStampIds.has(definition.id)) {
      (ctx.savedUserStampIds.has(definition.id) ? groups.deleteSaved : groups.hide).push(definition);
    } else if (definition.source === 'custom' && ctx.isLibraryStampId(definition.id)) {
      groups.revert.push(definition);
    } else if (definition.source === 'custom' || definition.source === 'user') {
      groups.deleteCustom.push(definition);
    }
  }
  return groups;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The one confirmation text of a bulk delete: a header, then one line per non-empty group. */
export function bulkDeleteMessage(groups: StampDeleteGroups, counts: StampDeleteCounts): string {
  const total = groups.hide.length + groups.deleteSaved.length + groups.deleteCustom.length + groups.revert.length;
  const lines = [`Delete ${plural(total, 'stamp', 'stamps')}?`];
  if (groups.hide.length > 0) {
    const n = groups.hide.length;
    lines.push(`${plural(n, 'library stamp', 'library stamps')} ${n === 1 ? 'is' : 'are'} hidden. The files stay in their folders.`);
  }
  if (groups.deleteSaved.length > 0) {
    const n = groups.deleteSaved.length;
    lines.push(`${plural(n, 'saved stamp', 'saved stamps')} ${n === 1 ? 'is' : 'are'} deleted for good.`);
  }
  if (groups.deleteCustom.length > 0) {
    const n = groups.deleteCustom.length;
    let line = `${plural(n, 'custom stamp', 'custom stamps')} ${n === 1 ? 'is' : 'are'} deleted from this project.`;
    if (counts.placed > 0) {
      const p = counts.placed;
      line += ` ${plural(p, 'placed element', 'placed elements')} ${p === 1 ? 'uses it and keeps its look, but loses its icon' : 'use them and keep their look, but lose their icon'} if this document is reopened later.`;
    }
    lines.push(line);
  }
  if (groups.revert.length > 0) {
    const n = groups.revert.length;
    let line = `${plural(n, 'edited built-in stamp', 'edited built-in stamps')} ${n === 1 ? 'goes' : 'go'} back to the library version.`;
    if (counts.lostConnections > 0) {
      line += ` ${plural(counts.lostConnections, 'segment connection', 'segment connections')} to removed ports will be lost.`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
