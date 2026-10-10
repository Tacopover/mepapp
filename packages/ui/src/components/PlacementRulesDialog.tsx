import { useRef, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import {
  AIR_CHANGE_UNITS,
  AMOUNT_UNITS,
  AREA_UNIT_LABELS,
  GRID_STYLE_LABELS,
  hasCoverageLimit,
  ILLUMINANCE_UNIT_LABELS,
  LAYOUT_STRATEGY_LABELS,
  LENGTH_UNIT_LABELS,
  parsePlacementRules,
  PLACEMENT_PRESET_HELP,
  PLACEMENT_PRESET_LABELS,
  PRESET_AMOUNT_FIELDS,
  roomTypeLabel,
  validatePlacementRule,
  type Discipline,
  type LayoutStrategy,
  type PlacementPreset,
  type PlacementRule,
  type RoomType,
  type StampDefinition,
} from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { DISCIPLINE_LABEL } from './ElementEditorDialog.js';
import { PlacementRuleGuide } from './PlacementRuleGuide.js';
import { AMOUNT_FIELD_LABELS, blankRule, draftOf, FieldError, newRuleId, OTHER_UNIT, presetHelpText, presetPatch, ruleOf, uniqueName, type Draft } from './placementRuleDraft.js';

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
  /** The scene, for the rooms of the shown page in the guide. */
  sceneRef: RefObject<SketchScene | null>;
  /** A stamp definition by id, for its size; undefined when it is not found. */
  stampDefinition: (definitionId: string) => StampDefinition | undefined;
  /** The remembered scale of a stamp definition (the stamp tool's appearance default). */
  stampScale: (definitionId: string) => number;
  /** The thumbnail of a stamp definition, or null when the id is unknown. */
  stampIconUrl: (definitionId: string) => string | null;
  /** Saves the room-type library (the area per person in the guide). */
  onChangeRoomTypes: (types: RoomType[]) => void;
  /** True while the stamp picker of a rule is open on top of this dialog. */
  stampPickerOpen: boolean;
  onClose: () => void;
}

const LAYOUT_HINTS: Record<LayoutStrategy, string> = {
  center: 'One element at the label point. More than one element uses the grid.',
  grid: 'Rows along the long side of the room. The grid style sets how a short last row is filled.',
  evenSpread: 'The grid, then each element moves to the middle of its own part of the room. Use it for L-shaped rooms. With By coverage it uses the positions that the coverage calculation found.',
  perimeter: 'Elements along the walls, turned to face into the room.',
};

/**
 * Edits the user library of placement rules (room-auto-placement.md Phase 3): which rooms, which
 * stamp, the amount a room needs, the capacity of one element, coverage limits, count limits and
 * the layout. The rules are not part of a drawing.
 */
export function PlacementRulesDialog({ rules, roomTypes, language, onChange, stampName, onChooseStamp, onExport, sceneRef, stampDefinition, stampScale, stampIconUrl, onChangeRoomTypes, stampPickerOpen, onClose }: PlacementRulesDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  // The guide edits one rule: a saved rule, or a new rule that the list gets on the first Save.
  const [guide, setGuide] = useState<{ ruleId: string; isNew: boolean; blank?: PlacementRule } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const busy = dirty ? 'Save or revert your changes first' : undefined;

  const addRule = (from: PlacementRule) => {
    const created = { ...structuredClone(from), id: newRuleId(), name: uniqueName(`${from.name} copy`, rules) };
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

  if (guide) {
    const guideRule = guide.isNew ? guide.blank! : rules.find((r) => r.id === guide.ruleId);
    if (guideRule) {
      return (
        <PlacementRuleGuide
          key={JSON.stringify(guideRule)}
          rule={guideRule}
          isNew={guide.isNew}
          others={rules.filter((r) => r.id !== guideRule.id)}
          roomTypes={roomTypes}
          language={language}
          sceneRef={sceneRef}
          stampName={stampName}
          stampDefinition={stampDefinition}
          stampScale={stampScale}
          stampIconUrl={stampIconUrl}
          stampPickerOpen={stampPickerOpen}
          onChooseStamp={onChooseStamp}
          onChangeRoomTypes={onChangeRoomTypes}
          onSave={(next) => {
            onChange(guide.isNew ? [...rules, next] : rules.map((r) => (r.id === next.id ? next : r)));
            setSelectedId(next.id);
            setGuide({ ruleId: next.id, isNew: false });
          }}
          onClose={() => setGuide(null)}
        />
      );
    }
  }

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
          <button type="button" className="mep-circuit-types-new" disabled={dirty} title={busy} onClick={() => setGuide({ ruleId: '', isNew: true, blank: blankRule(uniqueName('New rule', rules)) })}>
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
            onOpenGuide={() => setGuide({ ruleId: selected.id, isNew: false })}
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
  onOpenGuide: () => void;
  onDelete: () => void;
}

/** The fields of one rule. Local draft with explicit Save and Revert. Its parent gives it a `key` built from the saved values, so it re-seeds after a save. */
function PlacementRuleForm({ rule, others, roomTypes, language, stampName, onChooseStamp, onDirtyChange, onSave, onDuplicate, onOpenGuide, onDelete }: PlacementRuleFormProps) {
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
  const byCoverage = draft.preset === 'coverage';
  const unitChoices = draft.preset === 'airChanges' ? Object.keys(AIR_CHANGE_UNITS) : AMOUNT_UNITS;
  const knownUnit = unitChoices.includes(draft.unit);
  const areaLabel = AREA_UNIT_LABELS[draft.areaUnit];
  const lengthLabel = LENGTH_UNIT_LABELS[draft.lengthUnit];
  const oldCoverageLimits = !byCoverage && [draft.maxSpacing, draft.maxArea, draft.maxWall].some((v) => v.trim() !== '');
  const unitSelect = <T extends string>(id: string, label: string, value: T, labels: Record<T, string>, onPick: (value: T) => void) => (
    <div className="mep-field-row">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onPick(e.target.value as T)}>
        {(Object.keys(labels) as T[]).map((u) => (
          <option key={u} value={u}>
            {labels[u]}
          </option>
        ))}
      </select>
    </div>
  );

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
        <select
          id="pr-preset"
          value={draft.preset}
          title={presetHelpText(draft.preset)}
          onChange={(e) => {
            const preset = e.target.value as PlacementPreset;
            update(presetPatch(draft, preset));
          }}
        >
          {(Object.keys(PLACEMENT_PRESET_LABELS) as PlacementPreset[]).map((p) => (
            <option key={p} value={p} title={presetHelpText(p)}>
              {PLACEMENT_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <p className="mep-settings-hint" data-testid="pr-preset-help">
        {PLACEMENT_PRESET_HELP[draft.preset].formula}
        {PLACEMENT_PRESET_HELP[draft.preset].symbols.map((s) => (
          <span key={s.symbol}>
            <br />
            <b>{s.symbol}</b>: {s.text}
          </span>
        ))}
      </p>
      {draft.preset !== 'lighting' && !byCoverage && (
        <div className="mep-field-row">
          <label htmlFor="pr-unit-select">Unit</label>
          <select id="pr-unit-select" value={knownUnit ? draft.unit : OTHER_UNIT} onChange={(e) => update({ unit: e.target.value === OTHER_UNIT ? '' : e.target.value })}>
            {unitChoices.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            {draft.preset !== 'airChanges' && <option value={OTHER_UNIT}>{draft.unit.trim() && !knownUnit ? `Other: ${draft.unit}` : 'Other…'}</option>}
          </select>
          {!knownUnit && draft.preset !== 'airChanges' && <input id="pr-unit" type="text" aria-label="Other unit" placeholder="for example lm" value={draft.unit} onChange={field('unit')} />}
        </div>
      )}
      {PRESET_AMOUNT_FIELDS[draft.preset].includes('perM2') && unitSelect('pr-areaUnit', 'Floor area in', draft.areaUnit, AREA_UNIT_LABELS, (areaUnit) => update({ areaUnit }))}
      {PRESET_AMOUNT_FIELDS[draft.preset].map((key) => numberRow(key, `${key === 'perM2' ? `Per ${areaLabel} floor area` : AMOUNT_FIELD_LABELS[key]} (${unit})`))}
      {draft.preset === 'lighting' && (
        <>
          {unitSelect('pr-illuminanceUnit', 'Illuminance unit', draft.illuminanceUnit, ILLUMINANCE_UNIT_LABELS, (illuminanceUnit) => update({ illuminanceUnit }))}
          {numberRow('lux', `Illuminance E (${ILLUMINANCE_UNIT_LABELS[draft.illuminanceUnit]})`, 'required')}
          {numberRow('uf', 'Utilisation factor UF', 'for example 0.6')}
          {numberRow('mf', 'Maintenance factor MF', 'for example 0.8')}
          <p className="mep-settings-hint">Amount = E × area ÷ (UF × MF), in lm. With fc, MepApp uses the floor area in ft².</p>
        </>
      )}
      {byCoverage ? (
        <>
          {unitSelect('pr-lengthUnit', 'Lengths in', draft.lengthUnit, LENGTH_UNIT_LABELS, (lengthUnit) => update({ lengthUnit }))}
          {numberRow('maxSpacing', `Max spacing (${lengthLabel})`)}
          {numberRow('maxArea', `Max area per element (${lengthLabel}²)`)}
          {numberRow('maxWall', `Max distance to a wall (${lengthLabel})`)}
          <p className="mep-settings-hint">Count = the fewest stamps that cover each point of the room. Each stamp covers a circle with radius r: max spacing ÷ √2, max distance to a wall × √2 or √(max area ÷ 2), the smallest.</p>
        </>
      ) : (
        <>
          {numberRow('capacity', `Capacity per element (${unit})`)}
          <p className="mep-settings-hint">Count = amount ÷ capacity, rounded up. Without a capacity the rule places one element per room.</p>
        </>
      )}
      {oldCoverageLimits && (
        <p className="mep-settings-hint" data-testid="pr-old-coverage">
          This rule has coverage limits from an older version. They no longer change the count. Choose By coverage to use them.
        </p>
      )}

      <h4>Count limits</h4>
      {numberRow('minCount', 'Min count per room')}
      {numberRow('maxCount', 'Max count per room')}

      <h4>Spacing</h4>
      {numberRow('wallOffset', 'Min distance to the walls (m)', '0')}
      {numberRow('minSpacing', 'Min distance between stamps (m)', 'none')}
      <p className="mep-settings-hint">These change only the positions, never the count. MepApp warns when two stamp centers are closer than the min distance.</p>

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
      {draft.strategy === 'grid' && unitSelect('pr-gridStyle', 'Grid style', draft.gridStyle, GRID_STYLE_LABELS, (gridStyle) => update({ gridStyle }))}
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
        <button type="button" onClick={onOpenGuide} disabled={dirty}>
          Edit in the guide…
        </button>
        <button type="button" onClick={onDelete} disabled={dirty}>
          Delete
        </button>
      </div>
    </div>
  );
}
