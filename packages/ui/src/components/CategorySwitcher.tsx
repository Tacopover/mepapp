export type StampCategoryFilter = 'terminal' | 'equipment';

export interface CategorySwitcherProps {
  value: StampCategoryFilter;
  onChange: (value: StampCategoryFilter) => void;
}

/** Single switch button for the Stamps tab's Terminal/Equipment view — no 'all' state, the user always sees one or the other. Styled as .mep-toggle-btn (a switch), not .mep-discipline-btn (a filter), so it reads as a different kind of control. */
export function CategorySwitcher({ value, onChange }: CategorySwitcherProps) {
  const next = value === 'terminal' ? 'equipment' : 'terminal';
  const label = value === 'terminal' ? 'Terminal' : 'Equipment';
  return (
    <button
      type="button"
      className="mep-toggle-btn"
      onClick={() => onChange(next)}
      title={`Switch to ${next === 'terminal' ? 'Terminal' : 'Equipment'}`}
      aria-label="Stamp category"
    >
      {label}
    </button>
  );
}
