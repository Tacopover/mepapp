import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
} from 'pixi.js';
import {
  calibrateFromKnownDistance,
  centroid,
  CompositeCommand,
  computeNetworks,
  getStampDefinition,
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
  type Annotation,
  type AnnotationGeometry,
  type Calibration,
  type Command,
  type Discipline,
  type Fitting,
  type FlowResult,
  type Network,
  type NetworkType,
  type PlacedStamp,
  type PortGroup,
  type PortSpec,
  type ProjectDocument,
  type ReconciliationReport,
  type Segment,
  type StampCategory,
  type SyncedGeometry,
  type Transform2D,
  type Vec2,
} from '@mepapp/core';
import type { AnnotationGeometry as PdfAnnotationGeometry, PdfDocumentHandle, StoredAnnotation } from '@mepapp/pdf-engine';
import { textureFromImageBitmap } from './texture.js';
import { DEFAULT_NETWORK_TYPE, SketchDocument, type DocumentSummary, type DrawingState, type StampEntry } from './document.js';

export type { DocumentSummary } from './document.js';

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
  const g: PdfAnnotationGeometry = annotation.geometry;
  if (g.kind === 'line') {
    return { id: annotation.id, geometry: { ax: round(g.from.x), ay: round(g.from.y), bx: round(g.to.x), by: round(g.to.y) } };
  }
  if (g.kind === 'circle') {
    // Radius deliberately excluded — this shape is shared with Fitting's constant-radius marker circle (see writeAnnotationForId), whose domain-side entry never carried one either.
    return { id: annotation.id, geometry: { x: round(g.center.x), y: round(g.center.y) } };
  }
  if (g.kind === 'rectangle') {
    return { id: annotation.id, geometry: { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1) } };
  }
  if (g.kind === 'textbox') {
    // Text content isn't compared — SyncedGeometry is numeric-only (see core/pdfSync.ts), so an edit to a textbox's text in another viewer isn't flagged as drift, only a move/resize is.
    return { id: annotation.id, geometry: { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1) } };
  }
  if (g.kind === 'freehand') {
    const geometry: Record<string, number> = { count: g.points.length };
    g.points.forEach((p, i) => {
      geometry[`x${i}`] = round(p.x);
      geometry[`y${i}`] = round(p.y);
    });
    return { id: annotation.id, geometry };
  }
  if (g.kind === 'stamp') {
    return { id: annotation.id, geometry: { x: round(g.position.x), y: round(g.position.y), rotationDegrees: round(g.rotationDegrees) } };
  }
  return null;
}

/** Domain-side counterpart to annotationSyncEntry's per-kind geometry snapshot, from core's own Annotation.geometry rather than an observed PDF annotation — kept in the same shape by hand so sync comparison lines up, same split as the segment/fitting/stamp cases in domainSyncEntries below. */
function domainAnnotationGeometry(g: AnnotationGeometry): Record<string, number> {
  if (g.kind === 'line') {
    return { ax: round(g.from.x), ay: round(g.from.y), bx: round(g.to.x), by: round(g.to.y) };
  }
  if (g.kind === 'circle') {
    return { x: round(g.center.x), y: round(g.center.y) };
  }
  if (g.kind === 'rectangle') {
    return { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1) };
  }
  if (g.kind === 'textbox') {
    return { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1) };
  }
  const geometry: Record<string, number> = { count: g.points.length };
  g.points.forEach((p, i) => {
    geometry[`x${i}`] = round(p.x);
    geometry[`y${i}`] = round(p.y);
  });
  return geometry;
}

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

/** One command per whole annotation (a freehand stroke's every point included) — never one command per point, so undoing a drawn annotation is always a single step. */
function createAnnotationCommand(annotation: Annotation): Command<DrawingState> {
  return {
    description: `Create annotation ${annotation.id}`,
    execute: (state) => ({ ...state, annotations: { ...state.annotations, [annotation.id]: annotation } }),
    undo: (state) => ({ ...state, annotations: withoutKey(state.annotations, annotation.id) }),
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

// A draw-shape drag shorter than this (screen px, zoom-independent — see
// onPointerUp's 'draw-shape' case) is treated as a stray click, not a
// zero-size rectangle/circle nobody meant to create.
const MIN_SHAPE_DRAG_SCREEN_PX = 3;
// A textbox annotation has no drag-to-size gesture (it's a single click, see
// onPointerDown's 'draw-textbox' case) — this is its placeholder rect size in
// PDF points, matching AnnotationGeometry's 'textbox' rect shape.
const DEFAULT_TEXTBOX_WIDTH_PT = 160;
const DEFAULT_TEXTBOX_HEIGHT_PT = 40;

export interface StampInfo {
  id: string;
  category: StampCategory;
  transform: Transform2D;
  nativeWidth: number;
  nativeHeight: number;
  ports: PortSpec[];
  /** This element's PortGroup membership (see core's PortGroup doc comment), or null if its ports aren't linked. */
  linkedPortIds: string[] | null;
  /** Set when this stamp was placed from the stamp palette rather than an ad hoc uploaded PNG — see PlacedStamp.definitionId. */
  definitionId?: string;
}

export type SketchTool =
  | 'select'
  | 'pan'
  | 'place-terminal'
  | 'place-equipment'
  | 'calibrate'
  | 'measure'
  | 'draw-segment'
  | 'draw-freehand'
  | 'draw-line'
  | 'draw-shape'
  | 'draw-textbox';

/**
 * Resolves a stamp-library iconRef to loaded image bytes — `loadProjectFromJson`'s
 * way of rebuilding restored stamps' sprites without `SketchScene` itself owning a
 * fetch call, matching the layering that `StampsPanel`'s `resolveIconUrl` prop
 * already establishes (apps/web owns where stamp art actually lives on disk).
 */
export type IconBitmapResolver = (iconRef: string) => Promise<ImageBitmap>;

export interface DrawingSummary {
  segmentCount: number;
  fittingCount: number;
  annotationCount: number;
  networkCount: number;
  canUndo: boolean;
  canRedo: boolean;
}

/** One derived network, resolved against its NetworkType for display — the Layers panel's read model. Recomputed from live topology on every call, same as DrawingSummary. */
export interface NetworkSummary {
  id: string;
  networkTypeId: string;
  networkTypeName: string;
  discipline: Discipline;
  segmentCount: number;
  fittingCount: number;
}

interface SketchSceneEvents {
  [key: string]: unknown[];
  selectionChanged: [StampInfo[]];
  toolChanged: [SketchTool];
  calibrationNeeded: [p1: Vec2, p2: Vec2, resolve: (knownRealDistanceMm: number | null) => void];
  calibrationSet: [Calibration];
  measurement: [distanceMm: number];
  /** The draw-textbox tool was clicked — the UI's cue to show a floating text input at screenPosition (container-relative pixels) and call resolve with the committed text, or null to cancel. */
  textboxRequested: [screenPosition: Vec2, resolve: (text: string | null) => void];
  drawingChanged: [DrawingSummary];
  flowSolved: [FlowResult[]];
  projectLoaded: [];
  zoomChanged: [zoom: number];
  /** The active network type, or a per-document network type's name, changed — the Stamps tab's Network Types section's cue to re-render. */
  networkTypesChanged: [NetworkType[]];
  /** A different document became active — everything (selection, stamps, networks, calibration, drawing summary, flow result, zoom) should be re-pulled via the getters, not diffed. */
  documentActivated: [];
  /** The open-document list, a document's name, or its dirty flag changed — the Drawings tab's cue to re-render. */
  documentsChanged: [DocumentSummary[]];
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
  | { kind: 'rubber-band'; startWorld: Vec2; currentWorld: Vec2; additive: boolean }
  | { kind: 'draw-freehand'; points: Vec2[] }
  | { kind: 'draw-shape'; shapeKind: 'rectangle' | 'circle'; startWorld: Vec2; currentWorld: Vec2 };

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
  private readonly overlay = new Graphics();
  // Every open document, kept fully resident (sprites/textures/undo history
  // and all) — see decisions log 2026-09-07's multi-document plan, D1.
  // SketchScene renders whichever one is active; switching just reparents
  // that document's own layers into `world`, nothing is rebuilt or reloaded.
  private readonly documents: SketchDocument[] = [];
  private activeId: string;
  private tool: SketchTool = 'select';
  private activeNetworkTypeId: string = DEFAULT_NETWORK_TYPE.id;
  private pendingStampTexture: { texture: Texture; nativeWidth: number; nativeHeight: number; definitionId?: string } | null = null;
  private pendingPoints: Vec2[] = []; // shared scratch for calibrate/measure two-click flows
  private drag: DragState = { kind: 'none' };
  private readonly emitter = new TypedEmitter<SketchSceneEvents>();
  private pendingSegmentStart: DrawEndpointResolution | null = null;
  private readonly SNAP_RADIUS_SCREEN_PX = 12;
  private static readonly FITTING_MARKER_RADIUS_PT = 4;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly container: HTMLElement) {
    const first = new SketchDocument();
    this.documents.push(first);
    this.activeId = first.id;
  }

  /** The active document — every per-document read/mutation goes through this. */
  private get doc(): SketchDocument {
    const found = this.documents.find((d) => d.id === this.activeId);
    if (!found) throw new Error('SketchScene invariant violated: no active document'); // there is always >= 1, see closeDocument
    return found;
  }

  async init(): Promise<void> {
    await this.app.init({
      background: '#e7edf0', // Field Blueprint's --canvas-bg (packages/ui/src/theme.css) — kept a literal color since render stays framework/theme-agnostic, not a CSS var consumer.
      antialias: true,
      eventFeatures: { move: true, globalMove: true, click: true, wheel: true },
    });
    this.container.appendChild(this.app.canvas);

    // Pixi's own `resizeTo` option only re-measures on the browser's `window`
    // resize event — it never notices the container itself changing size,
    // e.g. dragging the right-dock's width handle or collapsing it. That left
    // the canvas element frozen at its last-known size while its flex-layout
    // container grew or shrank around it, exposing a dead strip of raw clear
    // color (or, growing, an overflowing canvas silently clipped by the
    // container's `overflow: hidden`). Watch the container directly instead.
    const resize = () => this.app.renderer.resize(this.container.clientWidth, this.container.clientHeight);
    resize();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(this.container);

    this.world.addChild(this.doc.stampsLayer);
    this.world.addChild(this.doc.drawingLayer);
    this.world.addChild(this.doc.annotationTextLayer);
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
    this.resizeObserver?.disconnect();
    for (const document of this.documents) document.destroy();
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
   * Opens a PDF page as a new document, or into the currently active one if
   * it's still empty (so the app's initial blank canvas doesn't linger as a
   * permanent extra tab the moment the first PDF is opened — see decisions
   * log 2026-09-07). Always activates the resulting document. Reopening a
   * file already open elsewhere in the list should be checked for via
   * findDocumentByFileKey *before* calling this (skips the re-parse
   * entirely) — this method itself does not dedupe.
   */
  openDocument(
    bitmap: ImageBitmap,
    pageWidthPt: number,
    pageHeightPt: number,
    opts: { fileKey: string; fileName: string; handle: PdfDocumentHandle },
  ): string {
    const reuse = this.doc.isEmpty() ? this.doc : null;
    const target = reuse ?? new SketchDocument();
    if (!reuse) this.documents.push(target);

    target.fileKey = opts.fileKey;
    target.fileName = opts.fileName;
    target.pdfHandle = opts.handle;
    const sprite = new Sprite(textureFromImageBitmap(bitmap));
    sprite.anchor.set(0);
    sprite.width = pageWidthPt;
    sprite.height = pageHeightPt;
    target.backdropSprite = sprite;
    target.isDirty = false;

    if (target.id === this.activeId) {
      this.world.addChildAt(sprite, 0); // already the active, reused doc — just attach the backdrop
    } else {
      this.doc.viewport = { x: this.world.x, y: this.world.y, scale: this.world.scale.x };
      this.activateInternal(target);
    }
    this.emitter.emit('documentsChanged', this.getDocuments());
    return target.id;
  }

  /** Public, cheap pre-check so a caller can skip re-parsing a file that's already open — see decisions log 2026-09-07, D3. */
  findDocumentByFileKey(fileKey: string): string | null {
    return this.documents.find((d) => d.fileKey === fileKey)?.id ?? null;
  }

  /** Updates a document's displayed file name (e.g. after a "Save As" picks a new location) — doesn't touch fileKey, so it stays matched against its original source file for the re-open dedupe check above. */
  renameDocument(id: string, fileName: string): void {
    const target = this.documents.find((d) => d.id === id);
    if (!target) return;
    target.fileName = fileName;
    this.emitter.emit('documentsChanged', this.getDocuments());
  }

  activateDocument(id: string): void {
    if (id === this.activeId) return;
    const target = this.documents.find((d) => d.id === id);
    if (!target) return;
    this.doc.viewport = { x: this.world.x, y: this.world.y, scale: this.world.scale.x };
    this.activateInternal(target);
  }

  /** Destroys the document's PixiJS resources and removes it. Never confirms — an unsaved-changes check is the caller's job (see doc.isDirty / getDocuments()). */
  closeDocument(id: string): void {
    const idx = this.documents.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const removed = this.documents[idx];
    const wasActive = removed.id === this.activeId;
    this.documents.splice(idx, 1);

    if (this.documents.length === 0) {
      this.documents.push(new SketchDocument()); // invariant: always >= 1 open document
    }
    if (wasActive) {
      const next = this.documents[Math.min(idx, this.documents.length - 1)];
      this.activateInternal(next);
    }
    removed.destroy();
    this.emitter.emit('documentsChanged', this.getDocuments());
  }

  getDocuments(): DocumentSummary[] {
    return this.documents.map((d) => d.toSummary());
  }

  getActiveDocumentId(): string {
    return this.activeId;
  }

  getActivePdfHandle(): PdfDocumentHandle | null {
    return this.doc.pdfHandle;
  }

  getFlowResult(): FlowResult[] | null {
    return this.doc.lastFlowResult;
  }

  /** Reparents the given document's layers into `world`, restores its viewport, resets transient interaction state, and announces the switch. Assumes the outgoing document's viewport has already been saved by the caller. */
  private activateInternal(target: SketchDocument): void {
    this.activeId = target.id;
    this.world.removeChildren();
    if (target.backdropSprite) this.world.addChild(target.backdropSprite);
    this.world.addChild(target.stampsLayer);
    this.world.addChild(target.drawingLayer);
    this.world.addChild(target.annotationTextLayer);
    this.world.addChild(this.overlay);
    this.world.x = target.viewport.x;
    this.world.y = target.viewport.y;
    this.world.scale.set(target.viewport.scale);

    this.tool = 'select';
    this.activeNetworkTypeId = DEFAULT_NETWORK_TYPE.id; // per-document context, same reset rule as `tool`
    this.pendingStampTexture = null;
    this.pendingPoints = [];
    this.pendingSegmentStart = null;
    this.drag = { kind: 'none' };

    this.redrawOverlay();
    this.emitter.emit('toolChanged', this.tool);
    this.emitter.emit('networkTypesChanged', target.networkTypes);
    this.emitter.emit('zoomChanged', this.world.scale.x);
    this.emitter.emit('documentActivated');
  }

  private markDirty(): void {
    if (this.doc.isDirty) return;
    this.doc.isDirty = true;
    this.emitter.emit('documentsChanged', this.getDocuments());
  }

  private markClean(): void {
    if (!this.doc.isDirty) return;
    this.doc.isDirty = false;
    this.emitter.emit('documentsChanged', this.getDocuments());
  }

  /** Sets the stamp art the next 'place-terminal'/'place-equipment' click will place. definitionId, when given (the stamp palette's case, vs. an ad hoc uploaded PNG), is carried onto the resulting PlacedStamp. */
  setStampTexture(bitmap: ImageBitmap, definitionId?: string): void {
    const texture = textureFromImageBitmap(bitmap);
    this.pendingStampTexture = {
      texture,
      nativeWidth: (texture.width * 72) / STAMP_SOURCE_DPI,
      nativeHeight: (texture.height * 72) / STAMP_SOURCE_DPI,
      definitionId,
    };
  }

  private toStampInfo(entry: StampEntry): StampInfo {
    return {
      id: entry.data.id,
      category: entry.data.category,
      transform: entry.data.transform,
      nativeWidth: entry.data.nativeWidth,
      nativeHeight: entry.data.nativeHeight,
      ports: entry.data.ports,
      linkedPortIds: this.doc.portGroups.find((g) => g.elementId === entry.data.id)?.portIds ?? null,
      definitionId: entry.data.definitionId,
    };
  }

  getSelection(): StampInfo[] {
    return [...this.doc.selectedIds]
      .map((id) => this.doc.stamps.get(id))
      .filter((e): e is StampEntry => e !== undefined)
      .map((e) => this.toStampInfo(e));
  }

  /** Every placed stamp, not just the current selection — the Layers panel's "Elements" list. */
  listStamps(): StampInfo[] {
    return [...this.doc.stamps.values()].map((e) => this.toStampInfo(e));
  }

  /** Derives the current network topology (see core's computeNetworks) resolved against known network types — the Layers panel's "Networks" list. */
  getNetworkSummaries(): NetworkSummary[] {
    const state = this.doc.drawingHistory.getState();
    const segments = Object.values(state.segments);
    const fittings = Object.values(state.fittings);
    const networks = computeNetworks({ segments, fittings, portGroups: this.doc.portGroups });
    const typeById = new Map(this.doc.networkTypes.map((t) => [t.id, t]));
    return networks.map((network: Network) => {
      const type = typeById.get(network.networkTypeId) ?? DEFAULT_NETWORK_TYPE;
      return {
        id: network.id,
        networkTypeId: network.networkTypeId,
        networkTypeName: type.name,
        discipline: type.discipline,
        segmentCount: network.segmentIds.length,
        fittingCount: network.fittingIds.length,
      };
    });
  }

  getCalibration(): Calibration | null {
    return this.doc.calibration;
  }

  getDrawingSummary(): DrawingSummary {
    const state = this.doc.drawingHistory.getState();
    const networks = computeNetworks({
      segments: Object.values(state.segments),
      fittings: Object.values(state.fittings),
      portGroups: this.doc.portGroups,
    });
    return {
      segmentCount: Object.keys(state.segments).length,
      fittingCount: Object.keys(state.fittings).length,
      annotationCount: Object.keys(state.annotations).length,
      networkCount: networks.length,
      canUndo: this.doc.drawingHistory.canUndo,
      canRedo: this.doc.drawingHistory.canRedo,
    };
  }

  undoDrawing(): void {
    this.doc.drawingHistory.undo();
    this.syncDrawingLayer();
    this.markDirty();
  }

  redoDrawing(): void {
    this.doc.drawingHistory.redo();
    this.syncDrawingLayer();
    this.markDirty();
  }

  /** Every network type known to the active document — the effective library the Stamps tab's Network Types section renders (falls back to the static NETWORK_TYPE_LIBRARY entry for any type never yet picked). */
  getNetworkTypes(): NetworkType[] {
    return this.doc.networkTypes;
  }

  /**
   * Marks `type` as what the next drawn segment gets tagged with (see
   * onDrawSegmentClick). Adds it to the active document's own `networkTypes`
   * list the first time it's picked — `getNetworkSummaries`/`exportProject`
   * both read from that per-document list, not the static library, so a type
   * has to actually be adopted by a document before it can be resolved or
   * saved, same as how a stamp definition isn't "real" until placed.
   */
  setActiveNetworkType(type: NetworkType): void {
    if (!this.doc.networkTypes.some((t) => t.id === type.id)) {
      this.doc.networkTypes.push(type);
    }
    this.activeNetworkTypeId = type.id;
    this.emitter.emit('networkTypesChanged', this.doc.networkTypes);
  }

  /** Renames a network type already adopted by the active document (see setActiveNetworkType) — the Network Type Editor pencil icon's action. No-op if `id` hasn't been picked in this document yet. */
  renameNetworkType(id: string, name: string): void {
    const target = this.doc.networkTypes.find((t) => t.id === id);
    if (!target) return;
    target.name = name;
    this.emitter.emit('networkTypesChanged', this.doc.networkTypes);
  }

  /** User-entered capacity for a terminal/equipment stamp — the only input solveFlow reads per element (see core/flow.ts). */
  setTerminalCapacity(elementId: string, capacity: number): void {
    this.doc.terminalCapacities.set(elementId, capacity);
  }

  /**
   * Links (or re-links) which of an element's own ports collapse into one
   * connectivity node — e.g. an AHU's supply and return ports, so a segment
   * drawn between them doesn't bridge supply into return (core's PortGroup
   * doc comment). An empty portIds clears any existing group for this
   * element. A single portId is stored as-is (a one-port "group" behaves
   * identically to no group in nodeKeyOf) rather than silently dropped —
   * dropping it would make checking one port in the UI immediately revert to
   * unchecked while the user is still picking a second one.
   */
  setPortGroup(elementId: string, portIds: string[]): void {
    const groups = this.doc.portGroups;
    const existingIndex = groups.findIndex((g) => g.elementId === elementId);
    if (existingIndex !== -1) groups.splice(existingIndex, 1);
    if (portIds.length > 0) groups.push({ elementId, portIds });
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /**
   * Runs the capacity-accumulation flow solve (core/flow.ts) over every
   * derived network and returns one FlowResult per network. Networks are
   * recomputed from current topology on every call — there is no stored
   * NetworkId to go stale, unlike the old app (see decisions log 2026-09-06).
   */
  computeFlow(): FlowResult[] {
    const state = this.doc.drawingHistory.getState();
    const segments = Object.values(state.segments);
    const fittings = Object.values(state.fittings);
    const networks = computeNetworks({ segments, fittings, portGroups: this.doc.portGroups });
    const capacities = Object.fromEntries(this.doc.terminalCapacities);
    this.doc.lastFlowResult = networks.map((network: Network) =>
      solveFlow({ network, segments, fittings, portGroups: this.doc.portGroups, terminalCapacities: capacities }),
    );
    this.emitter.emit('flowSolved', this.doc.lastFlowResult);
    return this.doc.lastFlowResult;
  }

  exportProject(): ProjectDocument {
    const state = this.doc.drawingHistory.getState();
    return serializeProject({
      networkTypes: this.doc.networkTypes,
      segments: Object.values(state.segments),
      fittings: Object.values(state.fittings),
      stamps: [...this.doc.stamps.values()].map((entry) => entry.data),
      portGroups: this.doc.portGroups,
      annotations: Object.values(state.annotations),
    }) as unknown as ProjectDocument;
  }

  /**
   * Loads a saved project, running it through core's schema migration first
   * (see decisions log 2026-09-06). Throws core's ProjectLoadError on a
   * malformed document — callers should catch it for a user-facing message.
   *
   * Restores segments/fittings/network types, plus every placed stamp that
   * carries a `definitionId` (placed from the stamp palette) — its art is
   * re-fetched via `resolveIconBitmap`, the same layering `StampsPanel` uses,
   * so `SketchScene` never owns a fetch call itself. A stamp with no
   * `definitionId` (an ad hoc uploaded PNG/SVG) has no image bytes saved
   * anywhere, so it cannot be rebuilt and is left out of the restored scene —
   * a disclosed gap, not a silent failure. Omitting `resolveIconBitmap`
   * restores everything except stamps, same as before this method could
   * rebuild sprites (e.g. call sites that don't yet wire the callback).
   *
   * Rebuilding a sprite per stamp awaits an icon fetch, so this method is
   * async — and the active document can change mid-await if the user
   * switches tabs. The target document is captured once up front and every
   * mutation goes through that captured reference, never a fresh `this.doc`
   * read, so a tab switch mid-load can't spill restored state into the wrong
   * document. Scene-wide notifications (redraw, dirty/clean, `projectLoaded`)
   * only fire if that document is still the active one when the load
   * finishes; otherwise the restored state sits ready and is picked up
   * normally via `documentActivated` the next time the user switches back.
   */
  async loadProjectFromJson(raw: unknown, resolveIconBitmap?: IconBitmapResolver): Promise<void> {
    const doc = loadProject(raw as Record<string, unknown>);
    const target = this.doc;

    target.drawingHistory.clear();
    target.drawingHistory.setLiveState({
      segments: Object.fromEntries(doc.segments.map((s) => [s.id, s])),
      fittings: Object.fromEntries(doc.fittings.map((f) => [f.id, f])),
      annotations: Object.fromEntries(doc.annotations.map((a) => [a.id, a])),
    });
    target.networkTypes.splice(0, target.networkTypes.length, ...(doc.networkTypes.length > 0 ? doc.networkTypes : [DEFAULT_NETWORK_TYPE]));
    target.portGroups.splice(0, target.portGroups.length, ...doc.portGroups);

    let maxAnnotationSeq = 0;
    for (const annotation of doc.annotations) {
      const numericSuffix = /^annotation-(\d+)$/.exec(annotation.id)?.[1];
      if (numericSuffix) maxAnnotationSeq = Math.max(maxAnnotationSeq, Number(numericSuffix));
    }
    target.nextAnnotationSeq = Math.max(target.nextAnnotationSeq, maxAnnotationSeq + 1);

    for (const entry of target.stamps.values()) entry.sprite.destroy({ texture: true });
    target.stamps.clear();
    target.stampsLayer.removeChildren();

    let maxStampSeq = 0;
    for (const stampData of doc.stamps) {
      const numericSuffix = /^stamp-(\d+)$/.exec(stampData.id)?.[1];
      if (numericSuffix) maxStampSeq = Math.max(maxStampSeq, Number(numericSuffix));

      if (!stampData.definitionId || !resolveIconBitmap) continue; // ad hoc upload, or no resolver wired — leave it out, see doc comment above
      const definition = getStampDefinition(stampData.definitionId);
      if (!definition) continue; // stamp library changed since this project was saved

      const bitmap = await resolveIconBitmap(definition.iconRef);
      const texture = textureFromImageBitmap(bitmap);
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5); // matches placeStamp's pivot convention
      const baseScale = { x: stampData.nativeWidth / texture.width, y: stampData.nativeHeight / texture.height };
      applyTransformToSprite(sprite, stampData.transform, baseScale);
      target.stamps.set(stampData.id, { data: stampData, sprite, baseScale });
      target.stampsLayer.addChild(sprite);
    }
    target.nextStampSeq = Math.max(target.nextStampSeq, maxStampSeq + 1);
    target.isDirty = false;

    if (target === this.doc) {
      this.syncDrawingLayer();
      this.emitter.emit('documentsChanged', this.getDocuments());
      this.emitter.emit('projectLoaded');
    }
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
    const plan = planPdfSync(domainEntries, observed, this.doc.pdfSyncIds);

    for (const id of plan.toDelete) {
      await handle.deleteAnnotation(id);
      this.doc.pdfSyncIds.delete(id);
    }
    for (const id of plan.toUpdate) {
      // The interface has no "update in place" — an update is a delete then
      // recreate under the same id.
      await handle.deleteAnnotation(id);
      await this.writeAnnotationForId(handle, id);
    }
    for (const id of plan.toCreate) {
      await this.writeAnnotationForId(handle, id);
      this.doc.pdfSyncIds.add(id);
    }

    await handle.setEmbeddedFile(EMBEDDED_PROJECT_FILENAME, new TextEncoder().encode(JSON.stringify(this.exportProject())));
    this.markClean();
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
  async loadFromPdf(handle: PdfDocumentHandle, resolveIconBitmap?: IconBitmapResolver): Promise<ReconciliationReport> {
    const embedded = await handle.getEmbeddedFile(EMBEDDED_PROJECT_FILENAME);
    if (embedded) {
      await this.loadProjectFromJson(JSON.parse(new TextDecoder().decode(embedded)), resolveIconBitmap);
    }

    const domainEntries = this.domainSyncEntries();
    const observed = (await handle.listAnnotations(0)).map(annotationSyncEntry).filter((e): e is SyncedGeometry => e !== null);
    const report = reconcilePdfSync(domainEntries, observed);

    this.doc.pdfSyncIds = new Set([...report.matchedIds, ...report.drifted.map((d) => d.id)]);
    return report;
  }

  private domainSyncEntries(): SyncedGeometry[] {
    const state = this.doc.drawingHistory.getState();
    const entries: SyncedGeometry[] = [];
    for (const segment of Object.values(state.segments)) {
      const [a, b] = segment.geometry;
      if (!a || !b) continue;
      entries.push({ id: segment.id, geometry: { ax: round(a.x), ay: round(a.y), bx: round(b.x), by: round(b.y) } });
    }
    for (const fitting of Object.values(state.fittings)) {
      entries.push({ id: fitting.id, geometry: { x: round(fitting.position.x), y: round(fitting.position.y) } });
    }
    for (const entry of this.doc.stamps.values()) {
      const bounds = this.stampWorldBounds(entry);
      entries.push({
        id: entry.data.id,
        geometry: { x: round(bounds.minX), y: round(bounds.minY), rotationDegrees: round(entry.data.transform.rotationDegrees) },
      });
    }
    for (const annotation of Object.values(state.annotations)) {
      entries.push({ id: annotation.id, geometry: domainAnnotationGeometry(annotation.geometry) });
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
    const state = this.doc.drawingHistory.getState();
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
    const stampEntry = this.doc.stamps.get(id);
    if (stampEntry) {
      // Extracting the live sprite directly comes back fully blank whenever
      // it's placed away from world origin: PixiJS's extract sizes the output
      // to the target's local (untranslated) bounds but still renders it
      // through its full world transform, so the placed sprite's actual
      // pixels land outside that small viewport and nothing is captured.
      // A same-texture/rotation/scale clone left at position (0,0) — never
      // added to any container — sidesteps the translation issue, but extract
      // treats its `target` as a render-group root, and a root's OWN local
      // transform (rotation/scale included, not just position) is never
      // applied to itself — only to descendants (see getLocalBounds's isRoot
      // branch). So a rotated extractionSprite passed directly as `target`
      // extracts un-rotated at native pixel size, which is exactly what a
      // rotated stamp did: right image, wrong orientation and aspect ratio.
      // Nesting it one level inside a bare Container root sidesteps that too
      // — the rotation/scale now lives on a non-root descendant, so both the
      // bounds calc and the actual render pick it up. The extracted PNG still
      // reflects rotation baked into its pixels — the adapter does not
      // rotate pngBytes itself (see AnnotationGeometry's 'stamp' doc comment
      // in @mepapp/pdf-engine).
      const extractionSprite = new Sprite(stampEntry.sprite.texture);
      extractionSprite.anchor.set(0.5);
      extractionSprite.rotation = stampEntry.sprite.rotation;
      extractionSprite.scale.copyFrom(stampEntry.sprite.scale);
      const extractionRoot = new Container();
      extractionRoot.addChild(extractionSprite);
      const pngBytes = dataUrlToBytes(await this.app.renderer.extract.base64({ target: extractionRoot, format: 'png' }));
      extractionRoot.destroy(); // the shared texture is owned by stampEntry.sprite, not extractionSprite — never { children: true, texture: true } here
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
      return;
    }
    const annotation = state.annotations[id];
    if (annotation) {
      await handle.addAnnotation({ id, kind: annotation.geometry.kind, pageIndex: annotation.pageIndex, geometry: annotation.geometry });
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
      const id = `bench-${this.doc.nextStampSeq++}`;
      const nativeWidth = 40 + Math.random() * 40;
      const nativeHeight = 40 + Math.random() * 40;
      const data: PlacedStamp = {
        id,
        category: 'terminal', // arbitrary — this is placeholder art for a redraw-cost benchmark, not a real placement
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
      this.doc.stamps.set(id, { data, sprite, baseScale });
      this.doc.stampsLayer.addChild(sprite);
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
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Typed-degree entry: free-form, no snapping, single-selection only. */
  setSelectedRotationDegrees(degrees: number): void {
    if (this.doc.selectedIds.size !== 1) return;
    const [id] = this.doc.selectedIds;
    const entry = this.doc.stamps.get(id);
    if (!entry) return;
    this.setStampTransform(id, { ...entry.data.transform, rotationDegrees: normalizeDegrees(degrees) });
    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Typed-position entry (Properties panel X/Y fields): single-selection only, same pattern as setSelectedRotationDegrees. */
  setSelectedPosition(position: Vec2): void {
    if (this.doc.selectedIds.size !== 1) return;
    const [id] = this.doc.selectedIds;
    const entry = this.doc.stamps.get(id);
    if (!entry) return;
    this.setStampTransform(id, { ...entry.data.transform, position });
    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Current world scale (1 = 100%) — the status bar's zoom readout. */
  getZoom(): number {
    return this.world.scale.x;
  }

  private setStampTransform(id: string, transform: Transform2D): void {
    const entry = this.doc.stamps.get(id);
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
    const ordered = [...this.doc.stamps.values()].reverse(); // topmost first
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
    if (this.doc.selectedIds.size === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of this.doc.selectedIds) {
      const entry = this.doc.stamps.get(id);
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

    if (event.button === 2 || this.tool === 'pan') {
      this.drag = { kind: 'pan', startScreen: screen, startWorldPos: { x: this.world.x, y: this.world.y } };
      return;
    }

    if (this.tool === 'place-terminal' || this.tool === 'place-equipment') {
      if (!this.pendingStampTexture) return;
      this.placeStamp(world, this.tool === 'place-terminal' ? 'terminal' : 'equipment');
      return;
    }

    if (this.tool === 'draw-segment') {
      this.onDrawSegmentClick(world);
      return;
    }

    if (this.tool === 'draw-freehand') {
      this.drag = { kind: 'draw-freehand', points: [world] };
      this.redrawOverlay();
      return;
    }

    if (this.tool === 'draw-line') {
      this.pendingPoints.push(world);
      if (this.pendingPoints.length === 2) {
        const [from, to] = this.pendingPoints;
        this.pendingPoints = [];
        const annotation: Annotation = { id: `annotation-${this.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: 'line', from, to } };
        this.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        this.syncDrawingLayer();
        this.markDirty();
      }
      this.redrawOverlay();
      return;
    }

    if (this.tool === 'draw-shape') {
      // Plain drag = rectangle (opposite corners); Shift+drag = circle (start point is the center, drag distance is the radius) — one tool covering both shapes per the atlas' "generalized shape tool", disambiguated the same way rotate-selection already uses shiftKey for a modifier (see onPointerMove's 'rotate-selection' case).
      this.drag = { kind: 'draw-shape', shapeKind: event.shiftKey ? 'circle' : 'rectangle', startWorld: world, currentWorld: world };
      this.redrawOverlay();
      return;
    }

    if (this.tool === 'draw-textbox') {
      this.emitter.emit('textboxRequested', screen, (text) => {
        const trimmed = text?.trim();
        if (trimmed) {
          const annotation: Annotation = {
            id: `annotation-${this.doc.nextAnnotationSeq++}`,
            pageIndex: 0,
            geometry: { kind: 'textbox', rect: { x0: world.x, y0: world.y, x1: world.x + DEFAULT_TEXTBOX_WIDTH_PT, y1: world.y + DEFAULT_TEXTBOX_HEIGHT_PT }, text: trimmed },
          };
          this.doc.drawingHistory.execute(createAnnotationCommand(annotation));
          this.syncDrawingLayer();
          this.markDirty();
          this.setTool('select'); // one-shot, matching placeStamp's revert-after-place convention
        }
        this.redrawOverlay();
      });
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
              this.doc.calibration = calibrateFromKnownDistance(p1, p2, mm);
              this.emitter.emit('calibrationSet', this.doc.calibration);
              this.setTool('select');
            }
            this.redrawOverlay();
          });
        } else if (this.doc.calibration) {
          this.emitter.emit('measurement', measureRealDistance(p1, p2, this.doc.calibration));
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
        if (this.doc.selectedIds.has(hitId)) {
          this.doc.selectedIds.delete(hitId);
        } else {
          this.doc.selectedIds.add(hitId);
        }
        this.emitter.emit('selectionChanged', this.getSelection());
        this.redrawOverlay();
        return;
      }
      if (!this.doc.selectedIds.has(hitId)) {
        this.doc.selectedIds = new Set([hitId]);
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
      this.doc.selectedIds.clear();
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
        const entry = this.doc.stamps.get(id);
        if (!entry) continue;
        this.setStampTransform(id, { ...entry.data.transform, position: { x: position.x + dx, y: position.y + dy } });
      }
      this.redrawOverlay();
      this.markDirty();
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
      this.markDirty();
      this.emitter.emit('selectionChanged', this.getSelection());
      return;
    }

    if (this.drag.kind === 'rubber-band') {
      this.drag = { ...this.drag, currentWorld: world };
      this.redrawOverlay();
    }

    if (this.drag.kind === 'draw-freehand') {
      this.drag = { ...this.drag, points: [...this.drag.points, world] };
      this.redrawOverlay();
    }

    if (this.drag.kind === 'draw-shape') {
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
      for (const entry of this.doc.stamps.values()) {
        const halfWidth = (entry.data.nativeWidth / 2) * entry.data.transform.scale.x;
        const halfHeight = (entry.data.nativeHeight / 2) * entry.data.transform.scale.y;
        if (rectIntersectsRotatedRect(rectMin, rectMax, entry.data.transform, halfWidth, halfHeight)) {
          hits.add(entry.data.id);
        }
      }
      this.doc.selectedIds = additive ? new Set([...this.doc.selectedIds, ...hits]) : hits;
      this.emitter.emit('selectionChanged', this.getSelection());
    }

    if (this.drag.kind === 'draw-freehand' && this.drag.points.length >= 2) {
      const annotation: Annotation = { id: `annotation-${this.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: 'freehand', points: this.drag.points } };
      this.doc.drawingHistory.execute(createAnnotationCommand(annotation));
      this.syncDrawingLayer();
      this.markDirty();
    }

    if (this.drag.kind === 'draw-shape') {
      const { shapeKind, startWorld, currentWorld } = this.drag;
      const dx = currentWorld.x - startWorld.x;
      const dy = currentWorld.y - startWorld.y;
      const dragScreenPx = Math.hypot(dx, dy) * this.world.scale.x;
      if (dragScreenPx >= MIN_SHAPE_DRAG_SCREEN_PX) {
        const geometry: AnnotationGeometry =
          shapeKind === 'circle'
            ? { kind: 'circle', center: startWorld, radius: Math.hypot(dx, dy) }
            : {
                kind: 'rectangle',
                rect: {
                  x0: Math.min(startWorld.x, currentWorld.x),
                  y0: Math.min(startWorld.y, currentWorld.y),
                  x1: Math.max(startWorld.x, currentWorld.x),
                  y1: Math.max(startWorld.y, currentWorld.y),
                },
              };
        const annotation: Annotation = { id: `annotation-${this.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry };
        this.doc.drawingHistory.execute(createAnnotationCommand(annotation));
        this.syncDrawingLayer();
        this.markDirty();
      }
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
    this.emitter.emit('zoomChanged', newZoom);
  };

  private placeStamp(worldPosition: Vec2, category: StampCategory): void {
    if (!this.pendingStampTexture) return;
    const { texture, nativeWidth, nativeHeight, definitionId } = this.pendingStampTexture;
    const id = `stamp-${this.doc.nextStampSeq++}`;
    // Copy the definition's ports onto the placed instance (previously always []) so
    // resolveSegmentEndpoint's existing port-snapping has something to snap to.
    const ports = definitionId ? [...(getStampDefinition(definitionId)?.ports ?? [])] : [];
    const data: PlacedStamp = {
      id,
      category,
      transform: { position: worldPosition, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth,
      nativeHeight,
      ports,
      definitionId,
    };
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5); // pivot = own center, matching the reference semantics
    const baseScale = { x: nativeWidth / texture.width, y: nativeHeight / texture.height };
    applyTransformToSprite(sprite, data.transform, baseScale);
    this.doc.stamps.set(id, { data, sprite, baseScale });
    this.doc.stampsLayer.addChild(sprite);
    this.doc.selectedIds = new Set([id]);
    this.markDirty();
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
    const state = this.doc.drawingHistory.getState();
    const stamps = [...this.doc.stamps.values()].map((entry) => entry.data);
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
      id: `segment-${this.doc.nextSegmentSeq++}`,
      pageIndex: 0,
      networkTypeId: this.activeNetworkTypeId,
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

    this.doc.drawingHistory.execute(new CompositeCommand('Draw segment', subCommands));
    this.syncDrawingLayer();
    this.markDirty();
    this.redrawOverlay();
  }

  private resolveDrawTarget(target: ReturnType<typeof resolveSegmentEndpoint>): DrawEndpointResolution {
    if (target.kind === 'existing') {
      return { point: target.point, worldPosition: target.worldPosition };
    }

    if (target.kind === 'new-fitting') {
      const fitting: Fitting = { id: `fitting-${this.doc.nextFittingSeq++}`, pageIndex: 0, position: target.worldPosition, kind: 'junction' };
      return {
        point: { kind: 'fitting', fittingId: fitting.id },
        worldPosition: target.worldPosition,
        setupCommand: createFittingCommand(fitting),
      };
    }

    // target.kind === 'break': auto-generates a junction at the click point on an existing run.
    const newFitting: Fitting = {
      id: `fitting-${this.doc.nextFittingSeq++}`,
      pageIndex: target.original.pageIndex,
      position: target.breakPoint,
      kind: 'junction',
    };
    const { segmentA, segmentB } = splitSegmentAtFitting(target.original, newFitting, target.breakPoint, {
      segmentA: `segment-${this.doc.nextSegmentSeq++}`,
      segmentB: `segment-${this.doc.nextSegmentSeq++}`,
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
    this.doc.drawingLayer.clear();
    // Textbox text is a PixiJS Text node (Graphics can't render text) — fully
    // rebuilt here alongside drawingLayer rather than diffed, same "clear and
    // redraw everything" approach as segments/fittings above; annotation
    // counts are small enough that this isn't a real cost.
    for (const child of this.doc.annotationTextLayer.removeChildren()) child.destroy();
    const state = this.doc.drawingHistory.getState();
    for (const segment of Object.values(state.segments)) {
      const [start, ...rest] = segment.geometry;
      if (!start || rest.length === 0) continue;
      this.doc.drawingLayer.moveTo(start.x, start.y);
      for (const point of rest) this.doc.drawingLayer.lineTo(point.x, point.y);
      this.doc.drawingLayer.stroke({ width: 3, color: 0xffa726 });
    }
    for (const fitting of Object.values(state.fittings)) {
      this.doc.drawingLayer.circle(fitting.position.x, fitting.position.y, 6).fill({ color: 0xffa726 });
    }
    for (const annotation of Object.values(state.annotations)) {
      this.drawAnnotation(annotation);
    }
    this.emitter.emit('drawingChanged', this.getDrawingSummary());
  }

  /** Renders one committed annotation into drawingLayer (or, for a textbox's text, into annotationTextLayer — see syncDrawingLayer). */
  private drawAnnotation(annotation: Annotation): void {
    const g = annotation.geometry;
    const layer = this.doc.drawingLayer;
    const color = 0x42a5f5;
    if (g.kind === 'freehand') {
      const [first, ...rest] = g.points;
      if (!first) return;
      layer.moveTo(first.x, first.y);
      for (const point of rest) layer.lineTo(point.x, point.y);
      layer.stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'line') {
      layer.moveTo(g.from.x, g.from.y);
      layer.lineTo(g.to.x, g.to.y);
      layer.stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'rectangle') {
      layer.rect(g.rect.x0, g.rect.y0, g.rect.x1 - g.rect.x0, g.rect.y1 - g.rect.y0).stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'circle') {
      layer.circle(g.center.x, g.center.y, g.radius).stroke({ width: 2, color });
      return;
    }
    // textbox: a light bounding box (drawingLayer) plus the actual text (a Text node in annotationTextLayer).
    layer.rect(g.rect.x0, g.rect.y0, g.rect.x1 - g.rect.x0, g.rect.y1 - g.rect.y0).stroke({ width: 1, color, alpha: 0.4 });
    const text = new Text({ text: g.text, style: { fontSize: 14, fill: 0x1a1a1a } });
    text.position.set(g.rect.x0 + 4, g.rect.y0 + 4);
    this.doc.annotationTextLayer.addChild(text);
  }

  private redrawOverlay(): void {
    this.overlay.clear();

    for (const id of this.doc.selectedIds) {
      const entry = this.doc.stamps.get(id);
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

    if (this.drag.kind === 'draw-freehand' && this.drag.points.length > 1) {
      const [first, ...rest] = this.drag.points;
      this.overlay.moveTo(first.x, first.y);
      for (const p of rest) this.overlay.lineTo(p.x, p.y);
      this.overlay.stroke({ width: 2 / this.world.scale.x, color: 0x42a5f5 });
    }

    if (this.drag.kind === 'draw-shape') {
      const { shapeKind, startWorld, currentWorld } = this.drag;
      if (shapeKind === 'circle') {
        const radius = Math.hypot(currentWorld.x - startWorld.x, currentWorld.y - startWorld.y);
        this.overlay.circle(startWorld.x, startWorld.y, radius).stroke({ width: 2 / this.world.scale.x, color: 0x42a5f5 });
      } else {
        const x = Math.min(startWorld.x, currentWorld.x);
        const y = Math.min(startWorld.y, currentWorld.y);
        const w = Math.abs(currentWorld.x - startWorld.x);
        const h = Math.abs(currentWorld.y - startWorld.y);
        this.overlay.rect(x, y, w, h).stroke({ width: 2 / this.world.scale.x, color: 0x42a5f5 });
      }
    }
  }
}
