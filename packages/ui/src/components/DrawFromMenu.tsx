import { useEffect, useRef, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import type { DrawFromMenuRequest } from '../useSketchScene.js';

export interface DrawFromMenuProps {
  request: DrawFromMenuRequest;
  sceneRef: RefObject<SketchScene | null>;
  onDismiss: () => void;
}

/**
 * Right-click "Draw from" menu — a single item naming the port/fitting the
 * click resolved to (SketchScene.drawFromMenuLabel). Positioned like
 * textboxPrompt's floating textarea (App.tsx), dismissed the same way
 * Rail.tsx's flyout is: any pointerdown outside the menu, or Escape.
 */
export function DrawFromMenu({ request, sceneRef, onDismiss }: DrawFromMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={rootRef} className="mep-draw-from-menu" style={{ left: request.screenPosition.x, top: request.screenPosition.y }}>
      <button
        type="button"
        className="mep-draw-from-menu-btn"
        onClick={() => {
          sceneRef.current?.armSegmentStartFromTarget(request.point, request.worldPosition);
          onDismiss();
        }}
      >
        {request.label}
      </button>
    </div>
  );
}
