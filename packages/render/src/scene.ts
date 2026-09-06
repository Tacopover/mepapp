import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
} from 'pixi.js';
import {
  calibrateFromKnownDistance,
  centroid,
  CommandManager,
  CompositeCommand,
  computeNetworks,
  loadProject,
  measureRealDistance,
  multiRotate,
  normalizeDegrees,
  planPdfSync,
  pointInRotatedRect,
  reconcilePdfSync,
  rectIntersectsRotatedRect,
  resolveSegmentEndpoint,
  rotatePointAround,
  serializeProject,
  solveFlow,
  splitSegmentAtFitting,
  type Calibration,
  type Command,
  type Fitting,
  type FlowResult,
  type Network,
  type NetworkType,
  type PlacedStamp,
  type ProjectDocument,
  type ReconciliationReport,
  type Segment,
  type SyncedGeometry,
  type Transform2D,
  type Vec2,
} from '@mepapp/core';
import type { AnnotationGeometry, PdfDocumentHandle, StoredAnnotation } from '@mepapp/pdf-engine';
import { textureFromImageBitmap } from './texture.js';

// The embedded-file name the project JSON is stored under inside the PDF
// itself (see decisions log 2026-09-06: single self-contained .pdf, no
// sidecar file to lose or point at the wrong PDF).
const EMBEDDED_PROJECT_FILENAME = 'mepapp-project.json';

function round(n: number): number {
  return Math.round(n * 1000) / 1000; // avoids float round-trip noise producing false-positive drift
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Maps an observed PDF annotation back to the generic geometry shape reconcilePdfSync compares — see core/pdfSync.ts. Returns null for annotation kinds MepApp doesn't itself author (foreign markup is left alone entirely). */
function annotationSyncEntry(annotation: StoredAnnotation): SyncedGeometry | null {
  const g: AnnotationGeometry = annotation.geometry;
  if (g.kind === 'line') {
    return { id: annotation.id, geometry: { ax: round(g.from.x), ay: round(g.from.y), bx: round(g.to.x), by: round(g.to.y) } };
  }
  if (g.kind === 'circle') {
    return { id: annotation.id, geometry: { x: round(g.center.x), y: round(g.center.y) } };
  }
  if (g.kind === 'stamp') {
    return { id: annotation.id, geometry: { x: round(g.position.x), y: round(g.position.y), rotationDegrees: round(g.rotationDegrees) } };
  }
  return null;
}

/** Undo-history state for the segment/fitting drawing tool — kept separate from the pre-existing, not-yet-undoable stamp placement state (see decisions log 2026-09-06). */
interface DrawingState {
  segments: Record<string, Segment>;
  fittings: Record<string, Fitting>;
}

const DEFAULT_NETWORK_TYPE: NetworkType = {
  id: 'default',
  name: 'Unassigned',
  discipline: 'ventilation',
  units: '',
  defaultCapacity: 0,
};

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

function createFittingCommand(fitting: Fitting): Command<DrawingState> {
  return {
    description: `Create fitting ${fitting.id}`,
    execute: (state) => ({ ...state, fittings: { ...state.fittings, [fitting.id]: fitting } }),
    undo: (state) => ({ ...state, fittings: withoutKey(state.fittings, fitting.id) }),
  };
}

function createSegmentCommand(segment: Segment): Command<DrawingState> {
  return {
    description: `Create segment ${segment.id}`,
    execute: (state) => ({ ...state, segments: { ...state.segments, [segment.id]: segment } }),
    undo: (state) => ({ ...state, segments: withoutKey(state.segments, segment.id) }),
  };
}

function deleteSegmentCommand(segment: Segment): Command<DrawingState> {
  return {
    description: `Delete segment ${segment.id}`,
    execute: (state) => ({ ...state, segments: withoutKey(state.segments, segment.id) }),
    undo: (state) => ({ ...state, segments: { ...state.segments, [segment.id]: segment } }),
  };
}

interface DrawEndpointResolution {
  point: Segment['endpointA'];
  worldPosition: Vec2;
  /** Present when resolving this endpoint requires new state (a bare new fitting, or breaking an existing segment) — bundled into the draw's single undo step rather than applied on its own. */
  setupCommand?: Command<DrawingState>;
}

// Stamp art in fixtures/stamps is expected to be authored at 300 DPI (see the
// fixtures README) — this converts a stamp texture's native pixel size into
// world units (1 world unit = 1 PDF point) for its initial, unscaled size.
const STAMP_SOURCE_DPI = 300;

const HANDLE_OFFSET_WORLD_AT_ZOOM_1 = 32;
const HANDLE_HIT_RADIUS_SCREEN_PX = 10;
const ROTATE_SNAP_DEGREES = 45;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

export interface StampInfo {
  id: string;
  transform: Transform2D;
  nativeWidth: number;
  nativeHeight: number;
}

export type SketchTool = 'select' | 'place-stamp' | 'calibrate' | 'measure' | 'draw-segment';

export interface DrawingSummary {
  segmentCount: number;
  fittingCount: number;
  networkCount: number;
  canUndo: boolean;
  canRedo: boolean;
}

interface SketchSceneEvents {
  [key: string]: unknown[];
  selectionChanged: [StampInfo[]];
  toolChanged: [SketchTool];
  calibrationNeeded: [p1: Vec2, p2: Vec2, resolve: (knownRealDistanceMm: number | null) => void];
  calibrationSet: [Calibration];
  measurement: [distanceMm: number];
  drawingChanged: [DrawingSummary];
  flowSolved: [FlowResult[]];
  projectLoaded: [];
}

type Listener<A extends unknown[]> = (...args: A) => void;

class TypedEmitter<Events extends Record<string, unknown[]>> {
  private listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    (this.listeners[event] ??= new Set()).add(listener);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.listeners[event]?.forEach((listener) => listener(...args));
  }
}

interface StampEntry {
  data: PlacedStamp;
  sprite: Sprite;
  baseScale: Vec2; // converts texture pixels -> world units at transform.scale = 1
}

type DragState =
  | { kind: 'none' }
  | { kind: 'pan'; startScreen: Vec2; startWorldPos: Vec2 }
  | { kind: 'move-selection'; startPointerWorld: Vec2; snapshot: Array<{ id: string; position: Vec2 }> }
  | {
      kind: 'rotate-selection';
      pivot: Vec2;
      startPointerAngleDeg: number;
      snapshot: Array<{ id: string; transform: Transform2D }>;
    }
  | { kind: 'rubber-band'; startWorld: Vec2; currentWorld: Vec2; additive: boolean };

function applyTransformToSprite(sprite: Sprite, transform: Transform2D, baseScale: Vec2): void {
  sprite.position.set(transform.position.x, transform.position.y);
  sprite.rotation = (transform.rotationDegrees * Math.PI) / 180; // absolute set — never +=, see core/geometry.ts
  sprite.scale.set(baseScale.x * transform.scale.x, baseScale.y * transform.scale.y);
}

function angleDegrees(from: Vec2, to: Vec2): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function snapToNearest(degrees: number, step: number): number {
  return Math.round(degrees / step) * step;
}

export class SketchScene {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly stampsLayer = new Container();
  private readonly drawingLayer = new Graphics();
  private readonly overlay = new Graphics();
  private backdropSprite: Sprite | null = null;
  private readonly stamps = new Map<string, StampEntry>();
  private selectedIds = new Set<string>();
  private tool: SketchTool = 'select';
  private pendingStampTexture: { texture: Texture; nativeWidth: number; nativeHeight: number } | null = null;
  private calibration: Calibration | null = null;
  private pendingPoints: Vec2[] = []; // shared scratch for calibrate/measure two-click flows
  private drag: DragState = { kind: 'none' };
  private nextStampSeq = 1;
  private readonly emitter = new TypedEmitter<SketchSceneEvents>();

  // Segment/fitting drawing tool state — see decisions log 2026-09-06.
  private readonly drawingHistory = new CommandManager<DrawingState>({ segments: {}, fittings: {} });
  private readonly networkTypes: NetworkType[] = [DEFAULT_NETWORK_TYPE];
  private readonly terminalCapacities = new Map<string, number>();
  private pendingSegmentStart: DrawEndpointResolution | null = null;
  private nextFittingSeq = 1;
  private nextSegmentSeq = 1;
  private lastFlowResult: FlowResult[] = [];
  private readonly SNAP_RADIUS_SCREEN_PX = 12;
  // Domain ids that currently have a MepApp-written PDF annotation, per the
  // last loadFromPdf/exportToPdf call — seeds planPdfSync's "what did we
  // previously write" input so a save never deletes an annotation it doesn't
  // own (see core/pdfSync.ts's SyncPlan doc comment).
  private pdfSyncIds = new Set<string>();
  private static readonly FITTING_MARKER_RADIUS_PT = 4;

  constructor(private readonly container: HTMLElement) {}

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.container,
      background: '#2b2b2b',
      antialias: true,
      eventFeatures: { move: true, globalMove: true, click: true, wheel: true },
    });
    this.container.appendChild(this.app.canvas);

    this.world.addChild(this.stampsLayer);
    this.world.addChild(this.drawingLayer);
    this.world.addChild(this.overlay);
    this.app.stage.addChild(this.world);

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointerdown', this.onPointerDown);
    this.app.stage.on('globalpointermove', this.onPointerMove);
    this.app.stage.on('pointerup', this.onPointerUp);
    this.app.stage.on('pointerupoutside', this.onPointerUp);
    this.app.stage.on('wheel', this.onWheel);
    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }

  on<K extends keyof SketchSceneEvents>(event: K, listener: Listener<SketchSceneEvents[K]>): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof SketchSceneEvents>(event: K, listener: Listener<SketchSceneEvents[K]>): void {
    this.emitter.off(event, listener);
  }

  setTool(tool: SketchTool): void {
    this.tool = tool;
    this.pendingPoints = [];
    this.pendingSegmentStart = null;
    this.redrawOverlay();
    this.emitter.emit('toolChanged', tool);
  }

  /**
   * Displays a PDF page raster as the backdrop. pageWidthPt/pageHeightPt are
   * the page's own display-space dimensions (see @mepapp/core's
   * displayDimensions) — 1 world unit = 1 PDF point, independent of the DPI
   * the bitmap was actually rendered at.
   */
  setBackdrop(bitmap: ImageBitmap, pageWidthPt: number, pageHeightPt: number): void {
    if (this.backdropSprite) {
      this.world.removeChild(this.backdropSprite);
      this.backdropSprite.destroy({ texture: true });
    }
    const sprite = new Sprite(textureFromImageBitmap(bitmap));
    sprite.anchor.set(0);
    sprite.width = pageWidthPt;
    sprite.height = pageHeightPt;
    this.backdropSprite = sprite;
    this.world.addChildAt(sprite, 0);
  }

  /** Sets the stamp art the next 'place-stamp' click will place. */
  setStampTexture(bitmap: ImageBitmap): void {
    const texture = textureFromImageBitmap(bitmap);
    this.pendingStampTexture = {
      texture,
      nativeWidth: (texture.width * 72) / STAMP_SOURCE_DPI,
      nativeHeight: (texture.height * 72) / STAMP_SOURCE_DPI,
    };
  }

  getSelection(): StampInfo[] {
    return [...this.selectedIds]
      .map((id) => this.stamps.get(id))
      .filter((e): e is StampEntry => e !== undefined)
      .map((e) => ({ id: e.data.id, transform: e.data.transform, nativeWidth: e.data.nativeWidth, nativeHeight: e.data.nativeHeight }));
  }

  getCalibration(): Calibration | null {
    return this.calibration;
  }

  getDrawingSummary(): DrawingSummary {
    const state = this.drawingHistory.getState();
    const networks = computeNetworks({
      segments: Object.values(state.segments),
      fittings: Object.values(state.fittings),
      portGroups: [],
    });
    return {
      segmentCount: Object.keys(state.segments).length,
      fittingCount: Object.keys(state.fittings).length,
      networkCount: networks.length,
      canUndo: this.drawingHistory.canUndo,
      canRedo: this.drawingHistory.canRedo,
    };
  }

  undoDrawing(): void {
    this.drawingHistory.undo();
    this.syncDrawingLayer();
  }

  redoDrawing(): void {
    this.drawingHistory.redo();
    this.syncDrawingLayer();
  }

  /** User-entered capacity for a terminal/equipment stamp — the only input solveFlow reads per element (see core/flow.ts). */
  setTerminalCapacity(elementId: string, capacity: number): void {
    this.terminalCapacities.set(elementId, capacity);
  }

  /**
   * Runs the capacity-accumulation flow solve (core/flow.ts) over every
   * derived network and returns one FlowResult per network. Networks are
   * recomputed from current topology on every call — there is no stored
   * NetworkId to go stale, unlike the old app (see decisions log 2026-09-06).
   */
  computeFlow(): FlowResult[] {
    const state = this.drawingHistory.getState();
    const segments = Object.values(state.segments);
    const fittings = Object.values(state.fittings);
    const networks = computeNetworks({ segments, fittings, portGroups: [] });
    const capacities = Object.fromEntries(this.terminalCapacities);
    this.lastFlowResult = networks.map((network: Network) =>
      solveFlow({ network, segments, fittings, portGroups: [], terminalCapacities: capacities }),
    );
    this.emitter.emit('flowSolved', this.lastFlowResult);
    return this.lastFlowResult;
  }

  exportProject(): ProjectDocument {
    const state = this.drawingHistory.getState();
    return serializeProject({
      networkTypes: this.networkTypes,
      segments: Object.values(state.segments),
      fittings: Object.values(state.fittings),
      stamps: [...this.stamps.values()].map((entry) => entry.data),
    }) as unknown as ProjectDocument;
  }

  /**
   * Loads a saved project, running it through core's schema migration first
   * (see decisions log 2026-09-06). Throws core's ProjectLoadError on a
   * malformed document — callers should catch it for a user-facing message.
   *
   * Restores segments/fittings/network types only. Placed stamps are not
   * round-tripped yet: the save format has no image bytes for them (the
   * PNG the user picked lives only in that browser session), so there is
   * nothing to rebuild a sprite from after a reload. Tracked as a known gap,
   * not attempted as a half-working placeholder.
   */
  loadProjectFromJson(raw: unknown): void {
    const doc = loadProject(raw as Record<string, unknown>);

    this.drawingHistory.clear();
    this.drawingHistory.setLiveState({
      segments: Object.fromEntries(doc.segments.map((s) => [s.id, s])),
      fittings: Object.fromEntries(doc.fittings.map((f) => [f.id, f])),
    });
    this.networkTypes.splice(0, this.networkTypes.length, ...(doc.networkTypes.length > 0 ? doc.networkTypes : [DEFAULT_NETWORK_TYPE]));

    this.syncDrawingLayer();
    this.emitter.emit('projectLoaded');
  }

  /**
   * Writes the current domain model into a PDF, both as the authoritative
   * project JSON (a document-level embedded file, so a single .pdf carries
   * the whole project) and as real, editable PDF annotation objects for
   * segments/fittings/stamps — kept in sync with the domain model rather
   * than recreated wholesale on every save (see core/pdfSync.ts's
   * planPdfSync). A domain object's own id is used verbatim as its
   * annotation's id, so it can be correlated again on the next open with no
   * separate mapping table (decisions log 2026-09-06).
   */
  async exportToPdf(handle: PdfDocumentHandle): Promise<void> {
    const domainEntries = this.domainSyncEntries();
    const observed = (await handle.listAnnotations(0)).map(annotationSyncEntry).filter((e): e is SyncedGeometry => e !== null);
    const plan = planPdfSync(domainEntries, observed, this.pdfSyncIds);

    for (const id of plan.toDelete) {
      await handle.deleteAnnotation(id);
      this.pdfSyncIds.delete(id);
    }
    for (const id of plan.toUpdate) {
      // The interface has no "update in place" — an update is a delete then
      // recreate under the same id.
      await handle.deleteAnnotation(id);
      await this.writeAnnotationForId(handle, id);
    }
    for (const id of plan.toCreate) {
      await this.writeAnnotationForId(handle, id);
      this.pdfSyncIds.add(id);
    }

    await handle.setEmbeddedFile(EMBEDDED_PROJECT_FILENAME, new TextEncoder().encode(JSON.stringify(this.exportProject())));
  }

  /**
   * Opens a PDF: loads its embedded project JSON (if any) as the domain
   * model, then compares that domain model against what the PDF's own
   * annotations actually show right now. MepApp's confirmed reconciliation
   * policy (2026-09-06) is to flag drift/missing annotations and let the
   * user choose what to do — this method never silently overwrites either
   * side; the caller decides how to act on the returned report (e.g. an "N
   * annotations changed since last save" review panel).
   */
  async loadFromPdf(handle: PdfDocumentHandle): Promise<ReconciliationReport> {
    const embedded = await handle.getEmbeddedFile(EMBEDDED_PROJECT_FILENAME);
    if (embedded) {
      this.loadProjectFromJson(JSON.parse(new TextDecoder().decode(embedded)));
    }

    const domainEntries = this.domainSyncEntries();
    const observed = (await handle.listAnnotations(0)).map(annotationSyncEntry).filter((e): e is SyncedGeometry => e !== null);
    const report = reconcilePdfSync(domainEntries, observed);

    this.pdfSyncIds = new Set([...report.matchedIds, ...report.drifted.map((d) => d.id)]);
    return report;
  }

  private domainSyncEntries(): SyncedGeometry[] {
    const state = this.drawingHistory.getState();
    const entries: SyncedGeometry[] = [];
    for (const segment of Object.values(state.segments)) {
      const [a, b] = segment.geometry;
      if (!a || !b) continue;
      entries.push({ id: segment.id, geometry: { ax: round(a.x), ay: round(a.y), bx: round(b.x), by: round(b.y) } });
    }
    for (const fitting of Object.values(state.fittings)) {
      entries.push({ id: fitting.id, geometry: { x: round(fitting.position.x), y: round(fitting.position.y) } });
    }
    for (const entry of this.stamps.values()) {
      const bounds = this.stampWorldBounds(entry);
      entries.push({
        id: entry.data.id,
        geometry: { x: round(bounds.minX), y: round(bounds.minY), rotationDegrees: round(entry.data.transform.rotationDegrees) },
      });
    }
    return entries;
  }

  private stampWorldBounds(entry: StampEntry): { minX: number; minY: number; maxX: number; maxY: number } {
    const halfWidth = (entry.data.nativeWidth / 2) * entry.data.transform.scale.x;
    const halfHeight = (entry.data.nativeHeight / 2) * entry.data.transform.scale.y;
    const corners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((local) => {
      const r = rotatePointAround(local, { x: 0, y: 0 }, entry.data.transform.rotationDegrees);
      return { x: r.x + entry.data.transform.position.x, y: r.y + entry.data.transform.position.y };
    });
    return {
      minX: Math.min(...corners.map((c) => c.x)),
      minY: Math.min(...corners.map((c) => c.y)),
      maxX: Math.max(...corners.map((c) => c.x)),
      maxY: Math.max(...corners.map((c) => c.y)),
    };
  }

  private async writeAnnotationForId(handle: PdfDocumentHandle, id: string): Promise<void> {
    const state = this.drawingHistory.getState();
    const segment = state.segments[id];
    if (segment) {
      const [a, b] = segment.geometry;
      await handle.addAnnotation({ id, kind: 'line', pageIndex: segment.pageIndex, geometry: { kind: 'line', from: a, to: b } });
      return;
    }
    const fitting = state.fittings[id];
    if (fitting) {
      await handle.addAnnotation({
        id,
        kind: 'circle',
        pageIndex: fitting.pageIndex,
        geometry: { kind: 'circle', center: fitting.position, radius: SketchScene.FITTING_MARKER_RADIUS_PT },
      });
      return;
    }
    const stampEntry = this.stamps.get(id);
    if (stampEntry) {
      // The extracted PNG already reflects the sprite's own rotation baked
      // into its pixels — the adapter does not rotate pngBytes itself (see
      // AnnotationGeometry's 'stamp' doc comment in @mepapp/pdf-engine).
      const pngBytes = dataUrlToBytes(await this.app.renderer.extract.base64({ target: stampEntry.sprite, format: 'png' }));
      const bounds = this.stampWorldBounds(stampEntry);
      await handle.addAnnotation({
        id,
        kind: 'stamp',
        pageIndex: 0,
        geometry: {
          kind: 'stamp',
          position: { x: bounds.minX, y: bounds.minY },
          widthPt: bounds.maxX - bounds.minX,
          heightPt: bounds.maxY - bounds.minY,
          rotationDegrees: stampEntry.data.transform.rotationDegrees,
          pngBytes,
        },
      });
    }
  }

  /**
   * Benchmark-only: fills the scene with `count` placeholder rectangles (a
   * shared 1x1 white texture, tinted, no real stamp art) scattered across
   * [0,areaWidth] x [0,areaHeight]. Exists to drive Step 3's frame-rate/
   * object-count load test without needing 3000 real stamp images — see the
   * Stack Study plan, which explicitly allows placeholder shapes here since
   * this step measures redraw cost, not rendering fidelity. Never called from
   * normal UI code.
   */
  debugPopulateForBenchmark(count: number, areaWidth: number, areaHeight: number): void {
    for (let i = 0; i < count; i++) {
      const id = `bench-${this.nextStampSeq++}`;
      const nativeWidth = 40 + Math.random() * 40;
      const nativeHeight = 40 + Math.random() * 40;
      const data: PlacedStamp = {
        id,
        transform: {
          position: { x: Math.random() * areaWidth, y: Math.random() * areaHeight },
          rotationDegrees: Math.random() * 360,
          scale: { x: 1, y: 1 },
        },
        nativeWidth,
        nativeHeight,
        ports: [],
      };
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.tint = Math.floor(Math.random() * 0xffffff);
      const baseScale = { x: nativeWidth, y: nativeHeight }; // Texture.WHITE is 1x1
      applyTransformToSprite(sprite, data.transform, baseScale);
      this.stamps.set(id, { data, sprite, baseScale });
      this.stampsLayer.addChild(sprite);
    }
  }

  /** Programmatic rotate (e.g. a "rotate 90°" button) — same absolute-recompute path as drag rotation. */
  rotateSelectionBy(deltaDegrees: number): void {
    const snapshot = this.getSelection().map((s) => ({ id: s.id, transform: s.transform }));
    if (snapshot.length === 0) return;
    const rotated = multiRotate(
      snapshot.map((s) => s.transform),
      deltaDegrees,
    );
    snapshot.forEach((s, i) => this.setStampTransform(s.id, rotated[i]));
    this.redrawOverlay();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Typed-degree entry: free-form, no snapping, single-selection only. */
  setSelectedRotationDegrees(degrees: number): void {
    if (this.selectedIds.size !== 1) return;
    const [id] = this.selectedIds;
    const entry = this.stamps.get(id);
    if (!entry) return;
    this.setStampTransform(id, { ...entry.data.transform, rotationDegrees: normalizeDegrees(degrees) });
    this.redrawOverlay();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  private setStampTransform(id: string, transform: Transform2D): void {
    const entry = this.stamps.get(id);
    if (!entry) return;
    entry.data = { ...entry.data, transform };
    applyTransformToSprite(entry.sprite, transform, entry.baseScale);
  }

  private screenToWorld(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.world.x) / this.world.scale.x,
      y: (screen.y - this.world.y) / this.world.scale.y,
    };
  }

  private hitTestStamp(worldPoint: Vec2): string | null {
    const ordered = [...this.stamps.values()].reverse(); // topmost first
    for (const entry of ordered) {
      const halfWidth = (entry.data.nativeWidth / 2) * entry.data.transform.scale.x;
      const halfHeight = (entry.data.nativeHeight / 2) * entry.data.transform.scale.y;
      if (pointInRotatedRect(worldPoint, entry.data.transform, halfWidth, halfHeight)) {
        return entry.data.id;
      }
    }
    return null;
  }

  private getSelectionBoundsWorld(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.selectedIds.size === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of this.selectedIds) {
      const entry = this.stamps.get(id);
      if (!entry) continue;
      const halfWidth = (entry.data.nativeWidth / 2) * entry.data.transform.scale.x;
      const halfHeight = (entry.data.nativeHeight / 2) * entry.data.transform.scale.y;
      const corners = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
      ].map((local) => {
        const r = rotatePointAround(local, { x: 0, y: 0 }, entry.data.transform.rotationDegrees);
        return { x: r.x + entry.data.transform.position.x, y: r.y + entry.data.transform.position.y };
      });
      for (const c of corners) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
      }
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  private getRotationHandleWorld(): Vec2 | null {
    const bounds = this.getSelectionBoundsWorld();
    if (!bounds) return null;
    const gap = HANDLE_OFFSET_WORLD_AT_ZOOM_1 / this.world.scale.x;
    return { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY - gap };
  }

  private readonly onPointerDown = (event: FederatedPointerEvent): void => {
    const screen = { x: event.global.x, y: event.global.y };
    const world = this.screenToWorld(screen);

    if (event.button === 2) {
      this.drag = { kind: 'pan', startScreen: screen, startWorldPos: { x: this.world.x, y: this.world.y } };
      return;
    }

    if (this.tool === 'place-stamp') {
      if (!this.pendingStampTexture) return;
      this.placeStamp(world);
      return;
    }

    if (this.tool === 'draw-segment') {
      this.onDrawSegmentClick(world);
      return;
    }

    if (this.tool === 'calibrate' || this.tool === 'measure') {
      this.pendingPoints.push(world);
      if (this.pendingPoints.length === 2) {
        const [p1, p2] = this.pendingPoints;
        this.pendingPoints = [];
        if (this.tool === 'calibrate') {
          this.emitter.emit('calibrationNeeded', p1, p2, (mm) => {
            if (mm !== null && mm > 0) {
              this.calibration = calibrateFromKnownDistance(p1, p2, mm);
              this.emitter.emit('calibrationSet', this.calibration);
              this.setTool('select');
            }
            this.redrawOverlay();
          });
        } else if (this.calibration) {
          this.emitter.emit('measurement', measureRealDistance(p1, p2, this.calibration));
        } else {
          console.warn('[render] measure tool used with no calibration set yet.');
        }
      }
      this.redrawOverlay();
      return;
    }

    // tool === 'select'
    const handle = this.getRotationHandleWorld();
    if (handle) {
      const handleRadiusWorld = HANDLE_HIT_RADIUS_SCREEN_PX / this.world.scale.x;
      if (Math.hypot(world.x - handle.x, world.y - handle.y) <= handleRadiusWorld) {
        const centroidPoint = centroid(this.getSelection().map((s) => s.transform.position));
        this.drag = {
          kind: 'rotate-selection',
          pivot: centroidPoint,
          startPointerAngleDeg: angleDegrees(centroidPoint, world),
          snapshot: this.getSelection().map((s) => ({ id: s.id, transform: s.transform })),
        };
        return;
      }
    }

    const hitId = this.hitTestStamp(world);
    if (hitId) {
      if (event.shiftKey) {
        if (this.selectedIds.has(hitId)) {
          this.selectedIds.delete(hitId);
        } else {
          this.selectedIds.add(hitId);
        }
        this.emitter.emit('selectionChanged', this.getSelection());
        this.redrawOverlay();
        return;
      }
      if (!this.selectedIds.has(hitId)) {
        this.selectedIds = new Set([hitId]);
        this.emitter.emit('selectionChanged', this.getSelection());
      }
      this.drag = {
        kind: 'move-selection',
        startPointerWorld: world,
        snapshot: this.getSelection().map((s) => ({ id: s.id, position: s.transform.position })),
      };
      this.redrawOverlay();
      return;
    }

    if (!event.shiftKey) {
      this.selectedIds.clear();
      this.emitter.emit('selectionChanged', this.getSelection());
    }
    this.drag = { kind: 'rubber-band', startWorld: world, currentWorld: world, additive: event.shiftKey };
    this.redrawOverlay();
  };

  private readonly onPointerMove = (event: FederatedPointerEvent): void => {
    const screen = { x: event.global.x, y: event.global.y };

    if (this.drag.kind === 'pan') {
      this.world.x = this.drag.startWorldPos.x + (screen.x - this.drag.startScreen.x);
      this.world.y = this.drag.startWorldPos.y + (screen.y - this.drag.startScreen.y);
      return;
    }

    const world = this.screenToWorld(screen);

    if (this.drag.kind === 'move-selection') {
      const dx = world.x - this.drag.startPointerWorld.x;
      const dy = world.y - this.drag.startPointerWorld.y;
      for (const { id, position } of this.drag.snapshot) {
        const entry = this.stamps.get(id);
        if (!entry) continue;
        this.setStampTransform(id, { ...entry.data.transform, position: { x: position.x + dx, y: position.y + dy } });
      }
      this.redrawOverlay();
      this.emitter.emit('selectionChanged', this.getSelection());
      return;
    }

    if (this.drag.kind === 'rotate-selection') {
      const currentAngle = angleDegrees(this.drag.pivot, world);
      const rawDelta = currentAngle - this.drag.startPointerAngleDeg;
      const delta = event.shiftKey ? rawDelta : snapToNearest(rawDelta, ROTATE_SNAP_DEGREES);
      const rotated = multiRotate(
        this.drag.snapshot.map((s) => s.transform),
        delta,
      );
      this.drag.snapshot.forEach((s, i) => this.setStampTransform(s.id, rotated[i]));
      this.redrawOverlay();
      this.emitter.emit('selectionChanged', this.getSelection());
      return;
    }

    if (this.drag.kind === 'rubber-band') {
      this.drag = { ...this.drag, currentWorld: world };
      this.redrawOverlay();
    }
  };

  private readonly onPointerUp = (): void => {
    if (this.drag.kind === 'rubber-band') {
      const { startWorld, currentWorld, additive } = this.drag;
      const rectMin = { x: Math.min(startWorld.x, currentWorld.x), y: Math.min(startWorld.y, currentWorld.y) };
      const rectMax = { x: Math.max(startWorld.x, currentWorld.x), y: Math.max(startWorld.y, currentWorld.y) };
      const hits = new Set<string>();
      for (const entry of this.stamps.values()) {
        const halfWidth = (entry.data.nativeWidth / 2) * entry.data.transform.scale.x;
        const halfHeight = (entry.data.nativeHeight / 2) * entry.data.transform.scale.y;
        if (rectIntersectsRotatedRect(rectMin, rectMax, entry.data.transform, halfWidth, halfHeight)) {
          hits.add(entry.data.id);
        }
      }
      this.selectedIds = additive ? new Set([...this.selectedIds, ...hits]) : hits;
      this.emitter.emit('selectionChanged', this.getSelection());
    }
    this.drag = { kind: 'none' };
    this.redrawOverlay();
  };

  private readonly onWheel = (event: FederatedWheelEvent): void => {
    event.preventDefault();
    const screen = { x: event.global.x, y: event.global.y };
    const beforeWorld = this.screenToWorld(screen);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.world.scale.x * factor));
    this.world.scale.set(newZoom);
    this.world.x = screen.x - beforeWorld.x * newZoom;
    this.world.y = screen.y - beforeWorld.y * newZoom;
    this.redrawOverlay();
  };

  private placeStamp(worldPosition: Vec2): void {
    if (!this.pendingStampTexture) return;
    const { texture, nativeWidth, nativeHeight } = this.pendingStampTexture;
    const id = `stamp-${this.nextStampSeq++}`;
    const data: PlacedStamp = {
      id,
      transform: { position: worldPosition, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth,
      nativeHeight,
      ports: [],
    };
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5); // pivot = own center, matching the reference semantics
    const baseScale = { x: nativeWidth / texture.width, y: nativeHeight / texture.height };
    applyTransformToSprite(sprite, data.transform, baseScale);
    this.stamps.set(id, { data, sprite, baseScale });
    this.stampsLayer.addChild(sprite);
    this.selectedIds = new Set([id]);
    this.setTool('select');
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /**
   * Two-click segment drawing: the first click resolves and remembers a
   * start endpoint (without mutating anything yet — see DrawEndpointResolution),
   * the second resolves the end endpoint and applies both endpoints' setup
   * plus the new segment as one CompositeCommand, so "draw a run" is always
   * exactly one undo step, matching the pass criteria's "undo the whole chain."
   */
  private onDrawSegmentClick(world: Vec2): void {
    const snapRadius = this.SNAP_RADIUS_SCREEN_PX / this.world.scale.x;
    const state = this.drawingHistory.getState();
    const stamps = [...this.stamps.values()].map((entry) => entry.data);
    const segments = Object.values(state.segments);
    const fittings = Object.values(state.fittings);

    const target = resolveSegmentEndpoint(world, stamps, fittings, segments, { radius: snapRadius });
    const resolved = this.resolveDrawTarget(target);

    if (!this.pendingSegmentStart) {
      this.pendingSegmentStart = resolved;
      this.redrawOverlay();
      return;
    }

    const start = this.pendingSegmentStart;
    this.pendingSegmentStart = null;

    const newSegment: Segment = {
      id: `segment-${this.nextSegmentSeq++}`,
      pageIndex: 0,
      networkTypeId: DEFAULT_NETWORK_TYPE.id,
      shape: 'round',
      diameter: 200,
      endpointA: start.point,
      endpointB: resolved.point,
      geometry: [start.worldPosition, resolved.worldPosition],
    };

    const subCommands: Command<DrawingState>[] = [];
    if (start.setupCommand) subCommands.push(start.setupCommand);
    if (resolved.setupCommand) subCommands.push(resolved.setupCommand);
    subCommands.push(createSegmentCommand(newSegment));

    this.drawingHistory.execute(new CompositeCommand('Draw segment', subCommands));
    this.syncDrawingLayer();
    this.redrawOverlay();
  }

  private resolveDrawTarget(target: ReturnType<typeof resolveSegmentEndpoint>): DrawEndpointResolution {
    if (target.kind === 'existing') {
      return { point: target.point, worldPosition: target.worldPosition };
    }

    if (target.kind === 'new-fitting') {
      const fitting: Fitting = { id: `fitting-${this.nextFittingSeq++}`, pageIndex: 0, position: target.worldPosition, kind: 'junction' };
      return {
        point: { kind: 'fitting', fittingId: fitting.id },
        worldPosition: target.worldPosition,
        setupCommand: createFittingCommand(fitting),
      };
    }

    // target.kind === 'break': auto-generates a junction at the click point on an existing run.
    const newFitting: Fitting = {
      id: `fitting-${this.nextFittingSeq++}`,
      pageIndex: target.original.pageIndex,
      position: target.breakPoint,
      kind: 'junction',
    };
    const { segmentA, segmentB } = splitSegmentAtFitting(target.original, newFitting, target.breakPoint, {
      segmentA: `segment-${this.nextSegmentSeq++}`,
      segmentB: `segment-${this.nextSegmentSeq++}`,
    });
    const setupCommand = new CompositeCommand(`Break segment ${target.original.id} into a junction`, [
      deleteSegmentCommand(target.original),
      createFittingCommand(newFitting),
      createSegmentCommand(segmentA),
      createSegmentCommand(segmentB),
    ]);
    return { point: { kind: 'fitting', fittingId: newFitting.id }, worldPosition: target.breakPoint, setupCommand };
  }

  private syncDrawingLayer(): void {
    this.drawingLayer.clear();
    const state = this.drawingHistory.getState();
    for (const segment of Object.values(state.segments)) {
      const [start, ...rest] = segment.geometry;
      if (!start || rest.length === 0) continue;
      this.drawingLayer.moveTo(start.x, start.y);
      for (const point of rest) this.drawingLayer.lineTo(point.x, point.y);
      this.drawingLayer.stroke({ width: 3, color: 0xffa726 });
    }
    for (const fitting of Object.values(state.fittings)) {
      this.drawingLayer.circle(fitting.position.x, fitting.position.y, 6).fill({ color: 0xffa726 });
    }
    this.emitter.emit('drawingChanged', this.getDrawingSummary());
  }

  private redrawOverlay(): void {
    this.overlay.clear();

    for (const id of this.selectedIds) {
      const entry = this.stamps.get(id);
      if (!entry) continue;
      const halfWidth = (entry.data.nativeWidth / 2) * entry.data.transform.scale.x;
      const halfHeight = (entry.data.nativeHeight / 2) * entry.data.transform.scale.y;
      const corners = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight },
      ].map((local) => {
        const r = rotatePointAround(local, { x: 0, y: 0 }, entry.data.transform.rotationDegrees);
        return { x: r.x + entry.data.transform.position.x, y: r.y + entry.data.transform.position.y };
      });
      this.overlay.moveTo(corners[0].x, corners[0].y);
      for (const c of corners.slice(1)) this.overlay.lineTo(c.x, c.y);
      this.overlay.closePath();
      this.overlay.stroke({ width: 2 / this.world.scale.x, color: 0x00e5ff });
    }

    const handle = this.getRotationHandleWorld();
    if (handle) {
      this.overlay.circle(handle.x, handle.y, HANDLE_HIT_RADIUS_SCREEN_PX / this.world.scale.x);
      this.overlay.fill({ color: 0x00e5ff, alpha: 0.85 });
    }

    if (this.drag.kind === 'rubber-band') {
      const { startWorld, currentWorld } = this.drag;
      const x = Math.min(startWorld.x, currentWorld.x);
      const y = Math.min(startWorld.y, currentWorld.y);
      const w = Math.abs(currentWorld.x - startWorld.x);
      const h = Math.abs(currentWorld.y - startWorld.y);
      this.overlay
        .rect(x, y, w, h)
        .fill({ color: 0x00e5ff, alpha: 0.1 })
        .stroke({ width: 1 / this.world.scale.x, color: 0x00e5ff });
    }

    for (const p of this.pendingPoints) {
      this.overlay.circle(p.x, p.y, 4 / this.world.scale.x).fill({ color: 0xffb300 });
    }

    if (this.pendingSegmentStart) {
      const p = this.pendingSegmentStart.worldPosition;
      this.overlay.circle(p.x, p.y, 5 / this.world.scale.x).fill({ color: 0xffa726 });
    }
  }
}
