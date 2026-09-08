import { Container, Graphics, type Sprite } from 'pixi.js';
import {
  CommandManager,
  type Annotation,
  type Calibration,
  type Fitting,
  type FlowResult,
  type NetworkType,
  type PlacedStamp,
  type PortGroup,
  type Segment,
  type Vec2,
} from '@mepapp/core';
import type { PdfDocumentHandle } from '@mepapp/pdf-engine';

/** Undo-history state for the segment/fitting/annotation drawing tools — kept separate from the pre-existing, not-yet-undoable stamp placement state (see decisions log 2026-09-06). */
export interface DrawingState {
  segments: Record<string, Segment>;
  fittings: Record<string, Fitting>;
  annotations: Record<string, Annotation>;
}

export interface StampEntry {
  data: PlacedStamp;
  sprite: Sprite;
  baseScale: Vec2; // converts texture pixels -> world units at transform.scale = 1
}

export const DEFAULT_NETWORK_TYPE: NetworkType = {
  id: 'default',
  name: 'Unassigned',
  discipline: 'ventilation',
  units: '',
  defaultCapacity: 0,
};

/** Summary of one open document — the Drawings tab's read model. */
export interface DocumentSummary {
  id: string;
  fileName: string;
  isDirty: boolean;
  hasPdf: boolean;
}

let nextDocSeq = 1;

/**
 * Everything that today's single-document app implicitly owns as a
 * singleton, resident for as long as the document is open — see decisions
 * log 2026-09-07's multi-document plan (D1: resident, not snapshotted).
 * `SketchScene` renders whichever `SketchDocument` is active; this class is
 * a plain data/PixiJS-resource holder with no event emitter of its own.
 */
export class SketchDocument {
  readonly id: string = `doc-${nextDocSeq++}`;
  fileKey: string | null = null;
  fileName = 'Untitled';
  pdfHandle: PdfDocumentHandle | null = null;
  backdropSprite: Sprite | null = null;
  readonly stampsLayer = new Container();
  readonly drawingLayer = new Graphics();
  /** PixiJS Text nodes for placed textbox annotations — a Graphics object can't render text, so these live in their own container, fully rebuilt alongside drawingLayer on every syncDrawingLayer (see SketchScene.drawAnnotation). */
  readonly annotationTextLayer = new Container();
  readonly stamps = new Map<string, StampEntry>();
  selectedIds = new Set<string>();
  calibration: Calibration | null = null;
  readonly drawingHistory = new CommandManager<DrawingState>({ segments: {}, fittings: {}, annotations: {} });
  readonly networkTypes: NetworkType[] = [DEFAULT_NETWORK_TYPE];
  /** Ports on the same element linked into one connectivity node — e.g. an AHU's supply + return (see core's PortGroup doc comment). Set via SketchScene.setPortGroup. */
  readonly portGroups: PortGroup[] = [];
  readonly terminalCapacities = new Map<string, number>();
  pdfSyncIds = new Set<string>();
  nextStampSeq = 1;
  nextFittingSeq = 1;
  nextSegmentSeq = 1;
  nextAnnotationSeq = 1;
  lastFlowResult: FlowResult[] | null = null;
  viewport = { x: 0, y: 0, scale: 1 };
  isDirty = false;

  /** No backdrop, no handle, nothing drawn or placed — safe to reuse for the next "Open PDF" instead of leaving a permanent empty tab. */
  isEmpty(): boolean {
    const state = this.drawingHistory.getState();
    return (
      this.backdropSprite === null &&
      this.pdfHandle === null &&
      this.stamps.size === 0 &&
      Object.keys(state.segments).length === 0 &&
      Object.keys(state.fittings).length === 0 &&
      Object.keys(state.annotations).length === 0
    );
  }

  toSummary(): DocumentSummary {
    return { id: this.id, fileName: this.fileName, isDirty: this.isDirty, hasPdf: this.pdfHandle !== null };
  }

  /** Tears down this document's own PixiJS resources — used on close, not on a mere tab switch. */
  destroy(): void {
    this.backdropSprite?.destroy({ texture: true });
    for (const entry of this.stamps.values()) entry.sprite.destroy({ texture: true });
    this.stamps.clear();
    this.stampsLayer.destroy();
    this.drawingLayer.destroy();
    this.annotationTextLayer.destroy({ children: true });
  }
}
