import { RoomDetectionClient, type PlacementWorkerLike, type RoomWorkerLike } from '@mepapp/core';

/** Creates the main-thread client that runs room detection in a Web Worker. */
export function createRoomDetectionClient(): RoomDetectionClient {
  return new RoomDetectionClient(() => new Worker(new URL('./roomDetection.worker.ts', import.meta.url), { type: 'module' }) as unknown as RoomWorkerLike);
}

/** Creates the Web Worker that calculates the auto-placement plans of the placement rule guide. */
export function createPlacementWorker(): PlacementWorkerLike {
  return new Worker(new URL('./placement.worker.ts', import.meta.url), { type: 'module' }) as unknown as PlacementWorkerLike;
}
