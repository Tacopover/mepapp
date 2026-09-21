import { useEffect, useRef, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import type { CanvasContextMenuRequest } from '../useSketchScene.js';

export interface CanvasContextMenuProps {
  request: CanvasContextMenuRequest;
  sceneRef: RefObject<SketchScene | null>;
  onDismiss: () => void;
}

/**
 * Right-click menu over the canvas — one item per action the click's target
 * offers (see SketchScene's canvasContextMenuRequested event): "Draw from" a
 * port/fitting, "Insert fitting here" on a segment, "Remove fitting" on a
 * two-segment fitting. Positioned like textboxPrompt's floating textarea
 * (App.tsx), dismissed the same way Rail.tsx's flyout is: any pointerdown
 * outside the menu, or Escape.
 */
export function CanvasContextMenu({ request, sceneRef, onDismiss }: CanvasContextMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { drawFrom, insertFitting, removeFittingId } = request.target;

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
    <div ref={rootRef} className="mep-draw-from-menu" style={{ left: request.screenPosition.x, top: request.screenPosition.y }}>
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
        </button>
      )}
    </div>
  );
}
