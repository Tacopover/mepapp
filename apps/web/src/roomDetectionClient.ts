import { RoomDetectionClient, type RoomWorkerLike } from '@mepapp/core';

/** Creates the main-thread client that runs room detection in a Web Worker. */
export function createRoomDetectionClient(): RoomDetectionClient {
  return new RoomDetectionClient(() => new Worker(new URL('./roomDetection.worker.ts', import.meta.url), { type: 'module' }) as unknown as RoomWorkerLike);
}
