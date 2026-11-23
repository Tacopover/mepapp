import { useEffect, useId, useMemo, useRef, useState, type JSX } from 'react';
import {
  clearRiserFlowOverride,
  detachMember,
  riserWarnings,
  setMemberConnectionHeight,
  setRiserProps,
  solveBuildingFlow,
  type BuildingFile,
  type BuildingSheet,
  type LinePattern,
  type Riser,
  type RiserEndKind,
  type RiserFlow,
  type RiserNetworksLive,
  type SheetSummary,
} from '@mepapp/core';
import type { FileAccess } from '@mepapp/platform';
import { readSummaries } from '../quantitiesScope.js';
import { deleteRiserAction, detachAction, type RiserActionResult } from '../riserActions.js';
import { layoutLevels, layoutRisers, typeFilters } from '../riserDiagram.js';
import {
  derivedFlowOf,
  detachedText,
  END_OPTIONS,
  riserFlowText,
  riserLineText,
  riserRows,
  type RiserLevelRow,
  type RowStatus,
} from '../riserInfo.js';
import { capacityViewOf, needsSummaryRead, rebuildNoticeText } from '../riserCapacity.js';
import { BuildingRisersDiagram } from './BuildingRisersDiagram.js';
import type { BuildingSummariesPaneProps } from './BuildingSummariesPane.js';
import { RiserDeleteDialog } from './RiserDeleteDialog.js';
import type { SheetOpenResult } from './ManageBuildingsDialog.js';

export interface BuildingRisersPaneProps {
  file: BuildingFile;
  update: (change: (file: BuildingFile) => BuildingFile) => Promise<void>;
  /** The store of the open building; the pane reads the saved summaries from it (readSummaries in ../quantitiesScope.js) on mount and each time `file` changes. A read error counts as no summaries. */
  store: { listSummaries(): Promise<string[]>; readSummary(projectUuid: string): Promise<string | undefined> };
  /** `${riserId}|${sheetId}` of fittings that are not at the riser position on an open sheet. */
  conflictKeys: ReadonlySet<string>;
  fileAccess: FileAccess;
  onOpenSheet: (sheet: BuildingSheet, mode: 'path' | 'pick') => Promise<SheetOpenResult>;
  openedSheetIds: ReadonlySet<string>;
  canOpenCached?: (sheet: BuildingSheet) => boolean;
  onNotice: (text: string, error: boolean) => void;
  busy: boolean;
  /** The live riser networks of all open documents of this building. They replace the saved summary of the same projectUuid. */
  live?: readonly RiserNetworksLive[];
  /** Reads the PDFs again and saves the summaries. Same function as the Levels tab. Undefined: the link "Read summaries now" is hidden. */
  onRebuild?: BuildingSummariesPaneProps['onRebuild'];
  /** Called when a run of onRebuild ends (any result). */
  onRebuildDone?: () => void;
}

/** Pure, exported for tests. `file.risers` in the order shown: same order as layoutRisers (type, then number). */
export function orderedRisers(file: BuildingFile, hidden: ReadonlySet<string>): Riser[] {
  const lanes = layoutRisers(file, layoutLevels(file.levels), hidden, new Set()).lanes;
  const byId = new Map(file.risers.map((riser) => [riser.id, riser] as const));
  const laneIds = new Set(lanes.map((lane) => lane.riserId));
  const laned = lanes.map((lane) => byId.get(lane.riserId)!);
  return [...laned, ...file.risers.filter((riser) => !hidden.has(riser.networkTypeId) && !laneIds.has(riser.id))];
}

/** The riser to select after a change: keep `current` when it is still shown; else the one at the same index in the new list (or the last); null when the list is empty. */
export function nextSelection(shownIds: readonly string[], current: string | null, previousIds: readonly string[]): string | null {
  if (shownIds.length === 0) return null;
  if (current !== null && shownIds.includes(current)) return current;
  const index = current === null ? -1 : previousIds.indexOf(current);
  return shownIds[Math.min(Math.max(index, 0), shownIds.length - 1)]!;
}

/** Parses the text of the end allowance / connection height input. '' -> undefined (clear); a finite number >= 0 -> that number; anything else -> 'invalid'. */
export function parseMm(text: string): number | undefined | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
}

type FocusRequest = { kind: 'row'; index: number } | { kind: 'lane'; riserId: string } | { kind: 'checkbox' } | { kind: 'info' };

const STATUS_TONE: Record<RowStatus, string> = { ok: 'ok', waiting: 'waiting', off: 'bad', gone: 'muted' };

function lineStyleOf(pattern: LinePattern): 'solid' | 'dashed' | 'dotted' {
  if (pattern === 'dashed' || pattern === 'longDash') return 'dashed';
  if (pattern === 'dotted' || pattern === 'dashDot' || pattern === 'dashDotDot') return 'dotted';
  return 'solid';
}

function withoutSource(file: BuildingFile, riserId: string): BuildingFile {
  return {
    ...file,
    risers: file.risers.map((riser) => {
      if (riser.id !== riserId) return riser;
      const next: Riser = { ...riser };
      delete next.sourceLevelId;
      return next;
    }),
  };
}

interface MmFieldProps {
  id: string;
  label: string;
  hideLabel?: boolean;
  placeholder?: string;
  testId: string;
  value: number | undefined;
  disabled: boolean;
  onCommit: (mm: number | undefined) => void;
}

/** A text input for a length in mm. It commits on Enter and on blur; Escape reverts; an invalid value keeps the text and writes nothing. */
function MmField({ id, label, hideLabel = false, placeholder, testId, value, disabled, onCommit }: MmFieldProps) {
  const shown = value === undefined ? '' : String(value);
  const [text, setText] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(shown);
    setInvalid(false);
  }, [shown]);

  function commit() {
    const parsed = parseMm(text);
    if (parsed === 'invalid') {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(parsed);
    setText(shown);
  }

  const errorId = `${id}-error`;
  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      data-testid={testId}
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      aria-label={hideLabel ? label : undefined}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={invalid ? errorId : undefined}
      onChange={(event) => {
        setText(event.target.value);
        if (parseMm(event.target.value) !== 'invalid') setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.stopPropagation();
          setText(shown);
          setInvalid(false);
        }
      }}
    />
  );
  const error = invalid ? (
    <span id={errorId} className="mep-hint mep-rp-error" role="alert">
      Enter a number of 0 or more.
    </span>
  ) : null;
  if (hideLabel)
    return (
      <>
        {input}
        {error}
      </>
    );
  return (
    <div className="mep-rp-field">
      <label htmlFor={id}>{label}</label>
      {input}
      {error}
    </div>
  );
}

/** The Risers tab of Manage Buildings: the type filters, the diagram, the warnings and the info panel of the selected riser. */
export function BuildingRisersPane(props: BuildingRisersPaneProps): JSX.Element {
  const { file, update, store, conflictKeys, fileAccess, onOpenSheet, openedSheetIds, canOpenCached, onNotice, busy, live, onRebuild, onRebuildDone } = props;
  const baseId = useId();
  const paneRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const shownIds = useMemo(() => orderedRisers(file, hidden).map((riser) => riser.id), [file, hidden]);
  const [selectedId, setSelectedId] = useState<string | null>(() => shownIds[0] ?? null);
  const previousIdsRef = useRef<readonly string[]>(shownIds);
  const [summaries, setSummaries] = useState<ReadonlyMap<string, SheetSummary>>(() => new Map());
  const [handOpen, setHandOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [reading, setReading] = useState(false);
  const rebuildRef = useRef<AbortController | null>(null);
  const capacityRef = useRef<HTMLDivElement>(null);
  const capacityHeadRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => rebuildRef.current?.abort(), []);

  useEffect(() => {
    const previous = previousIdsRef.current;
    previousIdsRef.current = shownIds;
    setSelectedId((current) => nextSelection(shownIds, current, previous));
  }, [shownIds]);

  useEffect(() => {
    setHandOpen(false);
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    readSummaries(store).then(
      (loaded) => {
        if (!active) return;
        setSummaries(loaded.summaries);
        setLoaded(true);
      },
      () => {
        if (!active) return;
        setSummaries(new Map());
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [file, store, reloadTick]);

  useEffect(() => {
    const pane = paneRef.current;
    if (focusRequest === null || pane === null) return;
    if (focusRequest.kind === 'row') {
      const buttons = pane.querySelectorAll<HTMLButtonElement>('[data-testid="riser-detach"]');
      (buttons[focusRequest.index] ?? pane.querySelector<HTMLButtonElement>('[data-testid="riser-delete"]'))?.focus();
    } else if (focusRequest.kind === 'lane') {
      pane.querySelector<SVGElement>(`[data-riser-id="${focusRequest.riserId}"]`)?.focus();
    } else if (focusRequest.kind === 'info') {
      pane.querySelector<HTMLElement>(`[id="${baseId}-title"]`)?.focus();
    } else {
      pane.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    }
  }, [focusRequest, baseId]);

  const levelLayout = useMemo(() => layoutLevels(file.levels), [file.levels]);
  const lanes = useMemo(() => layoutRisers(file, levelLayout, hidden, conflictKeys), [file, levelLayout, hidden, conflictKeys]);
  const filters = useMemo(() => typeFilters(file.risers, hidden), [file.risers, hidden]);
  const derived = useMemo(() => derivedFlowOf(file, summaries), [file, summaries]);
  const buildingFlow = useMemo(() => (loaded ? solveBuildingFlow(file, summaries, live) : null), [loaded, file, summaries, live]);
  const laneAria = useMemo(
    () =>
      new Map(
        file.risers.map((riser) => [riser.id, `${riser.name}, ${riserLineText(file, riser).replace(/ · /g, ', ')}`] as const),
      ),
    [file],
  );
  const warnings = [...riserWarnings(file), ...(buildingFlow?.warnings ?? [])];
  const selected = file.risers.find((riser) => riser.id === selectedId) ?? null;
  const needsAttention = useMemo(() => {
    if (buildingFlow === null || selected === null) return false;
    const view = capacityViewOf(file, selected, buildingFlow);
    return view.kind === 'solved' && (view.rows.some((row) => !row.known) || needsSummaryRead(file, selected, buildingFlow, summaries, live));
  }, [file, selected, buildingFlow, summaries, live]);

  useEffect(() => {
    if (needsAttention) capacityRef.current?.scrollIntoView({ block: 'nearest' });
  }, [needsAttention, selectedId]);

  function idsOf(next: BuildingFile): string[] {
    return orderedRisers(next, hidden).map((riser) => riser.id);
  }

  function toggleType(networkTypeId: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(networkTypeId)) next.delete(networkTypeId);
      else next.add(networkTypeId);
      return next;
    });
  }

  async function edit(label: string, change: (current: BuildingFile) => BuildingFile, okText?: string): Promise<boolean> {
    if (change(file) === file) return false;
    try {
      await update(change);
    } catch (error) {
      onNotice(`Could not save the change to ${label}. ${(error as Error).message}`, true);
      return false;
    }
    if (okText !== undefined) onNotice(okText, false);
    return true;
  }

  function setFlow(riser: Riser, flow: RiserFlow) {
    void edit(riser.name, (f) => setRiserProps(f, riser.id, { flow }));
  }

  function setSource(riser: Riser, value: string) {
    if (value === '') void edit(riser.name, (f) => withoutSource(f, riser.id));
    else void edit(riser.name, (f) => setRiserProps(f, riser.id, { sourceLevelId: value }));
  }

  function setEnd(riser: Riser, props: Partial<Pick<Riser, 'topEnd' | 'bottomEnd'>>) {
    void edit(riser.name, (f) => setRiserProps(f, riser.id, props));
  }

  function useSolve(riser: Riser) {
    setHandOpen(false);
    void edit(riser.name, (f) => clearRiserFlowOverride(f, riser.id), `${riser.name} uses the flow solve again.`);
  }

  async function goTo(sheet: BuildingSheet) {
    const mode = sheet.location.path !== undefined && fileAccess.readPath !== undefined ? 'path' : 'pick';
    const result = await onOpenSheet(sheet, mode);
    if (!result.ok && result.message !== null) {
      const text = result.message.startsWith('Could not')
        ? result.message
        : `Could not open ${sheet.location.fileName}: ${result.message}`;
      onNotice(text, true);
    }
  }

  async function detachRow(riser: Riser, row: RiserLevelRow, index: number) {
    let result: RiserActionResult;
    if (row.sheet !== null) {
      result = detachAction(file, riser.id, row.sheet);
    } else if (riser.members.length === 1) {
      result = deleteRiserAction(file, riser.id);
    } else {
      result = { ok: true, file: detachMember(file, riser.id, row.sheetId), message: detachedText(riser.name, 'this level') };
    }
    if (!result.ok) {
      onNotice(result.text, true);
      return;
    }
    const next = result.file;
    const remains = next.risers.some((candidate) => candidate.id === riser.id);
    const nextId = remains ? riser.id : nextSelection(idsOf(next), riser.id, shownIds);
    const ok = await edit(
      riser.name,
      (f) => {
        if (row.sheet !== null) {
          const r = detachAction(f, riser.id, row.sheet);
          return r.ok ? r.file : f;
        }
        if (riser.members.length === 1) {
          const r = deleteRiserAction(f, riser.id);
          return r.ok ? r.file : f;
        }
        return detachMember(f, riser.id, row.sheetId);
      },
      result.message,
    );
    if (!ok) return;
    if (remains) {
      setFocusRequest({ kind: 'row', index });
    } else {
      setSelectedId(nextId);
      setFocusRequest(nextId === null ? { kind: 'checkbox' } : { kind: 'lane', riserId: nextId });
    }
  }

  async function deleteSelected(riser: Riser) {
    setConfirmDelete(false);
    const result = deleteRiserAction(file, riser.id);
    if (!result.ok) {
      onNotice(result.text, true);
      return;
    }
    const next = result.file;
    const nextId = nextSelection(idsOf(next), riser.id, shownIds);
    const ok = await edit(
      riser.name,
      (f) => {
        const r = deleteRiserAction(f, riser.id);
        return r.ok ? r.file : f;
      },
      result.message,
    );
    if (!ok) return;
    setSelectedId(nextId);
    setFocusRequest(nextId === null ? { kind: 'checkbox' } : { kind: 'lane', riserId: nextId });
  }

  async function readSummariesNow() {
    if (onRebuild === undefined) return;
    const controller = new AbortController();
    rebuildRef.current = controller;
    setReading(true);
    try {
      const result = await onRebuild({ signal: controller.signal, onProgress: () => {} });
      const notice = rebuildNoticeText(result);
      onNotice(notice.text, notice.error);
    } catch (error) {
      onNotice(`The rebuild failed: ${(error as Error).message}`, true);
    } finally {
      rebuildRef.current = null;
      setReading(false);
      capacityHeadRef.current?.focus();
      setReloadTick((n) => n + 1);
      onRebuildDone?.();
    }
  }

  if (file.risers.length === 0) {
    return (
      <div ref={paneRef} className="mep-rp" data-testid="risers-pane">
        <p className="mep-hint">No riser yet. To make one, right-click a fitting on a sheet and click "Make riser".</p>
      </div>
    );
  }

  const riser = selected;
  const flow = riser === null ? null : riserFlowText(file, riser, derived[riser.id]);
  const solvedFlow = riser === null ? undefined : derived[riser.id]?.flow;
  const flowValue: string =
    riser === null
      ? ''
      : riser.flow !== 'unknown'
        ? riser.flow
        : solvedFlow !== undefined && solvedFlow !== 'unknown'
          ? solvedFlow
          : '';
  const showSelects = flow !== null && (flow.byHand || handOpen);
  const bothMember = riser !== null && riser.topEnd === 'member' && riser.bottomEnd === 'member';
  const memberLevels =
    riser === null
      ? []
      : file.levels
          .filter((level) => riser.members.some((member) => member.levelId === level.id))
          .sort((a, b) => b.elevationMm - a.elevationMm);
  const rows = riser === null ? [] : riserRows(file, riser, conflictKeys);
  const capacity = riser === null || buildingFlow === null ? null : capacityViewOf(file, riser, buildingFlow, { selectsShown: showSelects });

  return (
    <div ref={paneRef} className="mep-rp" data-testid="risers-pane">
      <div className="mep-rp-show" role="group" aria-label="Show network types">
        <span className="mep-rp-show-label">Show</span>
        {filters.map((filter) => (
          <label
            key={filter.networkTypeId}
            className="mep-rp-check"
            title={`Show or hide the ${filter.name} risers.`}
          >
            <input
              type="checkbox"
              data-testid={`riser-filter-${filter.networkTypeId}`}
              checked={filter.shown}
              onChange={() => toggleType(filter.networkTypeId)}
            />
            <span
              className="mep-rp-swatch"
              aria-hidden="true"
              style={{ borderTopColor: filter.color, borderTopStyle: lineStyleOf(filter.linePattern) }}
            />
            <span>{filter.name}</span>
          </label>
        ))}
      </div>

      {shownIds.length === 0 ? (
        <p className="mep-hint">No riser is shown. Select a network type above.</p>
      ) : (
        <BuildingRisersDiagram
          layout={levelLayout}
          lanes={lanes}
          selectedId={selectedId}
          onSelect={(riserId) => setSelectedId(riserId)}
          onActivate={(riserId) => {
            setSelectedId(riserId);
            setFocusRequest({ kind: 'info' });
          }}
          laneAria={laneAria}
        />
      )}

      {warnings.length > 0 && (
        <details className="mep-rp-warnings" data-testid="riser-warnings" open={warnings.length <= 3}>
          <summary>Warnings ({warnings.length})</summary>
          <ul>
            {warnings.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </details>
      )}

      {riser !== null && flow !== null && shownIds.length > 0 && (
        <section
          className={detailsOpen ? 'mep-rp-info mep-rp-info--stack' : 'mep-rp-info'}
          aria-labelledby={`${baseId}-title`}
          data-testid="riser-info"
        >
          <div className="mep-rp-info-main">
            <div className="mep-rp-title">
              <span
                className="mep-rp-swatch"
                aria-hidden="true"
                style={{ borderTopColor: riser.networkType.color, borderTopStyle: lineStyleOf(riser.networkType.linePattern) }}
              />
              <h4 id={`${baseId}-title`} tabIndex={-1}>{riser.name}</h4>
            </div>
            <p className="mep-rp-line">{riserLineText(file, riser)}</p>

            <div ref={capacityRef} className="mep-rp-capacity" data-testid="riser-capacity">
              <div className="mep-rp-capacity-head">
                <h5 ref={capacityHeadRef} tabIndex={-1} className="mep-rp-subhead">Capacity</h5>
                {capacity?.notDesignFlow && (
                  <span
                    className="mep-rp-tag"
                    title={capacity.designFlowHint ?? undefined}
                    data-testid="riser-not-design-flow"
                  >
                    Not a design flow
                  </span>
                )}
              </div>
              {capacity === null ? (
                <p className="mep-hint">Reading the saved summaries…</p>
              ) : (
                <>
                  {capacity.kind === 'solved' && (
                    <>
                      <div className="mep-rp-flowbox mep-rp-capbox">
                        <div data-testid="riser-capacity-main">{capacity.mainLine}</div>
                        <div data-testid="riser-capacity-total">{capacity.totalLine}</div>
                      </div>
                      <div className="mep-rp-cap-list" data-testid="riser-capacity-list" role="list" tabIndex={0} aria-label="Capacity of each span">
                        {capacity.rows.map((row) => (
                          <div
                            key={row.key}
                            className="mep-rp-cap-row"
                            role="listitem"
                            aria-label={row.ariaLabel}
                            data-testid="riser-capacity-row"
                          >
                            <span className="mep-rp-cap-levels">{row.levelsText}</span>
                            <span className={row.known ? 'mep-rp-cap-value' : 'mep-rp-cap-value mep-rp-cap-value--unknown'}>
                              {row.valueText}
                            </span>
                          </div>
                        ))}
                      </div>
                      {capacity.sharedLine !== null && (
                        <p className="mep-hint" data-testid="riser-capacity-hint">
                          {capacity.sharedLine}
                        </p>
                      )}
                    </>
                  )}
                  {capacity.hints.map((text) => (
                    <p key={text} className="mep-hint" data-testid="riser-capacity-hint">
                      {text}
                    </p>
                  ))}
                  {capacity.designFlowHint !== null && (
                    <p className="mep-hint" data-testid="riser-design-flow-hint">
                      {capacity.designFlowHint}
                    </p>
                  )}
                  {buildingFlow !== null && onRebuild !== undefined && needsSummaryRead(file, riser, buildingFlow, summaries, live) && (
                    <div className="mep-rp-links">
                      <button
                        type="button"
                        className="mep-rp-link"
                        data-testid="riser-read-summaries"
                        disabled={busy || reading}
                        onClick={() => void readSummariesNow()}
                      >
                        {reading ? 'Reading…' : 'Read summaries now'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <h5 className="mep-rp-subhead">Flow direction</h5>
            <div className="mep-rp-flowbox" data-testid="riser-flow-box">
              {flow.text}
            </div>

            {showSelects && (
              <div className="mep-rp-fields">
                <div className="mep-rp-field">
                  <label htmlFor={`${baseId}-flow`}>Direction</label>
                  <select
                    id={`${baseId}-flow`}
                    data-testid="riser-flow-select"
                    value={flowValue}
                    disabled={busy}
                    onChange={(event) => setFlow(riser, event.target.value as RiserFlow)}
                  >
                    {flowValue === '' && <option value="">Choose</option>}
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="both">Both</option>
                  </select>
                </div>
                <div className="mep-rp-field">
                  <label htmlFor={`${baseId}-source`}>Source level</label>
                  <select
                    id={`${baseId}-source`}
                    data-testid="riser-source-select"
                    value={riser.sourceLevelId ?? ''}
                    disabled={busy}
                    onChange={(event) => setSource(riser, event.target.value)}
                  >
                    <option value="">From the flow solve</option>
                    {memberLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="mep-rp-links">
              {showSelects ? (
                <button
                  type="button"
                  className="mep-rp-link"
                  data-testid="riser-use-solve"
                  disabled={busy}
                  onClick={() => useSolve(riser)}
                >
                  Use the flow solve
                </button>
              ) : (
                <button
                  type="button"
                  className="mep-rp-link"
                  data-testid="riser-set-by-hand"
                  disabled={busy}
                  onClick={() => setHandOpen(true)}
                >
                  Set by hand
                </button>
              )}
              <button
                type="button"
                className="mep-rp-link"
                data-testid="riser-more-details"
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                {detailsOpen ? 'Fewer details' : 'More details'}
              </button>
            </div>

            {detailsOpen && (
              <div className="mep-rp-details">
                <div className="mep-rp-fields">
                  <div className="mep-rp-field">
                    <label htmlFor={`${baseId}-top`}>Top end</label>
                    <select
                      id={`${baseId}-top`}
                      data-testid="riser-top-end"
                      value={riser.topEnd}
                      disabled={busy}
                      onChange={(event) => setEnd(riser, { topEnd: event.target.value as RiserEndKind })}
                    >
                      {END_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mep-rp-field">
                    <label htmlFor={`${baseId}-bottom`}>Bottom end</label>
                    <select
                      id={`${baseId}-bottom`}
                      data-testid="riser-bottom-end"
                      value={riser.bottomEnd}
                      disabled={busy}
                      onChange={(event) => setEnd(riser, { bottomEnd: event.target.value as RiserEndKind })}
                    >
                      {END_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mep-hint">Open: the riser goes on through the roof or floor. Capped: the riser ends in a cap.</p>
                <MmField
                  id={`${baseId}-allowance`}
                  label="End allowance (mm)"
                  testId="riser-end-allowance"
                  value={riser.endAllowanceMm}
                  disabled={busy || bothMember}
                  onCommit={(mm) => {
                    const next = mm ?? 0;
                    if (next !== riser.endAllowanceMm) void edit(riser.name, (f) => setRiserProps(f, riser.id, { endAllowanceMm: next }));
                  }}
                />
                <p className="mep-hint">
                  {bothMember ? 'Both ends continue on a level. No allowance is needed.' : 'Extra length at each open or capped end.'}
                </p>
                <p className="mep-hint">For an offset, use two risers and a horizontal run.</p>
              </div>
            )}

            <button
              type="button"
              className="mep-btn-danger mep-rp-delete"
              data-testid="riser-delete"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete riser
            </button>
          </div>

          <div className="mep-rp-side">
            {detailsOpen && (
              <div className="mep-rp-row mep-rp-row--details mep-rp-row--head" aria-hidden="true">
                <span />
                <span />
                <span>Connection height (mm)</span>
                <span />
              </div>
            )}
            {rows.map((row, index) => {
              const sheet = row.sheet;
              const gone = row.status === 'gone' || sheet === null;
              const direct = sheet !== null && sheet.location.path !== undefined && fileAccess.readPath !== undefined;
              const ready = sheet !== null && (openedSheetIds.has(sheet.id) || direct || canOpenCached?.(sheet) === true);
              return (
                <div
                  key={row.sheetId}
                  className={`mep-rp-row${detailsOpen ? ' mep-rp-row--details' : ''}`}
                  data-testid="riser-row"
                >
                  <span className="mep-rp-level">{row.levelName}</span>
                  <span className={`mep-rp-status mep-rp-status--${STATUS_TONE[row.status]}`}>{row.statusText}</span>
                  {detailsOpen && (
                    <span className="mep-rp-height">
                      <MmField
                        id={`${baseId}-height-${index}`}
                        label="Connection height (mm)"
                        hideLabel
                        testId="riser-height"
                        placeholder="mm"
                        value={row.connectionHeightMm}
                        disabled={busy}
                        onCommit={(mm) => void edit(riser.name, (f) => setMemberConnectionHeight(f, riser.id, row.sheetId, mm))}
                      />
                    </span>
                  )}
                  <span className="mep-rp-actions">
                    <button
                      type="button"
                      data-testid="riser-goto"
                      aria-label={gone || ready ? `Go to ${row.levelName}` : `Choose file for ${row.levelName}`}
                      title={
                        gone
                          ? 'This level is not in the building any more.'
                          : ready
                            ? `Open the sheet of ${row.levelName}.`
                            : 'This PDF is not open in this session. Choose the file to open the sheet.'
                      }
                      disabled={gone || busy}
                      onClick={() => {
                        if (sheet !== null) void goTo(sheet);
                      }}
                    >
                      {gone || ready ? 'Go to' : 'Choose file…'}
                    </button>
                    <button
                      type="button"
                      data-testid="riser-detach"
                      aria-label={`Detach ${row.levelName} from ${riser.name}`}
                      title={`Take ${row.levelName} out of this riser.`}
                      disabled={busy}
                      onClick={() => void detachRow(riser, row, index)}
                    >
                      Detach
                    </button>
                  </span>
                </div>
              );
            })}
            {detailsOpen && <p className="mep-hint">Height above the floor where the pipe joins the fitting.</p>}
          </div>
        </section>
      )}

      {confirmDelete && riser !== null && (
        <RiserDeleteDialog
          label={riser.name}
          onConfirm={() => void deleteSelected(riser)}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
