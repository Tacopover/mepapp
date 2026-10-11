import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import {
  autoPlacedStampIds,
  calculateRooms,
  MAX_ROOM_STAMPS,
  roomTypeLabel,
  type PlacementPlanInput,
  type PlacementRow,
  type PlacementRule,
  type PlacementWorkerLike,
  type Room,
  type RoomType,
  type StampDefinition,
} from '@mepapp/core';
import { coverageProblem, groupsOf, missingData, notesOf, replaceIdsOf, spacingProblem, tooManyStamps, usePlacementPlan, type AutoPlaceArt } from './autoPlacePlan.js';
import { Dialog } from './Dialog.js';
import { PlacementGuideSteps, PlacementRuleGuideBody, type PlacementRuleGuideHandle, type StepState, type StepStatus } from './PlacementRuleGuide.js';
import { RulePreviewPlan, type PreviewRoomState, type PreviewStampLayer } from './RulePreviewPlan.js';

export interface AutoPlaceDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The user library of placement rules. */
  rules: PlacementRule[];
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  /** The name of a stamp definition, or null when the id is unknown. */
  stampName: (definitionId: string) => string | null;
  /** A stamp definition by id, for its size; undefined when it is not found. */
  stampDefinition: (definitionId: string) => StampDefinition | undefined;
  /** The remembered scale of a stamp definition (the stamp tool's appearance default). */
  stampScale: (definitionId: string) => number;
  /** The thumbnail of a stamp definition, or null when the id is unknown. */
  stampIconUrl: (definitionId: string) => string | null;
  /** Loads the art of a stamp definition; null when it cannot be loaded. */
  loadStampArt: (definitionId: string) => Promise<AutoPlaceArt | null>;
  /** Creates the Web Worker of the plans; without it the dialog calculates on the main thread. */
  createPlacementWorker?: () => PlacementWorkerLike;
  /** Opens the stamp picker; calls `onPick` with the chosen definition id. */
  onChooseStamp: (onPick: (definitionId: string) => void) => void;
  /** True while the stamp picker of a rule is open on top of this dialog. */
  stampPickerOpen: boolean;
  /** Saves the room-type library (the area per person in the guide). */
  onChangeRoomTypes: (types: RoomType[]) => void;
  /** Saves the rule list: the guide saves each valid change of a rule at once. */
  onChangeRules: (rules: PlacementRule[]) => void;
  onOpenRules: () => void;
  /** Called after Place with the number of placed stamps and of replaced stamps. */
  onPlaced: (count: number, replaced: number) => void;
  /** Called after Remove auto-placed stamps with the number of removed stamps. */
  onRemoved: (count: number) => void;
  onClose: () => void;
}

type Scope = 'selected' | 'page';
type InputKind = 'drawing' | 'types' | 'heights';
type Item = { kind: InputKind | 'place' } | { kind: 'rule'; id: string };

const fmt = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '–' : n.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
const roomLabel = (room: Room) => [room.number, room.name].filter(Boolean).join(' ') || room.id;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ICON: Record<StepState, string> = { ok: '✓', warn: '!', bad: '×', '': '·' };
const INPUT_TITLES: Record<InputKind, string> = { drawing: 'Drawing and rooms', types: 'Room types', heights: 'Ceiling heights' };

const COUNT_SOURCE_TEXT: Record<PlacementRow['requirement']['countSource'], string> = {
  amount: 'From the amount ÷ the capacity, rounded up, then the min and max count',
  coverage: 'By coverage: the fewest stamps that cover the room',
  onePerRoom: 'No capacity: one per room, then the min and max count',
};

/** The state of a rule in the left list, from the dry run of its rows (no stamp positions). */
function ruleStatusOf(rule: PlacementRule, rows: readonly Pick<PlacementRow, 'requirement'>[], found: (definitionId: string) => boolean): StepStatus {
  if (!rule.stampDefinitionId) return ['bad', 'No stamp'];
  if (!found(rule.stampDefinitionId)) return ['bad', 'Stamp not found'];
  if (rows.length === 0) return ['warn', 'No room matches'];
  const tooMany = rows.filter((row) => (row.requirement.count ?? 0) > MAX_ROOM_STAMPS).length;
  if (tooMany > 0) return ['bad', `${plural(tooMany, 'room')}: too many stamps`];
  const missing = rows.filter(missingData).length;
  if (missing > 0) return ['warn', `${plural(missing, 'room')}: data missing`];
  return ['ok', plural(rows.reduce((n, row) => n + (row.requirement.count ?? 0), 0), 'stamp')];
}

/** The state of a checked rule in the Place all table, from the rows of the plan. */
function placeStateOf(rule: PlacementRule, rows: readonly PlacementRow[]): StepStatus {
  if (!rule.stampDefinitionId) return ['bad', 'Skipped: no stamp'];
  if (rows.some((row) => row.warnings.includes('stampNotFound'))) return ['bad', 'Skipped: stamp not found'];
  if (rows.length === 0) return ['warn', 'No room matches'];
  const tooMany = rows.filter(tooManyStamps).length;
  if (tooMany > 0) return ['bad', `${plural(tooMany, 'room')} skipped: too many stamps`];
  const missing = rows.filter(missingData).length;
  if (missing > 0) return ['warn', `${plural(missing, 'room')} skipped: data missing`];
  const problems = rows.filter((row) => spacingProblem(row) || coverageProblem(row)).length;
  if (problems > 0) return ['warn', `${plural(problems, 'room')}: check the spacing`];
  return ['ok', 'Ready'];
}

/** Enter or Space does the click of a table row. */
const pickKeys = (onPick: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  onPick();
};

function Check({ state, title, sub }: { state: StepState; title: string; sub: string }) {
  return (
    <div className={`mep-guide-check ${state || 'off'}`}>
      <span className="ic">{state === 'ok' ? '✓' : state === '' ? '–' : '!'}</span>
      <div>
        <b>{title}</b>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

/**
 * Auto-place stamps (auto-place-dialog.md Phase 2): one dialog in the frame of the placement rule
 * guide. The left list has the input data, the rules (a rule opens into the six guide steps) and
 * Place all. Place all plans the checked rules in a Web Worker, shows the stamps on the floor plan,
 * and places them as one undo step. Only rooms on the shown page get stamps. A re-run replaces the
 * unmoved auto-placed stamps of the same rule and room, and keeps the moved ones.
 */
export function AutoPlaceDialog({
  sceneRef,
  rules,
  roomTypes,
  language,
  stampName,
  stampDefinition,
  stampScale,
  stampIconUrl,
  loadStampArt,
  createPlacementWorker,
  onChooseStamp,
  stampPickerOpen,
  onChangeRoomTypes,
  onChangeRules,
  onOpenRules,
  onPlaced,
  onRemoved,
  onClose,
}: AutoPlaceDialogProps) {
  const scene = sceneRef.current;
  // The plan follows room and stamp edits (possible while the preview bar is shown) and page changes.
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

  const pageIndex = scene?.getPageIndex() ?? 0;
  // version: rooms, calibration and selection change in the drawing.
  /* eslint-disable react-hooks/exhaustive-deps */
  const pageRooms = useMemo(() => (scene ? scene.listRooms().filter((r) => r.pageIndex === pageIndex) : []), [scene, pageIndex, version]);
  const selectedRooms = useMemo(() => (scene ? scene.getSelectedRooms().filter((r) => r.pageIndex === pageIndex) : []), [scene, pageIndex, version]);
  const calibration = useMemo(() => scene?.getCalibration(pageIndex) ?? null, [scene, pageIndex, version]);
  const heights = useMemo(() => scene?.getCeilingHeights() ?? null, [scene, version]);
  const types = useMemo(() => (scene ? scene.getRoomTypes() : roomTypes.map((t) => ({ ...t, inLibrary: true }))), [scene, roomTypes, version]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const [scope, setScope] = useState<Scope>(() => (selectedRooms.length > 0 ? 'selected' : 'page'));
  const scopeRooms = scope === 'selected' ? selectedRooms : pageRooms;
  const valuesById = useMemo(
    () => new Map(scene ? scopeRooms.map((r) => [r.id, scene.getRoomValues(r)] as const) : []),
    // version and roomTypes: room values change with room types and ceiling heights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, scopeRooms, version, roomTypes],
  );
  const valuesOf = useCallback((room: Room) => valuesById.get(room.id) ?? scene!.getRoomValues(room), [valuesById, scene]);
  const typeName = (id: string | undefined) => {
    const type = id === undefined ? undefined : types.find((t) => t.id === id);
    return type ? roomTypeLabel(type, language) : (id ?? '–');
  };

  const [item, setItem] = useState<Item>(() => ({ kind: calibration && pageRooms.length > 0 ? 'place' : 'drawing' }));
  const [ruleStep, setRuleStep] = useState(1);
  const [stepStates, setStepStates] = useState<StepStatus[]>([]);
  const body = useRef<PlacementRuleGuideHandle | null>(null);
  const openRule = item.kind === 'rule' ? (rules.find((r) => r.id === item.id) ?? null) : null;
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  const [previewing, setPreviewing] = useState(false);
  const [placed, setPlaced] = useState<{ count: number; replaced: number } | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  /** Opens an item of the left list. A rule with a box that is not valid stays open (the guide says why). */
  const go = (next: Item, step = 1) => {
    if (openRule && body.current && !body.current.flush()) return;
    if (next.kind === 'rule' && item.kind === 'rule' && next.id === item.id) {
      setRuleStep(step);
      return;
    }
    setItem(next);
    setRuleStep(step);
    setStepStates([]);
    setPlaced(null);
  };
  const requestClose = () => {
    if (stampPickerOpen) return;
    if (openRule && body.current && !body.current.flush()) return;
    onClose();
  };
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const saveRule = useCallback(
    (next: PlacementRule) => {
      const list = rulesRef.current;
      onChangeRules(list.some((r) => r.id === next.id) ? list.map((r) => (r.id === next.id ? next : r)) : [...list, next]);
    },
    [onChangeRules],
  );

  // The left list: a dry run of every rule (no stamp positions), fast enough for each change of a rule.
  const dryRows = useMemo(() => (scene ? calculateRooms(rules, scopeRooms, valuesOf).rows : []), [scene, rules, scopeRooms, valuesOf]);
  const ruleStatus = useMemo(
    () => new Map(rules.map((rule) => [rule.id, ruleStatusOf(rule, dryRows.filter((row) => row.rule.id === rule.id), (id) => stampDefinition(id) !== undefined)])),
    [rules, dryRows, stampDefinition],
  );
  const checkedRules = useMemo(() => rules.filter((r) => !unchecked.has(r.id)), [rules, unchecked]);

  // Place all: the plan of the checked rules in a Web Worker. It does not run while a rule is open.
  const [art, setArt] = useState<ReadonlyMap<string, AutoPlaceArt>>(() => new Map());
  const [artErrors, setArtErrors] = useState<ReadonlySet<string>>(() => new Set());
  const realSizeOf = useCallback(
    (id: string) => {
      const definition = stampDefinition(id);
      if (!definition || artErrors.has(id)) return null;
      const scale = stampScale(id);
      return { width: definition.nativeWidth * scale, height: definition.nativeHeight * scale };
    },
    [stampDefinition, stampScale, artErrors],
  );
  const placeInput = useMemo((): PlacementPlanInput | null => {
    if (!scene || item.kind === 'rule' || checkedRules.length === 0 || scopeRooms.length === 0) return null;
    const ids = [...new Set(checkedRules.flatMap((r) => (r.stampDefinitionId ? [r.stampDefinitionId] : [])))];
    return {
      rules: checkedRules,
      rooms: [...scopeRooms],
      values: scopeRooms.map((room) => [room.id, valuesOf(room)]),
      calibrations: [[pageIndex, calibration]],
      sizes: ids.map((id) => [id, realSizeOf(id)]),
      existing: { stamps: scene.listAutoPlacedStamps(), roomIds: scene.listRooms().map((r) => r.id) },
    };
    // version: the auto-placed stamps change with Place, Undo and Remove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, item.kind, checkedRules, scopeRooms, valuesOf, pageIndex, calibration, realSizeOf, version]);
  const placeJob = usePlacementPlan(createPlacementWorker, placeInput);
  // Place, Preview and Remove use only the plan of the current input; the table shows the last plan while the next one comes.
  const plan = placeJob.fresh ? placeJob.plan : null;
  const shown = placeInput ? placeJob.plan : null;
  const shownRows = useMemo(() => (shown?.rows ?? []).filter((row) => !unchecked.has(row.rule.id)), [shown, unchecked]);
  const rowsByRule = useMemo(() => {
    const map = new Map<string, PlacementRow[]>();
    for (const row of shownRows) map.set(row.rule.id, [...(map.get(row.rule.id) ?? []), row]);
    return map;
  }, [shownRows]);
  const rowsByRoom = useMemo(() => {
    const map = new Map<string, PlacementRow[]>();
    for (const row of shownRows) map.set(row.room.id, [...(map.get(row.room.id) ?? []), row]);
    return map;
  }, [shownRows]);

  const neededIds = useMemo(() => [...new Set((plan?.rows ?? []).filter((r) => r.stamps.length > 0).map((r) => r.rule.stampDefinitionId!))], [plan]);
  useEffect(() => {
    const missing = neededIds.filter((id) => !art.has(id) && !artErrors.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async (id) => [id, await loadStampArt(id).catch(() => null)] as const)).then((loaded) => {
      if (cancelled) return;
      setArt((prev) => new Map([...prev, ...loaded.flatMap(([id, a]) => (a ? [[id, a] as const] : []))]));
      const failed = loaded.filter(([, a]) => !a).map(([id]) => id);
      if (failed.length > 0) setArtErrors((prev) => new Set([...prev, ...failed]));
    });
    return () => {
      cancelled = true;
    };
  }, [neededIds, art, artErrors, loadStampArt]);

  const artReady = neededIds.every((id) => art.has(id));
  const groups = useMemo(() => (plan && artReady ? groupsOf(plan.rows, art) : []), [plan, art, artReady]);
  const total = (plan?.rows ?? []).reduce((sum, r) => sum + r.stamps.length, 0);
  const replaceIds = useMemo(() => (plan ? [...plan.rows.flatMap(replaceIdsOf), ...plan.stale.flatMap((e) => e.replace)] : []), [plan]);
  const removeIds = useMemo(() => (plan ? autoPlacedStampIds(plan.rows, plan.stale) : []), [plan]);
  const staleCount = (plan?.stale ?? []).reduce((sum, e) => sum + e.keep.length + e.replace.length, 0);

  useEffect(() => {
    if (!scene) return;
    if (previewing) scene.showAutoPlacePreview(groups, replaceIds);
    else scene.clearAutoPlacePreview();
  }, [scene, previewing, groups, replaceIds]);
  useEffect(() => () => sceneRef.current?.clearAutoPlacePreview(), [sceneRef]);

  useEffect(() => {
    if (!previewing) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setPreviewing(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewing]);

  const layers = useMemo(
    (): PreviewStampLayer[] =>
      [...rowsByRule].flatMap(([, rows]) => {
        const id = rows[0]!.rule.stampDefinitionId;
        const stamps = rows.flatMap((row) => row.stamps);
        if (!id || stamps.length === 0) return [];
        return [{ stamps, sizePt: realSizeOf(id) ?? { width: 0, height: 0 }, iconUrl: stampIconUrl(id) }];
      }),
    [rowsByRule, realSizeOf, stampIconUrl],
  );

  if (!scene) return null;

  const canPlace = !!plan && artReady && (total > 0 || replaceIds.length > 0);
  const place = () => {
    if (!canPlace) return;
    const ids = scene.autoPlaceStamps(groups, replaceIds);
    setPreviewing(false);
    setPlaced({ count: ids.length, replaced: replaceIds.length });
    setVersion((v) => v + 1);
    onPlaced(ids.length, replaceIds.length);
  };
  const undoPlace = () => {
    scene.undoDrawing();
    setPlaced(null);
    setVersion((v) => v + 1);
  };
  const remove = () => {
    if (removeIds.length === 0) return;
    setPreviewing(false);
    onRemoved(scene.removeAutoPlacedStamps(removeIds));
    setVersion((v) => v + 1);
  };
  const placeLabel = placeJob.busy ? 'Calculating…' : !artReady ? 'Loading stamps…' : `Place ${plural(total, 'stamp')}${replaceIds.length > 0 ? ` (replace ${replaceIds.length})` : ''}`;

  if (previewing) {
    return (
      <div className="mep-autoplace-bar" role="toolbar" aria-label="Auto-place preview">
        <span>
          Preview: {plural(total, 'stamp')} in {plural(new Set((plan?.rows ?? []).filter((r) => r.stamps.length > 0).map((r) => r.room.id)).size, 'room')}
          {replaceIds.length > 0 && `, ${replaceIds.length} placed stamp${replaceIds.length === 1 ? '' : 's'} replaced (hidden)`}.
        </span>
        <button type="button" disabled={!canPlace} onClick={place}>
          {placeLabel}
        </button>
        <button type="button" onClick={() => setPreviewing(false)}>
          Back to the dialog
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    );
  }

  const untyped = pageRooms.filter((r) => r.roomTypeId === undefined);
  const drawingMm = heights ? (heights.pdfMm ?? heights.globalMm) : null;
  const typeHeights = heights ? Object.keys(heights.roomTypeMm).length : 0;
  const inputStatus: Record<InputKind, StepStatus> = {
    drawing: !calibration ? ['bad', 'This page has no scale'] : pageRooms.length === 0 ? ['bad', 'No rooms on this page'] : ['ok', `${plural(pageRooms.length, 'room')} on page ${pageIndex + 1}`],
    types: pageRooms.length === 0 ? ['', 'No rooms yet'] : untyped.length > 0 ? ['warn', `${plural(untyped.length, 'room')} without a type`] : ['ok', 'Each room has a type'],
    heights: ['ok', `${drawingMm ?? '–'} mm${heights?.pdfMm === undefined ? ' (default)' : ''}${typeHeights > 0 ? ` · ${plural(typeHeights, 'type')} own height` : ''}`],
  };
  const blocked: { text: string; short: string; fix: InputKind | null } | null = !calibration
    ? { text: 'Set the scale of this page first.', short: 'Set the scale first', fix: 'drawing' }
    : pageRooms.length === 0
      ? { text: 'Detect the rooms of this page first.', short: 'Detect the rooms first', fix: 'drawing' }
      : rules.length === 0
        ? { text: 'There are no placement rules. Add one in Placement rules.', short: 'Add a rule first', fix: null }
        : checkedRules.length === 0
          ? { text: 'Check at least one rule in the list.', short: 'Check at least one rule', fix: null }
          : scopeRooms.length === 0
            ? { text: 'No room is selected. Choose Rooms on this page.', short: 'No room selected', fix: null }
            : null;
  const placingRules = [...rowsByRule.values()].filter((rows) => rows.some((row) => row.stamps.length > 0)).length;
  const placeSub = blocked ? blocked.short : plan ? `${plural(total, 'stamp')} from ${plural(placingRules, 'rule')}` : placeJob.busy ? 'Calculating…' : '';

  const inputItem = (kind: InputKind) => {
    const [state, sub] = inputStatus[kind];
    return (
      <button key={kind} type="button" className={`mep-guide-step ${state}${item.kind === kind ? ' on' : ''}`} data-item={kind} onClick={() => go({ kind })}>
        <span className="n">{ICON[state]}</span>
        <span className="t">{INPUT_TITLES[kind]}</span>
        <span className="s">{sub}</span>
      </button>
    );
  };

  const nav = (
    <nav className="mep-autoplace-nav" aria-label="Auto-place" data-testid="ap-nav">
      <h4>Input data</h4>
      {(['drawing', 'types', 'heights'] as const).map(inputItem)}
      <h4>Placement rules</h4>
      <p className="mep-guide-note">{rules.length === 0 ? 'No rules yet. Add one in Placement rules.' : 'A check puts the rule in Place all.'}</p>
      {rules.map((rule) => {
        const [state, sub] = ruleStatus.get(rule.id) ?? ['', ''];
        const on = !unchecked.has(rule.id);
        const open = openRule?.id === rule.id;
        return (
          <div key={rule.id} className="mep-autoplace-rule">
            <input
              type="checkbox"
              aria-label={`Use ${rule.name} in Place all`}
              data-check={rule.id}
              checked={on}
              onChange={(e) => {
                const next = new Set(unchecked);
                if (e.target.checked) next.delete(rule.id);
                else next.add(rule.id);
                setUnchecked(next);
                setPlaced(null);
              }}
            />
            <button type="button" className={`mep-guide-step ${on ? state : ''}${open ? ' on' : ''}`} data-rule={rule.id} aria-expanded={open} onClick={() => go({ kind: 'rule', id: rule.id })}>
              <span className="n">{ICON[state]}</span>
              <span className="t">{rule.name}</span>
              <span className="s">{sub}</span>
            </button>
            {open && (
              <div className="mep-autoplace-substeps">
                <PlacementGuideSteps step={ruleStep} states={stepStates} onStepChange={setRuleStep} />
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className={`mep-guide-step mep-autoplace-placeall${item.kind === 'place' ? ' on' : ''}`} data-item="place" onClick={() => go({ kind: 'place' })}>
        <span className="n">▶</span>
        <span className="t">Place all</span>
        <span className="s">{placeSub}</span>
      </button>
    </nav>
  );

  const cardNav = (back: Item | null, next: Item, nextTitle: string) => (
    <div className="mep-guide-nav">
      <button type="button" disabled={!back} onClick={() => back && go(back)}>
        Back
      </button>
      <button type="button" className="primary" onClick={() => go(next)}>
        Next: {nextTitle}
      </button>
    </div>
  );

  function drawingCard() {
    return (
      <>
        <h2>Drawing and rooms</h2>
        <p className="mep-guide-lead">MepApp needs the scale of the page and the rooms on it. The scale gives the floor area. The rooms come from the room names in the drawing.</p>
        <div className="mep-guide-checks">
          <Check state={calibration ? 'ok' : 'bad'} title={calibration ? `Page ${pageIndex + 1} has a scale` : `Page ${pageIndex + 1} has no scale`} sub="Set the scale with the scale box in the header, or calibrate the drawing." />
          <Check state={pageRooms.length > 0 ? 'ok' : 'bad'} title={pageRooms.length > 0 ? `${plural(pageRooms.length, 'room')} on page ${pageIndex + 1}` : `No rooms on page ${pageIndex + 1}`} sub="Menu › Detect rooms finds the rooms. It needs the scale." />
        </div>
        <p className="mep-guide-note">MepApp places stamps only on the page that the drawing shows now. Go to another page to place stamps there.</p>
        {cardNav(null, { kind: 'types' }, 'Room types')}
      </>
    );
  }

  function typesCard() {
    return (
      <>
        <h2>Room types</h2>
        <p className="mep-guide-lead">A rule finds its rooms by the room type. MepApp finds the type from the room name in the drawing.</p>
        <div className="mep-guide-checks">
          <Check state={inputStatus.types[0]} title={inputStatus.types[1]} sub="Change the room types in Menu › Room types…, or the type of one room in Room Properties." />
        </div>
        {untyped.length > 0 && (
          <div className="mep-guide-chips" data-testid="ap-untyped">
            {untyped.map((room) => (
              <button key={room.id} type="button" className={`mep-guide-chip plain${pickedId === room.id ? ' sel' : ''}`} onClick={() => setPickedId(room.id)}>
                {roomLabel(room)}
              </button>
            ))}
          </div>
        )}
        {cardNav({ kind: 'drawing' }, { kind: 'heights' }, 'Ceiling heights')}
      </>
    );
  }

  function heightsCard() {
    const own = pageRooms.filter((r) => r.ceilingHeightMm !== undefined);
    const typeRows = Object.entries(heights?.roomTypeMm ?? {});
    return (
      <>
        <h2>Ceiling heights</h2>
        <p className="mep-guide-lead">The ceiling height gives the volume of a room. An empty value uses the level above it.</p>
        <dl className="mep-autoplace-levels" data-testid="ap-heights">
          <div>
            <dt>1 All drawings (Settings)</dt>
            <dd>{heights ? `${heights.globalMm} mm` : '–'}</dd>
          </div>
          <div>
            <dt>2 This drawing</dt>
            <dd>{heights?.pdfMm !== undefined ? `${heights.pdfMm} mm` : 'uses level 1'}</dd>
          </div>
          <div>
            <dt>3 Room types in this drawing</dt>
            <dd>{typeRows.length === 0 ? 'uses level 2' : typeRows.map(([id, mm]) => `${typeName(id)} ${mm} mm`).join(', ')}</dd>
          </div>
          <div>
            <dt>4 One room</dt>
            <dd>{own.length === 0 ? 'no room with an own height' : own.map((r) => `${roomLabel(r)} ${r.ceilingHeightMm} mm`).join(', ')}</dd>
          </div>
        </dl>
        <p className="mep-guide-note">Change levels 2 and 3 in Menu › Ceiling heights…, and level 4 in Room Properties.</p>
        {cardNav({ kind: 'types' }, { kind: 'place' }, 'Place all')}
      </>
    );
  }

  function placeCard() {
    const noStamp = checkedRules.filter((r) => !r.stampDefinitionId);
    const scopeUntyped = scopeRooms.filter((r) => r.roomTypeId === undefined).length;
    return (
      <>
        <h2>Place all</h2>
        <p className="mep-guide-lead">Each checked rule places its stamps in the rooms that match. Place adds all stamps as one undo step. When you place again, MepApp replaces the auto-placed stamps that you did not move.</p>
        {blocked ? (
          <div className="mep-guide-callout bad" data-testid="ap-blocked">
            <span>{blocked.text}</span>
            {blocked.fix && (
              <button type="button" onClick={() => go({ kind: blocked.fix! })}>
                Open {INPUT_TITLES[blocked.fix]}
              </button>
            )}
          </div>
        ) : null}
        <div className="mep-guide-field">
          <label htmlFor="ap-scope">Rooms</label>
          <select id="ap-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="page">Rooms on this page ({pageRooms.length})</option>
            <option value="selected" disabled={selectedRooms.length === 0}>
              Selected rooms ({selectedRooms.length})
            </option>
          </select>
        </div>
        {checkedRules.length > 0 && (
          <div className={`mep-room-calc-scroll mep-guide-table${placeJob.busy ? ' busy' : ''}`}>
            <table className="mep-room-calc-table" data-testid="ap-rule-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Rooms</th>
                  <th>Stamps</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {checkedRules.map((rule) => {
                  const rows = rowsByRule.get(rule.id) ?? [];
                  const [state, text] = shown ? placeStateOf(rule, rows) : ['', 'Calculating…'];
                  return (
                    <tr key={rule.id} className={state === 'bad' ? 'err' : state === 'warn' ? 'bad' : ''} data-rule={rule.id} data-state={state} tabIndex={0} title="Open the rule at step 6" onClick={() => go({ kind: 'rule', id: rule.id }, 6)} onKeyDown={pickKeys(() => go({ kind: 'rule', id: rule.id }, 6))}>
                      <td>{rule.name}</td>
                      <td className="num">{shown ? rows.length : '–'}</td>
                      <td className="num" data-testid="stamps">
                        {shown ? rows.reduce((n, row) => n + row.stamps.length, 0) : '–'}
                      </td>
                      <td>{text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {noStamp.length > 0 && (
          <div className="mep-guide-callout bad" data-testid="ap-no-stamp">
            <span>
              {plural(noStamp.length, 'rule')} without a stamp: Place all skips {noStamp.length === 1 ? 'it' : 'them'}.
            </span>
            <button type="button" onClick={() => go({ kind: 'rule', id: noStamp[0]!.id }, 1)}>
              Choose a stamp
            </button>
          </div>
        )}
        {scopeUntyped > 0 && (
          <div className="mep-guide-callout" data-testid="ap-untyped-note">
            <span>
              {plural(scopeUntyped, 'room')} without a type: a rule with room types does not find {scopeUntyped === 1 ? 'it' : 'them'}.
            </span>
            <button type="button" onClick={() => go({ kind: 'types' })}>
              Room types
            </button>
          </div>
        )}
        {placed ? (
          <div className="mep-guide-status" role="status" data-testid="ap-placed">
            <span>
              MepApp placed {plural(placed.count, 'stamp')}
              {placed.replaced > 0 ? ` and removed ${plural(placed.replaced, 'earlier auto-placed stamp')}` : ''}. One Undo removes all of them.
            </span>
            <button type="button" id="ap-undo" onClick={undoPlace}>
              Undo
            </button>
          </div>
        ) : (
          <div className="mep-guide-inline mep-guide-placebar">
            <button type="button" id="ap-place" className="primary" disabled={!canPlace} onClick={place}>
              {placeLabel}
            </button>
            <button type="button" id="ap-preview" disabled={!canPlace} onClick={() => setPreviewing(true)}>
              Preview on the drawing
            </button>
            <button type="button" id="ap-remove" disabled={removeIds.length === 0} onClick={remove}>
              Remove {plural(removeIds.length, 'auto-placed stamp')}
            </button>
          </div>
        )}
        {(staleCount > 0 || artErrors.size > 0 || placeJob.error) && (
          <p className="mep-guide-note" role="status">
            {placeJob.error && `MepApp cannot calculate the stamps: ${placeJob.error}. `}
            {staleCount > 0 && `${plural(staleCount, 'auto-placed stamp')} of a rule that no longer applies to the room: Place removes the ones that you did not move, Remove removes all. `}
            {artErrors.size > 0 && `MepApp cannot load the stamp of ${plural(artErrors.size, 'rule')}.`}
          </p>
        )}
        {shownRows.length > 0 && (
          <details className="mep-guide-section" data-testid="ap-room-rows">
            <summary>Rows per room ({shownRows.length})</summary>
            <div className="mep-room-calc-scroll mep-guide-table">
              <table className="mep-room-calc-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Type</th>
                    <th>Area (m²)</th>
                    <th>Volume (m³)</th>
                    <th>People</th>
                    <th>Rule</th>
                    <th>Required</th>
                    <th>Capacity</th>
                    <th>Count</th>
                    <th>Existing</th>
                    <th>Placed</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row) => (
                    <tr key={`${row.room.id}:${row.rule.id}`} className={row.room.id === pickedId ? 'sel' : ''} data-room={row.room.id} data-rule={row.rule.id} onClick={() => setPickedId(row.room.id)}>
                      <td>{roomLabel(row.room)}</td>
                      <td>{typeName(row.room.roomTypeId)}</td>
                      <td className="num">{fmt(row.values.areaM2)}</td>
                      <td className="num">{fmt(row.values.volumeM3)}</td>
                      <td className="num">{row.values.people ? row.values.people.count : '–'}</td>
                      <td>{row.rule.name}</td>
                      <td className="num">{row.requirement.required === null ? '–' : `${fmt(row.requirement.required)} ${row.rule.amount.unit}`.trim()}</td>
                      <td className="num">{row.rule.capacityPerElement === undefined ? '–' : fmt(row.rule.capacityPerElement)}</td>
                      <td className="num" data-testid="count" title={COUNT_SOURCE_TEXT[row.requirement.countSource]}>
                        {row.requirement.count ?? '–'}
                      </td>
                      <td className="num" data-testid="existing" title="Auto-placed stamps of this rule in this room: moved (kept) + not moved (replaced)">
                        {row.existing.keep.length + row.existing.replace.length}
                        {row.existing.keep.length > 0 && ` (${row.existing.keep.length} moved)`}
                      </td>
                      <td className="num" data-testid="placed">
                        {row.stamps.length}
                      </td>
                      <td>{notesOf(row, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </>
    );
  }

  const placeRoomState = (room: Room): PreviewRoomState => {
    const rows = rowsByRoom.get(room.id) ?? [];
    if (rows.some((row) => spacingProblem(row) || coverageProblem(row) || tooManyStamps(row))) return 'problem';
    if (rows.some(missingData)) return 'missing';
    if (rows.length > 0) return 'match';
    return room.roomTypeId === undefined ? 'noType' : 'noMatch';
  };
  const inputRoomState = (room: Room): PreviewRoomState => (room.roomTypeId === undefined ? 'noType' : 'noMatch');
  const placeShown = item.kind === 'place';
  const picked = pageRooms.find((r) => r.id === pickedId) ?? null;

  return (
    <Dialog
      title="Auto-place stamps"
      className="mep-modal--placement-guide mep-modal--auto-place"
      onClose={requestClose}
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              if (openRule && body.current && !body.current.flush()) return;
              onOpenRules();
            }}
          >
            Placement rules…
          </button>
          <button type="button" onClick={requestClose}>
            Close
          </button>
        </>
      }
    >
      <div className="mep-guide">
        {nav}
        {openRule ? (
          <PlacementRuleGuideBody
            key={openRule.id}
            ref={body}
            rule={openRule}
            others={rules.filter((r) => r.id !== openRule.id)}
            roomTypes={roomTypes}
            language={language}
            sceneRef={sceneRef}
            stampName={stampName}
            stampDefinition={stampDefinition}
            stampScale={stampScale}
            stampIconUrl={stampIconUrl}
            onChooseStamp={onChooseStamp}
            onChangeRoomTypes={onChangeRoomTypes}
            loadStampArt={loadStampArt}
            createPlacementWorker={createPlacementWorker}
            onPlaced={(count, replaced) => {
              setVersion((v) => v + 1);
              onPlaced(count, replaced);
            }}
            onSave={saveRule}
            step={ruleStep}
            onStepChange={setRuleStep}
            onStepStates={setStepStates}
          />
        ) : (
          <>
            <section className="mep-guide-card" data-testid="ap-card" data-item={item.kind}>
              {item.kind === 'drawing' ? drawingCard() : item.kind === 'types' ? typesCard() : item.kind === 'heights' ? heightsCard() : placeCard()}
            </section>
            <aside className="mep-guide-side">
              <div className="mep-guide-panel">
                <div className="mep-guide-panel-head">
                  <span className="pt">Whole floor</span>
                  {placeShown && placeJob.busy && (
                    <span className="mep-guide-busy" role="status" data-testid="ap-busy">
                      Calculating…
                    </span>
                  )}
                </div>
                <RulePreviewPlan
                  mode="floor"
                  busy={placeShown && placeJob.busy}
                  rooms={pageRooms}
                  sample={picked}
                  calibration={calibration}
                  roomState={placeShown ? placeRoomState : inputRoomState}
                  stamps={[]}
                  stampSizePt={{ width: 0, height: 0 }}
                  stampIconUrl={null}
                  wallOffsetM={0}
                  coverageRadiusM={null}
                  stampLayers={placeShown ? layers : []}
                  onPickRoom={setPickedId}
                />
                <div className="mep-guide-legend">
                  {placeShown && (
                    <>
                      <span style={{ ['--sw' as string]: 'var(--accent-soft)' }}>a checked rule applies</span>
                      <span style={{ ['--sw' as string]: 'var(--surface)' }}>no checked rule applies</span>
                      <span style={{ ['--sw' as string]: 'var(--guide-warn-soft)' }}>missing data</span>
                      <span style={{ ['--sw' as string]: 'var(--guide-bad-soft)' }}>stamps do not fit, or not covered</span>
                    </>
                  )}
                  <span className="hatch">no room type</span>
                  <span className="plain">click a room to mark it</span>
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </Dialog>
  );
}
