import { DISCIPLINE_GROUPS, DISCIPLINE_GROUP_LABEL, type DisciplineGroup } from '../disciplineGroups.js';

export interface DisciplineSwitcherProps {
  value: DisciplineGroup | null;
  onChange: (value: DisciplineGroup | null) => void;
}

export function DisciplineSwitcher({ value, onChange }: DisciplineSwitcherProps) {
  return (
    <div className="mep-discipline" role="tablist" aria-label="Discipline">
      <button type="button" className={`mep-discipline-btn${value === null ? ' on' : ''}`} onClick={() => onChange(null)}>
        All
      </button>
      {DISCIPLINE_GROUPS.map((group) => (
        <button
          key={group}
          type="button"
          className={`mep-discipline-btn${value === group ? ' on' : ''}`}
          onClick={() => onChange(group)}
        >
          {DISCIPLINE_GROUP_LABEL[group]}
        </button>
      ))}
    </div>
  );
}
