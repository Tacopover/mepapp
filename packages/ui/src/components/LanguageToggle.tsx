export type StampLabelLanguage = 'en' | 'nl';

export interface LanguageToggleProps {
  value: StampLabelLanguage;
  onChange: (value: StampLabelLanguage) => void;
}

/** Single switch button for the Stamps tab's picker-label language — only fixture-generated STAMP_LIBRARY entries have a Dutch translation (stamp-library.ts's labelNl); a custom-uploaded stamp's label stays fixed regardless of this toggle. Styled as .mep-toggle-btn (a switch), not .mep-discipline-btn (a filter), so it reads as a different kind of control. */
export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  const next = value === 'en' ? 'nl' : 'en';
  return (
    <button
      type="button"
      className="mep-toggle-btn"
      onClick={() => onChange(next)}
      title={`Switch labels to ${next === 'en' ? 'English' : 'Dutch'}`}
      aria-label="Stamp label language"
    >
      {value.toUpperCase()}
    </button>
  );
}
