import { useRef, useState } from 'react';
import {
  LAYOUT_STRATEGY_LABELS,
  parseDecimal,
  parsePlacementRules,
  PLACEMENT_PRESET_LABELS,
  PRESET_AMOUNT_FIELDS,
  roomTypeLabel,
  validatePlacementRule,
  type Discipline,
  type LayoutStrategy,
  type PlacementPreset,
  type PlacementRule,
  type RoomType,
} from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { DISCIPLINE_LABEL } from './ElementEditorDialog.js';

export interface PlacementRulesDialogProps {
  /** The user library. */
  rules: PlacementRule[];
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  onChange: (rules: PlacementRule[]) => void;
  /** The name of a stamp definition, or null when the id is unknown. */
  stampName: (definitionId: string) => string | null;
  /** Opens the stamp picker; calls `onPick` with the chosen definition id. */
  onChooseStamp: (onPick: (definitionId: string) => void) => void;
  /** Saves the list as a JSON file. */
  onExport: (rules: PlacementRule[]) => void;
  onClose: () => void;
}

const newRuleId = () => `rule-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const LAYOUT_HINTS: Record<LayoutStrategy, string> = {
  center: 'One element at the label point. More than one element uses the grid.',
  grid: 'Rows along the long side of the room.',
  evenSpread: 'The grid, then each element moves to the middle of its own part of the room. Use it for L-shaped rooms.',
  coverage: 'With coverage limits: adds elements until every point of the room is near enough to one (radius = spacing ÷ √2, wall distance × √2 or √(area ÷ 2), the smallest). The count comes from the layout, at least the amount count and the min count.',
  perimeter: 'Elements along the walls, turned to face into the room. With a max spacing the count is the wall length ÷ spacing, rounded up.',
};

const AMOUNT_FIELD_LABELS: Record<(typeof PRESET_AMOUNT_FIELDS)[PlacementPreset][number], string> = {
  fixed: 'Per room',
  perM2: 'Per m² floor area',
  perPerson: 'Per person',
  perM3: 'Per m³ volume (air changes)',
  minimum: 'Minimum per room',
};

function blankRule(name: string): PlacementRule {
  return {
    id: newRuleId(),
    name,
    discipline: 'ventilation',
    roomTypeIds: [],
    stampDefinitionId: null,
    preset: 'perArea',
    amount: { unit: '' },
    coverage: {},
    layout: { strategy: 'center', wallOffsetM: 0.5, rotation: 'room' },
    writeCapacity: true,
  };
}

function uniqueName(base: string, rules: readonly PlacementRule[]): string {
  const taken = new Set(rules.map((r) => r.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/**
 * Edits the user library of placement rules (room-auto-placement.md Phase 3): which rooms, which
 * stamp, the amount a room needs, the capacity of one element, coverage limits, count limits and
 * the layout. The rules are not part of a drawing.
 */
export function PlacementRulesDialog({ rules, roomTypes, language, onChange, stampName, onChooseStamp, onExport, onClose }: PlacementRulesDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const busy = dirty ? 'Save or revert your changes first' : undefined;

  const addRule = (from?: PlacementRule) => {
    const created = from ? { ...structuredClone(from), id: newRuleId(), name: uniqueName(`${from.name} copy`, rules) } : blankRule(uniqueName('New rule', rules));
    onChange([...rules, created]);
    setSelectedId(created.id);
  };

  const importFile = async (file: File) => {
    try {
      const imported = parsePlacementRules(JSON.parse(await file.text()));
      if (!imported) {
        setMessage(`${file.name} does not hold a list of placement rules.`);
        return;
      }
      const importedIds = new Set(imported.map((r) => r.id));
      onChange([...rules.map((r) => imported.find((i) => i.id === r.id) ?? r), ...imported.filter((i) => !rules.some((r) => r.id === i.id))]);
      setMessage(`Imported ${imported.length} rule${imported.length === 1 ? '' : 's'} (${rules.filter((r) => importedIds.has(r.id)).length} replaced).`);
    } catch {
      setMessage(`Could not read ${file.name}.`);
    }
  };

  return (
    <Dialog
      title="Placement rules"
      className="mep-modal--placement-rules"
      onClose={onClose}
      actions={
        <>
          <button type="button" disabled={dirty} title={busy} onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <button type="button" disabled={dirty} title={busy} onClick={() => onExport(rules)}>
            Export…
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <p className="mep-settings-hint">The example rules show how each calculation works. Their numbers are not a standard: check them against the rules of your country.</p>
      <div className="mep-circuit-types">
        <div className="mep-circuit-types-list" role="listbox" aria-label="Placement rules">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              role="option"
              aria-selected={rule.id === selected?.id}
              className={`mep-circuit-types-item${rule.id === selected?.id ? ' on' : ''}`}
              disabled={dirty && rule.id !== selected?.id}
              title={dirty && rule.id !== selected?.id ? busy : undefined}
              onClick={() => setSelectedId(rule.id)}
            >
              <span>{rule.name}</span>
            </button>
          ))}
          <button type="button" className="mep-circuit-types-new" disabled={dirty} title={busy} onClick={() => addRule()}>
            + New rule
          </button>
        </div>
        {selected ? (
          <PlacementRuleForm
            key={JSON.stringify(selected)}
            rule={selected}
            others={rules.filter((r) => r.id !== selected.id)}
            roomTypes={roomTypes}
            language={language}
            stampName={stampName}
            onChooseStamp={onChooseStamp}
            onDirtyChange={setDirty}
            onSave={(next) => onChange(rules.map((r) => (r.id === next.id ? next : r)))}
            onDuplicate={() => addRule(selected)}
            onDelete={() => {
              onChange(rules.filter((r) => r.id !== selected.id));
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="mep-circuit-types-form">
            <p className="mep-settings-hint">Select a rule, or add a new one.</p>
          </div>
        )}
      </div>
      {message && (
        <p className="mep-settings-hint" role="status">
          {message}
        </p>
      )}
    </Dialog>
  );
}

const text = (n: number | undefined) => (n === undefined ? '' : String(n));

function draftOf(rule: PlacementRule) {
  return {
    name: rule.name,
    discipline: rule.discipline,
    roomTypeIds: rule.roomTypeIds,
    nameContains: rule.nameContains ?? '',
    stampDefinitionId: rule.stampDefinitionId,
    preset: rule.preset,
    fixed: text(rule.amount.fixed),
    perM2: text(rule.amount.perM2),
    perPerson: text(rule.amount.perPerson),
    perM3: text(rule.amount.perM3),
    minimum: text(rule.amount.minimum),
    unit: rule.amount.unit,
    lux: text(rule.lighting?.lux),
    uf: text(rule.lighting?.utilisationFactor),
    mf: text(rule.lighting?.maintenanceFactor),
    capacity: text(rule.capacityPerElement),
    maxSpacing: text(rule.coverage.maxSpacingM),
    maxArea: text(rule.coverage.maxAreaPerElementM2),
    maxWall: text(rule.coverage.maxWallDistanceM),
    minCount: text(rule.minCount),
    maxCount: text(rule.maxCount),
    strategy: rule.layout.strategy,
    wallOffset: String(rule.layout.wallOffsetM),
    rotation: rule.layout.rotation,
    fixedAngle: text(rule.layout.fixedAngleDeg),
    writeCapacity: rule.writeCapacity,
  };
}

type Draft = ReturnType<typeof draftOf>;

class FieldError extends Error {}

/** A typed number, or undefined for an empty box. Throws a FieldError for text that is not a number. */
function numberOf(value: string, label: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = parseDecimal(value);
  if (parsed === null) throw new FieldError(`${label}: "${value}" is not a number.`);
  return parsed;
}

function ruleOf(id: string, d: Draft): PlacementRule {
  const shown = new Set(PRESET_AMOUNT_FIELDS[d.preset]);
  const amount: PlacementRule['amount'] = { unit: d.preset === 'lighting' ? 'lm' : d.unit.trim() };
  for (const key of ['fixed', 'perM2', 'perPerson', 'perM3', 'minimum'] as const) {
    const value = shown.has(key) ? numberOf(d[key], AMOUNT_FIELD_LABELS[key]) : undefined;
    if (value !== undefined) amount[key] = value;
  }
  const rule: PlacementRule = {
    id,
    name: d.name.trim(),
    discipline: d.discipline,
    roomTypeIds: d.roomTypeIds,
    stampDefinitionId: d.stampDefinitionId,
    preset: d.preset,
    amount,
    coverage: {},
    layout: { strategy: d.strategy, wallOffsetM: numberOf(d.wallOffset, 'Offset from walls') ?? 0, rotation: d.rotation },
    writeCapacity: d.writeCapacity,
  };
  if (d.nameContains.trim()) rule.nameContains = d.nameContains.trim();
  if (d.preset === 'lighting') {
    const lux = numberOf(d.lux, 'Illuminance');
    const uf = numberOf(d.uf, 'Utilisation factor');
    const mf = numberOf(d.mf, 'Maintenance factor');
    if (lux === undefined || uf === undefined || mf === undefined) throw new FieldError('Enter the illuminance, the utilisation factor and the maintenance factor.');
    rule.lighting = { lux, utilisationFactor: uf, maintenanceFactor: mf };
  }
  const optional: [keyof PlacementRule | keyof PlacementRule['coverage'], string, string, 'rule' | 'coverage'][] = [
    ['capacityPerElement', d.capacity, 'Capacity per element', 'rule'],
    ['minCount', d.minCount, 'Min count', 'rule'],
    ['maxCount', d.maxCount, 'Max count', 'rule'],
    ['maxSpacingM', d.maxSpacing, 'Max spacing', 'coverage'],
    ['maxAreaPerElementM2', d.maxArea, 'Max area per element', 'coverage'],
    ['maxWallDistanceM', d.maxWall, 'Max distance to a wall', 'coverage'],
  ];
  for (const [key, value, label, target] of optional) {
    const n = numberOf(value, label);
    if (n !== undefined) (target === 'rule' ? (rule as unknown as Record<string, unknown>) : (rule.coverage as Record<string, unknown>))[key] = n;
  }
  if (d.rotation === 'fixed') {
    const angle = numberOf(d.fixedAngle, 'Fixed angle');
    if (angle !== undefined) rule.layout.fixedAngleDeg = angle;
  }
  return rule;
}

interface PlacementRuleFormProps {
  rule: PlacementRule;
  others: PlacementRule[];
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  stampName: (definitionId: string) => string | null;
  onChooseStamp: (onPick: (definitionId: string) => void) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (rule: PlacementRule) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** The fields of one rule. Local draft with explicit Save and Revert. Its parent gives it a `key` built from the saved values, so it re-seeds after a save. */
function PlacementRuleForm({ rule, others, roomTypes, language, stampName, onChooseStamp, onDirtyChange, onSave, onDuplicate, onDelete }: PlacementRuleFormProps) {
  const initial = draftOf(rule);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
    onDirtyChange(true);
  };
  const field = (key: keyof Draft) => (e: { target: { value: string } }) => update({ [key]: e.target.value } as Partial<Draft>);

  const revert = () => {
    setDraft(initial);
    setError(null);
    onDirtyChange(false);
  };

  const save = () => {
    try {
      const next = ruleOf(rule.id, draft);
      const problem = validatePlacementRule(next, others);
      if (problem) {
        setError(problem);
        return;
      }
      onDirtyChange(false);
      onSave(next);
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      setError(err.message);
    }
  };

  const numberRow = (key: keyof Draft, label: string, hint?: string) => (
    <div className="mep-field-row" key={key}>
      <label htmlFor={`pr-${key}`}>{label}</label>
      <input id={`pr-${key}`} type="text" inputMode="decimal" placeholder={hint ?? 'none'} value={draft[key] as string} onChange={field(key)} />
    </div>
  );
  const unit = draft.preset === 'lighting' ? 'lm' : draft.unit.trim() || 'unit';
  const knownStamp = draft.stampDefinitionId ? stampName(draft.stampDefinitionId) : null;

  return (
    <div className="mep-circuit-types-form mep-placement-rule-form">
      <div className="mep-field-row">
        <label htmlFor="pr-name">Name</label>
        <input id="pr-name" type="text" value={draft.name} onChange={field('name')} />
      </div>
      <div className="mep-field-row">
        <label htmlFor="pr-discipline">Discipline</label>
        <select id="pr-discipline" value={draft.discipline} onChange={(e) => update({ discipline: e.target.value as Discipline })}>
          {(Object.keys(DISCIPLINE_LABEL) as Discipline[]).map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABEL[d]}
            </option>
          ))}
        </select>
      </div>

      <h4>Which rooms</h4>
      <div className="mep-placement-rule-types" role="group" aria-label="Room types">
        {roomTypes.map((type) => (
          <label key={type.id}>
            <input
              type="checkbox"
              checked={draft.roomTypeIds.includes(type.id)}
              onChange={(e) => update({ roomTypeIds: e.target.checked ? [...draft.roomTypeIds, type.id] : draft.roomTypeIds.filter((id) => id !== type.id) })}
            />
            {roomTypeLabel(type, language)}
          </label>
        ))}
      </div>
      <p className="mep-settings-hint">{draft.roomTypeIds.length === 0 ? 'No type checked: the rule applies to every room.' : `${draft.roomTypeIds.length} room type${draft.roomTypeIds.length === 1 ? '' : 's'}.`}</p>
      <div className="mep-field-row">
        <label htmlFor="pr-nameContains">Name contains</label>
        <input id="pr-nameContains" type="text" placeholder="any name" value={draft.nameContains} onChange={field('nameContains')} />
      </div>

      <h4>Which stamp</h4>
      <div className="mep-field-row">
        <label>Stamp</label>
        <span className="mep-placement-rule-stamp" data-testid="rule-stamp">
          {draft.stampDefinitionId ? (knownStamp ?? `${draft.stampDefinitionId} (not found)`) : 'Not chosen'}
        </span>
        <button type="button" onClick={() => onChooseStamp((id) => update({ stampDefinitionId: id }))}>
          Choose…
        </button>
        {draft.stampDefinitionId && (
          <button type="button" onClick={() => update({ stampDefinitionId: null })}>
            Clear
          </button>
        )}
      </div>

      <h4>Required amount</h4>
      <div className="mep-field-row">
        <label htmlFor="pr-preset">Calculation</label>
        <select id="pr-preset" value={draft.preset} onChange={(e) => update({ preset: e.target.value as PlacementPreset, unit: e.target.value === 'airChanges' && !draft.unit.trim() ? 'm³/h' : draft.unit })}>
          {(Object.keys(PLACEMENT_PRESET_LABELS) as PlacementPreset[]).map((p) => (
            <option key={p} value={p}>
              {PLACEMENT_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {draft.preset !== 'lighting' && (
        <div className="mep-field-row">
          <label htmlFor="pr-unit">Unit</label>
          <input id="pr-unit" type="text" placeholder="for example dm³/s" value={draft.unit} onChange={field('unit')} />
        </div>
      )}
      {PRESET_AMOUNT_FIELDS[draft.preset].map((key) => numberRow(key, `${AMOUNT_FIELD_LABELS[key]} (${unit})`))}
      {draft.preset === 'lighting' && (
        <>
          {numberRow('lux', 'Illuminance E (lx)', 'required')}
          {numberRow('uf', 'Utilisation factor UF', 'for example 0.6')}
          {numberRow('mf', 'Maintenance factor MF', 'for example 0.8')}
          <p className="mep-settings-hint">Amount = E × area ÷ (UF × MF), in lm.</p>
        </>
      )}
      {numberRow('capacity', `Capacity per element (${unit})`)}
      <p className="mep-settings-hint">Count = amount ÷ capacity, rounded up. Without a capacity and coverage limits the rule places one element per room.</p>

      <h4>Coverage</h4>
      {numberRow('maxSpacing', 'Max spacing (m)')}
      {numberRow('maxArea', 'Max area per element (m²)')}
      {numberRow('maxWall', 'Max distance to a wall (m)', 'half the spacing')}

      <h4>Count limits</h4>
      {numberRow('minCount', 'Min count per room')}
      {numberRow('maxCount', 'Max count per room')}

      <h4>Layout</h4>
      <div className="mep-field-row">
        <label htmlFor="pr-strategy">Layout</label>
        <select id="pr-strategy" value={draft.strategy} onChange={(e) => update({ strategy: e.target.value as LayoutStrategy })}>
          {(Object.keys(LAYOUT_STRATEGY_LABELS) as LayoutStrategy[]).map((s) => (
            <option key={s} value={s}>
              {LAYOUT_STRATEGY_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <p className="mep-settings-hint" data-testid="pr-strategy-hint">
        {LAYOUT_HINTS[draft.strategy]}
      </p>
      {numberRow('wallOffset', 'Offset from walls (m)', '0')}
      <div className="mep-field-row">
        <label htmlFor="pr-rotation">Rotation</label>
        <select id="pr-rotation" value={draft.rotation} onChange={(e) => update({ rotation: e.target.value as 'room' | 'fixed' })}>
          <option value="room">Align to the room</option>
          <option value="fixed">Fixed angle</option>
        </select>
      </div>
      {draft.rotation === 'fixed' && numberRow('fixedAngle', 'Fixed angle (°)', 'required')}
      <div className="mep-field-row">
        <label htmlFor="pr-writeCapacity">Write capacity to stamps</label>
        <input id="pr-writeCapacity" type="checkbox" checked={draft.writeCapacity} onChange={(e) => update({ writeCapacity: e.target.checked })} />
      </div>

      {error && (
        <div className="mep-circuit-types-error" role="alert">
          {error}
        </div>
      )}
      <div className="mep-circuit-types-actions">
        <button type="button" onClick={save} disabled={!dirty}>
          Save
        </button>
        <button type="button" onClick={revert} disabled={!dirty}>
          Revert
        </button>
        <button type="button" onClick={onDuplicate} disabled={dirty}>
          Duplicate
        </button>
        <button type="button" onClick={onDelete} disabled={dirty}>
          Delete
        </button>
      </div>
    </div>
  );
}
