import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import type { CanvasContextMenuRequest } from '../useSketchScene.js';
import type { RiserMenuState } from '../useBuildingRisers.js';

export interface CanvasContextMenuProps {
  request: CanvasContextMenuRequest;
  sceneRef: RefObject<SketchScene | null>;
  onDismiss: () => void;
  riser?: { state: RiserMenuState; onMake(fittingId: string): void; onDrawFromRing(riserId: string): void; onDetach(riserId: string): void; onDelete(riserId: string): void };
}

/**
 * Right-click menu over the canvas — one item per action the click's target
 * offers (see SketchScene's canvasContextMenuRequested event): "Draw from" a
 * port/fitting, "Insert fitting here" on a segment, "Remove fitting" on a
 * two-segment fitting. Positioned like textboxPrompt's floating textarea
 * (App.tsx), dismissed the same way Rail.tsx's flyout is: any pointerdown
 * outside the menu, or Escape.
 */
export function CanvasContextMenu({ request, sceneRef, onDismiss, riser }: CanvasContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { drawFrom, insertFitting, removeFittingId, riserAnchor } = request.target;
  const riserModel = riser?.state.model ?? null;
  const hasEntryAbove = Boolean(drawFrom || insertFitting || removeFittingId || riserAnchor);
  const [offset, setOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const { x: posX, y: posY } = request.screenPosition;

  useLayoutEffect(() => {
    setOffset((prev) => (prev.dx === 0 && prev.dy === 0 ? prev : { dx: 0, dy: 0 }));
  }, [posX, posY]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const baseLeft = rect.left - offset.dx;
    const baseTop = rect.top - offset.dy;
    let dx = Math.min(0, window.innerWidth - 8 - (rect.right - offset.dx));
    let dy = Math.min(0, window.innerHeight - 8 - (rect.bottom - offset.dy));
    if (baseLeft + dx < 8) dx = 8 - baseLeft;
    if (baseTop + dy < 8) dy = 8 - baseTop;
    setOffset((prev) => (prev.dx === dx && prev.dy === dy ? prev : { dx, dy }));
  }, [posX, posY, riserModel]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  const run = (action: (scene: SketchScene) => void) => {
    if (sceneRef.current) action(sceneRef.current);
    onDismiss();
  };

  return (
    <div ref={rootRef} className="mep-draw-from-menu" style={{ left: request.screenPosition.x + offset.dx, top: request.screenPosition.y + offset.dy }}>
      {riserAnchor && riser && (
        <button
          type="button"
          className="mep-draw-from-menu-btn"
          onClick={() => {
            riser.onDrawFromRing(riserAnchor.riserId);
            onDismiss();
          }}
        >
          Draw from
        </button>
      )}
      {drawFrom && (
        <button
          type="button"
          className="mep-draw-from-menu-btn"
          onClick={() => run((scene) => scene.armSegmentStartFromTarget(drawFrom.point, drawFrom.worldPosition))}
        >
          {drawFrom.label}
        </button>
      )}
      {insertFitting && (
        <button
          type="button"
          className="mep-draw-from-menu-btn"
          onClick={() => run((scene) => scene.insertFittingOnSegment(insertFitting.segmentId, insertFitting.breakPoint))}
        >
          Insert fitting here
        </button>
      )}
      {removeFittingId && (
        <button type="button" className="mep-draw-from-menu-btn" onClick={() => run((scene) => scene.removeFitting(removeFittingId))}>
          Remove fitting
          {riserModel?.detach && <span className="mep-draw-from-menu-hint-inline"> (refused: it is a riser)</span>}
        </button>
      )}
      {riser && riserModel && (riserModel.makeRiser || riserModel.detach || riserModel.deleteRiser) && (
        <>
          {hasEntryAbove && <div className="mep-draw-from-menu-sep" role="separator" />}
          {riserModel.makeRiser && riserModel.makeRiser.disabledHint === null && (
            <button
              type="button"
              className="mep-draw-from-menu-btn"
              onClick={() => {
                if (riser.state.fittingId !== null) riser.onMake(riser.state.fittingId);
                onDismiss();
              }}
            >
              Make riser
            </button>
          )}
          {riserModel.makeRiser && riserModel.makeRiser.disabledHint !== null && (
            <button type="button" aria-disabled="true" className="mep-draw-from-menu-btn mep-draw-from-menu-btn--dim">
              Make riser
              <span className="mep-draw-from-menu-hint">{riserModel.makeRiser.disabledHint}</span>
            </button>
          )}
          {riserModel.detach && (
            <button
              type="button"
              className="mep-draw-from-menu-btn"
              onClick={() => {
                if (riser.state.riserId !== null) riser.onDetach(riser.state.riserId);
                onDismiss();
              }}
            >
              Detach from riser
            </button>
          )}
          {riserModel.deleteRiser && (
            <button
              type="button"
              className="mep-draw-from-menu-btn"
              onClick={() => {
                if (riser.state.riserId !== null) riser.onDelete(riser.state.riserId);
                onDismiss();
              }}
            >
              Delete riser
            </button>
          )}
        </>
      )}
    </div>
  );
}
