import { useEffect, useRef, useState } from 'react';
import type { StampLabelVisibility, StampPropertyGroup } from '@mepapp/core';

/** One stamp definition that has a label layout and is placed on the active sheet. */
export interface LabelFilterEntry {
  definitionId: string;
  name: string;
  category: 'terminal' | 'equipment' | 'fitting';
}

export interface LabelVisibilityControlProps {
  visibility: StampLabelVisibility;
  onChange: (next: StampLabelVisibility) => void;
  entries: LabelFilterEntry[];
}

const KINDS: Array<{ group: StampPropertyGroup; label: string }> = [
  { group: 'stamp', label: 'Stamp' },
  { group: 'custom', label: 'Custom' },
  { group: 'circuit', label: 'Circuit' },
  { group: 'panel', label: 'Panel' },
];

const CATEGORIES: Array<{ category: LabelFilterEntry['category']; label: string }> = [
  { category: 'terminal', label: 'Terminals' },
  { category: 'equipment', label: 'Equipment' },
  { category: 'fitting', label: 'Fittings' },
];

/** A checkbox that also shows the mixed state of a group. */
function GroupCheckbox({ checked, mixed, onChange, label }: { checked: boolean; mixed: boolean; onChange: (checked: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <label className="mep-checkbox-row">
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <b>{label}</b>
    </label>
  );
}

/**
 * The status bar's "Labels" toggle and its drop-up filter (label-feature.md
 * §8.1): hide labels by kind (stamp, custom, circuit, panel) or by stamp
 * definition, grouped by category.
 */
export function LabelVisibilityControl({ visibility, onChange, entries }: LabelVisibilityControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const setDefinitionsHidden = (ids: string[], hidden: boolean) => {
    const rest = visibility.hiddenDefinitionIds.filter((id) => !ids.includes(id));
    onChange({ ...visibility, hiddenDefinitionIds: hidden ? [...rest, ...ids] : rest });
  };
  const setKindHidden = (group: StampPropertyGroup, hidden: boolean) => {
    const rest = visibility.hiddenGroups.filter((g) => g !== group);
    onChange({ ...visibility, hiddenGroups: hidden ? [...rest, group] : rest });
  };

  return (
    <span className="mep-chip mep-labels-chip mep-menu" ref={rootRef}>
      <label title="Show stamp labels on the canvas">
        <input type="checkbox" checked={visibility.enabled} onChange={(e) => onChange({ ...visibility, enabled: e.target.checked })} /> Labels
      </label>
      <button type="button" aria-label="Label filter" aria-expanded={open} title="Filter labels" onClick={() => setOpen((o) => !o)}>
        ▴
      </button>
      {open && (
        <div className="mep-menu-dropdown mep-dropup mep-label-filter">
          <div className="mep-label-filter-group">
            <b>Kinds</b>
            {KINDS.map(({ group, label }) => (
              <label key={group} className="mep-checkbox-row">
                <input type="checkbox" checked={!visibility.hiddenGroups.includes(group)} onChange={(e) => setKindHidden(group, !e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          <div className="mep-menu-divider" />
          {entries.length === 0 && <p className="mep-hint">No placed stamp on this sheet has labels yet.</p>}
          {CATEGORIES.map(({ category, label }) => {
            const inCategory = entries.filter((e) => e.category === category);
            if (inCategory.length === 0) return null;
            const ids = inCategory.map((e) => e.definitionId);
            const hiddenCount = ids.filter((id) => visibility.hiddenDefinitionIds.includes(id)).length;
            return (
              <div key={category} className="mep-label-filter-group">
                <GroupCheckbox label={label} checked={hiddenCount === 0} mixed={hiddenCount > 0 && hiddenCount < ids.length} onChange={(checked) => setDefinitionsHidden(ids, !checked)} />
                {inCategory.map((entry) => (
                  <label key={entry.definitionId} className="mep-checkbox-row mep-label-filter-item">
                    <input
                      type="checkbox"
                      checked={!visibility.hiddenDefinitionIds.includes(entry.definitionId)}
                      onChange={(e) => setDefinitionsHidden([entry.definitionId], !e.target.checked)}
                    />
                    {entry.name}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
