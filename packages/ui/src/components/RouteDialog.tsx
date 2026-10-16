import { useEffect, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { routePageProblem, type RoomType } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { routeText } from './routePlan.js';

export interface RouteDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  roomTypes: RoomType[];
  language: 'en' | 'nl';
  onClose: () => void;
}

export function RouteDialog({ sceneRef, language, onClose }: RouteDialogProps) {
  const scene = sceneRef.current;
  const [pageCount, setPageCount] = useState(() => scene?.getPageCount() ?? 1);
  useEffect(() => {
    if (!scene) return;
    const refresh = () => setPageCount(scene.getPageCount());
    refresh();
    scene.on('pageChanged', refresh);
    scene.on('documentActivated', refresh);
    return () => {
      scene.off('pageChanged', refresh);
      scene.off('documentActivated', refresh);
    };
  }, [scene]);

  const problem = routePageProblem(pageCount, language);

  return (
    <Dialog
      title={routeText(language, 'title')}
      className="mep-modal--route"
      closeOnBackdropClick={false}
      onClose={onClose}
      actions={
        <button type="button" onClick={onClose}>
          {routeText(language, 'close')}
        </button>
      }
    >
      {problem ? (
        <p data-testid="route-refusal">{problem}</p>
      ) : (
        <div data-testid="route-body">
          <p>The route inputs appear here.</p>
        </div>
      )}
    </Dialog>
  );
}
