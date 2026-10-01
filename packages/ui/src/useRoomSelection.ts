import { useEffect, useState, type RefObject } from 'react';
import type { SketchScene } from '@mepapp/render';
import type { Room } from '@mepapp/core';

/** The rooms selected with the edit-room tool, kept in step with the scene. */
export function useRoomSelection(sceneRef: RefObject<SketchScene | null>, ready: boolean): Room[] {
  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    const refresh = () => setRooms(scene.getSelectedRooms());
    refresh();
    scene.on('roomSelectionChanged', refresh);
    scene.on('roomsChanged', refresh);
    return () => {
      scene.off('roomSelectionChanged', refresh);
      scene.off('roomsChanged', refresh);
    };
  }, [ready, sceneRef]);
  return rooms;
}
