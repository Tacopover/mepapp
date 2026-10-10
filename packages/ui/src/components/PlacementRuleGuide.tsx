import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import {
  AIR_CHANGE_UNITS,
  AMOUNT_UNITS,
  AREA_UNIT_LABELS,
  areaInUnit,
  areaToM2,
  calculateRoomRequirement,
  calculateRooms,
  coverageRadiusM,
  flowInUnit,
  ILLUMINANCE_UNIT_LABELS,
  isAirChangeUnit,
  lengthToM,
  LENGTH_UNIT_LABELS,
  parseDecimal,
  PLACEMENT_PRESET_HELP,
  PLACEMENT_PRESET_LABELS,
  PLACEMENT_WARNING_TEXT,
  planAutoPlacement,
  PRESET_AMOUNT_FIELDS,
  ruleAppliesToRoom,
  roomTypeLabel,
  validatePlacementRule,
  type Discipline,
  type PlacementPreset,
  type PlacementRow,
  type PlacementRule,
  type Room,
  type RoomType,
  type RoomValues,
  type StampDefinition,
} from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { DISCIPLINE_LABEL } from './ElementEditorDialog.js';
import { InfoTip } from './InfoTip.js';
import { OptionalNumberInput } from './OptionalNumberInput.js';
import { draftOf, FieldError, OTHER_UNIT, presetPatch, ruleOf, type Draft } from './placementRuleDraft.js';
import { MAX_CEILING_HEIGHT_MM, MIN_CEILING_HEIGHT_MM } from './RoomProperties.js';
import { RulePreviewPlan, type PreviewRoomState } from './RulePreviewPlan.js';

export interface PlacementRuleGuideProps {
  /** The saved rule, or the blank rule of a new one. */
  rule: PlacementRule;
  /** A new rule: Save adds it to the list. */
  isNew: boolean;
  /** The other rules of the list, for the name check. */
  others: PlacementRule[];
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  sceneRef: RefObject<SketchScene | null>;
  stampName: (definitionId: string) => string | null;
  stampDefinition: (definitionId: string) => StampDefinition | undefined;
  stampScale: (definitionId: string) => number;
  stampIconUrl: (definitionId: string) => string | null;
  /** True while the stamp picker is open on top of the guide: its Escape must not close the guide. */
  stampPickerOpen: boolean;
  onChooseStamp: (onPick: (definitionId: string) => void) => void;
  onChangeRoomTypes: (types: RoomType[]) => void;
  onSave: (rule: PlacementRule) => void;
  /** Back to the rule list. */
  onClose: () => void;
}

const STEP_TITLES = ['Stamp', 'Rooms', 'Amount', 'Spacing', 'Layout', 'Check and place'];
/** The steps that the guide has. The rule form holds the fields of the other steps. */
const GUIDE_STEPS = 3;
/** The preview places a stamp also when the rule has none: this id gets the size of PREVIEW_STAMP_M. */
const PREVIEW_STAMP_ID = '__guide-preview';
const PREVIEW_STAMP_M = 0.6;

const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(' ') || room.id;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A draft box as a number: undefined when empty, NaN when it is not a number. */
const valueOf = (text: string): number | undefined => (text.trim() === '' ? undefined : (parseDecimal(text) ?? Number.NaN));
const allowPositive = (n: number) => n > 0;
const allowHeight = (mm: number) => mm >= MIN_CEILING_HEIGHT_MM && mm <= MAX_CEILING_HEIGHT_MM;
const missingData = (row: Pick<PlacementRow, 'requirement'>) => row.requirement.warnings.some((w) => w === 'noPeople' || w === 'noCalibration');

/** The symbol of an amount field in the formula of a preset, as in PLACEMENT_PRESET_HELP. */
function fieldSymbol(preset: PlacementPreset, key: 'fixed' | 'perM2' | 'perPerson' | 'perM3'): string {
  if (preset === 'custom') return { fixed: 'fixed', perM2: 'a', perPerson: 'b', perM3: 'n' }[key];
  if (key === 'perM3') return 'n';
  return preset === 'perPersonArea' && key === 'perM2' ? 'b' : 'a';
}

/** By coverage: the radius in m and the limit that sets it (the smallest), from the draft boxes. */
function coverageRadiusOf(d: Draft): { radiusM: number; from: string } | null {
  const unit = LENGTH_UNIT_LABELS[d.lengthUnit];
  const parts: { radiusM: number; from: string }[] = [];
  const spacing = valueOf(d.maxSpacing);
  const wall = valueOf(d.maxWall);
  const area = valueOf(d.maxArea);
  if (spacing !== undefined && spacing > 0) parts.push({ radiusM: lengthToM(spacing, d.lengthUnit) / Math.SQRT2, from: `max spacing ${fmt(spacing, 2)} ${unit} ÷ √2` });
  if (wall !== undefined && wall > 0) parts.push({ radiusM: lengthToM(wall, d.lengthUnit) * Math.SQRT2, from: `max distance to a wall ${fmt(wall, 2)} ${unit} × √2` });
  if (area !== undefined && area > 0) parts.push({ radiusM: Math.sqrt(areaToM2(area, d.lengthUnit) / 2), from: `√(${fmt(area)} ${unit}² ÷ 2)` });
  parts.sort((a, b) => a.radiusM - b.radiusM);
  return parts[0] ?? null;
}

type StepState = 'ok' | 'warn' | 'bad' | '';

/**
 * The guide for one placement rule (room-placement-guide.md Phase B): a step list, the current
 * step, and a sample room of the shown page that shows the result of each change at once. Steps
 * 1–3 (stamp, rooms, amount) are here; the rule form holds the spacing and the layout. Save and
 * Revert work on a draft of the rule, as in the rule form.
 */
export function PlacementRuleGuide({
  rule,
  isNew,
  others,
  roomTypes,
  language,
  sceneRef,
  stampName,
  stampDefinition,
  stampScale,
  stampIconUrl,
  stampPickerOpen,
  onChooseStamp,
  onChangeRoomTypes,
  onSave,
  onClose,
}: PlacementRuleGuideProps) {
  const initial = useMemo(() => draftOf(rule), [rule]);
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(1);
  const [view, setView] = useState<'room' | 'floor' | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const scene = sceneRef.current;
  // The preview follows room edits (room types, ceiling heights) and page changes.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!scene) return;
    const bump = () => setVersion((v) => v + 1);
    scene.on('roomsChanged', bump);
    scene.on('pageChanged', bump);
    scene.on('drawingChanged', bump);
    return () => {
      scene.off('roomsChanged', bump);
      scene.off('pageChanged', bump);
      scene.off('drawingChanged', bump);
    };
  }, [scene]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };
  const field = (key: keyof Draft) => (e: { target: { value: string } }) => update({ [key]: e.target.value } as Partial<Draft>);

  const parsed = useMemo((): { rule: PlacementRule | null; error: string | null } => {
    try {
      return { rule: ruleOf(rule.id, draft), error: null };
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      return { rule: null, error: err.message };
    }
  }, [rule.id, draft]);

  const pageIndex = scene?.getPageIndex() ?? 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pageRooms = useMemo(() => (scene ? scene.listRooms().filter((r) => r.pageIndex === pageIndex) : []), [scene, pageIndex, version]);
  const calibration = scene?.getCalibration(pageIndex) ?? null;
  const ptPerM = calibration ? 1000 * calibration.pageUnitsPerRealUnit : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const types = useMemo(() => (scene ? scene.getRoomTypes() : roomTypes.map((t) => ({ ...t, inLibrary: true }))), [scene, roomTypes, version]);
  const typeName = (id: string | undefined) => {
    const type = id === undefined ? undefined : types.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : (id ?? 'No type');
  };

  const definition = draft.stampDefinitionId ? stampDefinition(draft.stampDefinitionId) : undefined;
  const scale = definition ? stampScale(definition.id) : 1;
  const stampW = definition ? definition.nativeWidth * scale : PREVIEW_STAMP_M * (ptPerM ?? 40);
  const stampH = definition ? definition.nativeHeight * scale : PREVIEW_STAMP_M * (ptPerM ?? 40);
  const stampSizePt = useMemo(() => ({ width: stampW, height: stampH }), [stampW, stampH]);
  const iconUrl = draft.stampDefinitionId ? stampIconUrl(draft.stampDefinitionId) : null;

  // The preview always has a stamp, so a rule without one still shows the positions.
  const previewRule = useMemo(() => (parsed.rule ? { ...parsed.rule, stampDefinitionId: PREVIEW_STAMP_ID } : null), [parsed.rule]);
  const plan = useMemo(() => {
    if (!scene || !previewRule) return null;
    const valuesOf = (room: Room) => scene.getRoomValues(room);
    return {
      valuesOf,
      calibrationOf: (page: number) => scene.getCalibration(page),
      sizeOf: () => stampSizePt,
    };
    // version: room values change with room types and ceiling heights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, previewRule, stampSizePt, version, roomTypes]);

  const matches = (room: Room) => ruleAppliesToRoom({ roomTypeIds: draft.roomTypeIds, nameContains: draft.nameContains }, room);
  const matched = pageRooms.filter(matches);
  // The dry run of every room of the page: no geometry, so it is fast enough for each key press.
  const pageRows = useMemo(() => (plan && previewRule ? calculateRooms([previewRule], pageRooms, plan.valuesOf).rows : []), [plan, previewRule, pageRooms]);
  const pageRowOf = useMemo(() => new Map(pageRows.map((row) => [row.room.id, row])), [pageRows]);

  const sample = pageRooms.find((r) => r.id === sampleId) ?? matched[0] ?? pageRooms[0] ?? null;
  const sampleValues: RoomValues | null = useMemo(() => (scene && sample ? scene.getRoomValues(sample) : null), [scene, sample, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const sampleMatches = sample ? matches(sample) : false;
  // One room only while the user types (room-placement-guide.md §6).
  const sampleRow = useMemo(
    () => (plan && previewRule && sample && sampleMatches ? (planAutoPlacement([previewRule], [sample], plan.valuesOf, plan.calibrationOf, plan.sizeOf).rows[0] ?? null) : null),
    [plan, previewRule, sample, sampleMatches],
  );

  const mode = view ?? (step >= 3 ? 'room' : 'floor');
  const [floorRows, setFloorRows] = useState<PlacementRow[]>([]);
  useEffect(() => {
    if (mode !== 'floor' || !plan || !previewRule) return;
    const timer = setTimeout(() => setFloorRows(planAutoPlacement([previewRule], pageRooms, plan.valuesOf, plan.calibrationOf, plan.sizeOf).rows), 300);
    return () => clearTimeout(timer);
  }, [mode, plan, previewRule, pageRooms]);

  const roomState = (room: Room): PreviewRoomState => {
    const row = pageRowOf.get(room.id);
    if (row) return missingData(row) ? 'missing' : 'match';
    if (matches(room)) return 'match';
    return room.roomTypeId === undefined ? 'noType' : 'noMatch';
  };

  const untyped = pageRooms.filter((r) => r.roomTypeId === undefined);
  const missingRows = pageRows.filter(missingData);
  const preset = draft.preset;
  const byCoverage = preset === 'coverage';
  const coverage = byCoverage ? coverageRadiusOf(draft) : null;

  const stepStatus = (n: number): [StepState, string] => {
    if (n === 1) return draft.stampDefinitionId ? ['ok', stampName(draft.stampDefinitionId) ?? 'Stamp not found'] : ['', 'Choose a stamp'];
    if (n === 2) {
      if (matched.length === 0) return ['warn', 'No room matches'];
      if (untyped.length > 0 && draft.roomTypeIds.length > 0) return ['warn', `${plural(untyped.length, 'room')} without a type`];
      return ['ok', plural(matched.length, 'room')];
    }
    if (n === 3) {
      if (parsed.error) return ['bad', 'A number is not correct'];
      if (byCoverage && !coverage) return ['warn', 'Enter a coverage limit'];
      if (missingRows.length > 0) return ['warn', `${plural(missingRows.length, 'room')}: data missing`];
      return ['ok', PLACEMENT_PRESET_LABELS[preset]];
    }
    return ['', 'In the rule form'];
  };

  const requestClose = () => {
    if (stampPickerOpen) return;
    if (dirty) {
      setMessage('Save or revert your changes first.');
      return;
    }
    onClose();
  };
  const save = () => {
    try {
      const next = ruleOf(rule.id, draft);
      const problem = validatePlacementRule(next, others);
      if (problem) {
        setMessage(problem);
        return;
      }
      onSave(next);
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      setMessage(err.message);
    }
  };

  const setAreaPerPerson = (type: RoomType, value: number | null) => {
    const { areaPerPersonM2: _old, ...rest } = type;
    const next: RoomType = value === null ? rest : { ...rest, areaPerPersonM2: value };
    onChangeRoomTypes(roomTypes.some((t) => t.id === type.id) ? roomTypes.map((t) => (t.id === type.id ? next : t)) : [...roomTypes, next]);
  };

  const unit = preset === 'lighting' ? 'lm' : draft.unit.trim() || 'unit';
  // Called as functions, not as components: a component made in the render mounts again on each key press, and its box loses the focus.
  const stepView = () => {
    if (step === 1) return stepStamp();
    if (step === 2) return stepRooms();
    return stepAmount();
  };

  // ---------- Step 1 ----------
  function stepStamp() {
    const name = draft.stampDefinitionId ? (stampName(draft.stampDefinitionId) ?? `${draft.stampDefinitionId} (not found)`) : null;
    return (
      <>
        <h2>What do you want to place?</h2>
        <p className="mep-guide-lead">MepApp places this stamp in each room that the rule applies to. The name helps you find the rule again later.</p>
        <div className="mep-guide-section">
          <div className="mep-guide-field">
            <label htmlFor="pg-name">Rule name</label>
            <input id="pg-name" type="text" value={draft.name} onChange={field('name')} />
          </div>
          <div className="mep-guide-field">
            <label htmlFor="pg-discipline">Discipline</label>
            <select id="pg-discipline" value={draft.discipline} onChange={(e) => update({ discipline: e.target.value as Discipline })}>
              {(Object.keys(DISCIPLINE_LABEL) as Discipline[]).map((d) => (
                <option key={d} value={d}>
                  {DISCIPLINE_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mep-guide-section">
          <h3>Stamp</h3>
          <div className="mep-guide-stamp" data-testid="pg-stamp">
            {iconUrl ? <img src={iconUrl} alt="" /> : <span className="mep-guide-stamp-empty" aria-hidden="true" />}
            <span className="mep-guide-stamp-name">{name ?? 'No stamp chosen. The sample room shows a 600 mm square.'}</span>
            <button type="button" onClick={() => onChooseStamp((id) => update({ stampDefinitionId: id }))}>
              Choose…
            </button>
            {draft.stampDefinitionId && (
              <button type="button" onClick={() => update({ stampDefinitionId: null })}>
                Clear
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // ---------- Step 2 ----------
  function stepRooms() {
    const countOf = (typeId: string) => pageRooms.filter((r) => r.roomTypeId === typeId).length;
    return (
      <>
        <h2>Which rooms get this stamp?</h2>
        <p className="mep-guide-lead">Click the room types. The plan shows the rooms that match in blue. MepApp finds the room type from the room name in the drawing.</p>
        {untyped.length > 0 && (
          <div className="mep-guide-callout" data-testid="pg-untyped">
            <span>
              <b>{plural(untyped.length, 'room')}</b> on this page {untyped.length === 1 ? 'has' : 'have'} no room type. A rule with room types does not find {untyped.length === 1 ? 'it' : 'them'}. Each change is one undo step.
            </span>
            <div className="mep-guide-untyped">
              {untyped.map((room) => (
                <div key={room.id} className="mep-guide-untyped-row">
                  <button type="button" className="mep-guide-link" onClick={() => setSampleId(room.id)}>
                    {roomLabel(room)}
                  </button>
                  <select aria-label={`Room type of ${roomLabel(room)}`} data-room={room.id} value="" onChange={(e) => e.target.value && scene?.setRoomType([room.id], e.target.value)}>
                    <option value="" disabled>
                      Choose a type…
                    </option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {roomTypeLabel(t, language)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mep-guide-section">
          <h3>Room types</h3>
          <div className="mep-guide-chips" role="group" aria-label="Room types">
            {types.map((t) => {
              const on = draft.roomTypeIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`mep-guide-chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  data-type={t.id}
                  onClick={() => update({ roomTypeIds: on ? draft.roomTypeIds.filter((id) => id !== t.id) : [...draft.roomTypeIds, t.id] })}
                >
                  {roomTypeLabel(t, language)}
                  <span className="c">{countOf(t.id)}</span>
                </button>
              );
            })}
          </div>
          <p className="mep-guide-note">{draft.roomTypeIds.length === 0 ? 'No type chosen: the rule applies to every room.' : `${plural(draft.roomTypeIds.length, 'room type')} chosen. The numbers count the rooms of this page.`}</p>
        </div>
        <details className="mep-guide-section" open={draft.nameContains.trim() !== ''}>
          <summary>More filters</summary>
          <div className="mep-guide-field">
            <label htmlFor="pg-nameContains">Name contains</label>
            <input id="pg-nameContains" type="text" placeholder="any name" value={draft.nameContains} onChange={field('nameContains')} />
          </div>
        </details>
        <div className="mep-guide-section">
          <h3>Rooms that match on this page ({matched.length})</h3>
          {matched.length === 0 ? (
            <p className="mep-guide-note">No room matches. Click at least one room type, or change the name filter.</p>
          ) : (
            <div className="mep-guide-chips mep-guide-matchlist" data-testid="pg-matched">
              {matched.map((room) => (
                <button key={room.id} type="button" className={`mep-guide-chip plain${room.id === sample?.id ? ' sel' : ''}`} onClick={() => setSampleId(room.id)}>
                  {roomLabel(room)}
                  <span className="c">{fmt(scene?.getRoomValues(room).areaM2)} m²</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // ---------- Step 3 ----------
  function stepAmount() {
    const fields = PRESET_AMOUNT_FIELDS[preset];
    const v = sampleValues;
    const area = v?.areaM2 ?? null;
    const unitChoices = preset === 'airChanges' ? Object.keys(AIR_CHANGE_UNITS) : AMOUNT_UNITS;
    const knownUnit = unitChoices.includes(draft.unit);
    const requirement = parsed.rule && v ? calculateRoomRequirement(parsed.rule, v) : null;
    const res = (x: number | null | undefined, u = unit) => (x === null || x === undefined ? '' : `= ${fmt(x)} ${u}`);
    const amountTerm = (key: 'fixed' | 'perPerson' | 'perM2' | 'perM3', label: string, input: string, after: ReactNode, result: ReactNode) => (
      <div className="mep-guide-term" key={key}>
        <span className="mep-guide-sym">{fieldSymbol(preset, key)}</span>
        <input className="mep-guide-num" id={`pg-${key}`} type="text" inputMode="decimal" aria-label={label} value={input} onChange={field(key)} />
        {after}
        <span className="mep-guide-res" data-testid={`pg-t-${key}`}>
          {result}
        </span>
      </div>
    );
    const a = (key: 'fixed' | 'perPerson' | 'perM2' | 'perM3' | 'minimum') => valueOf(draft[key]);
    const sum = [a('fixed') ?? 0, (a('perPerson') ?? 0) * (v?.people?.count ?? 0), (a('perM2') ?? 0) * areaInUnit(area ?? 0, draft.areaUnit), flowInUnit((a('perM3') ?? 0) * (v?.volumeM3 ?? 0), draft.unit)].reduce((s, x) => s + x, 0);
    const unitSelect = <T extends string>(id: string, label: string, value: T, labels: Record<T, string>, onPick: (value: T) => void) => (
      <select id={id} className="mep-guide-unit" aria-label={label} value={value} onChange={(e) => onPick(e.target.value as T)}>
        {(Object.keys(labels) as T[]).map((u) => (
          <option key={u} value={u}>
            {labels[u]}
          </option>
        ))}
      </select>
    );
    const amountUnitSelect = (
      <>
        <select id="pg-unit-select" className="mep-guide-unit" aria-label={preset === 'airChanges' ? 'Air flow unit' : 'Amount unit'} value={knownUnit ? draft.unit : OTHER_UNIT} onChange={(e) => update({ unit: e.target.value === OTHER_UNIT ? '' : e.target.value })}>
          {unitChoices.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          {preset !== 'airChanges' && <option value={OTHER_UNIT}>{draft.unit.trim() && !knownUnit ? `Other: ${draft.unit}` : 'Other…'}</option>}
        </select>
        {!knownUnit && preset !== 'airChanges' && <input id="pg-unit" className="mep-guide-num wide" type="text" aria-label="Other unit" placeholder="for example lm" value={draft.unit} onChange={field('unit')} />}
      </>
    );
    const peopleText = v?.people ? plural(v.people.count, 'person') : null;
    const missing = (text: string) => <span className="mep-guide-missing">{text}</span>;
    const lightingArea = areaInUnit(area ?? 0, draft.illuminanceUnit === 'fc' ? 'ft2' : 'm2');
    const lux = valueOf(draft.lux);
    const uf = valueOf(draft.uf);
    const mf = valueOf(draft.mf);
    const needsArea = fields.includes('perM2') || preset === 'lighting' || byCoverage || (fields.includes('perM3') && draft.perM3.trim() !== '');
    const needsPeople = fields.includes('perPerson') && draft.perPerson.trim() !== '';
    const needsVolume = fields.includes('perM3') && draft.perM3.trim() !== '';
    const noPeople = matched.filter((room) => scene && !scene.getRoomValues(room).people);
    const noPeopleTypes = [...new Set(noPeople.map((r) => r.roomTypeId))];
    const heights = scene?.getCeilingHeights();
    return (
      <>
        <h2>How many stamps does one room need?</h2>
        <p className="mep-guide-lead">
          Choose how MepApp calculates the number of stamps. Point to <b>i</b> on a card for an explanation. The lines below calculate {sample ? <b>{roomLabel(sample)}</b> : 'a room'} as an example. Click a room on the plan to calculate a different room.
        </p>
        <div className="mep-guide-section">
          <h3>Calculation</h3>
          <div className="mep-guide-choices" role="radiogroup" aria-label="Calculation">
            {(Object.keys(PLACEMENT_PRESET_LABELS) as PlacementPreset[]).map((p) => (
              <div key={p} className={`mep-guide-choice${preset === p ? ' on' : ''}`}>
                <button type="button" role="radio" aria-checked={preset === p} data-preset={p} onClick={() => preset !== p && update(presetPatch(draft, p))}>
                  <span className="ct">{PLACEMENT_PRESET_LABELS[p]}</span>
                  <span className="cf">{PLACEMENT_PRESET_HELP[p].formula.replace(/^(Amount|Light|Count) = /, '')}</span>
                </button>
                <InfoTip label={`Explanation of ${PLACEMENT_PRESET_LABELS[p]}`}>
                  <b>{PLACEMENT_PRESET_HELP[p].formula}</b>
                  <dl>
                    {PLACEMENT_PRESET_HELP[p].symbols.map((s) => (
                      <div key={s.symbol}>
                        <dt>{s.symbol}</dt>
                        <dd>{s.text}</dd>
                      </div>
                    ))}
                  </dl>
                  {PLACEMENT_PRESET_HELP[p].note}
                </InfoTip>
              </div>
            ))}
          </div>
        </div>

        {byCoverage ? (
          <div className="mep-guide-section">
            <h3>Coverage limits</h3>
            <div className="mep-guide-inline">
              <span>Lengths in</span>
              {unitSelect('pg-lengthUnit', 'Length unit', draft.lengthUnit, LENGTH_UNIT_LABELS, (lengthUnit) => update({ lengthUnit }))}
            </div>
            <div className="mep-guide-formula">
              {(
                [
                  ['maxSpacing', 'Max spacing', `${LENGTH_UNIT_LABELS[draft.lengthUnit]} between two stamps`],
                  ['maxWall', 'Max distance to a wall', LENGTH_UNIT_LABELS[draft.lengthUnit]],
                  ['maxArea', 'Max area per stamp', `${LENGTH_UNIT_LABELS[draft.lengthUnit]}²`],
                ] as const
              ).map(([key, label, after]) => (
                <div className="mep-guide-term" key={key}>
                  <span className="mep-guide-label">{label}</span>
                  <input className="mep-guide-num" id={`pg-${key}`} type="text" inputMode="decimal" placeholder="none" aria-label={label} value={draft[key]} onChange={field(key)} />
                  <span>{after}</span>
                </div>
              ))}
              {coverage ? (
                <div className="mep-guide-term result" data-testid="pg-radius">
                  <span>Each stamp covers a circle with a radius of</span>
                  <span className="mep-guide-val">{fmt(coverage.radiusM, 2)} m</span>
                  <span className="mep-guide-note">({coverage.from}, the smallest limit)</span>
                </div>
              ) : (
                <div className="mep-guide-term result">{missing('Enter at least one coverage limit.')}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mep-guide-section">
            <h3>Amount{sample ? ` for ${roomLabel(sample)}` : ''}</h3>
            <div className="mep-guide-inline">
              <span>Units</span>
              {preset === 'lighting' ? (
                unitSelect('pg-illuminanceUnit', 'Illuminance unit', draft.illuminanceUnit, { lx: 'lx, floor area in m²', fc: 'fc (foot-candle), floor area in ft²' }, (illuminanceUnit) => update({ illuminanceUnit }))
              ) : preset === 'airChanges' ? (
                <>
                  <span className="mep-guide-note">result in</span>
                  {amountUnitSelect}
                </>
              ) : (
                <>
                  {amountUnitSelect}
                  {fields.includes('perM2') && (
                    <>
                      <span className="mep-guide-note">per</span>
                      {unitSelect('pg-areaUnit', 'Area unit', draft.areaUnit, AREA_UNIT_LABELS, (areaUnit) => update({ areaUnit }))}
                      <span className="mep-guide-note">floor area</span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="mep-guide-formula">
              {fields.includes('fixed') && amountTerm('fixed', 'Amount per room', draft.fixed, <span>{unit} per room</span>, res(a('fixed')))}
              {fields.includes('perPerson') &&
                amountTerm(
                  'perPerson',
                  'Amount per person',
                  draft.perPerson,
                  <>
                    <span>{unit} per person</span>
                    <span className="mep-guide-op">×</span>
                    <span className="mep-guide-val" data-testid="pg-people">
                      {peopleText ?? missing('? persons')}
                    </span>
                  </>,
                  a('perPerson') === undefined ? '' : v?.people ? res(a('perPerson')! * v.people.count) : missing('cannot calculate'),
                )}
              {fields.includes('perM2') &&
                amountTerm(
                  'perM2',
                  'Amount per area',
                  draft.perM2,
                  <>
                    <span>
                      {unit} per {AREA_UNIT_LABELS[draft.areaUnit]}
                    </span>
                    <span className="mep-guide-op">×</span>
                    <span className="mep-guide-val" data-testid="pg-area">
                      {area === null ? missing('no scale') : `${fmt(areaInUnit(area, draft.areaUnit))} ${AREA_UNIT_LABELS[draft.areaUnit]}`}
                    </span>
                  </>,
                  a('perM2') === undefined || area === null ? '' : res(a('perM2')! * areaInUnit(area, draft.areaUnit)),
                )}
              {fields.includes('perM3') &&
                amountTerm(
                  'perM3',
                  'Air changes per hour',
                  draft.perM3,
                  <>
                    <span>air changes per hour</span>
                    <span className="mep-guide-op">×</span>
                    <span className="mep-guide-val" data-testid="pg-volume">
                      {v?.volumeM3 == null ? missing('no scale') : `${fmt(v.volumeM3)} m³`}
                    </span>
                  </>,
                  a('perM3') === undefined || v?.volumeM3 == null
                    ? ''
                    : isAirChangeUnit(draft.unit) && draft.unit !== 'm³/h'
                      ? `${fmt(a('perM3')! * v.volumeM3)} m³/h ${res(flowInUnit(a('perM3')! * v.volumeM3, draft.unit))}`
                      : res(a('perM3')! * v.volumeM3, 'm³/h'),
                )}
              {preset === 'lighting' && (
                <div className="mep-guide-term">
                  <span className="mep-guide-sym">E</span>
                  <input className="mep-guide-num" id="pg-lux" type="text" inputMode="decimal" aria-label="Illuminance" value={draft.lux} onChange={field('lux')} />
                  <span>{ILLUMINANCE_UNIT_LABELS[draft.illuminanceUnit]}</span>
                  <span className="mep-guide-op">×</span>
                  <span className="mep-guide-val">{area === null ? missing('no scale') : `${fmt(lightingArea)} ${draft.illuminanceUnit === 'fc' ? 'ft²' : 'm²'}`}</span>
                  <span className="mep-guide-op">÷ (</span>
                  <span className="mep-guide-sym">UF</span>
                  <input className="mep-guide-num short" id="pg-uf" type="text" inputMode="decimal" aria-label="Utilisation factor" value={draft.uf} onChange={field('uf')} />
                  <span className="mep-guide-op">×</span>
                  <span className="mep-guide-sym">MF</span>
                  <input className="mep-guide-num short" id="pg-mf" type="text" inputMode="decimal" aria-label="Maintenance factor" value={draft.mf} onChange={field('mf')} />
                  <span className="mep-guide-op">)</span>
                  <span className="mep-guide-res" data-testid="pg-t-light">
                    {area !== null && lux !== undefined && uf && mf ? res((lux * lightingArea) / (uf * mf), 'lm') : ''}
                  </span>
                </div>
              )}
              {fields.includes('minimum') && (
                <div className="mep-guide-term">
                  <span className="mep-guide-label">At least</span>
                  <input className="mep-guide-num" id="pg-minimum" type="text" inputMode="decimal" placeholder="none" aria-label="Minimum per room" value={draft.minimum} onChange={field('minimum')} />
                  <span>{unit}</span>
                  <span className="mep-guide-res">{a('minimum') === undefined || !requirement || requirement.required === null ? '' : sum < a('minimum')! ? 'the minimum applies' : 'not needed'}</span>
                </div>
              )}
              <div className="mep-guide-term total">
                <span>Required amount</span>
                <span className="mep-guide-res" data-testid="pg-required">
                  {parsed.error ? missing(parsed.error) : requirement?.required != null ? `${fmt(requirement.required)} ${unit}` : sample ? missing('missing room data') : '–'}
                </span>
              </div>
            </div>
          </div>
        )}

        {!byCoverage && (
          <div className="mep-guide-section">
            <h3>What one stamp gives</h3>
            <div className="mep-guide-formula">
              <div className="mep-guide-term">
                <span className="mep-guide-label">One stamp gives</span>
                <input className="mep-guide-num" id="pg-capacity" type="text" inputMode="decimal" placeholder="none" aria-label="Capacity per stamp" value={draft.capacity} onChange={field('capacity')} />
                <span>{unit}</span>
              </div>
              <div className="mep-guide-term result" data-testid="pg-quantity">
                {requirement?.quantityCount != null ? (
                  <>
                    <span>
                      {fmt(requirement.required)} ÷ {fmt(valueOf(draft.capacity))} = {fmt(requirement.required! / valueOf(draft.capacity)!, 2)}, rounded up
                    </span>
                    <span className="mep-guide-res">{plural(requirement.quantityCount, 'stamp')}</span>
                  </>
                ) : requirement && requirement.countSource === 'onePerRoom' ? (
                  <>
                    <span>No capacity: each room gets one stamp.</span>
                    <span className="mep-guide-res">1 stamp</span>
                  </>
                ) : (
                  <span>Enter the missing room data first.</span>
                )}
              </div>
              <label className="mep-guide-term mep-guide-check-row">
                <input type="checkbox" id="pg-writeCapacity" checked={draft.writeCapacity} onChange={(e) => update({ writeCapacity: e.target.checked })} />
                <span>Write the amount per stamp to each stamp as its capacity</span>
              </label>
            </div>
          </div>
        )}

        <div className="mep-guide-section">
          <h3>Count limits per room</h3>
          <div className="mep-guide-formula">
            <div className="mep-guide-term">
              <span className="mep-guide-label">At least</span>
              <input className="mep-guide-num" id="pg-minCount" type="text" inputMode="numeric" placeholder="none" aria-label="Min count per room" value={draft.minCount} onChange={field('minCount')} />
              <span>stamps, at most</span>
              <input className="mep-guide-num" id="pg-maxCount" type="text" inputMode="numeric" placeholder="none" aria-label="Max count per room" value={draft.maxCount} onChange={field('maxCount')} />
              <span>stamps</span>
            </div>
          </div>
        </div>

        <div className="mep-guide-section">
          <h3>Room data this calculation needs</h3>
          <div className="mep-guide-checks" data-testid="pg-checks">
            <Check
              state={needsArea ? (calibration ? 'ok' : 'bad') : 'off'}
              title="Floor area"
              testId="pg-check-area"
              sub={needsArea ? (calibration ? `From the room outline and the scale of page ${pageIndex + 1}.` : `Page ${pageIndex + 1} has no scale. Set the scale or calibrate the page first.`) : 'This calculation does not use it.'}
            />
            <Check
              state={needsPeople ? (noPeople.length > 0 ? 'warn' : 'ok') : 'off'}
              title="Number of persons"
              testId="pg-check-people"
              sub={
                !needsPeople
                  ? 'This calculation does not use it.'
                  : noPeople.length > 0
                    ? `${plural(noPeople.length, 'room')} that match${noPeople.length === 1 ? 'es' : ''} ${noPeople.length === 1 ? 'has' : 'have'} no number: ${noPeople.slice(0, 6).map(roomLabel).join(', ')}${noPeople.length > 6 ? ` and ${noPeople.length - 6} more` : ''}. Enter an area per person below.`
                    : 'Each room that matches has a number of persons.'
              }
            />
            <Check
              state={needsVolume ? 'ok' : 'off'}
              title="Ceiling height (for the volume)"
              testId="pg-check-height"
              sub={needsVolume && heights ? `${heights.pdfMm ?? heights.globalMm} mm for this drawing (${heights.pdfMm !== undefined ? 'drawing' : 'Settings'}). A room or a room type can have its own height.` : 'This calculation does not use it.'}
            />
          </div>
          {needsPeople && noPeopleTypes.length > 0 && (
            <>
              <div className="mep-guide-formula" data-testid="pg-area-per-person">
                {noPeopleTypes.map((typeId) => {
                  const type = typeId === undefined ? undefined : types.find((t) => t.id === typeId);
                  const rooms = noPeople.filter((r) => r.roomTypeId === typeId);
                  return (
                    <div className="mep-guide-term" key={typeId ?? '-'}>
                      <span className="mep-guide-label">
                        <b>{typeName(typeId)}</b> ({plural(rooms.length, 'room')})
                      </span>
                      {type ? (
                        <>
                          <OptionalNumberInput id={`pg-app-${type.id}`} value={type.areaPerPersonM2} placeholder="?" allow={allowPositive} onCommit={(value) => setAreaPerPerson(type, value)} />
                          <span>m² per person</span>
                        </>
                      ) : (
                        <span className="mep-guide-note">Give these rooms a room type in step 2, or enter the persons in Room Properties.</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mep-guide-note">MepApp keeps the area per person with the room type in your room-type library, so every room of that type gets it. It rounds down: a person who does not fit in the remaining area does not count.</p>
            </>
          )}
          {needsVolume && heights && (
            <div className="mep-guide-formula">
              <div className="mep-guide-term">
                <span className="mep-guide-label">Ceiling height of this drawing</span>
                <OptionalNumberInput
                  id="pg-ceiling"
                  value={heights.pdfMm}
                  placeholder={`${heights.globalMm} (Settings)`}
                  allow={allowHeight}
                  onCommit={(mm) => scene?.setDrawingCeilingHeight(mm)}
                />
                <span>mm</span>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  const planStamps = mode === 'room' ? (sampleRow?.stamps ?? []) : floorRows.flatMap((row) => row.stamps);
  const status = stepStatus;

  return (
    <Dialog
      title={`Placement rule guide: ${draft.name || 'new rule'}`}
      className="mep-modal--placement-guide"
      onClose={requestClose}
      actions={
        <>
          {message && (
            <span className="mep-guide-message" role="alert">
              {message}
            </span>
          )}
          <button type="button" onClick={save} disabled={!dirty && !isNew}>
            Save
          </button>
          <button type="button" onClick={() => (setDraft(initial), setMessage(null))} disabled={!dirty}>
            Revert
          </button>
          <button type="button" onClick={requestClose}>
            Close
          </button>
        </>
      }
    >
      <div className="mep-guide">
        <nav className="mep-guide-steps" aria-label="Steps">
          {STEP_TITLES.map((title, i) => {
            const n = i + 1;
            const [state, sub] = status(n);
            const off = n > GUIDE_STEPS;
            return (
              <button
                key={title}
                type="button"
                className={`mep-guide-step ${state}${step === n ? ' on' : ''}`}
                aria-current={step === n ? 'step' : undefined}
                disabled={off}
                title={off ? 'Set this in the rule form for now: Close, then edit the rule there.' : undefined}
                data-step={n}
                onClick={() => {
                  setStep(n);
                  setView(null);
                }}
              >
                <span className="n">{state === 'ok' && step !== n ? '✓' : n}</span>
                <span className="t">{title}</span>
                <span className="s">{sub}</span>
              </button>
            );
          })}
        </nav>
        <section className="mep-guide-card" data-testid="pg-step">
          {stepView()}
          <div className="mep-guide-nav">
            <button type="button" disabled={step === 1} onClick={() => setStep(step - 1)}>
              Back
            </button>
            {step < GUIDE_STEPS ? (
              <button type="button" className="primary" onClick={() => (setStep(step + 1), setView(null))}>
                Next: {STEP_TITLES[step]}
              </button>
            ) : (
              <span className="mep-guide-note">Save the rule. Set the spacing and the layout in the rule form for now.</span>
            )}
          </div>
        </section>
        <aside className="mep-guide-side">
          <div className="mep-guide-panel">
            <div className="mep-guide-panel-head">
              <span className="pt">{mode === 'room' ? 'Sample room' : 'Whole floor'}</span>
              <div className="mep-guide-seg" role="group" aria-label="View">
                <button type="button" className={mode === 'room' ? 'on' : ''} aria-pressed={mode === 'room'} onClick={() => setView('room')}>
                  This room
                </button>
                <button type="button" className={mode === 'floor' ? 'on' : ''} aria-pressed={mode === 'floor'} onClick={() => setView('floor')}>
                  Whole floor
                </button>
              </div>
            </div>
            {!scene ? (
              <p className="mep-guide-note">Open a drawing with rooms to see a sample room.</p>
            ) : (
              <>
                {mode === 'room' && sampleValues && (
                  <div className="mep-guide-facts" data-testid="pg-facts">
                    <span className="mep-guide-fact">{sampleValues.areaM2 === null ? 'no scale' : `${fmt(sampleValues.areaM2)} m²`}</span>
                    {sampleValues.lengthM !== null && sampleValues.widthM !== null && (
                      <span className="mep-guide-fact">
                        {sampleValues.lengthM.toFixed(2)} × {sampleValues.widthM.toFixed(2)} m
                      </span>
                    )}
                    <span className="mep-guide-fact">{typeName(sample?.roomTypeId)}</span>
                    {sampleValues.people && (
                      <span className="mep-guide-fact">
                        {plural(sampleValues.people.count, 'person')} <small>{sampleValues.people.source === 'room' ? 'room value' : 'from the room type, rounded down'}</small>
                      </span>
                    )}
                    {sampleValues.volumeM3 !== null && (
                      <span className="mep-guide-fact">
                        {fmt(sampleValues.volumeM3)} m³ <small>ceiling {sampleValues.ceilingHeight.mm} mm</small>
                      </span>
                    )}
                  </div>
                )}
                <RulePreviewPlan
                  mode={mode}
                  rooms={pageRooms}
                  sample={sample}
                  calibration={calibration}
                  roomState={roomState}
                  stamps={step >= 3 || mode === 'floor' ? planStamps : []}
                  stampSizePt={stampSizePt}
                  stampIconUrl={iconUrl}
                  wallOffsetM={parsed.rule?.layout.wallOffsetM ?? 0}
                  coverageRadiusM={byCoverage && parsed.rule ? coverageRadiusM(parsed.rule.coverage) : null}
                  onPickRoom={(id) => {
                    setSampleId(id);
                    if (view === 'floor' && step >= 3) setView(null);
                  }}
                />
                <div className="mep-guide-legend">
                  {mode === 'room' ? (
                    <>
                      <span style={{ ['--sw' as string]: 'var(--accent-soft)' }}>room that matches</span>
                      <span style={{ ['--sw' as string]: 'var(--guide-band)' }}>min distance to the walls</span>
                      {byCoverage && <span style={{ ['--sw' as string]: 'rgba(23, 90, 138, 0.15)' }}>coverage circle</span>}
                      <span className="plain">click a room to use it</span>
                    </>
                  ) : (
                    <>
                      <span style={{ ['--sw' as string]: 'var(--accent-soft)' }}>matches the rule</span>
                      <span style={{ ['--sw' as string]: 'var(--surface)' }}>does not match</span>
                      <span style={{ ['--sw' as string]: 'var(--guide-warn-soft)' }}>missing data</span>
                      <span className="hatch">no room type</span>
                      <span className="plain">click a room to use it</span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {scene && sample && step >= 3 && (
            <WhyBox row={sampleRow} matches={sampleMatches} sampleName={roomLabel(sample)} unit={unit} rule={parsed.rule} coverage={coverage} error={parsed.error} />
          )}
        </aside>
      </div>
    </Dialog>
  );
}

function Check({ state, title, sub, testId }: { state: 'ok' | 'warn' | 'bad' | 'off'; title: string; sub: string; testId: string }) {
  return (
    <div className={`mep-guide-check ${state}`} data-testid={testId} data-state={state}>
      <span className="ic">{state === 'ok' ? '✓' : state === 'off' ? '–' : '!'}</span>
      <div>
        <b>{title}</b>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

interface WhyBoxProps {
  row: PlacementRow | null;
  matches: boolean;
  sampleName: string;
  unit: string;
  rule: PlacementRule | null;
  coverage: { radiusM: number; from: string } | null;
  error: string | null;
}

/** "Why N stamps?": the calculation that gave the count, the count limits, and the result for the sample room. */
function WhyBox({ row, matches, sampleName, unit, rule, coverage, error }: WhyBoxProps) {
  if (!matches) {
    return (
      <div className="mep-guide-panel">
        <p className="mep-guide-note">{sampleName} does not match this rule. Click a blue room on the plan.</p>
      </div>
    );
  }
  if (error || !rule || !row) {
    return (
      <div className="mep-guide-panel">
        <p className="mep-guide-note">{error ?? 'MepApp cannot calculate this room.'}</p>
      </div>
    );
  }
  const req = row.requirement;
  const maxHit = row.warnings.includes('maxCountReached');
  const line = (cls: string, label: string, why: string, n: ReactNode, testId?: string) => (
    <div className={`cr ${cls}`} data-testid={testId}>
      <span className="cl">{label}</span>
      <span className="cw">{why}</span>
      <span className="cn">{n}</span>
    </div>
  );
  let first: ReactNode;
  let base: number | null = null;
  if (req.countSource === 'coverage') {
    base = req.count;
    first = coverage
      ? line(maxHit ? '' : 'win', 'By coverage', `Circles of ${fmt(coverage.radiusM, 2)} m (${coverage.from}) cover the room`, req.count ?? '?', 'pg-why-source')
      : line('blocked', 'By coverage', 'Enter a coverage limit (step 3)', '?', 'pg-why-source');
  } else if (req.count === null) {
    first = line('blocked', PLACEMENT_PRESET_LABELS[rule.preset], 'Room data is missing (step 3)', '?', 'pg-why-source');
  } else if (req.countSource === 'amount') {
    base = req.quantityCount;
    first = line('', PLACEMENT_PRESET_LABELS[rule.preset], `${fmt(req.required)} ${unit} ÷ ${fmt(rule.capacityPerElement)} per stamp, rounded up`, req.quantityCount ?? '?', 'pg-why-source');
  } else {
    base = 1;
    first = line('', PLACEMENT_PRESET_LABELS[rule.preset], 'No capacity per stamp: one stamp per room', 1, 'pg-why-source');
  }
  const minHit = rule.minCount !== undefined && base !== null && req.countSource !== 'coverage' && base < rule.minCount;
  const sourceWins = !minHit && !maxHit && req.count !== null;
  const notes = row.warnings
    .filter((w) => w !== 'maxCountReached')
    .map((w) => (w === 'tooClose' && row.fitEstimate !== undefined ? `${PLACEMENT_WARNING_TEXT[w]}: about ${row.fitEstimate} fit` : PLACEMENT_WARNING_TEXT[w]));
  return (
    <div className="mep-guide-panel" data-testid="pg-why">
      <div className="mep-guide-panel-head">
        <span className="pt">Why {req.count ?? '?'} stamp{req.count === 1 ? '' : 's'}?</span>
        <span className="mep-guide-note">{sampleName}</span>
      </div>
      <div className={`mep-guide-chain${sourceWins ? ' source-wins' : ''}`}>
        {first}
        {rule.minCount !== undefined && line(minHit ? 'cap' : '', 'Min count', req.countSource === 'coverage' ? 'The coverage starts at this count' : minHit ? 'Raises the count' : 'Not needed here', rule.minCount, 'pg-why-min')}
        {rule.maxCount !== undefined && line(maxHit ? 'cap' : '', 'Max count', maxHit ? 'Limits the count' : 'Not needed here', rule.maxCount, 'pg-why-max')}
        {line('res', 'Stamps in this room', req.count === null ? 'Cannot calculate yet' : 'Spacing and layout do not change this number', req.count ?? '?', 'pg-why-result')}
      </div>
      {req.perElement !== null && req.count !== null && (
        <p className="mep-guide-note" data-testid="pg-why-each">
          Each stamp gets {fmt(req.perElement)} {unit} ({fmt(req.required)} ÷ {req.count}).{rule.writeCapacity ? ' MepApp writes this capacity to the stamp.' : ''}
        </p>
      )}
      {notes.length > 0 && <div className="mep-guide-callout bad">{notes.join('; ')}</div>}
    </div>
  );
}
