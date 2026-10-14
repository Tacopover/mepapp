import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import {
  areaToM2,
  calculateRoomRequirement,
  calculateRooms,
  CAPACITY_UNITS,
  CEILING_GRID_SIZES_MM,
  coverageRadiusM,
  DEFAULT_WORKING_PLANE_HEIGHT_M,
  EXAMPLE_UF_TABLE,
  GRID_EDGE_LABELS,
  GRID_STYLE_LABELS,
  LAYOUT_STRATEGY_LABELS,
  layoutRoomStamps,
  lengthToM,
  LENGTH_UNIT_LABELS,
  MAX_ROOM_STAMPS,
  parseDecimal,
  PLACEMENT_WARNING_TEXT,
  ruleAppliesToRoom,
  ruleUnitOf,
  roomTypeLabel,
  validatePlacementRule,
  type Calibration,
  type Discipline,
  type GridEdge,
  type GridStyle,
  type LayoutStrategy,
  type LengthUnit,
  type PlacementPlanInput,
  type PlacementRow,
  type PlacementRule,
  type PlacementWorkerLike,
  type Room,
  type RoomNeed,
  type RoomType,
  type RoomValues,
  type StampDefinition,
  type Vec2,
} from '@mepapp/core';
import { coverageProblem, groupsOf, missingData, notesOf, replaceIdsOf, spacingProblem, tooManyStamps, usePlacementPlan, zeroNeed, zeroPersons, type AutoPlaceArt } from './autoPlacePlan.js';
import { DISCIPLINE_LABEL } from './ElementEditorDialog.js';
import { InfoTip } from './InfoTip.js';
import { countByPatch, draftOf, FieldError, needPatch, needWritesCapacity, OTHER_UNIT, ruleOf, type Draft } from './placementRuleDraft.js';
import { demandShort, demandSumText, fmtTotal } from './roomDemandText.js';
import { RulePreviewPlan, type PreviewRoomState } from './RulePreviewPlan.js';

export interface PlacementRuleGuideBodyProps {
  /** The saved rule, or the blank rule of a new one. */
  rule: PlacementRule;
  /** The other rules of the list, for the name check. */
  others: PlacementRule[];
  roomTypes: RoomType[];
  /** The built-in needs, the own needs and the own needs of the drawing's file. */
  needs: RoomNeed[];
  language: 'en' | 'nl';
  sceneRef: RefObject<SketchScene | null>;
  stampName: (definitionId: string) => string | null;
  stampDefinition: (definitionId: string) => StampDefinition | undefined;
  stampScale: (definitionId: string) => number;
  stampIconUrl: (definitionId: string) => string | null;
  onChooseStamp: (onPick: (definitionId: string) => void) => void;
  /** Loads the art of a stamp definition for Place; null when it cannot be loaded. */
  loadStampArt: (definitionId: string) => Promise<AutoPlaceArt | null>;
  /** Creates the Web Worker that calculates the plans; without it the guide calculates on the main thread. */
  createPlacementWorker?: () => PlacementWorkerLike;
  /** Called after Place with the number of placed stamps and of replaced stamps. */
  onPlaced: (count: number, replaced: number) => void;
  /** Called with each valid change of the rule: the guide saves at once. A new rule is added on its first change. */
  onSave: (rule: PlacementRule) => void;
  /** The shown step, 1 to STEP_TITLES.length. */
  step: number;
  onStepChange: (step: number) => void;
  /** Gets the state and the short text of each step when they change, for the step list of the parent. */
  onStepStates: (states: StepStatus[]) => void;
  /** Opens the Room types card of the parent; with a room type and a need, the library at that need (step 3 links to it). */
  onOpenRoomTypes: (focus?: { typeId: string; needId?: string }) => void;
}

export interface PlacementRuleGuideHandle {
  /** Saves the last typed boxes. False, with a message in the card, when the changed rule is not valid. */
  flush: () => boolean;
}

export const STEP_TITLES = ['Stamp', 'Rooms', 'Count', 'Spacing', 'Layout', 'Check and place'];
/** The preview places a stamp also when the rule has none: this id gets the size of PREVIEW_STAMP_M. */
const PREVIEW_STAMP_ID = '__guide-preview';
const PREVIEW_STAMP_M = 0.6;

const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(' ') || room.id;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A draft box as a number: undefined when empty, NaN when it is not a number. */
const valueOf = (text: string): number | undefined => (text.trim() === '' ? undefined : (parseDecimal(text) ?? Number.NaN));
/** Step 5: the room has fewer free ceiling tiles than stamps. */
const gridFull = (row: Pick<PlacementRow, 'warnings'>) => row.warnings.includes('gridFull');

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
const GRID_EDGE_HINTS: Record<GridEdge, string> = {
  halfSpacing: 'Each stamp is at the center of its cell. The outer stamps are half the spacing from the wall.',
  wall: 'The outer stamps are at the min distance to the walls (step 4). The other stamps are at equal distances between them.',
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
function LayoutPicture({ strategy, gridStyle, edge }: { strategy: LayoutStrategy; gridStyle?: GridStyle; edge?: GridEdge }) {
  const outer = strategy === 'grid' ? PICTURE_RECT : PICTURE_L;
  const stamps = useMemo(
    () =>
      layoutRoomStamps(
        { layout: { strategy, wallOffsetM: 0.2, rotation: 'room', ...(gridStyle ? { gridStyle } : {}), ...(edge ? { edge } : {}) }, coverage: {} },
        { polygon: { outer, holes: [] } },
        PICTURE_COUNT[strategy],
        PICTURE_CALIBRATION,
        PICTURE_STAMP,
      ).stamps,
    [strategy, gridStyle, edge, outer],
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

/** By coverage, or an amount rule that also meets coverage: the radius in m and the limit that sets it (the smallest), from the draft boxes. */
function coverageRadiusOf(d: Draft): { radiusM: number; from: string } | null {
  const unit = LENGTH_UNIT_LABELS[d.lengthUnit];
  const parts: { radiusM: number; from: string }[] = [];
  const spacing = valueOf(d.maxSpacing);
  const wall = valueOf(d.maxWall);
  const area = valueOf(d.maxArea);
  const radius = valueOf(d.maxRadius);
  if (radius !== undefined && radius > 0) parts.push({ radiusM: lengthToM(radius, d.lengthUnit), from: `max radius ${fmt(radius, 2)} ${unit}` });
  if (spacing !== undefined && spacing > 0) parts.push({ radiusM: lengthToM(spacing, d.lengthUnit) / Math.SQRT2, from: `max spacing ${fmt(spacing, 2)} ${unit} ÷ √2` });
  if (wall !== undefined && wall > 0) parts.push({ radiusM: lengthToM(wall, d.lengthUnit) * Math.SQRT2, from: `max distance to a wall ${fmt(wall, 2)} ${unit} × √2` });
  if (area !== undefined && area > 0) parts.push({ radiusM: Math.sqrt(areaToM2(area, d.lengthUnit) / 2), from: `√(${fmt(area)} ${unit}² ÷ 2)` });
  parts.sort((a, b) => a.radiusM - b.radiusM);
  return parts[0] ?? null;
}

export type StepState = 'ok' | 'warn' | 'bad' | '';
/** The state of a step and its short text. */
export type StepStatus = [StepState, string];

/** The calculations follow the typed boxes this long after the last key (or at once on Enter or a focus change). */
const SETTLE_MS = 400;

/** The rule of a draft as JSON, or null when a box is not correct: the auto-save compares these. */
function ruleJsonOf(id: string, d: Draft, needs: readonly RoomNeed[]): string | null {
  try {
    return JSON.stringify(ruleOf(id, d, needs));
  } catch (err) {
    if (!(err instanceof FieldError)) throw err;
    return null;
  }
}

/** The step list of the guide: one button per step with its state. */
export function PlacementGuideSteps({ step, states, onStepChange }: { step: number; states: readonly StepStatus[]; onStepChange: (step: number) => void }) {
  return (
    <nav className="mep-guide-steps" aria-label="Steps">
      {STEP_TITLES.map((title, i) => {
        const n = i + 1;
        const [state, sub] = states[i] ?? ['', ''];
        return (
          <button key={title} type="button" className={`mep-guide-step ${state}${step === n ? ' on' : ''}`} aria-current={step === n ? 'step' : undefined} data-step={n} onClick={() => onStepChange(n)}>
            <span className="n">{state === 'ok' && step !== n ? '✓' : n}</span>
            <span className="t">{title}</span>
            <span className="s">{sub}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The body of the guide for one placement rule: the current step, and a sample room of the shown
 * page that shows the result of each change at once. Steps 1–3 (stamp, rooms, amount) come from
 * Phase B; steps 4–6 (spacing, layout, check and place) from Phase C. The parent holds the step and
 * shows the step list. The body saves each valid change at once; Revert goes back to the rule as it
 * was when the body opened.
 */
export const PlacementRuleGuideBody = forwardRef<PlacementRuleGuideHandle, PlacementRuleGuideBodyProps>(function PlacementRuleGuideBody(
  {
    rule,
    others,
    roomTypes,
    needs,
    language,
    sceneRef,
    stampName,
    stampDefinition,
    stampScale,
    stampIconUrl,
    onChooseStamp,
    loadStampArt,
    createPlacementWorker,
    onPlaced,
    onSave,
    step,
    onStepChange,
    onStepStates,
    onOpenRoomTypes,
  },
  ref,
) {
  // The rule as it was when the body opened: Revert goes back to it. Later saves do not change it.
  const [initial] = useState(() => draftOf(rule));
  const [initialJson] = useState(() => JSON.stringify(initial));
  // The last saved rule: a new rule that the user did not change is not saved.
  const savedRef = useRef<string | null>(ruleJsonOf(rule.id, initial, needs));
  const [draft, setDraft] = useState(initial);
  // The calculations use `settled`: it follows the typed draft SETTLE_MS after the last key, and at once after another change.
  const [settled, setSettled] = useState(initial);
  const typedRef = useRef(false);
  useEffect(() => {
    if (settled === draft) return;
    if (!typedRef.current) {
      setSettled(draft);
      return;
    }
    const timer = setTimeout(() => setSettled(draft), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [draft, settled]);
  const settle = () => {
    if (settled !== draft) setSettled(draft);
  };
  const replaceDraft = (next: Draft) => {
    typedRef.current = false;
    setDraft(next);
  };
  // The view that the user chose holds only for the step where they chose it.
  const [chosenView, setChosenView] = useState<{ step: number; mode: 'room' | 'floor' } | null>(null);
  const view = chosenView?.step === step ? chosenView.mode : null;
  const setView = (mode: 'room' | 'floor' | null) => setChosenView(mode ? { step, mode } : null);
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ count: number; replaced: number } | null>(null);
  const changed = JSON.stringify(draft) !== initialJson;

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

  const update = (patch: Partial<Draft>, typed = false) => {
    typedRef.current = typed;
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
    setPlaced(null);
  };
  const field = (key: keyof Draft) => (e: { target: { value: string } }) => update({ [key]: e.target.value } as Partial<Draft>, true);

  // By content: a settled draft with the same boxes (for example 36 → 360 → 36) starts no new calculation.
  const settledKey = JSON.stringify(settled);
  const parsed = useMemo((): { rule: PlacementRule | null; error: string | null } => {
    try {
      return { rule: ruleOf(rule.id, JSON.parse(settledKey) as Draft, needs), error: null };
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      return { rule: null, error: err.message };
    }
  }, [rule.id, settledKey, needs]);

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
  // The values of each room of the page, once per change of the rooms: the jobs and the dry run use them.
  const valuesById = useMemo(
    () => new Map(scene ? pageRooms.map((r) => [r.id, scene.getRoomValues(r)] as const) : []),
    // version: room values change with room types and ceiling heights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, pageRooms, version, roomTypes],
  );
  const valuesOf = useCallback((room: Room) => valuesById.get(room.id) ?? scene!.getRoomValues(room), [valuesById, scene]);
  const calibrations = useMemo((): [number, Calibration | null][] => [[pageIndex, calibration]], [pageIndex, calibration]);
  const jobOf = useCallback(
    (r: PlacementRule, rooms: readonly Room[], sizes: PlacementPlanInput['sizes']): PlacementPlanInput => ({ rules: [r], rooms: [...rooms], values: rooms.map((room) => [room.id, valuesOf(room)]), calibrations, sizes, needs }),
    [valuesOf, calibrations, needs],
  );

  const matches = (room: Room) =>
    ruleAppliesToRoom({ roomTypeIds: draft.roomTypeIds, nameContains: draft.nameContains, countBy: draft.countBy, ...(draft.needId ? { needId: draft.needId } : {}) }, room, valuesOf(room).demands);
  const matched = pageRooms.filter(matches);
  // The dry run of every room of the page: no geometry, so it is fast enough for each key press.
  const pageRows = useMemo(() => (scene && previewRule ? calculateRooms([previewRule], pageRooms, valuesOf, needs).rows : []), [scene, previewRule, pageRooms, valuesOf, needs]);
  const pageRowOf = useMemo(() => new Map(pageRows.map((row) => [row.room.id, row])), [pageRows]);

  const sample = pageRooms.find((r) => r.id === sampleId) ?? matched[0] ?? pageRooms[0] ?? null;
  const sampleValues: RoomValues | null = useMemo(() => (scene && sample ? valuesOf(sample) : null), [scene, sample, valuesOf]);
  const sampleMatches = sample ? matches(sample) : false;
  // The jobs run in the background (usePlacementPlan); the old result stays, dimmed, until the new one comes.
  const sampleInput = useMemo(
    () => (scene && previewRule && sample && sampleMatches ? jobOf(previewRule, [sample], [[PREVIEW_STAMP_ID, stampSizePt]]) : null),
    [scene, previewRule, sample, sampleMatches, jobOf, stampSizePt],
  );
  const sampleJob = usePlacementPlan(createPlacementWorker, sampleInput);
  const sampleRow = sample && sampleMatches && sampleJob.input?.rooms[0]?.id === sample.id ? (sampleJob.plan?.rows[0] ?? null) : null;

  const mode = view ?? (step >= 3 && step <= 5 ? 'room' : 'floor');
  // Every room of the page: the whole floor, and the checks of steps 4 and 5.
  const needFloor = step !== 6 && (mode === 'floor' || step === 4 || step === 5);
  const floorInput = useMemo(
    () => (scene && needFloor && previewRule ? jobOf(previewRule, pageRooms, [[PREVIEW_STAMP_ID, stampSizePt]]) : null),
    [scene, needFloor, previewRule, pageRooms, jobOf, stampSizePt],
  );
  const floorJob = usePlacementPlan(createPlacementWorker, floorInput);
  // In steps 4 and 5 the rows of the last plan stay until the new rows come; elsewhere only rows of this draft count.
  const floorRows = floorJob.plan && (floorJob.input?.rules[0] === previewRule || step === 4 || step === 5) ? floorJob.plan.rows : null;

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
  const placeInput = useMemo(
    () =>
      step === 6 && scene && parsed.rule
        ? {
            ...jobOf(parsed.rule, pageRooms, parsed.rule.stampDefinitionId ? [[parsed.rule.stampDefinitionId, realSizeOf(parsed.rule.stampDefinitionId)]] : []),
            existing: { stamps: scene.listAutoPlacedStamps(), roomIds: scene.listRooms().map((r) => r.id) },
          }
        : null,
    // version: the auto-placed stamps change with Place and Undo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, scene, parsed.rule, pageRooms, jobOf, realSizeOf, version],
  );
  const placeJob = usePlacementPlan(createPlacementWorker, placeInput);
  // Place uses only the plan of the current draft; the table shows the last plan while the next one comes.
  const placePlan = placeJob.fresh && settled === draft ? placeJob.plan : null;
  const placeShown = step === 6 ? placeJob.plan : null;
  const shownRows = step === 6 ? (placeShown?.rows ?? null) : floorRows;
  const shownRowOf = useMemo(() => new Map((shownRows ?? []).map((row) => [row.room.id, row])), [shownRows]);
  const sampleShown = step === 6 ? (sample ? (shownRowOf.get(sample.id) ?? null) : null) : sampleRow;

  const roomState = (room: Room): PreviewRoomState => {
    const row = pageRowOf.get(room.id);
    const placedRow = step >= 4 ? shownRowOf.get(room.id) : undefined;
    if (placedRow && (spacingProblem(placedRow) || coverageProblem(placedRow) || tooManyStamps(placedRow))) return 'problem';
    if (row) return missingData(row) ? 'missing' : 'match';
    if (matches(room)) return 'match';
    return room.roomTypeId === undefined ? 'noType' : 'noMatch';
  };

  const untyped = pageRooms.filter((r) => r.roomTypeId === undefined);
  const missingRows = pageRows.filter(missingData);
  const zeroRows = pageRows.filter(zeroNeed);
  const tooManyRows = pageRows.filter((row) => (row.requirement.count ?? 0) > MAX_ROOM_STAMPS);
  const pending = settled !== draft;
  const floorBusy = floorJob.busy || (pending && needFloor);
  const placeBusy = placeJob.busy || (pending && step === 6);
  const planBusy = step === 6 ? placeBusy : mode === 'floor' ? floorBusy : sampleJob.busy || pending;
  const jobError = (step === 6 ? placeJob.error : mode === 'floor' ? floorJob.error : sampleJob.error) ?? null;
  const countBy = draft.countBy;
  const byCoverage = countBy === 'coverage';
  /** The need of a need rule; undefined for another rule, or for a need that is not found. */
  const need = countBy === 'need' ? needs.find((n) => n.id === draft.needId) : undefined;
  const needMissing = countBy === 'need' && !need;
  const unit = need ? ruleUnitOf({ unit: draft.unit }, need) : '';
  const typesWithNeed = need ? types.filter((t) => t.demands?.[need.id]) : [];
  const alsoCoverage = !byCoverage && draft.alsoCoverage;
  const coverage = byCoverage || alsoCoverage ? coverageRadiusOf(draft) : null;
  /** The coverage limits change the count: By coverage, or an amount rule that also meets coverage. */
  const coverageOn = byCoverage || (alsoCoverage && coverage !== null);

  const stepStatus = (n: number): [StepState, string] => {
    if (n === 1) return draft.stampDefinitionId ? ['ok', stampName(draft.stampDefinitionId) ?? 'Stamp not found'] : ['', 'Choose a stamp'];
    if (n === 2) {
      if (matched.length === 0) return ['warn', 'No room matches'];
      if (untyped.length > 0 && (draft.roomTypeIds.length > 0 || countBy === 'need')) return ['warn', `${plural(untyped.length, 'room')} without a type`];
      return ['ok', plural(matched.length, 'room')];
    }
    if (n === 3) {
      if (parsed.error) return ['bad', 'A number is not correct'];
      if (needMissing) return ['bad', draft.needId ? 'The need was deleted' : 'Choose a need'];
      if (tooManyRows.length > 0) return ['bad', `${plural(tooManyRows.length, 'room')}: too many stamps`];
      if ((byCoverage || alsoCoverage) && !coverage) return ['warn', 'Enter a coverage limit'];
      if (missingRows.length > 0) return ['warn', `${plural(missingRows.length, 'room')}: data missing`];
      if (zeroRows.length > 0) return ['warn', `${plural(zeroRows.length, 'room')}: need 0, no stamp`];
      if (countBy === 'perRoom') return ['ok', `${draft.perRoomCount.trim() || '1'} in each room`];
      if (byCoverage) return ['ok', 'By coverage'];
      const capacity = valueOf(draft.capacity);
      if (need?.kind === 'count') return ['ok', `${need.name}: ${fmt(capacity ?? 1)} per stamp`];
      return ['ok', capacity !== undefined ? `${need!.name}: ${fmt(capacity)} ${unit} per stamp` : `${need!.name}: one stamp per room`];
    }
    if (n === 4) {
      const text = `${fmt(valueOf(draft.wallOffset) ?? 0, 2)} m from the walls`;
      if (!floorRows) return ['', text];
      const bad = floorRows.filter(spacingProblem).length;
      return bad > 0 ? ['bad', `${plural(bad, 'room')}: stamps do not fit${floorBusy ? ' …' : ''}`] : ['ok', text + (floorBusy ? ' …' : '')];
    }
    if (n === 5) {
      const text =
        LAYOUT_STRATEGY_LABELS[draft.strategy] +
        (draft.strategy === 'grid' ? `, ${GRID_STYLE_LABELS[draft.gridStyle].toLowerCase()}` : '') +
        (draft.ceilingGrid && draft.strategy !== 'perimeter' ? `, grid ${draft.ceilingGridMm} mm` : '');
      if (!floorRows) return ['', text];
      const bad = floorRows.filter(coverageProblem).length;
      if (bad > 0) return ['bad', `${plural(bad, 'room')} not covered${floorBusy ? ' …' : ''}`];
      const full = floorRows.filter(gridFull).length;
      return full > 0 ? ['warn', `${plural(full, 'room')}: ceiling grid full${floorBusy ? ' …' : ''}`] : ['ok', text + (floorBusy ? ' …' : '')];
    }
    if (placed) return ['ok', `${plural(placed.count, 'stamp')} placed`];
    if (step === 6 && placeBusy) return ['', 'Calculating…'];
    return ['', step === 6 && placePlan ? `${plural(placeTotal, 'stamp')} to place` : 'Place the stamps'];
  };

  // Why the settled draft cannot be saved; null when it is valid.
  const problem = useMemo(() => parsed.error ?? (parsed.rule ? validatePlacementRule(parsed.rule, others) : null), [parsed, others]);
  // The guide saves each valid change at once.
  useEffect(() => {
    if (!parsed.rule || problem) return;
    const json = JSON.stringify(parsed.rule);
    if (json === savedRef.current) return;
    savedRef.current = json;
    onSave(parsed.rule);
  }, [parsed.rule, problem, onSave]);
  /** Saves the draft as it is now, also before it settles; false when a changed draft is not valid (the message says why). */
  const saveNow = (): boolean => {
    let next: PlacementRule;
    try {
      next = ruleOf(rule.id, draft, needs);
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      if (!changed) return true;
      setMessage(`${err.message} Correct it, or click Revert.`);
      return false;
    }
    const invalid = validatePlacementRule(next, others);
    if (invalid) {
      if (!changed) return true;
      setMessage(`${invalid} Correct it, or click Revert.`);
      return false;
    }
    const json = JSON.stringify(next);
    if (json !== savedRef.current) {
      savedRef.current = json;
      onSave(next);
    }
    return true;
  };
  useImperativeHandle(ref, () => ({ flush: saveNow }));
  const revert = () => {
    replaceDraft(initial);
    setMessage(null);
    setPlaced(null);
  };

  const artReady = !stampId || (art?.id === stampId && art.art !== null);
  const groups = useMemo(() => (placePlan && art?.art && art.id === stampId ? groupsOf(placePlan.rows, new Map([[art.id, art.art]])) : []), [placePlan, art, stampId]);
  const replaceIds = useMemo(() => (placePlan ? [...placePlan.rows.flatMap(replaceIdsOf), ...placePlan.stale.flatMap((e) => e.replace)] : []), [placePlan]);
  const placeTotal = (placePlan?.rows ?? []).reduce((sum, row) => sum + row.stamps.length, 0);
  const canPlace = !!scene && !!placePlan && !!stampId && artReady && !artFailed && (placeTotal > 0 || replaceIds.length > 0);
  const place = () => {
    if (!scene || !canPlace) return;
    if (!saveNow()) return;
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

  // Called as functions, not as components: a component made in the render mounts again on each key press, and its box loses the focus.
  const stepView = () => {
    if (step === 1) return stepStamp();
    if (step === 2) return stepRooms();
    if (step === 3) return stepCount();
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
        <p className="mep-guide-lead">MepApp places this stamp in each room that the rule applies to.</p>
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
        <div className="mep-guide-section">
          <h3>What does the stamp serve?</h3>
          <div className="mep-guide-field">
            <label htmlFor="pg-serves">Serves</label>
            <select
              id="pg-serves"
              value={countBy === 'need' ? `need:${draft.needId}` : countBy}
              onChange={(e) => {
                const value = e.target.value;
                const picked = value.startsWith('need:') ? needs.find((n) => `need:${n.id}` === value) : undefined;
                update(picked ? needPatch(draft, picked) : countByPatch(value as 'perRoom' | 'coverage'));
              }}
            >
              <optgroup label="A need of the room types">
                {needs.map((n) => (
                  <option key={n.id} value={`need:${n.id}`}>
                    {n.name}
                    {n.own ? ' (your need)' : ''}
                  </option>
                ))}
                {needMissing && <option value={`need:${draft.needId}`}>{draft.needId ? 'A deleted need' : 'Choose a need'}</option>}
              </optgroup>
              <optgroup label="Another way to count">
                <option value="perRoom">The same number in each room</option>
                <option value="coverage">Each point in reach (by coverage)</option>
              </optgroup>
            </select>
          </div>
          <p className="mep-guide-note" data-testid="pg-serves-note">
            {need
              ? `The room types give the need of each room: ${plural(typesWithNeed.length, 'room type')} of ${types.length} ${typesWithNeed.length === 1 ? 'has' : 'have'} ${need.name}. Step 3 asks what one stamp gives.`
              : countBy === 'perRoom'
                ? 'Each room of the rule gets the same number of stamps, for example one thermostat in each room.'
                : countBy === 'coverage'
                  ? 'The stamps cover each point of the room, for example smoke detectors.'
                  : 'The need of this rule was deleted. Choose another need.'}{' '}
            {countBy === 'need' && (
              <button type="button" className="mep-guide-link" onClick={() => onOpenRoomTypes()}>
                Open Room types
              </button>
            )}
          </p>
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
        <p className="mep-guide-lead">
          Click the room types: the plan shows the rooms that match in blue.
          <InfoTip label="More about room types">MepApp finds the room type from the room name in the drawing. A rule for a need without room types applies to each room whose type has the need; another rule without room types applies to each room.</InfoTip>
        </p>
        {untyped.length > 0 && (
          <div className="mep-guide-callout" data-testid="pg-untyped">
            <span>
              <b>{plural(untyped.length, 'room')}</b> on this page {untyped.length === 1 ? 'has' : 'have'} no room type. {countBy === 'need' ? 'A rule for a need' : 'A rule with room types'} does not find {untyped.length === 1 ? 'it' : 'them'}.
            </span>
            <button type="button" onClick={() => onOpenRoomTypes()}>
              Open Room types
            </button>
          </div>
        )}
        <div className="mep-guide-section">
          <h3>Room types</h3>
          <div className="mep-guide-chips" role="group" aria-label="Room types">
            {types.map((t) => {
              const on = draft.roomTypeIds.includes(t.id);
              const lacks = need !== undefined && !t.demands?.[need.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`mep-guide-chip${on ? ' on' : ''}${lacks ? ' lacks' : ''}`}
                  aria-pressed={on}
                  data-type={t.id}
                  title={lacks ? `${roomTypeLabel(t, language)} has no ${need.name}` : undefined}
                  onClick={() => update({ roomTypeIds: on ? draft.roomTypeIds.filter((id) => id !== t.id) : [...draft.roomTypeIds, t.id] })}
                >
                  {roomTypeLabel(t, language)}
                  <span className="c">{countOf(t.id)}</span>
                </button>
              );
            })}
          </div>
          <p className="mep-guide-note" data-testid="pg-rooms-note">
            {draft.roomTypeIds.length > 0
              ? `${plural(draft.roomTypeIds.length, 'room type')} chosen. The numbers count the rooms of this page.`
              : need
                ? `No type chosen: the rule applies to every room type that has ${need.name} (${typesWithNeed.length} of ${types.length}). A dashed type has no ${need.name}.`
                : 'No type chosen: the rule applies to every room.'}
          </p>
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
  function stepCount() {
    const v = sampleValues;
    const requirement = parsed.rule && v ? calculateRoomRequirement(parsed.rule, v, needs) : null;
    const missing = (text: string) => <span className="mep-guide-missing">{text}</span>;
    const coverageLimits = () => (
      <>
        <div className="mep-guide-inline">
          <span>Lengths in</span>
          <select id="pg-lengthUnit" className="mep-guide-unit" aria-label="Length unit" value={draft.lengthUnit} onChange={(e) => update({ lengthUnit: e.target.value as LengthUnit })}>
            {(Object.keys(LENGTH_UNIT_LABELS) as LengthUnit[]).map((u) => (
              <option key={u} value={u}>
                {LENGTH_UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
        <div className="mep-guide-formula">
          {(
            [
              ['maxRadius', 'Max radius', `${LENGTH_UNIT_LABELS[draft.lengthUnit]} from a stamp to each point of the room`],
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
      </>
    );
    const countLimits = (
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
    );
    const coverageToo = (
      <div className="mep-guide-section">
        <h3>Coverage</h3>
        <label className="mep-guide-term mep-guide-check-row">
          <input type="checkbox" id="pg-alsoCoverage" checked={draft.alsoCoverage} onChange={(e) => update({ alsoCoverage: e.target.checked })} />
          <span>Also cover each point of the room</span>
        </label>
        {draft.alsoCoverage && (
          <>
            <p className="mep-guide-note">MepApp places the larger of two counts: the count above, and the count that covers each point of the room. For example, a lumen count, and a max spacing of the luminaires.</p>
            {coverageLimits()}
          </>
        )}
      </div>
    );
    if (byCoverage)
      return (
        <>
          <h2>How far does one stamp reach?</h2>
          <p className="mep-guide-lead">
            MepApp places the fewest stamps that cover each point of the room.
            <InfoTip label="More about coverage">Each stamp covers a circle. The smallest of these sets the radius: max radius, max spacing ÷ √2, max distance to a wall × √2, √(max area per stamp ÷ 2).</InfoTip>
          </p>
          <div className="mep-guide-section">
            <h3>Coverage limits</h3>
            {coverageLimits()}
          </div>
          {countLimits}
        </>
      );
    if (countBy === 'perRoom')
      return (
        <>
          <h2>How many stamps does each room get?</h2>
          <p className="mep-guide-lead">Each room of the rule gets the same number of stamps, for example one thermostat in each room.</p>
          <div className="mep-guide-section">
            <div className="mep-guide-formula">
              <div className="mep-guide-term">
                <label className="mep-guide-label" htmlFor="pg-perRoomCount">
                  Stamps in each room
                </label>
                <input className="mep-guide-num" id="pg-perRoomCount" type="text" inputMode="numeric" value={draft.perRoomCount} onChange={field('perRoomCount')} />
              </div>
            </div>
          </div>
          {coverageToo}
          {countLimits}
        </>
      );
    const isLight = need?.kind === 'light';
    const lightUsed = requirement?.lighting;
    const capacityText = (n: number | null) => (n === null ? 'none' : `${fmt(n)} ${unit}`);
    const doubleStamp = need?.kind === 'count' && draft.capacity.trim() === '' && /\b(double|dubbel|duo)\b/i.test(draft.stampDefinitionId ? (stampName(draft.stampDefinitionId) ?? '') : '');
    const needRows = pageRows.filter((row) => row.rule.countBy === 'need');
    const problemText = (row: (typeof needRows)[number]) => {
      const w = row.requirement.warnings;
      const typeId = row.room.roomTypeId;
      if (w.includes('noPeople'))
        return (
          <>
            {missing('no persons')}{' '}
            {typeId !== undefined && (
              <button type="button" className="mep-guide-link" onClick={() => onOpenRoomTypes({ typeId, needId: 'persons' })}>
                {typeName(typeId)}: area per person
              </button>
            )}
          </>
        );
      if (w.includes('noCalibration')) return missing('no scale');
      return missing('cannot calculate');
    };
    // The rooms of the page that a need rule without room types does not find: their type has no demand for the need, or they have no type.
    const outside = draft.roomTypeIds.length === 0 && need ? pageRooms.filter((r) => !matches(r)) : [];
    const outsideTypes = [...new Set(outside.flatMap((r) => (r.roomTypeId !== undefined ? [r.roomTypeId] : [])))];
    const outsideUntyped = outside.filter((r) => r.roomTypeId === undefined).length;
    const zeroPersonRows = zeroRows.filter(zeroPersons).length;
    const zeroTypeId = zeroRows.find((row) => row.room.roomTypeId !== undefined)?.room.roomTypeId;
    return (
      <>
        <h2>What does one stamp give?</h2>
        <p className="mep-guide-lead">
          The room types give the need of each room{need ? ` (${need.name})` : ''}. Enter what one stamp gives: MepApp divides the need by it and rounds up.
          <InfoTip label="More about the count">
            The need comes from the calculation of the room type in Room types, for example 6.5 dm³/s per person. Click a room in the table or on the plan to see why it gets its number of stamps.
          </InfoTip>
        </p>
        {needMissing && (
          <div className="mep-guide-callout bad" data-testid="pg-need-deleted">
            <span>{draft.needId ? 'The need of this rule was deleted. MepApp places no stamps until the rule gets another need.' : 'The rule has no need.'} Choose a need in step 1.</span>
            <button type="button" onClick={() => onStepChange(1)}>
              Go to step 1
            </button>
          </div>
        )}
        {need && typesWithNeed.length === 0 && (
          <div className="mep-guide-callout" data-testid="pg-no-type-has-need">
            <span>No room type has {need.name} yet. Add it to the room types, or fill in the example values in Room types.</span>
            <button type="button" onClick={() => onOpenRoomTypes()}>
              Open Room types
            </button>
          </div>
        )}
        {need && (
          <div className="mep-guide-section">
            <h3>One {isLight ? 'luminaire' : 'stamp'}</h3>
            <div className="mep-guide-formula">
              <div className="mep-guide-term">
                <label className="mep-guide-label" htmlFor="pg-capacity">
                  {isLight ? 'One luminaire gives' : need.kind === 'count' ? 'One stamp holds' : 'One stamp gives'}
                </label>
                <input className="mep-guide-num" id="pg-capacity" type="text" inputMode="decimal" placeholder={need.kind === 'count' ? '1' : 'none'} value={draft.capacity} onChange={field('capacity')} />
                {CAPACITY_UNITS[need.kind].length > 0 ? (
                  <select id="pg-unit-select" className="mep-guide-unit" aria-label="Unit of one stamp" value={unit} onChange={(e) => update({ unit: e.target.value })}>
                    {CAPACITY_UNITS[need.kind].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{isLight ? 'lm (the luminous flux)' : need.unit}</span>
                )}
                {doubleStamp && (
                  <button type="button" className="mep-guide-link" id="pg-capacity-double" onClick={() => update({ capacity: '2' })}>
                    Use 2: the stamp name says double
                  </button>
                )}
              </div>
              {isLight && (
                <div className="mep-guide-term">
                  <span className="mep-guide-op">×</span>
                  <span className="mep-guide-sym">UF</span>
                  <select className="mep-guide-unit" id="pg-ufMode" aria-label="Source of the utilisation factor" value={draft.ufMode} onChange={(e) => update(e.target.value === 'table' ? { ufMode: 'table', ...(draft.ufTable.length === 0 ? { ufTable: EXAMPLE_UF_TABLE.map((pt) => ({ k: String(pt.k), uf: String(pt.uf) })) } : {}) } : { ufMode: 'fixed' })}>
                    <option value="fixed">Fixed</option>
                    <option value="table">From the room index</option>
                  </select>
                  {draft.ufMode === 'fixed' ? (
                    <input className="mep-guide-num short" id="pg-uf" type="text" inputMode="decimal" aria-label="Utilisation factor" value={draft.uf} onChange={field('uf')} />
                  ) : (
                    <span className="mep-guide-val" data-testid="pg-uf-value">
                      {lightUsed ? fmt(lightUsed.uf, 3) : '?'}
                    </span>
                  )}
                  <span className="mep-guide-op">×</span>
                  <span className="mep-guide-sym">MF</span>
                  <input className="mep-guide-num short" id="pg-mf" type="text" inputMode="decimal" aria-label="Maintenance factor" value={draft.mf} onChange={field('mf')} />
                  <span className="mep-guide-res" data-testid="pg-capacity-room">
                    {requirement?.capacity != null ? `= ${fmt(requirement.capacity)} lm on the working plane` : ''}
                  </span>
                </div>
              )}
              <div className="mep-guide-term result" data-testid="pg-quantity">
                {requirement?.quantityCount != null && requirement.required !== null && requirement.capacity !== null ? (
                  <>
                    <span>
                      {sample ? `${roomLabel(sample)}: ` : ''}
                      {fmt(requirement.required)} {unit} ÷ {fmt(requirement.capacity)} {unit} = {fmt(requirement.required / requirement.capacity, 2)}, rounded up
                    </span>
                    <span className="mep-guide-res">{plural(requirement.quantityCount, 'stamp')}</span>
                  </>
                ) : requirement && requirement.countSource === 'onePerRoom' ? (
                  <>
                    <span>No capacity: each room gets one stamp.</span>
                    <span className="mep-guide-res">1 stamp</span>
                  </>
                ) : (
                  <span>{sample && !sampleMatches ? `${roomLabel(sample)} is not in this rule. Click a room in the table.` : 'Enter the missing room data first.'}</span>
                )}
              </div>
              {needWritesCapacity(need) && (
                <label className="mep-guide-term mep-guide-check-row">
                  <input type="checkbox" id="pg-writeCapacity" checked={draft.writeCapacity} onChange={(e) => update({ writeCapacity: e.target.checked })} />
                  <span>Write the amount per stamp to each stamp as its capacity</span>
                </label>
              )}
            </div>
          </div>
        )}
        {isLight && draft.ufMode === 'table' && (
          <div className="mep-guide-section" data-testid="pg-uf-table">
            <h3>Utilisation factor from the room index</h3>
            <p className="mep-guide-note">
              k = 2 × floor area ÷ (h<sub>m</sub> × perimeter), with h<sub>m</sub> = ceiling height − suspension − working-plane height (from the room type, else {DEFAULT_WORKING_PLANE_HEIGHT_M} m). MepApp reads the UF from the table of the luminaire: linear between two rows, the end value outside the table. The first table is an example for a recessed LED panel: use the table of your product.
            </p>
            <div className="mep-guide-formula">
              <div className="mep-guide-term">
                <span className="mep-guide-label">Suspension</span>
                <input className="mep-guide-num" id="pg-suspension" type="text" inputMode="decimal" placeholder="0" aria-label="Suspension" value={draft.suspension} onChange={field('suspension')} />
                <span>m below the ceiling</span>
              </div>
              <div className="mep-guide-term result" data-testid="pg-room-index">
                {lightUsed?.roomIndex ? (
                  <span>
                    {sample ? roomLabel(sample) : 'This room'}: h<sub>m</sub> = {fmt(v?.ceilingHeight.mm ? v.ceilingHeight.mm / 1000 : null, 2)} − {fmt(valueOf(draft.suspension) ?? 0, 2)} − {fmt(lightUsed.roomIndex.workingPlaneM, 2)} ({lightUsed.roomIndex.workingPlaneSource === 'roomType' ? 'room type' : 'default'}) = {fmt(lightUsed.roomIndex.hmM, 2)} m; k = {fmt(lightUsed.roomIndex.k, 2)}; UF = {fmt(lightUsed.uf, 3)}
                  </span>
                ) : requirement?.warnings.includes('noRoomIndex') ? (
                  missing('No room index: the luminaire is not above the working plane.')
                ) : (
                  <span>Enter the room data first.</span>
                )}
              </div>
            </div>
            <table className="mep-guide-uf">
              <thead>
                <tr>
                  <th>Room index k</th>
                  <th>UF</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.ufTable.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input className="mep-guide-num short" type="text" inputMode="decimal" aria-label={`Room index in row ${i + 1}`} data-testid={`pg-uf-k-${i}`} value={row.k} onChange={(e) => update({ ufTable: draft.ufTable.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)) }, true)} />
                    </td>
                    <td>
                      <input className="mep-guide-num short" type="text" inputMode="decimal" aria-label={`UF in row ${i + 1}`} data-testid={`pg-uf-uf-${i}`} value={row.uf} onChange={(e) => update({ ufTable: draft.ufTable.map((r, j) => (j === i ? { ...r, uf: e.target.value } : r)) }, true)} />
                    </td>
                    <td>
                      <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => update({ ufTable: draft.ufTable.filter((_, j) => j !== i) })}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mep-guide-inline">
              <button type="button" id="pg-uf-add" onClick={() => update({ ufTable: [...draft.ufTable, { k: '', uf: '' }] })}>
                Add a row
              </button>
              <button type="button" id="pg-uf-example" onClick={() => update({ ufTable: EXAMPLE_UF_TABLE.map((pt) => ({ k: String(pt.k), uf: String(pt.uf) })) })}>
                Use the example table
              </button>
            </div>
          </div>
        )}
        {need && (
          <div className="mep-guide-section">
            <h3>Stamps per room ({needRows.length})</h3>
            {needRows.length === 0 ? (
              <p className="mep-guide-note">No room of this page is in this rule.</p>
            ) : (
              <div className="mep-room-calc-scroll mep-guide-table">
                <table className="mep-room-calc-table" data-testid="pg-need-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>The room type gives</th>
                      <th>Need</th>
                      <th>One stamp</th>
                      <th>Stamps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {needRows.map((row) => {
                      const req = row.requirement;
                      const typeId = row.room.roomTypeId;
                      const pick = { onClick: () => setSampleId(row.room.id), onKeyDown: pickKeys(() => setSampleId(row.room.id)), tabIndex: 0, 'aria-selected': row.room.id === sample?.id };
                      if (req.warnings.includes('noDemand') && typeId !== undefined)
                        return (
                          <tr key={row.room.id} className="bad" data-room={row.room.id} {...pick}>
                            <td>{roomLabel(row.room)}</td>
                            <td colSpan={4}>
                              {typeName(typeId)} has no {need.name}. No stamps.{' '}
                              <button
                                type="button"
                                className="mep-guide-link"
                                data-testid="pg-add-need"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenRoomTypes({ typeId, needId: need.id });
                                }}
                              >
                                Add {need.name} to {typeName(typeId)}
                              </button>
                            </td>
                          </tr>
                        );
                      return (
                        <tr key={row.room.id} className={req.count === null || zeroNeed(row) ? 'bad' : row.room.id === sample?.id ? 'sel' : ''} data-room={row.room.id} {...pick}>
                          <td>{roomLabel(row.room)}</td>
                          <td>
                            {typeName(typeId)}: {req.demand ? demandShort(req.demand.demand) : '–'}
                          </td>
                          <td className="num">{req.required !== null ? `${fmt(req.required)} ${unit}` : problemText(row)}</td>
                          <td className="num">{capacityText(req.capacity)}</td>
                          <td className="num" data-testid="count">
                            {req.count ?? '?'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {zeroRows.length > 0 && (
              <div className="mep-guide-callout" data-testid="pg-zero-need">
                <span>
                  <b>
                    {plural(zeroRows.length, 'room')} {zeroRows.length === 1 ? 'gets' : 'get'} no stamp
                  </b>
                  , because the need is 0: {zeroRows.slice(0, 8).map((row) => roomLabel(row.room)).join(', ')}
                  {zeroRows.length > 8 ? ', …' : ''}.
                  {zeroPersonRows > 0 &&
                    ` ${zeroPersonRows === zeroRows.length ? (zeroRows.length === 1 ? 'This room has' : 'These rooms have') : `${plural(zeroPersonRows, 'room')} of them ${zeroPersonRows === 1 ? 'has' : 'have'}`} 0 persons: the room is smaller than the area per person of its room type.`}{' '}
                  To give a stamp, enter a minimum ("At least") or a smaller area per person in Room types.
                </span>
                {zeroTypeId !== undefined && (
                  <button type="button" onClick={() => onOpenRoomTypes({ typeId: zeroTypeId, needId: need.id })}>
                    Open {typeName(zeroTypeId)}
                  </button>
                )}
              </div>
            )}
            {(outsideTypes.length > 0 || outsideUntyped > 0) && (
              <p className="mep-guide-note" data-testid="pg-not-in-rule">
                Not in this rule:{' '}
                {[
                  ...outsideTypes.map((id) => `${typeName(id)} (${plural(outside.filter((r) => r.roomTypeId === id).length, 'room')})`),
                  ...(outsideUntyped > 0 ? [`${plural(outsideUntyped, 'room')} without a room type`] : []),
                ].join(', ')}
                {outsideTypes.length > 0 ? `: ${outsideTypes.length === 1 ? 'this room type has' : 'these room types have'} no ${need.name}.` : '.'}
              </p>
            )}
          </div>
        )}
        {coverageToo}
        {countLimits}
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
          These distances change only <b>where</b> MepApp puts the stamps, not the number of stamps.
          <InfoTip label="More about the spacing">When the stamps do not fit, MepApp tells you. Then change the distances, the layout or the count.</InfoTip>
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
            <span className="mep-guide-note">The orange band on the plan. The distance is from the wall to the center of the stamp. It is a minimum: for the Grid layout, step 5 sets if the outer stamps are at this distance or half the spacing from the wall.</span>
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
            <div className={`mep-guide-checks${floorBusy ? ' busy' : ''}`} data-testid="pg-fitchecks" data-busy={floorBusy || undefined}>
              {rows.map((row) => {
                const name = roomLabel(row.room);
                const count = row.requirement.count;
                const testId = `pg-fit-${row.room.id}`;
                const pick = { selected: row.room.id === sample?.id, onPick: () => (setSampleId(row.room.id), setView(null)) };
                if (count === null) return <Check key={row.room.id} state="off" title={`${name}: no count yet`} sub="Room data is missing (step 3)." testId={testId} {...pick} />;
                if (tooManyStamps(row))
                  return <Check key={row.room.id} state="bad" title={`${name}: ${plural(count, 'stamp')} is too many`} sub={`MepApp places at most ${MAX_ROOM_STAMPS} stamps in one room. Check the values in step 3.`} testId={testId} {...pick} />;
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
          The plan shows the layout in <b>{name}</b> with the count from step 3.
          <InfoTip label="More about the layout">Each picture shows the layout in an example room.</InfoTip>
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
        {row && gridFull(row) && (
          <div className="mep-guide-callout" data-testid="pg-grid-note">
            {name} has fewer free ceiling tiles than stamps. Some stamps are not at a tile center. Use a smaller ceiling grid or a smaller min distance to the walls.
          </div>
        )}
        {byCoverage && draft.strategy === 'evenSpread' && (
          <div className="mep-guide-callout info">With By coverage, Even spread uses the positions that the coverage calculation found. Each point of the room stays covered.</div>
        )}
        {coverageOn && (draft.strategy !== 'evenSpread' || draft.ceilingGrid) && (
          <div className="mep-guide-callout info" data-testid="pg-grow-note">
            When this layout{draft.ceilingGrid && draft.strategy !== 'perimeter' ? ' or the ceiling grid' : ''} leaves part of the room outside the coverage circles, MepApp adds stamps until each point is covered.
            {draft.strategy === 'grid' && draft.edge === 'halfSpacing' ? ' With the outer stamps at half the spacing from the wall, the corners need many stamps. "At the min distance to the walls" needs fewer.' : ''}
          </div>
        )}
        <div className="mep-guide-choices" role="radiogroup" aria-label="Layout">
          {(Object.keys(LAYOUT_STRATEGY_LABELS) as LayoutStrategy[]).map((s) => (
            <div key={s} className={`mep-guide-choice${draft.strategy === s ? ' on' : ''}`}>
              <button type="button" role="radio" aria-checked={draft.strategy === s} data-layout={s} onClick={() => update({ strategy: s })}>
                <LayoutPicture strategy={s} {...(s === 'grid' ? { gridStyle: draft.gridStyle, edge: draft.edge } : {})} />
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
                    <LayoutPicture strategy="grid" gridStyle={g} edge={draft.edge} />
                    <span className="ct">{GRID_STYLE_LABELS[g]}</span>
                    <span className="cd">{GRID_STYLE_HINTS[g]}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {draft.strategy === 'grid' && (
          <div className="mep-guide-section">
            <h3>Outer stamps</h3>
            <div className="mep-guide-choices small" role="radiogroup" aria-label="Outer stamps">
              {(Object.keys(GRID_EDGE_LABELS) as GridEdge[]).map((g) => (
                <div key={g} className={`mep-guide-choice${draft.edge === g ? ' on' : ''}`}>
                  <button type="button" role="radio" aria-checked={draft.edge === g} data-grid-edge={g} onClick={() => update({ edge: g })}>
                    <LayoutPicture strategy="grid" gridStyle={draft.gridStyle} edge={g} />
                    <span className="ct">{GRID_EDGE_LABELS[g]}</span>
                    <span className="cd">{GRID_EDGE_HINTS[g]}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mep-guide-section">
          <h3>Ceiling grid</h3>
          {draft.strategy === 'perimeter' ? (
            <p className="mep-guide-note">Along the walls does not use a ceiling grid.</p>
          ) : (
            <>
              <label className="mep-guide-term mep-guide-check-row">
                <input type="checkbox" id="pg-ceilingGrid" checked={draft.ceilingGrid} onChange={(e) => update({ ceilingGrid: e.target.checked })} />
                <span>Snap the stamps to a ceiling grid</span>
              </label>
              {draft.ceilingGrid && (
                <div className="mep-guide-field">
                  <label htmlFor="pg-ceilingGridSize">Tile size</label>
                  <div className="mep-guide-inline">
                    <select
                      id="pg-ceilingGridSize"
                      value={draft.ceilingGridCustom ? OTHER_UNIT : draft.ceilingGridMm}
                      onChange={(e) => update(e.target.value === OTHER_UNIT ? { ceilingGridCustom: true } : { ceilingGridCustom: false, ceilingGridMm: e.target.value })}
                    >
                      {CEILING_GRID_SIZES_MM.map((mm) => (
                        <option key={mm} value={String(mm)}>
                          {mm} × {mm} mm
                        </option>
                      ))}
                      <option value={OTHER_UNIT}>Custom</option>
                    </select>
                    {draft.ceilingGridCustom && (
                      <>
                        <input className="mep-guide-num" id="pg-ceilingGridMm" type="text" inputMode="decimal" aria-label="Custom tile size" value={draft.ceilingGridMm} onChange={field('ceilingGridMm')} />
                        <span>mm</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <p className="mep-guide-note">
                The grid is centered in the room and follows its long side. Each stamp moves to the center of the nearest free tile, at the min distance to the walls or more. The number of stamps does not change.
              </p>
            </>
          )}
        </div>
        <div className="mep-guide-section">
          <h3>Rotation</h3>
          <div className="mep-guide-field">
            <label htmlFor="pg-rotation">Rotation</label>
            <select id="pg-rotation" value={draft.rotation} onChange={(e) => update(e.target.value === 'fixed' ? { rotation: 'fixed', ...(draft.fixedAngle.trim() === '' ? { fixedAngle: '0' } : {}) } : { rotation: 'room' })}>
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
    const rows = placeShown?.rows ?? [];
    const byNeed = countBy === 'need';
    const showPeople = byNeed && rows.some((row) => row.requirement.demand?.result.parts.some((p) => p.term.basis === 'person'));
    const skipped = rows.filter((row) => row.requirement.count === null).length;
    const problems = rows.filter((row) => spacingProblem(row) || coverageProblem(row)).length;
    const tooMany = rows.filter(tooManyStamps).length;
    const others = pageRooms.length - matched.length;
    const label = !artReady && !artFailed ? 'Loading the stamp…' : placeBusy ? 'Calculating…' : `Place ${plural(placeTotal, 'stamp')}${replaceIds.length > 0 ? ` (replace ${replaceIds.length})` : ''}`;
    return (
      <>
        <h2>Check and place</h2>
        <p className="mep-guide-lead">
          Place adds the stamps of this rule as one undo step.
          <InfoTip label="More about Place">
            The table shows each room of this page that the rule applies to. Click a row to see the room on the plan. When you place again, MepApp replaces the auto-placed stamps that you did not move.
          </InfoTip>
        </p>
        {!stampId && (
          <div className="mep-guide-callout">
            <span>The rule has no stamp. Choose a stamp in step 1 first.</span>
            <button type="button" onClick={() => onStepChange(1)}>
              Go to step 1
            </button>
          </div>
        )}
        {artFailed && <div className="mep-guide-callout bad">MepApp cannot load the stamp of this rule.</div>}
        {rows.length === 0 ? (
          <p className="mep-guide-note">{!placeShown && placeBusy ? 'MepApp calculates the rooms…' : 'No room of this page matches the rule.'}</p>
        ) : (
          <div className={`mep-room-calc-scroll mep-guide-table${placeBusy ? ' busy' : ''}`}>
            <table className="mep-room-calc-table" data-testid="pg-place-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Type</th>
                  <th>m²</th>
                  {showPeople && <th>Persons</th>}
                  {byNeed && <th>Need ({unit})</th>}
                  <th>Stamps</th>
                  {byNeed && <th>Each ({unit})</th>}
                  <th>Existing</th>
                  <th>Placed</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cls = row.requirement.count === null ? 'bad' : spacingProblem(row) || coverageProblem(row) || tooManyStamps(row) ? 'err' : row.room.id === sample?.id ? 'sel' : '';
                  return (
                    <tr key={row.room.id} className={cls} data-room={row.room.id} tabIndex={0} aria-selected={row.room.id === sample?.id} onClick={() => setSampleId(row.room.id)} onKeyDown={pickKeys(() => setSampleId(row.room.id))}>
                      <td>{roomLabel(row.room)}</td>
                      <td>{typeName(row.room.roomTypeId)}</td>
                      <td className="num">{fmt(row.values.areaM2)}</td>
                      {showPeople && <td className="num">{row.values.people ? row.values.people.count : '–'}</td>}
                      {byNeed && <td className="num">{fmt(row.requirement.required)}</td>}
                      <td className="num" data-testid="count">
                        {row.requirement.count ?? '–'}
                      </td>
                      {byNeed && <td className="num">{fmt(row.requirement.perElement)}</td>}
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
              {tooMany > 0 ? `${plural(tooMany, 'room')} skipped: more than ${MAX_ROOM_STAMPS} stamps (step 3). ` : ''}
              {problems > 0 ? `${plural(problems, 'room')} with a spacing or coverage problem: MepApp places the stamps, but check them. ` : ''}
              {others > 0 ? `${plural(others, 'other room')} of this page do${others === 1 ? 'es' : ''} not match this rule.` : ''}
            </span>
          </div>
        )}
      </>
    );
  }

  const planStamps = mode === 'room' ? (sampleShown?.stamps ?? []) : (shownRows ?? []).flatMap((row) => row.stamps);
  // The parent shows the step list: it gets the states only when they change.
  const statesKey = JSON.stringify(STEP_TITLES.map((_, i) => stepStatus(i + 1)));
  const onStepStatesRef = useRef(onStepStates);
  onStepStatesRef.current = onStepStates;
  useLayoutEffect(() => onStepStatesRef.current(JSON.parse(statesKey) as StepStatus[]), [statesKey]);

  return (
    <div className="mep-guide-body" onKeyDown={(e) => e.key === 'Enter' && settle()} onBlur={settle}>
      <section className="mep-guide-card" data-testid="pg-step">
        {message ? (
          <div className="mep-guide-callout bad" role="alert" data-testid="pg-save-state">
            <span>{message}</span>
            <button type="button" onClick={revert}>
              Revert
            </button>
          </div>
        ) : problem && changed ? (
          <div className="mep-guide-callout bad" data-testid="pg-save-state">
            <span>Not saved: {problem}</span>
            <button type="button" onClick={revert}>
              Revert
            </button>
          </div>
        ) : (
          changed && (
            <div className="mep-guide-status" role="status" data-testid="pg-save-state">
              <span>Saved. MepApp saves each change at once.</span>
              <button type="button" id="pg-revert" onClick={revert}>
                Revert all changes since you opened the rule
              </button>
            </div>
          )
        )}
        {stepView()}
        <div className="mep-guide-nav">
          <button type="button" disabled={step === 1} onClick={() => onStepChange(step - 1)}>
            Back
          </button>
          {step < STEP_TITLES.length && (
            <button type="button" className="primary" onClick={() => onStepChange(step + 1)}>
              Next: {STEP_TITLES[step]}
            </button>
          )}
        </div>
      </section>
      <aside className="mep-guide-side">
        <div className="mep-guide-panel">
          <div className="mep-guide-panel-head">
            <span className="pt">{mode === 'room' ? 'Sample room' : 'Whole floor'}</span>
            {planBusy && (
              <span className="mep-guide-busy" role="status" data-testid="pg-busy">
                Calculating…
              </span>
            )}
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
              {jobError && <p className="mep-guide-callout bad">MepApp cannot calculate the stamps: {jobError}</p>}
              <RulePreviewPlan
                mode={mode}
                busy={planBusy}
                rooms={pageRooms}
                sample={sample}
                calibration={calibration}
                roomState={roomState}
                stamps={step >= 3 || mode === 'floor' ? planStamps : []}
                stampSizePt={stampSizePt}
                stampIconUrl={iconUrl}
                wallOffsetM={parsed.rule?.layout.wallOffsetM ?? 0}
                coverageRadiusM={coverageOn && parsed.rule ? coverageRadiusM(parsed.rule.coverage) : null}
                minSpacingM={step === 4 ? (parsed.rule?.layout.minSpacingM ?? null) : null}
                ceilingGridMm={step >= 3 && parsed.rule && parsed.rule.layout.strategy !== 'perimeter' ? (parsed.rule.layout.ceilingGridMm ?? null) : null}
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
                    {coverageOn && <span style={{ ['--sw' as string]: 'rgba(23, 90, 138, 0.15)' }}>coverage circle</span>}
                    {step === 4 && draft.minSpacing.trim() !== '' && <span style={{ ['--sw' as string]: 'var(--guide-ok-soft)' }}>min distance between stamps</span>}
                    {step >= 3 && parsed.rule?.layout.ceilingGridMm !== undefined && parsed.rule.layout.strategy !== 'perimeter' && <span className="line">ceiling grid</span>}
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
          <WhyBox row={sampleShown} matches={sampleMatches} sampleName={roomLabel(sample)} need={need} unit={unit} typeName={typeName(sample.roomTypeId)} rule={parsed.rule} coverage={coverageOn ? coverage : null} error={parsed.error} />
        )}
      </aside>
    </div>
  );
});

/** Enter or Space does the click of a row that picks a room. */
const pickKeys = (onPick: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  onPick();
};

function Check({ state, title, sub, testId, selected, onPick }: { state: 'ok' | 'warn' | 'bad' | 'off'; title: string; sub: string; testId: string; selected?: boolean; onPick?: () => void }) {
  return (
    <div
      className={`mep-guide-check ${state}${onPick ? ' pick' : ''}${selected ? ' sel' : ''}`}
      data-testid={testId}
      data-state={state}
      onClick={onPick}
      {...(onPick ? { role: 'button', tabIndex: 0, 'aria-pressed': selected === true, onKeyDown: pickKeys(onPick) } : {})}
    >
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
  /** The need of a need rule; undefined for another rule, or a deleted need. */
  need: RoomNeed | undefined;
  /** The unit of the need in the rule. */
  unit: string;
  typeName: string;
  rule: PlacementRule | null;
  coverage: { radiusM: number; from: string } | null;
  error: string | null;
}

/** "Why N stamps?": the room type and its calculation, the need of the room, what one stamp gives, the count limits, and the result for the sample room. */
function WhyBox({ row, matches, sampleName, need, unit, typeName, rule, coverage, error }: WhyBoxProps) {
  if (!matches) {
    return (
      <div className="mep-guide-panel">
        <p className="mep-guide-note">{sampleName} is not in this rule. Click a blue room on the plan.</p>
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
  // The count before the count limits.
  const base = req.countSource === 'coverage' ? req.count : req.countSource === 'perRoom' ? (rule.perRoomCount ?? 1) : req.countSource === 'onePerRoom' ? 1 : req.quantityCount;
  const minHit = rule.minCount !== undefined && base !== null && req.countSource !== 'coverage' && base < rule.minCount;
  const win = !minHit && !maxHit && req.count !== null ? 'win' : '';
  const line = (cls: string, label: string, why: string, n: ReactNode, testId?: string) => (
    <div className={`cr ${cls}`} data-testid={testId}>
      <span className="cl">{label}</span>
      <span className="cw">{why}</span>
      <span className="cn">{n}</span>
    </div>
  );
  // The need of the room: the calculation of the room type with the room values.
  const result = req.demand?.result;
  const needLines =
    need && req.demand && result ? (
      <>
        {line('from', `${typeName}: ${need.name}`, `${demandShort(req.demand.demand)} (from the room type)`, '', 'pg-why-type')}
        {line(
          '',
          'Need of the room',
          result.total === null
            ? 'Room data is missing (persons or the scale)'
            : `${demandSumText(need, result)}${result.minimumApplied ? ' → at least the minimum' : ''} = ${fmtTotal(result.total)} ${need.unit}${unit !== need.unit ? ` = ${fmt(req.required)} ${unit}` : ''}`,
          '',
          'pg-why-need',
        )}
      </>
    ) : null;
  const luminaire = rule.luminaire;
  const capacityWhy =
    need?.kind === 'light' && luminaire && req.lighting && rule.capacityPerElement !== undefined
      ? `${fmt(rule.capacityPerElement)} lm × UF ${fmt(req.lighting.uf, 3)} × MF ${fmt(luminaire.maintenanceFactor, 2)} = ${fmt(req.capacity)} lm`
      : need?.kind === 'count' && rule.capacityPerElement === undefined
        ? `1 ${need.unitOne ?? need.unit} (no number entered)`
        : `${fmt(req.capacity)} ${unit}`;
  const needCount = (cls: string) => (
    <>
      {line('', 'One stamp gives', capacityWhy, '', 'pg-why-capacity')}
      {line(cls, 'Need ÷ one stamp', `${fmt(req.required)} ÷ ${fmt(req.capacity)} = ${fmt((req.required ?? 0) / (req.capacity ?? 1), 2)}, rounded up`, req.quantityCount ?? '?', 'pg-why-source')}
    </>
  );
  const sourceLine = (cls: string) =>
    rule.countBy === 'perRoom'
      ? line(cls, 'The same number in each room', 'Step 3', rule.perRoomCount ?? 1, 'pg-why-source')
      : req.quantityCount !== null
        ? needCount(cls)
        : line(cls, 'One stamp gives', 'No capacity per stamp: one stamp per room', 1, 'pg-why-source');
  let first: ReactNode;
  if (req.countSource === 'coverage') {
    const coverageLine = coverage
      ? line(maxHit ? '' : 'win', rule.countBy === 'coverage' ? 'By coverage' : 'Coverage', `Circles of ${fmt(coverage.radiusM, 2)} m (${coverage.from}) cover the room`, req.count ?? '?', rule.countBy === 'coverage' ? 'pg-why-source' : 'pg-why-coverage')
      : line('blocked', 'By coverage', 'Enter a coverage limit (step 3)', '?', 'pg-why-source');
    first =
      rule.countBy === 'coverage' ? (
        coverageLine
      ) : (
        <>
          {needLines}
          {sourceLine('')}
          {coverageLine}
        </>
      );
  } else if (req.warnings.includes('needNotFound')) {
    first = line('blocked', 'Need', 'The need of this rule was deleted (step 1)', '?', 'pg-why-source');
  } else if (req.warnings.includes('noDemand')) {
    first = line('blocked', typeName, `${typeName} has no ${need?.name ?? 'need'}. Add it in Room types.`, '?', 'pg-why-source');
  } else if (req.count === null) {
    first = (
      <>
        {needLines}
        {line('blocked', 'Stamps', req.warnings.includes('noRoomIndex') ? 'No room index: the luminaire is not above the working plane' : 'Room data is missing (persons or the scale)', '?', 'pg-why-source')}
      </>
    );
  } else {
    first = (
      <>
        {needLines}
        {sourceLine(win)}
      </>
    );
  }
  const notes = row.warnings
    .filter((w) => w !== 'maxCountReached' && w !== 'noDemand' && w !== 'needNotFound')
    .map((w) => (w === 'tooClose' && row.fitEstimate !== undefined ? `${PLACEMENT_WARNING_TEXT[w]}: about ${row.fitEstimate} fit` : PLACEMENT_WARNING_TEXT[w]));
  return (
    <div className="mep-guide-panel" data-testid="pg-why">
      <div className="mep-guide-panel-head">
        <span className="pt">Why {req.count ?? '?'} stamp{req.count === 1 ? '' : 's'}?</span>
        <span className="mep-guide-note">{sampleName}</span>
      </div>
      <div className="mep-guide-chain">
        {first}
        {rule.minCount !== undefined && line(minHit ? 'cap' : '', 'Min count', req.countSource === 'coverage' ? 'The coverage starts at this count' : minHit ? 'Raises the count' : 'Not needed here', rule.minCount, 'pg-why-min')}
        {rule.maxCount !== undefined && line(maxHit ? 'cap' : '', 'Max count', maxHit ? 'Limits the count' : 'Not needed here', rule.maxCount, 'pg-why-max')}
        {line('res', 'Stamps in this room', req.count === null ? 'Cannot calculate yet' : coverage ? 'The coverage of the final positions can raise this number' : 'Spacing and layout do not change this number', req.count ?? '?', 'pg-why-result')}
      </div>
      {req.perElement !== null && req.count !== null && rule.writeCapacity && (
        <p className="mep-guide-note" data-testid="pg-why-each">
          Each stamp gets {fmt(req.perElement)} {unit} ({fmt(req.required)} ÷ {req.count}). MepApp writes this capacity to the stamp.
        </p>
      )}
      {req.lighting?.roomIndex && (
        <p className="mep-guide-note" data-testid="pg-why-uf">
          Room index k = {fmt(req.lighting.roomIndex.k, 2)} (h<sub>m</sub> {fmt(req.lighting.roomIndex.hmM, 2)} m, working plane {fmt(req.lighting.roomIndex.workingPlaneM, 2)} m): UF {fmt(req.lighting.uf, 3)}.
        </p>
      )}
      {notes.length > 0 && <div className="mep-guide-callout bad">{notes.join('; ')}</div>}
    </div>
  );
}
