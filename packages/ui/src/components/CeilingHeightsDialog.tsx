import { useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import { roomTypeLabel } from '@mepapp/core';
import { Dialog } from './Dialog.js';
import { OptionalNumberInput } from './OptionalNumberInput.js';
import { MAX_CEILING_HEIGHT_MM, MIN_CEILING_HEIGHT_MM } from './RoomProperties.js';

export interface CeilingHeightsDialogProps {
  sceneRef: RefObject<SketchScene | null>;
  /** File name of the active drawing, for the title. */
  drawingName: string | null;
  language: 'en' | 'nl';
  onClose: () => void;
}

const allowHeight = (mm: number) => mm >= MIN_CEILING_HEIGHT_MM && mm <= MAX_CEILING_HEIGHT_MM;

/**
 * The ceiling heights of the active drawing (room-auto-placement.md Phase 2): one value for the
 * drawing and one per room type. Both are saved in the drawing. An empty box uses the level above
 * it: room type → drawing → the default in Settings. A room can override all of them in Room Properties.
 */
export function CeilingHeightsDialog({ sceneRef, drawingName, language, onClose }: CeilingHeightsDialogProps) {
  const [, setVersion] = useState(0);
  const scene = sceneRef.current;
  if (!scene) return null;
  const heights = scene.getCeilingHeights();
  const drawingMm = heights.pdfMm ?? heights.globalMm;
  const counts = new Map<string, number>();
  for (const room of scene.listRooms()) if (room.roomTypeId) counts.set(room.roomTypeId, (counts.get(room.roomTypeId) ?? 0) + 1);
  const refresh = () => setVersion((v) => v + 1);
  return (
    <Dialog title={drawingName ? `Ceiling heights — ${drawingName}` : 'Ceiling heights'} className="mep-modal--ceiling-heights" onClose={onClose} actions={<button onClick={onClose}>Close</button>}>
      <p className="mep-settings-hint">
        Heights in mm. An empty box uses the value above it. The default comes from Settings ({heights.globalMm} mm). Set a single room in Room Properties.
      </p>
      <div className="mep-section">
        <h4>This drawing</h4>
        <div className="mep-field-row">
          <label htmlFor="ch-drawing">Ceiling height</label>
          <OptionalNumberInput
            id="ch-drawing"
            value={heights.pdfMm}
            placeholder={`${heights.globalMm} (Settings)`}
            allow={allowHeight}
            onCommit={(mm) => {
              scene.setDrawingCeilingHeight(mm);
              refresh();
            }}
          />
        </div>
      </div>
      <div className="mep-section">
        <h4>Per room type</h4>
        {scene.getRoomTypes().map((type) => {
          const used = counts.get(type.id) ?? 0;
          return (
            <div className="mep-field-row" key={type.id}>
              <label htmlFor={`ch-type-${type.id}`}>
                {roomTypeLabel(type, language)}
                {used > 0 ? ` (${used} room${used === 1 ? '' : 's'})` : ''}
              </label>
              <OptionalNumberInput
                id={`ch-type-${type.id}`}
                value={heights.roomTypeMm[type.id]}
                placeholder={String(drawingMm)}
                allow={allowHeight}
                onCommit={(mm) => {
                  scene.setRoomTypeCeilingHeight(type.id, mm);
                  refresh();
                }}
              />
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
