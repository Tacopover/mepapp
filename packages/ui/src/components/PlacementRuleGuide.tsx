import { useCallback, useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
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
  GRID_STYLE_LABELS,
  ILLUMINANCE_UNIT_LABELS,
  isAirChangeUnit,
  LAYOUT_STRATEGY_LABELS,
  layoutRoomStamps,
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
  type GridStyle,
  type LayoutStrategy,
  type PlacementPreset,
  type PlacementRow,
  type PlacementRule,
  type Room,
  type RoomType,
  type RoomValues,
  type StampDefinition,
  type Vec2,
} from '@mepapp/core';
import { groupsOf, notesOf, replaceIdsOf, type AutoPlaceArt } from './AutoPlaceDialog.js';
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
  /** Loads the art of a stamp definition for Place; null when it cannot be loaded. */
  loadStampArt: (definitionId: string) => Promise<AutoPlaceArt | null>;
  /** Called after Place with the number of placed stamps and of replaced stamps. */
  onPlaced: (count: number, replaced: number) => void;
  onSave: (rule: PlacementRule) => void;
  /** Back to the rule list. */
  onClose: () => void;
}

const STEP_TITLES = ['Stamp', 'Rooms', 'Amount', 'Spacing', 'Layout', 'Check and place'];
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
/** Step 4: the stamps do not fit with the spacing. */
const spacingProblem = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.some((w) => w === 'tooClose' || w === 'noFit');
/** Step 5: the layout leaves part of the room outside the coverage circles. */
const coverageProblem = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.includes('coverageNotMet');

const LAYOUT_HINTS: Record<LayoutStrategy, string> = {
  center: 'One stamp at the label point of the room. More than one stamp uses the grid.',
  grid: 'Rows along the long side of the room. The grid style sets how a short last row is filled.',
  evenSpread: 'Each stamp moves to the middle of its own part of the room. Use it for L-shaped rooms.',
  perimeter: 'Stamps at equal distances along the walls, turned to face into the room.',
};
const GRID_STYLE_HINTS: Record<GridStyle, string> = {
  spread: 'A short last row spreads over the full length.',
  aligned: 'Each stamp stays in a column. A cell can stay empty.',
  staggered: 'Each second row moves half a cell.',
};

// The example rooms of the layout pictures, in m (1 page unit = 1 m): an L-shape, and a rectangle for the grid.
const PICTURE_L: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 2.6 },
  { x: 3.4, y: 2.6 },
  { x: 3.4, y: 4.5 },
  { x: 0, y: 4.5 },
];
const PICTURE_RECT: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 4.5 },
  { x: 0, y: 4.5 },
];
const PICTURE_COUNT: Record<LayoutStrategy, number> = { center: 1, grid: 5, evenSpread: 4, perimeter: 7 };
const PICTURE_CALIBRATION = { pageUnitsPerRealUnit: 0.001 };
const PICTURE_STAMP = { width: 0.6, height: 0.6 };

/** A small picture of a layout, made with the core layout of the placement on an example room. */
function LayoutPicture({ strategy, gridStyle }: { strategy: LayoutStrategy; gridStyle?: GridStyle }) {
  const outer = strategy === 'grid' ? PICTURE_RECT : PICTURE_L;
  const stamps = useMemo(
    () =>
      layoutRoomStamps(
        { layout: { strategy, wallOffsetM: 0.2, rotation: 'room', ...(gridStyle ? { gridStyle } : {}) }, coverage: {} },
        { polygon: { outer, holes: [] } },
        PICTURE_COUNT[strategy],
        PICTURE_CALIBRATION,
        PICTURE_STAMP,
      ).stamps,
    [strategy, gridStyle, outer],
  );
  const h = PICTURE_STAMP.width / 2;
  return (
    <svg className="mep-guide-picture" viewBox="-0.6 -0.6 7.2 5.7" aria-hidden="true" data-testid="pg-layout-picture" data-stamps={stamps.length}>
      <polygon points={outer.map((p) => `${p.x},${p.y}`).join(' ')} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {stamps.map((st, i) => (
        <g key={i} transform={`translate(${st.position.x} ${st.position.y}) rotate(${st.rotationDegrees})`}>
          <rect x={-h} y={-h} width={2 * h} height={2 * h} fill="var(--surface)" stroke="var(--hvac)" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
          <path d={`M${-h} ${-h}L${h} ${h}M${h} ${-h}L${-h} ${h}`} stroke="var(--hvac)" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}

/** The small diagrams of the two spacing boxes in step 4. */
function SpacingDiagram({ kind }: { kind: 'wall' | 'gap' }) {
  const line = { stroke: 'var(--muted)', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' as const };
  const stamp = (x: number, y: number) => (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-0.25} y={-0.25} width={0.5} height={0.5} fill="var(--surface)" stroke="var(--hvac)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      <path d="M-0.25 -0.25L0.25 0.25M0.25 -0.25L-0.25 0.25" stroke="var(--hvac)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </g>
  );
  if (kind === 'wall') {
    return (
      <svg viewBox="0 0 6 2" aria-hidden="true">
        <rect x={0.6} y={0} width={0.9} height={2} fill="var(--guide-band)" />
        <line x1={0.6} y1={0} x2={0.6} y2={2} stroke="var(--ink)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {stamp(2.6, 0.9)}
        <line x1={0.6} y1={1.6} x2={1.5} y2={1.6} {...line} />
        <text x={2.3} y={1.75} fontSize={0.32} className="mep-guide-plan-dim" fill="var(--guide-warn)">
          no stamp here
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 6 2" aria-hidden="true">
      {[1.9, 4.1].map((x) => (
        <circle key={x} cx={x} cy={1} r={0.75} fill="var(--guide-ok)" fillOpacity={0.12} stroke="var(--guide-ok)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {stamp(1.9, 1)}
      {stamp(4.1, 1)}
      <text x={3} y={0.25} fontSize={0.3} textAnchor="middle" className="mep-guide-plan-dim" fill="var(--guide-ok)">
        at least this far
      </text>
    </svg>
  );
}

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
 * The guide for one placement rule (room-placement-guide.md Phases B and C): a step list, the current
 * step, and a sample room of the shown page that shows the result of each change at once. Steps
 * 1–3 (stamp, rooms, amount) come from Phase B; steps 4–6 (spacing, layout, check and place) from
 * Phase C. Save and Revert work on a draft of the rule. Place saves the draft first.
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
  loadStampArt,
  onPlaced,
  onSave,
  onClose,
}: PlacementRuleGuideProps) {
  const initial = useMemo(() => draftOf(rule), [rule]);
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(1);
  const [view, setView] = useState<'room' | 'floor' | null>(null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ count: number; replaced: number } | null>(null);
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
    setPlaced(null);
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

  const mode = view ?? (step >= 3 && step <= 5 ? 'room' : 'floor');
  // Every room of the page, after a pause in the typing: the whole floor, and the checks of steps 4 and 5.
  const [floor, setFloor] = useState<{ rule: PlacementRule; rows: PlacementRow[] } | null>(null);
  const needFloor = step !== 6 && (mode === 'floor' || step === 4 || step === 5);
  useEffect(() => {
    if (!needFloor || !plan || !previewRule) return;
    const timer = setTimeout(() => setFloor({ rule: previewRule, rows: planAutoPlacement([previewRule], pageRooms, plan.valuesOf, plan.calibrationOf, plan.sizeOf).rows }), 300);
    return () => clearTimeout(timer);
  }, [needFloor, plan, previewRule, pageRooms]);
  // In steps 4 and 5 the rows of the last pause stay until the new rows come; elsewhere only rows of this draft count.
  const floorRows = floor && (floor.rule === previewRule || step === 4 || step === 5) ? floor.rows : null;

  // Step 6: the real stamp, its art and the auto-placed stamps of the drawing (a re-run replaces them).
  const stampId = parsed.rule?.stampDefinitionId ?? null;
  const [art, setArt] = useState<{ id: string; art: AutoPlaceArt | null } | null>(null);
  useEffect(() => {
    if (step !== 6 || !stampId || art?.id === stampId) return;
    let cancelled = false;
    void loadStampArt(stampId)
      .catch(() => null)
      .then((loaded) => {
        if (!cancelled) setArt({ id: stampId, art: loaded });
      });
    return () => {
      cancelled = true;
    };
  }, [step, stampId, art, loadStampArt]);
  const artFailed = art !== null && art.id === stampId && art.art === null;
  const realSizeOf = useCallback(
    (id: string) => {
      const found = stampDefinition(id);
      if (!found || artFailed) return null;
      const s = stampScale(id);
      return { width: found.nativeWidth * s, height: found.nativeHeight * s };
    },
    [stampDefinition, stampScale, artFailed],
  );
  const placePlan = useMemo(
    () =>
      step === 6 && scene && plan && parsed.rule
        ? planAutoPlacement([parsed.rule], pageRooms, plan.valuesOf, plan.calibrationOf, realSizeOf, { stamps: scene.listAutoPlacedStamps(), roomIds: new Set(scene.listRooms().map((r) => r.id)) })
        : null,
    // version: the auto-placed stamps change with Place and Undo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, scene, plan, parsed.rule, pageRooms, realSizeOf, version],
  );
  const shownRows = step === 6 ? (placePlan?.rows ?? null) : floorRows;
  const shownRowOf = useMemo(() => new Map((shownRows ?? []).map((row) => [row.room.id, row])), [shownRows]);
  const sampleShown = step === 6 ? (sample ? (shownRowOf.get(sample.id) ?? null) : null) : sampleRow;

  const roomState = (room: Room): PreviewRoomState => {
    const row = pageRowOf.get(room.id);
    const placedRow = step >= 4 ? shownRowOf.get(room.id) : undefined;
    if (placedRow && (spacingProblem(placedRow) || coverageProblem(placedRow))) return 'problem';
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
    if (n === 4) {
      const text = `${fmt(valueOf(draft.wallOffset) ?? 0, 2)} m from the walls`;
      if (!floorRows) return ['', text];
      const bad = floorRows.filter(spacingProblem).length;
      return bad > 0 ? ['bad', `${plural(bad, 'room')}: stamps do not fit`] : ['ok', text];
    }
    if (n === 5) {
      const text = LAYOUT_STRATEGY_LABELS[draft.strategy] + (draft.strategy === 'grid' ? `, ${GRID_STYLE_LABELS[draft.gridStyle].toLowerCase()}` : '');
      if (!floorRows) return ['', text];
      const bad = floorRows.filter(coverageProblem).length;
      return bad > 0 ? ['bad', `${plural(bad, 'room')} not covered`] : ['ok', text];
    }
    if (placed) return ['ok', `${plural(placed.count, 'stamp')} placed`];
    return ['', step === 6 && placePlan ? `${plural(placeTotal, 'stamp')} to place` : 'Place the stamps'];
  };

  const requestClose = () => {
    if (stampPickerOpen) return;
    if (dirty) {
      setMessage('Save or revert your changes first.');
      return;
    }
    onClose();
  };
  /** Saves the draft; null when it is not valid (the message says why). */
  const saveRule = (): PlacementRule | null => {
    try {
      const next = ruleOf(rule.id, draft);
      const problem = validatePlacementRule(next, others);
      if (problem) {
        setMessage(problem);
        return null;
      }
      onSave(next);
      setDraft(draftOf(next));
      return next;
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      setMessage(err.message);
      return null;
    }
  };
  const save = () => void saveRule();

  const artReady = !stampId || (art?.id === stampId && art.art !== null);
  const groups = useMemo(() => (placePlan && art?.art && art.id === stampId ? groupsOf(placePlan.rows, new Map([[art.id, art.art]])) : []), [placePlan, art, stampId]);
  const replaceIds = useMemo(() => (placePlan ? [...placePlan.rows.flatMap(replaceIdsOf), ...placePlan.stale.flatMap((e) => e.replace)] : []), [placePlan]);
  const placeTotal = (placePlan?.rows ?? []).reduce((sum, row) => sum + row.stamps.length, 0);
  const canPlace = !!scene && !!placePlan && !!stampId && artReady && !artFailed && (placeTotal > 0 || replaceIds.length > 0);
  const place = () => {
    if (!scene || !canPlace) return;
    if ((dirty || isNew) && !saveRule()) return;
    const ids = scene.autoPlaceStamps(groups, replaceIds);
    setPlaced({ count: ids.length, replaced: replaceIds.length });
    setVersion((v) => v + 1);
    onPlaced(ids.length, replaceIds.length);
  };
  const undoPlace = () => {
    scene?.undoDrawing();
    setPlaced(null);
    setVersion((v) => v + 1);
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
    if (step === 3) return stepAmount();
    if (step === 4) return stepSpacing();
    if (step === 5) return stepLayout();
    return stepPlace();
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

        {!byCoverage && [draft.maxSpacing, draft.maxArea, draft.maxWall].some((x) => x.trim() !== '') && (
          <p className="mep-guide-note" data-testid="pg-old-coverage">
            This rule has coverage limits. Only By coverage uses them, so they do not change the count now. Choose By coverage to use them.
          </p>
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

  // ---------- Step 4 ----------
  function stepSpacing() {
    const minSpacing = valueOf(draft.minSpacing);
    const rows = floorRows ?? [];
    return (
      <>
        <h2>How much space must the stamps keep?</h2>
        <p className="mep-guide-lead">
          These distances change only <b>where</b> MepApp puts the stamps. They never change the number of stamps. When the stamps do not fit, MepApp tells you. Then change the distances, the layout or the count.
        </p>
        <div className="mep-guide-limits">
          <div className="mep-guide-limit">
            <SpacingDiagram kind="wall" />
            <label className="lt" htmlFor="pg-wallOffset">
              Min distance to the walls
            </label>
            <div className="mep-guide-inline">
              <input className="mep-guide-num" id="pg-wallOffset" type="text" inputMode="decimal" placeholder="0" value={draft.wallOffset} onChange={field('wallOffset')} />
              <span>m</span>
            </div>
            <span className="mep-guide-note">The orange band on the plan. The distance is from the wall to the center of the stamp.</span>
          </div>
          <div className="mep-guide-limit">
            <SpacingDiagram kind="gap" />
            <label className="lt" htmlFor="pg-minSpacing">
              Min distance between stamps
            </label>
            <div className="mep-guide-inline">
              <input className="mep-guide-num" id="pg-minSpacing" type="text" inputMode="decimal" placeholder="none" value={draft.minSpacing} onChange={field('minSpacing')} />
              <span>m</span>
            </div>
            <span className="mep-guide-note">From stamp center to stamp center. Circles on the plan: red circles overlap.</span>
          </div>
        </div>
        <div className="mep-guide-section">
          <h3>Check of all rooms ({matched.length})</h3>
          {matched.length > 0 && floorRows && <p className="mep-guide-note">Click a room to show it on the plan.</p>}
          {matched.length === 0 ? (
            <p className="mep-guide-note">No room matches. Choose the room types in step 2.</p>
          ) : !floorRows ? (
            <p className="mep-guide-note">MepApp checks the rooms…</p>
          ) : (
            <div className="mep-guide-checks" data-testid="pg-fitchecks">
              {rows.map((row) => {
                const name = roomLabel(row.room);
                const count = row.requirement.count;
                const testId = `pg-fit-${row.room.id}`;
                const pick = { selected: row.room.id === sample?.id, onPick: () => (setSampleId(row.room.id), setView(null)) };
                if (count === null) return <Check key={row.room.id} state="off" title={`${name}: no count yet`} sub="Room data is missing (step 3)." testId={testId} {...pick} />;
                if (row.warnings.includes('noFit'))
                  return <Check key={row.room.id} state="bad" title={`${name}: the stamp does not fit`} sub="The min distance to the walls leaves no space for a stamp. MepApp puts it at the label point." testId={testId} {...pick} />;
                if (row.warnings.includes('tooClose')) {
                  const fit = row.fitEstimate ?? 0;
                  return (
                    <Check
                      key={row.room.id}
                      state="bad"
                      title={`${name}: ${plural(count, 'stamp')} do not fit`}
                      sub={`Some stamps are closer than ${fmt(minSpacing, 2)} m to each other. About ${fit} fit with this distance${fit >= count ? ', so a different layout or grid style can fix this.' : `, but the room needs ${count}.`}`}
                      testId={testId}
                      {...pick}
                    />
                  );
                }
                return (
                  <Check
                    key={row.room.id}
                    state="ok"
                    title={`${name}: ${plural(count, 'stamp')} ${count === 1 ? 'fits' : 'fit'}`}
                    sub={count === 1 ? 'One stamp: no distance between stamps to check.' : minSpacing ? `Each stamp is at least ${fmt(minSpacing, 2)} m from the next one.` : 'No min distance between stamps.'}
                    testId={testId}
                    {...pick}
                  />
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  // ---------- Step 5 ----------
  function stepLayout() {
    const row = sampleRow;
    const name = sample ? roomLabel(sample) : 'this room';
    return (
      <>
        <h2>Where in the room do the stamps go?</h2>
        <p className="mep-guide-lead">
          Each picture shows the layout in an example room. The plan on the right shows the layout in <b>{name}</b> with the count from step 3.
        </p>
        {row && coverageProblem(row) && (
          <div className="mep-guide-callout bad" data-testid="pg-layout-note">
            Part of {name} is outside the coverage circles.{' '}
            {row.warnings.includes('maxCountReached')
              ? 'The max count stops the coverage.'
              : draft.strategy !== 'evenSpread'
                ? 'Use Even spread for By coverage.'
                : 'The min distance to the walls keeps the stamps too far from some corners.'}
          </div>
        )}
        {row && row.warnings.includes('layoutFallback') && (
          <div className="mep-guide-callout" data-testid="pg-layout-note">
            {name} needs {row.requirement.count} stamps. Center places one stamp only, so MepApp uses the grid here.
          </div>
        )}
        {byCoverage && draft.strategy === 'evenSpread' && (
          <div className="mep-guide-callout info">With By coverage, Even spread uses the positions that the coverage calculation found. Each point of the room stays covered.</div>
        )}
        <div className="mep-guide-choices" role="radiogroup" aria-label="Layout">
          {(Object.keys(LAYOUT_STRATEGY_LABELS) as LayoutStrategy[]).map((s) => (
            <div key={s} className={`mep-guide-choice${draft.strategy === s ? ' on' : ''}`}>
              <button type="button" role="radio" aria-checked={draft.strategy === s} data-layout={s} onClick={() => update({ strategy: s })}>
                <LayoutPicture strategy={s} {...(s === 'grid' ? { gridStyle: draft.gridStyle } : {})} />
                <span className="ct">{LAYOUT_STRATEGY_LABELS[s]}</span>
                <span className="cd">{LAYOUT_HINTS[s]}</span>
              </button>
            </div>
          ))}
        </div>
        {draft.strategy === 'grid' && (
          <div className="mep-guide-section">
            <h3>Grid style (5 stamps as an example)</h3>
            <div className="mep-guide-choices small" role="radiogroup" aria-label="Grid style">
              {(Object.keys(GRID_STYLE_LABELS) as GridStyle[]).map((g) => (
                <div key={g} className={`mep-guide-choice${draft.gridStyle === g ? ' on' : ''}`}>
                  <button type="button" role="radio" aria-checked={draft.gridStyle === g} data-grid-style={g} onClick={() => update({ gridStyle: g })}>
                    <LayoutPicture strategy="grid" gridStyle={g} />
                    <span className="ct">{GRID_STYLE_LABELS[g]}</span>
                    <span className="cd">{GRID_STYLE_HINTS[g]}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mep-guide-section">
          <h3>Rotation</h3>
          <div className="mep-guide-field">
            <label htmlFor="pg-rotation">Rotation</label>
            <select id="pg-rotation" value={draft.rotation} onChange={(e) => update({ rotation: e.target.value as 'room' | 'fixed' })}>
              <option value="room">{draft.strategy === 'perimeter' ? 'Face into the room' : 'Align to the room'}</option>
              <option value="fixed">Fixed angle</option>
            </select>
          </div>
          {draft.rotation === 'fixed' && (
            <div className="mep-guide-field">
              <label htmlFor="pg-fixedAngle">Angle</label>
              <div className="mep-guide-inline">
                <input className="mep-guide-num" id="pg-fixedAngle" type="text" inputMode="decimal" placeholder="0" value={draft.fixedAngle} onChange={field('fixedAngle')} />
                <span>° (clockwise)</span>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  // ---------- Step 6 ----------
  function stepPlace() {
    const rows = placePlan?.rows ?? [];
    const showPeople = PRESET_AMOUNT_FIELDS[preset].includes('perPerson');
    const skipped = rows.filter((row) => row.requirement.count === null).length;
    const problems = rows.filter((row) => spacingProblem(row) || coverageProblem(row)).length;
    const others = pageRooms.length - matched.length;
    const label = !artReady && !artFailed ? 'Loading the stamp…' : `${dirty || isNew ? 'Save and place' : 'Place'} ${plural(placeTotal, 'stamp')}${replaceIds.length > 0 ? ` (replace ${replaceIds.length})` : ''}`;
    return (
      <>
        <h2>Check and place</h2>
        <p className="mep-guide-lead">
          The table shows each room of this page that the rule applies to. Click a row to see the room on the plan. Place adds the stamps as one undo step. When you place again, MepApp replaces the auto-placed stamps that you did not move.
        </p>
        {!stampId && (
          <div className="mep-guide-callout">
            <span>The rule has no stamp. Choose a stamp in step 1 first.</span>
            <button type="button" onClick={() => setStep(1)}>
              Go to step 1
            </button>
          </div>
        )}
        {artFailed && <div className="mep-guide-callout bad">MepApp cannot load the stamp of this rule.</div>}
        {rows.length === 0 ? (
          <p className="mep-guide-note">No room of this page matches the rule.</p>
        ) : (
          <div className="mep-room-calc-scroll mep-guide-table">
            <table className="mep-room-calc-table" data-testid="pg-place-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Type</th>
                  <th>m²</th>
                  {showPeople && <th>Persons</th>}
                  {!byCoverage && <th>Required ({unit})</th>}
                  <th>Stamps</th>
                  {!byCoverage && <th>Each ({unit})</th>}
                  <th>Existing</th>
                  <th>Placed</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cls = row.requirement.count === null ? 'bad' : spacingProblem(row) || coverageProblem(row) ? 'err' : row.room.id === sample?.id ? 'sel' : '';
                  return (
                    <tr key={row.room.id} className={cls} data-room={row.room.id} onClick={() => setSampleId(row.room.id)}>
                      <td>{roomLabel(row.room)}</td>
                      <td>{typeName(row.room.roomTypeId)}</td>
                      <td className="num">{fmt(row.values.areaM2)}</td>
                      {showPeople && <td className="num">{row.values.people ? row.values.people.count : '–'}</td>}
                      {!byCoverage && <td className="num">{fmt(row.requirement.required)}</td>}
                      <td className="num" data-testid="count">
                        {row.requirement.count ?? '–'}
                      </td>
                      {!byCoverage && <td className="num">{fmt(row.requirement.perElement)}</td>}
                      <td className="num" data-testid="existing">
                        {row.existing.keep.length + row.existing.replace.length}
                        {row.existing.keep.length > 0 && ` (${row.existing.keep.length} moved)`}
                      </td>
                      <td className="num" data-testid="placed">
                        {row.stamps.length}
                      </td>
                      <td>{notesOf(row, false)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {placed ? (
          <div className="mep-guide-status" role="status" data-testid="pg-placed">
            <span>
              MepApp placed {plural(placed.count, 'stamp')}
              {placed.replaced > 0 ? ` and removed ${plural(placed.replaced, 'earlier auto-placed stamp')}` : ''}. One Undo removes all of them.
            </span>
            <button type="button" id="pg-undo" onClick={undoPlace}>
              Undo
            </button>
          </div>
        ) : (
          <div className="mep-guide-inline mep-guide-placebar">
            <button type="button" id="pg-place" className="primary" disabled={!canPlace} onClick={place}>
              {label}
            </button>
            <span className="mep-guide-note">
              {skipped > 0 ? `${plural(skipped, 'room')} skipped: missing data (step 3). ` : ''}
              {problems > 0 ? `${plural(problems, 'room')} with a spacing or coverage problem: MepApp places the stamps, but check them. ` : ''}
              {others > 0 ? `${plural(others, 'other room')} of this page do${others === 1 ? 'es' : ''} not match this rule.` : ''}
            </span>
          </div>
        )}
      </>
    );
  }

  const planStamps = mode === 'room' ? (sampleShown?.stamps ?? []) : (shownRows ?? []).flatMap((row) => row.stamps);
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
            return (
              <button
                key={title}
                type="button"
                className={`mep-guide-step ${state}${step === n ? ' on' : ''}`}
                aria-current={step === n ? 'step' : undefined}
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
            <button type="button" disabled={step === 1} onClick={() => (setStep(step - 1), setView(null))}>
              Back
            </button>
            {step < STEP_TITLES.length && (
              <button type="button" className="primary" onClick={() => (setStep(step + 1), setView(null))}>
                Next: {STEP_TITLES[step]}
              </button>
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
                  minSpacingM={step === 4 ? (parsed.rule?.layout.minSpacingM ?? null) : null}
                  onPickRoom={(id) => {
                    setSampleId(id);
                    if (view === 'floor' && step >= 3 && step <= 5) setView(null);
                  }}
                />
                <div className="mep-guide-legend">
                  {mode === 'room' ? (
                    <>
                      <span style={{ ['--sw' as string]: 'var(--accent-soft)' }}>room that matches</span>
                      <span style={{ ['--sw' as string]: 'var(--guide-band)' }}>min distance to the walls</span>
                      {byCoverage && <span style={{ ['--sw' as string]: 'rgba(23, 90, 138, 0.15)' }}>coverage circle</span>}
                      {step === 4 && draft.minSpacing.trim() !== '' && <span style={{ ['--sw' as string]: 'var(--guide-ok-soft)' }}>min distance between stamps</span>}
                      <span className="plain">click a room to use it</span>
                    </>
                  ) : (
                    <>
                      <span style={{ ['--sw' as string]: 'var(--accent-soft)' }}>matches the rule</span>
                      <span style={{ ['--sw' as string]: 'var(--surface)' }}>does not match</span>
                      <span style={{ ['--sw' as string]: 'var(--guide-warn-soft)' }}>missing data</span>
                      {step >= 4 && <span style={{ ['--sw' as string]: 'var(--guide-bad-soft)' }}>stamps do not fit, or not covered</span>}
                      <span className="hatch">no room type</span>
                      <span className="plain">click a room to use it</span>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          {scene && sample && step >= 3 && (
            <WhyBox row={sampleShown} matches={sampleMatches} sampleName={roomLabel(sample)} unit={unit} rule={parsed.rule} coverage={coverage} error={parsed.error} />
          )}
        </aside>
      </div>
    </Dialog>
  );
}

function Check({ state, title, sub, testId, selected, onPick }: { state: 'ok' | 'warn' | 'bad' | 'off'; title: string; sub: string; testId: string; selected?: boolean; onPick?: () => void }) {
  return (
    <div className={`mep-guide-check ${state}${onPick ? ' pick' : ''}${selected ? ' sel' : ''}`} data-testid={testId} data-state={state} onClick={onPick}>
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
