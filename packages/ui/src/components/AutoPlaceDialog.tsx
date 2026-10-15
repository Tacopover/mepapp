import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import {
  allNeeds,
  autoPlacedStampIds,
  calculateRooms,
  calibrationFromScale,
  MAX_ROOM_STAMPS,
  moveOldRuleNumbers,
  parsePlacementRules,
  resolveCeilingHeight,
  roomTypeLabel,
  ruleUnitOf,
  type PlacementPlanInput,
  type PlacementRow,
  type PlacementRule,
  type PlacementWorkerLike,
  type Room,
  type RoomNeed,
  type RoomType,
  type StampDefinition,
} from '@mepapp/core';
import { coverageProblem, groupsOf, keptWithOtherTarget, missingData, notesOf, replaceIdsOf, spacingProblem, tooManyStamps, usePlacementPlan, zeroNeed, type AutoPlaceArt } from './autoPlacePlan.js';
import { CeilingHeightsCard, DrawingCard, LEVEL_FILLS, LEVEL_NAMES, RoomTypesCard, TYPE_FILLS, typeFillOf } from './AutoPlaceInputCards.js';
import { examplePlacementRules, RULE_MOVE_FAILED } from '../placementRuleStorage.js';
import { Dialog } from './Dialog.js';
import { InfoTip } from './InfoTip.js';
import { PlacementGuideSteps, PlacementRuleGuideBody, type PlacementRuleGuideHandle, type StepState, type StepStatus } from './PlacementRuleGuide.js';
import { blankRule, newRuleId, uniqueName } from './placementRuleDraft.js';
import { RulePreviewPlan, type PreviewRoomState, type PreviewStampLayer } from './RulePreviewPlan.js';

export interface AutoPlaceDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  /** The user library of placement rules. */
  rules: PlacementRule[];
  roomTypes: RoomType[];
  /** The own needs of the user library (room-type-calculations.md §3.1). */
  roomNeeds: RoomNeed[];
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
  /** Saves the rule list as a JSON file. */
  onExportRules: (rules: PlacementRule[]) => void;
  /** The ids of the rules that Place all does not use (the rules without a check). */
  uncheckedRuleIds: readonly string[];
  onChangeUncheckedRuleIds: (ids: string[]) => void;
  /** Saves the room-type library as a JSON file. */
  onExportRoomTypes: (types: RoomType[], needs: RoomNeed[]) => void;
  /** Saves the own needs of the user library. */
  onChangeRoomNeeds: (needs: RoomNeed[]) => void;
  /** The report of the one-time move of the numbers of old rules to the room types; null = none. */
  ruleMoveReport: string[] | null;
  onCloseRuleMoveReport: () => void;
  /** Detects the rooms of the shown page (the handler of Menu › Detect rooms). */
  onDetectRooms: () => void;
  /** True while the room detection runs. */
  roomsDetecting: boolean;
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
  amount: 'From the demand of the room ÷ what one stamp gives, rounded up, then the min and max count',
  perRoom: 'The same number in each room, then the min and max count',
  coverage: 'By coverage: the fewest stamps that cover the room',
  onePerRoom: 'No capacity: one per room, then the min and max count',
};

/** What a rule serves, in a few words: the name of its need, or its way of counting. */
export function servesText(rule: PlacementRule, needs: readonly RoomNeed[]): string {
  if (rule.countBy === 'perRoom') return `${rule.perRoomCount ?? 1} in each room`;
  if (rule.countBy === 'coverage') return 'By coverage';
  return needs.find((n) => n.id === rule.needId)?.name ?? 'A deleted demand type';
}

/** True when the rule counts by a need that is not in the list (an own need was deleted). A rule without room types then has no rows. */
const needDeleted = (rule: PlacementRule, needs: readonly RoomNeed[]) => rule.countBy === 'need' && !needs.some((n) => n.id === rule.needId);

/** The state of a rule in the left list, from the dry run of its rows (no stamp positions). */
function ruleStatusOf(rule: PlacementRule, rows: readonly Pick<PlacementRow, 'requirement'>[], found: (definitionId: string) => boolean, needs: readonly RoomNeed[]): StepStatus {
  if (needDeleted(rule, needs)) return ['bad', 'The demand type was deleted'];
  const serves = servesText(rule, needs);
  if (!rule.stampDefinitionId) return ['bad', `${serves}: no stamp`];
  if (!found(rule.stampDefinitionId)) return ['bad', 'Stamp not found'];
  if (rows.length === 0) return ['warn', 'No room matches'];
  const tooMany = rows.filter((row) => (row.requirement.count ?? 0) > MAX_ROOM_STAMPS).length;
  if (tooMany > 0) return ['bad', `${plural(tooMany, 'room')}: too many stamps`];
  const missing = rows.filter(missingData).length;
  if (missing > 0) return ['warn', `${plural(missing, 'room')}: data missing`];
  const zero = rows.filter(zeroNeed).length;
  if (zero > 0) return ['warn', `${plural(zero, 'room')}: demand 0, no stamp`];
  return ['ok', `${serves}: ${plural(rows.reduce((n, row) => n + (row.requirement.count ?? 0), 0), 'stamp')}`];
}

/** The state of a checked rule in the Place all table, from the rows of the plan. */
function placeStateOf(rule: PlacementRule, rows: readonly PlacementRow[], needs: readonly RoomNeed[]): StepStatus {
  if (needDeleted(rule, needs)) return ['bad', 'Skipped: the demand type was deleted'];
  if (!rule.stampDefinitionId) return ['bad', 'Skipped: no stamp'];
  if (rows.some((row) => row.warnings.includes('stampNotFound'))) return ['bad', 'Skipped: stamp not found'];
  if (rows.length === 0) return ['warn', 'No room matches'];
  const tooMany = rows.filter(tooManyStamps).length;
  if (tooMany > 0) return ['bad', `${plural(tooMany, 'room')} skipped: too many stamps`];
  const missing = rows.filter(missingData).length;
  if (missing > 0) return ['warn', `${plural(missing, 'room')} skipped: data missing`];
  const zero = rows.filter(zeroNeed).length;
  if (zero > 0) return ['warn', `${plural(zero, 'room')}: demand 0, no stamp`];
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

/**
 * Auto-place stamps (auto-place-dialog.md Phases 2 and 3): one dialog in the frame of the placement rule
 * guide. The left list has the input data (each with its editor), the rules (a rule opens into the
 * six guide steps) and Place all. Place all plans the checked rules in a Web Worker, shows the stamps on the floor plan,
 * and places them as one undo step. Only rooms on the shown page get stamps. A re-run replaces the
 * unmoved auto-placed stamps of the same rule and room, and keeps the moved ones. The Rules section
 * also adds, duplicates, deletes, imports and exports rules (Phase 4); the app stores the checks.
 */
export function AutoPlaceDialog({
  sceneRef,
  rules,
  roomTypes,
  roomNeeds,
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
  onExportRules,
  uncheckedRuleIds,
  onChangeUncheckedRuleIds,
  onExportRoomTypes,
  onChangeRoomNeeds,
  ruleMoveReport,
  onCloseRuleMoveReport,
  onDetectRooms,
  roomsDetecting,
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
    scene.on('calibrationSet', bump);
    return () => {
      scene.off('roomsChanged', bump);
      scene.off('pageChanged', bump);
      scene.off('drawingChanged', bump);
      scene.off('calibrationSet', bump);
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
  const needList = useMemo(() => (scene ? scene.getRoomNeeds() : allNeeds(roomNeeds).map((n) => ({ ...n, inLibrary: true }))), [scene, roomNeeds, version]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const needs = useMemo(() => needList.map(({ inLibrary: _inLibrary, ...need }) => need), [needList]);
  const fileOnlyNeeds = useMemo(() => needList.filter((n) => !n.inLibrary).map(({ inLibrary: _inLibrary, ...need }) => need), [needList]);
  /** The unit of the need of a rule, for the tables. */
  const unitOf = (rule: PlacementRule) => {
    const need = rule.countBy === 'need' ? needs.find((n) => n.id === rule.needId) : undefined;
    return need ? ruleUnitOf(rule, need) : '';
  };
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
  const unchecked = useMemo(() => new Set(uncheckedRuleIds), [uncheckedRuleIds]);
  const [previewing, setPreviewing] = useState(false);
  const [placed, setPlaced] = useState<{ count: number; replaced: number } | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  // The room type form has changes that are not saved: the dialog stays on the card.
  const libraryDirty = useRef(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  /** The room type and the need that the Room types card opens at (a link of step 3). A new object opens it again. */
  const [typesFocus, setTypesFocus] = useState<{ typeId: string; needId?: string } | null>(null);
  const [typesTab, setTypesTab] = useState<'rooms' | 'library'>('rooms');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  // Another item or step: the top of its card comes into view. The left list can be long, and on a narrow screen it is above the card.
  const shownKey = item.kind === 'rule' ? `rule:${item.id}:${ruleStep}` : item.kind;
  const shownBefore = useRef(shownKey);
  useEffect(() => {
    if (shownBefore.current === shownKey) return;
    shownBefore.current = shownKey;
    const card = guideRef.current?.querySelector<HTMLElement>('.mep-guide-card');
    const box = card?.closest<HTMLElement>('.mep-modal-body');
    if (!card || !box) return;
    const top = card.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top < 0 || top > box.clientHeight / 2) box.scrollTop += top;
  }, [shownKey]);
  /** False, with a message on the card, while a rule or a room type cannot be left. */
  const canLeave = () => {
    if (openRule && body.current && !body.current.flush()) return false;
    if (libraryDirty.current) {
      setBlockMessage('Save or revert the room type first.');
      return false;
    }
    return true;
  };

  const show = (next: Item, step = 1) => {
    setConfirmDelete(null);
    if (next.kind === 'rule' && item.kind === 'rule' && next.id === item.id) {
      setRuleStep(step);
      return;
    }
    setItem(next);
    setRuleStep(step);
    setStepStates([]);
    setPlaced(null);
    setBlockMessage(null);
    // A link of a rule opens the Room types card once; the left list opens it on its first tab.
    if (next.kind !== 'types') setTypesFocus(null);
  };
  /** Opens an item of the left list. A rule with a box that is not valid stays open (the guide says why). */
  const go = (next: Item, step = 1) => {
    if (canLeave()) show(next, step);
  };
  const requestClose = () => {
    if (stampPickerOpen) return;
    if (!canLeave()) return;
    onClose();
  };
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  /** Saves the list at once; rulesRef holds it until the parent renders the dialog again. */
  const setRules = useCallback(
    (list: PlacementRule[]) => {
      rulesRef.current = list;
      onChangeRules(list);
    },
    [onChangeRules],
  );
  const saveRule = useCallback(
    (next: PlacementRule) => {
      const list = rulesRef.current;
      setRules(list.some((r) => r.id === next.id) ? list.map((r) => (r.id === next.id ? next : r)) : [...list, next]);
    },
    [setRules],
  );
  const setUnchecked = (ids: ReadonlySet<string>) => onChangeUncheckedRuleIds([...ids].filter((id) => rulesRef.current.some((r) => r.id === id)));
  /** Adds rules to the list and opens the first of them at step 1. */
  const addRules = (added: PlacementRule[]) => {
    if (!canLeave() || added.length === 0) return;
    setRules([...rulesRef.current, ...added]);
    setRulesMessage(null);
    show({ kind: 'rule', id: added[0]!.id });
  };
  const newRule = () => addRules([blankRule(uniqueName('New rule', rulesRef.current))]);
  const duplicateRule = (id: string) => {
    if (!canLeave()) return;
    const from = rulesRef.current.find((r) => r.id === id);
    if (from) addRules([{ ...structuredClone(from), id: newRuleId(), name: uniqueName(`${from.name} copy`, rulesRef.current) }]);
  };
  /** Deletes a rule without a save of its boxes: the open rule can have a box that is not valid. */
  const deleteRule = (id: string) => {
    setRules(rulesRef.current.filter((r) => r.id !== id));
    setUnchecked(new Set([...unchecked].filter((u) => u !== id)));
    setRulesMessage(null);
    show({ kind: 'place' });
  };
  const addExamples = () => {
    const examples = examplePlacementRules().map((r) => (rulesRef.current.some((o) => o.id === r.id) ? { ...r, id: newRuleId() } : r));
    if (!canLeave()) return;
    setRules([...rulesRef.current, ...examples]);
    setRulesMessage(`Added ${plural(examples.length, 'example rule')}.`);
  };
  const importFile = async (file: File) => {
    let parsed: ReturnType<typeof parsePlacementRules>;
    try {
      parsed = parsePlacementRules(JSON.parse(await file.text()));
    } catch {
      setRulesMessage(`MepApp cannot read ${file.name}.`);
      return;
    }
    if (!parsed) {
      setRulesMessage(`${file.name} does not hold a list of placement rules.`);
      return;
    }
    if (!canLeave()) return;
    const imported = parsed.rules;
    // Rules of the old shape: their own numbers move to the room types (room-type-calculations.md §4 question 11).
    const moved = parsed.oldNumbers.length > 0 ? moveOldRuleNumbers(roomTypes, roomNeeds, parsed.oldNumbers) : null;
    if (moved) {
      onChangeRoomTypes(moved.types);
      onChangeRoomNeeds(moved.needs);
    }
    const list = rulesRef.current;
    const replaced = list.filter((r) => imported.some((i) => i.id === r.id)).length;
    setRules([...list.map((r) => imported.find((i) => i.id === r.id) ?? r), ...imported.filter((i) => !list.some((r) => r.id === i.id))]);
    setRulesMessage(`Imported ${plural(imported.length, 'rule')} (${replaced} replaced).${moved ? ` The file had rules of the old shape. ${moved.report.join(' ')}` : ''}`);
    // The open rule shows the boxes of the old rule: show Place all when the import replaced it.
    if (item.kind === 'rule' && imported.some((i) => i.id === item.id)) show({ kind: 'place' });
  };

  // The left list: a dry run of every rule (no stamp positions), fast enough for each change of a rule.
  const dryRows = useMemo(() => (scene ? calculateRooms(rules, scopeRooms, valuesOf, needs).rows : []), [scene, rules, scopeRooms, valuesOf, needs]);
  const ruleStatus = useMemo(
    () => new Map(rules.map((rule) => [rule.id, ruleStatusOf(rule, dryRows.filter((row) => row.rule.id === rule.id), (id) => stampDefinition(id) !== undefined, needs)])),
    [rules, dryRows, stampDefinition, needs],
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
      needs,
    };
    // version: the auto-placed stamps change with Place, Undo and Remove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, item.kind, checkedRules, scopeRooms, valuesOf, pageIndex, calibration, realSizeOf, needs, version]);
  const placeJob = usePlacementPlan(createPlacementWorker, placeInput);
  // Place, Preview and Remove use only the plan of the current input; the table shows the last plan while the next one comes.
  const plan = placeJob.fresh ? placeJob.plan : null;
  const shown = placeInput ? placeJob.plan : null;
  const shownRows = useMemo(() => (shown?.rows ?? []).filter((row) => !unchecked.has(row.rule.id)), [shown, unchecked]);
  const autoPlacedById = useMemo(() => new Map((placeInput?.existing?.stamps ?? []).map((s) => [s.id, s])), [placeInput]);
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

  useEffect(() => {
    if (!scene || !calibrating) return;
    const done = () => setCalibrating(false);
    const onTool = (tool: string) => {
      if (tool !== 'calibrate') setCalibrating(false);
    };
    scene.on('calibrationSet', done);
    scene.on('toolChanged', onTool);
    return () => {
      scene.off('calibrationSet', done);
      scene.off('toolChanged', onTool);
    };
  }, [scene, calibrating]);

  if (!scene) return null;

  if (calibrating) {
    return (
      <div className="mep-autoplace-bar" role="toolbar" aria-label="Calibrate">
        <span>Calibrate: click two points on the drawing with a known distance between them.</span>
        <button type="button" onClick={() => scene.setTool('select')}>
          Back to the dialog
        </button>
      </div>
    );
  }

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
    heights: ['ok', `${drawingMm ?? '–'} mm${heights?.pdfMm === undefined ? ' (default)' : ''}${typeHeights > 0 ? ` · ${plural(typeHeights, 'type')} with an own height` : ''}`],
  };
  const blocked: { text: string; short: string; fix: InputKind | null } | null = !calibration
    ? { text: 'Set the scale of this page first.', short: 'Set the scale first', fix: 'drawing' }
    : pageRooms.length === 0
      ? { text: 'Detect the rooms of this page first.', short: 'Detect the rooms first', fix: 'drawing' }
      : rules.length === 0
        ? { text: 'There are no placement rules.', short: 'Add a rule first', fix: null }
        : checkedRules.length === 0
          ? { text: 'Check at least one rule in the list.', short: 'Check at least one rule', fix: null }
          : scopeRooms.length === 0
            ? { text: 'No room is selected. Choose Rooms on this page.', short: 'No room selected', fix: null }
            : null;
  const placingRules = [...rowsByRule.values()].filter((rows) => rows.some((row) => row.stamps.length > 0)).length;
  const placeSub = blocked
    ? blocked.short
    : checkedRules.every((r) => !r.stampDefinitionId)
      ? 'Choose a stamp first'
      : plan
        ? `${plural(total, 'stamp')} from ${plural(placingRules, 'rule')}`
        : placeJob.busy
          ? 'Calculating…'
          : '';

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
      <section className="mep-autoplace-group" data-testid="ap-group-input">
        <h4>
          <span className="gn">1</span>Input data
        </h4>
        {(['drawing', 'types', 'heights'] as const).map(inputItem)}
      </section>
      <section className="mep-autoplace-group" data-testid="ap-group-rules">
        <h4 className="mep-autoplace-rules-head">
          <span className="gn">2</span>Placement rules
          <button type="button" data-act="new-rule" title="Add a new rule and open it at step 1" onClick={newRule}>
            + New
          </button>
        </h4>
        <p className="mep-guide-note">{rules.length === 0 ? 'No rules yet.' : 'A check puts the rule in Place all.'}</p>
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
                  <div className="mep-autoplace-rule-actions" data-testid="ap-rule-actions">
                    {confirmDelete === rule.id ? (
                      <>
                        <span>Delete this rule?</span>
                        <button type="button" data-act="delete-yes" onClick={() => deleteRule(rule.id)}>
                          Delete
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" data-act="duplicate" onClick={() => duplicateRule(rule.id)}>
                          Duplicate
                        </button>
                        <button type="button" data-act="delete" onClick={() => setConfirmDelete(rule.id)}>
                          Delete…
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="mep-autoplace-rule-tools">
          <button type="button" data-act="import-rules" onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <button type="button" data-act="export-rules" disabled={rules.length === 0} onClick={() => onExportRules(rulesRef.current)}>
            Export…
          </button>
        </div>
        {rulesMessage && (
          <p className="mep-guide-note" role="status" data-testid="ap-rules-message">
            {rulesMessage}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          data-testid="ap-rules-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </section>
      <section className="mep-autoplace-group mep-autoplace-group--place" data-testid="ap-group-place">
        <h4>
          <span className="gn">3</span>Place
        </h4>
        <button type="button" className={`mep-guide-step mep-autoplace-placeall${item.kind === 'place' ? ' on' : ''}`} data-item="place" onClick={() => go({ kind: 'place' })}>
          <span className="n">▶</span>
          <span className="t">Place all</span>
          <span className="s">{placeSub}</span>
        </button>
      </section>
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

  const fileOnlyTypes = types.filter((t) => !t.inLibrary).map(({ inLibrary: _inLibrary, ...type }) => type);
  // A rule uses the volume when one of its room types has air changes for its need.
  const volumeRules = checkedRules.filter((r) => r.countBy === 'need' && r.needId !== undefined && types.some((t) => (r.roomTypeIds.length === 0 || r.roomTypeIds.includes(t.id)) && t.demands?.[r.needId!]?.terms.some((term) => term.basis === 'volume'))).length;
  function inputCard(kind: InputKind) {
    if (kind === 'drawing')
      return (
        <DrawingCard
          pageIndex={pageIndex}
          calibration={calibration}
          roomCount={pageRooms.length}
          detecting={roomsDetecting}
          onSetScale={(denominator) => scene!.setCalibration(calibrationFromScale(denominator))}
          onCalibrate={() => {
            setCalibrating(true);
            scene!.setTool('calibrate');
          }}
          onDetectRooms={onDetectRooms}
          footer={cardNav(null, { kind: 'types' }, 'Room types')}
        />
      );
    if (kind === 'types')
      return (
        <RoomTypesCard
          sceneRef={sceneRef}
          pageRooms={pageRooms}
          types={types}
          language={language}
          library={roomTypes}
          fileOnlyTypes={fileOnlyTypes}
          needs={roomNeeds}
          fileOnlyNeeds={fileOnlyNeeds}
          onChangeLibrary={onChangeRoomTypes}
          onChangeNeeds={onChangeRoomNeeds}
          onExportLibrary={onExportRoomTypes}
          onLibraryDirtyChange={(dirty) => {
            libraryDirty.current = dirty;
            if (!dirty) setBlockMessage(null);
          }}
          pickedId={pickedId}
          onPick={setPickedId}
          focus={typesFocus}
          onTabChange={setTypesTab}
          footer={cardNav({ kind: 'drawing' }, { kind: 'heights' }, 'Ceiling heights')}
        />
      );
    return (
      <CeilingHeightsCard
        sceneRef={sceneRef}
        heights={heights}
        pageRooms={pageRooms}
        types={types}
        language={language}
        volumeRules={volumeRules}
        pickedId={pickedId}
        onPick={setPickedId}
        footer={cardNav({ kind: 'types' }, { kind: 'place' }, 'Place all')}
      />
    );
  }

  function placeCard() {
    const noStamp = checkedRules.filter((r) => !r.stampDefinitionId);
    // Two or more checked rules that serve the same need in the same room (room-type-calculations.md §4 question 6).
    const byRoomNeed = new Map<string, Set<string>>();
    for (const row of shownRows) {
      if (row.rule.countBy !== 'need' || !row.rule.needId || row.requirement.count === null) continue;
      const key = `${row.rule.needId}\n${row.room.id}`;
      byRoomNeed.set(key, (byRoomNeed.get(key) ?? new Set()).add(row.rule.id));
    }
    const sameNeedMap = new Map<string, { rules: Set<string>; rooms: number }>();
    for (const [key, ids] of byRoomNeed) {
      if (ids.size < 2) continue;
      const needId = key.split('\n')[0]!;
      const entry = sameNeedMap.get(needId) ?? { rules: new Set<string>(), rooms: 0 };
      for (const id of ids) entry.rules.add(id);
      entry.rooms++;
      sameNeedMap.set(needId, entry);
    }
    const sameNeed = [...sameNeedMap].map(([needId, entry]) => ({
      need: needs.find((n) => n.id === needId)?.name ?? needId,
      rules: [...entry.rules].map((id) => rules.find((r) => r.id === id)?.name ?? id),
      rooms: entry.rooms,
    }));
    const scopeUntyped = scopeRooms.filter((r) => r.roomTypeId === undefined).length;
    const zeroShown = shownRows.filter(zeroNeed);
    const zeroRooms = new Set(zeroShown.map((row) => row.room.id)).size;
    const zeroRules = checkedRules.filter((rule) => zeroShown.some((row) => row.rule.id === rule.id));
    return (
      <>
        <h2>Place all</h2>
        <p className="mep-guide-lead">
          Place adds the stamps of all checked rules as one undo step.
          <InfoTip label="More about Place all">Each checked rule places its stamps in the rooms that match. When you place again, MepApp replaces the auto-placed stamps that you did not move. It keeps the stamps that you moved.</InfoTip>
        </p>
        {blocked ? (
          <div className="mep-guide-callout bad" data-testid="ap-blocked">
            <span>{blocked.text}</span>
            {blocked.fix && (
              <button type="button" onClick={() => go({ kind: blocked.fix! })}>
                Open {INPUT_TITLES[blocked.fix]}
              </button>
            )}
            {rules.length === 0 && blocked.fix === null && (
              <div className="mep-guide-inline">
                <button type="button" data-act="examples" onClick={addExamples}>
                  Add the example rules
                </button>
                <button type="button" onClick={newRule}>
                  + New rule
                </button>
                <button type="button" onClick={() => fileInput.current?.click()}>
                  Import…
                </button>
              </div>
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
                  <th>Serves</th>
                  <th>Rooms</th>
                  <th>Stamps</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {checkedRules.map((rule) => {
                  const rows = rowsByRule.get(rule.id) ?? [];
                  const [state, text] = shown ? placeStateOf(rule, rows, needs) : ['', 'Calculating…'];
                  return (
                    <tr key={rule.id} className={state === 'bad' ? 'err' : state === 'warn' ? 'bad' : ''} data-rule={rule.id} data-state={state} tabIndex={0} title="Open the rule at step 6" onClick={() => go({ kind: 'rule', id: rule.id }, 6)} onKeyDown={pickKeys(() => go({ kind: 'rule', id: rule.id }, 6))}>
                      <td>{rule.name}</td>
                      <td>{servesText(rule, needs)}</td>
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
        {sameNeed.length > 0 && (
          <div className="mep-guide-callout" data-testid="ap-same-need">
            <span>
              {sameNeed.map(({ need, rules: names, rooms }) => `${need}: ${names.join(' and ')} serve it in ${plural(rooms, 'room')}.`).join(' ')} Each rule places stamps for the full demand. Uncheck a rule, or give the rules other room types.
            </span>
          </div>
        )}
        {zeroRules.length > 0 && (
          <div className="mep-guide-callout" data-testid="ap-zero-need">
            <span>
              {plural(zeroRooms, 'room')} {zeroRooms === 1 ? 'gets' : 'get'} no stamp from {zeroRules.map((r) => r.name).join(', ')}, because the demand of the room is 0. For example, a small room gets 0 persons. Step 3 of the rule lists the rooms.
            </span>
            <button type="button" onClick={() => go({ kind: 'rule', id: zeroRules[0]!.id }, 3)}>
              Show the rooms
            </button>
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
              {plural(scopeUntyped, 'room')} without a type: a rule for a demand type does not find {scopeUntyped === 1 ? 'it' : 'them'}.
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
                    <th>Demand</th>
                    <th>One stamp</th>
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
                      <td className="num">{row.requirement.required === null ? '–' : `${fmt(row.requirement.required)} ${unitOf(row.rule)}`.trim()}</td>
                      <td className="num">{row.requirement.capacity === null ? '–' : `${fmt(row.requirement.capacity)} ${unitOf(row.rule)}`.trim()}</td>
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
                      <td>{notesOf(row, false, keptWithOtherTarget(row, (id) => autoPlacedById.get(id)))}</td>
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
  const pickedValues = picked ? scene.getRoomValues(picked) : null;
  const typeFill = typeFillOf(types);
  const roomFill = item.kind === 'types' ? typeFill : item.kind === 'heights' && heights ? (room: Room) => LEVEL_FILLS[resolveCeilingHeight(room, heights).level] : undefined;
  const pageTypes = types.filter((t) => pageRooms.some((r) => r.roomTypeId === t.id));
  const planTitle = item.kind === 'types' ? 'Room types' : item.kind === 'heights' ? 'Ceiling heights' : 'Whole floor';

  return (
    <Dialog
      title="Auto-place stamps"
      className="mep-modal--placement-guide mep-modal--auto-place"
      onClose={requestClose}
      actions={
        <button type="button" onClick={requestClose}>
          Close
        </button>
      }
    >
      <div className={`mep-guide${!openRule && item.kind === 'types' && typesTab === 'library' ? ' mep-guide--wide' : ''}`} ref={guideRef}>
        {nav}
        {openRule ? (
          <PlacementRuleGuideBody
            key={openRule.id}
            ref={body}
            rule={openRule}
            others={rules.filter((r) => r.id !== openRule.id)}
            roomTypes={roomTypes}
            needs={needs}
            language={language}
            sceneRef={sceneRef}
            stampName={stampName}
            stampDefinition={stampDefinition}
            stampScale={stampScale}
            stampIconUrl={stampIconUrl}
            onChooseStamp={onChooseStamp}
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
            onOpenRoomTypes={(focus) => {
              if (!canLeave()) return;
              setTypesFocus(focus ? { ...focus } : null);
              show({ kind: 'types' });
            }}
          />
        ) : (
          <>
            <section className="mep-guide-card" data-testid="ap-card" data-item={item.kind}>
              {ruleMoveReport && (
                <div className={`mep-guide-callout ${ruleMoveReport[0] === RULE_MOVE_FAILED ? 'bad' : 'info'}`} role="status" data-testid="ap-move-report">
                  <b>{ruleMoveReport[0] === RULE_MOVE_FAILED ? 'The placement rules did not change' : 'The placement rules changed'}</b>
                  <ul className="mep-autoplace-report">
                    {ruleMoveReport.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <div className="mep-guide-inline">
                    <button type="button" onClick={onCloseRuleMoveReport}>
                      Close this note
                    </button>
                  </div>
                </div>
              )}
              {blockMessage && (
                <div className="mep-guide-callout bad" role="alert" data-testid="ap-block">
                  <span>{blockMessage}</span>
                </div>
              )}
              {item.kind === 'place' || item.kind === 'rule' ? placeCard() : inputCard(item.kind)}
            </section>
            <aside className="mep-guide-side">
              <div className="mep-guide-panel">
                <div className="mep-guide-panel-head">
                  <span className="pt">{planTitle}</span>
                  {placeShown && placeJob.busy && (
                    <span className="mep-guide-busy" role="status" data-testid="ap-busy">
                      Calculating…
                    </span>
                  )}
                </div>
                {picked && pickedValues && (
                  <div className="mep-guide-facts" data-testid="ap-facts">
                    <span className="mep-guide-fact">{roomLabel(picked)}</span>
                    <span className="mep-guide-fact">{pickedValues.areaM2 === null ? 'no scale' : `${fmt(pickedValues.areaM2)} m²`}</span>
                    <span className="mep-guide-fact">{picked.roomTypeId === undefined ? 'No type' : typeName(picked.roomTypeId)}</span>
                    <span className="mep-guide-fact">
                      {pickedValues.ceilingHeight.mm} mm <small>{LEVEL_NAMES[pickedValues.ceilingHeight.level]}</small>
                    </span>
                    {pickedValues.people && <span className="mep-guide-fact">{plural(pickedValues.people.count, 'person')}</span>}
                  </div>
                )}
                <RulePreviewPlan
                  mode="floor"
                  busy={placeShown && placeJob.busy}
                  rooms={pageRooms}
                  sample={picked}
                  calibration={calibration}
                  roomState={placeShown ? placeRoomState : item.kind === 'heights' ? () => 'noMatch' : inputRoomState}
                  stamps={[]}
                  stampSizePt={{ width: 0, height: 0 }}
                  stampIconUrl={null}
                  wallOffsetM={0}
                  coverageRadiusM={null}
                  stampLayers={placeShown ? layers : []}
                  roomFill={roomFill}
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
                  {item.kind === 'types' &&
                    pageTypes.slice(0, TYPE_FILLS.length).map((t) => (
                      <span key={t.id} style={{ ['--sw' as string]: typeFill({ roomTypeId: t.id } as Room)! }}>
                        {roomTypeLabel(t, language)}
                      </span>
                    ))}
                  {item.kind === 'heights' &&
                    (['global', 'pdf', 'roomType', 'room'] as const).map((level) => (
                      <span key={level} style={{ ['--sw' as string]: LEVEL_FILLS[level] }}>
                        {LEVEL_NAMES[level]}
                      </span>
                    ))}
                  {item.kind !== 'heights' && <span className="hatch">no room type</span>}
                  <span className="plain">click a room to see its data</span>
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </Dialog>
  );
}
