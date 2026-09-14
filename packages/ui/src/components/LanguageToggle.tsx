export type StampLabelLanguage = 'en' | 'nl';

export interface LanguageToggleProps {
  value: StampLabelLanguage;
  onChange: (value: StampLabelLanguage) => void;
}

/** EN/NL toggle for the Stamps tab's picker labels — same tablist pattern as DisciplineSwitcher, reusing its button styling. Only fixture-generated STAMP_LIBRARY entries have a Dutch translation (stamp-library.ts's labelNl); a custom-uploaded stamp's label stays fixed regardless of this toggle. */
export function LanguageToggle({ value, onChange }: LanguageToggleProps) {
  return (
    <div className="mep-discipline" role="tablist" aria-label="Stamp label language">
      <button type="button" className={`mep-discipline-btn${value === 'en' ? ' on' : ''}`} onClick={() => onChange('en')}>
        EN
      </button>
      <button type="button" className={`mep-discipline-btn${value === 'nl' ? ' on' : ''}`} onClick={() => onChange('nl')}>
        NL
      </button>
    </div>
  );
}
