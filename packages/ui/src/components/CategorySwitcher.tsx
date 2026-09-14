export type StampCategoryFilter = 'all' | 'terminal' | 'equipment';

export interface CategorySwitcherProps {
  value: StampCategoryFilter;
  onChange: (value: StampCategoryFilter) => void;
}

/** Terminal/Equipment view switch for the Stamps tab — same tablist pattern as DisciplineSwitcher, reusing its button styling. A 'fitting'-category definition (none in STAMP_LIBRARY today) only shows under "All". */
export function CategorySwitcher({ value, onChange }: CategorySwitcherProps) {
  return (
    <div className="mep-discipline" role="tablist" aria-label="Stamp category">
      <button type="button" className={`mep-discipline-btn${value === 'all' ? ' on' : ''}`} onClick={() => onChange('all')}>
        All
      </button>
      <button type="button" className={`mep-discipline-btn${value === 'terminal' ? ' on' : ''}`} onClick={() => onChange('terminal')}>
        Terminal
      </button>
      <button type="button" className={`mep-discipline-btn${value === 'equipment' ? ' on' : ''}`} onClick={() => onChange('equipment')}>
        Equipment
      </button>
    </div>
  );
}
