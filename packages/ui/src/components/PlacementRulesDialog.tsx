import { useRef, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import {
  GRID_STYLE_LABELS,
  hasCoverageLimit,
  LAYOUT_STRATEGY_LABELS,
  parsePlacementRules,
  PLACEMENT_PRESET_LABELS,
  roomTypeLabel,
  type PlacementRule,
  type PlacementWorkerLike,
  type RoomType,
  type StampDefinition,
} from '@mepapp/core';
import type { AutoPlaceArt } from './AutoPlaceDialog.js';
import { Dialog } from './Dialog.js';
import { DISCIPLINE_LABEL } from './ElementEditorDialog.js';
import { PlacementRuleGuide } from './PlacementRuleGuide.js';
import { blankRule, newRuleId, uniqueName } from './placementRuleDraft.js';

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
  /** Loads the art of a stamp definition for Place in the guide; null when it cannot be loaded. */
  loadStampArt: (definitionId: string) => Promise<AutoPlaceArt | null>;
  /** Creates the Web Worker of the guide's plans; without it the guide calculates on the main thread. */
  createPlacementWorker?: () => PlacementWorkerLike;
  /** Called after Place in the guide with the number of placed stamps and of replaced stamps. */
  onPlaced: (count: number, replaced: number) => void;
  onClose: () => void;
}

/**
 * The user library of placement rules (room-auto-placement.md Phase 3): the list, import and
 * export, and a summary of the selected rule. The guide (PlacementRuleGuide) edits one rule. The
 * rules are not part of a drawing.
 */
export function PlacementRulesDialog({
  rules,
  roomTypes,
  language,
  onChange,
  stampName,
  onChooseStamp,
  onExport,
  sceneRef,
  stampDefinition,
  stampScale,
  stampIconUrl,
  onChangeRoomTypes,
  stampPickerOpen,
  loadStampArt,
  createPlacementWorker,
  onPlaced,
  onClose,
}: PlacementRulesDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  // The guide edits one rule: a saved rule, or a new rule that the list gets on the first Save.
  const [guide, setGuide] = useState<{ ruleId: string; isNew: boolean; blank?: PlacementRule } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const selected = rules.find((r) => r.id === selectedId) ?? null;

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
          key={guideRule.id}
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
          loadStampArt={loadStampArt}
          createPlacementWorker={createPlacementWorker}
          onPlaced={onPlaced}
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
          <button type="button" onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <button type="button" onClick={() => onExport(rules)}>
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
              title="Double-click to edit the rule in the guide"
              onClick={() => setSelectedId(rule.id)}
              onDoubleClick={() => setGuide({ ruleId: rule.id, isNew: false })}
            >
              <span>{rule.name}</span>
            </button>
          ))}
          <button type="button" className="mep-circuit-types-new" onClick={() => setGuide({ ruleId: '', isNew: true, blank: blankRule(uniqueName('New rule', rules)) })}>
            + New rule
          </button>
        </div>
        {selected ? (
          <PlacementRuleSummary
            rule={selected}
            roomTypes={roomTypes}
            language={language}
            stampName={stampName}
            onEdit={() => setGuide({ ruleId: selected.id, isNew: false })}
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

interface PlacementRuleSummaryProps {
  rule: PlacementRule;
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  stampName: (definitionId: string) => string | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** The settings of one rule in short, with the actions. The guide edits the rule. */
function PlacementRuleSummary({ rule, roomTypes, language, stampName, onEdit, onDuplicate, onDelete }: PlacementRuleSummaryProps) {
  const typeName = (id: string) => {
    const type = roomTypes.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : id;
  };
  const rooms = [rule.roomTypeIds.length === 0 ? 'Every room' : rule.roomTypeIds.map(typeName).join(', '), rule.nameContains ? `name contains "${rule.nameContains}"` : null].filter(Boolean).join('; ');
  const limits = [rule.minCount !== undefined ? `at least ${rule.minCount}` : null, rule.maxCount !== undefined ? `at most ${rule.maxCount}` : null].filter(Boolean).join(', ');
  const layout = LAYOUT_STRATEGY_LABELS[rule.layout.strategy] + (rule.layout.strategy === 'grid' ? `, ${GRID_STYLE_LABELS[rule.layout.gridStyle ?? 'spread'].toLowerCase()}` : '');
  const rotation = rule.layout.rotation === 'fixed' ? `fixed angle ${rule.layout.fixedAngleDeg ?? 0}°` : rule.layout.strategy === 'perimeter' ? 'face into the room' : 'align to the room';
  const rows: [string, string][] = [
    ['Discipline', DISCIPLINE_LABEL[rule.discipline]],
    ['Stamp', rule.stampDefinitionId ? (stampName(rule.stampDefinitionId) ?? `${rule.stampDefinitionId} (not found)`) : 'Not chosen'],
    ['Rooms', rooms],
    ['Calculation', PLACEMENT_PRESET_LABELS[rule.preset] + (rule.preset !== 'coverage' && rule.capacityPerElement !== undefined ? `, ${rule.capacityPerElement} ${rule.amount.unit} per stamp` : '')],
    ['Count limits', limits || 'none'],
    ['Spacing', `${rule.layout.wallOffsetM} m from the walls${rule.layout.minSpacingM !== undefined ? `, ${rule.layout.minSpacingM} m between stamps` : ''}`],
    ['Layout', `${layout}; ${rotation}`],
  ];
  return (
    <div className="mep-circuit-types-form mep-placement-rule-summary" data-testid="rule-summary">
      <h4>{rule.name}</h4>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {rule.preset !== 'coverage' && hasCoverageLimit(rule.coverage) && (
        <p className="mep-settings-hint" data-testid="pr-old-coverage">
          This rule has coverage limits. Only By coverage uses them, so they do not change the count now.
        </p>
      )}
      <div className="mep-circuit-types-actions">
        <button type="button" onClick={onEdit}>
          Edit in the guide…
        </button>
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
