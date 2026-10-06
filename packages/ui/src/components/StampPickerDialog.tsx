import { useMemo, useState } from 'react';
import type { StampDefinition } from '@mepapp/core';
import type { DisciplineGroup } from '../disciplineGroups.js';
import { getVisibleStampDefinitions, stampLabelFor } from '../stampVisibility.js';
import { CategorySwitcher, type StampCategoryFilter } from './CategorySwitcher.js';
import { DisciplineSwitcher } from './DisciplineSwitcher.js';
import { Dialog } from './Dialog.js';
import { iconUrlFor } from './StampsPanel.js';
import type { StampLabelLanguage } from './LanguageToggle.js';

export interface StampPickerDialogProps {
  title: string;
  initialCategory: StampCategoryFilter;
  initialDisciplineGroup: DisciplineGroup | null;
  labelLanguage: StampLabelLanguage;
  customStampDefinitions: StampDefinition[];
  userStampDefinitions: StampDefinition[];
  showBuiltIn: boolean;
  libraryRecordIds: ReadonlySet<string>;
  resolveIconUrl: (iconRef: string) => string;
  onPick: (definition: StampDefinition) => void;
  onClose: () => void;
}

/** Modal stamp chooser — the same filtered tile list as the Stamps tab, for picking a stamp without arming the placement tool. */
export function StampPickerDialog({
  title,
  initialCategory,
  initialDisciplineGroup,
  labelLanguage,
  customStampDefinitions,
  userStampDefinitions,
  showBuiltIn,
  libraryRecordIds,
  resolveIconUrl,
  onPick,
  onClose,
}: StampPickerDialogProps) {
  const [category, setCategory] = useState<StampCategoryFilter>(initialCategory);
  const [disciplineGroup, setDisciplineGroup] = useState<DisciplineGroup | null>(initialDisciplineGroup);
  const [searchQuery, setSearchQuery] = useState('');
  const definitions = useMemo(
    () => getVisibleStampDefinitions(customStampDefinitions, disciplineGroup, category, labelLanguage, searchQuery, userStampDefinitions, { showBuiltIn, libraryRecordIds }),
    [customStampDefinitions, disciplineGroup, category, labelLanguage, searchQuery, userStampDefinitions, showBuiltIn, libraryRecordIds],
  );
  return (
    <Dialog title={title} onClose={onClose} actions={<button type="button" onClick={onClose}>Cancel</button>}>
      <div className="mep-stamps-filter">
        <DisciplineSwitcher value={disciplineGroup} onChange={setDisciplineGroup} />
        <div className="mep-stamps-filter-row2">
          <CategorySwitcher value={category} onChange={setCategory} />
          <input
            type="search"
            className="mep-stamp-search"
            placeholder="Search…"
            aria-label="Search stamps"
            value={searchQuery}
            autoFocus
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      {definitions.length === 0 && <div className="mep-empty-panel">No stamps match.</div>}
      <div className="mep-stamp-grid mep-stamp-picker-grid">
        {definitions.map((definition) => (
          <button key={definition.id} type="button" className="mep-stamp-tile" onClick={() => onPick(definition)}>
            <img src={iconUrlFor(definition, resolveIconUrl)} alt="" />
            {stampLabelFor(definition, labelLanguage)}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
