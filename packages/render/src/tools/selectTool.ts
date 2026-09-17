import type { FederatedPointerEvent } from 'pixi.js';
import {
  centroid,
  multiRotate,
  rectIntersectsRotatedRect,
  Transaction,
  translateAnnotationGeometry,
  rotateAnnotationGeometry,
  annotationBoundsWorld,
  type Vec2,
} from '@mepapp/core';
import type { DrawingState } from '../document.js';
import { computeSelectionBoundsWorld } from './alignmentGuides.js';
import { resolveSnappedPoint } from './dragSnap.js';
import type { AnnotationSnapshot, SelectableRef, Tool, ToolContext } from './types.js';

const HANDLE_HIT_RADIUS_SCREEN_PX = 10;
const ROTATE_SNAP_DEGREES = 45;

function angleDegrees(from: Vec2, to: Vec2): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function snapToNearest(degrees: number, step: number): number {
  return Math.round(degrees / step) * step;
}

/** Constant read once per gesture — matches STICKY_NOTE_ICON_SIZE_PT in scene.ts, needed here for annotationBoundsWorld's rubber-band/selection bounds hit test. */
const STICKY_NOTE_ICON_SIZE_PT = 16;

/**
 * The 'select' tool: click/Shift-click/rubber-band selection, drag-to-move, drag-to-rotate
 * (via the rotation handle), and drag-to-resize (rectangle/highlight corner handles, circle
 * radius handle). Owns five of DragState's ten variants — every kind that isn't a dedicated
 * draw-* tool's own gesture. See scene.ts's original onPointerDown 'select' branch and
 * onPointerMove/onPointerUp's move-selection/rotate-selection/resize-rect/resize-circle/
 * rubber-band cases, ported here unchanged.
 */
export class SelectTool implements Tool {
  readonly id = 'select' as const;

  onPointerDown(ctx: ToolContext, event: FederatedPointerEvent, world: Vec2): void {
    const handleRadiusWorld = HANDLE_HIT_RADIUS_SCREEN_PX / ctx.getZoomScale();

    for (const resizeHandle of ctx.getResizeHandlesWorld()) {
      if (Math.hypot(world.x - resizeHandle.position.x, world.y - resizeHandle.position.y) > handleRadiusWorld) continue;
      const annotation = ctx.doc.drawingHistory.getState().annotations[resizeHandle.id];
      if (!annotation) break;
      const tx = new Transaction(ctx.doc.drawingHistory, `Resize annotation ${resizeHandle.id}`);
      if ('corner' in resizeHandle) {
        ctx.drag = { kind: 'resize-rect', id: resizeHandle.id, corner: resizeHandle.corner, original: annotation.geometry, tx, moved: false };
        return;
      }
      if (annotation.geometry.kind === 'circle') {
        ctx.drag = { kind: 'resize-circle', id: resizeHandle.id, center: annotation.geometry.center, tx, moved: false };
        return;
      }
    }

    const handle = ctx.getRotationHandleWorld();
    if (handle && Math.hypot(world.x - handle.x, world.y - handle.y) <= handleRadiusWorld) {
      const state = ctx.doc.drawingHistory.getState();
      const selectedRefs: SelectableRef[] = [...ctx.doc.selectedIds].map((id) => ctx.selectableRefForId(id, state));
      const pivotPoints = selectedRefs
        .map((ref) => ctx.resolveSelectableBoundsWorld(ref, state))
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map((b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }));
      if (pivotPoints.length === 0) return;
      const centroidPoint = centroid(pivotPoints);
      const annotationSnapshot: AnnotationSnapshot = {};
      for (const id of ctx.doc.selectedIds) {
        const annotation = state.annotations[id];
        if (annotation) annotationSnapshot[id] = annotation.geometry;
      }
      const stampSnapshot = ctx.getSelection().map((s) => ({ id: s.id, transform: s.transform }));
      ctx.drag = {
        kind: 'rotate-selection',
        pivot: centroidPoint,
        startPointerAngleDeg: angleDegrees(centroidPoint, world),
        snapshot: stampSnapshot,
        annotationSnapshot,
        drawingTx: stampSnapshot.length > 0 || Object.keys(annotationSnapshot).length > 0 ? new Transaction(ctx.doc.drawingHistory, 'Rotate selection') : null,
        moved: false,
      };
      return;
    }

    const hit = ctx.hitTest(world);
    if (hit) {
      // A click (not drag) on an already-sole-selected textbox/stickyNote reopens its text editor — checked before selectedIds is mutated below, see onPointerUp's move-selection case.
      const alreadySoleSelected = ctx.doc.selectedIds.size === 1 && ctx.doc.selectedIds.has(hit.id);
      if (event.shiftKey) {
        if (ctx.doc.selectedIds.has(hit.id)) {
          ctx.doc.selectedIds.delete(hit.id);
        } else {
          ctx.doc.selectedIds.add(hit.id);
        }
        ctx.emit('selectionChanged', ctx.getSelection());
        ctx.syncDrawingLayer();
        ctx.redrawOverlay();
        return;
      }
      if (!ctx.doc.selectedIds.has(hit.id)) {
        ctx.doc.selectedIds = new Set([hit.id]);
        ctx.emit('selectionChanged', ctx.getSelection());
      }
      const state = ctx.doc.drawingHistory.getState();
      const annotationSnapshot: AnnotationSnapshot = {};
      const fittingSnapshot: Record<string, Vec2> = {};
      for (const id of ctx.doc.selectedIds) {
        const annotation = state.annotations[id];
        if (annotation) annotationSnapshot[id] = annotation.geometry;
        const fitting = state.fittings[id];
        if (fitting) fittingSnapshot[id] = fitting.position;
        // A selected segment has no position of its own to drag — instead, drag
        // both its endpoint fittings by the same delta and let the existing
        // fitting-move + applyConnectivityCascade path (below) recompute the
        // segment's own geometry and re-seat any neighboring segment sharing
        // one of those fittings, exactly like dragging those fittings directly.
        // A 'port' endpoint (attached to a placed stamp) is left alone — that
        // end stays pinned to the equipment, matching the old app's behavior.
        const segment = state.segments[id];
        if (segment) {
          for (const endpoint of [segment.endpointA, segment.endpointB]) {
            if (endpoint.kind !== 'fitting') continue;
            const endpointFitting = state.fittings[endpoint.fittingId];
            if (endpointFitting) fittingSnapshot[endpoint.fittingId] = endpointFitting.position;
          }
        }
      }
      const hitAnnotationKind = hit.kind === 'annotation' ? state.annotations[hit.id]?.geometry.kind : null;
      const isTextEditable = hitAnnotationKind === 'textbox' || hitAnnotationKind === 'stickyNote';
      const stampSnapshot = ctx.getSelection().map((s) => ({ id: s.id, position: s.transform.position }));
      const hasDrawingChanges = stampSnapshot.length > 0 || Object.keys(annotationSnapshot).length > 0 || Object.keys(fittingSnapshot).length > 0;
      ctx.drag = {
        kind: 'move-selection',
        startPointerWorld: world,
        snapshot: stampSnapshot,
        annotationSnapshot,
        fittingSnapshot,
        drawingTx: hasDrawingChanges ? new Transaction(ctx.doc.drawingHistory, 'Move selection') : null,
        reopenTextEditId: alreadySoleSelected && isTextEditable ? hit.id : null,
        moved: false,
        selectionBoundsAtStart: computeSelectionBoundsWorld(ctx, ctx.doc.selectedIds, state),
        guides: [],
      };
      ctx.syncDrawingLayer();
      ctx.redrawOverlay();
      return;
    }

    if (!event.shiftKey) {
      ctx.doc.selectedIds.clear();
      ctx.emit('selectionChanged', ctx.getSelection());
      ctx.syncDrawingLayer();
    }
    ctx.drag = { kind: 'rubber-band', startWorld: world, currentWorld: world, additive: event.shiftKey };
    ctx.redrawOverlay();
  }

  dragKinds: Tool['dragKinds'] = {
    'move-selection': {
      onMove: (ctx, _event, rawWorld) => {
        const drag = ctx.drag;
        if (drag.kind !== 'move-selection') return;
        drag.moved = true;
        const { point: world, guides } = resolveSnappedPoint(rawWorld, { ctx, kind: 'move-selection' });
        drag.guides = guides;
        const dx = world.x - drag.startPointerWorld.x;
        const dy = world.y - drag.startPointerWorld.y;
        if (drag.drawingTx) {
          const stampOriginals = drag.snapshot;
          const annotationOriginals = drag.annotationSnapshot;
          const fittingOriginals = drag.fittingSnapshot;
          drag.drawingTx.update((state: DrawingState) => {
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
            const changed = ctx.stampPortConnectionPoints(movedStampIds, stamps);
            for (const [id, original] of Object.entries(fittingOriginals)) {
              if (!fittings[id]) continue;
              fittings[id] = { ...fittings[id], position: { x: original.x + dx, y: original.y + dy } };
              changed.push({ kind: 'fitting', fittingId: id });
            }
            return ctx.applyConnectivityCascade({ ...state, stamps, annotations, fittings }, changed);
          });
          ctx.syncDrawingLayer();
        }
        ctx.redrawOverlay();
        ctx.markDirty();
        ctx.emit('selectionChanged', ctx.getSelection());
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'move-selection') return;
        if (drag.moved) {
          drag.drawingTx?.commit();
        } else if (drag.reopenTextEditId) {
          ctx.openTextEditor(drag.reopenTextEditId);
        }
      },
    },
    'rotate-selection': {
      onMove: (ctx, event, rawWorld) => {
        const drag = ctx.drag;
        if (drag.kind !== 'rotate-selection') return;
        drag.moved = true;
        const { point: world } = resolveSnappedPoint(rawWorld, { ctx, kind: 'rotate-selection' });
        const currentAngle = angleDegrees(drag.pivot, world);
        const rawDelta = currentAngle - drag.startPointerAngleDeg;
        const delta = event.shiftKey ? rawDelta : snapToNearest(rawDelta, ROTATE_SNAP_DEGREES);
        const rotated = multiRotate(
          drag.snapshot.map((s) => s.transform),
          delta,
        );
        if (drag.drawingTx) {
          const stampSnapshot = drag.snapshot;
          const originals = drag.annotationSnapshot;
          const pivot = drag.pivot;
          drag.drawingTx.update((state: DrawingState) => {
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
            return ctx.applyConnectivityCascade({ ...state, stamps, annotations }, ctx.stampPortConnectionPoints(rotatedIds, stamps));
          });
          ctx.syncDrawingLayer();
        }
        ctx.redrawOverlay();
        ctx.markDirty();
        ctx.emit('selectionChanged', ctx.getSelection());
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'rotate-selection') return;
        if (drag.moved) drag.drawingTx?.commit();
      },
    },
    'resize-rect': {
      onMove: (ctx, _event, rawWorld) => {
        const drag = ctx.drag;
        if (drag.kind !== 'resize-rect') return;
        drag.moved = true;
        const { id, corner, original, tx } = drag;
        if (original.kind !== 'rectangle' && original.kind !== 'highlight') return; // always true by construction — see onPointerDown's resize-handle branch
        const { point: world } = resolveSnappedPoint(rawWorld, { ctx, kind: 'resize-rect' });
        const fixed =
          corner === 'x0y0'
            ? { x: original.rect.x1, y: original.rect.y1 }
            : corner === 'x1y0'
              ? { x: original.rect.x0, y: original.rect.y1 }
              : corner === 'x1y1'
                ? { x: original.rect.x0, y: original.rect.y0 }
                : { x: original.rect.x1, y: original.rect.y0 };
        const rect = { x0: Math.min(fixed.x, world.x), y0: Math.min(fixed.y, world.y), x1: Math.max(fixed.x, world.x), y1: Math.max(fixed.y, world.y) };
        tx.update((state: DrawingState) => {
          const annotation = state.annotations[id];
          if (!annotation || (annotation.geometry.kind !== 'rectangle' && annotation.geometry.kind !== 'highlight')) return state;
          return { ...state, annotations: { ...state.annotations, [id]: { ...annotation, geometry: { ...annotation.geometry, rect } } } };
        });
        ctx.syncDrawingLayer();
        ctx.redrawOverlay();
        ctx.markDirty();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'resize-rect') return;
        if (drag.moved) drag.tx.commit();
      },
    },
    'resize-circle': {
      onMove: (ctx, _event, rawWorld) => {
        const drag = ctx.drag;
        if (drag.kind !== 'resize-circle') return;
        drag.moved = true;
        const { id, center, tx } = drag;
        const { point: world } = resolveSnappedPoint(rawWorld, { ctx, kind: 'resize-circle' });
        const radius = Math.max(0, Math.hypot(world.x - center.x, world.y - center.y));
        tx.update((state: DrawingState) => {
          const annotation = state.annotations[id];
          if (!annotation || annotation.geometry.kind !== 'circle') return state;
          return { ...state, annotations: { ...state.annotations, [id]: { ...annotation, geometry: { ...annotation.geometry, radius } } } };
        });
        ctx.syncDrawingLayer();
        ctx.redrawOverlay();
        ctx.markDirty();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'resize-circle') return;
        if (drag.moved) drag.tx.commit();
      },
    },
    'rubber-band': {
      onMove: (ctx, _event, world) => {
        if (ctx.drag.kind !== 'rubber-band') return;
        ctx.drag = { ...ctx.drag, currentWorld: world };
        ctx.redrawOverlay();
      },
      onEnd: (ctx) => {
        const drag = ctx.drag;
        if (drag.kind !== 'rubber-band') return;
        const { startWorld, currentWorld, additive } = drag;
        const rectMin = { x: Math.min(startWorld.x, currentWorld.x), y: Math.min(startWorld.y, currentWorld.y) };
        const rectMax = { x: Math.max(startWorld.x, currentWorld.x), y: Math.max(startWorld.y, currentWorld.y) };
        const hits = new Set<string>();
        const state = ctx.doc.drawingHistory.getState();
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
        for (const segment of Object.values(state.segments)) {
          const bounds = ctx.resolveSelectableBoundsWorld({ kind: 'segment', id: segment.id }, state);
          if (bounds && bounds.minX <= rectMax.x && bounds.maxX >= rectMin.x && bounds.minY <= rectMax.y && bounds.maxY >= rectMin.y) {
            hits.add(segment.id);
          }
        }
        ctx.doc.selectedIds = additive ? new Set([...ctx.doc.selectedIds, ...hits]) : hits;
        ctx.emit('selectionChanged', ctx.getSelection());
        ctx.syncDrawingLayer();
      },
    },
  };
}
