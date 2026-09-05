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
  measureRealDistance,
  multiRotate,
  normalizeDegrees,
  pointInRotatedRect,
  rectIntersectsRotatedRect,
  rotatePointAround,
  type Calibration,
  type PlacedStamp,
  type Transform2D,
  type Vec2,
} from '@mepapp/core';
import { textureFromImageBitmap } from './texture.js';

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

export type SketchTool = 'select' | 'place-stamp' | 'calibrate' | 'measure';

interface SketchSceneEvents {
  [key: string]: unknown[];
  selectionChanged: [StampInfo[]];
  toolChanged: [SketchTool];
  calibrationNeeded: [p1: Vec2, p2: Vec2, resolve: (knownRealDistanceMm: number | null) => void];
  calibrationSet: [Calibration];
  measurement: [distanceMm: number];
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
  }
}
