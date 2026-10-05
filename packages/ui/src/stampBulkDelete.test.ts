import { describe, expect, it } from 'vitest';
import type { StampDefinition } from '@mepapp/core';
import { bulkDeleteMessage, classifyStampsForDelete, type StampDeleteGroups } from './stampBulkDelete.js';

function def(id: string, source: StampDefinition['source']): StampDefinition {
  return { id, source, label: id } as StampDefinition;
}

const ctx = {
  userStampIds: new Set(['u-folder', 'u-saved']),
  savedUserStampIds: new Set(['u-saved']),
  isLibraryStampId: (id: string) => id.startsWith('lib-'),
};

const empty: StampDeleteGroups = { hide: [], deleteSaved: [], deleteCustom: [], revert: [] };
const many = (n: number, source: StampDefinition['source'] = 'custom') => Array.from({ length: n }, (_, i) => def(`s${i}`, source));

describe('classifyStampsForDelete', () => {
  it('sorts each kind into its group', () => {
    const groups = classifyStampsForDelete(
      [def('u-folder', 'user'), def('u-saved', 'user'), def('c1', 'custom'), def('lib-a', 'custom'), def('orphan', 'user'), def('lib-b', 'library')],
      ctx,
    );
    expect(groups.hide.map((d) => d.id)).toEqual(['u-folder']);
    expect(groups.deleteSaved.map((d) => d.id)).toEqual(['u-saved']);
    expect(groups.deleteCustom.map((d) => d.id)).toEqual(['c1', 'orphan']);
    expect(groups.revert.map((d) => d.id)).toEqual(['lib-a']);
  });
});

describe('bulkDeleteMessage', () => {
  it('writes the header and one line per non-empty group', () => {
    const groups = { ...empty, hide: many(2, 'user'), deleteSaved: many(1, 'user'), deleteCustom: many(3), revert: many(1) };
    expect(bulkDeleteMessage(groups, { placed: 4, lostConnections: 2 }).split('\n')).toEqual([
      'Delete 7 stamps?',
      '2 library stamps are hidden. The files stay in their folders.',
      '1 saved stamp is deleted for good.',
      '3 custom stamps are deleted from this project. 4 placed elements use them and keep their look, but lose their icon if this document is reopened later.',
      '1 edited built-in stamp goes back to the library version. 2 segment connections to removed ports will be lost.',
    ]);
  });

  it('uses the singular forms', () => {
    const groups = { ...empty, deleteCustom: many(1) };
    expect(bulkDeleteMessage(groups, { placed: 1, lostConnections: 0 })).toBe(
      'Delete 1 stamp?\n1 custom stamp is deleted from this project. 1 placed element uses it and keeps its look, but loses its icon if this document is reopened later.',
    );
  });

  it('omits the placed and connection sentences at zero and uses plural revert', () => {
    const groups = { ...empty, deleteCustom: many(2), revert: many(2) };
    expect(bulkDeleteMessage(groups, { placed: 0, lostConnections: 0 })).toBe(
      'Delete 4 stamps?\n2 custom stamps are deleted from this project.\n2 edited built-in stamps go back to the library version.',
    );
  });
});
