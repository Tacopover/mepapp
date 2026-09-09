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
  annotationBoundsWorld,
  calibrateFromKnownDistance,
  centroid,
  coerceDefaultValue,
  CompositeCommand,
  computeNetworks,
  distance,
  getStampDefinition,
  getStampPorts,
  loadProject,
  measureRealDistance,
  multiRotate,
  normalizeDegrees,
  planPdfSync,
  pointInAxisAlignedRect,
  pointInRotatedRect,
  pointNearPolyline,
  pointNearSegment,
  reconcilePdfSync,
  recomputeAttachedSegments,
  rectIntersectsRotatedRect,
  resolveSegmentEndpoint,
  rotateAnnotationGeometry,
  rotatedRectCorners,
  rotatePointAround,
  serializeProject,
  solveFlow,
  splitSegmentAtFitting,
  Transaction,
  translateAnnotationGeometry,
  type Annotation,
  type AnnotationGeometry,
  type Calibration,
  type Command,
  type ConnectionPoint,
  type CustomPropertyDefinition,
  type CustomPropertyValues,
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
import { DEFAULT_NETWORK_TYPE, SketchDocument, type DocumentSummary, type DrawingState } from './document.js';

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
  if (g.kind === 'line' || g.kind === 'arrow') {
    return { id: annotation.id, geometry: { ax: round(g.from.x), ay: round(g.from.y), bx: round(g.to.x), by: round(g.to.y) } };
  }
  if (g.kind === 'circle') {
    // Radius deliberately excluded — this shape is shared with Fitting's constant-radius marker circle (see writeAnnotationForId), whose domain-side entry never carried one either.
    return { id: annotation.id, geometry: { x: round(g.center.x), y: round(g.center.y) } };
  }
  if (g.kind === 'rectangle' || g.kind === 'highlight') {
    return { id: annotation.id, geometry: { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1) } };
  }
  if (g.kind === 'textbox') {
    // Text content isn't compared — SyncedGeometry is numeric-only (see core/pdfSync.ts), so an edit to a textbox's text in another viewer isn't flagged as drift, only a move/resize/rotate is.
    return { id: annotation.id, geometry: { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1), rotationDegrees: round(g.rotationDegrees) } };
  }
  if (g.kind === 'stickyNote') {
    // Text content isn't compared, same reasoning as textbox above.
    return { id: annotation.id, geometry: { x: round(g.position.x), y: round(g.position.y) } };
  }
  if (g.kind === 'freehand' || g.kind === 'polyline') {
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
  if (g.kind === 'line' || g.kind === 'arrow') {
    return { ax: round(g.from.x), ay: round(g.from.y), bx: round(g.to.x), by: round(g.to.y) };
  }
  if (g.kind === 'circle') {
    return { x: round(g.center.x), y: round(g.center.y) };
  }
  if (g.kind === 'rectangle' || g.kind === 'highlight') {
    return { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1) };
  }
  if (g.kind === 'textbox') {
    return { x0: round(g.rect.x0), y0: round(g.rect.y0), x1: round(g.rect.x1), y1: round(g.rect.y1), rotationDegrees: round(g.rotationDegrees) };
  }
  if (g.kind === 'stickyNote') {
    return { x: round(g.position.x), y: round(g.position.y) };
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

function createStampCommand(stamp: PlacedStamp): Command<DrawingState> {
  return {
    description: `Place stamp ${stamp.id}`,
    execute: (state) => ({ ...state, stamps: { ...state.stamps, [stamp.id]: stamp } }),
    undo: (state) => ({ ...state, stamps: withoutKey(state.stamps, stamp.id) }),
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
/** Drawn radius of a fitting's marker circle (syncDrawingLayer) — also its bounding box for selection/pivot purposes. */
const FITTING_MARKER_RADIUS_WORLD = 6;
/** Extra click-target slack around a fitting's drawn radius, in screen px at zoom 1 — same generous-target idea as HANDLE_HIT_RADIUS_SCREEN_PX. */
const FITTING_HIT_RADIUS_SCREEN_PX = 8;
const ROTATE_SNAP_DEGREES = 45;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 32;

// How close (screen px, zoom-independent — see onDrawSegmentClick) a click
// needs to be to an existing stamp/segment endpoint to snap onto it instead
// of starting a new one. User-adjustable via setSnapRadius (Settings dialog).
export const DEFAULT_SNAP_RADIUS_SCREEN_PX = 12;

// How close a click needs to be to a thin-stroke annotation (line/arrow/
// freehand/polyline) or a circle's edge to count as a hit — a plain
// bounding-box test would be far too generous for a 2pt-wide stroke.
const ANNOTATION_STROKE_HIT_THRESHOLD_SCREEN_PX = 6;
// A pointerdown-to-pointerup drag shorter than this (screen px) is a click,
// not a drag — used to tell "reopen this textbox/stickyNote's text editor"
// apart from "start moving it", the same distinction MIN_SHAPE_DRAG_SCREEN_PX
// draws for draw-shape.
const CLICK_VS_DRAG_SCREEN_PX = 3;

// A draw-shape drag shorter than this (screen px, zoom-independent — see
// onPointerUp's 'draw-shape' case) is treated as a stray click, not a
// zero-size rectangle/circle nobody meant to create.
const MIN_SHAPE_DRAG_SCREEN_PX = 3;
// A textbox annotation has no drag-to-size gesture (it's a single click, see
// onPointerDown's 'draw-textbox' case) — this is its placeholder rect size in
// PDF points, matching AnnotationGeometry's 'textbox' rect shape.
const DEFAULT_TEXTBOX_WIDTH_PT = 160;
const DEFAULT_TEXTBOX_HEIGHT_PT = 40;
// Fixed on-page footprint of a placed sticky note's icon — a sticky note has
// no drag-to-size gesture (single click, like a textbox's placeholder rect
// above), just a point plus its always-visible text label drawn beside it.
const STICKY_NOTE_ICON_SIZE_PT = 16;
// Arrowhead geometry for the 'arrow' render case — drawn as two short lines
// back from the endpoint, not a filled triangle, matching drawAnnotation's
// stroke-only convention for every other kind.
const ARROWHEAD_LENGTH_PT = 10;
const ARROWHEAD_ANGLE_RAD = Math.PI / 7;

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
  /** Global Properties custom field values (Terminal/Equipment only) — see PlacedStamp.properties. */
  properties?: CustomPropertyValues;
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
  | 'draw-textbox'
  | 'draw-sticky-note'
  | 'draw-highlight'
  | 'draw-polyline';

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
  /** Placed stamps (Terminal/Equipment) connected into this network via a segment port endpoint — the Networks tree's element list under this network. */
  elementIds: string[];
}

interface SketchSceneEvents {
  [key: string]: unknown[];
  selectionChanged: [StampInfo[]];
  toolChanged: [SketchTool];
  calibrationNeeded: [p1: Vec2, p2: Vec2, resolve: (knownRealDistanceMm: number | null) => void];
  calibrationSet: [Calibration];
  measurement: [distanceMm: number];
  /**
   * The draw-textbox/draw-sticky-note tool was clicked, or an existing
   * textbox/stickyNote annotation was clicked again with the select tool to
   * edit it — the UI's cue to show a floating text input at screenPosition
   * (container-relative pixels), pre-filled with initialText (empty for a
   * new annotation), and call resolve with the committed text, or null to
   * cancel.
   */
  textboxRequested: [screenPosition: Vec2, initialText: string, resolve: (text: string | null) => void];
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

/** A selectable object is a placed stamp, a fitting, or a drawn annotation — see hitTest. */
type SelectableRef = { kind: 'stamp'; id: string } | { kind: 'fitting'; id: string } | { kind: 'annotation'; id: string };

/** Original per-annotation geometry captured at gesture start, so move/rotate can recompute the whole gesture's delta from a fixed origin on every pointermove rather than drifting by accumulating per-frame deltas. */
type AnnotationSnapshot = Record<string, AnnotationGeometry>;

type DragState =
  | { kind: 'none' }
  | { kind: 'pan'; startScreen: Vec2; startWorldPos: Vec2 }
  | {
      kind: 'move-selection';
      startPointerWorld: Vec2;
      /** Selected stamps' positions at gesture start (from getSelection(), so stamp-only) — the stamp counterpart to annotationSnapshot/fittingSnapshot below. */
      snapshot: Array<{ id: string; position: Vec2 }>;
      annotationSnapshot: AnnotationSnapshot;
      /** Fitting positions at gesture start, keyed by fitting id — the fitting counterpart to annotationSnapshot above. */
      fittingSnapshot: Record<string, Vec2>;
      /** Undoable transaction covering snapshot's/annotationSnapshot's/fittingSnapshot's moves, plus the cascaded recompute of any segment attached to a moved fitting — null when none of the three is present in the selection. */
      drawingTx: Transaction<DrawingState> | null;
      /** Set when this gesture began on an already-sole-selected textbox/stickyNote — a click with no drag reopens its text editor instead of committing a zero-length move. */
      reopenTextEditId: string | null;
      /** True once onPointerMove has actually applied a delta — a plain click never sets this, since a real pointermove never fires for zero on-screen movement. Gates whether onPointerUp commits anything. */
      moved: boolean;
    }
  | {
      kind: 'rotate-selection';
      pivot: Vec2;
      startPointerAngleDeg: number;
      /** Selected stamps' transforms at gesture start (from getSelection(), so stamp-only). */
      snapshot: Array<{ id: string; transform: Transform2D }>;
      annotationSnapshot: AnnotationSnapshot;
      /** Undoable transaction covering both snapshot's stamp rotations and annotationSnapshot's — null when neither is present in the selection. */
      drawingTx: Transaction<DrawingState> | null;
      moved: boolean;
    }
  | { kind: 'resize-rect'; id: string; corner: 'x0y0' | 'x1y0' | 'x1y1' | 'x0y1'; original: AnnotationGeometry; tx: Transaction<DrawingState>; moved: boolean }
  | { kind: 'resize-circle'; id: string; center: Vec2; tx: Transaction<DrawingState>; moved: boolean }
  | { kind: 'rubber-band'; startWorld: Vec2; currentWorld: Vec2; additive: boolean }
  | { kind: 'draw-freehand'; points: Vec2[] }
  | { kind: 'draw-shape'; shapeKind: 'rectangle' | 'circle'; startWorld: Vec2; currentWorld: Vec2 }
  | { kind: 'draw-highlight'; startWorld: Vec2; currentWorld: Vec2 };

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
  // draw-polyline's own scratch: an arbitrary-length click-to-add-vertex
  // gesture doesn't fit pendingPoints' fixed two-click contract above, so it
  // gets a dedicated pair — the committed vertices, and the live cursor
  // position for the rubber-band segment drawn out to the pointer.
  private pendingPolylinePoints: Vec2[] = [];
  private pendingPolylineCursor: Vec2 | null = null;
  // Hand-rolled double-click detection for draw-polyline's finish gesture —
  // see onPointerDown's 'draw-polyline' case for why native detail-based
  // detection doesn't work here.
  private lastPolylineClickAt = 0;
  private lastPolylineClickScreen: Vec2 | null = null;
  private static readonly DOUBLE_CLICK_MS = 400;
  private static readonly DOUBLE_CLICK_SCREEN_PX = 6;
  private drag: DragState = { kind: 'none' };
  private readonly emitter = new TypedEmitter<SketchSceneEvents>();
  private pendingSegmentStart: DrawEndpointResolution | null = null;
  private snapRadiusScreenPx = DEFAULT_SNAP_RADIUS_SCREEN_PX;
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
    window.addEventListener('keydown', this.onKeyDown);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
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
    this.pendingPolylinePoints = [];
    this.pendingPolylineCursor = null;
    this.lastPolylineClickScreen = null;
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

  private toStampInfo(data: PlacedStamp): StampInfo {
    return {
      id: data.id,
      category: data.category,
      transform: data.transform,
      nativeWidth: data.nativeWidth,
      nativeHeight: data.nativeHeight,
      ports: data.ports,
      linkedPortIds: this.doc.portGroups.find((g) => g.elementId === data.id)?.portIds ?? null,
      definitionId: data.definitionId,
      properties: data.properties,
    };
  }

  getSelection(): StampInfo[] {
    const state = this.doc.drawingHistory.getState();
    return [...this.doc.selectedIds]
      .map((id) => state.stamps[id])
      .filter((d): d is PlacedStamp => d !== undefined)
      .map((d) => this.toStampInfo(d));
  }

  /** Whether anything (a stamp or an annotation) is currently selected — unlike getSelection(), which only reports stamps (the Properties panel's read model), this covers the full selection for gating UI like the rail's Rotate/Delete actions. */
  hasSelection(): boolean {
    return this.doc.selectedIds.size > 0;
  }

  /** Programmatically selects one placed stamp by id and syncs the canvas highlight — the Networks tree's click-to-select-on-canvas action (every other selection path so far originated from a canvas hit-test). No-op if `id` isn't a placed stamp. */
  selectStampById(id: string): void {
    if (!this.doc.drawingHistory.getState().stamps[id]) return;
    this.doc.selectedIds = new Set([id]);
    this.emitter.emit('selectionChanged', this.getSelection());
    this.redrawOverlay();
  }

  /** Every placed stamp, not just the current selection — the Layers panel's "Elements" list. */
  listStamps(): StampInfo[] {
    return Object.values(this.doc.drawingHistory.getState().stamps).map((d) => this.toStampInfo(d));
  }

  /** Derives the current network topology (see core's computeNetworks) resolved against known network types — the Layers panel's "Networks" list. */
  getNetworkSummaries(): NetworkSummary[] {
    const state = this.doc.drawingHistory.getState();
    const segments = Object.values(state.segments);
    const fittings = Object.values(state.fittings);
    const networks = computeNetworks({ segments, fittings, portGroups: this.doc.portGroups });
    const typeById = new Map(this.doc.networkTypes.map((t) => [t.id, t]));
    const segmentById = new Map(segments.map((s) => [s.id, s]));
    return networks.map((network: Network) => {
      const type = typeById.get(network.networkTypeId) ?? DEFAULT_NETWORK_TYPE;
      const elementIds = new Set<string>();
      for (const segmentId of network.segmentIds) {
        const segment = segmentById.get(segmentId);
        if (!segment) continue;
        for (const point of [segment.endpointA, segment.endpointB]) {
          if (point.kind === 'port') elementIds.add(point.elementId);
        }
      }
      return {
        id: network.id,
        networkTypeId: network.networkTypeId,
        networkTypeName: type.name,
        discipline: type.discipline,
        segmentCount: network.segmentIds.length,
        fittingCount: network.fittingIds.length,
        elementIds: [...elementIds],
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
    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  redoDrawing(): void {
    this.doc.drawingHistory.redo();
    this.syncDrawingLayer();
    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
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

  /** Current segment-endpoint snap radius, screen px at zoom 1 — see onDrawSegmentClick. */
  getSnapRadius(): number {
    return this.snapRadiusScreenPx;
  }

  /** Sets the segment-endpoint snap radius (Settings dialog) — screen px, applied zoom-independently at draw time. */
  setSnapRadius(px: number): void {
    this.snapRadiusScreenPx = px;
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

  /** One custom-property value on a placed Terminal/Equipment (Global Properties dialog, Properties panel). */
  setStampProperty(elementId: string, name: string, value: string | number): void {
    if (!this.doc.drawingHistory.getState().stamps[elementId]) return;
    const tx = new Transaction(this.doc.drawingHistory, `Set ${elementId} property ${name}`);
    tx.update((state) => {
      const data = state.stamps[elementId];
      if (!data) return state;
      return { ...state, stamps: { ...state.stamps, [elementId]: { ...data, properties: { ...data.properties, [name]: value } } } };
    });
    tx.commit();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /**
   * Applies a Global Properties definitions change to every already-placed
   * stamp of the given category: a newly added definition gets its default
   * value, a removed one is dropped. A rename is treated as remove+add (the
   * value resets to the new definition's default) rather than carried over —
   * simplest first-pass behavior, no separate rename affordance in the dialog.
   */
  applyCustomPropertyCascade(
    category: StampCategory,
    previous: CustomPropertyDefinition[],
    next: CustomPropertyDefinition[],
  ): void {
    const previousNames = new Set(previous.map((d) => d.name));
    const nextNames = new Set(next.map((d) => d.name));
    const removedNames = previous.filter((d) => !nextNames.has(d.name)).map((d) => d.name);
    const addedDefs = next.filter((d) => !previousNames.has(d.name));
    if (removedNames.length === 0 && addedDefs.length === 0) return;
    const tx = new Transaction(this.doc.drawingHistory, `Update ${category} properties`);
    tx.update((state) => {
      const stamps = { ...state.stamps };
      for (const [id, data] of Object.entries(stamps)) {
        if (data.category !== category) continue;
        const properties = { ...data.properties };
        for (const name of removedNames) delete properties[name];
        for (const def of addedDefs) properties[def.name] = coerceDefaultValue(def);
        stamps[id] = { ...data, properties };
      }
      return { ...state, stamps };
    });
    tx.commit();
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
      stamps: Object.values(state.stamps),
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
      stamps: Object.fromEntries(doc.stamps.map((s) => [s.id, s])),
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
      target.stamps.set(stampData.id, { sprite, baseScale });
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
    for (const data of Object.values(state.stamps)) {
      const bounds = this.stampWorldBounds(data);
      entries.push({
        id: data.id,
        geometry: { x: round(bounds.minX), y: round(bounds.minY), rotationDegrees: round(data.transform.rotationDegrees) },
      });
    }
    for (const annotation of Object.values(state.annotations)) {
      entries.push({ id: annotation.id, geometry: domainAnnotationGeometry(annotation.geometry) });
    }
    return entries;
  }

  private stampWorldBounds(data: PlacedStamp): { minX: number; minY: number; maxX: number; maxY: number } {
    const halfWidth = (data.nativeWidth / 2) * data.transform.scale.x;
    const halfHeight = (data.nativeHeight / 2) * data.transform.scale.y;
    const corners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((local) => {
      const r = rotatePointAround(local, { x: 0, y: 0 }, data.transform.rotationDegrees);
      return { x: r.x + data.transform.position.x, y: r.y + data.transform.position.y };
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
    const stampData = state.stamps[id];
    if (stampEntry && stampData) {
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
      const bounds = this.stampWorldBounds(stampData);
      await handle.addAnnotation({
        id,
        kind: 'stamp',
        pageIndex: 0,
        geometry: {
          kind: 'stamp',
          position: { x: bounds.minX, y: bounds.minY },
          widthPt: bounds.maxX - bounds.minX,
          heightPt: bounds.maxY - bounds.minY,
          rotationDegrees: stampData.transform.rotationDegrees,
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
    // Bypasses the undo history entirely (a direct setLiveState merge, not N execute() calls) — this is placeholder load for a redraw-cost benchmark, not a real placement, and was never undoable before stamps moved into DrawingState either.
    const newStamps: Record<string, PlacedStamp> = {};
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
      newStamps[id] = data;
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.tint = Math.floor(Math.random() * 0xffffff);
      const baseScale = { x: nativeWidth, y: nativeHeight }; // Texture.WHITE is 1x1
      applyTransformToSprite(sprite, data.transform, baseScale);
      this.doc.stamps.set(id, { sprite, baseScale });
      this.doc.stampsLayer.addChild(sprite);
    }
    const state = this.doc.drawingHistory.getState();
    this.doc.drawingHistory.setLiveState({ ...state, stamps: { ...state.stamps, ...newStamps } });
  }

  /** Programmatic rotate (e.g. a "rotate 90°" button) — same absolute-recompute path as drag rotation. */
  /**
   * Instant (non-drag) rotate-by-delta for the current selection — the
   * rail's Rotate flyout button. Was stamp-only until this covered
   * annotations too: this.getSelection() only ever returns stamps (kept
   * stamp-only by design, see the Properties panel's read model), so this
   * previously silently no-opped for an annotation-only selection even
   * though the drag-rotate handle (onPointerMove's 'rotate-selection' case)
   * already rotated annotations correctly. Mirrors that gesture's pivot
   * (the selection's own bounds centroid) and Transaction usage, just
   * committed in one shot instead of per pointermove frame.
   */
  rotateSelectionBy(deltaDegrees: number): void {
    if (this.doc.selectedIds.size === 0) return;
    const state = this.doc.drawingHistory.getState();
    const selectedRefs: SelectableRef[] = [...this.doc.selectedIds].map((id) => this.selectableRefForId(id, state));
    const pivotPoints = selectedRefs
      .map((ref) => this.resolveSelectableBoundsWorld(ref, state))
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .map((b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }));
    if (pivotPoints.length === 0) return;
    const pivot = centroid(pivotPoints);

    const stampSnapshot = this.getSelection().map((s) => ({ id: s.id, transform: s.transform }));
    const rotated = stampSnapshot.length > 0 ? multiRotate(stampSnapshot.map((s) => s.transform), deltaDegrees) : [];
    const annotationIds = [...this.doc.selectedIds].filter((id) => state.annotations[id]);

    if (stampSnapshot.length > 0 || annotationIds.length > 0) {
      const tx = new Transaction(this.doc.drawingHistory, 'Rotate selection');
      tx.update((s) => {
        const stamps = { ...s.stamps };
        const rotatedIds: string[] = [];
        stampSnapshot.forEach((item, i) => {
          if (!stamps[item.id]) return;
          stamps[item.id] = { ...stamps[item.id], transform: rotated[i] };
          rotatedIds.push(item.id);
        });
        const annotations = { ...s.annotations };
        for (const id of annotationIds) {
          annotations[id] = { ...annotations[id], geometry: rotateAnnotationGeometry(annotations[id].geometry, pivot, deltaDegrees) };
        }
        return this.applyConnectivityCascade({ ...s, stamps, annotations }, this.stampPortConnectionPoints(rotatedIds, stamps));
      });
      tx.commit();
      this.syncDrawingLayer();
    }

    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Typed-degree entry: free-form, no snapping, single-selection only. */
  setSelectedRotationDegrees(degrees: number): void {
    if (this.doc.selectedIds.size !== 1) return;
    const [id] = this.doc.selectedIds;
    const current = this.doc.drawingHistory.getState().stamps[id]?.transform;
    if (!current) return;
    this.applyStampTransform(id, { ...current, rotationDegrees: normalizeDegrees(degrees) }, `Rotate stamp ${id}`);
    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Typed-position entry (Properties panel X/Y fields): single-selection only, same pattern as setSelectedRotationDegrees. */
  setSelectedPosition(position: Vec2): void {
    if (this.doc.selectedIds.size !== 1) return;
    const [id] = this.doc.selectedIds;
    const current = this.doc.drawingHistory.getState().stamps[id]?.transform;
    if (!current) return;
    this.applyStampTransform(id, { ...current, position }, `Move stamp ${id}`);
    this.redrawOverlay();
    this.markDirty();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /** Current world scale (1 = 100%) — the status bar's zoom readout. */
  getZoom(): number {
    return this.world.scale.x;
  }

  /** One-shot (non-drag) committed transform change for a single stamp — setSelectedRotationDegrees/setSelectedPosition's shared plumbing. Live drag preview (onPointerMove's move-selection/rotate-selection cases) folds its own per-frame stamp updates into its own Transaction instead, since those cover many items across many frames rather than one committed step. */
  private applyStampTransform(id: string, transform: Transform2D, description: string): void {
    const tx = new Transaction(this.doc.drawingHistory, description);
    tx.update((state) => {
      const data = state.stamps[id];
      if (!data) return state;
      const stamps = { ...state.stamps, [id]: { ...data, transform } };
      return this.applyConnectivityCascade({ ...state, stamps }, this.stampPortConnectionPoints([id], stamps));
    });
    tx.commit();
    this.syncDrawingLayer();
  }

  /** Every connection point a stamp's own ports offer, for the given ids — the render layer's equivalent of "which nodes did this mutation touch," fed straight into recomputeAttachedSegments below. A stamp with no ports yet (pre-Phase 5) simply contributes nothing. */
  private stampPortConnectionPoints(ids: Iterable<string>, stamps: Record<string, PlacedStamp>): ConnectionPoint[] {
    const points: ConnectionPoint[] = [];
    for (const id of ids) {
      const data = stamps[id];
      if (!data) continue;
      for (const port of getStampPorts(data)) points.push({ kind: 'port', elementId: id, portId: port.id });
    }
    return points;
  }

  /**
   * Shared by every stamp/fitting mutation path that can move a connected
   * node — recomputes attached segment geometry from state's own live
   * fittings/stamps and merges the result in, or returns state unchanged if
   * nothing moved. The one call every such mutation path goes through,
   * mirroring the old app's single shared re-seat routine (connectivity
   * spec §2.1) instead of a second parallel recompute per node kind —
   * fittings (Phase 1) and now stamps (Phase 3/4) both funnel through here.
   */
  private applyConnectivityCascade(state: DrawingState, changed: ConnectionPoint[]): DrawingState {
    if (changed.length === 0) return state;
    const segmentUpdates = recomputeAttachedSegments(
      { segments: state.segments, fittings: state.fittings, stamps: state.stamps, portGroups: this.doc.portGroups },
      changed,
    );
    return { ...state, segments: { ...state.segments, ...segmentUpdates } };
  }

  private screenToWorld(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.world.x) / this.world.scale.x,
      y: (screen.y - this.world.y) / this.world.scale.y,
    };
  }

  /** A stamp's true rotated corners, in world space — shared by hit-testing, bounds, and overlay drawing. */
  private stampCornersWorld(data: PlacedStamp): Vec2[] {
    const halfWidth = (data.nativeWidth / 2) * data.transform.scale.x;
    const halfHeight = (data.nativeHeight / 2) * data.transform.scale.y;
    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((local) => {
      const r = rotatePointAround(local, { x: 0, y: 0 }, data.transform.rotationDegrees);
      return { x: r.x + data.transform.position.x, y: r.y + data.transform.position.y };
    });
  }

  /**
   * Finds whichever selectable object (a placed stamp or a drawn annotation)
   * sits under worldPoint, topmost first within each layer — stamps checked
   * before annotations, matching their draw order (annotations render above
   * stamps in drawingLayer). A stamp's true rotated extents use
   * pointInRotatedRect (unchanged); each annotation kind gets its own test
   * since, unlike a stamp, most of them aren't a filled rectangle: a thin
   * stroke (line/arrow/freehand/polyline) needs a near-the-stroke test, not
   * a bounding-box one.
   */
  private hitTest(worldPoint: Vec2): SelectableRef | null {
    const state = this.doc.drawingHistory.getState();
    const orderedStamps = Object.values(state.stamps).reverse();
    for (const data of orderedStamps) {
      const halfWidth = (data.nativeWidth / 2) * data.transform.scale.x;
      const halfHeight = (data.nativeHeight / 2) * data.transform.scale.y;
      if (pointInRotatedRect(worldPoint, data.transform, halfWidth, halfHeight)) {
        return { kind: 'stamp', id: data.id };
      }
    }

    const fittingHitRadius = FITTING_MARKER_RADIUS_WORLD + FITTING_HIT_RADIUS_SCREEN_PX / this.world.scale.x;
    const orderedFittings = Object.values(state.fittings).reverse();
    for (const fitting of orderedFittings) {
      if (distance(worldPoint, fitting.position) <= fittingHitRadius) {
        return { kind: 'fitting', id: fitting.id };
      }
    }

    const threshold = ANNOTATION_STROKE_HIT_THRESHOLD_SCREEN_PX / this.world.scale.x;
    const orderedAnnotations = Object.values(state.annotations).reverse();
    for (const annotation of orderedAnnotations) {
      if (this.annotationHit(worldPoint, annotation.geometry, threshold)) {
        return { kind: 'annotation', id: annotation.id };
      }
    }
    return null;
  }

  private annotationHit(worldPoint: Vec2, g: AnnotationGeometry, strokeThreshold: number): boolean {
    switch (g.kind) {
      case 'freehand':
      case 'polyline':
        return pointNearPolyline(worldPoint, g.points, strokeThreshold);
      case 'line':
      case 'arrow':
        return pointNearSegment(worldPoint, g.from, g.to, strokeThreshold);
      case 'rectangle':
      case 'highlight':
        return pointInAxisAlignedRect(worldPoint, g.rect);
      case 'textbox': {
        // Undo the rect's own rotation on the test point (around its center)
        // instead of rotating the rect itself, so the existing
        // axis-aligned-rect test still applies. Identity when rotationDegrees is 0.
        const center = { x: (g.rect.x0 + g.rect.x1) / 2, y: (g.rect.y0 + g.rect.y1) / 2 };
        const local = g.rotationDegrees === 0 ? worldPoint : rotatePointAround(worldPoint, center, -g.rotationDegrees);
        return pointInAxisAlignedRect(local, g.rect);
      }
      case 'circle': {
        const distanceToCenter = Math.hypot(worldPoint.x - g.center.x, worldPoint.y - g.center.y);
        return distanceToCenter <= g.radius + strokeThreshold;
      }
      case 'stickyNote':
        return pointInAxisAlignedRect(worldPoint, {
          x0: g.position.x,
          y0: g.position.y,
          x1: g.position.x + STICKY_NOTE_ICON_SIZE_PT,
          y1: g.position.y + STICKY_NOTE_ICON_SIZE_PT,
        });
    }
  }

  private resolveSelectableBoundsWorld(ref: SelectableRef, state: DrawingState): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (ref.kind === 'stamp') {
      const data = state.stamps[ref.id];
      if (!data) return null;
      const corners = this.stampCornersWorld(data);
      return {
        minX: Math.min(...corners.map((c) => c.x)),
        minY: Math.min(...corners.map((c) => c.y)),
        maxX: Math.max(...corners.map((c) => c.x)),
        maxY: Math.max(...corners.map((c) => c.y)),
      };
    }
    if (ref.kind === 'fitting') {
      const fitting = state.fittings[ref.id];
      if (!fitting) return null;
      return {
        minX: fitting.position.x - FITTING_MARKER_RADIUS_WORLD,
        minY: fitting.position.y - FITTING_MARKER_RADIUS_WORLD,
        maxX: fitting.position.x + FITTING_MARKER_RADIUS_WORLD,
        maxY: fitting.position.y + FITTING_MARKER_RADIUS_WORLD,
      };
    }
    const annotation = state.annotations[ref.id];
    if (!annotation) return null;
    return annotationBoundsWorld(annotation.geometry, STICKY_NOTE_ICON_SIZE_PT);
  }

  /** Which selectable kind an id belongs to — stamps and fittings are checked directly (both are keyed collections with no ambiguity), anything else is assumed to be an annotation. */
  private selectableRefForId(id: string, state: DrawingState): SelectableRef {
    if (state.stamps[id]) return { kind: 'stamp', id };
    if (state.fittings[id]) return { kind: 'fitting', id };
    return { kind: 'annotation', id };
  }

  private getSelectionBoundsWorld(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.doc.selectedIds.size === 0) return null;
    const state = this.doc.drawingHistory.getState();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of this.doc.selectedIds) {
      const ref = this.selectableRefForId(id, state);
      const bounds = this.resolveSelectableBoundsWorld(ref, state);
      if (!bounds) continue;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  private getRotationHandleWorld(): Vec2 | null {
    const bounds = this.getSelectionBoundsWorld();
    if (!bounds) return null;
    const gap = HANDLE_OFFSET_WORLD_AT_ZOOM_1 / this.world.scale.x;
    return { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY - gap };
  }

  /**
   * Resize handles for a single selected rectangle/highlight annotation (one
   * per corner) or circle annotation (one on its radius) — resizing is
   * single-selection only, same scoping as setSelectedRotationDegrees/
   * setSelectedPosition above. Returns an empty array for any other
   * selection shape (none, multiple, or a non-resizable kind).
   */
  private getResizeHandlesWorld(): Array<{ id: string; corner: 'x0y0' | 'x1y0' | 'x1y1' | 'x0y1'; position: Vec2 } | { id: string; role: 'radius'; position: Vec2 }> {
    if (this.doc.selectedIds.size !== 1) return [];
    const [id] = this.doc.selectedIds;
    const annotation = this.doc.drawingHistory.getState().annotations[id];
    if (!annotation) return [];
    const g = annotation.geometry;
    if (g.kind === 'rectangle' || g.kind === 'highlight') {
      return [
        { id, corner: 'x0y0', position: { x: g.rect.x0, y: g.rect.y0 } },
        { id, corner: 'x1y0', position: { x: g.rect.x1, y: g.rect.y0 } },
        { id, corner: 'x1y1', position: { x: g.rect.x1, y: g.rect.y1 } },
        { id, corner: 'x0y1', position: { x: g.rect.x0, y: g.rect.y1 } },
      ];
    }
    if (g.kind === 'circle') {
      return [{ id, role: 'radius', position: { x: g.center.x + g.radius, y: g.center.y } }];
    }
    return [];
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
      // Plain two-click = line; Shift+(either click) = arrow — same
      // one-tool-two-kinds modifier pattern as draw-shape's rectangle/circle
      // Shift toggle, per the arrow addition confirmed in the Decisions-Log.
      // pdf-engine already models arrow as the same {from,to} shape as line.
      const isArrow = event.shiftKey;
      this.pendingPoints.push(world);
      if (this.pendingPoints.length === 2) {
        const [from, to] = this.pendingPoints;
        this.pendingPoints = [];
        const annotation: Annotation = { id: `annotation-${this.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: isArrow ? 'arrow' : 'line', from, to } };
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
      this.emitter.emit('textboxRequested', screen, '', (text) => {
        const trimmed = text?.trim();
        if (trimmed) {
          const annotation: Annotation = {
            id: `annotation-${this.doc.nextAnnotationSeq++}`,
            pageIndex: 0,
            geometry: { kind: 'textbox', rect: { x0: world.x, y0: world.y, x1: world.x + DEFAULT_TEXTBOX_WIDTH_PT, y1: world.y + DEFAULT_TEXTBOX_HEIGHT_PT }, text: trimmed, rotationDegrees: 0 },
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

    if (this.tool === 'draw-sticky-note') {
      // Same floating-textarea event draw-textbox uses — a point instead of a
      // rect is the only difference, so no new UI event/App.tsx wiring is needed.
      this.emitter.emit('textboxRequested', screen, '', (text) => {
        const trimmed = text?.trim();
        if (trimmed) {
          const annotation: Annotation = {
            id: `annotation-${this.doc.nextAnnotationSeq++}`,
            pageIndex: 0,
            geometry: { kind: 'stickyNote', position: world, text: trimmed },
          };
          this.doc.drawingHistory.execute(createAnnotationCommand(annotation));
          this.syncDrawingLayer();
          this.markDirty();
          this.setTool('select'); // one-shot, matching placeStamp/draw-textbox's revert-after-place convention
        }
        this.redrawOverlay();
      });
      return;
    }

    if (this.tool === 'draw-highlight') {
      this.drag = { kind: 'draw-highlight', startWorld: world, currentWorld: world };
      this.redrawOverlay();
      return;
    }

    if (this.tool === 'draw-polyline') {
      // Click adds a vertex; double-click finishes. Chromium leaves
      // PointerEvent.detail at 0 on every 'pointerdown' regardless of click
      // count (click-count semantics only apply to the native 'click' event,
      // which this class's gesture model doesn't otherwise use) — confirmed
      // empirically, not assumed. Double-clicks are detected by hand instead:
      // two pointerdowns close together in time and screen position.
      const now = performance.now();
      const isDoubleClick =
        this.lastPolylineClickScreen !== null &&
        now - this.lastPolylineClickAt <= SketchScene.DOUBLE_CLICK_MS &&
        Math.hypot(screen.x - this.lastPolylineClickScreen.x, screen.y - this.lastPolylineClickScreen.y) <= SketchScene.DOUBLE_CLICK_SCREEN_PX;
      this.lastPolylineClickAt = now;
      this.lastPolylineClickScreen = screen;
      if (isDoubleClick) {
        // The first click of this double-click already added its vertex
        // below on the previous pointerdown — this one only ever closes the
        // shape out, it never adds a second point of its own.
        if (this.pendingPolylinePoints.length >= 2) {
          const annotation: Annotation = {
            id: `annotation-${this.doc.nextAnnotationSeq++}`,
            pageIndex: 0,
            geometry: { kind: 'polyline', points: this.pendingPolylinePoints },
          };
          this.doc.drawingHistory.execute(createAnnotationCommand(annotation));
          this.syncDrawingLayer();
          this.markDirty();
        }
        this.pendingPolylinePoints = [];
        this.pendingPolylineCursor = null;
        this.lastPolylineClickScreen = null;
        this.redrawOverlay();
        return;
      }
      this.pendingPolylinePoints.push(world);
      this.pendingPolylineCursor = world;
      this.redrawOverlay();
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
    const handleRadiusWorld = HANDLE_HIT_RADIUS_SCREEN_PX / this.world.scale.x;

    for (const resizeHandle of this.getResizeHandlesWorld()) {
      if (Math.hypot(world.x - resizeHandle.position.x, world.y - resizeHandle.position.y) > handleRadiusWorld) continue;
      const annotation = this.doc.drawingHistory.getState().annotations[resizeHandle.id];
      if (!annotation) break;
      const tx = new Transaction(this.doc.drawingHistory, `Resize annotation ${resizeHandle.id}`);
      if ('corner' in resizeHandle) {
        this.drag = { kind: 'resize-rect', id: resizeHandle.id, corner: resizeHandle.corner, original: annotation.geometry, tx, moved: false };
        return;
      }
      if (annotation.geometry.kind === 'circle') {
        this.drag = { kind: 'resize-circle', id: resizeHandle.id, center: annotation.geometry.center, tx, moved: false };
        return;
      }
    }

    const handle = this.getRotationHandleWorld();
    if (handle && Math.hypot(world.x - handle.x, world.y - handle.y) <= handleRadiusWorld) {
      const state = this.doc.drawingHistory.getState();
      const selectedRefs: SelectableRef[] = [...this.doc.selectedIds].map((id) => this.selectableRefForId(id, state));
      const pivotPoints = selectedRefs
        .map((ref) => this.resolveSelectableBoundsWorld(ref, state))
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map((b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }));
      if (pivotPoints.length === 0) return;
      const centroidPoint = centroid(pivotPoints);
      const annotationSnapshot: AnnotationSnapshot = {};
      for (const id of this.doc.selectedIds) {
        const annotation = state.annotations[id];
        if (annotation) annotationSnapshot[id] = annotation.geometry;
      }
      const stampSnapshot = this.getSelection().map((s) => ({ id: s.id, transform: s.transform }));
      this.drag = {
        kind: 'rotate-selection',
        pivot: centroidPoint,
        startPointerAngleDeg: angleDegrees(centroidPoint, world),
        snapshot: stampSnapshot,
        annotationSnapshot,
        drawingTx: stampSnapshot.length > 0 || Object.keys(annotationSnapshot).length > 0 ? new Transaction(this.doc.drawingHistory, 'Rotate selection') : null,
        moved: false,
      };
      return;
    }

    const hit = this.hitTest(world);
    if (hit) {
      // A click (not drag) on an already-sole-selected textbox/stickyNote reopens its text editor — checked before selectedIds is mutated below, see onPointerUp's move-selection case.
      const alreadySoleSelected = this.doc.selectedIds.size === 1 && this.doc.selectedIds.has(hit.id);
      if (event.shiftKey) {
        if (this.doc.selectedIds.has(hit.id)) {
          this.doc.selectedIds.delete(hit.id);
        } else {
          this.doc.selectedIds.add(hit.id);
        }
        this.emitter.emit('selectionChanged', this.getSelection());
        this.redrawOverlay();
        return;
      }
      if (!this.doc.selectedIds.has(hit.id)) {
        this.doc.selectedIds = new Set([hit.id]);
        this.emitter.emit('selectionChanged', this.getSelection());
      }
      const state = this.doc.drawingHistory.getState();
      const annotationSnapshot: AnnotationSnapshot = {};
      const fittingSnapshot: Record<string, Vec2> = {};
      for (const id of this.doc.selectedIds) {
        const annotation = state.annotations[id];
        if (annotation) annotationSnapshot[id] = annotation.geometry;
        const fitting = state.fittings[id];
        if (fitting) fittingSnapshot[id] = fitting.position;
      }
      const hitAnnotationKind = hit.kind === 'annotation' ? state.annotations[hit.id]?.geometry.kind : null;
      const isTextEditable = hitAnnotationKind === 'textbox' || hitAnnotationKind === 'stickyNote';
      const stampSnapshot = this.getSelection().map((s) => ({ id: s.id, position: s.transform.position }));
      const hasDrawingChanges = stampSnapshot.length > 0 || Object.keys(annotationSnapshot).length > 0 || Object.keys(fittingSnapshot).length > 0;
      this.drag = {
        kind: 'move-selection',
        startPointerWorld: world,
        snapshot: stampSnapshot,
        annotationSnapshot,
        fittingSnapshot,
        drawingTx: hasDrawingChanges ? new Transaction(this.doc.drawingHistory, 'Move selection') : null,
        reopenTextEditId: alreadySoleSelected && isTextEditable ? hit.id : null,
        moved: false,
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
      this.drag.moved = true;
      const dx = world.x - this.drag.startPointerWorld.x;
      const dy = world.y - this.drag.startPointerWorld.y;
      if (this.drag.drawingTx) {
        const stampOriginals = this.drag.snapshot;
        const annotationOriginals = this.drag.annotationSnapshot;
        const fittingOriginals = this.drag.fittingSnapshot;
        this.drag.drawingTx.update((state) => {
          const stamps = { ...state.stamps };
          const movedStampIds: string[] = [];
          for (const { id, position } of stampOriginals) {
            if (!stamps[id]) continue;
            stamps[id] = { ...stamps[id], transform: { ...stamps[id].transform, position: { x: position.x + dx, y: position.y + dy } } };
            movedStampIds.push(id);
          }
          const annotations = { ...state.annotations };
          for (const [id, original] of Object.entries(annotationOriginals)) {
            if (!annotations[id]) continue;
            annotations[id] = { ...annotations[id], geometry: translateAnnotationGeometry(original, dx, dy) };
          }
          const fittings = { ...state.fittings };
          const changed = this.stampPortConnectionPoints(movedStampIds, stamps);
          for (const [id, original] of Object.entries(fittingOriginals)) {
            if (!fittings[id]) continue;
            fittings[id] = { ...fittings[id], position: { x: original.x + dx, y: original.y + dy } };
            changed.push({ kind: 'fitting', fittingId: id });
          }
          return this.applyConnectivityCascade({ ...state, stamps, annotations, fittings }, changed);
        });
        this.syncDrawingLayer();
      }
      this.redrawOverlay();
      this.markDirty();
      this.emitter.emit('selectionChanged', this.getSelection());
      return;
    }

    if (this.drag.kind === 'rotate-selection') {
      this.drag.moved = true;
      const currentAngle = angleDegrees(this.drag.pivot, world);
      const rawDelta = currentAngle - this.drag.startPointerAngleDeg;
      const delta = event.shiftKey ? rawDelta : snapToNearest(rawDelta, ROTATE_SNAP_DEGREES);
      const rotated = multiRotate(
        this.drag.snapshot.map((s) => s.transform),
        delta,
      );
      if (this.drag.drawingTx) {
        const stampSnapshot = this.drag.snapshot;
        const originals = this.drag.annotationSnapshot;
        const pivot = this.drag.pivot;
        this.drag.drawingTx.update((state) => {
          const stamps = { ...state.stamps };
          const rotatedIds: string[] = [];
          stampSnapshot.forEach((s, i) => {
            if (!stamps[s.id]) return;
            stamps[s.id] = { ...stamps[s.id], transform: rotated[i] };
            rotatedIds.push(s.id);
          });
          const annotations = { ...state.annotations };
          for (const [id, original] of Object.entries(originals)) {
            if (!annotations[id]) continue;
            annotations[id] = { ...annotations[id], geometry: rotateAnnotationGeometry(original, pivot, delta) };
          }
          return this.applyConnectivityCascade({ ...state, stamps, annotations }, this.stampPortConnectionPoints(rotatedIds, stamps));
        });
        this.syncDrawingLayer();
      }
      this.redrawOverlay();
      this.markDirty();
      this.emitter.emit('selectionChanged', this.getSelection());
      return;
    }

    if (this.drag.kind === 'resize-rect') {
      this.drag.moved = true;
      const { id, corner, original, tx } = this.drag;
      if (original.kind !== 'rectangle' && original.kind !== 'highlight') return; // always true by construction — see onPointerDown's resize-handle branch
      const fixed =
        corner === 'x0y0'
          ? { x: original.rect.x1, y: original.rect.y1 }
          : corner === 'x1y0'
            ? { x: original.rect.x0, y: original.rect.y1 }
            : corner === 'x1y1'
              ? { x: original.rect.x0, y: original.rect.y0 }
              : { x: original.rect.x1, y: original.rect.y0 };
      const rect = { x0: Math.min(fixed.x, world.x), y0: Math.min(fixed.y, world.y), x1: Math.max(fixed.x, world.x), y1: Math.max(fixed.y, world.y) };
      tx.update((state) => {
        const annotation = state.annotations[id];
        if (!annotation || (annotation.geometry.kind !== 'rectangle' && annotation.geometry.kind !== 'highlight')) return state;
        return { ...state, annotations: { ...state.annotations, [id]: { ...annotation, geometry: { ...annotation.geometry, rect } } } };
      });
      this.syncDrawingLayer();
      this.redrawOverlay();
      this.markDirty();
      return;
    }

    if (this.drag.kind === 'resize-circle') {
      this.drag.moved = true;
      const { id, center, tx } = this.drag;
      const radius = Math.max(0, Math.hypot(world.x - center.x, world.y - center.y));
      tx.update((state) => {
        const annotation = state.annotations[id];
        if (!annotation || annotation.geometry.kind !== 'circle') return state;
        return { ...state, annotations: { ...state.annotations, [id]: { ...annotation, geometry: { ...annotation.geometry, radius } } } };
      });
      this.syncDrawingLayer();
      this.redrawOverlay();
      this.markDirty();
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

    if (this.drag.kind === 'draw-shape' || this.drag.kind === 'draw-highlight') {
      this.drag = { ...this.drag, currentWorld: world };
      this.redrawOverlay();
    }

    if (this.tool === 'draw-polyline' && this.pendingPolylinePoints.length > 0) {
      this.pendingPolylineCursor = world;
      this.redrawOverlay();
    }
  };

  private readonly onPointerUp = (): void => {
    if (this.drag.kind === 'rubber-band') {
      const { startWorld, currentWorld, additive } = this.drag;
      const rectMin = { x: Math.min(startWorld.x, currentWorld.x), y: Math.min(startWorld.y, currentWorld.y) };
      const rectMax = { x: Math.max(startWorld.x, currentWorld.x), y: Math.max(startWorld.y, currentWorld.y) };
      const hits = new Set<string>();
      const state = this.doc.drawingHistory.getState();
      for (const data of Object.values(state.stamps)) {
        const halfWidth = (data.nativeWidth / 2) * data.transform.scale.x;
        const halfHeight = (data.nativeHeight / 2) * data.transform.scale.y;
        if (rectIntersectsRotatedRect(rectMin, rectMax, data.transform, halfWidth, halfHeight)) {
          hits.add(data.id);
        }
      }
      for (const annotation of Object.values(state.annotations)) {
        const bounds = annotationBoundsWorld(annotation.geometry, STICKY_NOTE_ICON_SIZE_PT);
        // Plain AABB overlap — annotations carry no rotation, so this needs none of rectIntersectsRotatedRect's separating-axis machinery.
        if (bounds.minX <= rectMax.x && bounds.maxX >= rectMin.x && bounds.minY <= rectMax.y && bounds.maxY >= rectMin.y) {
          hits.add(annotation.id);
        }
      }
      this.doc.selectedIds = additive ? new Set([...this.doc.selectedIds, ...hits]) : hits;
      this.emitter.emit('selectionChanged', this.getSelection());
    }

    if (this.drag.kind === 'move-selection') {
      if (this.drag.moved) {
        this.drag.drawingTx?.commit();
      } else if (this.drag.reopenTextEditId) {
        this.openTextEditor(this.drag.reopenTextEditId);
      }
    }

    if (this.drag.kind === 'rotate-selection' && this.drag.moved) {
      this.drag.drawingTx?.commit();
    }

    if ((this.drag.kind === 'resize-rect' || this.drag.kind === 'resize-circle') && this.drag.moved) {
      this.drag.tx.commit();
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

    if (this.drag.kind === 'draw-highlight') {
      const { startWorld, currentWorld } = this.drag;
      const dragScreenPx = Math.hypot(currentWorld.x - startWorld.x, currentWorld.y - startWorld.y) * this.world.scale.x;
      if (dragScreenPx >= MIN_SHAPE_DRAG_SCREEN_PX) {
        const rect = {
          x0: Math.min(startWorld.x, currentWorld.x),
          y0: Math.min(startWorld.y, currentWorld.y),
          x1: Math.max(startWorld.x, currentWorld.x),
          y1: Math.max(startWorld.y, currentWorld.y),
        };
        const annotation: Annotation = { id: `annotation-${this.doc.nextAnnotationSeq++}`, pageIndex: 0, geometry: { kind: 'highlight', rect } };
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

  /**
   * Delete/Backspace deletes the current selection — the rail's Delete
   * flyout action's keyboard-shortcut counterpart (atlas §4). Escape
   * cancels an in-progress segment-draw chain (Phase 6) instead — the
   * Segment tool stays active rather than reverting to Select, since
   * MepApp's rail-based tool model has no equivalent of the old app's
   * auto-revert-to-pan convention (§5 Phase 6). Both are ignored while
   * focus is in a text input/textarea so they don't fight typing in, e.g.,
   * the Properties panel or the textbox-annotation floating textarea.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if (event.key === 'Escape') {
      if (!this.pendingSegmentStart) return;
      this.pendingSegmentStart = null;
      this.redrawOverlay();
      return;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    if (this.doc.selectedIds.size === 0) return;
    event.preventDefault();
    this.deleteSelection();
  };

  /** Deletes every currently selected stamp and annotation, as one undo step. A deleted stamp's sprite is only detached (see syncStampSprites), never destroyed — an undo has to be able to re-attach the same sprite without re-fetching its art, since a re-fetch is async and, for an ad hoc uploaded stamp with no saved bytes, not even possible. No PDF-sync call is needed here — the next exportToPdf's planPdfSync diff already detects a domain object that disappeared and calls handle.deleteAnnotation for it. */
  deleteSelection(): void {
    const ids = [...this.doc.selectedIds];
    if (ids.length === 0) return;
    const state = this.doc.drawingHistory.getState();
    const annotationIds = ids.filter((id) => state.annotations[id]);
    const stampIds = ids.filter((id) => state.stamps[id]);
    if (annotationIds.length > 0 || stampIds.length > 0) {
      const tx = new Transaction(this.doc.drawingHistory, `Delete ${ids.length} item(s)`);
      tx.update((s) => {
        const annotations = { ...s.annotations };
        for (const id of annotationIds) delete annotations[id];
        const stamps = { ...s.stamps };
        for (const id of stampIds) delete stamps[id];
        return { ...s, annotations, stamps };
      });
      tx.commit();
    }
    this.doc.selectedIds.clear();
    this.syncDrawingLayer();
    this.markDirty();
    this.redrawOverlay();
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  private worldToScreen(world: Vec2): Vec2 {
    return { x: world.x * this.world.scale.x + this.world.x, y: world.y * this.world.scale.y + this.world.y };
  }

  /**
   * Reopens the floating textarea for an already-placed textbox/stickyNote
   * annotation — clicking an already-sole-selected one with the select tool
   * (see onPointerDown's move-selection case) triggers this instead of a
   * zero-length move. Reuses the same textboxRequested event the create-flow
   * uses, prefilled with the current text. Committing an edit replaces only
   * the geometry's text field via one Transaction, keeping the annotation's
   * id and its position/rect untouched.
   */
  private openTextEditor(id: string): void {
    const annotation = this.doc.drawingHistory.getState().annotations[id];
    if (!annotation) return;
    const g = annotation.geometry;
    if (g.kind !== 'textbox' && g.kind !== 'stickyNote') return;
    // The bounding box's own min corner, not g.rect.x0/y0 directly — for a
    // rotated textbox those are the local (unrotated) corner, not where the
    // box actually appears on screen.
    const bounds = annotationBoundsWorld(g, STICKY_NOTE_ICON_SIZE_PT);
    const anchorWorld = { x: bounds.minX, y: bounds.minY };
    const screen = this.worldToScreen(anchorWorld);
    this.emitter.emit('textboxRequested', screen, g.text, (text) => {
      const trimmed = text?.trim();
      if (trimmed) {
        const tx = new Transaction(this.doc.drawingHistory, `Edit annotation ${id}`);
        tx.update((state) => {
          const current = state.annotations[id];
          if (!current || (current.geometry.kind !== 'textbox' && current.geometry.kind !== 'stickyNote')) return state;
          return { ...state, annotations: { ...state.annotations, [id]: { ...current, geometry: { ...current.geometry, text: trimmed } } } };
        });
        tx.commit();
        this.syncDrawingLayer();
        this.markDirty();
      }
      this.redrawOverlay();
    });
  }

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
    this.doc.stamps.set(id, { sprite, baseScale });
    this.doc.stampsLayer.addChild(sprite);
    this.doc.drawingHistory.execute(createStampCommand(data));
    this.doc.selectedIds = new Set([id]);
    this.syncDrawingLayer();
    this.markDirty();
    this.setTool('select');
    this.emitter.emit('selectionChanged', this.getSelection());
  }

  /**
   * Click-to-draw segment tool: the first click resolves and remembers a
   * start endpoint (without mutating anything yet — see DrawEndpointResolution),
   * the next click resolves the end endpoint and applies both endpoints'
   * setup plus the new segment as one CompositeCommand, so each individual
   * segment is always exactly one undo step. After committing, the run
   * chains on automatically (§2.2, Phase 6): connecting to a fitting or an
   * Equipment's port re-arms pendingSegmentStart from the endpoint just
   * placed, so the very next click continues the run; connecting to a
   * Terminal's port ends the chain (an end-use device, not a pass-through
   * node) — mirrors the old app's MepSegmentCreate. Escape (onKeyDown)
   * cancels an in-progress chain early.
   */
  private onDrawSegmentClick(world: Vec2): void {
    const snapRadius = this.snapRadiusScreenPx / this.world.scale.x;
    const state = this.doc.drawingHistory.getState();
    const stamps = Object.values(state.stamps);
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
    this.pendingSegmentStart = this.chainContinuationFrom(resolved, state.stamps);
    this.redrawOverlay();
  }

  /** Whether a just-placed segment endpoint continues the chain (§2.2/Phase 6): a bare fitting always continues; a stamp's port continues only for Equipment (a pass-through node), not Terminal (an end-use device that should end the run). */
  private chainContinuationFrom(resolved: DrawEndpointResolution, stamps: Record<string, PlacedStamp>): DrawEndpointResolution | null {
    if (resolved.point.kind === 'fitting') return resolved;
    const stamp = stamps[resolved.point.elementId];
    return stamp?.category === 'equipment' ? resolved : null;
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
    this.syncStampSprites(state);
    for (const segment of Object.values(state.segments)) {
      const [start, ...rest] = segment.geometry;
      if (!start || rest.length === 0) continue;
      this.doc.drawingLayer.moveTo(start.x, start.y);
      for (const point of rest) this.doc.drawingLayer.lineTo(point.x, point.y);
      this.doc.drawingLayer.stroke({ width: 3, color: 0xffa726 });
    }
    for (const fitting of Object.values(state.fittings)) {
      this.doc.drawingLayer.circle(fitting.position.x, fitting.position.y, FITTING_MARKER_RADIUS_WORLD).fill({ color: 0xffa726 });
    }
    for (const annotation of Object.values(state.annotations)) {
      this.drawAnnotation(annotation);
    }
    this.emitter.emit('drawingChanged', this.getDrawingSummary());
  }

  /** Keeps each cached stamp sprite's transform and stampsLayer membership matching DrawingState.stamps — the render-only mirror of the source-of-truth data, the sprite counterpart to the segment/fitting Graphics redrawn just above. A sprite is detached (not destroyed) when its stamp isn't in state — deleteSelection relies on this to let an undo re-attach the same sprite instead of needing to re-fetch its texture, which is async and, for an ad hoc uploaded stamp with no saved bytes, sometimes impossible. */
  private syncStampSprites(state: DrawingState): void {
    for (const [id, entry] of this.doc.stamps) {
      const data = state.stamps[id];
      if (!data) {
        if (entry.sprite.parent) this.doc.stampsLayer.removeChild(entry.sprite);
        continue;
      }
      applyTransformToSprite(entry.sprite, data.transform, entry.baseScale);
      if (!entry.sprite.parent) this.doc.stampsLayer.addChild(entry.sprite);
    }
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
    if (g.kind === 'arrow') {
      layer.moveTo(g.from.x, g.from.y);
      layer.lineTo(g.to.x, g.to.y);
      layer.stroke({ width: 2, color });
      const angle = Math.atan2(g.to.y - g.from.y, g.to.x - g.from.x);
      for (const sign of [-1, 1]) {
        const headAngle = angle + sign * ARROWHEAD_ANGLE_RAD;
        layer.moveTo(g.to.x, g.to.y);
        layer.lineTo(g.to.x - ARROWHEAD_LENGTH_PT * Math.cos(headAngle), g.to.y - ARROWHEAD_LENGTH_PT * Math.sin(headAngle));
      }
      layer.stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'rectangle') {
      layer.rect(g.rect.x0, g.rect.y0, g.rect.x1 - g.rect.x0, g.rect.y1 - g.rect.y0).stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'highlight') {
      // A translucent fill (no stroke) is what visually distinguishes a highlight from a plain rectangle — same drag-a-box gesture, different rendering/purpose.
      layer.rect(g.rect.x0, g.rect.y0, g.rect.x1 - g.rect.x0, g.rect.y1 - g.rect.y0).fill({ color: 0xfff176, alpha: 0.35 });
      return;
    }
    if (g.kind === 'circle') {
      layer.circle(g.center.x, g.center.y, g.radius).stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'polyline') {
      const [first, ...rest] = g.points;
      if (!first) return;
      layer.moveTo(first.x, first.y);
      for (const point of rest) layer.lineTo(point.x, point.y);
      layer.stroke({ width: 2, color });
      return;
    }
    if (g.kind === 'stickyNote') {
      // A small square icon (PDF viewers show sticky notes collapsed, opened on click) plus an always-visible text label beside it — matching textbox's "just render the text" convention rather than building an interactive popup.
      const size = STICKY_NOTE_ICON_SIZE_PT;
      layer.rect(g.position.x, g.position.y, size, size).fill({ color: 0xffee58 }).stroke({ width: 1, color: 0xf9a825 });
      const text = new Text({ text: g.text, style: { fontSize: 12, fill: 0x5d4037 } });
      text.position.set(g.position.x + size + 4, g.position.y);
      this.doc.annotationTextLayer.addChild(text);
      return;
    }
    // textbox: a light bounding box (drawingLayer) plus the actual text (a Text node in annotationTextLayer).
    if (g.rotationDegrees === 0) {
      layer.rect(g.rect.x0, g.rect.y0, g.rect.x1 - g.rect.x0, g.rect.y1 - g.rect.y0).stroke({ width: 1, color, alpha: 0.4 });
    } else {
      const [c0, ...rest] = rotatedRectCorners(g.rect, g.rotationDegrees);
      layer.moveTo(c0.x, c0.y);
      for (const c of rest) layer.lineTo(c.x, c.y);
      layer.closePath();
      layer.stroke({ width: 1, color, alpha: 0.4 });
    }
    const text = new Text({ text: g.text, style: { fontSize: 14, fill: 0x1a1a1a } });
    // pivot/position/rotation (not a plain position.set) so the text rotates
    // rigidly around the rect's own center — at rotationDegrees 0 this is
    // exactly equivalent to the old position.set(rect.x0+4, rect.y0+4),
    // verified algebraically: the point at local offset (0,0) still lands on
    // (rect.x0+4, rect.y0+4) when rotation is 0.
    const center = { x: (g.rect.x0 + g.rect.x1) / 2, y: (g.rect.y0 + g.rect.y1) / 2 };
    text.pivot.set(center.x - (g.rect.x0 + 4), center.y - (g.rect.y0 + 4));
    text.position.set(center.x, center.y);
    text.rotation = (g.rotationDegrees * Math.PI) / 180;
    this.doc.annotationTextLayer.addChild(text);
  }

  private redrawOverlay(): void {
    this.overlay.clear();

    const state = this.doc.drawingHistory.getState();
    for (const id of this.doc.selectedIds) {
      const stampData = state.stamps[id];
      if (stampData) {
        const corners = this.stampCornersWorld(stampData);
        this.overlay.moveTo(corners[0].x, corners[0].y);
        for (const c of corners.slice(1)) this.overlay.lineTo(c.x, c.y);
        this.overlay.closePath();
        this.overlay.stroke({ width: 2 / this.world.scale.x, color: 0x00e5ff });
        continue;
      }
      // The selection box is always the bounding AABB, a plain rect — even for a rotated textbox, whose own outline (drawn separately in drawAnnotation) is the true rotated quad.
      const bounds = this.resolveSelectableBoundsWorld(this.selectableRefForId(id, state), state);
      if (!bounds) continue;
      this.overlay
        .rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
        .stroke({ width: 2 / this.world.scale.x, color: 0x00e5ff });
    }

    const handle = this.getRotationHandleWorld();
    if (handle) {
      this.overlay.circle(handle.x, handle.y, HANDLE_HIT_RADIUS_SCREEN_PX / this.world.scale.x);
      this.overlay.fill({ color: 0x00e5ff, alpha: 0.85 });
    }

    for (const resizeHandle of this.getResizeHandlesWorld()) {
      this.overlay.circle(resizeHandle.position.x, resizeHandle.position.y, HANDLE_HIT_RADIUS_SCREEN_PX / this.world.scale.x);
      this.overlay.fill({ color: 0xffee58, alpha: 0.9 });
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

    if (this.drag.kind === 'draw-highlight') {
      const { startWorld, currentWorld } = this.drag;
      const x = Math.min(startWorld.x, currentWorld.x);
      const y = Math.min(startWorld.y, currentWorld.y);
      const w = Math.abs(currentWorld.x - startWorld.x);
      const h = Math.abs(currentWorld.y - startWorld.y);
      this.overlay.rect(x, y, w, h).fill({ color: 0xfff176, alpha: 0.35 }).stroke({ width: 1 / this.world.scale.x, color: 0xf9a825 });
    }

    if (this.pendingPolylinePoints.length > 0) {
      const [first, ...rest] = this.pendingPolylinePoints;
      this.overlay.moveTo(first.x, first.y);
      for (const p of rest) this.overlay.lineTo(p.x, p.y);
      if (this.pendingPolylineCursor) this.overlay.lineTo(this.pendingPolylineCursor.x, this.pendingPolylineCursor.y);
      this.overlay.stroke({ width: 2 / this.world.scale.x, color: 0x42a5f5 });
      for (const p of this.pendingPolylinePoints) {
        this.overlay.circle(p.x, p.y, 4 / this.world.scale.x).fill({ color: 0xffb300 });
      }
    }
  }
}
